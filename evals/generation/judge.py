"""The optional model judge.

One call per (topic, content type). The judge sees the topic's source excerpts and every
model's output for that topic and type, anonymised as Candidate A, B, C... in a shuffled order
(the order is seeded by the pair, so a re-run assigns the same letters), and scores each
candidate 1-5 on correctness, grounding and teaching quality (and question quality for quizzes),
and lists every error it finds. Raw judge output and the letter-to-model mapping are stored.

Rendering, prompting and aggregation are plain functions and are unit tested. `run_judge` makes
the calls through a MeteredProvider, so the spend caps apply.
"""
import hashlib
import json
import random
import re
from pathlib import Path
from statistics import mean
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel

DIMENSIONS = ("correctness", "grounding", "teaching", "question_quality")
ERROR_KINDS = ("mathematical", "factual", "unsupported_by_excerpts", "ambiguous_key", "other")
LETTERS = "ABCDEFGHIJ"


# ---------------------------------------------------------------------------- schema


class JudgeError(BaseModel):
    kind: Literal["mathematical", "factual", "unsupported_by_excerpts", "ambiguous_key", "other"]
    where: str
    description: str


class CandidateReview(BaseModel):
    candidate: str
    correctness: int
    grounding: int
    teaching: int
    question_quality: Optional[int] = None
    errors: List[JudgeError]
    summary: str


class JudgeResult(BaseModel):
    reviews: List[CandidateReview]

    @classmethod
    def example(cls) -> "JudgeResult":
        """What the mock provider returns: neutral scores, no errors."""
        return cls(
            reviews=[
                CandidateReview(
                    candidate=letter, correctness=3, grounding=3, teaching=3, question_quality=3, errors=[], summary="mock"
                )
                for letter in "ABC"
            ]
        )


# ---------------------------------------------------------------------------- rendering


def render_excerpts(excerpts: List[Dict[str, Any]]) -> str:
    parts = []
    for index, excerpt in enumerate(excerpts, 1):
        pages = excerpt.get("pages") or [None, None]
        location = "page n/a" if pages[0] is None else (f"p. {pages[0]}" if pages[1] in (None, pages[0]) else f"pp. {pages[0]}-{pages[1]}")
        parts.append(
            f'<excerpt index="{index}" source="{excerpt.get("filename")}" location="{location}" '
            f'section="{excerpt.get("section") or "n/a"}">\n{str(excerpt.get("text") or "").strip()}\n</excerpt>'
        )
    return "\n".join(parts)


def render_output(content_type: str, output) -> str:
    """One candidate's content as plain markdown, in the same layout for every model."""
    if content_type == "notes":
        return str(output).strip()
    lines: List[str] = []
    if content_type == "solved":
        for i, ex in enumerate(output, 1):
            lines += [f"### Example {i}: {ex.get('title', '')}", "", f"Problem: {ex.get('problem_statement', '')}", ""]
            for step in ex.get("solution_steps") or []:
                lines += [
                    f"Step {step.get('step_number')}: {step.get('description', '')}",
                    f"  Work: {step.get('work', '')}",
                    f"  Why: {step.get('explanation', '')}",
                ]
            lines += ["", f"Final answer: {ex.get('final_answer', '')}", f"Key concepts: {', '.join(ex.get('key_concepts') or [])}", ""]
    elif content_type == "interactive":
        for i, ex in enumerate(output, 1):
            lines += [f"### Practice problem {i}: {ex.get('title', '')}", "", f"Problem: {ex.get('problem_statement', '')}", ""]
            for step in ex.get("steps") or []:
                lines += [
                    f"Step {step.get('step_number')} ({step.get('answer_type')}): {step.get('question', '')}",
                    f"  Hint: {step.get('hint', '')}",
                    f"  Correct answer: {step.get('correct_answer', '')} (also accepted: {', '.join(map(str, step.get('acceptable_answers') or []))})",
                    f"  Explanation: {step.get('explanation', '')}",
                    f"  Feedback if correct: {step.get('feedback_correct', '')}",
                    f"  Guidance if wrong: {step.get('feedback_incorrect', '')}",
                ]
            lines.append("")
    elif content_type == "quiz":
        for i, q in enumerate(output, 1):
            lines += [f"### Question {i} ({q.get('question_type')}, {q.get('points')} pt)", "", q.get("question_text", "")]
            for option in q.get("options") or []:
                lines.append(f"  {option.get('id')}. {option.get('text')}")
            answer = q.get("correct_answer")
            if q.get("question_type") == "short_answer":
                lines += [f"Sample answer: {q.get('sample_answer')}", f"Key points: {'; '.join(q.get('key_points') or [])}"]
            else:
                unit = f" {q['unit']}" if q.get("unit") else ""
                tol = f" (tolerance {q['tolerance']})" if q.get("tolerance") is not None else ""
                lines.append(f"Answer key: {answer}{unit}{tol}")
            lines += [f"Explanation: {q.get('explanation', '')}", f"Concepts tested: {', '.join(q.get('concepts_tested') or [])}", ""]
    else:
        raise ValueError(f"unknown content type {content_type}")
    return "\n".join(lines).strip()


# ---------------------------------------------------------------------------- prompts

JUDGE_SYSTEM = """You are an exacting reviewer of university study material. A student's own course files were cut into source excerpts, and several anonymous candidates each wrote the same kind of study material from those excerpts. You review every candidate independently and strictly. You do not know, and must not guess, which model wrote which candidate."""

_TYPE_NOTES = {
    "notes": "Each candidate is a set of revision notes for the topic.",
    "solved": "Each candidate is a set of solved worked examples with step-by-step solutions.",
    "interactive": "Each candidate is a set of interactive practice problems; the student answers one step at a time, so hints, answers and accepted forms matter.",
    "quiz": "Each candidate is a quiz with answer keys and explanations. Judge it as a student's assessment.",
}


def judge_instructions(content_type: str, labels: List[str]) -> str:
    quiz_line = (
        "- question_quality (quizzes only; leave null otherwise): do the questions test applying a concept to a new situation rather than recalling a worked example from the excerpts; are distractors plausible but wrong; is every answer key unambiguous and correct?\n"
        if content_type == "quiz"
        else "- question_quality: leave null for this content type.\n"
    )
    return f"""{_TYPE_NOTES[content_type]}

Review candidates {', '.join(labels)}.

First verify. Redo every computation, formula, derivation, code trace and answer key yourself, step by step, and check every factual claim against the excerpts and against standard knowledge of the subject. Then score each candidate from 1 (poor) to 5 (excellent):
- correctness: 5 means no errors; 4 means a slip that would not mislead a student; 3 means one real error; 2 means several; 1 means pervasive errors. A wrong answer key or a wrong computation is a real error.
- grounding: does it stay within what the excerpts cover and use their definitions, notation and examples? Invented course-specific facts lower the score.
- teaching: intuition before formalism, clear worked reasoning, concrete examples, common pitfalls, and clarity for a student seeing the topic for the first time.
{quiz_line}
List every error you find for every candidate, with the kind (mathematical for wrong arithmetic, algebra, formulas or answer keys; factual; unsupported_by_excerpts; ambiguous_key; other), where it is (example, step or question number, or section) and what is wrong and what is right. Do not invent errors: if a candidate has none, return an empty list. Do not reward length or polish. Return one review for each of the candidates {', '.join(labels)}."""


def build_judge_messages(content_type: str, excerpts: List[Dict[str, Any]], candidates: Dict[str, str]):
    """Messages for one judge call. `candidates` maps label to rendered content."""
    from app.services.llm.base import LLMMessage

    blocks = "\n\n".join(f'<candidate label="{label}">\n{text}\n</candidate>' for label, text in candidates.items())
    return [
        LLMMessage(role="system", content=JUDGE_SYSTEM),
        LLMMessage(role="user", content="Source excerpts from the student's course materials:\n\n" + render_excerpts(excerpts)),
        LLMMessage(role="user", content=blocks),
        LLMMessage(role="user", content=judge_instructions(content_type, list(candidates))),
    ]


def assign_labels(pair_key: str, model_slugs: List[str], seed: int) -> Dict[str, str]:
    """Letter to model slug, shuffled by a seed derived from the pair and the run seed."""
    digest = hashlib.sha256(f"{seed}|{pair_key}".encode()).digest()
    rng = random.Random(int.from_bytes(digest[:8], "big"))
    order = sorted(model_slugs)
    rng.shuffle(order)
    return {LETTERS[i]: slug for i, slug in enumerate(order)}


def pair_key(corpus: str, topic_key: str, content_type: str) -> str:
    return f"{corpus}|{topic_key}|{content_type}"


def safe_name(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", text).strip("_")


# ---------------------------------------------------------------------------- aggregation


def clamp_score(value) -> Optional[int]:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return min(5, max(1, int(round(value))))


def aggregate(judged: List[Dict[str, Any]], model_slugs: List[str]) -> Dict[str, Any]:
    """Per model: mean score per dimension (overall and per content type), error lists.

    `judged` are stored judge files: {corpus, topic, type, mapping: {label: slug}, result: {reviews}}.
    """
    scores: Dict[str, Dict[str, Dict[str, List[int]]]] = {
        slug: {"all": {d: [] for d in DIMENSIONS}} for slug in model_slugs
    }
    errors: Dict[str, List[Dict[str, Any]]] = {slug: [] for slug in model_slugs}
    reviewed = 0
    for item in judged:
        if not item.get("result"):
            continue
        reviewed += 1
        for review in item["result"].get("reviews", []):
            slug = item["mapping"].get(str(review.get("candidate", "")).strip().upper())
            if slug not in scores:
                continue
            by_type = scores[slug].setdefault(item["type"], {d: [] for d in DIMENSIONS})
            for dim in DIMENSIONS:
                value = clamp_score(review.get(dim))
                if value is not None:
                    by_type[dim].append(value)
                    scores[slug]["all"][dim].append(value)
            for error in review.get("errors") or []:
                errors[slug].append(
                    {"corpus": item["corpus"], "topic": item["topic"], "type": item["type"], **error}
                )

    def means(block):
        return {dim: (round(mean(values), 2) if values else None) for dim, values in block.items()} | {
            "n": max((len(v) for v in block.values()), default=0)
        }

    return {
        "pairs_judged": reviewed,
        "models": {
            slug: {
                "means": {kind: means(block) for kind, block in scores[slug].items()},
                "errors": errors[slug],
                "mathematical_errors": sum(1 for e in errors[slug] if e.get("kind") == "mathematical"),
                "mathematical_errors_by_type": {
                    t: sum(1 for e in errors[slug] if e.get("kind") == "mathematical" and e["type"] == t)
                    for t in sorted({e["type"] for e in errors[slug]})
                },
            }
            for slug in model_slugs
        },
    }


# ---------------------------------------------------------------------------- the run


async def run_judge(
    *,
    provider,
    outputs: Dict[str, Dict[str, Dict[str, Dict[str, Any]]]],
    excerpts: Dict[str, Dict[str, List[Dict[str, Any]]]],
    model_slugs: List[str],
    content_types: List[str],
    judge_dir: Path,
    seed: int,
    log,
) -> Dict[str, Any]:
    """Judge every (corpus, topic, type) that has at least one output, spend permitting.

    `outputs[corpus][topic_key][slug][type]` is a generator output. A pair with a stored judge
    file is not judged again. Returns {"skipped_for_spend": [...], "failed": [...]}.
    """
    from spend import SpendLimitReached

    judge_dir.mkdir(parents=True, exist_ok=True)
    skipped: List[str] = []
    failed: List[str] = []
    pairs = [
        (corpus, topic_key, content_type)
        for corpus, topics in outputs.items()
        for topic_key in topics
        for content_type in content_types
        if any(content_type in by_model for by_model in [topics[topic_key].get(slug, {}) for slug in model_slugs])
    ]
    for corpus, topic_key, content_type in pairs:
        key = pair_key(corpus, topic_key, content_type)
        path = judge_dir / f"{safe_name(corpus)}__{safe_name(topic_key)}__{content_type}.json"
        if path.exists() and json.loads(path.read_text()).get("result"):
            continue
        present = [slug for slug in model_slugs if content_type in outputs[corpus][topic_key].get(slug, {})]
        mapping = assign_labels(key, present, seed)
        candidates = {
            label: render_output(content_type, outputs[corpus][topic_key][slug][content_type])
            for label, slug in mapping.items()
        }
        messages = build_judge_messages(content_type, excerpts[corpus][topic_key], candidates)
        before = len(provider.calls)
        record: Dict[str, Any] = {
            "corpus": corpus,
            "topic": topic_key,
            "type": content_type,
            "mapping": mapping,
            "judge_model": provider.spec.label,
        }
        try:
            result = await provider.generate_structured(
                messages, JudgeResult, max_tokens=16000, purpose="judge"
            )
            record["result"] = result.model_dump()
        except SpendLimitReached as exc:
            log(f"  judge stopped: {exc}")
            skipped = [pair_key(*p) for p in pairs[pairs.index((corpus, topic_key, content_type)):]]
            break
        except Exception as exc:  # the judge failing on one pair should not end the run
            record["error"] = f"{type(exc).__name__}: {exc}"
            failed.append(key)
            log(f"  judge failed for {key}: {record['error']}")
        record["calls"] = provider.calls[before:]
        path.write_text(json.dumps(record, indent=2) + "\n")
        log(f"  judged {key}")
    return {"skipped_for_spend": skipped, "failed": failed}


def load_judged(judge_dir: Path) -> List[Dict[str, Any]]:
    if not judge_dir.exists():
        return []
    return [json.loads(p.read_text()) for p in sorted(judge_dir.glob("*.json"))]
