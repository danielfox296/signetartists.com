#!/usr/bin/env python3
"""Mechanical copy gate (handoff §7, plus the 2026-09-04 no-published-price law).

Two passes.

1. Authored sources under the buildout page dirs get the copy bans that are
   actually Daniel's: em dashes, the word AI, and chair / room / rooms in
   music copy (ballroom and green room exempt), plus a short list of hollow
   B2B filler. Emotive words are NOT banned. This site sells a night people
   remember, and "unforgettable" and "magical" are legitimate tools for that.

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

3. The whole built site gets the em-dash ban a second time, on the output
   rather than the source (2026-09-22). Pass 1 has only ever read _src, so
   the em dashes build.py itself wrote were invisible to it: the generated
   page title separator, the RSS channel title, and the redirect stubs all
   shipped one for months while the gate reported clean. Any em dash that
   reaches a published byte fails here, wherever it was authored.

4. Compression notes (2026-09-18, AI-TELLS-2026.md Layer 7): the two
   greppable sub-patterns of the compression tell, printed for the read and
   never counted as hits. The rest of that layer is a read-aloud, not code.

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
    "private-parties-boulder", "private-parties-colorado-springs",
    "weddings", "weddings-ceremony", "weddings-colorado-springs",
    "weddings-cocktail-hour",
    "weddings-cocktail-hour-denver", "guides-live-music-cost",
    "corporate-holiday-party-denver", "corporate-holiday-party-colorado-springs",
    "corporate-retreats-vail", "corporate-retreats-aspen",
    "corporate-retreats-beaver-creek", "corporate-retreats-breckenridge",
    "ensembles-solo-guitarist", "ensembles-acoustic-duo",
    "ensembles-jazz-duo-trio", "ensembles-flamenco-trio", "ensembles-dj",
    "ensembles-spanish-guitarist",
    "artists-tejas-singh", "artists-tony-medina", "pricing",
    "weddings-jazz-band", "weddings-vail", "corporate-jazz-band",
    "private-parties-proposals", "private-parties-holiday-party",
    "private-parties-halloween-party", "private-parties-backyard-party", "private-parties-showers", "private-parties-graduation-party", "private-parties-anniversary-party", "private-parties-retirement-party", "private-parties-engagement-party",
    "daytime", "daytime-senior-living", "daytime-funerals-and-memorials",
    "daytime-sound-bath", "daytime-brunch", "daytime-community-programs",
    "for-artists", "preferred-vendors", "preferred-vendors-join",
    "weddings-boulder", "weddings-fort-collins", "weddings-telluride",
    "private-parties-birthday-party",
]
# Every artist and ensemble page dir is gated whether or not it is listed
# above (2026-09-16): a new act's page used to be ungated until someone
# remembered this list, and three format pages shipped that way.
BUILDOUT_DIRS += sorted(
    d.name for pat in ("artists-*", "ensembles-*") for d in PAGES.glob(pat)
    if d.is_dir() and d.name not in BUILDOUT_DIRS
)

COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)

# (label, pattern, what to do). Applied to section text with HTML comments
# stripped (comments are editorial and never ship) and to schema.json.
CHECKS = [
    ("em dash", re.compile("—"), "rewrite with commas, colons or periods"),
    ("the word AI", re.compile(r"\bAI\b"), "never publishes"),
    ("chair", re.compile(r"\bchairs?\b", re.IGNORECASE), "the seat/role sense is banned"),
    ("room/rooms", re.compile(r"(?<!ball)(?<!green )\brooms?\b", re.IGNORECASE),
     "say venue, floor, crowd, night (ballroom/green room exempt)"),
    # RECALIBRATED 2026-09-05, Daniel: "unforgettable and magical are fine and
    # they should NOT be banned, they are emotive language that moves humans to
    # picture things and feel." The old kill list, the exclamation-mark ban and
    # the "quietly" ban were agent-manufactured, not his, and they were the
    # reason this site reads like a spec sheet. They are gone. His own home
    # page copy violated two of them.
    #
    # What is left is hollow B2B filler that makes a sentence vaguer, never
    # warmer. Nobody pictures anything when they read "seamless". If any of
    # these earn their place in a real sentence, delete the line.
    ("business filler", re.compile(
        r"\b(leverage|seamless|solutions|bespoke|curated|synergy|holistic"
        r"|best-in-class|turnkey)\b", re.IGNORECASE),
     "vague where it should be vivid; say the thing itself"),
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
    # llms.txt and rss.xml are published text too, and the RSS channel title
    # is one of the three places build.py used to write an em dash.
    for extra in ("llms.txt", "rss.xml"):
        f = ROOT / extra
        if f.exists():
            out.append(f)
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
        # The percentage audit came out 2026-09-14 on Daniel's call. It was an
        # agent extension of the 2026-09-04 no-published-price rule, and its
        # one live hit was a client review saying "100%". Signet's own
        # percent-shaped pricing claims (+25%, +50%, 10% off) stay caught by
        # PHRASE_BANS below; the dollar audit is unchanged.
        low = text.lower()
        for phrase, allowed_on in PHRASE_BANS:
            if phrase in low and not (allowed_on and rel in allowed_on):
                hits.append((rel, f"banned phrase: {phrase!r}"))
    return hits


# Em dashes in the BUILT site (2026-09-22). Rule 8 bans them estate-wide and
# pass 1 enforces that on _src, but pass 1 has never once read the output, so
# every em dash build.py wrote itself was invisible to it: the <title>
# separator on every generated-title page, the RSS channel title carried into
# a <link rel="alternate"> on all 97 pages, and the redirect stubs. All three
# are pipes now. This pass is the reason they cannot come back, and it reads
# the raw file rather than visible_text(): a separator lives in the <title>
# element and in meta/link attributes, none of which survive tag-stripping.
#
# The one exemption is the home page's own title, authored and ratified, whose
# em dash was recorded at the 2026-08-02 audit as the sitewide separator. That
# premise is gone as of this pass. The line stays until Daniel rules on it;
# when he does, delete these three entries and this paragraph with them.
EM_DASH_EXEMPT = (
    "Signet Artists — Live music for private events in Denver, Colorado",
)
SCRIPT_NOT_LD = re.compile(
    r'<script(?![^>]*application/ld\+json).*?</script>', re.DOTALL)


def audit_em_dashes() -> list:
    """Every published byte, against rule 8. Comments and non-JSON-LD scripts
    are stripped (neither is copy); everything else counts, attributes
    included."""
    hits = []
    for path in built_pages():
        rel = str(path.relative_to(ROOT))
        text = path.read_text(encoding="utf-8")
        if path.suffix in (".html", ".xml"):
            text = COMMENT.sub(" ", text)
        if path.suffix == ".html":
            text = SCRIPT_NOT_LD.sub(" ", text)
        for i, line in enumerate(text.splitlines(), 1):
            if "—" not in line and "&mdash;" not in line:
                continue
            if any(x in line for x in EM_DASH_EXEMPT):
                continue
            hits.append((f"{rel}:{i}",
                         f"em dash in built output: {line.strip()[:90]}"))
    return hits


# Compression notes (AI-TELLS-2026.md Layer 7, 2026-09-18). The two
# sub-patterns of the compression layer that a regex can see: a paragraph
# closing on a fragment of three words or fewer ("Their people come."), and
# the uncontracted first person a warm page would contract ("it is", "they
# are", "we will"). Both are NOTES, never hits: a fragment as rhythm is legal
# and ratified copy carries some of each, so the gate prints them for the
# read and exits clean. The other eight patterns of the layer are a read.
CLOSER_WORDS = 3
UNCONTRACTED = re.compile(
    r"\b(?:it|that|there|what) is\b|\b(?:they|we|you) are\b|\bwe will\b"
    r"|\b(?:do|does|did|is|are|was|were|has|have|had|can|could|would|should)"
    r" not\b", re.IGNORECASE)
PARA_TAGS = re.compile(r"<(?:p|dd|li|h[1-6])\b[^>]*>(.*?)</(?:p|dd|li|h[1-6])>",
                       re.DOTALL | re.IGNORECASE)


def compression_notes(path: pathlib.Path) -> list:
    if path.suffix != ".html":
        return []
    text = COMMENT.sub("", path.read_text(encoding="utf-8"))
    notes = []
    uncontracted = 0
    for m in PARA_TAGS.finditer(text):
        para = re.sub(r"<[^>]+>", " ", m.group(1))
        para = re.sub(r"\s+", " ", para).strip()
        if not para:
            continue
        uncontracted += len(UNCONTRACTED.findall(para))
        sentences = [x for x in re.split(r"(?<=[.!?])\s+", para) if x]
        if len(sentences) > 1 and len(sentences[-1].split()) <= CLOSER_WORDS:
            notes.append((path, f"paragraph closes on a fragment: {sentences[-1]!r}"))
    if uncontracted:
        notes.append((path, f"{uncontracted} uncontracted form(s) (it is / they are / do not)"))
    return notes


def main() -> int:
    targets = sys.argv[1:] or BUILDOUT_DIRS
    hits = []
    notes = []
    for slug in targets:
        d = PAGES / slug
        if not d.exists():
            continue
        for f in sorted(d.rglob("*.html")) + sorted(d.glob("schema.json")) \
                + sorted(d.glob("config.json")):
            hits += check_file(f)
            notes += compression_notes(f)
    for path, line, label, fix, snippet in hits:
        rel = path.relative_to(ROOT)
        print(f"{rel}:{line}  [{label}] {fix}\n    {snippet}")
    site_hits = audit_money() + audit_em_dashes()
    for out, why in site_hits:
        print(f"{out}  [{why}]")
    if notes:
        print("Compression notes (Layer 7; a read, not a failure):")
        for path, why in notes:
            print(f"  {path.relative_to(ROOT)}  {why}")
    total = len(hits) + len(site_hits)
    print(f"\n{total} hit(s)." if total else "Clean.")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
