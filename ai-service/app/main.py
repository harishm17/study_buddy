"""Main FastAPI application for StudyBuddy AI service."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import health
from app.config import settings

# Create FastAPI app
app = FastAPI(
    title="StudyBuddy AI Service",
    description="AI microservice for document processing, content generation, and exam grading",
    version="0.1.0",
    docs_url="/docs" if settings.is_development else None,
    redoc_url="/redoc" if settings.is_development else None,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.is_development else [settings.AI_SERVICE_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, tags=["Health"])

# Import jobs router
from app.api.routes import jobs
app.include_router(jobs.router, tags=["Jobs"])


@app.on_event("startup")
async def startup_event():
    """Initialize services on startup."""
    print(f"🚀 StudyBuddy AI Service starting in {settings.ENVIRONMENT} mode")
    print(f"📊 LLM Provider: {settings.LLM_PROVIDER}")
    print(f"🗄️  Database: {settings.DATABASE_URL.split('@')[1] if '@' in settings.DATABASE_URL else 'configured'}")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    print("👋 StudyBuddy AI Service shutting down")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.is_development,
    )
