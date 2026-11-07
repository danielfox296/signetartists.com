#!/usr/bin/env python3
"""Convert today's site sources into content/, the files the new build reads.

Run from the repo root:  python3 site/scripts/convert.py

Re-runnable: it rewrites content/ from _src/ every time, so it can run again
at cutover and carry over every edit made to _src/ in the meantime.

How a page is converted. build.py itself is imported (never changed) and run
into a scratch folder, with each section file marked, so the converter knows
the exact HTML every section file ends up as on the live site, tokens
resolved. Each top-level element of that HTML is read into a typed section
(sections.py), rendered back through the React components, and compared with
the original DOM. Where the two differ, the element is kept as a Custom HTML
section, so the converted page always renders exactly as it does today.
"""
import hashlib
import html as htmlmod
import importlib.util
import io
import json
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
from contextlib import redirect_stdout
from html.parser import HTMLParser

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import domdiff  # noqa: E402
import sections as S  # noqa: E402

ROOT = pathlib.Path.cwd().resolve()
if not (ROOT / "build.py").exists():
    raise SystemExit("Run from the repo root (the folder with build.py).")
SRC = ROOT / "_src"
OUT = ROOT / "content"
SITE_DIR = HERE.parent


def load_build():
    spec = importlib.util.spec_from_file_location("signet_build_py", ROOT / "build.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["signet_build_py"] = mod
    spec.loader.exec_module(mod)
    return mod


B = load_build()
B.ensure_blog_renderer()
BR, JENV = B._blog
MARK_A, MARK_B, MARK_END = "", "", ""


# ------------------------------------------------- build.py, run and marked


class MemPath(type(pathlib.Path())):
    """The repo root as build.py sees it during conversion: reads go to disk,
    writes stay in memory, so running build.py changes no file."""
    store = {}

    def write_text(self, data, encoding=None, errors=None, newline=None):
        MemPath.store[str(self)] = data
        return len(data)

    def mkdir(self, *a, **k):
        pass

    def read_text(self, encoding=None, errors=None):
        s = MemPath.store.get(str(self))
        return s if s is not None else super().read_text(encoding=encoding, errors=errors)


def run_old_build():
    """Run build.py's main() in memory with every section file wrapped in
    markers. Returns {output: html} and the render_page calls."""
    real_read, real_render = B.read, B.render_page
    calls = {}

    def read(path):
        t = real_read(path)
        if path.suffix == ".html" and path.parent.name == "sections":
            return f"{MARK_A}{path.parent.parent.name}/{path.name}{MARK_B}{t}{MARK_END}"
        return t

    def render_page(**kw):
        calls[kw["output"]] = kw
        return real_render(**kw)

    MemPath.store.clear()
    B.read, B.render_page, B.ROOT = read, render_page, MemPath(ROOT)
    try:
        with redirect_stdout(io.StringIO()):
            B.main()
    finally:
        B.read, B.render_page, B.ROOT = real_read, real_render, ROOT
    pages = {o: MemPath.store[str(ROOT / o)] for o in calls}
    return pages, calls


def marked_sections(page_html):
    """[(file, html)] for each section file, as the live page has it."""
    out = []
    for m in re.finditer(f"{MARK_A}([^{MARK_B}]+){MARK_B}(.*?){MARK_END}", page_html, re.S):
        out.append((m.group(1), m.group(2)))
    return out


# --------------------------------------------------------- top-level nodes


VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}


class _Top(HTMLParser):
    """Finds where each top-level element starts and ends in a string. An
    end tag closes everything opened inside its element, as a browser does,
    so a missing </div> cannot swallow the next section."""

    def __init__(self, text):
        super().__init__(convert_charrefs=False)
        self.text = text
        self.lines = [0]
        for m in re.finditer("\n", text):
            self.lines.append(m.end())
        self.stack = []
        self.spans = []
        self.start = None

    def off(self):
        line, col = self.getpos()
        return self.lines[line - 1] + col

    def handle_starttag(self, tag, attrs):
        if not self.stack:
            self.start = self.off()
        if tag in VOID:
            if not self.stack:
                self.spans.append((self.start, self.off() + len(self.get_starttag_text())))
            return
        self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        if not self.stack:
            self.spans.append((self.off(), self.off() + len(self.get_starttag_text())))

    def handle_endtag(self, tag):
        if tag in VOID or tag not in self.stack:
            return
        while self.stack.pop() != tag:
            pass
        if not self.stack:
            end = self.text.index(">", self.off()) + 1
            self.spans.append((self.start, end))


def top_nodes(text):
    """Split HTML into its top-level pieces, exactly as written. Loose text
    between elements is kept as its own piece when it is not whitespace."""
    p = _Top(text)
    p.feed(text)
    p.close()
    pieces, pos = [], 0
    for a, b in p.spans:
        if text[pos:a].strip():
            pieces.append(text[pos:a])
        pieces.append(text[a:b])
        pos = b
    if text[pos:].strip():
        pieces.append(text[pos:])
    return pieces


# ------------------------------------------------------------------ links


def to_root(html, prefix, url):
    """Links as the page writes them ("../contact/") become links from the
    site root ("/contact/"), so a section reads the same at any depth."""

    def fix(m):
        attr, val = m.group(1), m.group(2)
        if not val or re.match(r"^(?:[a-z][a-z0-9+.-]*:|#|/|\?)", val, re.I):
            return m.group(0)
        # Only a link in the page's own prefix form ("../../" + a path from
        # the root) is the site's {{nav_prefix}} link. One written relative
        # to the page itself ("../faq/") keeps its exact text.
        if not val.startswith(prefix) or val[len(prefix):].startswith(("../", "./")):
            return m.group(0)
        return f'{attr}="{resolve(url, val)}"'

    return re.sub(r'(\s(?:href|src|poster))="([^"]*)"', fix, html)


def resolve(base, rel):
    """URL path resolution, as a browser does it for a relative link."""
    from urllib.parse import urljoin
    return urljoin("https://h" + base, rel)[len("https://h"):]


def unfocus(html):
    """Take out the crop points build.py writes into <img> styles. They belong
    to the photo (photo-focus.json) and the new build writes them again."""

    def one(m):
        tag = m.group(0)
        src = re.search(r'\ssrc="([^"]*)"', tag)
        if not src:
            return tag
        path = re.sub(r"^(?:\.\./)+|^/", "", src.group(1).split("?")[0].split("#")[0])
        if path not in B.PHOTO_FOCUS:
            return tag
        st = re.search(r'\sstyle="([^"]*)"', tag)
        if not st:
            return tag
        kept = "; ".join(d.strip() for d in st.group(1).split(";") if d.strip() and not d.strip().lower().startswith("object-position"))
        repl = f' style="{kept};"' if kept else ""
        return tag[:st.start()] + repl + tag[st.end():]

    return re.sub(r"<img\b[^>]*>", one, html, flags=re.I)


def strip_comments_notes(text):
    notes = [c.strip() for c in re.findall(r"<!--(.*?)-->", text, re.S)]
    return "\n\n".join(n for n in notes if n)


# ------------------------------------------------------------------ helpers


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def notes_of(d):
    return {k: v for k, v in d.items() if k.startswith("_")}


# ------------------------------------------------------------ shared parts


def header_data():
    from lxml import html as LH
    t = B.COMMENT.sub("", B.partial("header"))
    doc = LH.fromstring(f"<div>{t}</div>")

    # The nav_* tokens sit where an attribute would, so lxml drops them;
    # they are read from the partial's own text, link by link.
    raw_tags = {cls: re.findall(r"<a\b[^>]*>", re.search(r'<nav class="' + cls + r'".*?</nav>', t, re.S).group(0))
                for cls in ("nav-desktop", "nav-mobile")}

    def links(xp):
        out = []
        cls = "nav-desktop" if "nav-desktop" in xp else "nav-mobile"
        for a, raw in zip(doc.xpath(xp), raw_tags[cls]):
            key = re.search(r"\{\{nav_(?!prefix)([a-z]+)\}\}", raw)
            item = {"label": a.text_content().strip(), "href": a.get("href").replace("{{nav_prefix}}", "/")}
            if a.get("class"):
                item["cls"] = a.get("class")
            if key:
                item["key"] = key.group(1)
            out.append(item)
        return out

    return {
        "tagline": doc.xpath("//p[contains(@class,'header-loc')]")[0].text_content().strip(),
        "nav": links("//nav[contains(@class,'nav-desktop')]/a"),
        "navMobile": links("//nav[contains(@class,'nav-mobile')]/a"),
    }


def footer_data():
    from lxml import html as LH
    t = B.COMMENT.sub("", B.partial("footer")).replace("{{brand_name}}", B.BRAND["name"])
    doc = LH.fromstring(t)

    def link(a):
        item = {"label": a.text_content().strip(), "href": a.get("href").replace("{{nav_prefix}}", "/")}
        for k in ("class", "rel"):
            if a.get(k):
                item["cls" if k == "class" else k] = a.get(k)
        return item

    return {
        "line": doc.xpath("//p[contains(@class,'footer-line')]")[0].text_content().strip(),
        "links": [link(a) for a in doc.xpath("//div[contains(@class,'footer-contact')]/a") if "footer-email" not in (a.get("class") or "")],
        "columns": [
            {"title": c.xpath("./p")[0].text_content().strip(), "links": [link(a) for a in c.xpath(".//a")]}
            for c in doc.xpath("//div[contains(@class,'footer-col')]")
        ],
        "baseLinks": [link(a) for a in doc.xpath("//ul[contains(@class,'footer-base-links')]//a")],
        "meta": [{"cls": p.get("class"), "text": p.text_content().strip()} for p in doc.xpath("//div[contains(@class,'footer-base-meta')]/p")],
    }


def site_data(blog_cfg):
    base = B.read(B.LAYOUTS / "base.html")
    css_v = re.search(r"styles\.css\?v=([^\"]+)\"", base).group(1)
    theme = re.search(r'name="theme-color" content="([^"]+)"', base).group(1)
    node = B.local_business_node()
    s = B.site
    return {
        "brand": B.BRAND,
        "gaId": B.GA_MEASUREMENT_ID,
        "cssVersion": css_v,
        "themeColor": theme,
        "business": {
            "priceRange": node["priceRange"],
            "images": [u[len(B.SITE_URL) + 1:] for u in node["image"]],
            "founder": node["founder"],
            "knowsAbout": node["knowsAbout"],
        },
        "breadcrumbParents": B.BREADCRUMB_PARENTS,
        "lists": {"included": s["included"], "extras": [e["item"] for e in s["extras"]]},
        "llms": {
            "about": "{name} is a live music company for private events in {serviceArea}. No prices are published. What the pricing page carries is what live music costs in this market, each figure with the source it came from, and Signet prices a specific night when the date is sent.",
            "videos": "Each clip the roster plays has its own page. {site}/video/ lists them all by act, and so does {site}/video-sitemap.xml.",
            "actsNote": "All acts and configurations are subject to availability.",
            "pricing": [
                "{name} publishes no price list, no starting prices and no hourly figures. Actual prices vary by date, size, hours and location. {site}/pricing/ sets out what live music costs in this market, with each figure attributed to the public source it came from, so a reader can set a budget before writing to Signet. To get the number for a specific night, send the date: {site}/contact/",
                "Travel beyond the Denver metro, a night's lodging past the passes, holiday weekends and New Year's Eve are quoted as their own lines rather than folded into a headline figure.",
            ],
        },
        **{k: v for k, v in s.items() if k.startswith("_")},
    }


# ------------------------------------------------------------------ posts


def md(text):
    return JENV.filters["markdown"](text)


def root_rel(src):
    if not src or re.match(r"^(?:[a-z]+:|/|#)", src):
        return src
    return "/" + src


def post_doc(data):
    n = 0

    def item(kind, props):
        nonlocal n
        n += 1
        return {"type": kind, "props": {"id": f"{kind}-{n}", **props}}

    blocks = []
    for b in data.get("sections", []):
        t = b["type"]
        rest = {k: v for k, v in b.items() if k != "type"}
        if t == "prose":
            blocks.append(item("Prose", {"html": md(b.get("body", ""))}))
        elif t == "aside":
            blocks.append(item("Aside", {"title": b.get("title", ""), "html": md(b.get("body", ""))}))
        elif t == "cta":
            blocks.append(item("PostCta", {"headline": b.get("headline", ""), "html": md(b.get("body", "")), "link": root_rel(b.get("link", "")), "link_text": b.get("link_text", "")}))
        elif t == "figure":
            blocks.append(item("Figure", {**rest, "src": root_rel(b.get("src", ""))}))
        elif t == "transcript":
            chapters = [{**{k: v for k, v in c.items() if k != "body"}, **({"html": md(c["body"])} if c.get("body") else {})} for c in b.get("chapters", [])]
            blocks.append(item("Transcript", {"chapters": chapters}))
        elif t == "related":
            blocks.append(item("RelatedPosts", {"posts": [{"slug": p.get("slug") if isinstance(p, dict) else p} for p in b.get("posts", [])]}))
        elif t == "comparison_table":
            blocks.append(item("ComparisonTable", {**{k: v for k, v in rest.items() if k not in ("columns", "rows")},
                                                   "columns": [{"text": c} for c in b.get("columns", [])],
                                                   "rows": [{"cells": [{"text": c} for c in r]} for r in b.get("rows", [])]}))
        elif t == "key_takeaways":
            blocks.append(item("KeyTakeaways", {**{k: v for k, v in rest.items() if k != "items"}, "items": [{"text": x} for x in b.get("items", [])]}))
        elif t == "references":
            blocks.append(item("References", {**{k: v for k, v in rest.items() if k != "items"},
                                              "items": [x if isinstance(x, dict) else {"text": x} for x in b.get("items", [])]}))
        else:
            name = {"subhead": "Subhead", "pullquote": "Pullquote", "stat_callout": "StatCallout", "data_viz": "DataViz",
                    "comparison_table": "ComparisonTable", "key_takeaways": "KeyTakeaways", "methodology": "Methodology",
                    "video": "Video", "references": "References"}[t]
            blocks.append(item(name, rest))
    props = {k: v for k, v in data.items() if k not in ("sections", "dir_name", "post_dir")}
    if isinstance(props.get("hero"), dict) and props["hero"].get("src"):
        props["hero"] = {**props["hero"], "src": root_rel(props["hero"]["src"])}
    return {"root": {"props": props}, "content": market_words(blocks)}


def market_words(blocks):
    """Market figures as plain words, and the sources line those figures
    asked for, the way build.py printed them on the page."""
    B.begin_page()

    def walk(v, fn):
        if isinstance(v, str):
            return fn(v)
        if isinstance(v, list):
            return [walk(x, fn) for x in v]
        if isinstance(v, dict):
            return {k: walk(x, fn) for k, x in v.items()}
        return v

    blocks = walk(blocks, B.resolve_market_tokens)
    note = B.market_sources()
    return walk(blocks, lambda s: s.replace("<p>{{market_sources}}</p>", note).replace("{{market_sources}}", note))


# ------------------------------------------------------------------ pages


def root_props(cfg, schema, page_dir):
    url = "/" + cfg["output"].replace("index.html", "")
    p = {"path": url, "title": cfg["title"], "description": cfg.get("meta_description", "")}
    for src, dst in (("title_exact", "titleExact"), ("robots", "robots"), ("og_image", "ogImage"), ("nav", "nav"),
                     ("breadcrumb", "breadcrumb"), ("index_label", "indexLabel"), ("absolute_paths", "absolutePaths"),
                     ("schema", "schemaKind"), ("og_type", "ogType")):
        if src in cfg:
            p[dst] = cfg[src]
    if schema is not None:
        sc = {k: v for k, v in schema.items() if k in ("service", "act", "video", "videos", "reviews")}
        p["schema"] = sc
    notes = {k: v for k, v in cfg.items() if k.startswith("_") or k == "reader"}
    if schema:
        notes.update({f"schema{k}": v for k, v in schema.items() if k.startswith("_")})
    if notes:
        p["notes"] = notes
    return p


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    pages_html, calls = run_old_build()

    # Data files.
    blog_cfg = read_json(SRC / "pages" / "blog-index" / "config.json")
    write_json(OUT / "site.json", site_data(blog_cfg))
    write_json(OUT / "shared" / "header.json", header_data())
    write_json(OUT / "shared" / "footer.json", footer_data())
    write_json(OUT / "shared" / "logo-strip.json", B.site["credits"])
    acts_file = read_json(SRC / "data" / "acts.json")
    roster = {k: v for k, v in acts_file.items() if k != "acts"}
    roster = {"order": [a["id"] for a in B.ACTS], **roster}
    write_json(OUT / "roster.json", roster)
    for a in B.ACTS:
        write_json(OUT / "acts" / f"{a['id']}.json", a)
    for i, v in enumerate(B.FOOTAGE):
        write_json(OUT / "videos" / f"{v['slug']}.json", {"order": i + 1, **v})
    write_json(OUT / "repertoire.json", read_json(SRC / "data" / "repertoire.json"))
    write_json(OUT / "photo-focus.json", read_json(SRC / "data" / "photo-focus.json"))
    write_json(OUT / "redirects.json", [{"from": "/" + o.replace("index.html", ""), "to": "/" + n} for o, n in B.REDIRECTS.items()])
    for f in ("market-rates.json", "media-sources.json", "reviews.json"):
        write_json(OUT / "records" / f, read_json(SRC / "data" / f))
    shutil.copy(ROOT / "robots.txt", OUT / "robots.txt")

    # Posts.
    for p in BR.collect_posts(B.PAGES):
        write_json(OUT / "posts" / f"{p['slug']}.json", post_doc(p))

    # Pages: each section file's live HTML, read into typed sections.
    candidates = []
    page_docs = {}
    for page_dir in sorted(B.PAGES.iterdir()):
        if not (page_dir / "config.json").exists() or B.scaffold_todo(page_dir):
            continue
        cfg = read_json(page_dir / "config.json")
        schema = read_json(page_dir / "schema.json") if (page_dir / "schema.json").exists() else None
        output = cfg["output"]
        url = "/" + output.replace("index.html", "")
        prefix = calls[output]["nav_prefix"]
        doc = {"root": {"props": root_props(cfg, schema, page_dir)}, "content": []}
        page_docs[page_dir.name] = (doc, output)
        files = dict(marked_sections(pages_html[output]))
        ids = S.new_ids()
        for f in sorted((page_dir / "sections").glob("*.html")):
            key = f"{page_dir.name}/{f.name}"
            raw = f.read_text(encoding="utf-8")
            notes = strip_comments_notes(raw)
            live = files.get(key, "")
            tokens = set(re.findall(r"\{\{([a-z_]+)(?::[^}]*)?\}\}", B.COMMENT.sub("", raw)))
            pieces = []
            for piece in top_nodes(live):
                # The roster's and the form's script travels with its section.
                if pieces and re.fullmatch(r"<script\b[^>]*acts\.js[^>]*></script>", piece.strip()):
                    pieces[-1] += "\n" + piece
                else:
                    pieces.append(piece)
            for i, piece in enumerate(pieces):
                ctx = S.Ctx(B=B, page=page_dir.name, url=url, prefix=prefix, output=output, file=f.name, tokens=tokens,
                            cfg=cfg, schema=schema, raw=B.COMMENT.sub("", raw), ids=ids)
                rooted = unfocus(to_root(piece, prefix, url))
                typed = S.classify(rooted, ctx)
                custom = {"type": "CustomHtml", "props": {"id": ctx.id("CustomHtml"), "html": rooted}}
                item = typed or custom
                if typed:
                    item["props"] = {"id": ctx.id(item["type"]), **item["props"]}
                for it in (item, custom):
                    if i == 0 and notes:
                        it["props"]["_notes"] = notes
                    it["props"]["_file"] = f.name
                doc["content"].append(item)
                candidates.append({"page": page_dir.name, "index": len(doc["content"]) - 1, "item": item, "custom": custom,
                                   "expected": piece, "prefix": prefix, "output": output, "url": url})

    # A one-off written as a style, a section and a script in one file is
    # one Custom HTML section, not three.
    for name, (doc, output) in page_docs.items():
        merged = []
        for item in doc["content"]:
            prev = merged[-1] if merged else None
            if (prev and item["type"] == "CustomHtml" and prev["type"] == "CustomHtml"
                    and item["props"]["_file"] == prev["props"]["_file"]):
                prev["props"]["html"] += "\n" + item["props"]["html"]
                for c in candidates:
                    if c["page"] == name and c["item"] is item:
                        c["merged"] = True
            else:
                merged.append(item)
        doc["content"] = merged
    candidates = [c for c in candidates if not c.get("merged")]
    for c in candidates:
        doc, _ = page_docs[c["page"]]
        c["index"] = next(n for n, x in enumerate(doc["content"]) if x is c["item"])

    # The video index is generated today; it becomes a page with a list.
    vcall = calls["video/index.html"]
    page_docs["video"] = ({"root": {"props": {"path": "/video/", "title": vcall["title"], "description": vcall["meta_description"],
                                              "nav": "music", "breadcrumb": "Video Clips", "indexLabel": "All video clips", "schemaKind": "videos"}},
                           "content": S.video_index_sections(B)}, "video/index.html")

    for name, (doc, output) in page_docs.items():
        write_json(OUT / "pages" / f"{name}.json", doc)

    # Every typed section rendered back through the components and compared
    # with the live DOM. Any that differ stay as Custom HTML.
    typed = [c for c in candidates if c["item"]["type"] != "CustomHtml"]
    rendered = render_items(typed)
    fallbacks = []
    for c, html in zip(typed, rendered):
        problem = domdiff.differs(c["expected"], html, limit=10000)
        if problem and not known_difference(problem):
            fallbacks.append((c, problem))
            doc, _ = page_docs[c["page"]]
            doc["content"][c["index"]] = c["custom"]
    for name, (doc, output) in page_docs.items():
        write_json(OUT / "pages" / f"{name}.json", doc)

    write_json(OUT / "lastmod.json", lastmod_seed(calls))

    report(page_docs, fallbacks)


def known_difference(problem):
    """Differences the new build makes on purpose, listed in the proof for
    Daniel: a post's reading time now counts market figures as the words a
    reader sees ("$2,500 to $8,000"), where build.py counted each as one."""
    changed = [x.strip() for x in problem.split(" | ") if x.strip()[:1] in "+-"]
    return bool(changed) and all(re.fullmatch(r"[-+]T \d+ min read", x) for x in changed)


def render_items(items):
    """Render sections through the React components (one Node run)."""
    if not items:
        return []
    req = pathlib.Path(tempfile.mkstemp(suffix=".json")[1])
    req.write_text(json.dumps([{"item": c["item"], "prefix": c["prefix"], "output": c["output"], "page": c["page"]} for c in items], ensure_ascii=False))
    out = subprocess.run(["node", str(SITE_DIR / "scripts" / "build.mjs"), "--render-sections", str(req)],
                         cwd=ROOT, capture_output=True, text=True)
    req.unlink()
    if out.returncode:
        raise SystemExit("Rendering sections failed:\n" + out.stderr[-4000:])
    return json.loads(out.stdout)


def lastmod_seed(calls):
    """Today's sitemap date for every URL, with a hash of the content file
    behind it. The new build keeps the date while the file is unchanged and
    takes the file's own commit date once it is edited."""
    dates = B._page_lastmod_map()
    seed = {}

    def date_for(src):
        ds = [d for f, d in dates.items() if src and f.startswith(src)]
        return max(ds) if ds else None

    for page_dir in sorted(B.PAGES.iterdir()):
        cfgf = page_dir / "config.json"
        if not cfgf.exists() or B.scaffold_todo(page_dir):
            continue
        cfg = read_json(cfgf)
        name = page_dir.name
        seed[cfg["output"]] = {"date": date_for(str(page_dir.relative_to(ROOT))), "file": f"content/pages/{name}.json"}
    fdate = date_for("_src/data/footage.json")
    for v in B.FOOTAGE:
        seed[B.watch_output(v)] = {"date": fdate, "file": f"content/videos/{v['slug']}.json"}
    seed["video/index.html"] = {"date": fdate, "file": "content/pages/video.json"}
    for k, s in seed.items():
        path = ROOT / s["file"]
        s["sha1"] = hashlib.sha1(path.read_bytes()).hexdigest() if path.exists() else None
    return seed


def report(page_docs, fallbacks):
    from collections import Counter
    types = Counter()
    for doc, _ in page_docs.values():
        for c in doc["content"]:
            types[c["type"]] += 1
    total = sum(types.values())
    print(f"content/: {len(page_docs)} pages, {total} sections")
    for t, n in types.most_common():
        print(f"  {n:4d}  {t}")
    if fallbacks:
        print(f"{len(fallbacks)} sections kept as Custom HTML because the typed render differed:")
        for c, problem in fallbacks[:200]:
            print(f"  {c['page']}/{c['item']['props'].get('_file')} {c['item']['type']}: {problem[:300]}")
    rep = SITE_DIR / "proof" / "convert-report.json"
    rep.parent.mkdir(exist_ok=True)
    rep.write_text(json.dumps({"types": types, "fallbacks": [{"page": c["page"], "file": c["item"]["props"].get("_file"), "type": c["item"]["type"], "problem": p} for c, p in fallbacks]}, indent=1) + "\n")


if __name__ == "__main__":
    main()
