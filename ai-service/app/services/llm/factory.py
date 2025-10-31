"""Factory for creating LLM providers."""
from typing import Optional

from app.config import settings
from app.services.llm.base import LLMProvider
from app.services.llm.openai_provider import OpenAIProvider


class LLMFactory:
    """Factory for creating and managing LLM providers."""

    _instance: Optional[LLMProvider] = None

    @classmethod
    def get_provider(cls) -> LLMProvider:
        """Get LLM provider singleton.

        Returns:
            LLMProvider instance based on configuration

        Raises:
            ValueError: If provider type is unknown
        """
        if cls._instance is None:
            cls._instance = cls._create_provider()
        return cls._instance

    @classmethod
    def _create_provider(cls) -> LLMProvider:
        """Create LLM provider based on settings.

        Returns:
            LLMProvider instance

        Raises:
            ValueError: If provider type is unknown
        """
        provider_name = settings.LLM_PROVIDER.lower()

        if provider_name == "openai":
            return OpenAIProvider(
                api_key=settings.OPENAI_API_KEY,
                default_model=settings.OPENAI_MODEL,
                mini_model=settings.OPENAI_MINI_MODEL,
                embedding_model=settings.OPENAI_EMBEDDING_MODEL,
            )
        elif provider_name == "anthropic":
            # Import here to avoid dependency if not using Anthropic
            from app.services.llm.anthropic_provider import AnthropicProvider

            return AnthropicProvider(
                api_key=settings.ANTHROPIC_API_KEY,
                default_model=settings.ANTHROPIC_MODEL,
                mini_model=settings.ANTHROPIC_MINI_MODEL,
            )
        else:
            raise ValueError(f"Unknown LLM provider: {provider_name}")

    @classmethod
    def reset(cls):
        """Reset singleton (useful for testing)."""
        cls._instance = None
