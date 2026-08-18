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
NAV_KEYS = ["music", "repertoire", "pricing", "planners", "corporate", "contact"]

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
# pages: act pages, roster cards, the filter UI, per-act Offer schema and
# llms.txt all render from _src/data/acts.json. Prices live only on the rate
# card and are looked up by config id, so an act page and the pricing page
# cannot drift apart.
ACTS_FILE = DATA / "acts.json"
roster = json.loads(ACTS_FILE.read_text(encoding="utf-8"))
ACTS = roster["acts"]
RATE_CARD = roster["rateCard"]
RATE_BY_ID = {r["id"]: r for r in RATE_CARD}
BUCKETS = roster["buckets"]
BUCKET_LABEL = {b["id"]: b["label"] for b in BUCKETS}
FLAGSHIPS = [a for a in ACTS if a["status"] == "flagship"]
# Q4 2026 refocus: the product is solo through quartet. A `byRequest` row is a
# real rate we still hold and quote, held out of every sold surface: the hourly
# table (and so the quote engine's ensemble picker, which is built from it),
# makesOffer, and llms.txt's hourly build. On the rate card itself the
# by-request rows stay visible under a divider, because publishing the card is
# the differentiator and a number we hold is cheaper to print than to hide.
SOLD_RATES = [r for r in site["rates"] if not r.get("byRequest")]
SOLD_CONFIGS = [r for r in RATE_CARD if not r.get("byRequest")]
BYREQUEST_CONFIGS = [r for r in RATE_CARD if r.get("byRequest")]
LISTINGS = [a for a in ACTS if a["status"] == "listing"]
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


def rate_table_summary() -> str:
    """Home page: size, 2 hrs, 4 hrs. The teaser for the full card.

    The 4-hour column carries the brass accent (WEBSITE-PLAN §6.3): it is the
    number the organization schema and llms.txt publish. Safe for quote.js,
    which reads cells by textContent and ignores attributes.
    """
    rows = "".join(
        "<tr>"
        f'<td class="rate-size">{esc(r["size"])}</td>'
        f'<td>{money(r["callOut"] + r["hourly"] * 2)}</td>'
        f'<td class="num-accent">{money(r["callOut"] + r["hourly"] * 4)}</td>'
        "</tr>"
        for r in SOLD_RATES
    )
    return (
        '<div class="table-scroll"><table class="rate-table tnum">'
        "<thead><tr><th>Size</th><th>2 hrs</th><th>4 hrs</th></tr></thead>"
        f"<tbody>{rows}</tbody></table></div>"
    )


def rate_table_full() -> str:
    """Pricing page: the whole card, including the hours below each minimum."""
    rows = []
    for r in SOLD_RATES:
        # The 4-hour totals get the brass .num-accent, same as the summary
        # table. Every published minimum is <= 2, so the accented cell is
        # always a real figure, never the em-dash.
        cells = []
        for h in (1, 2, 3, 4):
            cls = ' class="num-accent"' if h == 4 else ""
            value = "—" if h < r["min"] else money(r["callOut"] + r["hourly"] * h)
            cells.append(f"<td{cls}>{value}</td>")
        cells = "".join(cells)
        rows.append(
            "<tr>"
            f'<td class="rate-size">{esc(r["size"])}</td>'
            f'<td>{money(r["callOut"])}</td>'
            f'<td>{money(r["hourly"])}</td>'
            f"{cells}</tr>"
        )
    head = "".join(
        f"<th>{h}</th>"
        for h in ("Size", "Call-out", "Per hour", "1 hr", "2 hrs", "3 hrs", "4 hrs")
    )
    return (
        '<div class="table-scroll"><table class="rate-table rate-table--full tnum">'
        f"<thead><tr>{head}</tr></thead>"
        f'<tbody>{"".join(rows)}</tbody></table></div>'
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
    rows = "".join(
        f'<div class="def-row"><dt>{esc(e["item"])}</dt>'
        f'<dd class="tnum">{esc(e["rate"])}</dd></div>'
        for e in site["extras"]
    )
    return f'<dl class="def-list">{rows}</dl>'


def faq_list() -> str:
    rows = "".join(
        f'<div class="faq-row"><dt>{esc(f["q"])}</dt><dd>{esc(f["a"])}</dd></div>'
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
        'Eight of a few hundred. The whole book, and the six sets a night gets '
        'built from, are on the <a href="{{nav_prefix}}repertoire/">songs page</a>.'
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
    items = "".join(f"<li>{esc(t)}</li>" for t in site["eventTypes"])
    return f'<ul class="tag-list">{items}</ul>'


# ----------------------------------------------------------------- the roster
# En dashes in numeric ranges only. They are a data separator, the same
# accepted exemption as the title separator; the em-dash ban is on prose.


def rng(pair: list) -> str:
    return f"{money(pair[0])}–{pair[1]:,}"


def rate_of(config_id: str) -> dict:
    return RATE_BY_ID[config_id]


def act_url(act: dict, nav_prefix: str = "") -> str:
    return f"{nav_prefix}{ACTS_BASE}/{act['id']}/"


def act_from_price(act: dict) -> int:
    """The published floor for an act: the bottom of its smallest config,
    Denver column. Every surface an act appears on shows this number."""
    return rate_of(act["from"])["denver"][0]


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


def rate_card_table() -> str:
    """The published rate card. THE differentiator: almost no Colorado
    competitor publishes one, so this table is static HTML on a crawlable
    page and never rendered by script."""
    def row(r):
        note = f'<span class="rate-note">{esc(r["note"])}</span>' if r.get("note") else ""
        return (
            "<tr>"
            f'<th scope="row" class="rate-size">{esc(r["label"])}{note}</th>'
            f'<td class="num-accent">{rng(r["denver"])}</td>'
            f'<td>{rng(r["resort"])}</td>'
            "</tr>"
        )

    rows = [row(r) for r in SOLD_CONFIGS]
    if BYREQUEST_CONFIGS:
        rows.append(
            '<tr class="rate-row--divider"><th colspan="3" scope="colgroup">'
            "Larger configurations, by request</th></tr>"
        )
        rows += [row(r) for r in BYREQUEST_CONFIGS]
    return (
        '<div class="table-scroll"><table class="rate-table rate-card tnum">'
        "<thead><tr><th>Configuration</th><th>Denver metro</th>"
        "<th>Mountain and resort</th></tr></thead>"
        f'<tbody>{"".join(rows)}</tbody></table></div>'
    )


def act_card(act: dict, nav_prefix: str = "") -> str:
    """One roster card. Carries its own filter state in data attributes so
    the filter UI is a class toggle and never a re-render."""
    flagship = act["status"] == "flagship"
    buckets = " ".join(act["bucket_tags"])
    configs = " ".join(act["config_tags"])
    price = act_from_price(act)
    tags = "".join(
        f'<li class="pill">{esc(BUCKET_LABEL[b])}</li>' for b in act["bucket_tags"]
    )
    cta = (
        f'<a class="act-card-link" href="{act_url(act, nav_prefix)}">'
        f'See {esc(act["name"])}</a>'
        if flagship
        else f'<a class="act-card-link" href="{nav_prefix}contact/?act={esc(act["id"])}">Inquire</a>'
    )
    return (
        f'<article class="card act-card" data-buckets="{esc(buckets)}" '
        f'data-configs="{esc(configs)}" data-price="{price}" '
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
        f'<dt>From</dt><dd class="num-accent">{money(price)}</dd>'
        "</dl>"
        f"{cta}"
        "</article>"
    )


def act_card_media(act: dict, nav_prefix: str = "") -> str:
    """The top of a roster card. `video` is null on every act until the shoot
    lands; the still holds the slot until it is a URL, and setting that one
    field in acts.json turns the card into an embed everywhere the card
    renders. No marker prints here, unlike the act page: this is the surface a
    planner is being sold on, and a card that announces its own gap sells
    nothing."""
    if act.get("video"):
        return (
            '<div class="act-card-video">'
            f'<iframe src="{esc(act["video"])}" '
            f'title="{esc(act["name"])} performing" loading="lazy" '
            'allow="accelerometer; autoplay; clipboard-write; encrypted-media; '
            'picture-in-picture" allowfullscreen></iframe></div>'
        )
    return (
        f'<img class="act-card-img" src="{nav_prefix}img/{esc(act["img"])}" '
        f'alt="{esc(act["alt"])}" width="1600" height="900" loading="lazy" '
        'decoding="async">'
    )


def roster_filters() -> str:
    """Filter by bucket, config size and price. Rendered as real controls in
    static HTML: with script off every act is visible and nothing is lost."""
    bucket_opts = "".join(
        f'<option value="{esc(b["id"])}">{esc(b["label"])}</option>' for b in BUCKETS
    )
    # Derived from the roster, not the rate card: a size nothing is tagged with
    # is a filter that can only ever return the empty state.
    in_use = {c for a in ACTS for c in a["config_tags"]}
    config_opts = "".join(
        f'<option value="{esc(r["id"])}">{esc(r["label"])}</option>'
        for r in RATE_CARD if r["id"] in in_use
    )
    price_opts = "".join(
        f'<option value="{v}">{label}</option>'
        for v, label in [
            (1500, "Under $1,500"),
            (2800, "Under $2,800"),
            (4000, "Under $4,000"),
            (6000, "Under $6,000"),
        ]
    )
    return (
        '<form class="roster-filters" id="roster-filters" hidden>'
        '<div class="filter-field"><label for="filter-bucket">Kind of night</label>'
        '<select id="filter-bucket" name="bucket">'
        f'<option value="">Any</option>{bucket_opts}</select></div>'
        '<div class="filter-field"><label for="filter-config">Size</label>'
        '<select id="filter-config" name="config">'
        f'<option value="">Any</option>{config_opts}</select></div>'
        '<div class="filter-field"><label for="filter-price">Starting price</label>'
        '<select id="filter-price" name="price">'
        f'<option value="">Any</option>{price_opts}</select></div>'
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


def season_board() -> str:
    cells = []
    for d in SEASON["dates"]:
        dt = datetime.datetime.strptime(d["date"], "%Y-%m-%d")
        label = f'{dt.strftime("%a")} {dt.strftime("%b")} {dt.day}'
        classes = f'season-date season-date--{d["status"]}'
        if d.get("peak"):
            classes += " season-date--peak"
        tail = ""
        if d.get("note"):
            tail = f'<span class="season-tag">{esc(d["note"])}</span>'
        elif d.get("peak"):
            tail = '<span class="season-tag">Goes first</span>'
        word = {"open": "Open", "held": "On hold", "booked": "Booked"}[d["status"]]
        cells.append(
            f'<li class="{classes}"><span class="season-day">{esc(label)}</span>'
            f'<span class="season-status">{word}</span>{tail}</li>'
        )
    open_count = sum(1 for d in SEASON["dates"] if d["status"] == "open")
    updated = datetime.datetime.strptime(SEASON["updated"], "%Y-%m-%d")
    return (
        f'<ul class="season-board">{"".join(cells)}</ul>'
        f'<p class="note"><strong class="num-accent">{open_count}</strong> of '
        f'{len(SEASON["dates"])} party dates still open. Board last checked '
        f'{updated.strftime("%-d %B %Y")}. A date is only held once a contract '
        "and a deposit land, so an open date here is genuinely open.</p>"
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
            '<dl class="act-facts"><dt>Denver</dt>'
            f'<dd class="num-accent">{rng(r["denver"])}</dd>'
            f'<dt>Resort</dt><dd>{rng(r["resort"])}</dd></dl>'
            f'<a class="act-card-link" href="{nav_prefix}contact/?act={esc(act["id"])}">'
            "Check a date</a>"
            "</article>"
        )
    return f'<div class="card-grid card-grid--3">{"".join(cards)}</div>'


def corporate_shapes(nav_prefix: str = "") -> str:
    """The three shapes a corporate enquiry arrives as, on /corporate/. Same
    contract as season_leads: the occasion is copy, but the act name and both
    price columns resolve out of acts.json and the rate card, so this block
    cannot quote a size the pricing page has stopped publishing."""
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
            '<dl class="act-facts"><dt>Denver</dt>'
            f'<dd class="num-accent">{rng(r["denver"])}</dd>'
            f'<dt>Resort</dt><dd>{rng(r["resort"])}</dd></dl>'
            f'<a class="act-card-link" href="{nav_prefix}contact/?act={esc(act["id"])}">'
            "Check a date</a>"
            "</article>"
        )
    return f'<div class="card-grid card-grid--3">{"".join(cards)}</div>'


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
        # Published rates, so answer engines can quote real numbers rather than
        # the directory averages that currently own the cost queries.
        "makesOffer": [
            {
                "@type": "Offer",
                "name": f"{r['size']} — 4 hours",
                "price": str(r["callOut"] + r["hourly"] * 4),
                "priceCurrency": "USD",
            }
            for r in SOLD_RATES
        ],
    }


def faq_schema() -> dict:
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": f["q"],
                "acceptedAnswer": {"@type": "Answer", "text": f["a"]},
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
    """Every settled question, pricing set included, as one FAQPage.

    Entries flagged "open" are deliberately excluded: they are our best guess
    at a policy nobody has decided, and a guess does not belong in structured
    data that search engines quote back as fact.
    """
    entries = list(site["faqs"])
    for group in site["plannerFaqs"]:
        entries += [f for f in group["items"] if not f.get("open")]
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": f["q"],
                "acceptedAnswer": {"@type": "Answer", "text": f["a"]},
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
    return {
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


def act_offers(act: dict) -> list:
    """One Offer per act config per column. The prices are the published rate
    card, so structured data and the visible table are the same numbers."""
    offers = []
    for cid in act["config_tags"]:
        r = rate_of(cid)
        for col, area in (("denver", "Denver, CO"), ("resort", "Colorado mountain resorts")):
            offers.append({
                "@type": "Offer",
                "name": f"{act['name']} — {r['label']}, {area}",
                "priceCurrency": "USD",
                "priceSpecification": {
                    "@type": "PriceSpecification",
                    "minPrice": r[col][0],
                    "maxPrice": r[col][1],
                    "priceCurrency": "USD",
                },
                "areaServed": area,
                "availability": "https://schema.org/InStock",
            })
    return offers


def act_service_node(act: dict) -> dict:
    return {
        "@type": "Service",
        "@id": f"{SITE_URL}/{ACTS_BASE}/{act['id']}/#service",
        "name": act["name"],
        "serviceType": f"{act['style']} for private events",
        "description": act["blurb"],
        "provider": {"@id": f"{SITE_URL}/#business"},
        "areaServed": [{"@type": "Place", "name": n} for n in SERVICE_AREAS],
        "offers": act_offers(act),
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
    """The pricing page carries the most structured data on the site, on
    purpose. It is the page whose whole job is to be crawled with numbers in
    it: the business, every act as a Service with priced Offers per
    configuration, and the pricing FAQ."""
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
                    "acceptedAnswer": {"@type": "Answer", "text": f["a"]},
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
        "{{gl_per_occurrence}}": val(site["insurance"]["perOccurrence"]),
        "{{gl_aggregate}}": val(site["insurance"]["aggregate"]),
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

    # Blocks first: a section can contain {{rate_table_full}}, and the brand
    # tokens inside generated markup still need resolving afterwards.
    blocks = {
        "{{rate_table_summary}}": rate_table_summary(),
        "{{rate_table_full}}": rate_table_full(),
        "{{included_list}}": included_list(),
        "{{included_list_columns}}": included_list_columns(),
        "{{extras_list}}": extras_list(),
        "{{faq_list}}": faq_list(),
        "{{planner_faq_list}}": planner_faq_list(),
        "{{cover_strip}}": cover_strip(),
        "{{stage_plot}}": stage_plot(),
        "{{stage_table}}": stage_table(),
        "{{power_table}}": power_table(),
        "{{loadin_table}}": loadin_table(),
        "{{event_types}}": event_types(),
        "{{rate_card_table}}": rate_card_table(),
        "{{roster_filters}}": roster_filters(),
        "{{roster_grid}}": roster_grid(nav_prefix),
        "{{roster_grid_flagships}}": roster_grid_flagships(nav_prefix),
        "{{corporate_shapes}}": corporate_shapes(nav_prefix),
        "{{act_picker}}": act_picker(),
        "{{act_count}}": str(len(ACTS)),
        "{{act_count_word}}": act_count_word(),
        "{{season_board}}": season_board(),
        "{{season_leads}}": season_leads(nav_prefix),
    }
    blocks.update(extra_blocks or {})
    for token, value in blocks.items():
        content = content.replace(token, value)

    render_page(
        output=output,
        content=content,
        title=cfg["title"],
        title_exact=bool(cfg.get("title_exact")),
        meta_description=cfg.get("meta_description", ""),
        og_type=cfg.get("og_type", "website"),
        robots=cfg.get("robots", "index, follow"),
        schema_html=build_schema(cfg),
        nav_active=cfg.get("nav", ""),
        nav_prefix=nav_prefix,
    )
    return {"output": output, "cfg": cfg}


# -------------------------------------------------------------- act pages
# Flagship pages are generated from acts.json, not authored as page dirs.
# Adding a flagship is a status flip in the data file, never a new template.


def act_hero(act: dict) -> str:
    """Hero with the video slot. `video` is null until footage exists, and the
    slot renders as a marked placeholder rather than being omitted, so the
    gap is visible on the page instead of only in a backlog."""
    price = money(act_from_price(act))
    if act.get("video"):
        media = (
            '<div class="act-video"><iframe src="' + esc(act["video"]) + '" '
            f'title="{esc(act["name"])} performing" loading="lazy" '
            'allow="accelerometer; autoplay; clipboard-write; encrypted-media; '
            'picture-in-picture" allowfullscreen></iframe></div>'
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
        f'<p class="act-from">From <span class="num-accent">{price}</span> in Denver. '
        f'Every configuration is priced below.</p>'
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
    """The configuration ladder. Every rung carries both columns of the rate
    card, pulled by config id, so this table cannot disagree with /pricing/."""
    rows = []
    for rung in act["ladder"]:
        r = rate_of(rung["config"])
        rows.append(
            "<tr>"
            f'<th scope="row" class="rate-size">{esc(r["label"])}'
            f'<span class="rate-note">{esc(rung["build"])}</span></th>'
            f'<td class="ladder-best">{esc(rung["bestFor"])}</td>'
            f'<td class="num-accent">{rng(r["denver"])}</td>'
            f'<td>{rng(r["resort"])}</td>'
            "</tr>"
        )
    hourly = ""
    if any(rate_of(x["config"]).get("hourly") for x in act["ladder"]):
        h = next(rate_of(x["config"])["hourly"] for x in act["ladder"]
                 if rate_of(x["config"]).get("hourly"))
        hourly = f'<p class="note">A single hour on its own is {money(h)}.</p>'
    return (
        '<section class="section section--ruled section--sunk" id="configurations">'
        '<div class="wrap"><h2 class="h3">Configurations</h2>'
        '<p class="note">Starting prices. Mountain and resort dates add travel and '
        "lodging, which is why they carry their own column.</p>"
        '<div class="table-scroll"><table class="rate-table tnum">'
        "<thead><tr><th>Size</th><th>Where it lands</th><th>Denver metro</th>"
        "<th>Mountain and resort</th></tr></thead>"
        f'<tbody>{"".join(rows)}</tbody></table></div>'
        f"{hourly}"
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
        more = ('<p class="note"><a href="../../repertoire/">The whole song book</a> '
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
        '<p class="prose">Prices on this page are what you pay. Travel outside the '
        "metro, holiday weekends and New Year's Eve are quoted as their own lines "
        'on the contract, and all three are published on the '
        '<a href="../../pricing/">pricing page</a>.</p>'
        '<a class="btn" href="../../contact/?act=' + esc(act["id"]) + '">Check a date</a>'
        "</div></section>"
    )


def build_act_page(act: dict) -> dict:
    output = f"{ACTS_BASE}/{act['id']}/index.html"
    content = "".join([
        act_hero(act),
        act_identity(act),
        act_ladder(act),
        act_setlist(act),
        act_cta(act),
    ])
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
    return {"output": output, "cfg": cfg}


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


def blog_cards(published: list) -> str:
    """Blog index listing: one row per published post, newest first, or the
    quiet empty state until the first post ships."""
    if not published:
        return (
            '<p class="prose">The first entry is on its way.</p>\n'
            '<p class="note">There is an <a href="../rss.xml">RSS feed</a> '
            "if you would rather subscribe than check back.</p>"
        )
    sep = '<span class="blog-row-sep" aria-hidden="true">&middot;</span>'
    rows = []
    for p in published:
        meta = sep.join(
            [
                f'<span class="blog-row-eyebrow">{esc(p.get("eyebrow", ""))}</span>',
                f'<time datetime="{esc(p["date"])}">{esc(p["date_display"])}</time>',
                f"<span>{p['reading_time']} min read</span>",
            ]
        )
        rows.append(
            f'<a class="blog-row" href="{esc(p["slug"])}/">'
            f'<p class="blog-row-meta">{meta}</p>'
            f'<h2 class="blog-row-title">{esc(p["title"])}</h2>'
            f'<p class="blog-row-dek">{esc(p.get("dek", ""))}</p>'
            "</a>"
        )
    return f'<div class="blog-list">{"".join(rows)}</div>'


def build_blog_post(post: dict, published: list) -> dict:
    """Render one published post to blog/<slug>/index.html."""
    br, env = ensure_blog_renderer()
    try:
        content, data = br.render_post(post["post_dir"], env, published)
    except ValueError as exc:
        raise SystemExit(f"  {post['dir_name']}: {exc}")

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


def write_sitemap(pages: list[dict], posts: list[dict] = None) -> None:
    urls = []
    for page in pages:
        if page["cfg"].get("robots", "").startswith("noindex"):
            continue
        urls.append(f"  <url><loc>{html.escape(canonical_for(page['output']))}</loc></url>")
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
        f"{BRAND['serviceArea']}. Rates are published rather than quoted on request; "
        "the full card is on the pricing page.",
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
        where = f"{SITE_URL}/{ACTS_BASE}/{a['id']}/" if a["status"] == "flagship" \
            else f"{SITE_URL}/{ACTS_BASE}/"
        lines.append(
            f"- {a['name']} ({a['style']}, {act_byline_inline(a)}): "
            f"{a['blurb']} Configurations: {act_config_range(a)}. "
            f"From {money(act_from_price(a))} in Denver. {where}"
        )

    lines += ["", "## Rate card", "",
              "Starting prices by configuration. Denver metro, then mountain "
              "and resort, which adds travel and lodging.", ""]
    for r in SOLD_CONFIGS:
        lines.append(
            f"- {r['label']}: Denver {rng(r['denver'])}, "
            f"mountain and resort {rng(r['resort'])}."
        )
    for r in BYREQUEST_CONFIGS:
        lines.append(
            f"- {r['label']} (by request, not a standard booking): "
            f"Denver {rng(r['denver'])}, mountain and resort {rng(r['resort'])}."
        )

    lines += ["", "## Hourly build (Denver metro)", ""]
    for r in SOLD_RATES:
        four = money(r["callOut"] + r["hourly"] * 4)
        lines.append(
            f"- {r['size']}: {money(r['callOut'])} call-out + "
            f"{money(r['hourly'])}/hour. Four hours = {four}."
        )
    lines += [
        "",
        "Price = call-out + (hours x hourly rate). There is no overtime rate. "
        "Adding a smaller group to an existing booking bills at the hourly rate "
        "only, with no second call-out.",
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
    # sitemap and llms.txt pick them up with no separate registration.
    for act in FLAGSHIPS:
        result = build_act_page(act)
        built.append(result)
        print(f"  built {result['output']}")

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
