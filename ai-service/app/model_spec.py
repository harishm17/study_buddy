"""Parsing of the `MODEL_*` settings ("<model-id>:<effort>"). Kept free of other app imports so
the settings class can validate its own values at startup. See app/services/llm/models.py for
what the settings mean."""
from dataclasses import dataclass
from typing import Optional

EFFORTS = ("low", "medium", "high", "xhigh", "max")
_NO_EFFORT = "none"


@dataclass(frozen=True)
class ModelChoice:
    model: str
    effort: Optional[str]


def parse_model_spec(spec: str, fallback: ModelChoice) -> ModelChoice:
    """Resolve one `MODEL_*` value against the fallback. Raises ValueError for a bad effort."""
    spec = (spec or "").strip()
    if not spec:
        return fallback
    model, effort = spec, fallback.effort
    head, colon, tail = spec.rpartition(":")
    suffix = tail.strip().lower()
    if colon and (suffix in EFFORTS or suffix == _NO_EFFORT or suffix == ""):
        model = head.strip()
        effort = None if suffix in (_NO_EFFORT, "") else suffix
    elif colon and suffix.isalpha():
        # A trailing word that is not an effort is a typo, not part of a model id
        # (provider ids such as "...-v1:0" end in a digit).
        raise ValueError(
            f"Unknown effort {tail!r} in {spec!r}; use one of {', '.join(EFFORTS)} or {_NO_EFFORT}"
        )
    return ModelChoice(model=model or fallback.model, effort=effort)
