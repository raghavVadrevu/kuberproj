import os
from typing import Annotated

from fastapi import Depends, HTTPException, status

from app.auth import get_id_token_payload

_DEFAULT_ADMIN_EMAIL = "praneeth2004.raghava@gmail.com"


def admin_emails() -> frozenset[str]:
    raw = os.environ.get("ADMIN_EMAILS", _DEFAULT_ADMIN_EMAIL)
    return frozenset(e.strip().lower() for e in raw.split(",") if e.strip())


def email_from_payload(payload: dict) -> str | None:
    raw = payload.get("email")
    if not isinstance(raw, str) or not raw.strip():
        return None
    return raw.strip().lower()


async def require_admin(
    payload: Annotated[dict, Depends(get_id_token_payload)],
) -> dict:
    email = email_from_payload(payload)
    if not email or email not in admin_emails():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return payload
