# StudyBuddy backend contract and current-UI feature inventory

Learning v2, stage 2 (course structure) changed the topics, materials, content and job sections below; §9 collects what the Stage 2 UI builds on.

## 0. Global conventions

**Auth**
- Credentials sign-in uses a JWT session, 30 days. The cookie is the NextAuth default.
- Most routes call `requireAuth()` (`FE/lib/auth/get-session.ts`), which throws `Error('Unauthorized')` and yields 401.
- A few routes call `getServerSession(authOptions)` directly.
- There is no `middleware.ts`. Pages guard themselves server-side with `getServerSession` and `redirect('/login')`.
- Ownership is enforced per route. An unowned or unknown id returns 404, never 403.

**Three error shapes coexist.** The new UI needs one tolerant parser.
- **A (legacy):** `{ "error": "message string", "details"?: ... }`. Used by:
  - `projects` (POST, `[id]` GET/PATCH/DELETE, `materials` GET/POST)
  - `materials/[id]` (DELETE and `file`)
  - `topics` (GET/POST, `topics/[id]` PATCH/DELETE)
  - `topics/[id]/content`, `progress` and `quiz-attempts`
  - `exams/[id]` (GET and `submissions`), `projects/[id]/exams`
  - `auth/signup`
  - all of `voice/*` except `session` and `usage`
  - the 404/401 branches of `generate-exam`
- **B (typed):** `{ "error": { "code", "message", "details"? } }`. `code` is one of `UNAUTHORIZED | FORBIDDEN | NOT_FOUND | INVALID_INPUT | VALIDATION_FAILED | CONFLICT | RATE_LIMITED | UPSTREAM_ERROR | INTERNAL_ERROR`. From `FE/lib/api/errors.ts`. Used by:
  - `jobs`, `chunking-job`
  - `extract-topics`, `generate-content`, `regenerate-content`, `generate-missing-content`
  - `generation-failures`, `next-actions`, `study-plan`, `health`
  - `topics/confirm`, `topics/merge`, `confidence`
  - `exams/[id]/attempt`, `submit`, `regrade` and `submissions/[sid]`
  - `chat*`, `voice/session`, `voice/usage`
- **C (mixed):** `409 CONFLICT` bodies from extract-topics are hand-built B. Several B routes put a sub-code in `details.code`:
  - exam attempt: `ATTEMPT_CLOSED`, `ATTEMPT_EXPIRED` (also carries `submissionId`)
  - chat: `LLM_DAILY_BUDGET`, `RATE_LIMITED`, `CHAT_UNAVAILABLE`, and others (plus `retryable`)
- The existing UI's helper is `message = typeof e.error === 'string' ? e.error : e.error?.message`.

**Other conventions**
- `sizeBytes` is a BigInt, serialized as a **string**.
- Dates are ISO strings.
- JSON bodies are camelCase. LLM content (`contentData`) is snake_case.
- Rate limits are in-memory and per instance. Hits return 429 with `Retry-After`:
  - signup: 5/min per IP
  - quiz-attempts POST: 10/min per user
  - chat POST: 10/min per user
  - voice `record_answer`: 30/min per user. This one returns an `output.error`, not a 429.
- Preflight `ensureAiGenerationReady()` (`FE/lib/api/ai-preflight.ts`) calls AI-service `GET /health/dependencies` with a 4 s timeout. It runs before every job-creating route except upload. It returns **503 B-shape `UPSTREAM_ERROR`** with one of these messages:
  - "AI service is unavailable..."
  - "AI service is missing ANTHROPIC_API_KEY. Configure it before generating content."
  - "AI service database dependency is unavailable."
  - "AI service health check failed..."
- Preflight does not check the daily budget.
- Frontend to AI service calls carry the `x-ai-internal-token` header. The browser never calls the AI service. The one exception is the browser's WebRTC call to OpenAI.

---

## 1. Auth routes and client sign-in/out

### `POST /api/auth/signup` (public)
- Body zod schema:
  ```ts
  z.object({
    email: z.string().trim().toLowerCase().max(254).email(),
    password: z.string().min(8).max(72),
    name: z.string().trim().max(100).nullish().transform(v => v || null),
  })
  ```
- 201: `{ message:'User created successfully', user:{ id, email, name, createdAt } }`
- Errors (shape A):
  - 400: `{error: firstIssueMessage}`, or `'Invalid request body'`
  - 409: `'User with this email already exists'`
  - 429: `'Too many signup attempts...'` with `Retry-After`
  - 500: `'Internal server error'`
- The user is not signed in by this call. The signup page then calls `signIn('credentials')` itself.

### `GET|POST /api/auth/[...nextauth]` (NextAuth v4)
- Providers:
  - Credentials (`email`, `password`). Failures throw `'Email and password are required'` or `'Invalid email or password'`.
  - Google, only when `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` are both set.
- `pages.signIn = '/login'`.
- The Google `signIn` callback uses `decideGoogleSignIn` (`FE/lib/auth/google-link.ts`):
  - `email_verified !== true` redirects to `/login?error=GoogleEmailNotVerified`.
  - An email linked to a different Google id redirects to `/login?error=GoogleAccountMismatch`.
  - An unlinked password account is linked. A new user is created.
- `GOOGLE_SIGN_IN_ERRORS` in the same file holds the user-facing text for both codes.
- Session shape: `session.user = { id, email, name }`. The JWT carries `id`, `email`, `name`.
- The secret comes from `NEXTAUTH_SECRET` or `AUTH_SECRET`. Production throws if it is missing. Dev uses a fixed string.

### Client usage
- Login:
  - `getProviders()` shows the Google button only if `providers.google` exists.
  - `signIn('credentials', {email, password, redirect:false})`. On `result.error`, the page shows a fixed "Invalid email or password". On success it runs `router.push('/dashboard'); router.refresh()`.
  - Google: `signIn('google', {callbackUrl:'/dashboard'})`.
  - `useSession` is used only on `/login`, to redirect an already authenticated user. `SessionProvider` is mounted only in `app/login/layout.tsx`.
  - On load, `?error=` is read from `window.location.search` and mapped through `GOOGLE_SIGN_IN_ERRORS`.
- Signup: POST `/api/auth/signup`, then `signIn('credentials', {redirect:false})`, then push `/dashboard`.
- Sign-out: `signOut({callbackUrl:'/login'})`, in the dashboard and project-dashboard headers only.
- The signup page always shows "Continue with Google", even when the provider isn't configured.

---

## 2. API routes

Legend: **Auth** is 401 if no session. Ownership is checked via the project, which is the user's.

### Projects

**`POST /api/projects`**
- Body: `z.object({ name: string.min(1).max(200), description: string.max(1000).nullable().optional() })`
- 200: `{ project: Project }` (full row: `id, userId, name, description, status:'setup', createdAt, updatedAt`)
- 400: `{error:'Invalid input', details: ZodIssue[]}`

**`GET /api/projects/[projectId]`**
- 200: `{ project: Project & { _count:{materials, topics} } }`
- 404: A-shape

**`PATCH /api/projects/[projectId]`**
- Body: `{ name?: string(1..255), description?: string /*cannot be null*/, status?: 'setup'|'topics_pending'|'active'|'completed' }`
- 200: `{ project }`
- 400: `{error:'Invalid input', details: <ZodError object>}`

**`DELETE /api/projects/[projectId]`**
- Cascade-deletes the DB rows, then removes stored files best-effort.
- 200: `{ success:true }`

**There is no `GET /api/projects` list route.** The dashboard reads Prisma in a server component. A new UI must keep a server component or add a route.

### Materials

**`POST /api/projects/[projectId]/materials?category=<lecture_notes|sample_exams|book_chapters|syllabus>&filename=<name>`**
- The request body is the raw file, not multipart. A `multipart/*` content-type gets 415.
- `Content-Length` is mandatory. A missing header gets 411, a non-numeric one 400, zero bytes 400, and over the limit 413 `"File must be N MB or smaller."`
- The limit is `MAX_UPLOAD_MB` (default 25, max 500). It is not exposed by any API; the upload page gets it as a server-side prop.
- Allowed extensions: `.pdf .docx .pptx .doc`. Allowed MIME: pdf, docx, pptx, `application/msword`, `application/octet-stream`, or empty. A magic-signature check runs per extension. A failure gives 400 `"Uploaded file failed signature validation..."`.
- Other errors: 400 `'Invalid category'`, 400 `'No file provided'`, 400 for a truncated upload.
- 200:
  ```json
  { "material": { "id", "filename", "category", "role", "sizeBytes": "string", "validationStatus": "pending", "uploadedAt" }, "jobId": "..." }
  ```
- `role` starts as `exam` for `sample_exams`, `syllabus` for `syllabus` and `content` otherwise; validation then decides (see "Material roles" in §9).
- Side effects: streams to storage first, then creates the Material (`validationStatus 'pending'`), then a `validate_material` job (stage `validating`), then enqueues it. If the enqueue fails, the job is marked failed, the file and Material are deleted, and the route returns **502** `{error:'Failed to start material validation'}`.
- The AI service then validates with an LLM check and, if valid, creates a `chunk_material` job itself. When the last chunk job completes, extraction auto-starts (`AUTO_EXTRACT_TOPICS_ON_CHUNK` defaults to true).

**`GET /api/projects/[projectId]/materials`**
- 200: `{ materials: [{ id, filename, category, role, sizeBytes:"str", validationStatus, validationNotes, uploadedAt, validatedAt }] }`, newest first.
- No UI calls this.

**`PATCH /api/materials/[materialId]`** (new)
- Body: `{ role: 'content' | 'syllabus' | 'exam' | 'other' }` (the student's say on what a file is for; the UI offers it from the file menu with the labels Content, Syllabus, Past exam, Other).
- Becoming `syllabus` or `exam` removes that file's `topic_sources` and its `topic_chunk_mappings` in the same transaction, so topics stop being taught from it at once (content already written stays). Becoming `content` or `other` adds nothing by itself: "Find topics again" places its sections.
- 200: `{ material: { id, role, removedSources } }`. 400 `{ error: 'Invalid input', details }`, 404, 401 (A-shape).

**`DELETE /api/materials/[materialId]`**
- Deletes the row (cascading chunks and mappings), then the file. Does not cancel running jobs.
- 200: `{success:true}`

**`GET /api/materials/[materialId]/file`**
- Streams the stored file. PDFs are inline, other types are attachments. Supports `Range` (206, 416).
- Headers: `Cache-Control: private, max-age=300`, `X-Content-Type-Options: nosniff`.
- 404 is the same for unknown and not-yours. 502 `{error:'The file could not be read right now'}`.
- Used by citation links: `viewerUrl(source)` = `/api/materials/{id}/file` plus `#page=N` for PDFs.

**`GET /api/materials/[materialId]/chunking-job`**
- 200: `{ chunkingJob: null | { id, status, stage, progressPercent, errorMessage, errorCode, retryable, createdAt, startedAt, completedAt } }`
- This is the newest `chunk_material` job whose `inputData.materialId` matches. It is a smaller shape than `/api/jobs/[id]`.

### Topics

**`GET /api/projects/[projectId]/topics`**
- 200: `{ topics: [{ id, name, description, keywords:string[], orderIndex, userConfirmed, createdAt, unitId, objectives:string[], prerequisiteIds:string[], estimatedMinutes }] }` by `orderIndex`. The UI reads topics through server queries instead (§9).

**`POST /api/projects/[projectId]/topics`** (manual topic)
- Body: `{ name: string(1..255), description?: string, unitId?: string | null }`
- 200: `{ topic: <full Topic row> }`. `userConfirmed` is true, `keywords`, `objectives`, `prerequisiteIds` and `sourceMaterialIds` are `[]`, and there are no `topic_sources`: a hand-added topic is taught from a hybrid search of the course's content files (§9, "Generation context").
- Without `unitId` the topic belongs to no unit and is last in the course. With `unitId` (a unit of this project, else 404 `{error:'Unit not found'}`) it is last in that unit and the course order is renormalised.
- Chunk mappings are created lazily when content is generated.

**`PATCH /api/topics/[topicId]`**
- Body: `{ name?: string.trim.min(1).max(255), description?: string, userConfirmed?: boolean, orderIndex?: int>=0, unitId?: string | null, objectives?: string[](<=8, each 1..300), prerequisiteIds?: string[](<=8), estimatedMinutes?: int(1..600) | null }`
- `orderIndex` is a position among **all** topics in course order; the topic moves there and the others shift, in a transaction. A request with only `orderIndex` changes nothing else (this is what the flat editor sends).
- `unitId` moves the topic to that unit (a unit of the same project, else 404; `null` removes it from its unit). With no `orderIndex` it becomes the last topic of the target unit. **Any request that sets `unitId` also renormalises the course order** (units in `Unit.orderIndex` order, each unit's topics in `orderIndex` order, topics without a unit last), so `{ unitId, orderIndex }` drops a topic into a unit at a position: compute `orderIndex` as the index the topic should have in the canonical list (`canonicalTopicOrder` in `src/lib/topics/units.ts`).
- `prerequisiteIds` must be topics of the same project; the topic itself and unknown ids are dropped, and a link that would make a loop (`A` needs `B` which needs `A`) is a 400 `{ error: 'A topic cannot depend on a topic that depends on it' }`.
- 200: `{ topic }`

**`DELETE /api/topics/[topicId]`** returns `{success:true}` (cascade: content, quiz sets, attempts, `topic_sources`). Other topics stop listing it in `prerequisiteIds`. A unit left with no topics stays (the editor can delete it).

**`POST /api/projects/[projectId]/topics/merge`**
- Body: `{ sourceTopicId: string.min(1), targetTopicId: string.min(1), name?: string.trim.min(1).max(255) }`
- Same ids give 400 `INVALID_INPUT` "Choose two different topics to merge". An unowned topic gives 404.
- Moves chunk mappings, `topic_sources`, content types the target lacks, all quiz sets, quiz attempts, signals, voice sessions and attempts. Progress is OR-ed and the best score kept. The target's review schedule wins. The target keeps its unit; objectives are joined (at most 8), estimated minutes add up (at most 180), prerequisites are joined and every topic that listed the source as a prerequisite now lists the target (a link that would make a loop is dropped). The source is deleted, `orderIndex` is compacted and the course order renormalised so units stay contiguous.
- 200: `{ topic: <target row>, mergedTopicId }`
- The UI sends only `{sourceTopicId, targetTopicId}`.

**`POST /api/projects/[projectId]/topics/confirm`** (no body)
- Sets `userConfirmed=true` on all topics and project `status='active'`, in a transaction.
- 200: `{ project:{id,status}, topicsConfirmed, totalTopics }`
- 409 `CONFLICT` "Cannot confirm topics because none were found".

**`POST /api/projects/[projectId]/extract-topics`** (no body)
- 409 `CONFLICT` if no valid material ("No valid materials found...") or no valid material has chunks yet ("Materials are still being processed...").
- Preflight, then `createJobOrFindActive` with targetKey `extract:{projectId}`.
- Job inputData: `{projectId}`.
- 200: `{ jobId, status:'queued'|'processing', message, estimatedSeconds:45 }`
- An existing active job returns the same body with `message:'Topic extraction already in progress'`.
- Enqueue failure marks the job failed (`ENQUEUE_FAILED` or `ENQUEUE_PERMANENT`) and returns 502 `UPSTREAM_ERROR` "Failed to start topic extraction".
- Job result: `resultData = { topics_extracted (all topics now in the course), new_topics, mode: 'full' | 'incremental', usage }`; the job response is `{ topicsCount }`.
- The job runs the **course planner** (§9): units, topics with objectives, prerequisites and minutes, and the sections each topic is taught from (`topic_sources`). Project `status` becomes `topics_pending` when it wrote new topics.
- Before any topic is confirmed it plans the whole course: a planned topic with the (normalised) name of an unconfirmed one reuses that row, other unconfirmed topics are deleted. Once topics are confirmed it only places the **new** sections (files not yet covered by a confirmed topic's sources): sections can join an existing topic, or become new unconfirmed topics in new units (or in an existing unit) after the existing ones. **Confirmed topics are never renamed, moved, merged or deleted.** With nothing new it changes nothing and finishes with the current topic count.
- Failure `NO_CONTENT_MATERIALS` (permanent, 400): no valid file with text has role `content` or `other`.

**Units** (new; read through server queries, there is no list route)

**`POST /api/projects/[projectId]/units`**
- Body: `{ title: string.trim(1..200), summary?: string(..600) | null, weekLabel?: string(..80) | null, orderIndex?: int>=0 }`; `orderIndex` is the position among units (default last).
- 200: `{ unit: { id, title, summary, weekLabel, orderIndex } }`. 400 INVALID_INPUT, 404 for an unowned project.

**`PATCH /api/units/[unitId]`**
- Body: `{ title?, summary?: string | null, weekLabel?: string | null, orderIndex?: int>=0 }`. Moving a unit moves its topics with it: unit order is compacted and the topics' course order renormalised in the same transaction.
- 200: `{ unit }`. 404 for an unknown or unowned unit.

**`DELETE /api/units/[unitId]`**
- Only an empty unit: 409 CONFLICT "Move or delete the topics in this unit first" otherwise. 200 `{ success: true }`.

### Content (notes, examples, quiz)

**`GET /api/topics/[topicId]/content[?type=<contentType>]`**
- With `type`: `{ content: ContentRow | null }`. Without: `{ content: ContentRow[] }`, newest first.
- `ContentRow = { id, contentType, contentData, metadata, createdAt, updatedAt }`.
- For `topic_quiz`, `contentData` is passed through `toPublicQuestions` (answer key stripped). See §5.

**`POST /api/topics/[topicId]/generate-content`** and **`POST /api/topics/[topicId]/regenerate-content`**
- Body zod, identical except regenerate also allows `variation_seed`:
  ```ts
  { contentType: z.enum(['section_notes','solved_examples','interactive_examples','topic_quiz']),
    preferences?: { detail_level?: 'brief'|'moderate'|'comprehensive', include_examples?: boolean,
      count?: number(1..10), question_count?: number(5..30), difficulty_level?: 'easy'|'medium'|'hard',
      focus?: string.trim.min(3).max(280), question_types?: ('multiple_choice'|'short_answer'|'numerical'|'true_false')[],
      append?: boolean, variation_seed?: number /* regenerate only */,
      prepare_rest?: boolean /* generate only */, only_if_missing?: boolean /* generate only */ } }
  ```
- `prepare_rest`: when this job finishes, the AI service queues the topic's other missing types one job at a time (notes, then examples, practice, quiz). See "Generation chain" below. The topic page sends it, with `only_if_missing`, when a topic with no notes is opened.
- `only_if_missing` (never stored on the job): answers `{ jobId: null, status:'exists', message }` without creating a job when the topic already has content of that type, so a page that renders twice cannot write the notes twice.
- Order of checks: topic ownership (404), then preflight (503), then body (400 `INVALID_INPUT` with `details:[{path,message}]`).
- `createJobOrFindActive`, targetKey `content:{topicId}:{contentType}`. Job inputData: `{topicId, contentType, preferences}`.
- Generate returns `{ jobId, status, message, estimatedSeconds:60, replacingExisting:boolean }`. Regenerate returns the same without `replacingExisting`. Already running gives the same body with `message '...already in progress'`.
- Regenerate injects `variation_seed: Date.now()` and `regeneration:true`. The AI service ignores both.
- The two routes behave essentially the same:
  - Both replace stored content, except `append:true`. The AI-side upsert concatenates arrays only for `solved_examples` and `interactive_examples`.
  - A quiz always inserts a **new** `topic_quizzes` row (a new quiz set) and overwrites the `topic_content` copy.
- Job result: `resultData = { content_id, content_type, metadata, usage }`.

**Generation chain** (`ai-service/app/services/generation_chain.py`)
- Content is written when a student opens a topic, not for the whole course. Opening a topic with no notes starts one notes job (`prepare_rest`). When a job with `prepare_rest` or `prepare_all` finishes, the AI service creates the job for the topic's next missing type (order: notes, solved examples, practice, quiz) before the finished job is marked completed, and dispatches it after. So one job per topic is ever in flight, and the chain keeps going if the browser is closed.
- It stops at the first failed job (the failure shows with its Try again), and when the user's daily allowance is used up. A `prepare_all` run skips a topic that cannot be written at all (no source material, or the model refuses) and goes on to the next.
- Jobs for the same topic also run one at a time inside the AI service (a per-topic lock), and at most `LLM_MAX_CONCURRENCY` (default 4) model calls run at once across all jobs and chat.

**`POST /api/projects/[projectId]/generate-missing-content`** (no body) — "Prepare all topics now"
- Considers only `userConfirmed` topics, in course order (`orderIndex`, then `createdAt`). It starts **one** job: the first type of the first topic that lacks something, with preferences `{ prepare_all: true }`. The AI service chains the rest (see above), so at most one topic is in flight. Nothing starts while the course has any `generate_content` job running.
- 200: `{ status:'queued'|'already_running'|'noop', queuedJobs (0 or 1), topicsToPrepare, message }`; 502 `{ status:'failed', ... }` when the job could not be enqueued.
- It returns **no job ids**. The client discovers them via `GET /api/jobs?active=1&projectId=...&types=generate_content`.
- The UI calls it only from the course "..." menu item "Prepare all topics now", after a confirmation with an estimate ("about N topics ... a large part of today's AI allowance"). The overview, topics list and setup guide have no other bulk action.

**`GET /api/projects/[projectId]/generation-failures`**
- 200: `{ failures: [{ jobId, topicId, topicName, contentType, errorCode, message }] }`
- Looks at the latest 600 `generate_content` jobs per `targetKey`. A failure is reported only if that latest job failed and the content is still missing. A later retry in progress or a success clears it. `message` comes from `describeJobFailure`.
- Retry means `POST generate-content {contentType}`.

### Progress, quiz, confidence

**`GET /api/topics/[topicId]/progress`**
- 200: `{ progress: TopicProgressRow | { notesCompleted:false, examplesCompleted:false, quizCompleted:false, quizScore:null } }`. The row has `id, userId, topicId, notesCompleted, examplesCompleted, quizCompleted, quizScore, lastAccessedAt`.
- No UI calls this. The UI gets progress from server props.

**`POST /api/topics/[topicId]/progress`**
- Body: `{ notesCompleted?: boolean, examplesCompleted?: boolean, quizCompleted?: boolean, quizScore?: number(0..100) }`
- Upsert. The client can set `quizScore` and `quizCompleted` directly, with no check against attempts.
- 200: `{ progress }`. The UI sends only `notesCompleted:true` or `examplesCompleted:true`.

**`POST /api/topics/[topicId]/quiz-attempts`**
- Body: `{ answers: Record<string,string(<=5000)>, quizSetId?: string }`. `answers` is keyed by question index as a string. Any other field is dropped.
- Omitting `quizSetId` grades the "legacy" quiz, which is the `topic_content` `topic_quiz` copy (the latest set). The UI sends `undefined` only when the id is the synthetic `'legacy'`.
- The server loads the key and grades via AI-service `POST /grade/quiz`. Rule-based for MC, TF and numerical. Claude fast tier for `short_answer`. Timeout 90 s.
- Guards:
  - 429 `{error:'Too many quiz submissions...'}` with `Retry-After`
  - 404 `{error:'Quiz not found'}`
  - 503 `{error: msg}` when grading is unavailable. If any short answer could not be graded, the attempt is NOT saved: `"Some short answers could not be graded just now. Your answers were not saved. Please submit again."`
- Side effects: creates the QuizAttempt, upserts progress (`quizCompleted` true, `quizScore` set to the best), writes a `LearningSignal` (source `'quiz'`, score 0..1), recomputes mastery, and upserts the ReviewSchedule (`wasCorrect = score >= 70`).
- 200:
  ```json
  { "attempt": { "id", "score", "takenAt" }, "bestScore": 0-100, "score": 0-100,
    "earnedPoints": n, "totalPoints": n,
    "review": [ { "questionIndex", "isCorrect", "pointsEarned", "pointsPossible",
                  "correctAnswer": "string", "explanation": "string", "feedback": "string|null" } ] }
  ```
- `feedback` is stored for short answers only. `correctAnswer` is the sample answer for short answers, `'True'`/`'False'` for TF, and `"{value} {unit}"` for numerical.

**`GET /api/topics/[topicId]/quiz-attempts[?quizSetId=<id>|legacy]`**
- 200:
  ```json
  { "attempts": [ { "id", "score", "takenAt", "quizSetId": "string|null",
                    "answers": {..}, "results": { "<idx>": { "isCorrect", "pointsEarned", "pointsPossible", "feedback?" } },
                    "review": "QuizReviewItem[] (first 5 attempts only) | null" } ],
    "stats": { "totalAttempts", "bestScore", "latestScore", "averageScore" } }
  ```
- Newest first. The stats are null when there are no attempts. Older `results` values may be plain booleans; `buildReview` tolerates both.

**`POST /api/topics/[topicId]/confidence`**
- Body: `{ source: 'quiz'|'voice'|'exam', value: int(1..5) }`
- 200: `{ success:true, confidence, mastery:0..1, nextReviewAt: ISO|null }`
- Attaches the rating to the latest real signal of that source. A rating of 1-2 pulls the review forward to tomorrow. It never changes the streak.
- **No UI calls this route.**

### Exams

**`POST /api/projects/[projectId]/generate-exam`**
- Zod:
  ```ts
  { topicIds: string[].min(1), totalQuestions: number(5..100), durationMinutes: number(15..300),
    difficultyLevel: 'easy'|'medium'|'hard',
    questionTypeDistribution?: { multiple_choice:0..100, short_answer:0..100, numerical:0..100 } /* must sum to 100 */ }
  ```
- The default distribution is `{multiple_choice:60, short_answer:30, numerical:10}`.
- Topics must belong to the project, else 400 `{error:'Some topics not found or do not belong to this project'}` (A-shape).
- There is no `targetKey`. Idempotency is by `inputData.idempotencyKey = projectId:sortedTopicIds:stableJSON(config)` against active jobs.
- 200: `{ jobId, status, message, estimatedSeconds:90 }`
- Job result: `resultData = { exam_id, total_questions, topics_covered, usage }`. The client navigates to `/exams/{exam_id}`.
- The exam generator only draws from the 3 distribution types. It never produces `true_false` (the API enum doesn't allow it).
- Exam name is `"Sample Exam - YYYY-MM-DD"`.

**`GET /api/projects/[projectId]/exams`**
- 200: `{ exams: [{ id, name, durationMinutes, difficultyLevel, topicsCovered, createdAt, _count:{submissions}, attemptsCount, lastAttempt?, lastScore: number|null }] }`
- Counts only `status='submitted'`. **No UI calls this**; the project page reads Prisma server-side.

**`GET /api/exams/[examId]`**
- 200: `{ exam: { id, projectId, name, durationMinutes, difficultyLevel, topicsCovered, createdAt, questions: PublicQuizQuestion[], project:{id,name} } }`
- No UI calls this.

**`/api/exams/[examId]/attempt`**
- `GET` returns `{ attempt: AttemptView|null, submitted?: { submissionId, jobId } }`.
  - An in-progress attempt past its deadline plus the 15 s grace is auto-finalized here, and `submitted` is returned.
  - `AttemptView = { id, startedAt, deadlineAt, remainingSeconds, serverNow, answers: Record<string, string|number|boolean|null> }`.
- `POST` starts the attempt, or returns the one already in progress. It returns `{ attempt: AttemptView }`. The duration is the exam's `durationMinutes`. The server stamps `startedAt` and `deadlineAt`.
- `PUT` autosaves. Body: `{ answers: object }`.
  - `sanitizeAnswers` keeps only keys matching `/^\d{1,4}$/` below the question count, with primitive values, strings capped at 20,000 chars.
  - 200: `{ savedAt, remainingSeconds }`.
  - 409 B-shape with `details.code = 'ATTEMPT_CLOSED'` if no in-progress attempt exists or it was already submitted.
  - 409 B-shape with `details = {code:'ATTEMPT_EXPIRED', submissionId}` if past deadline plus grace. The server auto-submits the saved answers and starts grading.
  - 400 `INVALID_INPUT` "answers must be an object".
- A partial unique index allows at most one `in_progress` attempt per user and exam.

**`POST /api/exams/[examId]/submit`**
- Body is optional: `{ answers? }`. The answers are used only within the deadline plus grace. Otherwise the last autosave is graded.
- Preflight runs only if the attempt is not already expired. A late submit is never blocked by a health check.
- 409 `CONFLICT` with `details.code='ATTEMPT_CLOSED'` if nothing is in progress.
- 200: `{ submissionId, jobId, status:'queued', usedSubmittedAnswers, message, estimatedSeconds:90 }`
- 502 **A-shape** `{ error: 'Your exam was submitted, but grading could not start. Open the results and choose Grade again.', submissionId }`. Here the submission exists. The UI checks `status===502 && data.submissionId`.
- Side effect: creates a `grade_exam` job with targetKey `grade:{submissionId}`.

**`GET /api/exams/[examId]/submissions`**
- 200: `{ submissions: [{ id, submittedAt, gradedAt, score: number|null, isPending: boolean }], stats: null | { bestScore, latestScore, averageScore, totalAttempts } }`
- `isPending = !aiGrading`. After a regrade the old grading stays, so it is not pending. A grading that failed permanently also looks "pending" forever here.

**`GET /api/exams/[examId]/submissions/[submissionId]`** (the results route, and the only place the exam answer key is released)
- Only for `status='submitted'`; an in-progress attempt gives 404.
- While grading, or when grading failed:
  ```json
  { "submission": { "id", "examId", "examName", "projectId", "submittedAt", "gradedAt",
      "gradingJob": { "id", "status", "errorCode", "errorMessage" } | null,
      "status": "grading"|"failed", "score": null, "earnedPoints": null, "totalPoints": null,
      "questions": [], "topics": [] } }
  ```
- When graded:
  ```ts
  status:'graded', score, earnedPoints, totalPoints, needsReviewCount,
  questions: ExamQuestionResult[], topics: (WeakTopic & {linkable:boolean})[]
  ExamQuestionResult = { questionIndex, questionType, questionText, topicId|null, topicName|null,
     studentAnswer: string|null, correctAnswer: string, points, pointsEarned, isCorrect,
     feedback: string|null, needsReview: boolean }
  WeakTopic = { topicId|null, topicName, pointsEarned, pointsPossible, percent /*0..100, 1 decimal*/ }
  ```
- Topics are sorted weakest first. `linkable` is false when the topic was merged or deleted.

**`POST /api/exams/[examId]/submissions/[submissionId]/regrade`**
- Preflight, then `startGrading` (reuses an active job via the same targetKey).
- 200: `{ submissionId, jobId, status:'queued' }`. 502 `UPSTREAM_ERROR` if it can't start.
- The old results stay until the new grading completes. The grading job replaces that submission's exam `LearningSignal`s.

### Jobs

**`GET /api/jobs?active=1[&projectId=][&types=a,b]`**
- `active=1` is required, otherwise 400 `INVALID_INPUT` "Only active=1 is supported".
- Returns pending and processing jobs for the user, oldest first, max 100.
- 200: `{ jobs: Job[] }`.

**`GET /api/jobs/[jobId]`** returns `Job` directly, not wrapped. 404 B-shape if it isn't yours.

`Job` (`JOB_STATUS_SELECT`, with `inputData` deliberately omitted):
```ts
{ id, projectId, jobType, status:'pending'|'processing'|'completed'|'failed',
  stage: string|null /* falls back to a per-type default */, progressPercent:number, retryable:boolean,
  errorCode:string|null, errorMessage:string|null, attemptCount:number, resultData:object|null,
  targetKey:string|null, createdAt, startedAt:string|null, completedAt:string|null }
```

### Chat

**`POST /api/projects/[projectId]/chat`** (NDJSON stream)
- Body zod:
  ```ts
  { question: z.string().trim().min(1,'Ask a question').max(2000), threadId?: uuid, topicId?: uuid }
  ```
- Pre-stream checks, all JSON errors:
  - 401
  - 429 `RATE_LIMITED` with `details {code:'RATE_LIMITED', retryable:true}` and `Retry-After`
  - 400 `INVALID_INPUT`
  - 404 project, topic or "Conversation not found"
  - AI service errors, mapped to B-shape `{error:{code: 'RATE_LIMITED' for LLM_DAILY_BUDGET else 'UPSTREAM_ERROR', message: friendly, details:{code, retryable}}}`. The HTTP status comes from the `chatErrorMessage` table in `FE/lib/chat/errors.ts`:

    | Code | Status |
    |---|---|
    | `LLM_DAILY_BUDGET` | 429 |
    | `LLM_NOT_CONFIGURED`, `LLM_AUTH_FAILED`, `LLM_CREDIT_EXHAUSTED`, `LLM_RATE_LIMITED`, `LLM_UNAVAILABLE`, `RETRIEVAL_FAILED`, `CHAT_UNAVAILABLE` | 503 |
    | `LLM_REQUEST_REJECTED`, `LLM_REFUSED`, `LLM_BAD_OUTPUT`, `CHAT_INTERRUPTED`, `CHAT_FAILED` | 502 |
    | `PROJECT_NOT_FOUND` | 404 |
    | `CHAT_NOT_SAVED` | 500 |

    A refused question stores nothing.
  - 500 `INTERNAL_ERROR` "Could not save your question. Try again."
- Success: `200`, `Content-Type: application/x-ndjson; charset=utf-8`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`. One JSON object per line. **Event types**, as the browser sees them (`FE/lib/chat/events.ts`):
  1. `{type:'thread', threadId, title:string|null, isNew:boolean}`
  2. `{type:'user_message', id}`
  3. `{type:'retrieved', count:number}`
  4. `{type:'text', delta:string}` (many)
  5. `{type:'citation', marker:number, offset:number, source}` (during the stream; the source is **snake_case**)
  6. `{type:'reset'}` (a fallback model took over; discard text, marks and sources)
  7. `{type:'done', text, sources:Source[], marks:{offset,marker}[], retrieved:number, stop_reason:string}`. `usage` is stripped. Sources are snake_case:
     `Source = { marker, chunk_id, material_id, filename, page_start|null, page_end|null, section|null, cited_text }`.
     `stop_reason` is `'no_sources'` when retrieval found nothing. That case has no LLM call and no cost.
  8. `{type:'saved', messageId}` after the DB write
  9. `{type:'error', code, message, retryable}`. The message is always the friendly text. Raw AI-service text is never forwarded.
- Event order is `thread`, `user_message`, `retrieved`, `text`/`citation`/`reset` (interleaved), then `done`, then `saved` (or an `error` with `CHAT_NOT_SAVED` after `done`). Errors can occur at any point. If the stream ends with no `done` or `error`, the client should treat it as `CHAT_INTERRUPTED`.
- The client normalizes snake_case to camelCase through `parseSource`/`parseChatEvent` (`FE/lib/chat/citations.ts`): `ChatSource = {marker, chunkId, materialId, filename, pageStart, pageEnd, section, citedText}`.
- The relay keeps consuming and stores the answer even if the browser disconnects.
- Side effects: creates the thread if needed (title is the first question cut to 80 chars) and the user message. On `done` it creates an assistant `ChatMessage` plus an `LlmUsageEvent` ledger row and bumps `thread.updatedAt`. On a billed failure it stores a message with role `'error'` plus a ledger row. On an unbilled failure it deletes the user message (and the thread, if new).
- Server history: the last 12 messages in the DB are fetched, and the last 6 user/assistant turns are sent. `topicId` boosts that topic's chunks in retrieval but does not exclude others.
- LLM details: top-K 12, min similarity 0.5, model tier `main`, effort `low`, max_tokens 4000. If nothing clears the similarity floor there is no LLM call. The model answers with Claude's citations feature.

**`GET /api/projects/[projectId]/chat/threads`**
- 200: `{ threads: [{ id, title:string|null, createdAt, updatedAt }] }` (max 100, newest activity first).

**`POST /api/projects/[projectId]/chat/threads`**
- Body: `{ title?: string.trim.min(1).max(80) }`. Returns 201 `{ thread:{id,title,createdAt,updatedAt} }`.
- No UI calls this; threads are created implicitly by the first chat POST.

**`GET /api/projects/[projectId]/chat/threads/[threadId]`**
- 200:
  ```json
  { "thread": { "id", "title" },
    "messages": [ { "id", "role": "user"|"assistant"|"error", "content", "citations": { "sources": ChatSource[] /*camelCase*/, "marks": [{"offset","marker"}] } | null, "createdAt" } ] }
  ```
- `citations` is null for non-assistant messages. Role `'error'` is not in the schema comment but does occur: it is a billed-failure note.

**`DELETE .../threads/[threadId]`** returns `{success:true}`.

### Planner and health

**`GET /api/projects/[projectId]/next-actions`**
- 200: `{ generatedAt, actions: NextAction[] }`, max 8, ascending `priority`.
- `NextAction = { id, type: 'upload_materials'|'extract_topics'|'confirm_topics'|'study_topic'|'review_topic'|'take_quiz'|'voice_drill'|'generate_content'|'take_exam', topicId:string|null, title, reason, priority:number, etaMinutes }`.
- Gating, in order:
  - No materials gives a single `upload_materials` action.
  - No topics gives a single `extract_topics` action.
  - `project.status==='topics_pending'` or any unconfirmed topic gives a single `confirm_topics` action.
- Otherwise it builds, in order:
  - active-generation action (priority -1)
  - review due (0)
  - generate missing (1)
  - study (2)
  - quiz for topics below 70 (3)
  - voice drill for topics with mastery below 0.6 (4)
  - take_exam if exams exist (5)
  - generate-exam fallback (5)
- Batch ids contain `-batch`. The active-generation action's id ends in `-batch-active`.
- Stale jobs (older than 6 min, or pending and unstarted for over 90 s) are ignored.

**`GET /api/projects/[projectId]/study-plan[?date=YYYY-MM-DD&tz=IANA]`**
- Defaults: today in `tz` (`UTC` if `tz` is missing), start 09:00 local. Items are laid out back-to-back with 5-minute gaps.
- 200: `{ date, timeZone, generatedAt, plan: (NextAction & { startAt:ISO, endAt:ISO })[] }`
- 400 `INVALID_INPUT` for a bad tz or date format.
- No UI calls this. `studyPlanUrl()` exists but is unused.

**`GET /api/projects/[projectId]/health`**
- 200:
  ```json
  { "generatedAt", "readiness": "ready"|"needs_materials"|"needs_topic_confirmation"|"in_progress",
    "blockers": ["No validated materials"|"Topics not confirmed"|"No fully generated learning content"|"Voice drill has no conceptual questions"],
    "metrics": { "materials": {"total","valid","invalid","pending"},
                 "topics": {"total","confirmed","withAllCoreContent","quizCompleted","averageQuizScore"},
                 "voice": {"ready","conceptualQuestionCount","topicsWithNotes"} } }
  ```
- No UI calls this.

**`GET /api/health/runtime`** (public, no auth)
- 200: `{ status:'healthy'|'degraded'|'unhealthy', environment, appEnvironment, checks:[{name,status:'pass'|'warn'|'fail',message}], generatedAt }`
- Covers AI-service reachability, storage mode, Cloud Tasks and NextAuth secret. No UI uses it.

### Voice routes (see §7 for the flow)
- `GET /api/voice/usage`
- `POST /api/voice/session`, `PATCH /api/voice/session`
- `POST /api/voice/realtime-token`
- `POST /api/voice/metrics`
- `POST /api/voice/tools/execute`
- `GET /api/voice/drill-pack`

---

## 3. Job model

**Job types** (the `jobType` column, with the AI endpoint, default stage and lease): 

| jobType | AI endpoint | Created by | Lease |
|---|---|---|---|
| `validate_material` | `/jobs/validate-material` | upload route | 120 s |
| `chunk_material` | `/jobs/chunk-material` | **AI service**, after a valid validation | 300 s |
| `extract_topics` | `/jobs/extract-topics` | extract-topics route, or the AI service after the last chunk | 300 s |
| `generate_content` | `/jobs/generate-content` | generate, regenerate and generate-missing routes | 300 s |
| `generate_exam` | `/jobs/generate-exam` | generate-exam route | 600 s |
| `grade_exam` | `/jobs/grade-exam` | submit and regrade routes | 300 s |

**Statuses:** `pending | processing | completed | failed`. The UI also maps these to `queued/processing/completed/failed`; `normalizeStatus` turns anything else into `queued`.

**Stages:**
- `validating`, `chunking`, `embedding` (set at 40% by the chunk job), `extracting`, `generating`, `saving` (set at 80% by content jobs), `grading`.
- The schema comment omits `embedding` and `saving`.
- When `stage` is null the API falls back per job type.

**Progress is coarse.**
- Claim sets it to 10. Completion sets it to 100.
- Only `chunk_material` (40) and `generate_content` (80) report anything in between.
- Validation, extraction, exam generation and grading sit at 10 until they finish.

**Reliability fields:**
- `attemptCount`/`maxAttempts` (3), `leaseUntil`, `dispatchCount`, `llmCostUsd`/tokens.
- `retryable` is recomputed on failure as `retryable && attempt_count < max_attempts`.
- A job is claimed with an atomic UPDATE. A duplicate delivery gets 200 `{status:'skipped'}`.
- The reaper (every 60 s) fails exhausted processing jobs with `JOB_LEASE_EXPIRED` and re-dispatches stale ones.
- Pending-never-claimed jobs are re-dispatched after 120 s, 240 s and 360 s, then failed with `JOB_DISPATCH_FAILED`.
- Direct-HTTP dev dispatch (no Cloud Tasks) uses 3 retries with backoff. After the final failure it marks the job `ENQUEUE_FAILED` or `ENQUEUE_PERMANENT`.
- Rate limits and overload are transient: `LLM_RATE_LIMITED` and `LLM_UNAVAILABLE` (429, 529, 5xx from Anthropic after the SDK's own `LLM_MAX_RETRIES` = 4 retries) answer **503** with a `Retry-After` header (the API's own wait, else 20 s for a rate limit and 10 s for overload; at most 120 s). The job fails with `retryable = true` while attempts remain, and the direct dispatchers (frontend `cloud-tasks.ts`, AI service `cloud_tasks.py`) wait at least `Retry-After` before the next attempt. Other retryable failures answer 500, permanent ones 400.
- If `DIRECT_INLINE_JOB_TYPES` is set, those enqueues block the request until the job finishes.

**One active job per target** (partial unique index on `targetKey` for pending/processing). Creators return the existing job with `created:false`:
- `extract:{projectId}`
- `content:{topicId}:{contentType}`
- `grade:{submissionId}`
- `chunk:{materialId}`

`generate_exam` has no `targetKey`; it uses the idempotency key in `inputData`.

**How the client finds and follows jobs**
1. Every creating route returns `jobId` (or `jobId:null` for a no-op in `finalize`).
2. Poll `GET /api/jobs/[id]` (`pollJobUntilDone`, `FE/lib/jobs/poll-job.ts`):
   - backoff 1 s to 10 s, factor 1.5, jitter up to 15% (capped at 500 ms)
   - resets to 1 s on any change in status, stage or progress
   - pauses while the tab is hidden, and hidden time doesn't count toward the timeout
   - default timeout 120 s of visible time; the UI uses 90 s for upload jobs, 120 s for extract, 180 s for content, and 300 s for exams, grading and failures
   - on timeout returns `state:'timeout'` with the message `"This is taking longer than expected. It is still running in the background, so check back in a few minutes."` The job keeps running.
   - on 5xx or 429 it backs off. Any other non-OK status ends the poll as `failed`, with the raw response text as `error`.
3. After a refresh, call `GET /api/jobs?active=1&projectId=&types=` and re-poll each id. The `targetKey` is the way to match jobs to topics (`content:{topicId}:` prefix) and submissions (`grade:{id}`).

**`resultData` shapes** (always includes `usage:{calls, models[], input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens, estimated_cost_usd|null}` when LLM calls ran):
- `validate_material`: `{validation_status:'valid'|'invalid', notes}`
- `chunk_material`: `{chunks_created}`
- `extract_topics`: `{topics_extracted, new_topics, mode}`
- `generate_content`: `{content_id, content_type, metadata}`
- `generate_exam`: `{exam_id, total_questions, topics_covered}`
- `grade_exam`: `{submission_id, overall_score, earned_points, total_points}`

**Error codes the UI must handle** (`FE/lib/jobs/failure-message.ts` has user-safe text; the raw `errorMessage` is for logs):
- `NO_SOURCE_MATERIAL`
- `LLM_RATE_LIMITED`, `LLM_UNAVAILABLE`, `LLM_CREDIT_EXHAUSTED`
- `LLM_AUTH_FAILED`, `LLM_NOT_CONFIGURED`
- `LLM_BAD_OUTPUT` (retryable)
- `LLM_REFUSED` (not retryable by the model; the UI text says "Retrying may help")
- `LLM_REQUEST_REJECTED`
- `ENQUEUE_FAILED`, `ENQUEUE_PERMANENT`, `JOB_DISPATCH_FAILED`
- `STORAGE_UNAVAILABLE`
- **`LLM_DAILY_BUDGET`**: its `errorMessage` ("Daily AI usage limit reached ($X of $Y used today, UTC). ...") is for logs and admins and is never shown. Screens show "You've used today's AI allowance. It resets at <local time>." for the code (the reset time is midnight UTC shown in the browser's time zone; see `frontend/src/lib/budget/copy.ts`). No dollar amount reaches student-facing UI. The default cap is `DAILY_LLM_BUDGET_USD = 3.00` per user per UTC day, and **`GLOBAL_DAILY_LLM_BUDGET_USD = 40.00` for all users together** (same ledger, same code, same student-facing copy; 0 turns either off). Margins has open sign-up and a shared API key, so the global cap is the ceiling on the day's bill: when everyone together has spent it, no job, chat answer or voice turn starts for anyone until midnight UTC, and the AI service logs one `GLOBAL daily LLM budget reached` warning (with both figures) at most once a minute. The error message differs in the logs and `errorMessage` ("...for the whole service...") but the code is the same `LLM_DAILY_BUDGET`, so students see the usual allowance message. The caps cover jobs, chat answers and voice turns. They are checked before each LLM job and before a chat answer starts, so one call can end up slightly over.
- **`NO_CONTENT_MATERIALS`** (extract_topics, permanent): every valid file is a syllabus or a past exam, so there was nothing to plan. `describeJobFailure` has user-safe text for it.
- Others that can appear: `MATERIAL_NOT_FOUND`, `VALIDATION_FAILED`, `NO_CONTENT` (also sets the material `invalid`), `CHUNKING_FAILED`, `TOPIC_EXTRACTION_FAILED`, `CONTENT_GENERATION_FAILED`, `EXAM_GENERATION_FAILED`, `EXAM_GRADING_FAILED`, `SUBMISSION_NOT_FOUND`, `INVALID_INPUT`, `JOB_LEASE_EXPIRED`, `JOB_FAILED`.
- `describeJobFailure(code, msg)` returns the text, with the fallback `"Generation failed. Try again."`
- "LLM not configured" has two surfaces:
  - **before** a job: preflight 503 `UPSTREAM_ERROR` (`message` mentions ANTHROPIC_API_KEY)
  - **inside** a job: `errorCode LLM_NOT_CONFIGURED`
- Refusals: `LLM_REFUSED` on jobs and chat.
- There is no browser-callable "retry job" endpoint.
- Retry equals re-calling the creating route:
  - re-run `generate-content` (or `generate-missing-content`)
  - re-run `extract-topics`
  - `regrade`
  - re-upload (there is no retry for a failed validation)
- A failed upload enqueue deletes the material, so a retry starts clean.
- A `validate_material` or `chunk_material` failure leaves the Material `pending` indefinitely. The only recovery is delete and re-upload.

---

## 4. Domain model (`frontend/prisma/schema.prisma`)

- **User:** `id, email (unique), passwordHash?, oauthProvider?, oauthId?, name?`.
- **Project:** `id, userId, name, description?, status: setup|topics_pending|active|completed`.
  - `setup` goes to `topics_pending` when an extraction job finishes, then to `active` on `topics/confirm`.
  - `completed` is never set by code; only PATCH can set it.
- **Material:**
  - `category: lecture_notes|sample_exams|book_chapters|syllabus`
  - `role: content|syllabus|exam|other` (default `content`): what the file is for (§9, "Material roles")
  - `filename, gcsPath, sizeBytes (BigInt)`
  - `validationStatus: pending|valid|invalid`, `validationNotes?`, `metadata {mimeType, extension}`, `uploadedAt, validatedAt?`
  - `MaterialChunk`: text, `vector(384)` embedding, generated `tsvector`, `sectionHierarchy`, `pageStart/End`, `chunkIndex`, `tokenCount`.
- **Unit** (new): `id, projectId, title, summary?, orderIndex, weekLabel?, createdAt`; index `(projectId, orderIndex)`; deleting a unit sets its topics' `unitId` to null.
- **TopicSource** (new): `id, topicId, materialId, pageStart?, pageEnd?, chunkIndexStart, chunkIndexEnd, role: primary|supporting`. The planner writes one `primary` row per planned section: a contiguous range of one file's chunks. Cascades with the topic and the material.
- **Topic:** `name, description?, keywords[], orderIndex, sourceMaterialIds[], userConfirmed`, plus (new) `unitId?`, `objectives[]`, `prerequisiteIds[]`, `estimatedMinutes?`.
  - There is **no `Topic.status` field**. The only state is `userConfirmed`, plus the project status.
  - `TopicChunkMapping(topicId, chunkId, relevanceScore, relevanceSource: keyword_match|semantic_search|llm_validated)`.
  - Flow: extract (an AI job creates topics with `userConfirmed=false`), review, then confirm. During review the student can rename, reorder (up/down via `orderIndex`), merge, delete, add manually (auto-confirmed) and re-extract. `topics/confirm` confirms all topics. Re-extract deletes unconfirmed leftovers but keeps confirmed topics.
- **TopicContent:** unique per `(topicId, contentType)`.
  - `contentType: section_notes | solved_examples | interactive_examples | topic_quiz`.
  - `contentData` JSON, `metadata?` JSON. See §5 for shapes.
- **TopicQuiz:** a quiz set, `id, topicId, questions JSON, createdAt`. Each quiz generation inserts a new row.
  - No API route lists quiz sets or exposes `quizSetId`. The UI reads them server-side from Prisma on the topic page.
  - The latest set's id is in `TopicContent.metadata.quiz_set_id`.
- **TopicProgress:** unique per `(topicId, userId)`: `notesCompleted, examplesCompleted, quizCompleted, quizScore (best %, nullable), lastAccessedAt`.
- **QuizAttempt:** `userId, topicId, quizSetId?, answers {idx: string}, results {idx: {isCorrect, pointsEarned, pointsPossible, feedback?}}, score (0-100), takenAt`.
- **LearningSignal:** `userId, projectId, topicId?, source: quiz|voice|exam, score (0..1), confidence? (1..5), metadata`.
- **ReviewSchedule:** unique per `(userId, topicId)`: `mastery, dueAt, intervalDays, streak, lastReviewedAt`.
  - Interval by mastery: >=0.8 gives 14 days, >=0.6 gives 7, >=0.4 gives 3, otherwise 1. A wrong answer gives 1. Confidence of 4 or more bumps the interval one tier.
- **Mastery** (`FE/lib/learning/mastery-math.ts`):
  - It blends the last 5 quiz scores, 20 voice scores and 20 exam question scores (all 0..1).
  - Weights are 0.55, 0.25 and 0.2, renormalized over the sources that have data.
  - A recency penalty up to 0.25 grows linearly over 14 days since the last practice.
  - **No API returns mastery directly.** It surfaces only via `confidence` and inside the planner.
- **OverallQuiz and OverallQuizAttempt:** present in the schema, **unused anywhere** (dead).
- **SampleExam:** `projectId, name, questions JSON[], durationMinutes, difficultyLevel, topicsCovered[] (topic names)`.
  - Exam questions carry `topic_id` and `topic_name`.
- **ExamSubmission:** each row is one attempt.
  - `status: in_progress|submitted`, `startedAt, deadlineAt, answersSavedAt, submittedAt (placeholder until submitted)`.
  - `answers`, `aiGrading {submission_id, graded_questions[], total_points, earned_points, overall_score, graded_at}`, `aiFeedback {overall_score, earned_points, total_points}`, `gradedAt`.
  - Each `graded_questions[]` item carries `question_index, question_text, question_type, points_possible, points_earned, is_correct, student_answer, feedback, needs_review, correct_answer`.
- **ProcessingJob:** see §3. `inputData` can hold exam answers and is never returned.
- **ChatThread/ChatMessage:**
  - `role` is `user|assistant|error` in practice.
  - `citations: {sources, marks}` for assistant messages.
  - Token and cost columns are for display.
- **LlmUsageEvent:** an append-only budget ledger with no FKs on `projectId` or `sourceId`. `source: job|chat`.
- **VoiceDrillSession:** `mode` (`topic_drill|sprint`; `teach_back` appears in the schema comment but is not accepted), `language, voice, status: active|ended|aborted, interruptCount, lastDetectedLanguage, questionSet JSON, metrics {entries[], last, total}, connectedAt, lastSeenAt, endedAt`.
- **VoiceDrillAttempt:** `sessionId, questionIndex (unique per session), questionType, questionText, expectedAnswer {key_points, sample_answer}, userAnswer, isCorrect, score (0..1), feedback {comment, explanation, ungraded?}, timing {received_at}`.

---

## 5. `contentData` shapes as the API returns them

All text fields are markdown, with LaTeX math (`$..$` and `$$..$$`) and fenced code blocks with language tags.

**`section_notes`**
- `contentData`: a single markdown **string** (not sectioned JSON). New notes are a lesson: `# Topic`, `## What you'll learn` (the topic's objectives as "You can ..." bullets), `## The idea`, `## Key concepts`, `## Worked example` (one, from the source; left out when `include_examples` is false), `## Check yourself`, `## Common pitfalls`, `## Summary` (5-8 recall bullets). About 400-1500 words depending on `detail_level`. **Old notes** use `## Overview`, `## Key Concepts`, `## How It Works`, `## Common Pitfalls`, `## Exam-Ready Recap` and must keep rendering.
- ` ```check ` blocks. Under "Check yourself" each quick question is a fenced block whose info string is `check`: first line `Q: <question>`, next line `A: <answer>`; math is allowed in both lines. The renderer shows the question with a "Show answer" reveal. The AI service's post-processor normalises the fence (` ``` Check `, ` ```CHECK `) and wraps loose `Q:`/`A:` pairs under "Check yourself" into blocks, but a stored note can still hold a malformed block: show an unparseable ` ```check ` block as an ordinary code block. Until the renderer exists, a check block shows as a plain code block with the question and the answer.
- `metadata`: `{ chunk_count:number, citations: [{ filename, category, pages:"4"|"4-5"|"n/a", material_id?:string|null, page?:number|null }] }`. For a topic with sources, citations are its **primary spans**: one per file, `pages` from the first to the last page of that file's primary chunks, `page` the first page. For a hand-added topic they are the pages of the file's most relevant chunk, as before. Older notes lack `material_id` and `page`.
- The UI strips leftover `[Citation: ...]` and "If you want, I can..." lines, and promotes bare headings.

**`solved_examples`**
- `contentData`: array of
  ```ts
  { title, problem_statement, solution_steps: [{ step_number, description, work, explanation }],
    final_answer /* 2-5 markdown bullets */, key_concepts: string[], difficulty?: 'easy'|'medium'|'hard',
    sources: [{ material_id, filename, page_start: number | null, page_end: number | null }] /* new; [] when unknown; absent in old content */ }
  ```
- `metadata`: `{ example_type:'solved', difficulty_level, count }`. Appending (`append:true`) concatenates arrays and updates `count`.

**`interactive_examples`**
- `contentData`: array of
  ```ts
  { title, problem_statement,
    steps: [{ step_number, question, hint, answer_type:'numeric'|'text'|'multiple_choice',
              options?: [{ id:'A'.., text }]   /* multiple_choice: ALWAYS present with 2-5 entries in new content */,
              correct_answer: string, acceptable_answers: string[],
              tolerance?: number               /* numeric only: accepted absolute difference */,
              explanation, feedback_correct, feedback_incorrect }],
    key_concepts: string[], difficulty?: string, estimated_time_minutes: number,
    sources: [{ material_id, filename, page_start, page_end }] }
  ```
- **Field changes for the UI:** `options` is new. A `multiple_choice` step is only stored with 2 to 5 options (options the model wrote into the question as `A) ...` lines are moved into `options`; a problem with a multiple_choice step that has none is dropped by the generator and the job retries). `correct_answer` is the id of one option. Options are shuffled when stored, and letter references in `explanation` and the feedback follow the shuffle. Show `options` when present; **content written before this change has no `options`** and its options are lines of the question text (`splitChoices` in `practice-check.ts` still handles that). `tolerance` is new and optional; the checker uses it as an absolute tolerance, else 1% relative.
- The answers are **not stripped**. Checking happens client-side (`checkPracticeAnswer` in `practice-check.ts`: normalised text, numeric equivalence of fractions, decimals, percents and thousands separators, simple algebra by comparing at several points, and accepted-answer lists; see its header comment).
- `metadata`: `{ example_type:'interactive', difficulty_level, count }`.

**`topic_quiz`**
- Stored (server only): array of full question dicts:
  - `question_type: 'multiple_choice'|'short_answer'|'numerical'|'true_false'`, `question_text`, `explanation`, `points (1-5)`, `concepts_tested[]`, `difficulty?`
  - MC: `options:[{id:'A'..'D',text}]`, `correct_answer: 'A'`
  - every question: `sources: [{ material_id, filename, page_start, page_end }]` (new; where in the files it is based on; `[]` when unknown; absent in old quizzes). Never sent before the quiz is submitted (it hints at where the answer is), so it is not in the public shape; the graded **review** items carry it (`QuizReviewItem.sources`), and so do exam question results (`ExamQuestionResult.sources`) and `aiGrading.graded_questions[].sources`.
  - TF: `correct_answer: boolean`
  - numerical: `correct_answer: number`, `unit?`, `tolerance?`
  - short_answer: `sample_answer`, `key_points[]`
  - MC options are shuffled and relabeled A-D at generation time.
- Public (every API response and page prop, via `toPublicContentData`/`toPublicQuestions`): an **array** of
  ```ts
  { question_type, question_text, options?: [{id,text}], unit?, points, difficulty?, concepts_tested?, topic_id?, topic_name? }
  ```
  `correct_answer`, `explanation`, `sample_answer`, `key_points` and `tolerance` are removed.
- `metadata`: `{ total_questions, difficulty_level, question_types:string[], quiz_set_id }`.
- A quiz needs at least `max(1, (requested+1)//2)` valid questions, otherwise the job fails with `LLM_BAD_OUTPUT`.
- Quiz and exam prompts ask for at least half application questions with numbers and scenarios different from the excerpts and from what the topic's notes, examples, practice and earlier quizzes already show (their worked example and problem statements are passed to the generator as a "do not reuse" block).

**Grading rules** (AI-service `exam_grader.py`; quizzes, exams and voice answers all use it):
- MC: case-insensitive match on the option id.
- TF: tolerant boolean parse.
- Numerical: within `tolerance` or 1% relative of the key. It parses `"1,250"`, `"9.8 m/s^2"` and `"6.02e23"`.
- Short answer: the Claude **fast** tier with a rubric. It awards 0..points; `is_correct = points >= 0.7*max`. Student text is fenced against prompt injection.
- Unanswered questions score 0.
- If a short-answer grade fails: `needs_review:true`, 0 points, feedback "This answer could not be graded automatically...". Quizzes then reject the whole submit with 503. Exams keep the result with `needsReview` and offer Grade again.

---

## 6. Feature inventory of the CURRENT UI

**Cross-cutting**
- Styling: Tailwind with shadcn-like Radix primitives in `components/ui` (button, card, dialog, confirm-dialog, tabs helpers, progress, slider, radio-group, checkbox, alert, badge, input, label, page-shell).
- Fonts: Manrope and JetBrains Mono.
- Layout: no global nav. Each page has "Back to ..." links.
- Server pages read Prisma directly, so list data (projects, materials, topics, exams) is **not** fetched through the API.
- After mutations, pages call `router.refresh()`.
- Mounted/abort guards everywhere, and polling stops on unmount.
- Markdown (`components/ui/markdown.tsx` and `markdown-renderer.tsx`):
  - react-markdown with remark-gfm and remark-math, plus rehype-katex (KaTeX CSS imported).
  - react-syntax-highlighter (Prism light, vsc-dark-plus). Registered languages: bash, c, cpp, java, javascript, python, sql, typescript, with aliases (js, ts, py, sh, c++, postgres, etc.). Other languages render unhighlighted.
  - `MarkdownBlock` (default and `compact` variants) and `MarkdownInline` (block elements disallowed).
  - The renderer's `<a>` handler turns `#cite-N` hrefs into `CitationMarker` components. It imports from `chat/citation-context`, so the markdown component is coupled to chat citations.
  - `formatLearningMarkdown` (`FE/lib/utils/learning-markdown.ts`) fixes escaped `\n` and adds paragraph breaks to dense prose. It is a pure function.

### Pages

**`/` (landing).** Redirects to `/dashboard` if signed in. Otherwise shows a hero with "Start for Free" (`/signup`) and "Sign In" (`/login`), plus three highlight cards. The Playwright smoke test asserts this heading text and these links.

**`/login`**
- Email and password form, a Google button (conditional on providers), and a link to signup.
- Maps `?error=GoogleEmailNotVerified|GoogleAccountMismatch`.
- Redirects when already authenticated.
- API: NextAuth (see §1).

**`/signup`**
- Fields: name, email, password, confirm. Client checks the passwords match and are at least 8 characters.
- Calls POST `/api/auth/signup` then `signIn`. A Google button is always shown.

**`/dashboard`**
- Server-fetches projects with `_count {materials, topics, sampleExams}`, ordered by `updatedAt` desc.
- Shows: welcome, user email, "New Project" inline form (name required, description optional) calling POST `/api/projects` then navigating to the new project, and Logout.
- Stat tiles: projects, materials, topics, exams.
- A compact `NextActionsCard` for **only `projects[0]`**.
- A project card grid with a status badge (Setup, Review Topics, Active, Completed), counts and "Updated ... ago" (date-fns).
- Empty state.

**`/projects/[projectId]`** (`?tab=materials|topics|exams|ask&topic=<id>`)
- Server-loads the project with:
  - materials
  - topics (with per-user progress and `_count.content`)
  - exams (`_count.submissions` is **unfiltered**, so it includes in-progress attempts)
- Header: back link, Logout, inline project **rename** (PATCH name; Esc cancels), project **delete** with a ConfirmDialog (cascade warning), and a status badge.
- A banner prompts for topic confirmation when topics are unconfirmed ("Review Topics" to `/topics/review`, "Confirm Topics" quick action).
- Tabs, with arrow-key tablist:
  - **Materials**
    - File list: icon per category, size, relative upload time, valid/invalid badge with `validationNotes`.
    - Per-file delete (ConfirmDialog).
    - "Upload Materials" to `/upload`.
    - Continue-to-topics prompt (disabled while any file is `pending`).
  - **Topics**
    - Topic cards link to `/projects/{id}/topics/{topicId}`.
    - Each card shows a progress bar (done of notes, examples and quiz, as a percentage), a quiz-score badge and "N content items" vs "No content yet".
    - Buttons: Review Topics, Confirm Topics, Voice Sprint (`/voice-sprint`), Create Sample Exam (`/generate-exam`, disabled until at least one topic is confirmed).
  - **Exams**: exam list (name, duration, difficulty, up to 3 topic badges plus "+N more", attempts count) linking to `/exams/{id}`, plus "Create New Exam".
  - **Ask**: `MaterialsChat` (below).
- A compact `NextActionsCard` is shown above the tab content.
- **The page never polls.** Material `pending` states only change on reload or `router.refresh()`.

**`/projects/[projectId]/upload`**
- `MaterialUpload`, given `maxUploadMb` from the server.
- Category picker (Lecture Notes, Sample Exams, Book Chapters), drag-and-drop plus a "Browse files" button, multi-file.
- Client checks: extension, and size against `maxUploadMb`.
- Real byte progress via XHR (`uploadMaterial` in `FE/lib/uploads/upload-file.ts`). The file is the raw body, with `category` and `filename` in the query string. Cancel via AbortController.
- Per file: uploading, then validating (polls the validate job), then processing (finds the chunk job via `chunking-job` and polls it), then completed / invalid / error. Retry only for pre-upload failures.
- On mount it resumes polling active `validate_material`/`chunk_material` jobs for the project ("N earlier uploads are still being processed") then `router.refresh()`.
- Footer: "{n} valid, {n} need attention", **"Extract Topics Now"** (POST extract-topics, poll up to 120 s, then go to `/topics/review`) and "Back to Project".
- Notes:
  - A file can reach `completed` even if no chunk job is found yet.
  - `validation_status` in the job's `resultData` decides valid vs invalid.

**`/projects/[projectId]/topics/review`**
- `TopicReview` loads topics via GET `/api/projects/{id}/topics`.
- On mount, if an active `extract_topics` job exists (including one the AI service started itself), it follows it.
- Empty state: "Extract Topics from Materials". Otherwise: count, "Re-extract Topics", per-topic rename (inline, Esc cancels), move up/down (PATCH `orderIndex`), merge (a dialog picking a target topic, POST merge), delete (ConfirmDialog), keyword badges (first 5 plus "+N more"), and a confirmed check mark.
- An "Add topic" input (Enter submits) and **"Confirm Topics & Continue"**. The latter calls confirm then goes to `/projects/{id}?tab=topics`.

**`/projects/[projectId]/topics/[topicId]`** (`?tab=notes|solved_examples|interactive_examples|quiz|voice_drill|generate`)
- Server-loads the topic with its content, quiz sets and progress, plus the sibling topic list for prev/next navigation. Answer keys are stripped before props. When quiz sets exist, the `topic_quiz` content copy is blanked to `[]`.
- Header: back to project, "Ask about this topic" (to `/projects/{id}?tab=ask&topic={topicId}`), prev/next topic, a progress bar (notes, examples, quiz), and "{N} blocks missing" or "All core blocks ready".
- Tabs: Section Notes, Solved Examples, Practice, Quiz, Voice Coach, and a Generator tab. Generator is shown first. The default is the first available tab; the Generator is used if nothing is available. A "Content Not Generated" empty card appears when a tab has no content. Prev/next buttons walk the learning tabs. Each tab is lazy-loaded (`next/dynamic`).
- **Notes tab:**
  - Reading-time badge (190 wpm).
  - Markdown with KaTeX and code highlighting.
  - "Source Materials" list whose links open `/api/materials/{id}/file#page=N` in a new tab.
  - A "Mark as Complete" button (POST progress `notesCompleted`).
- **Solved Examples tab:**
  - Expandable example cards, with a difficulty color.
  - Numbered steps rendered as markdown (description, work, explanation) and a final answer.
  - "Generate More" (regenerate-content with `append:true`, plus optional `focus`).
  - Mark as Complete (`examplesCompleted`).
- **Practice tab (interactive examples):**
  - One step at a time: question, hint toggle, answer input, then correct or incorrect feedback with an explanation and "Try again".
  - **Answers are checked in the browser** against `correct_answer` and `acceptable_answers`. The keys are shipped to the client.
  - A bug: when `acceptable_answers` is present, `checkAnswer` returns the `.some()` result immediately, so the numeric-tolerance branch is dead for those steps.
  - Jump to any example or step. Progress counts steps answered correctly.
  - "Add Practice" (regenerate-content, `append:true`, optional `focus`, polled up to 180 s).
  - "Mark as Complete" appears once at least 80% of steps are correct.
- **Quiz tab:**
  - Quiz sets are ordered oldest first and labeled "Set N" (or "Original Set" for the synthetic `legacy`). The newest set is selected by default.
  - Per-set stats are loaded from GET quiz-attempts.
  - A question navigator, with answers kept in local state (`Record<number,string>`).
  - Types: MC via radios, TF via radios, numerical via an Input (with unit), short answer via a textarea.
  - "{n} / total answered. Unanswered questions are graded as incorrect." Submit at any time.
  - After submit the server's `review` is shown per question: correct, incorrect, points, `feedback` (short answers) and the correct or sample answer plus `explanation`.
  - A score summary (earned/total, %) with "Retake Same Set" and a link to the Voice tab (`?tab=voice_drill`).
  - "Generate new quiz set" with an optional focus and type checkboxes (default all 4; sent as `question_types` only when fewer than 4 are selected). It polls in the background and calls `router.refresh()`.
  - `QuizHistory`: attempts with the top 5 expandable into a per-question review.
- **Voice Coach tab:** see §7. It receives `contextText` built from the topic description, the first 6000 chars of notes, and the first 6 quiz question texts.
- **Generator tab (`ContentGenerator`):**
  - Four content cards with default preferences:
    - notes `{detail_level:'comprehensive', include_examples:true}`
    - solved `{count:3, difficulty_level:'medium'}`
    - interactive `{count:3, difficulty_level:'medium'}`
    - quiz `{question_count:10, difficulty_level:'medium'}`
  - Per-type Generate or Regenerate, **Generate all missing** and **Regenerate all** (parallel enqueue via `Promise.allSettled`, one poller per job, a progress bar and stage text).
  - Failed blocks stay listed with the translated reason (`describeJobFailure`) and a per-block Retry. A block that could not even be enqueued shows the API error message.
  - On mount it resumes active `generate_content` jobs whose `targetKey` starts with `content:{topicId}:`.
  - After success it calls GET `/api/topics/{id}/content`, updates the parent state, and (single generation only) opens the matching tab.

**`/projects/[projectId]/generate-exam`**
- Server-redirects to the project page if no topic is confirmed.
- `ExamConfiguration`:
  - topic checkboxes with Select/Deselect all
  - sliders: questions 5..50 step 5 (default 20), duration 15..180 min step 15 (default 120)
  - difficulty radio (easy, medium, hard; default medium)
  - requires at least 1 topic
  - it never sends `questionTypeDistribution`, so the server default 60/30/10 applies
- After POST it polls (300 s) and on completion routes to `/exams/{resultData.exam_id}`, else back to the project.
- On mount it resumes an active `generate_exam` job for the project.

**`/exams/[examId]`**
- Server-side `loadAttemptState` runs first. If the attempt expired while the student was away, it auto-submits and redirects to the results page.
- **Before an attempt:** an info card (questions, minutes, difficulty, topics), instructions about the server timer, a "Start Exam" button (POST attempt) and `ExamHistory`.
- **During an attempt:**
  - `ExamInterface` with a countdown. The deadline is `Date.now() + remainingSeconds*1000`; `serverNow` is ignored.
  - The timer turns red under 5 minutes, with a 5-minute warning banner.
  - It ticks each second and on `visibilitychange`. At 0 it auto-submits the current answers once.
  - Autosave (`useExamAutosave`): debounced 3 s, flushes on hide, blur and pagehide (with `keepalive`), retries every 10 s on error, and shows a save status line.
  - Question navigator with check marks for answered questions. Types: MC and TF radios, a numerical input with unit, a short-answer textarea.
  - A "Submit Exam" button; with unanswered questions it opens a ConfirmDialog ("Submit anyway").
  - Submit handling: a 409 means already submitted or time ran out, and the UI refreshes. A 502 with `submissionId` still routes to the results page.
  - The autosave 409 handler reads `error.details.submissionId` and, if present, opens results.
- `ExamHistory`:
  - Stats (best, latest, average) and a list of attempts linking to the results.
  - Score badges: 90+ green, 70+ blue, 50+ amber (approximately), "Grading in progress..." for pending rows.
  - It resumes `grade_exam` jobs matched by `grade:{submissionId}` and reloads when they finish.

**`/exams/[examId]/results/[submissionId]`**
- Ownership check server-side, then `ExamResults` loads GET submissions/{sid} with `cache:'no-store'`.
- If a grading job is running (including after a refresh), it polls it (300 s).
- "Not graded yet" card with a "Grade again" button (regrade) when status is not graded.
- Graded view: score and points, a "{n} answers could not be graded automatically" banner with Grade again, a per-topic list (weakest first, with a link to the topic when `linkable`), a "show only questions I missed" filter, and a per-question outcome (Correct, Partly correct, Incorrect, Needs review) with student answer, correct answer, points and feedback markdown.

### Shared components
- **`NextActionsCard`** (compact and full variants):
  - GET next-actions with `cache:'no-store'`. It refetches on window focus. It does **not** poll.
  - The primary action's href by type: batch generate goes to `/projects/{id}?tab=topics`; upload to `/upload`; extract to `/topics/review`; confirm to `?tab=topics`; topic actions to `/topics/{id}` (`?tab=generate` for generate); exams to `/generate-exam`.
  - "Start in Background" calls generate-missing-content. It never restarts automatically (generation costs money).
  - Includes `GenerationFailures` (below).
- **`GenerationFailures`:** lists failures, retries each, and follows active generation jobs. It reloads on window focus and when `version` changes.
- **`MaterialsChat`** (ask your materials). It is `ssr:false`, lazy.
  - Sidebar of threads (GET threads), "New chat", per-thread delete (DELETE). Opening a thread calls GET thread.
  - Empty state shows example questions. They are built from topic names (the first topics, one per template, then generic ones) by `exampleQuestions()`. If there are no materials it shows an "upload first" state with a link to the Materials tab.
  - A topic scope select ("All materials" or one topic, sent as `topicId`).
  - Textarea: Enter sends, Shift+Enter inserts a newline, a 2000-char limit with a counter.
  - A live status line: "Searching your materials...", then text streams in (stick-to-bottom autoscroll unless the user scrolled up).
  - The stream is read with `getReader()` plus `createLineSplitter` and `applyChatEvent`. Sources appear after writing finishes.
  - Error banner with a Retry button when `retryable`. A failed question is removed and re-sent on retry.
  - **Citations:**
    - Inline `[n]` markers are inserted at each mark's offset by `insertCitationMarkers` (moves back over trailing whitespace, clusters multiple markers).
    - For PDFs the marker is an `<a>` to `/api/materials/{id}/file#page={pageStart}` in a new tab.
    - For other types (DOCX, PPTX) it is a button that opens an **excerpt Dialog** (blockquote of `citedText`, section and page, plus a download link). That dialog is the only "popover".
    - Below the answer is a numbered "Sources" list with `sourceLabel` ("file.pdf, p. 4" or "file, section"), the quote clamped to 2 lines with Show more/less.
  - An answer saved but not stored (`CHAT_NOT_SAVED` after `done`) shows a notice but keeps the answer.
- **`ConfirmDialog`** is used for deleting a project, a material or a topic; for submitting an exam with unanswered questions; and for deleting a chat thread.

### Client libs in `FE/lib` and `FE/hooks`

| Module | Pure/reusable? | Purpose |
|---|---|---|
| `lib/jobs/poll-job.ts` | Pure core: `pollJobUntilDone` takes an injectable `JobPollEnv`. Browser env and `fetchActiveJobs` live in the same file. | polling with backoff, visibility pause, timeout |
| `hooks/useJobPolling.ts` | React hook wrapper | one poller per job id, abort on unmount |
| `lib/jobs/failure-message.ts` | Pure | `describeJobFailure`, `contentTypeLabel`, `parseContentTarget`, `pickGenerationFailures` |
| `lib/jobs/status.ts` | Server-side (Prisma select) | `serializeJob` |
| `lib/chat/events.ts` | Pure | `parseChatEvent`, `createLineSplitter`, `applyChatEvent`, `INITIAL_ANSWER` |
| `lib/chat/citations.ts` | Pure | `parseSource`, `insertCitationMarkers`, `viewerUrl`, `sourceLabel`, `pageLabel`, `quoteForDisplay`, `parseStoredCitations` |
| `lib/chat/errors.ts` | Pure | friendly messages and status per code |
| `lib/chat/examples.ts` | Pure | example questions |
| `lib/chat/server.ts`, `lib/chat/stream.ts` | Server-only | request helper, relay and storage |
| `lib/uploads/upload-file.ts` | Browser (XHR) | `uploadMaterial`, `buildUploadUrl`, `uploadErrorMessage` |
| `lib/utils.ts` | Mostly pure | `cn`, `isValidStudyMaterial`, `isValidFileSize`; `formatBytes` and `generateShortId` are unused |
| `lib/learning/quiz-questions.ts`, `quiz-review.ts` | Pure, usable by server and client | `PublicQuizQuestion`, `QuizReviewItem`, `reviewAnswer` |
| `lib/exams/attempt-timing.ts` | Pure | deadline and grace helpers, `sanitizeAnswers`, `AnswerMap` |
| `lib/exams/results.ts` | Pure | `ExamQuestionResult`, `WeakTopic` types |
| `hooks/useExamAutosave.ts` | React hook | debounced PUT autosave (see above) |
| `lib/utils/learning-markdown.ts` | Pure | `formatLearningMarkdown` |
| `lib/utils/timezone.ts` | Pure | `browserTimeZone`, `studyPlanUrl` (unused) |
| `lib/voice/language.ts`, `concept.ts`, `grading.ts` | Pure | language detect, concept filter, hints |
| `hooks/useRealtimeVoice.ts` | OpenAI-specific, browser-only | WebRTC transport |

---

## 7. Voice coach

### End to end, today

1. **UI** (`components/voice/VoiceCoach.tsx`):
   - Props `mode ('topic_drill'|'sprint')`, `projectId`, `topicId?`, `topicName`, `topicDescription`, `contextText`.
   - Mounted per topic on the Voice tab (topic mode) and on `/projects/[id]/voice-sprint` (sprint mode, top 3 weakest topics, max 12 questions).
   - On load it calls GET `/api/voice/usage`.
   - Controls:
     - session "style": Oral Q&A, Guided Notes, Topic Conversation. **Client-only.** Topic Conversation sends no tools.
     - a language picker (English, Spanish, French, German, Portuguese, Italian, Hindi, Japanese) and a language mode (fixed, or auto-confirm after 2 detected utterances)
     - an optional focus text
   - It shows:
     - the remaining minutes
     - tool latency, interrupts and tool failures
     - a mic-level meter (ref-polled every 100 ms)
     - the live conversation transcript
     - a last-evaluation card
   - Quick action buttons (repeat question, recap, clarify, deeper, example, summarize) send `response.create` prompts.
   - A "Validate last answer" button posts the last user utterance to `record_answer` manually.
   - On a 422 it shows the error and a "Generate notes + quiz" button (two `generate-content` calls).
   - It composes the coach instructions client-side (topic, language, style rules, focus, context up to 7000 chars, session id).
2. **Session:** POST `/api/voice/session`. The server builds the question set (below), stores it on a new `VoiceDrillSession`, and returns `{sessionId, questionCount, mode}`.
3. **Token:** POST `/api/voice/realtime-token {sessionId}`.
   - Inside a Serializable transaction it enforces one live session per user (409 "Another voice session is already open...") and the daily cap (429), then sets `connectedAt` and `lastSeenAt`.
   - It calls AI-service `POST /voice/realtime/token`, which mints an OpenAI client secret. The AI service returns 503 if `OPENAI_API_KEY` is missing, and the route maps that to 503 "Voice coaching is not available on this server."
   - Response: `{clientSecret:{value, expires_at?}, expiresAt?, session?, dailyMinutes, remainingSeconds}`.
   - A failed mint releases the claim.
4. **Browser transport** (`useRealtimeVoice.ts`):
   - `getUserMedia({audio:true})`.
   - `RTCPeerConnection` (STUN `stun.l.google.com`) with a data channel `oai-events`.
   - Posts the SDP offer to `https://api.openai.com/v1/realtime/calls` with `Bearer <clientSecret>`.
   - After the data channel opens it sends `session.update` with model `gpt-realtime-mini`, transcription model `gpt-4o-mini-transcribe`, `server_vad`, the instructions and the tools.
   - It reacts to Realtime events: `response.created/done`, `input_audio_buffer.speech_started/stopped`, `conversation.item.input_audio_transcription.*`, `response.output_audio_transcript.*`, `output_audio_buffer.started`, `response.function_call_arguments.done` and `error`.
   - It handles barge-in (800 ms debounce) and ICE-disconnect recovery (5 s grace, then an ICE restart with a 10 s timeout, else auto-disconnect).
   - It auto-disconnects after 2 minutes without speech.
5. **Tool calls:** the browser POSTs `/api/voice/tools/execute {call_id, name, arguments}`. It returns `{call_id, output: "<JSON string>"}` (HTTP 200 even for tool-level errors). The browser sends the output back as a `function_call_output` conversation item and triggers `response.create`.
6. **Heartbeat/metrics/end:**
   - `PATCH /api/voice/session {sessionId, heartbeat:true}` every 30 s.
   - `PATCH {status:'ended'|'aborted'}` on disconnect.
   - `{incrementInterruptCount}` and `{lastDetectedLanguage}` on interrupts and language detection.
   - `POST /api/voice/metrics {sessionId, entry}`.

### Voice API contracts

**`GET /api/voice/usage`**
- Response: `{ dailyMinutes, usedSeconds, remainingSeconds, hasLiveSession }`. A 24 h rolling window; the default cap is 30 min (`VOICE_DAILY_MINUTES`).
- Billing runs from `connectedAt` to `endedAt`, or to `lastSeenAt` if the browser vanished. A session counts as live for 90 s after the last heartbeat. One session is capped at 2 h.

**`POST /api/voice/session`**
- Body zod:
  ```ts
  { mode: 'topic_drill'|'sprint' (default topic_drill), style: 'oral_quiz'|'guided_notes'|'topic_conversation' (default oral_quiz),
    projectId: string, topicId?: string, language: /^[a-z]{2,8}$/i (default 'en'), voice: string (default 'marin') }
  ```
- `style` is validated but **never stored or used server-side**.
- 400 if `topic_drill` has no `topicId`. 404 for a project or topic not found.
- 422 `{error:{code:'CONFLICT',message:'No conceptual questions available'}, requiresGeneration:true}` when the style is `oral_quiz` or the mode is `sprint` and there are no questions.
- 200: `{sessionId, questionCount, mode}`.

**`PATCH /api/voice/session`**
- Body: `{ sessionId, status?: 'active'|'ended'|'aborted', lastDetectedLanguage?: /^[a-z]{2,8}$/i|null, incrementInterruptCount?: int(0..20), heartbeat?: boolean }`
- 200: `{ session:{id, status, interruptCount, lastDetectedLanguage, endedAt} }`. An already-ended session asked for `status:'active'` returns `{session:{id, endedAt}}`.

**`POST /api/voice/metrics`**
- Body: `{ sessionId, entry: { ttftMs?, ttfaMs?, speechMs?, responseMs?, toolLatencyMs?, toolFailures?, interrupts?, lastDetectedLanguage? } }`. The entry is zod `.strict()` with non-negative, finite numbers and upper bounds.
- 200: `{success:true}`. The last 200 entries are kept.

**`GET /api/voice/drill-pack?mode=&projectId=&topicId=`** (not called by any UI)
- 200: `{ questionCount, preview:[{question_text, question_type, concepts_tested, source}] }` (up to 5). It builds the pack, which may call the LLM.

**`POST /api/voice/tools/execute`** tool outputs (inside `output`, a JSON string):
- `get_next_question` returns `{done:false, question_index, question:{question_text, question_type, options[], concepts_tested[]}}` or `{done:true, message:'Drill complete.'}`. The latter also sets the session to `ended`.
- `record_answer` returns `{is_correct, score:0..1, feedback:{comment, explanation, ungraded?:true}}`, or `{error}`, or `{done:true}` when the session is over.
- `get_hint` returns `{hint, ideas_expected?, concepts[], note}`. The hint is built from the question's shape and type, never from the key.
- Unknown tool: `{error:'Unknown tool'}`.

### Provider-independent server logic (reusable for any voice stack)

- **Question packs** (`FE/lib/voice/drill-pack.ts`):
  - Topic drill takes the topic's `topic_quiz` questions, filters them to conceptual ones (drops numerical and any with math or digits), dedupes, and tags `source:'topic_quiz'`.
  - If none remain, it generates 10 questions from the notes through AI-service `POST /voice/generate-drill` (the Claude fast tier, using up to 24,000 chars of notes). These are `question_type:'conceptual'` with `key_points`, `sample_answer` and `explanation`, and a Python math filter applies.
  - Sprint takes the 3 topics with the lowest priority (`quizScore`, minus 10 if any track is incomplete), up to 4 questions each, falling back to notes-generated questions, deduped, max 12.
  - Every session start rebuilds the pack, so it can incur an LLM call each time.
- **Grading:** `toGradableQuestion` reshapes every voice question into a short-answer rubric. For MC and TF the correct option text stands in as the sample answer. It calls AI-service `POST /grade/quiz`. A failure is `GradingUnavailableError`, which stores nothing and tells the model not to give a score.
- **Side effects of each graded answer:** upsert a `VoiceDrillAttempt`, write a `LearningSignal` (source `voice`), recompute mastery, upsert the `ReviewSchedule`. Ungraded questions (no key) are stored as `ungraded` and add no signal.
- **Usage and limits:** `FE/lib/voice/usage.ts` and `usage-query.ts`. Cap and heartbeat rules as above. The token endpoint's Serializable transaction is the lock.
- **Metrics storage.** **Hint builder** (`buildHint`). **Language detection** (`detectLikelyLanguage`, used only to offer a switch). **Tool schemas** (`TOOL_DEFS` in `VoiceCoach.tsx`, three function tools).

### OpenAI-dependent parts
- `AI/api/routes/voice.py`'s `POST /voice/realtime/token` (OpenAI `client_secrets`).
- `OPENAI_API_KEY`, `OPENAI_REALTIME_MODEL=gpt-realtime-mini`, `OPENAI_REALTIME_VOICE=marin`, `OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe`.
- The whole `useRealtimeVoice.ts` transport: WebRTC SDP to `api.openai.com/v1/realtime/calls`, the Realtime event protocol, VAD, barge-in handling, and the `function_call_output` plumbing.
- The OpenAI embeddings provider is optional (default `local`).
- Server-side session logic only assumes a function-call shape of `{call_id, name, arguments}` to `{call_id, output}`.
- The token response (`clientSecret.value`) is the only provider-shaped value the server hands to the browser.

---

## 8. Surprises, inconsistencies, dead code

**Missing APIs the new UI will need (or must keep reading via server components)**
- No `GET /api/projects` list. No dashboard stats route.
- No route that lists quiz sets or exposes `quizSetId`.
- No route that returns `MAX_UPLOAD_MB`.
- No route that returns mastery, review due dates, or a topic's progress and content summary together (the project page builds it from Prisma).
- No single route for "voice session history".

**Routes no UI calls** (all functional and usable):
- GET `/api/projects/[id]`
- GET `/api/projects/[id]/materials`
- GET `/api/projects/[id]/exams`
- GET `/api/exams/[id]`
- GET `/api/topics/[id]/progress`
- POST `/api/topics/[id]/confidence` (the UI has no confidence rating step at all)
- GET `/api/projects/[id]/health`
- GET `/api/projects/[id]/study-plan`
- GET `/api/voice/drill-pack`
- GET `/api/health/runtime`
- POST `/api/projects/[id]/chat/threads`
- `PATCH /api/topics/[id]` with `userConfirmed`
- PATCH project `status` and `description`

**Dead or unused**
- Schema models `OverallQuiz` and `OverallQuizAttempt`.
- `studyPlanUrl`, `formatBytes`, `generateShortId`.
- npm dependencies `@auth/prisma-adapter`, `@tanstack/react-query`, `react-hook-form` and `@hookform/resolvers` are installed but unused in `src`.
- Voice `mode 'teach_back'` appears only in a schema comment.
- Chat `role 'error'` is real but undocumented in the schema.

**Behavior mismatches and quirks**
- Three different error shapes (see §0). Some routes return the legacy `{error:string}` even where the UI expects typed errors, and the UI works around it with `typeof error === 'string'` checks.
- `generate-content` and `regenerate-content` are functionally near-identical.
- `generate-content` validates the body **after** preflight and the topic check. A bad body during an AI outage returns 503, not 400.
- `generate-missing-content` returns no job ids and has an inconsistent no-op response.
- Quiz `POST` succeeds only with the **latest** quiz via `quizSetId` omitted (legacy), but the UI always sends a real `quizSetId` once sets exist.
- `isPending` in the exam submissions list is derived from `!aiGrading`, so a failed grading looks pending forever. Only the results route distinguishes `failed`.
- The project page's exam attempt count (`_count.submissions`) is unfiltered, so it counts in-progress attempts; the `/exams` route filters to submitted.
- The exam generator never produces `true_false`, though the exam taker and grader fully support it. The exam UI caps questions at 50 and duration at 180 min, while the API accepts up to 100 and 300.
- `POST /api/topics/[id]/progress` trusts the client for `quizScore` and `quizCompleted`.
- Interactive-example answers and keys are sent to the browser and checked there. The numeric-tolerance branch is unreachable when `acceptable_answers` exists.
- The voice "concept filter" differs between TypeScript and Python. The TS `MATH_PATTERN` (`/(\d+|=|±|...)/`) rejects any text containing a digit, so "layer 4" and "Python 3" questions are dropped. The Python one tolerates bare digits. Project health's `voice.ready` and drill-pack building use the stricter TS filter.
- The voice `style` and the `voice` field are validated or stored but have no server-side effect. All style logic is in browser-composed prompt text.
- The LLM daily budget excludes voice and quiz or voice short-answer grading (`/grade/quiz` records no ledger rows). The UI only learns about budget exhaustion from a failed job or a chat 429.
- A failed `validate_material` or `chunk_material` job can leave a Material `pending` forever, with no retry endpoint.
- `AUTO_EXTRACT_TOPICS_ON_CHUNK` defaults to **true** in `AI/config.py`, but the comment in the chunk-job code says it is off by default. Extraction usually starts without the user asking, so the UI must always check for an active `extract_topics` job.
- The extraction wait: `extract-topics` returns 409 until at least one valid material has chunks, so the UI needs a "still processing" state distinct from "no materials".
- `GET /api/jobs/[id]` returns an unwrapped `Job`, while `GET /api/jobs` wraps in `{jobs}` and `chunking-job` wraps in `{chunkingJob}`, with a slimmer shape.
- The dashboard's `NextActionsCard` shows only the most recently updated project, with no per-project view there.
- The signup page shows a Google button unconditionally; login hides it based on providers.
- The `md` renderer is coupled to chat citations through the `a` component override.
- Two Prisma import paths exist (`@/lib/prisma` and `@/lib/db/prisma`), both exporting the same client.
- Exam deadlines use the client clock with `remainingSeconds` (the `serverNow` field is available but ignored).
- A PDF cited with `#page=N` relies on the browser's PDF viewer; DOCX and PPTX have no deep link.

## 9. Course structure (learning v2, stage 2): what the Stage 2 UI builds on

The backend half of Stage 2 is done; this section is the contract for the React half. Everything the UI needs is in server queries (`src/server/queries/*`) and the API routes listed in §2. Migration: `frontend/prisma/migrations/20261101000000_course_structure` (additive; also adds an index on `llm_usage_events(created_at)` for the global budget, and sets `role = 'exam'` on materials uploaded as `sample_exams`).

### 9.1 Model in one paragraph

A course is **units** (week, chapter, lecture group) of **topics**. Each topic has `objectives` (verb phrases that finish "By the end you can ..."), `prerequisiteIds` (topics earlier in the course), `estimatedMinutes` and **sources** (`topic_sources`: the sections of the student's files it is taught from, with page ranges). Course order is still `Topic.orderIndex`, global across units. A topic with no `unitId` (added by hand, or in a course planned before units) belongs to no unit: render those in a plain "Topics" group with no unit header, and a **flat course** (no units at all) looks exactly as it does today. A topic with no sources is taught from a hybrid search of the course's content files, as before.

### 9.2 Material roles

`Material.role` is `content | syllabus | exam | other`, labelled **Content / Syllabus / Past exam / Other** (`ROLE_LABELS`, `src/lib/materials/role.ts`).
- Set by the AI service when validation finishes: the student's category wins for `sample_exams` (exam) and `syllabus` (syllabus); otherwise the validator's reading of the file (`kind`: content, syllabus, exam or other). If no model is available it is `content`. Between upload and validation it holds the category's role (`content` for notes and book chapters).
- The student can change it: `PATCH /api/materials/[id] { role }` (§2). The role badge belongs in the materials table; `MaterialRow.role` carries it.
- **Syllabus and exam files are never topic sources**, and topic mapping and generation retrieval skip them (including the supporting chunks, which also skip `other`). Chat still searches every valid file. The syllabus text is given to the planner (for ordering and unit names) and the names of exam files are listed in its prompt.
- New upload category `syllabus`, label **"Syllabus or schedule"** (`CATEGORY_LABELS` in `features/course/summary.ts`; the upload select in `materials-manager.tsx` builds its options from it, so it is already offered).

### 9.3 The course planner (the `extract_topics` job)

Same job, endpoint, target key (`extract:{projectId}`), polling and "Find again" button as before; only what it writes changed.
1. **Outline, no model.** Per content file, consecutive chunks with the same first two heading levels form a section (a file without headings: a section per ~1,500 tokens; a huge section is cut into parts of ~4,500). Sections are numbered S1..Sn in upload order, then document order.
2. **One plan call** (purpose `extract_topics`, model setting `MODEL_TOPICS`, now defaulting to `claude-opus-5-5:low`): units of topics with name, description, 3-5 objectives, keywords, section ids, prerequisite keys and estimated minutes. An outline over `PLANNER_MAX_OUTLINE_TOKENS` (120,000) or `PLANNER_MAX_SECTIONS_PER_CALL` (220) sections is planned per group of files, then a cheap `order_units` call orders the units.
3. **Validation:** unknown section ids dropped; a section named twice stays with the first topic; an unplaced section joins the topic of the neighbouring section in the same file (previous, else next); topics with no section and units with no topic are dropped; prerequisites keep only earlier topics. Two additions to the spec: a file nothing in the plan touched becomes a topic of its own in a last unit "Other material", and a plan with a single topic gives it every section.
4. **One transaction** writes units, topics (unconfirmed) and one `topic_sources` row per section (plus `topic_chunk_mappings` for those chunks, `relevance_source = 'course_plan'`).
5. **Find again / new files after confirmation:** see `POST .../extract-topics` in §2. The UI should expect new topics to arrive *unconfirmed* in a course that is otherwise confirmed (`deriveSetup` then shows "Review topics" again until they are confirmed); confirmed topics are never touched. After a new upload the AI service starts this job by itself once the last file is chunked, as before.
A course planned before this change has confirmed topics but no sources: its files count as already planned when they were uploaded before its newest confirmed topic was created, so a new upload plans only itself.

### 9.4 Generation context (what the lesson is written from)

For a topic with sources: all chunks of its primary sources in document order up to `TOPIC_SOURCE_TOKEN_BUDGET` (16,000 tokens; whole sections are kept and the rest dropped from the end, logged), plus up to `TOPIC_SUPPORTING_CHUNKS` (4) chunks from *other* content files, labelled supporting in the prompt. The prompt also carries the **course map** (unit and topic names in order, this topic marked, its objectives and prerequisites) and rules to teach only this topic's objectives, assume the prerequisites and not reuse another topic's worked example. Prompt caching is unchanged: the excerpt block (which includes the course map) is cached only for regenerations of a type.
Each generated item says which excerpts it used; the AI service stores the file and pages as `sources` (§5). Nothing in the UI needs the excerpt indexes.

### 9.5 Server queries (new and changed fields)

All types are exported from the query modules.

```ts
// src/server/queries/courses.ts
type ShellUnit = { id; title; summary: string | null; weekLabel: string | null; orderIndex: number }
CourseShell.units: ShellUnit[]            // course order; [] for a flat course; includes units with no topic
ShellTopic.unitId: string | null
NavCourse.units: { id; title; weekLabel; orderIndex }[]     // sidebar, switcher, palette
NavTopic.unitId: string | null

// src/server/queries/course.ts
MaterialRow.role: 'content' | 'syllabus' | 'exam' | 'other'
TopicsData.units: ShellUnit[]
TopicRow = { ...existing,
  unitId: string | null,
  objectives: string[],                   // "compute a posterior with Bayes' rule": finish "By the end you can ..."
  prerequisiteIds: string[],              // look names up in TopicsData.topics
  estimatedMinutes: number | null,
  sources: SourceRef[] }                  // one entry per file and page range, document order; [] for hand-added topics

// src/server/queries/topic.ts
TopicPageData.topic.structure: {
  unit: { id; title; weekLabel } | null,
  objectives: string[],
  prerequisites: { id; name }[],          // link each to its topic page
  estimatedMinutes: number | null,
  sources: SourceRef[] }                  // "File, pp. a-b" links to the file viewer

// src/lib/topics/sources.ts
type SourceRef = { materialId: string | null; filename: string; pageStart: number | null; pageEnd: number | null }
```

Helpers (pure, unit-tested): `src/lib/topics/units.ts` (`groupTopicsByUnit(topics, units, { includeEmpty })` returns `[{ unit | null, topics }]`; `canonicalTopicOrder`; `unitMastery`; `cleanPrerequisites`; `reachesPrerequisite`), `src/lib/topics/sources.ts` (`formatPages`, `sourceText` "a.pdf, pp. 4-9", `fromLabel` "From a.pdf, p. 4", `fromLine`, `mergeSources`, `parseSources`), `src/lib/materials/role.ts`. For links to the file viewer use `viewerUrl({ materialId, filename, pageStart })` from `src/lib/chat/citations.ts`, as the notes citations do.
Unit mastery = `unitMastery(topics.map((t) => t.mastery))`: mean over all the unit's topics, not-started ones counting as 0 (the same rule as course mastery).

### 9.6 Per-item sources in content

Parsed content types (`src/features/topic/types.ts`) now carry `sources: SourceRef[]`: `SolvedExample.sources`, `PracticeProblem.sources`; the graded `QuizReviewItem.sources` and `ExamQuestionResult.sources` carry them too. Show "From <file>, p. N" (`fromLine(item.sources)`) under each worked example, practice problem and quiz or exam review item, linking to the file viewer. Empty array: show nothing (content written before this change). `PracticeStep` also gains `options: {id, text}[]` and `tolerance: number | null` (§5). `practice-view.tsx` already uses `step.options` when present and falls back to `splitChoices` for old content.

### 9.7 Editor cookbook

| Student action | Call |
|---|---|
| Rename a unit, edit its week label or summary | `PATCH /api/units/[id] { title?, weekLabel?, summary? }` |
| Move a unit up or down | `PATCH /api/units/[id] { orderIndex }` (position among units; its topics move with it) |
| Add a unit | `POST /api/projects/[id]/units { title }` |
| Delete a unit | move its topics out first, then `DELETE /api/units/[id]` (409 while it has topics) |
| Rename a topic, edit objectives or minutes | `PATCH /api/topics/[id] { name?, objectives?, estimatedMinutes? }` |
| Move a topic to another unit (select) | `PATCH /api/topics/[id] { unitId }` (last in that unit), or `{ unitId, orderIndex }` for a position |
| Reorder within a unit | `PATCH /api/topics/[id] { orderIndex }` where `orderIndex` is the topic's target index in the whole course order (units and topics are listed canonically, so this is the sum of the earlier units' sizes plus the index inside the unit) |
| Take a topic out of every unit | `PATCH /api/topics/[id] { unitId: null }` |
| Merge | `POST /api/projects/[id]/topics/merge` (keeps the target's unit; moves sources) |
| Delete | `DELETE /api/topics/[id]` |
| Add a topic | `POST /api/projects/[id]/topics { name, unitId? }` |
| Edit prerequisites | `PATCH /api/topics/[id] { prerequisiteIds }` (400 on a loop) |
Sources are read-only: show them per topic, no route edits them. "Find again" is `POST .../extract-topics` as before.
The existing flat editor keeps working unchanged (it only sends `orderIndex`, rename and merge calls).

### 9.8 The mock stack (`LLM_PROVIDER=mock`, what the e2e runs on)

- **Plan:** one unit per file ("<file> (mock)"), topics of up to three sections ("<file> part 1 (mock)", ...), each with three objectives and a prerequisite on the previous topic of the same unit. A lone small file (2 or 3 sections) still gets one topic per section. Topic names end with "(mock)" and `seed-demo.ts` deletes those and adds its own hand-made topics, which exercises the no-sources path.
- **Notes:** the lesson format with an extra `## Overview` heading first (the existing e2e looks for it) and one ` ```check ` block.
- **Examples, practice and quiz questions:** fixed text; every item has `sources` pointing at the topic's first excerpt (file and pages). The mock practice problem has a single numeric step (answer 4), so completion flows are unchanged. A multiple-choice step as the real model writes it (and as the UI must handle it):
  ```json
  { "step_number": 2, "question": "Which grows fastest?", "hint": "...", "answer_type": "multiple_choice",
    "options": [{ "id": "A", "text": "O(n)" }, { "id": "B", "text": "O(n log n)" }, { "id": "C", "text": "O(n^2)" }],
    "correct_answer": "C", "acceptable_answers": [], "explanation": "...", "feedback_correct": "...", "feedback_incorrect": "..." }
  ```
- Mock calls cost nothing, so neither budget is ever reached; the tests set a tiny cap to cover the copy.

### 9.9 Answer checking (practice)

`checkPracticeAnswer(step, input)` now also accepts: fractions, decimals, percents and thousands separators as the same number (`1/17`, `3/51`, `0.0588`, `5.88%`), within `step.tolerance` (absolute) or 1% for `numeric` steps and 1e-6 for `text` steps; LaTeX-light and spacing differences; simple algebraic expressions that are equal as functions (`p(1-p)^k` and `(1-p)^k p`, compared at pseudo-random points by a small safe evaluator, never `eval`); hyphen or space in terms; comma, semicolon or "or" separated alternatives in a key (`0.0588, 1/17, 5.88%`), and list answers in any order (`2, 3` and `3, 2`). No new dependency. The prompt tells the model to use `numeric` for anything numeric with a tolerance, `text` only for a short canonical form, and one form per `acceptable_answers` entry.

### 9.10 Settings added (AI service)

| Setting | Default | Meaning |
|---|---|---|
| `MODEL_TOPICS` | `claude-opus-5-5:low` | model and effort of the one planning call (was Haiku) |
| `TOPIC_SOURCE_TOKEN_BUDGET` | 16000 | tokens of primary source per generation |
| `TOPIC_SUPPORTING_CHUNKS` | 4 | supporting chunks from other content files |
| `PLANNER_MAX_OUTLINE_TOKENS` / `PLANNER_MAX_SECTIONS_PER_CALL` | 120000 / 220 | past either, plan per group of files |
| `PLANNER_SYLLABUS_TOKENS` | 6000 | syllabus text given to the planner |
| `GLOBAL_DAILY_LLM_BUDGET_USD` | 40 | ceiling on all users together per UTC day (0 = off) |

---

**Summary.** The contract above covers all 46 route files (about 62 method handlers), the job model, the domain model, the exact content and result shapes, the current UI feature inventory, the voice split, and the gaps. The biggest design implications are:
1. There is no list-style API for projects, quiz sets or per-project aggregates, so the new UI either keeps server-component data loading or needs new routes.
2. Generation, grading and extraction are all asynchronous jobs the UI must poll or resume via `GET /api/jobs?active=1`.
3. The chat stream is a custom NDJSON protocol with its own parser, which is reusable as-is (`lib/chat/events.ts`, `citations.ts`).
4. Only the realtime transport and token mint are OpenAI-specific. Everything else about the voice coach is provider-independent.

Files to know: `/home/harish/code/study_buddy/frontend/prisma/schema.prisma`, `/home/harish/code/study_buddy/frontend/src/app/api/**`, `/home/harish/code/study_buddy/frontend/src/lib/**`, `/home/harish/code/study_buddy/ai-service/app/api/routes/jobs.py`, `/home/harish/code/study_buddy/ai-service/app/services/llm/schemas.py`, `/home/harish/code/study_buddy/ai-service/app/services/chat.py`, `/home/harish/code/study_buddy/ai-service/app/services/job_runner.py`.