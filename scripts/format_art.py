#!/usr/bin/env python3
"""Original artwork for the drawn format tiles (2026-09-23, strings added 2026-09-25).

    python3 scripts/format_art.py

Writes these files and nothing else:

    img/live-band-karaoke-card.jpg   1600x900, the card, the page hero poster and og_image
    img/soul-band-card.jpg           1600x900, the same three jobs for the soul and R&B band
    img/funk-band-card.jpg           1600x900, the same three jobs for the funk band
    img/string-quartet-card.jpg      1600x900, the same three jobs for the classical strings format

WHY THIS SCRIPT EXISTS. Until today these three formats shared one interim
stock still, a snare drum, and the roster printed the same photograph three
times in a row on the page that sells them. A spec'd format has no face to
photograph and, by the roster's own rule, never will, so the honest picture
of it is the thing it sells: a lyric screen and a microphone, a 45 on the
turntable, a row of meters lit up. Each tile is drawn from scratch here in
the flat colour of scripts/bird_art.py, so the two sets of artwork read as
one hand. Nothing is reproduced: no record label, no photograph, no logo.
Provenance is this file.

Type is Archivo, the site's own face, out of the woff2 in vendor/fonts by
way of bird_art's loader. The palette is bird_art's, so the roster's drawn
pieces agree on one cream, one ink and one brass.
"""
import math
import pathlib
import sys
import tempfile

from PIL import Image, ImageDraw

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from bird_art import (  # noqa: E402
    BRASS, CREAM, CREAM_DEEP, IMG, INK, MUSTARD, ORANGE, ROSE, TEAL,
    archivo, save, variation,
)

W, H = 1600, 900
INK_SOFT = "#2b2721"      # a groove in the vinyl, a dimmed lyric line
CREAM_DIM = "#9a927c"     # the lines not being sung yet


def tracked(draw, text, font, x, y, fill, tracking=0.0):
    """Left-aligned caps with letterspacing, the way the eyebrows set."""
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + tracking


# --------------------------------------------------------------------------
def karaoke(ttf) -> Image.Image:
    """A lyric screen, one line lit, and a microphone on its stand."""
    im = Image.new("RGB", (W, H), INK)
    d = ImageDraw.Draw(im)

    # The screen: lines of a song, the third one lit because that is the one
    # being sung. Widths vary the way sung lines do.
    widths = (500, 410, 560, 360, 590, 450, 400)
    x0, y = 800, 110
    for i, wide in enumerate(widths):
        colour = BRASS if i == 2 else CREAM_DIM
        d.rounded_rectangle([x0, y, x0 + wide, y + 24], radius=12, fill=colour)
        y += 62

    # The microphone. Head on a masked layer so the grille stays inside the
    # circle; then the body, the stand and the base.
    cx, cy, r = 400, 300, 150
    head = Image.new("RGB", (2 * r, 2 * r), CREAM)
    hd = ImageDraw.Draw(head)
    for k in range(0, 2 * r, 26):
        hd.line([k, 0, k, 2 * r], fill=INK, width=7)
        hd.line([0, k, 2 * r, k], fill=INK, width=7)
    mask = Image.new("L", (2 * r, 2 * r), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, 2 * r - 1, 2 * r - 1], fill=255)
    im.paste(head, (cx - r, cy - r), mask)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=CREAM, width=14)
    # collar and body, tapering down to the stand
    d.rounded_rectangle([cx - 92, cy + 120, cx + 92, cy + 200], radius=18, fill=CREAM)
    d.polygon([(cx - 70, cy + 200), (cx + 70, cy + 200), (cx + 44, cy + 360), (cx - 44, cy + 360)], fill=CREAM)
    d.rounded_rectangle([cx - 14, cy + 350, cx + 14, cy + 500], radius=7, fill=CREAM)
    d.ellipse([cx - 120, cy + 470, cx + 120, cy + 540], fill=CREAM)

    big = variation(ttf, 118, 800, 112)
    small = variation(ttf, 28, 600, 100)
    tracked(d, "YOUR PEOPLE TAKE THE MIC.", small, 802, 574, CREAM_DIM, tracking=5)
    tracked(d, "LIVE BAND", big, 796, 626, CREAM, tracking=2)
    tracked(d, "KARAOKE", big, 796, 738, BRASS, tracking=2)
    return im


# --------------------------------------------------------------------------
def soul(ttf) -> Image.Image:
    """A 45 on the turntable, and the name in the sleeve's own type."""
    im = Image.new("RGB", (W, H), CREAM)
    d = ImageDraw.Draw(im)

    cx, cy, R = 1250, 450, 320
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=INK)
    # Grooves: thin rings, tighter toward the label, the way a side reads.
    rr = R - 22
    while rr > 178:
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=INK_SOFT, width=2)
        rr -= 9
    # The label: rose with a mustard band, and the big hole a 45 carries.
    d.ellipse([cx - 168, cy - 168, cx + 168, cy + 168], fill=ROSE)
    d.ellipse([cx - 168, cy - 168, cx + 168, cy + 168], outline=MUSTARD, width=10)
    d.ellipse([cx - 60, cy - 60, cx + 60, cy + 60], fill=CREAM)
    # The tonearm, from the top-left corner of the deck.
    d.line([(880, 60), (cx - 200, cy - 180)], fill=INK, width=18)
    d.ellipse([852, 32, 908, 88], fill=INK)
    d.rounded_rectangle([cx - 236, cy - 214, cx - 172, cy - 164], radius=8, fill=INK)

    big = variation(ttf, 132, 800, 112)
    mid = variation(ttf, 132, 800, 112)
    small = variation(ttf, 30, 600, 100)
    tracked(d, "SOUL AND", big, 96, 250, INK, tracking=2)
    tracked(d, "R&B BAND", mid, 96, 372, ROSE, tracking=2)
    tracked(d, "SUNG OUT FRONT, WITH A HORN", small, 100, 528, INK, tracking=5)
    return im


# --------------------------------------------------------------------------
def funk(ttf) -> Image.Image:
    """A row of meters lit up, which is what a funk band does to a desk."""
    im = Image.new("RGB", (W, H), TEAL)
    d = ImageDraw.Draw(im)

    # Twenty-two bars across the lower two thirds, heights following a groove
    # rather than a curve: the accents land on the one and the and-of-two.
    heights = (0.42, 0.66, 0.30, 0.82, 0.54, 0.38, 0.92, 0.48, 0.60, 0.34, 0.76,
               0.50, 0.28, 0.88, 0.44, 0.64, 0.36, 0.72, 0.56, 0.30, 0.84, 0.46)
    n = len(heights)
    gap = 14
    bar = (W - 2 * 96 - gap * (n - 1)) / n
    base = 820
    for i, hgt in enumerate(heights):
        x = 96 + i * (bar + gap)
        top = base - hgt * 470
        colour = MUSTARD if hgt >= 0.8 else (CREAM if hgt >= 0.5 else INK)
        d.rounded_rectangle([x, top, x + bar, base], radius=10, fill=colour)
        # the peak, held a little above each bar
        d.rounded_rectangle([x, top - 30, x + bar, top - 18], radius=6, fill=ORANGE if hgt >= 0.8 else CREAM_DEEP)

    big = variation(ttf, 168, 800, 112)
    small = variation(ttf, 30, 600, 100)
    tracked(d, "FUNK BAND", big, 96, 70, INK, tracking=2)
    tracked(d, "GUITAR, BASS AND DRUMS. THE DANCE FLOOR IS CLOSE TO THE TABLES.", small, 100, 246, CREAM, tracking=4)
    return im


# --------------------------------------------------------------------------
def strings(ttf) -> Image.Image:
    """A violin drawn flat, for the classical strings format (2026-09-25).

    The offer is solo violin to string quartet and nobody in it is named, so
    the picture is the instrument itself: body, neck, scroll, two f-holes and
    four strings, on a mustard field, drawn from the same handful of shapes
    as the other tiles. Nothing is traced from a photograph."""
    im = Image.new("RGB", (W, H), MUSTARD)
    d = ImageDraw.Draw(im)

    # The body: an upper bout, a lower bout, a waist between them, and the two
    # C-bouts cut back out in the field colour. Centred on x=1230, upright.
    cx = 1230
    d.ellipse([cx - 150, 300, cx + 150, 560], fill=INK)          # upper bout
    d.ellipse([cx - 190, 500, cx + 190, 830], fill=INK)          # lower bout
    d.rectangle([cx - 120, 420, cx + 120, 620], fill=INK)        # the waist
    d.ellipse([cx - 245, 455, cx - 95, 600], fill=MUSTARD)       # left C-bout
    d.ellipse([cx + 95, 455, cx + 245, 600], fill=MUSTARD)       # right C-bout
    # The neck, the fingerboard and the scroll above the body.
    d.rounded_rectangle([cx - 26, 90, cx + 26, 380], radius=10, fill=INK)
    d.ellipse([cx - 44, 40, cx + 44, 128], fill=INK)             # the scroll
    d.ellipse([cx - 18, 66, cx + 18, 102], fill=MUSTARD)         # its turn
    # The tailpiece, and the bridge as a cream bar.
    d.polygon([(cx - 34, 690), (cx + 34, 690), (cx + 22, 810), (cx - 22, 810)], fill=CREAM_DEEP)
    d.rectangle([cx - 46, 640, cx + 46, 652], fill=CREAM)
    # Four strings from the scroll to the tailpiece.
    for i, off in enumerate((-15, -5, 5, 15)):
        d.line([(cx + off, 118), (cx + off * 1.6, 700)], fill=CREAM, width=3)
    # The f-holes: two short cream strokes with a dot at each end, mirrored.
    for sgn in (-1, 1):
        x = cx + sgn * 82
        d.line([(x - sgn * 10, 560), (x + sgn * 10, 660)], fill=CREAM, width=8)
        d.ellipse([x - sgn * 10 - 9, 551, x - sgn * 10 + 9, 569], fill=CREAM)
        d.ellipse([x + sgn * 10 - 9, 651, x + sgn * 10 + 9, 669], fill=CREAM)

    big = variation(ttf, 132, 800, 112)
    small = variation(ttf, 30, 600, 100)
    tracked(d, "CLASSICAL", big, 96, 250, INK, tracking=2)
    tracked(d, "STRINGS", big, 96, 372, CREAM, tracking=2)
    tracked(d, "SOLO VIOLIN TO STRING QUARTET", small, 100, 528, INK, tracking=5)
    return im


def main() -> None:
    with tempfile.TemporaryDirectory() as td:
        ttf = archivo(pathlib.Path(td))
        print("format_art:")
        save(karaoke(ttf), IMG / "live-band-karaoke-card.jpg")
        save(soul(ttf), IMG / "soul-band-card.jpg")
        save(funk(ttf), IMG / "funk-band-card.jpg")
        save(strings(ttf), IMG / "string-quartet-card.jpg")


if __name__ == "__main__":
    main()
