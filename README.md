<div align="center">

# StudyBuddy

### AI-Powered Exam Prep with RAG, Voice Coaching & Intelligent Grading

Transform lecture slides, textbooks, and past papers into structured notes, unlimited practice problems, mock exams, and real-time voice coaching—all with proper LaTeX math and code formatting.

[![Live Demo](https://img.shields.io/badge/Live_Demo-Click_Here-blue?style=for-the-badge)](https://studybuddy-web-926688152635.us-central1.run.app/)
[![MIT License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js_15-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)

[Features](#features) • [Demo](#demo) • [Quick Start](#quick-start) • [Architecture](#architecture) • [Docs](#documentation)

</div>

---

## Demo

**Live Application:** [https://studybuddy-web-926688152635.us-central1.run.app/](https://studybuddy-web-926688152635.us-central1.run.app/)

Try the full application deployed on Google Cloud Run! Sign up with email or Google OAuth, upload study materials, and experience AI-powered learning.

### What to Try
1. **Upload Materials** - Drop in PDFs, DOCX, or PPTX files
2. **Extract Topics** - AI automatically identifies key learning topics
3. **Generate Content** - Get notes, examples, quizzes, and practice problems
4. **Voice Coach** - Real-time voice Q&A for conceptual understanding
5. **Mock Exams** - Take timed exams with instant AI grading

---

## Overview

**StudyBuddy** is a comprehensive learning platform designed for university students preparing for exams. Upload your lecture notes, textbooks, and past exams—let AI create personalized study guides, practice problems, mock exams, and real-time voice coaching.

### The Problem
- **Time-consuming**: Creating study materials from multiple sources takes hours
- **No personalized practice**: Generic study guides don't adapt to your weak areas
- **Limited feedback**: Hard to know if you're actually understanding concepts
- **Expensive tutoring**: Professional help costs hundreds per hour

### The Solution
**AI-powered study assistant** that transforms your materials into:
- **Structured study content** - Notes, examples, quizzes with proper citations
- **Unlimited practice** - Generate fresh problems on-demand (not reshuffled)
- **Real-time voice coaching** - Oral exam prep with instant feedback
- **Intelligent grading** - AI evaluates answers with detailed explanations
- **70-85% cost reduction** - Smart retrieval instead of processing entire documents

---

## Features

### Smart Material Processing
Upload PDFs, DOCX, PPTX, or DOC files → AI validates, chunks, and indexes with vector embeddings for semantic search

### AI-Powered Content Generation
Generate **study notes**, **solved examples**, **interactive practice**, **quizzes** (MCQ, short answer, numerical), and **full-length timed exams**—all with LaTeX math and code highlighting

### Unlimited Fresh Practice
Click **"Add Examples"** or **"Practice More"** to generate completely different problems (not reshuffled). Each regeneration creates unique content using variation seeds

### Intelligent AI Grading
- Instant grading for MCQ/numerical questions
- Semantic evaluation for short answers with partial credit
- Detailed feedback and explanations for every question
- Progress tracking across multiple attempts

### Voice Coach — Real-Time Oral Exam Prep
- **Real-time voice interaction** via WebRTC (OpenAI Realtime API)
- **Three learning styles**: Oral Q&A, guided notes, or free conversation
- **Concept-only focus**: Automatically filters math/calculations—perfect for oral exams
- **Topic Drill** or **Voice Sprint** modes for targeted practice
- **Instant feedback** with key-point grading

### Progress Tracking
Visual progress bars, attempt history, and performance metrics—all inline, no overwhelming dashboards

### Beautiful Math & Code Rendering
- **LaTeX support** via KaTeX for equations: $E = mc^2$, $\int_0^1 f(x)\,dx$
- **Syntax highlighting** via Prism for code blocks in all major languages
- **Smart formatting** - Automatic paragraph breaks, proper line spacing

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

#### 1. Hybrid Search Architecture (70-85% Cost Reduction)
Instead of sending entire textbooks to AI:
- **Semantic Chunking**: PDFs → 500-1000 token chunks with vector embeddings
- **Hybrid Retrieval**: Keyword + vector similarity search for relevant sections
- **Smart Context**: Send only top 15-24 chunks instead of entire documents
- **Result**: Typical textbook (50,000 tokens) costs $0.02-0.03 instead of $0.10-0.15 per request

#### 2. True Content Variation (Not Reshuffling)
- Each "Practice More" generates **completely different content**
- Uses timestamp-based variation seeds for uniqueness
- Fresh scenarios, problem setups, and question formulations
- Track improvement across attempts with unique content

#### 3. Async Job Processing
- Long tasks (PDF processing, content generation) run asynchronously
- Production: Google Cloud Tasks with retry logic
- Development: Direct HTTP with automatic retries
- Frontend polls with exponential backoff
- No HTTP timeout issues—jobs run for minutes without blocking UI

#### 4. Concept-Only Voice Coach
- Intentionally avoids math, equations, calculations
- Focuses on: definitions, intuition, relationships, trade-offs
- Regex filtering + LLM instructions enforce concept-only content
- Perfect for oral exams where reasoning matters over computation

#### 5. Microservices Architecture
- **Frontend (Next.js)**: UI, auth, API routing, job orchestration
- **AI Service (FastAPI)**: LLM calls, PDF processing, embeddings, content generation
- **Database (PostgreSQL + pgvector)**: User data, materials, vectors, progress
- Independent scaling and deployment

---

## Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| [Next.js 15](https://nextjs.org/) | React framework with App Router |
| [TypeScript](https://www.typescriptlang.org/) | Type-safe JavaScript |
| [Prisma](https://www.prisma.io/) | Type-safe ORM for PostgreSQL |
| [NextAuth.js](https://next-auth.js.org/) | Authentication (Google OAuth) |
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

1. **Upload Materials** → Upload PDFs/DOCX/PPTX. API verifies files, then chunks into searchable sections
2. **Extract Topics** → AI analyzes materials and proposes key learning topics for review
3. **Generate Content** → For each topic: notes, solved examples, interactive practice, quizzes
4. **Practice & Review** → Unlimited fresh content, track scores, monitor improvement
5. **Take Exams** → Timed mock exams with AI grading and detailed feedback
6. **Voice Coach** → Real-time voice Q&A for conceptual understanding

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
- Workflow file: `.github/workflows/ci.yml`

### Evaluation Harness
Track answer quality as prompts/models change:
- **Faithfulness**: Answers grounded in retrieved chunks
- **Context precision**: % of retrieved chunks used
- **Quiz accuracy**: Generated questions align with source material

See `evals/README.md` for evaluation plan.

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
[![Email](https://img.shields.io/badge/Email-harish.manoharan@utdallas.edu-D14836?style=for-the-badge&logo=gmail&logoColor=white)](mailto:harish.manoharan@utdallas.edu)

---

<div align="center">

**[⬆ back to top](#studybuddy)**

</div>
