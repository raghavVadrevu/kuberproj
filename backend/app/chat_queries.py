from typing import Any
from uuid import UUID

import psycopg

from app.schemas import ChatMessageOut

AI_SENDER_SUB = "__huddle_ai__"
AI_DISPLAY_NAME = "Huddle AI"


def _row_to_out(row: dict[str, Any]) -> ChatMessageOut:
    is_ai = row["sender_sub"] == AI_SENDER_SUB
    display = row.get("sender_display_name")
    if is_ai:
        display = AI_DISPLAY_NAME
    created = row["created_at"]
    return ChatMessageOut(
        id=row["id"],
        group_id=row["group_id"],
        sender_sub=row["sender_sub"],
        sender_display_name=display,
        content=row["content"],
        created_at=created.isoformat() if hasattr(created, "isoformat") else str(created),
        is_ai=is_ai,
    )


def fetch_chat_messages(
    conn: psycopg.Connection,
    group_id: UUID,
    *,
    limit: int = 100,
) -> list[ChatMessageOut]:
    rows = conn.execute(
        """
        SELECT m.id, m.group_id, m.sender_sub, m.content, m.created_at,
               p.display_name AS sender_display_name
        FROM group_chat_messages m
        LEFT JOIN user_profiles p ON p.sub = m.sender_sub AND m.sender_sub <> %s
        WHERE m.group_id = %s::uuid
        ORDER BY m.created_at ASC
        LIMIT %s
        """,
        (AI_SENDER_SUB, str(group_id), limit),
    ).fetchall()
    return [_row_to_out(r) for r in rows]


def insert_chat_message(
    conn: psycopg.Connection,
    group_id: UUID,
    sender_sub: str,
    content: str,
) -> ChatMessageOut:
    row = conn.execute(
        """
        INSERT INTO group_chat_messages (group_id, sender_sub, content)
        VALUES (%s::uuid, %s, %s)
        RETURNING id, group_id, sender_sub, content, created_at
        """,
        (str(group_id), sender_sub, content),
    ).fetchone()
    assert row
    if sender_sub == AI_SENDER_SUB:
        return _row_to_out({**row, "sender_display_name": AI_DISPLAY_NAME})
    profile = conn.execute(
        "SELECT display_name FROM user_profiles WHERE sub = %s",
        (sender_sub,),
    ).fetchone()
    return _row_to_out(
        {**row, "sender_display_name": profile["display_name"] if profile else None},
    )
