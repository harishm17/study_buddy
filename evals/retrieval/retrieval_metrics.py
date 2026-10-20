"""Ranking metrics for the retrieval eval. Pure functions, no I/O.

Every metric takes `ranked`, the chunk ids a retriever returned best first, and `relevant`,
the set of chunk ids that count as correct. Relevance is binary. Only the first `k` entries
of `ranked` are looked at, except in `reciprocal_rank`, which looks at the whole list.
"""
import math
from typing import Dict, Iterable, List, Sequence, Set


def _hits_in_top_k(ranked: Sequence[str], relevant: Set[str], k: int) -> int:
    seen: Set[str] = set()
    hits = 0
    for chunk_id in ranked[:k]:
        if chunk_id in relevant and chunk_id not in seen:
            seen.add(chunk_id)
            hits += 1
    return hits


def recall_at_k(ranked: Sequence[str], relevant: Set[str], k: int) -> float:
    """Share of the relevant chunks that appear in the top k."""
    if not relevant:
        return 0.0
    return _hits_in_top_k(ranked, relevant, k) / len(relevant)


def precision_at_k(ranked: Sequence[str], relevant: Set[str], k: int) -> float:
    """Share of the k slots filled by a relevant chunk.

    The divisor is always k, so a short result list is penalised. With few relevant chunks
    the value is capped at len(relevant) / k, whatever the retriever does.
    """
    if k <= 0:
        return 0.0
    return _hits_in_top_k(ranked, relevant, k) / k


def reciprocal_rank(ranked: Sequence[str], relevant: Set[str]) -> float:
    """1 / rank of the first relevant chunk, or 0 when none was returned."""
    for position, chunk_id in enumerate(ranked, start=1):
        if chunk_id in relevant:
            return 1.0 / position
    return 0.0


def ndcg_at_k(ranked: Sequence[str], relevant: Set[str], k: int) -> float:
    """Normalised discounted cumulative gain with binary gains.

    The ideal list puts min(len(relevant), k) relevant chunks first, so a topic with more
    relevant chunks than k can still score 1.0.
    """
    if not relevant or k <= 0:
        return 0.0
    seen: Set[str] = set()
    dcg = 0.0
    for position, chunk_id in enumerate(ranked[:k], start=1):
        if chunk_id in relevant and chunk_id not in seen:
            seen.add(chunk_id)
            dcg += 1.0 / math.log2(position + 1)
    ideal_hits = min(len(relevant), k)
    idcg = sum(1.0 / math.log2(position + 1) for position in range(1, ideal_hits + 1))
    return dcg / idcg


def hit_at_k(ranked: Sequence[str], relevant: Set[str], k: int) -> float:
    """1.0 when any relevant chunk is in the top k, else 0.0."""
    return 1.0 if _hits_in_top_k(ranked, relevant, k) > 0 else 0.0


def topic_metrics(ranked: Sequence[str], relevant: Set[str], k: int) -> Dict[str, float]:
    """All per-topic metrics, keyed the way they appear in the result files."""
    return {
        "recall@k": recall_at_k(ranked, relevant, k),
        "precision@k": precision_at_k(ranked, relevant, k),
        "mrr": reciprocal_rank(ranked, relevant),
        "ndcg@k": ndcg_at_k(ranked, relevant, k),
        "hit@5": hit_at_k(ranked, relevant, 5),
    }


METRIC_NAMES = ["recall@k", "precision@k", "mrr", "ndcg@k", "hit@5"]
CUTOFF_METRIC_NAMES = ["recall", "ndcg"]


def cutoff_metrics(ranked: Sequence[str], relevant: Set[str], k: int) -> Dict[str, float]:
    """Recall and nDCG at a cutoff other than the app's K."""
    return {"recall": recall_at_k(ranked, relevant, k), "ndcg": ndcg_at_k(ranked, relevant, k)}


def mean_metrics(rows: Iterable[Dict[str, float]]) -> Dict[str, float]:
    """Macro average: every topic counts the same, however many chunks it has."""
    rows = list(rows)
    if not rows:
        return {name: 0.0 for name in METRIC_NAMES}
    return {name: sum(row[name] for row in rows) / len(rows) for name in METRIC_NAMES}


def first_relevant_rank(ranked: Sequence[str], relevant: Set[str]) -> int:
    """1-based rank of the first relevant chunk, 0 when there is none."""
    for position, chunk_id in enumerate(ranked, start=1):
        if chunk_id in relevant:
            return position
    return 0


def relevant_ranks(ranked: Sequence[str], relevant: Set[str]) -> List[int]:
    """1-based ranks of every relevant chunk in the list."""
    return [position for position, chunk_id in enumerate(ranked, start=1) if chunk_id in relevant]
