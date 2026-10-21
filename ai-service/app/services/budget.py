"""The per-user daily LLM budget, shared by background jobs and chat.

Spend is read from the `llm_usage_events` ledger, which is append-only: a row is written when a
job attempt or a chat answer has cost something, and nothing deletes it when the job, thread or
project it came from is deleted (only deleting the user does). So removing things cannot lower
the day's total. A "day" is the current UTC day. The check runs before a call starts, so one
call can end a little over the cap.
"""
import logging
import uuid
from typing import Optional

from app.config import settings
from app.db.connection import UTC_NOW, execute_one, execute_update

logger = logging.getLogger(__name__)


async def record_usage_event(
    *,
    user_id: str,
    project_id: Optional[str],
    source: str,
    source_id: str,
    models: str,
    input_tokens: int,
    output_tokens: int,
    cost_usd: float,
) -> None:
    """Append one row to the ledger. `source` is 'job' or 'chat'; nothing is written for a call
    that cost nothing. Never raises: a ledger failure must not fail the work that was billed
    (a retry would bill it again), so it is logged loudly instead."""
    if cost_usd <= 0 and input_tokens <= 0 and output_tokens <= 0:
        return
    try:
        await execute_update(
            f"""
            INSERT INTO llm_usage_events
                (id, user_id, project_id, source, source_id, models,
                 input_tokens, output_tokens, cost_usd, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, {UTC_NOW})
            """,
            uuid.uuid4().hex,
            user_id,
            project_id,
            source,
            source_id,
            models,
            input_tokens,
            output_tokens,
            cost_usd,
        )
    except Exception:
        logger.exception(
            "Could not record %s usage (user %s, source %s, $%.6f): it will not count toward the daily budget",
            source, user_id, source_id, cost_usd,
        )


async def spent_today_usd(user_id: str) -> float:
    """What the user's jobs and chat answers have cost since midnight UTC."""
    row = await execute_one(
        f"""
        SELECT COALESCE(SUM(cost_usd), 0)::float8 AS spent
        FROM llm_usage_events
        WHERE user_id = $1
          AND created_at >= date_trunc('day', {UTC_NOW})
        """,
        user_id,
    )
    return float(row["spent"]) if row else 0.0


async def over_budget_message(user_id: str) -> Optional[str]:
    """None while the user may start another LLM call; otherwise what to tell them."""
    budget = settings.DAILY_LLM_BUDGET_USD
    if budget <= 0:
        return None
    spent = await spent_today_usd(user_id)
    if spent < budget:
        return None
    # The dollar figures are for logs and the job's error message. Students never see them: the
    # frontend shows its own copy for LLM_DAILY_BUDGET, with the reset time in their timezone.
    message = (
        f"Daily AI usage limit reached (${spent:.2f} of ${budget:.2f} used today, UTC). "
        "It is available again after midnight UTC."
    )
    logger.info("User %s is over the daily AI budget: %s", user_id, message)
    return message
