"""Base LLM provider interface."""
from abc import ABC, abstractmethod
from typing import Dict, List, Optional

from pydantic import BaseModel


class LLMMessage(BaseModel):
    """Message for LLM conversation."""

    role: str  # 'system', 'user', 'assistant'
    content: str


class LLMResponse(BaseModel):
    """Response from LLM."""

    content: str
    tokens_used: int
    model: str
    finish_reason: str


class LLMProvider(ABC):
    """Abstract base class for all LLM providers."""

    @abstractmethod
    async def generate_text(
        self,
        messages: List[LLMMessage],
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        **kwargs,
    ) -> LLMResponse:
        """Generate text completion.

        Args:
            messages: List of conversation messages
            temperature: Sampling temperature (0-1)
            max_tokens: Maximum tokens to generate
            **kwargs: Provider-specific arguments

        Returns:
            LLMResponse with generated content
        """
        pass

    @abstractmethod
    async def generate_structured(
        self,
        messages: List[LLMMessage],
        response_format: Optional[Dict] = None,
        **kwargs,
    ) -> Dict:
        """Generate structured JSON response.

        Args:
            messages: List of conversation messages
            response_format: Expected JSON schema
            **kwargs: Provider-specific arguments

        Returns:
            Parsed JSON dictionary
        """
        pass

    @abstractmethod
    async def generate_embedding(self, text: str) -> List[float]:
        """Generate text embedding.

        Args:
            text: Text to embed

        Returns:
            List of embedding values
        """
        pass
