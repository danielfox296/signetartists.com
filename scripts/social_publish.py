#!/usr/bin/env python3
"""Publish the posts that are due. The machine handles the keys and the clock.

This script pushes words that are already written. It does not write, rewrite,
shorten, hashtag or "optimise" anything: what is in the queue is what goes out,
or nothing goes out. That boundary is the whole point of the system and it is
not a limitation to be engineered around later.

It refuses to run unless `social_queue.py --lint` passes, so a post carrying a
price, an availability claim or a banned phrase cannot reach an API.

Dry run is the default. Without `--live` it prints exactly what it would send
and touches no network. Missing credentials also force dry run, so a pull
request or a laptop never posts by accident.

Channels
    linkedin    Posts API, as the organisation. Optional single image.
                Needs the partner-gated Community Management API.
    linkedin-personal
                The same Posts API, authored as the member. Needs only
                w_member_social, which is self-serve, so this surface works
                long before the Page is approved. It is also the higher-reach
                one, so it is where to start.
    instagram   Graph API, two steps: build a container, then publish it. The
                API fetches media by URL rather than accepting an upload, which
                is why media has to be a file this site already serves.
    manual      Never touched here. Instagram Stories and Daniel's personal
                LinkedIn profile are not available to third-party tools, and
                the personal profile is the surface with the most reach, so it
                stays a person's job by design.

Credentials, from the environment, set as GitHub Actions secrets:
    LINKEDIN_ACCESS_TOKEN   or LINKEDIN_REFRESH_TOKEN with CLIENT_ID/SECRET
    LINKEDIN_PERSON_URN     (urn:li:person:ABC)       personal surface
    LINKEDIN_ORG_URN        (urn:li:organization:123) company page
    IG_ACCESS_TOKEN         IG_USER_ID
    LINKEDIN_API_VERSION    optional, defaults below

Every result, success or failure, is appended to _marketing/published.json.
A failure is loud: the script exits non-zero so the workflow goes red.

Run:
    python3 scripts/social_publish.py            dry run
    python3 scripts/social_publish.py --live     actually post
"""
import argparse
import datetime
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import social_queue as q  # noqa: E402

ROOT = q.ROOT
LEDGER = q.LEDGER
SITE = q.SITE

# YYYYMM, supported for a year from release. This read "202405" until
# 2026-09-15, by which point it had been sunset for over a year and would have
# failed every call. `linkedin_auth.py --doctor` tests the value and says so.
LINKEDIN_VERSION = os.environ.get("LINKEDIN_API_VERSION", "202608")
GRAPH = "https://graph.facebook.com/v21.0"


def request(url: str, data=None, headers=None, method=None) -> dict:
    body = None
    if data is not None:
        body = data if isinstance(data, bytes) else json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers=headers or {},
                                 method=method)
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read()
        if not raw:
            return {"_headers": dict(resp.headers)}
        try:
            out = json.loads(raw)
        except ValueError:
            return {"_raw": raw.decode("utf-8", "replace")}
        out["_headers"] = dict(resp.headers)
        return out


def public_url(item: str) -> str:
    """A queue media entry as a URL the outside world can fetch."""
    return item if item.startswith("http") else SITE + item.lstrip("/")


# --------------------------------------------------------------------------
# LinkedIn
# --------------------------------------------------------------------------

def linkedin_token() -> str:
    """A usable access token, refreshed if this app was issued a refresh token.

    A LinkedIn access token lasts 60 days. Approved apps also get a refresh
    token good for a year, and when one is present it is far better to mint a
    fresh access token on each run than to store a 60-day secret that dies
    quietly halfway through the season. Consumer-tier apps are issued no
    refresh token, so the stored access token is the fallback and
    `linkedin_auth.py --doctor` is what keeps an eye on its expiry.
    """
    refresh = os.environ.get("LINKEDIN_REFRESH_TOKEN")
    cid = os.environ.get("LINKEDIN_CLIENT_ID")
    secret = os.environ.get("LINKEDIN_CLIENT_SECRET")
    if refresh and cid and secret:
        body = urllib.parse.urlencode({
            "grant_type": "refresh_token", "refresh_token": refresh,
            "client_id": cid, "client_secret": secret}).encode()
        minted = request("https://www.linkedin.com/oauth/v2/accessToken", body,
                         {"Content-Type": "application/x-www-form-urlencoded"})
        if minted.get("access_token"):
            return minted["access_token"]
    return os.environ.get("LINKEDIN_ACCESS_TOKEN") or ""


def linkedin_author(channel: str) -> str:
    """Who the post is published as.

    The two surfaces are different LinkedIn products, not a setting. The
    company page needs the partner-gated Community Management API; the personal
    profile needs only self-serve w_member_social, and it is the surface with
    the most reach, which is why the queue can use it long before the Page is
    approved.
    """
    key = ("LINKEDIN_PERSON_URN" if channel == "linkedin-personal"
           else "LINKEDIN_ORG_URN")
    return os.environ.get(key) or ""


def linkedin_headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "LinkedIn-Version": LINKEDIN_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
    }


def linkedin_image(path: str, owner: str, token: str) -> str:
    """Upload one image and return its urn."""
    init = request(
        "https://api.linkedin.com/rest/images?action=initializeUpload",
        {"initializeUploadRequest": {"owner": owner}},
        linkedin_headers(token))
    value = init["value"]
    blob = (ROOT / path).read_bytes()
    request(value["uploadUrl"], blob,
            {"Authorization": f"Bearer {token}"}, method="PUT")
    return value["image"]


def publish_linkedin(post: dict, live: bool) -> dict:
    channel = post.get("channel", "linkedin")
    token = linkedin_token() if live else os.environ.get("LINKEDIN_ACCESS_TOKEN")
    owner = linkedin_author(channel)
    body = post["body"].strip()
    link = post.get("link")

    # The link goes in the first comment where one is written. LinkedIn
    # suppresses posts carrying an outbound link, and the queue lets a person
    # decide that per post rather than a rule deciding it for them.
    if link and not post.get("first_comment"):
        body = f"{body}\n\n{link}"

    payload = {
        "author": owner,
        "commentary": body,
        "visibility": "PUBLIC",
        "distribution": {
            "feedDistribution": "MAIN_FEED",
            "targetEntities": [],
            "thirdPartyDistributionChannels": [],
        },
        "lifecycleState": "PUBLISHED",
        "isReshareDisabledByAuthor": False,
    }

    media = [m for m in (post.get("media") or []) if not str(m).startswith("http")]
    if not live:
        return {"dry_run": True, "payload": payload, "images": media,
                "first_comment": post.get("first_comment")}
    if not (token and owner):
        need = ("LINKEDIN_PERSON_URN" if channel == "linkedin-personal"
                else "LINKEDIN_ORG_URN")
        raise RuntimeError(
            f"a LinkedIn token and {need} are both needed. Run "
            "scripts/linkedin_auth.py --authorize, then --doctor")

    if media:
        payload["content"] = {"media": {
            "id": linkedin_image(str(media[0]), owner, token)}}

    result = request("https://api.linkedin.com/rest/posts", payload,
                     linkedin_headers(token))
    urn = result.get("_headers", {}).get("x-restli-id") or result.get("id")

    if post.get("first_comment") and urn:
        request("https://api.linkedin.com/rest/socialActions/"
                f"{urllib.parse.quote(urn, safe='')}/comments",
                {"actor": owner, "object": urn,
                 "message": {"text": post["first_comment"]}},
                linkedin_headers(token))
    return {"urn": urn}


# --------------------------------------------------------------------------
# Instagram
# --------------------------------------------------------------------------

def publish_instagram(post: dict, live: bool) -> dict:
    token = os.environ.get("IG_ACCESS_TOKEN")
    user = os.environ.get("IG_USER_ID")
    caption = post["body"].strip()
    media = [str(m) for m in (post.get("media") or [])]
    if not media:
        raise RuntimeError("Instagram post with no media")

    first = public_url(media[0])
    is_video = first.lower().endswith((".mp4", ".mov"))
    params = {"caption": caption, "access_token": token or "DRY"}
    if is_video:
        params["media_type"] = "REELS"
        params["video_url"] = first
    else:
        params["image_url"] = first

    if not live:
        safe = dict(params, access_token="***")
        return {"dry_run": True, "container": safe}
    if not (token and user):
        raise RuntimeError("IG_ACCESS_TOKEN and IG_USER_ID not set")

    made = request(f"{GRAPH}/{user}/media",
                   urllib.parse.urlencode(params).encode(),
                   {"Content-Type": "application/x-www-form-urlencoded"})
    creation = made["id"]

    # Video containers are transcoded before they can be published. Poll rather
    # than sleep on a guess; a Reel that is not FINISHED will fail to publish.
    if is_video:
        for _ in range(30):
            status = request(f"{GRAPH}/{creation}?fields=status_code"
                             f"&access_token={urllib.parse.quote(token)}")
            if status.get("status_code") == "FINISHED":
                break
            if status.get("status_code") == "ERROR":
                raise RuntimeError(f"Instagram container {creation} errored")
            time.sleep(10)
        else:
            raise RuntimeError(f"Instagram container {creation} not ready")

    done = request(f"{GRAPH}/{user}/media_publish",
                   urllib.parse.urlencode(
                       {"creation_id": creation, "access_token": token}).encode(),
                   {"Content-Type": "application/x-www-form-urlencoded"})
    return {"media_id": done.get("id"), "creation_id": creation}


PUBLISHERS = {"linkedin": publish_linkedin,
              "linkedin-personal": publish_linkedin,
              "instagram": publish_instagram}


def append_ledger(rows: list) -> None:
    existing = []
    if LEDGER.exists():
        try:
            existing = json.loads(LEDGER.read_text())
        except ValueError:
            existing = []
    LEDGER.write_text(json.dumps(existing + rows, indent=2) + "\n")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--live", action="store_true",
                    help="actually post. Without it nothing leaves the process")
    ap.add_argument("--at", help="ISO timestamp to evaluate due-ness against")
    args = ap.parse_args()

    if q.lint() != 0:
        print("social_publish: queue did not pass the copy gate, nothing sent",
              file=sys.stderr)
        return 1

    now = (datetime.datetime.fromisoformat(args.at) if args.at
           else datetime.datetime.now(datetime.timezone.utc))
    if now.tzinfo is None:
        now = now.replace(tzinfo=datetime.timezone.utc)

    data = q.load()
    done = q.published_ids()
    # LinkedIn is published by scripts/social_browser.py, from Daniel's own
    # machine and his own logged-in browser, because the Community Management
    # API is weeks away. Two rails both claiming LinkedIn is how a post goes
    # out twice, so this one stands down unless the API route is explicitly
    # turned back on. Set LINKEDIN_ENABLE_API=1 once the Page is approved.
    api_linkedin = os.environ.get("LINKEDIN_ENABLE_API") == "1"
    queued, stood_down = [], []
    for p in (data.get("posts") or []):
        if p.get("status") != "ready" or p.get("id") in done:
            continue
        if p.get("channel") not in PUBLISHERS:
            continue
        if p.get("channel", "").startswith("linkedin") and not api_linkedin:
            stood_down.append(p["id"])
            continue
        try:
            if q.parse_when(p["publish_at"]) <= now:
                queued.append(p)
        except (TypeError, ValueError):
            continue
    if stood_down:
        print(f"social_publish: {len(stood_down)} LinkedIn post(s) left to "
              "social_browser.py: " + ", ".join(stood_down))

    live = args.live and bool(
        os.environ.get("LINKEDIN_ACCESS_TOKEN")
        or os.environ.get("LINKEDIN_REFRESH_TOKEN")
        or os.environ.get("IG_ACCESS_TOKEN"))
    if args.live and not live:
        print("social_publish: --live given but no credentials in the "
              "environment, staying in dry run")

    if not queued:
        print(f"social_publish: nothing due as of {now.isoformat()}")
        return 0

    rows, failed = [], 0
    for post in queued:
        pid, channel = post["id"], post["channel"]
        try:
            result = PUBLISHERS[channel](post, live)
            print(f"  {'sent' if live else 'DRY '} {channel:<18} {pid}")
            if not live:
                # The point of a dry run is reading what would go out, so show
                # it rather than just naming the post.
                for line in json.dumps(result, indent=2,
                                       default=str).splitlines():
                    print(f"       {line}")
            if live:
                rows.append({"id": pid, "channel": channel,
                             "published_at": now.isoformat(),
                             "link": post.get("link"), "result": result})
        except (urllib.error.URLError, urllib.error.HTTPError, RuntimeError,
                KeyError, OSError) as exc:
            failed += 1
            detail = exc.read().decode("utf-8", "replace")[:400] if isinstance(
                exc, urllib.error.HTTPError) else str(exc)
            print(f"  FAIL {channel:<18} {pid}: {detail}", file=sys.stderr)
            if live:
                rows.append({"id": pid, "channel": channel,
                             "published_at": now.isoformat(),
                             "error": detail})

    if rows:
        append_ledger(rows)
    print(f"social_publish: {len(queued) - failed} of {len(queued)} "
          f"{'published' if live else 'would publish'}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
