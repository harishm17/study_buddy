"""Print web pages to PDF with Playwright (Chromium). Called by fetch_corpus.py.

    uv run --no-project --with playwright python -I print_pages.py URL OUT.pdf [URL OUT.pdf ...]

Kept separate because Playwright is not an ai-service dependency: fetch_corpus.py starts this
script with `uv run --with playwright`. Chromium itself must be installed
(`playwright install chromium`; it lives in ~/.cache/ms-playwright). The pages are only rendered
and printed, never interacted with.
"""
import sys

from playwright.sync_api import sync_playwright


def main(argv: list) -> int:
    if len(argv) < 2 or len(argv) % 2:
        print("usage: print_pages.py URL OUT.pdf [URL OUT.pdf ...]", file=sys.stderr)
        return 2
    pairs = list(zip(argv[0::2], argv[1::2]))
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            page = browser.new_page()
            for url, out in pairs:
                page.goto(url, wait_until="networkidle")
                page.pdf(path=out, format="Letter", print_background=False)
                print(f"printed {url} -> {out}")
        finally:
            browser.close()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
