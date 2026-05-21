import os
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

_bearer = HTTPBearer(auto_error=False)
_jwks_client: PyJWKClient | None = None


def _issuer() -> str:
    raw = os.environ.get("COGNITO_ISSUER", "").rstrip("/")
    if not raw:
        raise RuntimeError("COGNITO_ISSUER is not set")
    return raw


def _audience() -> str:
    aud = os.environ.get("COGNITO_APP_CLIENT_ID") or os.environ.get("COGNITO_AUDIENCE")
    if not aud:
        raise RuntimeError("COGNITO_APP_CLIENT_ID is not set")
    return aud


def _jwks_url() -> str:
    url = os.environ.get("COGNITO_JWKS_URL")
    if url:
        return url
    return f"{_issuer()}/.well-known/jwks.json"


def get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(_jwks_url())
    return _jwks_client


def decode_cognito_id_token(token: str) -> dict:
    jwks = get_jwks_client()
    key = jwks.get_signing_key_from_jwt(token)
    payload = jwt.decode(
        token,
        key.key,
        algorithms=["RS256"],
        audience=_audience(),
        issuer=_issuer(),
    )
    if payload.get("token_use") != "id":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Use the Cognito ID token (token_use must be id)",
        )
    sub = payload.get("sub")
    if not sub or not isinstance(sub, str):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject",
        )
    return payload


async def get_id_token_payload(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> dict:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )
    try:
        return decode_cognito_id_token(creds.credentials)
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from None


async def get_current_user_sub(
    payload: Annotated[dict, Depends(get_id_token_payload)],
) -> str:
    return str(payload["sub"])
