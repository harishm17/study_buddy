"""Marking the topics that past-exam text covers: against exam chunks only, idempotent, recomputed."""
from types import SimpleNamespace

import pytest

from app.api.routes import jobs
from app.config import settings
from app.models.jobs import JobPayload
from app.services import exam_relevance
from app.services.embeddings import search
from app.services.exam_relevance import find_exam_relevant_topics, mark_exam_relevant_topics
from app.services.llm.factory import LLMFactory
from tests.db_helpers import add_chunk, get_job, new_id, seed_job, seed_material, seed_project, seed_user, unit

# The "embedder": a topic about hashing is e0, one about graphs is e1 (orthogonal).
VECTORS = {"hashing": unit(1.0), "graphs": unit(0.0, 1.0)}


@pytest.fixture(autouse=True)
def embedder(monkeypatch):
    async def embed(text):
        return VECTORS["graphs"] if "graph" in text.lower() else VECTORS["hashing"]

    monkeypatch.setattr(search, "generate_query_embedding", embed)


@pytest.fixture
async def course(db):
    user_id = await seed_user(db)
    project_id = await seed_project(db, user_id)
    return SimpleNamespace(db=db, user_id=user_id, project_id=project_id)


async def add_topic(db, project_id, name, index=0):
    topic_id = new_id()
    await db.execute(
        "INSERT INTO topics (id, project_id, name, description, keywords, order_index) VALUES ($1, $2, $3, $4, $5, $6)",
        topic_id, project_id, name, f"About {name.lower()}.", [name.lower()], index,
    )
    return topic_id


async def add_file(db, project_id, role, text, vector, filename=None):
    material = await seed_material(db, project_id, filename=filename or f"{role}.pdf", status="valid", role=role)
    await add_chunk(db, material, 0, text, vector)
    return material


async def flags(db, project_id):
    rows = await db.fetch("SELECT name, exam_relevant FROM topics WHERE project_id = $1 ORDER BY order_index", project_id)
    return {row["name"]: row["exam_relevant"] for row in rows}


@pytest.fixture
async def two_topics(course):
    await add_topic(course.db, course.project_id, "Hashing", 0)
    await add_topic(course.db, course.project_id, "Graphs", 1)
    return course


async def test_a_topic_the_exam_covers_is_marked_and_the_others_are_not(two_topics):
    c = two_topics
    await add_file(c.db, c.project_id, "exam", "Problem 1. Insert keys into a hash table.", unit(1.0, 0.1))

    result = await mark_exam_relevant_topics(c.project_id)

    assert await flags(c.db, c.project_id) == {"Hashing": True, "Graphs": False}
    assert result == {"topics": 2, "relevant": 1, "changed": 1}


async def test_only_exam_files_count_not_content_syllabus_or_other(two_topics):
    c = two_topics
    for role in ("content", "syllabus", "other"):
        await add_file(c.db, c.project_id, role, f"Hashing in the {role} file.", unit(1.0, 0.1))
    await add_file(c.db, c.project_id, "exam", "Problem 1. Depth-first search on a graph.", unit(0.0, 1.0, 0.1))

    await mark_exam_relevant_topics(c.project_id)

    assert await flags(c.db, c.project_id) == {"Hashing": False, "Graphs": True}


async def test_a_second_run_changes_nothing(two_topics):
    c = two_topics
    await add_file(c.db, c.project_id, "exam", "Problem 1. Hash table.", unit(1.0, 0.1))
    await mark_exam_relevant_topics(c.project_id)

    again = await mark_exam_relevant_topics(c.project_id)

    assert again == {"topics": 2, "relevant": 1, "changed": 0}
    assert await flags(c.db, c.project_id) == {"Hashing": True, "Graphs": False}


async def test_flags_follow_the_exam_files_when_they_change(two_topics):
    c = two_topics
    exam = await add_file(c.db, c.project_id, "exam", "Problem 1. Hash table.", unit(1.0, 0.1))
    await mark_exam_relevant_topics(c.project_id)
    assert (await flags(c.db, c.project_id))["Hashing"] is True

    # A second exam adds a topic.
    await add_file(c.db, c.project_id, "exam", "Problem 1. Shortest paths in a graph.", unit(0.0, 1.0, 0.1), "exam2.pdf")
    await mark_exam_relevant_topics(c.project_id)
    assert await flags(c.db, c.project_id) == {"Hashing": True, "Graphs": True}

    # The first stops being an exam, then the second is deleted: nothing is left to cover a topic.
    await c.db.execute("UPDATE materials SET role = 'content' WHERE id = $1", exam)
    await mark_exam_relevant_topics(c.project_id)
    assert await flags(c.db, c.project_id) == {"Hashing": False, "Graphs": True}
    await c.db.execute("DELETE FROM materials WHERE filename = 'exam2.pdf'")
    result = await mark_exam_relevant_topics(c.project_id)
    assert await flags(c.db, c.project_id) == {"Hashing": False, "Graphs": False}
    assert result["relevant"] == 0


async def test_a_course_without_exams_searches_nothing(two_topics, monkeypatch):
    c = two_topics

    async def never(*args, **kwargs):
        raise AssertionError("searched without exam chunks")

    monkeypatch.setattr(exam_relevance, "hybrid_search_chunks", never)
    assert await find_exam_relevant_topics(c.project_id) == []
    assert (await mark_exam_relevant_topics(c.project_id))["relevant"] == 0


async def test_other_projects_are_untouched(two_topics):
    c = two_topics
    other = await seed_project(c.db, c.user_id)
    await add_topic(c.db, other, "Hashing")
    await c.db.execute("UPDATE topics SET exam_relevant = TRUE WHERE project_id = $1", other)
    await add_file(c.db, c.project_id, "exam", "Problem 1. Hash table.", unit(1.0, 0.1))

    await mark_exam_relevant_topics(c.project_id)

    assert await flags(c.db, other) == {"Hashing": True}


async def test_the_result_names_the_best_matching_chunk(two_topics):
    c = two_topics
    exam = await add_file(c.db, c.project_id, "exam", "Problem 1. Hash table.", unit(1.0, 0.1))

    (found,) = await find_exam_relevant_topics(c.project_id)

    assert found["name"] == "Hashing" and found["material_id"] == exam and found["similarity"] > 0.9


async def test_the_job_runs_the_recompute(two_topics):
    c = two_topics
    await add_file(c.db, c.project_id, "exam", "Problem 1. Hash table.", unit(1.0, 0.1))
    job_id = await seed_job(c.db, c.user_id, "exam_relevance", project_id=c.project_id, input_data={"projectId": c.project_id})

    response = await jobs.exam_relevance_job(JobPayload(jobId=job_id, jobType="exam_relevance", data={"projectId": c.project_id}))

    assert response["status"] == "success"
    assert (await get_job(c.db, job_id))["status"] == "completed"
    assert await flags(c.db, c.project_id) == {"Hashing": True, "Graphs": False}


# ---- after planning

@pytest.fixture
def mock_llm(monkeypatch):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "mock")
    LLMFactory.reset()
    yield
    LLMFactory.reset()


async def plan(c):
    from tests.test_course_planner import run_extract

    return await run_extract(SimpleNamespace(db=c.db, user_id=c.user_id, project_id=c.project_id))


async def lecture_file(c):
    material = await seed_material(c.db, c.project_id, filename="notes.pdf", status="valid", role="content")
    for index in range(3):
        await c.db.execute(
            "INSERT INTO material_chunks (id, material_id, chunk_text, section_hierarchy, page_start, page_end, chunk_index, token_count) "
            "VALUES ($1, $2, $3, $4, $5, $5, $6, 300)",
            new_id(), material, f"Hashing part {index} explains a definition.", f"Hashing > Part {index}", index + 1, index,
        )


async def test_planning_marks_the_topics_the_exams_cover(course, mock_llm):
    await lecture_file(course)
    await add_file(course.db, course.project_id, "exam", "Problem 1. Hash table.", unit(1.0, 0.1))

    await plan(course)

    marked = await flags(course.db, course.project_id)
    assert marked and all(marked.values())


async def test_planning_without_exams_marks_nothing(course, mock_llm):
    await lecture_file(course)

    await plan(course)

    marked = await flags(course.db, course.project_id)
    assert marked and not any(marked.values())


async def test_a_relevance_failure_does_not_fail_planning(course, mock_llm, monkeypatch):
    async def broken(project_id):
        raise RuntimeError("embedder down")

    monkeypatch.setattr(exam_relevance, "mark_exam_relevant_topics", broken)
    await lecture_file(course)

    result = await plan(course)

    assert result["status"] == "success"
