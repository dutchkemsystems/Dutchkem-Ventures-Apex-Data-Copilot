from __future__ import annotations

import os
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Callable
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.database import open_tenant_session
from app.models import UserRole

JWT_SECRET = os.getenv("JWT_SECRET", "replace-in-production")
JWT_ALGORITHM = "HS256"


@dataclass(frozen=True, slots=True)
class TenantContext:
    org_id: UUID
    user_id: UUID
    role: UserRole


_tenant_ctx_var: ContextVar[TenantContext | None] = ContextVar(
    "tenant_context", default=None
)


def get_current_tenant_context() -> TenantContext:
    ctx = _tenant_ctx_var.get()
    if ctx is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing verified tenant context.",
        )
    return ctx


class TenantIsolationMiddleware(BaseHTTPMiddleware):
    """
    Extracts verified JWT tenant claims (org_id, user_id, role) from the
    Authorization Bearer token and binds them to an async ContextVar for the
    duration of the HTTP request.
    """

    EXEMPT_PATHS = {"/health", "/ready", "/api/v1/auth/login", "/docs", "/openapi.json"}

    async def dispatch(self, request: Request, call_next):
        if request.url.path in self.EXEMPT_PATHS or request.method == "OPTIONS":
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Authorization Bearer token required."},
            )

        token = auth_header.removeprefix("Bearer ").strip()
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            ctx = TenantContext(
                org_id=UUID(payload["org_id"]),
                user_id=UUID(payload["sub"]),
                role=UserRole(payload["role"]),
            )
        except (jwt.PyJWTError, KeyError, ValueError) as exc:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": f"Invalid tenant token: {exc}"},
            )

        request.state.tenant = ctx
        token_handle = _tenant_ctx_var.set(ctx)
        try:
            return await call_next(request)
        finally:
            _tenant_ctx_var.reset(token_handle)


async def get_tenant_db(
    ctx: TenantContext = Depends(get_current_tenant_context),
):
    """FastAPI dependency yielding an RLS-scoped AsyncSession."""
    async for session in open_tenant_session(
        org_id=ctx.org_id,
        user_id=ctx.user_id,
        role=ctx.role.value,
    ):
        yield session


def require_roles(*allowed_roles: UserRole) -> Callable[[TenantContext], TenantContext]:
    """RBAC route dependency enforcing admin / annotator / client boundaries."""

    def _checker(
        ctx: TenantContext = Depends(get_current_tenant_context),
    ) -> TenantContext:
        if ctx.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{ctx.role.value}' is not authorized for this resource.",
            )
        return ctx

    return _checker
