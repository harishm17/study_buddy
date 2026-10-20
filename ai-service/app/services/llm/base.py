"""Provider-neutral LLM interface, errors and usage records."""
from abc import ABC, abstractmethod
from typing import List, Literal, Optional, Type, TypeVar

from pydantic import BaseModel

# "main" writes study content; "fast" handles short classification and grading calls.
Tier = Literal["main", "fast"]

SchemaT = TypeVar("SchemaT", bound=BaseModel)


class LLMMessage(BaseModel):
    """One message in a request.

    `cache=True` marks the end of a prefix that later requests repeat (for example a
    topic's source excerpts), so the provider can cache it.
    """

    role: str  # 'system', 'user', 'assistant'
    content: str
    cache: bool = False


class LLMUsage(BaseModel):
    """Token usage for one call."""

    model: str
    purpose: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_input_tokens: int = 0
    cache_creation_input_tokens: int = 0


class LLMResponse(BaseModel):
    """A text response."""

    content: str
    model: str
    stop_reason: str
    usage: LLMUsage


class LLMError(Exception):
    """Base for every provider failure. `code` is stored on failed jobs."""

    code = "LLM_ERROR"
    retryable = True


class LLMNotConfiguredError(LLMError):
    code = "LLM_NOT_CONFIGURED"
    retryable = False


class LLMAuthError(LLMError):
    code = "LLM_AUTH_FAILED"
    retryable = False


class LLMCreditError(LLMError):
    code = "LLM_CREDIT_EXHAUSTED"
    retryable = False


class LLMRequestError(LLMError):
    """The API rejected the request itself (bad parameters, too large, unknown model)."""

    code = "LLM_REQUEST_REJECTED"
    retryable = False


class LLMRefusalError(LLMError):
    code = "LLM_REFUSED"
    retryable = False


class LLMRateLimitError(LLMError):
    code = "LLM_RATE_LIMITED"
    retryable = True


class LLMUnavailableError(LLMError):
    """Timeouts, connection failures, overload and 5xx responses."""

    code = "LLM_UNAVAILABLE"
    retryable = True


class LLMOutputError(LLMError):
    """The model answered, but the output was empty, cut off or failed validation."""

    code = "LLM_BAD_OUTPUT"
    retryable = True


class LLMProvider(ABC):
    """Interface every provider implements."""

    @abstractmethod
    async def generate_text(
        self,
        messages: List[LLMMessage],
        *,
        tier: Tier = "main",
        max_tokens: int = 16000,
        purpose: str = "",
    ) -> LLMResponse:
        """Return free text (markdown). Raises LLMOutputError when the text is empty or cut off."""

    @abstractmethod
    async def generate_structured(
        self,
        messages: List[LLMMessage],
        schema: Type[SchemaT],
        *,
        tier: Tier = "main",
        max_tokens: int = 16000,
        purpose: str = "",
    ) -> SchemaT:
        """Return output constrained to `schema` and validated against it."""

    def model_for(self, tier: Tier) -> Optional[str]:
        """The model a tier maps to, for logging."""
        return None
