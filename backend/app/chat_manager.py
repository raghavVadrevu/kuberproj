import logging
from typing import Any

from starlette.websockets import WebSocket

logger = logging.getLogger(__name__)


class GroupChatManager:
    """In-memory registry of group chat WebSocket connections."""

    def __init__(self) -> None:
        self._rooms: dict[str, dict[WebSocket, str]] = {}

    def join(self, group_id: str, websocket: WebSocket, user_sub: str) -> None:
        if group_id not in self._rooms:
            self._rooms[group_id] = {}
        self._rooms[group_id][websocket] = user_sub

    def leave(self, group_id: str, websocket: WebSocket) -> None:
        room = self._rooms.get(group_id)
        if not room:
            return
        room.pop(websocket, None)
        if not room:
            del self._rooms[group_id]

    async def broadcast_json(self, group_id: str, payload: dict[str, Any]) -> None:
        await self._send_json(group_id, payload, except_ws=None)

    async def broadcast_json_except(
        self,
        group_id: str,
        payload: dict[str, Any],
        *,
        except_ws: WebSocket,
    ) -> None:
        await self._send_json(group_id, payload, except_ws=except_ws)

    async def _send_json(
        self,
        group_id: str,
        payload: dict[str, Any],
        *,
        except_ws: WebSocket | None,
    ) -> None:
        room = self._rooms.get(group_id, {})
        dead: list[WebSocket] = []
        for ws in list(room.keys()):
            if except_ws is not None and ws is except_ws:
                continue
            try:
                await ws.send_json(payload)
            except Exception:
                logger.debug("dropping dead chat websocket", exc_info=True)
                dead.append(ws)
        for ws in dead:
            self.leave(group_id, ws)


chat_manager = GroupChatManager()
