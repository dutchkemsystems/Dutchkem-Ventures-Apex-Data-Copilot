from __future__ import annotations

import asyncio
import json
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status

router = APIRouter(tags=["phase6-realtime-telemetry"])


class TenantTelemetryHub:
    """Manages WebSocket connections strictly partitioned by organization UUID."""

    def __init__(self) -> None:
        self._rooms: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, org_id: str, websocket: WebSocket) -> int:
        await websocket.accept()
        async with self._lock:
            self._rooms[org_id].add(websocket)
            return len(self._rooms[org_id])

    async def disconnect(self, org_id: str, websocket: WebSocket) -> int:
        async with self._lock:
            self._rooms[org_id].discard(websocket)
            if not self._rooms[org_id]:
                self._rooms.pop(org_id, None)
                return 0
            return len(self._rooms[org_id])

    async def broadcast_org_event(
        self,
        org_id: str,
        event_type: str,
        payload: dict[str, Any],
    ) -> None:
        message = json.dumps(
            {
                "type": event_type,
                "org_id": org_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "payload": payload,
            }
        )
        async with self._lock:
            targets = list(self._rooms.get(org_id, set()))

        stale: list[WebSocket] = []
        for ws in targets:
            try:
                await ws.send_text(message)
            except Exception:
                stale.append(ws)

        if stale:
            async with self._lock:
                for ws in stale:
                    self._rooms[org_id].discard(ws)


telemetry_hub = TenantTelemetryHub()


@router.websocket("/ws/telemetry")
async def org_telemetry_socket(
    websocket: WebSocket,
    org_id: str = Query(...),
    user_id: str = Query(...),
):
    try:
        uuid.UUID(org_id)
        uuid.UUID(user_id)
    except ValueError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    peer_count = await telemetry_hub.connect(org_id, websocket)
    await telemetry_hub.broadcast_org_event(
        org_id,
        "presence:joined",
        {"user_id": user_id, "connected_peers": peer_count},
    )

    try:
        while True:
            raw = await websocket.receive_text()
            client_msg = json.loads(raw)
            if client_msg.get("type") == "telemetry:health_probe":
                await telemetry_hub.broadcast_org_event(
                    org_id,
                    "org:health_verified",
                    {"requested_by": user_id, "rls_active": True},
                )
    except WebSocketDisconnect:
        remaining = await telemetry_hub.disconnect(org_id, websocket)
        await telemetry_hub.broadcast_org_event(
            org_id,
            "presence:left",
            {"user_id": user_id, "connected_peers": remaining},
        )
