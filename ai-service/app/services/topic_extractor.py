"""Topic extraction service."""
import logging
import json
from typing import List, Dict
from pydantic import BaseModel
from app.services.llm import LLMFactory
from app.services.llm.base import LLMMessage
from app.db.connection import execute_query, execute_one

logger = logging.getLogger(__name__)


class ExtractedTopic(BaseModel):
    """Represents a topic extracted from materials."""

    name: str
    description: str
    keywords: List[str]


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

        # 2. Fetch representative chunks (section hierarchies + sample text)
        representative_chunks = await execute_query(
            """
            SELECT
                mc.section_hierarchy,
                mc.chunk_text,
                mc.page_start,
                m.filename,
                m.category
            FROM material_chunks mc
            JOIN materials m ON mc.material_id = m.id
            WHERE m.project_id = $1
              AND m.validation_status = 'valid'
              AND mc.section_hierarchy IS NOT NULL
            ORDER BY m.id, mc.chunk_index
            LIMIT 100
            """,
            project_id
        )

        if not representative_chunks:
            logger.warning(f"No chunks found for project {project_id}")
            return []

        # 3. Build prompt for LLM
        material_summary = build_material_summary(materials, representative_chunks)

        prompt = f"""You are analyzing educational materials to extract key topics for a study guide.

{material_summary}

Based on these materials, extract a comprehensive list of topics that a student should study.

Requirements:
- Each topic should be a distinct concept or subject area
- Topics should cover all major themes in the materials
- Include 5-15 topics (adjust based on material volume)
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

        # 4. Call LLM
        llm = LLMFactory.get_provider()
        response = await llm.generate_structured(
            messages=[
                LLMMessage(
                    role="system",
                    content="You are an expert educational content analyzer. Extract key topics from course materials."
                ),
                LLMMessage(role="user", content=prompt)
            ],
            use_mini=False  # Use full model for better topic extraction
        )

        # 5. Parse response
        topics_data = response.get("topics", [])
        topics = [ExtractedTopic(**topic) for topic in topics_data]

        logger.info(f"Extracted {len(topics)} topics for project {project_id}")
        return topics

    except Exception as e:
        logger.error(f"Error extracting topics: {e}")
        raise


def build_material_summary(materials: List[dict], chunks: List[dict]) -> str:
    """
    Build a summary of materials for LLM prompt.

    Args:
        materials: List of material records
        chunks: List of representative chunks

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
    for chunk in chunks:
        if chunk['section_hierarchy']:
            key = chunk['filename']
            if key not in hierarchies:
                hierarchies[key] = []
            if chunk['section_hierarchy'] not in hierarchies[key]:
                hierarchies[key].append(chunk['section_hierarchy'])

    for filename, sections in hierarchies.items():
        summary_parts.append(f"\n**{filename}:**")
        for section in sections[:20]:  # Limit to 20 sections per file
            summary_parts.append(f"- {section}")

    # Sample content
    summary_parts.append("\n## Sample Content\n")
    for i, chunk in enumerate(chunks[:10], 1):  # First 10 chunks
        summary_parts.append(
            f"\n**Sample {i}** ({chunk['filename']}, pp. {chunk['page_start']}):"
        )
        # Include first 300 characters of chunk
        preview = chunk['chunk_text'][:300].strip()
        summary_parts.append(f"{preview}...\n")

    return "\n".join(summary_parts)
