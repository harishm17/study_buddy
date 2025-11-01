"""
Exam grader service.
Grades student exam submissions using AI for open-ended questions.
"""

from typing import List, Dict, Any
from datetime import datetime

from app.services.llm.factory import LLMFactory
from app.services.llm.base import LLMMessage
from app.config import settings


class ExamGrader:
    """Grade exam submissions with AI assistance."""

    def __init__(self):
        self.llm = LLMFactory.get_provider()

    async def grade_submission(
        self,
        submission_id: str,
        questions: List[Dict],
        answers: Dict[str, Any],
    ) -> Dict:
        """
        Grade an exam submission.

        Args:
            submission_id: Submission ID
            questions: List of exam questions
            answers: Student's answers (map of question index -> answer)

        Returns:
            Dict with grading results and feedback
        """
        graded_questions = []
        total_points = 0
        earned_points = 0

        for idx, question in enumerate(questions):
            question_idx = str(idx)
            student_answer = answers.get(question_idx)

            if student_answer is None:
                # Unanswered question
                graded_questions.append({
                    'question_index': idx,
                    'question_text': question['question_text'],
                    'question_type': question['question_type'],
                    'points_possible': question.get('points', 1),
                    'points_earned': 0,
                    'is_correct': False,
                    'student_answer': None,
                    'feedback': 'Question not answered',
                })
                total_points += question.get('points', 1)
                continue

            # Grade based on question type
            if question['question_type'] == 'multiple_choice':
                result = self._grade_multiple_choice(question, student_answer)
            elif question['question_type'] == 'true_false':
                result = self._grade_true_false(question, student_answer)
            elif question['question_type'] == 'numerical':
                result = self._grade_numerical(question, student_answer)
            elif question['question_type'] == 'short_answer':
                result = await self._grade_short_answer(question, student_answer)
            else:
                result = {
                    'points_earned': 0,
                    'is_correct': False,
                    'feedback': 'Unknown question type',
                }

            graded_questions.append({
                'question_index': idx,
                'question_text': question['question_text'],
                'question_type': question['question_type'],
                'points_possible': question.get('points', 1),
                'points_earned': result['points_earned'],
                'is_correct': result['is_correct'],
                'student_answer': student_answer,
                'feedback': result['feedback'],
                'correct_answer': question.get('correct_answer') if question['question_type'] != 'short_answer' else None,
            })

            total_points += question.get('points', 1)
            earned_points += result['points_earned']

        overall_score = (earned_points / total_points * 100) if total_points > 0 else 0

        return {
            'submission_id': submission_id,
            'graded_questions': graded_questions,
            'total_points': total_points,
            'earned_points': earned_points,
            'overall_score': round(overall_score, 2),
            'graded_at': datetime.utcnow().isoformat(),
        }

    def _grade_multiple_choice(self, question: Dict, student_answer: str) -> Dict:
        """Grade a multiple choice question."""
        correct_answer = question.get('correct_answer', '')
        is_correct = student_answer.strip().upper() == correct_answer.strip().upper()

        points = question.get('points', 1) if is_correct else 0

        feedback = question.get('explanation', '')
        if not is_correct:
            feedback = f"Incorrect. The correct answer is {correct_answer}. {feedback}"
        else:
            feedback = f"Correct! {feedback}"

        return {
            'points_earned': points,
            'is_correct': is_correct,
            'feedback': feedback,
        }

    def _grade_true_false(self, question: Dict, student_answer: any) -> Dict:
        """Grade a true/false question."""
        correct_answer = question.get('correct_answer', False)
        
        # Normalize student answer to boolean
        # Handle string inputs like "true", "false", "True", etc.
        if isinstance(student_answer, str):
            normalized_answer = student_answer.lower().strip() in ('true', '1', 'yes', 't')
        elif isinstance(student_answer, bool):
            normalized_answer = student_answer
        elif isinstance(student_answer, (int, float)):
            normalized_answer = bool(student_answer)
        else:
            normalized_answer = False
        
        # Ensure correct_answer is boolean
        if isinstance(correct_answer, str):
            correct_answer = correct_answer.lower().strip() in ('true', '1', 'yes', 't')
        else:
            correct_answer = bool(correct_answer)
        
        is_correct = normalized_answer == correct_answer

        points = question.get('points', 1) if is_correct else 0

        feedback = question.get('explanation', '')
        if not is_correct:
            feedback = f"Incorrect. The correct answer is {correct_answer}. {feedback}"
        else:
            feedback = f"Correct! {feedback}"

        return {
            'points_earned': points,
            'is_correct': is_correct,
            'feedback': feedback,
        }

    def _grade_numerical(self, question: Dict, student_answer: float) -> Dict:
        """Grade a numerical question."""
        correct_answer = question.get('correct_answer', 0)
        tolerance = question.get('tolerance', 0)

        try:
            student_value = float(student_answer)
            is_correct = abs(student_value - correct_answer) <= tolerance
        except (ValueError, TypeError):
            is_correct = False

        points = question.get('points', 1) if is_correct else 0

        feedback = question.get('explanation', '')
        if not is_correct:
            feedback = f"Incorrect. The correct answer is {correct_answer}. {feedback}"
        else:
            feedback = f"Correct! {feedback}"

        return {
            'points_earned': points,
            'is_correct': is_correct,
            'feedback': feedback,
        }

    async def _grade_short_answer(self, question: Dict, student_answer: str) -> Dict:
        """Grade a short answer question using AI."""
        if settings.is_development:
            # Mock grading in development
            return {
                'points_earned': question.get('points', 3) * 0.8,  # 80% score
                'is_correct': True,
                'feedback': '[DEV MODE] Your answer demonstrates good understanding of the key concepts.',
            }

        sample_answer = question.get('sample_answer', '')
        key_points = question.get('key_points', [])
        max_points = question.get('points', 3)

        prompt = f"""You are grading a student's short answer response.

**Question:** {question['question_text']}

**Sample Answer:** {sample_answer}

**Key Points to Look For:**
{chr(10).join(f"- {point}" for point in key_points)}

**Student's Answer:**
{student_answer}

**Grading Instructions:**
1. Award up to {max_points} points based on:
   - Accuracy and correctness
   - Completeness (covering key points)
   - Clarity and coherence
2. Be fair but rigorous
3. Give partial credit for partially correct answers
4. Provide constructive feedback

Return a JSON object:
{{
  "points_earned": <number between 0 and {max_points}>,
  "is_correct": <true if points >= {max_points * 0.7}, false otherwise>,
  "feedback": "<2-3 sentences explaining the grade and what was good/missing>"
}}"""

        messages = [LLMMessage(role="user", content=prompt)]

        try:
            response = await self.llm.generate_structured(
                messages=messages,
                temperature=0.3,
                use_mini=True  # Use faster model for grading
            )

            return {
                'points_earned': response.get('points_earned', 0),
                'is_correct': response.get('is_correct', False),
                'feedback': response.get('feedback', 'Graded by AI'),
            }
        except Exception as e:
            print(f"Error grading short answer: {e}")
            # Fallback to partial credit
            return {
                'points_earned': max_points * 0.5,
                'is_correct': False,
                'feedback': 'Unable to fully grade this response. Please review with your instructor.',
            }
