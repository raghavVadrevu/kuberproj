import json
import logging
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status

from app.access import assert_group_member
from app.auth import decode_cognito_id_token, get_current_user_sub
from app.chat_manager import chat_manager
from app.chat_queries import AI_SENDER_SUB, fetch_chat_messages, insert_chat_message
from app.services.llm_service import CHAT_CONTEXT_LIMIT
from app.db import get_connection
from app.schemas import ChatMessageOut
from app.services.llm_service import message_mentions_ai, stream_chat_response

logger = logging.getLogger(__name__)

router = APIRouter(tags=["group-chat"])


@router.get(
    "/api/groups/{group_id}/chat/messages",
    response_model=list[ChatMessageOut],
)
def list_chat_messages(
    group_id: UUID,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
    limit: int = Query(default=100, ge=1, le=500),
) -> list[ChatMessageOut]:
    with get_connection() as conn:
        assert_group_member(conn, group_id, user_sub)
        return fetch_chat_messages(conn, group_id, limit=limit)


async def _stream_ai_to_group(
    group_id: str,
    group_uuid: UUID,
) -> None:
    stream_id = str(uuid4())
    full_content: list[str] = []

    with get_connection() as conn:
        history = fetch_chat_messages(
            conn, group_uuid, limit=CHAT_CONTEXT_LIMIT,
        )

    async for chunk in stream_chat_response(history=history):
        full_content.append(chunk)
        await chat_manager.broadcast_json(
            group_id,
            {
                "type": "ai_token",
                "stream_id": stream_id,
                "content": chunk,
            },
        )

    text = "".join(full_content)
    with get_connection() as conn:
        msg = insert_chat_message(conn, group_uuid, AI_SENDER_SUB, text)
        conn.commit()

    await chat_manager.broadcast_json(
        group_id,
        {
            "type": "ai_stream_end",
            "stream_id": stream_id,
            "message": msg.model_dump(mode="json"),
        },
    )


@router.websocket("/api/ws/groups/{group_id}/chat")
async def group_chat_websocket(
    websocket: WebSocket,
    group_id: UUID,
    token: str | None = Query(None),
) -> None:
    if not token:
        await websocket.close(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="Missing token",
        )
        return

    try:
        payload = decode_cognito_id_token(token)
    except (HTTPException, Exception):
        await websocket.close(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="Invalid token",
        )
        return

    user_sub = str(payload["sub"])
    gid = str(group_id)

    with get_connection() as conn:
        try:
            assert_group_member(conn, group_id, user_sub)
        except HTTPException:
            await websocket.close(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="Not a group member",
            )
            return

    await websocket.accept()
    chat_manager.join(gid, websocket, user_sub)

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json(
                    {"type": "error", "detail": "Invalid JSON"},
                )
                continue

            msg_type = data.get("type")

            if msg_type == "typing":
                await chat_manager.broadcast_json_except(
                    gid,
                    {
                        "type": "typing",
                        "user_sub": user_sub,
                        "active": bool(data.get("active", False)),
                    },
                    except_ws=websocket,
                )
                continue

            if msg_type != "message":
                await websocket.send_json(
                    {"type": "error", "detail": "Unknown message type"},
                )
                continue

            content = str(data.get("content", "")).strip()
            if not content:
                await websocket.send_json(
                    {"type": "error", "detail": "content is required"},
                )
                continue

            with get_connection() as conn:
                msg = insert_chat_message(conn, group_id, user_sub, content)
                conn.commit()

            await chat_manager.broadcast_json(
                gid,
                {
                    "type": "message",
                    "message": msg.model_dump(mode="json"),
                },
            )

            if message_mentions_ai(content):
                await _stream_ai_to_group(gid, group_id)
    except WebSocketDisconnect:
        logger.debug("group chat websocket disconnected group=%s", gid)
    except Exception:
        logger.exception("group chat websocket error group=%s", gid)
        try:
            await websocket.send_json(
                {"type": "error", "detail": "Internal server error"},
            )
        except Exception:
            pass
    finally:
        chat_manager.leave(gid, websocket)
