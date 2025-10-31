"""
Examples generator service.
Creates solved and interactive examples from material chunks.
"""

from typing import List, Dict, Optional
from datetime import datetime
from enum import Enum

from app.db.connection import execute_query, execute_one
from app.services.llm.factory import LLMFactory
from app.services.llm.base import LLMMessage
from app.config import settings


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
        difficulty_level: str = "medium"
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
                topic_name, topic_description, context, count, difficulty_level
            )
        else:
            examples = await self._generate_interactive_examples(
                topic_name, topic_description, context, count, difficulty_level
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
                m.filename,
                m.category,
                tcm.relevance_score
            FROM topic_chunk_mappings tcm
            JOIN material_chunks mc ON tcm.chunk_id = mc.id
            JOIN materials m ON mc.material_id = m.id
            WHERE tcm.topic_id = $1
            ORDER BY tcm.relevance_score DESC
            LIMIT 12
        """

        chunks = await execute_query(query, topic_id)
        return chunks

    def _build_context(self, chunks: List[Dict]) -> str:
        """Build context from chunks."""
        context_parts = []

        for idx, chunk in enumerate(chunks, 1):
            text = chunk['chunk_text'].strip()
            context_parts.append(f"[Excerpt {idx}]\n{text}")

        return "\n\n---\n\n".join(context_parts)

    async def _generate_solved_examples(
        self,
        topic_name: str,
        topic_description: str,
        context: str,
        count: int,
        difficulty_level: str
    ) -> List[Dict]:
        """Generate fully solved examples with step-by-step solutions."""

        difficulty_guidance = {
            'easy': 'Create straightforward problems that test basic understanding of core concepts.',
            'medium': 'Create moderately challenging problems requiring application of multiple concepts.',
            'hard': 'Create complex problems requiring deep understanding and multi-step reasoning.'
        }
        guidance = difficulty_guidance.get(difficulty_level, difficulty_guidance['medium'])

        prompt = f"""You are an expert educator creating solved example problems for students.

**Topic:** {topic_name}
**Description:** {topic_description}
**Difficulty Level:** {difficulty_level}
**Number of Examples:** {count}

{guidance}

**Source Material:**

{context}

**Instructions:**
1. Create {count} distinct example problems that demonstrate key concepts from the topic
2. Each problem should be realistic and relevant to the course material
3. Provide complete, step-by-step solutions with explanations
4. Highlight key principles or formulas used in each step
5. Include final answers clearly marked
6. Vary the problem types to cover different aspects of the topic

**Format each example as a JSON object:**
{{
  "title": "Brief descriptive title",
  "problem_statement": "Clear statement of the problem",
  "solution_steps": [
    {{"step_number": 1, "description": "What we're doing", "work": "Mathematical work or reasoning", "explanation": "Why we're doing this"}},
    {{"step_number": 2, "description": "Next step", "work": "...", "explanation": "..."}}
  ],
  "final_answer": "Complete answer with units/context",
  "key_concepts": ["Concept 1", "Concept 2"],
  "difficulty": "{difficulty_level}"
}}

Return a JSON array of {count} example objects:"""

        if settings.is_development:
            return self._generate_mock_solved_examples(topic_name, count, difficulty_level)

        messages = [LLMMessage(role="user", content=prompt)]

        response = await self.llm.generate_structured(
            messages=messages,
            temperature=0.5,
            use_mini=False
        )

        return response.get('examples', [])

    async def _generate_interactive_examples(
        self,
        topic_name: str,
        topic_description: str,
        context: str,
        count: int,
        difficulty_level: str
    ) -> List[Dict]:
        """Generate interactive examples where students solve step-by-step."""

        difficulty_guidance = {
            'easy': 'Create straightforward problems with 2-3 steps.',
            'medium': 'Create moderately challenging problems with 3-5 steps.',
            'hard': 'Create complex problems with 5+ steps requiring deeper reasoning.'
        }
        guidance = difficulty_guidance.get(difficulty_level, difficulty_guidance['medium'])

        prompt = f"""You are an expert educator creating interactive practice problems for students.

**Topic:** {topic_name}
**Description:** {topic_description}
**Difficulty Level:** {difficulty_level}
**Number of Examples:** {count}

{guidance}

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

**Format each example as a JSON object:**
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

        if settings.is_development:
            return self._generate_mock_interactive_examples(topic_name, count, difficulty_level)

        messages = [LLMMessage(role="user", content=prompt)]

        response = await self.llm.generate_structured(
            messages=messages,
            temperature=0.5,
            use_mini=False
        )

        return response.get('examples', [])

    def _generate_mock_solved_examples(
        self, topic_name: str, count: int, difficulty_level: str
    ) -> List[Dict]:
        """Generate mock solved examples for development."""
        examples = []

        for i in range(count):
            examples.append({
                "title": f"Example {i+1}: {topic_name} Application",
                "problem_statement": f"Consider a scenario involving {topic_name}. Calculate the expected outcome given the following conditions...",
                "solution_steps": [
                    {
                        "step_number": 1,
                        "description": "Identify given information",
                        "work": "Given: Variable A = 5, Variable B = 10",
                        "explanation": "We start by listing all known values from the problem statement."
                    },
                    {
                        "step_number": 2,
                        "description": "Apply relevant formula",
                        "work": "Using Formula: Result = A × B + C",
                        "explanation": "This formula relates our variables based on the topic principles."
                    },
                    {
                        "step_number": 3,
                        "description": "Calculate result",
                        "work": "Result = 5 × 10 + 15 = 65",
                        "explanation": "Substituting our values and solving."
                    }
                ],
                "final_answer": "The final result is 65 units.",
                "key_concepts": [topic_name, "Problem Solving", "Mathematical Application"],
                "difficulty": difficulty_level
            })

        return examples

    def _generate_mock_interactive_examples(
        self, topic_name: str, count: int, difficulty_level: str
    ) -> List[Dict]:
        """Generate mock interactive examples for development."""
        examples = []

        for i in range(count):
            examples.append({
                "title": f"Interactive Practice {i+1}: {topic_name}",
                "problem_statement": f"Let's work through a {topic_name} problem together. You'll solve it step by step with guidance.",
                "steps": [
                    {
                        "step_number": 1,
                        "question": "What is the first step in approaching this problem?",
                        "hint": "Think about what information you need to identify first.",
                        "answer_type": "text",
                        "correct_answer": "Identify the given variables",
                        "acceptable_answers": ["identify variables", "list given info", "find known values"],
                        "explanation": "Correct! We always start by identifying what we know from the problem.",
                        "feedback_correct": "Great! You've identified the first step.",
                        "feedback_incorrect": "Not quite. Think about what information the problem provides."
                    },
                    {
                        "step_number": 2,
                        "question": "Which formula applies to this scenario?",
                        "hint": "Look for formulas related to the key concept.",
                        "answer_type": "multiple_choice",
                        "correct_answer": "Formula B: y = mx + b",
                        "acceptable_answers": ["y = mx + b", "linear equation"],
                        "explanation": "That's right! This is a linear relationship.",
                        "feedback_correct": "Perfect! You've selected the correct formula.",
                        "feedback_incorrect": "Try again. Consider the relationship between the variables."
                    },
                    {
                        "step_number": 3,
                        "question": "Calculate the final result.",
                        "hint": "Substitute the values into the formula.",
                        "answer_type": "numeric",
                        "correct_answer": "42",
                        "acceptable_answers": ["42", "42.0"],
                        "explanation": "Excellent! By substituting our values, we get 42.",
                        "feedback_correct": "Well done! You've solved the problem correctly.",
                        "feedback_incorrect": "Check your calculation. Make sure you substituted correctly."
                    }
                ],
                "key_concepts": [topic_name, "Interactive Learning", "Step-by-step Problem Solving"],
                "difficulty": difficulty_level,
                "estimated_time_minutes": 8
            })

        return examples
