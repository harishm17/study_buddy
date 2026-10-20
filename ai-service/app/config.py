"""Configuration settings for AI service."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    DATABASE_URL: str
    DB_POOL_MAX_SIZE: int = 20
    DB_COMMAND_TIMEOUT_SECONDS: float = 60.0

    # LLM: Claude for all text generation and grading.
    # "mock" returns schema-valid placeholder output with no API calls (local dev, e2e runs).
    LLM_PROVIDER: str = "anthropic"  # anthropic or mock
    ANTHROPIC_API_KEY: str = ""
    # Notes, examples, quizzes and exams.
    ANTHROPIC_MODEL: str = "claude-opus-5-5"
    # Validation, topic extraction, short-answer grading and voice drills.
    ANTHROPIC_FAST_MODEL: str = "claude-haiku-5-5"
    # Effort controls how much the model thinks; thinking tokens are billed as output.
    ANTHROPIC_EFFORT: str = "medium"
    ANTHROPIC_FAST_EFFORT: str = "low"
    LLM_TIMEOUT_SECONDS: float = 180.0
    LLM_MAX_RETRIES: int = 2

    # Embeddings. "local" runs a small ONNX model in-process (no API key, no per-call cost);
    # "openai" uses text-embedding-3-small and needs OPENAI_API_KEY.
    # Changing the provider or model changes the vector size: re-embed with scripts/reembed_chunks.py.
    EMBEDDING_PROVIDER: str = "local"
    EMBEDDING_MODEL: str = "BAAI/bge-small-en-v1.5"
    EMBEDDING_CACHE_DIR: str = ""

    # OpenAI: only the realtime voice coach (and the optional "openai" embedding provider).
    # Voice is turned off when this is empty.
    OPENAI_API_KEY: str = ""
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"
    OPENAI_REALTIME_MODEL: str = "gpt-realtime-mini"
    OPENAI_REALTIME_VOICE: str = "marin"
    OPENAI_TRANSCRIPTION_MODEL: str = "gpt-4o-mini-transcribe"

    # Processing control
    ENABLE_PROCESSING: bool = True
    AUTO_EXTRACT_TOPICS_ON_CHUNK: bool = True

    # Jobs. A job is claimed with a lease that its handler keeps extending; the reaper
    # takes over jobs whose lease ran out. 0 turns the periodic reaper off (POST /jobs/reap
    # still works).
    JOB_REAPER_INTERVAL_SECONDS: float = 60.0
    # Most an LLM-backed job may spend per user per UTC day, from the stored job costs.
    # 0 turns the cap off.
    DAILY_LLM_BUDGET_USD: float = 3.00

    # Dispatching jobs to this service. With ENABLE_CLOUD_TASKS the service creates Cloud
    # Tasks (project, location and queue below); otherwise it posts to AI_SERVICE_URL itself.
    ENABLE_CLOUD_TASKS: bool = False
    CLOUD_TASKS_PROJECT_ID: str = ""  # falls back to GCS_PROJECT_ID
    CLOUD_TASKS_LOCATION: str = "us-central1"
    CLOUD_TASKS_QUEUE: str = "studybuddy-jobs"

    # GCP (optional, can use local storage)
    GCS_BUCKET: str = ""
    GCS_BUCKET_NAME: str = ""  # Alternative name used in some configs
    GCS_PROJECT_ID: str = ""
    # Where the frontend writes uploads when GCS is off (or an upload fell back to local disk).
    LOCAL_UPLOADS_DIR: str = "/data/uploads"

    # Service Configuration
    AI_SERVICE_URL: str = "http://localhost:8000"
    FRONTEND_URL: str = "http://localhost:3000"  # Frontend URL for CORS
    ENVIRONMENT: str = "development"
    AI_INTERNAL_TOKEN: str = ""

    @property
    def is_production(self) -> bool:
        """Check if running in production."""
        return self.ENVIRONMENT == "production"

    @property
    def is_development(self) -> bool:
        """Check if running in development."""
        return self.ENVIRONMENT == "development"

    @property
    def cloud_tasks_project(self) -> str:
        return self.CLOUD_TASKS_PROJECT_ID or self.GCS_PROJECT_ID

    @property
    def gcs_configured(self) -> bool:
        """Whether uploads can be fetched from a GCS bucket."""
        return bool(self.GCS_BUCKET or self.GCS_BUCKET_NAME)

    @property
    def llm_configured(self) -> bool:
        """Whether text generation can run (a key is set, or the mock provider is on)."""
        provider = self.LLM_PROVIDER.lower()
        return provider == "mock" or (provider == "anthropic" and bool(self.ANTHROPIC_API_KEY))

    @property
    def voice_enabled(self) -> bool:
        """The realtime voice coach needs an OpenAI key."""
        return bool(self.OPENAI_API_KEY)


# Global settings instance
settings = Settings()
