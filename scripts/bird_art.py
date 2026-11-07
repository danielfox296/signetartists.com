#!/usr/bin/env python3
"""Original sleeve artwork for Your Bird Can Sing (2026-09-22).

    python3 scripts/bird_art.py

Writes three files and nothing else:

    img/your-bird-can-sing-card.jpg          1600x900, the roster card and og_image
    img/acts/your-bird-can-sing-sleeve.jpg   1400x1400, the sleeve with the act name
    img/acts/your-bird-can-sing-songbook.jpg 1400x1050, the sing booklets

WHY THIS SCRIPT EXISTS. The act had no photography when it was published and
Daniel wanted record-sleeve artwork on the page. The artwork here is drawn
from scratch in this file, in the visual language of mid-sixties sleeve design
(a sunburst, flat colour, a flock in silhouette), and it reproduces nothing:
no album cover, no photograph, no likeness. Every shape is a path written
below. That matters because the repo is public and every asset on the site is
a claim about where it came from; this one's provenance is the file you are
reading.

The birds are the act's own name made visible, so the artwork belongs to this
act and to no other. Nothing here is reusable as generic decoration, which is
the point: scripts/stills.py exists for interim stock and marks its output as
a placeholder. This is not a placeholder. It ships as the act's artwork and
stays when photography arrives, the way a sleeve stays when a band gets a
press shot.

Type is Archivo, the site's own face, decompressed out of the woff2 in
vendor/fonts so the script needs nothing that is not already in the repo.
"""
import io
import pathlib
import tempfile

import cairosvg
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
IMG = ROOT / "img"
ACTS = IMG / "acts"
WOFF2 = ROOT / "vendor" / "fonts" / "archivo-variable-latin.woff2"

# The palette. Cream and ink are the sleeve; the four accents are the era.
# Brass is the site's own --brass token, so the artwork and the page agree
# on one colour rather than nearly agreeing on two.
CREAM = "#f4ecd8"
CREAM_DEEP = "#e8dcc0"
INK = "#16140f"
ROSE = "#c9456b"
TEAL = "#2f8f8a"
ORANGE = "#d4622a"
BRASS = "#c9a45a"
MUSTARD = "#e0a93b"


# --------------------------------------------------------------------------
# The bird. One shape, drawn once, in a local box about 114 wide and 63 tall
# with the beak at the right. Body, forked tail, two raised wings, one eye
# knocked out of the fill so it reads at card size and at thumbnail size.
# --------------------------------------------------------------------------
def bird(fill: str, eye: str = CREAM) -> str:
    return f"""<g fill="{fill}">
 <path d="M 34,50 C 30,42 32,33 40,27 C 48,21 58,18 68,17
          C 74,14 82,11 89,12 C 95,13 99,17 100,22
          L 114,26 L 100,31
          C 100,38 95,44 87,48 C 76,53 62,56 52,55 C 44,54 38,53 34,50 Z"/>
 <path d="M 38,46 C 28,49 17,55 6,63 C 13,56 18,49 20,43
          C 13,43 7,41 1,37 C 11,40 22,43 34,43 Z"/>
 <path d="M 46,28 C 42,18 44,6 52,0 C 60,6 66,16 70,25 C 62,24 53,25 46,28 Z"/>
 <path d="M 58,26 C 58,16 64,6 74,2 C 76,12 74,22 70,27 C 66,25 62,25 58,26 Z"/>
 <circle cx="90" cy="23" r="2.9" fill="{eye}"/>
</g>"""


BEAK = (118.0, 28.0)   # the tip of the beak in the bird's own coordinates


def place(inner: str, x: float, y: float, scale: float, rot: float = 0.0) -> str:
    return f'<g transform="translate({x},{y}) rotate({rot}) scale({scale})">{inner}</g>'


def beak_at(x: float, y: float, scale: float, rot: float) -> tuple:
    """Where a placed bird's beak ends up. SVG applies translate, then rotate,
    then scale, so the song arcs have to be put through the same order or they
    come out behind the bird instead of in front of it."""
    import math
    a = math.radians(rot)
    px, py = BEAK[0] * scale, BEAK[1] * scale
    return (x + px * math.cos(a) - py * math.sin(a),
            y + px * math.sin(a) + py * math.cos(a))


def song(x: float, y: float, colour: str, scale: float = 1.0) -> str:
    """Three arcs off a beak. The act sings, so the birds do."""
    arcs = "".join(
        f'<path d="M {r*0.55},{-r*0.62} A {r},{r} 0 0 1 {r*0.55},{r*0.62}" '
        f'fill="none" stroke="{colour}" stroke-width="{3.4/ (i*0.45+1)+1.6}" stroke-linecap="round"/>'
        for i, r in enumerate((13, 22, 31))
    )
    return f'<g transform="translate({x},{y}) scale({scale})">{arcs}</g>'


def flock_svg(flock, colour=INK) -> str:
    """Draw the birds, then hang song arcs off the beaks of the ones marked to
    sing. Arcs go on last so they sit over the rays and never under a wing."""
    birds = "".join(place(bird(c), x, y, s, r) for x, y, s, r, c, _ in flock)
    arcs = []
    for x, y, s, r, _c, sings in flock:
        if not sings:
            continue
        bx, by = beak_at(x, y, s, r)
        arcs.append(song(bx + 16 * s, by, colour, s * 0.95))
    return birds + "".join(arcs)


def sunburst(cx: float, cy: float, r: float, colour: str, spokes: int = 24,
             opacity: float = 1.0, start: float = 0.0) -> str:
    """Alternating wedges from a point. The oldest trick in sleeve design and
    still the one that makes flat colour look like light."""
    import math
    out = []
    step = 360.0 / spokes
    for i in range(0, spokes, 2):
        a0 = math.radians(start + i * step)
        a1 = math.radians(start + (i + 1) * step)
        x0, y0 = cx + r * math.cos(a0), cy + r * math.sin(a0)
        x1, y1 = cx + r * math.cos(a1), cy + r * math.sin(a1)
        out.append(f'<path d="M {cx},{cy} L {x0},{y0} A {r},{r} 0 0 1 {x1},{y1} Z" '
                   f'fill="{colour}" opacity="{opacity}"/>')
    return "".join(out)


def rings(cx: float, cy: float, radii, colours) -> str:
    return "".join(
        f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{c}"/>'
        for r, c in zip(radii, colours)
    )


# --------------------------------------------------------------------------
# The three pieces
# --------------------------------------------------------------------------
def card_svg(w=1600, h=900) -> str:
    """The roster card and the og_image. No type: the roster prints the act's
    name beside it and the page prints it above, so type here would say the
    name three times in one screen."""
    flock = [
        # x, y, scale, rotation, colour, sings
        (60, 690, 2.05, -8, INK, True),
        (255, 585, 1.30, -15, ROSE, False),
        (452, 742, 0.88, 5, TEAL, False),
        (455, 500, 1.70, -11, INK, True),
        (700, 405, 1.12, -18, ORANGE, False),
        (640, 625, 0.80, 6, INK, False),
        (830, 550, 0.92, -4, ROSE, False),
        (880, 300, 1.40, -21, INK, True),
        (1058, 470, 0.70, 2, ORANGE, False),
        (1122, 590, 0.60, -9, INK, False),
    ]
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
  <rect width="{w}" height="{h}" fill="{CREAM}"/>
  <g>{sunburst(1330, 170, 1500, CREAM_DEEP, spokes=34, start=96)}</g>
  {rings(1330, 170, (336, 256, 182, 112), (MUSTARD, ORANGE, ROSE, CREAM))}
  <circle cx="1330" cy="170" r="112" fill="none" stroke="{INK}" stroke-width="8"/>
  {flock_svg(flock)}
</svg>"""


def sleeve_svg(size=1400) -> str:
    """The sleeve. Type goes on in Pillow afterwards, so the art keeps the
    lower third clear and the flock stays off the sun, where a silhouette
    against the rings turns into a smudge."""
    flock = [
        (105, 545, 2.15, -10, INK, True),
        (330, 690, 1.05, 4, ROSE, False),
        (745, 660, 1.25, -14, INK, True),
        (1005, 165, 1.00, -22, ORANGE, False),
        (1075, 425, 0.80, -6, TEAL, False),
        (1205, 625, 0.56, 2, ROSE, False),
    ]
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">
  <rect width="{size}" height="{size}" fill="{CREAM}"/>
  <g>{sunburst(700, 300, 1450, CREAM_DEEP, spokes=40, start=8)}</g>
  {rings(700, 300, (300, 228, 160, 94), (MUSTARD, ORANGE, ROSE, CREAM))}
  <circle cx="700" cy="300" r="94" fill="none" stroke="{INK}" stroke-width="8"/>
  {flock_svg(flock)}
  <rect x="44" y="44" width="{size-88}" height="{size-88}" fill="none" stroke="{INK}" stroke-width="9"/>
</svg>"""


def songbook_svg(w=1400, h=1050) -> str:
    """The booklets, which are the part of the night nobody else sells. Two
    open pages, ruled for words, and the songs leaving the page."""
    # Lyric lines, not ruled paper: the lengths vary the way sung lines do,
    # and a short one every few rows reads as the end of a verse.
    widths = (322, 268, 338, 214, 352, 296, 244, 330, 282, 196, 318)
    lines = []
    for x0 in (248, 762):
        for i, wide in enumerate(widths):
            y = 452 + i * 44
            lines.append(f'<rect x="{x0}" y="{y}" width="{wide}" height="9" rx="4.5" fill="{INK}" opacity="0.72"/>')
    ruled = "".join(lines)
    flock = [
        (718, 252, 1.30, -18, ROSE, True),
        (938, 140, 0.92, -25, ORANGE, False),
        (1088, 292, 0.66, -6, CREAM, False),
        (470, 196, 0.80, -30, INK, False),
    ]
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
  <rect width="{w}" height="{h}" fill="{TEAL}"/>
  <g>{sunburst(700, 660, 1300, "#37a39d", spokes=36, start=5)}</g>
  <g>
    <path d="M 120,400 L 690,352 L 690,980 L 120,952 Z" fill="{CREAM}"/>
    <path d="M 1280,400 L 710,352 L 710,980 L 1280,952 Z" fill="{CREAM}"/>
    <path d="M 690,352 L 710,352 L 710,980 L 690,980 Z" fill="{CREAM_DEEP}"/>
    <path d="M 120,400 L 690,352 L 690,980 L 120,952 Z" fill="none" stroke="{INK}" stroke-width="8"/>
    <path d="M 1280,400 L 710,352 L 710,980 L 1280,952 Z" fill="none" stroke="{INK}" stroke-width="8"/>
  </g>
  {ruled}
  {flock_svg(flock, CREAM)}
</svg>"""


# --------------------------------------------------------------------------
def archivo(tmp: pathlib.Path) -> pathlib.Path:
    """The site's own Archivo, out of the woff2 the pages already load."""
    from fontTools.ttLib import TTFont
    out = tmp / "archivo.ttf"
    f = TTFont(str(WOFF2))
    f.flavor = None
    f.save(str(out))
    return out


def variation(path: pathlib.Path, size: int, weight: float, width: float = 100.0):
    font = ImageFont.truetype(str(path), size)
    try:
        font.set_variation_by_axes([weight, width])
    except Exception:
        pass
    return font


def raster(svg: str, w: int, h: int) -> Image.Image:
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=w, output_height=h)
    return Image.open(io.BytesIO(png)).convert("RGB")


def save(im: Image.Image, path: pathlib.Path, quality: int = 88) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "JPEG", quality=quality, optimize=True, progressive=True)
    print(f"  {path.relative_to(ROOT)}  {im.size[0]}x{im.size[1]}  {path.stat().st_size//1024} KB")


def centred(draw, text, font, cx, y, fill, tracking=0):
    if tracking:
        widths = [draw.textlength(ch, font=font) for ch in text]
        total = sum(widths) + tracking * (len(text) - 1)
        x = cx - total / 2
        for ch, wd in zip(text, widths):
            draw.text((x, y), ch, font=font, fill=fill)
            x += wd + tracking
        return
    w = draw.textlength(text, font=font)
    draw.text((cx - w / 2, y), text, font=font, fill=fill)


def main() -> None:
    with tempfile.TemporaryDirectory() as td:
        tmp = pathlib.Path(td)
        ttf = archivo(tmp)

        print("bird_art:")
        save(raster(card_svg(), 1600, 900), IMG / "your-bird-can-sing-card.jpg")

        sleeve = raster(sleeve_svg(), 1400, 1400)
        d = ImageDraw.Draw(sleeve)
        big = variation(ttf, 168, 800, 112)
        small = variation(ttf, 44, 600, 100)
        centred(d, "YOUR BIRD", big, 700, 800, INK, tracking=2)
        centred(d, "CAN SING", big, 700, 968, INK, tracking=2)
        centred(d, "A BEATLES SING-ALONG", small, 700, 1182, ORANGE, tracking=13)
        save(sleeve, ACTS / "your-bird-can-sing-sleeve.jpg")

        book = raster(songbook_svg(), 1400, 1050)
        d = ImageDraw.Draw(book)
        head = variation(ttf, 62, 800, 112)
        centred(d, "THE SING BOOKLETS", head, 700, 60, CREAM, tracking=8)
        save(book, ACTS / "your-bird-can-sing-songbook.jpg")


if __name__ == "__main__":
    main()
