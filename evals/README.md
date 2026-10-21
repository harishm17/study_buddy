# Evals

This folder holds the evaluations for Margins. Right now there is one: a **retrieval eval** that measures how well the app maps a topic to the chunks of the course material that explain it. It is free to run (no paid API calls) and takes under a minute.

There is no generation-quality eval yet. See [Generation quality](#generation-quality-not-built-yet).

## What the retrieval eval measures

When the extract-topics job finds a topic, it looks up that topic's source chunks with `hybrid_search_chunks` (`ai-service/app/services/embeddings/search.py`), keeps the top `TOPIC_CHUNK_LIMIT` (24, from `app/services/content_generator/context.py`) and stores them. Every notes, quiz and exam generator later reads only those chunks. (A topic with no stored chunks, or with chunks older than the newest chunk of its project, is looked up again with the same function just before generation: `ensure_topic_mappings`.) If the right chunks are not in the stored 24, the generated material cannot be grounded in them.

The harness answers: for a topic whose answer we know the location of, how many of the right chunks are in that top 24, and how high are they ranked?

Setup, in order:

1. **Corpus.** Chapters from three OpenStax textbooks (CS, science, social science), about 300 chunks, ingested through the app's real chunker (`chunk_document`) and real embedder (local `BAAI/bge-small-en-v1.5`). One synthetic user and project, one material per document.
2. **Topics.** 38 topics in `retrieval/topics.jsonl`, each with a name, a 1-2 sentence description and keywords, shaped like what the topic extractor produces.
3. **Ground truth.** Each topic lists the section (or chunk range) whose chunks count as relevant.
4. **Retrieval.** For every topic the harness calls the app's retrieval the way `jobs.py` does, with the same arguments and the same K.
5. **Scoring.** Binary relevance, macro-averaged over topics, overall and per document.

Metrics (all in `retrieval/retrieval_metrics.py`):

| Metric | Meaning |
|---|---|
| recall@K | share of the topic's relevant chunks that are in the top K (K = 24 by default) |
| precision@K | share of the K slots that hold a relevant chunk. The divisor is always K, so a topic with 6 relevant chunks cannot score above 0.25. Compare runs, not the absolute value. |
| MRR | 1 / rank of the first relevant chunk (0 if none) |
| nDCG@K | rewards relevant chunks that rank higher; 1.0 means all relevant chunks come first |
| hit@5 | 1 if any relevant chunk is in the first 5 |

The report also gives recall and nDCG at cutoffs 5 and 10 from the same lists, the share of results that come from the topic's own document, and (for the app's retrieval) how each chunk was found: keyword match only, semantic only, or both.

### Reference baselines

Every run also scores two plain vector searches over the same stored chunk embeddings. They are computed inside `run_eval.py`, not by app code, and are labelled "reference" in the results:

- query = `name: description` (the same text the app's semantic leg embeds)
- query = `name: description Keywords: ...`

They show how much the app's hybrid helps or hurts compared with the simplest possible retrieval. They are not proposals. They search the stored vectors, so they move when what is embedded changes: the baseline file's reference rows were computed on vectors of the chunk text alone, the later files' rows on heading-prefixed vectors.

## Layout

```
evals/
  README.md
  retrieval/
    corpus.json          sources, licences, checksums, page ranges, expected chunk structure
    fetch_corpus.py      downloads the books and cuts out the chapters (into evals/.cache/)
    topics.jsonl         the topics and their relevance specs
    run_eval.py          ingest + retrieve + score + write results
    compare_runs.py      diff two result files
    retrieval_metrics.py metric functions
    ground_truth.py      turns relevance specs into chunk ids
    test_metrics.py      fast tests for the two modules above
  results/               <date>-<label>.json and .md from each run (committed)
  .cache/                downloaded PDFs (gitignored, never committed)
```

## How to run

You need Python 3.13+ with `uv`, Node (for Prisma), and a Postgres 16 with the `vector` extension. The commands below use the eval database `postgresql://postgres@127.0.0.1:5544/sb_evals`; substitute your own. The database name must contain `eval` (the harness refuses otherwise, because it inserts a synthetic user, project and materials; pass `--allow-any-db` to override).

One-time setup:

```bash
# 1. Create the schema in the eval database (the app's own migrations)
cd frontend && npm ci
DATABASE_URL=postgresql://postgres@127.0.0.1:5544/sb_evals npx prisma migrate deploy

# 2. Download the books and cut the chapters (about 460 MB, mostly Biology 2e)
cd ../ai-service
uv sync
uv run python -I ../evals/retrieval/fetch_corpus.py
```

Run the eval:

```bash
cd ai-service
uv run python -I ../evals/retrieval/run_eval.py \
  --db postgresql://postgres@127.0.0.1:5544/sb_evals \
  --label baseline
```

This writes `evals/results/<today>-<label>.json` and `.md` and prints the overall table. `--label` names the files. Running with an existing label on the same day overwrites it.

Options:

- `--rebuild` re-chunks and re-embeds every document. Without it, stored chunks are reused as long as the corpus, the model and the chunker code (`chunker.py`, `extractors.py`) are unchanged. If any of them changed, the affected documents are re-ingested on their own.
- `--top-k N` overrides K. By default K is the app's `TOPIC_CHUNK_LIMIT`.
- `--out-dir DIR` writes results somewhere else (use this for scratch runs you do not want to commit).
- `EVAL_DATABASE_URL` can replace `--db`.

Timing on the box (CPU embeddings): about 35 s for a cold run with `--rebuild` (about 32 s is chunking and embedding the 306 chunks), about 5 s when the chunks are already stored. The eval database needs all of the app's migrations, including the HNSW and full-text indexes.

Run the unit tests:

```bash
cd ai-service && uv run pytest ../evals/retrieval -q
```

The PDFs are data. `fetch_corpus.py` opens them with PyMuPDF only to copy page ranges, and the harness only feeds them to the app's document extractor. Run the scripts with `python -I`, as above, and do not run anything from inside `evals/.cache/`.

## Baseline (2026-10-20, the old `search.py`)

`results/2026-10-20-baseline.md` has the full tables. In short, on this corpus the current hybrid finds nearly all the relevant chunks within 24 but ranks them badly:

- recall@24 is about the same as plain vector search (0.935 vs 0.905), but MRR (0.830 vs 0.928), nDCG@24 (0.777 vs 0.833) and hit@5 (0.895 vs 1.000) are worse, and recall@5 is much lower (0.437 vs 0.583).
- The cause is visible in the per-topic `top_scores`: the keyword score is a flat 0.8, a chunk found by both legs gets `max(0.8, similarity) * 1.1`, and most similarities are below 0.8, so about half of all returned chunks tie at exactly 0.88. The ties keep the keyword leg's order, which is `chunk_index`, so those results are in document order, not relevance order.
- Keywords are matched with `ILIKE` against every chunk. Generic keywords (`break`, `search`, `return`, `None`, `ATP`) match chunks all over the corpus, including other documents (6% of results come from the wrong document on average, up to 54% for one Python topic).

## Results with Reciprocal Rank Fusion (2026-10-20, `-rrf` files)

`results/2026-10-20-rrf.md` has the full tables, and `results/2026-10-20-baseline-vs-rrf.md` is the comparison with the baseline (per document, and the topics that moved most):

```bash
python3 evals/retrieval/compare_runs.py evals/results/2026-10-20-baseline.json evals/results/2026-10-20-rrf.json
```

Macro averages over 38 topics, K = 24:

| System | recall@24 | MRR | nDCG@24 | hit@5 | recall@5 |
|---|---|---|---|---|---|
| Baseline: old `hybrid_search_chunks` (`ILIKE` leg + vector leg, flat keyword score) | 0.935 | 0.830 | 0.777 | 0.895 | 0.437 |
| Old `hybrid_search_chunks` re-run on the new heading-prefixed vectors (scratch run, not committed) | 0.965 | 0.831 | 0.800 | 0.921 | |
| New: vector leg + full-text leg, RRF (the `-rrf` run) | 0.989 | 0.961 | 0.932 | 1.000 | 0.684 |
| New search on vectors of the chunk text alone (scratch run, not committed) | 0.977 | 0.956 | 0.912 | 1.000 | |
| Reference: pure vector, name + description + keywords (old vectors, then new vectors) | 0.927, 0.984 | 0.947, 0.934 | 0.870, 0.917 | 1.000, 1.000 | |

- Fusion is the large change. The old search on the new vectors barely moves in ranking (MRR 0.831, hit@5 0.921), while the new search on the old vectors already has MRR 0.956 and hit@5 1.000.
- Heading-prefixed vectors add a smaller, consistent gain on top: nDCG 0.912 to 0.932, recall 0.977 to 0.989. The pure-vector reference gains too (nDCG 0.870 to 0.917).
- The new search is ahead of the pure-vector reference on the new vectors (MRR 0.961 vs 0.934, nDCG 0.932 vs 0.917, recall 0.989 vs 0.984) and stays in the right document (same-document share 0.990, was 0.938).

### Variants tried

Scratch runs on the same stored chunks, changing one setting at a time from the final configuration: RRF k = 60, pool of 50 per leg, similarity floor 0.55, full-text query = topic name and keywords, `ts_rank_cd` with its defaults, heading weight A over body weight B. A difference under about 0.015 MRR is one topic moving one rank; those were not used to choose.

| Variant | recall@24 | MRR | nDCG@24 | hit@5 |
|---|---|---|---|---|
| Final | 0.989 | 0.961 | 0.932 | 1.000 |
| RRF k = 10 / 30 / 100 | 0.989 | 0.961 | 0.931 to 0.932 | 1.000 |
| Pool 24 / 100 per leg | 0.989 | 0.961 | 0.932 | 1.000 |
| Floor 0 / 0.4 / 0.5 / 0.6 / 0.65 | 0.989 | 0.961 | 0.932 | 1.000 |
| Vector leg only | 0.984 | 0.934 | 0.917 | 1.000 |
| Full-text leg only | 0.959 | 0.912 | 0.889 | 0.974 |
| Full-text query = name only | 0.995 | 0.928 | 0.901 | 1.000 |
| Full-text query also ORs the description's words | 0.954 | 0.961 | 0.880 | 1.000 |
| Embedded query without keywords | 0.989 | 0.974 | 0.935 | 1.000 |
| `ts_rank_cd` length normalisation 1 / 4 | 0.989 | 0.974 / 0.987 | 0.937 / 0.931 | 1.000 |
| `ts_rank` instead of `ts_rank_cd` | 0.989 | 0.974 | 0.939 | 1.000 |
| Heading weight = body weight | 0.989 | 0.947 | 0.923 | 1.000 |
| Heading 1.0, body 0.1 | 0.989 | 0.966 | 0.934 | 1.000 |

Ranking is insensitive to k, pool size and floor on this corpus, so those use the textbook k (60), a pool about twice K, and a floor read off the similarity distributions. Adding the description's words to the full-text query is the one change that clearly hurts. The ranking-function and weight variants are within noise, so the defaults stay.

The floor does not change these metrics because chunks under it seldom reach the top 24 here. It matters for topics the materials do not cover. To see its cost for a topic a student adds by hand, every topic was re-run as a bare name (no description, no keywords):

| Name-only queries, floor | recall@24 | MRR | nDCG@24 |
|---|---|---|---|
| 0 or 0.5 | 0.961 | 0.954 | 0.883 |
| 0.55 or 0.6 | 0.955 | 0.954 | 0.880 |
| 0.65 | 0.905 | 0.956 | 0.858 |

Chunks that explain a topic score 0.67 and up against a full query and 0.54 and up against a bare name. Half of the other chunks score under 0.55, but made-up topics ("Medieval French cuisine", "Quantum chromodynamics") still reach 0.6 to 0.7 against this corpus. bge-small compresses its scores, so a floor drops clearly unrelated chunks; it cannot reject an off-topic name outright. 0.55 is the highest value that costs almost nothing on bare names.

## Comparing runs

Result files are plain JSON, so the workflow for a retrieval change is:

1. On the base commit, run with `--label baseline` (the committed `2026-10-20-baseline.*` is that run for the old `search.py`).
2. On the branch with the change, run with a new label, for example `--label hybrid-rrf`.
3. Diff them:

```bash
python3 evals/retrieval/compare_runs.py \
  evals/results/2026-10-20-baseline.json evals/results/<date>-hybrid-rrf.json
```

The output has overall and per-document metrics for each system, with the change, and the topics whose results moved most. Each result file records the commit, whether `ai-service/app` had uncommitted changes, and a hash of `search.py`, so you can tell which code produced it. The reference rows should not move between runs; if they do, the corpus, the chunker or the embedder changed and the comparison is not clean.

The per-topic entries in the JSON list the chunks returned for each topic as `doc#chunk_index`, with `*` on relevant ones, plus how and with what score each was found. That is enough to see why a topic failed without rerunning.

### If retrieval changes shape

Everything that touches app retrieval is in one function, `app_retrieval` in `retrieval/run_eval.py`, with `app_top_k` next to it. It calls `hybrid_search_chunks` with the same arguments as `jobs.py` and as `ensure_topic_mappings` (generation-time mapping). The RRF change kept that function's signature, so the adapter did not change. Ingestion in the harness does follow the app: it embeds `embedding_text(section_hierarchy, chunk_text)`, the same text the chunk job embeds. If a later change renames the function, changes its arguments, moves topic mapping to generation time or stores mappings differently, edit those two functions to match what the app does, and keep the return value: a list of `{"chunk_id", "score", "source"}`, best first (`score` and `source` may be `None`). Nothing else in the harness imports retrieval code. Chunking and embedding are also taken from the app, so a change there is picked up automatically (and triggers re-ingestion).

## Corpus and licensing

`retrieval/corpus.json` has the source URLs, licences, authors and SHA-256 checksums. The chapters used:

| Document id | Book | Chapters (PDF pages of the source) | Chunks |
|---|---|---|---|
| `python-loops-functions` | Introduction to Python Programming (OpenStax) | Ch. 5 Loops, Ch. 6 Functions (125-142, 147-171) | 74 |
| `biology-cellular-respiration` | Biology 2e (OpenStax) | Ch. 7 Cellular Respiration (207-230) | 70 |
| `psychology-learning-memory` | Psychology 2e (OpenStax) | Ch. 6 Learning, Ch. 8 Memory (193-218, 259-284) | 162 |

Each chapter is cut off before its Key Terms or chapter summary, so end-of-chapter review material is not part of the corpus.

**Licence: CC BY-NC-SA 4.0** (Attribution-NonCommercial-ShareAlike), as stated on each book's copyright page and in the OpenStax catalogue. Authors: Das, Lawson, Mayfield and Norouzi (Python); Clark, Douglas and Choi (Biology 2e); Spielman, Jenkins and Lovett (Psychology 2e). Publisher: OpenStax, Rice University. Attribution line the licence asks for: "Access for free at openstax.org."

This is a non-commercial licence, which is fine for an internal evaluation but does not allow commercial redistribution. For that reason:

- The PDFs and any chunk text are not committed. `fetch_corpus.py` downloads them from OpenStax.
- Result files contain only chunk indices and section paths, never book text.
- `topics.jsonl` is original text written for this eval (descriptions and keywords are paraphrases, not quotes).

OpenStax republishes its PDFs from time to time. If a checksum no longer matches, `fetch_corpus.py` stops and prints the new hash. Check that the page ranges in `corpus.json` still cover the same chapters before updating it.

## Limitations

- **Relevance by section is an approximation.** A chunk counts as relevant when it sits in the topic's section. A chunk in another section that also explains the topic is counted as wrong. Examples: ATP appears in several sections of the respiration chapter, and the learning chapter introduces classical and operant conditioning in 6.1 before the sections that cover them. Real recall is somewhat higher than measured, and precision somewhat higher too.
- **Section boundaries come from the app's chunker.** Headings are detected from font sizes in the PDF. In the Psychology chapters text after a "LINK TO LEARNING" box stays under that box's heading, so section paths mislabel some chunks. For those topics the relevance spec is a chunk range (`chunk_range` in `topics.jsonl`) chosen by reading the chunks. Ranges depend on the chunker: `corpus.json` stores a hash of each document's chunk structure, and `run_eval.py` warns when it changes. A chunker change means the ranges need a re-check.
- **Small corpus.** About 300 chunks across three documents, and K = 24 is 8% of it. Recall@24 is high for almost any method, and the useful signal is in ordering (MRR, nDCG, hit@5, and the smaller cutoffs). Real projects hold more chunks, which makes weaknesses such as the keyword cap more visible than here. The corpus is also tidy: well-structured textbook prose, not scanned slides or lecture notes.
- **38 topics, one writer.** The topics were written by one person (not generated by the topic extractor), so they are cleaner than real extractor output: well scoped, with sensible keywords. Per-topic numbers are noisy; look at averages and at the pattern in the failures.
- **Sections are small.** Most topics have 2-12 relevant chunks, so precision@24 is capped well below 1 (see the metric table).
- **Ties.** The result order is what `hybrid_search_chunks` returns (RRF score, then vector similarity, then chunk id). Two chunks can still share an RRF score exactly, for example rank 1 in one leg and rank 2 in the other against the reverse; the app later reads stored mappings ordered by score and then chunk id. Chunk ids here are fixed (`eval-material-<doc>-<index>`), so runs are reproducible.
- **One embedder.** Results are for the default local model. The database column is `vector(384)`, so `EMBEDDING_PROVIDER=openai` (1536 numbers) does not fit without a new migration (see the root README). The similarity floor is also calibrated on this model's score range.
- **Tuned on this corpus.** The floor and the full-text query shape were chosen by looking at these 38 topics. The sweep below is flat across most settings, but a different corpus (lecture slides, scanned notes) may want a different floor.
- **The full-text leg is English only** (`to_tsvector('english', ...)`).

## Generation quality (not built yet)

The old version of this file described faithfulness, context precision and quiz-correctness checks with Ragas or DeepEval, and shipped three placeholder questions. None of that was implemented, and the placeholders have been removed. Nothing in this folder calls an LLM.

A later change may add a small generation eval (grounding of generated notes and quizzes in the retrieved chunks, judged by a model). That would make paid API calls, so it should be a separate, explicitly run script with a cost estimate printed first, and reuse the corpus and topics here.
