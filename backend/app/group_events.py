from app.chat_manager import chat_manager


async def notify_group_activity(group_id: str, area: str) -> None:
    """Tell connected clients that polls, tab, or vault data may have changed."""
    await chat_manager.broadcast_json(
        group_id,
        {"type": "activity", "area": area},
    )
