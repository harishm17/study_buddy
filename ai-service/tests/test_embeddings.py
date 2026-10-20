"""Tests for embedding generation and vector search."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.embeddings import generator
from app.services.embeddings.generator import (
    LocalEmbedder,
    OpenAIEmbedder,
    generate_embeddings,
    generate_query_embedding,
    get_embedder,
    reset_embedder,
)


@pytest.fixture(autouse=True)
def _fresh_embedder():
    reset_embedder()
    yield
    reset_embedder()


class FakeTextEmbedding:
    """Stands in for fastembed.TextEmbedding: documents get 1.0s, queries 2.0s."""

    def __init__(self, *args, **kwargs):
        self.calls = []

    def embed(self, texts, batch_size=32):
        self.calls.append(("embed", list(texts), batch_size))
        for _ in texts:
            yield MagicMock(tolist=lambda: [1.0, 0.0, 0.0])

    def query_embed(self, text):
        self.calls.append(("query", text))
        yield MagicMock(tolist=lambda: [2.0, 0.0, 0.0])


class TestEmbedderSelection:
    def test_local_is_the_default(self):
        with patch.object(generator, "settings") as settings:
            settings.EMBEDDING_PROVIDER = "local"
            settings.EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5"
            settings.EMBEDDING_CACHE_DIR = ""
            embedder = get_embedder()
        assert isinstance(embedder, LocalEmbedder)
        assert embedder.name == "BAAI/bge-small-en-v1.5"

    def test_openai_needs_a_key(self):
        with patch.object(generator, "settings") as settings:
            settings.EMBEDDING_PROVIDER = "openai"
            settings.OPENAI_API_KEY = ""
            with pytest.raises(ValueError, match="OPENAI_API_KEY"):
                get_embedder()

    def test_openai_with_key(self):
        with patch.object(generator, "settings") as settings:
            settings.EMBEDDING_PROVIDER = "openai"
            settings.OPENAI_API_KEY = "test"
            settings.OPENAI_EMBEDDING_MODEL = "text-embedding-3-small"
            assert isinstance(get_embedder(), OpenAIEmbedder)

    def test_unknown_provider(self):
        with patch.object(generator, "settings") as settings:
            settings.EMBEDDING_PROVIDER = "voyage"
            with pytest.raises(ValueError, match="EMBEDDING_PROVIDER"):
                get_embedder()


class TestLocalEmbedder:
    @pytest.mark.asyncio
    async def test_documents_and_queries_use_different_paths(self):
        fake = FakeTextEmbedding()
        embedder = LocalEmbedder("model")
        embedder._model = fake
        generator._embedder = embedder

        docs = await generate_embeddings(["a", "b"])
        query = await generate_query_embedding("question")

        assert docs == [[1.0, 0.0, 0.0], [1.0, 0.0, 0.0]]
        assert query == [2.0, 0.0, 0.0]
        assert fake.calls[0][0] == "embed" and fake.calls[1] == ("query", "question")

    @pytest.mark.asyncio
    async def test_empty_input_skips_the_model(self):
        generator._embedder = MagicMock()
        assert await generate_embeddings([]) == []
        generator._embedder.embed_documents.assert_not_called()

    def test_model_loads_once(self):
        with patch("fastembed.TextEmbedding", FakeTextEmbedding) as _:
            embedder = LocalEmbedder("model", cache_dir="/tmp/x")
            assert embedder._get_model() is embedder._get_model()


class TestOpenAIEmbedder:
    @pytest.mark.asyncio
    async def test_batches_of_100(self):
        embedder = OpenAIEmbedder("key", "text-embedding-3-small")
        create = AsyncMock(
            side_effect=lambda model, input: MagicMock(data=[MagicMock(embedding=[0.5]) for _ in input])
        )
        embedder._client = MagicMock()
        embedder._client.embeddings.create = create
        vectors = await embedder.embed_documents([str(i) for i in range(250)])
        assert len(vectors) == 250
        assert [len(call.kwargs["input"]) for call in create.call_args_list] == [100, 100, 50]


class TestVectorSimilaritySearch:
    """Test vector similarity search functionality."""

    @pytest.mark.asyncio
    async def test_similarity_search_returns_top_k(self):
        """Should return top k most similar chunks."""
        with patch('app.services.embeddings.search.execute_query') as mock_query:
            # Mock database response
            mock_query.return_value = [
                {
                    'chunk_id': 'chunk_1',
                    'chunk_text': 'Machine learning content',
                    'similarity_score': 0.95
                },
                {
                    'chunk_id': 'chunk_2',
                    'chunk_text': 'Neural network content',
                    'similarity_score': 0.89
                }
            ]

            from app.services.embeddings.search import search_similar_chunks

            query_embedding = [0.1] * 384
            results = await search_similar_chunks(
                embedding=query_embedding,
                top_k=2,
                material_id='mat_123'
            )

            assert len(results) <= 2
            # Results should be ordered by similarity score
            if len(results) > 1:
                assert results[0]['similarity_score'] >= results[1]['similarity_score']

    @pytest.mark.asyncio
    async def test_similarity_search_filters_by_material(self):
        """Should filter results by material ID."""
        with patch('app.services.embeddings.search.execute_query') as mock_query:
            mock_query.return_value = []

            from app.services.embeddings.search import search_similar_chunks

            await search_similar_chunks(
                embedding=[0.1] * 384,
                top_k=5,
                material_id='specific_material'
            )

            # Verify the query included material filter
            call_args = mock_query.call_args
            assert 'specific_material' in str(call_args)

    @pytest.mark.asyncio
    async def test_similarity_threshold(self):
        """Should filter results by similarity threshold."""
        with patch('app.services.embeddings.search.execute_query') as mock_query:
            mock_query.return_value = [
                {'chunk_id': '1', 'chunk_text': 'A', 'similarity_score': 0.9},
                {'chunk_id': '2', 'chunk_text': 'B', 'similarity_score': 0.5},
                {'chunk_id': '3', 'chunk_text': 'C', 'similarity_score': 0.3}
            ]

            from app.services.embeddings.search import search_similar_chunks

            results = await search_similar_chunks(
                embedding=[0.1] * 384,
                top_k=10,
                min_similarity=0.6
            )

            # Only results above threshold should be returned
            for result in results:
                assert result['similarity_score'] >= 0.6
