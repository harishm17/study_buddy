"""Voice coach endpoints for StudyBuddy."""
from typing import Any, Dict, List, Optional
import re

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from app.config import settings
from app.services.llm.factory import LLMFactory
from app.services.llm.base import LLMMessage

router = APIRouter(prefix="/voice")

MATH_PATTERN = re.compile(
    r"(\d+|=|±|sqrt|integral|derive|calculate|solve|equation|formula|sum|delta|percent|percentage|compute)",
    re.IGNORECASE,
)


def _verify_internal_token(token: Optional[str]) -> None:
    if settings.is_production and not settings.AI_INTERNAL_TOKEN:
        raise HTTPException(status_code=500, detail="AI_INTERNAL_TOKEN is not configured")
    if settings.AI_INTERNAL_TOKEN and token != settings.AI_INTERNAL_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")


def _is_conceptual_text(value: Optional[str]) -> bool:
    if not value:
        return True
    return MATH_PATTERN.search(value) is None


def _filter_concept_questions(questions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    filtered: List[Dict[str, Any]] = []
    for q in questions:
        question_text = str(q.get("question_text", ""))
        explanation = str(q.get("explanation", ""))
        sample_answer = str(q.get("sample_answer", ""))
        correct_answer = str(q.get("correct_answer", ""))
        key_points = " ".join(str(point) for point in (q.get("key_points") or []))
        concepts_tested = " ".join(str(point) for point in (q.get("concepts_tested") or []))
        options_text = " ".join(str(opt.get("text", "")) for opt in (q.get("options") or []) if isinstance(opt, dict))
        if str(q.get("question_type", "")).lower() == "numerical":
            continue
        if not (_is_conceptual_text(question_text)
                and _is_conceptual_text(explanation)
                and _is_conceptual_text(sample_answer)
                and _is_conceptual_text(correct_answer)
                and _is_conceptual_text(key_points)
                and _is_conceptual_text(concepts_tested)
                and _is_conceptual_text(options_text)):
            continue
        filtered.append(q)
    return filtered


def _concept_instructions(language: str) -> str:
    language_name = "English" if language.lower().startswith("en") else language
    return (
        "You are StudyBuddy's conceptual oral exam coach. "
        f"Use {language_name} by default. "
        "Do not provide calculations, equations, formulas, or numeric solving. "
        "Focus on definitions, intuition, relationships, trade-offs, comparisons, and reasoning."
    )


class RealtimeTokenRequest(BaseModel):
    session_id: Optional[str] = None
    language: str = Field(default="en", min_length=2, max_length=8)
    voice: Optional[str] = None
    expires_after: int = Field(default=120, ge=30, le=600)


class DrillGenerateRequest(BaseModel):
    topic: Optional[str] = None
    notes: str
    count: int = Field(default=10, ge=3, le=20)
    difficulty: str = Field(default="medium")


@router.post("/realtime/token")
async def create_realtime_token(
    payload: RealtimeTokenRequest,
    x_ai_internal_token: Optional[str] = Header(default=None),
):
    """Mint a Realtime client secret via OpenAI."""
    _verify_internal_token(x_ai_internal_token)

    voice = payload.voice or settings.OPENAI_REALTIME_VOICE
    session = {
        "type": "realtime",
        "model": settings.OPENAI_REALTIME_MODEL,
        "instructions": _concept_instructions(payload.language),
        "voice": voice,
        "audio": {
            "input": {
                "transcription": {
                    "model": settings.OPENAI_TRANSCRIPTION_MODEL,
                    "language": payload.language,
                },
                "turn_detection": {
                    "type": "server_vad",
                    "create_response": True,
                    "interrupt_response": True,
                },
            },
        },
    }

    body = {
        "expires_after": {
            "anchor": "created_at",
            "seconds": payload.expires_after,
        },
        "session": session,
    }

    headers = {
        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            "https://api.openai.com/v1/realtime/client_secrets",
            headers=headers,
            json=body,
        )

    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=response.text)

    data = response.json()
    raw_client_secret = data.get("client_secret")
    if isinstance(raw_client_secret, str):
        client_secret = {"value": raw_client_secret}
    elif isinstance(raw_client_secret, dict):
        client_secret = {
            "value": raw_client_secret.get("value"),
            "expires_at": raw_client_secret.get("expires_at"),
        }
    elif isinstance(data.get("value"), str):
        client_secret = {
            "value": data.get("value"),
            "expires_at": data.get("expires_at"),
        }
    else:
        client_secret = {"value": None}

    if not client_secret.get("value"):
        raise HTTPException(status_code=502, detail="Realtime token response missing client_secret value")

    expires_at = data.get("expires_at")
    if expires_at is None and isinstance(data.get("client_secret"), dict):
        expires_at = data.get("client_secret", {}).get("expires_at")
    return {
        "client_secret": client_secret,
        "expires_at": expires_at,
        "session": data.get("session"),
    }


@router.post("/generate-drill")
async def generate_concept_drill(
    payload: DrillGenerateRequest,
    x_ai_internal_token: Optional[str] = Header(default=None),
):
    """Generate concept-only oral drill questions from notes."""
    _verify_internal_token(x_ai_internal_token)

    llm = LLMFactory.get_provider()
    topic_label = payload.topic or "the study topic"

    system_prompt = (
        "You are StudyBuddy's oral exam coach. Generate conceptual questions only. "
        "Do NOT include calculations, equations, formulas, or numeric problem solving. "
        "Focus on definitions, intuition, relationships, trade-offs, comparisons, and reasoning."
    )

    user_prompt = f"""
Topic: {topic_label}
Difficulty: {payload.difficulty}
Number of questions: {payload.count}

Source notes:
{payload.notes}

Return a JSON object with this shape:
{{
  "questions": [
    {{
      "question_type": "conceptual",
      "question_text": "...",
      "key_points": ["...", "..."],
      "sample_answer": "...",
      "explanation": "...",
      "difficulty": "{payload.difficulty}",
      "concepts_tested": ["...", "..."]
    }}
  ]
}}
"""

    messages = [
        LLMMessage(role="system", content=system_prompt),
        LLMMessage(role="user", content=user_prompt),
    ]

    result = await llm.generate_structured(messages, use_mini=True)
    if not isinstance(result, dict):
        result = {}
    questions = result.get("questions") or []

    if not isinstance(questions, list):
        questions = []

    cleaned: List[Dict[str, Any]] = []
    for q in questions:
        if not isinstance(q, dict):
            continue
        cleaned.append(
            {
                "question_type": q.get("question_type", "conceptual"),
                "question_text": q.get("question_text", ""),
                "key_points": [str(point) for point in (q.get("key_points") or []) if str(point).strip()],
                "sample_answer": q.get("sample_answer", ""),
                "explanation": q.get("explanation", ""),
                "difficulty": q.get("difficulty", payload.difficulty),
                "concepts_tested": [str(point) for point in (q.get("concepts_tested") or []) if str(point).strip()],
                "source": "generated",
            }
        )

    cleaned = _filter_concept_questions(cleaned)

    return {
        "questions": cleaned,
        "total": len(cleaned),
    }
