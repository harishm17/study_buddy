"""PDF chunking service with semantic section detection."""
import logging
import re
from typing import List, Optional
from pydantic import BaseModel
import pymupdf  # PyMuPDF

logger = logging.getLogger(__name__)


class Chunk(BaseModel):
    """Represents a semantic chunk of text from a PDF."""

    chunk_text: str
    section_hierarchy: Optional[str] = None  # e.g., "Chapter 3 > Section 3.2 > Photosynthesis"
    page_start: int
    page_end: int
    chunk_index: int
    token_count: int


def estimate_tokens(text: str) -> int:
    """
    Rough estimation of tokens (1 token ≈ 4 characters).

    Args:
        text: Text to estimate

    Returns:
        Estimated token count
    """
    return len(text) // 4


def detect_heading(block: dict, page_height: float) -> Optional[tuple[int, str]]:
    """
    Detect if a text block is a heading based on font size and position.

    Args:
        block: PyMuPDF text block
        page_height: Page height for position analysis

    Returns:
        Tuple of (heading_level, text) or None
    """
    if block.get("type") != 0:  # Only text blocks
        return None

    lines = block.get("lines", [])
    if not lines:
        return None

    # Get first span (assumes heading is in first line)
    first_line = lines[0]
    spans = first_line.get("spans", [])
    if not spans:
        return None

    first_span = spans[0]
    font_size = first_span.get("size", 0)
    text = first_span.get("text", "").strip()

    # Skip empty or very short text
    if len(text) < 3:
        return None

    # Heading detection heuristics
    is_bold = "bold" in first_span.get("font", "").lower()
    is_large = font_size > 12
    is_title_case = text[0].isupper()

    # Check for numbered headings (1., 1.1, Chapter 1, etc.)
    has_numbering = bool(re.match(r'^(\d+\.?)+\s+', text)) or \
                   bool(re.match(r'^(Chapter|Section|Part)\s+\d+', text, re.IGNORECASE))

    # Determine heading level
    if has_numbering:
        # Count dots to determine depth (1 = h1, 1.1 = h2, 1.1.1 = h3)
        dots = text.split()[0].count('.')
        level = min(dots + 1, 3)
        return (level, text)
    elif is_bold and is_large and is_title_case:
        # Larger font = higher level heading
        if font_size > 16:
            return (1, text)
        elif font_size > 14:
            return (2, text)
        else:
            return (3, text)

    return None


def build_section_hierarchy(headings: List[tuple[int, str]]) -> str:
    """
    Build hierarchical section path from heading stack.

    Args:
        headings: List of (level, text) tuples

    Returns:
        Formatted hierarchy string (e.g., "Chapter 3 > Section 3.2 > Photosynthesis")
    """
    return " > ".join([h[1] for h in headings])


def chunk_pdf(pdf_path: str, target_chunk_size: int = 800) -> List[Chunk]:
    """
    Chunk a PDF into semantic sections.

    Strategy:
    1. Parse PDF and detect headings
    2. Group content under headings
    3. Split large sections into chunks (~500-1000 tokens)
    4. Preserve section hierarchy for context

    Args:
        pdf_path: Path to PDF file
        target_chunk_size: Target tokens per chunk (default: 800)

    Returns:
        List of Chunk objects
    """
    logger.info(f"Chunking PDF: {pdf_path}")

    try:
        doc = pymupdf.open(pdf_path)
        chunks = []
        chunk_index = 0

        # Track current section hierarchy
        heading_stack = []  # [(level, text), ...]
        current_section_text = []
        current_section_start_page = 0

        for page_num in range(len(doc)):
            page = doc[page_num]
            page_height = page.rect.height

            # Get text blocks with structure
            blocks = page.get_text("dict")["blocks"]

            for block in blocks:
                if block.get("type") != 0:  # Skip non-text blocks
                    continue

                # Extract block text
                block_text = ""
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        block_text += span.get("text", "") + " "
                block_text = block_text.strip()

                if not block_text:
                    continue

                # Check if this is a heading
                heading = detect_heading(block, page_height)

                if heading:
                    level, heading_text = heading

                    # Save previous section as chunk(s) if we have content
                    if current_section_text:
                        section_text = "\n".join(current_section_text)
                        section_chunks = split_into_chunks(
                            section_text,
                            build_section_hierarchy(heading_stack),
                            current_section_start_page,
                            page_num - 1,
                            chunk_index,
                            target_chunk_size
                        )
                        chunks.extend(section_chunks)
                        chunk_index += len(section_chunks)
                        current_section_text = []

                    # Update heading stack
                    # Remove headings at same or lower level
                    heading_stack = [(l, t) for l, t in heading_stack if l < level]
                    heading_stack.append((level, heading_text))

                    current_section_start_page = page_num
                else:
                    # Regular text - add to current section
                    current_section_text.append(block_text)

        # Process final section
        if current_section_text:
            section_text = "\n".join(current_section_text)
            section_chunks = split_into_chunks(
                section_text,
                build_section_hierarchy(heading_stack),
                current_section_start_page,
                len(doc) - 1,
                chunk_index,
                target_chunk_size
            )
            chunks.extend(section_chunks)

        doc.close()

        logger.info(f"Created {len(chunks)} chunks from PDF")
        return chunks

    except Exception as e:
        logger.error(f"Error chunking PDF: {e}")
        raise


def split_into_chunks(
    text: str,
    section_hierarchy: str,
    page_start: int,
    page_end: int,
    start_index: int,
    target_size: int = 800
) -> List[Chunk]:
    """
    Split long text into chunks of approximately target_size tokens.

    Args:
        text: Text to split
        section_hierarchy: Section path
        page_start: Starting page number
        page_end: Ending page number
        start_index: Starting chunk index
        target_size: Target tokens per chunk

    Returns:
        List of Chunk objects
    """
    chunks = []

    # If text fits in one chunk, return it
    token_count = estimate_tokens(text)
    if token_count <= target_size * 1.2:  # Allow 20% overflow
        return [
            Chunk(
                chunk_text=text,
                section_hierarchy=section_hierarchy,
                page_start=page_start,
                page_end=page_end,
                chunk_index=start_index,
                token_count=token_count
            )
        ]

    # Split by paragraphs (double newline)
    paragraphs = text.split("\n\n")

    current_chunk = []
    current_tokens = 0
    chunk_idx = start_index

    for para in paragraphs:
        para_tokens = estimate_tokens(para)

        # If adding this paragraph exceeds target, save current chunk
        if current_tokens + para_tokens > target_size and current_chunk:
            chunk_text = "\n\n".join(current_chunk)
            chunks.append(
                Chunk(
                    chunk_text=chunk_text,
                    section_hierarchy=section_hierarchy,
                    page_start=page_start,
                    page_end=page_end,
                    chunk_index=chunk_idx,
                    token_count=current_tokens
                )
            )
            chunk_idx += 1
            current_chunk = []
            current_tokens = 0

        current_chunk.append(para)
        current_tokens += para_tokens

    # Add remaining text as final chunk
    if current_chunk:
        chunk_text = "\n\n".join(current_chunk)
        chunks.append(
            Chunk(
                chunk_text=chunk_text,
                section_hierarchy=section_hierarchy,
                page_start=page_start,
                page_end=page_end,
                chunk_index=chunk_idx,
                token_count=current_tokens
            )
        )

    return chunks
