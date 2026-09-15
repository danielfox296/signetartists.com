#!/usr/bin/env python3
"""Validate _marketing/content-queue.yaml, and list what is due.

The queue holds words a person wrote. This script never writes one. All it does
is refuse to let a post leave the building carrying something the company does
not publish.

Three passes.

1. Schema. Every post needs an id, a channel, a publish_at that parses, a
   pillar, a campaign and a status. Ids are unique. A post that is `ready`
   needs a body, a link with UTMs on LinkedIn, and media on Instagram.

2. Copy. The same law the site runs under, because a caption is a publication
   like any other page. The 2026-09-04 no-published-price rule applies in full:
   the site's one exemption, sourced market figures rendered beside their
   source, cannot survive in a feed where the source note does not fit, so
   social carries NO dollar figure and NO percentage at all. On top of that,
   the copy_gate bans: em dashes, the word AI, chair, room outside ballroom and
   green room, and the business filler list.

   Plus one ban that is social-only. The site never publishes availability, and
   a feed is exactly where a scarcity claim gets invented, so "dates left",
   "spots left", "limited availability" and their family are refused here even
   though no page has ever tried to print one.

3. Assets. A repo-relative media path has to exist. An Instagram post has to
   point at something the Graph API can actually fetch, which means a file this
   site publishes, not a YouTube page.

Run:
    python3 scripts/social_queue.py --lint          validate everything
    python3 scripts/social_queue.py --due           JSON of posts due now
    python3 scripts/social_queue.py --due --at ISO  as of a given moment

Exit 1 on any error.
"""
import argparse
import datetime
import json
import pathlib
import re
import sys

try:
    import yaml
except ImportError:
    sys.exit("social_queue.py needs pyyaml: pip install pyyaml")

ROOT = pathlib.Path(__file__).parent.parent
QUEUE = ROOT / "_marketing" / "content-queue.yaml"
LEDGER = ROOT / "_marketing" / "published.json"

CHANNELS = {"linkedin", "instagram", "manual"}
PILLARS = {"calendar", "floor", "paperwork", "acts", "proof"}
STATUSES = {"brief", "draft", "ready", "published", "skipped"}

# Public site root. An Instagram media path is resolved against this, because
# the Graph API fetches a URL rather than accepting an upload, and everything
# under img/ and media/ is already published by the deploy.
SITE = "https://signetartists.com/"

MONEY = re.compile(r"\$\s?\d|\b\d+\s?(?:dollars|usd)\b|\d\s?%|\bpercent\b", re.I)

BANS = [
    ("em dash", re.compile("—"),
     "rewrite with commas, colons or periods"),
    ("the word AI", re.compile(r"\bAI\b"),
     "never publishes"),
    ("chair", re.compile(r"\bchairs?\b", re.I),
     "the seat/role sense is banned"),
    ("room/rooms", re.compile(r"(?<!ball)(?<!green )\brooms?\b", re.I),
     "say venue, floor, crowd, night (ballroom/green room exempt)"),
    ("business filler", re.compile(
        r"\b(leverage|seamless|solutions|bespoke|curated|synergy|holistic"
        r"|best-in-class|turnkey)\b", re.I),
     "vague where it should be vivid; say the thing itself"),
    ("availability claim", re.compile(
        r"\b(dates? (?:left|remaining|still open)|spots? left|slots? left"
        r"|limited availability|only \d+ (?:dates?|spots?)|book(?:ing)? fast"
        r"|almost (?:full|gone)|selling out|last chance)\b", re.I),
     "availability is never published; use calendar fact instead"),
    ("price claim", re.compile(
        r"\b(rate card|published rates|starting at|from \$|per hour|our rates"
        r"|% off|discount)\b", re.I),
     "Signet publishes no price of any kind"),
]


def load() -> dict:
    if not QUEUE.exists():
        sys.exit(f"missing {QUEUE.relative_to(ROOT)}")
    return yaml.safe_load(QUEUE.read_text(encoding="utf-8")) or {}


def parse_when(value) -> datetime.datetime:
    """publish_at as an aware datetime. Raises ValueError if it is not one."""
    if isinstance(value, datetime.datetime):
        dt = value
    else:
        dt = datetime.datetime.fromisoformat(str(value))
    if dt.tzinfo is None:
        raise ValueError("publish_at needs an offset, e.g. -06:00 (MDT) "
                         "or -07:00 (MST)")
    return dt


def check_copy(text: str, where: str, errors: list) -> None:
    for label, pat, fix in BANS:
        m = pat.search(text)
        if m:
            errors.append(f"{where}: {label} ({m.group(0)!r}). {fix}")
    m = MONEY.search(text)
    if m:
        errors.append(
            f"{where}: money or percentage ({m.group(0)!r}). Social carries no "
            "figure at all; the site's sourced-market exemption does not "
            "survive in a feed")


def check_post(post: dict, seen: set, errors: list) -> None:
    pid = post.get("id")
    if not pid:
        errors.append(f"post with no id: {str(post)[:60]}")
        return
    if pid in seen:
        errors.append(f"{pid}: duplicate id")
    seen.add(pid)

    channel = post.get("channel")
    if channel not in CHANNELS:
        errors.append(f"{pid}: channel {channel!r} not in {sorted(CHANNELS)}")
    if post.get("pillar") not in PILLARS:
        errors.append(f"{pid}: pillar {post.get('pillar')!r} not in "
                      f"{sorted(PILLARS)}")
    status = post.get("status")
    if status not in STATUSES:
        errors.append(f"{pid}: status {status!r} not in {sorted(STATUSES)}")
    if not post.get("campaign"):
        errors.append(f"{pid}: no campaign")
    if not post.get("brief"):
        errors.append(f"{pid}: no brief. Every slot says what it is for before "
                      "anyone writes it")
    try:
        parse_when(post.get("publish_at"))
    except (TypeError, ValueError) as exc:
        errors.append(f"{pid}: publish_at, {exc}")

    body = post.get("body") or ""
    if body:
        check_copy(body, pid, errors)
    for field in ("first_comment", "brief"):
        if post.get(field):
            check_copy(str(post[field]), f"{pid} ({field})", errors)

    media = post.get("media") or []
    for item in media:
        item = str(item)
        if item.startswith("http"):
            continue
        if not (ROOT / item).exists():
            errors.append(f"{pid}: media {item!r} does not exist")

    if status != "ready":
        return

    # Everything below is only asked of a post that is about to go out.
    if not body.strip():
        errors.append(f"{pid}: ready with no body")
    if channel == "linkedin":
        link = post.get("link") or ""
        if not link:
            errors.append(f"{pid}: ready LinkedIn post with no link")
        elif "utm_source=linkedin" not in link or "utm_campaign=" not in link:
            errors.append(f"{pid}: link needs utm_source=linkedin and "
                          "utm_campaign=, or the enquiry is unattributable")
    if channel == "instagram":
        if not media:
            errors.append(f"{pid}: Instagram needs media")
        for item in media:
            item = str(item)
            if "youtube.com" in item or "youtu.be" in item:
                errors.append(
                    f"{pid}: {item} is a YouTube page. The Graph API fetches a "
                    "file, so export a vertical cut to media/ and point at that")
            elif item.startswith("http") and not item.startswith(SITE):
                errors.append(f"{pid}: {item} is not on {SITE}; the Graph API "
                              "has to be able to fetch it")


def lint() -> int:
    data = load()
    posts = data.get("posts") or []
    errors: list = []
    if not posts:
        errors.append("queue has no posts")
    seen: set = set()
    for post in posts:
        check_post(post, seen, errors)

    counts: dict = {}
    for post in posts:
        counts[post.get("status")] = counts.get(post.get("status"), 0) + 1
    pillars: dict = {}
    for post in posts:
        pillars[post.get("pillar")] = pillars.get(post.get("pillar"), 0) + 1

    if errors:
        print(f"social_queue: {len(errors)} problem(s)\n", file=sys.stderr)
        for line in errors:
            print(f"  {line}", file=sys.stderr)
        return 1

    print(f"social_queue: {len(posts)} posts, clean")
    print("  status  " + ", ".join(f"{k}={v}" for k, v in sorted(counts.items())))
    print("  pillar  " + ", ".join(f"{k}={v}" for k, v in sorted(pillars.items())))
    return 0


def published_ids() -> set:
    if not LEDGER.exists():
        return set()
    try:
        return {row["id"] for row in json.loads(LEDGER.read_text())}
    except (ValueError, KeyError):
        return set()


def due(at: datetime.datetime) -> int:
    """Posts that are ready, due, publishable by machine and not already out."""
    data = load()
    done = published_ids()
    out = []
    for post in data.get("posts") or []:
        if post.get("status") != "ready":
            continue
        if post.get("channel") == "manual":
            continue
        if post.get("id") in done:
            continue
        try:
            when = parse_when(post.get("publish_at"))
        except (TypeError, ValueError):
            continue
        if when <= at:
            out.append(post)
    out.sort(key=lambda p: parse_when(p["publish_at"]))
    print(json.dumps(out, indent=2, default=str))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--lint", action="store_true", help="validate the queue")
    ap.add_argument("--due", action="store_true", help="JSON of posts due now")
    ap.add_argument("--at", help="ISO timestamp to evaluate --due against")
    args = ap.parse_args()

    if args.due:
        at = (datetime.datetime.fromisoformat(args.at) if args.at
              else datetime.datetime.now(datetime.timezone.utc))
        if at.tzinfo is None:
            at = at.replace(tzinfo=datetime.timezone.utc)
        return due(at)
    return lint()


if __name__ == "__main__":
    sys.exit(main())
