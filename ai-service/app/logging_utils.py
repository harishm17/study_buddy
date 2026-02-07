"""Logging helpers for redacting sensitive values from runtime logs."""
from __future__ import annotations

import logging
import re
from typing import Any

from app.config import settings


_SECRET_TOKEN_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9_\-]{16,}"),
    re.compile(r"(Bearer\s+)[A-Za-z0-9\-._~+/]+=*", re.IGNORECASE),
]


def _redact_text(value: str) -> str:
    redacted = value

    # Redact known configured secrets first.
    for secret in (settings.OPENAI_API_KEY, settings.AI_INTERNAL_TOKEN):
        if secret:
            redacted = redacted.replace(secret, "[REDACTED]")

    # Redact token-like strings.
    for pattern in _SECRET_TOKEN_PATTERNS:
        if "Bearer" in pattern.pattern:
            redacted = pattern.sub(r"\1[REDACTED]", redacted)
        else:
            redacted = pattern.sub("sk-[REDACTED]", redacted)

    return redacted


def _redact_object(value: Any) -> Any:
    if isinstance(value, str):
        return _redact_text(value)
    if isinstance(value, tuple):
        return tuple(_redact_object(item) for item in value)
    if isinstance(value, list):
        return [_redact_object(item) for item in value]
    if isinstance(value, dict):
        return {key: _redact_object(item) for key, item in value.items()}
    return value


class SecretRedactionFilter(logging.Filter):
    """Redacts sensitive data from log messages and args."""

    def filter(self, record: logging.LogRecord) -> bool:  # noqa: D401
        if isinstance(record.msg, str):
            record.msg = _redact_text(record.msg)
        record.args = _redact_object(record.args)
        return True


def configure_sensitive_data_redaction() -> None:
    """Attach redaction filter to application and uvicorn loggers."""
    redaction_filter = SecretRedactionFilter()
    logger_names = ("", "uvicorn", "uvicorn.error", "uvicorn.access")

    for logger_name in logger_names:
        logger = logging.getLogger(logger_name)
        already_attached = any(
            isinstance(existing_filter, SecretRedactionFilter)
            for existing_filter in logger.filters
        )
        if not already_attached:
            logger.addFilter(redaction_filter)
