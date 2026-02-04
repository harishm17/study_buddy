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
        difficulty_level: str = "medium"
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
            difficulty_level=difficulty_level
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
                tcm.relevance_score
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
        """Build context from chunks."""
        context_parts = []

        for idx, chunk in enumerate(chunks, 1):
            section = chunk.get('section_hierarchy', 'N/A')
            text = chunk['chunk_text'].strip()
            context_parts.append(f"[Source {idx} - {section}]\n{text}")

        return "\n\n---\n\n".join(context_parts)

    async def _generate_questions(
        self,
        topic_name: str,
        topic_description: str,
        context: str,
        question_count: int,
        question_types: List[QuestionType],
        difficulty_level: str
    ) -> List[Dict]:
        """Generate quiz questions using LLM."""

        difficulty_guidance = {
            'easy': 'Focus on basic recall and simple understanding. Questions should test fundamental concepts.',
            'medium': 'Test both understanding and application. Include some analysis and problem-solving.',
            'hard': 'Require deep understanding, critical thinking, and complex problem-solving. Include multi-step reasoning.'
        }
        guidance = difficulty_guidance.get(difficulty_level, difficulty_guidance['medium'])

        types_str = ", ".join([qt.value for qt in question_types])

        prompt = f"""You are an expert educator creating a quiz for students.

**Topic:** {topic_name}
**Description:** {topic_description}
**Difficulty Level:** {difficulty_level}
**Number of Questions:** {question_count}
**Question Types to Include:** {types_str}

{guidance}

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

**Format each question as a JSON object:**

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
