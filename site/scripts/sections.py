"""Reading a live section's HTML into a typed section.

classify(html, ctx) returns {"type": ..., "props": {...}} or None. Nothing
here has to be perfect: convert.py renders every typed section back through
the components and keeps the original as Custom HTML wherever the DOM
differs, so a reader that misses a detail costs a fallback, never a change
on the site.

A section is a band (its classes, id and label) holding blocks in order:
a heading, paragraphs, rows, questions, pictures, a table. The section's
type is named after its main block. A handful of sections have one fixed
shape and their own type: the logo strip, a hub's list, the home hero, the
cover walls, an act's sizes and set, the roster and the enquiry form."""
import copy
import html as htmlmod
import itertools
import re
from dataclasses import dataclass, field

from lxml import html as LH

import domdiff


@dataclass
class Ctx:
    B: object
    page: str
    url: str
    prefix: str
    output: str
    file: str
    tokens: set = field(default_factory=set)
    cfg: dict = field(default_factory=dict)
    schema: dict = None
    raw: str = ""
    ids: object = None

    def id(self, kind):
        return f"{kind}-{next(self.ids)}"


# ----------------------------------------------------------------- reading

def frag(html):
    """The top-level nodes of a fragment, parsed as a browser parses the
    inside of <main>."""
    doc = domdiff.parse('<!DOCTYPE html><html><head></head><body><main>' + html + "</main></body></html>")
    main = doc.getroot().find(".//main")
    els = []
    if (main.text or "").strip():
        els.append(main.text)
    for c in main:
        if isinstance(c.tag, str):
            els.append(c)
        if (c.tail or "").strip():
            els.append(c.tail)
    return els


def inner(el):
    s = htmlmod.escape(el.text or "", quote=False)
    for c in el:
        s += LH.tostring(c, encoding="unicode", method="html", with_tail=True)
    return s


def outer(el):
    return LH.tostring(el, encoding="unicode", method="html", with_tail=False)


def kids(el):
    return [c for c in el if isinstance(c.tag, str)]


def cls(el):
    return (el.get("class") or "").split()


def loose_text(el):
    """True when the element holds text of its own between its children."""
    if (el.text or "").strip():
        return True
    return any((c.tail or "").strip() for c in el)


def opt(d, **kw):
    for k, v in kw.items():
        if v is not None and v != "":
            d[k] = v
    return d


def plain_text(el):
    return "".join(el.itertext())


def image(el):
    im = {}
    for k, v in el.attrib.items():
        im["cls" if k == "class" else k] = v
    return im


def buttons(el):
    out = []
    if loose_text(el):
        return None
    for a in kids(el):
        if a.tag != "a" or kids(a):
            return None
        b = {"label": plain_text(a), "href": a.get("href", "")}
        opt(b, cls=a.get("class"), target=a.get("target"), rel=a.get("rel"))
        out.append(b)
    return out


# --------------------------------------------------------------- blocks

def heading(el, ctx):
    p = {}
    opt(p, headingStyle=el.get("style"))
    if loose_text(el):
        return None
    stage = 0
    seen_lede = any(c.tag == "p" and cls(c) == ["lede"] for c in kids(el))
    for c in kids(el):
        cs = cls(c)
        if c.tag == "p" and cs and cs[0] == "eyebrow" and set(cs) <= {"eyebrow", "eyebrow--slab"}:
            want, p["eyebrow"] = 1, inner(c)
            if "eyebrow--slab" in cs:
                p["slab"] = True
        elif c.tag in ("h1", "h2", "h3", "h4"):
            want = 2
            p["title"], p["titleTag"] = inner(c), c.tag
            opt(p, titleClass=c.get("class"), titleStyle=c.get("style"))
        elif c.tag == "p" and cs == ["act-face"]:
            want, p["face"] = 3, inner(c)
        elif c.tag == "img":
            first = "lede" not in p and seen_lede
            want = 4 if first else 7
            p["image"] = image(c)
            if first:
                p["imageFirst"] = True
        elif c.tag == "p" and cs == ["lede"]:
            want = 5
            p["lede"] = inner(c)
            opt(p, ledeStyle=c.get("style"))
        elif c.tag == "div" and cs == ["btn-row"]:
            want = 8
            b = buttons(c)
            if b is None:
                return None
            p["buttons"] = b
        elif c.tag == "p" and "buttons" in p and cs == ["note"]:
            want, p["headingNote"] = 9, inner(c)
        elif c.tag == "p":
            want = 6
            t = {"html": inner(c)}
            if cs != ["prose"]:
                t["cls"] = c.get("class") or ""
            opt(t, style=c.get("style"))
            p.setdefault("headingText", []).append(t)
        else:
            return None
        if want < stage or (want == stage and want != 6):
            return None
        stage = want
    return p


def table(el):
    if loose_text(el):
        return None
    t = kids(el)
    if len(t) != 1 or t[0].tag != "table":
        return None
    t = t[0]
    p = {}
    if el.get("data-provisional"):
        p["provisional"] = True
    if t.get("class") != "rate-table tnum":
        p["tableCls"] = t.get("class") or ""
    parts = kids(t)
    for part in parts:
        if part.tag == "caption":
            p["caption"] = inner(part)
            opt(p, captionCls=part.get("class"))
        elif part.tag == "thead":
            rows = kids(part)
            if len(rows) != 1:
                return None
            p["head"] = [cell(c, "th") for c in kids(rows[0])]
        elif part.tag == "tbody":
            p["rows"] = [{"cells": [cell(c, "td") for c in kids(r)]} for r in kids(part)]
        else:
            return None
    return p


def cell(c, default):
    d = {"html": inner(c)}
    if c.tag != default:
        d["tag"] = c.tag
    opt(d, cls=c.get("class"), scope=c.get("scope"))
    return d


def player(el):
    """An act-video's iframe, video or photo."""
    k = kids(el)
    if len(k) != 1 or loose_text(el):
        return None
    v = k[0]
    if v.tag == "iframe":
        d = {"kind": "iframe", "src": v.get("src"), "title": v.get("title")}
        opt(d, loading=v.get("loading"))
        if v.get("allow") != "accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture":
            d["allow"] = v.get("allow")
        return d
    if v.tag == "video":
        return opt({"kind": "video", "src": v.get("src"), "title": v.get("title")}, poster=v.get("poster"))
    if v.tag == "img" and cls(v) == ["act-video-photo"]:
        im = image(v)
        im.pop("cls")
        return {"kind": "photo", "image": im}
    return None


def block(children, i, ctx):
    """The block at children[i]: (item, how many elements it used)."""
    el = children[i]
    cs = cls(el)
    tag = el.tag
    item = lambda kind, props: {"type": kind, "props": {"id": ctx.id(kind), **props}}  # noqa: E731

    if tag == "div" and cs == ["heading"]:
        h = heading(el, ctx)
        if h is not None:
            return item("Heading", h), 1
    elif tag == "p":
        if set(el.attrib) <= {"class", "style"}:
            return item("Paragraph", opt({"html": inner(el)}, cls=el.get("class"), style=el.get("style"))), 1
    elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
        return item("Title", opt({"html": inner(el), "tag": tag}, cls=el.get("class"), style=el.get("style"))), 1
    elif tag == "figure" and cs == ["review-pull"]:
        k = kids(el)
        if [x.tag for x in k] == ["blockquote", "figcaption"] and not loose_text(el):
            return item("Quote", {"html": inner(k[0]), "by": inner(k[1])}), 1
    elif tag == "img":
        return item("Picture", {"image": image(el)}), 1
    elif tag == "div" and cs and cs[0] == "btn-row":
        b = buttons(el)
        if b is not None:
            return item("ButtonRow", opt({"buttons": b}, cls=" ".join(cs[1:]))), 1
    elif tag == "ul" and "spec-list" in cs:
        items = [inner(li) for li in kids(el)]
        dash = '<span class="dash" aria-hidden="true"></span>'
        if all(x.startswith(dash) for x in items):
            texts = [htmlmod.unescape(x[len(dash):]) for x in items]
            cols = "spec-list--cols" in cs
            for name in ("included", "extras"):
                lst = ctx.B.site["included"] if name == "included" else [e["item"] for e in ctx.B.site["extras"]]
                if texts == lst and any(t.startswith(name) for t in ctx.tokens):
                    return item("SpecList", {"source": name, "cols": cols}), 1
            return item("SpecList", {"source": "own", "cols": cols, "items": [{"html": x[len(dash):]} for x in items]}), 1
    elif tag == "ul" and "season-board" in cs and "season_dates" in ctx.tokens:
        nxt = children[i + 1] if i + 1 < len(children) else None
        if nxt is not None and nxt.tag == "p" and cls(nxt) == ["note"]:
            return item("Season", {"dates": [opt({"date": d["date"]}, peak=d.get("peak") or None, note=d.get("note")) for d in ctx.B.SEASON["dates"]]}), 2
    elif tag in ("ul", "ol"):
        if all(li.tag == "li" and not li.attrib for li in kids(el)) and not loose_text(el):
            return item("List", opt({"items": [{"html": inner(li)} for li in kids(el)]}, tag=tag if tag != "ul" else None, cls=el.get("class"), style=el.get("style"))), 1
    elif tag == "dl" and "site_index" in ctx.tokens and "def-list" in cs:
        return item("PageIndex", {"top": SITE_TOP, "groups": SITE_GROUPS}), 1
    elif tag == "dl" and cs and cs[0] == "def-list":
        rows = def_rows(el)
        if rows is not None:
            return item("DefRows", opt(rows, cls=el.get("class"), style=el.get("style"))), 1
    elif tag == "dl" and cs == ["faq-list"]:
        f = faq(el)
        if f is not None:
            schema = bool(ctx.tokens & {"page_faqs", "faq_list", "planner_faq_list"})
            return item("Faq", opt({"items": f, "schema": schema}, style=el.get("style"))), 1
    elif tag == "div" and cs and cs[0] == "media-grid":
        imgs = media(el)
        if imgs is not None:
            return item("MediaGrid", {"images": imgs, "single": "media-grid--single" in cs}), 1
    elif tag == "div" and cs and cs[0] == "video-grid":
        vids = [player(v) if v.tag == "div" and cls(v) == ["act-video"] else None for v in kids(el)]
        if all(vids) and not loose_text(el):
            return item("VideoGrid", {"videos": vids, "single": "video-grid--single" in cs}), 1
    elif tag == "div" and cs == ["act-video"]:
        v = player(el)
        if v:
            return item("ActVideo", v), 1
    elif tag == "div" and cs and cs[0] == "split" and set(cs) <= {"split", "split--two", "split--three"}:
        cols = kids(el)
        if 1 <= len(cols) <= 3 and all(c.tag == "div" and not c.get("class") for c in cols) and not loose_text(el):
            p = {"cls": el.get("class"), "n": len(cols)}
            styles = [c.get("style") for c in cols]
            if any(styles):
                p["styles"] = styles
            for n, c in enumerate(cols):
                blocks = read_blocks(c, ctx)
                if blocks is None:
                    break
                p[f"c{n + 1}"] = blocks
            else:
                return item("Columns", p), 1
    elif tag == "div" and cs == ["table-scroll"]:
        t = table(el)
        if t is not None:
            return item("Table", t), 1
    elif tag == "div" and cs == ["close-row"]:
        c = close_row(el)
        if c is not None:
            return item("CloseRow", c), 1
    elif tag == "div" and "card-grid" in cs:
        if "roster_grid_flagships" in ctx.tokens:
            return item("Cards", {"source": "flagships"}), 1
        if "corporate_shapes" in ctx.tokens:
            picks = [{"act": s["act"], "config": s["config"], "kicker": s["occasion"], "why": s["why"], "face": "config"} for s in ctx.B.site["corporateShapes"]]
            return item("Cards", {"source": "picks", "picks": picks}), 1
        if "season_leads" in ctx.tokens:
            picks = [{"act": s["act"], "config": s["config"], "kicker": ctx.B.rate_of(s["config"])["label"], "why": s["why"], "face": "style"} for s in ctx.B.SEASON["leads"]]
            return item("Cards", {"source": "picks", "picks": picks}), 1
    elif tag == "figure" and cs == ["stage-plot"]:
        q = next(c for c in ctx.B.site["configurations"] if c["size"] == "Quartet")
        w, d = (int(n) for n in re.findall(r"\d+", q["stage"])[:2])
        return item("StagePlot", {"guide": 24, "width": w, "depth": d}), 1
    elif tag == "div" and cs == ["blog-list"] and "blog_cards" in ctx.tokens:
        return item("BlogPosts", {}), 1
    return item("HtmlBlock", {"html": outer(el)}), 1


def read_blocks(container, ctx):
    """The blocks inside a container, in order. Loose text between them
    becomes an HTML block of its own."""
    out = []
    if (container.text or "").strip():
        out.append({"type": "HtmlBlock", "props": {"id": ctx.id("HtmlBlock"), "html": htmlmod.escape(container.text, quote=False)}})
    children = kids(container)
    i = 0
    while i < len(children):
        b, used = block(children, i, ctx)
        out.append(b)
        last = children[i + used - 1]
        if (last.tail or "").strip():
            out.append({"type": "HtmlBlock", "props": {"id": ctx.id("HtmlBlock"), "html": htmlmod.escape(last.tail, quote=False)}})
        i += used
    return out


def def_rows(el):
    k = kids(el)
    if loose_text(el):
        return None
    rows = []
    if k and all(c.tag == "div" and cls(c) == ["def-row"] for c in k):
        for r in k:
            rk = kids(r)
            if [x.tag for x in rk] != ["dt", "dd"] or loose_text(r):
                return None
            rows.append(row(*rk))
        return {"rows": rows}
    if k and len(k) % 2 == 0 and all(c.tag == ("dt" if n % 2 == 0 else "dd") for n, c in enumerate(k)):
        for a, b in zip(k[::2], k[1::2]):
            rows.append(row(a, b))
        return {"rows": rows, "bare": True}
    return None


def row(dt, dd):
    return opt({"term": inner(dt), "text": inner(dd)}, termStyle=dt.get("style"), textStyle=dd.get("style"), textCls=dd.get("class"))


def faq(el):
    out = []
    if loose_text(el):
        return None
    for r in kids(el):
        rk = kids(r)
        if r.tag != "div" or cls(r) != ["faq-row"] or [x.tag for x in rk] != ["dt", "dd"]:
            return None
        dt, dd = rk
        span = kids(dd)
        if len(span) == 1 and span[0].tag == "span" and span[0].get("data-tbd") == "true" and not loose_text(dd):
            out.append({"q": inner(dt), "a": inner(span[0]), "open": True})
        else:
            out.append({"q": inner(dt), "a": inner(dd)})
    return out


def media(el):
    out = []
    if loose_text(el):
        return None
    for f in kids(el):
        fk = kids(f)
        if f.tag != "figure" or f.attrib or not fk or fk[0].tag != "img":
            return None
        im = image(fk[0])
        if len(fk) == 2 and fk[1].tag == "figcaption":
            im["caption"] = inner(fk[1])
        elif len(fk) != 1:
            return None
        out.append(im)
    return out


def close_row(el):
    k = kids(el)
    if loose_text(el) or len(k) != 2 or not (k[1].tag == "div" and cls(k[1]) == ["btn-row"]):
        return None
    p = {"buttons": buttons(k[1])}
    if p["buttons"] is None:
        return None
    if k[0].tag == "div" and not k[0].get("class"):
        p["boxed"] = True
        opt(p, boxStyle=k[0].get("style"))
        words = kids(k[0])
        if loose_text(k[0]):
            return None
    elif k[0].tag == "h2":
        words = [k[0]]
    else:
        return None
    if not words or words[0].tag != "h2":
        return None
    p["title"] = inner(words[0])
    opt(p, titleStyle=words[0].get("style"))
    if words[0].get("class") != "h2":
        p["titleCls"] = words[0].get("class") or ""
    for w in words[1:]:
        if w.tag == "p" and cls(w) == ["lede"] and "lede" not in p and "image" not in p:
            p["lede"] = inner(w)
            opt(p, ledeStyle=w.get("style"))
        elif w.tag == "img" and "image" not in p:
            p["image"] = image(w)
        else:
            return None
    return p


# The HTML sitemap's order: the site's own pages, then each tree.
SITE_TOP = ["index.html", "music/index.html", "repertoire/index.html", "pricing/index.html", "about/index.html",
            "contact/index.html", "blog/index.html", "for-artists/index.html", "thanks/index.html"]
SITE_GROUPS = [
    {"prefix": "corporate/", "heading": "Corporate"},
    {"prefix": "weddings/", "heading": "Weddings"},
    {"prefix": "private-parties/", "heading": "Private parties"},
    {"prefix": "daytime/", "heading": "Daytime"},
    {"prefix": "ensembles/", "heading": "Configurations", "lanes": True},
    {"prefix": "artists/", "heading": "Named acts"},
    {"prefix": "planners/", "heading": "For planners"},
    {"prefix": "preferred-vendors/", "heading": "Preferred vendors"},
    {"prefix": "guides/", "heading": "Guides"},
    {"prefix": "video/", "heading": "Video clips"},
]


# ------------------------------------------------------------- sections

BANDS = [
    ({"section", "section--ruled", "section--sunk"}, "sunk"),
    ({"section", "section--ruled", "section--night"}, "night"),
    ({"section", "section--ruled"}, "ruled"),
    ({"section", "section--top"}, "top"),
]


def shell(sec):
    c = cls(sec)
    p = {}
    for need, name in BANDS:
        if need <= set(c):
            p["band"] = name
            rest = [x for x in c if x not in need]
            if rest:
                p["cls"] = " ".join(rest)
            break
    else:
        return None
    opt(p, anchor=sec.get("id"), label=sec.get("aria-label"))
    if set(sec.attrib) - {"class", "id", "aria-label"}:
        return None
    return p


def wrap_of(sec, p):
    k = kids(sec)
    if len(k) != 1 or loose_text(sec):
        return None
    w = k[0]
    wc = cls(w)
    if w.tag != "div" or not wc or wc[0] != "wrap" or set(wc) - {"wrap", "wrap--narrow"} or set(w.attrib) - {"class", "style"}:
        return None
    if "wrap--narrow" in wc:
        p["narrow"] = True
    opt(p, wrapStyle=w.get("style"))
    return w


PRIORITY = [("Faq", "Questions"), ("PageIndex", "AllPages"), ("BlogPosts", "BlogList"), ("Season", "SeasonBoard"),
            ("Cards", "ActCards"), ("DefRows", "Rows"), ("VideoGrid", "Videos"), ("MediaGrid", "Images"),
            ("Table", "RateTable"), ("Columns", "TwoColumns"), ("SpecList", "Specs"), ("CloseRow", "CallToAction")]


def section_type(p, blocks):
    types = {b["type"] for b in blocks}
    for blk, name in PRIORITY:
        if blk in types:
            return name
    if "act-hero" in (p.get("cls") or ""):
        return "ActHero"
    if p.get("band") == "top" or "ActVideo" in types:
        return "Intro"
    return "Text"


def classify(html, ctx):
    els = frag(html)
    if not els or isinstance(els[0], str) or els[0].tag != "section":
        return None
    sec = els[0]
    rest = els[1:]
    script = None
    if rest:
        if len(rest) == 1 and not isinstance(rest[0], str) and rest[0].tag == "script" and (rest[0].get("src") or "").endswith("acts.js"):
            script = rest[0]
        else:
            return None
    cs = cls(sec)
    for reader in (logo_strip, hub_index, home_hero, range_strip, cover_strip, cover_wall, act_sizes, act_setlist, vendor_list, contact_form, roster):
        r = reader(sec, cs, ctx)
        if r is not None:
            kind, props = r
            if script is not None:
                if kind not in ("ContactForm", "Roster"):
                    return None
                props["script"] = True
            elif kind in ("ContactForm", "Roster"):
                props["script"] = False
            return {"type": kind, "props": props}
    if script is not None:
        return None
    if "catalog" in cs or "letters" in cs or any(c.startswith("jam-") for c in cs):
        return None
    p = shell(sec)
    if p is None:
        return None
    w = wrap_of(sec, p)
    if w is None:
        return None
    blocks = read_blocks(w, ctx)
    p["blocks"] = blocks
    return {"type": section_type(p, blocks), "props": p}


# ---------------------------------------------------------- fixed shapes

def logo_strip(sec, cs, ctx):
    if "credits" not in cs or "credits" not in ctx.tokens:
        return None
    p = shell(sec)
    if p is None or p.get("cls") != "credits":
        return None
    p.pop("cls")
    w = wrap_of(sec, p)
    if w is None:
        return None
    k = kids(w)
    also = [c for c in k if c.tag == "p" and "credits-also" in cls(c)]
    p["showAlso"] = bool(also)
    # Anything after the strip (a quote) is kept as blocks of its own.
    start = k.index(also[0]) + 1 if also else next((n + 1 for n, c in enumerate(k) if c.tag == "ul"), len(k))
    rest = k[start:]
    if rest:
        holder = LH.Element("div")
        for c in rest:
            holder.append(copy.deepcopy(c))
        p["blocks"] = read_blocks(holder, ctx)
    return "LogoStrip", p


def hub_index(sec, cs, ctx):
    if "hub-index-band" not in cs or "hub_index" not in ctx.tokens:
        return None
    heading, groups = ctx.B.HUB_INDEX[ctx.url]
    p = shell(sec)
    p.pop("cls", None)
    out = []
    for label, entries in groups:
        pages = []
        for e in entries:
            if isinstance(e, tuple):
                pages.append({"path": e[0], "label": e[1]})
            else:
                pages.append({"path": e})
        out.append({"label": label, "pages": pages})
    return "PagesAndPosts", {**p, "heading": heading, "groups": out}


def home_hero(sec, cs, ctx):
    if cs != ["hero-cine"]:
        return None
    k = kids(sec)
    if len(k) != 3:
        return None
    frames, scrim, copy = k
    p = opt({}, label=sec.get("aria-label"))
    if frames.get("aria-hidden") != "false":
        p["framesHidden"] = frames.get("aria-hidden")
    imgs = []
    for im in kids(frames):
        d = image(im)
        if d.get("cls") != "hero-cine__frame":
            return None
        d.pop("cls")
        imgs.append(d)
    p["frames"] = imgs
    ck = kids(copy)
    if [x.tag for x in ck] != ["h1", "p", "div"]:
        return None
    p["title"] = inner(ck[0])
    opt(p, titleStyle=ck[0].get("style"))
    p["lede"] = inner(ck[1])
    opt(p, ledeStyle=ck[1].get("style"))
    p["buttons"] = buttons(ck[2])
    return "HomeHero", p


def range_strip(sec, cs, ctx):
    if cs != ["range-strip"]:
        return None
    k = kids(sec)
    if len(k) != 1 or k[0].tag != "img":
        return None
    return "RangeStrip", opt({"image": image(k[0])}, label=sec.get("aria-label"))


def cover_strip(sec, cs, ctx):
    if set(cs) != {"section--night", "cover-strip"}:
        return None
    k = kids(sec)
    if len(k) != 2:
        return None
    tiles = [{"src": i.get("src"), "alt": i.get("alt")} for i in kids(k[0])]
    note = k[1].xpath("./p")
    return "CoverStrip", {"tiles": tiles, "note": inner(note[0])}


def cover_wall(sec, cs, ctx):
    if "cover-wall" not in cs:
        return None
    k = kids(sec)
    if len(k) != 2 or cls(k[0]) != ["wall-grid"]:
        return None
    p = {}
    if "cover-wall--flip" in cs:
        p["flip"] = True
    tiles = []
    for n, c in enumerate(kids(k[0])):
        if cls(c) == ["wall-text"]:
            tk = kids(c)
            if tk and tk[0].tag == "span" and cls(tk[0]) == ["eyebrow"]:
                p["eyebrow"] = inner(tk[0])
                tk = tk[1:]
            if [x.tag for x in tk] != ["h2", "p"]:
                return None
            p["textAt"] = n
            p["title"], p["text"] = inner(tk[0]), inner(tk[1])
            opt(p, titleStyle=tk[0].get("style"), textStyle=tk[1].get("style"))
        else:
            fk = kids(c)
            if c.tag != "figure" or [x.tag for x in fk] != ["img", "figcaption"]:
                return None
            spans = kids(fk[1])
            t = opt({"src": fk[0].get("src"), "alt": fk[0].get("alt"), "song": inner(spans[0]), "credit": inner(spans[1])},
                    style=c.get("style"), loading=fk[0].get("loading"), decoding=fk[0].get("decoding"))
            tiles.append(t)
    p["tiles"] = tiles
    notes = k[1].xpath("./p")
    p["notes"] = inner(notes[0]) if notes else ""
    return "CoverWall", p


def act_sizes(sec, cs, ctx):
    ids = re.findall(r"\{\{act_ladder:([^}]+)\}\}", ctx.raw)
    if sec.get("id") != "configurations" or not ids:
        return None
    w = kids(sec)[0]
    k = kids(w)
    return "ActSizes", {"act": ids[0].strip(), "title": inner(k[0]), "note": inner(k[-1])}


def act_setlist(sec, cs, ctx):
    ids = re.findall(r"\{\{act_setlist:([^}]+)\}\}", ctx.raw)
    if not ids:
        return None
    w = kids(sec)[0]
    k = kids(w)
    if not k or k[0].tag != "h2" or plain_text(k[0]) != "A sample of the set":
        return None
    p = {"act": ids[0].strip(), "title": inner(k[0])}
    if k[-1].tag == "p" and len(k) > 3:
        p["more"] = inner(k[-1])
    return "Setlist", p


def vendor_list(sec, cs, ctx):
    if "vendor_list" not in ctx.tokens or not sec.xpath(".//div[contains(@class,'vendor-cats')]"):
        return None
    return "VendorList", {"categories": ctx.B.VENDOR_CATEGORIES, "vendors": ctx.B.VENDORS}


def contact_form(sec, cs, ctx):
    if "act_picker" not in ctx.tokens:
        return None
    g = sec.xpath(".//div[contains(@class,'contact-grid')]")[0]
    left, form = kids(g)
    h = heading(kids(left)[0], ctx)
    p = {**h}
    shell_p = shell(sec)
    p["band"] = shell_p["band"]
    p["details"] = [{"term": inner(d.xpath("./dt")[0]), "html": inner(d.xpath("./dd")[0])} for d in kids(kids(left)[1])]
    p["action"] = form.get("action")
    p["hidden"] = [{"name": i.get("name"), "value": i.get("value")} for i in form.xpath("./input")]
    fields = []
    for f in form.xpath("./div[@class='form-grid']/div"):
        if f.get("id") == "act-field":
            fields.append({"kind": "acts"})
            continue
        lab = f.xpath("./label")[0]
        ctl = kids(f)[1]
        d = {"kind": ctl.tag, "id": ctl.get("id"), "name": ctl.get("name"), "label": inner(lab)}
        if "field--full" in cls(f):
            d["full"] = True
        if ctl.tag == "textarea":
            opt(d, rows=ctl.get("rows"), placeholder=ctl.get("placeholder"))
        else:
            d["kind"] = "input"
            opt(d, type=ctl.get("type"), autocomplete=ctl.get("autocomplete"))
            if ctl.get("required") is not None:
                d["required"] = True
        fields.append(d)
    p["fields"] = fields
    p["button"] = plain_text(form.xpath(".//button")[0])
    return "ContactForm", p


def roster(sec, cs, ctx):
    if "roster_filters" not in ctx.tokens:
        return None
    p = shell(sec)
    w = kids(sec)[0]
    k = kids(w)
    p["title"] = inner(k[0])
    p["note"] = inner(k[1])
    p["empty"] = inner(w.xpath("./p[@id='filter-empty']")[0])
    lanes = []
    for lane in w.xpath("./div[contains(@class,'roster-lane')]"):
        hk = kids(lane.xpath("./div[@class='heading']")[0])
        lanes.append({"lane": lane.get("data-lane"), "eyebrow": inner(hk[0]), "title": inner(hk[1]), "lede": inner(hk[2])})
    p["lanes"] = lanes
    return "Roster", p


def video_index_sections(B):
    return [{"type": "VideoIndex", "props": {"id": "VideoIndex-1",
             "eyebrow": "Video Clips", "title": "Video clips of our bands and musicians.",
             "lede": "Every clip is grouped by act. If you see something you like, check out the act's page or just <a href=\"/contact/\">reach out with your date</a>."}}]


def new_ids():
    return itertools.count(1)
