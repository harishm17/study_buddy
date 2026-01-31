"""Tests for LLM provider abstraction."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestLLMProviderInterface:
    """Test LLM provider interface and factory."""

    def test_factory_returns_provider(self):
        """LLM factory should return a provider instance."""
        with patch('app.services.llm.factory.settings') as mock_settings:
            mock_settings.llm_provider = 'openai'
            mock_settings.openai_api_key = 'test-key'

            from app.services.llm.factory import LLMFactory

            provider = LLMFactory.get_provider()
            assert provider is not None

    def test_provider_has_required_methods(self):
        """Provider should have all required methods."""
        with patch('app.services.llm.factory.settings') as mock_settings:
            mock_settings.llm_provider = 'openai'
            mock_settings.openai_api_key = 'test-key'

            from app.services.llm.factory import LLMFactory

            provider = LLMFactory.get_provider()

            # Check for required methods
            assert hasattr(provider, 'generate_text')
            assert hasattr(provider, 'generate_structured')
            assert hasattr(provider, 'generate_embedding')


class TestOpenAIProvider:
    """Test OpenAI provider implementation."""

    @pytest.mark.asyncio
    async def test_generate_text_basic(self):
        """Should generate text from messages."""
        with patch('app.services.llm.openai_provider.AsyncOpenAI') as mock_client_class:
            # Create mock completion
            mock_completion = MagicMock()
            mock_completion.choices = [MagicMock()]
            mock_completion.choices[0].message.content = "Test response"
            mock_completion.usage.total_tokens = 50

            # Mock the API call
            mock_client = MagicMock()
            mock_client.chat.completions.create = AsyncMock(return_value=mock_completion)
            mock_client_class.return_value = mock_client

            from app.services.llm.openai_provider import OpenAIProvider

            provider = OpenAIProvider(api_key="test-key")
            messages = [{"role": "user", "content": "Hello"}]

            response = await provider.generate_text(messages)

            assert response.content == "Test response"
            assert response.tokens_used == 50

    @pytest.mark.asyncio
    async def test_uses_mini_model_when_specified(self):
        """Should use mini model for simple tasks."""
        with patch('app.services.llm.openai_provider.AsyncOpenAI') as mock_client_class:
            mock_completion = MagicMock()
            mock_completion.choices = [MagicMock()]
            mock_completion.choices[0].message.content = "Response"
            mock_completion.usage.total_tokens = 20

            mock_client = MagicMock()
            mock_create = AsyncMock(return_value=mock_completion)
            mock_client.chat.completions.create = mock_create
            mock_client_class.return_value = mock_client

            from app.services.llm.openai_provider import OpenAIProvider

            provider = OpenAIProvider(
                api_key="test-key",
                default_model="gpt-4o",
                mini_model="gpt-4o-mini"
            )

            messages = [{"role": "user", "content": "Hi"}]
            await provider.generate_text(messages, use_mini=True)

            # Verify mini model was used
            call_args = mock_create.call_args
            assert call_args.kwargs.get('model') == "gpt-4o-mini"

    @pytest.mark.asyncio
    async def test_structured_output_parsing(self):
        """Structured output should parse JSON correctly."""
        with patch('app.services.llm.openai_provider.AsyncOpenAI') as mock_client_class:
            mock_completion = MagicMock()
            mock_completion.choices = [MagicMock()]
            mock_completion.choices[0].message.content = '{"key": "value", "number": 42}'
            mock_completion.usage.total_tokens = 30

            mock_client = MagicMock()
            mock_client.chat.completions.create = AsyncMock(return_value=mock_completion)
            mock_client_class.return_value = mock_client

            from app.services.llm.openai_provider import OpenAIProvider

            provider = OpenAIProvider(api_key="test-key")
            messages = [{"role": "user", "content": "Generate JSON"}]

            result = await provider.generate_structured(messages)

            assert isinstance(result, dict)
            assert result["key"] == "value"
            assert result["number"] == 42

    @pytest.mark.asyncio
    async def test_temperature_parameter(self):
        """Should respect temperature parameter."""
        with patch('app.services.llm.openai_provider.AsyncOpenAI') as mock_client_class:
            mock_completion = MagicMock()
            mock_completion.choices = [MagicMock()]
            mock_completion.choices[0].message.content = "Response"
            mock_completion.usage.total_tokens = 20

            mock_client = MagicMock()
            mock_create = AsyncMock(return_value=mock_completion)
            mock_client.chat.completions.create = mock_create
            mock_client_class.return_value = mock_client

            from app.services.llm.openai_provider import OpenAIProvider

            provider = OpenAIProvider(api_key="test-key")
            messages = [{"role": "user", "content": "Hi"}]

            await provider.generate_text(messages, temperature=0.7)

            call_args = mock_create.call_args
            assert call_args.kwargs.get('temperature') == 0.7

    @pytest.mark.asyncio
    async def test_max_tokens_parameter(self):
        """Should respect max_tokens parameter."""
        with patch('app.services.llm.openai_provider.AsyncOpenAI') as mock_client_class:
            mock_completion = MagicMock()
            mock_completion.choices = [MagicMock()]
            mock_completion.choices[0].message.content = "Response"
            mock_completion.usage.total_tokens = 20

            mock_client = MagicMock()
            mock_create = AsyncMock(return_value=mock_completion)
            mock_client.chat.completions.create = mock_create
            mock_client_class.return_value = mock_client

            from app.services.llm.openai_provider import OpenAIProvider

            provider = OpenAIProvider(api_key="test-key")
            messages = [{"role": "user", "content": "Hi"}]

            await provider.generate_text(messages, max_tokens=100)

            call_args = mock_create.call_args
            assert call_args.kwargs.get('max_tokens') == 100


class TestEmbeddingGeneration:
    """Test embedding generation via LLM provider."""

    @pytest.mark.asyncio
    async def test_generate_embedding(self):
        """Should generate embedding vector."""
        with patch('app.services.llm.openai_provider.AsyncOpenAI') as mock_client_class:
            mock_response = MagicMock()
            mock_response.data = [MagicMock()]
            mock_response.data[0].embedding = [0.1] * 1536

            mock_client = MagicMock()
            mock_client.embeddings.create = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            from app.services.llm.openai_provider import OpenAIProvider

            provider = OpenAIProvider(api_key="test-key")
            embedding = await provider.generate_embedding("Test text")

            assert len(embedding) == 1536
            assert all(isinstance(x, float) for x in embedding)

    @pytest.mark.asyncio
    async def test_embedding_model_selection(self):
        """Should use correct embedding model."""
        with patch('app.services.llm.openai_provider.AsyncOpenAI') as mock_client_class:
            mock_response = MagicMock()
            mock_response.data = [MagicMock()]
            mock_response.data[0].embedding = [0.1] * 1536

            mock_client = MagicMock()
            mock_create = AsyncMock(return_value=mock_response)
            mock_client.embeddings.create = mock_create
            mock_client_class.return_value = mock_client

            from app.services.llm.openai_provider import OpenAIProvider

            provider = OpenAIProvider(
                api_key="test-key",
                embedding_model="text-embedding-3-small"
            )
            await provider.generate_embedding("Test")

            call_args = mock_create.call_args
            assert call_args.kwargs.get('model') == "text-embedding-3-small"


class TestErrorHandling:
    """Test error handling in LLM provider."""

    @pytest.mark.asyncio
    async def test_api_error_handling(self):
        """Should handle API errors gracefully."""
        with patch('app.services.llm.openai_provider.AsyncOpenAI') as mock_client_class:
            mock_client = MagicMock()
            mock_client.chat.completions.create = AsyncMock(
                side_effect=Exception("API Error")
            )
            mock_client_class.return_value = mock_client

            from app.services.llm.openai_provider import OpenAIProvider

            provider = OpenAIProvider(api_key="test-key")
            messages = [{"role": "user", "content": "Hi"}]

            with pytest.raises(Exception):
                await provider.generate_text(messages)

    @pytest.mark.asyncio
    async def test_invalid_json_handling(self):
        """Should handle invalid JSON in structured output."""
        with patch('app.services.llm.openai_provider.AsyncOpenAI') as mock_client_class:
            mock_completion = MagicMock()
            mock_completion.choices = [MagicMock()]
            mock_completion.choices[0].message.content = "Not valid JSON"
            mock_completion.usage.total_tokens = 10

            mock_client = MagicMock()
            mock_client.chat.completions.create = AsyncMock(return_value=mock_completion)
            mock_client_class.return_value = mock_client

            from app.services.llm.openai_provider import OpenAIProvider

            provider = OpenAIProvider(api_key="test-key")
            messages = [{"role": "user", "content": "Generate JSON"}]

            with pytest.raises(Exception):
                await provider.generate_structured(messages)


class TestTokenCounting:
    """Test token usage tracking."""

    @pytest.mark.asyncio
    async def test_tracks_token_usage(self):
        """Should track token usage from API responses."""
        with patch('app.services.llm.openai_provider.AsyncOpenAI') as mock_client_class:
            mock_completion = MagicMock()
            mock_completion.choices = [MagicMock()]
            mock_completion.choices[0].message.content = "Response"
            mock_completion.usage.total_tokens = 150
            mock_completion.usage.prompt_tokens = 50
            mock_completion.usage.completion_tokens = 100

            mock_client = MagicMock()
            mock_client.chat.completions.create = AsyncMock(return_value=mock_completion)
            mock_client_class.return_value = mock_client

            from app.services.llm.openai_provider import OpenAIProvider

            provider = OpenAIProvider(api_key="test-key")
            messages = [{"role": "user", "content": "Hi"}]

            response = await provider.generate_text(messages)

            assert response.tokens_used == 150
