"""Download the corpus books and cut out the chapters listed in corpus.json.

    cd ai-service && uv run python -I ../evals/retrieval/fetch_corpus.py

Books go to evals/.cache/raw/ and are checked against the SHA-256 recorded in corpus.json.
The chapter PDFs the harness ingests go to evals/.cache/documents/. Both folders are
gitignored. Downloaded files are only read as data: the book is opened with PyMuPDF to copy
page ranges and nothing in it is executed.
"""
import argparse
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

import pymupdf

EVALS_DIR = Path(__file__).resolve().parents[1]
CORPUS_FILE = Path(__file__).resolve().parent / "corpus.json"
CACHE_DIR = EVALS_DIR / ".cache"
RAW_DIR = CACHE_DIR / "raw"
DOCUMENTS_DIR = CACHE_DIR / "documents"


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def raw_path(source: dict) -> Path:
    return RAW_DIR / source["url"].rsplit("/", 1)[-1]


def download(source: dict) -> Path:
    target = raw_path(source)
    if target.exists() and sha256_of(target) == source["sha256"]:
        return target
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    partial = target.with_suffix(".part")
    print(f"downloading {source['url']}")
    request = urllib.request.Request(source["url"], headers={"User-Agent": "studybuddy-retrieval-evals"})
    with urllib.request.urlopen(request, timeout=120) as response, partial.open("wb") as out:
        while block := response.read(1 << 20):
            out.write(block)
    actual = sha256_of(partial)
    if actual != source["sha256"]:
        partial.unlink()
        raise SystemExit(
            f"SHA-256 mismatch for {source['url']}\n  expected {source['sha256']}\n  got      {actual}\n"
            "OpenStax republishes its PDFs from time to time. If the book changed, check that the "
            "page ranges in corpus.json still match, then update the checksum."
        )
    partial.replace(target)
    return target


def cut_chapters(book: Path, pages: list, target: Path) -> None:
    """Copy 1-indexed, inclusive page ranges of `book` into a new PDF."""
    with pymupdf.open(book) as source_pdf, pymupdf.open() as out:
        for first, last in pages:
            out.insert_pdf(source_pdf, from_page=first - 1, to_page=last - 1)
        out.save(target)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--force", action="store_true", help="cut the chapter PDFs again")
    args = parser.parse_args()

    corpus = json.loads(CORPUS_FILE.read_text())
    DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)
    for document in corpus["documents"]:
        target = DOCUMENTS_DIR / document["filename"]
        if target.exists() and not args.force:
            print(f"ok {document['id']}: {target}")
            continue
        book = download(corpus["sources"][document["source"]])
        cut_chapters(book, document["pages"], target)
        print(f"cut {document['id']}: {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
