"""Limits on model calls inside this process.

`llm_slot()` wraps every model call (all providers, jobs and chat alike): at most
LLM_MAX_CONCURRENCY calls run at once, the rest wait their turn. This keeps a burst of jobs
(for example "Prepare all topics now") under the account's rate limit instead of failing
part of it with 429s.

`topic_lock(topic_id)` serialises the work done for one topic: two jobs for the same topic
(notes, then examples, then a quiz, or a regeneration started during another job) run one at
a time, in the order they ask. Besides being gentler on the rate limit, it means the second
job starts after the first has stored its content.
"""
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator, Dict, Optional, Tuple

from app.config import settings

logger = logging.getLogger(__name__)

_semaphore: Optional[Tuple[asyncio.AbstractEventLoop, int, asyncio.Semaphore]] = None


def _current_semaphore() -> asyncio.Semaphore:
    """The process-wide semaphore. It belongs to one event loop and one limit; a different loop
    (tests start a new one each) or a changed LLM_MAX_CONCURRENCY gets a fresh one."""
    global _semaphore
    loop = asyncio.get_running_loop()
    limit = max(1, settings.LLM_MAX_CONCURRENCY)
    if _semaphore is None or _semaphore[0] is not loop or _semaphore[1] != limit:
        _semaphore = (loop, limit, asyncio.Semaphore(limit))
    return _semaphore[2]


@asynccontextmanager
async def llm_slot() -> AsyncIterator[None]:
    """Hold one of the LLM_MAX_CONCURRENCY slots for the length of a model call."""
    async with _current_semaphore():
        yield


class KeyedLocks:
    """One asyncio lock per key, created on demand and dropped once nobody holds or awaits it."""

    def __init__(self) -> None:
        self._locks: Dict[str, Tuple[asyncio.Lock, int]] = {}

    @asynccontextmanager
    async def hold(self, key: str) -> AsyncIterator[None]:
        lock, users = self._locks.get(key, (None, 0))
        if lock is None:
            lock = asyncio.Lock()
        self._locks[key] = (lock, users + 1)
        try:
            async with lock:
                yield
        finally:
            lock, users = self._locks[key]
            if users <= 1:
                del self._locks[key]
            else:
                self._locks[key] = (lock, users - 1)

    def __len__(self) -> int:
        return len(self._locks)


_topic_locks = KeyedLocks()


def topic_lock(topic_id: str):
    """Async context manager: jobs for the same topic run one at a time."""
    return _topic_locks.hold(topic_id)
