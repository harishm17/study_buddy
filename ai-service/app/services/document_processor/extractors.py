"""Turn uploaded study materials into markdown pages.

Every format ends up as a list of pages of markdown text: headings as `#` lines, tables as
markdown tables. PDFs come out of pymupdf4llm one page at a time, so each chunk can later be
traced to its pages. PPTX is one page per slide. DOCX has no page breaks to read, so it is a
single page with no page number.

Everything here is blocking. Call it through `asyncio.to_thread`.
"""
from __future__ import annotations

import logging
import re
import shutil
import subprocess
import tempfile
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, List, Optional

import pymupdf
import pymupdf4llm
from docx import Document
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph
from docx.text.run import Run
from pptx import Presentation
from pptx.shapes.group import GroupShape

logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".pptx", ".doc"}

# A page with fewer letters and digits than this counts as having no text (scans, pure images).
EMPTY_PAGE_ALNUM_CHARS = 20
DOC_CONVERSION_TIMEOUT_SECONDS = 120
DOCX_CHARS_PER_PAGE = 2400  # page-count estimate only; DOCX has no real pages to count

# The plain heading detection (font sizes across the whole document) is the one that stays
# consistent between pages. Layout mode decides each page on its own and would give "2.2" a
# different level on page 2 than "2.1" had on page 1.
pymupdf4llm.use_layout(False)

# PyMuPDF is not thread-safe, and jobs parse in worker threads.
_PYMUPDF_LOCK = threading.Lock()


class UnreadableDocumentError(ValueError):
    """The file's content cannot be read: corrupt, protected, or a format we cannot convert."""


@dataclass
class ExtractedPage:
    number: Optional[int]  # 1-indexed page or slide; None when the format has no pages
    text: str


@dataclass
class ExtractedDocument:
    pages: List[ExtractedPage]
    extension: str
    page_count: int

    @property
    def text(self) -> str:
        return "\n\n".join(page.text for page in self.pages if page.text)

    @property
    def empty_pages(self) -> List[int]:
        """Page numbers that carry no text. Empty for formats without pages."""
        return [
            page.number
            for page in self.pages
            if page.number is not None and _alnum_count(page.text) < EMPTY_PAGE_ALNUM_CHARS
        ]


def infer_extension(filename: str) -> str:
    return Path(filename).suffix.lower()


def _alnum_count(text: str) -> int:
    return sum(1 for char in text if char.isalnum())


def _normalize_text(text: str) -> str:
    text = text.replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _clean_table_cell(text: str) -> str:
    return " ".join(text.split()).replace("|", "\\|")


def _markdown_table(rows: List[List[str]]) -> str:
    """Markdown table from rows of cell text; the first row is the header."""
    rows = [row for row in rows if any(cell for cell in row)]
    if not rows:
        return ""
    width = max(len(row) for row in rows)
    rows = [row + [""] * (width - len(row)) for row in rows]
    lines = ["| " + " | ".join(rows[0]) + " |", "|" + "---|" * width]
    lines.extend("| " + " | ".join(row) + " |" for row in rows[1:])
    return "\n".join(lines)


# PDF

def _extract_pdf(file_path: str, markdown: bool) -> ExtractedDocument:
    with _PYMUPDF_LOCK:
        doc = pymupdf.open(file_path)
        try:
            if doc.needs_pass:
                raise UnreadableDocumentError("The PDF is password-protected.")
            pages: List[ExtractedPage] = []
            # Heading levels come from font sizes over the whole document, computed once.
            headers = pymupdf4llm.IdentifyHeaders(doc, body_limit=10) if markdown else None
            for index in range(doc.page_count):
                if markdown:
                    text = pymupdf4llm.to_markdown(
                        doc, pages=[index], hdr_info=headers, ignore_images=True
                    )
                    # "mc <sup>2</sup>" -> "mc<sup>2</sup>"
                    text = re.sub(r"[ \t]+(<su[bp]>)", r"\1", text)
                else:
                    text = doc[index].get_text()
                pages.append(ExtractedPage(number=index + 1, text=_normalize_text(text)))
            return ExtractedDocument(pages=pages, extension=".pdf", page_count=doc.page_count)
        finally:
            doc.close()


# DOCX

_HEADING_STYLE = re.compile(r"^heading (\d)$", re.IGNORECASE)


def _iter_docx_blocks(parent) -> Iterator[object]:
    """Paragraphs and tables of a body element in document order, through content controls."""
    for child in parent.iterchildren():
        if child.tag == qn("w:p"):
            yield child
        elif child.tag == qn("w:tbl"):
            yield child
        elif child.tag == qn("w:sdt"):
            content = child.find(qn("w:sdtContent"))
            if content is not None:
                yield from _iter_docx_blocks(content)


def _docx_run_text(run: Run) -> str:
    text = run.text
    if not text.strip():
        return text
    if run.font.subscript:
        return f"<sub>{text}</sub>"
    if run.font.superscript:
        return f"<sup>{text}</sup>"
    return text


def _docx_paragraph_text(paragraph: Paragraph) -> str:
    parts = []
    for item in paragraph.iter_inner_content():
        parts.append(_docx_run_text(item) if isinstance(item, Run) else item.text)
    return "".join(parts).strip()


def _docx_paragraph_markdown(paragraph: Paragraph) -> str:
    text = _docx_paragraph_text(paragraph)
    if not text:
        return ""
    style_name = (paragraph.style.name if paragraph.style is not None else "") or ""
    if style_name.lower() == "title":
        return f"# {text}"
    match = _HEADING_STYLE.match(style_name)
    if match:
        return f"{'#' * min(int(match.group(1)), 6)} {text}"
    properties = paragraph._p.pPr
    numbering = properties.numPr if properties is not None else None
    if numbering is not None or style_name.lower().startswith("list"):
        level = 0
        if numbering is not None and numbering.ilvl is not None:
            level = numbering.ilvl.val or 0
        return f"{'  ' * level}- {text}"
    return text


def _docx_table_markdown(table: Table) -> str:
    rows = []
    for row in table.rows:
        cells, previous = [], None
        for cell in row.cells:
            if cell._tc is previous:  # horizontally merged cells repeat the same cell
                continue
            previous = cell._tc
            cells.append(_clean_table_cell(cell.text))
        rows.append(cells)
    return _markdown_table(rows)


def _extract_docx(file_path: str) -> ExtractedDocument:
    document = Document(file_path)
    blocks: List[str] = []
    for element in _iter_docx_blocks(document.element.body):
        if element.tag == qn("w:p"):
            block = _docx_paragraph_markdown(Paragraph(element, document))
        else:
            block = _docx_table_markdown(Table(element, document))
        if block:
            blocks.append(block)

    text = _normalize_text("\n\n".join(blocks))
    page_count = max(1, len(text) // DOCX_CHARS_PER_PAGE)
    return ExtractedDocument(
        pages=[ExtractedPage(number=None, text=text)], extension=".docx", page_count=page_count
    )


# PPTX

def _iter_pptx_shapes(shapes) -> Iterator[object]:
    """Shapes in reading order (top to bottom, left to right), descending into groups."""
    for shape in sorted(shapes, key=lambda s: (s.top or 0, s.left or 0)):
        if isinstance(shape, GroupShape):
            yield from _iter_pptx_shapes(shape.shapes)
        else:
            yield shape


def _pptx_text_frame_markdown(text_frame) -> str:
    paragraphs = []
    for paragraph in text_frame.paragraphs:
        text = " ".join(paragraph.text.replace("\x0b", " ").split())
        if text:
            paragraphs.append((paragraph.level or 0, text))
    if len(paragraphs) == 1 and paragraphs[0][0] == 0:
        return paragraphs[0][1]
    return "\n".join(f"{'  ' * level}- {text}" for level, text in paragraphs)


def _pptx_slide_markdown(slide, number: int) -> str:
    title_shape = slide.shapes.title
    title = ""
    if title_shape is not None and title_shape.has_text_frame:
        title = " ".join(title_shape.text_frame.text.split())
    blocks = [f"# {title or f'Slide {number}'}"]

    for shape in _iter_pptx_shapes(slide.shapes):
        if title_shape is not None and shape.shape_id == title_shape.shape_id:
            continue
        if getattr(shape, "has_table", False) and shape.has_table:
            rows = [
                [_clean_table_cell(cell.text) for cell in row.cells] for row in shape.table.rows
            ]
            block = _markdown_table(rows)
        elif getattr(shape, "has_text_frame", False) and shape.has_text_frame:
            block = _pptx_text_frame_markdown(shape.text_frame)
        else:
            continue
        if block:
            blocks.append(block)

    if slide.has_notes_slide and slide.notes_slide.notes_text_frame is not None:
        notes = slide.notes_slide.notes_text_frame.text.strip()
        if notes:
            blocks.append(f"Speaker notes:\n{notes}")
    return "\n\n".join(blocks)


def _extract_pptx(file_path: str) -> ExtractedDocument:
    presentation = Presentation(file_path)
    pages = [
        ExtractedPage(number=number, text=_normalize_text(_pptx_slide_markdown(slide, number)))
        for number, slide in enumerate(presentation.slides, start=1)
    ]
    return ExtractedDocument(pages=pages, extension=".pptx", page_count=len(pages))


# Legacy DOC

def _extract_doc(file_path: str) -> ExtractedDocument:
    """Legacy Word files are converted to DOCX with LibreOffice, then read as DOCX."""
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        raise UnreadableDocumentError(
            "Legacy .doc files need LibreOffice to be read, and it is not installed on this "
            "server. Please save the file as .docx or PDF and upload it again."
        )

    work_dir = tempfile.mkdtemp(prefix="studybuddy-doc-")
    try:
        # A private profile dir keeps parallel conversions from fighting over one lock.
        subprocess.run(
            [
                soffice,
                f"-env:UserInstallation=file://{work_dir}/profile",
                "--headless",
                "--convert-to",
                "docx",
                "--outdir",
                work_dir,
                file_path,
            ],
            capture_output=True,
            timeout=DOC_CONVERSION_TIMEOUT_SECONDS,
            check=False,
        )
        converted = Path(work_dir) / f"{Path(file_path).stem}.docx"
        if not converted.is_file():
            raise UnreadableDocumentError(
                "The .doc file could not be converted. Please save it as .docx or PDF and "
                "upload it again."
            )
        result = _extract_docx(str(converted))
        result.extension = ".doc"
        return result
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def extract_document(file_path: str, filename: str, markdown: bool = True) -> ExtractedDocument:
    """Read a supported file into pages.

    `markdown=False` reads PDFs as plain text, which is much faster and enough for validation.
    A file whose content cannot be parsed raises `UnreadableDocumentError`; environment
    problems (disk, memory, a hung converter) keep their own exception types.
    """
    extension = infer_extension(filename)
    if extension not in SUPPORTED_EXTENSIONS:
        raise UnreadableDocumentError(
            f"Unsupported file extension '{extension}'. "
            "Supported formats: .pdf, .docx, .pptx, .doc"
        )

    try:
        if extension == ".pdf":
            return _extract_pdf(file_path, markdown)
        if extension == ".docx":
            return _extract_docx(file_path)
        if extension == ".pptx":
            return _extract_pptx(file_path)
        return _extract_doc(file_path)
    except (UnreadableDocumentError, subprocess.TimeoutExpired, MemoryError, OSError):
        raise
    except Exception as exc:
        logger.warning("Could not parse %s: %s", filename, exc)
        raise UnreadableDocumentError(
            f"The {extension} file could not be read (it may be corrupt): {exc}"
        ) from exc
