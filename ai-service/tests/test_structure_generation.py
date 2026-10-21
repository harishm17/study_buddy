"""Plan a course with the mock model, then generate every content type from the planned sources."""
import json

import pytest

from app.api.routes import jobs
from app.models.jobs import JobPayload
from tests.db_helpers import seed_job
from tests.test_course_planner import add_file, course, lecture, mock_llm, run_extract  # noqa: F401


async def generate(course, topic_id: str, content_type: str, **preferences):
    job_id = await seed_job(course.db, course.user_id, project_id=course.project_id)
    return await jobs.generate_content_job(
        JobPayload(
            jobId=job_id,
            jobType="generate_content",
            data={"topicId": topic_id, "contentType": content_type, "preferences": preferences},
        )
    )


async def stored(db, topic_id: str, content_type: str):
    row = await db.fetchrow(
        "SELECT content_data, metadata FROM topic_content WHERE topic_id = $1 AND content_type = $2", topic_id, content_type
    )
    return json.loads(row["content_data"]), json.loads(row["metadata"] or "null")


@pytest.fixture
async def planned(course):
    db = course.db
    await add_file(db, course.project_id, "week1.pdf", lecture("Counting", 3) + lecture("Probability", 3))
    await add_file(db, course.project_id, "midterm.pdf", [("Q1", "An exam question about counting.")], role="exam")
    await run_extract(course)
    topics = await db.fetch("SELECT id, name FROM topics WHERE project_id = $1 ORDER BY order_index", course.project_id)
    return course, [t["id"] for t in topics]


async def test_notes_cite_the_topics_primary_spans(planned):
    course, topic_ids = planned

    await generate(course, topic_ids[0], "section_notes")

    notes, metadata = await stored(course.db, topic_ids[0], "section_notes")
    assert "## What you'll learn" in notes and "```check" in notes
    assert metadata["citations"] == [
        {"filename": "week1.pdf", "category": "lecture_notes", "pages": "1-3", "material_id": metadata["citations"][0]["material_id"], "page": 1}
    ]
    assert metadata["chunk_count"] == 3  # the topic's three chunks; the exam file adds nothing


async def test_every_item_carries_the_file_and_pages_it_is_based_on(planned):
    course, topic_ids = planned
    topic = topic_ids[0]

    for content_type in ("solved_examples", "interactive_examples"):
        await generate(course, topic, content_type)
        items, _ = await stored(course.db, topic, content_type)
        assert items[0]["sources"] == [
            {"material_id": items[0]["sources"][0]["material_id"], "filename": "week1.pdf", "page_start": 1, "page_end": 1}
        ]
        assert "source_excerpts" not in items[0]

    await generate(course, topic, "topic_quiz", question_count=4)
    quiz = json.loads(await course.db.fetchval("SELECT questions FROM topic_quizzes WHERE topic_id = $1", topic))
    assert quiz and all(q["sources"][0]["filename"] == "week1.pdf" and "source_excerpts" not in q for q in quiz)


async def test_a_second_topic_reads_its_own_sections_not_the_first_ones(planned):
    course, topic_ids = planned
    first_sources = await course.db.fetch("SELECT * FROM topic_sources WHERE topic_id = $1", topic_ids[0])
    second_sources = await course.db.fetch("SELECT * FROM topic_sources WHERE topic_id = $1", topic_ids[1])
    assert {(s["chunk_index_start"], s["chunk_index_end"]) for s in first_sources}.isdisjoint(
        {(s["chunk_index_start"], s["chunk_index_end"]) for s in second_sources}
    )

    await generate(course, topic_ids[1], "section_notes")

    _, metadata = await stored(course.db, topic_ids[1], "section_notes")
    assert metadata["citations"][0]["pages"] == "4-6"


async def test_a_regeneration_replaces_the_notes_and_the_hand_added_topic_still_generates(planned, monkeypatch):
    course, topic_ids = planned
    db = course.db
    hand = (await db.fetchrow(
        "INSERT INTO topics (id, project_id, name, order_index, user_confirmed) "
        "VALUES (gen_random_uuid()::text, $1, 'Added by hand', 99, TRUE) RETURNING id", course.project_id))["id"]

    from app.services.embeddings import search

    async def broken(text):
        raise RuntimeError("no embedder in this test")

    monkeypatch.setattr(search, "generate_query_embedding", broken)
    # Full-text only: the hand-added topic's name matches the words of the lectures.
    await db.execute("UPDATE topics SET name = 'Counting part explains a definition', keywords = ARRAY['definition'] WHERE id = $1", hand)

    await generate(course, hand, "section_notes")

    notes, metadata = await stored(db, hand, "section_notes")
    assert "```check" in notes and metadata["chunk_count"] >= 1
    await generate(course, topic_ids[0], "section_notes")
    await generate(course, topic_ids[0], "section_notes")
    assert await db.fetchval("SELECT count(*) FROM topic_content WHERE topic_id = $1", topic_ids[0]) == 1
