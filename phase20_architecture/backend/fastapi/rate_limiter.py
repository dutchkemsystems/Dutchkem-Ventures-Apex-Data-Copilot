"""
Phase 20C: Upstash Redis Rate Limiter & Daily LLM Cost Circuit Breaker (FastAPI Middleware)

Enforces:
1. B2B API Gateway (/api/v1/qa/*): 1,000 requests/hour per API key.
2. QA Agent Uploads (/api/qa/*): Tiered hourly limits (e.g. max 50 uploads/hour for Pro users).
3. Daily Cost Circuit Breaker: Automatically pauses QA Agents and returns HTTP 503 with a
   user-friendly "High Traffic" message if daily Gemini/OpenAI spend hits AI_DAILY_COST_LIMIT_USD ($100/day).
"""

from __future__ import annotations

import hashlib
import os
import time
from datetime import datetime, timezone
from typing import Callable, Optional

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from upstash_redis.asyncio import Redis

UPSTASH_REDIS_REST_URL = os.getenv("UPSTASH_REDIS_REST_URL", "")
UPSTASH_REDIS_REST_TOKEN = os.getenv("UPSTASH_REDIS_REST_TOKEN", "")
AI_DAILY_COST_LIMIT_USD = float(os.getenv("AI_DAILY_COST_LIMIT_USD", "100.0"))

B2B_HOURLY_LIMIT = int(os.getenv("RATE_LIMIT_B2B_HOURLY", "1000"))
QA_TIER_HOURLY_LIMITS: dict[str, int] = {
    "trial": 10,
    "starter": 20,
    "pro": 50,
    "agency": 250,
    "growth": 250,
    "enterprise_whitelabel": 1000,
}

# Lua sliding-window counter script executed atomically on Upstash Redis
_SLIDING_WINDOW_LUA = """
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("EXPIRE", KEYS[1], tonumber(ARGV[1]))
end
local ttl = redis.call("TTL", KEYS[1])
return {current, ttl}
"""


def get_upstash_client() -> Optional[Redis]:
    if not UPSTASH_REDIS_REST_URL or not UPSTASH_REDIS_REST_TOKEN:
        return None
    if "MY_UPSTASH" in UPSTASH_REDIS_REST_URL or "MY_UPSTASH" in UPSTASH_REDIS_REST_TOKEN:
        return None
    return Redis(url=UPSTASH_REDIS_REST_URL, token=UPSTASH_REDIS_REST_TOKEN)


def _current_hour_bucket() -> int:
    return int(time.time() // 3600)


def _today_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def check_hourly_rate_limit(
    redis: Optional[Redis],
    scope: str,
    identifier: str,
    limit: int,
) -> tuple[bool, int, int, int]:
    """
    Returns (allowed, count, remaining, reset_seconds).
    Falls back cleanly only in isolated local unit tests when Upstash env vars are unset.
    """
    hour_bucket = _current_hour_bucket()
    window_end = (hour_bucket + 1) * 3600
    reset_seconds = max(1, window_end - int(time.time()))
    key = f"rl:{scope}:{identifier}:{hour_bucket}"

    if redis is None:
        return True, 1, max(0, limit - 1), reset_seconds

    result = await redis.eval(_SLIDING_WINDOW_LUA, keys=[key], args=["3600"])
    count = int(result[0]) if isinstance(result, (list, tuple)) else int(result)
    ttl = int(result[1]) if isinstance(result, (list, tuple)) and len(result) > 1 else reset_seconds
    allowed = count <= limit
    remaining = max(0, limit - count)
    return allowed, count, remaining, max(1, ttl)


async def is_ai_circuit_breaker_open(redis: Optional[Redis]) -> tuple[bool, float, float]:
    """Checks daily OpenAI/Gemini spend against AI_DAILY_COST_LIMIT_USD ($100/day default)."""
    if redis is None:
        return False, 0.0, AI_DAILY_COST_LIMIT_USD
    today = _today_utc()
    cost_raw, manual_pause = await redis.mget(
        f"ai:cost:daily:{today}",
        "ai:circuit:manual_pause",
    )
    spend = float(cost_raw) if cost_raw is not None else 0.0
    tripped = (manual_pause == "1") or (spend >= AI_DAILY_COST_LIMIT_USD)
    return tripped, spend, AI_DAILY_COST_LIMIT_USD


async def record_ai_api_cost(redis: Optional[Redis], cost_usd: float) -> tuple[float, bool]:
    """Increments daily Gemini/OpenAI spend in Upstash Redis and trips circuit if >= daily limit."""
    if redis is None or cost_usd <= 0:
        return 0.0, False
    today = _today_utc()
    key = f"ai:cost:daily:{today}"
    new_total = float(await redis.incrbyfloat(key, round(cost_usd, 6)))
    await redis.expire(key, 172800)  # retain 48h for audit reconciliation
    tripped = new_total >= AI_DAILY_COST_LIMIT_USD
    if tripped:
        await redis.set("ai:circuit:tripped", "1", ex=86400)
    return new_total, tripped


class UpstashRateLimitAndCostMiddleware(BaseHTTPMiddleware):
    """
    Middleware protecting:
    - /api/v1/qa/*  -> 1,000 requests/hour per API key + daily cost circuit breaker
    - /api/qa/*     -> Tier-based hourly QA upload quota (Pro = 50/hr) + daily cost circuit breaker
    """

    def __init__(self, app):
        super().__init__(app)
        self.redis = get_upstash_client()

    async def dispatch(self, request: Request, call_next: Callable[[Request], Response]) -> Response:
        path = request.url.path
        is_b2b_qa = path.startswith("/api/v1/qa")
        is_user_qa = path.startswith("/api/qa")

        if not (is_b2b_qa or is_user_qa) or request.method != "POST":
            return await call_next(request)

        # 1. Circuit Breaker Check (prevents runaway Gemini/OpenAI bill)
        tripped, spend_usd, limit_usd = await is_ai_circuit_breaker_open(self.redis)
        if tripped:
            return JSONResponse(
                status_code=503,
                headers={"Retry-After": "900"},
                content={
                    "error": "HIGH_TRAFFIC_CIRCUIT_OPEN",
                    "code": "CIRCUIT_BREAKER_OPEN",
                    "detail": (
                        "High Traffic: Our automated QA agents are currently paused due to heavy "
                        "platform volume. Existing work is safely queued—please retry shortly."
                    ),
                    "dailyLimitUsd": limit_usd,
                    "dailySpendUsd": round(spend_usd, 2),
                },
            )

        # 2. Upstash Redis Rate Limiting
        if is_b2b_qa:
            raw_auth = request.headers.get("authorization") or request.headers.get("x-api-key") or ""
            api_key_token = raw_auth.replace("Bearer ", "").strip() or (
                request.client.host if request.client else "anonymous"
            )
            key_hash = hashlib.sha256(api_key_token.encode()).hexdigest()[:24]
            limit = B2B_HOURLY_LIMIT
            allowed, count, remaining, reset_sec = await check_hourly_rate_limit(
                self.redis, "b2b_api_gateway", key_hash, limit
            )
            rate_msg = f"B2B API Gateway hourly limit reached ({limit} requests/hour per API key)."
        else:
            tier = (request.headers.get("x-subscription-tier") or "pro").lower()
            user_id = request.headers.get("x-user-id") or (
                request.client.host if request.client else "anonymous"
            )
            limit = QA_TIER_HOURLY_LIMITS.get(tier, 50)
            allowed, count, remaining, reset_sec = await check_hourly_rate_limit(
                self.redis, "qa_agent_upload", user_id, limit
            )
            rate_msg = (
                f"QA Agent hourly quota exceeded for {tier.upper()} plan "
                f"(max {limit} uploads/hour)."
            )

        rl_headers = {
            "X-RateLimit-Limit": str(limit),
            "X-RateLimit-Remaining": str(remaining),
            "X-RateLimit-Reset": str(reset_sec),
        }

        if not allowed:
            return JSONResponse(
                status_code=429,
                headers={**rl_headers, "Retry-After": str(reset_sec)},
                content={
                    "error": "RATE_LIMIT_EXCEEDED",
                    "code": "RATE_LIMIT_EXCEEDED",
                    "detail": rate_msg,
                    "limitPerHour": limit,
                    "countInWindow": count,
                    "retryAfterSeconds": reset_sec,
                },
            )

        response = await call_next(request)
        for k, v in rl_headers.items():
            response.headers[k] = v
        return response
