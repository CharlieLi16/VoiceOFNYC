from __future__ import annotations

import asyncio
from typing import Set

from fastapi import WebSocket


class DisplayHub:
    def __init__(self) -> None:
        self._clients: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._clients.add(ws)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(ws)

    async def broadcast(self, text: str) -> None:
        async with self._lock:
            dead: list[WebSocket] = []
            for client in self._clients:
                try:
                    await client.send_text(text)
                except Exception:
                    dead.append(client)
            for d in dead:
                self._clients.discard(d)


hub = DisplayHub()
