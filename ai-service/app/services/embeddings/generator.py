"""Embedding generation service."""
import logging
from typing import List
from app.services.llm import LLMFactory

logger = logging.getLogger(__name__)


async def generate_embeddings(texts: List[str]) -> List[List[float]]:
    """
    Generate embeddings for a list of texts.

    Uses OpenAI text-embedding-3-small model.
    Batch processing for efficiency.

    Args:
        texts: List of text strings to embed

    Returns:
        List of embedding vectors (each is List[float] of length 1536)
    """
    if not texts:
        return []

    try:
        logger.info(f"Generating embeddings for {len(texts)} texts")

        llm = LLMFactory.get_provider()
        embeddings = []

        # Batch process (OpenAI allows up to 2048 inputs per request)
        batch_size = 100
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            logger.debug(f"Processing batch {i // batch_size + 1}/{(len(texts) + batch_size - 1) // batch_size}")

            # Generate embeddings for batch
            # Note: Base LLM interface only has single-text embedding
            # For production, we'd extend the interface or use OpenAI client directly
            for text in batch:
                embedding = await llm.generate_embedding(text)
                embeddings.append(embedding)

        logger.info(f"Generated {len(embeddings)} embeddings")
        return embeddings

    except Exception as e:
        logger.error(f"Error generating embeddings: {e}")
        raise


async def generate_single_embedding(text: str) -> List[float]:
    """
    Generate embedding for a single text.

    Args:
        text: Text to embed

    Returns:
        Embedding vector (List[float] of length 1536)
    """
    llm = LLMFactory.get_provider()
    return await llm.generate_embedding(text)
