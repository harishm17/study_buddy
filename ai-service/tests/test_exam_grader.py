"""Tests for exam grading functionality."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.exam_grader import ExamGrader


class TestMultipleChoiceGrading:
    """Test multiple choice question grading."""

    def test_correct_answer(self):
        """Correct MCQ answer should get full points."""
        grader = ExamGrader()
        question = {
            'question_text': 'What is 2+2?',
            'question_type': 'multiple_choice',
            'correct_answer': 'B',
            'points': 10,
            'explanation': 'The answer is 4.'
        }

        result = grader._grade_multiple_choice(question, 'B')

        assert result['points_earned'] == 10
        assert result['is_correct'] is True
        assert 'Correct!' in result['feedback']

    def test_incorrect_answer(self):
        """Incorrect MCQ answer should get zero points."""
        grader = ExamGrader()
        question = {
            'question_text': 'What is 2+2?',
            'question_type': 'multiple_choice',
            'correct_answer': 'B',
            'points': 10,
            'explanation': 'The answer is 4.'
        }

        result = grader._grade_multiple_choice(question, 'C')

        assert result['points_earned'] == 0
        assert result['is_correct'] is False
        assert 'Incorrect' in result['feedback']
        assert 'B' in result['feedback']

    def test_case_insensitive(self):
        """MCQ grading should be case insensitive."""
        grader = ExamGrader()
        question = {
            'question_text': 'Test question',
            'question_type': 'multiple_choice',
            'correct_answer': 'A',
            'points': 5
        }

        # Test lowercase
        result = grader._grade_multiple_choice(question, 'a')
        assert result['is_correct'] is True

        # Test uppercase
        result = grader._grade_multiple_choice(question, 'A')
        assert result['is_correct'] is True

    def test_whitespace_handling(self):
        """Should handle whitespace in answers."""
        grader = ExamGrader()
        question = {
            'question_text': 'Test question',
            'question_type': 'multiple_choice',
            'correct_answer': 'B',
            'points': 5
        }

        result = grader._grade_multiple_choice(question, '  B  ')
        assert result['is_correct'] is True


class TestTrueFalseGrading:
    """Test true/false question grading."""

    def test_correct_true(self):
        """Correct true answer should get full points."""
        grader = ExamGrader()
        question = {
            'question_text': 'Python is a programming language.',
            'question_type': 'true_false',
            'correct_answer': True,
            'points': 5
        }

        result = grader._grade_true_false(question, True)

        assert result['points_earned'] == 5
        assert result['is_correct'] is True

    def test_correct_false(self):
        """Correct false answer should get full points."""
        grader = ExamGrader()
        question = {
            'question_text': 'Python is a database.',
            'question_type': 'true_false',
            'correct_answer': False,
            'points': 5
        }

        result = grader._grade_true_false(question, False)

        assert result['points_earned'] == 5
        assert result['is_correct'] is True

    def test_incorrect_answer(self):
        """Incorrect true/false answer should get zero points."""
        grader = ExamGrader()
        question = {
            'question_text': 'Test question',
            'question_type': 'true_false',
            'correct_answer': True,
            'points': 5
        }

        result = grader._grade_true_false(question, False)

        assert result['points_earned'] == 0
        assert result['is_correct'] is False

    def test_string_to_boolean_conversion(self):
        """Should convert string answers to boolean."""
        grader = ExamGrader()
        question = {
            'question_text': 'Test question',
            'question_type': 'true_false',
            'correct_answer': True,
            'points': 5
        }

        # Test various string representations
        for true_value in ['true', 'True', 'TRUE', 't', 'T', '1', 'yes']:
            result = grader._grade_true_false(question, true_value)
            assert result['is_correct'] is True, f"Failed for: {true_value}"

    def test_numeric_to_boolean_conversion(self):
        """Should convert numeric answers to boolean."""
        grader = ExamGrader()
        question = {
            'question_text': 'Test question',
            'question_type': 'true_false',
            'correct_answer': True,
            'points': 5
        }

        # 1 should be True
        result = grader._grade_true_false(question, 1)
        assert result['is_correct'] is True

        # 0 should be False
        question['correct_answer'] = False
        result = grader._grade_true_false(question, 0)
        assert result['is_correct'] is True


class TestNumericalGrading:
    """Test numerical question grading."""

    def test_exact_answer(self):
        """Exact numerical answer should get full points."""
        grader = ExamGrader()
        question = {
            'question_text': 'What is pi?',
            'question_type': 'numerical',
            'correct_answer': 3.14159,
            'tolerance': 0.001,
            'points': 10
        }

        result = grader._grade_numerical(question, 3.14159)

        assert result['points_earned'] == 10
        assert result['is_correct'] is True

    def test_within_tolerance(self):
        """Answer within tolerance should get full points."""
        grader = ExamGrader()
        question = {
            'question_text': 'What is pi?',
            'question_type': 'numerical',
            'correct_answer': 3.14159,
            'tolerance': 0.01,
            'points': 10
        }

        # 3.14 is within 0.01 of 3.14159
        result = grader._grade_numerical(question, 3.14)
        assert result['points_earned'] == 10
        assert result['is_correct'] is True

    def test_outside_tolerance(self):
        """Answer outside tolerance should get zero points."""
        grader = ExamGrader()
        question = {
            'question_text': 'What is pi?',
            'question_type': 'numerical',
            'correct_answer': 3.14159,
            'tolerance': 0.01,
            'points': 10
        }

        # 3.5 is not within 0.01 of 3.14159
        result = grader._grade_numerical(question, 3.5)
        assert result['points_earned'] == 0
        assert result['is_correct'] is False

    def test_zero_tolerance(self):
        """Zero tolerance should require exact match."""
        grader = ExamGrader()
        question = {
            'question_text': 'What is 5?',
            'question_type': 'numerical',
            'correct_answer': 5.0,
            'tolerance': 0,
            'points': 10
        }

        result = grader._grade_numerical(question, 5.0)
        assert result['is_correct'] is True

        result = grader._grade_numerical(question, 5.1)
        assert result['is_correct'] is False

    def test_invalid_input(self):
        """Invalid numerical input should get zero points."""
        grader = ExamGrader()
        question = {
            'question_text': 'What is pi?',
            'question_type': 'numerical',
            'correct_answer': 3.14159,
            'tolerance': 0.01,
            'points': 10
        }

        # Test non-numeric input
        result = grader._grade_numerical(question, 'not a number')
        assert result['points_earned'] == 0
        assert result['is_correct'] is False

    def test_negative_numbers(self):
        """Should handle negative numbers correctly."""
        grader = ExamGrader()
        question = {
            'question_text': 'What is -5?',
            'question_type': 'numerical',
            'correct_answer': -5.0,
            'tolerance': 0.1,
            'points': 10
        }

        result = grader._grade_numerical(question, -5.0)
        assert result['is_correct'] is True

        result = grader._grade_numerical(question, -4.95)
        assert result['is_correct'] is True


class TestShortAnswerGrading:
    """Test short answer question grading with AI."""

    @pytest.mark.asyncio
    async def test_short_answer_development_mode(self):
        """In development mode, should return mock grading."""
        with patch('app.services.exam_grader.settings') as mock_settings:
            mock_settings.is_development = True

            grader = ExamGrader()
            question = {
                'question_text': 'Explain machine learning.',
                'question_type': 'short_answer',
                'points': 10,
                'sample_answer': 'ML is a subset of AI...',
                'key_points': ['AI subset', 'learns from data']
            }

            result = await grader._grade_short_answer(question, 'Student answer here')

            assert 'points_earned' in result
            assert result['points_earned'] > 0
            assert 'DEV MODE' in result['feedback']

    @pytest.mark.asyncio
    async def test_short_answer_full_credit(self):
        """Should award full credit for complete answer."""
        with patch('app.services.exam_grader.settings') as mock_settings, \
             patch('app.services.exam_grader.LLMFactory.get_provider') as mock_llm_factory:

            mock_settings.is_development = False

            mock_llm = MagicMock()
            mock_llm.generate_structured = AsyncMock(return_value={
                'points_earned': 10,
                'is_correct': True,
                'feedback': 'Excellent answer covering all key points.'
            })
            mock_llm_factory.return_value = mock_llm

            grader = ExamGrader()
            question = {
                'question_text': 'Explain ML.',
                'question_type': 'short_answer',
                'points': 10,
                'sample_answer': 'Answer',
                'key_points': ['Point 1']
            }

            result = await grader._grade_short_answer(question, 'Great answer')

            assert result['points_earned'] == 10
            assert result['is_correct'] is True

    @pytest.mark.asyncio
    async def test_short_answer_partial_credit(self):
        """Should award partial credit for incomplete answer."""
        with patch('app.services.exam_grader.settings') as mock_settings, \
             patch('app.services.exam_grader.LLMFactory.get_provider') as mock_llm_factory:

            mock_settings.is_development = False

            mock_llm = MagicMock()
            mock_llm.generate_structured = AsyncMock(return_value={
                'points_earned': 5,
                'is_correct': False,
                'feedback': 'Good start but missing key concepts.'
            })
            mock_llm_factory.return_value = mock_llm

            grader = ExamGrader()
            question = {
                'question_text': 'Explain ML.',
                'question_type': 'short_answer',
                'points': 10,
                'sample_answer': 'Answer',
                'key_points': ['Point 1']
            }

            result = await grader._grade_short_answer(question, 'Partial answer')

            assert 0 < result['points_earned'] < 10
            assert result['is_correct'] is False

    @pytest.mark.asyncio
    async def test_short_answer_error_handling(self):
        """Should handle AI grading errors gracefully."""
        with patch('app.services.exam_grader.settings') as mock_settings, \
             patch('app.services.exam_grader.LLMFactory.get_provider') as mock_llm_factory:

            mock_settings.is_development = False

            mock_llm = MagicMock()
            mock_llm.generate_structured = AsyncMock(side_effect=Exception('API Error'))
            mock_llm_factory.return_value = mock_llm

            grader = ExamGrader()
            question = {
                'question_text': 'Explain ML.',
                'question_type': 'short_answer',
                'points': 10,
                'sample_answer': 'Answer',
                'key_points': ['Point 1']
            }

            result = await grader._grade_short_answer(question, 'Answer')

            # Should fallback to 50% credit
            assert result['points_earned'] == 5
            assert 'Unable to fully grade' in result['feedback']


class TestExamSubmissionGrading:
    """Test complete exam submission grading."""

    @pytest.mark.asyncio
    async def test_grade_full_submission(self):
        """Should grade complete exam submission."""
        with patch('app.services.exam_grader.LLMFactory.get_provider') as mock_llm_factory:
            mock_llm = MagicMock()
            mock_llm_factory.return_value = mock_llm

            grader = ExamGrader()

            questions = [
                {
                    'question_text': 'What is 2+2?',
                    'question_type': 'multiple_choice',
                    'correct_answer': 'B',
                    'points': 10
                },
                {
                    'question_text': 'Python is a language.',
                    'question_type': 'true_false',
                    'correct_answer': True,
                    'points': 5
                }
            ]

            answers = {
                '0': 'B',  # Correct
                '1': True  # Correct
            }

            result = await grader.grade_submission(
                submission_id='sub_123',
                questions=questions,
                answers=answers
            )

            assert result['submission_id'] == 'sub_123'
            assert result['total_points'] == 15
            assert result['earned_points'] == 15
            assert result['overall_score'] == 100.0
            assert len(result['graded_questions']) == 2

    @pytest.mark.asyncio
    async def test_grade_partial_submission(self):
        """Should handle unanswered questions."""
        with patch('app.services.exam_grader.LLMFactory.get_provider') as mock_llm_factory:
            mock_llm_factory.return_value = MagicMock()

            grader = ExamGrader()

            questions = [
                {
                    'question_text': 'Q1',
                    'question_type': 'multiple_choice',
                    'correct_answer': 'A',
                    'points': 10
                },
                {
                    'question_text': 'Q2',
                    'question_type': 'multiple_choice',
                    'correct_answer': 'B',
                    'points': 10
                }
            ]

            # Only answer first question
            answers = {'0': 'A'}

            result = await grader.grade_submission(
                submission_id='sub_123',
                questions=questions,
                answers=answers
            )

            assert result['total_points'] == 20
            assert result['earned_points'] == 10
            assert result['overall_score'] == 50.0
            assert result['graded_questions'][1]['feedback'] == 'Question not answered'

    @pytest.mark.asyncio
    async def test_grade_empty_submission(self):
        """Should handle completely empty submission."""
        with patch('app.services.exam_grader.LLMFactory.get_provider') as mock_llm_factory:
            mock_llm_factory.return_value = MagicMock()

            grader = ExamGrader()

            questions = [
                {'question_text': 'Q1', 'question_type': 'multiple_choice', 'correct_answer': 'A', 'points': 10}
            ]

            result = await grader.grade_submission(
                submission_id='sub_123',
                questions=questions,
                answers={}
            )

            assert result['earned_points'] == 0
            assert result['overall_score'] == 0.0
