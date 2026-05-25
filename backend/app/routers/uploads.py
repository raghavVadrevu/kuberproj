from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import get_current_user_sub
from app.schemas import AvatarPresignIn, AvatarPresignOut
from app.services import storage

router = APIRouter(prefix="/api/uploads", tags=["uploads"])


def _presign_or_400(*, content_type: str, content_length: int | None, user_sub: str | None) -> AvatarPresignOut:
    try:
        result = storage.create_avatar_presign(
            content_type=content_type,
            user_sub=user_sub,
            content_length=content_length,
        )
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="File uploads are not configured",
        ) from e
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    return AvatarPresignOut(**result)


@router.post("/presign-avatar", response_model=AvatarPresignOut)
def presign_avatar_signup(body: AvatarPresignIn) -> AvatarPresignOut:
    """Presign avatar upload during signup (no auth required)."""
    return _presign_or_400(
        content_type=body.content_type,
        content_length=body.content_length,
        user_sub=None,
    )


@router.post("/presign-avatar/me", response_model=AvatarPresignOut)
def presign_avatar_me(
    body: AvatarPresignIn,
    user_sub: Annotated[str, Depends(get_current_user_sub)],
) -> AvatarPresignOut:
    """Presign avatar upload for a signed-in user."""
    return _presign_or_400(
        content_type=body.content_type,
        content_length=body.content_length,
        user_sub=user_sub,
    )
