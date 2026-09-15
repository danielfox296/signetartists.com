#!/usr/bin/env python3
"""Get LinkedIn publishing credentials, and tell you what they can actually do.

Run this once on a machine with a browser. It does the OAuth dance, works out
which surfaces the token unlocks, and prints the exact secrets to paste into
GitHub. Nothing here posts anything.

LinkedIn has two publishing surfaces and they are NOT the same product.

  Personal profile   scope w_member_social, from the self-serve "Share on
                     LinkedIn" product. Added from the Products tab with no
                     review, working the same day. This is the higher-reach
                     surface, so it is the one to start with.

  Company page       the Community Management API. Partner-gated: a review of
                     the company as well as the app, a registered legal entity
                     (Entuned, LLC) and a verified Page. Weeks, not minutes.
                     Request it, then carry on with the personal surface while
                     it sits in the queue.

So the honest sequence is: authorise the personal scope today, request
Community Management the same afternoon, and add the organisation scopes to
this same app when it lands.

Setup, once, at https://www.linkedin.com/developers/apps
  1. Create an app, associate it with the Signet Artists Page
  2. Products tab, add "Share on LinkedIn" and "Sign In with LinkedIn using
     OpenID Connect". Both are self-serve
  3. Products tab, request "Community Management API". This is the slow one
  4. Auth tab, add this exact redirect URL:  http://localhost:8765/callback
  5. Auth tab, copy the Client ID and Client Secret into the environment

    export LINKEDIN_CLIENT_ID=...
    export LINKEDIN_CLIENT_SECRET=...

Then:
    python3 scripts/linkedin_auth.py --authorize            personal only
    python3 scripts/linkedin_auth.py --authorize --org      add the Page too
    python3 scripts/linkedin_auth.py --doctor               what does it unlock
    python3 scripts/linkedin_auth.py --refresh              mint a fresh token

A LinkedIn access token lasts 60 days. Refresh tokens are issued to approved
apps only, so a consumer-tier app has to be re-authorised by hand every 60
days. `--doctor` prints the days remaining and the social workflow warns when
it is inside a week, which is how that trap stays managed rather than
discovered on a Tuesday morning.
"""
import argparse
import http.server
import json
import os
import secrets
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
import webbrowser

REDIRECT = "http://localhost:8765/callback"
AUTH = "https://www.linkedin.com/oauth/v2/authorization"
TOKEN = "https://www.linkedin.com/oauth/v2/accessToken"
INTROSPECT = "https://www.linkedin.com/oauth/v2/introspectToken"
API = "https://api.linkedin.com"

# YYYYMM, supported for a year from release. 202405 sat in this file until
# 2026-09-15 and had been sunset for over a year, which would have failed every
# call with a version error. Bump this when LinkedIn sunsets it; --doctor tests
# the value and says so.
DEFAULT_VERSION = "202608"

PERSONAL_SCOPES = ["openid", "profile", "w_member_social"]
ORG_SCOPES = ["w_organization_social", "r_organization_social",
              "rw_organization_admin"]


def creds() -> tuple:
    cid = os.environ.get("LINKEDIN_CLIENT_ID")
    secret = os.environ.get("LINKEDIN_CLIENT_SECRET")
    if not (cid and secret):
        sys.exit("Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET first. "
                 "Both are on the Auth tab of your app at "
                 "https://www.linkedin.com/developers/apps")
    return cid, secret


def post_form(url: str, fields: dict) -> dict:
    body = urllib.parse.urlencode(fields).encode()
    req = urllib.request.Request(
        url, data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        sys.exit(f"{url} returned {exc.code}: "
                 f"{exc.read().decode('utf-8', 'replace')[:500]}")


def get(url: str, token: str, version: str) -> dict:
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}",
        "LinkedIn-Version": version,
        "X-Restli-Protocol-Version": "2.0.0",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


class Callback(http.server.BaseHTTPRequestHandler):
    result: dict = {}

    def do_GET(self):  # noqa: N802
        query = urllib.parse.urlparse(self.path).query
        Callback.result = {k: v[0] for k, v in
                           urllib.parse.parse_qs(query).items()}
        ok = "code" in Callback.result
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(
            b"<h2>Done. Close this tab and go back to the terminal.</h2>"
            if ok else
            b"<h2>LinkedIn refused. Check the terminal.</h2>")

    def log_message(self, *args):
        pass


def authorize(want_org: bool) -> int:
    cid, secret = creds()
    scopes = PERSONAL_SCOPES + (ORG_SCOPES if want_org else [])
    state = secrets.token_urlsafe(16)
    url = f"{AUTH}?" + urllib.parse.urlencode({
        "response_type": "code",
        "client_id": cid,
        "redirect_uri": REDIRECT,
        "state": state,
        "scope": " ".join(scopes),
    })

    print("Scopes requested:", " ".join(scopes))
    if want_org:
        print("NOTE: the organisation scopes only work once Community\n"
              "      Management API is approved. Until then LinkedIn refuses\n"
              "      the whole authorisation, so run without --org first.\n")
    print("Opening your browser. If nothing happens, paste this in:\n")
    print(url, "\n")

    server = http.server.HTTPServer(("localhost", 8765), Callback)
    thread = threading.Thread(target=server.handle_request, daemon=True)
    thread.start()
    try:
        webbrowser.open(url)
    except OSError:
        pass
    print("Waiting for the redirect back to localhost:8765 ...")
    thread.join(timeout=300)
    server.server_close()

    got = Callback.result
    if not got:
        return fail("Timed out. Is http://localhost:8765/callback listed as a "
                    "redirect URL on the app's Auth tab?")
    if got.get("state") != state:
        return fail("State mismatch, refusing the response.")
    if "code" not in got:
        return fail(f"LinkedIn said: {got.get('error_description') or got}")

    tok = post_form(TOKEN, {
        "grant_type": "authorization_code",
        "code": got["code"],
        "redirect_uri": REDIRECT,
        "client_id": cid,
        "client_secret": secret,
    })
    report(tok, cid, secret)
    return 0


def fail(msg: str) -> int:
    print(f"\n{msg}", file=sys.stderr)
    return 1


def refresh() -> int:
    cid, secret = creds()
    token = os.environ.get("LINKEDIN_REFRESH_TOKEN")
    if not token:
        sys.exit("No LINKEDIN_REFRESH_TOKEN set. Consumer-tier apps are not "
                 "issued one; re-run --authorize instead.")
    tok = post_form(TOKEN, {
        "grant_type": "refresh_token",
        "refresh_token": token,
        "client_id": cid,
        "client_secret": secret,
    })
    report(tok, cid, secret)
    return 0


def surfaces(token: str, version: str) -> dict:
    """What this token can actually publish to, asked of LinkedIn directly."""
    out = {"person_urn": None, "orgs": [], "version_ok": True, "notes": []}
    try:
        me = get(f"{API}/v2/userinfo", token, version)
        if me.get("sub"):
            out["person_urn"] = f"urn:li:person:{me['sub']}"
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:200]
        if "version" in detail.lower():
            out["version_ok"] = False
        out["notes"].append(f"userinfo: {exc.code} {detail}")
    except urllib.error.URLError as exc:
        out["notes"].append(f"userinfo: {exc}")

    try:
        acl = get(f"{API}/rest/organizationAcls"
                  "?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED",
                  token, version)
        out["orgs"] = [e["organization"] for e in acl.get("elements", [])
                       if e.get("organization")]
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:200]
        out["notes"].append(
            "organizationAcls: " + (
                "no organisation scope on this token, which is expected until "
                "Community Management API is approved"
                if exc.code in (403, 401) else f"{exc.code} {detail}"))
    except urllib.error.URLError as exc:
        out["notes"].append(f"organizationAcls: {exc}")
    return out


def report(tok: dict, cid: str, secret: str) -> None:
    access = tok.get("access_token")
    if not access:
        sys.exit(f"No access token in the response: {tok}")
    version = os.environ.get("LINKEDIN_API_VERSION", DEFAULT_VERSION)
    days = int(tok.get("expires_in", 0)) // 86400
    found = surfaces(access, version)

    print("\n" + "=" * 68)
    print("TOKEN")
    print("=" * 68)
    print(f"  expires in        {days} days")
    print(f"  scopes granted    {tok.get('scope', 'not reported')}")
    has_refresh = ("yes" if tok.get("refresh_token")
                   else "no (re-authorise by hand before it expires)")
    print(f"  refresh token     {has_refresh}")
    print(f"  API version       {version}"
          f"{'' if found['version_ok'] else '   <-- REJECTED, bump it'}")

    print("\n" + "=" * 68)
    print("WHAT IT UNLOCKS")
    print("=" * 68)
    print(f"  personal profile  {found['person_urn'] or 'NOT available'}")
    if found["orgs"]:
        for urn in found["orgs"]:
            print(f"  company page      {urn}")
    else:
        print("  company page      NOT yet. Community Management API is "
              "partner-gated;\n                    request it and re-run "
              "--authorize --org once approved.")
    for note in found["notes"]:
        print(f"  note              {note}")

    print("\n" + "=" * 68)
    print("PASTE THESE INTO GITHUB")
    print("Repo, Settings, Secrets and variables, Actions, New repository secret")
    print("=" * 68)
    print(f"  LINKEDIN_CLIENT_ID       {cid}")
    print(f"  LINKEDIN_CLIENT_SECRET   {secret}")
    print(f"  LINKEDIN_ACCESS_TOKEN    {access}")
    if tok.get("refresh_token"):
        print(f"  LINKEDIN_REFRESH_TOKEN   {tok['refresh_token']}")
    if found["person_urn"]:
        print(f"  LINKEDIN_PERSON_URN      {found['person_urn']}")
    if found["orgs"]:
        print(f"  LINKEDIN_ORG_URN         {found['orgs'][0]}")
    print("=" * 68)
    print("\nThese are live credentials. Do not commit them, do not paste them\n"
          "into a chat, and do not put them in the queue file.\n")


def doctor() -> int:
    token = os.environ.get("LINKEDIN_ACCESS_TOKEN")
    if not token:
        sys.exit("Set LINKEDIN_ACCESS_TOKEN to the token you want checked.")
    version = os.environ.get("LINKEDIN_API_VERSION", DEFAULT_VERSION)
    cid = os.environ.get("LINKEDIN_CLIENT_ID")
    secret = os.environ.get("LINKEDIN_CLIENT_SECRET")

    if cid and secret:
        info = post_form(INTROSPECT, {
            "client_id": cid, "client_secret": secret, "token": token})
        print(f"  status            {info.get('status')}")
        print(f"  scopes            {info.get('scope')}")
        expires = info.get("expires_at")
        if expires:
            import datetime
            left = (datetime.datetime.fromtimestamp(int(expires), datetime.timezone.utc)
                    - datetime.datetime.now(datetime.timezone.utc)).days
            print(f"  expires in        {left} days"
                  f"{'   <-- RE-AUTHORISE SOON' if left < 7 else ''}")
    else:
        print("  (set CLIENT_ID and CLIENT_SECRET for expiry and scope detail)")

    found = surfaces(token, version)
    print(f"  API version       {version}"
          f"{'' if found['version_ok'] else '   <-- REJECTED, bump it'}")
    print(f"  personal profile  {found['person_urn'] or 'NOT available'}")
    print(f"  company page      {found['orgs'] or 'NOT available'}")
    for note in found["notes"]:
        print(f"  note              {note}")
    return 0 if (found["person_urn"] or found["orgs"]) else 1


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--authorize", action="store_true",
                    help="run the OAuth flow and print the secrets")
    ap.add_argument("--org", action="store_true",
                    help="also request the company page scopes (needs "
                         "Community Management API approval first)")
    ap.add_argument("--refresh", action="store_true",
                    help="mint a fresh access token from LINKEDIN_REFRESH_TOKEN")
    ap.add_argument("--doctor", action="store_true",
                    help="report what LINKEDIN_ACCESS_TOKEN can publish to")
    args = ap.parse_args()

    if args.authorize:
        return authorize(args.org)
    if args.refresh:
        return refresh()
    if args.doctor:
        return doctor()
    ap.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
