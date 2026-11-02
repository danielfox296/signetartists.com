#!/usr/bin/env python3
"""site_check — what a page tells search engines, social apps and screen
readers about itself, checked on the staged site before it deploys.

Added 2026-11-02. The 2026-11-02 audit found the share card on 38 pages still
the retired typeset card, Google given the old "S" as the logo, "A trumpet
resting on a table." describing nine pictures that were not trumpets, and no
page saying its share image's size or what it shows. Nothing in the build had
an opinion about any of it, and the checks that used to stop a deploy
(nav_lint and the rest) stopped running when _src/ was retired on 2026-10-16.
This holds the line on the class, not the instances.

Run on the staged site (the repo's static files with the build over them),
because that is what is served:

    python3 site/scripts/site_check.py _site

Errors fail the deploy; warnings print and pass.

  K  a page without a title, description, canonical, share image, share
     image size or share image description
  L  a share image, schema logo or schema image that is not in the site
  M  a picture with no alt attribute, or an empty one that nothing explains:
     alt="" is right only inside a link or button that names it (a card's
     title, a video's "Play video: ..." label)
  N  one description on two or more different pictures: the trumpet case, a
     page copied and its picture swapped with the old description kept. Two
     crops of one photograph get two descriptions
  O  structured data that does not parse, or a schema logo that is not a
     square of at least 112px (Google's floor for a logo)
  P  two indexed pages with the same title or the same description
  Q  a share image taller than it is wide (feeds crop it to a wide strip)
     and a title over 60 or description over 160 characters: warnings
"""

import collections
import html
import json
import pathlib
import re
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
            continue  # a redirect stub: nothing to describe
        pages.append(("/" + rel.as_posix().replace("index.html", ""), page))

    titles = collections.defaultdict(list)
    descriptions = collections.defaultdict(list)
    alts = collections.defaultdict(set)
    checked_files = {}

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

        # K
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

        # L, Q
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

        # M, N
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
            elif not named_by_container(page, m.start()):
                errors.append(f"{url}: picture {src} has no description and nothing around it names it")

        # O, L
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

    # N
    for text, pics in sorted(alts.items()):
        if len(pics) >= 2:
            errors.append(f'"{text}" describes {len(pics)} different pictures: {", ".join(sorted(pics))}')

    # P
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
