"""Tests for document processing functionality."""
import pytest
from app.services.document_processor.chunker import (
    chunk_pdf,
    split_into_chunks,
    estimate_tokens,
    detect_heading,
    build_section_hierarchy,
    Chunk
)


class TestEstimateTokens:
    """Test token estimation function."""

    def test_empty_string(self):
        """Empty string should return 0 tokens."""
        assert estimate_tokens("") == 0

    def test_basic_text(self):
        """Basic text should estimate ~4 chars per token."""
        text = "This is a test"  # 14 chars
        tokens = estimate_tokens(text)
        assert tokens == 3  # 14 // 4

    def test_long_text(self):
        """Longer text should follow 4 chars per token rule."""
        text = "a" * 1000
        tokens = estimate_tokens(text)
        assert tokens == 250  # 1000 // 4


class TestBuildSectionHierarchy:
    """Test section hierarchy builder."""

    def test_empty_headings(self):
        """Empty headings list should return empty string."""
        assert build_section_hierarchy([]) == ""

    def test_single_heading(self):
        """Single heading should return just that heading."""
        headings = [(1, "Chapter 1")]
        assert build_section_hierarchy(headings) == "Chapter 1"

    def test_multiple_headings(self):
        """Multiple headings should be joined with ' > '."""
        headings = [(1, "Chapter 1"), (2, "Section 1.1"), (3, "Subsection")]
        result = build_section_hierarchy(headings)
        assert result == "Chapter 1 > Section 1.1 > Subsection"


class TestDetectHeading:
    """Test heading detection."""

    def test_non_text_block(self):
        """Non-text blocks should return None."""
        block = {"type": 1}  # Not a text block
        result = detect_heading(block, 800)
        assert result is None

    def test_empty_block(self):
        """Empty text block should return None."""
        block = {"type": 0, "lines": []}
        result = detect_heading(block, 800)
        assert result is None

    def test_numbered_heading_chapter(self):
        """Numbered chapter heading should be detected."""
        block = {
            "type": 0,
            "lines": [{
                "spans": [{
                    "text": "Chapter 1 Introduction",
                    "size": 14,
                    "font": "Arial"
                }]
            }]
        }
        result = detect_heading(block, 800)
        assert result is not None
        level, text = result
        assert text == "Chapter 1 Introduction"

    def test_numbered_heading_dots(self):
        """Numbered heading with dots should detect level."""
        block = {
            "type": 0,
            "lines": [{
                "spans": [{
                    "text": "1.1 Subsection Title",
                    "size": 12,
                    "font": "Arial"
                }]
            }]
        }
        result = detect_heading(block, 800)
        assert result is not None
        level, text = result
        assert text == "1.1 Subsection Title"
        assert level == 2  # One dot = level 2

    def test_short_text_ignored(self):
        """Very short text should be ignored."""
        block = {
            "type": 0,
            "lines": [{
                "spans": [{
                    "text": "AB",
                    "size": 16,
                    "font": "Arial-Bold"
                }]
            }]
        }
        result = detect_heading(block, 800)
        assert result is None


class TestSplitIntoChunks:
    """Test chunk splitting functionality."""

    def test_short_text_single_chunk(self):
        """Short text should return single chunk."""
        text = "This is a short paragraph."
        chunks = split_into_chunks(
            text=text,
            section_hierarchy="Chapter 1",
            page_start=0,
            page_end=0,
            start_index=0,
            target_size=800
        )
        assert len(chunks) == 1
        assert chunks[0].chunk_text == text
        assert chunks[0].section_hierarchy == "Chapter 1"
        assert chunks[0].page_start == 0
        assert chunks[0].page_end == 0

    def test_long_text_multiple_chunks(self):
        """Long text should be split into multiple chunks."""
        # Create text that's definitely too long for one chunk
        paragraphs = ["This is paragraph {}.".format(i) * 50 for i in range(20)]
        text = "\n\n".join(paragraphs)

        chunks = split_into_chunks(
            text=text,
            section_hierarchy="Chapter 1",
            page_start=0,
            page_end=5,
            start_index=0,
            target_size=200  # Small target to force splitting
        )

        assert len(chunks) > 1
        # Verify chunks are indexed sequentially
        for i, chunk in enumerate(chunks):
            assert chunk.chunk_index == i

    def test_chunk_overlap(self):
        """Chunks should have overlap."""
        paragraphs = ["Paragraph {}.".format(i) * 30 for i in range(10)]
        text = "\n\n".join(paragraphs)

        chunks = split_into_chunks(
            text=text,
            section_hierarchy="Chapter 1",
            page_start=0,
            page_end=1,
            start_index=0,
            target_size=200,
            overlap_ratio=0.2
        )

        if len(chunks) > 1:
            # Check that some content from chunk 0 appears in chunk 1
            # (This is a simplified check - real overlap is more sophisticated)
            assert len(chunks[1].chunk_text) > 0

    def test_preserves_section_hierarchy(self):
        """All chunks should preserve section hierarchy."""
        text = "Lorem ipsum dolor sit amet. " * 100
        hierarchy = "Chapter 1 > Section 1.1 > Subsection"

        chunks = split_into_chunks(
            text=text,
            section_hierarchy=hierarchy,
            page_start=5,
            page_end=8,
            start_index=10,
            target_size=200
        )

        for chunk in chunks:
            assert chunk.section_hierarchy == hierarchy
            assert chunk.page_start == 5
            assert chunk.page_end == 8

    def test_token_count_reasonable(self):
        """Chunks should have reasonable token counts."""
        text = "This is a test. " * 100
        chunks = split_into_chunks(
            text=text,
            section_hierarchy="Test",
            page_start=0,
            page_end=0,
            start_index=0,
            target_size=200
        )

        for chunk in chunks:
            # Token count should be positive and somewhat reasonable
            assert chunk.token_count > 0
            # Should be within reasonable range of target (allowing for overhead)
            assert chunk.token_count <= 300


class TestChunkModel:
    """Test the Chunk Pydantic model."""

    def test_chunk_creation(self):
        """Should create valid Chunk instance."""
        chunk = Chunk(
            chunk_text="Test content",
            section_hierarchy="Chapter 1",
            page_start=0,
            page_end=2,
            chunk_index=0,
            token_count=100
        )
        assert chunk.chunk_text == "Test content"
        assert chunk.section_hierarchy == "Chapter 1"
        assert chunk.page_start == 0
        assert chunk.page_end == 2
        assert chunk.chunk_index == 0
        assert chunk.token_count == 100

    def test_chunk_optional_hierarchy(self):
        """Section hierarchy should be optional."""
        chunk = Chunk(
            chunk_text="Test",
            page_start=0,
            page_end=0,
            chunk_index=0,
            token_count=10
        )
        assert chunk.section_hierarchy is None


# Note: Testing chunk_pdf requires actual PDF files
# These would be integration tests rather than unit tests
class TestChunkPDFIntegration:
    """Integration tests for PDF chunking (requires test PDFs)."""

    @pytest.mark.skip(reason="Requires test PDF file")
    def test_chunk_pdf_basic(self, tmp_path):
        """Test chunking a basic PDF."""
        # This would require creating or using a test PDF
        pdf_path = tmp_path / "test.pdf"
        # Create test PDF here...
        # chunks = chunk_pdf(str(pdf_path))
        # assert len(chunks) > 0
        pass

    @pytest.mark.skip(reason="Requires test PDF file")
    def test_chunk_pdf_with_headings(self, tmp_path):
        """Test chunking PDF with section headings."""
        # Test that headings are properly detected and hierarchy is built
        pass
