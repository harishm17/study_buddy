"""Collect token usage per job so cost can be stored and capped."""
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Dict, Generator, List, Optional

from app.services.llm.base import LLMUsage

_collector: ContextVar[Optional[List[LLMUsage]]] = ContextVar("llm_usage_collector", default=None)

# USD per million tokens: (input, output, cache read, cache write).
# Cache writes use the 5-minute TTL rate (1.25x input).
_PRICES: Dict[str, tuple[float, float, float, float]] = {
    "claude-opus-5-5": (4.00, 20.00, 0.20, 5.00),
    "claude-sonnet-5-5": (2.00, 10.00, 0.20, 2.50),
    "claude-haiku-5-5": (0.10, 0.50, 0.01, 0.125),
}


def record_usage(usage: LLMUsage) -> None:
    collector = _collector.get()
    if collector is not None:
        collector.append(usage)


@contextmanager
def track_llm_usage() -> Generator[List[LLMUsage]]:
    """Collect every call made inside the block (including concurrent tasks it starts)."""
    collected: List[LLMUsage] = []
    token = _collector.set(collected)
    try:
        yield collected
    finally:
        _collector.reset(token)


def estimate_cost_usd(usage: LLMUsage) -> Optional[float]:
    prices = _PRICES.get(usage.model)
    if prices is None:
        return None
    input_price, output_price, cache_read_price, cache_write_price = prices
    total = (
        usage.input_tokens * input_price
        + usage.output_tokens * output_price
        + usage.cache_read_input_tokens * cache_read_price
        + usage.cache_creation_input_tokens * cache_write_price
    )
    return total / 1_000_000


def summarize_usage(usages: List[LLMUsage]) -> Dict[str, object]:
    """Totals for a job's result_data."""
    costs = [estimate_cost_usd(u) for u in usages]
    known_costs = [c for c in costs if c is not None]
    return {
        "calls": len(usages),
        "models": sorted({u.model for u in usages}),
        "input_tokens": sum(u.input_tokens for u in usages),
        "output_tokens": sum(u.output_tokens for u in usages),
        "cache_read_input_tokens": sum(u.cache_read_input_tokens for u in usages),
        "cache_creation_input_tokens": sum(u.cache_creation_input_tokens for u in usages),
        "estimated_cost_usd": round(sum(known_costs), 6) if known_costs else None,
    }
