"""
Section notes generator service.
Synthesizes comprehensive study notes from relevant material chunks.
"""

import re
from typing import List, Dict, Optional
from datetime import datetime

from app.db.connection import execute_query, execute_one, execute_update
from app.services.llm.factory import LLMFactory
from app.services.llm.base import LLMMessage


class NotesGenerator:
    """Generate section-wise study notes from material chunks."""

    def __init__(self):
        self.llm = LLMFactory.get_provider()

    async def generate_notes(
        self,
        topic_id: str,
        topic_name: str,
        topic_description: str,
        user_preferences: Optional[Dict] = None
    ) -> Dict:
        """
        Generate comprehensive study notes for a topic.

        Args:
            topic_id: Topic ID
            topic_name: Topic name
            topic_description: Topic description
            user_preferences: Optional preferences (detail_level, include_examples, etc.)

        Returns:
            Dict with generated content and metadata
        """
        # Fetch relevant chunks via topic_chunk_mappings
        chunks = await self._fetch_topic_chunks(topic_id)

        if not chunks:
            raise ValueError(f"No relevant chunks found for topic {topic_id}")

        # Build context from chunks
        context = self._build_context(chunks)

        # Generate notes with LLM
        preferences = user_preferences or {}
        detail_level = preferences.get('detail_level', 'comprehensive')
        include_examples = preferences.get('include_examples', True)

        notes_content = await self._generate_with_llm(
            topic_name=topic_name,
            topic_description=topic_description,
            context=context,
            detail_level=detail_level,
            include_examples=include_examples
        )
        notes_content = self._postprocess_notes_markdown(notes_content)

        # Extract citations
        citations = self._extract_citations(chunks)

        return {
            'content': notes_content,
            'citations': citations,
            'chunk_count': len(chunks),
            'generated_at': datetime.utcnow().isoformat()
        }

    async def _fetch_topic_chunks(self, topic_id: str) -> List[Dict]:
        """Fetch relevant chunks for topic ordered by relevance."""
        query = """
            SELECT
                mc.id,
                mc.chunk_text,
                mc.section_hierarchy,
                mc.page_start,
                mc.page_end,
                m.filename,
                m.category,
                tcm.relevance_score,
                tcm.relevance_source
            FROM topic_chunk_mappings tcm
            JOIN material_chunks mc ON tcm.chunk_id = mc.id
            JOIN materials m ON mc.material_id = m.id
            WHERE tcm.topic_id = $1
            ORDER BY tcm.relevance_score DESC
            LIMIT 24
        """

        chunks = await execute_query(query, topic_id)
        return chunks

    def _build_context(self, chunks: List[Dict]) -> str:
        """Build formatted context from chunks."""
        context_parts = []

        for idx, chunk in enumerate(chunks, 1):
            section = chunk.get('section_hierarchy', 'N/A')
            filename = chunk['filename']
            pages = f"pp. {chunk['page_start']}-{chunk['page_end']}"
            category = chunk.get('category', 'unknown')
            relevance = chunk.get('relevance_score')
            relevance_source = chunk.get('relevance_source', 'n/a')
            text = chunk['chunk_text'].strip()[:1800]
            relevance_str = f"{float(relevance):.3f}" if relevance is not None else "n/a"

            context_part = f"""
[Chunk {idx}] Source: {filename} ({pages})
Category: {category}
Section: {section}
Relevance: {relevance_str} via {relevance_source}

{text}

---
"""
            context_parts.append(context_part.strip())

        return "\n\n".join(context_parts)

    async def _generate_with_llm(
        self,
        topic_name: str,
        topic_description: str,
        context: str,
        detail_level: str,
        include_examples: bool
    ) -> str:
        """Generate notes using LLM."""

        # Build detail level instruction
        detail_instructions = {
            'brief': 'Focus on key concepts and main points only. Be concise.',
            'moderate': 'Provide a balanced overview with important details and explanations.',
            'comprehensive': 'Provide thorough, detailed notes covering all aspects in depth.'
        }
        detail_instruction = detail_instructions.get(detail_level, detail_instructions['comprehensive'])

        examples_instruction = (
            "Include relevant examples and illustrations from the source material."
            if include_examples else
            "Focus on concepts and explanations without detailed examples."
        )

        prompt = f"""You are an expert educational content creator. Your task is to synthesize high-quality study notes for a specific topic based on provided course materials.

**Topic:** {topic_name}
**Description:** {topic_description}

**Detail Level:** {detail_instruction}
{examples_instruction}

**Source Material Excerpts:**

{context}

**Instructions:**
1. Synthesize all excerpts into clear, cohesive notes for revision.
2. Use concise markdown with headings, short paragraphs, bullet lists, and inline code where helpful.
3. Prioritize conceptual understanding, definitions, intuition, and relationships.
4. Keep it practical for exam prep: include key takeaways and common mistakes.
5. Keep total length around 700-1100 words.
6. Do NOT include inline citation tags like [Citation: ...]. A separate citation panel is shown in the UI.
7. Do NOT include chatty endings (e.g., "If you want, I can...").
8. Any code snippet, memory layout, or pseudo-code MUST be in a fenced code block with a language tag (e.g. ```c, ```python, ```text). NEVER dump code inline as plain text. Use `inline code` only for short identifiers or expressions.
9. For math expressions use LaTeX: inline $E = mc^2$ or display $$\\int_0^1 f(x)\\,dx$$. For chemistry use $2H_2 + O_2 \\to 2H_2O$. Do NOT use plain-text math when LaTeX is clearer.

**Format the notes as:**
# {topic_name}

## Overview
[Brief introduction]

## Key Concepts
[Bullet list of core ideas]

## How It Works
[Mechanisms / relationships / process explanation]

## Common Pitfalls
[Frequent mistakes and misconceptions]

## Exam-Ready Recap
[Concise summary + 5-8 quick recall bullets]

Return markdown only."""

        messages = [LLMMessage(role="user", content=prompt)]

        response = await self.llm.generate_text(
            messages=messages,
            temperature=0.3,  # Lower temperature for more focused content
            use_mini=False  # Use full model for quality
        )

        return response.content

    def _postprocess_notes_markdown(self, content: str) -> str:
        """Normalize model output into readable markdown for the notes viewer."""
        text = (content or "").replace("\r\n", "\n").strip()
        if not text:
            return text

        # Remove inline citation tags and chatty tail sections.
        text = re.sub(r"\s*\[Citation:[^\]]+\]\s*", " ", text, flags=re.IGNORECASE)
        text = re.sub(r"^\s*If you want, I can:.*$", "", text, flags=re.IGNORECASE | re.MULTILINE)
        text = re.sub(r"^\s*Generate comprehensive, student-friendly study notes:\s*$", "", text, flags=re.IGNORECASE | re.MULTILINE)

        # Promote bare section labels to markdown headings if model omitted '#'.
        heading_labels = [
            "Overview",
            "Key Concepts",
            "How It Works",
            "Detailed Content",
            "Common Pitfalls",
            "Summary",
            "Exam-Ready Recap",
            "Source Materials",
        ]
        for label in heading_labels:
            text = re.sub(
                rf"(?m)^(?!#)\s*{re.escape(label)}\s*$",
                f"## {label}",
                text,
            )

        # Convert numbered section labels like "1) ...".
        text = re.sub(r"(?m)^\s*\d+\)\s+(.+)$", r"### \1", text)

        # Collapse extra spacing from cleanup.
        text = re.sub(r"[ \t]{2,}", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text).strip()
        return text

    def _extract_citations(self, chunks: List[Dict]) -> List[Dict]:
        """Extract citation metadata from chunks."""
        citations = []
        seen_files = set()

        for chunk in chunks:
            filename = chunk['filename']
            if filename not in seen_files:
                citations.append({
                    'filename': filename,
                    'category': chunk['category'],
                    'pages': f"{chunk['page_start']}-{chunk['page_end']}"
                })
                seen_files.add(filename)

        return citations


async def generate_notes(
    topic_id: str,
    topic_name: str,
    topic_description: str,
    detail_level: str = "comprehensive",
    include_examples: bool = True,
    variation_seed: Optional[int] = None,
) -> Dict:
    """
    Backward-compatible notes generation helper used by tests and legacy callers.

    Returns structured JSON ({title, sections, ...}) rather than markdown text.
    """
    chunks = await execute_query(
        """
        SELECT
            mc.chunk_text,
            mc.section_hierarchy,
            m.filename,
            m.category
        FROM topic_chunk_mappings tcm
        JOIN material_chunks mc ON tcm.chunk_id = mc.id
        JOIN materials m ON mc.material_id = m.id
        WHERE tcm.topic_id = $1
        ORDER BY tcm.relevance_score DESC
        LIMIT 15
        """,
        topic_id,
    )
    if not chunks:
        raise ValueError(f"No relevant chunks found for topic {topic_id}")

    context_parts: List[str] = []
    for idx, chunk in enumerate(chunks, 1):
        text = str(chunk.get("chunk_text") or chunk.get("content") or "").strip()
        section = str(chunk.get("section_hierarchy") or chunk.get("metadata", {}).get("section") or "N/A")
        if not text:
            continue
        context_parts.append(f"[Chunk {idx}] Section: {section}\n{text}")
    context = "\n\n".join(context_parts)
    seed_instruction = (
        f"\nVariation seed: {variation_seed}\nKeep output consistent for this seed."
        if variation_seed is not None
        else ""
    )

    prompt = f"""Create structured study notes in JSON for this topic.

Topic: {topic_name}
Description: {topic_description}
Detail level: {detail_level}
Include examples: {include_examples}
{seed_instruction}

Source context:
{context}

Return strict JSON:
{{
  "title": "...",
  "sections": [
    {{
      "heading": "...",
      "content": "...",
      "key_points": ["..."]
    }}
  ]
}}
"""
    llm = LLMFactory.get_provider()
    messages = [LLMMessage(role="user", content=prompt)]
    structured = await llm.generate_structured(messages=messages, use_mini=False)
    if isinstance(structured, dict):
        return structured
    return {"title": topic_name, "sections": []}
