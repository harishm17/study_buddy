"""Fast tests for checks.py, spend.py and report helpers. No database, no model, no network."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import checks  # noqa: E402
from checks import (  # noqa: E402
    bare_currency_count,
    check_topic,
    excerpt_terms,
    grounding_share,
    has_latex,
    interactive_structure,
    latex_hygiene,
    letter_references,
    mc_letter_reference_check,
    near_duplicate_statements,
    notes_structure,
    quiz_structure,
    recall_copy_check,
    significant_numbers,
    solved_structure,
    summarize_model,
    token_jaccard,
    unbalanced_dollar,
)


# ---------------------------------------------------------------- LaTeX hygiene


@pytest.mark.parametrize(
    "text",
    ["The cost is $x = 5$ here.", "Use $10^6$ samples", "$P(A)=0.4$ and $P(B)=0.5$", "Display $$\\int_0^1 f$$ ok", "Money: \\$100 and \\$5"],
)
def test_normal_math_and_escaped_currency_are_clean(text):
    assert not unbalanced_dollar(text)
    assert bare_currency_count(text) == 0


def test_unbalanced_dollar():
    assert unbalanced_dollar("Costs $5 today")
    assert unbalanced_dollar("The value $x = 5 is wrong")
    assert unbalanced_dollar("Display $$x = 5 is open")
    assert not unbalanced_dollar("Inline `a $ b` and\n```\n$ ls\n```\nstay plain")


def test_bare_currency_from_the_audit():
    assert bare_currency_count("You win $500 if i + j = 7 and lose $100 otherwise") == 2
    assert bare_currency_count("The payoff is $500 and the stake $100.") == 2
    assert bare_currency_count("A single $5 bill") == 1
    assert bare_currency_count("It costs $100 per year, then $x = 3$ more") == 1


def test_currency_that_looks_like_a_math_span_is_not_flagged():
    assert bare_currency_count("Expected value $5 \\cdot 0.2 + 3$") == 0
    assert bare_currency_count("$2x + 1 = 7$") == 0


def test_plain_text_latex():
    assert has_latex("Bayes' $P(A|B)$")
    assert has_latex("the \\alpha level")
    assert not has_latex("Conditional probability")
    assert not has_latex("Use `$HOME` in the shell")


def test_latex_hygiene_by_field():
    examples = [
        {
            "title": "Coin $P(H)$",
            "problem_statement": "Pay $5 to play.",
            "solution_steps": [{"step_number": 1, "description": "Set up", "work": "$x=1$", "explanation": "ok"}],
            "final_answer": "- done",
            "key_concepts": ["Bayes", "\\frac{a}{b}"],
        }
    ]
    found = latex_hygiene(checks.SOLVED, examples)
    assert found["plain_text_latex"] == ["[0].title", "[0].key_concepts[1]"]
    assert found["bare_currency"] == ["[0].problem_statement"]
    assert found["unbalanced_dollar"] == ["[0].problem_statement"]


# ---------------------------------------------------------------- option letters


def test_letter_references_strict_and_loose():
    refs = letter_references("Option C is wrong, D is the addition rule. See (B).")
    assert "Option C" in refs["strict"] and "(B)" in refs["strict"]
    assert refs["loose"] == ["C is", "D is"]


def test_letter_references_ignore_math_and_code():
    refs = letter_references("If $A$ is independent of $B$ then `C is` fine and $P(B)$ is small.")
    assert refs == {"strict": [], "loose": []}


def test_letter_references_ignore_content_descriptions():
    refs = letter_references("The addition rule applies because the events are disjoint.")
    assert refs == {"strict": [], "loose": []}


def test_mc_check_counts_only_multiple_choice():
    questions = [
        {"question_type": "multiple_choice", "explanation": "Option C is wrong; the rule is additive."},
        {"question_type": "multiple_choice", "explanation": "The sum rule applies."},
        {"question_type": "true_false", "explanation": "Option B is irrelevant here."},
    ]
    result = mc_letter_reference_check(questions)
    assert result["multiple_choice"] == 2
    assert result["flagged"] == 1 and result["flagged_strict"] == 1
    assert result["details"][0]["index"] == 0


# ---------------------------------------------------------------- recall copy


def test_significant_numbers_ignore_0_1_2_and_normalise():
    assert significant_numbers("Take 1 of 2 coins, 0 heads, 3 flips, 10 draws, 0.50 chance, 1,000 trials") == {
        "3", "10", "0.5", "1000"
    }
    assert significant_numbers("a probability of .25 and 25%") == {"0.25", "25"}


def test_recall_copy_flags_questions_that_reuse_the_example_numbers():
    reference = "A bag has 5 red and 7 blue marbles. Draw 3 without replacement."
    questions = [
        {"question_text": "A bag has 5 red and 7 blue marbles. What is P(red)?"},  # copied
        {"question_text": "A bag has 5 red and 9 blue marbles. What is P(red)?"},  # new number
        {"question_text": "Flip a coin 2 times. What is the chance of heads?"},  # < 2 significant numbers
        {"question_text": "Draw 3 marbles from 5 red and 7 blue."},  # copied
    ]
    result = recall_copy_check(questions, reference)
    assert result["with_numbers"] == 3
    assert result["copied"] == 2
    assert result["rate"] == pytest.approx(2 / 3)
    assert [d["index"] for d in result["details"]] == [0, 3]


def test_recall_copy_ignores_new_scenarios_that_share_small_numbers():
    notes = (
        "A die has 6 faces. " + "Sets and Venn diagrams are a way to picture events. " * 20
        + "There are 12 months, 4 seasons and 3 meals in this unrelated paragraph."
    )
    questions = [
        # New scenario: its numbers occur in the notes, but nowhere together with its words.
        {"question_text": "A restaurant offers 4 starters, 6 mains and 3 desserts. How many meals?"},
    ]
    assert recall_copy_check(questions, notes)["copied"] == 0


def test_recall_copy_rate_is_none_without_numeric_questions():
    assert recall_copy_check([{"question_text": "Define independence."}], "5 and 7")["rate"] is None


# ---------------------------------------------------------------- structure


NOTES = """# Hashing

## Overview
Hashing maps keys to slots.

## Key Concepts
- a
## How It Works
text
## Common Pitfalls
text
## Exam-Ready Recap
- one
- two
- three
- four
- five
- six
"""


def test_notes_structure_finds_sections_and_bullets():
    result = notes_structure(NOTES, word_band=(10, 50))
    assert result["sections_ok"] and result["has_title"]
    assert result["recap_bullets"] == 6 and result["recap_bullets_ok"]
    assert result["in_word_band"]


def test_notes_structure_reports_missing_sections_and_band():
    result = notes_structure("# T\n\n## Overview\nshort", word_band=(900, 1400))
    assert "Key Concepts" in result["sections_missing"]
    assert not result["in_word_band"] and not result["recap_bullets_ok"]


def test_notes_headings_inside_code_blocks_do_not_count():
    text = "# T\n\n```md\n## Overview\n```\n"
    assert "Overview" in notes_structure(text)["sections_missing"]


def test_example_and_quiz_structure():
    solved = [{"solution_steps": [1, 2, 3], "final_answer": "x"}, {"solution_steps": [1], "final_answer": " "}]
    result = solved_structure(solved, 3)
    assert not result["count_ok"] and result["steps"] == [3, 1] and result["missing_final_answer"] == 1

    interactive = [{"steps": [1, 2, 3]}, {"steps": [1] * 9}]
    result = interactive_structure(interactive, 2, "medium")
    assert result["count_ok"] and result["problems_in_step_band"] == 1

    quiz = [
        {"question_type": "multiple_choice", "options": [1, 2, 3]},
        {"question_type": "numerical"},
    ]
    result = quiz_structure(quiz, 10, ["multiple_choice", "numerical", "true_false"])
    assert result["types"] == {"multiple_choice": 1, "numerical": 1}
    assert result["types_missing"] == ["true_false"]
    assert result["mc_not_four_options"] == 1 and not result["count_ok"]


# ---------------------------------------------------------------- grounding


def test_excerpt_terms_drop_stopwords_and_short_words():
    terms = excerpt_terms(["The hash function distributes keys; however, collisions happen."])
    assert {"hash", "function", "distributes", "collisions", "happen"} <= terms or "hash" not in terms
    assert "however" not in terms and "keys" not in terms  # stopword, under five letters


def test_grounding_share():
    excerpts = ["A hash function distributes keys across slots. Collisions are resolved by chaining."]
    notes = (
        "# Hashing\n\n"
        "A hash function distributes keys across the table slots evenly.\n"
        "Collisions are resolved by chaining in this design.\n"
        "Bananas ripen faster near apples in warm kitchens.\n"
        "Short one.\n"
    )
    result = grounding_share(notes, excerpts)
    assert result["sentences"] == 3
    assert result["grounded"] == 2
    assert result["share"] == pytest.approx(2 / 3)


def test_grounding_counts_math_that_shares_a_symbol_with_the_excerpts():
    result = grounding_share("The variance equals $Var(X) = 4$ for this case.", ["Define Var(X) as the spread."])
    assert result["grounded"] == 1


# ---------------------------------------------------------------- overlap


def test_token_jaccard():
    assert token_jaccard("a b c", "a b c") == 1.0
    assert token_jaccard("a b c d", "a b x y") == pytest.approx(2 / 6)
    assert token_jaccard("", "a") == 0.0


def test_near_duplicates_only_across_topics():
    statements = {
        "t1": ["A fair coin is flipped three times. What is the probability of two heads?", "Unique first problem about urns."],
        "t2": ["A fair coin is flipped three times. What is the probability of exactly two heads?"],
        "t3": ["Compute the mean of a Poisson variable."],
    }
    pairs = near_duplicate_statements(statements, threshold=0.6)
    assert len(pairs) == 1
    assert (pairs[0]["topic_a"], pairs[0]["topic_b"]) == ("t1", "t2")
    # Two similar statements inside one topic are not reported.
    assert near_duplicate_statements({"t1": ["same words here", "same words here"]}) == []


# ---------------------------------------------------------------- one topic, one model


def _quiz_questions():
    return [
        {
            "question_type": "multiple_choice",
            "question_text": "A bag has 5 red and 7 blue marbles. P(red)?",
            "options": [{"id": x, "text": x} for x in "ABCD"],
            "correct_answer": "A",
            "explanation": "Option B is wrong.",
            "concepts_tested": ["probability"],
        },
        {
            "question_type": "true_false",
            "question_text": "Independence means P(A and B) = P(A)P(B).",
            "correct_answer": True,
            "explanation": "Yes.",
            "concepts_tested": ["independence"],
        },
    ]


def test_check_topic_and_summary():
    solved = [
        {
            "title": "Marbles",
            "problem_statement": "A bag has 5 red and 7 blue marbles. Find P(red).",
            "solution_steps": [{"step_number": 1, "description": "Count", "work": "5+7=12", "explanation": "total"}],
            "final_answer": "- 5/12",
            "key_concepts": ["probability"],
        }
    ]
    outputs = {checks.NOTES: NOTES, checks.SOLVED: solved, checks.QUIZ: _quiz_questions()}
    result = check_topic(outputs, ["hash function distributes keys"], requested={"examples": 1, "questions": 2})
    assert result["solved"]["count_ok"] and result["quiz"]["count_ok"]
    assert result["mc_letter_refs"]["flagged"] == 1
    assert result["recall_copy"]["copied"] == 1
    assert result["latex"] == {"plain_text_latex": 0, "unbalanced_dollar": 0, "bare_currency": 0}

    summary = summarize_model({"t1": result}, {"t1": checks.problem_statements(solved, None)})
    assert summary["mc_letter_refs"] == 1 and summary["mc_letter_refs_strict"] == 1
    assert summary["quiz_recall_copy_rate"] == 1.0
    assert summary["notes_count"] == 1 and summary["duplicate_example_pairs"] == 0


def test_check_topic_without_notes_skips_recall_copy():
    result = check_topic({checks.QUIZ: _quiz_questions()}, [])
    assert "skipped" in result["recall_copy"]
