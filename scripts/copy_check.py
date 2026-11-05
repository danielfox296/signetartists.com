#!/usr/bin/env python3
"""The copy check: reads the built pages for the words the voice standard bans.

copy_gate.py read _src, so nothing has read published copy since the site moved
to content/ on 2026-10-16. This reads what is about to be served: the page body,
the title and the search description, against the same list the copy pass uses.

It warns and never stops a deploy. Daniel's saves in the admin go through
staging, and any sentence of his wins, so a word he typed mustn't hold up Go
live. An agent who sees a warning on a line of its own rewrites the line.

Lines that may stay live in scripts/copy_check_allowed.txt, one to a line: his
sentences, client reviews, song titles, the green room and the approved Beatles
page. A line goes in there only when it's one of those.

    python3 scripts/copy_check.py _site
"""
import html
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from copy_pass import BANS, BREAK, norm

ALLOWED = pathlib.Path(__file__).with_name("copy_check_allowed.txt")


def lines(page):
    """Each sentence a visitor or a search result sees on a built page."""
    main = re.search(r"<main\b.*?</main>", page, re.S)
    if not main:
        return []
    body = re.sub(r"<(script|style|svg|iframe)\b.*?</\1>", " ", main.group(0), flags=re.S)
    body = re.sub(r"</?(?:a|strong|em|b|i|span)\b[^>]*>", "", body)
    found = [html.unescape("".join(m)) for m in re.findall(r'<title>([^<]+)|<meta name="description" content="([^"]+)', page)]
    for piece in re.split(r"<[^>]+>", body):
        found += [p for i, p in enumerate(BREAK.split(html.unescape(re.sub(r"\s+", " ", piece)).strip())) if i % 2 == 0 and p.strip()]
    return found


def main():
    site = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "_site")
    allowed = {norm(l) for l in ALLOWED.read_text(encoding="utf-8").splitlines() if l.strip()}
    hits = {}
    for path in sorted(site.rglob("*.html")):
        for line in lines(path.read_text(encoding="utf-8")):
            if norm(line) in allowed:
                continue
            for name, pattern in BANS:
                if re.search(pattern, line, re.I):
                    hits.setdefault((name, line), path.relative_to(site).as_posix())
    for (name, line), where in sorted(hits.items()):
        print(f"::warning file={where}::{name}: {line}")
    print(f"copy_check: {len(hits)} line(s) to look at.")


if __name__ == "__main__":
    main()
