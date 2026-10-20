"""Text embeddings for chunks and search queries.

The default runs BAAI/bge-small-en-v1.5 locally through fastembed (ONNX, CPU): no API key
and no per-call cost. Claude has no embeddings endpoint, so the OpenAI provider stays
available for anyone who prefers text-embedding-3-small.

Chunks and queries are embedded differently: bge models expect a retrieval instruction on
the query side, which `embed_query` adds.
"""
import asyncio
import logging
import threading
from abc import ABC, abstractmethod
from typing import List, Optional

from app.config import settings

logger = logging.getLogger(__name__)

# The local model's runtime is CPU-bound; batches are small enough to keep latency even.
LOCAL_BATCH_SIZE = 32
OPENAI_BATCH_SIZE = 100


class Embedder(ABC):
    name: str

    @abstractmethod
    async def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Embeddings for stored chunks, in input order."""

    @abstractmethod
    async def embed_query(self, text: str) -> List[float]:
        """Embedding for a search query."""


class LocalEmbedder(Embedder):
    """fastembed (ONNX Runtime) in a worker thread, so the event loop stays free."""

    def __init__(self, model_name: str, cache_dir: Optional[str] = None):
        self.name = model_name
        self._cache_dir = cache_dir or None
        self._model = None
        self._load_lock = threading.Lock()

    def _get_model(self):
        with self._load_lock:
            if self._model is None:
                from fastembed import TextEmbedding

                logger.info("Loading local embedding model %s", self.name)
                self._model = TextEmbedding(model_name=self.name, cache_dir=self._cache_dir)
            return self._model

    def _embed_documents_sync(self, texts: List[str]) -> List[List[float]]:
        model = self._get_model()
        return [vector.tolist() for vector in model.embed(texts, batch_size=LOCAL_BATCH_SIZE)]

    def _embed_query_sync(self, text: str) -> List[float]:
        model = self._get_model()
        return next(iter(model.query_embed(text))).tolist()

    async def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return await asyncio.to_thread(self._embed_documents_sync, texts)

    async def embed_query(self, text: str) -> List[float]:
        return await asyncio.to_thread(self._embed_query_sync, text)


class OpenAIEmbedder(Embedder):
    def __init__(self, api_key: str, model_name: str):
        if not api_key:
            raise ValueError("EMBEDDING_PROVIDER=openai needs OPENAI_API_KEY")
        from openai import AsyncOpenAI

        self.name = model_name
        self._client = AsyncOpenAI(api_key=api_key, timeout=60.0, max_retries=2)

    async def embed_documents(self, texts: List[str]) -> List[List[float]]:
        vectors: List[List[float]] = []
        for start in range(0, len(texts), OPENAI_BATCH_SIZE):
            response = await self._client.embeddings.create(
                model=self.name, input=texts[start : start + OPENAI_BATCH_SIZE]
            )
            vectors.extend(item.embedding for item in response.data)
        return vectors

    async def embed_query(self, text: str) -> List[float]:
        response = await self._client.embeddings.create(model=self.name, input=[text])
        return response.data[0].embedding


_embedder: Optional[Embedder] = None


def get_embedder() -> Embedder:
    global _embedder
    if _embedder is None:
        provider = settings.EMBEDDING_PROVIDER.lower()
        if provider == "local":
            _embedder = LocalEmbedder(settings.EMBEDDING_MODEL, settings.EMBEDDING_CACHE_DIR)
        elif provider == "openai":
            _embedder = OpenAIEmbedder(settings.OPENAI_API_KEY, settings.OPENAI_EMBEDDING_MODEL)
        else:
            raise ValueError(f"Unknown EMBEDDING_PROVIDER: {provider} (use local or openai)")
    return _embedder


def reset_embedder() -> None:
    """Drop the cached embedder (tests)."""
    global _embedder
    _embedder = None


async def generate_embeddings(texts: List[str]) -> List[List[float]]:
    """Embeddings for chunk texts, in input order."""
    if not texts:
        return []
    embedder = get_embedder()
    logger.info("Embedding %s chunks with %s", len(texts), embedder.name)
    return await embedder.embed_documents(texts)


async def generate_query_embedding(text: str) -> List[float]:
    """Embedding for a search query."""
    return await get_embedder().embed_query(text)
