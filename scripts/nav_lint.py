#!/usr/bin/env python3
"""nav_lint — the orientation surfaces have to make sense side by side.

Added 2026-09-22 after the footer shipped with "Pricing" and "What live music
costs" as adjacent rows in the same column. Two URLs, one question, and to
anyone scanning the column it reads as the site repeating itself. Daniel found
it in about four seconds; nothing in the build had any opinion about it.

Three checks, all on the BUILT html, because that is what a person sees:

  A  the same URL twice in one list
  B  two labels in one list that answer the same question (TOPICS below)
  C  one URL wearing different labels across the orientation surfaces
  D  one footer label contained inside another (warning only)

C is a warning, not an error, for the surfaces that deliberately differ:
/sitemap/ uses long descriptive anchors on purpose and breadcrumbs use short
ones, so neither is read here. What is read is the header row, the mobile
menu, the footer and the 404 — the four places the site tells someone where
they can go.

TOPICS is the part that needs a human. "Pricing" and "What live music costs"
share no words, so no amount of string comparison finds them; they collide
because they are the same question. Add a group when a new pair of pages
answers one question, and keep the terms lowercase.
"""

import re
import sys
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

TOPICS = {
    "cost": ["pricing", "price", "prices", "cost", "costs", "rate", "rates",
             "budget", "quote", "fee", "fees", "what live music costs"],
    "roster": ["roster", "acts", "artists", "musicians", "bands", "line-up",
               "lineup", "performers"],
    "songs": ["songs", "repertoire", "setlist", "song list", "song book"],
    "contact": ["contact", "enquiry", "enquire", "inquire", "check a date",
                "get in touch", "book a date"],
    "vendors": ["vendor", "vendors"],
    "planners": ["planner", "planners"],
    "writing": ["blog", "notes", "articles", "posts", "writing"],
    "about": ["about", "our story", "who we are"],
}

errors: list[str] = []
warnings: list[str] = []


def topic_of(label: str) -> str | None:
    low = label.lower()
    for name, terms in TOPICS.items():
        for t in terms:
            if re.search(rf"(?<![a-z]){re.escape(t)}(?![a-z])", low):
                return name
    return None


def links(blob: str) -> list[tuple[str, str]]:
    out = []
    for href, inner in re.findall(r'<a\b[^>]*href="([^"]+)"[^>]*>(.*?)</a>', blob, re.S):
        text = " ".join(re.sub(r"<[^>]+>", " ", inner).split())
        if text:
            out.append((href, text))
    return out


def surfaces(html: str) -> dict[str, list[tuple[str, str]]]:
    """Each named list a visitor reads as one group."""
    out = {}
    for m in re.finditer(r'<nav class="nav-(desktop|mobile)"[^>]*>(.*?)</nav>', html, re.S):
        out[f"header {m.group(1)}"] = links(m.group(2))
    footer = re.search(r"<footer.*?</footer>", html, re.S)
    if footer:
        f = footer.group(0)
        for head, body in re.findall(
            r'<p class="eyebrow">(.*?)</p>\s*<ul class="footer-list">(.*?)</ul>', f, re.S
        ):
            out[f"footer: {re.sub(r'<[^>]+>', '', head).strip()}"] = links(body)
        bar = re.search(r'footer-base-links">(.*?)</ul>', f, re.S)
        if bar:
            out["footer: bottom bar"] = links(bar.group(1))
        contact = re.search(r'footer-contact">(.*?)</div>', f, re.S)
        if contact:
            out["footer: masthead"] = links(contact.group(1))
    return out


def canon(href: str) -> str:
    href = href.split("#")[0].split("?")[0]
    if href.startswith(("mailto:", "tel:", "http")):
        return href
    return "/" + re.sub(r"^(\.\./)+|^/", "", href)


def main() -> int:
    home = ROOT / "index.html"
    nf = ROOT / "404.html"
    if not home.exists():
        print("nav_lint: run build.py first")
        return 1

    lists = surfaces(home.read_text(encoding="utf-8"))
    if nf.exists():
        main_block = re.search(r"<main.*?</main>", nf.read_text(encoding="utf-8"), re.S)
        if main_block:
            lists["404: the way back"] = links(main_block.group(0))

    seen_labels: dict[str, set[str]] = {}

    for name, rows in lists.items():
        # A — the same destination twice in one group
        by_url: dict[str, list[str]] = {}
        for href, label in rows:
            by_url.setdefault(canon(href), []).append(label)
        for url, labs in by_url.items():
            if len(labs) > 1:
                errors.append(f"{name}: {url} appears {len(labs)}x ({', '.join(labs)})")

        # B — two rows answering the same question
        by_topic: dict[str, list[str]] = {}
        for href, label in rows:
            t = topic_of(label)
            if t:
                by_topic.setdefault(t, []).append(f"{label} -> {canon(href)}")
        for topic, labs in by_topic.items():
            if len(labs) > 1:
                errors.append(
                    f'{name}: {len(labs)} rows answer the same question ("{topic}"): '
                    + " | ".join(labs)
                )

        # C — collect labels per destination across surfaces
        for href, label in rows:
            u = canon(href)
            if u.startswith(("mailto:", "http")):
                continue
            seen_labels.setdefault(u, set()).add(label)

    # D — one label swallowed by another, anywhere in the footer. A warning,
    # not an error: "Preferred Vendor List" and "Join the Preferred Vendor
    # List" are a real pair (read it / apply to be on it) and the word "Join"
    # carries the difference. It is still worth seeing, because the shape is
    # the same one that made "Corporate" and "Corporate events" two names for
    # one page.
    footer_rows = [
        (name, label)
        for name, rows in lists.items()
        if name.startswith("footer")
        for _, label in rows
    ]
    for i, (n1, a) in enumerate(footer_rows):
        for n2, b in footer_rows[i + 1:]:
            if a.lower() != b.lower() and a.lower() in b.lower():
                warnings.append(f'"{a}" ({n1}) sits inside "{b}" ({n2})')

    for url, labs in sorted(seen_labels.items()):
        if len({l.lower() for l in labs}) > 1:
            errors.append(f"{url} is labelled {len(labs)} ways: " + " | ".join(sorted(labs)))
        elif len(labs) > 1:
            warnings.append(f"{url} differs only in case: " + " | ".join(sorted(labs)))

    for w in warnings:
        print(f"WARN  {w}")
    for e in errors:
        print(f"ERROR {e}")
    print(f"\nnav_lint: {len(lists)} link groups, {len(errors)} error(s), {len(warnings)} warning(s).")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
