"""Ingest code shared by the evals: chunk and embed documents with the app's own code and
store them as one synthetic user, project and set of materials in an eval database.

Used by evals/retrieval/run_eval.py and evals/generation/run_eval.py. Nothing here knows what
the documents are for. Callers describe each document (`IngestDocument`) and get stored chunks
back. Set DATABASE_URL and put `ai-service/` on `sys.path` before calling anything that touches
the database (see `prepare_app_environment`).

Rows are written with the same SQL shape as the chunk job in jobs.py. Chunk ids are fixed
(`<material id>-<index>`), so runs are reproducible and tie order is stable.
"""
import asyncio
import hashlib
import inspect
import json
import logging
import os
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List
from urllib.parse import urlparse

EVALS_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = EVALS_DIR.parent
AI_SERVICE_DIR = REPO_ROOT / "ai-service"


@dataclass
class IngestDocument:
    """One file to ingest.

    `fingerprint_inputs` is everything outside the app's code that decides what the stored
    chunks look like (for example the source checksum). It goes into the document's
    fingerprint, together with the chunker and embedder fingerprints, so stored chunks are
    reused only while all of it is unchanged.
    """

    id: str
    path: Path
    filename: str
    category: str
    fingerprint_inputs: Dict[str, Any] = field(default_factory=dict)
    missing_hint: str = ""

    @property
    def material_id(self) -> str:
        return f"eval-material-{self.id}"


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git(*args: str) -> str:
    try:
        return subprocess.run(
            ["git", "-C", str(REPO_ROOT), *args], capture_output=True, text=True, check=True
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return ""


def check_db_name(url: str, allow_any: bool) -> str:
    name = urlparse(url).path.lstrip("/")
    if "eval" not in name.lower() and not allow_any:
        raise SystemExit(
            f"Refusing to write to database '{name}': the name does not contain 'eval'. "
            "The harness inserts a synthetic user, project and materials. Pass --allow-any-db to override."
        )
    return name


def prepare_app_environment(db_url: str) -> None:
    """Point the app's config at the eval database and make `app` importable.

    app.config reads DATABASE_URL when it is first imported, so call this before any app import.
    """
    os.environ["DATABASE_URL"] = db_url
    os.environ.setdefault("EMBEDDING_PROVIDER", "local")
    if str(AI_SERVICE_DIR) not in sys.path:
        sys.path.insert(0, str(AI_SERVICE_DIR))
    logging.basicConfig(level=logging.WARNING)


def chunker_fingerprint() -> str:
    """Changes when the code that decides chunk boundaries changes."""
    parts = []
    for name in ("chunker.py", "extractors.py"):
        path = AI_SERVICE_DIR / "app" / "services" / "document_processor" / name
        parts.append(file_sha256(path))
    return sha256_text("|".join(parts))


def structure_fingerprint(chunks: List[dict]) -> str:
    """Hash of the section path of every chunk, in order (not the text)."""
    lines = [f"{c['chunk_index']}|{c['section_hierarchy'] or ''}" for c in chunks]
    return sha256_text("\n".join(lines))


def embedder_fingerprint() -> str:
    """Provider, model and the text that is embedded (heading path + text)."""
    from app.config import settings
    from app.services.embeddings.generator import embedding_text

    return (
        f"{settings.EMBEDDING_PROVIDER}:{settings.EMBEDDING_MODEL}:"
        f"{sha256_text(inspect.getsource(embedding_text))[:12]}"
    )


async def ingest_documents(
    *,
    project_id: str,
    user_id: str,
    project_name: str,
    user_email: str,
    user_name: str,
    documents: List[IngestDocument],
    rebuild: bool,
) -> None:
    """Chunk, embed and store every document. Unchanged documents are reused.

    Materials of the project that are not in `documents` are removed.
    """
    from app.db.connection import execute_in_transaction, execute_query, execute_update
    from app.services.document_processor.chunker import chunk_document
    from app.services.embeddings.generator import embedding_text, generate_embeddings

    await execute_update(
        """
        INSERT INTO users (id, email, name, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (id) DO NOTHING
        """,
        user_id,
        user_email,
        user_name,
    )
    await execute_update(
        """
        INSERT INTO projects (id, user_id, name, status, updated_at)
        VALUES ($1, $2, $3, 'topics_pending', NOW())
        ON CONFLICT (id) DO NOTHING
        """,
        project_id,
        user_id,
        project_name,
    )

    await execute_update(
        "DELETE FROM materials WHERE project_id = $1 AND id <> ALL($2::text[])",
        project_id,
        [d.material_id for d in documents],
    )

    chunker_hash = chunker_fingerprint()
    # What is embedded (heading path + text) is part of the fingerprint: a change to
    # `embedding_text` makes stored vectors stale.
    embedder = embedder_fingerprint()
    for document in documents:
        material_id = document.material_id
        path = document.path
        if not path.exists():
            raise SystemExit(f"{path} is missing. {document.missing_hint}".strip())
        fingerprint = sha256_text(
            json.dumps(
                {**document.fingerprint_inputs, "chunker": chunker_hash, "embedder": embedder},
                sort_keys=True,
            )
        )

        existing = await execute_query(
            """
            SELECT m.metadata, (SELECT COUNT(*) FROM material_chunks WHERE material_id = m.id) AS chunk_count
            FROM materials m WHERE m.id = $1
            """,
            material_id,
        )
        reuse = False
        if existing and not rebuild:
            metadata = existing[0]["metadata"]
            metadata = json.loads(metadata) if isinstance(metadata, str) else (metadata or {})
            reuse = metadata.get("eval_fingerprint") == fingerprint and existing[0]["chunk_count"] > 0

        if reuse:
            print(f"  {document.id}: reusing {existing[0]['chunk_count']} stored chunks")
            continue

        started = time.perf_counter()
        chunks = await asyncio.to_thread(chunk_document, str(path), document.filename)
        embeddings = await generate_embeddings(
            [embedding_text(chunk.section_hierarchy, chunk.chunk_text) for chunk in chunks]
        )
        if len(embeddings) != len(chunks):
            raise RuntimeError(f"{len(embeddings)} embeddings for {len(chunks)} chunks")
        records = [
            (
                f"{material_id}-{chunk.chunk_index:04d}",
                material_id,
                chunk.chunk_text.replace("\x00", ""),
                f"[{','.join(map(str, embedding))}]",
                chunk.section_hierarchy.replace("\x00", "") if chunk.section_hierarchy else None,
                chunk.page_start,
                chunk.page_end,
                chunk.chunk_index,
                chunk.token_count,
            )
            for chunk, embedding in zip(chunks, embeddings)
        ]
        metadata = json.dumps({"eval_fingerprint": fingerprint, "document": document.id})

        async def replace_material(conn, document=document, material_id=material_id, path=path, metadata=metadata, records=records):
            await conn.execute("DELETE FROM materials WHERE id = $1", material_id)
            await conn.execute(
                """
                INSERT INTO materials
                (id, project_id, category, filename, gcs_path, size_bytes, validation_status, metadata, validated_at)
                VALUES ($1, $2, $3, $4, $5, $6, 'valid', $7::jsonb, NOW())
                """,
                material_id,
                project_id,
                document.category,
                document.filename,
                f"eval://{document.filename}",
                path.stat().st_size,
                metadata,
            )
            await conn.executemany(
                """
                INSERT INTO material_chunks
                (id, material_id, chunk_text, chunk_embedding, section_hierarchy,
                 page_start, page_end, chunk_index, token_count, created_at)
                VALUES ($1, $2, $3, $4::vector, $5, $6, $7, $8, $9, NOW())
                """,
                records,
            )

        await execute_in_transaction(replace_material)
        print(f"  {document.id}: ingested {len(records)} chunks in {time.perf_counter() - started:.1f}s")


async def load_chunks(project_id: str, document_ids: List[str]) -> Dict[str, List[dict]]:
    """Stored chunks per document id, in chunk order, with embeddings as text."""
    from app.db.connection import execute_query

    rows = await execute_query(
        """
        SELECT mc.id, mc.material_id, mc.chunk_index, mc.section_hierarchy, mc.chunk_embedding::text AS embedding
        FROM material_chunks mc
        JOIN materials m ON m.id = mc.material_id
        WHERE m.project_id = $1
        ORDER BY mc.material_id, mc.chunk_index
        """,
        project_id,
    )
    by_material: Dict[str, List[dict]] = {}
    for row in rows:
        by_material.setdefault(row["material_id"], []).append(dict(row))
    return {doc_id: by_material.get(f"eval-material-{doc_id}", []) for doc_id in document_ids}
