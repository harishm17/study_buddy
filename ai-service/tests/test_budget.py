"""The daily budget sums the append-only usage ledger, so deleting things cannot lower it."""
import pytest

from app.config import settings
from app.services.budget import over_budget_message, record_usage_event, spent_today_usd
from tests.db_helpers import seed_chat_message, seed_chat_thread, seed_project, seed_usage, seed_user

pytestmark = pytest.mark.asyncio

TWO_DAYS_AGO = "SQL:(NOW() AT TIME ZONE 'UTC') - interval '2 days'"


@pytest.fixture(autouse=True)
def budget(monkeypatch):
    monkeypatch.setattr(settings, "DAILY_LLM_BUDGET_USD", 1.00)


async def user_with_project(db):
    user_id = await seed_user(db)
    return user_id, await seed_project(db, user_id)


async def test_spend_adds_jobs_and_chat_answers(db):
    user_id, project_id = await user_with_project(db)
    await seed_usage(db, user_id, 0.30, source="job", project_id=project_id)
    await seed_usage(db, user_id, 0.45, source="chat", project_id=project_id)

    assert await spent_today_usd(user_id) == pytest.approx(0.75)
    assert await over_budget_message(user_id) is None


async def test_job_spend_alone_can_use_up_the_budget(db):
    user_id, _ = await user_with_project(db)
    await seed_usage(db, user_id, 1.25, source="job")

    message = await over_budget_message(user_id)
    assert message is not None and "$1.25 of $1.00" in message


async def test_chat_spend_alone_can_use_up_the_budget(db):
    user_id, _ = await user_with_project(db)
    await seed_usage(db, user_id, 1.10, source="chat")

    message = await over_budget_message(user_id)
    assert message is not None and "$1.10 of $1.00" in message


async def test_jobs_and_chat_together_cross_the_line(db):
    user_id, _ = await user_with_project(db)
    await seed_usage(db, user_id, 0.60, source="job")
    await seed_usage(db, user_id, 0.50, source="chat")

    assert await over_budget_message(user_id) is not None


async def test_deleting_a_chat_thread_does_not_lower_the_total(db):
    user_id, project_id = await user_with_project(db)
    thread_id = await seed_chat_thread(db, user_id, project_id)
    message_id = await seed_chat_message(db, thread_id, cost=1.10)
    await seed_usage(db, user_id, 1.10, source="chat", project_id=project_id)

    await db.execute("DELETE FROM chat_threads WHERE id = $1", thread_id)

    assert await db.fetchval("SELECT count(*) FROM chat_messages WHERE id = $1", message_id) == 0
    assert await spent_today_usd(user_id) == pytest.approx(1.10)
    assert await over_budget_message(user_id) is not None


async def test_deleting_a_project_does_not_lower_the_total(db):
    user_id, project_id = await user_with_project(db)
    thread_id = await seed_chat_thread(db, user_id, project_id)
    await seed_chat_message(db, thread_id, cost=0.40)
    await seed_usage(db, user_id, 0.40, source="chat", project_id=project_id)
    await seed_usage(db, user_id, 0.70, source="job", project_id=project_id)

    await db.execute("DELETE FROM projects WHERE id = $1", project_id)

    assert await db.fetchval("SELECT count(*) FROM chat_threads") == 0
    assert await spent_today_usd(user_id) == pytest.approx(1.10)
    assert await over_budget_message(user_id) is not None


async def test_deleting_the_user_removes_their_ledger(db):
    user_id, _ = await user_with_project(db)
    await seed_usage(db, user_id, 2.0)
    await db.execute("DELETE FROM users WHERE id = $1", user_id)
    assert await db.fetchval("SELECT count(*) FROM llm_usage_events") == 0


async def test_other_users_and_earlier_days_do_not_count(db):
    user_id, _ = await user_with_project(db)
    other, _ = await user_with_project(db)
    await seed_usage(db, other, 9)
    await seed_usage(db, user_id, 9, created_at=TWO_DAYS_AGO)

    assert await spent_today_usd(user_id) == 0
    assert await over_budget_message(user_id) is None


async def test_zero_turns_the_budget_off(db, monkeypatch):
    monkeypatch.setattr(settings, "DAILY_LLM_BUDGET_USD", 0)
    user_id, _ = await user_with_project(db)
    await seed_usage(db, user_id, 500)

    assert await over_budget_message(user_id) is None


async def test_record_usage_event_appends_and_skips_free_calls(db):
    user_id, project_id = await user_with_project(db)
    args = dict(user_id=user_id, project_id=project_id, source="job", source_id="j1", models="m")
    await record_usage_event(**args, input_tokens=10, output_tokens=5, cost_usd=0.25)
    await record_usage_event(**args, input_tokens=0, output_tokens=0, cost_usd=0)

    assert await db.fetchval("SELECT count(*) FROM llm_usage_events") == 1
    assert await spent_today_usd(user_id) == pytest.approx(0.25)


async def test_a_ledger_failure_is_logged_not_raised(db):
    # No such user: the foreign key rejects the row. The work that was billed must not fail.
    await record_usage_event(
        user_id="nobody", project_id=None, source="job", source_id="j", models="", input_tokens=1,
        output_tokens=1, cost_usd=1.0,
    )
    assert await db.fetchval("SELECT count(*) FROM llm_usage_events") == 0
