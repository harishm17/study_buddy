"""Configuration settings for AI service."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    DATABASE_URL: str

    # LLM Configuration
    LLM_PROVIDER: str = "openai"  # openai or anthropic

    # OpenAI
    OPENAI_API_KEY: str
    OPENAI_MODEL: str = "gpt-5-mini"
    OPENAI_MINI_MODEL: str = "gpt-5-mini"
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"
    OPENAI_REALTIME_MODEL: str = "gpt-realtime-mini"
    OPENAI_REALTIME_VOICE: str = "marin"
    OPENAI_TRANSCRIPTION_MODEL: str = "gpt-4o-mini-transcribe"

    # Anthropic (optional)
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-sonnet-4-20250514"
    ANTHROPIC_MINI_MODEL: str = "claude-3-5-haiku-20241022"

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


# Global settings instance
settings = Settings()
