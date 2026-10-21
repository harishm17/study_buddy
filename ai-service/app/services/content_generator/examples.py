"""
Examples generator service.
Creates solved and interactive examples from material chunks.
"""

from typing import List, Dict, Optional
from datetime import UTC, datetime
from enum import Enum

from app.services.content_generator.context import NoSourceMaterialError, content_messages, fetch_topic_chunks, focus_line
from app.services.llm.base import LLMOutputError
from app.services.llm.factory import LLMFactory
from app.services.llm.schemas import InteractiveExampleSet, SolvedExampleSet


class ExampleType(str, Enum):
    SOLVED = "solved"
    INTERACTIVE = "interactive"


SOLVED_GUIDANCE = {
    'easy': 'Straightforward problems that test basic understanding of the core concepts.',
    'medium': 'Moderately challenging problems that combine several concepts.',
    'hard': 'Complex problems that need deep understanding and multi-step reasoning.',
}

INTERACTIVE_GUIDANCE = {
    'easy': 'Straightforward problems with 2-3 steps.',
    'medium': 'Moderately challenging problems with 3-5 steps.',
    'hard': 'Complex problems with 5 or more steps that need deeper reasoning.',
}


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
        focus: Optional[str] = None,
        cache_excerpts: bool = False,
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
            cache_excerpts: True for more examples of a type that already exists, so the
                excerpt block is cached

        Returns:
            Dict with generated examples and metadata
        """
        chunks = await fetch_topic_chunks(topic_id)
        if not chunks:
            raise NoSourceMaterialError(f"No source material is mapped to topic {topic_id}")

        if example_type == ExampleType.SOLVED:
            examples = await self._generate_solved_examples(
                topic_name, topic_description, chunks, count, difficulty_level, focus, cache_excerpts
            )
        else:
            examples = await self._generate_interactive_examples(
                topic_name, topic_description, chunks, count, difficulty_level, focus, cache_excerpts
            )

        return {
            'examples': examples,
            'example_type': example_type,
            'difficulty_level': difficulty_level,
            'generated_at': datetime.now(UTC).isoformat()
        }

    async def _generate_solved_examples(
        self,
        topic_name: str,
        topic_description: str,
        chunks: List[Dict],
        count: int,
        difficulty_level: str,
        focus: Optional[str] = None,
        cache_excerpts: bool = False,
    ) -> List[Dict]:
        """Fully solved examples with step-by-step solutions."""
        guidance = SOLVED_GUIDANCE.get(difficulty_level, SOLVED_GUIDANCE['medium'])
        instructions = f"""Write {count} distinct solved example problems on "{topic_name}" from the excerpts above.
{focus_line(focus)}
Difficulty: {difficulty_level}. {guidance}

- Make each problem realistic for this course and vary the problem types across the topic.
- Give complete step-by-step solutions. Each step has a one-line description, the work (math or reasoning), and why the step is taken.
- Name the key principle or formula used in each step.
- Keep final_answer short: 2-5 markdown bullets.
- Set difficulty to "{difficulty_level}"."""

        result = await self.llm.generate_structured(
            content_messages(topic_name, topic_description, chunks, instructions, cache_excerpts),
            SolvedExampleSet,
            max_tokens=16000,
            purpose="solved_examples",
        )
        examples = [example.model_dump() for example in result.examples if example.usable()]
        if not examples:
            raise LLMOutputError("No usable solved examples were generated")
        return examples[:count]

    async def _generate_interactive_examples(
        self,
        topic_name: str,
        topic_description: str,
        chunks: List[Dict],
        count: int,
        difficulty_level: str,
        focus: Optional[str] = None,
        cache_excerpts: bool = False,
    ) -> List[Dict]:
        """Problems the student solves one step at a time."""
        guidance = INTERACTIVE_GUIDANCE.get(difficulty_level, INTERACTIVE_GUIDANCE['medium'])
        instructions = f"""Write {count} interactive practice problems on "{topic_name}" from the excerpts above. The student solves each one step by step.
{focus_line(focus)}
Difficulty: {difficulty_level}. {guidance}

- Each step asks the student one short question, offers a hint that does not give the answer away, and has the correct answer plus other acceptable forms of it.
- Each step builds on the one before.
- Give an explanation, feedback for a correct answer, and guidance for a wrong one.
- answer_type is numeric, text or multiple_choice.
- Set difficulty to "{difficulty_level}"."""

        result = await self.llm.generate_structured(
            content_messages(topic_name, topic_description, chunks, instructions, cache_excerpts),
            InteractiveExampleSet,
            max_tokens=16000,
            purpose="interactive_examples",
        )
        examples = [example.model_dump() for example in result.examples if example.usable()]
        if not examples:
            raise LLMOutputError("No usable practice problems were generated")
        return examples[:count]
