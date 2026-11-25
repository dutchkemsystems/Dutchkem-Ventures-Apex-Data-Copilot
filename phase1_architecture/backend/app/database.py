from __future__ import annotations

import os
from collections.abc import AsyncGenerator
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://apex_app:change_me@localhost:5432/apex_copilot",
)

engine: AsyncEngine = create_async_engine(
    DATABASE_URL,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def open_tenant_session(
    org_id: UUID,
    user_id: UUID,
    role: str,
) -> AsyncGenerator[AsyncSession, None]:
    """
    Open a transaction-scoped AsyncSession and bind PostgreSQL session variables
    consumed by Row-Level Security policies via SET LOCAL.

    Using SET LOCAL guarantees settings cannot leak across pooled connections
    once the transaction commits or rolls back.
    """
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await session.execute(
                text("SELECT set_config('app.current_org_id', :org_id, true)"),
                {"org_id": str(org_id)},
            )
            await session.execute(
                text("SELECT set_config('app.current_user_id', :user_id, true)"),
                {"user_id": str(user_id)},
            )
            await session.execute(
                text("SELECT set_config('app.current_user_role', :role, true)"),
                {"role": role},
            )
            yield session
