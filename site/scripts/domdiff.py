"""The normalised-DOM comparison the proof and the converter share.

Both documents are parsed the way a browser parses them (the HTML5
algorithm, via html5lib) and reduced to one stream of tokens:
each element with its attributes (in any order, classes sorted, inline
styles normalised), and each run of text with whitespace collapsed the way a
browser renders it. Whitespace between two blocks is dropped; whitespace
beside an inline element is kept as one space, so "a <b>c</b>" and
"a<b>c</b>" differ. Comments are ignored. JSON-LD is compared as data.
Two documents are the same when their token streams are equal."""
import difflib
import json
import re

import warnings

import html5lib

warnings.filterwarnings("ignore", module="html5lib")

BLOCK = {
    "html", "head", "body", "header", "main", "footer", "nav", "section", "article", "aside", "div", "p", "h1", "h2", "h3",
    "h4", "h5", "h6", "ul", "ol", "li", "dl", "dt", "dd", "figure", "figcaption", "blockquote", "table", "thead", "tbody",
    "tfoot", "tr", "th", "td", "caption", "form", "fieldset", "legend", "script", "style", "meta", "link", "title", "noscript",
    "details", "summary", "hr", "pre", "address", "option", "optgroup", "select", "template", "iframe", "video", "audio",
    "source", "track", "base",
}
SVG_TEXT = {"text", "tspan", "textPath", "textpath", "title", "desc"}
WS = re.compile(r"[ \t\n\r\f]+")


def norm_style(v):
    parts = [p.strip() for p in v.split(";") if p.strip()]
    kv = []
    for p in parts:
        k, _, val = p.partition(":")
        kv.append(k.strip().lower() + ":" + WS.sub(" ", val.strip()))
    return ";".join(kv)


def attrs(e):
    out = []
    for k, v in sorted((local(k), v) for k, v in e.attrib.items()):
        if k == "class":
            v = " ".join(sorted(v.split()))
            if not v:
                continue
        elif k == "style":
            v = norm_style(v)
        out.append(f"{k}={v!r}")
    return out


def local(name):
    return name.rsplit("}", 1)[-1]


def is_block(e):
    return isinstance(e.tag, str) and local(e.tag) in BLOCK


def in_svg(e):
    while e is not None:
        if isinstance(e.tag, str) and local(e.tag) == "svg":
            return True
        e = e.getparent()
    return False


def parse(html):
    """A whole document, parsed as a browser would."""
    return html5lib.parse(html, treebuilder="lxml", namespaceHTMLElements=False)


def tokens(root, out=None):
    """Tokens for an element and its subtree."""
    out = [] if out is None else out

    def text(s, before_block, after_block, parent):
        if not s:
            return
        tag = local(parent.tag) if isinstance(parent.tag, str) else ""
        if tag in ("script", "style"):
            out.append("RAW " + s.strip())
            return
        if tag in ("pre", "textarea"):
            out.append("T " + s)
            return
        if in_svg(parent) and tag not in SVG_TEXT:
            if s.strip():
                out.append("T " + WS.sub(" ", s.strip()))
            return
        t = WS.sub(" ", s)
        if before_block:
            t = t.lstrip()
        if after_block:
            t = t.rstrip()
        if t:
            out.append("T " + t)

    def walk(e):
        if not isinstance(e.tag, str):  # comment / processing instruction
            return
        name = local(e.tag)
        if name == "script" and (e.get("type") or "") == "application/ld+json":
            try:
                data = json.loads(e.text or "")
            except ValueError:
                data = None
            if data is not None:
                out.append("<script ld+json>")
                out.extend("LD " + line for line in flatten(data))
                out.append("</script>")
                return
        out.append(f"<{name} " + " ".join(attrs(e)) + ">")
        kids = [c for c in e if isinstance(c.tag, str)]
        block_ctx = is_block(e)
        first = kids[0] if kids else None
        text(e.text, block_ctx or (first is not None and is_block(first) and False), (first is not None and is_block(first)) or (first is None and block_ctx), e)
        elems = list(e)
        for i, c in enumerate(elems):
            walk(c)
            nxt = next((x for x in elems[i + 1:] if isinstance(x.tag, str)), None)
            text(c.tail, is_block(c) if isinstance(c.tag, str) else False, (nxt is not None and is_block(nxt)) or (nxt is None and block_ctx), e)
        out.append(f"</{name}>")

    walk(root)
    return _merge(out)


def flatten(v, path=""):
    """JSON as one line per value, "a.b[2].c = value", in document order."""
    if isinstance(v, dict):
        if not v:
            yield f"{path} = {{}}"
        for k, x in v.items():
            yield from flatten(x, f"{path}.{k}" if path else k)
    elif isinstance(v, list):
        if not v:
            yield f"{path} = []"
        for i, x in enumerate(v):
            yield from flatten(x, f"{path}[{i}]")
    else:
        yield f"{path} = {json.dumps(v, ensure_ascii=False)}"


def _merge(toks):
    """Adjacent text runs (split by a comment) are one run."""
    out = []
    for t in toks:
        if t.startswith("T ") and out and out[-1].startswith("T "):
            out[-1] = "T " + WS.sub(" ", out[-1][2:] + t[2:])
        else:
            out.append(t)
    return out


def fragment_tokens(s):
    """Tokens for an HTML fragment (any number of top-level nodes), parsed
    as the contents of a page's <main>."""
    doc = parse('<!DOCTYPE html><html><head></head><body><main id="__f">' + s + "</main></body></html>")
    wrapper = doc.getroot().find(".//main")
    toks = tokens(wrapper)
    return toks[1:-1]


def differs(a, b, context=2, limit=12):
    """None when two fragments are the same DOM; else a short diff."""
    ta, tb = fragment_tokens(a), fragment_tokens(b)
    if ta == tb:
        return None
    return diff_text(ta, tb, context, limit)


def diff_text(ta, tb, context=2, limit=12, names=("live", "new")):
    lines = [d for d in difflib.unified_diff(ta, tb, names[0], names[1], n=context, lineterm="") if not d.startswith(("---", "+++"))]
    return " | ".join(x[:200] for x in lines[:limit])
