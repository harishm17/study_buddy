<div align="center">

# StudyBuddy

### Exam prep with retrieval-augmented generation, voice coaching and LLM grading

Turns lecture slides, textbooks, and past papers into study notes, practice problems, mock exams, and a real-time voice coach, with LaTeX math and code formatting.

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js_15-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)

[Features](#features) • [Status](#status-and-known-gaps) • [Quick Start](#quick-start) • [Architecture](#architecture) • [Docs](#documentation)

</div>

---

## Status and known gaps

- **The hosted demo is offline.** The Cloud Run deployment currently returns 503, so there is no live link. Run it locally with the Quick Start below; `DEMO.md` describes seeding demo data.
- **`evals/` is a stub.** It contains a short README and a 3-line sample file. There is no runner and no results yet, so no answer-quality numbers are claimed.
- **The FastAPI `/jobs` routes have no authentication.** They need service-to-service auth (for example a shared internal token, as `voice.py` already checks) before the AI service is redeployed.

### What you can do in the app
1. **Upload materials**: PDF, DOCX, PPTX, or DOC files
2. **Extract topics**: an LLM proposes topics for you to review
3. **Generate content**: notes, solved examples, quizzes, and practice problems per topic
4. **Voice coach**: real-time voice Q&A on concepts
5. **Mock exams**: timed exams graded by the app and an LLM

---

## Overview

**StudyBuddy** is a study tool for university students preparing for exams. You upload lecture notes, textbooks, and past exams, and it generates study guides, practice problems, mock exams, and voice coaching sessions from that material.

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
- **Bounded prompt size**: topic-scoped chunk retrieval instead of sending whole documents (see Architecture)

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
- **Real-time voice interaction** via WebRTC (OpenAI Realtime API)
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
- **Node.js** 20+ and **npm**
- **Python** 3.11 or 3.12 (3.13 not supported yet)
- **PostgreSQL** 15+ with **pgvector** extension
- **OpenAI API Key** ([Get one here](https://platform.openai.com/api-keys))

### Docker Setup (Recommended)

1. **Clone and configure**
   ```bash
   git clone https://github.com/harishm17/study_buddy.git
   cd study_buddy
   cp .env.example .env
   # Edit .env and add your OPENAI_API_KEY and AI_INTERNAL_TOKEN
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
   npx prisma db push
   ```

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
npx prisma db push
npm run dev
```

**AI Service:**
```bash
cd ai-service
cp .env.example .env  # Edit with your values
python3.11 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
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
              │   OpenAI API   │
              │                │
              │ • GPT-5-mini   │
              │ • Embeddings   │
              │ • Realtime API │
              └────────────────┘
```

### Key Design Decisions

#### 1. Topic-Scoped Retrieval
Instead of sending whole documents to the model:
- **Chunking**: PDFs are split with heading-aware heuristics into chunks targeting about 800 tokens with 15% overlap, then embedded (`text-embedding-3-small`) and stored in pgvector
- **Topic mapping**: when topics are extracted, each topic is mapped to its top 15 chunks using a blend of keyword matching and vector similarity
- **Bounded prompts**: content generation fetches at most 24 mapped chunks for the topic, so prompt size is capped by the chunk limit rather than by document length
- Token cost has not been measured or compared against a full-document baseline.

#### 2. Content Variation
- Each "Practice More" request asks the model for new content
- A timestamp-based variation seed is passed into the prompt on each regeneration
- Uniqueness is encouraged by the prompt, not enforced or checked by code

#### 3. Async Job Processing
- Long tasks (PDF processing, content generation) run asynchronously
- With `ENABLE_CLOUD_TASKS=true`, jobs are enqueued through Google Cloud Tasks; otherwise the frontend calls the AI service directly
- The enqueue path uses timeouts, bounded exponential backoff, and retryable/permanent error classification
- The frontend polls job status with exponential backoff and jitter
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

---

## Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| [Next.js 15](https://nextjs.org/) | React framework with App Router |
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
| [OpenAI API](https://platform.openai.com/) | GPT-5-mini for content generation |
| OpenAI Realtime | WebRTC audio/text for Voice Coach |
| [pgvector](https://github.com/pgvector/pgvector) | Vector similarity search |
| [Pydantic v2](https://docs.pydantic.dev/) | Data validation |

### Infrastructure
| Technology | Purpose |
|------------|---------|
| PostgreSQL 15+ | Database with pgvector extension |
| Docker & Compose | Local development environment |
| Google Cloud Run | Serverless deployment (optional) |
| Cloud SQL | Managed PostgreSQL (optional) |
| Cloud Storage | PDF storage (optional) |

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
# OpenAI
OPENAI_API_KEY=sk-proj-...

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/studybuddy

# NextAuth
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
NEXTAUTH_URL=http://localhost:3000

# Services
AI_SERVICE_URL=http://localhost:8000
AI_INTERNAL_TOKEN=replace-with-shared-secret
```

**Optional:**
```env
# Google OAuth (for social login)
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...

# Voice Coach (AI service)
OPENAI_REALTIME_MODEL=gpt-realtime-mini
OPENAI_REALTIME_VOICE=marin
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe

# GCP (for production deployment)
GCS_BUCKET=studybuddy-materials
GCS_PROJECT_ID=your-project-id
ENABLE_GCS_STORAGE=true
ENABLE_CLOUD_TASKS=true
```

</details>

### Project Structure

```
study_buddy/
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
pytest
pytest --cov=app tests/  # With coverage
```

### CI/CD Pipeline
- Frontend CI: Prisma validation + lint + production build
- AI Service CI: Python compile checks + pytest suite
- `.github/workflows/test.yml` is a looser check (lint runs with `--exit-zero`); `ci.yml` is the gating workflow
- Workflow file: `.github/workflows/ci.yml`

### Evaluation
`evals/` only holds a plan (faithfulness, context precision, quiz correctness) and a 3-line sample dataset. There is no runner and no results. See `evals/README.md`.

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Author

**Harish Manoharan**

[![GitHub](https://img.shields.io/badge/GitHub-harishm17-181717?style=for-the-badge&logo=github)](https://github.com/harishm17)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-harishm17-0077B5?style=for-the-badge&logo=linkedin)](https://linkedin.com/in/harishm17)
[![Portfolio](https://img.shields.io/badge/Portfolio-harishm17.github.io-000000?style=for-the-badge&logo=google-chrome)](https://harishm17.github.io)
[![Email](https://img.shields.io/badge/Email-harish__manoharan@outlook.com-D14836?style=for-the-badge&logo=gmail&logoColor=white)](mailto:harish_manoharan@outlook.com)

---

<div align="center">

**[Back to top](#studybuddy)**

</div>
