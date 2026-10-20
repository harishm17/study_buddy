"""The daily budget counts job costs and chat answer costs together."""
import pytest

from app.config import settings
from app.services.budget import over_budget_message, spent_today_usd
from tests.db_helpers import seed_chat_message, seed_chat_thread, seed_job, seed_project, seed_user

pytestmark = pytest.mark.asyncio

TWO_DAYS_AGO = "SQL:(NOW() AT TIME ZONE 'UTC') - interval '2 days'"


@pytest.fixture(autouse=True)
def budget(monkeypatch):
    monkeypatch.setattr(settings, "DAILY_LLM_BUDGET_USD", 1.00)


async def user_with_thread(db):
    user_id = await seed_user(db)
    project_id = await seed_project(db, user_id)
    return user_id, await seed_chat_thread(db, user_id, project_id)


async def test_spend_adds_jobs_and_chat_answers(db):
    user_id, thread_id = await user_with_thread(db)
    await seed_job(db, user_id, status="completed", llm_cost_usd=0.30)
    await seed_chat_message(db, thread_id, cost=0.45)
    await seed_chat_message(db, thread_id, role="user", cost=0)

    assert await spent_today_usd(user_id) == pytest.approx(0.75)
    assert await over_budget_message(user_id) is None


async def test_chat_alone_can_use_up_the_budget(db):
    user_id, thread_id = await user_with_thread(db)
    await seed_chat_message(db, thread_id, cost=1.10)

    message = await over_budget_message(user_id)
    assert message is not None and "$1.10 of $1.00" in message


async def test_jobs_and_chat_together_cross_the_line(db):
    user_id, thread_id = await user_with_thread(db)
    await seed_job(db, user_id, status="completed", llm_cost_usd=0.60)
    await seed_chat_message(db, thread_id, cost=0.50)

    assert await over_budget_message(user_id) is not None


async def test_other_users_and_earlier_days_do_not_count(db):
    user_id, thread_id = await user_with_thread(db)
    _, other_thread = await user_with_thread(db)
    await seed_chat_message(db, other_thread, cost=9)
    await seed_chat_message(db, thread_id, cost=9, created_at=TWO_DAYS_AGO)

    assert await spent_today_usd(user_id) == 0
    assert await over_budget_message(user_id) is None


async def test_zero_turns_the_budget_off(db, monkeypatch):
    monkeypatch.setattr(settings, "DAILY_LLM_BUDGET_USD", 0)
    user_id, thread_id = await user_with_thread(db)
    await seed_chat_message(db, thread_id, cost=500)

    assert await over_budget_message(user_id) is None
