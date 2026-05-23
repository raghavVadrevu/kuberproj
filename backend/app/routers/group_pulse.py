from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.access import assert_group_member
from app.auth import get_current_user_sub
from app.db import get_connection
from app.poll_queries import build_poll_rows
from app.routers.group_tab import _build_overview
from app.schemas import PulseTldrOut
from app.services.group_context import build_group_activity_context
from app.services.llm_service import generate_pulse_tldr
from app.services.pulse_service import fallback_pulse_tldr

router = APIRouter(prefix="/api/groups/{group_id}", tags=["group-pulse"])


@router.get("/pulse/tldr", response_model=PulseTldrOut)
async def get_pulse_tldr(
    group_id: UUID,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
) -> PulseTldrOut:
    with get_connection() as conn:
        assert_group_member(conn, group_id, user_sub)
        group_row = conn.execute(
            "SELECT name FROM groups WHERE id = %s::uuid",
            (str(group_id),),
        ).fetchone()
        if not group_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

        group_name = str(group_row["name"])
        polls = build_poll_rows(conn, user_sub, group_id)
        tab = _build_overview(conn, group_id, user_sub)
        context = build_group_activity_context(conn, group_id, user_sub)

    try:
        tldr = await generate_pulse_tldr(context)
        if not tldr:
            raise ValueError("empty LLM response")
        return PulseTldrOut(tldr=tldr, generated_by="llm")
    except Exception:
        return PulseTldrOut(
            tldr=fallback_pulse_tldr(group_name=group_name, polls=polls, tab=tab),
            generated_by="fallback",
        )
