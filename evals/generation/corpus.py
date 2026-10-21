"""Corpus descriptions for the generation eval (corpora/*.json) and where their files live."""
import json
import re
from pathlib import Path
from typing import List

HERE = Path(__file__).resolve().parent
CORPORA_DIR = HERE / "corpora"
CACHE_DIR = HERE.parent / ".cache" / "generation"


def corpus_ids() -> List[str]:
    return sorted(path.stem for path in CORPORA_DIR.glob("*.json"))


def load_corpus(corpus_id: str) -> dict:
    path = CORPORA_DIR / f"{corpus_id}.json"
    if not path.exists():
        raise SystemExit(f"unknown corpus '{corpus_id}'. Available: {', '.join(corpus_ids())}")
    corpus = json.loads(path.read_text())
    ids = [d["id"] for d in corpus["documents"]]
    if len(ids) != len(set(ids)):
        raise SystemExit(f"{path} has duplicate document ids")
    return corpus


def document_path(corpus: dict, document: dict) -> Path:
    return CACHE_DIR / corpus["id"] / document["filename"]


def pdf_text_sha256(path: Path) -> str:
    """Hash of a PDF's text, pages joined and whitespace collapsed.

    Used for pages printed from HTML: the printed bytes differ from run to run (timestamps), the
    text does not.
    """
    import hashlib

    import pymupdf

    with pymupdf.open(path) as pdf:
        text = " ".join(page.get_text() for page in pdf)
    return hashlib.sha256(re.sub(r"\s+", " ", text).strip().encode("utf-8")).hexdigest()
