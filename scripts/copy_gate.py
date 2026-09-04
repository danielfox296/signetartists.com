#!/usr/bin/env python3
"""Mechanical copy gate (handoff §7, plus the 2026-09-04 no-published-price law).

Two passes.

1. Authored sources under the buildout page dirs get the greppable copy bans:
   em dashes, the word AI, chair, room/rooms (ballroom and green room exempt),
   exclamation marks, and the consultant kill list. The judgment calls
   (negation headlines, "book" as repertoire, invented claims) stay with Copy
   QA; this catches the mechanical ones before a human wastes a pass on them.

2. The whole built site, every index.html plus llms.txt, gets the money gate.
   From 2026-09-04 the site publishes no Signet price of any kind: no card, no
   floor, no "from", no hourly, no call-out grid, no uplift percentage, no
   travel figure, no discount rule. The only legal dollar figures and
   percentages are the ones in _src/data/market-rates.json, and a page that
   prints one has to print its source beside it (build.py enforces that half).
   A phrase ban catches the claims that survive a figure sweep, the "every
   rate", "rates published", "from $" family.

   The audit is deliberately whole-site rather than a directory list: the
   2026-08-28 pass left pricing, home, music, planners, contact, 404 and the
   blog ungated, and a per-directory allowlist is how that happens again.

Run: python3 scripts/copy_gate.py [page-dir ...]   (default: the buildout dirs)
Exit 1 on any hit.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent.parent
PAGES = ROOT / "_src" / "pages"

BUILDOUT_DIRS = [
    "corporate", "corporate-holiday-party", "corporate-client-dinners",
    "corporate-retreats", "private-parties", "private-parties-denver",
    "private-parties-boulder", "weddings-cocktail-hour",
    "weddings-cocktail-hour-denver", "guides-live-music-cost",
    "corporate-holiday-party-denver", "corporate-holiday-party-colorado-springs",
    "corporate-retreats-vail", "corporate-retreats-aspen",
    "corporate-retreats-beaver-creek", "corporate-retreats-breckenridge",
    "ensembles-solo-guitarist", "ensembles-acoustic-duo",
    "ensembles-jazz-duo-trio", "ensembles-flamenco-trio", "ensembles-dj",
    "artists-tejas-singh", "pricing",
]

COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)

# (label, pattern, what to do). Applied to section text with HTML comments
# stripped (comments are editorial and never ship) and to schema.json.
CHECKS = [
    ("em dash", re.compile("—"), "rewrite with commas, colons or periods"),
    ("the word AI", re.compile(r"\bAI\b"), "never publishes"),
    ("chair", re.compile(r"\bchairs?\b", re.IGNORECASE), "the seat/role sense is banned"),
    ("room/rooms", re.compile(r"(?<!ball)(?<!green )\brooms?\b", re.IGNORECASE),
     "say venue, floor, crowd, night (ballroom/green room exempt)"),
    ("exclamation mark", re.compile(r"!(?!\[)"), "no exclamation marks"),
    ("consultant vocabulary", re.compile(
        r"\b(leverage|seamless|elevate|curated|bespoke|solutions|unforgettable"
        r"|magical|world-class|premier|award-winning)\b", re.IGNORECASE),
     "kill list"),
    ("the word quietly", re.compile(r"\bquietly\b", re.IGNORECASE), "never publishes"),
]

# Claims that survive a figure sweep because they carry no number. Whole site,
# zero hits. "call-out" is how this market bills and the two market pages
# explain that, so it is allowed on those paths and nowhere else.
PHRASE_BANS = [
    ("every rate", None),
    ("rates published", None),
    ("rate published", None),
    ("published rates", None),
    ("published card", None),
    ("rate card", None),
    ("no quote required", None),
    ("every figure", None),
    ("starting at", None),
    ("from $", None),
    ("per hour", None),
    # "call-out" is how this market bills. The three pages whose subject is
    # exactly that may use the word; nowhere else may.
    ("call-out", ("pricing/index.html",
                  "guides/live-music-cost-colorado/index.html",
                  "blog/what-live-music-costs-corporate-event/index.html",
                  "blog/how-to-read-a-band-quote/index.html")),
    ("+25%", None),
    ("+50%", None),
    ("10% off", None),
]


def check_file(path: pathlib.Path) -> list:
    text = path.read_text(encoding="utf-8")
    if path.suffix == ".html":
        text = COMMENT.sub("", text)
    hits = []
    for i, line in enumerate(text.splitlines(), 1):
        for label, pat, fix in CHECKS:
            if pat.search(line):
                hits.append((path, i, label, fix, line.strip()[:90]))
    return hits


def legal_figures() -> tuple:
    """Every dollar figure and percentage the site may print.

    Rebuilt 2026-09-04 from market-rates.json alone. The old version read
    site.json rates, acts.json rateCard and site.json extras, and carried a
    hardcoded {1600, 2100, 8000} for the cost guide's unsourced market
    anchors. None of those exist any more: Signet's numbers left the repo with
    the published card, and the market anchors are sourced entries now.
    """
    data = json.loads((ROOT / "_src" / "data" / "market-rates.json").read_text())
    dollars, percents = set(), set()
    for m in data["rates"]:
        fig = m["figure"]
        vals = fig if isinstance(fig, list) else [fig]
        (percents if m["kind"] == "percent" else dollars).update(vals)
    return dollars, percents


def built_pages() -> list:
    """Every built page on the site, plus llms.txt. Output only: _src, the
    scripts dir and the deploy workflow are not published."""
    skip = {"_src", "_site", "scripts", ".git", ".github", "node_modules",
            "__pycache__", "vendor"}
    out = []
    for p in sorted(ROOT.rglob("*.html")):
        if any(part in skip for part in p.relative_to(ROOT).parts):
            continue
        out.append(p)
    llms = ROOT / "llms.txt"
    if llms.exists():
        out.append(llms)
    return out


def visible_text(path: pathlib.Path) -> str:
    text = path.read_text(encoding="utf-8")
    if path.suffix == ".html":
        # Scripts stripped except JSON-LD: structured data is published text
        # and an Offer hiding in it is exactly what this gate is for.
        text = re.sub(
            r'<script(?![^>]*application/ld\+json).*?</script>', " ",
            text, flags=re.DOTALL,
        )
        text = re.sub(r"<[^>]+>", " ", text)
    return text


def audit_money() -> list:
    """Every $-figure and percentage on every built page, against the legal
    set. A figure that is not in market-rates.json is a Signet price, a stale
    typed number, or a claim nobody can source. All three fail."""
    dollars, percents = legal_figures()
    hits = []
    for path in built_pages():
        rel = str(path.relative_to(ROOT))
        text = visible_text(path)
        for m in re.finditer(r"\$([\d,]+)", text):
            n = int(m.group(1).replace(",", ""))
            if n not in dollars:
                hits.append((rel, f"dollar figure not in market-rates.json: ${m.group(1)}"))
        for m in re.finditer(r"(\d+)\s*(?:%|percent\b)", text):
            n = int(m.group(1))
            if n not in percents:
                hits.append((rel, f"percentage not in market-rates.json: {m.group(0).strip()}"))
        low = text.lower()
        for phrase, allowed_on in PHRASE_BANS:
            if phrase in low and not (allowed_on and rel in allowed_on):
                hits.append((rel, f"banned phrase: {phrase!r}"))
    return hits


def main() -> int:
    targets = sys.argv[1:] or BUILDOUT_DIRS
    hits = []
    for slug in targets:
        d = PAGES / slug
        if not d.exists():
            continue
        for f in sorted(d.rglob("*.html")) + sorted(d.glob("schema.json")) \
                + sorted(d.glob("config.json")):
            hits += check_file(f)
    for path, line, label, fix, snippet in hits:
        rel = path.relative_to(ROOT)
        print(f"{rel}:{line}  [{label}] {fix}\n    {snippet}")
    money_hits = audit_money()
    for out, why in money_hits:
        print(f"{out}  [{why}]")
    total = len(hits) + len(money_hits)
    print(f"\n{total} hit(s)." if total else "Clean.")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
