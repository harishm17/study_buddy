"""OpenAI LLM provider implementation."""
import json
import re
from typing import Any, Dict, List, Optional

import httpx
from openai import AsyncOpenAI, BadRequestError

from app.config import settings
from app.services.llm.base import LLMMessage, LLMProvider, LLMResponse


def _normalize_messages(messages: List[Any]) -> List[LLMMessage]:
    normalized: List[LLMMessage] = []
    for message in messages:
        if isinstance(message, LLMMessage):
            normalized.append(message)
            continue
        if isinstance(message, dict):
            role = str(message.get("role", "user"))
            content = str(message.get("content", ""))
            normalized.append(LLMMessage(role=role, content=content))
            continue
        raise TypeError("messages must be LLMMessage or dict entries")
    return normalized


def _to_responses_input(messages: List[LLMMessage]) -> List[Dict[str, Any]]:
    formatted: List[Dict[str, Any]] = []
    for message in messages:
        role = message.role if message.role in {"system", "user", "assistant"} else "user"
        formatted.append(
            {
                "role": role,
                "content": [{"type": "input_text", "text": message.content}],
            }
        )
    return formatted


def _extract_output_text(response: Any) -> str:
    if isinstance(response, dict):
        output_text = response.get("output_text")
    else:
        output_text = getattr(response, "output_text", None)
    if isinstance(output_text, str) and output_text.strip():
        return output_text

    chunks: List[str] = []
    output_items = response.get("output", []) if isinstance(response, dict) else getattr(response, "output", [])
    for item in output_items or []:
        if isinstance(item, dict):
            content_parts = item.get("content", []) or []
        else:
            content_parts = getattr(item, "content", []) or []
        for content in content_parts:
            if isinstance(content, dict):
                text = content.get("text")
            else:
                text = getattr(content, "text", None)
            if isinstance(text, str) and text:
                chunks.append(text)
    return "".join(chunks).strip()


def _extract_usage_tokens(response: Any) -> int:
    usage = response.get("usage") if isinstance(response, dict) else getattr(response, "usage", None)
    if usage is None:
        return 0
    total = usage.get("total_tokens") if isinstance(usage, dict) else getattr(usage, "total_tokens", None)
    if isinstance(total, int):
        return total

    if isinstance(usage, dict):
        input_tokens = usage.get("input_tokens", 0) or 0
        output_tokens = usage.get("output_tokens", 0) or 0
    else:
        input_tokens = getattr(usage, "input_tokens", 0) or 0
        output_tokens = getattr(usage, "output_tokens", 0) or 0
    return int(input_tokens) + int(output_tokens)


def _extract_json_object(text: str) -> Dict[str, Any]:
    candidate = text.strip()
    if candidate.startswith("```"):
        candidate = candidate.strip("`")
        if candidate.lower().startswith("json"):
            candidate = candidate[4:].strip()

    try:
        parsed = json.loads(candidate)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = candidate.find("{")
    end = candidate.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON object found in model response")

    parsed = json.loads(candidate[start : end + 1])
    if not isinstance(parsed, dict):
        raise ValueError("Model response JSON is not an object")
    return parsed


def _normalize_schema_name(raw_name: Optional[str]) -> str:
    candidate = (raw_name or "structured_output").strip()
    if not candidate:
        candidate = "structured_output"
    sanitized = re.sub(r"[^a-zA-Z0-9_-]", "_", candidate)[:64]
    return sanitized or "structured_output"


def _default_structured_schema() -> Dict[str, Any]:
    # Broad but valid object schema for generic structured generation.
    return {
        "type": "object",
        "properties": {},
        "additionalProperties": True,
    }


def _coerce_json_schema_format(response_format: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not response_format:
        return {
            "type": "json_schema",
            "name": "structured_output",
            "strict": True,
            "schema": _default_structured_schema(),
        }

    format_type = str(response_format.get("type", "")).strip().lower()

    # Chat Completions-style shape:
    # {"type":"json_schema","json_schema":{"name":..., "schema":..., "strict":...}}
    if format_type == "json_schema" and isinstance(response_format.get("json_schema"), dict):
        json_schema = response_format["json_schema"]
        return {
            "type": "json_schema",
            "name": _normalize_schema_name(str(json_schema.get("name", "structured_output"))),
            "strict": bool(json_schema.get("strict", True)),
            "schema": json_schema.get("schema") or _default_structured_schema(),
            **(
                {"description": str(json_schema["description"])}
                if json_schema.get("description")
                else {}
            ),
        }

    # Responses-style shape:
    # {"type":"json_schema","name":..., "schema":..., "strict":...}
    if format_type == "json_schema":
        return {
            "type": "json_schema",
            "name": _normalize_schema_name(str(response_format.get("name", "structured_output"))),
            "strict": bool(response_format.get("strict", True)),
            "schema": response_format.get("schema") or _default_structured_schema(),
            **(
                {"description": str(response_format["description"])}
                if response_format.get("description")
                else {}
            ),
        }

    # Raw schema shape:
    # {"name":..., "schema":...} or {"schema":...}
    if isinstance(response_format.get("schema"), dict):
        return {
            "type": "json_schema",
            "name": _normalize_schema_name(str(response_format.get("name", "structured_output"))),
            "strict": bool(response_format.get("strict", True)),
            "schema": response_format["schema"],
            **(
                {"description": str(response_format["description"])}
                if response_format.get("description")
                else {}
            ),
        }

    # Unknown shape fallback.
    return {
        "type": "json_schema",
        "name": "structured_output",
        "strict": True,
        "schema": _default_structured_schema(),
    }


def _supports_temperature(model: str) -> bool:
    normalized = (model or "").lower()
    # Responses models in the GPT-5 / reasoning families reject `temperature`.
    unsupported_prefixes = ("gpt-5", "o1", "o3", "o4")
    return not normalized.startswith(unsupported_prefixes)


def _sanitize_sampling_params(request_args: Dict[str, Any], model: str) -> None:
    """Normalize sampling params for model families with stricter compatibility.

    GPT-5 and reasoning models reject some legacy sampling parameters. We keep
    behavior deterministic by dropping unsupported knobs before request dispatch.
    """
    if _supports_temperature(model):
        return

    request_args.pop("temperature", None)
    request_args.pop("top_p", None)
    request_args.pop("logprobs", None)


class OpenAIProvider(LLMProvider):
    """OpenAI implementation of LLM provider."""

    def __init__(
        self,
        api_key: str,
        default_model: str = "gpt-5-mini",
        mini_model: str = "gpt-5-mini",
        embedding_model: str = "text-embedding-3-small",
    ):
        """Initialize OpenAI provider.

        Args:
            api_key: OpenAI API key
            default_model: Default model for generation
            mini_model: Model for simple tasks
            embedding_model: Model for embeddings
        """
        if not api_key or not api_key.strip():
            raise ValueError("OPENAI_API_KEY is not configured")

        self.api_key = api_key
        self.client = AsyncOpenAI(api_key=api_key)
        self.default_model = default_model
        self.mini_model = mini_model
        self.embedding_model = embedding_model

    async def _responses_create(self, request_args: Dict[str, Any]) -> Any:
        """Call the Responses API with SDK support and HTTP fallback.

        Some older OpenAI Python SDK builds expose AsyncOpenAI but not `.responses`.
        We still call /v1/responses directly in that case to keep GPT-5-mini compatible.
        """
        responses_api = getattr(self.client, "responses", None)
        if responses_api and hasattr(responses_api, "create"):
            return await responses_api.create(**request_args)

        async with httpx.AsyncClient(timeout=90.0) as http_client:
            response = await http_client.post(
                "https://api.openai.com/v1/responses",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=request_args,
            )

        if response.status_code >= 400:
            try:
                payload = response.json()
                message = payload.get("error", {}).get("message") or response.text
            except Exception:
                message = response.text
            raise RuntimeError(f"Responses API request failed ({response.status_code}): {message}")

        return response.json()

    async def generate_text(
        self,
        messages: List[LLMMessage],
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        use_mini: bool = False,
        **kwargs,
    ) -> LLMResponse:
        """Generate text using OpenAI.

        Args:
            messages: Conversation messages
            temperature: Sampling temperature
            max_tokens: Max tokens to generate
            use_mini: Use mini model for simple tasks
            **kwargs: Additional OpenAI parameters

        Returns:
            LLMResponse with generated text
        """
        model = self.mini_model if use_mini else self.default_model

        request_args: Dict[str, Any] = {
            "model": model,
            "input": _to_responses_input(_normalize_messages(messages)),
            **kwargs,
        }
        if temperature is not None and _supports_temperature(model):
            request_args["temperature"] = temperature
        if max_tokens is not None:
            request_args["max_output_tokens"] = max_tokens
        _sanitize_sampling_params(request_args, model)

        response = await self._responses_create(request_args)
        content = _extract_output_text(response)
        return LLMResponse(
            content=content,
            tokens_used=_extract_usage_tokens(response),
            model=model,
            finish_reason=str(getattr(response, "status", "completed") or "completed"),
        )

    async def generate_structured(
        self,
        messages: List[LLMMessage],
        response_format: Optional[Dict] = None,
        use_mini: bool = False,
        **kwargs,
    ) -> Dict:
        """Generate structured JSON using OpenAI.

        Args:
            messages: Conversation messages
            response_format: Expected JSON schema
            use_mini: Use mini model
            **kwargs: Additional parameters

        Returns:
            Parsed JSON dictionary
        """
        model = self.mini_model if use_mini else self.default_model
        normalized_messages = _normalize_messages(messages)
        schema_format = _coerce_json_schema_format(
            response_format if isinstance(response_format, dict) else None
        )

        request_args: Dict[str, Any] = {
            "model": model,
            "input": _to_responses_input(normalized_messages),
            "text": {"format": schema_format},
            **kwargs,
        }
        raw_temperature = request_args.pop("temperature", None)
        if raw_temperature is not None and _supports_temperature(model):
            request_args["temperature"] = raw_temperature
        _sanitize_sampling_params(request_args, model)

        try:
            response = await self._responses_create(request_args)
            content = _extract_output_text(response)
            return _extract_json_object(content or "{}")
        except (BadRequestError, ValueError, RuntimeError) as exc:
            # Robust fallback path in case strict schema validation fails due unsupported schema shape.
            fallback_messages = [
                LLMMessage(
                    role="system",
                    content=(
                        "Return a single valid JSON object only. "
                        "Do not include markdown, code fences, comments, or explanatory prose."
                    ),
                ),
                *normalized_messages,
            ]
            fallback_args: Dict[str, Any] = {
                "model": model,
                "input": _to_responses_input(fallback_messages),
                **kwargs,
            }
            raw_temperature = fallback_args.pop("temperature", None)
            if raw_temperature is not None and _supports_temperature(model):
                fallback_args["temperature"] = raw_temperature
            _sanitize_sampling_params(fallback_args, model)
            response = await self._responses_create(fallback_args)
            content = _extract_output_text(response)
            try:
                return _extract_json_object(content or "{}")
            except ValueError as parse_exc:
                raise ValueError(
                    f"Failed to parse structured output via strict schema and fallback modes: {parse_exc}"
                ) from exc

    async def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding using OpenAI.

        Args:
            text: Text to embed

        Returns:
            Embedding vector
        """
        response = await self.client.embeddings.create(
            model=self.embedding_model, input=text
        )
        return response.data[0].embedding
