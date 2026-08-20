#!/usr/bin/env python3
"""Uniqueness gate for the occasion x location pages (SEO buildout §5).

Templated city clones are a doorway-page liability, so every location page
must share no more than ~40% of its body prose with any sibling or with its
parent hub. This measures that: built HTML in, <main> prose out (data blocks
excluded), 5-word shingles compared pairwise.

Data blocks are excluded because they are deliberately identical everywhere
they render: the offer close (one offer sentence sitewide is the conversion
spine, not doorway copy), rate tables and figure pairs (the published card is
the product), the season board, and the FAQ lists are compared separately by
eye. What this script measures is the prose a doorway page would clone.

Run: python3 scripts/uniqueness_check.py   (after python3 build.py)
Exit 1 if any pair exceeds the threshold.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent.parent
THRESHOLD = 0.40
SHINGLE = 5

GROUPS = {
    "corporate/holiday-party": [
        "corporate/holiday-party/index.html",
        "corporate/holiday-party/denver/index.html",
        "corporate/holiday-party/colorado-springs/index.html",
    ],
    "private-parties": [
        "private-parties/index.html",
        "private-parties/denver/index.html",
        "private-parties/boulder/index.html",
    ],
    "corporate/retreats": [
        "corporate/retreats/index.html",
        "corporate/retreats/vail/index.html",
        "corporate/retreats/aspen/index.html",
        "corporate/retreats/beaver-creek/index.html",
        "corporate/retreats/breckenridge/index.html",
    ],
    "weddings/cocktail-hour": [
        "weddings/cocktail-hour/index.html",
        "weddings/cocktail-hour/denver/index.html",
    ],
}

# Markup whose contents are deliberately shared, stripped before comparison.
EXCLUDE = [
    r"<table.*?</table>",
    r"<ul class=\"season-board\">.*?</ul>",
    r"<dl class=\"figure-pair\">.*?</dl>",
    r"<dl class=\"faq-list\">.*?</dl>",
    r"<header.*?</header>",
    r"<footer.*?</footer>",
    r"<script.*?</script>",
    # The offer close: the fixed sentence + CTA block.
    r"<section[^>]*><div class=\"wrap\">\s*<div class=\"close-row\">.*?</section>",
]


def prose(path: pathlib.Path) -> list:
    html = path.read_text(encoding="utf-8")
    m = re.search(r"<main>(.*)</main>", html, re.DOTALL)
    body = m.group(1) if m else html
    for pat in EXCLUDE:
        body = re.sub(pat, " ", body, flags=re.DOTALL)
    text = re.sub(r"<[^>]+>", " ", body)
    words = re.findall(r"[a-z0-9']+", text.lower())
    return words


def shingles(words: list) -> set:
    return {tuple(words[i : i + SHINGLE]) for i in range(len(words) - SHINGLE + 1)}


def main() -> int:
    failures = 0
    for group, pages in GROUPS.items():
        texts = {}
        for p in pages:
            path = ROOT / p
            if path.exists():
                texts[p] = shingles(prose(path))
        keys = list(texts)
        if len(keys) < 2:
            continue
        print(f"\n{group}")
        for i, a in enumerate(keys):
            for b in keys[i + 1 :]:
                small = min(len(texts[a]), len(texts[b])) or 1
                overlap = len(texts[a] & texts[b]) / small
                flag = "  FAIL" if overlap > THRESHOLD else ""
                print(f"  {overlap:5.0%}  {a} ~ {b}{flag}")
                if overlap > THRESHOLD:
                    failures += 1
    if failures:
        print(f"\n{failures} pair(s) over the {THRESHOLD:.0%} gate.")
    else:
        print("\nAll pairs clear the gate.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
