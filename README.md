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
- **Upload PDFs**: Lecture notes, textbook chapters, sample exams
- **Automatic Validation**: AI checks content quality and relevance
- **Intelligent Chunking**: Breaks down materials into semantic sections
- **Vector Search**: pgvector-powered semantic search for relevant content retrieval

### AI-Powered Content Generation
- **Study Notes**: Comprehensive markdown notes synthesized from all materials
- **Solved Examples**: Step-by-step problem walkthroughs with explanations
- **Interactive Practice**: Multi-step problems with hints and real-time validation
- **Topic Quizzes**: MCQ, short answer, numerical, and true/false questions
- **Sample Exams**: Full-length timed exams combining multiple topics

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

### Modern User Experience
- Responsive design optimized for desktop and mobile
- Real-time content generation with loading states
- Countdown timers for timed exams with auto-submit
- Question navigator with completion indicators

---

## Demo

### Video Walkthrough

### Screenshots

**Material Upload & Processing**
![Upload Interface](./docs/screenshots/upload.png)
*Upload PDFs and see automatic topic extraction*

**Quiz Generation & Taking**
![Quiz Interface](./docs/screenshots/quiz.png)
*AI-generated quizzes with multiple question types*

**Exam Grading with Feedback**
![Grading Results](./docs/screenshots/grading.png)
*Instant grading with detailed explanations*

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

## Quick Start

### Prerequisites
- **Node.js** 20+ and **npm**
- **Python** 3.11+
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
   # Frontend
   cd frontend
   cp .env.example .env
   # Edit .env and add your keys

   # AI Service
   cd ../ai-service
   cp .env.example .env
   # Edit .env and add your OpenAI API key
   ```

3. **Start with Docker Compose** (Easiest)
   ```bash
   docker-compose up --build
   ```

   Services will be available at:
   - Frontend: http://localhost:3000
   - AI Service: http://localhost:8000
   - API Docs: http://localhost:8000/docs

4. **Run database migrations**
   ```bash
   cd frontend
   npm install
   npx prisma db push
   ```

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
python -m venv venv
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
- **[React-markdown](https://github.com/remarkjs/react-markdown)** - Markdown rendering with syntax highlighting

### Backend (AI Service)
- **[FastAPI](https://fastapi.tiangolo.com/)** - Modern Python web framework
- **[PyMuPDF](https://pymupdf.readthedocs.io/)** - PDF text extraction
- **[OpenAI API](https://platform.openai.com/)** - GPT-4 for content generation
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
              │ • GPT-4o       │
              │ • Embeddings   │
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
- No HTTP timeout issues

---

## How It Works

### 1. Upload Materials
Upload your PDFs (lecture notes, textbooks, past exams). AI validates and chunks them into searchable sections with embeddings.

### 2. Extract Topics
AI analyzes all materials and automatically identifies key learning topics. Review and confirm the topics extracted.

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
```

### Optional
```env
# Google OAuth (for social login)
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...

# Anthropic (alternative to OpenAI)
ANTHROPIC_API_KEY=sk-ant-...

# GCP (for production deployment)
GCS_BUCKET_NAME=studybuddy-materials
GCP_PROJECT_ID=your-project-id
```

---

## Testing

```bash
# Frontend tests
cd frontend
npm test

# AI Service tests
cd ai-service
pytest
pytest --cov=app tests/  # With coverage
```

---

## Deployment

### Option 1: Railway + Vercel + Supabase (Recommended for MVPs)

**Architecture**:
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Vercel    │────▶│   Railway   │────▶│  Supabase   │
│ (Frontend)  │     │ (AI Service)│     │ (PostgreSQL)│
└─────────────┘     └─────────────┘     └─────────────┘
```

#### 1. Deploy Database (Supabase)

```bash
# Create Supabase project at https://supabase.com
# Enable pgvector extension in SQL Editor:
CREATE EXTENSION IF NOT EXISTS vector;

# Apply Prisma migrations
cd frontend
npx prisma db push
```

#### 2. Deploy AI Service (Railway)

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and initialize
railway login
cd ai-service
railway init

# Set environment variables in Railway dashboard:
# - OPENAI_API_KEY
# - DATABASE_URL (copy from Supabase)
# - ENVIRONMENT=production

# Deploy
railway up
```

Config file: `ai-service/railway.toml`

#### 3. Deploy Frontend (Vercel)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd frontend
vercel

# Set environment variables in Vercel dashboard:
# - DATABASE_URL (Supabase connection string)
# - NEXTAUTH_SECRET (generate: openssl rand -base64 32)
# - NEXTAUTH_URL (your Vercel domain)
# - AI_SERVICE_URL (Railway service URL)
```

Config file: `frontend/vercel.json`

**Total Cost**: ~$5-25/month (free tiers available)

---

### Option 2: Google Cloud Run (Production Scale)

1. **Enable required APIs**
   ```bash
   gcloud services enable run.googleapis.com
   gcloud services enable sqladmin.googleapis.com
   gcloud services enable storage.googleapis.com
   ```

2. **Create Cloud SQL instance**
   ```bash
   gcloud sql instances create studybuddy-db \
     --database-version=POSTGRES_15 \
     --tier=db-f1-micro \
     --region=us-central1
   ```

3. **Configure GitHub Actions**
   - Add repository secrets (see `.github/workflows/deploy.yml`)
   - Push to `main` branch triggers automatic deployment

4. **Access your deployed app**
   - Frontend: `https://studybuddy-frontend-xxx.run.app`
   - AI Service: `https://studybuddy-ai-service-xxx.run.app`

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
