"""Tests for output schemas: per-question validation and option shuffling."""
import random

import pytest

from app.services.llm.schemas import (
    ChoiceOption,
    GeneratedQuestion,
    QuestionSet,
    shuffle_choice_options,
)


def _mcq(**overrides):
    fields = dict(
        question_type="multiple_choice",
        question_text="Q",
        options=[ChoiceOption(id=x, text=f"text {x}") for x in "ABCD"],
        correct_answer="C",
        explanation="E",
        points=2,
    )
    fields.update(overrides)
    return GeneratedQuestion(**fields)


class TestNormalization:
    def test_valid_mcq(self):
        stored = _mcq(correct_answer=" c ").normalized()
        assert stored["correct_answer"] == "C"
        assert stored["options"][2] == {"id": "C", "text": "text C"}

    @pytest.mark.parametrize(
        "overrides",
        [
            {"correct_answer": "E"},
            {"correct_answer": None},
            {"options": [ChoiceOption(id="A", text="a"), ChoiceOption(id="B", text="b")]},
            {"options": [ChoiceOption(id="A", text="same"), ChoiceOption(id="B", text="Same"), ChoiceOption(id="C", text="c")]},
            {"question_text": "  "},
            {"explanation": ""},
        ],
    )
    def test_invalid_mcq_is_dropped(self, overrides):
        assert _mcq(**overrides).normalized() is None

    @pytest.mark.parametrize("value,expected", [(True, True), ("false", False), ("True", True), ("yes", None), (1, None)])
    def test_true_false_answers(self, value, expected):
        question = GeneratedQuestion(question_type="true_false", question_text="Q", correct_answer=value, explanation="E")
        stored = question.normalized()
        assert (stored["correct_answer"] if stored else None) == expected

    @pytest.mark.parametrize("value,expected", [(42, 42.0), ("1,250.5", 1250.5), ("abc", None), (True, None), (float("inf"), None)])
    def test_numerical_answers(self, value, expected):
        question = GeneratedQuestion(
            question_type="numerical", question_text="Q", correct_answer=value, tolerance=-0.5, unit="m", explanation="E"
        )
        stored = question.normalized()
        assert (stored["correct_answer"] if stored else None) == expected
        if stored:
            assert stored["tolerance"] == 0.5 and stored["unit"] == "m"

    def test_short_answer_needs_sample_and_key_points(self):
        base = dict(question_type="short_answer", question_text="Q", explanation="E")
        assert GeneratedQuestion(**base, sample_answer="S", key_points=["k"]).normalized()["key_points"] == ["k"]
        assert GeneratedQuestion(**base, sample_answer="S", key_points=[" "]).normalized() is None
        assert GeneratedQuestion(**base, key_points=["k"]).normalized() is None

    def test_points_are_clamped(self):
        assert _mcq(points=50).normalized()["points"] == 5
        assert _mcq(points=0).normalized()["points"] == 1


class TestShuffle:
    def test_correct_text_survives_shuffle(self):
        for seed in range(20):
            question = _mcq().normalized()
            shuffled = shuffle_choice_options(question, random.Random(seed))
            by_id = {o["id"]: o["text"] for o in shuffled["options"]}
            assert by_id[shuffled["correct_answer"]] == "text C"
            assert [o["id"] for o in shuffled["options"]] == ["A", "B", "C", "D"]

    def test_answer_position_is_spread(self):
        positions = {
            shuffle_choice_options(_mcq().normalized(), random.Random(seed))["correct_answer"]
            for seed in range(40)
        }
        assert positions == {"A", "B", "C", "D"}

    def test_other_types_unchanged(self):
        question = {"question_type": "true_false", "correct_answer": True}
        assert shuffle_choice_options(dict(question)) == question

    def test_question_set_usable_filters(self):
        questions = QuestionSet(questions=[_mcq(), _mcq(correct_answer="Z")]).usable()
        assert len(questions) == 1
