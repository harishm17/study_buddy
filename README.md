<div align="center">

# StudyBuddy — Exam Prep RAG & Quiz Generator

### End-to-end study workflow: retrieval, generation, practice, grading, voice coaching

Turn lecture slides, books, and past papers into structured notes, quizzes, practice exams, and real-time voice coaching with an evaluation-ready RAG pipeline.

[Why this exists](#-overview) • [Demo](#-demo) • [Evaluation](#-evaluation) • [Quick Start](#-quick-start) • [Architecture](#-architecture)

</div>

---

## Overview

**StudyBuddy** is a comprehensive learning platform designed for university students preparing for exams. Upload your lecture notes, textbooks, and past exams—let AI do the heavy lifting of creating study guides, practice problems, mock exams, and real-time voice coaching tailored to your learning needs.

### The Problem
- **Time-consuming**: Creating study materials from multiple sources takes hours
- **No personalized practice**: Generic study guides don't adapt to your weak areas
- **Limited feedback**: Hard to know if you're actually understanding concepts

### The Solution
**AI-powered study assistant** that transforms your materials into:
- **Structured study content**: Notes, examples, quizzes, and exams—all with citations
- **Unlimited practice**: Generate fresh problems and questions on-demand
- **Real-time voice coaching**: Oral exam prep with instant conceptual feedback
- **Intelligent grading**: AI evaluates your answers with detailed explanations

---

## Key Features

### Smart Material Processing
Upload PDFs, DOCX, PPTX, or DOC files → AI validates, chunks, and indexes them with vector embeddings for semantic search

### AI-Powered Content Generation
Generate **study notes**, **solved examples**, **interactive practice problems**, **quizzes** (MCQ, short answer, numerical), and **full-length timed exams**—all with proper LaTeX math and code formatting

### Unlimited Practice
Click **"Practice More"** to generate completely different problems (not reshuffled). Each regeneration creates fresh content using variation seeds

### Intelligent AI Grading
- Instant grading for MCQ/numerical questions
- Semantic evaluation for short answers with partial credit
- Detailed feedback and explanations for every question

### Voice Coach — Real-Time Oral Exam Prep
- **Real-time voice interaction** via WebRTC (OpenAI Realtime API)
- **Three learning styles**: Oral Q&A, guided notes, or free topic conversation
- **Concept-only focus**: Automatically filters math/calculations—perfect for oral exams
- **Topic Drill** or **Voice Sprint** modes for targeted practice
- Instant feedback with key-point grading

### Progress Tracking
Visual progress bars, attempt history, and performance metrics—all inline, no overwhelming dashboards

---

## Demo

### Try It Locally

Want to run it yourself? Follow the [Quick Start](#-quick-start) guide below.

---

## Evaluation

This repo includes an **evaluation harness** to prevent regressions and track answer quality as prompts/models change.

**What to measure**
- **Faithfulness:** Answers grounded in retrieved chunks
- **Context precision:** % of retrieved chunks used in the answer
- **Quiz accuracy:** Generated questions align with source material

**Where it lives**
- `evals/README.md` — evaluation plan + how to run
- `evals/sample_questions.jsonl` — small seed dataset (replace with your own)

> Tip: Run evals on a fixed dataset before/after prompt or model updates.

---

## Quality Gates

- Frontend CI: Prisma validation + lint + production build
- AI service CI: Python compile checks + pytest suite
- Workflow file: `.github/workflows/ci.yml`

---

## Quick Start

### Prerequisites
- **Node.js** 20+ and **npm**
- **Python** 3.11 or 3.12 (3.13 is not supported yet)
- **PostgreSQL** 15+ with **pgvector** extension
- **OpenAI API Key** ([Get one here](https://platform.openai.com/api-keys))

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/harishm17/study_buddy.git
   cd study_buddy
   ```

2. **Set up environment variables**
   ```bash
   # Root env used by docker compose variable substitution
   cp .env.example .env

   # Service-local envs (used by manual, non-docker runs)
   cp frontend/.env.example frontend/.env
   cp ai-service/.env.example ai-service/.env
   ```

   Voice Coach requires a shared internal token for minting Realtime secrets:
   - Set one shared `AI_INTERNAL_TOKEN` across `.env`, `frontend/.env`, and `ai-service/.env`
   - Ensure `OPENAI_REALTIME_MODEL`, `OPENAI_REALTIME_VOICE`, and `OPENAI_TRANSCRIPTION_MODEL` are set in `ai-service/.env`

   Docker note:
   - For `docker compose` runs, root `.env` is sufficient for most setups.
   - `frontend/.env` and `ai-service/.env` are mainly for manual non-docker runs, or if you want per-service overrides.

3. **Start with Docker Compose** (Easiest)
   ```bash
   # Compose reads root ./.env for variable substitution.
   # Ensure OPENAI_API_KEY and AI_INTERNAL_TOKEN are set in ./.env
   # First run (or after Dockerfile/dependency changes):
   COMPOSE_BAKE=true docker compose up --build

   # Subsequent runs (fast path, reuses built images):
   docker compose up
   ```

   Build-time speed tips:
   - Avoid `--build` unless dependencies or Dockerfiles changed.
   - The Dockerfiles use BuildKit cache mounts for `npm`, `pip`, and Next.js build cache.
   - Keep `COMPOSE_BAKE=true` for faster parallelized builds.

   Services will be available at:
   - Frontend: http://localhost:3000
   - AI Service: http://localhost:8000
   - API Docs: http://localhost:8000/docs

   If uploads validate but extraction fails with authentication errors, check:
   - `OPENAI_API_KEY` exists in root `.env`
   - `AI_INTERNAL_TOKEN` exists in root `.env` (and matches service-local envs if you run services manually)
   - For `gpt-5-mini` on the Responses API, avoid legacy sampling knobs (`temperature`, `top_p`, `logprobs`).
     The AI service strips these automatically for GPT-5/reasoning models.

   Secret-safe debugging tip:
   - Avoid printing full compose-resolved config directly, because it includes environment values.
   - Use redacted output if needed:
   ```bash
   docker compose config | sed -E 's/sk-[A-Za-z0-9_-]+/sk-[REDACTED]/g'
   ```

4. **Run database migrations**
   ```bash
   cd frontend
   npm install
   npx prisma db push
   ```
   - If you pull updates, re-run `npx prisma db push` to apply any new constraints (Voice Coach uses a unique index on `(sessionId, questionIndex)`).

5. **Open your browser** and go to http://localhost:3000

### Manual Setup (Without Docker)

<details>
<summary>Click to expand manual setup instructions</summary>

**Frontend:**
```bash
cd frontend
npm install
npx prisma migrate dev
npm run dev
```

**AI Service:**
```bash
cd ai-service
   python3.11 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Database:**
```sql
CREATE DATABASE studybuddy;
\c studybuddy
CREATE EXTENSION vector;
```

</details>

---

## Tech Stack

### Frontend
- **[Next.js 15](https://nextjs.org/)** - React framework with App Router
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe JavaScript
- **[Prisma](https://www.prisma.io/)** - Type-safe ORM for PostgreSQL
- **[NextAuth.js](https://next-auth.js.org/)** - Authentication with Google OAuth
- **[TailwindCSS](https://tailwindcss.com/)** - Utility-first CSS framework
- **[Shadcn/ui](https://ui.shadcn.com/)** - Beautifully designed components
- **[React-markdown](https://github.com/remarkjs/react-markdown)** - Markdown rendering with GFM support
- **[KaTeX](https://katex.org/)** - Fast LaTeX math rendering (via remark-math/rehype-katex)
- **[Prism](https://prismjs.com/)** - Syntax highlighting for code blocks
- **WebRTC** - Low-latency audio for Voice Coach

### Backend (AI Service)
- **[FastAPI](https://fastapi.tiangolo.com/)** - Modern Python web framework
- **[PyMuPDF](https://pymupdf.readthedocs.io/)** - PDF text extraction
- **[OpenAI API](https://platform.openai.com/)** - Responses API (`gpt-5-mini`) for content generation
- **OpenAI Realtime** - WebRTC audio/text for Voice Coach
- **[pgvector](https://github.com/pgvector/pgvector)** - Vector similarity search
- **[Pydantic v2](https://docs.pydantic.dev/)** - Data validation

### Infrastructure
- **PostgreSQL 15+** with pgvector extension
- **Docker & Docker Compose** - Containerization
- **Google Cloud Run** - Serverless deployment (optional)
- **Cloud SQL** - Managed PostgreSQL (optional)
- **Cloud Storage** - PDF storage (optional)

---

## Architecture

**Microservices Design:**

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   Next.js App   │─────▶│  FastAPI Service │─────▶│   PostgreSQL    │
│   (Frontend)    │      │   (AI Service)   │      │   + pgvector    │
│                 │      │                  │      │                 │
│ • UI/UX         │      │ • PDF Processing │      │ • User data     │
│ • Auth          │      │ • Embeddings     │      │ • Materials     │
│ • API Routes    │      │ • LLM Calls      │      │ • Vectors       │
│ • SSR           │      │ • Content Gen    │      │ • Progress      │
│ • Voice Coach   │      │ • Voice Tools    │      │ • Voice Sessions│
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
              │   (Voice)      │
              └────────────────┘
```

### Key Design Decisions

**1. Hybrid Search Architecture for Cost Efficiency**
Instead of sending entire textbooks to AI (expensive & noisy), StudyBuddy uses a two-stage retrieval system:
- **Semantic Chunking**: PDFs are broken into semantic chunks (500-1000 tokens) with vector embeddings
- **Hybrid Retrieval**: Combines keyword matching and vector similarity search to find the most relevant sections
- **Smart Context Selection**: Sends only the top 15-24 most relevant chunks to the LLM (instead of entire documents)
- **Result**: Significant cost reduction (typically 70-85%) while maintaining or improving answer quality

**Why this matters**: A typical textbook might be 50,000+ tokens. Sending all of it costs ~$0.10-0.15 per request. By retrieving only relevant sections, we reduce this to ~$0.02-0.03 per request while getting better, more focused answers.

**2. Content Regeneration with True Variation**
- Each "Practice More" click generates completely different content—not just reshuffled questions
- Uses `variation_seed` (timestamp-based) to ensure uniqueness across regenerations
- LLM creates fresh scenarios, different problem setups, and novel question formulations
- Tracks improvement across multiple attempts with unique content each time

**3. Async Job Processing with Cloud Tasks**
- Long-running tasks (PDF processing, content generation, exam grading) run asynchronously
- Production uses Google Cloud Tasks for reliable job queuing and retries
- Development mode uses direct HTTP calls with automatic retry logic
- Frontend polls job status with exponential backoff and bounded timeouts
- Duplicate requests are automatically deduplicated while a job is in-flight
- No HTTP timeout issues—jobs can run for minutes without blocking the UI

**4. Concept-Only Voice Coach Design**
- Voice Coach intentionally avoids math, equations, and calculations
- Focuses on conceptual understanding: definitions, intuition, relationships, trade-offs
- Uses regex filtering and LLM instructions to enforce concept-only content
- Perfect for oral exam prep where conceptual reasoning matters more than computation

**5. Microservices Architecture**
- **Frontend (Next.js)**: Handles UI, authentication, API routing, and job orchestration
- **AI Service (FastAPI)**: Dedicated service for LLM calls, PDF processing, embeddings, and content generation
- **Database (PostgreSQL + pgvector)**: Stores user data, materials, vectors, and progress
- Clear separation of concerns enables independent scaling and deployment

---

## How It Works

### 1. Upload Materials
Upload your files (PDF/DOCX/PPTX/DOC lecture notes, textbooks, past exams). The upload API verifies extension, MIME type, and file signature before storage. Valid materials are then chunked into searchable sections with embeddings.

### 2. Extract Topics
AI analyzes validated materials when you trigger extraction, then proposes key learning topics for review. Confirm the topic list before generating study content.

### 3. Generate Study Content
For each topic, generate:
- **Notes**: Comprehensive study guides with citations
- **Examples**: Solved problems with step-by-step explanations
- **Practice**: Interactive problems with hints
- **Quizzes**: Multiple question types with instant feedback

### 4. Practice & Review
- Click "Practice More" for unlimited fresh content
- Take quizzes multiple times with different questions
- Track your scores and improvement over time

### 5. Take Sample Exams
- Select topics to include
- Configure question count, duration, and difficulty
- Take timed exams with countdown timer
- Get AI-graded results with detailed feedback

### 6. Voice Coach — Real-Time Oral Exam Prep
- **Launch a Topic Drill**: Start a structured Q&A session for any topic with real-time voice interaction
- **Choose Your Learning Style**:
  - **Oral Q&A**: One question at a time with answer checking and feedback
  - **Guided Notes**: Coach explains concepts first, then checks understanding
  - **Topic Conversation**: Free-form discussion anchored to the topic
- **Voice Sprint Mode**: Rapid-fire drills across your weakest topics at the project level
- **Concept-Only Focus**: Automatically filters out math/calculations—perfect for oral exams focusing on intuition and reasoning
- **Performance Tracking**: Monitor latency metrics (TTFT/TTFA) and session progress
- **Language Support**: English-first with optional auto-detection for multilingual learners

---

## Content Formatting & Rendering

StudyBuddy intelligently renders all learning content with proper formatting for STEM subjects:

### Math & Equations
- **LaTeX support** via KaTeX for fast, beautiful math typesetting
- Inline math: `$E = mc^2$` → $E = mc^2$
- Display math: `$$\int_0^1 f(x)\,dx$$` → $$\int_0^1 f(x)\,dx$$
- Chemistry: `$2H_2 + O_2 \to 2H_2O$` → $2H_2 + O_2 \to 2H_2O$

### Code Highlighting
- **Syntax highlighting** via Prism for all major languages
- Fenced code blocks with language detection: \`\`\`python, \`\`\`c, \`\`\`javascript
- Inline code formatting for identifiers and short expressions

### Smart Content Normalization
- Automatic paragraph breaks in dense prose
- Escaped newline conversion for proper line breaks
- Consistent rendering across notes, examples, quizzes, and exams
- LLM prompts explicitly enforce proper markdown formatting

**All content fields** (questions, explanations, solutions, notes) support:
- Full markdown (headings, lists, tables, blockquotes)
- LaTeX math expressions (inline and display)
- Fenced code blocks with syntax highlighting
- Proper line breaks and paragraph spacing

---

## Project Structure

```
study_buddy/
├── frontend/                    # Next.js application
│   ├── src/
│   │   ├── app/                # App Router pages & API routes
│   │   │   ├── dashboard/      # Main dashboard
│   │   │   ├── projects/       # Project pages
│   │   │   ├── exams/          # Exam pages
│   │   │   └── api/            # Backend API routes
│   │   ├── components/         # React components
│   │   │   ├── dashboard/
│   │   │   ├── projects/
│   │   │   ├── learning/       # Learning interface
│   │   │   ├── exams/          # Exam components
│   │   │   └── ui/             # Reusable UI components
│   │   └── lib/                # Utilities, DB, Auth
│   └── prisma/                 # Database schema
│
├── ai-service/                  # Python AI microservice
│   ├── app/
│   │   ├── api/routes/         # FastAPI endpoints
│   │   ├── services/           # Business logic
│   │   │   ├── llm/            # LLM abstraction layer
│   │   │   ├── document_processor/
│   │   │   ├── content_generator/
│   │   │   ├── exam_generator.py
│   │   │   └── exam_grader.py
│   │   ├── models/             # Pydantic models
│   │   └── db/                 # Database utilities
│   └── tests/                  # Unit tests
│
├── .github/workflows/           # CI/CD pipelines
├── docker-compose.yml          # Local development setup
└── README.md                   # This file
```

---

## Environment Variables

### Required
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

### Optional
```env
# Google OAuth (for social login)
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...

# Anthropic (alternative to OpenAI)
ANTHROPIC_API_KEY=sk-ant-...

# GCP (for production deployment)
GCS_BUCKET=studybuddy-materials
GCS_PROJECT_ID=your-project-id
ENABLE_GCS_STORAGE=true
ENABLE_CLOUD_TASKS=true

# Voice Coach (AI service)
OPENAI_MODEL=gpt-5-mini
OPENAI_MINI_MODEL=gpt-5-mini
OPENAI_REALTIME_MODEL=gpt-realtime-mini
OPENAI_REALTIME_VOICE=marin
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
```

---

## Testing

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

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Author

**Harish Manoharan**
- GitHub: [@harishm17](https://github.com/harishm17)
- LinkedIn: [linkedin.com/in/harishm17](https://linkedin.com/in/harishm17)
- Email: harish.manoharan@utdallas.edu
- Portfolio: [harishm17.github.io](https://harishm17.github.io)
