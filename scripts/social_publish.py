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
    instagram   Graph API, two steps: build a container, then publish it. The
                API fetches media by URL rather than accepting an upload, which
                is why media has to be a file this site already serves.
    manual      Never touched here. Instagram Stories and Daniel's personal
                LinkedIn profile are not available to third-party tools, and
                the personal profile is the surface with the most reach, so it
                stays a person's job by design.

Credentials, from the environment, set as GitHub Actions secrets:
    LINKEDIN_ACCESS_TOKEN   LINKEDIN_ORG_URN   (urn:li:organization:123456)
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

LINKEDIN_VERSION = os.environ.get("LINKEDIN_API_VERSION", "202405")
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
    token = os.environ.get("LINKEDIN_ACCESS_TOKEN")
    owner = os.environ.get("LINKEDIN_ORG_URN")
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
        raise RuntimeError("LINKEDIN_ACCESS_TOKEN and LINKEDIN_ORG_URN not set")

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


PUBLISHERS = {"linkedin": publish_linkedin, "instagram": publish_instagram}


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
    queued = [p for p in (data.get("posts") or [])
              if p.get("status") == "ready"
              and p.get("channel") in PUBLISHERS
              and p.get("id") not in done
              and q.parse_when(p["publish_at"]) <= now]

    live = args.live and bool(
        os.environ.get("LINKEDIN_ACCESS_TOKEN") or os.environ.get("IG_ACCESS_TOKEN"))
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
            print(f"  {'sent' if live else 'DRY '} {channel:<9} {pid}")
            if live:
                rows.append({"id": pid, "channel": channel,
                             "published_at": now.isoformat(),
                             "link": post.get("link"), "result": result})
        except (urllib.error.URLError, urllib.error.HTTPError, RuntimeError,
                KeyError, OSError) as exc:
            failed += 1
            detail = exc.read().decode("utf-8", "replace")[:400] if isinstance(
                exc, urllib.error.HTTPError) else str(exc)
            print(f"  FAIL {channel:<9} {pid}: {detail}", file=sys.stderr)
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
