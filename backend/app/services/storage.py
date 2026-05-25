import os
import uuid

import boto3
from botocore.client import Config

ALLOWED_CONTENT_TYPES: dict[str, str] = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
}

MAX_AVATAR_BYTES = int(os.environ.get("AVATAR_MAX_BYTES", "2097152"))


def _use_path_style() -> bool:
    return os.environ.get("S3_USE_PATH_STYLE", "").lower() in ("1", "true", "yes")


def _bucket() -> str:
    return os.environ.get("S3_BUCKET", "huddle-uploads")


def _public_base_url() -> str:
    base = os.environ.get("S3_PUBLIC_BASE_URL", "").rstrip("/")
    if not base:
        raise RuntimeError("S3_PUBLIC_BASE_URL is not set")
    return base


def _presign_endpoint() -> str | None:
    """Endpoint used when signing URLs the browser will call (must match Host header)."""
    public = os.environ.get("S3_PUBLIC_ENDPOINT", "").strip()
    if public:
        return public.rstrip("/")
    internal = os.environ.get("S3_ENDPOINT", "").strip()
    return internal.rstrip("/") if internal else None


def get_s3_client(*, endpoint_url: str | None = None):
    kwargs: dict = {
        "service_name": "s3",
        "region_name": os.environ.get("S3_REGION", "us-east-1"),
    }
    access_key = os.environ.get("S3_ACCESS_KEY")
    secret_key = os.environ.get("S3_SECRET_KEY")
    if access_key and secret_key:
        kwargs["aws_access_key_id"] = access_key
        kwargs["aws_secret_access_key"] = secret_key

    resolved_endpoint = endpoint_url if endpoint_url is not None else os.environ.get("S3_ENDPOINT")
    if resolved_endpoint:
        kwargs["endpoint_url"] = resolved_endpoint.rstrip("/")

    s3_config = Config(
        signature_version="s3v4",
        s3={"addressing_style": "path" if _use_path_style() else "auto"},
    )
    return boto3.client(**kwargs, config=s3_config)


def public_object_url(key: str) -> str:
    return f"{_public_base_url()}/{key}"


def validate_content_type(content_type: str) -> str:
    ct = content_type.strip().lower()
    if ct not in ALLOWED_CONTENT_TYPES:
        allowed = ", ".join(sorted(ALLOWED_CONTENT_TYPES))
        raise ValueError(f"Unsupported image type. Allowed: {allowed}")
    return ct


def avatar_object_key(*, user_sub: str | None, ext: str) -> str:
    uid = uuid.uuid4().hex
    if user_sub:
        return f"avatars/{user_sub}/{uid}.{ext}"
    return f"avatars/signup/{uid}.{ext}"


def create_avatar_presign(
    *,
    content_type: str,
    user_sub: str | None = None,
    content_length: int | None = None,
) -> dict:
    ct = validate_content_type(content_type)
    if content_length is not None and content_length > MAX_AVATAR_BYTES:
        mb = MAX_AVATAR_BYTES // (1024 * 1024)
        raise ValueError(f"Image must be at most {mb} MB")

    ext = ALLOWED_CONTENT_TYPES[ct]
    key = avatar_object_key(user_sub=user_sub, ext=ext)
    params: dict = {
        "Bucket": _bucket(),
        "Key": key,
        "ContentType": ct,
    }
    if content_length is not None:
        params["ContentLength"] = content_length

    presign_endpoint = _presign_endpoint()
    client = get_s3_client(endpoint_url=presign_endpoint)
    upload_url = client.generate_presigned_url(
        "put_object",
        Params=params,
        ExpiresIn=300,
    )

    return {
        "upload_url": upload_url,
        "public_url": public_object_url(key),
        "key": key,
        "content_type": ct,
        "max_bytes": MAX_AVATAR_BYTES,
    }
