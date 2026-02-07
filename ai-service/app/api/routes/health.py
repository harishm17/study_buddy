"""Health check endpoints."""
from fastapi import APIRouter

from app.config import settings
from app.db.connection import get_db_pool

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


@router.get("/health/dependencies")
async def dependency_health_check():
    """Dependency-oriented health checks for deployment validation."""
    checks = []

    # Database reachability
    try:
        pool = await get_db_pool()
        await pool.fetchval("SELECT 1")
        checks.append({"name": "database", "status": "pass", "message": "Database reachable"})
    except Exception as exc:  # pragma: no cover - surfaced in runtime
        checks.append({
            "name": "database",
            "status": "fail",
            "message": f"Database connection failed: {exc}",
        })

    # OpenAI key presence
    if settings.OPENAI_API_KEY:
        checks.append({"name": "openai_key", "status": "pass", "message": "OPENAI_API_KEY configured"})
    else:
        checks.append({"name": "openai_key", "status": "fail", "message": "OPENAI_API_KEY missing"})

    # Internal auth token for frontend -> AI bridge
    if settings.AI_INTERNAL_TOKEN:
        checks.append({
            "name": "internal_token",
            "status": "pass",
            "message": "AI_INTERNAL_TOKEN configured",
        })
    else:
        checks.append({
            "name": "internal_token",
            "status": "warn",
            "message": "AI_INTERNAL_TOKEN not set (allowed in local/dev, not recommended in production)",
        })

    # Cloud storage mode sanity
    if settings.GCS_PROJECT_ID:
        checks.append({
            "name": "gcs_config",
            "status": "pass",
            "message": "GCS_PROJECT_ID configured",
        })
    else:
        checks.append({
            "name": "gcs_config",
            "status": "warn",
            "message": "GCS_PROJECT_ID missing (local file mode expected if frontend uses local storage)",
        })

    has_fail = any(check["status"] == "fail" for check in checks)
    has_warn = any(check["status"] == "warn" for check in checks)
    status = "unhealthy" if has_fail else ("degraded" if has_warn else "healthy")

    return {
        "status": status,
        "service": "studybuddy-ai",
        "environment": settings.ENVIRONMENT,
        "checks": checks,
    }


@router.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "StudyBuddy AI Service",
        "version": "0.1.0",
        "status": "running",
    }
