#!/usr/bin/env python3
"""Draw the band illustrations for Your Bird Can Sing and the yacht rock band.

    python3 scripts/band_art.py
"""
import io
import math
import pathlib
import sys

import cairosvg
from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from bird_art import (  # noqa: E402
    BRASS, CREAM, CREAM_DEEP, IMG, INK, MUSTARD, ORANGE, ROSE, TEAL, bird,
)

W, H = 1600, 900
SKIN = "#efc9a4"
SHIRT = "#fbf6ea"


def svg_doc(body: str) -> str:
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
            f'viewBox="0 0 {W} {H}">{body}</svg>')


def render(svg: str, out: pathlib.Path) -> None:
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=W, output_height=H)
    Image.open(io.BytesIO(png)).convert("RGB").save(out, "JPEG", quality=90, optimize=True, progressive=True)
    print("wrote", out.relative_to(IMG.parent))


def rays(cx, cy, n, a, b) -> str:
    out = [f'<rect width="{W}" height="{H}" fill="{a}"/>']
    r = 3000
    for i in range(n):
        if i % 2:
            continue
        t0 = 2 * math.pi * i / n
        t1 = 2 * math.pi * (i + 1) / n
        out.append(f'<path d="M {cx},{cy} L {cx + r * math.cos(t0):.1f},{cy + r * math.sin(t0):.1f} '
                   f'L {cx + r * math.cos(t1):.1f},{cy + r * math.sin(t1):.1f} Z" fill="{b}"/>')
    return "".join(out)


# A player, drawn facing out with the feet at the origin, about 560 units tall.

def mop_top() -> str:
    return (f'<path d="M -43,-462 C -54,-526 -32,-556 0,-557 C 32,-556 54,-526 43,-462 '
            f'C 39,-468 35,-478 33,-494 Q 24,-500 16,-494 Q 8,-501 0,-495 Q -8,-501 -16,-494 '
            f'Q -24,-500 -33,-494 C -35,-478 -39,-468 -43,-462 Z" fill="{INK}"/>')


def head(hair: str) -> str:
    return (f'<rect x="-12" y="-468" width="24" height="40" fill="{SKIN}"/>'
            f'<ellipse cx="0" cy="-492" rx="31" ry="39" fill="{SKIN}"/>' + hair)


def suit(jacket: str, trousers: str = INK, tie: bool = True) -> str:
    legs = (f'<path d="M -42,-250 L -36,-10 L -12,-10 L -3,-205 L 3,-205 L 12,-10 L 36,-10 L 42,-250 Z" fill="{trousers}"/>'
            f'<ellipse cx="-25" cy="-7" rx="23" ry="9" fill="{INK}"/>'
            f'<ellipse cx="25" cy="-7" rx="23" ry="9" fill="{INK}"/>')
    shirt = f'<path d="M -26,-440 L 26,-440 L 0,-388 Z" fill="{SHIRT}"/>'
    jacket_path = (f'<path d="M -68,-424 Q -74,-330 -56,-238 L 56,-238 Q 74,-330 68,-424 '
                   f'Q 46,-442 24,-440 Q 0,-392 -24,-440 Q -46,-442 -68,-424 Z" fill="{jacket}"/>')
    tie_path = f'<path d="M -4,-437 L 4,-437 L 5,-404 L 0,-396 L -5,-404 Z" fill="{INK}"/>' if tie else ""
    return legs + shirt + jacket_path + tie_path


def arm(points, colour, width=27) -> str:
    d = "M " + " L ".join(f"{x},{y}" for x, y in points)
    hx, hy = points[-1]
    return (f'<path d="{d}" fill="none" stroke="{colour}" stroke-width="{width}" '
            f'stroke-linecap="round" stroke-linejoin="round"/>'
            f'<circle cx="{hx}" cy="{hy}" r="12" fill="{SKIN}"/>')


def guitar(body: str, length: int = 250) -> str:
    """A hollow-body guitar along +x from its lower bout at the origin."""
    return (f'<rect x="80" y="-7" width="{length - 80}" height="14" rx="3" fill="{INK}"/>'
            f'<rect x="{length - 4}" y="-14" width="40" height="28" rx="6" fill="{INK}"/>'
            f'<circle cx="0" cy="0" r="60" fill="{body}"/>'
            f'<circle cx="58" cy="0" r="45" fill="{body}"/>'
            f'<path d="M -30,-28 C -40,-10 -40,10 -30,28" stroke="{INK}" stroke-width="5" fill="none"/>'
            f'<rect x="8" y="-20" width="12" height="40" rx="3" fill="{INK}"/>'
            f'<rect x="40" y="-17" width="10" height="34" rx="3" fill="{INK}"/>'
            f'<circle cx="0" cy="0" r="60" fill="none" stroke="{INK}" stroke-width="4"/>')


def violin_bass(body: str) -> str:
    return (f'<rect x="80" y="-7" width="215" height="14" rx="3" fill="{INK}"/>'
            f'<path d="M 292,-11 L 330,-15 L 330,15 L 292,11 Z" fill="{INK}"/>'
            f'<ellipse cx="0" cy="0" rx="52" ry="50" fill="{body}"/>'
            f'<ellipse cx="68" cy="0" rx="38" ry="38" fill="{body}"/>'
            f'<rect x="30" y="-24" width="14" height="48" fill="{body}"/>'
            f'<rect x="-8" y="-16" width="10" height="32" rx="3" fill="{INK}"/>'
            f'<rect x="38" y="-14" width="10" height="28" rx="3" fill="{INK}"/>'
            f'<rect x="-34" y="-12" width="8" height="24" rx="2" fill="{INK}"/>')


def mic_stand(height=455, x=0) -> str:
    return (f'<path d="M {x - 34},-2 L {x},-40 L {x + 34},-2" stroke="{INK}" stroke-width="6" fill="none" stroke-linecap="round"/>'
            f'<rect x="{x - 3}" y="-{height}" width="6" height="{height - 30}" fill="{INK}"/>'
            f'<rect x="{x - 9}" y="-{height + 22}" width="18" height="30" rx="9" fill="{INK}"/>')


def guitarist(body_colour: str, jacket: str = INK, hair: str = None) -> str:
    g = f'<g transform="translate(-28,-282) rotate(-24)">{guitar(body_colour)}</g>'
    strum = arm([(-60, -412), (-76, -326), (-34, -292)], jacket)
    fret = arm([(60, -412), (88, -340), (150, -380)], jacket)
    return suit(jacket) + head(hair or mop_top()) + g + strum + fret + mic_stand()


def bassist(body_colour: str, jacket: str = INK) -> str:
    """Played left-handed: the figure is drawn right-handed and mirrored."""
    g = f'<g transform="translate(-26,-280) rotate(-22)">{violin_bass(body_colour)}</g>'
    pluck = arm([(-60, -412), (-74, -326), (-30, -290)], jacket)
    fret = arm([(60, -412), (92, -346), (168, -386)], jacket)
    return f'<g transform="scale(-1,1)">{suit(jacket) + head(mop_top()) + g + pluck + fret}</g>' + mic_stand()


def drummer(head_colour: str = CREAM) -> str:
    """Behind the kit on a riser; the bass drum head carries a bird."""
    sticks = (arm([(-60, -412), (-112, -352), (-150, -400)], INK)
              + arm([(60, -412), (112, -352), (150, -400)], INK)
              + f'<path d="M -150,-400 L -205,-458" stroke="{BRASS}" stroke-width="7" stroke-linecap="round"/>'
              + f'<path d="M 150,-400 L 210,-452" stroke="{BRASS}" stroke-width="7" stroke-linecap="round"/>')
    upper = (f'<path d="M -68,-424 Q -74,-330 -60,-250 L 60,-250 Q 74,-330 68,-424 '
             f'Q 46,-442 24,-440 Q 0,-392 -24,-440 Q -46,-442 -68,-424 Z" fill="{INK}"/>')
    shirt = f'<path d="M -26,-440 L 26,-440 L 0,-388 Z" fill="{SHIRT}"/>'
    tie = f'<path d="M -4,-437 L 4,-437 L 5,-404 L 0,-396 L -5,-404 Z" fill="{INK}"/>'
    cymbals = (f'<rect x="-262" y="-430" width="6" height="430" fill="{INK}"/>'
               f'<ellipse cx="-259" cy="-430" rx="78" ry="12" fill="{BRASS}"/>'
               f'<rect x="256" y="-470" width="6" height="470" fill="{INK}"/>'
               f'<ellipse cx="259" cy="-470" rx="84" ry="13" fill="{BRASS}"/>')
    toms = (f'<rect x="-128" y="-300" width="96" height="62" rx="8" fill="{ROSE}"/>'
            f'<ellipse cx="-80" cy="-300" rx="48" ry="10" fill="{CREAM}" stroke="{INK}" stroke-width="4"/>'
            f'<rect x="32" y="-300" width="96" height="62" rx="8" fill="{ROSE}"/>'
            f'<ellipse cx="80" cy="-300" rx="48" ry="10" fill="{CREAM}" stroke="{INK}" stroke-width="4"/>'
            f'<rect x="150" y="-200" width="110" height="200" rx="8" fill="{ROSE}"/>'
            f'<ellipse cx="205" cy="-200" rx="55" ry="11" fill="{CREAM}" stroke="{INK}" stroke-width="4"/>')
    kick = (f'<circle cx="0" cy="-118" r="118" fill="{ROSE}"/>'
            f'<circle cx="0" cy="-118" r="98" fill="{head_colour}" stroke="{INK}" stroke-width="6"/>'
            f'<g transform="translate(-62,-152) scale(1.05)">{bird(INK)}</g>')
    return cymbals + shirt + upper + tie + head(mop_top()) + sticks + toms + kick


def place(inner: str, x: float, y: float, s: float) -> str:
    return f'<g transform="translate({x},{y}) scale({s})">{inner}</g>'


def beatles() -> str:
    cx, cy = 800, 360
    sun = "".join(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{c}"/>'
                  for r, c in ((330, MUSTARD), (262, ORANGE), (196, ROSE), (128, CREAM)))
    stage = (f'<rect x="0" y="790" width="{W}" height="{H - 790}" fill="{TEAL}"/>'
             f'<rect x="0" y="790" width="{W}" height="8" fill="{INK}"/>'
             f'<rect x="560" y="700" width="480" height="92" fill="{INK}"/>')
    band = (place(drummer(), 800, 700, 0.86)
            + place(bassist(MUSTARD), 300, 852, 1.0)
            + place(guitarist(ORANGE), 560, 852, 1.0)
            + place(guitarist(ROSE), 1300, 852, 1.0))
    return svg_doc(rays(cx, cy, 36, CREAM, CREAM_DEEP) + sun + stage + band)


# The yacht rock band: silhouettes on a deck against a striped sunset.

def captain_hat() -> str:
    return (f'<path d="M -40,-500 C -42,-540 -20,-556 0,-556 C 24,-556 44,-540 42,-500 Z" fill="{SHIRT}"/>'
            f'<rect x="-44" y="-506" width="88" height="14" rx="4" fill="{INK}"/>'
            f'<path d="M -46,-494 Q 0,-482 52,-492 L 46,-484 Q 0,-476 -40,-486 Z" fill="{INK}"/>'
            f'<circle cx="0" cy="-524" r="7" fill="{BRASS}"/>')


def feathered() -> str:
    return (f'<path d="M -44,-450 C -58,-520 -36,-560 2,-560 C 40,-560 60,-520 46,-450 '
            f'C 40,-470 36,-486 30,-500 Q 0,-520 -30,-500 C -36,-486 -40,-470 -44,-450 Z" fill="{INK}"/>')


def curls() -> str:
    return "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{INK}"/>' for x, y, r in (
        (-30, -520, 20), (0, -534, 22), (30, -520, 20), (-38, -496, 15), (38, -496, 15), (-14, -540, 16), (16, -540, 16)))


def shades() -> str:
    return (f'<rect x="-27" y="-500" width="24" height="14" rx="5" fill="{INK}"/>'
            f'<rect x="3" y="-500" width="24" height="14" rx="5" fill="{INK}"/>'
            f'<rect x="-4" y="-496" width="8" height="3" fill="{INK}"/>')


def shirt_figure(top: str, legs: str = INK) -> str:
    """An open-collared shirt, the sleeves rolled, no tie."""
    return (f'<path d="M -42,-250 L -36,-10 L -12,-10 L -3,-205 L 3,-205 L 12,-10 L 36,-10 L 42,-250 Z" fill="{legs}"/>'
            f'<ellipse cx="-25" cy="-7" rx="23" ry="9" fill="{INK}"/>'
            f'<ellipse cx="25" cy="-7" rx="23" ry="9" fill="{INK}"/>'
            f'<path d="M -66,-424 Q -72,-330 -54,-238 L 54,-238 Q 72,-330 66,-424 '
            f'Q 40,-444 18,-440 L 0,-404 L -18,-440 Q -40,-444 -66,-424 Z" fill="{top}"/>'
            f'<path d="M -18,-440 L 0,-404 L 18,-440 L 8,-440 L 0,-422 L -8,-440 Z" fill="{SKIN}"/>')


def sax_player() -> str:
    sax = (f'<path d="M 4,-470 L 10,-452 Q 18,-440 22,-420 L 30,-300 Q 34,-250 0,-246 '
           f'Q -34,-246 -40,-286 L -46,-312 L -24,-318 L -18,-290 Q -14,-270 0,-272 '
           f'Q 10,-272 8,-300 L 2,-420 Q 0,-444 -6,-452 Z" fill="{BRASS}"/>'
           f'<ellipse cx="-36" cy="-316" rx="18" ry="8" fill="{BRASS}" stroke="{INK}" stroke-width="3"/>')
    arms = (arm([(-58, -414), (-64, -350), (-4, -400)], SHIRT)
            + arm([(58, -414), (60, -330), (18, -310)], SHIRT))
    return shirt_figure(SHIRT, INK) + head(feathered() + shades()) + sax + arms


def keys_player() -> str:
    stand = (f'<path d="M -150,0 L 150,-300 M 150,0 L -150,-300" stroke="{INK}" stroke-width="10"/>'
             f'<rect x="-190" y="-326" width="380" height="40" rx="6" fill="{INK}"/>'
             + "".join(f'<rect x="{-180 + i * 24}" y="-322" width="20" height="26" fill="{SHIRT}"/>' for i in range(15))
             + "".join(f'<rect x="{-166 + i * 24}" y="-322" width="11" height="15" fill="{INK}"/>'
                       for i in range(14) if i % 7 not in (2, 6)))
    arms = (arm([(-58, -414), (-80, -350), (-110, -326)], ORANGE)
            + arm([(58, -414), (80, -350), (100, -326)], ORANGE))
    return shirt_figure(ORANGE) + head(captain_hat()) + arms + stand


def yacht_guitarist() -> str:
    g = f'<g transform="translate(-28,-282) rotate(-24)">{guitar(TEAL, 240)}</g>'
    strum = arm([(-60, -412), (-76, -326), (-34, -292)], ROSE)
    fret = arm([(60, -412), (88, -340), (146, -378)], ROSE)
    return shirt_figure(ROSE) + head(curls()) + g + strum + fret


def yacht_bassist() -> str:
    g = f'<g transform="translate(-26,-280) rotate(-22)">{guitar(MUSTARD, 300)}</g>'
    pluck = arm([(-60, -412), (-74, -326), (-30, -290)], SHIRT)
    fret = arm([(60, -412), (92, -346), (168, -386)], SHIRT)
    return shirt_figure(SHIRT, ORANGE) + head(feathered()) + g + pluck + fret


def sailboat(x, y, s, sail=SHIRT) -> str:
    return (f'<g transform="translate({x},{y}) scale({s})">'
            f'<path d="M -60,0 L 60,0 L 46,16 L -46,16 Z" fill="{INK}"/>'
            f'<rect x="-2" y="-130" width="4" height="130" fill="{INK}"/>'
            f'<path d="M 4,-126 L 4,-6 L 64,-6 Z" fill="{sail}"/>'
            f'<path d="M -4,-110 L -4,-6 L -48,-6 Z" fill="{sail}"/></g>')


def yacht() -> str:
    horizon = 520
    bands = [(0, MUSTARD), (90, "#e8b04a"), (170, ORANGE), (250, "#d9533a"), (330, ROSE), (410, "#b93f63")]
    sky = "".join(f'<rect x="0" y="{y}" width="{W}" height="{horizon - y}" fill="{c}"/>' for y, c in bands)
    sun_cx, sun_r = 800, 230
    sun = (f'<clipPath id="sunclip"><rect x="0" y="0" width="{W}" height="{horizon}"/></clipPath>'
           f'<clipPath id="sundisc"><circle cx="{sun_cx}" cy="{horizon}" r="{sun_r}"/></clipPath>'
           f'<g clip-path="url(#sunclip)"><g clip-path="url(#sundisc)"><circle cx="{sun_cx}" cy="{horizon}" r="{sun_r}" fill="{CREAM}"/>'
           + "".join(f'<rect x="0" y="{horizon - 30 - i * 34}" width="{W}" height="{8 + (5 - i) * 3}" fill="#b93f63"/>'
                     for i in range(5) if horizon - 30 - i * 34 > horizon - sun_r)
           + '</g></g>')
    sea = (f'<rect x="0" y="{horizon}" width="{W}" height="{H - horizon}" fill="{TEAL}"/>'
           + "".join(f'<rect x="{x}" y="{y}" width="{w}" height="6" rx="3" fill="{CREAM}" opacity="0.55"/>'
                     for x, y, w in ((640, 545, 320), (700, 575, 200), (560, 560, 90), (980, 560, 70), (740, 600, 120))))
    boats = sailboat(260, 560, 0.9) + sailboat(1330, 548, 0.7) + sailboat(1080, 538, 0.45)
    deck = (f'<rect x="0" y="790" width="{W}" height="{H - 790}" fill="{INK}"/>'
            f'<rect x="0" y="690" width="{W}" height="10" fill="{INK}"/>'
            + "".join(f'<rect x="{x}" y="690" width="8" height="100" fill="{INK}"/>' for x in range(30, W, 110)))
    band = (place(yacht_bassist(), 250, 860, 0.95)
            + place(keys_player(), 640, 850, 0.98)
            + place(sax_player(), 980, 868, 1.04)
            + place(yacht_guitarist(), 1330, 856, 0.98))
    return svg_doc(sky + sun + sea + boats + deck + band)


def main() -> None:
    render(beatles(), IMG / "your-bird-can-sing-band.jpg")
    render(yacht(), IMG / "yacht-rock-band.jpg")


if __name__ == "__main__":
    main()
