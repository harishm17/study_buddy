"""Database connection utilities."""
import asyncpg
from app.config import settings

_pool: asyncpg.Pool | None = None


async def get_db_pool() -> asyncpg.Pool:
    """Get or create database connection pool."""
    global _pool

    if _pool is None:
        _pool = await asyncpg.create_pool(
            settings.DATABASE_URL,
            min_size=2,
            max_size=10,
        )

    return _pool


async def close_db_pool():
    """Close database connection pool."""
    global _pool

    if _pool is not None:
        await _pool.close()
        _pool = None


async def execute_query(query: str, *args):
    """Execute a database query."""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetch(query, *args)


async def execute_one(query: str, *args):
    """Execute a query and return one result."""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetchrow(query, *args)


async def execute_update(query: str, *args):
    """Execute an update/insert query."""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.execute(query, *args)


async def execute_in_transaction(operations):
    """
    Execute multiple database operations in a transaction.

    Args:
        operations: Async function that takes a connection and performs operations

    Returns:
        Result of the operations function

    Example:
        async def insert_chunks(conn):
            for chunk in chunks:
                await conn.execute("INSERT INTO ...", ...)
            return len(chunks)

        result = await execute_in_transaction(insert_chunks)
    """
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            return await operations(conn)
