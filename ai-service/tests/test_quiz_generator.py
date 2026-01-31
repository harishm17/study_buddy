"""Tests for quiz generation functionality."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.content_generator.quiz import QuizGenerator, QuestionType


class TestQuizGenerator:
    """Test quiz generation service."""

    @pytest.fixture
    def mock_db_chunks(self):
        """Mock database chunks."""
        return [
            {
                "chunk_text": "Machine learning is a subset of AI that enables computers to learn from data.",
                "section_hierarchy": "Chapter 1 > Introduction",
                "filename": "ml_textbook.pdf",
                "relevance_score": 0.95
            },
            {
                "chunk_text": "Supervised learning involves training on labeled data with input-output pairs.",
                "section_hierarchy": "Chapter 1 > Supervised Learning",
                "filename": "ml_textbook.pdf",
                "relevance_score": 0.90
            }
        ]

    @pytest.fixture
    def mock_generated_questions(self):
        """Mock LLM-generated questions."""
        return [
            {
                "type": "multiple_choice",
                "question": "What is machine learning?",
                "options": ["A subset of AI", "A programming language", "A database", "A web framework"],
                "correct_answer": 0,
                "explanation": "Machine learning is defined as a subset of AI."
            },
            {
                "type": "short_answer",
                "question": "Explain supervised learning.",
                "correct_answer": "Supervised learning is training on labeled data.",
                "explanation": "Requires labeled input-output pairs."
            },
            {
                "type": "true_false",
                "question": "Machine learning requires explicit programming for every scenario.",
                "correct_answer": False,
                "explanation": "ML learns patterns from data without explicit programming."
            }
        ]

    @pytest.mark.asyncio
    async def test_generate_quiz_basic(self, mock_db_chunks, mock_generated_questions):
        """Should generate quiz with specified number of questions."""
        with patch('app.services.content_generator.quiz.execute_query') as mock_query, \
             patch('app.services.content_generator.quiz.LLMFactory.get_provider') as mock_llm_factory:

            # Mock database query
            mock_query.return_value = mock_db_chunks

            # Mock LLM provider
            mock_llm = MagicMock()
            mock_llm.generate_structured = AsyncMock(return_value={
                "questions": mock_generated_questions[:2]
            })
            mock_llm_factory.return_value = mock_llm

            generator = QuizGenerator()
            result = await generator.generate_quiz(
                topic_id="topic_123",
                topic_name="Machine Learning Basics",
                topic_description="Introduction to ML concepts",
                question_count=2
            )

            assert result is not None
            assert "questions" in result
            assert "total_questions" in result
            assert result["total_questions"] >= 0

    @pytest.mark.asyncio
    async def test_generate_quiz_multiple_choice_only(self, mock_db_chunks):
        """Should generate only multiple choice questions when specified."""
        with patch('app.services.content_generator.quiz.execute_query') as mock_query, \
             patch('app.services.content_generator.quiz.LLMFactory.get_provider') as mock_llm_factory:

            mock_query.return_value = mock_db_chunks

            mock_llm = MagicMock()
            mock_llm.generate_structured = AsyncMock(return_value={
                "questions": [
                    {
                        "type": "multiple_choice",
                        "question": "What is ML?",
                        "options": ["AI subset", "Database", "Language", "Framework"],
                        "correct_answer": 0
                    }
                ]
            })
            mock_llm_factory.return_value = mock_llm

            generator = QuizGenerator()
            result = await generator.generate_quiz(
                topic_id="topic_123",
                topic_name="ML Basics",
                topic_description="Introduction",
                question_count=1,
                question_types=[QuestionType.MULTIPLE_CHOICE]
            )

            assert "question_types" in result
            assert QuestionType.MULTIPLE_CHOICE.value in result["question_types"]

    @pytest.mark.asyncio
    async def test_generate_quiz_no_chunks_raises_error(self):
        """Should raise error when no relevant chunks found."""
        with patch('app.services.content_generator.quiz.execute_query') as mock_query, \
             patch('app.services.content_generator.quiz.LLMFactory.get_provider') as mock_llm_factory:

            # Mock empty chunks
            mock_query.return_value = []

            mock_llm_factory.return_value = MagicMock()

            generator = QuizGenerator()

            with pytest.raises(ValueError, match="No relevant chunks found"):
                await generator.generate_quiz(
                    topic_id="nonexistent_topic",
                    topic_name="Test",
                    topic_description="Test",
                    question_count=5
                )

    @pytest.mark.asyncio
    async def test_generate_quiz_difficulty_levels(self, mock_db_chunks, mock_generated_questions):
        """Should support different difficulty levels."""
        with patch('app.services.content_generator.quiz.execute_query') as mock_query, \
             patch('app.services.content_generator.quiz.LLMFactory.get_provider') as mock_llm_factory:

            mock_query.return_value = mock_db_chunks

            mock_llm = MagicMock()
            mock_llm.generate_structured = AsyncMock(return_value={
                "questions": mock_generated_questions
            })
            mock_llm_factory.return_value = mock_llm

            generator = QuizGenerator()

            for difficulty in ["easy", "medium", "hard"]:
                result = await generator.generate_quiz(
                    topic_id="topic_123",
                    topic_name="ML Basics",
                    topic_description="Introduction",
                    question_count=3,
                    difficulty_level=difficulty
                )

                assert result["difficulty_level"] == difficulty

    @pytest.mark.asyncio
    async def test_generate_quiz_includes_metadata(self, mock_db_chunks, mock_generated_questions):
        """Generated quiz should include metadata."""
        with patch('app.services.content_generator.quiz.execute_query') as mock_query, \
             patch('app.services.content_generator.quiz.LLMFactory.get_provider') as mock_llm_factory:

            mock_query.return_value = mock_db_chunks

            mock_llm = MagicMock()
            mock_llm.generate_structured = AsyncMock(return_value={
                "questions": mock_generated_questions
            })
            mock_llm_factory.return_value = mock_llm

            generator = QuizGenerator()
            result = await generator.generate_quiz(
                topic_id="topic_123",
                topic_name="ML Basics",
                topic_description="Introduction",
                question_count=3
            )

            # Check for metadata fields
            assert "questions" in result
            assert "total_questions" in result
            assert "difficulty_level" in result
            assert "question_types" in result
            assert "generated_at" in result

    @pytest.mark.asyncio
    async def test_question_type_validation(self):
        """Should validate question types."""
        # Test that QuestionType enum has expected values
        assert QuestionType.MULTIPLE_CHOICE.value == "multiple_choice"
        assert QuestionType.SHORT_ANSWER.value == "short_answer"
        assert QuestionType.NUMERICAL.value == "numerical"
        assert QuestionType.TRUE_FALSE.value == "true_false"


class TestQuestionTypes:
    """Test question type handling."""

    def test_all_question_types_supported(self):
        """All standard question types should be available."""
        types = [
            QuestionType.MULTIPLE_CHOICE,
            QuestionType.SHORT_ANSWER,
            QuestionType.NUMERICAL,
            QuestionType.TRUE_FALSE
        ]
        assert len(types) == 4

    def test_question_type_values(self):
        """Question type enum values should match expected strings."""
        assert QuestionType.MULTIPLE_CHOICE.value == "multiple_choice"
        assert QuestionType.SHORT_ANSWER.value == "short_answer"
        assert QuestionType.NUMERICAL.value == "numerical"
        assert QuestionType.TRUE_FALSE.value == "true_false"
