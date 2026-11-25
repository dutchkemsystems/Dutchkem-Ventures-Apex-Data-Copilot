import os
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .redis_session import USER_SESSION_TTL_SECONDS, UpstashRedisSessionManager

router = APIRouter(tags=["Zero-Downtime Health"])
PROCESS_STARTED_AT = time.monotonic()
IS_DRAINING = False


def mark_container_draining() -> None:
    global IS_DRAINING
    IS_DRAINING = True


@router.get("/api/health")
async def health_check(response: Response, db: AsyncSession = Depends(...)):
    db_ok = False
    try:
        await db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    redis_mgr = UpstashRedisSessionManager()
    redis_ok = await redis_mgr.ping()
    ai_ok = bool(os.getenv("GEMINI_API_KEY", "").strip() or os.getenv("OPENAI_API_KEY", "").strip())

    all_healthy = (not IS_DRAINING) and db_ok and redis_ok and ai_ok
    response.status_code = status.HTTP_200_OK if all_healthy else status.HTTP_503_SERVICE_UNAVAILABLE
    response.headers["Cache-Control"] = "no-store, max-age=0"

    return {
        "status": "draining" if IS_DRAINING else ("healthy" if all_healthy else "degraded"),
        "plane": "backend",
        "zero_downtime_ready": all_healthy,
        "uptime_seconds": int(time.monotonic() - PROCESS_STARTED_AT),
        "drain_seconds_before_old_stop": 30,
        "checks": {
            "database": "healthy" if db_ok else "unhealthy",
            "redis": {
                "status": "healthy" if redis_ok else "unhealthy",
                "ttl_seconds": USER_SESSION_TTL_SECONDS,
            },
            "ai_providers": "healthy" if ai_ok else "unconfigured",
        },
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
