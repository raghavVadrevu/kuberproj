import json
import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect, status

from app.access import assert_group_member
from app.auth import decode_cognito_id_token
from app.chat_manager import chat_manager
from app.db import get_connection

logger = logging.getLogger(__name__)

router = APIRouter(tags=["group-sync"])


@router.websocket("/api/ws/groups/{group_id}/sync")
async def group_sync_websocket(
    websocket: WebSocket,
    group_id: UUID,
    token: str | None = Query(None),
) -> None:
    """Live group activity feed for nav badges and other subscribers."""
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
                continue
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        logger.debug("group sync websocket disconnected group=%s", gid)
    except Exception:
        logger.exception("group sync websocket error group=%s", gid)
    finally:
        chat_manager.leave(gid, websocket)
