"""Which model and effort each kind of LLM call uses.

Every call site passes a `purpose`; this module maps it to a `MODEL_*` setting, and the
setting to a model id and an effort. The map is the only place that knows which purpose
belongs to which setting:

    purpose                 setting            used by
    section_notes           MODEL_NOTES        notes generator
    solved_examples         MODEL_EXAMPLES     worked examples generator
    interactive_examples    MODEL_PRACTICE     step-by-step practice generator
    topic_quiz              MODEL_QUIZ         topic quiz generator
    exam_questions          MODEL_EXAM         mock exam question generator
    grade_short_answer      MODEL_GRADING      exam short-answer grader
    extract_topics          MODEL_TOPICS       course planner (units, topics, sources)
    order_units             MODEL_VALIDATION   cross-file unit order of a large course plan
    chat                    MODEL_CHAT         "Ask your materials" answers
    voice                   MODEL_VOICE        voice coach turns
    voice_drill             MODEL_VOICE        voice drill packs
    validate_material       MODEL_VALIDATION   upload validation

A setting is "<model-id>:<effort>". Accepted forms:

    ""                    the fallback model and effort for the purpose
    "claude-opus-5-5"     that model, with the fallback effort
    "claude-opus-5-5:low" that model and effort
    ":low"                the fallback model, that effort
    "claude-opus-5-5:none"  that model with no effort parameter

The fallback is ANTHROPIC_MODEL with ANTHROPIC_EFFORT for the "main" purposes and
ANTHROPIC_FAST_MODEL with ANTHROPIC_FAST_EFFORT for the "fast" ones, which is how the service
behaved before purposes had settings of their own.
"""
from dataclasses import dataclass
from typing import Literal

from app.config import settings
from app.model_spec import ModelChoice, parse_model_spec

Tier = Literal["main", "fast"]


@dataclass(frozen=True)
class PurposeConfig:
    setting: str
    fallback_tier: Tier


PURPOSES = {
    "section_notes": PurposeConfig("MODEL_NOTES", "main"),
    "solved_examples": PurposeConfig("MODEL_EXAMPLES", "main"),
    "interactive_examples": PurposeConfig("MODEL_PRACTICE", "main"),
    "topic_quiz": PurposeConfig("MODEL_QUIZ", "main"),
    "exam_questions": PurposeConfig("MODEL_EXAM", "main"),
    "grade_short_answer": PurposeConfig("MODEL_GRADING", "fast"),
    "extract_topics": PurposeConfig("MODEL_TOPICS", "fast"),
    "chat": PurposeConfig("MODEL_CHAT", "main"),
    "voice": PurposeConfig("MODEL_VOICE", "fast"),
    "voice_drill": PurposeConfig("MODEL_VOICE", "fast"),
    "validate_material": PurposeConfig("MODEL_VALIDATION", "fast"),
    "order_units": PurposeConfig("MODEL_VALIDATION", "fast"),
}

MODEL_SETTINGS = tuple(sorted({config.setting for config in PURPOSES.values()}))


def tier_choice(tier: Tier) -> ModelChoice:
    """The fallback for a tier, from the ANTHROPIC_* settings."""
    if tier == "fast":
        return ModelChoice(settings.ANTHROPIC_FAST_MODEL, settings.ANTHROPIC_FAST_EFFORT or None)
    return ModelChoice(settings.ANTHROPIC_MODEL, settings.ANTHROPIC_EFFORT or None)


def resolve_model(purpose: str) -> ModelChoice:
    """The model and effort for a call. An unknown purpose is a bug in the caller."""
    config = PURPOSES.get(purpose)
    if config is None:
        raise ValueError(
            f"Unknown LLM purpose {purpose!r}: add it to PURPOSES in app/services/llm/models.py"
        )
    return parse_model_spec(getattr(settings, config.setting), tier_choice(config.fallback_tier))
