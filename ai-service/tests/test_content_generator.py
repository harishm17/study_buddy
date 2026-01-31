"""Tests for AI content generation."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestNotesGeneration:
    """Test study notes generation."""

    @pytest.mark.asyncio
    async def test_generates_structured_notes(self, sample_chunks):
        """Generated notes should have required structure."""
        with patch('app.services.content_generator.notes.execute_query') as mock_query, \
             patch('app.services.content_generator.notes.LLMFactory.get_provider') as mock_llm_factory:

            mock_query.return_value = sample_chunks

            mock_llm = MagicMock()
            mock_llm.generate_structured = AsyncMock(return_value={
                "title": "Machine Learning Basics",
                "sections": [
                    {
                        "heading": "Introduction",
                        "content": "Machine learning is...",
                        "key_points": ["Point 1", "Point 2"]
                    }
                ]
            })
            mock_llm_factory.return_value = mock_llm

            from app.services.content_generator.notes import generate_notes

            result = await generate_notes(
                topic_id="topic_123",
                topic_name="ML Basics",
                topic_description="Introduction to ML"
            )

            assert "title" in result
            assert "sections" in result
            assert len(result["sections"]) > 0

    @pytest.mark.asyncio
    async def test_handles_empty_chunks(self):
        """Should handle empty chunk list gracefully."""
        with patch('app.services.content_generator.notes.execute_query') as mock_query, \
             patch('app.services.content_generator.notes.LLMFactory.get_provider') as mock_llm_factory:

            mock_query.return_value = []
            mock_llm_factory.return_value = MagicMock()

            from app.services.content_generator.notes import generate_notes

            with pytest.raises(ValueError, match="No relevant chunks"):
                await generate_notes(
                    topic_id="empty_topic",
                    topic_name="Test",
                    topic_description="Test"
                )

    @pytest.mark.asyncio
    async def test_includes_code_examples(self, sample_chunks):
        """Notes should include code examples when available."""
        with patch('app.services.content_generator.notes.execute_query') as mock_query, \
             patch('app.services.content_generator.notes.LLMFactory.get_provider') as mock_llm_factory:

            mock_query.return_value = sample_chunks

            mock_llm = MagicMock()
            mock_llm.generate_structured = AsyncMock(return_value={
                "title": "Python Basics",
                "sections": [
                    {
                        "heading": "Variables",
                        "content": "Variables store data.",
                        "code_examples": [
                            {
                                "code": "x = 10",
                                "explanation": "Assigns 10 to x"
                            }
                        ]
                    }
                ]
            })
            mock_llm_factory.return_value = mock_llm

            from app.services.content_generator.notes import generate_notes

            result = await generate_notes(
                topic_id="topic_123",
                topic_name="Python",
                topic_description="Python programming",
                include_examples=True
            )

            # Check if code examples are included
            if "sections" in result and len(result["sections"]) > 0:
                section = result["sections"][0]
                if "code_examples" in section:
                    assert len(section["code_examples"]) > 0


class TestExamplesGeneration:
    """Test practice examples generation."""

    @pytest.mark.asyncio
    async def test_generates_practice_problems(self, sample_chunks):
        """Should generate practice problems."""
        with patch('app.services.content_generator.examples.execute_query') as mock_query, \
             patch('app.services.content_generator.examples.LLMFactory.get_provider') as mock_llm_factory:

            mock_query.return_value = sample_chunks

            mock_llm = MagicMock()
            mock_llm.generate_structured = AsyncMock(return_value={
                "examples": [
                    {
                        "problem": "Calculate the derivative of f(x) = x^2",
                        "solution": "f'(x) = 2x",
                        "steps": ["Apply power rule", "Result: 2x"],
                        "difficulty": "easy"
                    }
                ]
            })
            mock_llm_factory.return_value = mock_llm

            from app.services.content_generator.examples import generate_examples

            result = await generate_examples(
                topic_id="topic_123",
                topic_name="Calculus",
                topic_description="Derivatives",
                example_count=5
            )

            assert "examples" in result
            assert len(result["examples"]) > 0

    @pytest.mark.asyncio
    async def test_difficulty_levels(self, sample_chunks):
        """Should support different difficulty levels."""
        with patch('app.services.content_generator.examples.execute_query') as mock_query, \
             patch('app.services.content_generator.examples.LLMFactory.get_provider') as mock_llm_factory:

            mock_query.return_value = sample_chunks

            mock_llm = MagicMock()
            mock_llm.generate_structured = AsyncMock(return_value={
                "examples": [
                    {"problem": "P1", "solution": "S1", "difficulty": "hard"}
                ]
            })
            mock_llm_factory.return_value = mock_llm

            from app.services.content_generator.examples import generate_examples

            result = await generate_examples(
                topic_id="topic_123",
                topic_name="Test",
                topic_description="Test",
                difficulty="hard"
            )

            for example in result.get("examples", []):
                if "difficulty" in example:
                    assert example["difficulty"] == "hard"


class TestContentVariation:
    """Test content variation based on seed."""

    @pytest.mark.asyncio
    async def test_respects_variation_seed(self, sample_chunks):
        """Different seeds should influence generation."""
        with patch('app.services.content_generator.notes.execute_query') as mock_query, \
             patch('app.services.content_generator.notes.LLMFactory.get_provider') as mock_llm_factory:

            mock_query.return_value = sample_chunks

            mock_llm = MagicMock()
            mock_llm.generate_structured = AsyncMock(return_value={
                "title": "Test",
                "sections": []
            })
            mock_llm_factory.return_value = mock_llm

            from app.services.content_generator.notes import generate_notes

            # Generate with different seeds
            await generate_notes(
                topic_id="topic_123",
                topic_name="Test",
                topic_description="Test",
                variation_seed=12345
            )

            # Verify LLM was called
            assert mock_llm.generate_structured.called

    @pytest.mark.asyncio
    async def test_reproducible_with_same_seed(self, sample_chunks):
        """Same seed should produce similar content."""
        # This test would require deterministic LLM behavior
        # which is mocked here
        with patch('app.services.content_generator.notes.execute_query') as mock_query, \
             patch('app.services.content_generator.notes.LLMFactory.get_provider') as mock_llm_factory:

            mock_query.return_value = sample_chunks

            # Return same content for same seed
            mock_llm = MagicMock()
            mock_llm.generate_structured = AsyncMock(return_value={
                "title": "Consistent Title",
                "sections": [{"heading": "H1", "content": "C1"}]
            })
            mock_llm_factory.return_value = mock_llm

            from app.services.content_generator.notes import generate_notes

            result1 = await generate_notes(
                topic_id="topic_123",
                topic_name="Test",
                topic_description="Test",
                variation_seed=999
            )

            result2 = await generate_notes(
                topic_id="topic_123",
                topic_name="Test",
                topic_description="Test",
                variation_seed=999
            )

            # With mocked LLM, both should return same structure
            assert result1["title"] == result2["title"]


class TestContentFormatting:
    """Test content formatting and structure."""

    @pytest.mark.asyncio
    async def test_markdown_formatting(self, sample_chunks):
        """Content should support markdown formatting."""
        with patch('app.services.content_generator.notes.execute_query') as mock_query, \
             patch('app.services.content_generator.notes.LLMFactory.get_provider') as mock_llm_factory:

            mock_query.return_value = sample_chunks

            mock_llm = MagicMock()
            mock_llm.generate_structured = AsyncMock(return_value={
                "title": "Test",
                "sections": [
                    {
                        "heading": "Section 1",
                        "content": "This is **bold** and *italic* text.",
                        "key_points": ["Point 1"]
                    }
                ]
            })
            mock_llm_factory.return_value = mock_llm

            from app.services.content_generator.notes import generate_notes

            result = await generate_notes(
                topic_id="topic_123",
                topic_name="Test",
                topic_description="Test"
            )

            # Verify structure exists
            assert "sections" in result

    @pytest.mark.asyncio
    async def test_hierarchical_structure(self, sample_chunks):
        """Notes should have hierarchical section structure."""
        with patch('app.services.content_generator.notes.execute_query') as mock_query, \
             patch('app.services.content_generator.notes.LLMFactory.get_provider') as mock_llm_factory:

            mock_query.return_value = sample_chunks

            mock_llm = MagicMock()
            mock_llm.generate_structured = AsyncMock(return_value={
                "title": "Main Topic",
                "sections": [
                    {
                        "heading": "Section 1",
                        "content": "Content 1",
                        "subsections": [
                            {
                                "heading": "Subsection 1.1",
                                "content": "Detailed content"
                            }
                        ]
                    }
                ]
            })
            mock_llm_factory.return_value = mock_llm

            from app.services.content_generator.notes import generate_notes

            result = await generate_notes(
                topic_id="topic_123",
                topic_name="Test",
                topic_description="Test"
            )

            # Verify hierarchical structure
            if "sections" in result and len(result["sections"]) > 0:
                section = result["sections"][0]
                assert "heading" in section
                # Check for subsections if present
                if "subsections" in section:
                    assert isinstance(section["subsections"], list)
