"""Output schemas for every structured LLM call.

Claude's structured outputs constrain the response to these schemas. Rules the JSON
schema cannot express (an MCQ answer must be one of its options, a numerical answer
must be a number) are checked in code after parsing, per item, so one bad question
is dropped instead of failing the whole set.
"""
import math
import random
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field

QuestionType = Literal["multiple_choice", "short_answer", "numerical", "true_false"]


def _clean_list(values: List[str]) -> List[str]:
    return [value.strip() for value in values if value and value.strip()]


def _as_bool(value: Any) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    if isinstance(value, str) and value.strip().lower() in {"true", "false"}:
        return value.strip().lower() == "true"
    return None


def _as_number(value: Any) -> Optional[float]:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
    elif isinstance(value, str):
        try:
            number = float(value.replace(",", "").strip())
        except ValueError:
            return None
    else:
        return None
    return number if math.isfinite(number) else None


# ---------------------------------------------------------------- questions


class ChoiceOption(BaseModel):
    id: str = Field(description="Option letter: A, B, C or D")
    text: str


class GeneratedQuestion(BaseModel):
    """One quiz or exam question. Fields that do not apply to the type are left out."""

    question_type: QuestionType
    question_text: str
    options: List[ChoiceOption] = Field(
        default_factory=list, description="multiple_choice only: exactly 4 options A-D"
    )
    correct_answer: Union[str, float, bool, None] = Field(
        default=None,
        description=(
            "multiple_choice: the correct option id; numerical: a number; "
            "true_false: a boolean; short_answer: omit"
        ),
    )
    sample_answer: Optional[str] = Field(default=None, description="short_answer only")
    key_points: List[str] = Field(default_factory=list, description="short_answer only")
    unit: Optional[str] = Field(default=None, description="numerical only")
    tolerance: Optional[float] = Field(
        default=None, description="numerical only: accepted absolute difference"
    )
    explanation: str
    points: int = Field(default=1, description="1-5, by complexity")
    difficulty: Optional[str] = None
    concepts_tested: List[str] = Field(default_factory=list)

    def normalized(self) -> Optional[Dict[str, Any]]:
        """The stored question dict, or None when the question is unusable."""
        text = self.question_text.strip()
        if not text or not self.explanation.strip():
            return None
        stored: Dict[str, Any] = {
            "question_type": self.question_type,
            "question_text": text,
            "explanation": self.explanation.strip(),
            "points": min(max(int(self.points or 1), 1), 5),
            "concepts_tested": _clean_list(self.concepts_tested),
        }
        if self.difficulty:
            stored["difficulty"] = self.difficulty

        if self.question_type == "multiple_choice":
            options = [o for o in self.options if o.id.strip() and o.text.strip()]
            ids = [o.id.strip().upper() for o in options]
            answer = str(self.correct_answer or "").strip().upper()
            texts = [o.text.strip().lower() for o in options]
            if len(options) < 3 or len(set(ids)) != len(ids) or len(set(texts)) != len(texts) or answer not in ids:
                return None
            stored["options"] = [{"id": o.id.strip().upper(), "text": o.text.strip()} for o in options]
            stored["correct_answer"] = answer
        elif self.question_type == "true_false":
            answer = _as_bool(self.correct_answer)
            if answer is None:
                return None
            stored["correct_answer"] = answer
        elif self.question_type == "numerical":
            answer = _as_number(self.correct_answer)
            if answer is None:
                return None
            stored["correct_answer"] = answer
            if self.unit:
                stored["unit"] = self.unit.strip()
            if self.tolerance is not None and math.isfinite(self.tolerance):
                stored["tolerance"] = abs(self.tolerance)
        else:  # short_answer
            sample = (self.sample_answer or "").strip()
            key_points = _clean_list(self.key_points)
            if not sample or not key_points:
                return None
            stored["sample_answer"] = sample
            stored["key_points"] = key_points
        return stored


def shuffle_choice_options(question: Dict[str, Any], rng: Optional[random.Random] = None) -> Dict[str, Any]:
    """Shuffle a multiple-choice question's options and relabel them A, B, C...

    Models put the right answer in the same slot far more often than chance would, so
    the stored key is reshuffled. Other question types are returned unchanged.
    """
    options = question.get("options")
    if question.get("question_type") != "multiple_choice" or not options:
        return question
    rng = rng or random
    correct_text = next(o["text"] for o in options if o["id"] == question["correct_answer"])
    texts = [o["text"] for o in options]
    rng.shuffle(texts)
    labels = [chr(ord("A") + i) for i in range(len(texts))]
    question["options"] = [{"id": label, "text": text} for label, text in zip(labels, texts)]
    question["correct_answer"] = labels[texts.index(correct_text)]
    return question


class QuestionSet(BaseModel):
    questions: List[GeneratedQuestion]

    def usable(self) -> List[Dict[str, Any]]:
        """Valid questions in stored form, with multiple-choice options shuffled."""
        return [
            shuffle_choice_options(q)
            for q in (item.normalized() for item in self.questions)
            if q is not None
        ]

    @classmethod
    def example(cls) -> "QuestionSet":
        """Enough distinct questions of every type that a mock run meets any quiz or exam plan."""
        per_type = 6
        questions: List[GeneratedQuestion] = []
        for n in range(1, per_type + 1):
            correct = "ABCD"[n % 4]
            questions.append(
                GeneratedQuestion(
                    question_type="multiple_choice",
                    question_text=f"Which statement ({n}) best describes the topic? (mock)",
                    options=[
                        ChoiceOption(
                            id=letter,
                            text=(
                                f"The central idea of the topic, version {n}"
                                if letter == correct
                                else f"Distractor {letter} for question {n}"
                            ),
                        )
                        for letter in "ABCD"
                    ],
                    correct_answer=correct,
                    explanation=f"{correct} restates the main idea. (mock output)",
                    points=2,
                )
            )
        for n in range(1, per_type + 1):
            questions.append(
                GeneratedQuestion(
                    question_type="true_false",
                    question_text=f"Statement {n}: the topic builds on earlier material. (mock)",
                    correct_answer=n % 2 == 1,
                    explanation="See the course notes. (mock output)",
                )
            )
        for n in range(1, per_type + 1):
            questions.append(
                GeneratedQuestion(
                    question_type="short_answer",
                    question_text=f"Explain key principle {n} in two sentences. (mock)",
                    sample_answer=f"Principle {n} links the main components. (mock)",
                    key_points=[f"Names principle {n}", "Links the components"],
                    explanation="A full answer names the principle and how the parts relate.",
                    points=3,
                )
            )
        for n in range(1, per_type + 1):
            questions.append(
                GeneratedQuestion(
                    question_type="numerical",
                    question_text=f"Compute {n + 1} x 7. (mock)",
                    correct_answer=(n + 1) * 7,
                    tolerance=0,
                    explanation=f"{n + 1} x 7 = {(n + 1) * 7}. (mock output)",
                    points=2,
                )
            )
        return cls(questions=questions)


# ---------------------------------------------------------------- examples


class SolutionStep(BaseModel):
    step_number: int
    description: str
    work: str
    explanation: str


class SolvedExample(BaseModel):
    title: str
    problem_statement: str
    solution_steps: List[SolutionStep]
    final_answer: str
    key_concepts: List[str] = Field(default_factory=list)
    difficulty: Optional[str] = None

    def usable(self) -> bool:
        return bool(self.title.strip() and self.problem_statement.strip() and self.solution_steps)


class SolvedExampleSet(BaseModel):
    examples: List[SolvedExample]

    @classmethod
    def example(cls) -> "SolvedExampleSet":
        return cls(
            examples=[
                SolvedExample(
                    title="Worked example (mock)",
                    problem_statement="Apply the main rule to a small case. (mock)",
                    solution_steps=[
                        SolutionStep(
                            step_number=1,
                            description="Identify the rule",
                            work="Rule: $a + b = c$",
                            explanation="The problem asks for c.",
                        )
                    ],
                    final_answer="- c follows from the rule (mock)",
                    key_concepts=["Main rule"],
                )
            ]
        )


class InteractiveStep(BaseModel):
    step_number: int
    question: str
    hint: str
    answer_type: Literal["numeric", "text", "multiple_choice"]
    correct_answer: str
    acceptable_answers: List[str] = Field(default_factory=list)
    explanation: str
    feedback_correct: str
    feedback_incorrect: str


class InteractiveExample(BaseModel):
    title: str
    problem_statement: str
    steps: List[InteractiveStep]
    key_concepts: List[str] = Field(default_factory=list)
    difficulty: Optional[str] = None
    estimated_time_minutes: int = 10

    def usable(self) -> bool:
        return bool(self.title.strip() and self.problem_statement.strip() and self.steps)


class InteractiveExampleSet(BaseModel):
    examples: List[InteractiveExample]

    @classmethod
    def example(cls) -> "InteractiveExampleSet":
        return cls(
            examples=[
                InteractiveExample(
                    title="Practice problem (mock)",
                    problem_statement="Work through one step. (mock)",
                    steps=[
                        InteractiveStep(
                            step_number=1,
                            question="What is 2 + 2?",
                            hint="Count up from 2.",
                            answer_type="numeric",
                            correct_answer="4",
                            acceptable_answers=["four"],
                            explanation="2 + 2 = 4.",
                            feedback_correct="Correct.",
                            feedback_incorrect="Try counting again.",
                        )
                    ],
                    key_concepts=["Addition"],
                )
            ]
        )


# ---------------------------------------------------------------- topics, validation, grading


class TopicOutput(BaseModel):
    name: str = Field(description="2-5 words")
    description: str = Field(description="1-2 sentences")
    keywords: List[str] = Field(description="3-8 search keywords")


class TopicList(BaseModel):
    topics: List[TopicOutput]

    @classmethod
    def example(cls) -> "TopicList":
        return cls(
            topics=[
                TopicOutput(
                    name="Core Concepts (mock)",
                    description="The main ideas in the uploaded material. (mock output)",
                    keywords=["core", "concepts", "overview"],
                ),
                TopicOutput(
                    name="Applications (mock)",
                    description="Where the ideas are used. (mock output)",
                    keywords=["applications", "examples", "practice"],
                ),
            ]
        )


class MaterialCheck(BaseModel):
    is_valid: bool = Field(description="True when this is readable course material for the category")
    notes: str = Field(description="One or two sentences")

    @classmethod
    def example(cls) -> "MaterialCheck":
        return cls(is_valid=True, notes="Mock validation: accepted without a model call.")


class ShortAnswerGrade(BaseModel):
    points_earned: float
    feedback: str = Field(description="2-3 sentences on what was good and what was missing")

    @classmethod
    def example(cls) -> "ShortAnswerGrade":
        return cls(points_earned=0, feedback="Mock grading: no model call was made.")


class DrillQuestion(BaseModel):
    question_text: str
    key_points: List[str]
    sample_answer: str
    explanation: str
    concepts_tested: List[str] = Field(default_factory=list)


class DrillQuestionSet(BaseModel):
    questions: List[DrillQuestion]

    @classmethod
    def example(cls) -> "DrillQuestionSet":
        return cls(
            questions=[
                DrillQuestion(
                    question_text=f"In your own words, what is idea {n}? (mock)",
                    key_points=["Defines the idea", "Gives one reason it matters"],
                    sample_answer="A short spoken explanation. (mock)",
                    explanation="Look for a definition and a reason.",
                    concepts_tested=["Definitions"],
                )
                for n in range(1, 6)
            ]
        )
