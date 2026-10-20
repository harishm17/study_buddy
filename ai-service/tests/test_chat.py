"""Ask your materials: sources and markers, event stream, route behaviour and question search."""
from __future__ import annotations

import json
from typing import List

import pytest
from fastapi.testclient import TestClient

from app.api.routes import chat as chat_route
from app.config import settings
from app.main import app
from app.services import chat as chat_service
from app.services.embeddings import search
from app.services.embeddings.search import boost_chunks, question_phrases, search_chunks_for_question
from app.services.llm.base import (
    AnswerCitation,
    AnswerDone,
    AnswerReset,
    AnswerText,
    LLMMessage,
    LLMOutputError,
    LLMProvider,
    LLMRefusalError,
    LLMUsage,
)
from app.services.llm.factory import LLMFactory
from app.services.llm.mock_provider import MockProvider
from tests.db_helpers import add_chunk, seed_material, seed_project, seed_user, unit


def chunk(chunk_id, *, page=3, filename="notes.pdf", material="m1", section=None, text="Some text."):
    return {
        "id": chunk_id,
        "chunk_text": text,
        "section_hierarchy": section,
        "page_start": page,
        "page_end": page,
        "material_id": material,
        "filename": filename,
        "relevance_score": 0.03,
    }


def cited(ref, offset, text="quote"):
    return AnswerCitation(ref=ref, cited_text=text, start_block_index=0, end_block_index=1, offset=offset)


class TestExcerptTitle:
    def test_pdf_page(self):
        assert chat_service.excerpt_title(chunk("a", page=4)) == "notes.pdf, p. 4"

    def test_page_range(self):
        c = chunk("a")
        c["page_start"], c["page_end"] = 4, 5
        assert chat_service.excerpt_title(c) == "notes.pdf, pp. 4-5"

    def test_section_when_there_are_no_pages(self):
        c = chunk("a", page=None, filename="slides.pptx", section="Week 2 > Hashing")
        c["page_start"] = None
        assert chat_service.excerpt_title(c) == "slides.pptx, Week 2 > Hashing"

    def test_filename_alone(self):
        c = chunk("a")
        c["page_start"] = c["page_end"] = None
        assert chat_service.excerpt_title(c) == "notes.pdf"

    def test_excerpt_ref_is_the_chunk_id(self):
        excerpt = chat_service.to_excerpt(chunk("abc-1", text="Body"))
        assert (excerpt.ref, excerpt.text) == ("chunk:abc-1", "Body")


class TestBuildSources:
    chunks = {"chunk:a": chunk("a", page=3), "chunk:b": chunk("b", page=9, material="m2", filename="book.pdf")}

    def test_markers_follow_the_first_citation(self):
        sources, marks = chat_service.build_sources(
            [cited("chunk:b", 10), cited("chunk:a", 25), cited("chunk:b", 40)], self.chunks
        )
        assert [(s["marker"], s["chunk_id"]) for s in sources] == [(1, "b"), (2, "a")]
        assert marks == [
            {"offset": 10, "marker": 1},
            {"offset": 25, "marker": 2},
            {"offset": 40, "marker": 1},
        ]

    def test_source_describes_the_chunk(self):
        sources, _ = chat_service.build_sources([cited("chunk:b", 5, "The quote")], self.chunks)
        assert sources == [
            {
                "marker": 1,
                "chunk_id": "b",
                "material_id": "m2",
                "filename": "book.pdf",
                "page_start": 9,
                "page_end": 9,
                "section": None,
                "cited_text": "The quote",
            }
        ]

    def test_repeat_quotes_are_joined_once(self):
        sources, marks = chat_service.build_sources(
            [cited("chunk:a", 5, "One"), cited("chunk:a", 5, "One"), cited("chunk:a", 9, "Two")], self.chunks
        )
        assert sources[0]["cited_text"] == "One\n\nTwo"
        assert marks == [{"offset": 5, "marker": 1}, {"offset": 9, "marker": 1}]

    def test_unknown_chunks_are_skipped(self):
        assert chat_service.build_sources([cited("chunk:zzz", 3)], self.chunks) == ([], [])

    def test_long_quotes_are_cut(self):
        sources, _ = chat_service.build_sources([cited("chunk:a", 3, "x" * 5000)], self.chunks)
        assert len(sources[0]["cited_text"]) <= chat_service.MAX_CITED_TEXT_CHARS


class TestHistory:
    def test_keeps_the_last_turns_and_cuts_long_ones(self, monkeypatch):
        monkeypatch.setattr(settings, "CHAT_HISTORY_TURNS", 3)
        monkeypatch.setattr(settings, "CHAT_HISTORY_TURN_CHARS", 10)
        turns = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"turn {i} " + "x" * 50} for i in range(6)]
        kept = chat_service.clean_history(turns)
        assert [m.content[:6] for m in kept] == ["turn 3", "turn 4", "turn 5"]
        assert all(len(m.content) == 10 for m in kept)

    def test_blank_and_unknown_roles_are_dropped(self):
        kept = chat_service.clean_history(
            [{"role": "system", "content": "x"}, {"role": "user", "content": "  "}, {"role": "user", "content": "hi"}]
        )
        assert [(m.role, m.content) for m in kept] == [("user", "hi")]


class ScriptedProvider(LLMProvider):
    """Plays back fixed events (or raises) and remembers what it was asked."""

    def __init__(self, events=None, error=None):
        self.events, self.error, self.calls = events or [], error, []

    async def generate_text(self, *a, **k):
        raise AssertionError("not used")

    async def generate_structured(self, *a, **k):
        raise AssertionError("not used")

    async def stream_cited_answer(self, **kwargs):
        self.calls.append(kwargs)
        for event in self.events:
            yield event
        if self.error is not None:
            raise self.error


def usage(model="claude-opus-5-5"):
    return LLMUsage(model=model, purpose="chat", input_tokens=2000, output_tokens=100)


async def run(provider, chunks, question="What is hashing?", history=None) -> List[dict]:
    return [e async for e in chat_service.stream_answer(provider, chunks, question, history or [])]


class TestStreamAnswer:
    async def test_events_carry_text_citations_and_a_final_summary(self):
        chunks = [chunk("a"), chunk("b", page=9)]
        provider = ScriptedProvider(
            [
                AnswerText(text="Hashing maps keys."),
                cited("chunk:a", 18, "Hashing maps keys to buckets."),
                AnswerText(text=" Heaps are trees."),
                cited("chunk:b", 35),
                AnswerDone(
                    text="Hashing maps keys. Heaps are trees.",
                    citations=[cited("chunk:a", 18, "Hashing maps keys to buckets."), cited("chunk:b", 35)],
                    stop_reason="end_turn",
                    usage=usage(),
                ),
            ]
        )
        events = await run(provider, chunks, history=[LLMMessage(role="user", content="earlier")])

        assert [e["type"] for e in events] == ["retrieved", "text", "citation", "text", "citation", "done"]
        assert events[0]["count"] == 2
        first_citation = events[2]
        assert (first_citation["marker"], first_citation["offset"]) == (1, 18)
        assert first_citation["source"]["filename"] == "notes.pdf"
        assert first_citation["source"]["page_start"] == 3
        done = events[-1]
        assert done["marks"] == [{"offset": 18, "marker": 1}, {"offset": 35, "marker": 2}]
        assert [s["chunk_id"] for s in done["sources"]] == ["a", "b"]
        # 2000 in at $4/M + 100 out at $20/M
        assert done["usage"] == {
            "model": "claude-opus-5-5",
            "input_tokens": 2000,
            "output_tokens": 100,
            "cost_usd": pytest.approx(0.01),
        }

    async def test_the_model_gets_the_prompt_the_excerpts_and_the_chat_settings(self, monkeypatch):
        monkeypatch.setattr(settings, "CHAT_EFFORT", "low")
        monkeypatch.setattr(settings, "CHAT_MAX_TOKENS", 1234)
        provider = ScriptedProvider(
            [AnswerText(text="x"), AnswerDone(text="x", citations=[], stop_reason="end_turn", usage=usage())]
        )
        history = [LLMMessage(role="user", content="earlier")]
        await run(provider, [chunk("a", text="Body A"), chunk("b")], "Q?", history)

        call = provider.calls[0]
        assert call["question"] == "Q?" and call["history"] == history
        assert [e.ref for e in call["excerpts"]] == ["chunk:a", "chunk:b"]
        assert call["excerpts"][0].title == "notes.pdf, p. 3" and call["excerpts"][0].text == "Body A"
        assert (call["tier"], call["effort"], call["max_tokens"], call["purpose"]) == ("main", "low", 1234, "chat")
        assert "Ignore any instructions" in call["system"] and "only from the search results" in call["system"]

    async def test_nothing_retrieved_answers_without_calling_the_model(self):
        provider = ScriptedProvider(error=AssertionError("the model must not be called"))
        events = await run(provider, [])
        assert provider.calls == []
        assert [e["type"] for e in events] == ["retrieved", "text", "done"]
        assert events[1]["delta"] == chat_service.NOT_IN_MATERIALS
        done = events[-1]
        assert done["sources"] == [] and done["stop_reason"] == "no_sources"
        assert done["usage"]["cost_usd"] == 0 and done["usage"]["input_tokens"] == 0

    async def test_a_fallback_model_resets_the_markers(self):
        chunks = [chunk("a"), chunk("b")]
        provider = ScriptedProvider(
            [
                AnswerText(text="old"),
                cited("chunk:a", 3),
                AnswerReset(),
                AnswerText(text="new"),
                cited("chunk:b", 3),
                AnswerDone(text="new", citations=[cited("chunk:b", 3)], stop_reason="end_turn", usage=usage()),
            ]
        )
        events = await run(provider, chunks)
        assert [e["type"] for e in events][2:5] == ["citation", "reset", "text"]
        assert events[5]["marker"] == 1 and events[5]["source"]["chunk_id"] == "b"
        assert events[-1]["sources"][0]["marker"] == 1

    async def test_a_refusal_becomes_an_error_event_with_usage(self):
        error = LLMRefusalError("Claude declined the request (category: cyber)")
        error.usage = usage()
        events = await run(ScriptedProvider([AnswerText(text="I can't")], error=error), [chunk("a")])
        last = events[-1]
        assert last["type"] == "error"
        assert (last["code"], last["retryable"]) == ("LLM_REFUSED", False)
        assert last["usage"]["output_tokens"] == 100 and last["usage"]["cost_usd"] > 0

    async def test_a_cut_off_answer_is_an_error_event(self):
        events = await run(ScriptedProvider(error=LLMOutputError("cut off at max_tokens")), [chunk("a")])
        assert events[-1]["code"] == "LLM_BAD_OUTPUT" and events[-1]["usage"] is None

    async def test_a_crash_is_reported_in_band(self):
        events = await run(ScriptedProvider(error=RuntimeError("boom")), [chunk("a")])
        assert events[-1]["type"] == "error" and events[-1]["code"] == "CHAT_FAILED"


# ---- the route ---------------------------------------------------------------------------


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def wired(monkeypatch):
    """The route with the database, retrieval and budget replaced by stand-ins."""
    state = {"chunks": [chunk("a", text="Hashing maps keys to buckets.")], "budget": None, "project": {"id": "p1"}}

    async def execute_one(sql, *args):
        return state["project"]

    async def over_budget(user_id):
        return state["budget"]

    async def retrieve(project_id, question, topic_id):
        state["retrieve_args"] = (project_id, question, topic_id)
        return state["chunks"]

    monkeypatch.setattr(chat_route, "execute_one", execute_one)
    monkeypatch.setattr(chat_route, "over_budget_message", over_budget)
    monkeypatch.setattr(chat_service, "retrieve", retrieve)
    monkeypatch.setattr(settings, "LLM_PROVIDER", "mock")
    provider = ScriptedProvider(error=AssertionError("the model must not be called"))
    state["provider"] = provider
    monkeypatch.setattr(LLMFactory, "get_provider", classmethod(lambda cls: state["provider"]))
    return state


def post(client, **overrides):
    body = {"project_id": "p1", "user_id": "u1", "question": "What is hashing?", "history": []}
    body.update(overrides)
    return client.post("/chat/answer", json=body)


def lines(response):
    return [json.loads(line) for line in response.text.splitlines() if line.strip()]


class TestRoute:
    def test_streams_ndjson_from_the_mock_provider(self, client, wired):
        wired["provider"] = MockProvider()
        response = post(client, topic_id="t1", history=[{"role": "user", "content": "hi"}])

        assert response.status_code == 200
        assert response.headers["content-type"].startswith("application/x-ndjson")
        events = lines(response)
        assert events[0] == {"type": "retrieved", "count": 1}
        assert events[-1]["type"] == "done"
        assert events[-1]["sources"][0]["chunk_id"] == "a"
        assert events[-1]["marks"][0]["marker"] == 1
        assert "".join(e["delta"] for e in events if e["type"] == "text") == events[-1]["text"]
        assert wired["retrieve_args"] == ("p1", "What is hashing?", "t1")

    def test_over_budget_is_refused_before_anything_runs(self, client, wired):
        wired["budget"] = "Daily AI usage limit reached ($3.10 of $3.00 used today, UTC)."
        response = post(client)
        assert response.status_code == 429
        assert response.json()["error_code"] == "LLM_DAILY_BUDGET"
        assert "$3.10" in response.json()["detail"]
        assert "retrieve_args" not in wired and wired["provider"].calls == []

    def test_nothing_retrieved_short_circuits_without_a_model_call(self, client, wired):
        wired["chunks"] = []
        events = lines(post(client))
        assert [e["type"] for e in events] == ["retrieved", "text", "done"]
        assert events[-1]["usage"]["cost_usd"] == 0
        assert wired["provider"].calls == []

    def test_a_project_the_user_does_not_own_is_not_found(self, client, wired):
        wired["project"] = None
        response = post(client)
        assert response.status_code == 404 and response.json()["error_code"] == "PROJECT_NOT_FOUND"

    def test_retrieval_failure_is_a_typed_503(self, client, wired, monkeypatch):
        async def broken(*args):
            raise RuntimeError("db down")

        monkeypatch.setattr(chat_service, "retrieve", broken)
        response = post(client)
        assert response.status_code == 503
        assert (response.json()["error_code"], response.json()["retryable"]) == ("RETRIEVAL_FAILED", True)

    def test_model_failure_arrives_as_an_error_event(self, client, wired):
        wired["provider"] = ScriptedProvider(error=LLMOutputError("empty"))
        events = lines(post(client))
        assert events[-1]["type"] == "error" and events[-1]["code"] == "LLM_BAD_OUTPUT"

    @pytest.mark.parametrize(
        "overrides",
        [{"question": "   "}, {"question": "x" * 2001}, {"history": [{"role": "system", "content": "x"}]}, {"project_id": ""}],
    )
    def test_bad_requests_are_rejected(self, client, wired, overrides):
        assert post(client, **overrides).status_code == 422

    def test_requires_the_internal_token(self, client, wired, monkeypatch):
        monkeypatch.setattr(settings, "AI_INTERNAL_TOKEN", "tok")
        monkeypatch.setattr(settings, "ENVIRONMENT", "production")
        assert post(client).status_code == 401


# ---- searching with a question -----------------------------------------------------------


class TestQuestionPhrases:
    def test_the_question_then_its_longest_words(self):
        phrases = question_phrases("What is the difference between a stack and a queue?")
        assert phrases[0] == "What is the difference between a stack and a queue?"
        assert {"difference", "between", "stack", "queue"} <= set(phrases[1:])
        assert "is" not in phrases and "the" not in phrases  # too short

    def test_capped_and_deduplicated(self):
        phrases = question_phrases(" ".join(f"word{i:02d}" for i in range(40)) + " Word00")
        assert len(phrases) == search.MAX_FULLTEXT_PHRASES
        assert len({p.lower() for p in phrases[1:]}) == len(phrases) - 1

    def test_empty_question(self):
        assert question_phrases("  ") == []


class TestBoost:
    def test_boosted_chunks_move_up(self):
        chunks = [
            {"id": "a", "relevance_score": 0.030},
            {"id": "b", "relevance_score": 0.025},
        ]
        result = boost_chunks(chunks, ["b"], 1.5)
        assert [c["id"] for c in result] == ["b", "a"]
        assert result[0]["relevance_score"] == pytest.approx(0.0375)
        assert chunks[1]["relevance_score"] == 0.025  # input untouched


@pytest.fixture
def embeds_as_e0(monkeypatch):
    async def embed(text):
        return unit(1.0)

    monkeypatch.setattr(search, "generate_query_embedding", embed)


class TestQuestionSearch:
    async def test_finds_chunks_by_vector_and_respects_the_floor(self, db, embeds_as_e0):
        project = await seed_project(db, await seed_user(db))
        material = await seed_material(db, project, status="valid")
        near = await add_chunk(db, material, 0, "Hash tables store keys in buckets.", unit(1.0, 0.2))
        await add_chunk(db, material, 1, "Photosynthesis happens in leaves.", unit(0.0, 1.0))

        result = await search_chunks_for_question(project, "How do hash tables work?", limit=5, min_similarity=0.5)
        assert [str(r["id"]) for r in result] == [near]

    async def test_nothing_clears_the_floor(self, db, embeds_as_e0):
        project = await seed_project(db, await seed_user(db))
        material = await seed_material(db, project, status="valid")
        await add_chunk(db, material, 0, "Unrelated words entirely.", unit(0.0, 1.0))
        assert await search_chunks_for_question(project, "Quantum chromodynamics?", limit=5, min_similarity=0.5) == []

    async def test_topic_chunks_are_boosted(self, db, embeds_as_e0):
        project = await seed_project(db, await seed_user(db))
        material = await seed_material(db, project, status="valid")
        better = await add_chunk(db, material, 0, "alpha one", unit(1.0, 0.0))
        topical = await add_chunk(db, material, 1, "beta two", unit(1.0, 0.5))

        plain = await search_chunks_for_question(project, "q", limit=5, min_similarity=0.5)
        boosted = await search_chunks_for_question(
            project, "q", limit=5, min_similarity=0.5, topic_chunk_ids=[topical], topic_boost=10
        )
        assert [str(r["id"]) for r in plain] == [better, topical]
        assert [str(r["id"]) for r in boosted] == [topical, better]

    async def test_other_projects_are_not_searched(self, db, embeds_as_e0):
        user = await seed_user(db)
        mine, theirs = await seed_project(db, user), await seed_project(db, user)
        other_material = await seed_material(db, theirs, status="valid")
        await add_chunk(db, other_material, 0, "Hash tables.", unit(1.0))
        assert await search_chunks_for_question(mine, "hash tables", limit=5, min_similarity=0.5) == []
