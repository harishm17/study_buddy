"""Vector similarity search using pgvector."""
import logging
from typing import List, Dict, Optional
from app.db.connection import execute_query
from app.services.embeddings.generator import generate_single_embedding

logger = logging.getLogger(__name__)


async def hybrid_search_chunks(
    project_id: str,
    topic_name: str,
    topic_description: str,
    keywords: List[str],
    limit: int = 20
) -> List[Dict]:
    """
    Hybrid search for relevant chunks using keyword + semantic search.

    Strategy:
    1. Keyword search: Find chunks containing topic keywords
    2. Semantic search: Find chunks similar to topic embedding
    3. Combine and rank results
    4. Return top N chunks with relevance scores

    Args:
        project_id: Project ID to search within
        topic_name: Topic name
        topic_description: Topic description
        keywords: List of keywords
        limit: Maximum number of chunks to return

    Returns:
        List of chunk records with relevance scores
    """
    logger.info(f"Hybrid search for topic '{topic_name}' in project {project_id}")

    try:
        # 1. Keyword search
        keyword_chunks = await keyword_search(project_id, keywords, limit * 2)
        logger.debug(f"Found {len(keyword_chunks)} chunks via keyword search")

        # 2. Semantic search (best-effort)
        topic_text = f"{topic_name}: {topic_description}"
        semantic_chunks: List[Dict] = []
        try:
            semantic_chunks = await semantic_search(project_id, topic_text, limit * 2)
            logger.debug(f"Found {len(semantic_chunks)} chunks via semantic search")
        except Exception as semantic_error:
            logger.warning(
                "Semantic search unavailable for topic '%s' in project %s: %s. "
                "Falling back to keyword-only retrieval.",
                topic_name,
                project_id,
                semantic_error,
            )

        # 3. Combine and deduplicate
        chunks_by_id = {}

        # Add keyword matches (score: 0.8 base)
        for chunk in keyword_chunks:
            chunk_id = str(chunk['id'])
            chunks_by_id[chunk_id] = {
                **chunk,
                'relevance_score': 0.8,
                'relevance_source': 'keyword_match'
            }

        # Add/merge semantic matches
        for chunk in semantic_chunks:
            chunk_id = str(chunk['id'])
            if chunk_id in chunks_by_id:
                # Boost score if found by both methods
                chunks_by_id[chunk_id]['relevance_score'] = max(
                    chunks_by_id[chunk_id]['relevance_score'],
                    chunk['similarity']
                ) * 1.1  # 10% boost for dual match
                chunks_by_id[chunk_id]['relevance_source'] = 'keyword_and_semantic'
            else:
                chunks_by_id[chunk_id] = {
                    **chunk,
                    'relevance_score': chunk['similarity'],
                    'relevance_source': 'semantic_search'
                }

        # 4. Sort by relevance and limit
        ranked_chunks = sorted(
            chunks_by_id.values(),
            key=lambda x: x['relevance_score'],
            reverse=True
        )[:limit]

        logger.info(
            f"Hybrid search returned {len(ranked_chunks)} chunks "
            f"for topic '{topic_name}'"
        )

        return ranked_chunks

    except Exception as e:
        logger.error(f"Error in hybrid search: {e}")
        raise


async def keyword_search(
    project_id: str,
    keywords: List[str],
    limit: int
) -> List[Dict]:
    """
    Search for chunks containing keywords.

    Args:
        project_id: Project ID
        keywords: List of keywords
        limit: Maximum results

    Returns:
        List of matching chunks
    """
    if not keywords:
        return []

    # Escape special SQL LIKE characters and sanitize keywords
    # Replace % and _ with escaped versions, and remove dangerous characters
    sanitized_keywords = []
    for kw in keywords:
        # Escape SQL LIKE special characters
        escaped = kw.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
        # Remove any remaining SQL injection attempts
        escaped = ''.join(c for c in escaped if c.isprintable())
        if escaped:  # Only add non-empty keywords
            sanitized_keywords.append(escaped)

    if not sanitized_keywords:
        return []

    # Build ILIKE conditions with parameterized queries
    # Use positional parameters to prevent SQL injection
    conditions = []
    params = [project_id]
    param_idx = 2  # Start after $1 (project_id)
    
    for kw in sanitized_keywords:
        conditions.append(f"mc.chunk_text ILIKE ${param_idx}")
        params.append(f"%{kw}%")
        param_idx += 1

    keyword_conditions = " OR ".join(conditions)

    query = f"""
        SELECT
            mc.id,
            mc.chunk_text,
            mc.section_hierarchy,
            mc.page_start,
            mc.page_end,
            mc.chunk_index,
            m.id as material_id,
            m.filename
        FROM material_chunks mc
        JOIN materials m ON mc.material_id = m.id
        WHERE m.project_id = $1
          AND m.validation_status = 'valid'
          AND ({keyword_conditions})
        ORDER BY mc.chunk_index
        LIMIT ${param_idx}
    """

    params.append(limit)
    chunks = await execute_query(query, *params)
    return [dict(chunk) for chunk in chunks]


async def semantic_search(
    project_id: str,
    query_text: str,
    limit: int
) -> List[Dict]:
    """
    Semantic search using vector similarity (pgvector).

    Args:
        project_id: Project ID
        query_text: Text to search for
        limit: Maximum results

    Returns:
        List of chunks with similarity scores
    """
    # Generate embedding for query
    query_embedding = await generate_single_embedding(query_text)

    # Convert to pgvector format (array string)
    embedding_str = f"[{','.join(map(str, query_embedding))}]"

    query = """
        SELECT
            mc.id,
            mc.chunk_text,
            mc.section_hierarchy,
            mc.page_start,
            mc.page_end,
            mc.chunk_index,
            m.id as material_id,
            m.filename,
            1 - (mc.chunk_embedding <=> $1::vector) as similarity
        FROM material_chunks mc
        JOIN materials m ON mc.material_id = m.id
        WHERE m.project_id = $2
          AND m.validation_status = 'valid'
          AND mc.chunk_embedding IS NOT NULL
        ORDER BY mc.chunk_embedding <=> $1::vector
        LIMIT $3
    """

    chunks = await execute_query(query, embedding_str, project_id, limit)
    return [dict(chunk) for chunk in chunks]


async def search_similar_chunks(
    embedding: List[float],
    top_k: int = 5,
    material_id: Optional[str] = None,
    min_similarity: float = 0.0,
) -> List[Dict]:
    """
    Backward-compatible vector search helper used by tests and legacy callers.
    """
    if not embedding:
        return []

    embedding_str = f"[{','.join(map(str, embedding))}]"

    if material_id:
        query = """
            SELECT
                mc.id AS chunk_id,
                mc.chunk_text,
                1 - (mc.chunk_embedding <=> $1::vector) AS similarity_score
            FROM material_chunks mc
            WHERE mc.material_id = $2
            ORDER BY mc.chunk_embedding <=> $1::vector
            LIMIT $3
        """
        rows = await execute_query(query, embedding_str, material_id, top_k)
    else:
        query = """
            SELECT
                mc.id AS chunk_id,
                mc.chunk_text,
                1 - (mc.chunk_embedding <=> $1::vector) AS similarity_score
            FROM material_chunks mc
            ORDER BY mc.chunk_embedding <=> $1::vector
            LIMIT $2
        """
        rows = await execute_query(query, embedding_str, top_k)

    normalized = [dict(row) for row in rows]
    filtered = []
    for row in normalized:
        similarity = row.get("similarity_score", row.get("similarity", 0))
        if isinstance(similarity, (int, float)) and similarity >= min_similarity:
            row["similarity_score"] = float(similarity)
            filtered.append(row)

    filtered.sort(key=lambda entry: entry.get("similarity_score", 0), reverse=True)
    return filtered[:top_k]
