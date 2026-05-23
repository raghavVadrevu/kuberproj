import json
from collections import defaultdict
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from app.access import assert_group_member
from app.group_events import notify_group_activity
from app.auth import get_current_user_sub
from app.db import get_connection
from app.poll_queries import build_poll_rows
from app.schemas import (
    AvailabilityOut,
    AvailabilityPut,
    HeatmapCell,
    PollCreate,
    PollOut,
    VoteIn,
)

DAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
SLOTS = ("Morning", "Afternoon", "Evening", "Night")

router = APIRouter(prefix="/api/groups/{group_id}", tags=["group-content"])


@router.get("/polls", response_model=list[PollOut])
def list_polls(
    group_id: UUID,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
) -> list[PollOut]:
    with get_connection() as conn:
        assert_group_member(conn, group_id, user_sub)
        return build_poll_rows(conn, user_sub, group_id)


@router.post("/polls", response_model=PollOut, status_code=status.HTTP_201_CREATED)
def create_poll(
    group_id: UUID,
    body: PollCreate,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
    background_tasks: BackgroundTasks,
) -> PollOut:
    labels = [o.strip() for o in body.options if o.strip()]
    if len(labels) < 2:
        raise HTTPException(status_code=400, detail="At least two non-empty options are required")
    if len(set(labels)) != len(labels):
        raise HTTPException(status_code=400, detail="Option labels must be unique")

    with get_connection() as conn:
        assert_group_member(conn, group_id, user_sub)
        row = conn.execute(
            """
            INSERT INTO polls (title, created_by, group_id, status)
            VALUES (%s, %s, %s::uuid, 'active')
            RETURNING id
            """,
            (body.title.strip(), user_sub, str(group_id)),
        ).fetchone()
        assert row
        poll_id = str(row["id"])
        for i, label in enumerate(labels):
            conn.execute(
                """
                INSERT INTO poll_options (poll_id, label, sort_order)
                VALUES (%s::uuid, %s, %s)
                """,
                (poll_id, label, i),
            )
        conn.commit()
        rows = build_poll_rows(conn, user_sub, group_id, [poll_id])
        if not rows:
            raise HTTPException(status_code=500, detail="Failed to load created poll")
        background_tasks.add_task(notify_group_activity, str(group_id), "polls")
        return rows[0]


@router.post("/polls/{poll_id}/vote", response_model=PollOut)
def submit_vote(
    group_id: UUID,
    poll_id: UUID,
    body: VoteIn,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
    background_tasks: BackgroundTasks,
) -> PollOut:
    with get_connection() as conn:
        assert_group_member(conn, group_id, user_sub)
        poll = conn.execute(
            """
            SELECT id, status, group_id FROM polls
            WHERE id = %s::uuid
            """,
            (str(poll_id),),
        ).fetchone()
        if not poll:
            raise HTTPException(status_code=404, detail="Poll not found")
        if str(poll["group_id"]) != str(group_id):
            raise HTTPException(status_code=404, detail="Poll not in this group")
        if poll["status"] != "active":
            raise HTTPException(status_code=400, detail="Poll is closed")

        opts = conn.execute(
            "SELECT id FROM poll_options WHERE poll_id = %s::uuid ORDER BY sort_order, id",
            (str(poll_id),),
        ).fetchall()
        option_ids = {UUID(str(o["id"])) for o in opts}
        ranked = list(body.ranked_option_ids)
        if set(ranked) != option_ids:
            raise HTTPException(
                status_code=400,
                detail="Ranking must include each poll option exactly once",
            )

        ranking_json = json.dumps([str(x) for x in ranked])
        conn.execute(
            """
            INSERT INTO poll_votes (poll_id, user_sub, ranking)
            VALUES (%s::uuid, %s, %s::jsonb)
            ON CONFLICT (poll_id, user_sub) DO UPDATE
            SET ranking = EXCLUDED.ranking, updated_at = now()
            """,
            (str(poll_id), user_sub, ranking_json),
        )
        conn.commit()
        rows = build_poll_rows(conn, user_sub, group_id, [str(poll_id)])
        if not rows:
            raise HTTPException(status_code=404, detail="Poll not found")
        background_tasks.add_task(notify_group_activity, str(group_id), "polls")
        return rows[0]


@router.get("/availability", response_model=AvailabilityOut)
def get_availability(
    group_id: UUID,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
) -> AvailabilityOut:
    heatmap: dict[str, dict[str, HeatmapCell]] = {
        d: {s: HeatmapCell(count=0) for s in SLOTS} for d in DAYS
    }
    mine_keys: list[str] = []

    with get_connection() as conn:
        assert_group_member(conn, group_id, user_sub)
        rows = conn.execute(
            """
            SELECT day, slot, user_sub
            FROM availability
            WHERE group_id = %s::uuid
            """,
            (str(group_id),),
        ).fetchall()

    cell_members: dict[tuple[str, str], list[str]] = defaultdict(list)
    for r in rows:
        d, s, sub = r["day"], r["slot"], r["user_sub"]
        if d not in DAYS or s not in SLOTS:
            continue
        cell_members[(d, s)].append(sub)
        if sub == user_sub:
            mine_keys.append(f"{d}-{s}")

    for (d, s), members in cell_members.items():
        heatmap[d][s] = HeatmapCell(count=len(members), members=sorted(members)[:24])

    return AvailabilityOut(heatmap=heatmap, mine=sorted(set(mine_keys)))


@router.put("/availability", response_model=AvailabilityOut)
def put_availability(
    group_id: UUID,
    body: AvailabilityPut,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
    background_tasks: BackgroundTasks,
) -> AvailabilityOut:
    slots = body.slots
    seen: set[tuple[str, str]] = set()
    normalized: list[tuple[str, str]] = []
    for sl in slots:
        d, s = sl.day, sl.slot
        if d not in DAYS or s not in SLOTS:
            raise HTTPException(status_code=400, detail=f"Invalid day or slot: {d} {s}")
        key = (d, s)
        if key in seen:
            continue
        seen.add(key)
        normalized.append(key)

    with get_connection() as conn:
        assert_group_member(conn, group_id, user_sub)
        conn.execute(
            "DELETE FROM availability WHERE group_id = %s::uuid AND user_sub = %s",
            (str(group_id), user_sub),
        )
        for d, s in normalized:
            conn.execute(
                """
                INSERT INTO availability (group_id, user_sub, day, slot)
                VALUES (%s::uuid, %s, %s, %s)
                ON CONFLICT (group_id, user_sub, day, slot) DO UPDATE SET updated_at = now()
                """,
                (str(group_id), user_sub, d, s),
            )
        conn.commit()

    background_tasks.add_task(notify_group_activity, str(group_id), "polls")
    return get_availability(group_id, user_sub)