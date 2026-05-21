"""Aggregated readiness checks for deploy debugging (no secrets in responses)."""

from __future__ import annotations

import logging
import re
import time
from typing import Any

import psycopg

from app.db import connection_params, conninfo

logger = logging.getLogger(__name__)

_schema_init_ok: bool | None = None


def set_schema_init_status(ok: bool) -> None:
    global _schema_init_ok
    _schema_init_ok = ok


def _safe_error_message(exc: BaseException) -> str:
    msg = str(exc).strip() or exc.__class__.__name__
    # Avoid echoing connection keywords that might appear in driver errors
    msg = re.sub(r"(password|secret)[=:]\s*\S+", r"\1=(redacted)", msg, flags=re.I)
    return msg[:500]


def build_health_payload() -> tuple[dict[str, Any], bool]:
    import os

    checks: dict[str, Any] = {}
    all_ok = True

    app_env = os.environ.get("APP_ENV", "(unset)")
    checks["config"] = {
        "app_env": app_env,
        "aws_region": os.environ.get("AWS_REGION")
        or os.environ.get("AWS_DEFAULT_REGION")
        or "(unset)",
        "db_secret_name": os.environ.get("DB_SECRET_NAME", "huddle/prod/db-credentials")
        if app_env == "production"
        else None,
        "db_host_env_set": bool(os.environ.get("DB_HOST")),
    }

    if _schema_init_ok is False:
        checks["schema_init"] = {
            "ok": False,
            "detail": "init_schema() failed on startup; see server logs.",
        }
        all_ok = False
    elif _schema_init_ok is True:
        checks["schema_init"] = {"ok": True}
    else:
        checks["schema_init"] = {"ok": None, "detail": "not reported yet"}

    t0 = time.perf_counter()
    try:
        params = connection_params()
        resolve_ms = round((time.perf_counter() - t0) * 1000, 2)
        t1 = time.perf_counter()
        with psycopg.connect(conninfo(), connect_timeout=8) as conn:
            conn.execute("SELECT 1 AS ok")
        query_ms = round((time.perf_counter() - t1) * 1000, 2)
        checks["database"] = {
            "ok": True,
            "resolve_credentials_ms": resolve_ms,
            "connect_and_query_ms": query_ms,
            "host": params["host"],
            "port": params["port"],
            "dbname": params["dbname"],
            "sslmode": params["sslmode"],
            "db_user": params["user"],
        }
    except Exception as exc:
        all_ok = False
        logger.warning("health database check failed: %s", exc, exc_info=False)
        checks["database"] = {
            "ok": False,
            "error": _safe_error_message(exc),
            "error_type": type(exc).__name__,
        }

    status = "healthy" if all_ok else "unhealthy"
    return {"status": status, "checks": checks}, all_ok
