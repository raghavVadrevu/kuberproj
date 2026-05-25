import json
from collections import defaultdict
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status

from app.access import assert_group_member, assert_group_owner
from app.availability_week import (
    SLOTS,
    current_availability_week,
    is_date_in_week,
    purge_stale_availability,
    slot_key,
)
from app.group_events import notify_group_activity
from app.auth import get_current_user_sub
from app.db import get_connection
from app.poll_queries import build_poll_rows
from app.schemas import (
    AvailabilityDayOut,
    AvailabilityOut,
    AvailabilityPut,
    HeatmapCell,
    PollCreate,
    PollOut,
    VoteIn,
)

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


@router.delete("/polls/{poll_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_poll(
    group_id: UUID,
    poll_id: UUID,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
    background_tasks: BackgroundTasks,
) -> None:
    with get_connection() as conn:
        assert_group_member(conn, group_id, user_sub)
        poll = conn.execute(
            """
            SELECT id, created_by, group_id FROM polls WHERE id = %s::uuid
            """,
            (str(poll_id),),
        ).fetchone()
        if not poll:
            raise HTTPException(status_code=404, detail="Poll not found")
        if str(poll["group_id"]) != str(group_id):
            raise HTTPException(status_code=404, detail="Poll not in this group")
        if poll["created_by"] != user_sub:
            try:
                assert_group_owner(conn, group_id, user_sub)
            except HTTPException:
                raise HTTPException(
                    status_code=403,
                    detail="Only the poll creator or group owner can delete this poll",
                ) from None
        conn.execute("DELETE FROM polls WHERE id = %s::uuid", (str(poll_id),))
        conn.commit()
    background_tasks.add_task(notify_group_activity, str(group_id), "polls")


@router.get("/availability", response_model=AvailabilityOut)
def get_availability(
    group_id: UUID,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
    tz: str | None = Query(default=None, max_length=64),
) -> AvailabilityOut:
    week_start, week_days = current_availability_week(tz)
    day_isos = [iso for iso, _ in week_days]
    heatmap: dict[str, dict[str, HeatmapCell]] = {
        d: {s: HeatmapCell(count=0) for s in SLOTS} for d in day_isos
    }
    mine_keys: list[str] = []

    with get_connection() as conn:
        assert_group_member(conn, group_id, user_sub)
        gid = str(group_id)
        purge_stale_availability(conn, gid, week_start)
        conn.commit()
        rows = conn.execute(
            """
            SELECT day, slot, user_sub
            FROM availability
            WHERE group_id = %s::uuid
            """,
            (gid,),
        ).fetchall()

    cell_members: dict[tuple[str, str], list[str]] = defaultdict(list)
    for r in rows:
        d, s, sub = r["day"], r["slot"], r["user_sub"]
        if d not in day_isos or s not in SLOTS:
            continue
        cell_members[(d, s)].append(sub)
        if sub == user_sub:
            mine_keys.append(slot_key(d, s))

    for (d, s), members in cell_members.items():
        heatmap[d][s] = HeatmapCell(count=len(members), members=sorted(members)[:24])

    return AvailabilityOut(
        heatmap=heatmap,
        mine=sorted(set(mine_keys)),
        week_start=week_start.isoformat(),
        days=[AvailabilityDayOut(date=iso, label=label) for iso, label in week_days],
    )


@router.put("/availability", response_model=AvailabilityOut)
def put_availability(
    group_id: UUID,
    body: AvailabilityPut,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
    background_tasks: BackgroundTasks,
    tz: str | None = Query(default=None, max_length=64),
) -> AvailabilityOut:
    week_start, week_days = current_availability_week(tz)
    valid_dates = {iso for iso, _ in week_days}

    slots = body.slots
    seen: set[tuple[str, str]] = set()
    normalized: list[tuple[str, str]] = []
    for sl in slots:
        d, s = sl.day, sl.slot
        if s not in SLOTS:
            raise HTTPException(status_code=400, detail=f"Invalid slot: {s}")
        if not is_date_in_week(d, week_start):
            raise HTTPException(
                status_code=400,
                detail="That day is outside the current week. Availability resets every Sunday.",
            )
        if d not in valid_dates:
            raise HTTPException(status_code=400, detail=f"Invalid day: {d}")
        key = (d, s)
        if key in seen:
            continue
        seen.add(key)
        normalized.append(key)

    with get_connection() as conn:
        assert_group_member(conn, group_id, user_sub)
        gid = str(group_id)
        purge_stale_availability(conn, gid, week_start)
        conn.execute(
            "DELETE FROM availability WHERE group_id = %s::uuid AND user_sub = %s",
            (gid, user_sub),
        )
        for d, s in normalized:
            conn.execute(
                """
                INSERT INTO availability (group_id, user_sub, day, slot)
                VALUES (%s::uuid, %s, %s, %s)
                ON CONFLICT (group_id, user_sub, day, slot) DO UPDATE SET updated_at = now()
                """,
                (gid, user_sub, d, s),
            )
        conn.commit()

    background_tasks.add_task(notify_group_activity, str(group_id), "polls")
    return get_availability(group_id, user_sub, tz=tz)