import hashlib
import json
import os
import secrets
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import HTTPException, Request, Response, status

USER_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60  # 604,800s (7 days)
USER_SESSION_COOKIE_NAME = "apex_user_session"


class UpstashRedisSessionManager:
    def __init__(self) -> None:
        self.redis_url = os.getenv("UPSTASH_REDIS_REST_URL", "").strip().rstrip("/")
        self.redis_token = os.getenv("UPSTASH_REDIS_REST_TOKEN", "").strip()

    @staticmethod
    def _hash_sid(session_id: str) -> str:
        return hashlib.sha256(session_id.encode("utf-8")).hexdigest()

    def _headers(self) -> dict[str, str]:
        if not self.redis_url or not self.redis_token:
            raise RuntimeError("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured.")
        return {"Authorization": f"Bearer {self.redis_token}"}

    async def ping(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=2.5) as client:
                res = await client.get(f"{self.redis_url}/ping", headers=self._headers())
                return res.status_code == 200
        except Exception:
            return False

    async def create_session(
        self,
        *,
        user_id: str,
        org_id: str,
        role: str,
        response: Optional[Response] = None,
    ) -> str:
        session_id = secrets.token_urlsafe(32)
        key = f"session:user:{self._hash_sid(session_id)}"
        payload = json.dumps(
            {
                "user_id": user_id,
                "org_id": org_id,
                "role": role,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        async with httpx.AsyncClient(timeout=3.0) as client:
            res = await client.post(
                f"{self.redis_url}/set/{key}/{payload}/EX/{USER_SESSION_TTL_SECONDS}",
                headers=self._headers(),
            )
            res.raise_for_status()

        if response is not None:
            response.set_cookie(
                key=USER_SESSION_COOKIE_NAME,
                value=session_id,
                max_age=USER_SESSION_TTL_SECONDS,
                httponly=True,
                secure=True,
                samesite="lax",
                path="/",
            )
        return session_id

    async def verify_session(self, request: Request) -> dict:
        session_id = request.cookies.get(USER_SESSION_COOKIE_NAME)
        if not session_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing session cookie.")
        key = f"session:user:{self._hash_sid(session_id)}"
        async with httpx.AsyncClient(timeout=2.5) as client:
            res = await client.get(f"{self.redis_url}/get/{key}", headers=self._headers())
            res.raise_for_status()
            raw = res.json().get("result")
            if not raw:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired or revoked.")
            # Sliding 7-day refresh so active sessions survive rolling deploys indefinitely
            await client.post(
                f"{self.redis_url}/expire/{key}/{USER_SESSION_TTL_SECONDS}",
                headers=self._headers(),
            )
            return json.loads(raw)

    async def revoke_session(self, session_id: str) -> None:
        if not session_id:
            return
        key = f"session:user:{self._hash_sid(session_id)}"
        async with httpx.AsyncClient(timeout=2.5) as client:
            await client.post(f"{self.redis_url}/del/{key}", headers=self._headers())
