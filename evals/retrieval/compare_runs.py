"""Compare two result files from run_eval.py.

    python3 evals/retrieval/compare_runs.py evals/results/2026-10-20-baseline.json evals/results/<later>.json

Prints markdown: the overall metrics of every system in both runs with the change, the
same per document, and the topics whose recall@K or first-relevant rank moved the most for
the app's retrieval. Needs only the standard library. Both runs should use the same corpus,
topics and K; the script warns when they do not.
"""
import argparse
import json
import sys
from pathlib import Path

HYBRID = "hybrid_current"
COLUMNS = [("recall@k", "recall"), ("precision@k", "precision"), ("mrr", "MRR"), ("ndcg@k", "nDCG"), ("hit@5", "hit@5")]


def load(path: str) -> dict:
    return json.loads(Path(path).read_text())


def delta(before: float, after: float) -> str:
    change = after - before
    return f"{after:.3f} ({change:+.3f})"


def system_rows(old: dict, new: dict, scope) -> list:
    rows = []
    for name, system in new["systems"].items():
        if name not in old["systems"]:
            continue
        before, after = scope(old["systems"][name]), scope(new["systems"][name])
        cells = [delta(before[key], after[key]) for key, _ in COLUMNS]
        rows.append(f"| {system['description']} | " + " | ".join(cells) + " |")
    return rows


def table(title: str, old: dict, new: dict, scope) -> list:
    header = "| System | " + " | ".join(label for _, label in COLUMNS) + " |"
    return [title, "", header, "|---|" + "---|" * len(COLUMNS), *system_rows(old, new, scope), ""]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("before")
    parser.add_argument("after")
    parser.add_argument("--top", type=int, default=8, help="how many moved topics to list")
    args = parser.parse_args()
    old, new = load(args.before), load(args.after)

    out = [f"# {old['label']} ({old['date']}) -> {new['label']} ({new['date']})", ""]
    if old["config"]["top_k"] != new["config"]["top_k"]:
        out += [f"WARNING: K differs ({old['config']['top_k']} vs {new['config']['top_k']}).", ""]
    if old["corpus"]["topics"] != new["corpus"]["topics"] or old["corpus"]["chunks"] != new["corpus"]["chunks"]:
        out += ["WARNING: topics or chunk counts differ; the runs are not directly comparable.", ""]
    out += [
        f"Code: `{old['code']['commit'][:10]}` -> `{new['code']['commit'][:10]}`; "
        f"search.py `{old['code']['search_py_sha256'][:10]}` -> `{new['code']['search_py_sha256'][:10]}`",
        "",
    ]
    out += table("## Overall", old, new, lambda s: s["summary"]["overall"])
    for doc in new["corpus"]["documents"]:
        doc_id = doc["id"]
        out += table(f"## {doc_id}", old, new, lambda s, d=doc_id: s["summary"]["per_document"][d])

    before = {t["id"]: t for t in old["systems"][HYBRID]["per_topic"]}
    after = {t["id"]: t for t in new["systems"][HYBRID]["per_topic"]}
    moved = []
    for topic_id, a in after.items():
        b = before.get(topic_id)
        if b is None:
            continue
        recall_change = a["metrics"]["recall@k"] - b["metrics"]["recall@k"]
        ndcg_change = a["metrics"]["ndcg@k"] - b["metrics"]["ndcg@k"]
        moved.append((abs(recall_change) + abs(ndcg_change), topic_id, b, a, recall_change, ndcg_change))
    moved.sort(reverse=True)
    out += [
        f"## Topics that moved most (app retrieval)",
        "",
        "| Topic | recall before | recall after | nDCG before | nDCG after | first rank before | first rank after |",
        "|---|---|---|---|---|---|---|",
    ]
    for _, topic_id, b, a, _, _ in moved[: args.top]:
        out.append(
            f"| {topic_id} | {b['metrics']['recall@k']:.3f} | {a['metrics']['recall@k']:.3f} | "
            f"{b['metrics']['ndcg@k']:.3f} | {a['metrics']['ndcg@k']:.3f} | "
            f"{b['first_relevant_rank']} | {a['first_relevant_rank']} |"
        )
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
