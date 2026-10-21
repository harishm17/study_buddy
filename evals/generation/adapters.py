"""Everything the generation eval needs from app code, in one place.

The app is changing under this eval (learning v2 stages 1A and 2 replace the two model tiers with a
per-purpose map and replace topic extraction with a planner). Each function below calls the
app's own code the way the app does; when the app changes, edit these functions and keep their
return shapes. Nothing else in the harness imports from `app`.

    parse_model_spec / build_provider   a provider for one model and effort
    MeteredProvider                     wraps a provider: spend gate, usage, latency, raw output
    extract_topics                      the app's topic extraction (stage 2 swaps this one)
    store_topics / map_topic            topic rows and chunk mappings, as the extract-topics job writes them
    make_generators / generate          the app's notes, examples and quiz generators
    fetch_excerpts                      the excerpts a topic is generated from
    app_cost                            the app's price table
"""
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.services.llm.base import LLMMessage, LLMProvider, LLMUsage

from spend import SpendTracker, estimate_prompt_tokens

MODEL_ALIASES = {
    "opus": "claude-opus-5-5",
    "sonnet": "claude-sonnet-5-5",
    "haiku": "claude-haiku-5-5",
}
EFFORTS = ("low", "medium", "high", "xhigh", "max")

# Content types, in the order the app presents them, and the app purpose each one is billed under.
CONTENT_TYPES = ("notes", "solved", "interactive", "quiz")
PURPOSES = {
    "notes": "section_notes",
    "solved": "solved_examples",
    "interactive": "interactive_examples",
    "quiz": "topic_quiz",
}


@dataclass(frozen=True)
class ModelSpec:
    alias: str
    model_id: str
    effort: str

    @property
    def label(self) -> str:
        return f"{self.alias}:{self.effort}"

    @property
    def slug(self) -> str:
        return f"{self.alias}-{self.effort}"


def parse_model_spec(spec: str) -> ModelSpec:
    """`opus:medium` or `claude-opus-5-5:high` (the effort is required, so it is never implicit)."""
    name, _, effort = spec.strip().partition(":")
    if not name or effort not in EFFORTS:
        raise SystemExit(f"bad model spec '{spec}': use <model>:<effort>, effort one of {', '.join(EFFORTS)}")
    model_id = MODEL_ALIASES.get(name, name)
    alias = name if name in MODEL_ALIASES else next((a for a, m in MODEL_ALIASES.items() if m == name), name)
    return ModelSpec(alias=alias, model_id=model_id, effort=effort)


def load_api_key(env_file: Optional[Path] = None) -> str:
    """ANTHROPIC_API_KEY from the environment, else from an .env file (never printed)."""
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if key:
        return key
    for path in [env_file] if env_file else []:
        if path and path.exists():
            for line in path.read_text().splitlines():
                match = re.match(r"\s*ANTHROPIC_API_KEY\s*=\s*(.*)\s*$", line)
                if match:
                    return match.group(1).strip().strip("'\"")
    return ""


def build_provider(spec: ModelSpec, *, mock: bool, api_key: str = "", timeout: float = 600.0) -> LLMProvider:
    """A provider whose every call uses `spec`'s model and effort (both tiers)."""
    if mock:
        from app.services.llm.mock_provider import MockProvider

        return MockProvider()
    from app.config import settings
    from app.services.llm.anthropic_provider import AnthropicProvider

    return AnthropicProvider(
        api_key=api_key,
        model=spec.model_id,
        fast_model=spec.model_id,
        effort=spec.effort,
        fast_effort=spec.effort,
        timeout=timeout,
        max_retries=settings.LLM_MAX_RETRIES,
    )


def build_app_default_provider(*, mock: bool, api_key: str = "", timeout: float = 600.0) -> tuple[LLMProvider, ModelSpec]:
    """The provider the app itself would use (its configured main and fast models and efforts).

    Used for topic extraction, so the default topics are what the app produces. Returns the
    provider and a spec describing the fast tier, which topic extraction uses today.
    """
    from app.config import settings

    fast = parse_model_spec(f"{settings.ANTHROPIC_FAST_MODEL}:{settings.ANTHROPIC_FAST_EFFORT}")
    if mock:
        return build_provider(fast, mock=True), fast
    from app.services.llm.anthropic_provider import AnthropicProvider

    provider = AnthropicProvider(
        api_key=api_key,
        model=settings.ANTHROPIC_MODEL,
        fast_model=settings.ANTHROPIC_FAST_MODEL,
        effort=settings.ANTHROPIC_EFFORT,
        fast_effort=settings.ANTHROPIC_FAST_EFFORT,
        timeout=timeout,
        max_retries=settings.LLM_MAX_RETRIES,
    )
    return provider, fast


# ---------------------------------------------------------------------------------------
# Cost
# ---------------------------------------------------------------------------------------


def app_cost(usage: LLMUsage) -> float:
    """The app's own estimate of one call's cost (0 for a model it has no price for)."""
    from app.services.llm.usage import estimate_cost_usd

    return estimate_cost_usd(usage) or 0.0


def estimate_cost(model: str, input_tokens: int, output_tokens: int, cache_write_tokens: int) -> Optional[float]:
    from app.services.llm.usage import estimate_cost_usd

    return estimate_cost_usd(
        LLMUsage(
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_creation_input_tokens=cache_write_tokens,
        )
    )


# ---------------------------------------------------------------------------------------
# The metered provider
# ---------------------------------------------------------------------------------------


class MeteredProvider(LLMProvider):
    """Wraps a provider for one model.

    Before each call it asks the SpendTracker for permission (raising SpendLimitReached when the
    call would pass a cap). After each call it records purpose, latency, token usage, cost and
    the raw model output in `calls`. Only `generate_text` and `generate_structured` are
    supported, which is all the content generators and the judge use.
    """

    def __init__(self, inner: LLMProvider, spec: ModelSpec, tracker: SpendTracker, kind: str):
        self.inner = inner
        self.spec = spec
        self.tracker = tracker
        self.kind = kind
        self.calls: List[Dict[str, Any]] = []

    def model_for(self, tier):
        return self.spec.model_id

    def _gate(self, messages: List[LLMMessage], purpose: str, schema=None):
        schema_json = schema.model_json_schema() if schema is not None else None
        prompt_tokens = estimate_prompt_tokens([m.content for m in messages], schema_json)
        return self.tracker.reserve(self.kind, self.spec.model_id, purpose, prompt_tokens)

    async def _metered(self, call, messages, purpose, schema, raw_of):
        from app.services.llm.usage import track_llm_usage

        token, estimate = self._gate(messages, purpose, schema)
        started = time.perf_counter()
        error: Optional[BaseException] = None
        result = None
        with track_llm_usage() as usages:
            try:
                result = await call()
            except Exception as exc:  # recorded, then raised
                error = exc
        latency = time.perf_counter() - started
        cost = sum(app_cost(u) for u in usages)
        output_tokens = sum(u.output_tokens for u in usages)
        self.tracker.settle(token, self.spec.model_id, purpose, cost, output_tokens if error is None else None)
        self.calls.append(
            {
                "purpose": purpose,
                "model": self.spec.model_id,
                "effort": self.spec.effort,
                "latency_s": round(latency, 2),
                "estimate_usd": round(estimate, 5),
                "cost_usd": round(cost, 6),
                "input_tokens": sum(u.input_tokens for u in usages),
                "output_tokens": output_tokens,
                "cache_read_input_tokens": sum(u.cache_read_input_tokens for u in usages),
                "cache_creation_input_tokens": sum(u.cache_creation_input_tokens for u in usages),
                "response_models": sorted({u.model for u in usages}),
                "error": f"{type(error).__name__}: {error}" if error else None,
                "raw_output": raw_of(result) if error is None else None,
            }
        )
        if error is not None:
            raise error
        return result

    async def generate_text(self, messages, *, tier="main", max_tokens=16000, purpose=""):
        return await self._metered(
            lambda: self.inner.generate_text(messages, tier=tier, max_tokens=max_tokens, purpose=purpose),
            messages,
            purpose,
            None,
            lambda response: response.content,
        )

    async def generate_structured(self, messages, schema, *, tier="main", max_tokens=16000, purpose=""):
        return await self._metered(
            lambda: self.inner.generate_structured(messages, schema, tier=tier, max_tokens=max_tokens, purpose=purpose),
            messages,
            purpose,
            schema,
            lambda parsed: parsed.model_dump(),
        )

    def stream_cited_answer(self, **kwargs):
        raise NotImplementedError("the eval does not use chat answers")


# ---------------------------------------------------------------------------------------
# Topics
# ---------------------------------------------------------------------------------------


async def extract_topics(project_id: str, provider: LLMProvider) -> List[Dict[str, Any]]:
    """The app's topic extraction, called as the extract-topics job calls it.

    Stage 2 of learning v2 replaces `extract_topics_from_materials` with a planner; change this
    one function to call it. Return one dict per topic, in the order the student studies them:
    `{"name", "description", "keywords"}`.
    """
    from app.services.llm.factory import LLMFactory
    from app.services.topic_extractor import extract_topics_from_materials

    previous = LLMFactory._instance
    LLMFactory._instance = provider  # the extractor asks the factory for its provider
    try:
        topics = await extract_topics_from_materials(project_id)
    finally:
        LLMFactory._instance = previous
    return [{"name": t.name, "description": t.description, "keywords": list(t.keywords)} for t in topics]


async def store_topics(project_id: str, topics: List[Dict[str, Any]]) -> List[str]:
    """Replace the project's topics with `topics` and return their ids, in order."""
    from app.db.connection import execute_one, execute_update

    await execute_update("DELETE FROM topics WHERE project_id = $1", project_id)
    ids = []
    for index, topic in enumerate(topics):
        row = await execute_one(
            """
            INSERT INTO topics
            (id, project_id, name, description, keywords, order_index, source_material_ids, user_confirmed)
            VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, FALSE)
            RETURNING id
            """,
            project_id,
            topic["name"],
            topic.get("description") or "",
            [k for k in topic.get("keywords", []) if k] or [topic["name"].lower()],
            index,
            [],
        )
        ids.append(row["id"])
    return ids


async def map_topic(project_id: str, topic_id: str, topic: Dict[str, Any]) -> int:
    """Map a topic to its chunks the way the extract-topics job does; returns the chunk count."""
    from app.db.connection import execute_in_transaction
    from app.services.content_generator.context import TOPIC_CHUNK_LIMIT
    from app.services.embeddings.search import hybrid_search_chunks
    from app.services.embeddings.topic_mapping import replace_topic_mappings

    chunks = await hybrid_search_chunks(
        project_id,
        topic["name"],
        topic.get("description") or "",
        topic.get("keywords") or [],
        limit=TOPIC_CHUNK_LIMIT,
    )

    async def replace(conn):
        await replace_topic_mappings(conn, topic_id, chunks)

    await execute_in_transaction(replace)
    return len(chunks)


async def fetch_excerpts(topic_id: str) -> List[Dict[str, Any]]:
    """The excerpts the generators read for this topic, in the order they see them."""
    from app.services.content_generator.context import fetch_topic_chunks

    rows = await fetch_topic_chunks(topic_id)
    return [
        {
            "chunk_id": str(row["id"]),
            "filename": row["filename"],
            "category": row["category"],
            "pages": [row["page_start"], row["page_end"]],
            "section": row["section_hierarchy"],
            "text": row["chunk_text"],
        }
        for row in rows
    ]


# ---------------------------------------------------------------------------------------
# Generators
# ---------------------------------------------------------------------------------------


def make_generators(provider: LLMProvider) -> Dict[str, Any]:
    """The app's three generators, bound to `provider`.

    They take their provider from the factory when constructed, so it is set for that moment.
    """
    from app.services.content_generator import ExamplesGenerator, NotesGenerator, QuizGenerator
    from app.services.llm.factory import LLMFactory

    previous = LLMFactory._instance
    LLMFactory._instance = provider
    try:
        return {"notes": NotesGenerator(), "examples": ExamplesGenerator(), "quiz": QuizGenerator()}
    finally:
        LLMFactory._instance = previous


def notes_expectations() -> Dict[str, Any]:
    """Section labels the notes prompt asks for, so the structure check follows the prompt."""
    try:
        from app.services.content_generator.notes import _SECTION_LABELS

        return {"sections": list(_SECTION_LABELS)}
    except ImportError:
        return {}


async def generate(generators: Dict[str, Any], topic: Dict[str, Any], content_type: str, params: Dict[str, Any]):
    """Run one generator for one topic and return what the app would store as the content.

    notes: markdown string; solved / interactive: list of examples; quiz: list of questions.
    `topic` has id, name, description. Calls mirror generate_content_job in jobs.py.
    """
    from app.services.content_generator.examples import ExampleType

    common = dict(topic_id=topic["id"], topic_name=topic["name"], topic_description=topic["description"])
    if content_type == "notes":
        result = await generators["notes"].generate_notes(
            **common, user_preferences={"detail_level": params["detail_level"]}
        )
        return result["content"]
    if content_type in ("solved", "interactive"):
        result = await generators["examples"].generate_examples(
            **common,
            example_type=ExampleType.SOLVED if content_type == "solved" else ExampleType.INTERACTIVE,
            count=params["examples"],
            difficulty_level=params["difficulty"],
        )
        return result["examples"]
    if content_type == "quiz":
        result = await generators["quiz"].generate_quiz(
            **common, question_count=params["questions"], difficulty_level=params["difficulty"]
        )
        return result["questions"]
    raise ValueError(f"unknown content type {content_type}")
