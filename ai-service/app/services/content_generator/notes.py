"""
Section notes generator service.
Synthesizes comprehensive study notes from relevant material chunks.
"""

import re
from typing import List, Dict, Optional
from datetime import UTC, datetime

from app.services.content_generator.context import NoSourceMaterialError, content_messages, fetch_topic_chunks, focus_line
from app.services.llm.base import LLMOutputError
from app.services.llm.factory import LLMFactory


_DETAIL_LEVELS = {
    "brief": "Cover only the key concepts and main points, in about 300-500 words.",
    "moderate": "Give a balanced overview with the important details, in about 600-900 words.",
    "comprehensive": "Cover the topic thoroughly, in about 900-1400 words.",
}

_MIN_NOTES_WORDS = 80

_SECTION_LABELS = ("Overview", "Key Concepts", "How It Works", "Common Pitfalls", "Exam-Ready Recap")
_FENCED_BLOCK = re.compile(r"(?ms)(^```.*?^```[^\n]*$)")


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
        Generate study notes for a topic.

        Args:
            topic_id: Topic ID
            topic_name: Topic name
            topic_description: Topic description
            user_preferences: Optional preferences (detail_level, include_examples, focus)

        Returns:
            Dict with generated content and metadata
        """
        chunks = await fetch_topic_chunks(topic_id)
        if not chunks:
            raise NoSourceMaterialError(f"No source material is mapped to topic {topic_id}")

        preferences = user_preferences or {}
        notes_content = await self._generate_with_llm(
            topic_name=topic_name,
            topic_description=topic_description,
            chunks=chunks,
            detail_level=preferences.get('detail_level', 'comprehensive'),
            include_examples=preferences.get('include_examples', True),
            focus=preferences.get('focus'),
        )
        notes_content = self._postprocess_notes_markdown(notes_content)
        if len(notes_content.split()) < _MIN_NOTES_WORDS:
            raise LLMOutputError(
                f"Notes for topic {topic_id} were too short ({len(notes_content.split())} words)"
            )

        return {
            'content': notes_content,
            'citations': self._extract_citations(chunks),
            'chunk_count': len(chunks),
            'generated_at': datetime.now(UTC).isoformat()
        }

    async def _generate_with_llm(
        self,
        topic_name: str,
        topic_description: str,
        chunks: List[Dict],
        detail_level: str,
        include_examples: bool,
        focus: Optional[str] = None,
    ) -> str:
        """Generate notes markdown."""
        detail_instruction = _DETAIL_LEVELS.get(detail_level, _DETAIL_LEVELS['comprehensive'])
        examples_instruction = (
            "Include short examples from the source material where they make an idea clearer."
            if include_examples else
            "Focus on concepts and explanations; leave out worked examples."
        )

        instructions = f"""Write revision notes for the topic "{topic_name}" from the excerpts above.
{focus_line(focus)}
{detail_instruction}
{examples_instruction}

Prioritize conceptual understanding: definitions, intuition, how the parts relate, and the mistakes students commonly make.

Use exactly this structure:
# {topic_name}

## Overview
## Key Concepts
## How It Works
## Common Pitfalls
## Exam-Ready Recap
(end the recap with 5-8 quick recall bullets)

Return only the markdown."""

        response = await self.llm.generate_text(
            content_messages(topic_name, topic_description, chunks, instructions),
            tier="main",
            max_tokens=12000,
            purpose="section_notes",
        )
        return response.content

    def _postprocess_notes_markdown(self, content: str) -> str:
        """Tidy model markdown for the notes viewer. Fenced code blocks are left untouched."""
        text = (content or "").replace("\r\n", "\n").strip()
        if not text:
            return text

        # Odd-numbered parts are fenced code blocks.
        parts = _FENCED_BLOCK.split(text)
        cleaned_parts = []
        for index, part in enumerate(parts):
            if index % 2 == 1:
                cleaned_parts.append(part)
                continue
            part = re.sub(r"[ \t]*\[Citation:[^\]]+\]", "", part, flags=re.IGNORECASE)
            part = re.sub(r"(?im)^\s*If you want, I can\b.*$", "", part)
            # Promote bare section labels to headings if the model left off the '#'.
            for label in _SECTION_LABELS:
                part = re.sub(rf"(?m)^{re.escape(label)}:?[ \t]*$", f"## {label}", part)
            part = re.sub(r"\n{3,}", "\n\n", part)
            cleaned_parts.append(part)
        return "".join(cleaned_parts).strip()

    def _extract_citations(self, chunks: List[Dict]) -> List[Dict]:
        """One citation per source file: its name, category and pages.

        `material_id` and `page` (the first page of the file's most relevant chunk, None for
        formats without pages) let the notes page link to the file viewer.
        """
        citations = []
        seen_files = set()

        for chunk in chunks:
            filename = chunk['filename']
            if filename not in seen_files:
                material_id = chunk.get('material_id')
                citations.append({
                    'filename': filename,
                    'category': chunk['category'],
                    'pages': self._page_range(chunk),
                    'material_id': str(material_id) if material_id is not None else None,
                    'page': chunk.get('page_start'),
                })
                seen_files.add(filename)

        return citations

    @staticmethod
    def _page_range(chunk) -> str:
        start, end = chunk['page_start'], chunk['page_end']
        if start is None:
            return "n/a"  # formats without pages, such as DOCX
        return str(start) if end is None or end == start else f"{start}-{end}"

