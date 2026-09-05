#!/usr/bin/env python3
"""signetartists.com static site generator.

Same idiom as daniel-fox.com / danielchristopherfox.com / foxlessons.com:
edit `_src/`, run `python3 build.py`, built HTML lands at the repo root.
NEVER edit root *.html by hand — the build overwrites it.

Pure Python stdlib for the pages. The blog kit (ported from the
foxlessons.com generation 2026-08-03) additionally needs jinja2, markdown
and pyyaml — imported lazily, so the build stays stdlib-only until a
_src/pages/blog-<slug>/content.yaml exists. `python3 build.py --lint`
validates every post (drafts included) without building; the deploy
workflow runs it before the build.

Ported from a Next.js 16 app 2026-08-01. The server-action contact form became a
formsubmit.co POST, since GitHub Pages serves static files only.
"""
import datetime
import html
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "_src"
PAGES = SRC / "pages"
PARTIALS = SRC / "partials"
LAYOUTS = SRC / "layouts"
TEMPLATES = SRC / "templates"
DATA = SRC / "data"

DATA_FILE = DATA / "site.json"

# Nav keys for active-state highlighting. A page's config.json sets "nav" to one
# of these to mark the matching header link as the current page.
NAV_KEYS = ["music", "repertoire", "pricing", "planners", "corporate", "private", "contact"]

# GA4 measurement id. Empty string => no analytics tag is emitted at all.
# Never ship a half-wired tag.
# Property "Signet Artists", stream signetartists.com (15364913067), created
# 2026-08-01 under the same Analytics account (121066079) as the other properties.
GA_MEASUREMENT_ID = "G-LL5DKVEX29"

site = json.loads(DATA_FILE.read_text(encoding="utf-8"))
BRAND = site["brand"]
SITE_URL = BRAND["url"].rstrip("/")
OG_IMAGE = f"{SITE_URL}/img/og-default.png"

# The act roster (restructure 2026-08-15). Acts are data, never hardcoded
# pages: act pages, roster cards, the filter UI and llms.txt all render from
# _src/data/acts.json. From 2026-09-04 the roster carries no prices at all:
# `rateCard` is configuration structure (id, label, pieces) and nothing else.
ACTS_FILE = DATA / "acts.json"
roster = json.loads(ACTS_FILE.read_text(encoding="utf-8"))
ACTS = roster["acts"]
RATE_CARD = roster["rateCard"]
RATE_BY_ID = {r["id"]: r for r in RATE_CARD}
BUCKETS = roster["buckets"]
BUCKET_LABEL = {b["id"]: b["label"] for b in BUCKETS}
FLAGSHIPS = [a for a in ACTS if a["status"] == "flagship"]
# Q4 2026 refocus: the product is solo through quartet. A `byRequest` config is
# a size we field but do not merchandise as a standard booking.
SOLD_CONFIGS = [r for r in RATE_CARD if not r.get("byRequest")]
BYREQUEST_CONFIGS = [r for r in RATE_CARD if r.get("byRequest")]
LISTINGS = [a for a in ACTS if a["status"] == "listing"]

# Market figures, 2026-09-04. THE ONLY dollar figures or percentages any
# surface of this site may render. Signet publishes no price of its own: not a
# card, a floor, a "from", an hourly, an uplift, a travel figure or a discount
# rule. Every entry here belongs to the market, carries the URL it was read
# from and the date it was read, and reaches a page only through
# {{market:<id>}}. A page that resolves one must also carry {{market_sources}};
# the build fails otherwise, so a figure can never publish unattributed.
MARKET_FILE = DATA / "market-rates.json"
MARKET = json.loads(MARKET_FILE.read_text(encoding="utf-8"))["rates"]
MARKET_BY_ID = {m["id"]: m for m in MARKET}
# The rows {{market_table}} prints. Denver first, because a Denver buyer
# reading this page needs their own market before the national one, then the
# national context, then the top of the range.
#
# Two ids are deliberately NOT here (2026-09-05, marketing pass). The
# marketplace average is the cheapest tier in this market, and printed as a
# bare figure in the accent column on our own pricing page it anchors a reader
# down before anything has framed it. It belongs where it is framed as a tier,
# which is the cost guide's market section, and the pricing page points there
# in a sentence instead. The holiday surcharge is a modifier rather than a
# level, so it reads wrong in a table of what things cost; it lives in the
# prose about what moves a number.
MARKET_TABLE_IDS = [
    "denver_band_range", "denver_midtier_band", "us_corporate_band",
    "co_band_budget", "us_band_range", "us_showband",
]

# Ids resolved on the page currently being built, in first-use order. Reset by
# begin_page(); read by market_sources() and finalize_market().
_market_used: list = []


def begin_page() -> None:
    _market_used.clear()


def finalize_market(content: str, where: str) -> str:
    """Resolve {{market_sources}} and refuse to ship an unattributed figure.

    Runs last, after every other token, because the sources note has to know
    which figures the page ended up printing.
    """
    if _market_used and "{{market_sources}}" not in content:
        raise SystemExit(
            f"{where}: prints market figures ({', '.join(_market_used)}) with no "
            "{{market_sources}} on the page. Every figure carries its source."
        )
    note = market_sources()
    content = content.replace("<p>{{market_sources}}</p>", note)
    return content.replace("{{market_sources}}", note)

ACTS_BASE = "music"  # roster lives at /music/, act pages at /music/<id>/

PLACEHOLDER = re.compile(r"\[.+\]")
COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)


# ---------------------------------------------------------------- helpers


def read(path: pathlib.Path) -> str:
    return path.read_text(encoding="utf-8")


def partial(name: str) -> str:
    return read(PARTIALS / f"{name}.html")


def money(n: int) -> str:
    return f"${n:,}"


def esc(s: str) -> str:
    return html.escape(s, quote=True)


def val(s: str) -> str:
    """Render a brand value, flagging it when it is still a placeholder.

    Carried over from the Next build: unresolved values get a dotted underline
    so an open decision is visible while browsing rather than shipping silently.
    """
    if PLACEHOLDER.search(s):
        return f'<span data-tbd="true">{esc(s)}</span>'
    return esc(s)


def canonical_for(output: str) -> str:
    if output == "index.html":
        return f"{SITE_URL}/"
    # Directory-style URLs: pricing/index.html -> /pricing/
    if output.endswith("/index.html"):
        return f"{SITE_URL}/{output[: -len('index.html')]}"
    return f"{SITE_URL}/{output}"


# ------------------------------------------------------- generated blocks


def market_figure(mid: str) -> str:
    """One market figure, plain: "$2,338 to $2,858", "20 to 30 percent".

    Registers the id against the page being built, so market_sources() can
    print exactly the sources that page used and finalize_market() can refuse
    to ship a figure with no attribution next to it.
    """
    m = MARKET_BY_ID.get(mid)
    if m is None:
        raise SystemExit(
            f"{{{{market:{mid}}}}}: no such id in _src/data/market-rates.json"
        )
    if mid not in _market_used:
        _market_used.append(mid)
    f = m["figure"]
    if m["kind"] == "percent":
        return f"{f[0]} to {f[1]} percent" if isinstance(f, list) else f"{f} percent"
    return f"{money(f[0])} to {money(f[1])}" if isinstance(f, list) else money(f)


def market_sources() -> str:
    """The Sources note for the figures this page printed.

    One line, at the foot of the section that called it, naming each source
    once with a link and the date it was read. It is what makes a figure on
    this site the market's rather than ours, so the build treats it as
    mandatory rather than decorative.
    """
    seen = []
    for mid in _market_used:
        m = MARKET_BY_ID[mid]
        key = (m["source"], m["url"])
        if key not in seen:
            seen.append(key)
    if not seen:
        return ""
    links = ", ".join(
        f'<a href="{esc(url)}" rel="nofollow noopener" target="_blank">{esc(src)}</a>'
        for src, url in seen
    )
    read_on = max(MARKET_BY_ID[mid]["retrieved"] for mid in _market_used)
    when = datetime.datetime.strptime(read_on, "%Y-%m-%d").strftime("%-d %B %Y")
    label = "Where this figure comes from" if len(seen) == 1 \
        else "Where these figures come from"
    return (
        f'<p class="note">{label}, read {when}: {links}. '
        "Signet prices a date on request."
        "</p>"
    )


def market_table() -> str:
    """The market ranges as one table: what, the figure, whose market it is.

    Carries .rate-table so analytics.js's pricing_engaged observer keeps
    firing when a reader reaches the money block on a page, which is still
    exactly what that event means.
    """
    rows = "".join(
        '<tr>'
        f'<th scope="row" class="rate-size">{esc(MARKET_BY_ID[mid]["what"])}</th>'
        f'<td class="num-accent">{market_figure(mid)}</td>'
        f'<td>{esc(MARKET_BY_ID[mid]["market"])}</td>'
        "</tr>"
        for mid in MARKET_TABLE_IDS
    )
    return (
        '<div class="table-scroll"><table class="rate-table tnum">'
        "<thead><tr><th>What the market pays</th><th>Figure</th>"
        "<th>Market</th></tr></thead>"
        f"<tbody>{rows}</tbody></table></div>"
    )


def included_list() -> str:
    items = "".join(
        f'<li><span class="dash" aria-hidden="true"></span>{esc(i)}</li>'
        for i in site["included"]
    )
    return f'<ul class="spec-list">{items}</ul>'


def included_list_columns() -> str:
    items = "".join(
        f'<li><span class="dash" aria-hidden="true"></span>{esc(i)}</li>'
        for i in site["included"]
    )
    return f'<ul class="spec-list spec-list--cols">{items}</ul>'


def extras_list() -> str:
    """What arrives as its own line on a quote. Items only from 2026-09-04:
    the site names what is itemised separately and never what it costs."""
    items = "".join(
        f'<li><span class="dash" aria-hidden="true"></span>{esc(e["item"])}</li>'
        for e in site["extras"]
    )
    return f'<ul class="spec-list">{items}</ul>'


def faq_list() -> str:
    """The pricing page's questions. Answers may carry {{market:<id>}}; they
    are resolved here so the visible list and the FAQPage markup print the
    same figure from the same source."""
    rows = "".join(
        f'<div class="faq-row"><dt>{esc(f["q"])}</dt>'
        f'<dd>{resolve_market_tokens(esc(f["a"]))}</dd></div>'
        for f in site["faqs"]
    )
    return f'<dl class="faq-list">{rows}</dl>'


def _config_rows(columns) -> str:
    """Shared body for the technical tables.

    `columns` is a list of (header, key) pairs. Every table on the technical
    page is a projection of site["configurations"], which covers exactly the
    sold sizes, solo through quartet plus the DJ, so a size cannot appear on
    the rate card and be missing from the stage plot. (Solo has no hourly row
    in site["rates"]; the card publishes it as a range only.)

    Column order is a mobile decision, not a reading-order one: .rate-table
    carries min-width 30rem and nowrap cells, so at 375px only the first two
    columns are on screen. Whatever the page is actually answering goes second.

    The whole block carries data-provisional while site.json says these figures
    are unratified, which draws a brass edge down the table (styles.css). The
    numbers here are our own inference; the mountain page's are cited. Until
    that difference is visible, both pages claim the same authority.
    """
    head = "".join(f"<th>{esc(h)}</th>" for h, _ in columns)
    rows = []
    for c in site["configurations"]:
        cells = []
        for i, (_, key) in enumerate(columns):
            cls = ' class="rate-size"' if i == 0 else ""
            cells.append(f"<td{cls}>{esc(str(c[key]))}</td>")
        rows.append(f'<tr>{"".join(cells)}</tr>')
    flag = ' data-provisional="true"' if site.get("_configurations_provisional") else ""
    return (
        f'<div class="table-scroll"{flag}><table class="rate-table tnum">'
        f"<thead><tr>{head}</tr></thead>"
        f'<tbody>{"".join(rows)}</tbody></table></div>'
    )


def stage_table() -> str:
    # Payload second. "Who is on it" is the widest column and the least urgent,
    # and leading with it pushed both footprint columns off a 375px viewport —
    # i.e. the entire answer the page exists to give.
    return _config_rows([
        ("Size", "size"),
        ("Footprint we ask for", "stage"),
        ("Smallest we will take", "stageMin"),
        ("Who is on it", "build"),
    ])


def power_table() -> str:
    return _config_rows([
        ("Size", "size"),
        ("Channels at the desk", "inputs"),
        ("Dedicated 20A circuits", "circuits"),
    ])


def loadin_table() -> str:
    return _config_rows([
        ("Size", "size"),
        ("Load-in and setup", "loadIn"),
        ("Strike", "strike"),
        ("Vehicles", "vans"),
    ])


def stage_plot() -> str:
    """The technical page's argument, drawn to scale.

    That page opens by saying published stage-rental guidance for a seven to
    ten-piece runs to 24 by 24 feet, and that this is more than four times
    what the quartet, the largest band sold, asks for. It is the most useful
    thing on the page for a planner pricing a riser, and until now it was
    three sentences of prose above a table of numbers. Two rectangles at the
    same scale make it in one look.

    Drawn from site["configurations"] rather than hardcoded, so it cannot drift
    from the table twenty lines below it. Inline SVG: no request, no library,
    scales to any width, and it inherits the palette through currentColor and
    the CSS custom properties.

    Not a photograph, deliberately. The shoot has not happened, and a diagram
    is the right object here anyway — a planner forwarding this to a venue
    needs a measurement, not a mood.
    """
    quartet = next(c for c in site["configurations"] if c["size"] == "Quartet")
    # "14 by 10 ft" -> (14, 10)
    w, d = (int(n) for n in re.findall(r"\d+", quartet["stage"])[:2])
    GUIDE = 24  # the published rental figure the page argues against
    U = 20      # units per foot
    gw = GUIDE * U
    aw, ad = w * U, d * U
    ax, ay = (gw - aw) / 2, gw - ad
    saved = GUIDE * GUIDE - w * d

    return f"""<figure class="stage-plot">
<svg viewBox="-8 -8 {gw + 16} {gw + 16}" role="img"
     aria-label="Two stage footprints at the same scale. Published rental
     guidance is {GUIDE} by {GUIDE} feet. A quartet takes {w} by {d} feet,
     about {round(100 * (1 - (w * d) / (GUIDE * GUIDE)))} percent less floor.">
  <rect x="0" y="0" width="{gw}" height="{gw}" class="plot-guide"/>
  <rect x="{ax}" y="{ay}" width="{aw}" height="{ad}" class="plot-actual"/>
  <text x="{gw / 2}" y="{ay / 2}" class="plot-label" text-anchor="middle">
    {GUIDE} &#215; {GUIDE} ft
  </text>
  <text x="{gw / 2}" y="{ay / 2 + 26}" class="plot-sub" text-anchor="middle">
    what the rental guide says
  </text>
  <text x="{gw / 2}" y="{ay + ad / 2 - 4}" class="plot-label" text-anchor="middle">
    {w} &#215; {d} ft
  </text>
  <text x="{gw / 2}" y="{ay + ad / 2 + 22}" class="plot-sub" text-anchor="middle">
    what a quartet takes
  </text>
</svg>
<figcaption class="note">Both drawn to the same scale. The difference is
{saved} square feet of floor, which is a few hundred dollars of riser and about
{round(saved / 10)} guests standing.</figcaption>
</figure>"""


def cover_strip() -> str:
    """A run of album sleeves linking through to /repertoire/.

    The site owns 36 real, self-hosted sleeves and was showing them on exactly
    one page while nine others carried no image at all. Alt text is lifted from
    the repertoire page's own tiles so the two surfaces describe the same
    picture the same way; the sleeves are decorative here, but a screen reader
    landing on eight unlabelled images would have nothing to skip past.

    Ordered by the arc of an evening rather than alphabetically: the first four
    are the ones that survive the phone breakpoint, so they carry the dinner
    end of the night, and the run climbs from there.
    """
    strip = [
        ("into-the-mystic", "Moondance, Van Morrison"),
        ("landslide", "Fleetwood Mac"),
        ("tennessee-whiskey", "Chris Stapleton"),
        ("dock-of-the-bay", "The Dock of the Bay, Otis Redding"),
        ("valerie", "Version, Mark Ronson"),
        ("sweet-caroline", "Neil Diamond"),
        ("dont-stop-believin", "Escape, Journey"),
        ("mr-brightside", "Hot Fuss, The Killers"),
    ]
    tiles = "".join(
        f'<img src="{{{{nav_prefix}}}}img/covers/{slug}.jpg" '
        f'alt="{esc(credit)} album cover" loading="lazy" decoding="async" '
        f'width="300" height="300">'
        for slug, credit in strip
    )
    return (
        '<section class="section--night cover-strip">'
        f'<div class="cover-strip-inner">{tiles}</div>'
        '<div class="wrap"><p class="cover-strip-note">'
        'We love music - both originals from our artists and a few hundred familiar '
        'favorites. For our singer-songwriter acts, you can check out our '
        '<a href="{{nav_prefix}}repertoire/">Songs page</a> for an example of the available repertoire.'
        "</p></div></section>"
    )


def planner_faq_list() -> str:
    """The deep FAQ, grouped. An entry flagged "open" is a policy nobody has
    decided yet: it renders with the same dotted underline as an unresolved
    brand value, so a guess cannot ship looking like a decision."""
    out = []
    for group in site["plannerFaqs"]:
        rows = []
        for f in group["items"]:
            answer = esc(f["a"])
            if f.get("open"):
                answer = f'<span data-tbd="true">{answer}</span>'
            rows.append(f'<div class="faq-row"><dt>{esc(f["q"])}</dt><dd>{answer}</dd></div>')
        out.append(
            f'<h2 class="h3">{esc(group["group"])}</h2>'
            f'<dl class="faq-list">{"".join(rows)}</dl>'
        )
    return "".join(out)


def event_types() -> str:
    """The booked-for tags. An entry with an href is a real doorway into its
    occasion page (2026-08-20 buildout: the tags are the home page's placement
    for the occasion tree); a plain string stays a plain tag."""
    items = []
    for t in site["eventTypes"]:
        if isinstance(t, dict):
            items.append(
                f'<li><a href="{{{{nav_prefix}}}}{esc(t["href"])}">'
                f'{esc(t["label"])}</a></li>'
            )
        else:
            items.append(f"<li>{esc(t)}</li>")
    return f'<ul class="tag-list">{"".join(items)}</ul>'


# ----------------------------------------------------------------- the roster
# En dashes in numeric ranges only. They are a data separator, the same
# accepted exemption as the title separator; the em-dash ban is on prose.


def rate_of(config_id: str) -> dict:
    """A configuration by id: its label, its piece count, its note. Carries no
    price since 2026-09-04; the name is kept because every caller reads it for
    the label and renaming it would touch thirty call sites for nothing."""
    return RATE_BY_ID[config_id]


def act_url(act: dict, nav_prefix: str = "") -> str:
    # An act with a `page` field is owned by an authored page dir (the 2026-08-20
    # buildout moved the flagships to /artists/ and /ensembles/); everything that
    # links to the act follows it there, and the old generated URL gets a redirect
    # stub via REDIRECTS below.
    if act.get("page"):
        return f"{nav_prefix}{act['page']}"
    return f"{nav_prefix}{ACTS_BASE}/{act['id']}/"


def act_configs(act: dict) -> list:
    return [rate_of(c) for c in act["config_tags"]]


def act_byline(act: dict) -> str:
    """The line under the name, and the whole point of the presentation axis.

    A face-led act publishes the person, because the person is what was
    bought and they do not get swapped. A spec'd format publishes the
    instrumentation instead, because that is what we can guarantee on any
    date. Naming a format would promise a personality the booking cannot
    honour; specifying it promises a sound, a size and a price, which it can.
    """
    if act["presentation"] == "face":
        return f'Fronted by {act["face"]}'
    return act["spec"]


def act_byline_inline(act: dict) -> str:
    """The byline where it sits mid-sentence, as in llms.txt's
    "Dirty Flamenco (Flamenco, fronted by Gary Meyers)". Built rather than
    lowercased from act_byline: .lower() flattens the proper noun and turns
    "a PA sized to the venue" into "a pa sized to the venue"."""
    if act["presentation"] == "face":
        return f'fronted by {act["face"]}'
    return act["spec"]


NUMBER_WORDS = {
    1: "One", 2: "Two", 3: "Three", 4: "Four", 5: "Five",
    6: "Six", 7: "Seven", 8: "Eight", 9: "Nine", 10: "Ten",
}


def act_count_word() -> str:
    """Headlines count the roster out loud, so the count is a token rather
    than a typed word. Adding or merging an act cannot leave a page claiming
    a number that stopped being true."""
    return NUMBER_WORDS.get(len(ACTS), str(len(ACTS)))


def act_config_range(act: dict) -> str:
    """"Trio to six piece", not "Trio to Five to six piece". The tail of a range
    reads as prose, so the rate card carries a lowercase `rangeLabel` for it
    rather than the title-case table label."""
    if act.get("configRangeLabel"):
        return act["configRangeLabel"]
    configs = act_configs(act)
    if len(configs) == 1:
        return configs[0]["label"]
    return f'{configs[0]["label"]} to {configs[-1]["rangeLabel"]}'


def act_card(act: dict, nav_prefix: str = "") -> str:
    """One roster card. Carries its own filter state in data attributes so
    the filter UI is a class toggle and never a re-render."""
    flagship = act["status"] == "flagship"
    buckets = " ".join(act["bucket_tags"])
    configs = " ".join(act["config_tags"])
    tags = "".join(
        f'<li class="pill">{esc(BUCKET_LABEL[b])}</li>' for b in act["bucket_tags"]
    )
    cta = (
        f'<a class="act-card-link" href="{act_url(act, nav_prefix)}">'
        f'See {esc(act["name"])}</a>'
        if flagship or act.get("page")
        else f'<a class="act-card-link" href="{nav_prefix}contact/?act={esc(act["id"])}">Inquire</a>'
    )
    return (
        f'<article class="card act-card" data-buckets="{esc(buckets)}" '
        f'data-configs="{esc(configs)}" '
        f'data-status="{esc(act["status"])}" data-name="{esc(act["name"])}">'
        f"{act_card_media(act, nav_prefix)}"
        '<div class="act-card-body">'
        f'<p class="act-kind">{esc(act["style"])}</p>'
        f'<h3 class="act-name">{esc(act["name"])}</h3>'
        f'<p class="act-face">{esc(act_byline(act))}</p>'
        f'<ul class="pill-row">{tags}</ul>'
        f'<p class="act-blurb">{esc(act["blurb"])}</p>'
        '<dl class="act-facts">'
        f"<dt>Configurations</dt><dd>{esc(act_config_range(act))}</dd>"
        "</dl>"
        f"{cta}"
        "</article>"
    )


def act_card_media(act: dict, nav_prefix: str = "") -> str:
    """The top of a roster card. `video` is null on every act until footage
    lands; the still holds the slot until then, and setting that one field in
    acts.json turns the card into footage everywhere the card renders. An
    http(s) value is an embed URL and renders as an iframe; anything else is
    a site-relative file under media/ and renders as a native player, with
    `video_poster` as its first frame. No marker prints here, unlike the act
    page: this is the surface a planner is being sold on, and a card that
    announces its own gap sells nothing."""
    if act.get("video"):
        if act["video"].startswith(("http://", "https://")):
            return (
                '<div class="act-card-video">'
                f'<iframe src="{esc(act["video"])}" '
                f'title="{esc(act["name"])} performing" loading="lazy" '
                'allow="accelerometer; autoplay; clipboard-write; encrypted-media; '
                'picture-in-picture" allowfullscreen></iframe></div>'
            )
        poster = (
            f' poster="{nav_prefix}{esc(act["video_poster"])}"'
            if act.get("video_poster") else ""
        )
        return (
            '<div class="act-card-video">'
            f'<video src="{nav_prefix}{esc(act["video"])}"{poster} '
            f'title="{esc(act["name"])} performing" '
            'controls preload="metadata" playsinline></video></div>'
        )
    return (
        f'<img class="act-card-img" src="{nav_prefix}img/{esc(act["img"])}" '
        f'alt="{esc(act["alt"])}" width="1600" height="900" loading="lazy" '
        'decoding="async">'
    )


def roster_filters() -> str:
    """Filter by bucket, config size and price. Rendered as real controls in
    static HTML: with script off every act is visible and nothing is lost."""
    # Both selects derive from the roster, not from the vocabulary lists: an
    # option nothing is tagged with is a filter that can only ever return the
    # empty state. buckets[] in acts.json stays the label vocabulary, so a
    # bucket returns to the select the moment an act carries its tag again.
    in_use_buckets = {b for a in ACTS for b in a["bucket_tags"]}
    bucket_opts = "".join(
        f'<option value="{esc(b["id"])}">{esc(b["label"])}</option>'
        for b in BUCKETS if b["id"] in in_use_buckets
    )
    in_use = {c for a in ACTS for c in a["config_tags"]}
    config_opts = "".join(
        f'<option value="{esc(r["id"])}">{esc(r["label"])}</option>'
        for r in RATE_CARD if r["id"] in in_use
    )
    # The starting-price filter was removed 2026-09-04 with the published card.
    # Kind of night and size are the two axes a buyer actually shops on here.
    return (
        '<form class="roster-filters" id="roster-filters" hidden>'
        '<div class="filter-field"><label for="filter-bucket">Kind of night</label>'
        '<select id="filter-bucket" name="bucket">'
        f'<option value="">Any</option>{bucket_opts}</select></div>'
        '<div class="filter-field"><label for="filter-config">Size</label>'
        '<select id="filter-config" name="config">'
        f'<option value="">Any</option>{config_opts}</select></div>'
        '<button type="button" class="btn btn--sm btn--outline" id="filter-reset">Reset</button>'
        f'<p class="filter-count" id="filter-count" role="status">{len(ACTS)} acts</p>'
        "</form>"
    )


def roster_grid(nav_prefix: str = "") -> str:
    cards = "".join(act_card(a, nav_prefix) for a in ACTS)
    return (
        f'<div class="card-grid card-grid--3 roster-grid" id="roster-grid">{cards}</div>'
        '<p class="filter-empty" id="filter-empty" hidden>Nothing on the roster matches '
        "that combination. Widen one of the three and it will.</p>"
    )


# ------------------------------------------------------- the holiday season
# Availability is a factual claim with a cost attached to being wrong, so the
# board prints the date it was last trued up and season.json carries the
# maintenance warning. See _src/data/season.json.

SEASON = json.loads(read(DATA / "season.json"))
ACT_BY_ID = {a["id"]: a for a in ACTS}


def season_dates() -> str:
    """The season's dates with their published pricing tags. Calendar and
    pricing facts only: no availability. Statuses were published here until
    2026-08-27, when Daniel killed the 'season board' as fiction — the
    booking calendar is private, and the site never claims to mirror it."""
    cells = []
    for d in SEASON["dates"]:
        dt = datetime.datetime.strptime(d["date"], "%Y-%m-%d")
        label = f'{dt.strftime("%a")} {dt.strftime("%b")} {dt.day}'
        classes = "season-date"
        if d.get("peak"):
            classes += " season-date--peak"
        if d.get("note"):
            tail = f'<span class="season-tag">{esc(d["note"])}</span>'
        elif d.get("peak"):
            tail = '<span class="season-tag">Peak date</span>'
        else:
            tail = '<span class="season-tag">Standard date</span>'
        cells.append(
            f'<li class="{classes}"><span class="season-day">{esc(label)}</span>'
            f"{tail}</li>"
        )
    return (
        f'<ul class="season-board">{"".join(cells)}</ul>'
        f'<p class="note"><strong class="num-accent">{len(SEASON["dates"])}</strong> '
        "party dates: Thursdays, Fridays and Saturdays across November and "
        "December, plus New Year's Eve. A peak date and a Thursday in November "
        "are not the same job, and New Year's Eve is its own case. Send the date "
        "and we price that night."
        "</p>"
    )


def season_leads(nav_prefix: str = "") -> str:
    """The three configurations to lead the holiday page with. Names and prices
    resolve out of acts.json and the rate card, never retyped."""
    cards = []
    for lead in SEASON["leads"]:
        act = ACT_BY_ID[lead["act"]]
        r = rate_of(lead["config"])
        cards.append(
            '<article class="card">'
            f'<p class="act-kind">{esc(r["label"])}</p>'
            f'<h3 class="act-name">{esc(act["name"])}</h3>'
            f'<p class="act-face">{esc(act["style"])}. {esc(act_byline(act))}.</p>'
            f'<p class="act-blurb">{esc(lead["why"])}</p>'
            '<dl class="act-facts"><dt>Configuration</dt>'
            f'<dd>{esc(r["label"])}, {r["pieces"]} '
            f'{"player" if r["pieces"] == 1 else "players"}</dd></dl>'
            f'<a class="act-card-link" href="{nav_prefix}contact/?act={esc(act["id"])}">'
            "Check a date</a>"
            "</article>"
        )
    return f'<div class="card-grid card-grid--3">{"".join(cards)}</div>'


def corporate_shapes(nav_prefix: str = "") -> str:
    """The three shapes a corporate enquiry arrives as, on /corporate/. Same
    contract as season_leads: the occasion is copy, but the act name and the
    configuration resolve out of acts.json, so this block cannot name a size
    the roster has stopped fielding. No prices since 2026-09-04."""
    cards = []
    for shape in site["corporateShapes"]:
        act = ACT_BY_ID[shape["act"]]
        r = rate_of(shape["config"])
        cards.append(
            '<article class="card">'
            f'<p class="act-kind">{esc(shape["occasion"])}</p>'
            f'<h3 class="act-name">{esc(act["name"])}</h3>'
            f'<p class="act-face">{esc(r["label"])}. {esc(act_byline(act))}.</p>'
            f'<p class="act-blurb">{esc(shape["why"])}</p>'
            '<dl class="act-facts"><dt>Configuration</dt>'
            f'<dd>{esc(r["label"])}, {r["pieces"]} '
            f'{"player" if r["pieces"] == 1 else "players"}</dd></dl>'
            f'<a class="act-card-link" href="{nav_prefix}contact/?act={esc(act["id"])}">'
            "Check a date</a>"
            "</article>"
        )
    return f'<div class="card-grid card-grid--3">{"".join(cards)}</div>'


def credits() -> str:
    """The client strip (2026-09-03): the eyebrow and the one-colour logo row,
    from site.json credits. Every mark is inlined from img/logos/<id>.svg so it
    takes the palette from CSS (currentColor for the mark, var(--paper) for a
    knockout) and needs no request; the file is already normalised to a tight
    viewBox with no width or height, so CSS sets the height and the aspect
    ratio does the rest. role="img" plus the name is the alt text."""
    c = site["credits"]
    items = []
    for logo in c["logos"]:
        svg = (ROOT / "img" / "logos" / f"{logo['id']}.svg").read_text(encoding="utf-8")
        svg = svg.replace(
            "<svg ", f'<svg role="img" aria-label="{esc(logo["name"])}" focusable="false" ', 1
        )
        items.append(f'<li class="credit" style="--credit-h:{logo.get("h", 1)}">{svg}</li>')
    return (
        f'<p class="eyebrow">{esc(c["label"])}</p>'
        f'<ul class="credits-list" aria-label="{esc(c["label"])}">{"".join(items)}</ul>'
    )


def credits_also() -> str:
    return esc(site["credits"]["also"])


def act_picker() -> str:
    """The act field on the contact form. Every "Inquire" link across the site
    carries ?act=<id>, and contact.js preselects from it, so an inquiry that
    started on an act page arrives naming that act. Without script the field
    is still a working select, which is why it is rendered rather than hidden."""
    opts = "".join(
        f'<option value="{esc(a["name"])}" data-id="{esc(a["id"])}">'
        f'{esc(a["name"])} ({esc(a["style"])})</option>'
        for a in ACTS
    )
    return (
        '<div class="field"><label for="act">Act</label>'
        '<select id="act" name="Act">'
        '<option value="">Not sure yet, recommend one</option>'
        f"{opts}</select></div>"
    )


def roster_grid_flagships(nav_prefix: str = "") -> str:
    cards = "".join(act_card(a, nav_prefix) for a in FLAGSHIPS)
    return f'<div class="card-grid card-grid--3">{cards}</div>'


# ------------------------------------------------------------ structured data


def organization_schema() -> dict:
    return {
        "@context": "https://schema.org",
        "@type": "MusicGroup",
        "@id": f"{SITE_URL}/#org",
        "name": BRAND["name"],
        "description": BRAND["intro"],
        "url": SITE_URL,
        "email": BRAND["email"],
        "address": {
            "@type": "PostalAddress",
            "addressLocality": BRAND["city"],
            "addressRegion": BRAND["region"],
            "addressCountry": "US",
        },
        "areaServed": BRAND["serviceArea"],
        # No makesOffer since 2026-09-04. An Offer node is a published price,
        # and the site publishes none: a night is priced when a date is
        # checked. Removing it also means no Offer can fail a rich-results
        # test for a missing price.
    }


def faq_schema() -> dict:
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": f["q"],
                "acceptedAnswer": {
                    "@type": "Answer", "text": resolve_market_tokens(f["a"])
                },
            }
            for f in site["faqs"]
        ],
    }


def article_schema(post: dict, canonical: str, og_image: str) -> dict:
    """Article JSON-LD for one blog post. The publisher is the site's one
    entity — the MusicGroup node the home page declares, same @id — so a
    post and the organization can never drift apart. An author named after
    the brand is that same entity; anyone else is a Person."""
    author_name = (post.get("author") or {}).get("name", BRAND["name"])
    entity = {
        "@type": "MusicGroup",
        "@id": f"{SITE_URL}/#org",
        "name": BRAND["name"],
        "url": SITE_URL,
    }
    return {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": post.get("title", ""),
        "description": post.get("meta_description", ""),
        "author": entity if author_name == BRAND["name"]
        else {"@type": "Person", "name": author_name},
        "publisher": entity,
        "datePublished": post.get("date", ""),
        "dateModified": post.get("last_updated") or post.get("date", ""),
        "image": og_image,
        "mainEntityOfPage": {"@type": "WebPage", "@id": canonical},
    }


def planner_faq_schema() -> dict:
    """Every settled question on /planners/faq/, as one FAQPage.

    Entries flagged "open" are deliberately excluded: they are our best guess
    at a policy nobody has decided, and a guess does not belong in structured
    data that search engines quote back as fact.

    The pricing set (site.json "faqs") used to be folded in here too. It came
    out 2026-09-04: those answers carry the market's figures now, and a figure
    belongs in structured data only on a page that prints the source beside
    it. They keep their own FAQPage on /pricing/, where the Sources note is,
    and the visible list on this page never showed them anyway.
    """
    entries = []
    for group in site["plannerFaqs"]:
        entries += [f for f in group["items"] if not f.get("open")]
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": f["q"],
                "acceptedAnswer": {
                    "@type": "Answer", "text": resolve_market_tokens(f["a"])
                },
            }
            for f in entries
        ],
    }


# The towns the business actually serves, named individually rather than as a
# prose blob. Search reads these; "the mountain corridor" is not a place.
SERVICE_AREAS = [
    "Denver", "Boulder", "Colorado Springs", "Fort Collins",
    "Vail", "Beaver Creek", "Aspen", "Breckenridge",
    "Telluride", "Steamboat Springs", "Winter Park", "Crested Butte",
]


def local_business_node() -> dict:
    node = {
        "@type": "LocalBusiness",
        "@id": f"{SITE_URL}/#business",
        "name": BRAND["name"],
        "description": BRAND["intro"],
        "url": SITE_URL,
        "email": BRAND["email"],
        "address": {
            "@type": "PostalAddress",
            "addressLocality": BRAND["city"],
            "addressRegion": BRAND["region"],
            "addressCountry": "US",
        },
        "areaServed": [{"@type": "Place", "name": n} for n in SERVICE_AREAS],
        "priceRange": "$$$",
    }
    # sameAs holds the profile URLs (Google Business Profile, marketplaces,
    # socials) as each one goes live. An empty list stays out of the markup.
    if BRAND.get("sameAs"):
        node["sameAs"] = BRAND["sameAs"]
    return node


def act_service_node(act: dict) -> dict:
    return {
        "@type": "Service",
        "@id": f"{SITE_URL}/{act_url(act)}#service",
        "name": act["name"],
        "serviceType": f"{act['style']} for private events",
        "description": act["blurb"],
        "provider": {"@id": f"{SITE_URL}/#business"},
        "areaServed": [{"@type": "Place", "name": n} for n in SERVICE_AREAS],
        # No offers. A Service describes what is booked; the price for a night
        # comes back when a date is checked, so there is nothing to publish.
    }


def act_schema(act: dict) -> dict:
    return {
        "@context": "https://schema.org",
        "@graph": [local_business_node(), act_service_node(act)],
    }


def roster_schema() -> dict:
    """Roster and pricing pages: the business plus every act as a Service."""
    return {
        "@context": "https://schema.org",
        "@graph": [local_business_node()] + [act_service_node(a) for a in ACTS],
    }


def pricing_schema() -> dict:
    """The pricing page carries the most structured data on the site: the
    business, every act as a Service, and the pricing FAQ. The FAQ answers
    carry the market's figures with their sources, which is the only priced
    thing on the page and belongs to somebody else."""
    return {
        "@context": "https://schema.org",
        "@graph": [local_business_node()]
        + [act_service_node(a) for a in ACTS]
        + [{
            "@type": "FAQPage",
            "mainEntity": [
                {
                    "@type": "Question",
                    "name": f["q"],
                    "acceptedAnswer": {
                        "@type": "Answer", "text": resolve_market_tokens(f["a"])
                    },
                }
                for f in site["faqs"]
            ],
        }],
    }


SCHEMAS = {
    "organization": organization_schema,
    "faq": faq_schema,
    "plannerfaq": planner_faq_schema,
    "roster": roster_schema,
    "pricing": pricing_schema,
}


def build_schema(cfg: dict) -> str:
    key = cfg.get("schema")
    if not key or key not in SCHEMAS:
        return ""
    return schema_tag(SCHEMAS[key]())


def schema_tag(payload: dict) -> str:
    return (
        '<script type="application/ld+json">'
        + json.dumps(payload, ensure_ascii=False)
        + "</script>"
    )


# --------------------------------------------------- moved URLs (redirects)
# The 2026-08-20 SEO buildout moved four URLs. GitHub Pages serves static
# files only, so a move is a stub at the old path: meta refresh 0 (a redirect
# signal Google honours) plus a canonical to the target and one visible link.
# Stubs are not registered pages: no sitemap entry, no llms.txt row.

REDIRECTS = {
    "corporate/holiday/index.html": "corporate/holiday-party/",
    "music/tejas-singh/index.html": "artists/tejas-singh/",
    "music/jazz-duo/index.html": "ensembles/jazz-duo-trio/",
    "music/dirty-flamenco/index.html": "ensembles/flamenco-trio/",
}


def write_redirects() -> None:
    for old, new in REDIRECTS.items():
        target = f"{SITE_URL}/{new}"
        doc = (
            '<!DOCTYPE html>\n<html lang="en">\n<head>\n'
            '  <meta charset="utf-8">\n'
            f'  <meta http-equiv="refresh" content="0; url={target}">\n'
            f'  <link rel="canonical" href="{target}">\n'
            f"  <title>Moved — {esc(BRAND['name'])}</title>\n"
            "</head>\n<body>\n"
            f'  <p>This page moved to <a href="{target}">{target}</a>.</p>\n'
            "</body>\n</html>\n"
        )
        out = ROOT / old
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(doc, encoding="utf-8")


# ------------------------------------------- parameterized section tokens
# A section never types a figure. Since 2026-09-04 the only figures on this
# site are the market's, and {{market:<id>}} is the one token that renders one:
# it reads _src/data/market-rates.json, registers the id against the page, and
# the page must carry {{market_sources}} or the build stops. The rate tokens
# that used to live here (rate_range, rate_range_resort, rate_hour, rate_4h,
# rate_1h, act_from, and the rate_card_table / rate_table_summary /
# rate_table_full blocks) were deleted with the published card; git history has
# them and OFFER.md has the numbers.

PARAM_BLOCK = re.compile(
    r"\{\{(act_ladder|act_setlist|offer_close|market):([^}]+)\}\}"
)


def offer_close(headline: str) -> str:
    """The sitewide close (handoff §4): one offer sentence, one intake action.

    Every buildout page ends with this block, so the offer cannot fork per
    page. Only the headline is the page's own.
    """
    return (
        '<section class="section section--ruled"><div class="wrap">'
        '<div class="close-row">'
        f'<div style="max-width: 32rem;"><h2 class="h2">{esc(headline)}</h2>'
        '<p class="lede">Live music sized to the event, solo, duo, trio or '
        "quartet, priced to the date, with a single point of contact.</p></div>"
        '<div class="btn-row"><a class="btn" href="{{nav_prefix}}contact/">'
        "Check a Date</a></div>"
        "</div>"
        '<p class="note">Send the date and the venue. What comes back is a yes '
        "or a straight no, and our number for that night. What the wider "
        'market charges is set out on the <a href="{{nav_prefix}}pricing/">'
        "pricing page</a>.</p>"
        "</div></section>"
    )


def param_block(m: re.Match) -> str:
    kind, arg = m.group(1), m.group(2).strip()
    if kind == "offer_close":
        return offer_close(arg)
    if kind == "market":
        return market_figure(arg)
    act = ACT_BY_ID[arg]
    if kind == "act_ladder":
        return act_ladder(act)
    return act_setlist(act)


def resolve_market_tokens(text: str) -> str:
    """{{market:<id>}} inside a data string: a FAQ answer in site.json, a
    schema.json answer, a blog post's YAML. Same registration as a section
    token, so the page still has to carry its Sources note."""
    return re.sub(
        r"\{\{market:([^}]+)\}\}", lambda m: market_figure(m.group(1).strip()), text
    )


# ----------------------------------------------- per-page structured data
# A page dir may carry schema.json: its Service (with priced Offers off the
# rate card), optionally one act's Service node, and the page FAQ. One file
# feeds both the FAQPage markup and the visible {{page_faqs}} list, so the
# two can never drift — the same rule the rate card lives by.


def resolve_rate_tokens(text: str) -> str:
    """Tokens inside schema.json strings. Only {{market:<id>}} has a
    plain-text form; a figure a crawler quotes has to be one whose source is
    printed on the page beside it. Everything else fails the build here."""
    def plain(m: re.Match) -> str:
        kind = m.group(1)
        if kind != "market":
            raise SystemExit(
                f"schema.json: {{{{{kind}:...}}}} has no plain-text form. Only "
                "market: figures may appear in structured data."
            )
        return market_figure(m.group(2).strip())
    return PARAM_BLOCK.sub(plain, text)


def page_schema(page_dir: pathlib.Path, cfg: dict) -> tuple:
    path = page_dir / "schema.json"
    if not path.exists():
        return "", ""
    data = json.loads(read(path))
    graph = [local_business_node()]
    svc = data.get("service")
    act = ACT_BY_ID[data["act"]] if data.get("act") else None
    canonical = canonical_for(cfg["output"])
    node = None
    if act and svc and f"{SITE_URL}/{act_url(act)}" == canonical:
        # The act's own page: the service block and the act's roster node
        # describe the same booking, and both would claim #service — an @id
        # that /music/ and /pricing/ already emit with the act's name on it.
        # So one merged Service: the act node keeps the id and the name, and
        # wears the page's authored copy; the page's descriptive name survives
        # as an alternateName instead of forking the entity across pages.
        if set(svc.get("configs", act["config_tags"])) != set(act["config_tags"]):
            raise SystemExit(
                f"{path}: service configs {svc.get('configs')} differ from "
                f"act {act['id']} config_tags {act['config_tags']}; one merged "
                "node describes one booking, so they must match"
            )
        node = act_service_node(act)
        if svc["name"] != act["name"]:
            node["alternateName"] = svc["name"]
        node["serviceType"] = svc["serviceType"]
        if svc.get("description"):
            node["description"] = svc["description"]
        if svc.get("areaServed"):
            node["areaServed"] = [
                {"@type": "Place", "name": n} for n in svc["areaServed"]
            ]
        act = None
    elif svc:
        node = {
            "@type": "Service",
            "@id": f"{canonical}#service",
            "name": svc["name"],
            "serviceType": svc["serviceType"],
            "description": svc.get("description", ""),
            "provider": {"@id": f"{SITE_URL}/#business"},
            "areaServed": [
                {"@type": "Place", "name": n}
                for n in svc.get("areaServed", SERVICE_AREAS)
            ],
        }
        # schema.json "configs" still names the sizes a page sells, and the
        # build still checks it against the act it merges with. It emits no
        # Offer: there is no published price to put in one.
    if node:
        # The review slot (§10.7 of the buildout): empty today because zero
        # reviews exist and a fabricated one would be worse than none. When a
        # real testimonial lands, add {"author": "...", "body": "...",
        # "rating": 5, "date": "YYYY-MM-DD"} to schema.json "reviews" and it
        # renders as Review markup on this Service, no build change needed.
        reviews = data.get("reviews", [])
        if reviews:
            node["review"] = [
                {
                    "@type": "Review",
                    "author": {"@type": "Person", "name": r["author"]},
                    "reviewBody": r["body"],
                    "reviewRating": {
                        "@type": "Rating",
                        "ratingValue": r.get("rating", 5),
                        "bestRating": 5,
                    },
                    "datePublished": r.get("date", ""),
                }
                for r in reviews
            ]
        graph.append(node)
    if act:
        graph.append(act_service_node(act))
    # The page's VideoObject (schema.json "video"): name, description,
    # uploadDate and duration are authored here, but the file and the poster
    # come from the act's own video fields in acts.json, so the markup can
    # never point at footage the page does not play. An http(s) act video is
    # an embed and publishes embedUrl; a site-relative file publishes
    # contentUrl. duration is ISO 8601 ("PT53S").
    vid = data.get("video")
    if vid:
        a = ACT_BY_ID.get(data.get("act", ""))
        if not a or not a.get("video"):
            raise SystemExit(
                f"{path}: a schema video block needs its act to carry a "
                "video in acts.json; the markup points at the act's own file"
            )
        video_node = {
            "@type": "VideoObject",
            "@id": f"{canonical}#video",
            "name": vid["name"],
            "description": vid["description"],
            "thumbnailUrl": f"{SITE_URL}/{a['video_poster']}",
            "uploadDate": vid["uploadDate"],
            "duration": vid["duration"],
        }
        if a["video"].startswith(("http://", "https://")):
            video_node["embedUrl"] = a["video"]
        else:
            video_node["contentUrl"] = f"{SITE_URL}/{a['video']}"
        graph.append(video_node)
    faq_html = ""
    faqs = [
        {**f, "q": resolve_rate_tokens(f["q"]), "a": resolve_rate_tokens(f["a"])}
        for f in data.get("faqs", [])
    ]
    if faqs:
        graph.append({
            "@type": "FAQPage",
            "mainEntity": [
                {
                    "@type": "Question",
                    "name": f["q"],
                    "acceptedAnswer": {"@type": "Answer", "text": f["a"]},
                }
                for f in faqs
            ],
        })
        rows = "".join(
            f'<div class="faq-row"><dt>{esc(f["q"])}</dt><dd>{esc(f["a"])}</dd></div>'
            for f in faqs
        )
        faq_html = f'<dl class="faq-list">{rows}</dl>'
    return schema_tag({"@context": "https://schema.org", "@graph": graph}), faq_html


def build_ga() -> str:
    if not GA_MEASUREMENT_ID:
        return ""
    gid = GA_MEASUREMENT_ID
    return (
        f'<script defer src="https://www.googletagmanager.com/gtag/js?id={gid}"></script>'
        "<script>window.dataLayer=window.dataLayer||[];"
        "function gtag(){dataLayer.push(arguments);}gtag('js',new Date());"
        f"gtag('config','{gid}');</script>"
    )


# ------------------------------------------------------------------ pages


def render_page(
    *,
    output: str,
    content: str,
    title: str,
    title_exact: bool = False,
    meta_description: str = "",
    og_type: str = "website",
    og_image: str = "",
    robots: str = "index, follow",
    schema_html: str = "",
    head_extra: str = "",
    nav_active: str = "",
    nav_prefix: str = None,
) -> None:
    """Assemble base.html around `content` and write `output`. The single
    layout path — regular pages and blog posts both come through here."""
    if nav_prefix is None:
        nav_prefix = "../" * output.count("/")

    base = read(LAYOUTS / "base.html")
    header = partial("header")
    footer = partial("footer")

    for key in NAV_KEYS:
        marker = 'aria-current="page"' if key == nav_active else ""
        header = header.replace("{{nav_" + key + "}}", marker)

    full_title = title if title_exact else f"{title} — {BRAND['name']}"

    replacements = {
        "{{title}}": esc(full_title),
        "{{meta_description}}": esc(meta_description),
        "{{canonical}}": canonical_for(output),
        "{{og_type}}": og_type,
        "{{og_image}}": og_image or OG_IMAGE,
        "{{robots}}": robots,
        "{{schema}}": schema_html,
        "{{head_extra}}": head_extra,
        "{{ga}}": build_ga(),
        "{{nav_prefix}}": nav_prefix,
        # On the home page nav_prefix is empty, and href="" is not a link.
        "{{home_href}}": nav_prefix or "./",
        "{{header}}": header,
        "{{content}}": content,
        "{{footer}}": footer,
        # Brand tokens, usable anywhere in a section or partial.
        "{{brand_name}}": esc(BRAND["name"]),
        "{{brand_legal_name}}": val(BRAND["legalName"]),
        "{{brand_tagline}}": esc(BRAND["tagline"]),
        "{{brand_intro}}": esc(BRAND["intro"]),
        "{{brand_service_area}}": esc(BRAND["serviceArea"]),
        "{{brand_email}}": val(BRAND["email"]),
        "{{brand_email_raw}}": esc(BRAND["email"].strip("[]")),
        "{{form_action}}": esc(
            f"https://formsubmit.co/{BRAND['formsubmit'].strip('[]')}"
        ),
        "{{site_url}}": SITE_URL,
    }

    out_html = base
    for token, value in replacements.items():
        out_html = out_html.replace(token, value)
    # Header/footer are injected after the brand pass above, so run once more
    # to resolve tokens that live inside the partials themselves.
    for token, value in replacements.items():
        if token in ("{{header}}", "{{footer}}", "{{content}}"):
            continue
        out_html = out_html.replace(token, value)

    # An unresolved token is a page shipping "{{rate_range:duo}}" as visible
    # text. That used to be impossible because every token was in one regex;
    # the 2026-09-04 sweep retired six of them, so the build checks the
    # rendered page rather than trusting that every call site was found.
    stray = re.findall(r"\{\{[a-z_]+(?::[^}]*)?\}\}", out_html)
    if stray:
        raise SystemExit(
            f"{output}: unresolved token(s) {sorted(set(stray))}. A retired "
            "rate token, or a typo."
        )

    out_path = ROOT / output
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(out_html, encoding="utf-8")


def build_page(page_dir: pathlib.Path, extra_blocks: dict = None) -> dict | None:
    cfg = json.loads(read(page_dir / "config.json"))
    output = cfg["output"]
    # 404.html is served by GitHub Pages for *any* missing path, including
    # deep ones, so its asset and nav links must be absolute or they break.
    nav_prefix = "/" if cfg.get("absolute_paths") else "../" * output.count("/")

    section_dir = page_dir / "sections"
    sections = sorted(section_dir.glob("*.html")) if section_dir.exists() else []
    content = "\n".join(read(s) for s in sections)
    # Section comments are editorial notes to ourselves — why a block exists,
    # which pillar it carries, what was cut. They do not belong in the shipped
    # page, where anyone can read them in view-source.
    content = COMMENT.sub("", content)

    # Blocks first: a section can contain {{market_table}}, and the brand
    # tokens inside generated markup still need resolving afterwards.
    #
    # Every block is a thunk and only runs when its token is actually on the
    # page. That matters since 2026-09-04: market_table() and faq_list()
    # register the market ids they print against this page, and a block that
    # ran for a page that never showed it would demand a Sources note there.
    begin_page()
    blocks = {
        "{{market_table}}": market_table,
        "{{included_list}}": included_list,
        "{{included_list_columns}}": included_list_columns,
        "{{extras_list}}": extras_list,
        "{{faq_list}}": faq_list,
        "{{planner_faq_list}}": planner_faq_list,
        "{{cover_strip}}": cover_strip,
        "{{stage_plot}}": stage_plot,
        "{{stage_table}}": stage_table,
        "{{power_table}}": power_table,
        "{{loadin_table}}": loadin_table,
        "{{event_types}}": event_types,
        "{{roster_filters}}": roster_filters,
        "{{roster_grid}}": lambda: roster_grid(nav_prefix),
        "{{roster_grid_flagships}}": lambda: roster_grid_flagships(nav_prefix),
        "{{corporate_shapes}}": lambda: corporate_shapes(nav_prefix),
        "{{credits}}": credits,
        "{{credits_also}}": credits_also,
        "{{act_picker}}": act_picker,
        "{{act_count}}": lambda: str(len(ACTS)),
        "{{act_count_word}}": act_count_word,
        "{{season_dates}}": season_dates,
        "{{season_leads}}": lambda: season_leads(nav_prefix),
    }
    for token, build in blocks.items():
        if token in content:
            content = content.replace(token, build())

    # Per-page structured data + the FAQ block, both from the dir's schema.json.
    schema_html, faq_block = page_schema(page_dir, cfg)
    content = content.replace("{{page_faqs}}", faq_block)
    for token, value in (extra_blocks or {}).items():
        content = content.replace(token, value)

    # Parameterized tokens after the static ones, so a static block's output
    # can itself carry brand tokens but never a parameterized one.
    try:
        content = PARAM_BLOCK.sub(param_block, content)
    except KeyError as e:
        raise SystemExit(
            f"{page_dir.name}: unknown id in a parameterized token: {e}"
        )
    # Config-level schema (the pricing FAQ, the planner FAQ) can carry market
    # figures too, so it resolves before the Sources note is written and not
    # in the render_page call, where it would land after it.
    schema_html = schema_html or build_schema(cfg)

    # Last: the Sources note for whatever figures the page ended up printing,
    # and a hard stop if it printed one without asking for the note.
    content = finalize_market(content, page_dir.name)

    # og_image in config is repo-relative ("img/hero.jpg") and should be the
    # image the page itself shows. The Softdocs enquiry travelled through
    # Microsoft Teams as a shared link, so the unfurl is a real surface: a page
    # without its own image falls back to og-default.png.
    og_image = cfg.get("og_image", "")
    if og_image and not og_image.startswith(("http://", "https://")):
        og_image = f"{SITE_URL}/{og_image.lstrip('/')}"

    render_page(
        output=output,
        content=content,
        title=cfg["title"],
        title_exact=bool(cfg.get("title_exact")),
        meta_description=cfg.get("meta_description", ""),
        og_type=cfg.get("og_type", "website"),
        og_image=og_image,
        robots=cfg.get("robots", "index, follow"),
        schema_html=schema_html,
        nav_active=cfg.get("nav", ""),
        nav_prefix=nav_prefix,
    )
    return {"output": output, "cfg": cfg, "src_dir": str(page_dir.relative_to(ROOT))}


# -------------------------------------------------------------- act pages
# Flagship pages are generated from acts.json, not authored as page dirs.
# Adding a flagship is a status flip in the data file, never a new template.


def act_hero(act: dict) -> str:
    """Hero with the video slot. `video` is null until footage exists, and the
    slot renders as a marked placeholder rather than being omitted, so the
    gap is visible on the page instead of only in a backlog."""
    if act.get("video"):
        # Same contract as act_card_media: http(s) is an embed, anything
        # else is a site-relative file. Generated act pages sit two levels
        # deep, matching the ../../img/ the placeholder branch already uses.
        if act["video"].startswith(("http://", "https://")):
            media = (
                '<div class="act-video"><iframe src="' + esc(act["video"]) + '" '
                f'title="{esc(act["name"])} performing" loading="lazy" '
                'allow="accelerometer; autoplay; clipboard-write; encrypted-media; '
                'picture-in-picture" allowfullscreen></iframe></div>'
            )
        else:
            poster = (
                f' poster="../../{esc(act["video_poster"])}"'
                if act.get("video_poster") else ""
            )
            media = (
                f'<div class="act-video"><video src="../../{esc(act["video"])}"'
                f'{poster} title="{esc(act["name"])} performing" '
                'controls preload="metadata" playsinline></video></div>'
            )
    else:
        media = (
            '<div class="act-video act-video--empty" data-tbd="true" role="img" '
            f'aria-label="Video of {esc(act["name"])} is not published yet.">'
            '<img class="act-video-poster" src="../../img/' + esc(act["img"]) + '" '
            f'alt="" width="1600" height="900" decoding="async">'
            '<p class="act-video-note">Footage slot</p></div>'
        )
    return (
        '<section class="section section--top act-hero"><div class="wrap">'
        '<div class="heading">'
        f'<p class="eyebrow eyebrow--slab">{esc(act["style"])}</p>'
        f'<h1 class="h1 display">{esc(act["name"])}</h1>'
        f'<p class="act-face">{esc(act_byline(act))}. '
        f'{esc(act["material"])}.</p>'
        f'<p class="lede">{esc(act["blurb"])}</p>'
        '<a class="btn" href="../../contact/?act=' + esc(act["id"]) + '">Check a date</a>'
        "</div>"
        f"{media}"
        "</div></section>"
    )


def act_identity(act: dict) -> str:
    paras = "".join(f'<p class="prose">{esc(p)}</p>' for p in act.get("identity", []))
    return (
        '<section class="section section--ruled"><div class="wrap wrap--narrow">'
        f"{paras}</div></section>"
    )


def act_ladder(act: dict) -> str:
    """The configuration ladder: size, build, and where it lands. Both price
    columns came off 2026-09-04 with the published card. What the table still
    does is the useful part, which is show a buyer which build fits the night
    they are describing."""
    rows = []
    for rung in act["ladder"]:
        r = rate_of(rung["config"])
        rows.append(
            "<tr>"
            f'<th scope="row" class="rate-size">{esc(r["label"])}'
            f'<span class="rate-note">{esc(rung["build"])}</span></th>'
            f'<td class="ladder-best">{esc(rung["bestFor"])}</td>'
            "</tr>"
        )
    return (
        '<section class="section section--ruled section--sunk" id="configurations">'
        '<div class="wrap"><h2 class="h3">Configurations</h2>'
        '<div class="table-scroll"><table class="rate-table tnum">'
        "<thead><tr><th>Size</th><th>Where it lands</th></tr></thead>"
        f'<tbody>{"".join(rows)}</tbody></table></div>'
        '<p class="note">The configuration and the date set the number: an hour '
        "under cocktails and a full evening in the resort corridor are different "
        'jobs. <a href="{{nav_prefix}}contact/">Send us the date</a> and we price '
        "that night.</p>"
        "</div></section>"
    )


def _repertoire_setlist(act: dict) -> str:
    songs = json.loads(read(DATA / "repertoire.json"))
    cols = []
    for group in act["setlist"]["groups"]:
        # Deterministic pick: first N in catalogue order. Songs flagged `band`
        # are held back, the same rule the cover walls use, so a set list never
        # implies a lineup that was not booked.
        picked = [
            s for s in songs
            if group["moment"] in s["moments"] and "band" not in s["flags"]
        ][: group["count"]]
        items = "".join(
            f'<li><span class="song-title">{esc(s["title"])}</span> '
            f'<span class="song-artist">{esc(s["artist"])}</span></li>'
            for s in picked
        )
        cols.append(
            f'<div><h3 class="h5">{esc(group["label"])}</h3>'
            f'<ul class="setlist">{items}</ul></div>'
        )
    return f'<div class="split split--three">{"".join(cols)}</div>'


def act_setlist(act: dict) -> str:
    sl = act.get("setlist")
    if not sl:
        return ""
    if sl.get("from_repertoire"):
        body = _repertoire_setlist(act)
        # {{nav_prefix}} rather than a counted path: this block now also renders
        # into authored pages at other depths via {{act_setlist:ID}}.
        more = ('<p class="note"><a href="{{nav_prefix}}repertoire/">The whole song list</a> '
                "is published, all 240 titles.</p>")
    else:
        items = "".join(f'<li><span class="song-title">{esc(i)}</span></li>'
                        for i in sl["items"])
        body = f'<ul class="setlist setlist--cols">{items}</ul>'
        more = ""
    return (
        '<section class="section section--ruled"><div class="wrap">'
        '<h2 class="h3">A sample of the set</h2>'
        f'<p class="note">{esc(sl["note"])}</p>'
        f"{body}{more}</div></section>"
    )


def act_cta(act: dict) -> str:
    """The hold-or-no promise. It is the one thing on the page that is a
    commitment rather than a description, so it gets its own section."""
    return (
        '<section class="section section--ruled section--sunk act-cta">'
        '<div class="wrap wrap--narrow"><h2 class="h3">Check a date</h2>'
        f'<p class="prose">Send the date, the venue and roughly how many guests. '
        f'You get one of two answers: {esc(act["name"])} is '
        "available and here is the hold, or it is not and here is what is. No "
        "discovery call in between, and no quote that arrives a week later.</p>"
        '<p class="prose">Travel outside the metro, a night\'s lodging past the '
        "passes, holiday weekends and New Year's Eve are quoted as their own "
        "lines on the contract rather than folded into a headline figure. What "
        'the wider market charges is set out on the '
        '<a href="../../pricing/">pricing page</a>.</p>'
        '<a class="btn" href="../../contact/?act=' + esc(act["id"]) + '">Check a date</a>'
        "</div></section>"
    )


def build_act_page(act: dict) -> dict:
    begin_page()
    output = f"{ACTS_BASE}/{act['id']}/index.html"
    content = "".join([
        act_hero(act),
        act_identity(act),
        act_ladder(act),
        act_setlist(act),
        act_cta(act),
    ])
    content = finalize_market(content, output)
    cfg = {
        "title": act["seo_title"],
        "title_exact": True,
        "meta_description": act["meta_description"],
        "output": output,
        "nav": ACTS_BASE,
    }
    render_page(
        output=output,
        content=content,
        title=cfg["title"],
        title_exact=True,
        meta_description=cfg["meta_description"],
        schema_html=schema_tag(act_schema(act)),
        nav_active=ACTS_BASE,
    )
    return {"output": output, "cfg": cfg, "src_dir": "_src/data/acts.json"}


# ------------------------------------------------------------------- blog
# The shared blog kit. Authoring format: _src/pages/blog-<slug>/content.yaml
# with frontmatter plus a `sections` list of typed blocks (see
# _src/lib/blog_renderer.py for the schema and _src/templates/ for the
# markup). `draft: true` keeps a post out of every publish surface — HTML,
# index, RSS, sitemap, llms.txt — while --lint still validates it.

_blog = None  # lazy (blog_renderer module, jinja2 environment)


def ensure_blog_renderer():
    """Import the blog renderer and its dependencies on first use, so a
    build with no posts never needs them installed."""
    global _blog
    if _blog is None:
        if str(ROOT) not in sys.path:
            sys.path.insert(0, str(ROOT))
        try:
            from _src.lib import blog_renderer as br
        except ImportError as e:
            raise SystemExit(
                f"Blog renderer dependency missing: {e}\n"
                "Install with: pip install jinja2 markdown pyyaml"
            )
        _blog = (br, br.create_jinja_env(str(TEMPLATES)))
    return _blog


def blog_post_dirs() -> list:
    """Every _src/pages/blog-<slug>/ with a content.yaml. blog-index has
    config.json + sections instead, so the filter never picks it up."""
    return [p for p in sorted(PAGES.glob("blog-*")) if (p / "content.yaml").exists()]


def collect_blog_posts() -> list:
    """All posts (drafts included), validated, newest first, with
    reading_time and date_display computed for the index and feeds.
    Any schema error fails the build — same bar as --lint."""
    if not blog_post_dirs():
        return []
    br, _env = ensure_blog_renderer()
    posts = br.collect_posts(PAGES)
    problems = []
    for p in posts:
        rel = f"_src/pages/{p['dir_name']}/content.yaml"
        errors, _warnings = br.validate_post(p, rel, dir_name=p["dir_name"])
        problems += errors
    if problems:
        raise SystemExit(
            "Blog validation failed (run `python3 build.py --lint`):\n"
            + "\n".join(f"  - {e}" for e in problems)
        )
    for p in posts:
        p["reading_time"] = br.calculate_reading_time(p.get("sections", []))
        p["date_display"] = br.fmt_date(p["date"])
    posts.sort(key=lambda p: (p.get("date", ""), p.get("slug", "")), reverse=True)
    return posts


def blog_thumb(src: str) -> str:
    """The index-sized copy of a hero, or the hero itself.

    scripts/thumbs.py writes img/thumbs/<filename>. Seven full-size heroes on
    one listing page is about a megabyte of image to draw seven thumbnails,
    so the index takes the small copy when there is one. Falling back rather
    than failing means a post added without running that script ships a
    heavier index, not a broken one.
    """
    if not src or src.startswith(("http://", "https://", "//")):
        return src
    thumb = f"img/thumbs/{pathlib.Path(src).name}"
    return thumb if (ROOT / thumb).exists() else src


def blog_cards(published: list, nav_prefix: str = "../") -> str:
    """Blog index listing: one row per published post, newest first, or the
    quiet empty state until the first post ships.

    nav_prefix is the depth of the page this lands on. It defaults to the
    blog index's own depth because that is the only page the token appears
    on, and the row hrefs below are relative to it too."""
    if not published:
        return (
            '<p class="prose">The first entry is on its way.</p>\n'
            '<p class="note">There is an <a href="../rss.xml">RSS feed</a> '
            "if you would rather subscribe than check back.</p>"
        )
    sep = '<span class="blog-row-sep" aria-hidden="true">&middot;</span>'
    rows = []
    for i, p in enumerate(published):
        meta = sep.join(
            [
                f'<span class="blog-row-eyebrow">{esc(p.get("eyebrow", ""))}</span>',
                f'<time datetime="{esc(p["date"])}">{esc(p["date_display"])}</time>',
                f"<span>{p['reading_time']} min read</span>",
            ]
        )
        # The post's own hero, at thumbnail size. alt is empty on purpose: the
        # link is already named by the headline beside it, and the hero's real
        # alt is on the post page where the image is the subject rather than a
        # marker for which row you are looking at. The top two rows are close
        # enough to the fold to load eagerly; the rest wait.
        hero = p.get("hero") or {}
        thumb = ""
        if isinstance(hero, dict) and hero.get("src"):
            loading = "eager" if i < 2 else "lazy"
            thumb = (
                f'<img class="blog-row-thumb" src="{nav_prefix}{esc(blog_thumb(hero["src"]))}" '
                f'alt="" width="640" height="360" loading="{loading}" decoding="async">'
            )
        rows.append(
            f'<a class="blog-row" href="{esc(p["slug"])}/">'
            f"{thumb}"
            '<div class="blog-row-text">'
            f'<p class="blog-row-meta">{meta}</p>'
            f'<h2 class="blog-row-title">{esc(p["title"])}</h2>'
            f'<p class="blog-row-dek">{esc(p.get("dek", ""))}</p>'
            "</div>"
            "</a>"
        )
    return f'<div class="blog-list">{"".join(rows)}</div>'


def build_blog_post(post: dict, published: list) -> dict:
    """Render one published post to blog/<slug>/index.html."""
    br, env = ensure_blog_renderer()
    begin_page()
    try:
        content, data = br.render_post(post["post_dir"], env, published)
    except ValueError as exc:
        raise SystemExit(f"  {post['dir_name']}: {exc}")

    # A post writes figures the same way a page does: {{market:<id>}} in the
    # YAML, resolved here against market-rates.json, with {{market_sources}}
    # somewhere in the post or the build stops. The renderer stays free of
    # site data; markdown leaves both tokens alone on the way through.
    content = resolve_market_tokens(content)
    content = finalize_market(content, post["dir_name"])

    output = f"blog/{data['slug']}/index.html"
    canonical = canonical_for(output)

    og_image = ""
    hero = data.get("hero")
    if isinstance(hero, dict) and hero.get("src"):
        src = hero["src"]
        og_image = src if src.startswith(("http://", "https://")) else f"{SITE_URL}/{src.lstrip('/')}"

    author_name = (data.get("author") or {}).get("name", BRAND["name"])
    head_extra = "\n  ".join(
        [
            f'<meta property="article:published_time" content="{data["date"]}">',
            f'<meta property="article:modified_time" content="{data.get("last_updated") or data["date"]}">',
            f'<meta property="article:author" content="{esc(author_name)}">',
        ]
    )

    render_page(
        output=output,
        content=content,
        title=data.get("seo_title") or data["title"],
        meta_description=data.get("meta_description", ""),
        og_type="article",
        og_image=og_image,
        robots=data.get("robots", "index, follow"),
        schema_html=schema_tag(article_schema(data, canonical, og_image or OG_IMAGE)),
        head_extra=head_extra,
    )
    return {"output": output, "post": data}


def write_rss(published: list) -> None:
    """rss.xml at the site root. A zero-item feed is valid RSS; the channel
    exists from day one so the autodiscovery link never 404s. The channel
    description reuses the blog index meta description so the two can't
    drift."""

    def x(s: str) -> str:
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    idx = json.loads(read(PAGES / "blog-index" / "config.json"))
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
        "<channel>",
        f"  <title>{x(BRAND['name'])} — Blog</title>",
        f"  <link>{SITE_URL}/blog/</link>",
        f"  <description>{x(idx.get('meta_description', ''))}</description>",
        "  <language>en-us</language>",
        f'  <atom:link href="{SITE_URL}/rss.xml" rel="self" type="application/rss+xml"/>',
    ]
    for p in published[:20]:
        dt = datetime.datetime.strptime(p["date"], "%Y-%m-%d")
        pub = dt.strftime("%a, %d %b %Y 00:00:00 +0000")
        link = f"{SITE_URL}/blog/{p['slug']}/"
        lines += [
            "  <item>",
            f"    <title>{x(p['title'])}</title>",
            f"    <link>{link}</link>",
            f"    <description>{x(p.get('meta_description') or p.get('dek', ''))}</description>",
            f"    <pubDate>{pub}</pubDate>",
            f"    <guid>{link}</guid>",
            "  </item>",
        ]
    lines += ["</channel>", "</rss>", ""]
    (ROOT / "rss.xml").write_text("\n".join(lines), encoding="utf-8")


def lint() -> bool:
    """Validate every blog content.yaml (drafts included) without building.
    True when clean; the deploy workflow runs this before the build."""
    if not blog_post_dirs():
        print("Lint: no blog posts yet — nothing to validate.")
        return True
    br, _env = ensure_blog_renderer()
    total_errors = 0
    total_warnings = 0
    for data in br.collect_posts(PAGES):
        rel = f"_src/pages/{data['dir_name']}/content.yaml"
        errors, warnings = br.validate_post(data, rel, dir_name=data["dir_name"])
        for w in warnings:
            print(f"  WARNING {w}")
        for e in errors:
            print(f"  ERROR {e}")
        if not errors:
            label = " (draft)" if data.get("draft") else ""
            note = " — with warnings" if warnings else ""
            print(f"  ok {data['dir_name']}{label}{note}")
        total_errors += len(errors)
        total_warnings += len(warnings)
    print(f"Lint: {total_errors} error(s), {total_warnings} warning(s).")
    return total_errors == 0


# -------------------------------------------------------- generated files


def _page_lastmod_map() -> dict:
    """Last commit date (YYYY-MM-DD) per _src path, from one git-log pass.

    Returns {} when real history is unavailable — an unborn repo, or a
    shallow CI checkout, where every path would get the same date and the
    signal would be a lie crawlers learn to ignore. Callers omit <lastmod>
    for any path not in the map.
    """
    try:
        depth = subprocess.run(
            ["git", "rev-list", "--count", "HEAD"],
            cwd=ROOT, capture_output=True, text=True, timeout=30,
        )
        if depth.returncode != 0 or int(depth.stdout.strip() or 0) < 2:
            return {}
        log = subprocess.run(
            ["git", "log", "--format=%cs", "--name-only", "--", "_src"],
            cwd=ROOT, capture_output=True, text=True, timeout=60,
        )
        if log.returncode != 0:
            return {}
    except (OSError, ValueError, subprocess.SubprocessError):
        return {}
    dates: dict[str, str] = {}
    current = ""
    for line in log.stdout.splitlines():
        line = line.strip()
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", line):
            current = line
        elif line and current and line not in dates:
            dates[line] = current  # newest-first: first sighting is the last edit
    return dates


def write_sitemap(pages: list[dict], posts: list[dict] = None) -> None:
    # Static pages get <lastmod> from the newest git commit touching their
    # source dir. Shared-template and rate changes don't bump it; that keeps
    # the date conservative, which is the only honest direction for a hint.
    file_dates = _page_lastmod_map()
    urls = []
    for page in pages:
        if page["cfg"].get("robots", "").startswith("noindex"):
            continue
        loc = html.escape(canonical_for(page["output"]))
        src = page.get("src_dir", "")
        dates = [d for f, d in file_dates.items() if src and f.startswith(src)]
        if dates:
            urls.append(f"  <url><loc>{loc}</loc><lastmod>{max(dates)}</lastmod></url>")
        else:
            urls.append(f"  <url><loc>{loc}</loc></url>")
    # Blog posts follow the pages, newest first, and carry <lastmod> — the
    # field the IndexNow diff and crawlers actually read. An edit that bumps
    # last_updated gets the URL re-pinged on the next deploy.
    for post in posts or []:
        if post.get("robots", "").startswith("noindex"):
            continue
        loc = html.escape(f"{SITE_URL}/blog/{post['slug']}/")
        lastmod = post.get("last_updated") or post["date"]
        urls.append(f"  <url><loc>{loc}</loc><lastmod>{lastmod}</lastmod></url>")
    sitemap = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(urls)
        + "\n</urlset>\n"
    )
    (ROOT / "sitemap.xml").write_text(sitemap, encoding="utf-8")


def write_llms(pages: list[dict], posts: list[dict] = None) -> None:
    """llms.txt — the same courtesy file the other properties publish."""
    lines = [
        f"# {BRAND['name']}",
        "",
        f"> {BRAND['intro']}",
        "",
        f"{BRAND['name']} is a live music company for private events in "
        f"{BRAND['serviceArea']}. No prices are published: what the pricing page "
        "carries is what live music costs in this market, each figure with the "
        "source it came from, and a night is priced when a date is checked.",
        "",
        "## Credits",
        "",
        f"{site['credits']['label']} "
        + ", ".join(l["name"] for l in site["credits"]["logos"][:-1])
        + f" and {site['credits']['logos'][-1]['name']}. {site['credits']['also']}",
        "",
        "## Pages",
        "",
    ]
    for page in pages:
        if page["cfg"].get("robots", "").startswith("noindex"):
            continue
        cfg = page["cfg"]
        lines.append(
            f"- [{cfg['title']}]({canonical_for(page['output'])}): "
            f"{cfg.get('meta_description', '')}"
        )
    # Blog section only when posts exist — no empty heading.
    published = [p for p in posts or [] if not p.get("robots", "").startswith("noindex")]
    if published:
        lines += ["", "## Blog", ""]
        for p in published:
            desc = p.get("llms_description") or p.get("meta_description") or p.get("dek", "")
            lines.append(f"- [{p['title']}]({SITE_URL}/blog/{p['slug']}/): {desc}")
    # The roster, so an answer engine naming a Colorado act for a private
    # event has real acts, real configurations and real floors to quote.
    lines += ["", "## Acts", ""]
    for a in ACTS:
        where = f"{SITE_URL}/{act_url(a)}" if a["status"] == "flagship" or a.get("page") \
            else f"{SITE_URL}/{ACTS_BASE}/"
        lines.append(
            f"- {a['name']} ({a['style']}, {act_byline_inline(a)}): "
            f"{a['blurb']} Configurations: {act_config_range(a)}. {where}"
        )

    # No rate card and no hourly build since 2026-09-04. Both sections
    # published Signet figures, which is exactly what this file must not do.
    # What replaces them is the pointer: the market information is on the
    # pricing page, sourced, and Signet's number for a night comes from
    # checking the date.
    lines += [
        "",
        "## Pricing",
        "",
        f"{BRAND['name']} publishes no price list, no starting prices and no "
        "hourly figures. Actual prices vary by date, size, hours and location. "
        f"{SITE_URL}/pricing/ sets out what live music costs in this market, "
        "with each figure attributed to the public source it came from, so a "
        "budget can be set before anyone writes. To get the number for a "
        f"specific night, send the date: {SITE_URL}/contact/",
        "",
        "Travel beyond the Denver metro, a night's lodging past the passes, "
        "holiday weekends and New Year's Eve are quoted as their own lines "
        "rather than folded into a headline figure.",
        "",
    ]
    (ROOT / "llms.txt").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    posts = collect_blog_posts()
    published = [p for p in posts if not p.get("draft")]
    drafts = [p for p in posts if p.get("draft")]

    built = []
    extra_blocks = {"{{blog_cards}}": blog_cards(published)}
    for page_dir in sorted(PAGES.iterdir()):
        if not page_dir.is_dir() or not (page_dir / "config.json").exists():
            continue
        result = build_page(page_dir, extra_blocks)
        if result:
            built.append(result)
            print(f"  built {result['output']}")

    # Flagship act pages, generated from acts.json. They join `built` so the
    # sitemap and llms.txt pick them up with no separate registration. An act
    # with a `page` field is skipped: an authored page dir owns its URL now.
    for act in FLAGSHIPS:
        if act.get("page"):
            continue
        result = build_act_page(act)
        built.append(result)
        print(f"  built {result['output']}")

    write_redirects()

    for post in published:
        result = build_blog_post(post, published)
        print(f"  built {result['output']}")
    for post in drafts:
        print(f"  skipped {post['dir_name']} (draft: true)")

    write_sitemap(built, published)
    write_llms(built, published)
    write_rss(published)

    unresolved = [k for k, v in BRAND.items() if isinstance(v, str) and PLACEHOLDER.search(v)]
    print(
        f"Done. {len(built)} pages + {len(published)} blog posts "
        "+ sitemap.xml + llms.txt + rss.xml"
    )
    if unresolved:
        print(f"  UNRESOLVED brand values: {', '.join(unresolved)}")
    if not GA_MEASUREMENT_ID:
        print("  NOTE: no GA4 measurement id set — no analytics tag emitted")


def contrast_gate() -> bool:
    """Run scripts/contrast_check.py against the palette.

    Wired into the build so a token edit cannot ship a failing pair silently —
    the way soundbathcalendar caught its border falling to 2.51:1 when the ink
    changed. Prints only on failure; a passing palette stays quiet.
    """
    import subprocess
    r = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "contrast_check.py")],
        capture_output=True, text=True,
    )
    if r.returncode:
        print("\n  CONTRAST GATE FAILED\n")
        print(r.stdout)
    return r.returncode == 0


if __name__ == "__main__":
    if "--lint" in sys.argv:
        sys.exit(0 if lint() else 1)
    main()
    if not contrast_gate():
        sys.exit(1)
