"""
Examples generator service.
Creates solved and interactive examples from material chunks.
"""

from typing import List, Dict, Optional
from datetime import datetime
from enum import Enum

from app.db.connection import execute_query
from app.services.llm.factory import LLMFactory
from app.services.llm.base import LLMMessage


class ExampleType(str, Enum):
    SOLVED = "solved"
    INTERACTIVE = "interactive"


class ExamplesGenerator:
    """Generate solved and interactive examples for topics."""

    def __init__(self):
        self.llm = LLMFactory.get_provider()

    async def generate_examples(
        self,
        topic_id: str,
        topic_name: str,
        topic_description: str,
        example_type: ExampleType,
        count: int = 3,
        difficulty_level: str = "medium",
        focus: Optional[str] = None
    ) -> Dict:
        """
        Generate examples for a topic.

        Args:
            topic_id: Topic ID
            topic_name: Topic name
            topic_description: Topic description
            example_type: Type of examples (solved or interactive)
            count: Number of examples to generate (default: 3)
            difficulty_level: easy, medium, or hard

        Returns:
            Dict with generated examples and metadata
        """
        # Fetch relevant chunks
        chunks = await self._fetch_topic_chunks(topic_id)

        if not chunks:
            raise ValueError(f"No relevant chunks found for topic {topic_id}")

        # Build context
        context = self._build_context(chunks)

        # Generate examples
        if example_type == ExampleType.SOLVED:
            examples = await self._generate_solved_examples(
                topic_name, topic_description, context, count, difficulty_level, focus
            )
        else:
            examples = await self._generate_interactive_examples(
                topic_name, topic_description, context, count, difficulty_level, focus
            )

        return {
            'examples': examples,
            'example_type': example_type,
            'difficulty_level': difficulty_level,
            'generated_at': datetime.utcnow().isoformat()
        }

    async def _fetch_topic_chunks(self, topic_id: str) -> List[Dict]:
        """Fetch relevant chunks for topic."""
        query = """
            SELECT
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
            LIMIT 18
        """

        chunks = await execute_query(query, topic_id)
        return chunks

    def _build_context(self, chunks: List[Dict]) -> str:
        """Build context from chunks."""
        context_parts = []

        for idx, chunk in enumerate(chunks, 1):
            text = chunk['chunk_text'].strip()[:1600]
            section = chunk.get('section_hierarchy', 'N/A')
            filename = chunk.get('filename', 'unknown')
            category = chunk.get('category', 'unknown')
            page_start = chunk.get('page_start')
            page_end = chunk.get('page_end')
            pages = (
                f"pp. {page_start}-{page_end}"
                if page_start is not None and page_end is not None
                else "pp. n/a"
            )
            relevance = chunk.get('relevance_score')
            relevance_source = chunk.get('relevance_source', 'n/a')
            relevance_str = f"{float(relevance):.3f}" if relevance is not None else "n/a"
            context_parts.append(
                f"[Excerpt {idx}] Source: {filename} ({category}, {pages})\n"
                f"Section: {section}\n"
                f"Relevance: {relevance_str} via {relevance_source}\n\n"
                f"{text}"
            )

        return "\n\n---\n\n".join(context_parts)

    async def _generate_solved_examples(
        self,
        topic_name: str,
        topic_description: str,
        context: str,
        count: int,
        difficulty_level: str,
        focus: Optional[str] = None
    ) -> List[Dict]:
        """Generate fully solved examples with step-by-step solutions."""

        difficulty_guidance = {
            'easy': 'Create straightforward problems that test basic understanding of core concepts.',
            'medium': 'Create moderately challenging problems requiring application of multiple concepts.',
            'hard': 'Create complex problems requiring deep understanding and multi-step reasoning.'
        }
        guidance = difficulty_guidance.get(difficulty_level, difficulty_guidance['medium'])

        focus_instruction = f"**Focus Request:** {focus}\nPrioritize this focus when selecting examples and explanations.\n\n" if focus else ""

        prompt = f"""You are an expert educator creating solved example problems for students.

**Topic:** {topic_name}
**Description:** {topic_description}
**Difficulty Level:** {difficulty_level}
**Number of Examples:** {count}

{guidance}
{focus_instruction}

**Source Material:**

{context}

**Instructions:**
1. Create {count} distinct example problems that demonstrate key concepts from the topic
2. Each problem should be realistic and relevant to the course material
3. Provide complete, step-by-step solutions with explanations
4. Highlight key principles or formulas used in each step
5. Include final answers clearly marked
6. Vary the problem types to cover different aspects of the topic
7. Make `final_answer` concise markdown (prefer 2-5 bullet points over one long paragraph)

**Formatting rules (IMPORTANT — follow these exactly):**
- All string fields support full markdown. Use it.
- Any code snippet, memory layout, or command MUST be in a fenced code block with a language tag, e.g. ```c, ```python, ```text. NEVER dump code inline as plain text.
- Use real line breaks (`\n`) inside JSON strings to separate paragraphs and before/after code fences. Do NOT put everything on one line.
- Use `inline code` only for short identifiers, function names, or single expressions (e.g. `buf`, `strlen()`).
- Keep titles and step descriptions concise (one line). Put longer content, code, or layouts in work/explanation fields.
- For math expressions use LaTeX: inline `$E = mc^2$` or display `$$\\int_0^1 f(x)\\,dx$$`. For chemistry use `$2H_2 + O_2 \\to 2H_2O$`. Do NOT use plain-text math when LaTeX is clearer.
- Separate distinct ideas into short paragraphs rather than one dense block of text.

**Format each example as a JSON object (markdown allowed inside string fields):**
{{
  "title": "Brief descriptive title",
  "problem_statement": "Clear statement of the problem",
  "solution_steps": [
    {{"step_number": 1, "description": "What we're doing", "work": "Mathematical work or reasoning", "explanation": "Why we're doing this"}},
    {{"step_number": 2, "description": "Next step", "work": "...", "explanation": "..."}}
  ],
  "final_answer": "Concise markdown summary (prefer bullet points)",
  "key_concepts": ["Concept 1", "Concept 2"],
  "difficulty": "{difficulty_level}"
}}

Return a JSON array of {count} example objects:"""

        messages = [LLMMessage(role="user", content=prompt)]

        response = await self.llm.generate_structured(
            messages=messages,
            temperature=0.5,
            use_mini=False
        )

        if isinstance(response, dict):
            examples = response.get('examples')
            if isinstance(examples, list):
                return examples
        return []

    async def _generate_interactive_examples(
        self,
        topic_name: str,
        topic_description: str,
        context: str,
        count: int,
        difficulty_level: str,
        focus: Optional[str] = None
    ) -> List[Dict]:
        """Generate interactive examples where students solve step-by-step."""

        difficulty_guidance = {
            'easy': 'Create straightforward problems with 2-3 steps.',
            'medium': 'Create moderately challenging problems with 3-5 steps.',
            'hard': 'Create complex problems with 5+ steps requiring deeper reasoning.'
        }
        guidance = difficulty_guidance.get(difficulty_level, difficulty_guidance['medium'])

        focus_instruction = f"**Focus Request:** {focus}\nPrioritize this focus when selecting steps and hints.\n\n" if focus else ""

        prompt = f"""You are an expert educator creating interactive practice problems for students.

**Topic:** {topic_name}
**Description:** {topic_description}
**Difficulty Level:** {difficulty_level}
**Number of Examples:** {count}

{guidance}
{focus_instruction}

**Source Material:**

{context}

**Instructions:**
1. Create {count} interactive problems where students solve step-by-step
2. Break each problem into clear steps with hints and validation
3. Each step should have:
   - Question/task for the student
   - Hint if they get stuck
   - Correct answer for validation
   - Explanation after they answer
4. Design for progressive learning (each step builds on previous)

**Formatting rules (IMPORTANT — follow these exactly):**
- All string fields support full markdown. Use it.
- Any code snippet, memory layout, or command MUST be in a fenced code block with a language tag, e.g. ```c, ```python, ```text. NEVER dump code inline as plain text.
- Use real line breaks (`\n`) inside JSON strings to separate paragraphs and before/after code fences. Do NOT put everything on one line.
- Use `inline code` only for short identifiers, function names, or single expressions (e.g. `buf`, `strlen()`).
- Keep step questions concise (one or two lines). Put code, layouts, and longer explanations in problem_statement, hint, or explanation fields.
- For math expressions use LaTeX: inline `$E = mc^2$` or display `$$\\int_0^1 f(x)\\,dx$$`. For chemistry use `$2H_2 + O_2 \\to 2H_2O$`. Do NOT use plain-text math when LaTeX is clearer.
- Separate distinct ideas into short paragraphs rather than one dense block of text.

**Format each example as a JSON object (markdown allowed inside string fields):**
{{
  "title": "Brief descriptive title",
  "problem_statement": "Clear initial problem setup",
  "steps": [
    {{
      "step_number": 1,
      "question": "What should the student figure out?",
      "hint": "Helpful hint without giving away the answer",
      "answer_type": "numeric|text|multiple_choice",
      "correct_answer": "The expected answer",
      "acceptable_answers": ["Alternative acceptable forms"],
      "explanation": "Why this is correct and what it means",
      "feedback_correct": "Positive reinforcement",
      "feedback_incorrect": "Guidance when wrong"
    }}
  ],
  "key_concepts": ["Concept 1", "Concept 2"],
  "difficulty": "{difficulty_level}",
  "estimated_time_minutes": 10
}}

Return a JSON array of {count} interactive example objects:"""

        messages = [LLMMessage(role="user", content=prompt)]

        response = await self.llm.generate_structured(
            messages=messages,
            temperature=0.5,
            use_mini=False
        )

        if isinstance(response, dict):
            examples = response.get('examples')
            if isinstance(examples, list):
                return examples
        return []


async def generate_examples(
    topic_id: str,
    topic_name: str,
    topic_description: str,
    example_count: int = 3,
    difficulty: str = "medium",
) -> Dict:
    """
    Backward-compatible helper for solved examples.
    """
    chunks = await execute_query(
        """
        SELECT
            mc.chunk_text,
            mc.section_hierarchy,
            m.filename
        FROM topic_chunk_mappings tcm
        JOIN material_chunks mc ON tcm.chunk_id = mc.id
        JOIN materials m ON mc.material_id = m.id
        WHERE tcm.topic_id = $1
        ORDER BY tcm.relevance_score DESC
        LIMIT 12
        """,
        topic_id,
    )
    if not chunks:
        raise ValueError(f"No relevant chunks found for topic {topic_id}")

    context = "\n\n".join(
        str(chunk.get("chunk_text") or chunk.get("content") or "").strip()
        for chunk in chunks
        if str(chunk.get("chunk_text") or chunk.get("content") or "").strip()
    )

    llm = LLMFactory.get_provider()
    prompt = f"""Generate {example_count} solved examples as JSON.
Topic: {topic_name}
Description: {topic_description}
Difficulty: {difficulty}

Source material:
{context}

Return:
{{ "examples": [{{ "problem": "...", "solution": "...", "difficulty": "{difficulty}" }}] }}
"""
    messages = [LLMMessage(role="user", content=prompt)]
    result = await llm.generate_structured(messages=messages, use_mini=False)
    if not isinstance(result, dict):
        result = {"examples": []}
    examples = result.get("examples") if isinstance(result.get("examples"), list) else []
    for example in examples:
        if isinstance(example, dict):
            example.setdefault("difficulty", difficulty)
    return {"examples": examples}
