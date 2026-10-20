"""Source excerpts and prompt framing shared by every content generator.

Every generator for a topic sends the same system prompt and the same excerpt block, in
the same order, and the excerpt block is marked cacheable. Structured outputs add the
output schema to the prompt, so the cache is shared between calls with the same schema:
another quiz set, exam questions after a quiz, more examples, a regenerated set.
"""
from typing import Dict, List

from app.db.connection import execute_query
from app.services.embeddings.topic_mapping import ensure_topic_mappings
from app.services.llm.base import LLMMessage

# Chunks are ~350 tokens, so this is about 8k tokens of excerpts per topic.
TOPIC_CHUNK_LIMIT = 24


class NoSourceMaterialError(ValueError):
    """The topic has no mapped excerpts, so there is nothing to generate from. Not retryable."""

    code = "NO_SOURCE_MATERIAL"


CONTENT_SYSTEM_PROMPT = """You write study material for university students from their own course materials.

Ground everything in the source excerpts you are given. When the excerpts do not cover something, stay with what they do cover rather than inventing course-specific facts.

Formatting rules for every text field:
- Use markdown: short paragraphs, bullet lists, headings where they help.
- Put any code snippet, memory layout, command or pseudo-code in a fenced code block with a language tag (```c, ```python, ```text). Use `inline code` only for short identifiers or expressions.
- Write math in LaTeX: inline $E = mc^2$, display $$\\int_0^1 f(x)\\,dx$$, chemistry $2H_2 + O_2 \\to 2H_2O$. Inside fenced code blocks, write plain text instead of LaTeX.
- Do not add citation tags such as [Citation: ...]; the app shows sources separately.
- Do not end with offers of further help."""


async def fetch_topic_chunks(topic_id: str, limit: int = TOPIC_CHUNK_LIMIT) -> List[Dict]:
    """The topic's mapped chunks, most relevant first, in a stable order.

    The mappings are brought up to date first: a topic with none (added by hand) or older than
    the newest chunk of its project is mapped again (see `ensure_topic_mappings`).
    """
    await ensure_topic_mappings(topic_id, limit)
    return await execute_query(
        """
        SELECT
            mc.id,
            mc.chunk_text,
            mc.section_hierarchy,
            mc.page_start,
            mc.page_end,
            m.id AS material_id,
            m.filename,
            m.category,
            tcm.relevance_score
        FROM topic_chunk_mappings tcm
        JOIN material_chunks mc ON tcm.chunk_id = mc.id
        JOIN materials m ON mc.material_id = m.id
        WHERE tcm.topic_id = $1
        ORDER BY tcm.relevance_score DESC, mc.id
        LIMIT $2
        """,
        topic_id,
        limit,
    )


def _pages(chunk: Dict) -> str:
    start, end = chunk.get("page_start"), chunk.get("page_end")
    if start is None:
        return "page n/a"
    if end is None or end == start:
        return f"p. {start}"
    return f"pp. {start}-{end}"


def format_source_excerpts(topic_name: str, topic_description: str, chunks: List[Dict]) -> str:
    parts = [
        f"Topic: {topic_name}",
        f"Description: {topic_description or 'n/a'}",
        "",
        "Source excerpts from the student's course materials:",
    ]
    for index, chunk in enumerate(chunks, 1):
        text = str(chunk.get("chunk_text") or "").strip()
        if not text:
            continue
        section = chunk.get("section_hierarchy") or "n/a"
        source = chunk.get("filename") or "unknown file"
        category = str(chunk.get("category") or "material").replace("_", " ")
        parts.append(
            f'<excerpt index="{index}" source="{source}" kind="{category}" '
            f'location="{_pages(chunk)}" section="{section}">\n{text}\n</excerpt>'
        )
    return "\n".join(parts)


def content_messages(
    topic_name: str,
    topic_description: str,
    chunks: List[Dict],
    instructions: str,
) -> List[LLMMessage]:
    """System prompt, cached excerpt block, then the task-specific instructions."""
    return [
        LLMMessage(role="system", content=CONTENT_SYSTEM_PROMPT),
        LLMMessage(
            role="user",
            content=format_source_excerpts(topic_name, topic_description, chunks),
            cache=True,
        ),
        LLMMessage(role="user", content=instructions),
    ]


def focus_line(focus: str | None) -> str:
    return f"\nThe student asked to focus on: {focus.strip()}\n" if focus and focus.strip() else ""
