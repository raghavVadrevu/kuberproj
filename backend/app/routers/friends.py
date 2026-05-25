from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.access import add_friendship, friendship_exists, ordered_pair
from app.auth import get_current_user_sub, get_id_token_payload
from app.db import get_connection
from app.profile_sync import upsert_profile_from_token
from app.schemas import (
    FriendRequestCreate,
    FriendRequestCreateResult,
    FriendRequestOut,
    UserProfileOut,
)

router = APIRouter(prefix="/api/friends", tags=["friends"])


def _profile_map(conn, subs: list[str]) -> dict[str, dict]:
    if not subs:
        return {}
    rows = conn.execute(
        """
        SELECT sub, email, display_name, picture_url FROM user_profiles
        WHERE sub = ANY(%s)
        """,
        (subs,),
    ).fetchall()
    return {r["sub"]: dict(r) for r in rows}


def _enrich_requests(conn, rows: list) -> list[FriendRequestOut]:
    subs: set[str] = set()
    for r in rows:
        subs.add(r["from_sub"])
        subs.add(r["to_sub"])
    pmap = _profile_map(conn, list(subs))
    out: list[FriendRequestOut] = []
    for r in rows:
        fs = pmap.get(r["from_sub"], {})
        ts = pmap.get(r["to_sub"], {})
        out.append(
            FriendRequestOut(
                id=r["id"],
                from_sub=r["from_sub"],
                to_sub=r["to_sub"],
                status=r["status"],
                created_at=r["created_at"].isoformat(),
                from_display_name=fs.get("display_name"),
                from_email=fs.get("email"),
                from_picture_url=fs.get("picture_url"),
                to_display_name=ts.get("display_name"),
                to_email=ts.get("email"),
                to_picture_url=ts.get("picture_url"),
            )
        )
    return out


@router.get("", response_model=list[UserProfileOut])
def list_friends(user_sub: Annotated[str, Depends(get_current_user_sub)]) -> list[UserProfileOut]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT CASE WHEN user_low = %s THEN user_high ELSE user_low END AS friend_sub
            FROM friendships
            WHERE user_low = %s OR user_high = %s
            """,
            (user_sub, user_sub, user_sub),
        ).fetchall()
        friend_subs = [str(r["friend_sub"]) for r in rows]
        if not friend_subs:
            return []
        profs = conn.execute(
            """
            SELECT sub, email, display_name FROM user_profiles
            WHERE sub = ANY(%s)
            """,
            (friend_subs,),
        ).fetchall()
    return [
        UserProfileOut(
            sub=p["sub"],
            email=p["email"],
            display_name=p["display_name"] or "Member",
            picture_url=p.get("picture_url"),
        )
        for p in profs
    ]


@router.delete("/{other_sub}", status_code=status.HTTP_204_NO_CONTENT)
def remove_friend(
    other_sub: str,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
) -> None:
    if other_sub == user_sub:
        raise HTTPException(status_code=400, detail="Invalid target")
    lo, hi = ordered_pair(user_sub, other_sub)
    with get_connection() as conn:
        conn.execute(
            "DELETE FROM friendships WHERE user_low = %s AND user_high = %s",
            (lo, hi),
        )
        conn.commit()


@router.get("/requests/incoming", response_model=list[FriendRequestOut])
def incoming_requests(user_sub: Annotated[str, Depends(get_current_user_sub)]) -> list[FriendRequestOut]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, from_sub, to_sub, status, created_at
            FROM friend_requests
            WHERE to_sub = %s AND status = 'pending'
            ORDER BY created_at DESC
            """,
            (user_sub,),
        ).fetchall()
        return _enrich_requests(conn, rows)


@router.get("/requests/outgoing", response_model=list[FriendRequestOut])
def outgoing_requests(user_sub: Annotated[str, Depends(get_current_user_sub)]) -> list[FriendRequestOut]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, from_sub, to_sub, status, created_at
            FROM friend_requests
            WHERE from_sub = %s AND status = 'pending'
            ORDER BY created_at DESC
            """,
            (user_sub,),
        ).fetchall()
        return _enrich_requests(conn, rows)


@router.post(
    "/requests",
    response_model=FriendRequestCreateResult,
    status_code=status.HTTP_201_CREATED,
)
def create_friend_request(
    body: FriendRequestCreate,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
    payload: Annotated[dict, Depends(get_id_token_payload)],
) -> FriendRequestCreateResult:
    email = body.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email")

    with get_connection() as conn:
        upsert_profile_from_token(conn, user_sub, payload)

        target = conn.execute(
            "SELECT sub FROM user_profiles WHERE lower(email) = lower(%s)",
            (email,),
        ).fetchone()
        if not target:
            raise HTTPException(
                status_code=404,
                detail="No user with that email has signed into The Huddle yet.",
            )
        to_sub = str(target["sub"])
        if to_sub == user_sub:
            raise HTTPException(status_code=400, detail="Cannot friend yourself")

        if friendship_exists(conn, user_sub, to_sub):
            raise HTTPException(status_code=400, detail="Already friends")

        rev = conn.execute(
            """
            SELECT id FROM friend_requests
            WHERE from_sub = %s AND to_sub = %s AND status = 'pending'
            """,
            (to_sub, user_sub),
        ).fetchone()
        if rev:
            add_friendship(conn, user_sub, to_sub)
            conn.execute(
                """
                DELETE FROM friend_requests
                WHERE status = 'pending' AND (
                  (from_sub = %s AND to_sub = %s) OR (from_sub = %s AND to_sub = %s)
                )
                """,
                (user_sub, to_sub, to_sub, user_sub),
            )
            conn.commit()
            return FriendRequestCreateResult(became_friends=True, request=None)

        dup = conn.execute(
            """
            SELECT id FROM friend_requests
            WHERE from_sub = %s AND to_sub = %s AND status = 'pending'
            """,
            (user_sub, to_sub),
        ).fetchone()
        if dup:
            raise HTTPException(status_code=400, detail="Request already sent")

        row = conn.execute(
            """
            INSERT INTO friend_requests (from_sub, to_sub, status)
            VALUES (%s, %s, 'pending')
            RETURNING id, from_sub, to_sub, status, created_at
            """,
            (user_sub, to_sub),
        ).fetchone()
        conn.commit()
        assert row
        enriched = _enrich_requests(conn, [row])
        return FriendRequestCreateResult(became_friends=False, request=enriched[0])


@router.post("/requests/{request_id}/accept", status_code=status.HTTP_204_NO_CONTENT)
def accept_request(
    request_id: UUID,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
) -> None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT id, from_sub, to_sub, status FROM friend_requests
            WHERE id = %s::uuid
            """,
            (str(request_id),),
        ).fetchone()
        if not row or row["status"] != "pending":
            raise HTTPException(status_code=404, detail="Request not found")
        if row["to_sub"] != user_sub:
            raise HTTPException(status_code=403, detail="Not your incoming request")
        add_friendship(conn, row["from_sub"], row["to_sub"])
        conn.execute("DELETE FROM friend_requests WHERE id = %s::uuid", (str(request_id),))
        conn.commit()


@router.post("/requests/{request_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
def decline_request(
    request_id: UUID,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
) -> None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT id, to_sub, status FROM friend_requests
            WHERE id = %s::uuid
            """,
            (str(request_id),),
        ).fetchone()
        if not row or row["status"] != "pending":
            raise HTTPException(status_code=404, detail="Request not found")
        if row["to_sub"] != user_sub:
            raise HTTPException(status_code=403, detail="Not your incoming request")
        conn.execute(
            "UPDATE friend_requests SET status = 'declined', updated_at = now() WHERE id = %s::uuid",
            (str(request_id),),
        )
        conn.commit()


@router.delete("/requests/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_outgoing_request(
    request_id: UUID,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
) -> None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT id, from_sub, status FROM friend_requests
            WHERE id = %s::uuid
            """,
            (str(request_id),),
        ).fetchone()
        if not row or row["status"] != "pending":
            raise HTTPException(status_code=404, detail="Request not found")
        if row["from_sub"] != user_sub:
            raise HTTPException(status_code=403, detail="Not your outgoing request")
        conn.execute(
            "UPDATE friend_requests SET status = 'cancelled', updated_at = now() WHERE id = %s::uuid",
            (str(request_id),),
        )
        conn.commit()
