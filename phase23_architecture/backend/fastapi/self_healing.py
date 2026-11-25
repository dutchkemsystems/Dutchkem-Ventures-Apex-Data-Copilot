"""
Phase 23E Reference: FastAPI Self-Healing Circuit Breakers (Kora Pay, OpenAI, Redis),
Sentry 5xx Escalation (>10 errors/min -> PagerDuty/Slack), & Graceful Degradation.
"""
from __future__ import annotations
import os
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Callable

FAILURE_THRESHOLD = 5
ERRORS_PER_MIN_PAGERDUTY = 10


@dataclass
class ProviderBreaker:
    provider: str
    consecutive_failures: int = 0
    is_open: bool = False
    opened_at: float | None = None

    def record_success(self) -> None:
        self.consecutive_failures = 0
        self.is_open = False
        self.opened_at = None

    def record_failure(self) -> bool:
        self.consecutive_failures += 1
        if self.consecutive_failures >= FAILURE_THRESHOLD:
            self.is_open = True
            self.opened_at = time.time()
            return True
        return False


@dataclass
class FastApiSelfHealingRegistry:
    breakers: dict[str, ProviderBreaker] = field(
        default_factory=lambda: {
            "kora_pay": ProviderBreaker("kora_pay"),
            "openai": ProviderBreaker("openai"),
            "redis": ProviderBreaker("redis"),
        }
    )
    error_timestamps: deque[float] = field(default_factory=deque)
    ai_retry_queue: list[dict[str, Any]] = field(default_factory=list)
    db_cache: dict[str, Any] = field(default_factory=dict)

    def record_5xx_error(self, route: str, message: str) -> dict[str, Any]:
        now = time.time()
        self.error_timestamps.append(now)
        while self.error_timestamps and self.error_timestamps[0] < now - 60:
            self.error_timestamps.popleft()
        escalate_pagerduty = len(self.error_timestamps) > ERRORS_PER_MIN_PAGERDUTY
        return {
            "sentry_dsn_configured": bool(os.getenv("SENTRY_DSN")),
            "route": route,
            "message": message,
            "errors_last_minute": len(self.error_timestamps),
            "escalated_pagerduty": escalate_pagerduty,
        }

    def run_with_db_fallback(self, cache_key: str, query_fn: Callable[[], Any], max_ms: int = 500) -> Any:
        start = time.monotonic()
        try:
            result = query_fn()
            elapsed_ms = (time.monotonic() - start) * 1000
            self.db_cache[cache_key] = result
            if elapsed_ms > max_ms and cache_key in self.db_cache:
                return self.db_cache[cache_key]
            return result
        except Exception:
            if cache_key in self.db_cache:
                return self.db_cache[cache_key]
            raise
