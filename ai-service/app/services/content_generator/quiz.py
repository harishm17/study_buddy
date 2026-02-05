"""
Quiz generator service.
Creates section quizzes with various question types.
"""

from typing import List, Dict, Optional
from datetime import datetime
from enum import Enum

from app.db.connection import execute_query
from app.services.llm.factory import LLMFactory
from app.services.llm.base import LLMMessage


class QuestionType(str, Enum):
    MULTIPLE_CHOICE = "multiple_choice"
    SHORT_ANSWER = "short_answer"
    NUMERICAL = "numerical"
    TRUE_FALSE = "true_false"


class QuizGenerator:
    """Generate section quizzes for topics."""

    def __init__(self):
        self.llm = LLMFactory.get_provider()

    async def generate_quiz(
        self,
        topic_id: str,
        topic_name: str,
        topic_description: str,
        question_count: int = 10,
        question_types: Optional[List[QuestionType]] = None,
        difficulty_level: str = "medium",
        focus: Optional[str] = None
    ) -> Dict:
        """
        Generate a quiz for a topic.

        Args:
            topic_id: Topic ID
            topic_name: Topic name
            topic_description: Topic description
            question_count: Number of questions (default: 10)
            question_types: List of question types to include (default: all)
            difficulty_level: easy, medium, or hard

        Returns:
            Dict with quiz questions and metadata
        """
        # Default to all question types
        if question_types is None:
            question_types = [
                QuestionType.MULTIPLE_CHOICE,
                QuestionType.SHORT_ANSWER,
                QuestionType.NUMERICAL,
                QuestionType.TRUE_FALSE
            ]

        # Fetch relevant chunks
        chunks = await self._fetch_topic_chunks(topic_id)

        if not chunks:
            raise ValueError(f"No relevant chunks found for topic {topic_id}")

        # Build context
        context = self._build_context(chunks)

        # Generate quiz questions
        questions = await self._generate_questions(
            topic_name=topic_name,
            topic_description=topic_description,
            context=context,
            question_count=question_count,
            question_types=question_types,
            difficulty_level=difficulty_level,
            focus=focus
        )

        return {
            'questions': questions,
            'total_questions': len(questions),
            'difficulty_level': difficulty_level,
            'question_types': [qt.value for qt in question_types],
            'generated_at': datetime.utcnow().isoformat()
        }

    async def _fetch_topic_chunks(self, topic_id: str) -> List[Dict]:
        """Fetch relevant chunks for topic."""
        query = """
            SELECT
                mc.chunk_text,
                mc.section_hierarchy,
                m.filename,
                m.category,
                mc.page_start,
                mc.page_end,
                tcm.relevance_source,
                tcm.relevance_score
            FROM topic_chunk_mappings tcm
            JOIN material_chunks mc ON tcm.chunk_id = mc.id
            JOIN materials m ON mc.material_id = m.id
            WHERE tcm.topic_id = $1
            ORDER BY tcm.relevance_score DESC
            LIMIT 22
        """

        chunks = await execute_query(query, topic_id)
        return chunks

    def _build_context(self, chunks: List[Dict]) -> str:
        """Build context from chunks."""
        context_parts = []

        for idx, chunk in enumerate(chunks, 1):
            section = chunk.get('section_hierarchy', 'N/A')
            text = chunk['chunk_text'].strip()[:1500]
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
                f"[Source {idx}] {filename} ({category}, {pages})\n"
                f"Section: {section}\n"
                f"Relevance: {relevance_str} via {relevance_source}\n\n"
                f"{text}"
            )

        return "\n\n---\n\n".join(context_parts)

    async def _generate_questions(
        self,
        topic_name: str,
        topic_description: str,
        context: str,
        question_count: int,
        question_types: List[QuestionType],
        difficulty_level: str,
        focus: Optional[str] = None
    ) -> List[Dict]:
        """Generate quiz questions using LLM."""

        difficulty_guidance = {
            'easy': 'Focus on basic recall and simple understanding. Questions should test fundamental concepts.',
            'medium': 'Test both understanding and application. Include some analysis and problem-solving.',
            'hard': 'Require deep understanding, critical thinking, and complex problem-solving. Include multi-step reasoning.'
        }
        guidance = difficulty_guidance.get(difficulty_level, difficulty_guidance['medium'])

        types_str = ", ".join([qt.value for qt in question_types])

        focus_instruction = f"**Focus Request:** {focus}\nPrioritize this focus when selecting questions and explanations.\n\n" if focus else ""

        prompt = f"""You are an expert educator creating a quiz for students.

**Topic:** {topic_name}
**Description:** {topic_description}
**Difficulty Level:** {difficulty_level}
**Number of Questions:** {question_count}
**Question Types to Include:** {types_str}

{guidance}
{focus_instruction}

**Source Material:**

{context}

**Instructions:**
1. Create {question_count} diverse questions based on the source material
2. Distribute questions across the specified question types
3. Each question should test understanding of specific concepts from the topic
4. For multiple choice: Include 4 options with only one correct answer, and plausible distractors
5. For short answer: Expect 1-3 sentence responses
6. For numerical: Include units and specify acceptable precision
7. For true/false: Include explanation of why it's true or false
8. Provide detailed explanations for all correct answers
9. Include points value for each question (typically 1-5 points based on complexity)

**Formatting rules (IMPORTANT — follow these exactly):**
- All string fields support full markdown. Use it.
- Any code snippet, memory layout, or command MUST be in a fenced code block with a language tag, e.g. ```c, ```python, ```text. NEVER dump code inline as plain text.
- Use real line breaks (`\n`) inside JSON strings to separate paragraphs and before/after code fences. Do NOT put everything on one line.
- Use `inline code` only for short identifiers, function names, or single expressions (e.g. `buf`, `strlen()`).
- Keep question_text and options concise. If a question needs a code block, include it in question_text with proper fencing — do NOT put code blocks inside options.
- For math expressions use LaTeX: inline `$E = mc^2$` or display `$$\\int_0^1 f(x)\\,dx$$`. For chemistry use `$2H_2 + O_2 \\to 2H_2O$`. Do NOT use plain-text math when LaTeX is clearer.
- Separate distinct ideas into short paragraphs rather than one dense block of text.

**Format each question as a JSON object (markdown allowed inside string fields):**

For MULTIPLE_CHOICE:
{{
  "question_type": "multiple_choice",
  "question_text": "The question...",
  "options": [
    {{"id": "A", "text": "Option A"}},
    {{"id": "B", "text": "Option B"}},
    {{"id": "C", "text": "Option C"}},
    {{"id": "D", "text": "Option D"}}
  ],
  "correct_answer": "B",
  "explanation": "Detailed explanation of why B is correct and others are wrong",
  "points": 2,
  "difficulty": "{difficulty_level}",
  "concepts_tested": ["Concept 1", "Concept 2"]
}}

For SHORT_ANSWER:
{{
  "question_type": "short_answer",
  "question_text": "The question...",
  "sample_answer": "Expected answer",
  "key_points": ["Key point 1", "Key point 2", "Key point 3"],
  "explanation": "What makes a good answer",
  "points": 3,
  "difficulty": "{difficulty_level}",
  "concepts_tested": ["Concept 1"]
}}

For NUMERICAL:
{{
  "question_type": "numerical",
  "question_text": "The question...",
  "correct_answer": 42.5,
  "unit": "meters",
  "tolerance": 0.1,
  "explanation": "Step-by-step solution",
  "points": 3,
  "difficulty": "{difficulty_level}",
  "concepts_tested": ["Concept 1"]
}}

For TRUE_FALSE:
{{
  "question_type": "true_false",
  "question_text": "The statement...",
  "correct_answer": true,
  "explanation": "Why this statement is true/false with reference to concepts",
  "points": 1,
  "difficulty": "{difficulty_level}",
  "concepts_tested": ["Concept 1"]
}}

Return a JSON array of {question_count} question objects with varied types:"""

        messages = [LLMMessage(role="user", content=prompt)]

        response = await self.llm.generate_structured(
            messages=messages,
            temperature=0.6,  # Slightly higher for question variety
            use_mini=False
        )

        return response.get('questions', [])
