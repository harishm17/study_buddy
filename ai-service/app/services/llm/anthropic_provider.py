"""Claude (Anthropic API) provider."""
import logging
from typing import Any, Dict, List, Optional, Type

import anthropic
from anthropic import AsyncAnthropic
from pydantic import ValidationError

from app.services.llm.base import (
    LLMAuthError,
    LLMCreditError,
    LLMMessage,
    LLMNotConfiguredError,
    LLMOutputError,
    LLMProvider,
    LLMRateLimitError,
    LLMRefusalError,
    LLMRequestError,
    LLMResponse,
    LLMUnavailableError,
    LLMUsage,
    SchemaT,
    Tier,
)
from app.services.llm.usage import estimate_cost_usd, record_usage

logger = logging.getLogger(__name__)

# Models that accept the server-side refusal fallback. On a safety decline the API
# re-runs the request on Anthropic's recommended fallback model inside the same call.
_SERVER_FALLBACK_PREFIXES = ("claude-opus-5", "claude-sonnet-5-5", "claude-fable-5")
_SERVER_FALLBACK_BETA = "server-side-fallback-2026-07-01"


def _supports_server_fallback(model: str) -> bool:
    return model.startswith(_SERVER_FALLBACK_PREFIXES)


def _text_block(text: str, cache: bool) -> Dict[str, Any]:
    block: Dict[str, Any] = {"type": "text", "text": text}
    if cache:
        block["cache_control"] = {"type": "ephemeral"}
    return block


def _to_request_messages(
    messages: List[LLMMessage],
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Split into (system blocks, conversation), merging consecutive turns of the same role."""
    system: List[Dict[str, Any]] = []
    conversation: List[Dict[str, Any]] = []
    for message in messages:
        if not message.content:
            continue
        if message.role == "system":
            system.append(_text_block(message.content, message.cache))
            continue
        role = "assistant" if message.role == "assistant" else "user"
        block = _text_block(message.content, message.cache)
        if conversation and conversation[-1]["role"] == role:
            conversation[-1]["content"].append(block)
        else:
            conversation.append({"role": role, "content": [block]})

    # The system prompt is the same for every call of a given kind: cache it.
    if system:
        system[-1]["cache_control"] = {"type": "ephemeral"}
    return system, conversation


def _final_text(content: List[Any]) -> str:
    """Text written by the model that produced the answer.

    When a server-side fallback runs, the declined model's partial output comes before
    the `fallback` block; only the text after the last one is the answer.
    """
    start = 0
    for index, block in enumerate(content):
        if getattr(block, "type", None) == "fallback":
            start = index + 1
    return "".join(
        block.text for block in content[start:] if getattr(block, "type", None) == "text"
    ).strip()


def _translate_api_error(exc: anthropic.APIError) -> Exception:
    """Map SDK exceptions to the provider-neutral errors the job handlers classify."""
    if isinstance(exc, (anthropic.AuthenticationError, anthropic.PermissionDeniedError)):
        return LLMAuthError(f"Anthropic rejected the API key: {exc}")
    if isinstance(exc, anthropic.RateLimitError):
        return LLMRateLimitError(f"Anthropic rate limit: {exc}")
    if isinstance(exc, anthropic.BadRequestError):
        if "credit balance" in str(exc).lower():
            return LLMCreditError(f"Anthropic credit balance is too low: {exc}")
        return LLMRequestError(f"Anthropic rejected the request: {exc}")
    if isinstance(exc, anthropic.APIConnectionError):  # includes APITimeoutError
        return LLMUnavailableError(f"Could not reach Anthropic: {exc}")
    if isinstance(exc, anthropic.APIStatusError):
        if exc.status_code >= 500:  # includes 529 overloaded
            return LLMUnavailableError(f"Anthropic is unavailable ({exc.status_code}): {exc}")
        return LLMRequestError(f"Anthropic rejected the request ({exc.status_code}): {exc}")
    return LLMUnavailableError(f"Anthropic call failed: {exc}")


class AnthropicProvider(LLMProvider):
    """Claude via the Messages API, with structured outputs for every JSON call."""

    def __init__(
        self,
        api_key: str,
        model: str,
        fast_model: str,
        effort: str = "medium",
        fast_effort: str = "low",
        timeout: float = 180.0,
        max_retries: int = 2,
    ):
        if not api_key or not api_key.strip():
            raise LLMNotConfiguredError("ANTHROPIC_API_KEY is not configured")
        # The SDK retries connection errors, 408, 409, 429 and 5xx with backoff.
        self.client = AsyncAnthropic(api_key=api_key, timeout=timeout, max_retries=max_retries)
        self._models = {"main": model, "fast": fast_model}
        self._efforts = {"main": effort, "fast": fast_effort}

    def model_for(self, tier: Tier) -> Optional[str]:
        return self._models[tier]

    async def _create(
        self,
        messages: List[LLMMessage],
        *,
        tier: Tier,
        max_tokens: int,
        purpose: str,
        output_format: Optional[Dict[str, Any]] = None,
    ) -> tuple[str, LLMUsage, str]:
        """Make one call; return (text, usage, stop reason)."""
        model = self._models[tier]
        system, conversation = _to_request_messages(messages)
        if not conversation:
            raise LLMRequestError("An LLM request needs at least one user message")

        output_config: Dict[str, Any] = {}
        if self._efforts[tier]:
            output_config["effort"] = self._efforts[tier]
        if output_format is not None:
            output_config["format"] = output_format

        params: Dict[str, Any] = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": conversation,
        }
        if system:
            params["system"] = system
        if output_config:
            params["output_config"] = output_config
        if _supports_server_fallback(model):
            params["betas"] = [_SERVER_FALLBACK_BETA]
            params["fallbacks"] = "default"

        try:
            response = await self.client.beta.messages.create(**params)
        except anthropic.APIError as exc:
            raise _translate_api_error(exc) from exc

        usage = LLMUsage(
            model=response.model or model,
            purpose=purpose,
            input_tokens=response.usage.input_tokens or 0,
            output_tokens=response.usage.output_tokens or 0,
            cache_read_input_tokens=response.usage.cache_read_input_tokens or 0,
            cache_creation_input_tokens=response.usage.cache_creation_input_tokens or 0,
        )
        record_usage(usage)
        cost = estimate_cost_usd(usage)
        logger.info(
            "llm call purpose=%s model=%s stop=%s in=%s out=%s cache_read=%s cache_write=%s cost_usd=%s request_id=%s",
            purpose or "-",
            usage.model,
            response.stop_reason,
            usage.input_tokens,
            usage.output_tokens,
            usage.cache_read_input_tokens,
            usage.cache_creation_input_tokens,
            f"{cost:.5f}" if cost is not None else "?",
            getattr(response, "_request_id", None),
        )

        stop_reason = response.stop_reason or ""
        if stop_reason == "refusal":
            details = response.stop_details
            category = getattr(details, "category", None) if details else None
            raise LLMRefusalError(f"Claude declined the request (category: {category or 'unspecified'})")
        if stop_reason == "max_tokens":
            raise LLMOutputError(
                f"Output was cut off at max_tokens={max_tokens} ({purpose or 'llm call'})"
            )

        text = _final_text(response.content)
        if not text:
            raise LLMOutputError(f"Claude returned no text ({purpose or 'llm call'})")
        return text, usage, stop_reason

    async def generate_text(
        self,
        messages: List[LLMMessage],
        *,
        tier: Tier = "main",
        max_tokens: int = 16000,
        purpose: str = "",
    ) -> LLMResponse:
        text, usage, stop_reason = await self._create(
            messages, tier=tier, max_tokens=max_tokens, purpose=purpose
        )
        return LLMResponse(content=text, model=usage.model, stop_reason=stop_reason, usage=usage)

    async def generate_structured(
        self,
        messages: List[LLMMessage],
        schema: Type[SchemaT],
        *,
        tier: Tier = "main",
        max_tokens: int = 16000,
        purpose: str = "",
    ) -> SchemaT:
        output_format = {"type": "json_schema", "schema": anthropic.transform_schema(schema)}
        text, _, _ = await self._create(
            messages,
            tier=tier,
            max_tokens=max_tokens,
            purpose=purpose,
            output_format=output_format,
        )
        try:
            return schema.model_validate_json(text)
        except ValidationError as exc:
            raise LLMOutputError(
                f"Output did not match {schema.__name__} ({purpose or 'llm call'}): {exc}"
            ) from exc
