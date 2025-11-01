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
# In production, allow requests from frontend URL
# In development, allow all origins for ease of testing
frontend_url = getattr(settings, "FRONTEND_URL", None)
allowed_origins = (
    ["*"] if settings.is_development 
    else ([frontend_url] if frontend_url else [settings.AI_SERVICE_URL])
)

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


@app.on_event("startup")
async def startup_event():
    """Initialize services on startup."""
    print(f"🚀 StudyBuddy AI Service starting in {settings.ENVIRONMENT} mode")
    print(f"📊 LLM Provider: {settings.LLM_PROVIDER}")
    db_info = settings.DATABASE_URL.split('@')[1] if '@' in settings.DATABASE_URL else 'configured'
    print(f"🗄️  Database: {db_info}")
    
    # Validate database connection (non-blocking for Cloud Run health checks)
    # Log warnings but don't crash if DB is temporarily unavailable
    try:
        from app.db.connection import get_db_pool
        pool = await get_db_pool()
        await pool.fetchval("SELECT 1")
        print("✅ Database connection validated")
        
        # Check if pgvector extension exists
        extension_exists = await pool.fetchval(
            "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector')"
        )
        if not extension_exists:
            print("⚠️  WARNING: pgvector extension not found. Vector searches will not work.")
        else:
            print("✅ pgvector extension confirmed")
    except Exception as e:
        # Log error but don't raise - allow service to start for health checks
        # Database connections can be retried on first request
        print(f"⚠️  WARNING: Database connection failed: {e}")
        print("⚠️  Service will start, but database operations may fail until connection is established.")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    from app.db.connection import close_db_pool
    
    # Close database connection pool
    await close_db_pool()
    
    print("👋 StudyBuddy AI Service shutting down")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.is_development,
    )
