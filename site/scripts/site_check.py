#!/usr/bin/env python3
"""Check titles, descriptions, share images, picture descriptions and structured data on the built site.

    python3 site/scripts/site_check.py _site

Errors stop a deploy; warnings do not. Rules for the page as a whole:

  A  A page's Content-Security-Policy tag covers its inline scripts, event-handler attributes
     and the external script, frame and form-action origins it uses.
  B  Structured data is whole: no null, empty string or empty list; every reference to a node
     on this site resolves on the same page; each act page has exactly one #act node.
  C  Headings: none empty, and none skips a level downward inside main.
  D  llms.txt and llms-full.txt exist, link only to built pages and files, and llms.txt is under 20 KB.
  E  Every sprite <use> points at a sprite file in the build that holds the symbol.
  F  No link or button reads "Check a date" (the label is "Check a Date").
  G  Every visible form control has a label, and every aria-describedby names an element on the page.
"""

import collections
import html
import json
import pathlib
import re
import base64
import hashlib
import struct
import sys

SITE_URL = "https://signetartists.com"

errors: list[str] = []
warnings: list[str] = []


def image_size(path: pathlib.Path):
    """(width, height) of a JPEG or PNG from its header, else None."""
    try:
        data = path.read_bytes()
    except OSError:
        return None
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", data[16:24])
    if data[:2] != b"\xff\xd8":
        return None
    i = 2
    while i + 9 < len(data):
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            h, w = struct.unpack(">HH", data[i + 5 : i + 9])
            return w, h
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        i += 2 + struct.unpack(">H", data[i + 2 : i + 4])[0]
    return None


def meta(page: str, attr: str, name: str):
    m = re.search(rf'<meta {attr}="{re.escape(name)}" content="([^"]*)"', page)
    return html.unescape(m.group(1)) if m else None


def local(url: str, root: pathlib.Path):
    """The file a site URL is served from, or None for another host."""
    if not url.startswith(SITE_URL + "/"):
        return None
    return root / url[len(SITE_URL) + 1 :].split("?")[0]


def picture_key(src: str) -> str:
    """One name per picture, whatever path or size copy a page uses."""
    p = re.sub(r"^(\.\./)+|^\.?/", "", src.split("?")[0])
    return re.sub(r"-\d+w\.(webp|avif)$", ".jpg", p)


def named_by_container(page: str, at: int) -> bool:
    """Whether the link or button around position `at` names itself."""
    for tag in ("a", "button"):
        start = page.rfind(f"<{tag} ", 0, at)
        if start < 0 or page.rfind(f"</{tag}>", 0, at) > start:
            continue
        end = page.find(f"</{tag}>", at)
        whole = page[start:end]
        if re.search(r'aria-label="[^"]+"', whole[: whole.find(">") + 1]):
            return True
        text = re.sub(r"<[^>]+>", " ", whole[whole.find(">") + 1 :])
        if text.split():
            return True
    return False


def backdrop(page: str, at: int) -> bool:
    """Whether the picture at `at` is a backdrop: the only thing in an element
    marked aria-hidden, which screen readers skip."""
    return re.search(r'<div\b[^>]*\saria-hidden="true"[^>]*>\s*$', page[max(0, at - 300) : at]) is not None


# ---- Rule A: policy tag covers the page -------------------------------------------------

def csp_directives(page: str):
    m = re.search(r'<meta http-equiv="Content-Security-Policy" content="([^"]*)"', page)
    if not m:
        return None
    out = {}
    for part in html.unescape(m.group(1)).split(";"):
        bits = part.split()
        if bits:
            out[bits[0]] = bits[1:]
    return out


def origin_allowed(url: str, sources: list[str]) -> bool:
    if not re.match(r"^(https?:)?//", url):
        return "'self'" in sources
    m = re.match(r"^(?:(https?):)?//([^/?#]+)", url)
    scheme, host = (m.group(1) or "https"), m.group(2)
    if host == SITE_URL.split("//")[1] and "'self'" in sources:
        return True
    for src in sources:
        if src.startswith("'"):
            continue
        if src in (scheme + ":", "*"):
            return True
        sm = re.match(r"^(?:(https?|wss?)://)?([^/]+)", src)
        if not sm:
            continue
        pattern = sm.group(2)
        if pattern == host or (pattern.startswith("*.") and host.endswith(pattern[1:])):
            return True
    return False


def check_policy(url: str, page: str, errors: list[str]):
    csp = csp_directives(page)
    if csp is None:
        errors.append(f"{url}: no Content-Security-Policy tag")
        return

    def sources(name: str, *fallbacks: str):
        for n in (name, *fallbacks):
            if n in csp:
                return csp[n]
        return None

    script_src = sources("script-src", "default-src") or []
    hashes = {s.strip("'") for s in script_src if s.startswith("'sha256-")}

    def digest(text: str) -> str:
        return "sha256-" + base64.b64encode(hashlib.sha256(text.encode("utf-8")).digest()).decode()

    for m in re.finditer(r"<script\b([^>]*)>(.*?)</script>", page, re.S):
        attrs, body = m.group(1), m.group(2)
        src = re.search(r'\ssrc="([^"]*)"', " " + attrs)
        if src:
            if not origin_allowed(html.unescape(src.group(1)), script_src):
                errors.append(f"{url}: script {src.group(1)} is not allowed by the policy's script-src")
        elif "application/ld+json" not in attrs and digest(body) not in hashes:
            errors.append(f"{url}: an inline script ({body.strip()[:40]!r}) has no matching hash in the policy")
    handlers = re.findall(r'\s(on[a-z]+)="([^"]*)"', re.sub(r"<script\b.*?</script>", "", page, flags=re.S))
    for name, value in handlers:
        if digest(html.unescape(value)) not in hashes:
            errors.append(f"{url}: the {name} attribute ({html.unescape(value)[:40]!r}) has no matching hash in the policy")
    if handlers and "'unsafe-hashes'" not in script_src:
        errors.append(f"{url}: inline event-handler attributes need 'unsafe-hashes' in the policy's script-src")
    for m in re.finditer(r'<iframe\b[^>]*\ssrc="([^"]*)"', page):
        if not origin_allowed(html.unescape(m.group(1)), sources("frame-src", "child-src", "default-src") or []):
            errors.append(f"{url}: iframe {m.group(1)} is not allowed by the policy's frame-src")
    for m in re.finditer(r'<form\b[^>]*\saction="([^"]*)"', page):
        allowed = sources("form-action")
        if allowed is not None and not origin_allowed(html.unescape(m.group(1)), allowed):
            errors.append(f"{url}: form action {m.group(1)} is not allowed by the policy's form-action")


# ---- Rule B: structured data is whole ---------------------------------------------------

ACT_PAGE = re.compile(r"^/(artists|ensembles)/[^/]+/$")


def check_structured_data(url: str, page: str, errors: list[str]):
    blocks = []
    for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', page, re.S):
        try:
            blocks.append(json.loads(block))
        except json.JSONDecodeError:
            return  # reported by the parse check
    defined, refs = set(), []

    def walk(node, path):
        if isinstance(node, dict):
            if "@id" in node and len(node) > 1:
                defined.add(node["@id"])
            elif list(node) == ["@id"]:
                refs.append(node["@id"])
            for k, v in node.items():
                if v is None or v == "" or v == []:
                    errors.append(f"{url}: structured data property {path}{k} is empty")
                else:
                    walk(v, f"{path}{k}.")
        elif isinstance(node, list):
            for v in node:
                walk(v, path)

    for data in blocks:
        walk(data, "")
    for ref in refs:
        if ref.startswith(SITE_URL) and ref not in defined and ref != f"{SITE_URL}/#business":
            errors.append(f"{url}: structured data refers to {ref}, which no node on the page defines")
    if ACT_PAGE.match(url) and url not in ("/artists/", "/ensembles/"):
        mine = f"{SITE_URL}{url}#act"
        count = sum(1 for d in blocks for n in (d.get("@graph", [d]) if isinstance(d, dict) else d) if isinstance(n, dict) and n.get("@id") == mine)
        if count != 1:
            errors.append(f"{url}: {count} act nodes with the id {mine} (needs exactly one)")


# ---- Rule C: headings -------------------------------------------------------------------

def check_headings(url: str, page: str, errors: list[str]):
    m = re.search(r"<main\b.*?</main>", page, re.S)
    scope = m.group(0) if m else page
    last = 0
    for h in re.finditer(r"<h([1-6])\b[^>]*>(.*?)</h\1>", scope, re.S):
        level = int(h.group(1))
        text = re.sub(r"<[^>]+>", "", h.group(2))
        if not html.unescape(text).strip() and not re.search(r"<img\b[^>]*\salt=\"[^\"]+\"", h.group(2)):
            errors.append(f"{url}: an empty h{level}")
        if last and level > last + 1:
            errors.append(f"{url}: h{last} is followed by h{level} ({html.unescape(text).strip()[:40]!r})")
        last = level


# ---- Rule D: index files ----------------------------------------------------------------

def site_file_exists(link: str, root: pathlib.Path) -> bool:
    path = link[len(SITE_URL) :].split("#")[0].split("?")[0].lstrip("/")
    f = root / path
    return f.is_file() or (f.is_dir() and (f / "index.html").is_file()) or (path == "" and (root / "index.html").is_file())


def check_index_files(root: pathlib.Path, errors: list[str]):
    for name in ("llms.txt", "llms-full.txt"):
        f = root / name
        if not f.is_file():
            errors.append(f"{name} is not in the site")
            continue
        text = f.read_text(encoding="utf-8")
        if name == "llms.txt" and len(text.encode("utf-8")) >= 20 * 1024:
            errors.append(f"llms.txt is {len(text.encode('utf-8'))} bytes (limit 20480)")
        seen = set()
        for link in re.findall(r"https://signetartists\.com[^\s)>\]\"'<]*", text):
            link = link.rstrip(".,;:")
            if link not in seen and link != SITE_URL and not site_file_exists(link, root):
                errors.append(f"{name}: {link} is not a page or file in the site")
            seen.add(link)


# ---- Rule E: sprites --------------------------------------------------------------------

def check_sprites(url: str, page: str, root: pathlib.Path, cache: dict, errors: list[str]):
    for m in re.finditer(r'<use\b[^>]*?\s(?:xlink:)?href="([^"]*)"', page):
        href = html.unescape(m.group(1))
        sm = re.search(r"img/sprites/([^/?#]+\.svg)[^#]*#(.+)$", href)
        if not sm:
            continue
        f = root / "img" / "sprites" / sm.group(1)
        if f not in cache:
            cache[f] = f.read_text(encoding="utf-8") if f.is_file() else None
        if cache[f] is None:
            errors.append(f"{url}: sprite file {sm.group(1)} is not in the site")
        elif not re.search(rf'\bid="{re.escape(sm.group(2))}"', cache[f]):
            errors.append(f"{url}: sprite {sm.group(1)} has no symbol {sm.group(2)}")


# ---- Rule F: button label ---------------------------------------------------------------

def check_button_label(url: str, page: str, errors: list[str]):
    for m in re.finditer(r"<(a|button)\b[^>]*>(.*?)</\1>", page, re.S):
        text = " ".join(html.unescape(re.sub(r"<[^>]+>", " ", m.group(2))).split())
        if text == "Check a date":
            errors.append(f'{url}: a {"link" if m.group(1) == "a" else "button"} reads "Check a date" (the label is "Check a Date")')


# ---- Rule G: form fields ----------------------------------------------------------------

def check_forms(url: str, page: str, errors: list[str]):
    ids = set(re.findall(r'\sid="([^"]*)"', page))
    for form in re.finditer(r"<form\b.*?</form>", page, re.S):
        body = form.group(0)
        label_for = set(re.findall(r'<label\b[^>]*\sfor="([^"]*)"', body))
        wrapped = [(m.start(), m.end()) for m in re.finditer(r"<label\b.*?</label>", body, re.S)]
        for m in re.finditer(r"<(input|select|textarea)\b[^>]*>", body):
            tag = m.group(0)
            kind = re.search(r'\stype="([^"]*)"', tag)
            if m.group(1) == "input" and kind and kind.group(1) in ("hidden", "submit", "button", "reset", "image"):
                continue
            ident = re.search(r'\sid="([^"]*)"', tag)
            labelled = (
                (ident and ident.group(1) in label_for)
                or re.search(r'\saria-label="[^"]+"', tag)
                or any(a < m.start() < b for a, b in wrapped)
            )
            if not labelled:
                name = re.search(r'\sname="([^"]*)"', tag)
                errors.append(f"{url}: a form {m.group(1)} ({name.group(1) if name else ident.group(1) if ident else 'unnamed'}) has no label")
    for m in re.finditer(r'<(?:input|select|textarea)\b[^>]*\saria-describedby="([^"]*)"', page):
        for target in m.group(1).split():
            if target not in ids:
                errors.append(f"{url}: aria-describedby names {target}, which is not on the page")


def main() -> int:
    if len(sys.argv) < 2:
        sys.exit("usage: site_check.py <staged site folder>")
    root = pathlib.Path(sys.argv[1]).resolve()
    pages = []
    for f in sorted(root.rglob("*.html")):
        rel = f.relative_to(root)
        if any(x in rel.parts for x in ("vendor", "admin", "node_modules")):
            continue
        page = f.read_text(encoding="utf-8")
        if 'http-equiv="refresh"' in page:
            continue
        pages.append(("/" + rel.as_posix().replace("index.html", ""), page))

    titles = collections.defaultdict(list)
    descriptions = collections.defaultdict(list)
    alts = collections.defaultdict(set)
    checked_files = {}
    sprites: dict = {}

    def must_exist(url: str, what: str, where: str):
        f = local(url, root)
        if f is None:
            return None
        if f not in checked_files:
            checked_files[f] = image_size(f) if f.exists() else False
        if checked_files[f] is False:
            errors.append(f"{where}: {what} {url} is not in the site")
            return None
        return checked_files[f]

    for url, page in pages:
        indexed = 'content="noindex' not in page

        title = re.search(r"<title>(.*?)</title>", page, re.S)
        title = html.unescape(title.group(1).strip()) if title else ""
        desc = meta(page, "name", "description")
        need = {
            "title": title,
            "description": desc,
            "canonical link": re.search(r'<link rel="canonical" href="[^"]+"', page),
            "share image": meta(page, "property", "og:image"),
            "share image width": meta(page, "property", "og:image:width"),
            "share image height": meta(page, "property", "og:image:height"),
            "share image description": meta(page, "property", "og:image:alt"),
        }
        for what, have in need.items():
            if not have:
                errors.append(f"{url}: no {what}")

        og = meta(page, "property", "og:image")
        if og:
            size = must_exist(og, "the share image", url)
            if size and size[1] > size[0]:
                warnings.append(f"{url}: share image {og} is taller than wide ({size[0]}x{size[1]})")
        if indexed:
            if title:
                titles[title].append(url)
                if len(title) > 60:
                    warnings.append(f"{url}: title is {len(title)} characters (over 60)")
            if desc:
                descriptions[desc].append(url)
                if len(desc) > 160:
                    warnings.append(f"{url}: description is {len(desc)} characters (over 160)")

        for m in re.finditer(r"<img\b[^>]*>", page):
            tag = m.group(0)
            src = re.search(r'\ssrc="([^"]*)"', tag)
            src = src.group(1) if src else "(no src)"
            alt = re.search(r'\salt="([^"]*)"', tag)
            if alt is None:
                errors.append(f"{url}: picture {src} has no alt attribute")
                continue
            text = html.unescape(alt.group(1)).strip()
            if text:
                alts[text].add(picture_key(src))
            elif not named_by_container(page, m.start()) and not backdrop(page, m.start()):
                errors.append(f"{url}: picture {src} has no description and nothing around it names it")

        check_policy(url, page, errors)
        check_structured_data(url, page, errors)
        check_headings(url, page, errors)
        check_sprites(url, page, root, sprites, errors)
        check_button_label(url, page, errors)
        check_forms(url, page, errors)

        for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', page, re.S):
            try:
                data = json.loads(block)
            except json.JSONDecodeError as e:
                errors.append(f"{url}: structured data does not parse ({e.msg})")
                continue
            stack = [data]
            while stack:
                node = stack.pop()
                if isinstance(node, list):
                    stack.extend(node)
                elif isinstance(node, dict):
                    logo = node.get("logo")
                    if isinstance(logo, dict):
                        logo = logo.get("url")
                    if isinstance(logo, str):
                        size = must_exist(logo, "the schema logo", url)
                        if size and (size[0] < 112 or size[1] < 112 or max(size) > 1.2 * min(size)):
                            errors.append(f"{url}: schema logo {logo} is {size[0]}x{size[1]}, not a square of 112px or more")
                    for key in ("image", "thumbnailUrl"):
                        v = node.get(key)
                        for u in v if isinstance(v, list) else [v]:
                            if isinstance(u, str):
                                must_exist(u, f"the schema {key}", url)
                    stack.extend(v for v in node.values() if isinstance(v, (dict, list)))

    check_index_files(root, errors)

    for text, pics in sorted(alts.items()):
        if len(pics) >= 2:
            errors.append(f'"{text}" describes {len(pics)} different pictures: {", ".join(sorted(pics))}')

    for label, groups in (("title", titles), ("description", descriptions)):
        for value, urls in sorted(groups.items()):
            if len(urls) > 1:
                errors.append(f"the same {label} on {len(urls)} pages: {', '.join(urls)}")

    for w in warnings:
        print(f"WARN  {w}")
    for e in errors:
        print(f"ERROR {e}")
    print(f"\nsite_check: {len(pages)} pages, {len(errors)} error(s), {len(warnings)} warning(s).")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
