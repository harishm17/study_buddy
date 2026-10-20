"""Text embeddings for chunks and search queries.

The default runs BAAI/bge-small-en-v1.5 locally through fastembed (ONNX, CPU): no API key
and no per-call cost. Claude has no embeddings endpoint, so the OpenAI provider stays
available for anyone who prefers text-embedding-3-small.

Chunks and queries are embedded differently: bge models expect a retrieval instruction on
the query side, which `embed_query` adds.

Vector size is fixed at EMBEDDING_DIMENSIONS: `material_chunks.chunk_embedding` is
`vector(384)` with an HNSW index (migration 20261022000000_retrieval_indexes). The OpenAI
provider returns 1536 numbers, which do not fit; switching to it needs a migration that
changes the column and index size, then scripts/reembed_chunks.py. Embedders that return
another size fail loudly instead of writing vectors the database would reject.
"""
import asyncio
import logging
import threading
from abc import ABC, abstractmethod
from typing import List, Optional

from app.config import settings

logger = logging.getLogger(__name__)

# Size of every stored and query vector. Must match `vector(N)` in the database.
EMBEDDING_DIMENSIONS = 384

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


def embedding_text(section_hierarchy: Optional[str], chunk_text: str) -> str:
    """The text that is embedded for a chunk: its heading path, then its text.

    The heading carries context the body often lacks ("Chapter 6 > 6.2 Operant conditioning"
    over a paragraph that only says "the animal learned..."). The stored chunk_text is not
    changed. The chunk job and scripts/reembed_chunks.py both use this, so vectors stay
    comparable.
    """
    text = (chunk_text or "").replace("\x00", "")
    heading = (section_hierarchy or "").replace("\x00", "").strip()
    return f"{heading}\n\n{text}" if heading else text


def _check_dimensions(vectors: List[List[float]], embedder: Embedder) -> None:
    for vector in vectors:
        if len(vector) != EMBEDDING_DIMENSIONS:
            raise ValueError(
                f"{embedder.name} returned {len(vector)}-number vectors but the database column "
                f"is vector({EMBEDDING_DIMENSIONS}). See the note at the top of "
                "app/services/embeddings/generator.py before changing the embedding model."
            )


async def generate_embeddings(texts: List[str]) -> List[List[float]]:
    """Embeddings for chunk texts, in input order. Build the texts with `embedding_text`."""
    if not texts:
        return []
    embedder = get_embedder()
    logger.info("Embedding %s chunks with %s", len(texts), embedder.name)
    vectors = await embedder.embed_documents(texts)
    _check_dimensions(vectors, embedder)
    return vectors


async def generate_query_embedding(text: str) -> List[float]:
    """Embedding for a search query."""
    embedder = get_embedder()
    vector = await embedder.embed_query(text)
    _check_dimensions([vector], embedder)
    return vector
