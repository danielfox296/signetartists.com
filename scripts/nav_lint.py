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
  E  /sitemap/ lists every indexable page, exactly once, and nothing else
  F  a breadcrumb or sibling label disagrees with the nav label for that URL
  G  a breadcrumb trail that repeats itself or points at a page not in the build
  H  an anchor anywhere in the build with nothing to click and nothing to read
  I  a TODO marker in anything the build published

/sitemap/ and the breadcrumbs were exempt from C until 2026-09-22, on the
argument that they use different label lengths on purpose — /sitemap/ wants
long descriptive anchors for the pages it indexes, a crumb wants a short name.
That argument holds for C and for nothing else, and "it is different on
purpose" is not the same as "it is checked". E, F and G are what applies to
them: an index that is complete, crumbs that call a page what the nav calls
it, and trails that go somewhere.

B is not run against /sitemap/. An index listing both the pricing page and the
cost guide is an index doing its job, not a page repeating itself.

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
        ways_back = re.search(r'<ul class="spec-list">.*?</ul>', nf.read_text(encoding="utf-8"), re.S)
        if ways_back:
            lists["404: the way back"] = links(ways_back.group(0))

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

    nav_labels = {u: sorted(l)[0] for u, l in seen_labels.items() if len({x.lower() for x in l}) == 1}

    # ---- E: /sitemap/ against the build ---------------------------------
    built = {
        "/" + f.relative_to(ROOT).as_posix().replace("index.html", "")
        for f in ROOT.rglob("index.html")
        if not any(
            x in f.relative_to(ROOT).parts
            for x in ("_src", ".git", "vendor", "__pycache__", ".github", ".claude")
        )
    }
    built.add("/")
    index_page = ROOT / "sitemap" / "index.html"
    if index_page.exists():
        ihtml = index_page.read_text(encoding="utf-8")
        # Everything inside <main> except the trail above it and the sibling
        # list below it — read every list on the page, not just the first,
        # so a row added by hand outside the generated block is still checked.
        imain = re.search(r"<main.*?</main>", ihtml, re.S)
        body = imain.group(0) if imain else ""
        body = re.sub(r'<nav class="breadcrumb".*?</nav>', "", body, flags=re.S)
        body = re.sub(r"section--ruled siblings.*?</section>", "", body, flags=re.S)
        listed = [canon(h) for h, _ in links(body)]
        counts: dict[str, int] = {}
        for u in listed:
            counts[u] = counts.get(u, 0) + 1
        for u, n in counts.items():
            if n > 1:
                errors.append(f"/sitemap/ lists {u} {n} times")
            if u not in built:
                errors.append(f"/sitemap/ links {u}, which is not in the build")
        # every URL the XML sitemap claims has to be on the page that calls
        # itself "Everything on this site"
        xml = ROOT / "sitemap.xml"
        if xml.exists():
            for loc in re.findall(r"<loc>(.*?)</loc>", xml.read_text(encoding="utf-8")):
                u = loc.replace("https://signetartists.com", "") or "/"
                if u not in counts and u != "/sitemap/":
                    errors.append(f"/sitemap/ is missing {u}, which is in sitemap.xml")

    # ---- F + G: breadcrumbs and sibling lists ---------------------------
    crumb_labels: dict[str, set[str]] = {}
    for f in sorted(ROOT.rglob("index.html")):
        rel = f.relative_to(ROOT)
        if any(
            x in rel.parts
            for x in ("_src", ".git", "vendor", "__pycache__", ".github", ".claude")
        ):
            continue
        html = f.read_text(encoding="utf-8")
        if 'http-equiv="refresh"' in html:
            continue
        page_url = "/" + rel.as_posix().replace("index.html", "")
        nav = re.search(r'<nav class="breadcrumb".*?</nav>', html, re.S)
        if nav:
            trail = []
            for li in re.findall(r"<li>(.*?)</li>", nav.group(0), re.S):
                href = re.search(r'href="([^"]+)"', li)
                text = " ".join(re.sub(r"<[^>]+>", " ", li).split())
                url = canon(href.group(1)) if href else page_url
                trail.append((url, text))
                crumb_labels.setdefault(url, set()).add(text)
            urls = [u for u, _ in trail]
            if len(set(urls)) != len(urls):
                errors.append(f"{page_url}: breadcrumb trail repeats a page ({' > '.join(urls)})")
            for u, _ in trail[:-1]:
                if u not in built:
                    errors.append(f"{page_url}: breadcrumb points at {u}, which is not in the build")
            if trail and trail[-1][0] != page_url:
                errors.append(f"{page_url}: breadcrumb ends on {trail[-1][0]}")
        sib = re.search(r'section--ruled siblings.*?</section>', html, re.S)
        if sib:
            for href, label in links(sib.group(0)):
                u = canon(href)
                crumb_labels.setdefault(u, set()).add(label)
                if u not in built:
                    errors.append(f"{page_url}: sibling list points at {u}, not in the build")

    # ---- H: anchors with no text ----------------------------------------
    # /music/ shipped "...happy to help at every stage.  <a href="../repertoire/">
    # </a> <a href="../pricing/"></a>." — two anchors whose text had been
    # deleted and a stray period left behind, rendering as "at every stage. ."
    # It was live. A screen reader announces the URL; a mouse finds nothing to
    # hit. Found 2026-09-22 by auditing the build rather than the nav.
    for f in sorted(ROOT.rglob("index.html")):
        rel = f.relative_to(ROOT)
        if any(x in rel.parts for x in ("_src", ".git", "vendor", "__pycache__", ".github", ".claude")):
            continue
        html = f.read_text(encoding="utf-8")
        if 'http-equiv="refresh"' in html:
            continue
        page_url = "/" + rel.as_posix().replace("index.html", "")
        for tag, inner in re.findall(r"(<a\b[^>]*>)(.*?)</a>", html, re.S):
            text = " ".join(re.sub(r"<[^>]+>", " ", inner).split())
            if text or "aria-label=" in tag or "<img" in inner or "<svg" in inner:
                continue
            href = re.search(r'href="([^"]*)"', tag)
            errors.append(f"{page_url}: anchor with no text -> {href.group(1) if href else tag}")

        # I — a scaffold that reached the output. build.py skips page dirs
        # carrying TODO markers; this is the backstop that runs in CI, because
        # the page that went live on 2026-09-22 was titled
        # "TODO: Your Bird Can Sing: <what it is> in Denver".
        if "TODO" in html:
            errors.append(f"{page_url}: published with a TODO marker in it")

    for url, labs in sorted(crumb_labels.items()):
        # "Home" is the trail's word for the root everywhere on the web, and
        # the root's nav label is the wordmark. Nothing to compare.
        if url == "/":
            continue
        nav_label = nav_labels.get(url)
        if not nav_label:
            continue
        for lab in sorted(labs):
            low, nav_low = lab.lower(), nav_label.lower()
            if low == nav_low:
                if lab != nav_label:
                    warnings.append(
                        f'{url}: crumb "{lab}" differs in case from nav "{nav_label}"'
                    )
            elif re.search(rf"(?<![a-z]){re.escape(low)}(?![a-z])", nav_low):
                pass  # a deliberate shortening, e.g. "Join" under its own list
            else:
                errors.append(
                    f'{url}: crumb/sibling says "{lab}", the nav says "{nav_label}"'
                )

    for w in warnings:
        print(f"WARN  {w}")
    for e in errors:
        print(f"ERROR {e}")
    print(f"\nnav_lint: {len(lists)} link groups, {len(errors)} error(s), {len(warnings)} warning(s).")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
