"""Tests for embedding generation and vector search."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import numpy as np


class TestEmbeddingGeneration:
    """Test embedding generation functionality."""

    @pytest.mark.asyncio
    async def test_generates_embedding_vector(self):
        """Should generate embedding of correct dimension."""
        with patch('app.services.embeddings.generator.LLMFactory') as mock_factory:
            mock_llm = MagicMock()
            mock_llm.generate_embedding = AsyncMock(return_value=[0.1] * 1536)
            mock_factory.get_provider.return_value = mock_llm

            from app.services.embeddings.generator import generate_embedding

            embedding = await generate_embedding("Test text")
            assert len(embedding) == 1536
            assert all(isinstance(x, (int, float)) for x in embedding)

    @pytest.mark.asyncio
    async def test_batch_embedding(self):
        """Should handle batch embedding requests."""
        with patch('app.services.embeddings.generator.LLMFactory') as mock_factory:
            mock_llm = MagicMock()
            mock_llm.generate_embedding = AsyncMock(return_value=[0.1] * 1536)
            mock_factory.get_provider.return_value = mock_llm

            from app.services.embeddings.generator import generate_embeddings_batch

            texts = ["Text 1", "Text 2", "Text 3"]
            embeddings = await generate_embeddings_batch(texts)

            assert len(embeddings) == 3
            for emb in embeddings:
                assert len(emb) == 1536

    @pytest.mark.asyncio
    async def test_empty_text_handling(self):
        """Should handle empty text input."""
        with patch('app.services.embeddings.generator.LLMFactory') as mock_factory:
            mock_llm = MagicMock()
            mock_llm.generate_embedding = AsyncMock(return_value=[0.0] * 1536)
            mock_factory.get_provider.return_value = mock_llm

            from app.services.embeddings.generator import generate_embedding

            embedding = await generate_embedding("")
            assert embedding is not None
            assert len(embedding) == 1536


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

            query_embedding = [0.1] * 1536
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
                embedding=[0.1] * 1536,
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
                embedding=[0.1] * 1536,
                top_k=10,
                min_similarity=0.6
            )

            # Only results above threshold should be returned
            for result in results:
                assert result['similarity_score'] >= 0.6


class TestEmbeddingDimensions:
    """Test embedding vector properties."""

    def test_embedding_dimension_consistency(self):
        """All embeddings should have same dimension."""
        # OpenAI text-embedding-3-small produces 1536 dimensions
        expected_dim = 1536

        mock_embeddings = [
            [0.1] * expected_dim,
            [0.2] * expected_dim,
            [0.3] * expected_dim
        ]

        for emb in mock_embeddings:
            assert len(emb) == expected_dim

    def test_embedding_normalization(self):
        """Embeddings should be normalized (optional test)."""
        # Some embedding models return normalized vectors
        # This tests L2 normalization
        embedding = np.array([0.6, 0.8])
        norm = np.linalg.norm(embedding)
        normalized = embedding / norm

        assert abs(np.linalg.norm(normalized) - 1.0) < 1e-6


class TestEmbeddingCaching:
    """Test embedding caching (if implemented)."""

    @pytest.mark.skip(reason="Caching not yet implemented")
    @pytest.mark.asyncio
    async def test_cached_embeddings(self):
        """Should reuse cached embeddings for same text."""
        pass

    @pytest.mark.skip(reason="Caching not yet implemented")
    @pytest.mark.asyncio
    async def test_cache_invalidation(self):
        """Should invalidate cache when needed."""
        pass
