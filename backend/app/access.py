from uuid import UUID

import psycopg
from fastapi import HTTPException, status


def assert_group_member(conn: psycopg.Connection, group_id: UUID, user_sub: str) -> None:
    g = conn.execute(
        "SELECT 1 FROM groups WHERE id = %s::uuid",
        (str(group_id),),
    ).fetchone()
    if not g:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found",
        )
    row = conn.execute(
        """
        SELECT 1 FROM group_members
        WHERE group_id = %s::uuid AND user_sub = %s
        """,
        (str(group_id), user_sub),
    ).fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this group",
        )


def assert_group_owner(conn: psycopg.Connection, group_id: UUID, user_sub: str) -> None:
    g = conn.execute(
        "SELECT 1 FROM groups WHERE id = %s::uuid",
        (str(group_id),),
    ).fetchone()
    if not g:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found",
        )
    row = conn.execute(
        """
        SELECT 1 FROM group_members
        WHERE group_id = %s::uuid AND user_sub = %s AND role = 'owner'
        """,
        (str(group_id), user_sub),
    ).fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Group owner only",
        )


def ordered_pair(a: str, b: str) -> tuple[str, str]:
    return (a, b) if a < b else (b, a)


def friendship_exists(conn: psycopg.Connection, a: str, b: str) -> bool:
    lo, hi = ordered_pair(a, b)
    return bool(
        conn.execute(
            "SELECT 1 FROM friendships WHERE user_low = %s AND user_high = %s",
            (lo, hi),
        ).fetchone()
    )


def add_friendship(conn: psycopg.Connection, a: str, b: str) -> None:
    lo, hi = ordered_pair(a, b)
    conn.execute(
        """
        INSERT INTO friendships (user_low, user_high)
        VALUES (%s, %s)
        ON CONFLICT (user_low, user_high) DO NOTHING
        """,
        (lo, hi),
    )
