#!/usr/bin/env python3
"""Check the built pages against the site's word list. Warns; never stops a deploy.

    python3 scripts/copy_check.py _site
"""
import html
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
BREAK = re.compile(r"(?<=[.?!])(?<!\bSt\.)(?<!\bMt\.)(?<!\bDr\.)(?<!\bvs\.)(?<!\bMr\.)(?<!\bMs\.)(\s+)(?=[A-Z“\"‘'(<0-9])")
BANS = [
    ("em dash", r"—"), ("guaranteed", r"\bguarantee[ds]?\b"),
    ("room", r"(?<![a-z-])rooms?\b(?!\s+(?:block|rate))"), ("chair", r"\bchairs?\b"),
    ("the night wants", r"\b(?:night|evening|event|party|dinner|crowd|floor|booking)s? (?:that )?wants?\b"),
    ("books for", r"\bbooks? (?:for|as)\b"), ("a booking", r"\bplays? (?:a|the) booking\b"),
    ("under the X", r"\bunder (?:the|your) (?:first|whole|dinner|dessert|meal|toast)"),
    ("fills a floor", r"\b(?:fills?|carr(?:y|ies)) (?:a|the) (?:dance )?floor\b"),
    ("figure", r"\bthe figures?\b"), ("footage", r"\bfootage\b|\bon film\b"),
    ("named contact", r"\bnamed (?:contact|person)\b"), ("pack down", r"\bpack[- ]?down\b"),
    ("the set", r"\bthe set is built\b"), ("conversation volume", r"\bconversation volume\b"),
    ("agree a", r"\bagree (?:a|the) (?:plan|date|time|price)\b"),
    ("British", r"\b(?:afterwards|catalogue|honour|colour|favourite|enquir|organis|programme)\w*"),
    ("stock words", r"\b(?:delve|tapestry|testament|seamless(?:ly)?|bespoke|genuinely|honestly|truly|candidly)\b"),
    ("stock phrases", r"\b(?:pivotal|crucial|meticulous(?:ly)?|nuanced|intricate|boasts?|quietly (?:confident|powerful|radical|elegant))\b"),
    ("filler", r"\b(?:leverag(?:e|es|ing)|solutions|robust|holistic|synergy|turnkey|best-in-class|elevat(?:e|es|ing)|vibrant|game-changing|transformative)\b"),
    ("the version of", r"\bthe version (?:of|where)\b"), ("the shape of", r"\bthe shape of\b"),
    ("the move", r"\bthe move\b"), ("load-bearing", r"\bload-bearing\b"), ("full stop", r"\bfull stop\b"),
    ("not X but Y", r"\bnot (?:just |only |merely )?[a-z]+(?: [a-z]+){0,3},? but\b"),
]


def norm(text):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", text))).strip()

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
