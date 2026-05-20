from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.access import assert_group_member, assert_group_owner, friendship_exists
from app.auth import get_current_user_sub
from app.db import get_connection
from app.schemas import GroupCreate, GroupDetailOut, GroupMemberAdd, GroupMemberOut, GroupOut

router = APIRouter(prefix="/api/groups", tags=["groups"])


@router.post("", response_model=GroupDetailOut, status_code=status.HTTP_201_CREATED)
def create_group(
    body: GroupCreate,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
) -> GroupDetailOut:
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    with get_connection() as conn:
        g = conn.execute(
            """
            INSERT INTO groups (name, created_by)
            VALUES (%s, %s)
            RETURNING id, name, created_by, created_at
            """,
            (name, user_sub),
        ).fetchone()
        assert g
        gid = str(g["id"])
        conn.execute(
            """
            INSERT INTO group_members (group_id, user_sub, role)
            VALUES (%s::uuid, %s, 'owner')
            """,
            (gid, user_sub),
        )
        conn.commit()
        return _group_detail(conn, UUID(gid), user_sub)


@router.get("", response_model=list[GroupOut])
def list_my_groups(user_sub: Annotated[str, Depends(get_current_user_sub)]) -> list[GroupOut]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT g.id, g.name, g.created_by, g.created_at,
                   (SELECT COUNT(*)::int FROM group_members m WHERE m.group_id = g.id) AS member_count
            FROM groups g
            INNER JOIN group_members gm ON gm.group_id = g.id AND gm.user_sub = %s
            ORDER BY g.created_at DESC
            """,
            (user_sub,),
        ).fetchall()
    return [
        GroupOut(
            id=r["id"],
            name=r["name"],
            created_by=r["created_by"],
            created_at=r["created_at"].isoformat(),
            member_count=r["member_count"] or 0,
        )
        for r in rows
    ]


def _group_detail(conn, group_id: UUID, viewer_sub: str) -> GroupDetailOut:
    assert_group_member(conn, group_id, viewer_sub)
    g = conn.execute(
        """
        SELECT id, name, created_by, created_at FROM groups WHERE id = %s::uuid
        """,
        (str(group_id),),
    ).fetchone()
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    mc = conn.execute(
        "SELECT COUNT(*)::int AS c FROM group_members WHERE group_id = %s::uuid",
        (str(group_id),),
    ).fetchone()
    members = conn.execute(
        """
        SELECT gm.user_sub, gm.role, gm.joined_at, p.display_name, p.email
        FROM group_members gm
        LEFT JOIN user_profiles p ON p.sub = gm.user_sub
        WHERE gm.group_id = %s::uuid
        ORDER BY gm.joined_at ASC
        """,
        (str(group_id),),
    ).fetchall()
    mout = [
        GroupMemberOut(
            user_sub=m["user_sub"],
            role=m["role"],
            joined_at=m["joined_at"].isoformat(),
            display_name=m.get("display_name"),
            email=m.get("email"),
        )
        for m in members
    ]
    return GroupDetailOut(
        id=g["id"],
        name=g["name"],
        created_by=g["created_by"],
        created_at=g["created_at"].isoformat(),
        member_count=mc["c"] if mc else 0,
        members=mout,
    )


@router.get("/{group_id}", response_model=GroupDetailOut)
def get_group(
    group_id: UUID,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
) -> GroupDetailOut:
    with get_connection() as conn:
        return _group_detail(conn, group_id, user_sub)


@router.post("/{group_id}/members", response_model=GroupDetailOut)
def add_group_member(
    group_id: UUID,
    body: GroupMemberAdd,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
) -> GroupDetailOut:
    email = body.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email")
    with get_connection() as conn:
        assert_group_owner(conn, group_id, user_sub)
        target = conn.execute(
            "SELECT sub FROM user_profiles WHERE lower(email) = lower(%s)",
            (email,),
        ).fetchone()
        if not target:
            raise HTTPException(status_code=404, detail="User not found for that email")
        new_sub = str(target["sub"])
        if new_sub == user_sub:
            raise HTTPException(status_code=400, detail="You are already in the group")
        if not friendship_exists(conn, user_sub, new_sub):
            raise HTTPException(
                status_code=400,
                detail="You can only add people you are already friends with",
            )
        exists = conn.execute(
            """
            SELECT 1 FROM group_members WHERE group_id = %s::uuid AND user_sub = %s
            """,
            (str(group_id), new_sub),
        ).fetchone()
        if exists:
            raise HTTPException(status_code=400, detail="User is already a member")
        conn.execute(
            """
            INSERT INTO group_members (group_id, user_sub, role)
            VALUES (%s::uuid, %s, 'member')
            """,
            (str(group_id), new_sub),
        )
        conn.commit()
        return _group_detail(conn, group_id, user_sub)


@router.delete("/{group_id}/members/{member_sub}", status_code=status.HTTP_204_NO_CONTENT)
def remove_group_member(
    group_id: UUID,
    member_sub: str,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
) -> None:
    with get_connection() as conn:
        assert_group_member(conn, group_id, user_sub)
        if member_sub == user_sub:
            owner = conn.execute(
                """
                SELECT role FROM group_members
                WHERE group_id = %s::uuid AND user_sub = %s
                """,
                (str(group_id), user_sub),
            ).fetchone()
            if owner and owner["role"] == "owner":
                raise HTTPException(
                    status_code=400,
                    detail="Transfer ownership or delete the group instead of leaving as owner",
                )
            conn.execute(
                """
                DELETE FROM group_members
                WHERE group_id = %s::uuid AND user_sub = %s
                """,
                (str(group_id), user_sub),
            )
            conn.commit()
            return
        assert_group_owner(conn, group_id, user_sub)
        row = conn.execute(
            """
            SELECT role FROM group_members
            WHERE group_id = %s::uuid AND user_sub = %s
            """,
            (str(group_id), member_sub),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Member not in group")
        if row["role"] == "owner":
            raise HTTPException(status_code=400, detail="Cannot remove the owner")
        conn.execute(
            """
            DELETE FROM group_members
            WHERE group_id = %s::uuid AND user_sub = %s
            """,
            (str(group_id), member_sub),
        )
        conn.commit()


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(
    group_id: UUID,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
) -> None:
    with get_connection() as conn:
        assert_group_owner(conn, group_id, user_sub)
        conn.execute("DELETE FROM groups WHERE id = %s::uuid", (str(group_id),))
        conn.commit()
