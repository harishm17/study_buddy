"""Output schemas for every structured LLM call.

Claude's structured outputs constrain the response to these schemas. Rules the JSON
schema cannot express (an MCQ answer must be one of its options, a numerical answer
must be a number) are checked in code after parsing, per item, so one bad question
is dropped instead of failing the whole set.
"""
import math
import random
import re
from typing import Any, Dict, List, Literal, Optional, Sequence, Union

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


def _excerpt_indexes(values: Any) -> List[int]:
    """Clean 1-based excerpt indexes: positive integers, once each, in the order given."""
    cleaned: List[int] = []
    for value in values or []:
        number = _as_number(value)
        if number is not None and number >= 1 and float(number).is_integer() and int(number) not in cleaned:
            cleaned.append(int(number))
    return cleaned


SOURCE_EXCERPTS_HELP = (
    "1-based indexes of the source excerpts this is based on (the index attribute of each excerpt)"
)


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
    source_excerpts: List[int] = Field(default_factory=list, description=SOURCE_EXCERPTS_HELP)

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
        excerpts = _excerpt_indexes(self.source_excerpts)
        if excerpts:
            # The generator turns these into `sources` (file and pages) before anything is stored.
            stored["source_excerpts"] = excerpts

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


# Spans the letter rewrite leaves alone: math (an event called A is not option A) and code.
_PROTECTED_SPAN = re.compile(r"\$\$.*?\$\$|\$[^$\n]+\$|`[^`\n]*`", re.DOTALL)
# Placeholders hold the new letter's index as a digit, so no later pattern can match them.
_MARK_OPEN, _MARK_CLOSE = "", ""
_MARK = re.compile(f"{_MARK_OPEN}(\\d+){_MARK_CLOSE}")
_LETTER = re.compile(r"[A-D]")

# "Option C", "choice (B)", "Options A and C": the letters after the word.
_NAMED_OPTION = re.compile(
    r"\b((?:[Oo]ptions?|[Cc]hoices?|[Aa]nswers?)\s+)"
    r"(\(?[A-D]\)?(?:\s*(?:,|and|or|&|/)\s*\(?[A-D]\)?)*)(?![A-Za-z])"
)
# "(C)" on its own, but not the A in P(A).
_PAREN_LETTER = re.compile(r"(?<![\w$\\])\(([A-D])\)(?!\w)")
# "C) text" at the start of a line.
_LINE_LETTER = re.compile(r"(?m)^(\s*(?:[-*]\s+)?)([A-D])\)")
# "D is the addition rule", "B describes disjoint events".
_LETTER_VERB = re.compile(
    r"(?<![\w$\\'.])([A-D])"
    r"(?=\s+(?:is|isn't|isn’t|describes|gives|states|shows|represents|restates|matches|would|correctly)\b)"
)


def rewrite_option_letters(text: str, mapping: Dict[str, str]) -> str:
    """Point option-letter references in `text` at the options' new letters.

    Every reference becomes a placeholder first and the new letter only at the end, so
    A->C and C->A cannot collide. Math and code spans are left as they are.
    """
    old_letters = list(mapping)

    def hold(letter: str) -> str:
        if letter not in mapping:
            return letter
        return f"{_MARK_OPEN}{old_letters.index(letter)}{_MARK_CLOSE}"

    def rewrite(chunk: str) -> str:
        chunk = _NAMED_OPTION.sub(
            lambda m: m.group(1) + _LETTER.sub(lambda letter: hold(letter.group(0)), m.group(2)), chunk
        )
        chunk = _PAREN_LETTER.sub(lambda m: f"({hold(m.group(1))})", chunk)
        chunk = _LINE_LETTER.sub(lambda m: f"{m.group(1)}{hold(m.group(2))})", chunk)
        return _LETTER_VERB.sub(lambda m: hold(m.group(1)), chunk)

    parts: List[str] = []
    last = 0
    for span in _PROTECTED_SPAN.finditer(text):
        parts.append(rewrite(text[last : span.start()]))
        parts.append(span.group(0))
        last = span.end()
    parts.append(rewrite(text[last:]))
    return _MARK.sub(lambda m: mapping[old_letters[int(m.group(1))]], "".join(parts))


def shuffle_choice_options(
    question: Dict[str, Any],
    rng: Optional[random.Random] = None,
    *,
    multiple_choice: bool = False,
    letter_fields: Sequence[str] = ("explanation",),
) -> Dict[str, Any]:
    """Shuffle a multiple-choice question's options and relabel them A, B, C...

    Models put the right answer in the same slot far more often than chance would, so
    the stored key is reshuffled. The explanation (and any per-option feedback) was written
    against the old letters, so letter references in it are moved to the new ones. Other
    question types are returned unchanged. `multiple_choice=True` treats a dict without a
    question_type (a practice step) as multiple choice; `letter_fields` are the text fields whose
    letter references are rewritten.
    """
    options = question.get("options")
    if not options or not (multiple_choice or question.get("question_type") == "multiple_choice"):
        return question
    rng = rng or random
    order = list(range(len(options)))
    rng.shuffle(order)
    labels = [chr(ord("A") + i) for i in range(len(options))]
    mapping = {options[old]["id"]: labels[new] for new, old in enumerate(order)}
    question["options"] = [{**options[old], "id": labels[new]} for new, old in enumerate(order)]
    for option in question["options"]:
        if option.get("feedback"):
            option["feedback"] = rewrite_option_letters(option["feedback"], mapping)
    question["correct_answer"] = mapping[question["correct_answer"]]
    for field in letter_fields:
        if question.get(field):
            question[field] = rewrite_option_letters(question[field], mapping)
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
                    source_excerpts=[1],
                )
            )
        for n in range(1, per_type + 1):
            questions.append(
                GeneratedQuestion(
                    question_type="true_false",
                    question_text=f"Statement {n}: the topic builds on earlier material. (mock)",
                    correct_answer=n % 2 == 1,
                    explanation="See the course notes. (mock output)",
                    source_excerpts=[1],
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
                    source_excerpts=[1],
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
                    source_excerpts=[1],
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
    source_excerpts: List[int] = Field(default_factory=list, description=SOURCE_EXCERPTS_HELP)

    def usable(self) -> bool:
        return bool(self.title.strip() and self.problem_statement.strip() and self.solution_steps)

    def stored(self) -> Optional[Dict[str, Any]]:
        """The stored example dict, or None when it is unusable."""
        if not self.usable():
            return None
        stored = self.model_dump()
        stored["source_excerpts"] = _excerpt_indexes(self.source_excerpts)
        return stored


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
                    source_excerpts=[1],
                )
            ]
        )


MIN_CHOICE_OPTIONS = 2
MAX_CHOICE_OPTIONS = 5

# "A) text", "B. text", "(C) text", "- D: text" at the start of a line.
_OPTION_LINE = re.compile(r"^\s*(?:[-*]\s*)?\(?([A-H])[).:]\s+(.+?)\s*$")


def split_option_lines(question: str) -> tuple[str, List[Dict[str, str]]]:
    """(question without its option lines, the options) when a step wrote its options into the
    question text as "A) ..." lines. The options are empty when there are fewer than two."""
    stem: List[str] = []
    options: List[Dict[str, str]] = []
    for line in question.split("\n"):
        match = _OPTION_LINE.match(line)
        if match:
            options.append({"id": match.group(1).upper(), "text": match.group(2).strip()})
        else:
            stem.append(line)
    if len(options) < MIN_CHOICE_OPTIONS:
        return question, []
    return "\n".join(stem).strip(), options


def _choice_key(answer: str, options: List[Dict[str, str]]) -> Optional[str]:
    """The option id a multiple-choice key names: "B", "b)", "B) text" or the option's text."""
    ids = {option["id"] for option in options}
    cleaned = answer.strip().strip("()").strip().upper()
    if cleaned in ids:
        return cleaned
    lettered = re.match(r"^\(?([A-H])[).:]", answer.strip().upper())
    if lettered and lettered.group(1) in ids:
        return lettered.group(1)
    for option in options:
        if option["text"].strip().lower() == answer.strip().lower():
            return option["id"]
    return None


class InteractiveStep(BaseModel):
    step_number: int
    question: str = Field(
        description="The question only. For multiple_choice put the choices in `options`, not in this text"
    )
    hint: str
    answer_type: Literal["numeric", "text", "multiple_choice"] = Field(
        description=(
            "numeric for anything that is a number (counts, probabilities, fractions, results of "
            "arithmetic); multiple_choice when the student picks from options; text only for a short "
            "canonical word, term or expression"
        )
    )
    options: List[ChoiceOption] = Field(
        default_factory=list,
        description=(
            "multiple_choice only: 2 to 5 options with ids A, B, C. Required for multiple_choice, "
            "empty for the other types"
        ),
    )
    correct_answer: str = Field(
        description="numeric: the number as a plain decimal or fraction; multiple_choice: the option id; text: short and canonical"
    )
    acceptable_answers: List[str] = Field(
        default_factory=list,
        description="Other forms of the same answer, one form per entry (never a comma-separated list)",
    )
    tolerance: Optional[float] = Field(
        default=None,
        description=(
            "numeric only: accepted absolute difference, such as 0.005 for a probability asked to "
            "3 decimals; 0 only for exact integers"
        ),
    )
    explanation: str
    feedback_correct: str
    feedback_incorrect: str

    def normalized(self) -> Optional[Dict[str, Any]]:
        """The stored step dict, or None when the step cannot be used.

        A multiple_choice step needs 2 to 5 options and a key that names one of them. Options
        written into the question as "A) ..." lines are moved into `options`. The options are
        shuffled (models favour one letter) and letter references in the explanation and the
        feedback follow them, as for quiz questions.
        """
        question = self.question.strip()
        correct = self.correct_answer.strip()
        if not question or not correct:
            return None
        stored: Dict[str, Any] = {
            "step_number": self.step_number,
            "question": question,
            "hint": self.hint.strip(),
            "answer_type": self.answer_type,
            "correct_answer": correct,
            "acceptable_answers": _clean_list(self.acceptable_answers),
            "explanation": self.explanation.strip(),
            "feedback_correct": self.feedback_correct.strip(),
            "feedback_incorrect": self.feedback_incorrect.strip(),
        }
        if self.answer_type == "numeric":
            if self.tolerance is not None and math.isfinite(self.tolerance):
                stored["tolerance"] = abs(self.tolerance)
            return stored
        if self.answer_type != "multiple_choice":
            return stored

        options = [
            {"id": o.id.strip().upper(), "text": o.text.strip()}
            for o in self.options
            if o.id.strip() and o.text.strip()
        ]
        if len(options) < MIN_CHOICE_OPTIONS:
            question, options = split_option_lines(question)
            if not options:
                return None
            stored["question"] = question
        ids = [option["id"] for option in options]
        texts = [option["text"].lower() for option in options]
        if len(options) > MAX_CHOICE_OPTIONS or len(set(ids)) != len(ids) or len(set(texts)) != len(texts):
            return None
        key = _choice_key(correct, options)
        if key is None:
            return None
        stored["options"] = options
        stored["correct_answer"] = key
        return shuffle_choice_options(
            stored,
            multiple_choice=True,
            letter_fields=("explanation", "feedback_correct", "feedback_incorrect"),
        )


class InteractiveExample(BaseModel):
    title: str
    problem_statement: str
    steps: List[InteractiveStep]
    key_concepts: List[str] = Field(default_factory=list)
    difficulty: Optional[str] = None
    estimated_time_minutes: int = 10
    source_excerpts: List[int] = Field(default_factory=list, description=SOURCE_EXCERPTS_HELP)

    def usable(self) -> bool:
        return bool(self.title.strip() and self.problem_statement.strip() and self.steps)

    def stored(self) -> Optional[Dict[str, Any]]:
        """The stored problem dict, or None. One step that cannot be used (a multiple_choice step
        without options, say) makes the whole problem unusable, because steps build on each other."""
        if not self.usable():
            return None
        steps = [step.normalized() for step in self.steps]
        if any(step is None for step in steps):
            return None
        stored = self.model_dump()
        stored["steps"] = steps
        stored["source_excerpts"] = _excerpt_indexes(self.source_excerpts)
        return stored


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
                    source_excerpts=[1],
                )
            ]
        )


# ---------------------------------------------------------------- topics, validation, grading


class PlannedTopic(BaseModel):
    key: str = Field(description="Short unique id for this topic within the plan, such as t1, t2")
    name: str = Field(description="2-6 words, specific")
    description: str = Field(description="One sentence")
    objectives: List[str] = Field(
        description=(
            "3-5 things the student can do after the topic, each a verb phrase that finishes "
            "'By the end you can ...' (for example: compute a posterior with Bayes' rule)"
        )
    )
    keywords: List[str] = Field(description="3-8 search keywords")
    section_ids: List[str] = Field(description="Ids of the outline sections this topic is taught from")
    prerequisite_keys: List[str] = Field(
        description=(
            "Keys of EARLIER topics in this plan that a student must know before this one "
            "(usually one or two; for example Bayes' theorem builds on conditional probability). "
            "Empty only for the first topic or one that needs nothing earlier"
        )
    )
    estimated_minutes: int = Field(description="Minutes to study the topic, 10-90")


class PlannedUnit(BaseModel):
    title: str = Field(description="2-6 words")
    week_label: Optional[str] = Field(
        default=None, description="'Week 3' or 'Class 11' when the syllabus or calendar says so"
    )
    summary: str = Field(description="One sentence")
    existing_unit_key: Optional[str] = Field(
        default=None,
        description="Only when adding to a course that already has units: the key (U1, U2...) of the unit these topics join",
    )
    topics: List[PlannedTopic]


class SectionAddition(BaseModel):
    topic_key: str = Field(description="Key (E1, E2...) of an existing topic")
    section_ids: List[str]


class CoursePlan(BaseModel):
    """What the course planner returns: units of topics, each topic taught from outline sections."""

    units: List[PlannedUnit]
    additions: List[SectionAddition] = Field(
        default_factory=list,
        description="Only when adding to an existing course: new sections that join an existing topic",
    )

    @classmethod
    def example(cls) -> "CoursePlan":
        return cls(
            units=[
                PlannedUnit(
                    title="Core ideas (mock)",
                    summary="The main ideas of the material. (mock output)",
                    topics=[
                        PlannedTopic(
                            key="t1",
                            name="Core Concepts (mock)",
                            description="The main ideas in the uploaded material. (mock output)",
                            objectives=["explain the core idea", "apply it to a small case", "spot a common mistake"],
                            keywords=["core", "concepts", "overview"],
                            section_ids=[],
                            prerequisite_keys=[],
                            estimated_minutes=20,
                        )
                    ],
                )
            ]
        )

    @classmethod
    def example_for(cls, prompt: str) -> "CoursePlan":
        """A plan for the sections in `prompt` (the mock provider's answer): one unit per file,
        topics of up to three sections each, every section placed once."""
        sections = [
            (match.group(1), match.group(2).strip(), match.group(3).strip())
            for match in re.finditer(r"(?m)^(S\d+) \| ([^|\n]*) \| ([^\n]*)$", prompt)
        ]
        if not sections:
            return cls.example()
        by_file: Dict[str, List[tuple[str, str]]] = {}
        for section_id, filename, rest in sections:
            by_file.setdefault(filename, []).append((section_id, rest))
        per_topic = 3
        if len(by_file) == 1 and len(sections) in (2, 3):
            per_topic = 1  # a lone small file still gets more than one topic
        units: List[PlannedUnit] = []
        count = 0
        for filename, file_sections in by_file.items():
            topics: List[PlannedTopic] = []
            for start in range(0, len(file_sections), per_topic):
                group = file_sections[start : start + per_topic]
                count += 1
                label = filename.rsplit(".", 1)[0]
                topics.append(
                    PlannedTopic(
                        key=f"t{count}",
                        name=f"{label} part {len(topics) + 1} (mock)",
                        description=f"A section of {filename}. (mock output)",
                        objectives=[f"explain idea {n} of {label}" for n in (1, 2, 3)],
                        keywords=[label.lower(), "concepts", "practice"],
                        section_ids=[section_id for section_id, _ in group],
                        prerequisite_keys=[topics[-1].key] if topics else [],
                        estimated_minutes=20,
                    )
                )
            units.append(
                PlannedUnit(
                    title=f"{filename.rsplit('.', 1)[0]} (mock)",
                    summary=f"The material in {filename}. (mock output)",
                    topics=topics,
                )
            )
        return cls(units=units)


class UnitOrder(BaseModel):
    """The order the units of a large course should be taught in."""

    order: List[int] = Field(description="Unit numbers (as listed) in teaching order, each exactly once")

    @classmethod
    def example(cls) -> "UnitOrder":
        return cls(order=[])

    @classmethod
    def example_for(cls, prompt: str) -> "UnitOrder":
        count = len(re.findall(r"(?m)^(\d+)\. ", prompt))
        return cls(order=list(range(1, count + 1)))


MATERIAL_KINDS = ("content", "syllabus", "exam", "other")


class MaterialCheck(BaseModel):
    is_valid: bool = Field(description="True when this is readable course material for the category")
    notes: str = Field(description="One or two sentences")
    kind: Literal["content", "syllabus", "exam", "other"] = Field(
        default="content",
        description=(
            "What the file is: content (lecture notes, slides, a textbook chapter, a paper or a problem "
            "set to learn from), syllabus (a syllabus, schedule or calendar), exam (a past exam, quiz or "
            "test paper) or other"
        ),
    )

    @classmethod
    def example(cls) -> "MaterialCheck":
        return cls(is_valid=True, notes="Mock validation: accepted without a model call.", kind="content")


# ---------------------------------------------------------------- past-exam style

EXAM_QUESTION_KINDS = (
    "multiple_choice",
    "true_false",
    "short_answer",
    "numerical",
    "derivation",
    "essay",
    "other",
)
ExamQuestionKind = Literal[
    "multiple_choice", "true_false", "short_answer", "numerical", "derivation", "essay", "other"
]


class ExamTypeShare(BaseModel):
    kind: ExamQuestionKind = Field(
        description=(
            "multiple_choice, true_false, short_answer (a sentence or two), numerical (a computed "
            "number), derivation (a multi-step worked problem or proof), essay (an open-ended "
            "explanation) or other"
        )
    )
    share: float = Field(description="Fraction of the questions of this kind, 0 to 1; the shares add up to 1")


class ExamPointsBand(BaseModel):
    points: float = Field(description="Points one question is worth")
    questions: int = Field(description="How many questions are worth that much")


class ExamStyleProfile(BaseModel):
    """How one past exam is written: enough for a model to write new questions in the same voice.

    Stored on `materials.style_profile` as `model_dump()` (snake_case keys, plus `version`).
    `example_stems` are paraphrases: `app/services/exam_style.py` checks them against the exam's
    own text and drops any that copy it.
    """

    question_count: int = Field(description="How many questions the exam has (count a multi-part question once)")
    total_points: Optional[float] = Field(
        default=None, description="The exam's total points when it says so, otherwise null"
    )
    type_mix: List[ExamTypeShare] = Field(description="The kinds of question and their share of the exam")
    points_distribution: List[ExamPointsBand] = Field(
        description="How the points are spread: one entry per distinct points value. Empty when the exam gives no points"
    )
    typical_answer_length: str = Field(
        description="What a full answer looks like, in one short phrase: 'one line', 'a short paragraph', 'half a page of worked steps'"
    )
    phrasing_conventions: List[str] = Field(
        description=(
            "2-5 short observations about how questions are worded: how they open, whether they give "
            "data first, how they ask for justification or units, how multi-part questions are labelled"
        )
    )
    task_verbs: List[str] = Field(
        description="The 4-8 verbs the questions use most to say what to do (compute, show, explain, ...), most common first"
    )
    multi_part: bool = Field(description="Whether questions are split into labelled parts such as (a), (b), (c)")
    calculator_and_units: str = Field(
        description="What the exam says about calculators, formula sheets and units or significant figures; 'not stated' if nothing"
    )
    example_stems: List[str] = Field(
        description=(
            "Exactly 3 short example question stems, each REWRITTEN IN NEW WORDS about a different "
            "situation than the exam's. They show the voice and shape of the questions. Never copy a "
            "sentence or a run of more than 5 words from the exam"
        )
    )

    @classmethod
    def example(cls) -> "ExamStyleProfile":
        return cls(
            question_count=5,
            total_points=50,
            type_mix=[ExamTypeShare(kind="short_answer", share=0.6), ExamTypeShare(kind="derivation", share=0.4)],
            points_distribution=[ExamPointsBand(points=10, questions=5)],
            typical_answer_length="a short paragraph or a few lines of working",
            phrasing_conventions=[
                "Opens with a one-line setup, then asks the question (mock)",
                "Parts are labelled (a), (b), (c) (mock)",
            ],
            task_verbs=["compute", "explain", "show"],
            multi_part=True,
            calculator_and_units="not stated (mock)",
            example_stems=[
                "A fair die is rolled twice; find the chance the total is at least ten. (mock)",
                "Show that the estimator below stays unbiased when the sample doubles. (mock)",
                "Explain in two sentences why a larger sample narrows the interval. (mock)",
            ],
        )

    @classmethod
    def example_for(cls, prompt: str) -> "ExamStyleProfile":
        """A profile for the exam text in `prompt` (the mock provider's answer): the question
        count follows the numbered questions, the rest is fixed."""
        numbers = [int(match.group(1)) for match in re.finditer(r"(?m)^\s*(?:Problem|Question|Q)?\s*(\d{1,2})[.):]\s", prompt)]
        profile = cls.example()
        if numbers:
            profile.question_count = max(numbers)
            profile.points_distribution = [ExamPointsBand(points=10, questions=max(numbers))]
            profile.total_points = 10 * max(numbers)
        return profile


# ---------------------------------------------------------------- which topics the exams test


class ExamQuestionTopics(BaseModel):
    exam: int = Field(description="Number of the exam file this question is in, as listed (1, 2, ...)")
    label: str = Field(description="The question's own number or label, such as 'Problem 3' or 'Q2(b)'; 40 characters at most")
    summary: str = Field(
        description="What the question tests, REWRITTEN IN YOUR OWN WORDS in 12 words or fewer. Never copy wording from the exam"
    )
    topic_keys: List[str] = Field(
        description="Keys (T1, T2...) of the topics a student needs to answer the question: none, one, or at most three"
    )


class ExamTopicMap(BaseModel):
    """Which topics each question of the past exams tests. A topic no question tests is not on the exams."""

    questions: List[ExamQuestionTopics] = Field(
        description="Every real question of every exam, once each (a question with parts is one entry). No cover page, instructions, formula sheets or tables"
    )

    @classmethod
    def example(cls) -> "ExamTopicMap":
        return cls(questions=[ExamQuestionTopics(exam=1, label="Question 1", summary="A core idea applied once (mock)", topic_keys=["T1"])])

    @classmethod
    def example_for(cls, prompt: str) -> "ExamTopicMap":
        """The mock provider's answer: one question per 'Problem N' / 'N.' label in each exam, the
        questions spread over the topics except the last, which no question tests."""
        keys = re.findall(r"(?m)^(T\d+) \| ", prompt)
        usable = keys[:-1] if len(keys) > 1 else keys
        questions: List[ExamQuestionTopics] = []
        sections = re.findall(r'(?s)<exam n="(\d+)"[^>]*>(.*?)</exam>', prompt) or [("1", "")]
        for number, body in sections:
            labels = []
            for match in re.finditer(r"(?m)^[\W_]*(?:Problem|Question|Q)?[\W_]*(\d{1,2})[.):](?:\s|\*)", body):
                if match.group(1) not in labels:
                    labels.append(match.group(1))
            for index, label in enumerate(labels or ["1"]):
                questions.append(
                    ExamQuestionTopics(
                        exam=int(number),
                        label=f"Question {label}",
                        summary=f"Tests one idea from the course (mock {label})",
                        topic_keys=[usable[index % len(usable)]] if usable else [],
                    )
                )
        return cls(questions=questions)


class KeyPointCheck(BaseModel):
    """The verdict on one key point of a short answer's rubric."""

    point: str = Field(description="The key point, copied from the list you were given")
    result: Literal["met", "partly", "not_met"] = Field(
        description="met: the answer states it. partly: it is touched on or incomplete. not_met: it is missing or wrong."
    )


class ShortAnswerGrade(BaseModel):
    points_earned: float
    feedback: str = Field(description="2-3 sentences on what was good and what was missing")
    # Shown to the student next to the score ("what the grader looked for"). Older replies and
    # providers that leave it out give an empty list, and the review simply shows no per-point marks.
    key_point_checks: List[KeyPointCheck] = Field(
        default_factory=list,
        description="One entry for each key point, in the order they were listed",
    )

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
