from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.account_cleanup import delete_user_data
from app.auth import get_current_user_sub, get_id_token_payload
from app.db import get_connection
from app.profile_sync import (
    display_from_names,
    names_from_payload,
    picture_from_payload,
    upsert_profile_from_token,
)
from app.schemas import MePut, UserProfileOut

router = APIRouter(prefix="/api", tags=["me"])


def _profile_out(row: dict, payload: dict) -> UserProfileOut:
    given, family = names_from_payload(payload)
    return UserProfileOut(
        sub=row["sub"],
        email=row["email"],
        display_name=row["display_name"],
        given_name=given or None,
        family_name=family or None,
        picture_url=row.get("picture_url") or picture_from_payload(payload),
    )


@router.get("/me", response_model=UserProfileOut)
def get_me(
    user_sub: Annotated[str, Depends(get_current_user_sub)],
    payload: Annotated[dict, Depends(get_id_token_payload)],
) -> UserProfileOut:
    with get_connection() as conn:
        upsert_profile_from_token(conn, user_sub, payload)
        conn.commit()
        row = conn.execute(
            "SELECT sub, email, display_name, picture_url FROM user_profiles WHERE sub = %s",
            (user_sub,),
        ).fetchone()
    assert row
    return _profile_out(row, payload)


@router.put("/me", response_model=UserProfileOut)
def put_me(
    body: MePut,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
    payload: Annotated[dict, Depends(get_id_token_payload)],
) -> UserProfileOut:
    with get_connection() as conn:
        upsert_profile_from_token(conn, user_sub, payload)

        if body.given_name is not None or body.family_name is not None:
            given = (body.given_name or "").strip()
            family = (body.family_name or "").strip()
            if not given or not family:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="First and last name are required",
                )
            display = display_from_names(given, family)
            conn.execute(
                """
                UPDATE user_profiles SET display_name = %s, updated_at = now()
                WHERE sub = %s
                """,
                (display, user_sub),
            )
            payload = {
                **payload,
                "given_name": given,
                "family_name": family,
                "name": display,
            }
        elif body.display_name and body.display_name.strip():
            display = body.display_name.strip()
            conn.execute(
                """
                UPDATE user_profiles SET display_name = %s, updated_at = now()
                WHERE sub = %s
                """,
                (display, user_sub),
            )
            payload = {**payload, "name": display}

        if body.picture_url is not None:
            pic = body.picture_url.strip() or None
            conn.execute(
                """
                UPDATE user_profiles SET picture_url = %s, updated_at = now()
                WHERE sub = %s
                """,
                (pic, user_sub),
            )
            if pic:
                payload = {**payload, "picture": pic}
            else:
                payload = {k: v for k, v in payload.items() if k != "picture"}

        conn.commit()
        row = conn.execute(
            "SELECT sub, email, display_name, picture_url FROM user_profiles WHERE sub = %s",
            (user_sub,),
        ).fetchone()
    assert row
    return _profile_out(row, payload)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(
    user_sub: Annotated[str, Depends(get_current_user_sub)],
) -> None:
    """Remove this user's app data. Call Cognito deleteUser from the client after this."""
    with get_connection() as conn:
        delete_user_data(conn, user_sub)
        conn.commit()
