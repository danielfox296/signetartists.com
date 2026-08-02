#!/usr/bin/env python3
"""signetartists.com static site generator.

Same idiom as daniel-fox.com / danielchristopherfox.com / foxlessons.com:
edit `_src/`, run `python3 build.py`, built HTML lands at the repo root.
NEVER edit root *.html by hand — the build overwrites it.

Pure Python stdlib. No dependencies, no npm, no bundler.

Ported from a Next.js 16 app 2026-08-01. The server-action contact form became a
formsubmit.co POST, since GitHub Pages serves static files only.
"""
import html
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "_src"
PAGES = SRC / "pages"
PARTIALS = SRC / "partials"
LAYOUTS = SRC / "layouts"
DATA = SRC / "data"

DATA_FILE = DATA / "site.json"

# Nav keys for active-state highlighting. A page's config.json sets "nav" to one
# of these to mark the matching header link as the current page.
NAV_KEYS = ["music", "pricing", "planners", "corporate", "contact"]

# GA4 measurement id. Empty string => no analytics tag is emitted at all.
# Never ship a half-wired tag.
# Property "Signet Artists", stream signetartists.com (15364913067), created
# 2026-08-01 under the same Analytics account (121066079) as the other properties.
GA_MEASUREMENT_ID = "G-LL5DKVEX29"

site = json.loads(DATA_FILE.read_text(encoding="utf-8"))
BRAND = site["brand"]
SITE_URL = BRAND["url"].rstrip("/")
OG_IMAGE = f"{SITE_URL}/img/og-default.png"

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
    """Home page: size, 2 hrs, 4 hrs. The teaser for the full card."""
    rows = "".join(
        "<tr>"
        f'<td class="rate-size">{esc(r["size"])}</td>'
        f'<td>{money(r["callOut"] + r["hourly"] * 2)}</td>'
        f'<td>{money(r["callOut"] + r["hourly"] * 4)}</td>'
        "</tr>"
        for r in site["rates"]
    )
    return (
        '<div class="table-scroll"><table class="rate-table tnum">'
        "<thead><tr><th>Size</th><th>2 hrs</th><th>4 hrs</th></tr></thead>"
        f"<tbody>{rows}</tbody></table></div>"
    )


def rate_table_full() -> str:
    """Pricing page: the whole card, including the hours below each minimum."""
    rows = []
    for r in site["rates"]:
        cells = "".join(
            f"<td>{'—' if h < r['min'] else money(r['callOut'] + r['hourly'] * h)}</td>"
            for h in (1, 2, 3, 4)
        )
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
    return f'<dl class="def-list def-list--inline">{rows}</dl>'


def faq_list() -> str:
    rows = "".join(
        f'<div class="faq-row"><dt>{esc(f["q"])}</dt><dd>{esc(f["a"])}</dd></div>'
        for f in site["faqs"]
    )
    return f'<dl class="faq-list">{rows}</dl>'


def acts_grid() -> str:
    cards = "".join(
        '<article class="card">'
        f'<h3 class="act-name">{esc(a["name"])}</h3>'
        f'<p class="act-kind">{esc(a["kind"])}</p>'
        f'<p class="act-sizes">{esc(a["sizes"])}</p>'
        f'<p class="act-blurb">{esc(a["blurb"])}</p>'
        "</article>"
        for a in site["acts"]
    )
    return f'<div class="card-grid card-grid--3">{cards}</div>'


def acts_sections(nav_prefix: str = "") -> str:
    """Music page: one alternating band per section, image beside it."""
    out = []
    for i, a in enumerate(site["acts"]):
        sunk = " section--sunk" if i % 2 == 1 else ""
        flip = " split--flip" if i % 2 == 1 else ""
        out.append(
            f'<section class="section section--ruled{sunk}"><div class="wrap">'
            f'<div class="split split--center{flip}">'
            "<div>"
            f'<p class="act-kind">{esc(a["kind"])}</p>'
            f'<h2 class="h2 act-heading">{esc(a["name"])}</h2>'
            f'<p class="act-sizes">{esc(a["sizes"])}</p>'
            f'<p class="prose">{esc(a["blurb"])}</p>'
            "</div>"
            f'<img class="media" src="{nav_prefix}img/{esc(a["img"])}" '
            f'alt="{esc(a["alt"])}" width="1600" height="900" loading="lazy" decoding="async">'
            "</div></div></section>"
        )
    return "".join(out)


def event_types() -> str:
    items = "".join(f"<li>{esc(t)}</li>" for t in site["eventTypes"])
    return f'<ul class="tag-list">{items}</ul>'


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
            for r in site["rates"]
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


SCHEMAS = {"organization": organization_schema, "faq": faq_schema}


def build_schema(cfg: dict) -> str:
    key = cfg.get("schema")
    if not key or key not in SCHEMAS:
        return ""
    payload = SCHEMAS[key]()
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


def build_page(page_dir: pathlib.Path) -> dict | None:
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

    base = read(LAYOUTS / "base.html")
    header = partial("header")
    footer = partial("footer")

    active = cfg.get("nav", "")
    for key in NAV_KEYS:
        marker = 'aria-current="page"' if key == active else ""
        header = header.replace("{{nav_" + key + "}}", marker)

    title = cfg["title"]
    full_title = title if cfg.get("title_exact") else f"{title} — {BRAND['name']}"

    # Blocks first: a section can contain {{rate_table_full}}, and the brand
    # tokens inside generated markup still need resolving afterwards.
    blocks = {
        "{{rate_table_summary}}": rate_table_summary(),
        "{{rate_table_full}}": rate_table_full(),
        "{{included_list}}": included_list(),
        "{{included_list_columns}}": included_list_columns(),
        "{{extras_list}}": extras_list(),
        "{{faq_list}}": faq_list(),
        "{{acts_grid}}": acts_grid(),
        "{{acts_sections}}": acts_sections(nav_prefix),
        "{{event_types}}": event_types(),
    }
    for token, value in blocks.items():
        content = content.replace(token, value)

    replacements = {
        "{{title}}": esc(full_title),
        "{{meta_description}}": esc(cfg.get("meta_description", "")),
        "{{canonical}}": canonical_for(output),
        "{{og_type}}": cfg.get("og_type", "website"),
        "{{og_image}}": OG_IMAGE,
        "{{robots}}": cfg.get("robots", "index, follow"),
        "{{schema}}": build_schema(cfg),
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

    out_path = ROOT / output
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(out_html, encoding="utf-8")
    return {"output": output, "cfg": cfg}


def write_sitemap(pages: list[dict]) -> None:
    urls = []
    for page in pages:
        if page["cfg"].get("robots", "").startswith("noindex"):
            continue
        urls.append(f"  <url><loc>{html.escape(canonical_for(page['output']))}</loc></url>")
    sitemap = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(urls)
        + "\n</urlset>\n"
    )
    (ROOT / "sitemap.xml").write_text(sitemap, encoding="utf-8")


def write_llms(pages: list[dict]) -> None:
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
    lines += ["", "## Rates", ""]
    for r in site["rates"]:
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
    built = []
    for page_dir in sorted(PAGES.iterdir()):
        if not page_dir.is_dir() or not (page_dir / "config.json").exists():
            continue
        result = build_page(page_dir)
        if result:
            built.append(result)
            print(f"  built {result['output']}")
    write_sitemap(built)
    write_llms(built)
    unresolved = [k for k, v in BRAND.items() if isinstance(v, str) and PLACEHOLDER.search(v)]
    print(f"Done. {len(built)} pages + sitemap.xml + llms.txt")
    if unresolved:
        print(f"  UNRESOLVED brand values: {', '.join(unresolved)}")
    if not GA_MEASUREMENT_ID:
        print("  NOTE: no GA4 measurement id set — no analytics tag emitted")


if __name__ == "__main__":
    main()
