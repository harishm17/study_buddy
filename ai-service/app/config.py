"""Configuration settings for AI service."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    DATABASE_URL: str

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

    # GCP (optional, can use local storage)
    GCS_BUCKET: str = ""
    GCS_BUCKET_NAME: str = ""  # Alternative name used in some configs
    GCS_PROJECT_ID: str = ""

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
