"""Vector similarity search using pgvector."""
import logging
from typing import List, Dict
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

        # 2. Semantic search
        topic_text = f"{topic_name}: {topic_description}"
        semantic_chunks = await semantic_search(project_id, topic_text, limit * 2)
        logger.debug(f"Found {len(semantic_chunks)} chunks via semantic search")

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

    # Build ILIKE conditions for each keyword
    keyword_conditions = " OR ".join([
        f"mc.chunk_text ILIKE '%{kw}%'" for kw in keywords
    ])

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
        LIMIT $2
    """

    chunks = await execute_query(query, project_id, limit)
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
