"""
Sample exam generator service.
Creates comprehensive exams combining multiple topics.
"""

import asyncio
import logging
import random
from typing import Dict, List

from datetime import UTC, datetime

from app.db.connection import execute_query
from app.services.content_generator.context import NoSourceMaterialError, content_messages, fetch_topic_chunks
from app.services.content_generator.quiz import DIFFICULTY_GUIDANCE, QUESTION_FORMAT_RULES, minimum_usable
from app.services.llm.base import LLMError, LLMOutputError
from app.services.llm.factory import LLMFactory
from app.services.llm.schemas import QuestionSet

logger = logging.getLogger(__name__)

DEFAULT_TYPE_DISTRIBUTION = {"multiple_choice": 60, "short_answer": 30, "numerical": 10}
QUESTION_TYPES = ("multiple_choice", "short_answer", "numerical", "true_false")
# Topics generated at the same time.
TOPIC_CONCURRENCY = 4


def split_by_weight(total: int, weights: Dict[str, float]) -> Dict[str, int]:
    """Split `total` across keys in proportion to weights (largest remainder; sums to total)."""
    positive = {key: float(w) for key, w in weights.items() if w and float(w) > 0}
    if total <= 0 or not positive:
        return {}
    weight_sum = sum(positive.values())
    exact = {key: total * w / weight_sum for key, w in positive.items()}
    counts = {key: int(value) for key, value in exact.items()}
    leftover = total - sum(counts.values())
    for key in sorted(exact, key=lambda k: exact[k] - counts[k], reverse=True)[:leftover]:
        counts[key] += 1
    return {key: count for key, count in counts.items() if count > 0}


def plan_exam(topic_ids: List[str], total_questions: int, type_distribution: Dict[str, float]) -> Dict[str, Dict[str, int]]:
    """Per-topic question-type counts that add up to exactly `total_questions`.

    Question k goes to topic k mod len(topics), so topics get counts that differ by at most
    one (with fewer questions than topics, some get none). Types are spread evenly over the
    question sequence, so each topic gets a mix.
    """
    if not topic_ids or total_questions <= 0:
        return {}
    weights = {k: v for k, v in type_distribution.items() if k in QUESTION_TYPES}
    type_counts = split_by_weight(total_questions, weights) or {"multiple_choice": total_questions}
    # Place the n questions of each type at evenly spaced positions, then read them in order.
    positioned = [
        ((i + 0.5) / n, q_type) for q_type, n in type_counts.items() for i in range(n)
    ]
    type_sequence = [q_type for _, q_type in sorted(positioned)]

    plan: Dict[str, Dict[str, int]] = {}
    for k, q_type in enumerate(type_sequence):
        topic_counts = plan.setdefault(topic_ids[k % len(topic_ids)], {})
        topic_counts[q_type] = topic_counts.get(q_type, 0) + 1
    return plan


class ExamGenerator:
    """Generate sample exams across multiple topics."""

    def __init__(self):
        self.llm = LLMFactory.get_provider()

    async def generate_exam(
        self,
        project_id: str,
        topic_ids: List[str],
        config: Dict,
    ) -> Dict:
        """
        Generate an exam across multiple topics.

        Args:
            project_id: Project ID
            topic_ids: List of topic IDs to include
            config: Exam configuration
                - total_questions: Total number of questions
                - duration_minutes: Exam duration
                - question_type_distribution: e.g., {"multiple_choice": 60, "short_answer": 30, "numerical": 10}
                - difficulty_level: easy, medium, or hard

        Returns:
            Dict with exam questions and metadata
        """
        topics = await self._fetch_topics(project_id, topic_ids)
        if not topics:
            raise ValueError(f"No topics found for project {project_id}")

        total_questions = int(config.get('total_questions') or 20)
        type_dist = config.get('question_type_distribution') or DEFAULT_TYPE_DISTRIBUTION
        difficulty = config.get('difficulty_level', 'medium')
        plan = plan_exam([t["id"] for t in topics], total_questions, type_dist)

        semaphore = asyncio.Semaphore(TOPIC_CONCURRENCY)

        async def run(topic: Dict) -> List[Dict]:
            async with semaphore:
                return await self._generate_topic_questions(topic, plan[topic["id"]], difficulty)

        planned_topics = [t for t in topics if t["id"] in plan]
        results = await asyncio.gather(*(run(t) for t in planned_topics), return_exceptions=True)

        all_questions: List[Dict] = []
        errors: List[BaseException] = []
        for topic, result in zip(planned_topics, results):
            if isinstance(result, BaseException):
                logger.warning("Exam questions failed for topic %s: %s", topic["id"], result)
                errors.append(result)
                continue
            all_questions.extend(result)

        # A configuration or billing problem fails every topic the same way: report it as such.
        for error in errors:
            if isinstance(error, LLMError) and not error.retryable:
                raise error
        if len(all_questions) < minimum_usable(total_questions):
            if errors:
                raise errors[0]
            raise LLMOutputError(
                f"Exam had {len(all_questions)} usable questions of {total_questions} requested"
            )

        random.shuffle(all_questions)
        return {
            'questions': all_questions,
            'total_questions': len(all_questions),
            'duration_minutes': config.get('duration_minutes', 120),
            'difficulty_level': difficulty,
            'topics_covered': [t['name'] for t in planned_topics],
            'generated_at': datetime.now(UTC).isoformat(),
        }

    async def _fetch_topics(self, project_id: str, topic_ids: List[str]) -> List[Dict]:
        """Fetch topics for the exam."""
        if not topic_ids:
            return []
        topics = await execute_query(
            """
            SELECT id, name, description, keywords
            FROM topics
            WHERE project_id = $1 AND id = ANY($2::text[])
            ORDER BY order_index
            """,
            project_id,
            topic_ids,
        )
        return [dict(topic) for topic in topics]

    async def _generate_topic_questions(
        self,
        topic: Dict,
        type_counts: Dict[str, int],
        difficulty: str,
    ) -> List[Dict]:
        """Questions for one topic, in the planned type mix."""
        chunks = await fetch_topic_chunks(topic["id"])
        if not chunks:
            raise NoSourceMaterialError(f"No source material is mapped to topic {topic['name']}")

        requested = sum(type_counts.values())
        mix = ", ".join(f"{n} {q_type}" for q_type, n in type_counts.items())
        guidance = DIFFICULTY_GUIDANCE.get(difficulty, DIFFICULTY_GUIDANCE['medium'])
        instructions = f"""Write {requested} exam questions on "{topic['name']}" from the excerpts above, for a timed practice exam.

Use exactly this mix: {mix}.
Difficulty: {difficulty}. {guidance}
Each question tests a different concept from the excerpts.

{QUESTION_FORMAT_RULES}
Set difficulty to "{difficulty}"."""

        result = await self.llm.generate_structured(
            content_messages(topic['name'], topic.get('description') or '', chunks, instructions),
            QuestionSet,
            max_tokens=16000,
            purpose="exam_questions",
        )

        remaining = dict(type_counts)
        questions: List[Dict] = []
        for question in result.usable():
            q_type = question["question_type"]
            if remaining.get(q_type, 0) <= 0:
                continue
            remaining[q_type] -= 1
            question['topic_id'] = topic['id']
            question['topic_name'] = topic['name']
            questions.append(question)
        return questions
