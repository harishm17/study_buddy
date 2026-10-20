"""Placeholder provider for local runs and end-to-end tests: no API calls, no cost."""
import logging
from typing import List, Type

from app.services.llm.base import (
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
LLM_PROVIDER is set to `mock`, so these notes were not written by a model.

## Key Concepts
- Upload, chunking and retrieval ran for real.
- Generation returned this fixed text.

## Exam-Ready Recap
- Set `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` to generate real content.
"""


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
