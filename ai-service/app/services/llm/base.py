"""Provider-neutral LLM interface, errors and usage records."""
from abc import ABC, abstractmethod
from typing import Any, AsyncIterator, Dict, List, Literal, Optional, Type, TypeVar, Union

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
    # Tokens a failed call still used (a refusal or cut-off answer is billed), so callers can
    # record the cost. None when the call produced no usage.
    usage: Optional["LLMUsage"] = None


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


class Excerpt(BaseModel):
    """One passage the model may quote when it answers a question.

    `ref` is a stable identifier the caller can map back to its own record (for example
    `chunk:<id>`). It travels to the model as the search result's `source`.
    """

    ref: str
    title: str
    text: str


class AnswerText(BaseModel):
    """A piece of the answer, in the order it was written."""

    type: Literal["text"] = "text"
    text: str


class AnswerCitation(BaseModel):
    """The model cited an excerpt. It belongs to the text written just before it.

    `offset` is the number of characters of answer text written so far, so a marker for
    this citation goes at that position.
    """

    type: Literal["citation"] = "citation"
    ref: str  # Excerpt.ref
    cited_text: str
    start_block_index: int
    end_block_index: int
    offset: int


class AnswerReset(BaseModel):
    """Everything sent so far is void: a fallback model is writing the answer instead."""

    type: Literal["reset"] = "reset"


class AnswerDone(BaseModel):
    """The last event: the whole answer, its citations and what the call cost."""

    type: Literal["done"] = "done"
    text: str
    citations: List[AnswerCitation]
    stop_reason: str
    usage: LLMUsage


AnswerEvent = Union[AnswerText, AnswerCitation, AnswerReset, AnswerDone]


class TurnText(BaseModel):
    """A piece of the reply, as it is written."""

    type: Literal["text"] = "text"
    text: str


class TurnToolUse(BaseModel):
    """The model wants a tool run. The caller runs it and sends a tool_result next turn."""

    type: Literal["tool_use"] = "tool_use"
    id: str
    name: str
    input: Dict[str, Any]


class TurnDone(BaseModel):
    """The last event: why the model stopped, the assistant content blocks exactly as
    returned (to append to the conversation), and what the call cost."""

    type: Literal["done"] = "done"
    stop_reason: str
    content: List[Dict[str, Any]]
    usage: LLMUsage


TurnEvent = Union[TurnText, TurnToolUse, TurnDone]


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

    @abstractmethod
    def stream_cited_answer(
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
        """Answer `question` from `excerpts`, streaming the answer and the citations.

        Yields AnswerText pieces and AnswerCitation events as they arrive and ends with one
        AnswerDone. An AnswerReset means a fallback model took over: discard what came
        before. Raises LLMRefusalError when the model declines and LLMOutputError when the
        answer is empty or cut off (both with `usage` set). Free text only: search result
        citations cannot be combined with structured outputs.
        """

    async def stream_turn(
        self,
        *,
        system: str,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]],
        tier: Tier = "fast",
        effort: Optional[str] = None,
        max_tokens: int = 800,
        purpose: str = "voice",
    ) -> AsyncIterator[TurnEvent]:
        """One model call of a text conversation that may use tools.

        `messages` are Anthropic-format messages (content may hold tool_use and tool_result
        blocks) and `tools` are Anthropic tool definitions; tool_choice is always auto.
        Yields TurnText pieces as they arrive, one TurnToolUse per tool call, and ends with
        one TurnDone. Raises LLMRefusalError when the model declines (with `usage` set) and
        LLMOutputError when it returned neither text nor a tool call.

        Not abstract: a provider without a conversation mode (a test double) need not
        implement it.
        """
        raise NotImplementedError(f"{type(self).__name__} does not support voice turns")
        yield  # pragma: no cover  (makes this an async generator)

    def model_for(self, tier: Tier) -> Optional[str]:
        """The model a tier maps to, for logging."""
        return None
