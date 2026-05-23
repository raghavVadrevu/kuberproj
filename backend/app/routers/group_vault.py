from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status

from app.access import assert_group_member
from app.group_events import notify_group_activity
from app.auth import get_current_user_sub
from app.db import get_connection
from app.schemas import VaultItemCreate, VaultItemOut, VaultItemUpdate

router = APIRouter(prefix="/api/groups/{group_id}/vault", tags=["group-vault"])

VAULT_TYPES = frozenset({"code", "location", "link"})
VAULT_CATEGORIES = frozenset({"Access Codes", "Locations", "Links"})


def _validate_create(body: VaultItemCreate) -> None:
    t = body.item_type.strip().lower()
    if t not in VAULT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid item_type: must be one of {sorted(VAULT_TYPES)}",
        )
    c = body.category.strip()
    if c not in VAULT_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid category: must be one of {sorted(VAULT_CATEGORIES)}",
        )


def _row_to_out(row: dict[str, Any]) -> VaultItemOut:
    ca = row["created_at"]
    ua = row["updated_at"]
    return VaultItemOut(
        id=row["id"],
        group_id=row["group_id"],
        item_type=str(row["item_type"]),
        title=str(row["title"]),
        subtitle=str(row["subtitle"]) if row.get("subtitle") is not None else None,
        value=str(row["value"]),
        category=str(row["category"]),
        created_by=str(row["created_by"]),
        created_at=ca.isoformat() if hasattr(ca, "isoformat") else str(ca),
        updated_at=ua.isoformat() if hasattr(ua, "isoformat") else str(ua),
    )


def _fetch_one(conn, group_id: str, item_id: str) -> dict[str, Any] | None:
    return conn.execute(
        """
        SELECT id, group_id, item_type, title, subtitle, value, category,
               created_by, created_at, updated_at
        FROM group_vault_items
        WHERE id = %s::uuid AND group_id = %s::uuid
        """,
        (item_id, group_id),
    ).fetchone()


@router.get("", response_model=list[VaultItemOut])
def list_vault_items(
    group_id: UUID,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
) -> list[VaultItemOut]:
    gid = str(group_id)
    with get_connection() as conn:
        assert_group_member(conn, group_id, user_sub)
        rows = conn.execute(
            """
            SELECT id, group_id, item_type, title, subtitle, value, category,
                   created_by, created_at, updated_at
            FROM group_vault_items
            WHERE group_id = %s::uuid
            ORDER BY updated_at DESC
            """,
            (gid,),
        ).fetchall()
        return [_row_to_out(dict(r)) for r in rows]


@router.post("", response_model=VaultItemOut, status_code=status.HTTP_201_CREATED)
def create_vault_item(
    group_id: UUID,
    body: VaultItemCreate,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
    background_tasks: BackgroundTasks,
) -> VaultItemOut:
    _validate_create(body)
    item_type = body.item_type.strip().lower()
    title = body.title.strip()
    subtitle = (body.subtitle.strip() if body.subtitle is not None else None) or None
    value = body.value.strip()
    category = body.category.strip()
    gid = str(group_id)

    with get_connection() as conn:
        assert_group_member(conn, group_id, user_sub)
        row = conn.execute(
            """
            INSERT INTO group_vault_items (
              group_id, item_type, title, subtitle, value, category, created_by
            )
            VALUES (%s::uuid, %s, %s, %s, %s, %s, %s)
            RETURNING id, group_id, item_type, title, subtitle, value, category,
                      created_by, created_at, updated_at
            """,
            (gid, item_type, title, subtitle, value, category, user_sub),
        ).fetchone()
        conn.commit()
    if not row:
        raise HTTPException(status_code=500, detail="Insert failed")
    background_tasks.add_task(notify_group_activity, gid, "vault")
    return _row_to_out(dict(row))


@router.put("/{item_id}", response_model=VaultItemOut)
def update_vault_item(
    group_id: UUID,
    item_id: UUID,
    body: VaultItemUpdate,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
    background_tasks: BackgroundTasks,
) -> VaultItemOut:
    gid = str(group_id)
    iid = str(item_id)
    sets: list[str] = []
    params: list[Any] = []

    if body.item_type is not None:
        t = body.item_type.strip().lower()
        if t not in VAULT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid item_type: must be one of {sorted(VAULT_TYPES)}",
            )
        sets.append("item_type = %s")
        params.append(t)
    if body.title is not None:
        sets.append("title = %s")
        params.append(body.title.strip())
    if body.subtitle is not None:
        st = body.subtitle.strip()
        sets.append("subtitle = %s")
        params.append(st if st else None)
    if body.value is not None:
        sets.append("value = %s")
        params.append(body.value.strip())
    if body.category is not None:
        c = body.category.strip()
        if c not in VAULT_CATEGORIES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid category: must be one of {sorted(VAULT_CATEGORIES)}",
            )
        sets.append("category = %s")
        params.append(c)

    if not sets:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    sets.append("updated_at = now()")
    params.extend([iid, gid])

    with get_connection() as conn:
        assert_group_member(conn, group_id, user_sub)
        cur = conn.execute(
            f"""
            UPDATE group_vault_items
            SET {", ".join(sets)}
            WHERE id = %s::uuid AND group_id = %s::uuid
            """,
            params,
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vault item not found")
        row = _fetch_one(conn, gid, iid)
        conn.commit()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vault item not found")
    background_tasks.add_task(notify_group_activity, gid, "vault")
    return _row_to_out(dict(row))


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vault_item(
    group_id: UUID,
    item_id: UUID,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
    background_tasks: BackgroundTasks,
) -> Response:
    gid = str(group_id)
    iid = str(item_id)
    with get_connection() as conn:
        assert_group_member(conn, group_id, user_sub)
        cur = conn.execute(
            """
            DELETE FROM group_vault_items
            WHERE id = %s::uuid AND group_id = %s::uuid
            """,
            (iid, gid),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vault item not found")
        conn.commit()
    background_tasks.add_task(notify_group_activity, gid, "vault")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
