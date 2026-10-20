"""Re-embed every stored chunk with the configured embedding provider.

Run after changing EMBEDDING_MODEL, after a change to what is embedded (the heading-prefixed
text from `embedding_text`), and after migration 20261022000000_retrieval_indexes, which sets
the vectors of chunks embedded by the old 1536-number OpenAI provider to NULL. Vectors from
different models cannot be compared, so search quality drops until every chunk uses the
current one. The model must produce EMBEDDING_DIMENSIONS (384) numbers: the column is
vector(384).

    cd ai-service && uv run python scripts/reembed_chunks.py [--batch-size 128] [--dry-run]
"""
import argparse
import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncpg  # noqa: E402

from app.config import settings  # noqa: E402
from app.services.embeddings.generator import (  # noqa: E402
    embedding_text,
    generate_embeddings,
    get_embedder,
)


def _vector_literal(values: list[float]) -> str:
    return "[" + ",".join(repr(float(v)) for v in values) + "]"


async def main(batch_size: int, dry_run: bool) -> None:
    conn = await asyncpg.connect(settings.DATABASE_URL)
    try:
        total = await conn.fetchval("SELECT COUNT(*) FROM material_chunks")
        print(f"{total} chunks; embedding with {get_embedder().name}")
        if dry_run:
            return

        done = 0
        last_id = ""
        started = time.monotonic()
        while True:
            rows = await conn.fetch(
                "SELECT id, chunk_text, section_hierarchy FROM material_chunks "
                "WHERE id > $1 ORDER BY id LIMIT $2",
                last_id,
                batch_size,
            )
            if not rows:
                break
            vectors = await generate_embeddings(
                [embedding_text(row["section_hierarchy"], row["chunk_text"]) for row in rows]
            )
            await conn.executemany(
                "UPDATE material_chunks SET chunk_embedding = $2::vector WHERE id = $1",
                [(row["id"], _vector_literal(vector)) for row, vector in zip(rows, vectors)],
            )
            done += len(rows)
            last_id = rows[-1]["id"]
            print(f"{done}/{total} ({time.monotonic() - started:.0f}s)")
    finally:
        await conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--dry-run", action="store_true", help="count chunks and exit")
    args = parser.parse_args()
    asyncio.run(main(args.batch_size, args.dry_run))
