<div align="center">

# StudyBuddy

### Exam prep with retrieval-augmented generation, voice coaching and LLM grading

Turns lecture slides, textbooks, and past papers into study notes, practice problems, mock exams, and a real-time voice coach, with LaTeX math and code formatting.

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js_15-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)

[Features](#features) • [Quick Start](#quick-start) • [Architecture](#architecture) • [Docs](#documentation)

</div>

---

---

## Overview

**StudyBuddy** is a study tool for university students preparing for exams. You upload lecture notes, textbooks, and past exams, and it generates study guides, practice problems, mock exams, and voice coaching sessions from that material.

### What you can do in the app
1. **Upload materials**: PDF, DOCX, PPTX, or DOC files
2. **Extract topics**: an LLM proposes topics for you to review
3. **Generate content**: notes, solved examples, quizzes, and practice problems per topic
4. **Voice coach**: real-time voice Q&A on concepts
5. **Mock exams**: timed exams graded by the app and an LLM

### The Problem
- Creating study materials from multiple sources takes time
- Generic study guides are not tied to your own course materials
- It is hard to get quick feedback on whether you understand a concept

### The Solution
An LLM-backed study assistant that turns your materials into:
- **Study content**: notes, examples, and quizzes, with source references taken from the retrieved chunks
- **Repeatable practice**: each regeneration is prompted with a new variation seed
- **Voice coaching**: oral exam prep over WebRTC
- **Grading**: rule-based grading for MCQ and numeric answers, LLM grading with partial credit for short answers
- **Bounded prompt size**: topic-scoped chunk retrieval instead of sending whole documents, so prompt size stays flat as courses grow (see Architecture)

---

## Features

### Material Processing
Upload PDF, DOCX, PPTX, or DOC files. The AI service validates them, splits them into chunks, and stores vector embeddings for search

### Content Generation
Generate **study notes**, **solved examples**, **interactive practice**, **quizzes** (MCQ, short answer, numerical), and **timed exams**, rendered with LaTeX math and code highlighting

### Regenerating Practice
Click **"Add Examples"** or **"Practice More"** to generate new problems. Each regeneration passes a timestamp-based variation seed into the prompt to encourage different output

### Grading
- Direct grading for MCQ and numerical questions
- LLM evaluation of short answers with partial credit
- Feedback and explanations per question
- Progress tracking across attempts

### Voice Coach
- **Spoken conversation**: the browser transcribes and speaks (Web Speech API); Claude (fast tier) coaches over text and calls the drill tools
- **Three learning styles**: Oral Q&A, guided notes, or free conversation
- **Concept-only focus**: a regex filter and prompt instructions steer sessions away from math and calculations
- **Topic Drill** or **Voice Sprint** modes for targeted practice
- **Feedback** with key-point grading

### Progress Tracking
Progress bars, attempt history, and per-attempt scores shown inline

### Math and Code Rendering
- **LaTeX support** via KaTeX for equations: $E = mc^2$, $\int_0^1 f(x)\,dx$
- **Syntax highlighting** via Prism for code blocks in all major languages

---

## Quick Start

### Prerequisites
- **Node.js** 24+ and **npm**
- **Python** 3.13+ and [uv](https://docs.astral.sh/uv/)
- **PostgreSQL** 15+ with the **pgvector** extension, version 0.5 or newer (the chunk index is HNSW)
- **Anthropic API Key** ([Get one here](https://console.anthropic.com/settings/keys))
- **OpenAI API Key** (optional, only for the Voice Coach)

### Docker Setup (Recommended)

1. **Clone and configure**
   ```bash
   git clone https://github.com/harishm17/study_buddy.git
   cd study_buddy
   cp .env.example .env
   # Edit .env and add your ANTHROPIC_API_KEY and AI_INTERNAL_TOKEN
   ```

2. **Start services**
   ```bash
   # First run (or after dependency changes)
   COMPOSE_BAKE=true docker compose up --build

   # Subsequent runs (fast path)
   docker compose up
   ```

3. **Run database migrations**
   ```bash
   cd frontend
   npm install
   npx prisma migrate deploy
   ```

   The schema is managed with Prisma migrations (`frontend/prisma/migrations`). After a
   schema change, run `npm run db:migrate -- --name <what_changed>` to create a migration and
   commit it.

   **Existing databases.** If your database was created earlier with `prisma db push`, it has
   the tables but no migration history, and `migrate deploy` will refuse to run. Mark the
   baseline as applied once, then migrate:
   ```bash
   cd frontend
   npx prisma migrate resolve --applied 0_init
   npx prisma migrate deploy
   ```

   **Upgrading chunks that were embedded earlier.** Migration `20261022000000_retrieval_indexes`
   makes `material_chunks.chunk_embedding` a `vector(384)` with an HNSW index. It sets the
   embeddings of any chunk that is not 384 numbers long (the old 1536-number OpenAI vectors) to
   NULL, which keeps the text but hides the chunk from search by meaning. Chunks embedded
   before heading text was added to the embedded text also work, but rank slightly worse.
   Re-embed after migrating:
   ```bash
   cd ai-service
   uv run python scripts/reembed_chunks.py            # every chunk
   uv run python scripts/reembed_chunks.py --missing-only
   ```
   `EMBEDDING_PROVIDER=openai` produces 1536-number vectors and does not fit this column; using
   it would need a new migration that changes `vector(384)` and the index to `vector(1536)`, and
   a re-embed. The AI service refuses to write vectors of any other size.

4. **Open browser**
   - Frontend: http://localhost:3000
   - AI Service API: http://localhost:8000/docs

### Manual Setup (Without Docker)

<details>
<summary>Click to expand manual setup instructions</summary>

**Database:**
```sql
CREATE DATABASE studybuddy;
\c studybuddy
CREATE EXTENSION vector;
```

**Frontend:**
```bash
cd frontend
cp .env.example .env  # Edit with your values
npm install
npx prisma migrate deploy
npm run dev
```

**AI Service:**
```bash
cd ai-service
cp .env.example .env  # Edit with your values
uv sync
uv run uvicorn app.main:app --reload
```

</details>

---

## Architecture

### System Overview

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   Next.js App   │─────▶│  FastAPI Service │─────▶│   PostgreSQL    │
│   (Frontend)    │      │   (AI Service)   │      │   + pgvector    │
│                 │      │                  │      │                 │
│ • UI/UX         │      │ • PDF Processing │      │ • User data     │
│ • Auth          │      │ • Embeddings     │      │ • Materials     │
│ • API Routes    │      │ • LLM Calls      │      │ • Vectors       │
│ • SSR           │      │ • Content Gen    │      │ • Progress      │
│ • Voice Coach   │      │ • Voice Tools    │      │ • Sessions      │
│ • WebRTC        │      │ • Realtime Token │      │                 │
└─────────────────┘      └──────────────────┘      └─────────────────┘
         │                         │
         │                         │
         └─────────────┬───────────┘
                       │
                       ▼
              ┌────────────────┐
              │ Anthropic API  │
              │                │
              │ • Claude       │
              │                │
              │ OpenAI API     │
              │ • Realtime     │
              │   (voice only) │
              └────────────────┘
```

### Key Design Decisions

#### 1. Topic-Scoped Retrieval
Instead of sending whole documents to the model:
- **Chunking**: files are read as markdown (PDFs with pymupdf4llm, DOCX, PPTX, and legacy DOC through LibreOffice when installed) and split at headings and paragraphs into chunks of about 350 tokens with 50 tokens of overlap, each tagged with its heading path and pages, then embedded locally (`BAAI/bge-small-en-v1.5`, 384 dimensions, no API key) and stored in pgvector
- **Topic mapping**: each topic is mapped to its top 24 chunks. Two searches run over the project's valid materials, vector similarity on `topic name, description and keywords` and Postgres full-text search on the name and keywords, and Reciprocal Rank Fusion merges their rankings. Chunks below a similarity floor are dropped, so a topic the files barely cover gets a short list instead of 24 loose matches. The heading path is embedded together with each chunk's text.
- **Mapping at generation time**: a topic added by hand has no mappings, and a file uploaded after extraction adds chunks old mappings predate. Before a generator reads a topic's chunks, a topic with no mappings, or with mappings older than the newest chunk in its project, is mapped again with the same search and the result stored. If nothing clears the floor, generation fails with `NO_SOURCE_MATERIAL`
- **Bounded prompts**: content generation sends at most 24 mapped chunks for the topic, untruncated, so prompt size is capped by the chunk limit rather than by document length

#### 2. Content Variation
- Each "Practice More" request asks the model for new content
- A timestamp-based variation seed is passed into the prompt on each regeneration

#### 3. Async Job Processing
- Long tasks (PDF processing, content generation) run asynchronously
- With `ENABLE_CLOUD_TASKS=true` (set on both services), jobs are enqueued through Google Cloud Tasks; otherwise the services call the AI service directly at `AI_SERVICE_URL`
- Every job endpoint claims its job with one atomic update and keeps a lease while it runs: a finished job never re-runs, a running job is not run twice, and a job whose worker died, or that was never claimed, is dispatched again by the reaper and failed with `JOB_LEASE_EXPIRED` / `JOB_DISPATCH_FAILED` once its attempts run out (`POST /jobs/reap`, also run every `JOB_REAPER_INTERVAL_SECONDS`)
- The AI service answers 400 for failures a retry cannot fix, 500 for transient ones and 200 `skipped` for jobs already handled; dispatchers retry only network errors and 5xx
- Each job stores its LLM tokens and estimated cost; `DAILY_LLM_BUDGET_USD` caps what one user's jobs may cost per UTC day
- A partial unique index allows one pending/processing job per target (topic extraction per project, content generation per topic and type)
- The browser follows jobs with one hook (`useJobPolling`): per-job pollers, 1 s to 10 s backoff, paused while the tab is hidden, and resumed after a refresh through `GET /api/jobs?active=1`
- Long jobs do not block the UI

#### 4. Concept-Only Voice Coach
- Intentionally avoids math, equations, calculations
- Focuses on: definitions, intuition, relationships, trade-offs
- A regex filter and LLM instructions steer sessions toward concept-only content

#### 5. Two-Service Architecture
- **Frontend (Next.js)**: UI, auth, API routing, job orchestration
- **AI Service (FastAPI)**: LLM calls, PDF processing, embeddings, content generation
- **Database (PostgreSQL + pgvector)**: User data, materials, vectors, progress
- The services can be deployed separately
- Only the frontend can call the AI service: every route except the health checks needs the shared `AI_INTERNAL_TOKEN`, and outside local development the AI service refuses all calls if the token isn't set

---

## Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| [Next.js 16](https://nextjs.org/) and React 19 | React framework with App Router |
| [TypeScript](https://www.typescriptlang.org/) | Type-safe JavaScript |
| [Prisma](https://www.prisma.io/) | Type-safe ORM for PostgreSQL |
| [NextAuth.js](https://next-auth.js.org/) | Authentication (email/password and Google OAuth) |
| [TailwindCSS](https://tailwindcss.com/) | Utility-first CSS |
| [Shadcn/ui](https://ui.shadcn.com/) | Component library |
| [React-markdown](https://github.com/remarkjs/react-markdown) | Markdown rendering with GFM |
| [KaTeX](https://katex.org/) | Fast LaTeX math rendering |
| [Prism](https://prismjs.com/) | Syntax highlighting |
| WebRTC | Low-latency audio for Voice Coach |

### Backend (AI Service)
| Technology | Purpose |
|------------|---------|
| [FastAPI](https://fastapi.tiangolo.com/) | Python web framework |
| [PyMuPDF](https://pymupdf.readthedocs.io/) | PDF text extraction |
| [Anthropic API](https://docs.anthropic.com/) | Claude for content generation and grading |
| [fastembed](https://github.com/qdrant/fastembed) | Local embeddings (`BAAI/bge-small-en-v1.5`) |
| OpenAI Realtime | WebRTC audio/text for Voice Coach (optional) |
| [pgvector](https://github.com/pgvector/pgvector) | Vector similarity search |
| [Pydantic v2](https://docs.pydantic.dev/) | Data validation |

### Infrastructure
| Technology | Purpose |
|------------|---------|
| PostgreSQL 15+ | Database with pgvector extension |
| Docker & Compose | Local development environment |
| [Railway](https://railway.com/) | Hosting: both services, Postgres and an S3-compatible bucket ([deployment guide](docs/deployment/RAILWAY.md)) |
| S3-compatible storage | Uploaded files (Railway Buckets, S3, R2 or MinIO); Google Cloud Storage and local disk also work |

---

## Documentation

### How It Works

1. **Upload Materials**: PDF, DOCX, or PPTX files are validated, then chunked into searchable sections
2. **Extract Topics**: an LLM proposes key topics for review
3. **Generate Content**: for each topic, notes, solved examples, interactive practice, and quizzes
4. **Practice and Review**: regenerate content, track scores across attempts
5. **Take Exams**: timed mock exams with grading and per-question feedback
6. **Voice Coach**: real-time voice Q&A on concepts

### Environment Variables

<details>
<summary>Click to see required and optional environment variables</summary>

**Required:**
```env
# Anthropic (Claude generates and grades)
ANTHROPIC_API_KEY=sk-ant-...

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/studybuddy

# NextAuth
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
NEXTAUTH_URL=http://localhost:3000

# Services
AI_SERVICE_URL=http://localhost:8000
AI_INTERNAL_TOKEN=<generate with: openssl rand -hex 32; same value in both services>
```

**Optional:**
```env
# Google OAuth (for social login)
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...

# LLM and embeddings (AI service)
LLM_PROVIDER=anthropic              # or mock: placeholder output, no API calls
ANTHROPIC_MODEL=claude-opus-5-5     # notes, examples, quizzes, exams
ANTHROPIC_FAST_MODEL=claude-haiku-5-5  # validation, topics, short-answer grading
EMBEDDING_PROVIDER=local            # openai gives 1536-number vectors; the column is vector(384), see Upgrading

# Voice Coach (a Claude conversation on the fast model; the browser does speech-to-text and text-to-speech)
VOICE_DAILY_MINUTES=30            # per-user voice minutes per 24 hours (frontend setting)

# Uploads (frontend setting)
MAX_UPLOAD_MB=25                  # largest study file, in MB; bigger files get 413

# Uploaded files: an S3-compatible bucket (both services), see docs/deployment/RAILWAY.md
S3_BUCKET=...                     # frontend only; the AI service reads the bucket from each path
S3_ENDPOINT=https://...
S3_REGION=auto
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
# Or Google Cloud Storage and Cloud Tasks instead
# GCS_BUCKET=studybuddy-materials
# GCS_PROJECT_ID=your-project-id
# ENABLE_GCS_STORAGE=true
# ENABLE_CLOUD_TASKS=true
```

</details>

### Project Structure

```
study_buddy/
├── .railway/railway.ts          # Railway project: services, settings, variables
├── frontend/                    # Next.js application
│   ├── src/
│   │   ├── app/                # App Router pages & API routes
│   │   ├── components/         # React components
│   │   └── lib/                # Utilities, DB, Auth
│   └── prisma/                 # Database schema
│
├── ai-service/                  # Python AI microservice
│   ├── app/
│   │   ├── api/routes/         # FastAPI endpoints
│   │   ├── services/           # Business logic
│   │   ├── models/             # Pydantic models
│   │   └── db/                 # Database utilities
│   └── tests/                  # Unit tests
│
├── .github/workflows/           # CI/CD pipelines
├── docker-compose.yml          # Local development setup
└── README.md                   # This file
```

---

## Testing & Quality

### Running Tests
```bash
# Frontend checks
cd frontend
npm run lint
npm run build

# AI Service tests
cd ai-service
uv run pytest
uv run pytest --cov=app tests/  # With coverage
```

### CI/CD Pipeline
- Frontend CI: Prisma validation + lint + production build
- AI Service CI: Python compile checks + pytest suite
- Workflow file: `.github/workflows/ci.yml`

### Evaluation
`evals/` holds a retrieval eval: for 38 topics over three OpenStax textbook chapters (about 300 chunks), how many of the right chunks land in the 24 stored for a topic, and how high they rank. It uses the app's real chunker, embedder and `hybrid_search_chunks`, needs no API key and runs in under a minute. Current results (macro average over topics, K = 24):

| | recall@24 | MRR | nDCG@24 | hit@5 |
|---|---|---|---|---|
| Before (keyword `ILIKE` + vector, flat keyword score) | 0.935 | 0.830 | 0.777 | 0.895 |
| Now (vector + full-text, Reciprocal Rank Fusion) | 0.989 | 0.961 | 0.932 | 1.000 |

There is no generation-quality eval (faithfulness of notes and quizzes) yet. See `evals/README.md` for how to run the retrieval eval, its limits, and the full results in `evals/results/`.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Author

**Harish Manoharan**

[![GitHub](https://img.shields.io/badge/GitHub-harishm17-181717?style=for-the-badge&logo=github)](https://github.com/harishm17)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-harishm17-0077B5?style=for-the-badge&logo=linkedin)](https://linkedin.com/in/harishm17)
[![Portfolio](https://img.shields.io/badge/Portfolio-harishmanoharan.com-000000?style=for-the-badge&logo=google-chrome)](https://harishmanoharan.com)
[![Email](https://img.shields.io/badge/Email-harish__manoharan@outlook.com-D14836?style=for-the-badge&logo=gmail&logoColor=white)](mailto:harish_manoharan@outlook.com)

---

<div align="center">

**[Back to top](#studybuddy)**

</div>
