"""Topic extraction service."""
import logging
import re
from typing import List
from pydantic import BaseModel
from app.services.llm import LLMFactory
from app.services.llm.base import LLMMessage
from app.db.connection import execute_query

logger = logging.getLogger(__name__)


class ExtractedTopic(BaseModel):
    """Represents a topic extracted from materials."""

    name: str
    description: str
    keywords: List[str]


def _normalize_topic_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (name or "").lower()).strip()


def _tokenize_topic_name(name: str) -> set[str]:
    tokens = {token for token in _normalize_topic_name(name).split(" ") if len(token) > 2}
    return tokens


def _topics_are_similar(left: ExtractedTopic, right: ExtractedTopic) -> bool:
    left_name = _normalize_topic_name(left.name)
    right_name = _normalize_topic_name(right.name)
    if not left_name or not right_name:
        return False
    if left_name == right_name:
        return True
    if left_name in right_name or right_name in left_name:
        return True

    left_tokens = _tokenize_topic_name(left.name)
    right_tokens = _tokenize_topic_name(right.name)
    if not left_tokens or not right_tokens:
        return False

    intersection = left_tokens.intersection(right_tokens)
    union = left_tokens.union(right_tokens)
    jaccard = len(intersection) / max(len(union), 1)
    overlap = len(intersection) / max(min(len(left_tokens), len(right_tokens)), 1)

    left_keywords = {keyword.strip().lower() for keyword in (left.keywords or []) if keyword.strip()}
    right_keywords = {keyword.strip().lower() for keyword in (right.keywords or []) if keyword.strip()}
    keyword_overlap = 0.0
    if left_keywords and right_keywords:
        keyword_overlap = len(left_keywords.intersection(right_keywords)) / max(
            min(len(left_keywords), len(right_keywords)),
            1,
        )

    return jaccard >= 0.5 or overlap >= 0.75 or keyword_overlap >= 0.6


def _sanitize_topic(topic: ExtractedTopic) -> ExtractedTopic | None:
    name = re.sub(r"\s+", " ", topic.name or "").strip()
    if len(name) < 3:
        return None

    description = re.sub(r"\s+", " ", topic.description or "").strip()
    if not description:
        description = f"Core concepts and reasoning for {name}."

    seen = set()
    keywords: List[str] = []
    for keyword in topic.keywords or []:
        clean_keyword = re.sub(r"\s+", " ", str(keyword)).strip()
        if not clean_keyword:
            continue
        normalized = clean_keyword.lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        keywords.append(clean_keyword)

    if not keywords:
        keywords = [name.lower()]
    if len(keywords) > 8:
        keywords = keywords[:8]

    return ExtractedTopic(name=name, description=description, keywords=keywords)


def _merge_topics(existing: ExtractedTopic, candidate: ExtractedTopic) -> ExtractedTopic:
    # Prefer the shorter title if one is a strict extension of the other.
    existing_name = existing.name
    candidate_name = candidate.name
    if len(candidate_name) < len(existing_name) and _normalize_topic_name(candidate_name) in _normalize_topic_name(existing_name):
        chosen_name = candidate_name
    else:
        chosen_name = existing_name

    chosen_description = (
        candidate.description
        if len(candidate.description) > len(existing.description)
        else existing.description
    )

    combined_keywords: List[str] = []
    seen = set()
    for keyword in [*existing.keywords, *candidate.keywords]:
        normalized = keyword.lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        combined_keywords.append(keyword)

    return ExtractedTopic(
        name=chosen_name,
        description=chosen_description,
        keywords=combined_keywords[:8],
    )


def _topic_targets(material_count: int) -> tuple[int, int, int]:
    # Keep small projects intentionally coarse.
    if material_count <= 1:
        return (3, 4, 4)
    if material_count <= 3:
        return (3, 5, 5)
    if material_count <= 6:
        return (4, 6, 6)
    return (6, 8, 8)


def _postprocess_topics(topics: List[ExtractedTopic], material_count: int) -> List[ExtractedTopic]:
    sanitized = [topic for raw in topics if (topic := _sanitize_topic(raw)) is not None]

    deduped: List[ExtractedTopic] = []
    for topic in sanitized:
        merged = False
        for index, existing in enumerate(deduped):
            if _topics_are_similar(existing, topic):
                deduped[index] = _merge_topics(existing, topic)
                merged = True
                break
        if not merged:
            deduped.append(topic)

    _, _, max_topics = _topic_targets(material_count)
    pruned = deduped[:max_topics]
    logger.info(
        "Topic post-processing: raw=%s sanitized=%s deduped=%s capped=%s (materials=%s)",
        len(topics),
        len(sanitized),
        len(deduped),
        len(pruned),
        material_count,
    )
    return pruned


async def extract_topics_from_materials(project_id: str) -> List[ExtractedTopic]:
    """
    Extract topics from all validated materials in a project.

    Strategy:
    1. Fetch all chunks from project materials
    2. Get representative samples (section headings + first chunks)
    3. Use LLM to identify key topics
    4. Return structured topic list

    Args:
        project_id: Project ID

    Returns:
        List of ExtractedTopic objects
    """
    logger.info(f"Extracting topics for project {project_id}")

    try:
        # 1. Fetch all materials for project
        materials = await execute_query(
            """
            SELECT m.id, m.filename, m.category
            FROM materials m
            WHERE m.project_id = $1
              AND m.validation_status = 'valid'
            ORDER BY m.uploaded_at
            """,
            project_id
        )

        if not materials:
            logger.warning(f"No valid materials found for project {project_id}")
            return []

        # 2. Fetch section hierarchies (lightweight - for structure overview)
        section_chunks = await execute_query(
            """
            SELECT DISTINCT
                mc.section_hierarchy,
                mc.page_start,
                m.filename,
                m.category,
                m.id as material_id
            FROM material_chunks mc
            JOIN materials m ON mc.material_id = m.id
            WHERE m.project_id = $1
              AND m.validation_status = 'valid'
              AND mc.section_hierarchy IS NOT NULL
            ORDER BY m.id, mc.page_start
            LIMIT 100
            """,
            project_id
        )

        # 3. Fetch sample content (only first 15 chunks for actual text)
        sample_chunks = await execute_query(
            """
            SELECT
                mc.chunk_text,
                mc.page_start,
                m.filename
            FROM material_chunks mc
            JOIN materials m ON mc.material_id = m.id
            WHERE m.project_id = $1
              AND m.validation_status = 'valid'
            ORDER BY m.id, mc.chunk_index
            LIMIT 15
            """,
            project_id
        )

        if not section_chunks and not sample_chunks:
            logger.warning(f"No chunks found for project {project_id}")
            return []

        # 4. Build prompt for LLM
        material_summary = build_material_summary(materials, section_chunks, sample_chunks)

        target_min_topics, target_max_topics, _ = _topic_targets(len(materials))

        prompt = f"""You are analyzing educational materials to extract key topics for a study guide.

{material_summary}

Based on these materials, extract a comprehensive list of topics that a student should study.

Requirements:
- Each topic should be a distinct concept or subject area
- Topics should cover all major themes in the materials
- Include {target_min_topics}-{target_max_topics} topics (adjust based on material volume)
- Keep topics broad and practical. Prefer one strong umbrella topic over multiple narrow variants.
- Avoid near-duplicates and wording variants (for example, do not return both "X Vulnerabilities" and "X Errors" if they are the same concept)
- For each topic, provide:
  - name: Clear, concise topic name (2-5 words)
  - description: Brief explanation (1-2 sentences)
  - keywords: 3-8 relevant keywords for searching

Return a JSON object with this structure:
{{
  "topics": [
    {{
      "name": "Photosynthesis",
      "description": "The process by which plants convert light energy into chemical energy, including light-dependent and light-independent reactions.",
      "keywords": ["photosynthesis", "chloroplast", "light reactions", "Calvin cycle", "chlorophyll", "ATP", "NADPH"]
    }}
  ]
}}
"""

        # 4. Call LLM (using mini model for cost efficiency)
        # Topic extraction from table of contents is straightforward enough for mini models
        llm = LLMFactory.get_provider()
        response = await llm.generate_structured(
            messages=[
                LLMMessage(
                    role="system",
                    content="You are an expert educational content analyzer. Extract key topics from course materials."
                ),
                LLMMessage(role="user", content=prompt)
            ],
            use_mini=True  # Use mini model - topic extraction is straightforward (20x cost savings)
        )

        # 5. Parse response
        topics_data = response.get("topics", [])
        topics = [ExtractedTopic(**topic) for topic in topics_data]
        topics = _postprocess_topics(topics, material_count=len(materials))

        logger.info(f"Extracted {len(topics)} topics for project {project_id}")
        return topics

    except Exception as e:
        logger.error(f"Error extracting topics: {e}")
        raise


def build_material_summary(
    materials: List[dict],
    section_chunks: List[dict],
    sample_chunks: List[dict]
) -> str:
    """
    Build a summary of materials for LLM prompt.

    Args:
        materials: List of material records
        section_chunks: List of chunks with section hierarchies (lightweight)
        sample_chunks: List of chunks with full text for samples

    Returns:
        Formatted summary string
    """
    summary_parts = []

    # Materials overview
    summary_parts.append("## Uploaded Materials\n")
    for mat in materials:
        summary_parts.append(
            f"- **{mat['filename']}** ({mat['category'].replace('_', ' ').title()})"
        )

    # Section hierarchies (grouped)
    summary_parts.append("\n## Content Structure\n")
    hierarchies = {}
    for chunk in section_chunks:
        if chunk.get('section_hierarchy'):
            key = chunk['filename']
            if key not in hierarchies:
                hierarchies[key] = []
            if chunk['section_hierarchy'] not in hierarchies[key]:
                hierarchies[key].append(chunk['section_hierarchy'])

    for filename, sections in hierarchies.items():
        summary_parts.append(f"\n**{filename}:**")
        for section in sections[:20]:  # Limit to 20 sections per file
            summary_parts.append(f"- {section}")

    # Sample content (using separate sample_chunks with full text)
    summary_parts.append("\n## Sample Content\n")
    for i, chunk in enumerate(sample_chunks[:10], 1):  # First 10 samples
        summary_parts.append(
            f"\n**Sample {i}** ({chunk['filename']}, pp. {chunk['page_start']}):"
        )
        # Include first 300 characters of chunk
        preview = chunk['chunk_text'][:300].strip()
        summary_parts.append(f"{preview}...\n")

    return "\n".join(summary_parts)
