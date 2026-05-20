import json
from collections import defaultdict
from typing import Any
from uuid import UUID

import psycopg

from app.schemas import PollOptionOut, PollOut


def build_poll_rows(
    conn: psycopg.Connection,
    user_sub: str,
    group_id: UUID,
    poll_ids: list[str] | None = None,
) -> list[PollOut]:
    gid = str(group_id)
    if poll_ids:
        cur = conn.execute(
            """
            SELECT id, title, created_by, status, created_at, group_id
            FROM polls
            WHERE group_id = %s::uuid AND id = ANY(%s::uuid[])
            ORDER BY created_at DESC
            """,
            (gid, poll_ids),
        )
    else:
        cur = conn.execute(
            """
            SELECT id, title, created_by, status, created_at, group_id
            FROM polls
            WHERE group_id = %s::uuid
            ORDER BY created_at DESC
            """,
            (gid,),
        )
    polls = cur.fetchall()
    if not polls:
        return []

    ids = [str(p["id"]) for p in polls]

    opts = conn.execute(
        """
        SELECT id, poll_id, label, sort_order
        FROM poll_options
        WHERE poll_id = ANY(%s::uuid[])
        ORDER BY poll_id, sort_order, id
        """,
        (ids,),
    ).fetchall()

    votes = conn.execute(
        """
        SELECT poll_id, user_sub, ranking
        FROM poll_votes
        WHERE poll_id = ANY(%s::uuid[])
        """,
        (ids,),
    ).fetchall()

    options_by_poll: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for o in opts:
        options_by_poll[str(o["poll_id"])].append(o)

    first_choice: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    my_ranking: dict[str, list[UUID]] = {}
    vote_counts: dict[str, int] = defaultdict(int)

    for v in votes:
        pid = str(v["poll_id"])
        vote_counts[pid] += 1
        r = v["ranking"]
        if isinstance(r, str):
            r = json.loads(r)
        if not r:
            continue
        first = str(r[0])
        first_choice[pid][first] += 1
        if v["user_sub"] == user_sub:
            my_ranking[pid] = [UUID(str(x)) for x in r]

    out: list[PollOut] = []
    for p in polls:
        pid = str(p["id"])
        option_rows = options_by_poll.get(pid, [])
        fc = first_choice[pid]
        options_out = [
            PollOptionOut(
                id=o["id"],
                label=o["label"],
                sort_order=o["sort_order"],
                first_choice_votes=fc.get(str(o["id"]), 0),
            )
            for o in option_rows
        ]
        gid_val = p["group_id"]
        if gid_val is None:
            continue
        out.append(
            PollOut(
                id=p["id"],
                group_id=gid_val,
                title=p["title"],
                status=p["status"],
                created_by=p["created_by"],
                created_at=p["created_at"].isoformat(),
                options=options_out,
                vote_count=vote_counts[pid],
                my_ranking=my_ranking.get(pid),
            )
        )
    return out
