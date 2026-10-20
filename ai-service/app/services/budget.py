"""The per-user daily LLM budget, shared by background jobs and chat.

Spend is read from what was stored: `processing_jobs.llm_cost_usd` for generation, grading and
extraction, and `chat_messages.llm_cost_usd` for chat answers. A "day" is the current UTC day.
The check runs before a call starts, so one call can end a little over the cap.
"""
from typing import Optional

from app.config import settings
from app.db.connection import UTC_NOW, execute_one


async def spent_today_usd(user_id: str) -> float:
    """What the user's jobs and chat answers have cost since midnight UTC."""
    row = await execute_one(
        f"""
        SELECT
            (SELECT COALESCE(SUM(llm_cost_usd), 0)
               FROM processing_jobs
              WHERE user_id = $1
                AND created_at >= date_trunc('day', {UTC_NOW}))
          + (SELECT COALESCE(SUM(m.llm_cost_usd), 0)
               FROM chat_messages m
               JOIN chat_threads t ON t.id = m.thread_id
              WHERE t.user_id = $1
                AND m.created_at >= date_trunc('day', {UTC_NOW}))
            AS spent
        """,
        user_id,
    )
    return float(row["spent"]) if row and row["spent"] is not None else 0.0


async def over_budget_message(user_id: str) -> Optional[str]:
    """None while the user may start another LLM call; otherwise what to tell them."""
    budget = settings.DAILY_LLM_BUDGET_USD
    if budget <= 0:
        return None
    spent = await spent_today_usd(user_id)
    if spent < budget:
        return None
    return (
        f"Daily AI usage limit reached (${spent:.2f} of ${budget:.2f} used today, UTC). "
        "It is available again after midnight UTC."
    )
