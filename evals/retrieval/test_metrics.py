"""Fast tests for the metric functions and the ground-truth matcher. No database, no model."""
import math

import pytest

from ground_truth import path_matches, resolve_relevant
from retrieval_metrics import (
    first_relevant_rank,
    hit_at_k,
    mean_metrics,
    ndcg_at_k,
    precision_at_k,
    recall_at_k,
    reciprocal_rank,
    topic_metrics,
)

RELEVANT = {"a", "b", "c"}


def test_recall_counts_relevant_chunks_in_top_k():
    assert recall_at_k(["a", "x", "b", "y"], RELEVANT, 3) == pytest.approx(2 / 3)
    assert recall_at_k(["x", "y", "a"], RELEVANT, 2) == 0.0
    assert recall_at_k(["a"], set(), 5) == 0.0


def test_precision_divides_by_k_even_for_a_short_list():
    assert precision_at_k(["a", "x", "b", "y"], RELEVANT, 4) == 0.5
    assert precision_at_k(["a"], RELEVANT, 4) == 0.25


def test_duplicate_ids_are_counted_once():
    assert recall_at_k(["a", "a", "a"], RELEVANT, 3) == pytest.approx(1 / 3)
    assert precision_at_k(["a", "a", "a"], RELEVANT, 3) == pytest.approx(1 / 3)


def test_reciprocal_rank():
    assert reciprocal_rank(["x", "y", "b"], RELEVANT) == pytest.approx(1 / 3)
    assert reciprocal_rank(["a"], RELEVANT) == 1.0
    assert reciprocal_rank(["x", "y"], RELEVANT) == 0.0
    assert first_relevant_rank(["x", "y", "b"], RELEVANT) == 3
    assert first_relevant_rank(["x"], RELEVANT) == 0


def test_hit_at_k_is_a_cutoff():
    ranked = ["x", "x2", "x3", "x4", "x5", "a"]
    assert hit_at_k(ranked, RELEVANT, 5) == 0.0
    assert hit_at_k(ranked, RELEVANT, 6) == 1.0


def test_ndcg_perfect_and_imperfect_orderings():
    assert ndcg_at_k(["a", "b", "c", "x"], RELEVANT, 4) == pytest.approx(1.0)
    # One relevant chunk of one, found at rank 2: DCG = 1/log2(3), ideal = 1.
    assert ndcg_at_k(["x", "a"], {"a"}, 5) == pytest.approx(1 / math.log2(3))
    assert ndcg_at_k(["x", "y"], RELEVANT, 5) == 0.0


def test_ndcg_ideal_is_capped_at_k():
    # 10 relevant chunks and k = 2: two relevant results at the top is already perfect.
    relevant = {str(i) for i in range(10)}
    assert ndcg_at_k(["0", "1", "x"], relevant, 2) == pytest.approx(1.0)


def test_topic_metrics_and_mean():
    one = topic_metrics(["a", "x", "b"], {"a", "b"}, 3)
    assert one["recall@k"] == 1.0
    assert one["hit@5"] == 1.0
    two = topic_metrics(["x", "y", "z"], {"a"}, 3)
    assert two["mrr"] == 0.0
    averaged = mean_metrics([one, two])
    assert averaged["recall@k"] == pytest.approx(0.5)
    assert averaged["hit@5"] == pytest.approx(0.5)
    assert mean_metrics([])["mrr"] == 0.0


CHUNKS = [
    {"id": "c0", "chunk_index": 0, "section_hierarchy": "Chapter 7"},
    {"id": "c1", "chunk_index": 1, "section_hierarchy": "Chapter 7 > 7.4 Oxidative Phosphorylation"},
    {"id": "c2", "chunk_index": 2, "section_hierarchy": "Chapter 7 > 7.4 Oxidative Phosphorylation > Chemiosmosis"},
    {"id": "c3", "chunk_index": 3, "section_hierarchy": "Chapter 7 > 7.5 Metabolism without Oxygen"},
    {"id": "c4", "chunk_index": 4, "section_hierarchy": None},
]


def test_section_spec_matches_subtree_by_number_or_name():
    assert resolve_relevant([{"section": "7.4"}], CHUNKS) == {"c1", "c2"}
    assert resolve_relevant([{"section": "7.4 > chemiosmosis"}], CHUNKS) == {"c2"}
    assert resolve_relevant([{"section": "Chemiosmosis"}], CHUNKS) == {"c2"}


def test_self_only_excludes_sub_headings():
    assert resolve_relevant([{"section": "7.4", "self_only": True}], CHUNKS) == {"c1"}


def test_path_must_be_consecutive_headings():
    assert path_matches(["7.4", "Chemiosmosis"], CHUNKS[2]["section_hierarchy"])
    assert not path_matches(["Chapter 7", "Chemiosmosis"], CHUNKS[2]["section_hierarchy"])
    assert not path_matches(["7.4"], None)


def test_chunk_range_is_inclusive_and_specs_are_unioned():
    ids = resolve_relevant([{"chunk_range": [1, 2]}, {"section": "7.5"}], CHUNKS)
    assert ids == {"c1", "c2", "c3"}


def test_spec_without_a_kind_is_rejected():
    with pytest.raises(ValueError):
        resolve_relevant([{"nothing": 1}], CHUNKS)
