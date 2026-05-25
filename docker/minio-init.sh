#!/bin/sh
set -e

BUCKET="${S3_BUCKET:-huddle-uploads}"

mc alias set local http://minio:9000 "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}"
mc mb --ignore-existing "local/${BUCKET}"
mc anonymous set download "local/${BUCKET}/avatars"
echo "MinIO bucket ${BUCKET} ready (public read on avatars/)"
