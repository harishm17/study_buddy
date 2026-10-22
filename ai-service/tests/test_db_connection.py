from app.db.connection import asyncpg_dsn


def test_prisma_only_parameters_are_removed():
    url = "postgresql://dev:devpass@localhost:5432/margins?schema=public"
    assert asyncpg_dsn(url) == "postgresql://dev:devpass@localhost:5432/margins"


def test_other_parameters_are_kept():
    url = "postgresql://dev:devpass@db:5432/margins?sslmode=require&schema=public&connection_limit=5"
    assert asyncpg_dsn(url) == "postgresql://dev:devpass@db:5432/margins?sslmode=require"


def test_a_plain_url_is_unchanged():
    url = "postgresql://dev:devpass@localhost:5432/margins"
    assert asyncpg_dsn(url) == url
