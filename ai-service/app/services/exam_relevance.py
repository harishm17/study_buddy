"""Which topics the student's past exams test.

Each topic of a project is searched against the chunks of the project's past-exam files only
(`hybrid_search_chunks(include_roles=("exam",))`, the same search that finds a topic's lesson
material, with its coverage test and similarity floor). A topic with at least one exam chunk above
the floor is marked `topics.exam_relevant = true`; the others are marked false.

`mark_exam_relevant_topics` is a full recompute and idempotent: the flag of every topic of the
project is set from the project's exam chunks as they are now, so it is safe to run after planning,
after an exam file is chunked, and after an exam file is removed or its role changes.
"""
import logging
from typing import Any, Dict, List

from app.db.connection import execute_one, execute_query
from app.services.embeddings.search import hybrid_search_chunks

logger = logging.getLogger(__name__)

# Exam chunks looked at per topic: one above the floor is enough to flag the topic.
CHUNKS_PER_TOPIC = 3


async def _has_exam_chunks(project_id: str) -> bool:
    row = await execute_one(
        """
        SELECT EXISTS (
            SELECT 1 FROM material_chunks mc
            JOIN materials m ON m.id = mc.material_id
            WHERE m.project_id = $1 AND m.role = 'exam' AND m.validation_status = 'valid'
        ) AS found
        """,
        project_id,
    )
    return bool(row and row["found"])


async def find_exam_relevant_topics(project_id: str) -> List[Dict[str, Any]]:
    """The topics of the project that past-exam text covers, each with its best matching chunk
    (`similarity`, `material_id`, `chunk_index`). Reads only; writes nothing."""
    if not await _has_exam_chunks(project_id):
        return []
    topics = await execute_query(
        "SELECT id, name, description, keywords FROM topics WHERE project_id = $1 ORDER BY order_index",
        project_id,
    )
    relevant: List[Dict[str, Any]] = []
    for topic in topics:
        chunks = await hybrid_search_chunks(
            project_id,
            topic["name"],
            topic["description"] or "",
            list(topic["keywords"] or []),
            limit=CHUNKS_PER_TOPIC,
            include_roles=("exam",),
        )
        if chunks:
            best = max(chunks, key=lambda chunk: chunk.get("similarity") or 0.0)
            relevant.append(
                {
                    "id": topic["id"],
                    "name": topic["name"],
                    "similarity": best.get("similarity"),
                    "material_id": best["material_id"],
                    "chunk_index": best["chunk_index"],
                }
            )
    return relevant


async def mark_exam_relevant_topics(project_id: str) -> Dict[str, int]:
    """Set `topics.exam_relevant` for every topic of the project from its past-exam chunks.
    Returns {"topics", "relevant", "changed"}."""
    relevant = await find_exam_relevant_topics(project_id)
    ids = [topic["id"] for topic in relevant]
    total = await execute_one("SELECT count(*)::int AS n FROM topics WHERE project_id = $1", project_id)
    changed = await execute_query(
        """
        UPDATE topics SET exam_relevant = (id = ANY($2::text[]))
        WHERE project_id = $1 AND exam_relevant IS DISTINCT FROM (id = ANY($2::text[]))
        RETURNING id
        """,
        project_id,
        ids,
    )
    logger.info(
        "Exam relevance for project %s: %d of %d topics on past exams (%d changed)",
        project_id, len(ids), total["n"] if total else 0, len(changed),
    )
    return {"topics": total["n"] if total else 0, "relevant": len(ids), "changed": len(changed)}


async def mark_exam_relevant_topics_quietly(project_id: str) -> None:
    """The same, for callers whose own work must not fail because of it (the course planner)."""
    try:
        await mark_exam_relevant_topics(project_id)
    except Exception:
        logger.exception("Could not mark exam-relevant topics for project %s", project_id)
