from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.admin_auth import require_admin
from app.db import get_connection
from app.db_wipe import wipe_all_app_data

router = APIRouter(prefix="/api/admin", tags=["admin"])

WIPE_CONFIRM_PHRASE = "WIPE_ALL_DATA"


class AdminWipeIn(BaseModel):
    confirm: Literal["WIPE_ALL_DATA"] = Field(
        description=f'Must be exactly "{WIPE_CONFIRM_PHRASE}"',
    )


@router.post("/wipe-database", status_code=status.HTTP_204_NO_CONTENT)
def wipe_database(
    body: AdminWipeIn,
    _admin: Annotated[dict, Depends(require_admin)],
) -> None:
    """Remove all app data from Postgres. Admin only."""
    if body.confirm != WIPE_CONFIRM_PHRASE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f'Confirmation must be "{WIPE_CONFIRM_PHRASE}"',
        )
    with get_connection() as conn:
        wipe_all_app_data(conn)
        conn.commit()
