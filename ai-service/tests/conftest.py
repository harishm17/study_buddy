import os


def pytest_configure():
    os.environ.setdefault("DATABASE_URL", "postgresql://user:pass@localhost:5432/studybuddy")
    os.environ.setdefault("OPENAI_API_KEY", "test-key")
