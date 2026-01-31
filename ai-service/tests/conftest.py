import os
import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, AsyncMock


def pytest_configure():
    os.environ.setdefault("DATABASE_URL", "postgresql://user:pass@localhost:5432/studybuddy")
    os.environ.setdefault("OPENAI_API_KEY", "test-key")


@pytest.fixture
def mock_llm_provider():
    """Mock LLM provider for testing without API calls."""
    provider = MagicMock()

    # Mock generate_text method
    mock_response = MagicMock()
    mock_response.content = "Test response"
    mock_response.tokens_used = 100
    mock_response.model = "test-model"
    mock_response.finish_reason = "stop"
    provider.generate_text = AsyncMock(return_value=mock_response)

    # Mock generate_embedding method
    provider.generate_embedding = AsyncMock(return_value=[0.1] * 1536)

    # Mock generate_structured method
    provider.generate_structured = AsyncMock(return_value={"key": "value"})

    return provider


@pytest.fixture
def sample_pdf_content():
    """Sample PDF text for testing."""
    return """
    Chapter 1: Introduction to Machine Learning

    Machine learning is a subset of artificial intelligence that enables computers to learn
    from data without being explicitly programmed. It involves the development of algorithms
    that can identify patterns in data and make predictions or decisions based on those patterns.

    Key Concepts:
    1. Supervised Learning - Learning from labeled data
    2. Unsupervised Learning - Finding patterns in unlabeled data
    3. Reinforcement Learning - Learning through trial and error

    Chapter 2: Neural Networks

    Neural networks are computing systems inspired by biological neural networks. They consist
    of interconnected nodes (neurons) organized in layers. Each connection has a weight that
    adjusts as learning proceeds.

    Types of Neural Networks:
    - Feedforward Neural Networks
    - Convolutional Neural Networks (CNNs)
    - Recurrent Neural Networks (RNNs)
    """


@pytest.fixture
def sample_chunks():
    """Sample document chunks for testing."""
    return [
        {
            "id": "chunk_1",
            "content": "Machine learning is a subset of artificial intelligence that enables computers to learn from data without being explicitly programmed.",
            "metadata": {"page": 1, "section": "Introduction"},
            "embedding": [0.1] * 1536
        },
        {
            "id": "chunk_2",
            "content": "Supervised learning involves learning from labeled data where the algorithm is trained on input-output pairs.",
            "metadata": {"page": 1, "section": "Key Concepts"},
            "embedding": [0.2] * 1536
        },
        {
            "id": "chunk_3",
            "content": "Neural networks are computing systems inspired by biological neural networks consisting of interconnected nodes.",
            "metadata": {"page": 2, "section": "Neural Networks"},
            "embedding": [0.3] * 1536
        }
    ]


@pytest.fixture
def sample_topics():
    """Sample extracted topics for testing."""
    return [
        {
            "id": "topic_1",
            "title": "Introduction to Machine Learning",
            "description": "Basic concepts and definitions of machine learning",
            "subtopics": ["Supervised Learning", "Unsupervised Learning", "Reinforcement Learning"]
        },
        {
            "id": "topic_2",
            "title": "Neural Networks",
            "description": "Architecture and types of neural networks",
            "subtopics": ["Feedforward Networks", "CNNs", "RNNs"]
        }
    ]


@pytest.fixture
def test_client():
    """FastAPI test client."""
    from app.main import app
    return TestClient(app)
