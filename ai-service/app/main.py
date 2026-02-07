"""Main FastAPI application for StudyBuddy AI service."""
from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import health
from app.config import settings
from app.logging_utils import configure_sensitive_data_redaction

configure_sensitive_data_redaction()
logger = logging.getLogger(__name__)

async def _run_startup_checks() -> None:
    """Initialize services on startup."""
    logger.info("StudyBuddy AI Service starting in %s mode", settings.ENVIRONMENT)
    logger.info("LLM Provider: %s", settings.LLM_PROVIDER)
    db_info = settings.DATABASE_URL.split('@')[1] if '@' in settings.DATABASE_URL else 'configured'
    logger.info("Database: %s", db_info)

    # Validate database connection (non-blocking for Cloud Run health checks)
    # Log warnings but don't crash if DB is temporarily unavailable
    try:
        from app.db.connection import get_db_pool

        pool = await get_db_pool()
        await pool.fetchval("SELECT 1")
        logger.info("Database connection validated")

        # Check if pgvector extension exists
        extension_exists = await pool.fetchval(
            "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector')"
        )
        if not extension_exists:
            logger.warning("pgvector extension not found. Vector searches will not work.")
        else:
            logger.info("pgvector extension confirmed")
    except Exception as e:
        # Log error but don't raise - allow service to start for health checks
        # Database connections can be retried on first request
        logger.warning("Database connection failed: %s", e)
        logger.warning(
            "Service will start, but database operations may fail until connection is established."
        )


async def _run_shutdown() -> None:
    """Cleanup on shutdown."""
    from app.db.connection import close_db_pool

    await close_db_pool()
    logger.info("StudyBuddy AI Service shutting down")


@asynccontextmanager
async def lifespan(_: FastAPI):
    await _run_startup_checks()
    try:
        yield
    finally:
        await _run_shutdown()


# Create FastAPI app
app = FastAPI(
    title="StudyBuddy AI Service",
    description="AI microservice for document processing, content generation, and exam grading",
    version="0.1.0",
    docs_url="/docs" if settings.is_development else None,
    redoc_url="/redoc" if settings.is_development else None,
    lifespan=lifespan,
)

# CORS middleware
# In production, allow requests from frontend URL
# In development, allow all origins for ease of testing
frontend_url = getattr(settings, "FRONTEND_URL", None)
if settings.is_development:
    dev_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
    if frontend_url:
        dev_origins.append(frontend_url)
    # Deduplicate while preserving order
    allowed_origins = list(dict.fromkeys(dev_origins))
else:
    allowed_origins = [frontend_url] if frontend_url else [settings.AI_SERVICE_URL]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, tags=["Health"])

# Import jobs router
from app.api.routes import jobs
app.include_router(jobs.router, tags=["Jobs"])

# Voice coach routes
from app.api.routes import voice
app.include_router(voice.router, tags=["Voice"])

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.is_development,
    )
