"""
Section notes generator service.
Synthesizes comprehensive study notes from relevant material chunks.
"""

from typing import List, Dict, Optional
from datetime import datetime

from app.db.connection import execute_query, execute_one, execute_update
from app.services.llm.factory import LLMFactory
from app.services.llm.base import LLMMessage
from app.config import settings


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
            LIMIT 15
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
            text = chunk['chunk_text'].strip()

            context_part = f"""
[Chunk {idx}] Source: {filename} ({pages})
Section: {section}

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

        prompt = f"""You are an expert educational content creator. Your task is to synthesize comprehensive study notes for a specific topic based on provided course materials.

**Topic:** {topic_name}
**Description:** {topic_description}

**Detail Level:** {detail_instruction}
{examples_instruction}

**Source Material Excerpts:**

{context}

**Instructions:**
1. Synthesize the information from all sources into cohesive, well-structured study notes
2. Organize content with clear headings and subheadings
3. Highlight key concepts, definitions, and important points
4. Include relevant formulas, equations, or technical details
5. Cross-reference information from multiple sources when applicable
6. Use markdown formatting for better readability
7. Add [Citation: filename, pages] after important facts or quotes

**Format the notes as:**
# {topic_name}

## Overview
[Brief introduction to the topic]

## Key Concepts
[Main concepts with explanations]

## Detailed Content
[Organized sections based on the material]

## Summary
[Concise summary of main takeaways]

Generate comprehensive, student-friendly study notes:"""

        if settings.is_development:
            # Development mode: return mock content
            return self._generate_mock_notes(topic_name, topic_description)

        messages = [LLMMessage(role="user", content=prompt)]

        response = await self.llm.generate_text(
            messages=messages,
            temperature=0.3,  # Lower temperature for more focused content
            use_mini=False  # Use full model for quality
        )

        return response.content

    def _generate_mock_notes(self, topic_name: str, topic_description: str) -> str:
        """Generate mock notes for development mode."""
        return f"""# {topic_name}

## Overview
{topic_description}

This section covers the fundamental concepts and principles related to {topic_name}. The material draws from lecture notes, textbook chapters, and supplementary resources.

## Key Concepts

### Concept 1: Foundation
The foundational principle of {topic_name} establishes the basic framework for understanding more advanced topics. [Citation: lecture_notes.pdf, pp. 5-7]

**Important Definition:** Key term refers to the fundamental unit of analysis in this domain.

### Concept 2: Advanced Applications
Building on the foundation, we explore practical applications and real-world scenarios where {topic_name} plays a crucial role.

## Detailed Content

### Section 1: Theoretical Framework
The theoretical framework provides a structured approach to understanding {topic_name}. This includes:

- **Principle A**: Core principle that governs behavior
- **Principle B**: Secondary principle that modifies outcomes
- **Principle C**: Integration principle connecting multiple aspects

### Section 2: Practical Examples
Real-world examples help illustrate the concepts:

1. **Example 1**: Industrial application demonstrating Principle A
2. **Example 2**: Case study showing integration of multiple principles
3. **Example 3**: Problem-solving scenario requiring analytical thinking

### Section 3: Important Formulas

When applicable, key equations include:
- Formula 1: `y = mx + b` [Citation: textbook_ch3.pdf, pp. 45]
- Formula 2: Advanced relationship between variables

## Summary

{topic_name} encompasses several key ideas:
- Understanding the foundational concepts is essential
- Practical applications demonstrate real-world relevance
- Integration of theoretical and practical knowledge leads to mastery

**Next Steps:** Practice problems and interactive examples will reinforce these concepts.
"""

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
