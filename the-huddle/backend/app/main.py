import logging
import os

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

from app.db import init_schema
from app.healthcheck import build_health_payload, set_schema_init_status
from app.routers import friends, group_polls, group_tab, group_vault, groups, me

logger = logging.getLogger(__name__)

app = FastAPI(title=os.environ.get("APP_NAME", "The Huddle API"))

_origins = os.environ.get("CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(me.router)
app.include_router(friends.router)
app.include_router(groups.router)
app.include_router(group_polls.router)
app.include_router(group_tab.router)
app.include_router(group_vault.router)


@app.on_event("startup")
def _startup() -> None:
    try:
        init_schema()
        set_schema_init_status(True)
    except Exception:
        logger.exception("init_schema failed on startup; process stays up for /health diagnostics")
        set_schema_init_status(False)


@app.get("/health")
@app.get("/api/health")
def health(response: Response) -> dict:
    payload, ok = build_health_payload()
    response.status_code = 200 if ok else 503
    return payload
