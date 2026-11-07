#!/usr/bin/env python3
"""Fetch licensed stills and record their sources.

    python3 scripts/stills.py pull            # fetch, duotone, write img/
    python3 scripts/stills.py pull --force    # re-download existing
    python3 scripts/stills.py sheet           # contact sheet for eyeballing
"""
import json
import pathlib
import re
import sys
import urllib.parse
import urllib.request

from PIL import Image, ImageOps

ROOT = pathlib.Path(__file__).resolve().parent.parent
IMG = ROOT / "img"
API = "https://api.openverse.org/v1/images/"
COMMONS = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "signetartists.com asset pull (contact hello@signetartists.com)"}

SHADOW = (20, 19, 14)
HIGHLIGHT = (206, 198, 178)

MANIFEST = {
    "hero": (
        "empty concert stage lighting rig",
        "An empty stage set with drums, keys and microphones.",
        "home hero",
    ),
    "standards": (
        "trumpet brass instrument still life",
        "A trumpet resting on a table.",
        "roster cards: jazz and flamenco slots",
    ),
    "headliners": (
        "snare drum kit close up microphone",
        "A snare drum with sticks laid across it and a close microphone.",
        "roster cards: covers and funk slots",
    ),
    "dj": (
        "dj mixer controller booth closeup",
        "A DJ controller and mixer under low light.",
        "roster cards: DJ slot",
    ),
    "ballroom": (
        "empty hotel ballroom event tables",
        "An empty ballroom set for dinner before guests arrive.",
        "corporate page",
    ),
    "loadin": (
        "road cases flight case equipment backstage",
        "Flight cases stacked at a loading door.",
        "planners hub — the operational proof nobody photographs",
    ),
    "range": (
        "denver skyline mountains colorado",
        "The Denver skyline against the Front Range.",
        "home page locator strip",
        (2400, 800),
    ),
    "ballroom": (
        "empty hotel ballroom event tables",
        "A hotel banquet hall set for dinner before guests arrive.",
        "blog: corporate holiday party venues",
    ),
    "loadin": (
        "road cases flight case equipment backstage",
        "Road cases stacked backstage in a dark hall.",
        "blog: what a band needs from the venue",
    ),
    "outdoor": (
        "event tent dance floor stage outdoor",
        "A frame tent on grass with a plywood stage deck under it.",
        "blog: what changes when the reception is outdoors",
    ),
    "sound-bath": (
        "singing bowls mallet cushion",
        "Three singing bowls on cushions with a mallet beside them.",
        "roster card and page hero: Firstwater",
    ),
    "yacht-rock": (
        "sailboats sunset river silhouette",
        "Two sailboats moored on still water at sunset.",
        "roster card and page hero: yacht rock band",
    ),
}

PICKS = {
    "ballroom": "File:Banquet Hall Thorbj\u00f8rnrud Hotell.jpg",
    "loadin": "File:Salon du Livre 2015 - Les coulisses - 3.jpg",
    "outdoor": "File:Century Tent with Dance Floor and Stage.JPG",
    "sound-bath": "File:AVIV TB 0001.jpg",
    "yacht-rock": "File:Sailboats on the River - Flickr - Corey Leopold.jpg",
}


def commons(title: str):
    """A hit-shaped dict for one named Wikimedia Commons file.

    Same keys `pull` reads off an Openverse result, so a hand-picked source
    is written into SOURCES.md by the same code path as a searched one.
    """
    qs = urllib.parse.urlencode({
        "action": "query", "format": "json", "titles": title,
        "prop": "imageinfo", "iiprop": "url|extmetadata",
    })
    req = urllib.request.Request(COMMONS + "?" + qs, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        data = json.load(r)
    pages = (data.get("query") or {}).get("pages") or {}
    info = (list(pages.values())[0].get("imageinfo") or [None])[0]
    if not info:
        return None
    meta = info.get("extmetadata") or {}
    creator = re.sub(r"<[^>]+>", "", (meta.get("Artist") or {}).get("value", ""))
    return {
        "url": info["url"],
        "title": title[5:],
        "creator": creator.strip() or "unknown",
        "license": (meta.get("LicenseShortName") or {}).get("value", "?"),
        "license_version": "",
        "foreign_landing_url": info.get("descriptionurl"),
    }


def search(query: str):
    """Best commercially-usable candidate for a query, CC0 preferred."""
    qs = urllib.parse.urlencode({
        "q": query,
        "license_type": "commercial",
        "page_size": 12,
        "mature": "false",
    })
    req = urllib.request.Request(API + "?" + qs, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        data = json.load(r)
    results = [x for x in data.get("results", []) if x.get("url")]
    results.sort(key=lambda x: (x.get("license") != "cc0",))
    return results[0] if results else None


def duotone(im: Image.Image, w: int = 1600, h: int = 900) -> Image.Image:
    """Crop to ratio, flatten to luminance, remap onto the palette ramp."""
    im = ImageOps.exif_transpose(im).convert("RGB")
    im = ImageOps.fit(im, (w, h), method=Image.LANCZOS, centering=(0.5, 0.45))
    grey = ImageOps.grayscale(im)
    grey = ImageOps.autocontrast(grey, cutoff=2)
    ramp = []
    for i in range(256):
        t = i / 255
        ramp.append(tuple(round(SHADOW[c] + (HIGHLIGHT[c] - SHADOW[c]) * t)
                          for c in range(3)))
    out = Image.new("RGB", grey.size)
    out.putdata([ramp[p] for p in grey.getdata()])
    return out


def pull(force: bool = False) -> int:
    IMG.mkdir(exist_ok=True)
    sources, failures = [], []
    for slug, spec in MANIFEST.items():
        query, alt, use = spec[:3]
        size = spec[3] if len(spec) > 3 else (1600, 900)
        dest = IMG / f"{slug}.jpg"
        if dest.exists() and not force:
            print(f"  skip   {slug} (exists)")
            continue
        try:
            pick = PICKS.get(slug)
            hit = commons(pick) if pick else search(query)
            if not hit:
                failures.append((slug, "no result"))
                what = f"the picked file {pick!r}" if pick else f"{query!r}"
                print(f"  MISS   {slug}: nothing matched {what}")
                continue
            req = urllib.request.Request(hit["url"], headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read()
            tmp = IMG / f".{slug}.src"
            tmp.write_bytes(raw)
            with Image.open(tmp) as im:
                duotone(im, *size).save(dest, "JPEG", quality=82, optimize=True)
            tmp.unlink()
            sources.append((slug, use, hit))
            print(f"  pulled {slug:11s} {hit.get('license','?'):6s} "
                  f"{(hit.get('title') or '')[:44]}")
        except Exception as e:
            failures.append((slug, str(e)))
            print(f"  FAIL   {slug}: {e}")

    if sources:
        kept = []
        old = IMG / "SOURCES.md"
        if old.exists():
            pulled = {s for s, _, _ in sources}
            section, keep = [], False
            for ln in old.read_text().splitlines():
                if ln.startswith("## "):
                    if keep:
                        kept += section
                    section, keep = [ln], ln[3:].replace(".jpg", "").strip() not in pulled
                elif section:
                    section.append(ln)
            if keep:
                kept += section
        lines = [
            "# Interim still provenance",
            "",
            "Pulled by `scripts/stills.py` from Openverse, filtered to licences "
            "permitting commercial use.",
            "",
        ]
        for slug, use, h in sources:
            lines += [
                f"## {slug}.jpg",
                f"- Used on: {use}",
                f"- Title: {h.get('title') or '(untitled)'}",
                f"- Creator: {h.get('creator') or 'unknown'}",
                f"- Licence: {h.get('license','?')} {h.get('license_version','')}",
                f"- Source: {h.get('foreign_landing_url') or h.get('url')}",
                "",
            ]
        lines += kept
        (IMG / "SOURCES.md").write_text("\n".join(lines))
        print(f"\n  wrote img/SOURCES.md ({len(sources)} new, {sum(1 for ln in kept if ln.startswith('## '))} kept)")

    if failures:
        print(f"\n  {len(failures)} FAILED: " +
              ", ".join(f"{s} ({e[:40]})" for s, e in failures))
    return 1 if failures else 0


def sheet() -> int:
    """Contact sheet. Every asset gets looked at before it ships."""
    files = [IMG / f"{s}.jpg" for s in MANIFEST if (IMG / f"{s}.jpg").exists()]
    if not files:
        print("  nothing to sheet")
        return 1
    tw, th, pad, cols = 480, 270, 12, 2
    rows = (len(files) + cols - 1) // cols
    out = Image.new("RGB",
                    (cols * tw + pad * (cols + 1), rows * th + pad * (rows + 1)),
                    (85, 81, 74))
    for i, f in enumerate(files):
        with Image.open(f) as im:
            out.paste(im.resize((tw, th), Image.LANCZOS),
                      (pad + (i % cols) * (tw + pad), pad + (i // cols) * (th + pad)))
    dest = ROOT / "img" / ".contact-sheet.jpg"
    out.save(dest, "JPEG", quality=88)
    print(f"  {dest}  ({len(files)} stills)")
    return 0


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "pull"
    if cmd == "sheet":
        sys.exit(sheet())
    sys.exit(pull(force="--force" in sys.argv))
