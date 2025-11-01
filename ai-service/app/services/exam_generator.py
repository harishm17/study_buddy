"""
Sample exam generator service.
Creates comprehensive exams combining multiple topics.
"""

from typing import List, Dict, Optional
from datetime import datetime

from app.db.connection import execute_query
from app.services.llm.factory import LLMFactory
from app.services.llm.base import LLMMessage
from app.config import settings


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
        Generate a comprehensive exam across multiple topics.

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
        # Fetch topics with their content
        topics = await self._fetch_topics(project_id, topic_ids)

        if not topics:
            raise ValueError(f"No topics found for project {project_id}")

        # Calculate questions per topic
        total_questions = config.get('total_questions', 20)
        questions_per_topic = self._distribute_questions(topics, total_questions)

        # Get question type distribution
        type_dist = config.get('question_type_distribution', {
            'multiple_choice': 60,
            'short_answer': 30,
            'numerical': 10,
        })

        difficulty = config.get('difficulty_level', 'medium')

        # Generate questions for each topic
        all_questions = []
        for topic, question_count in questions_per_topic.items():
            # Fetch relevant chunks for this topic
            chunks = await self._fetch_topic_chunks(topic['id'])

            # Build context
            context = self._build_context(chunks)

            # Generate questions for this topic
            questions = await self._generate_topic_questions(
                topic_name=topic['name'],
                topic_description=topic['description'],
                context=context,
                question_count=question_count,
                type_distribution=type_dist,
                difficulty=difficulty,
            )

            # Tag questions with topic
            for q in questions:
                q['topic_id'] = topic['id']
                q['topic_name'] = topic['name']

            all_questions.extend(questions)

        # Shuffle questions (mix topics)
        import random
        random.shuffle(all_questions)

        return {
            'questions': all_questions,
            'total_questions': len(all_questions),
            'duration_minutes': config.get('duration_minutes', 120),
            'difficulty_level': difficulty,
            'topics_covered': [t['name'] for t in topics],
            'generated_at': datetime.utcnow().isoformat(),
        }

    async def _fetch_topics(self, project_id: str, topic_ids: List[str]) -> List[Dict]:
        """Fetch topics for the exam."""
        if not topic_ids:
            return []
        
        # Build parameterized query safely
        # Create placeholders for IN clause
        placeholders = ', '.join([f'${i+2}' for i in range(len(topic_ids))])

        query = f"""
            SELECT id, name, description, keywords
            FROM topics
            WHERE project_id = $1 AND id = ANY($2::uuid[])
            ORDER BY order_index
        """

        # Use array parameter instead of multiple placeholders for better safety
        topics = await execute_query(query, project_id, topic_ids)
        return [dict(topic) for topic in topics]

    def _distribute_questions(self, topics: List[Dict], total_questions: int) -> Dict:
        """Distribute questions evenly across topics."""
        questions_per_topic = {}
        base_count = total_questions // len(topics)
        remainder = total_questions % len(topics)

        for i, topic in enumerate(topics):
            count = base_count + (1 if i < remainder else 0)
            questions_per_topic[topic['name']] = count

        return {topic['name']: questions_per_topic[topic['name']] for topic in topics}

    async def _fetch_topic_chunks(self, topic_id: str) -> List[Dict]:
        """Fetch relevant chunks for a topic."""
        query = """
            SELECT mc.chunk_text, mc.section_hierarchy
            FROM topic_chunk_mappings tcm
            JOIN material_chunks mc ON tcm.chunk_id = mc.id
            WHERE tcm.topic_id = $1
            ORDER BY tcm.relevance_score DESC
            LIMIT 10
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

    async def _generate_topic_questions(
        self,
        topic_name: str,
        topic_description: str,
        context: str,
        question_count: int,
        type_distribution: Dict,
        difficulty: str,
    ) -> List[Dict]:
        """Generate questions for a single topic."""

        # Calculate how many of each type
        question_types = []
        for q_type, percentage in type_distribution.items():
            count = max(1, round(question_count * percentage / 100))
            question_types.extend([q_type] * count)

        # Trim to exact count
        question_types = question_types[:question_count]

        difficulty_guidance = {
            'easy': 'Create straightforward questions testing basic understanding.',
            'medium': 'Create moderately challenging questions requiring application and analysis.',
            'hard': 'Create complex questions requiring deep understanding and synthesis.',
        }
        guidance = difficulty_guidance.get(difficulty, difficulty_guidance['medium'])

        prompt = f"""You are creating exam questions for a comprehensive assessment.

**Topic:** {topic_name}
**Description:** {topic_description}
**Number of Questions:** {question_count}
**Difficulty:** {difficulty}

{guidance}

**Source Material:**

{context}

**Instructions:**
Create {question_count} diverse questions based on the source material.
Question types needed: {', '.join(set(question_types))}

For MULTIPLE_CHOICE:
{{
  "question_type": "multiple_choice",
  "question_text": "Question here",
  "options": [{{"id": "A", "text": "..."}}, {{"id": "B", "text": "..."}}, {{"id": "C", "text": "..."}}, {{"id": "D", "text": "..."}}],
  "correct_answer": "B",
  "explanation": "Why B is correct",
  "points": 2,
  "difficulty": "{difficulty}"
}}

For SHORT_ANSWER:
{{
  "question_type": "short_answer",
  "question_text": "Question here",
  "sample_answer": "Expected answer",
  "key_points": ["Point 1", "Point 2"],
  "explanation": "Grading guidance",
  "points": 3,
  "difficulty": "{difficulty}"
}}

For NUMERICAL:
{{
  "question_type": "numerical",
  "question_text": "Question here",
  "correct_answer": 42.5,
  "unit": "units",
  "tolerance": 0.1,
  "explanation": "Solution steps",
  "points": 3,
  "difficulty": "{difficulty}"
}}

For TRUE_FALSE:
{{
  "question_type": "true_false",
  "question_text": "Statement here",
  "correct_answer": true,
  "explanation": "Why true/false",
  "points": 1,
  "difficulty": "{difficulty}"
}}

Return a JSON array of {question_count} questions:"""

        if settings.is_development:
            return self._generate_mock_questions(topic_name, question_count, question_types, difficulty)

        messages = [LLMMessage(role="user", content=prompt)]

        response = await self.llm.generate_structured(
            messages=messages,
            temperature=0.6,
            use_mini=False
        )

        return response.get('questions', [])

    def _generate_mock_questions(
        self,
        topic_name: str,
        question_count: int,
        question_types: List[str],
        difficulty: str
    ) -> List[Dict]:
        """Generate mock questions for development."""
        questions = []

        for i in range(question_count):
            q_type = question_types[i % len(question_types)]

            if q_type == 'multiple_choice':
                questions.append({
                    "question_type": "multiple_choice",
                    "question_text": f"Which concept is most important in {topic_name}?",
                    "options": [
                        {"id": "A", "text": "Concept A"},
                        {"id": "B", "text": "Concept B (Correct)"},
                        {"id": "C", "text": "Concept C"},
                        {"id": "D", "text": "Concept D"}
                    ],
                    "correct_answer": "B",
                    "explanation": f"Concept B is fundamental to {topic_name}.",
                    "points": 2,
                    "difficulty": difficulty
                })
            elif q_type == 'short_answer':
                questions.append({
                    "question_type": "short_answer",
                    "question_text": f"Explain the key principle of {topic_name}.",
                    "sample_answer": f"The key principle involves understanding the relationship between components and applying systematic methods.",
                    "key_points": ["Relationship between components", "Systematic methods", "Practical application"],
                    "explanation": "Answer should cover main concepts and applications.",
                    "points": 3,
                    "difficulty": difficulty
                })
            elif q_type == 'numerical':
                questions.append({
                    "question_type": "numerical",
                    "question_text": f"Calculate the result for {topic_name} given A=10, B=5.",
                    "correct_answer": 50.0,
                    "unit": "units",
                    "tolerance": 0.5,
                    "explanation": "Result = A × B = 10 × 5 = 50",
                    "points": 3,
                    "difficulty": difficulty
                })
            else:  # true_false
                questions.append({
                    "question_type": "true_false",
                    "question_text": f"{topic_name} requires consideration of multiple variables.",
                    "correct_answer": True,
                    "explanation": f"True, {topic_name} involves multiple interconnected factors.",
                    "points": 1,
                    "difficulty": difficulty
                })

        return questions
