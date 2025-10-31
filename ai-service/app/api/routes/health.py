"""Health check endpoints."""
from fastapi import APIRouter

from app.config import settings

router = APIRouter()


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "studybuddy-ai",
        "environment": settings.ENVIRONMENT,
        "llm_provider": settings.LLM_PROVIDER,
    }


@router.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "StudyBuddy AI Service",
        "version": "0.1.0",
        "status": "running",
    }
