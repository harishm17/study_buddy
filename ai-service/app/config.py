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

    # Voice coach turns (POST /voice/turn): the fast tier at low effort, short replies. The browser
    # does speech-to-text and text-to-speech; the model only sees text.
    VOICE_EFFORT: str = "low"
    VOICE_MAX_TOKENS: int = 800

    # "Ask your materials" chat. Answers are written by the CHAT_TIER model at CHAT_EFFORT.
    CHAT_TIER: str = "main"  # main or fast
    CHAT_EFFORT: str = "low"
    CHAT_MAX_TOKENS: int = 4000
    # Excerpts offered to the model per question, and the cosine similarity below which a chunk
    # is not offered at all. A question is shorter than a topic query, so its floor is lower
    # than retrieval's MIN_SIMILARITY. When nothing clears it the answer is "not in your
    # materials" and no model call is made.
    CHAT_TOP_K: int = 12
    CHAT_MIN_SIMILARITY: float = 0.5
    CHAT_MAX_QUESTION_CHARS: int = 2000
    # Earlier turns sent along with a question, and how much of each is kept.
    CHAT_HISTORY_TURNS: int = 6
    CHAT_HISTORY_TURN_CHARS: int = 3000

    # Embeddings. "local" runs a small ONNX model in-process (no API key, no per-call cost);
    # "openai" uses text-embedding-3-small and needs OPENAI_API_KEY.
    # The chunk column is vector(384) (EMBEDDING_DIMENSIONS in embeddings/generator.py), so only
    # 384-number models fit; after changing the model, re-embed with scripts/reembed_chunks.py.
    EMBEDDING_PROVIDER: str = "local"
    EMBEDDING_MODEL: str = "BAAI/bge-small-en-v1.5"
    EMBEDDING_CACHE_DIR: str = ""

    # OpenAI: only the optional "openai" embedding provider.
    OPENAI_API_KEY: str = ""
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"

    # Processing control
    ENABLE_PROCESSING: bool = True
    AUTO_EXTRACT_TOPICS_ON_CHUNK: bool = True

    # Jobs. A job is claimed with a lease that its handler keeps extending; the reaper
    # takes over jobs whose lease ran out. 0 turns the periodic reaper off (POST /jobs/reap
    # still works).
    JOB_REAPER_INTERVAL_SECONDS: float = 60.0
    # A job still pending (never claimed) this long after creation is dispatched again, then
    # again after twice, three times this long, and so on. After JOB_MAX_REDISPATCHES
    # re-dispatches it is failed with JOB_DISPATCH_FAILED.
    JOB_PENDING_REDISPATCH_SECONDS: float = 120.0
    JOB_MAX_REDISPATCHES: int = 3
    # Most a user's LLM-backed jobs and chat answers may cost per UTC day, from the stored
    # costs. 0 turns the cap off.
    DAILY_LLM_BUDGET_USD: float = 3.00

    # Dispatching jobs to this service. With ENABLE_CLOUD_TASKS the service creates Cloud
    # Tasks (project, location and queue below); otherwise it posts to AI_SERVICE_URL itself.
    ENABLE_CLOUD_TASKS: bool = False
    CLOUD_TASKS_PROJECT_ID: str = ""  # falls back to GCS_PROJECT_ID
    CLOUD_TASKS_LOCATION: str = "us-central1"
    CLOUD_TASKS_QUEUE: str = "studybuddy-jobs"

    # S3-compatible bucket (Railway Buckets, AWS S3, R2, MinIO) for `s3://` material paths.
    S3_ENDPOINT: str = ""
    S3_REGION: str = "auto"
    S3_ACCESS_KEY_ID: str = ""
    S3_SECRET_ACCESS_KEY: str = ""
    S3_FORCE_PATH_STYLE: bool = False

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
        """The voice coach is a Claude conversation, so it needs the LLM to be configured."""
        return self.llm_configured


# Global settings instance
settings = Settings()
