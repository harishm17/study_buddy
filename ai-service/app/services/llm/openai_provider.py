"""OpenAI LLM provider implementation."""
import json
from typing import Dict, List, Optional

from openai import AsyncOpenAI

from app.config import settings
from app.services.llm.base import LLMMessage, LLMProvider, LLMResponse


class OpenAIProvider(LLMProvider):
    """OpenAI implementation of LLM provider."""

    def __init__(
        self,
        api_key: str,
        default_model: str = "gpt-4o",
        mini_model: str = "gpt-4o-mini",
        embedding_model: str = "text-embedding-3-small",
    ):
        """Initialize OpenAI provider.

        Args:
            api_key: OpenAI API key
            default_model: Default model for generation
            mini_model: Model for simple tasks
            embedding_model: Model for embeddings
        """
        self.client = AsyncOpenAI(api_key=api_key)
        self.default_model = default_model
        self.mini_model = mini_model
        self.embedding_model = embedding_model

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

        response = await self.client.chat.completions.create(
            model=model,
            messages=[{"role": m.role, "content": m.content} for m in messages],
            temperature=temperature,
            max_tokens=max_tokens,
            **kwargs,
        )

        choice = response.choices[0]
        return LLMResponse(
            content=choice.message.content or "",
            tokens_used=response.usage.total_tokens if response.usage else 0,
            model=model,
            finish_reason=choice.finish_reason or "stop",
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

        response = await self.client.chat.completions.create(
            model=model,
            messages=[{"role": m.role, "content": m.content} for m in messages],
            response_format={"type": "json_object"},
            **kwargs,
        )

        content = response.choices[0].message.content or "{}"
        return json.loads(content)

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
