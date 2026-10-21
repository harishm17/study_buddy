"""Download the generation-eval corpora into evals/.cache/generation/ and verify them.

    cd ai-service && uv run python -I ../evals/generation/fetch_corpus.py [--corpus mit-18.05]

Every file in corpora/*.json is either a PDF downloaded from MIT OpenCourseWare and checked
against its SHA-256, or an OCW web page printed to PDF with Playwright. Printed bytes change from
run to run, so a printed page is checked against the hash of its extracted text instead.
Printing starts `uv run --with playwright print_pages.py` in a subprocess (Playwright is not an
ai-service dependency) and needs Chromium (`playwright install chromium`).

Files are only read as data: PDFs are opened with PyMuPDF to hash their text and nothing in them
is executed. The cache folder is gitignored.
"""
import argparse
import subprocess
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from corpus import CACHE_DIR, corpus_ids, document_path, load_corpus, pdf_text_sha256  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from common.ingest import file_sha256  # noqa: E402

PRINT_SCRIPT = Path(__file__).resolve().parent / "print_pages.py"
USER_AGENT = "margins-generation-evals"


def verify(document: dict, path: Path) -> str:
    """Return "" when the file matches the corpus description, else why not."""
    if document["kind"] == "pdf":
        actual = file_sha256(path)
        if actual != document["sha256"]:
            return f"SHA-256 mismatch\n  expected {document['sha256']}\n  got      {actual}"
    else:
        actual = pdf_text_sha256(path)
        if actual != document["text_sha256"]:
            return f"text SHA-256 mismatch (printed page)\n  expected {document['text_sha256']}\n  got      {actual}"
    return ""


def download(document: dict, target: Path) -> None:
    partial = target.with_suffix(".part")
    print(f"  downloading {document['url']}")
    request = urllib.request.Request(document["url"], headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response, partial.open("wb") as out:
        while block := response.read(1 << 20):
            out.write(block)
    partial.replace(target)


def print_pages(jobs: list) -> None:
    """jobs: [(url, target path)]. One browser for all pages."""
    args = []
    for url, target in jobs:
        args += [url, str(target)]
    command = ["uv", "run", "--no-project", "--with", "playwright", "python", "-I", str(PRINT_SCRIPT), *args]
    print(f"  printing {len(jobs)} page(s) with Playwright")
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit(
            "Printing pages with Playwright failed. Is Chromium installed "
            "(uv run --no-project --with playwright playwright install chromium)?\n" + result.stderr[-2000:]
        )


def fetch(corpus_id: str, force: bool) -> bool:
    corpus = load_corpus(corpus_id)
    folder = CACHE_DIR / corpus["id"]
    folder.mkdir(parents=True, exist_ok=True)
    print(f"{corpus['id']}: {corpus['title']}")
    to_print = []
    ok = True
    for document in corpus["documents"]:
        path = document_path(corpus, document)
        if path.exists() and not force and not verify(document, path):
            print(f"  ok {document['id']}")
            continue
        if document["kind"] == "pdf":
            download(document, path)
            problem = verify(document, path)
            if problem:
                path.unlink()
                print(f"  FAILED {document['id']}: {problem}\n  The file at {document['url']} changed. Check it is still the same document, then update corpora/{corpus['id']}.json.")
                ok = False
            else:
                print(f"  ok {document['id']} (downloaded)")
        else:
            to_print.append((document, path))
    if to_print:
        print_pages([(document["url"], path) for document, path in to_print])
        for document, path in to_print:
            problem = verify(document, path)
            if problem:
                print(f"  FAILED {document['id']}: {problem}\n  The page changed. Check it, then update corpora/{corpus['id']}.json.")
                ok = False
            else:
                print(f"  ok {document['id']} (printed)")
    return ok


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--corpus", action="append", help="corpus id (default: all)")
    parser.add_argument("--force", action="store_true", help="download and print again")
    args = parser.parse_args()
    results = [fetch(corpus_id, args.force) for corpus_id in (args.corpus or corpus_ids())]
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
