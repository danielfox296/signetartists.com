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

build.py falls back to the full hero when a thumb is missing, so the index is
never broken by a post whose thumb has not been generated yet — it is only
heavier. Run this after adding a post or changing a hero, and commit the
output. Needs Pillow; build.py does not, which is why this is a script and
not a build step.
"""

import pathlib
import sys

import yaml
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES = ROOT / "_src" / "pages"
THUMBS = ROOT / "img" / "thumbs"

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
        if dest.exists() and not force and dest.stat().st_mtime >= source.stat().st_mtime:
            print(f"  skip   {dest.name} (current)")
            continue
        with Image.open(source) as im:
            im = im.convert("RGB")
            im.thumbnail((WIDTH * 2, HEIGHT * 2), Image.LANCZOS)
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
