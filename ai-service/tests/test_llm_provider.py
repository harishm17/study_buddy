"""Tests for LLM provider abstraction."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.llm.base import LLMMessage


class TestLLMProviderFactory:
    """Factory coverage for provider wiring."""

    def test_factory_returns_openai_provider(self):
        with patch("app.services.llm.factory.settings") as mock_settings:
            mock_settings.LLM_PROVIDER = "openai"
            mock_settings.OPENAI_API_KEY = "test-key"
            mock_settings.OPENAI_MODEL = "gpt-5-mini"
            mock_settings.OPENAI_MINI_MODEL = "gpt-5-mini"
            mock_settings.OPENAI_EMBEDDING_MODEL = "text-embedding-3-small"

            from app.services.llm.factory import LLMFactory

            LLMFactory.reset()
            provider = LLMFactory.get_provider()
            assert provider is not None

    def test_provider_has_required_methods(self):
        with patch("app.services.llm.factory.settings") as mock_settings:
            mock_settings.LLM_PROVIDER = "openai"
            mock_settings.OPENAI_API_KEY = "test-key"
            mock_settings.OPENAI_MODEL = "gpt-5-mini"
            mock_settings.OPENAI_MINI_MODEL = "gpt-5-mini"
            mock_settings.OPENAI_EMBEDDING_MODEL = "text-embedding-3-small"

            from app.services.llm.factory import LLMFactory

            LLMFactory.reset()
            provider = LLMFactory.get_provider()
            assert hasattr(provider, "generate_text")
            assert hasattr(provider, "generate_structured")
            assert hasattr(provider, "generate_embedding")


class TestOpenAIProviderResponses:
    """Behavior coverage for Responses API request construction."""

    @pytest.mark.asyncio
    async def test_generate_text_strips_temperature_for_gpt5_models(self):
        mock_client = MagicMock()
        mock_responses = MagicMock()
        mock_create = AsyncMock(
            return_value={
                "output_text": "hello",
                "usage": {"input_tokens": 2, "output_tokens": 3},
                "status": "completed",
            }
        )
        mock_responses.create = mock_create
        mock_client.responses = mock_responses

        with patch("app.services.llm.openai_provider.AsyncOpenAI", return_value=mock_client):
            from app.services.llm.openai_provider import OpenAIProvider

            provider = OpenAIProvider(api_key="test-key", default_model="gpt-5-mini")
            response = await provider.generate_text(
                messages=[LLMMessage(role="user", content="Hello")],
                temperature=0.7,
                max_tokens=256,
                top_p=0.4,
                logprobs=True,
            )

            assert response.content == "hello"
            assert response.tokens_used == 5

            call_kwargs = mock_create.call_args.kwargs
            assert "temperature" not in call_kwargs
            assert "top_p" not in call_kwargs
            assert "logprobs" not in call_kwargs
            assert call_kwargs["max_output_tokens"] == 256
            assert call_kwargs["model"] == "gpt-5-mini"

    @pytest.mark.asyncio
    async def test_generate_text_keeps_temperature_for_non_reasoning_models(self):
        mock_client = MagicMock()
        mock_responses = MagicMock()
        mock_create = AsyncMock(
            return_value={
                "output_text": "ok",
                "usage": {"total_tokens": 11},
                "status": "completed",
            }
        )
        mock_responses.create = mock_create
        mock_client.responses = mock_responses

        with patch("app.services.llm.openai_provider.AsyncOpenAI", return_value=mock_client):
            from app.services.llm.openai_provider import OpenAIProvider

            provider = OpenAIProvider(api_key="test-key", default_model="gpt-4o-mini")
            await provider.generate_text(
                messages=[LLMMessage(role="user", content="Hello")],
                temperature=0.4,
                top_p=0.9,
            )

            call_kwargs = mock_create.call_args.kwargs
            assert call_kwargs["temperature"] == 0.4
            assert call_kwargs["top_p"] == 0.9
            assert call_kwargs["model"] == "gpt-4o-mini"

    @pytest.mark.asyncio
    async def test_generate_structured_uses_json_schema_format(self):
        mock_client = MagicMock()
        mock_responses = MagicMock()
        mock_create = AsyncMock(
            return_value={
                "output_text": '{"title":"Safe C Strings","difficulty":"medium"}',
                "usage": {"total_tokens": 15},
                "status": "completed",
            }
        )
        mock_responses.create = mock_create
        mock_client.responses = mock_responses

        with patch("app.services.llm.openai_provider.AsyncOpenAI", return_value=mock_client):
            from app.services.llm.openai_provider import OpenAIProvider

            provider = OpenAIProvider(api_key="test-key", default_model="gpt-5-mini")
            schema = {
                "type": "json_schema",
                "json_schema": {
                    "name": "study_note",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "difficulty": {"type": "string"},
                        },
                        "required": ["title", "difficulty"],
                        "additionalProperties": False,
                    },
                },
            }
            result = await provider.generate_structured(
                messages=[LLMMessage(role="user", content="Generate JSON")],
                response_format=schema,
                temperature=0.8,
            )

            assert result["title"] == "Safe C Strings"
            call_kwargs = mock_create.call_args.kwargs
            assert "temperature" not in call_kwargs
            assert call_kwargs["text"]["format"]["type"] == "json_schema"
            assert call_kwargs["text"]["format"]["name"] == "study_note"

    @pytest.mark.asyncio
    async def test_structured_fallback_parses_json_from_non_schema_response(self):
        mock_client = MagicMock()
        mock_responses = MagicMock()

        from openai import BadRequestError

        request_obj = MagicMock()
        request_obj.method = "POST"
        request_obj.url = "https://api.openai.com/v1/responses"
        bad_response = MagicMock()
        bad_response.status_code = 400
        bad_response.request = request_obj
        bad_response.headers = {}

        first_call = BadRequestError(
            message="Schema not supported",
            response=bad_response,
            body={"error": {"message": "Schema not supported"}},
        )
        second_call = {
            "output_text": "```json\n{\"score\": 0.9}\n```",
            "status": "completed",
            "usage": {"total_tokens": 9},
        }
        mock_responses.create = AsyncMock(side_effect=[first_call, second_call])
        mock_client.responses = mock_responses

        with patch("app.services.llm.openai_provider.AsyncOpenAI", return_value=mock_client):
            from app.services.llm.openai_provider import OpenAIProvider

            provider = OpenAIProvider(api_key="test-key", default_model="gpt-5-mini")
            result = await provider.generate_structured(
                messages=[LLMMessage(role="user", content="Generate JSON")],
                response_format={
                    "type": "json_schema",
                    "name": "score_obj",
                    "schema": {"type": "object"},
                    "strict": True,
                },
            )

            assert result["score"] == 0.9
            assert mock_responses.create.await_count == 2

    @pytest.mark.asyncio
    async def test_http_fallback_when_sdk_has_no_responses_attribute(self):
        mock_client = MagicMock()
        mock_client.responses = None

        http_response = MagicMock()
        http_response.status_code = 200
        http_response.json.return_value = {
            "output_text": "fallback works",
            "status": "completed",
            "usage": {"total_tokens": 4},
        }

        with patch("app.services.llm.openai_provider.AsyncOpenAI", return_value=mock_client), patch(
            "app.services.llm.openai_provider.httpx.AsyncClient"
        ) as mock_http_client:
            http_client_ctx = mock_http_client.return_value
            http_client_ctx.__aenter__.return_value.post = AsyncMock(return_value=http_response)

            from app.services.llm.openai_provider import OpenAIProvider

            provider = OpenAIProvider(api_key="test-key", default_model="gpt-5-mini")
            response = await provider.generate_text([LLMMessage(role="user", content="Hi")])

            assert response.content == "fallback works"
            post_kwargs = http_client_ctx.__aenter__.return_value.post.call_args.kwargs
            assert post_kwargs["headers"]["Authorization"] == "Bearer test-key"
            assert post_kwargs["json"]["model"] == "gpt-5-mini"


class TestEmbeddingGeneration:
    @pytest.mark.asyncio
    async def test_generate_embedding(self):
        mock_client = MagicMock()
        mock_response = SimpleNamespace(data=[SimpleNamespace(embedding=[0.1] * 3)])
        mock_client.embeddings.create = AsyncMock(return_value=mock_response)
        mock_client.responses = MagicMock()

        with patch("app.services.llm.openai_provider.AsyncOpenAI", return_value=mock_client):
            from app.services.llm.openai_provider import OpenAIProvider

            provider = OpenAIProvider(api_key="test-key", embedding_model="text-embedding-3-small")
            embedding = await provider.generate_embedding("Test text")

            assert embedding == [0.1, 0.1, 0.1]
            kwargs = mock_client.embeddings.create.call_args.kwargs
            assert kwargs["model"] == "text-embedding-3-small"
