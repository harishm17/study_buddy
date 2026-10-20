"""Placeholder provider for local runs and end-to-end tests: no API calls, no cost."""
import asyncio
import logging
import re
from typing import AsyncIterator, List, Optional, Type

from app.services.llm.base import (
    AnswerCitation,
    AnswerDone,
    AnswerEvent,
    AnswerText,
    Excerpt,
    LLMMessage,
    LLMOutputError,
    LLMProvider,
    LLMResponse,
    LLMUsage,
    SchemaT,
    Tier,
)
from app.services.llm.usage import record_usage

logger = logging.getLogger(__name__)

MOCK_NOTES = """# Study notes (mock)

## Overview
LLM_PROVIDER is set to `mock`, so these notes were not written by a model. They stand in
for real notes so that the rest of the app can be exercised without an API key or any cost.

## Key Concepts
- Upload, validation, chunking, embedding and retrieval ran for real on your files.
- Topic extraction, quizzes, exams and grading return fixed placeholder output.
- Every job still goes through the real job runner, so retries, leases and usage tracking work.

## How It Works
The mock provider returns a fixed example for each output schema and this text for notes.
It records zero token usage, so the daily budget is never reached.

## Common Pitfalls
- Placeholder questions are the same for every topic.
- Short answers are always graded zero.

## Exam-Ready Recap
- Set `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` to generate real content.
- Run `scripts/reembed_chunks.py` after changing the embedding model.
"""


def _first_sentence(text: str, limit: int = 220) -> str:
    flat = re.sub(r"\s+", " ", text).strip()
    match = re.search(r"[.!?](\s|$)", flat)
    sentence = flat[: match.end()].strip() if match else flat
    return sentence if len(sentence) <= limit else sentence[: limit - 1].rstrip() + "..."


class MockProvider(LLMProvider):
    """Returns each schema's `example()` and fixed markdown, and records zero usage."""

    def model_for(self, tier: Tier) -> str:
        return f"mock-{tier}"

    async def generate_text(
        self,
        messages: List[LLMMessage],
        *,
        tier: Tier = "main",
        max_tokens: int = 16000,
        purpose: str = "",
    ) -> LLMResponse:
        usage = LLMUsage(model=self.model_for(tier), purpose=purpose)
        record_usage(usage)
        return LLMResponse(content=MOCK_NOTES, model=usage.model, stop_reason="end_turn", usage=usage)

    async def generate_structured(
        self,
        messages: List[LLMMessage],
        schema: Type[SchemaT],
        *,
        tier: Tier = "main",
        max_tokens: int = 16000,
        purpose: str = "",
    ) -> SchemaT:
        example = getattr(schema, "example", None)
        if example is None:
            raise LLMOutputError(f"MockProvider has no example for {schema.__name__}")
        record_usage(LLMUsage(model=self.model_for(tier), purpose=purpose))
        return example()

    async def stream_cited_answer(
        self,
        *,
        system: str,
        history: List[LLMMessage],
        question: str,
        excerpts: List[Excerpt],
        tier: Tier = "main",
        effort: Optional[str] = None,
        max_tokens: int = 4000,
        purpose: str = "chat",
    ) -> AsyncIterator[AnswerEvent]:
        """A fixed-shape answer that quotes the first two excerpts and cites each."""
        if not excerpts:
            raise LLMOutputError("The mock provider needs at least one excerpt")
        parts: List[tuple[str, Optional[Excerpt]]] = [
            (f"Mock answer to \"{question[:80]}\" (LLM_PROVIDER is mock, no model was called). ", None)
        ]
        for index, excerpt in enumerate(excerpts[:2]):
            lead = "The materials say: " if index == 0 else " It also covers: "
            parts.append((f"{lead}{_first_sentence(excerpt.text)}", excerpt))

        text = ""
        citations: List[AnswerCitation] = []
        for chunk, excerpt in parts:
            for word in re.findall(r"\S+\s*", chunk):
                text += word
                yield AnswerText(text=word)
                await asyncio.sleep(0.005)
            if excerpt is not None:
                citation = AnswerCitation(
                    ref=excerpt.ref,
                    cited_text=excerpt.text.strip().split("\n\n")[0],
                    start_block_index=0,
                    end_block_index=1,
                    offset=len(text),
                )
                citations.append(citation)
                yield citation

        usage = LLMUsage(model=self.model_for(tier), purpose=purpose)
        record_usage(usage)
        yield AnswerDone(text=text, citations=citations, stop_reason="end_turn", usage=usage)
