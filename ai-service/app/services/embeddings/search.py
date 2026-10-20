"""Finding the chunks of a project that explain a topic.

Two searches over the project's valid materials, fused by rank:

1. Vector leg: cosine similarity between the topic's query embedding and the chunk
   embeddings (HNSW index on `material_chunks.chunk_embedding`).
2. Full-text leg: Postgres full-text search over `material_chunks.search_vector` (heading
   path weighted above body text) for the topic name and keywords, ordered by `ts_rank_cd`.

Reciprocal Rank Fusion (RRF) combines them: a chunk scores 1 / (RRF_K + rank) in each leg it
appears in, and the scores add. Only ranks are used, so cosine similarity and `ts_rank_cd`
never have to be put on one scale. A chunk whose vector similarity is below
MIN_SIMILARITY is dropped from both legs, so a topic the materials barely cover returns a
short list (or nothing) instead of 24 loosely related chunks.
"""
import logging
import re
from typing import Dict, Iterable, List, Optional, Sequence

from app.db.connection import execute_in_transaction, execute_query
from app.services.embeddings.generator import generate_query_embedding

logger = logging.getLogger(__name__)

# Reciprocal Rank Fusion constant. 60 is the value from the original RRF paper; a larger
# value flattens the difference between rank 1 and rank 10.
RRF_K = 60

# Candidates taken from each leg before fusion.
CANDIDATE_POOL = 50

# Cosine similarity below which a chunk is not offered for a topic. On the eval corpus
# (bge-small, heading-prefixed vectors) chunks that explain a topic score 0.67 and up for a
# full topic query and 0.54 and up for a bare name; half of the other chunks score under 0.55.
# The model compresses scores, so the floor removes clearly unrelated chunks, not near misses.
MIN_SIMILARITY = 0.55

# Keywords beyond this many are ignored by the full-text leg.
MAX_FULLTEXT_PHRASES = 12

# Relevance sources, as stored in topic_chunk_mappings.relevance_source.
SOURCE_FULLTEXT = "keyword_match"
SOURCE_VECTOR = "semantic_search"
SOURCE_BOTH = "keyword_and_semantic"

_CHUNK_COLUMNS = """
    mc.id,
    mc.chunk_text,
    mc.section_hierarchy,
    mc.page_start,
    mc.page_end,
    mc.chunk_index,
    m.id AS material_id,
    m.filename
"""


def topic_query_text(topic_name: str, topic_description: str, keywords: Sequence[str]) -> str:
    """The text embedded as the topic's query: name, description and keywords."""
    text = f"{topic_name}: {topic_description or ''}".strip()
    keyword_list = [kw.strip() for kw in keywords or [] if kw and kw.strip()]
    if keyword_list:
        text += f" Keywords: {', '.join(keyword_list)}"
    return text


def fulltext_phrases(topic_name: str, keywords: Iterable[str]) -> List[str]:
    """The phrases the full-text leg looks for: the topic name and each keyword.

    A chunk matches when it contains any one phrase; the words inside one phrase must all
    be present (after English stemming and stop-word removal).
    """
    phrases: List[str] = []
    seen = set()
    for raw in [topic_name, *(keywords or [])]:
        phrase = re.sub(r"\s+", " ", (raw or "")).strip()
        key = phrase.lower()
        if phrase and key not in seen:
            seen.add(key)
            phrases.append(phrase)
    return phrases[:MAX_FULLTEXT_PHRASES]


def fulltext_query_sql(phrase_count: int, first_param: int) -> str:
    """SQL for a tsquery that ORs one `websearch_to_tsquery` per phrase.

    Phrases are bound as parameters `$first_param`, `$first_param + 1`, ...; they never
    become part of the SQL text. `websearch_to_tsquery` does not raise on odd input
    (quotes, operators, symbols), unlike `to_tsquery`.
    """
    if phrase_count < 1:
        raise ValueError("at least one phrase is needed")
    return " || ".join(
        f"websearch_to_tsquery('english', ${first_param + index})" for index in range(phrase_count)
    )


def _vector_literal(values: Sequence[float]) -> str:
    return "[" + ",".join(repr(float(v)) for v in values) + "]"


def _text_key(chunk: Dict) -> str:
    return re.sub(r"\s+", " ", str(chunk.get("chunk_text") or "")).strip().lower()


def fuse_rankings(
    vector_rows: Sequence[Dict],
    fulltext_rows: Sequence[Dict],
    limit: int,
    *,
    rrf_k: int,
    min_similarity: Optional[float],
) -> List[Dict]:
    """Fuse two ranked lists with Reciprocal Rank Fusion. Pure; no database.

    Each list is best first and holds chunk dicts with an `id` and a `similarity` (None for a
    chunk with no embedding). Chunks with a similarity below `min_similarity` are dropped
    before ranks are assigned, so junk does not use up rank positions. A chunk without an
    embedding can only come from the full-text leg and is kept.

    Returns up to `limit` chunks, best first, each with `relevance_score` (the RRF score) and
    `relevance_source`. Chunks with identical text (the same file uploaded twice) appear once.
    """

    def eligible(rows: Sequence[Dict]) -> List[Dict]:
        return [
            row
            for row in rows
            if min_similarity is None
            or row.get("similarity") is None
            or row["similarity"] >= min_similarity
        ]

    fused: Dict[str, Dict] = {}
    for rows, source in ((eligible(vector_rows), SOURCE_VECTOR), (eligible(fulltext_rows), SOURCE_FULLTEXT)):
        for rank, row in enumerate(rows, start=1):
            chunk_id = str(row["id"])
            entry = fused.get(chunk_id)
            if entry is None:
                entry = fused[chunk_id] = {**row, "relevance_score": 0.0, "relevance_source": source}
            elif entry["relevance_source"] != source:
                entry["relevance_source"] = SOURCE_BOTH
            entry["relevance_score"] += 1.0 / (rrf_k + rank)
            if entry.get("similarity") is None and row.get("similarity") is not None:
                entry["similarity"] = row["similarity"]

    ranked = sorted(
        fused.values(),
        key=lambda c: (-c["relevance_score"], -(c["similarity"] if c.get("similarity") is not None else -1.0), str(c["id"])),
    )

    result: List[Dict] = []
    seen_text = set()
    for chunk in ranked:
        key = _text_key(chunk)
        if key and key in seen_text:
            continue
        seen_text.add(key)
        result.append(chunk)
        if len(result) == limit:
            break
    return result


async def _vector_leg(project_id: str, query_embedding: Sequence[float], pool_size: int) -> List[Dict]:
    """Nearest chunks of the project's valid materials by cosine similarity."""
    sql = f"""
        SELECT {_CHUNK_COLUMNS},
               1 - (mc.chunk_embedding <=> $1::vector) AS similarity
        FROM material_chunks mc
        JOIN materials m ON mc.material_id = m.id
        WHERE m.project_id = $2
          AND m.validation_status = 'valid'
          AND mc.chunk_embedding IS NOT NULL
        ORDER BY mc.chunk_embedding <=> $1::vector
        LIMIT $3
    """

    async def run(conn):
        # An HNSW scan returns at most hnsw.ef_search (default 40) rows, and the project
        # filter is applied to what it returns, so the setting must cover the pool.
        await conn.execute("SELECT set_config('hnsw.ef_search', $1, true)", str(max(pool_size, 40)))
        # pgvector 0.8+ keeps scanning the index until the filter has produced enough rows;
        # older versions do not have the setting.
        try:
            async with conn.transaction():
                await conn.execute("SELECT set_config('hnsw.iterative_scan', 'relaxed_order', true)")
        except Exception:
            pass
        return await conn.fetch(sql, _vector_literal(query_embedding), project_id, pool_size)

    return [dict(row) for row in await execute_in_transaction(run)]


async def _fulltext_leg(
    project_id: str,
    phrases: Sequence[str],
    query_embedding: Optional[Sequence[float]],
    pool_size: int,
) -> List[Dict]:
    """Chunks matching any phrase, best `ts_rank_cd` first. Carries the vector similarity too."""
    if not phrases:
        return []
    # $1 is the project; $2 is the query vector when there is one; the phrases follow.
    params: List = [project_id]
    if query_embedding is not None:
        params.append(_vector_literal(query_embedding))
        similarity = (
            "CASE WHEN mc.chunk_embedding IS NULL THEN NULL "
            "ELSE 1 - (mc.chunk_embedding <=> $2::vector) END"
        )
    else:
        similarity = "NULL::float8"
    tsquery = fulltext_query_sql(len(phrases), first_param=len(params) + 1)
    params.extend(phrases)
    sql = f"""
        WITH q AS (SELECT {tsquery} AS query)
        SELECT {_CHUNK_COLUMNS},
               {similarity} AS similarity,
               ts_rank_cd(mc.search_vector, q.query) AS text_rank
        FROM material_chunks mc
        JOIN materials m ON mc.material_id = m.id
        CROSS JOIN q
        WHERE m.project_id = $1
          AND m.validation_status = 'valid'
          AND mc.search_vector @@ q.query
        ORDER BY text_rank DESC, mc.id
        LIMIT {int(pool_size)}
    """
    rows = await execute_query(sql, *params)
    return [dict(row) for row in rows]


async def hybrid_search_chunks(
    project_id: str,
    topic_name: str,
    topic_description: str,
    keywords: List[str],
    limit: int = 20,
) -> List[Dict]:
    """The chunks of a project that best explain a topic, best first.

    Runs the vector and full-text legs over the project's valid materials, fuses them with
    RRF and applies the similarity floor (see the module docstring). Returns at most `limit`
    chunk dicts (id, chunk_text, section_hierarchy, page_start, page_end, chunk_index,
    material_id, filename, similarity, relevance_score, relevance_source). The list is empty
    when nothing in the project is related to the topic.

    If the query cannot be embedded, falls back to the full-text leg alone.
    """
    logger.info("Searching project %s for topic '%s'", project_id, topic_name)

    query_embedding: Optional[List[float]] = None
    try:
        query_embedding = await generate_query_embedding(
            topic_query_text(topic_name, topic_description, keywords)
        )
    except Exception as exc:
        logger.warning(
            "Could not embed topic '%s' (%s); using full-text search only", topic_name, exc
        )

    vector_rows: List[Dict] = []
    if query_embedding is not None:
        vector_rows = await _vector_leg(project_id, query_embedding, CANDIDATE_POOL)
    fulltext_rows = await _fulltext_leg(
        project_id, fulltext_phrases(topic_name, keywords), query_embedding, CANDIDATE_POOL
    )

    chunks = fuse_rankings(
        vector_rows,
        fulltext_rows,
        limit,
        rrf_k=RRF_K,
        min_similarity=MIN_SIMILARITY if query_embedding is not None else None,
    )
    logger.info(
        "Topic '%s': %s vector and %s full-text candidates, %s chunks kept",
        topic_name,
        len(vector_rows),
        len(fulltext_rows),
        len(chunks),
    )
    return chunks
