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


SCHEMAS = {"organization": organization_schema, "faq": faq_schema}


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
        "{{acts_grid}}": acts_grid(),
        "{{acts_sections}}": acts_sections(nav_prefix),
        "{{event_types}}": event_types(),
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


if __name__ == "__main__":
    if "--lint" in sys.argv:
        sys.exit(0 if lint() else 1)
    main()
