from uuid import UUID

import psycopg

from app.poll_queries import build_poll_rows
from app.routers.group_tab import _build_overview
from app.services.pulse_service import format_pulse_context


def build_group_activity_context(
    conn: psycopg.Connection,
    group_id: UUID,
    viewer_sub: str,
) -> str:
    """Polls, tab, and balances snapshot for Pulse TL;DR and @huddle chat."""
    gid = str(group_id)
    group_row = conn.execute(
        "SELECT name FROM groups WHERE id = %s::uuid",
        (gid,),
    ).fetchone()
    if not group_row:
        return ""

    profile = conn.execute(
        "SELECT display_name FROM user_profiles WHERE sub = %s",
        (viewer_sub,),
    ).fetchone()

    polls = build_poll_rows(conn, viewer_sub, group_id)
    tab = _build_overview(conn, group_id, viewer_sub)
    viewer_name = profile["display_name"] if profile else None

    return format_pulse_context(
        group_name=str(group_row["name"]),
        member_count=len(tab.members),
        polls=polls,
        tab=tab,
        viewer_name=viewer_name,
    )
