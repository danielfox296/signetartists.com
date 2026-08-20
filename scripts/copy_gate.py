#!/usr/bin/env python3
"""Mechanical copy gate for the SEO buildout pages (handoff §7).

Greps the buildout's authored sources for the bans a machine can catch:
em dashes, the word AI, chair, room/rooms (ballroom and green room exempt),
exclamation marks, and the consultant kill list. The judgment calls (negation
headlines, "book" as repertoire, invented claims) stay with Copy QA; this
catches the greppable ones before a human wastes a pass on them.

Run: python3 scripts/copy_gate.py [page-dir ...]   (default: the buildout dirs)
Exit 1 on any hit.
"""
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
    "artists-tejas-singh",
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


def legal_dollar_figures() -> set:
    """Every dollar figure derivable from the data files, plus the whitelist.

    The whitelist is the set with no data source: the cost guide's market
    anchors (commodity roughly $1,600–2,100, boutiques from $8,000, from the
    buildout handoff). Everything else a page prints must trace to data.
    """
    import json as _json
    site = _json.loads((ROOT / "_src" / "data" / "site.json").read_text())
    roster = _json.loads((ROOT / "_src" / "data" / "acts.json").read_text())
    legal = {1600, 2100, 8000}
    for r in roster["rateCard"]:
        legal.update(r["denver"] + r["resort"])
        if r.get("hourly"):
            legal.add(r["hourly"])
    for r in site["rates"]:
        legal.update([r["callOut"], r["hourly"]])
        legal.update(r["callOut"] + r["hourly"] * h for h in range(1, 7))
    for e in site["extras"]:
        legal.update(int(n.replace(",", "")) for n in re.findall(r"\$?([\d,]+)", e["rate"]))
    for v in site["insurance"].values():
        legal.add(int(re.sub(r"[^\d]", "", v)))
    return legal


def audit_built_figures() -> list:
    """Check every $-figure on the built buildout pages (home included)
    against the legal set, so a typed figure that drifts from the data files
    fails the build instead of shipping wrong."""
    import json as _json
    legal = legal_dollar_figures()
    hits = []
    outputs = ["index.html"]
    for slug in BUILDOUT_DIRS:
        cfgp = PAGES / slug / "config.json"
        if cfgp.exists():
            outputs.append(_json.loads(cfgp.read_text())["output"])
    for out in outputs:
        path = ROOT / out
        if not path.exists():
            continue
        text = re.sub(r"<script.*?</script>", " ", path.read_text(), flags=re.DOTALL)
        text = re.sub(r"<[^>]+>", " ", text)
        for m in re.finditer(r"\$([\d,]+)", text):
            n = int(m.group(1).replace(",", ""))
            if n not in legal:
                hits.append((out, f"${m.group(1)}"))
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
    figure_hits = audit_built_figures()
    for out, fig in figure_hits:
        print(f"{out}  [dollar figure not derivable from data] {fig}")
    total = len(hits) + len(figure_hits)
    print(f"\n{total} hit(s)." if total else "Clean.")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
