#!/usr/bin/env python3
"""Check text and background contrast in the site's colours."""
import re
import sys
import pathlib

CSS = pathlib.Path(__file__).resolve().parent.parent / "styles.css"

LITERAL = {
    "midnight": "#0a0906",
}

PAIRS = [
    ("ink",          "paper",       4.5, "headings and body on the base ground"),
    ("ink",          "paper-sunk",  4.5, "headings and body on the lifted band"),
    ("ink",          "midnight",    4.5, "type on the night ground"),
    ("ink-soft",     "paper",       4.5, "prose and lede on the base"),
    ("ink-soft",     "paper-sunk",  4.5, "prose and lede on the lifted band"),
    ("ink-soft",     "midnight",    4.5, "prose on the night ground"),
    ("ink-faint",    "paper",       4.5, ".note and table meta on the base"),
    ("ink-faint",    "paper-sunk",  4.5, ".note and table meta on the lifted band"),
    ("brass",        "paper",       4.5, "eyebrow, th, .num-accent on the base"),
    ("brass",        "paper-sunk",  4.5, "eyebrow, th, .num-accent on the band"),
    ("brass-bright", "midnight",    4.5, "night eyebrow"),
    ("rule-strong",  "paper",       3.0, "form-control boundary, base (1.4.11)"),
    ("rule-strong",  "paper-sunk",  3.0, "form-control boundary, band (1.4.11)"),
    ("paper",        "ink",         4.5, ".btn label on its fill"),
    ("paper",        "brass",       4.5, ".eyebrow--slab label on the brass slab"),
    ("midnight",     "brass-bright", 4.5, ".eyebrow--slab label, night variant"),
]


def tokens():
    css = CSS.read_text()
    root = re.search(r":root\s*\{(.*?)\n\}", css, re.S)
    if not root:
        sys.exit("contrast_check: no :root block found in styles.css")
    found = dict(re.findall(r"--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;", root.group(1)))
    found.update({k: v.lstrip("#") and v for k, v in LITERAL.items()})
    return found


def luminance(hexs):
    h = hexs.lstrip("#")
    ch = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    ch = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in ch]
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]


def ratio(a, b):
    la, lb = luminance(a), luminance(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def main():
    t = tokens()
    failures = []
    print(f"{'pair':52s} {'ratio':>6s} {'min':>5s}  verdict")
    print("-" * 78)
    for fg, bg, need, what in PAIRS:
        if fg not in t or bg not in t:
            failures.append(f"missing token: {fg if fg not in t else bg}")
            print(f"{what:52s} {'--':>6s} {need:5.1f}  MISSING TOKEN")
            continue
        r = ratio(t[fg], t[bg])
        ok = r >= need
        if not ok:
            failures.append(f"{what}: {r:.2f} < {need}")
        print(f"{what:52s} {r:6.2f} {need:5.1f}  {'pass' if ok else 'FAIL'}")

    print()
    if failures:
        print(f"{len(failures)} FAILURE(S):")
        for f in failures:
            print("  " + f)
        return 1
    print(f"All {len(PAIRS)} pairs clear WCAG AA.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
