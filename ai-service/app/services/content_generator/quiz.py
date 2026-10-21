"""
Quiz generator service.
Creates section quizzes with various question types.
"""

from typing import List, Dict, Optional
from datetime import UTC, datetime
from enum import Enum

from app.services.content_generator.context import NoSourceMaterialError, content_messages, fetch_topic_chunks, focus_line
from app.services.llm.base import LLMOutputError
from app.services.llm.factory import LLMFactory
from app.services.llm.schemas import QuestionSet


class QuestionType(str, Enum):
    MULTIPLE_CHOICE = "multiple_choice"
    SHORT_ANSWER = "short_answer"
    NUMERICAL = "numerical"
    TRUE_FALSE = "true_false"


DIFFICULTY_GUIDANCE = {
    'easy': 'Test basic recall and simple understanding of the fundamental concepts.',
    'medium': 'Test both understanding and application, with some analysis and problem-solving.',
    'hard': 'Require deep understanding, critical thinking and multi-step reasoning.',
}

QUESTION_FORMAT_RULES = """Question rules:
- multiple_choice: exactly 4 options with ids A, B, C, D, one correct answer, plausible distractors. Vary which letter is correct. Keep options short and put any code in the question text, not the options.
- short_answer: answerable in 1-3 sentences; give a sample_answer and 2-4 key_points a grader can check.
- numerical: correct_answer is a plain number; give the unit and an absolute tolerance.
- true_false: correct_answer is a boolean; the explanation says why.
- Every question has an explanation of the correct answer and points from 1 to 5 by complexity.
- In explanations, refer to options by their content, never by letter. The options are shuffled after you write them."""


def minimum_usable(requested: int) -> int:
    """Fewest valid questions accepted before a set counts as failed."""
    return max(1, (requested + 1) // 2)


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
        focus: Optional[str] = None,
        cache_excerpts: bool = False,
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
            cache_excerpts: True for another set on a topic that already has a quiz, so the
                excerpt block is cached

        Returns:
            Dict with quiz questions and metadata
        """
        if question_types is None:
            question_types = list(QuestionType)

        chunks = await fetch_topic_chunks(topic_id)
        if not chunks:
            raise NoSourceMaterialError(f"No source material is mapped to topic {topic_id}")

        questions = await self._generate_questions(
            topic_name=topic_name,
            topic_description=topic_description,
            chunks=chunks,
            question_count=question_count,
            question_types=question_types,
            difficulty_level=difficulty_level,
            focus=focus,
            cache_excerpts=cache_excerpts,
        )

        return {
            'questions': questions,
            'total_questions': len(questions),
            'difficulty_level': difficulty_level,
            'question_types': [qt.value for qt in question_types],
            'generated_at': datetime.now(UTC).isoformat()
        }

    async def _generate_questions(
        self,
        topic_name: str,
        topic_description: str,
        chunks: List[Dict],
        question_count: int,
        question_types: List[QuestionType],
        difficulty_level: str,
        focus: Optional[str] = None,
        cache_excerpts: bool = False,
    ) -> List[Dict]:
        """Generate and validate quiz questions."""
        guidance = DIFFICULTY_GUIDANCE.get(difficulty_level, DIFFICULTY_GUIDANCE['medium'])
        types_str = ", ".join(qt.value for qt in question_types)

        instructions = f"""Write a {question_count}-question quiz on "{topic_name}" from the excerpts above.
{focus_line(focus)}
Difficulty: {difficulty_level}. {guidance}
Use only these question types, spread across them: {types_str}.
Each question tests a specific concept from the excerpts.

{QUESTION_FORMAT_RULES}
Set difficulty to "{difficulty_level}" and list the concepts each question tests."""

        result = await self.llm.generate_structured(
            content_messages(topic_name, topic_description, chunks, instructions, cache_excerpts),
            QuestionSet,
            max_tokens=16000,
            purpose="topic_quiz",
        )
        allowed = {qt.value for qt in question_types}
        questions = [q for q in result.usable() if q["question_type"] in allowed][:question_count]
        if len(questions) < minimum_usable(question_count):
            raise LLMOutputError(
                f"Quiz had {len(questions)} usable questions of {question_count} requested"
            )
        return questions
