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
    """Host the browser can reach (e.g. localhost:9000), not internal Docker DNS (minio:9000)."""
    public = os.environ.get("S3_PUBLIC_ENDPOINT", "").strip()
    if public and public.lower() not in ("none", "null"):
        return public.rstrip("/")
    internal = os.environ.get("S3_ENDPOINT", "").strip()
    if internal and internal.lower() not in ("none", "null"):
        return internal.rstrip("/")
    return None


def get_s3_client(*, endpoint_url: str | None = None):
    kwargs: dict = {
        "service_name": "s3",
        "region_name": os.environ.get("S3_REGION", "ap-south-1"),
    }

    access_key = os.environ.get("S3_ACCESS_KEY", "").strip()
    secret_key = os.environ.get("S3_SECRET_KEY", "").strip()
    if access_key and secret_key:
        kwargs["aws_access_key_id"] = access_key
        kwargs["aws_secret_access_key"] = secret_key

    resolved = endpoint_url
    if resolved is None:
        internal = os.environ.get("S3_ENDPOINT", "").strip()
        if internal and internal.lower() not in ("none", "null"):
            resolved = internal.rstrip("/")
    if resolved:
        kwargs["endpoint_url"] = resolved

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