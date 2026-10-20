"""Job failures are classified by exception type, not by message text."""
import pytest
from fastapi import HTTPException

from app.api.routes.jobs import _classify_failure
from app.services.content_generator.context import NoSourceMaterialError
from app.services.llm.base import (
    LLMAuthError,
    LLMCreditError,
    LLMNotConfiguredError,
    LLMOutputError,
    LLMRateLimitError,
    LLMRefusalError,
    LLMUnavailableError,
)


@pytest.mark.parametrize(
    "error,expected",
    [
        (LLMNotConfiguredError("x"), ("LLM_NOT_CONFIGURED", False, 400)),
        (LLMAuthError("x"), ("LLM_AUTH_FAILED", False, 400)),
        (LLMCreditError("x"), ("LLM_CREDIT_EXHAUSTED", False, 400)),
        (LLMRefusalError("x"), ("LLM_REFUSED", False, 400)),
        (LLMRateLimitError("x"), ("LLM_RATE_LIMITED", True, 500)),
        (LLMUnavailableError("x"), ("LLM_UNAVAILABLE", True, 500)),
        (LLMOutputError("x"), ("LLM_BAD_OUTPUT", True, 500)),
        (NoSourceMaterialError("x"), ("NO_SOURCE_MATERIAL", False, 400)),
        (HTTPException(status_code=404, detail="Topic not found"), ("JOB_FAILED", False, 400)),
        (RuntimeError("database went away"), ("JOB_FAILED", True, 500)),
        # A message that merely mentions authentication is not an auth failure.
        (RuntimeError("authentication service timed out"), ("JOB_FAILED", True, 500)),
    ],
)
def test_classify_failure(error, expected):
    assert _classify_failure(error, "JOB_FAILED") == expected
