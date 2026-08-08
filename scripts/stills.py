#!/usr/bin/env python3
"""Interim photography for signetartists.com.

Same shape as covers.py: one MANIFEST, a `pull` that fetches and verifies, and
provenance written beside the assets. Rebuildable from scratch on command.

    python3 scripts/stills.py pull            # fetch, duotone, write img/
    python3 scripts/stills.py pull --force    # re-download existing
    python3 scripts/stills.py sheet           # contact sheet for eyeballing

THESE ARE PLACEHOLDERS AND THE SITE SAYS SO. WEBSITE-PLAN §6.6 calls the
interim stills scaffolding with a removal date, and DESIGN-DIRECTION bans stock
outright once real photography exists. Everything here is replaced by the shoot.
Two rules keep the interim honest, both inherited from site.json's images note:

  * Objects, gear and empty rooms. No people, ever. A stock photo of a band is
    a claim about our band; a stock photo of a flight case is not.
  * Duotoned hard into the palette so the set reads as art direction rather
    than as five unrelated photographs.

Source: Openverse (api.openverse.org), filtered to licences that permit
commercial use, preferring CC0. No key required. Every hit is recorded in
img/SOURCES.md with its licence, creator and source URL, so an attribution
question has an answer and a bad pull can be traced.

The duotone runs to the DARK palette (--paper #14130e to a warm highlight).
The pre-inversion stills were duotoned for cream and are re-pulled here rather
than re-mapped, since duotoning a duotone compounds the loss.
"""
import json
import pathlib
import sys
import urllib.parse
import urllib.request

from PIL import Image, ImageOps

ROOT = pathlib.Path(__file__).resolve().parent.parent
IMG = ROOT / "img"
API = "https://api.openverse.org/v1/images/"
UA = {"User-Agent": "signetartists.com asset pull (contact hello@signetartists.com)"}

# Duotone endpoints. Shadow is the page ground so images sit in the paper
# rather than on it; the highlight is warm and just short of --ink-soft, so a
# still never out-glares the type beside it.
SHADOW = (20, 19, 14)
HIGHLIGHT = (206, 198, 178)

# slug -> (search query, alt text, what it is for)
MANIFEST = {
    "hero": (
        "empty concert stage lighting rig",
        "An empty stage set with drums, keys and microphones.",
        "home hero",
    ),
    "standards": (
        "trumpet brass instrument still life",
        "A trumpet resting on a table.",
        "acts grid, The Standards",
    ),
    "headliners": (
        "snare drum kit close up microphone",
        "A snare drum with sticks laid across it and a close microphone.",
        "acts grid, The Headliners",
    ),
    "dj": (
        "dj mixer controller booth closeup",
        "A DJ controller and mixer under low light.",
        "acts grid, DJ",
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
    # CC0 first, then by title relevance; anything needing attribution still
    # gets recorded, but a public-domain hit is one less obligation to track.
    results.sort(key=lambda x: (x.get("license") != "cc0",))
    return results[0] if results else None


def duotone(im: Image.Image, w: int = 1600, h: int = 900) -> Image.Image:
    """Crop to ratio, flatten to luminance, remap onto the palette ramp."""
    im = ImageOps.exif_transpose(im).convert("RGB")
    im = ImageOps.fit(im, (w, h), method=Image.LANCZOS, centering=(0.5, 0.45))
    grey = ImageOps.grayscale(im)
    # Widen the tonal range before mapping or a flat source duotones to mud.
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
    for slug, (query, alt, use) in MANIFEST.items():
        dest = IMG / f"{slug}.jpg"
        if dest.exists() and not force:
            print(f"  skip   {slug} (exists)")
            continue
        try:
            hit = search(query)
            if not hit:
                failures.append((slug, "no result"))
                print(f"  MISS   {slug}: nothing matched {query!r}")
                continue
            req = urllib.request.Request(hit["url"], headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read()
            tmp = IMG / f".{slug}.src"
            tmp.write_bytes(raw)
            with Image.open(tmp) as im:
                duotone(im).save(dest, "JPEG", quality=82, optimize=True)
            tmp.unlink()
            sources.append((slug, use, hit))
            print(f"  pulled {slug:11s} {hit.get('license','?'):6s} "
                  f"{(hit.get('title') or '')[:44]}")
        except Exception as e:                                  # noqa: BLE001
            failures.append((slug, str(e)))
            print(f"  FAIL   {slug}: {e}")

    if sources:
        lines = [
            "# Interim still provenance",
            "",
            "PLACEHOLDERS. Every file here is replaced by the shoot "
            "(WEBSITE-PLAN §6.6).",
            "Pulled by `scripts/stills.py` from Openverse, filtered to licences "
            "permitting commercial use.",
            "Objects, gear and empty rooms only: no people, and nothing that "
            "implies it is our band.",
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
        (IMG / "SOURCES.md").write_text("\n".join(lines))
        print(f"\n  wrote img/SOURCES.md ({len(sources)} entries)")

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
