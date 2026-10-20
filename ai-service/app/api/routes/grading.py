"""Synchronous grading for quizzes and voice drills.

The caller (the Next.js server) loads the questions, with their answer keys, from its own
database and sends them here with the student's answers. The browser never calls this
route, and nothing here reads keys from anywhere else.
"""
import math
from typing import Any, Dict, List, Literal, Optional, Union

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.services.exam_grader import ExamGrader

router = APIRouter(prefix="/grade")

MAX_QUESTIONS = 100
MAX_ANSWER_CHARS = 5000

AnswerValue = Union[str, int, float, bool, None]


class GradableQuestion(BaseModel):
    """A stored question. Extra fields (options, sample_answer, key_points...) pass through."""

    model_config = ConfigDict(extra="allow")

    question_type: Literal["multiple_choice", "true_false", "numerical", "short_answer"]
    question_text: str
    points: float = 1

    @field_validator("points", mode="before")
    @classmethod
    def _usable_points(cls, value: Any) -> float:
        try:
            points = float(value)
        except (TypeError, ValueError):
            return 1
        return points if math.isfinite(points) and points > 0 else 1


class GradeQuizRequest(BaseModel):
    questions: List[GradableQuestion] = Field(min_length=1, max_length=MAX_QUESTIONS)
    answers: Dict[str, AnswerValue] = Field(default_factory=dict, description="question index -> answer")

    @field_validator("answers")
    @classmethod
    def _short_answers(cls, answers: Dict[str, AnswerValue]) -> Dict[str, AnswerValue]:
        for answer in answers.values():
            if isinstance(answer, str) and len(answer) > MAX_ANSWER_CHARS:
                raise ValueError(f"answers are limited to {MAX_ANSWER_CHARS} characters")
        return answers


class GradeQuizResponse(BaseModel):
    graded_questions: List[Dict[str, Any]]
    total_points: float
    earned_points: float
    overall_score: float
    # True when a short answer could not be graded (model failure). The caller should not
    # store the attempt: those answers scored 0 only because grading was unavailable.
    needs_review: bool
    graded_at: Optional[str] = None


@router.post("/quiz", response_model=GradeQuizResponse)
async def grade_quiz(payload: GradeQuizRequest) -> GradeQuizResponse:
    """Grade answers against the supplied questions: by rule where possible, Claude for short answers."""
    result = await ExamGrader().grade_submission(
        "quiz",
        [question.model_dump() for question in payload.questions],
        dict(payload.answers),
    )
    return GradeQuizResponse(
        graded_questions=result["graded_questions"],
        total_points=result["total_points"],
        earned_points=result["earned_points"],
        overall_score=result["overall_score"],
        needs_review=any(q.get("needs_review") for q in result["graded_questions"]),
        graded_at=result["graded_at"],
    )
