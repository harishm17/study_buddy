"""Rows the job tests need in the test database."""
import json
import math
import uuid
from typing import Any, Optional

UTC_NOW = "(NOW() AT TIME ZONE 'UTC')"


def new_id() -> str:
    return uuid.uuid4().hex


async def seed_user(pool, user_id: Optional[str] = None) -> str:
    user_id = user_id or new_id()
    await pool.execute(
        f"INSERT INTO users (id, email, updated_at) VALUES ($1, $2, {UTC_NOW})",
        user_id,
        f"{user_id}@example.com",
    )
    return user_id


async def seed_project(pool, user_id: str) -> str:
    project_id = new_id()
    await pool.execute(
        f"INSERT INTO projects (id, user_id, name, updated_at) VALUES ($1, $2, 'P', {UTC_NOW})",
        project_id,
        user_id,
    )
    return project_id


async def seed_material(pool, project_id: str, gcs_path: str = "gs://b/u/p/doc.pdf",
                        filename: str = "doc.pdf", status: str = "pending") -> str:
    material_id = new_id()
    await pool.execute(
        """
        INSERT INTO materials (id, project_id, category, filename, gcs_path, size_bytes, validation_status)
        VALUES ($1, $2, 'lecture_notes', $3, $4, 100, $5)
        """,
        material_id, project_id, filename, gcs_path, status,
    )
    return material_id


async def seed_topic(pool, project_id: str, name: str = "Topic") -> str:
    topic_id = new_id()
    await pool.execute(
        "INSERT INTO topics (id, project_id, name, order_index) VALUES ($1, $2, $3, 0)",
        topic_id, project_id, name,
    )
    return topic_id


async def seed_job(pool, user_id: str, job_type: str = "generate_content", *,
                   project_id: Optional[str] = None, status: str = "pending",
                   input_data: Optional[dict] = None, target_key: Optional[str] = None,
                   **columns: Any) -> str:
    """Insert a job. Extra keyword arguments set columns directly (attempt_count=2, ...).

    A value of the form "SQL:<expression>" is inserted as that expression.
    """
    job_id = new_id()
    values = {
        "id": job_id, "user_id": user_id, "project_id": project_id, "job_type": job_type,
        "status": status, "input_data": json.dumps(input_data or {}), "target_key": target_key,
        **columns,
    }
    names, placeholders, args = [], [], []
    for name, value in values.items():
        names.append(name)
        if isinstance(value, str) and value.startswith("SQL:"):
            placeholders.append(value[4:])
        else:
            args.append(value)
            placeholders.append(f"${len(args)}")
    await pool.execute(
        f"INSERT INTO processing_jobs ({', '.join(names)}) VALUES ({', '.join(placeholders)})",
        *args,
    )
    return job_id


async def get_job(pool, job_id: str):
    return await pool.fetchrow("SELECT * FROM processing_jobs WHERE id = $1", job_id)


def unit(*weights):
    """A 384-number unit vector from its first few components."""
    vector = [0.0] * 384
    for index, weight in enumerate(weights):
        vector[index] = weight
    norm = math.sqrt(sum(v * v for v in vector))
    return [v / norm for v in vector]


def literal(vector):
    return "[" + ",".join(repr(v) for v in vector) + "]"


async def add_chunk(db, material_id, index, text, vector=None, heading=None):
    chunk_id = new_id()
    await db.execute(
        "INSERT INTO material_chunks (id, material_id, chunk_text, chunk_embedding, section_hierarchy, chunk_index) "
        "VALUES ($1, $2, $3, $4::vector, $5, $6)",
        chunk_id, material_id, text, literal(vector) if vector else None, heading, index,
    )
    return chunk_id
