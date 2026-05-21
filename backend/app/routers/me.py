from typing import Annotated

from fastapi import APIRouter, Depends

from app.auth import get_current_user_sub, get_id_token_payload
from app.db import get_connection
from app.profile_sync import upsert_profile_from_token
from app.schemas import MePut, UserProfileOut

router = APIRouter(prefix="/api", tags=["me"])


@router.get("/me", response_model=UserProfileOut)
def get_me(
    user_sub: Annotated[str, Depends(get_current_user_sub)],
    payload: Annotated[dict, Depends(get_id_token_payload)],
) -> UserProfileOut:
    with get_connection() as conn:
        upsert_profile_from_token(conn, user_sub, payload)
        conn.commit()
        row = conn.execute(
            "SELECT sub, email, display_name FROM user_profiles WHERE sub = %s",
            (user_sub,),
        ).fetchone()
    assert row
    return UserProfileOut(
        sub=row["sub"],
        email=row["email"],
        display_name=row["display_name"],
    )


@router.put("/me", response_model=UserProfileOut)
def put_me(
    body: MePut,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
    payload: Annotated[dict, Depends(get_id_token_payload)],
) -> UserProfileOut:
    with get_connection() as conn:
        upsert_profile_from_token(conn, user_sub, payload)
        if body.display_name and body.display_name.strip():
            conn.execute(
                """
                UPDATE user_profiles SET display_name = %s, updated_at = now()
                WHERE sub = %s
                """,
                (body.display_name.strip(), user_sub),
            )
        conn.commit()
        row = conn.execute(
            "SELECT sub, email, display_name FROM user_profiles WHERE sub = %s",
            (user_sub,),
        ).fetchone()
    assert row
    return UserProfileOut(
        sub=row["sub"],
        email=row["email"],
        display_name=row["display_name"],
    )
