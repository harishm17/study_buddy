# Evals

This folder holds the evaluations for Margins. There are two:

- A **retrieval eval** that measures how well the app maps a topic to the chunks of the course material that explain it. It is free to run (no paid API calls) and takes under a minute.
- A **generation eval** that runs the app's real generators (notes, worked examples, practice problems, quiz) on two real courses with several models, then checks the output with code and, optionally, an Opus judge. It makes paid API calls, so it has a spend cap. See [Generation eval](#generation-eval).

The rest of this file up to "Generation eval" is about the retrieval eval.

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
  common/
    ingest.py            chunk + embed + store documents (shared by both evals)
  generation/            see "Generation eval" below
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

## Generation eval

`evals/generation/` answers: for the same topic and the same source excerpts, how do different models compare at writing the study material Margins shows, in cost, speed, mechanical quality, and (with a judge) correctness and teaching quality? It exists to decide which model to use for which purpose, and to catch regressions in generated content (stray LaTeX, answer-letter references, quizzes that copy the worked examples).

It calls the app's own generators (`NotesGenerator`, `ExamplesGenerator` for worked and practice problems, `QuizGenerator`) with a provider built for each model, so every model gets identical excerpts and identical prompts. It makes paid API calls. Read [Spending](#spending) before a large run.

### What it does

1. **Corpora.** `corpora/mit-18.05.json` is the seven files of the live audit of studymargins.com: MIT 18.05 Introduction to Probability and Statistics (Spring 2022) syllabus and calendar (OCW web pages printed to PDF), four class reading PDFs and one past exam. `corpora/mit-6.006.json` is a computer science course: MIT 6.006 Introduction to Algorithms (Spring 2020), three lecture note PDFs (hashing, binary heaps, dynamic programming) and one quiz. Each corpus file lists, per document, the URL, licence, SHA-256 and the category the app would see it under.
2. **Ingest.** Each corpus is chunked with the app's `chunk_document` and embedded with the app's embedder (the same code as the retrieval eval, in `common/ingest.py`) into one synthetic user and project per corpus.
3. **Topics.** By default the app's own topic extraction runs (`extract_topics_from_materials`, with the model the app picks for that purpose, `MODEL_TOPICS`), so the eval sees the same topics a student would. The topics are then mapped to chunks exactly as the extract-topics job does, and N of them are picked, spread evenly over the list (`--num-topics`, default 4). All models in a run share the same topics and excerpts. `--topics-file` fixes the topics instead (see [Fixed topics](#fixed-topics)).
4. **Generation.** For each topic and each model, the generators run one after another in the app's order (notes, worked examples, practice problems, quiz), so prompt caching behaves as it does in production. Different models run at the same time (`--sequential-models` turns that off). The raw output, token usage, cost and latency of every call go to `results/<date>-<label>/raw/`.
5. **Checks** (no model), **judge** (optional) and **report**, described below.

### Layout

```
evals/generation/
  run_eval.py        the runner
  fetch_corpus.py    downloads and verifies the corpora into evals/.cache/generation/
  print_pages.py     prints OCW web pages to PDF with Playwright (started by fetch_corpus.py)
  corpora/*.json     the corpora
  corpus.py          loads corpus files
  adapters.py        every call into app code (see "When the app changes")
  checks.py          automatic checks
  spend.py           the spend gate
  judge.py           the judge: prompt, anonymisation, aggregation
  analysis.py        checks, cost, latency and judge scores from a results folder
  report.py          markdown report
  test_*.py          tests (no database, no network, no model)
```

### Setup

The eval database needs all of the app's migrations, like the retrieval eval's. The database name must contain `eval` (the harness refuses otherwise; `--allow-any-db` overrides). The examples use `postgresql://postgres@127.0.0.1:5544/sb_gen_evals`; the default is `.../sb_evals`.

```bash
# 1. Create the database and its schema (once; needs a Postgres 16 with the vector extension, which the first migration enables)
createdb -h 127.0.0.1 -p 5544 -U postgres sb_gen_evals
cd frontend && npm ci
DATABASE_URL=postgresql://postgres@127.0.0.1:5544/sb_gen_evals npx prisma migrate deploy

# 2. Download the course files (about 2 MB) and print the two OCW pages to PDF
cd ../ai-service && uv sync
uv run python -I ../evals/generation/fetch_corpus.py
```

`fetch_corpus.py` downloads into `evals/.cache/generation/` (gitignored), checks every PDF's SHA-256, and prints the syllabus and calendar pages with Playwright. Playwright is not an ai-service dependency, so the script starts `uv run --no-project --with playwright` for that step; it needs Chromium (`uv run --no-project --with playwright playwright install chromium`; the box has it). Printed bytes differ on every run, so a printed page is checked against the hash of its extracted text. If a hash no longer matches, the script stops and prints the new one; check the file is still the same document before updating the corpus file.

The API key is read from `ANTHROPIC_API_KEY` or from `ai-service/.env`. It is never printed or stored.

### Running

```bash
cd ai-service

# See the plan and a cost estimate first. Calls nothing.
uv run python -I ../evals/generation/run_eval.py --dry-run --judge opus

# Free end-to-end check with the app's mock provider (placeholder text, zero cost)
uv run python -I ../evals/generation/run_eval.py --mock --label mock --num-topics 2 --judge opus --out-dir /tmp/gen-mock

# Small paid smoke run: one topic, Haiku only, notes and quiz, about one cent
uv run python -I ../evals/generation/run_eval.py --db postgresql://postgres@127.0.0.1:5544/sb_gen_evals \
  --label smoke --corpora mit-6.006 --num-topics 1 --models haiku:medium --types notes,quiz --max-usd 0.30

# The model comparison: both corpora, 4 topics each, three models at medium effort, Opus judge
uv run python -I ../evals/generation/run_eval.py --db postgresql://postgres@127.0.0.1:5544/sb_gen_evals \
  --label model-choice --models opus:medium,sonnet:medium,haiku:medium --num-topics 4 \
  --judge opus --max-usd 25 --max-judge-usd 10
```

Always give the effort explicitly (`opus:medium`); the script refuses a bare model name, because the API's default effort differs by model (Sonnet 5.5 defaults to high, Haiku 5.5 to medium). Model aliases are `opus`, `sonnet` and `haiku` (`claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`); full ids also work.

Options:

| Option | Meaning |
|---|---|
| `--corpora` | comma-separated corpus ids (default both) |
| `--models` | comma-separated `<model>:<effort>` |
| `--types` | any of `notes,solved,interactive,quiz` (default all four) |
| `--num-topics N`, `--topic-indexes 0,3,5` | which topics to generate; the first spreads N evenly over the extracted list |
| `--topics-file F` | fixed topics (below) |
| `--examples`, `--questions`, `--difficulty`, `--detail-level` | what the generators are asked for (defaults 3, 10, medium, comprehensive: the app's defaults) |
| `--judge opus[:effort]` | turn the judge on (effort defaults to medium) |
| `--max-usd`, `--max-judge-usd` | spend caps, default 8 and 3 |
| `--label`, `--out-dir` | results folder name and place |
| `--resume DIR` | continue a results folder: finished generations and judged pairs are not repeated, and the budget counts what was already spent |
| `--resume DIR --no-generate` | redo checks, judge and report from the stored files only (no database) |
| `--mock`, `--dry-run`, `--sequential-models`, `--seed`, `--timeout`, `--rebuild`, `--env-file` | see `--help` |

The calls use a 600 s timeout (the app uses 180 s) so a slow Opus call is not billed and then thrown away; change it with `--timeout`.

#### Fixed topics

To hold topics constant across separate runs (for example after changing a prompt), pass `--topics-file`. It can be a previous run's `results/<run>/topics.json` (the same topics are generated again) or your own JSON, either a list or one list per corpus:

```json
{
  "mit-18.05": [
    {"name": "Bayes' theorem", "description": "Updating a probability with new evidence.", "keywords": ["prior", "posterior", "likelihood"]}
  ],
  "mit-6.006": [ ... ]
}
```

With your own file, all topics in it are generated unless you also give `--num-topics`. The topics are still mapped to chunks by the app's retrieval, and every model sees the same excerpts. `--resume` reuses the folder's own `topics.json` automatically.

Run the tests (no database, network or model):

```bash
cd ai-service && uv run pytest ../evals/generation ../evals/retrieval -q
```

### Spending

Every model call goes through a gate. Before a call, the harness estimates its cost with the app's own price table (`ai-service/app/services/llm/usage.py`): the prompt size in tokens (characters divided by 3.2), priced as plain input (the first generation of a content type caches only the short system prompt, as in the app), plus the output length (a default per purpose until a call of that model and purpose has finished, then 1.25 times the mean seen). If the money spent so far, plus calls in flight, plus this estimate would pass `--max-usd` (generation, topic extraction and judge together) or, for the judge, `--max-judge-usd`, the call is not made. A generation stop ends the run, and the report says so. The estimate can be low by the size of its own error, so one call can overshoot a cap slightly; nothing is sent after the cap is reached. Costs are the tokens the API reports times the app's price table. Hidden SDK retries and the server-side fallback model (used by Opus and Sonnet on a safety refusal) are not priced separately.

`--dry-run` prints an estimate for the planned run. It is deliberately pessimistic. For the full command above it says about $16.50 ($8.30 generation, $8.20 judge). The smoke run cost about $0.01, close to its estimate of $0.01.

### Results

`results/<date>-<label>.md` is the report. `results/<date>-<label>/` holds `run.json` (settings, code version, spend), `topics.json`, `summary.json` (everything in the report), and three things that are not committed because they contain source text or text derived from it (the course files are CC BY-NC-SA): `raw/*.json` (every output with its calls, usage, latency and raw model text), `excerpts.json` and `judge/*.json`. They are listed in `.gitignore`; keep them locally if you want to re-run checks with `--resume DIR --no-generate`.

The report has, per model: cost per topic (and projected for a 12-topic course), cost and latency per content type, tokens including cache reads and writes, check results, judge means with every error the judge listed, and a side-by-side of one notes section and two quiz questions. The projection is the mean cost of each content type summed (all types generated in this run) times 12.

### Automatic checks

`checks.py` has no model, database or app imports, and `test_checks.py` tests it. All of them are lexical heuristics. They find things worth reading; they do not show content is right.

| Check | What it counts | What it can miss or get wrong |
|---|---|---|
| LaTeX hygiene | `$` or backslash sequences in fields the UI shows as plain text today (titles, key-concept chips, step titles, one-line correct answers); fields with unbalanced `$`; bare currency (a `$` before a digit that starts money, not math, using the rule from the spec) | The plain-text field list is in `checks.iter_text_fields`; after stage 1B it should shrink. Currency inside a longer math span, or math with prose words and no backslash, can be misjudged. |
| MC option letters | Multiple-choice explanations that name a letter: strict (`Option C`, `(B)`) and loose (`C is`, `D gives`) | Math and code are removed first. A prose "A is ..." not about an option counts as a loose hit. A reference like "the first one" is not found. |
| Recall-copy rate | Quiz questions with two or more distinct numbers (ignoring 0, 1, 2) all present in the same model's notes and examples for that topic | Only the question text is compared, not options. It compares numbers, not ideas: a copied scenario with new numbers passes. The rate is over questions with two or more numbers, so it is empty for non-numeric topics. |
| Structure | Required notes sections (from the app's own `_SECTION_LABELS`), notes word count against the requested band, 5-8 recap bullets, examples, practice sets and quizzes against the requested counts, steps per practice problem against the difficulty band | Section names are matched on the heading start. Counts after the app's own filtering of unusable items. |
| Grounding proxy | Share of notes sentences with two or more words (5+ letters, minus a stoplist) that also appear in the topic's excerpts, or a math expression sharing a symbol or number with them | Not a faithfulness measure. A wrong sentence in the excerpts' words passes; a correct restatement in new words fails. Report only, no threshold. |
| Topic overlap | Pairs of worked-example and practice problem statements in different topics with token Jaccard above 0.6 | Same idea in different words is not found. |

### Judge

With `--judge opus`, one call per (topic, content type) sees the topic's excerpts and every model's output as anonymous candidates (A, B, C) in an order that is shuffled per pair (seeded, so a re-run keeps the same letters), rendered in the same plain layout for every model. It checks every computation, scores each candidate 1 to 5 on correctness, grounding and teaching quality (plus question quality for quizzes), and lists every error with a kind (mathematical, factual, unsupported by the excerpts, ambiguous key, other), where it is and what is wrong. The raw judge output and the letter-to-model mapping are stored.

Know what it is: one model's opinion, at the effort you set. Opus is also a candidate, so it may favour its own style, even anonymised. It cannot run code, so an arithmetic slip can pass and a correct step can be flagged. The 1-5 scale is coarse and the sample is small (a few topics per corpus), so look at the error lists, not only the means. Check an error against the source before relying on it. The decision rule in the spec needs "no mathematical error in the error lists", which is why the report counts mathematical errors per model and per type.

### When the app changes

The harness calls app code in one file, `adapters.py`. Learning v2 stages 1A and 2 change what it calls:

- `build_provider` builds the app's own `AnthropicProvider`. The app picks a model and effort per call from the call's purpose (`app/services/llm/models.py`, the `MODEL_*` settings), so the eval pins one model and effort for the length of each call: `install_model_pin` wraps the provider module's `resolve_model` once, and `MeteredProvider` sets a context variable around every call (per task, so models running at the same time do not interfere; with no pin set the app's own choice applies, as in topic extraction). The judge's purpose (`judge`) is not one the app knows, which works only because a pin is always set for it. If the provider stops calling `resolve_model` from its own module, `install_model_pin` fails loudly.
- `extract_topics` calls `extract_topics_from_materials`. Stage 2's planner replaces it; change this one function and keep the return value (a list of `{name, description, keywords}` in study order). Because planner topics come with sources and units, `store_topics` and `map_topic` may also need to write them.
- `make_generators` and `generate` mirror `generate_content_job` in `jobs.py`. The eval is always a first generation, so `cache_excerpts` stays at its default (False), which matches the app's first generation of a content type. Option shuffling and the letter rewrite live in `QuestionSet.usable()` in `schemas.py`, which the quiz generator calls, so they are exercised on every quiz; `raw/*.json` keeps the model's own, unshuffled output next to the stored questions.
- `notes_expectations` reads the notes section labels from `notes.py`, so the structure check follows the prompt. `checks.INTERACTIVE_STEP_BANDS` and `DEFAULT_NOTES_WORD_BAND` mirror prompt text and need updating by hand.

### Limitations

- **One sample per cell.** Each (topic, model, type) is generated once. Model output varies run to run, so differences between models a few percent apart are noise. Run more topics before drawing a conclusion.
- **Small corpora.** 6.006 is three short lecture notes plus one quiz (61 chunks), so a topic's 24 excerpts can be a third of the course; 18.05 is 58 pages. Topics come from the app's extraction, which is not deterministic and, today, sees the syllabus, calendar and past exam like any other file. The first topic can be a logistics topic. Use `--topic-indexes` or `--topics-file` to choose.
- **Excerpts, not the whole course.** Every model sees the same 24 mapped chunks, as in the app. A model cannot be faulted for what is not in them, and the grounding proxy and the judge both see only those excerpts.
- **Checks are lexical** (see the table). Zero hits means none were found, not that none exist.
- **Costs are estimates** from reported tokens and the app's price table, not an invoice. The projection assumes a 12-topic course generated in full.
- **The mock provider** returns the same placeholder for every model, so a mock run proves the plumbing, not the numbers.
- **Source text is not committed.** `raw/`, `excerpts.json` and `judge/` stay on the machine that ran the eval.

### Licence

The corpora are MIT OpenCourseWare materials under **CC BY-NC-SA 4.0** (Attribution-NonCommercial-ShareAlike). The attribution lines are in each corpus file. For 18.05: Jeremy Orloff and Jonathan Bloom, Spring 2022. For 6.006: Erik Demaine, Jason Ku and Justin Solomon, Spring 2020. This is fine for an internal evaluation. Because the licence is non-commercial, the files and the text derived from them (excerpts, raw model output) are not committed; the report shows only short samples.
