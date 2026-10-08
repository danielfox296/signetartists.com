#!/usr/bin/env python3
"""Index-sized copies of the blog heroes.

The blog index lists every post with its hero beside it. The heroes are
1600x900 because a post page shows one at full width; the index shows seven
at 208px, so shipping the originals there means about a megabyte to draw
thumbnails. This writes a 2x copy of each one instead.

    python3 scripts/thumbs.py              # write img/thumbs/ for any hero
                                           #   that has no current thumb
    python3 scripts/thumbs.py --force      # rewrite them all

Keyed by the hero's filename, not the post's slug: two posts sharing a hero
share a thumb, and nothing here has to know what a post is called. A thumb is
rewritten when its source is newer, so re-pulling a still and forgetting this
script cannot ship a stale crop.

A hero that is not 16:9 is CROPPED to it, around the point
_src/data/photo-focus.json gives for that photo (its centre when it has
none), the way the page itself crops it (object-fit: cover). Until
2026-10-08 it was resized to 640x360 whatever its shape: Jordan's portrait
came out squashed sideways in the blog list, and the 3:1 panorama of the
range squashed the other way. A thumb is also rewritten when its focus
changes.

build.py falls back to the full hero when a thumb is missing, so the index is
never broken by a post whose thumb has not been generated yet — it is only
heavier. Run this after adding a post or changing a hero, and commit the
output. Needs Pillow; build.py does not, which is why this is a script and
not a build step.
"""

import json
import pathlib
import sys

import yaml
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES = ROOT / "_src" / "pages"
THUMBS = ROOT / "img" / "thumbs"
FOCUS_FILE = ROOT / "_src" / "data" / "photo-focus.json"

# 13rem at the two-column breakpoint is 208px, so 640 wide covers 2x with a
# little room for a wider column later. Quality 78: these are duotones, and
# there is no fine colour detail in them to protect.
WIDTH, HEIGHT, QUALITY = 640, 360, 78


def heroes() -> set:
    """Every hero src named by a non-draft post, repo-relative."""
    found = set()
    for entry in sorted(PAGES.glob("blog-*")):
        path = entry / "content.yaml"
        if not path.exists():
            continue
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        if data.get("draft"):
            continue
        hero = data.get("hero") or {}
        src = hero.get("src") if isinstance(hero, dict) else None
        # Only local files have anything to thumbnail.
        if src and not src.startswith(("http://", "https://", "//")):
            found.add(src.lstrip("/"))
    return found


def focus_of(src: str) -> tuple:
    """(x, y) as fractions, from photo-focus.json's 'x% y%'; the centre by default."""
    try:
        pos = json.loads(FOCUS_FILE.read_text(encoding="utf-8")).get(src)
    except (OSError, ValueError):
        pos = None
    if not pos:
        return 0.5, 0.5
    x, y = (float(v.rstrip("%")) / 100 for v in pos.split())
    return min(max(x, 0.0), 1.0), min(max(y, 0.0), 1.0)


def crop_to_frame(im: Image.Image, focus: tuple) -> Image.Image:
    """The largest WIDTH:HEIGHT box in the photo, placed the way CSS
    object-position places it: the focus point of the photo sits at the
    same point of the frame."""
    w, h = im.size
    want = WIDTH / HEIGHT
    if w / h > want:
        cw = round(h * want)
        left = round((w - cw) * focus[0])
        return im.crop((left, 0, left + cw, h))
    ch = round(w / want)
    top = round((h - ch) * focus[1])
    return im.crop((0, top, w, top + ch))


def main(force: bool = False) -> int:
    THUMBS.mkdir(parents=True, exist_ok=True)
    missing = []
    for src in sorted(heroes()):
        source = ROOT / src
        if not source.exists():
            missing.append(src)
            print(f"  MISS   {src} (no such file)")
            continue
        dest = THUMBS / source.name
        focus = focus_of(src)
        refocused = focus != (0.5, 0.5) and FOCUS_FILE.exists() and dest.exists() \
            and FOCUS_FILE.stat().st_mtime > dest.stat().st_mtime
        if dest.exists() and not force and not refocused and dest.stat().st_mtime >= source.stat().st_mtime:
            print(f"  skip   {dest.name} (current)")
            continue
        with Image.open(source) as im:
            im = crop_to_frame(im.convert("RGB"), focus)
            im = im.resize((WIDTH, HEIGHT), Image.LANCZOS)
            im.save(dest, "JPEG", quality=QUALITY, optimize=True)
        kb = dest.stat().st_size / 1024
        print(f"  wrote  {dest.name:16s} {kb:5.0f} KB "
              f"(from {source.stat().st_size / 1024:.0f} KB)")

    stale = [p for p in THUMBS.glob("*.jpg")
             if p.name not in {pathlib.Path(s).name for s in heroes()}]
    for p in stale:
        print(f"  ORPHAN {p.name} — no post uses it; delete it by hand")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main(force="--force" in sys.argv))
