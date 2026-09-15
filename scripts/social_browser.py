#!/usr/bin/env python3
"""Post to the Signet Artists LinkedIn Page through a real, logged-in browser.

Why this exists instead of the API: the Community Management API is
partner-gated behind a review of the app and the company, which is weeks. This
route works today.

It is also, plainly, against LinkedIn's User Agreement, which prohibits
accessing the service by automated means. The account exposed is Daniel's own,
and the strategy puts most of this plan's reach on it, so the design is shaped
by that risk rather than pretending it away:

  Runs on Daniel's machine. Never in CI. A LinkedIn login from a GitHub Actions
  runner is a datacenter IP on an unrecognised device, which is the most likely
  way to get an account challenged. `social.yml` is deliberately not wired to
  this script.

  Real browser profile, logged in by hand, once. `--login` opens a window and
  waits for you. Nothing here reads or stores a password. The profile lives in
  a gitignored directory, the same kind of thing your everyday browser keeps.

  Headed by default, and it stops before publishing. A default run fills the
  real composer and waits for you to look at it. `--live` is what clicks Post,
  and even then it asks per post unless you pass `--yes`.

  Low volume, human pacing. Two or three posts a week from the machine that
  normally browses LinkedIn is what this is built for. Do not batch a fortnight
  into one run; the queue's publish_at times exist for exactly this reason.

  No attempt to defeat bot detection. This drives a normal browser and does not
  spoof the automation signal. If LinkedIn decides to block automated posting,
  the correct response is the API route or a scheduling tool, not a better
  disguise. Keeping that line is also what keeps this honestly "Daniel's own
  account doing Daniel's own posting".

Everything else is unchanged: the same `content-queue.yaml`, the same copy gate,
the same `published.json` ledger. Every word of every post is still written by a
person, and this script never writes one.

Setup, once:
    pip install playwright && python3 -m playwright install chromium
    python3 scripts/social_browser.py --login

Then:
    python3 scripts/social_browser.py --due            fill the composer, stop
    python3 scripts/social_browser.py --due --live     fill it and publish
    python3 scripts/social_browser.py --post <id>      one specific post
"""
import argparse
import datetime
import json
import os
import pathlib
import random
import re
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import social_queue as q  # noqa: E402

ROOT = q.ROOT
PROFILE = ROOT / ".browser-profile"
SHOTS = ROOT / ".browser-shots"

# The Page's admin composer. Posting from here is what makes the author the
# company rather than the member.
PAGE = os.environ.get("LINKEDIN_PAGE_SLUG", "signetartists")
ADMIN_URL = f"https://www.linkedin.com/company/{PAGE}/admin/page-posts/published/"

BROWSER_CHANNELS = {"linkedin", "linkedin-personal"}


def human_pause(lo: float = 0.4, hi: float = 1.4) -> None:
    """Between actions. Not a disguise, just not a machine gun."""
    time.sleep(random.uniform(lo, hi))


def launch(play, headless: bool):
    PROFILE.mkdir(exist_ok=True)
    # A persistent context is the whole point: the login survives between runs
    # the way it does in a normal browser, so there is no session token to
    # store, copy, or leak into CI.
    return play.chromium.launch_persistent_context(
        str(PROFILE),
        headless=headless,
        viewport={"width": 1400, "height": 900},
        executable_path=os.environ.get("CHROMIUM_PATH") or None,
    )


def shot(page, name: str) -> pathlib.Path:
    SHOTS.mkdir(exist_ok=True)
    path = SHOTS / f"{name}-{datetime.datetime.now():%Y%m%d-%H%M%S}.png"
    try:
        page.screenshot(path=str(path), full_page=False)
    except Exception:  # noqa: BLE001 - a failed screenshot must not mask the real error
        return path
    return path


def logged_in(page) -> bool:
    page.goto("https://www.linkedin.com/feed/", wait_until="domcontentloaded")
    human_pause()
    return "/feed" in page.url and "/login" not in page.url


def do_login() -> int:
    from playwright.sync_api import sync_playwright
    print("Opening a browser. Log in to LinkedIn as yourself, then come back\n"
          "here and press Enter. Nothing in this script reads or stores your\n"
          "password; the session lives in the browser profile on disk.\n")
    with sync_playwright() as play:
        ctx = launch(play, headless=False)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto("https://www.linkedin.com/login", wait_until="domcontentloaded")
        try:
            input("Press Enter once you are logged in and looking at the feed ... ")
        except EOFError:
            print("No terminal to wait on; giving it 120 seconds.")
            time.sleep(120)
        ok = logged_in(page)
        ctx.close()
    if ok:
        print(f"\nLogged in. The profile is saved in {PROFILE.name}/ and is "
              "gitignored.\nRun --due next.")
        return 0
    print("\nStill not logged in. Run --login again.", file=sys.stderr)
    return 1


def open_composer(page, channel: str):
    """Get to a share box that will post as the right author."""
    if channel == "linkedin":
        page.goto(ADMIN_URL, wait_until="domcontentloaded")
    else:
        page.goto("https://www.linkedin.com/feed/", wait_until="domcontentloaded")
    human_pause(1.0, 2.0)

    # Role and accessible name rather than CSS: LinkedIn reskins constantly,
    # but the button a screen reader finds is far more stable than its classes.
    for name in (re.compile(r"start a post", re.I),
                 re.compile(r"create a post", re.I)):
        button = page.get_by_role("button", name=name)
        if button.count():
            button.first.click()
            human_pause(1.0, 2.0)
            return
    raise RuntimeError(
        "could not find the 'Start a post' button. LinkedIn has probably "
        "changed its markup, or this account does not administer the Page. "
        "See the screenshot in .browser-shots/")


def verify_author(page, channel: str) -> str:
    """Read back who the composer says it will post as.

    Posting to the personal feed when you meant the Page is the expensive
    mistake here, and it is silent. So the author is read out of the open
    dialog and checked before a single character is typed.
    """
    dialog = page.get_by_role("dialog")
    text = dialog.inner_text(timeout=10000) if dialog.count() else ""
    head = "\n".join(text.splitlines()[:6])
    if channel == "linkedin" and not re.search(r"signet\s*artists", head, re.I):
        raise RuntimeError(
            "the composer does not look like it is posting as Signet Artists. "
            f"It opened with:\n{head}\nRefusing rather than posting to the "
            "wrong profile. Screenshot in .browser-shots/")
    return head.strip()


def fill(page, body: str, media: list) -> None:
    box = page.get_by_role("textbox").first
    box.click()
    human_pause()
    # type() rather than fill(): LinkedIn's editor is a contenteditable that
    # ignores a value set in one go, and this also paces the input.
    box.type(body, delay=random.randint(8, 18))
    human_pause(0.8, 1.6)

    for item in media:
        path = ROOT / str(item)
        if not path.exists():
            raise RuntimeError(f"media {item} not found")
        with page.expect_file_chooser() as chooser:
            for name in (re.compile(r"add media", re.I),
                         re.compile(r"add a photo", re.I),
                         re.compile(r"^photo$", re.I)):
                btn = page.get_by_role("button", name=name)
                if btn.count():
                    btn.first.click()
                    break
            else:
                raise RuntimeError("could not find the add-media button")
        chooser.value.set_files(str(path))
        human_pause(1.5, 2.5)
        done = page.get_by_role("button", name=re.compile(r"^(next|done)$", re.I))
        if done.count():
            done.first.click()
            human_pause()


def publish(page) -> None:
    button = page.get_by_role("button", name=re.compile(r"^post$", re.I))
    if not button.count():
        raise RuntimeError("could not find the Post button")
    button.first.click()
    human_pause(2.5, 4.0)


def run(posts: list, live: bool, headless: bool, assume_yes: bool) -> int:
    from playwright.sync_api import sync_playwright

    rows, failed = [], 0
    with sync_playwright() as play:
        ctx = launch(play, headless=headless)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()

        if not logged_in(page):
            ctx.close()
            print("Not logged in. Run: python3 scripts/social_browser.py --login",
                  file=sys.stderr)
            return 1

        for post in posts:
            pid, channel = post["id"], post["channel"]
            body = post["body"].strip()
            if post.get("link") and not post.get("first_comment"):
                body = f"{body}\n\n{post['link']}"
            try:
                open_composer(page, channel)
                author = verify_author(page, channel)
                print(f"\n  composer author: {author.splitlines()[0]}")
                fill(page, body, post.get("media") or [])
                shot(page, f"{pid}-composed")

                if not live:
                    print(f"  DRY  {channel:<18} {pid}")
                    print("       Composer is filled and NOT posted. Look at "
                          "the window.\n       Re-run with --live to publish.")
                    try:
                        input("       Press Enter to close ... ")
                    except EOFError:
                        time.sleep(20)
                    continue

                if not assume_yes:
                    try:
                        ok = input(f"       Publish {pid} as shown? [y/N] ")
                    except EOFError:
                        ok = "n"
                    if ok.strip().lower() not in ("y", "yes"):
                        print(f"  skip {channel:<18} {pid}")
                        continue

                publish(page)
                shot(page, f"{pid}-published")
                print(f"  sent {channel:<18} {pid}")
                rows.append({
                    "id": pid, "channel": channel, "via": "browser",
                    "published_at": datetime.datetime.now(
                        datetime.timezone.utc).isoformat(),
                    "link": post.get("link"),
                })
                # Never two posts back to back.
                human_pause(20, 45)
            except Exception as exc:  # noqa: BLE001 - report it, keep going
                failed += 1
                png = shot(page, f"{pid}-failed")
                print(f"  FAIL {channel:<18} {pid}: {exc}", file=sys.stderr)
                print(f"       screenshot: {png}", file=sys.stderr)
        ctx.close()

    if rows:
        existing = []
        if q.LEDGER.exists():
            try:
                existing = json.loads(q.LEDGER.read_text())
            except ValueError:
                existing = []
        q.LEDGER.write_text(json.dumps(existing + rows, indent=2) + "\n")
    return 1 if failed else 0


def select(post_id: str, at: datetime.datetime) -> list:
    data = q.load()
    done = q.published_ids()
    out = []
    for post in data.get("posts") or []:
        if post.get("channel") not in BROWSER_CHANNELS:
            continue
        if post_id:
            if post.get("id") == post_id:
                out.append(post)
            continue
        if post.get("status") != "ready" or post.get("id") in done:
            continue
        try:
            if q.parse_when(post["publish_at"]) <= at:
                out.append(post)
        except (TypeError, ValueError):
            continue
    return out


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--login", action="store_true",
                    help="open a window and log in to LinkedIn by hand, once")
    ap.add_argument("--due", action="store_true",
                    help="every ready LinkedIn post whose time has come")
    ap.add_argument("--post", help="one post id, whatever its status")
    ap.add_argument("--live", action="store_true",
                    help="actually publish. Without it the composer is filled "
                         "and left for you to look at")
    ap.add_argument("--yes", action="store_true",
                    help="with --live, skip the per-post confirmation")
    ap.add_argument("--headless", action="store_true",
                    help="no window. Not recommended: you cannot see what it did")
    ap.add_argument("--at", help="ISO timestamp to evaluate due-ness against")
    args = ap.parse_args()

    if args.login:
        return do_login()
    if not (args.due or args.post):
        ap.print_help()
        return 0

    if q.lint() != 0:
        print("social_browser: queue did not pass the copy gate, nothing sent",
              file=sys.stderr)
        return 1

    at = (datetime.datetime.fromisoformat(args.at) if args.at
          else datetime.datetime.now(datetime.timezone.utc))
    if at.tzinfo is None:
        at = at.replace(tzinfo=datetime.timezone.utc)

    posts = select(args.post, at)
    if not posts:
        print(f"social_browser: nothing to do as of {at.isoformat()}")
        return 0
    missing = [p["id"] for p in posts if not (p.get("body") or "").strip()]
    if missing:
        print(f"social_browser: no body written for {', '.join(missing)}",
              file=sys.stderr)
        return 1
    return run(posts, args.live, args.headless, args.yes)


if __name__ == "__main__":
    sys.exit(main())
