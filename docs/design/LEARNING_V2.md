# Margins learning v2: cost, correctness, course structure and the learning loop

Status: approved for implementation (2026-10-21). Owner: Harish. This spec is the source of truth for
the work in stages 0-3 below. Where it says "must", tests should prove it.

## Why

A live run on a real course (MIT OCW 18.05: syllabus, calendar, four readings, one past exam; 58
pages; artifacts in `/tmp/sb-audit/`) showed:

- **Cost.** "Generate" for 7 topics ran 28 jobs at once and cost $4.13, over the $3/user/day cap, so
  the student could not generate an exam or ask a question until midnight UTC. $2.55 was Opus output
  tokens; $1.56 was prompt-cache writes with **zero** cache reads (all 28 jobs started together, and
  a structured-output schema sits in the prompt prefix, so different content types never share a
  cache entry).
- **Reliability.** 3 of 28 jobs failed with `LLM_RATE_LIMITED` and were not retried.
- **Bugs.** Multiple-choice options are shuffled after the explanation is written, so "Option C is
  ..." can point at the wrong option. Raw LaTeX shows in key-concept chips and some step titles; a
  currency amount broke math rendering (`-\100$`). "Course progress 61%" with 6 of 7 topics not
  started. Small horizontal overflow on five mobile pages. Budget errors show students dollar figures.
- **Structure.** Topics are a flat list capped at 12, extracted by the fast model from at most 100
  headings plus ten 300-character samples, mostly from whichever files sort first by uuid. Each
  topic is taught from its top 24 chunks by similarity (about 10 pages), in relevance order, so
  topics overlap (the same coin example in two topics, the screening example in three) and
  syllabus/calendar text leaks in as filler.
- **Learning loop.** No exam date or plan; the `study-plan` backend is orphaned. Exam results and
  practice do not move mastery or review dates. A due review reopens the same quiz. Quiz questions
  reuse the exact numbers of the notes' worked examples (tests recall, not transfer). Uploaded past
  exams change nothing.

What is good and must not regress: notes and worked examples were accurate and well taught;
practice steps and short-answer feedback were strong.

## Stages

| Stage | Work | Runs |
|---|---|---|
| 0 | Generation-quality eval harness (`evals/generation/`) | parallel with 1 |
| 1A | Cost and reliability | parallel |
| 1B | Correctness bugs, dead code, Playwright in CI | parallel |
| - | Model choice per purpose, decided by Harish's reviewer from stage 0 numbers | after 0 |
| 2 | Course structure (backend, then frontend) | after 1 |
| 3 | Learning loop: exam date, plan, mastery, reviews, past-exam style | after 2 |
| 4 | Verification: unit + e2e, generation eval before/after, live run on studymargins.com | last |

Each stage is its own branch and PR from `main`. Migrations are additive (new tables/columns,
nullable or defaulted); nothing drops data in production.

---

## Stage 0: generation-quality eval

`evals/generation/`, modelled on `evals/retrieval/` (same eval-DB guard: database name must contain
`eval`; default `postgresql://postgres@127.0.0.1:5544/sb_evals`).

- **Corpora** (`corpora/*.json`, downloaded by `fetch_corpus.py` into `evals/.cache/`, never
  committed): `mit-18.05` (the seven files from the live run; syllabus and calendar are OCW HTML
  pages, printed to PDF with Playwright) and one CS course (MIT OCW 6.006 Spring 2020: three lecture
  note PDFs plus one quiz PDF). Record URL, licence, sha256 and category per file.
- **Pipeline:** ingest each corpus with the app's own validator-free path: `chunk_document`, the
  local embedder, inserted rows for one synthetic user/project/materials (reuse
  `evals/retrieval/run_eval.py` ingest code; factor shared helpers into `evals/common/` if needed).
  Then topic extraction with the app's real code (whatever `main` has: today's
  `extract_topics_from_materials`, after stage 2 the new planner), then for N chosen topics
  generate each content type with the app's real generators.
- **Model matrix:** `--models opus:medium,sonnet:medium,haiku:medium` (model alias + effort). For each
  (topic, type, model) store the output, usage and cost in `results/<date>-<label>/raw/*.json`.
  Generation for a topic runs the types **sequentially** so caching behaves as in production.
- **Automatic checks** (no model; `checks.py` with unit tests), reported per model:
  - LaTeX hygiene: `$` / `\` sequences in fields the UI renders as plain text (after 1B everything
    model-written renders math, but keep the check for regressions); unbalanced `$`; bare currency.
  - MC explanations that name an option letter (`Option C`, `(B)`, `C is`).
  - Quiz questions whose numbers (2+ significant numbers, ignoring 0/1/2) all appear in the topic's
    notes or worked examples (recall-copy rate).
  - Structure: notes sections present, word counts, number of examples/steps/questions vs requested.
  - Grounding proxy: share of notes sentences containing a math expression or term that appears in
    the topic's excerpts (cheap lexical overlap; report, don't gate).
  - Overlap between topics: worked-example problem statements that are near-duplicates (token
    Jaccard > 0.6) across different topics.
- **Judge (optional, `--judge opus`, capped by `--max-judge-usd`, default $3):** one Opus call per
  (topic, type) that sees the excerpts and *all models' outputs anonymised and shuffled*, scores each
  1-5 on: factual/mathematical correctness (verify every computation), grounding in the excerpts,
  teaching quality (intuition, worked reasoning, pitfalls), and for quizzes question quality
  (transfer vs recall, distractor quality, unambiguous key). The judge must list every error it
  finds. Store raw judge output.
- **Report:** `results/<date>-<label>.md`: per model cost per topic (and projected per 12-topic
  course), latency, check results, judge means with the error lists, and a side-by-side excerpt of
  one notes section and two quiz questions per model.
- Hard spend stop: `--max-usd` (default 8) across generation + judge, checked before each call
  using the app's own cost estimate.

## Stage 1A: cost and reliability

1. **Per-purpose models.** Replace the two tiers with a purpose map in `ai-service/app/config.py`:
   `MODEL_NOTES`, `MODEL_EXAMPLES`, `MODEL_PRACTICE`, `MODEL_QUIZ`, `MODEL_EXAM`, `MODEL_GRADING`,
   `MODEL_TOPICS`, `MODEL_CHAT`, `MODEL_VOICE`, `MODEL_VALIDATION`, each `"<model-id>:<effort>"`.
   Defaults keep today's behaviour (Opus:medium for content/exam/chat, Haiku:low for the rest)
   until the stage 0 decision; `ANTHROPIC_MODEL`/`ANTHROPIC_FAST_MODEL` stay as fallbacks. Generators
   pass `purpose=` (they already do) and the provider resolves model+effort from it. Usage/cost
   accounting must keep working per model (`usage.py`).
2. **Prompt caching only where it pays.** First generation of a content type: no `cache_control`.
   Regenerations of the same type for the same topic ("More examples", "More practice", a new quiz
   set, a review set): cache the excerpt block (same schema, same prefix, so it is read). Chat and
   voice keep their current caching. Tests: the request built for a first generation has no
   cache_control; a regeneration has it.
3. **Rate limits and overload are transient.** `RateLimitError` (429) and 529/5xx after the SDK's own
   retries map to a transient job failure (AI service answers 5xx, so the dispatcher retries with
   backoff; job keeps `retryable=true`). Raise `LLM_MAX_RETRIES` default to 4. Honour `retry-after`.
4. **Concurrency.** One process-wide `asyncio.Semaphore(LLM_MAX_CONCURRENCY=4)` around every
   model call in the AI service, and jobs for the **same topic run one at a time** (a per-topic
   asyncio lock in the AI service; jobs queue behind it). Test both with the mock provider.
5. **Generate on demand, not in bulk.**
   - Opening a topic with no notes starts notes generation automatically (one job) and shows the
     existing generating state. When notes finish, the topic's other missing types are queued
     **sequentially** (examples, practice, quiz) so they are ready when the student gets there.
   - The overview's "Build the missing study content" bulk action is removed. "Up next" instead says
     "Start <first topic>" (and the plan in stage 3 takes over).
   - `generate-missing-content` stays as an API but processes topics in course order with at most
     one topic in flight per project (the AI-side lock already serialises types per topic); the UI
     only calls it from a course "..." menu item "Prepare all topics now", which shows an estimate
     ("about N topics; this uses a large part of today's AI allowance") before starting.
   - The next topic in order is prefetched (notes only) when the student marks a topic done.
6. **Budget UX.** Students never see dollar amounts. Over-budget errors read: "You've used today's
   AI allowance. It resets at <local time>." (compute from midnight UTC in the browser). Keep the
   admin-facing numbers in logs and job `errorMessage` internals, not in UI copy. The default
   `DAILY_LLM_BUDGET_USD` stays 3 until the stage 0 decision; then it is set so a typical day
   (one 8-topic unit fully generated + one mock exam + 20 chat questions) fits with 2x headroom.

## Stage 1B: correctness

1. **Option letters.** In `shuffle_choice_options` (`ai-service/app/services/llm/schemas.py`), after
   relabelling, rewrite option-letter references in `explanation` (and per-option `feedback` if
   present) to the new letters: patterns `Option X`, `option X`, `Choice X`, `(X)`, `X)` at line
   start, `X is`/`X describes`/`X gives` where X is a single capital A-D used as an option. Do the
   mapping on a placeholder pass so A->C and C->A do not collide. Also change the quiz and exam
   prompts to say: "In explanations, refer to options by their content, never by letter." Tests:
   a question whose explanation says "Option C is wrong, D is the addition rule" produces correct
   letters after a seeded shuffle.
2. **Math everywhere the model writes.** Every model-written string the UI shows (key-concept chips,
   example titles, step descriptions, final answers, practice prompts/hints/feedback, quiz and exam
   question text, options, explanations, feedback, chat) renders through one inline-markdown+KaTeX
   component (block content keeps the full renderer). Audit every field in
   `ai-service/app/services/llm/schemas.py` against its React consumer and list it in the PR.
3. **Currency vs math.** A preprocessing step before remark-math protects currency: `\$` followed by
   a digit, and `$` followed by a digit where the next `$` on the line would make an implausible
   math span (contains words of 3+ letters separated by spaces and no `\`, `^`, `_`, `=`). Unit-test
   the cases from the audit (`-\$100`, `$500 if i + j = 7 and -$100 otherwise`) and normal math
   (`$x = 5$`, `$10^6$`, `$P(A)=0.4$`). Also add to the content system prompt: "Write money as
   `USD 100` or `\$100` outside math; never wrap prose in `$...$`." Find and fix the "GameY" case
   (prose inside math mode in the worked-example answer box).
4. **Course progress.** The overview ring shows **course mastery = mean mastery over all topics,
   with not-started topics counted as 0**, labelled "Course mastery". Breakdown counts unchanged.
   Topic cards unchanged. Test the summary function.
5. **Mobile overflow.** Find and fix the ~3 px overflow (course overview, topic notes, topic practice,
   topic examples) at 390 px. Add a Playwright test that loads each main page at 390x844 (mock LLM
   data) and asserts `document.documentElement.scrollWidth <= innerWidth`.
6. **Small fixes.** `languageLabel` in `frontend/src/lib/voice/coach-prompt.ts` covers every code in
   `VOICE_LANGUAGES` (zh, ko missing). Remove dead code: `features/courses/coming-soon.tsx`;
   `getOptionalAuth`; `enqueueChunkingJob`; the `dev-voice` route after moving its e2e specs onto the
   topic Voice tab. Leave the Prisma models and API routes in place (not worth a destructive
   migration); mark unused GET routes with a one-line comment "kept for API clients; the UI reads
   this through server queries".
7. **CI.** Run Playwright in `.github/workflows/ci.yml` against a Postgres service container with
   `LLM_PROVIDER=mock`, as the local e2e setup does. Keep it under ~10 minutes.

## Model choice (between stage 1 and 2)

Run stage 0 on both corpora, 4 topics each, models opus/sonnet/haiku at medium effort, judge on.
Decision rule per purpose: pick the cheapest model whose judge correctness mean is >= 4.5 with **no
mathematical error** in the error lists for that purpose, and whose teaching/question-quality mean
is within 0.3 of Opus. Notes and worked examples weigh correctness above all; quiz/practice keys
must be unambiguous. Record the table and decision in `evals/results/` and set the `MODEL_*`
defaults and `DAILY_LLM_BUDGET_USD` accordingly.

## Stage 2: course structure

### Data model (additive migration)

- `Unit`: `id, projectId, title, summary?, orderIndex, weekLabel?` (e.g. "Week 3" or "Class 11"
  when the syllabus/calendar says so), `createdAt`. Index `(projectId, orderIndex)`.
- `Topic` gains: `unitId?` (FK, SetNull), `objectives String[]` (3-5 "you can ..." statements),
  `prerequisiteIds String[]` (topic ids in the same project), `estimatedMinutes Int?`.
- `TopicSource`: `id, topicId, materialId, pageStart?, pageEnd?, chunkIndexStart, chunkIndexEnd,
  role ('primary'|'supporting')`. Primary spans are the material this topic teaches from.
- `Material` gains `role String @default("content")`: `content | syllabus | exam | other`, set by
  validation (below), editable by the student. New upload category option "Syllabus or schedule"
  (`syllabus`) maps to role `syllabus`.

Existing projects keep working: topics with no `unitId` render in an "Topics" group with no unit
header; topics with no `TopicSource` use today's hybrid-search mapping.

### Material role

The validator's structured output gains `kind: content|syllabus|exam|other` (it already reads the
document). `role` = the student's category if it is `sample_exams` (exam) or `syllabus`; otherwise
the validator's kind. Syllabus and exam materials are never topic sources and are excluded from
topic mapping, content generation context and chat retrieval ranking (chat may still cite them when
the question is about logistics: keep them retrievable but rank them after content; simplest
correct rule: exclude `exam` and `syllabus` roles from topic/generation retrieval only).

### Course planner (replaces `topic_extractor.py`'s prompt)

1. **Outline, no model.** For each `content` material, build sections from chunks: consecutive
   chunks with the same top two levels of `section_hierarchy` form a section; record material,
   chunk index range, page range, token count, heading path, and the first ~240 characters of text.
   Materials with no headings (slides, some PDFs): one section per ~1,500 tokens of consecutive
   chunks, labelled by the first line. Number sections `S1..Sn` in material upload order, then
   document order.
2. **Plan, one model call** (purpose `topics`; default model = the `MODEL_NOTES` model at low effort,
   because structure quality matters and it is one call per course). Input: course name, the
   outline (ids, headings, pages, tokens, snippets), syllabus/calendar text (full, up to ~6k tokens,
   for ordering and unit naming), and names of exam materials. Output schema:
   `units[] { title, week_label?, summary, topics[] { key, name, description, objectives[3-5],
   keywords[3-8], section_ids[], prerequisite_keys[], estimated_minutes } }`.
   Prompt rules: every section id appears in exactly one topic; topics are contiguous where the
   material is contiguous; a topic covers roughly 1,500-6,000 tokens of source (split bigger
   sections' neighbours rather than merging unrelated ones; a single section larger than 6,000
   tokens may be its own topic); units follow the syllabus/calendar weeks or the material's own
   chapters/lectures; order is the order a student should learn in (syllabus first, then document
   order); no cap on topic count (a 12-week course may have 40+ topics); names are 2-6 words and
   specific; prerequisites only point backwards.
3. **Validate.** Drop unknown section ids; any section not assigned goes to the topic that owns the
   adjacent section in the same material (previous, else next); a section assigned twice stays with
   the first. Topics with no sections are dropped unless they are the only topic. Write `Unit`,
   `Topic` (+ objectives, prerequisites resolved to ids, minutes) and `TopicSource` rows in one
   transaction. Keep the existing rule that confirmed topics survive "Find again".
4. **New material after confirmation.** Re-run the planner with the existing units/topics given as
   fixed context and only the new sections to place: it may add sections to existing topics or add
   new topics/units after the existing ones. Never renames or deletes confirmed topics.
5. **Large courses.** If the outline exceeds ~120k tokens, plan per material (or per group of
   materials) and concatenate units; then one cheap pass to fix cross-material ordering. (Rare;
   implement simply and test with a synthetic outline.)

### Context for generation

- A topic's excerpts are **all chunks in its primary `TopicSource` spans, in document order**, up to
  a token budget `TOPIC_SOURCE_TOKEN_BUDGET=16000` (if over budget, keep whole sections in order and
  drop from the end, logging it), plus up to 4 supporting chunks from hybrid search in *other*
  content materials (role `content` only), labelled as supporting. Topics without sources (added by
  hand) use today's hybrid mapping.
- The generation prompt additionally gets the course map: unit and topic names in order, this
  topic's objectives and prerequisites. Rules added to `CONTENT_SYSTEM_PROMPT`: teach only this
  topic's objectives; assume the prerequisites are known (refer to them by name, don't re-teach);
  don't reuse a worked example that belongs to another topic's source.

### Teaching format

- **Notes** become a lesson: `# <topic>`, `## What you'll learn` (the objectives), `## The idea`
  (intuition first, concrete), `## Key concepts` (definitions + one small example each),
  `## Worked example` (one, from the source), `## Check yourself` (2-3 quick questions in fenced
  ` ```check ` blocks: first line `Q: ...`, then `A: ...`; the renderer shows the question with a
  "Show answer" reveal; math renders in both), `## Common pitfalls`, `## Summary` (5-8 recall
  bullets). Keep the post-processor's robustness (promote bare labels to headings) for the new
  labels, and keep old notes rendering.
- **Quiz and exam prompts:** at least half the questions apply a concept to a new situation; use
  numbers and scenarios that differ from the worked examples in the excerpts and notes; each
  question lists `concepts_tested` (already) and `source_excerpts` (excerpt indexes it is based on).
- **Examples and practice:** each item lists `source_excerpts` too.
- **Sources in the UI:** the app maps excerpt indexes to file + page and shows "From <file>, p. N"
  under each worked example, practice problem and quiz/exam review item (link to the file viewer as
  notes citations do). Notes citations come from the topic's primary spans (file + page ranges).

### Frontend

- Topics list and sidebar: grouped by unit (title, week label, topic count, unit mastery);
  collapsible in the sidebar; flat projects unchanged.
- Topic page header: objectives ("By the end you can ..."), prerequisites as links, sources as
  "File, pp. a-b" links, estimated time.
- Topic editor (confirm step and later): units with their topics; rename units and topics; move a
  topic to another unit (select), reorder within a unit, merge topics, delete, add. Sources shown
  per topic (read-only).
- Materials: role badge (Content / Syllabus / Past exam / Other) editable from the file menu; upload
  category gains "Syllabus or schedule".
- ` ```check ` renderer as described.

## Stage 3: learning loop

### Exam date and daily time

`Project` gains `examDate DateTime?` and `dailyMinutes Int @default(45)`. Set in course creation
(optional fields), course settings, and an overview prompt card "When is your exam?" until set.

### Plan

A deterministic planner (no model; `frontend/src/lib/learning/plan.ts`, pure and unit-tested; the
existing `buildStudyPlanForProject` and `study-plan` route are replaced or rebuilt on it) computes
days from today to the exam date (or a rolling 14 days without one):

- Learn blocks: topics in course order (respect prerequisites), each `estimatedMinutes` (default
  35), packed into `dailyMinutes` per day.
- First quiz on a topic the day after it is learned; reviews at the review schedule's `dueAt`.
- Mock exams: one after each unit is learned (if 3+ topics in it) and two full mocks in the final
  week (the second at least 2 days before the exam). Final 2 days: weakest topics' reviews only.
- If time is short (total learn minutes > available minutes before the exam minus mocks), the plan
  says so plainly and prioritises: topics with exam-material overlap first (when past exams exist),
  then course order; it never silently drops topics: it shows "Not scheduled: N topics".
- The plan is recomputed from state on every load; completed items come from real progress.

UI: a "Plan" page in the course nav (week view, today highlighted, each item links to its action,
done items ticked) and the overview's "Up next" reads today's plan items.

### Mastery

- Signals: quiz (0.45), exam (0.25), voice (0.15), practice (0.15), renormalised over sources with
  data (update `mastery-math.ts` and its tests).
- **Exam grading updates review schedules**: after grading stores per-topic exam signals, recompute
  each affected topic's mastery and `ReviewSchedule` (move the recompute into a function both the
  Next.js side and the AI service can trigger; simplest: the exam results page/route calls the
  existing `upsertReviewSchedule` for each topic in the graded submission, idempotently, when it
  first sees the graded result).
- **Practice to the server**: new `POST /api/topics/[topicId]/practice-progress` storing solved
  steps per problem (table `PracticeProgress`: userId, topicId, contentId, problemIndex, stepsSolved,
  stepsTotal, hintsUsed, updatedAt; unique on user+content+problem). A finished problem records a
  `practice` learning signal (score = steps solved without hints / total). The localStorage store
  stays as a cache and migrates its data to the server on first load.
- **Displayed mastery decays when overdue**: `displayMastery = mastery * 0.5^(overdueDays /
  (2*intervalDays))`, floored at 0.5*mastery, computed at read time. Unit-test.

### Reviews

When a topic is due, the review action offers:

1. **"Retry what you missed"**: a quiz of the questions the student got wrong in their last two
   attempts on this topic (no model call). Hidden if none.
2. **"Fresh review"**: a new 6-question set (regeneration, cached excerpts) focused on the
   `concepts_tested` of missed questions, difficulty from mastery (<0.4 easy, <0.75 medium, else
   hard), plus 1-2 questions from a prerequisite topic (interleaving) when one exists.

Review attempts update mastery and the schedule like quizzes. The Review page lists due topics with
both actions.

### Past exams

- After a material with role `exam` is chunked, one call (purpose `topics`'s model at low effort)
  extracts a **style profile** stored on the material (`styleProfile Json?`): question count,
  type mix, points distribution, typical length of an answer, phrasing conventions, typical task
  verbs, whether multi-part questions are used, calculators/units conventions, and 3 short example
  stems paraphrased (not copied).
- Mock exam generation receives the merged style profile and is told to match it. The new-exam form
  shows "Match my past exams" (on by default when a profile exists).
- Topic relevance: the planner marks topics whose concepts appear in past-exam text (hybrid search
  of each topic against exam chunks, similarity above the floor) as `examRelevant`; the plan
  prioritises them when time is short and the topic list shows a small "On past exams" tag.

## Stage 4: verification (definition of done)

- All unit tests and Playwright (CI included) green; `tsc`, lint, build, pytest green.
- Stage 0 eval re-run after stages 2-3 on both corpora: topic count scales with content, no
  section unassigned, cross-topic duplicate examples ~0, letter-reference and raw-LaTeX checks 0,
  recall-copy rate in quizzes below 20%, judge correctness not lower than before.
- Live run on studymargins.com with the 18.05 course: topics in units, a day's work (open topics,
  notes/examples/practice/quiz on several topics, a mock exam with free response, 3 chat questions)
  fits within the daily budget; screenshots reviewed at desktop and mobile; test data cleaned up.
