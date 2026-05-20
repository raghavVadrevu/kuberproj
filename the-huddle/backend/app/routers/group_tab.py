from decimal import Decimal
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.access import assert_group_member
from app.auth import get_current_user_sub
from app.db import get_connection
from app.schemas import ExpenseCreate, ExpenseOut, TabBalanceRow, TabMemberLite, TabOverviewOut

router = APIRouter(prefix="/api/groups/{group_id}", tags=["group-tab"])

TAB_CATEGORIES = frozenset(
    {"food", "drinks", "transport", "lodging", "shopping", "dining", "other"},
)


def _member_subs(conn, group_id: str) -> list[str]:
    rows = conn.execute(
        """
        SELECT user_sub FROM group_members
        WHERE group_id = %s::uuid
        ORDER BY user_sub
        """,
        (group_id,),
    ).fetchall()
    return [str(r["user_sub"]) for r in rows]


def _profile_map(conn, subs: list[str]) -> dict[str, dict[str, Any]]:
    if not subs:
        return {}
    rows = conn.execute(
        """
        SELECT sub, display_name, email FROM user_profiles
        WHERE sub = ANY(%s)
        """,
        (subs,),
    ).fetchall()
    return {str(r["sub"]): dict(r) for r in rows}


def _row_to_expense_out(row: dict, pmap: dict[str, dict]) -> ExpenseOut:
    parts = list(row["participant_subs"])
    n = len(parts)
    amt = float(row["amount"])
    sh = amt / n if n else 0.0
    paid = str(row["paid_by_sub"])
    prof = pmap.get(paid, {})
    return ExpenseOut(
        id=row["id"],
        group_id=row["group_id"],
        description=row["description"],
        amount=amt,
        category=row["category"],
        paid_by_sub=paid,
        paid_by_display_name=prof.get("display_name"),
        participant_subs=parts,
        participant_count=n,
        share_amount=round(sh, 2),
        settled=bool(row["settled"]),
        created_at=row["created_at"].isoformat(),
    )


def _build_overview(conn, group_id: UUID, viewer_sub: str) -> TabOverviewOut:
    gid = str(group_id)
    assert_group_member(conn, group_id, viewer_sub)

    member_subs = _member_subs(conn, gid)
    pmap = _profile_map(conn, member_subs)

    members_out = [
        TabMemberLite(user_sub=s, display_name=pmap.get(s, {}).get("display_name"))
        for s in member_subs
    ]

    exp_rows = conn.execute(
        """
        SELECT id, group_id, description, amount, category, paid_by_sub,
               participant_subs, settled, created_at
        FROM group_expenses
        WHERE group_id = %s::uuid
        ORDER BY created_at DESC
        """,
        (gid,),
    ).fetchall()

    all_subs_in_expenses: set[str] = set(member_subs)
    for r in exp_rows:
        for p in r["participant_subs"]:
            all_subs_in_expenses.add(str(p))
    pmap_exp = _profile_map(conn, list(all_subs_in_expenses))

    expenses_out = [_row_to_expense_out(r, pmap_exp) for r in exp_rows]

    net: dict[str, float] = {m: 0.0 for m in member_subs}
    for r in exp_rows:
        if r["settled"]:
            continue
        parts = [str(p) for p in r["participant_subs"]]
        n = len(parts)
        if n == 0:
            continue
        amt = float(r["amount"])
        sh = amt / n
        pb = str(r["paid_by_sub"])
        for p in parts:
            if p not in net:
                net[p] = 0.0
            if p == pb:
                net[p] += amt - sh
            else:
                net[p] -= sh

    nonzero_subs = [s for s, v in net.items() if abs(v) >= 1e-6]
    pmap_bal = _profile_map(conn, nonzero_subs)

    balance_rows: list[TabBalanceRow] = []
    for sub, v in sorted(net.items(), key=lambda x: (-abs(x[1]), x[0])):
        if abs(v) < 1e-6:
            continue
        balance_rows.append(
            TabBalanceRow(
                user_sub=sub,
                display_name=pmap_bal.get(sub, {}).get("display_name"),
                net=round(v, 2),
            )
        )

    my_net = round(net.get(viewer_sub, 0.0), 2)

    return TabOverviewOut(
        viewer_sub=viewer_sub,
        my_net=my_net,
        balances=balance_rows,
        expenses=expenses_out,
        members=members_out,
    )


@router.get("/tab", response_model=TabOverviewOut)
def get_tab_overview(
    group_id: UUID,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
) -> TabOverviewOut:
    with get_connection() as conn:
        return _build_overview(conn, group_id, user_sub)


@router.post("/tab/expenses", response_model=TabOverviewOut, status_code=status.HTTP_201_CREATED)
def create_expense(
    group_id: UUID,
    body: ExpenseCreate,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
) -> TabOverviewOut:
    cat = body.category.strip().lower() or "other"
    if cat not in TAB_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category: {cat}")

    paid_by = (body.paid_by_sub or user_sub).strip()
    desc = body.description.strip()
    amt = Decimal(str(body.amount)).quantize(Decimal("0.01"))

    with get_connection() as conn:
        assert_group_member(conn, group_id, user_sub)
        gid = str(group_id)
        member_subs = _member_subs(conn, gid)
        member_set = set(member_subs)

        if paid_by not in member_set:
            raise HTTPException(status_code=400, detail="Payer must be a member of this group")

        if body.split_all:
            participants = list(member_subs)
        else:
            participants = sorted(set(s.strip() for s in body.participant_subs if s.strip()))
            if len(participants) < 2:
                raise HTTPException(
                    status_code=400,
                    detail="Pick at least two people when not splitting with everyone",
                )
            for p in participants:
                if p not in member_set:
                    raise HTTPException(status_code=400, detail=f"Participant not in group: {p}")
            if paid_by not in participants:
                raise HTTPException(status_code=400, detail="Payer must be included in the split")

        conn.execute(
            """
            INSERT INTO group_expenses (
              group_id, description, amount, category, paid_by_sub, participant_subs, settled, created_by
            )
            VALUES (%s::uuid, %s, %s, %s, %s, %s, false, %s)
            """,
            (gid, desc, str(amt), cat, paid_by, participants, user_sub),
        )
        conn.commit()
        return _build_overview(conn, group_id, user_sub)


@router.post("/tab/expenses/{expense_id}/settle", response_model=TabOverviewOut)
def settle_expense(
    group_id: UUID,
    expense_id: UUID,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
) -> TabOverviewOut:
    with get_connection() as conn:
        assert_group_member(conn, group_id, user_sub)
        row = conn.execute(
            """
            SELECT id, settled FROM group_expenses
            WHERE id = %s::uuid AND group_id = %s::uuid
            """,
            (str(expense_id), str(group_id)),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Expense not found")
        if row["settled"]:
            raise HTTPException(status_code=400, detail="Already settled")
        conn.execute(
            """
            UPDATE group_expenses SET settled = true
            WHERE id = %s::uuid
            """,
            (str(expense_id),),
        )
        conn.commit()
        return _build_overview(conn, group_id, user_sub)
