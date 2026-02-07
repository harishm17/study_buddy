<div align="center">

# StudyBuddy — Exam Prep RAG & Quiz Generator

### End-to-end study workflow: retrieval, generation, practice, grading

Turn lecture slides, books, and past papers into structured notes, quizzes, and practice exams with an evaluation-ready RAG pipeline.

[Why this exists](#-overview) • [Demo](#-demo) • [Evaluation](#-evaluation) • [Quick Start](#-quick-start) • [Architecture](#-architecture)

</div>

---

## Overview

**StudyBuddy** is a comprehensive learning platform designed for university students preparing for exams. Upload your lecture notes, textbooks, and past exams—let AI do the heavy lifting of creating study guides, practice problems, and mock exams tailored to your learning needs.

### The Problem
- Students struggle to synthesize information from multiple sources
- Limited time to create comprehensive study materials
- Difficulty identifying key concepts and testing themselves effectively
- No personalized practice with instant feedback

### The Solution
StudyBuddy uses AI to:
- Extract key topics from your materials
- Generate comprehensive study notes with citations
- Create unlimited practice problems and quizzes
- Build full-length mock exams across multiple topics
- Grade your work with detailed explanations and feedback

---

## Key Features

### Smart Material Processing
- **Upload Documents**: PDF, DOCX, PPTX, and DOC lecture notes, textbook chapters, and sample exams
- **Automatic Validation**: AI checks content quality and relevance
- **Intelligent Chunking**: Breaks down materials into semantic sections
- **Vector Search**: pgvector-powered semantic search for relevant content retrieval

### AI-Powered Content Generation
- **Study Notes**: Comprehensive markdown notes with LaTeX math and code highlighting
- **Solved Examples**: Step-by-step problem walkthroughs with formatted work sections
- **Interactive Practice**: Multi-step problems with hints and real-time validation
- **Topic Quizzes**: MCQ, short answer, numerical, and true/false questions with markdown support
- **Sample Exams**: Full-length timed exams with proper rendering of code and equations

### Unlimited Practice with Regeneration
- Click **"Practice More"** to generate completely different problems
- **"New Questions"** creates fresh quiz variations—not just reshuffled
- Each regeneration uses variation seeds for truly unique content
- Track improvement across multiple attempts

### Intelligent AI Grading
- **Instant Grading**: MCQ, true/false, and numerical questions graded immediately
- **Short Answer AI**: Semantic evaluation with partial credit
- **Detailed Feedback**: Explanations for every question
- **Score Tracking**: Monitor progress over time

### Progress Tracking
- Visual progress bars per topic
- Quiz attempt history with best/average scores
- Exam performance tracking
- No overwhelming dashboards—just inline, actionable data

### Voice Coach (Concept-Only)
- **Oral exam drills** for each topic with real-time voice interaction
- **Concept-only enforcement**: no equations or calculations, just intuition and reasoning
- **Instant feedback** with key-point grading and hints
- **Voice sprint** mode for weakest topics (project-level)

### Modern User Experience
- Responsive design optimized for desktop and mobile
- Real-time content generation with loading states
- Countdown timers for timed exams with auto-submit
- Question navigator with completion indicators
- Rich content rendering with LaTeX math, code syntax highlighting, and markdown
- Proper formatting for STEM content (equations, chemical formulas, code snippets)

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
              │ • Realtime     │
              └────────────────┘
```

### Key Design Decisions

**Hybrid Search for Cost Efficiency:**
Instead of sending entire textbooks to AI (expensive & noisy):
1. Break PDFs into semantic chunks (500-1000 tokens)
2. Generate vector embeddings for each chunk
3. Use keyword + semantic search to find relevant sections
4. Send only top 10-15 chunks to LLM

**Result:** up to 85% cost reduction while maintaining quality

**Cost Comparison per Content Generation Request:**
```
Without Semantic Search (Full Documents):
████████████████████████████ $0.12

With Hybrid Search (Relevant Chunks Only):
████ $0.02

Savings: 85% ↓
```

**Content Regeneration with Variation:**
- Each "Practice More" click generates truly different content
- Uses `variation_seed` (timestamp) to ensure uniqueness
- LLM creates fresh scenarios, not just reshuffled questions

**Async Job Processing:**
- Long-running tasks (PDF processing, content generation) run async
- Frontend polls job status for real-time updates
- Polling has bounded timeouts so the UI does not stay in indefinite "processing" states
- Duplicate extraction requests are deduplicated while a job is already in flight
- No HTTP timeout issues

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

### 6. Voice Coach (Concept-Only)
- Launch a topic **Voice Drill** for oral exam prep
- Use **Voice Sprint** to drill weak topics across a project
- Concept-only by design (definitions, intuition, relationships, reasoning)

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
