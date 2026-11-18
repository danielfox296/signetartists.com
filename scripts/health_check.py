#!/usr/bin/env python3
"""Read-only check of the live site and what it depends on.

One line per check: PASS, WARN or FAIL. Exits 1 if any check FAILs. Only ever
sends GET and HEAD requests; it never posts to the enquiry endpoint.

    python3 scripts/health_check.py
"""
import http.client
import json
import os
import re
import socket
import ssl
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

HOST = "signetartists.com"
BASE = f"https://{HOST}"
REPO = "danielfox296/signetartists.com"
KEY_PAGES = ["/", "/music/", "/contact/", "/pricing/", "/weddings/", "/corporate/"]
SITEMAPS = ["/sitemap.xml", "/video-sitemap.xml"]
TLS_MIN_DAYS = 14
DOMAIN_MIN_DAYS = 30
UA = {"User-Agent": "signet-health-check/1.0"}

results = []


def record(level, name, detail=""):
    results.append(level)
    print(f"{level:<5} {name}" + (f": {detail}" if detail else ""), flush=True)


def get(url, timeout=25, headers=None, tries=3):
    """GET, following redirects. Returns (status, body text). Retries a failed connection."""
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={**UA, **(headers or {})})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, r.read().decode("utf-8", "ignore")
        except urllib.error.HTTPError as e:
            if e.code < 500:
                return e.code, ""
            last = e
        except Exception as e:  # noqa: BLE001
            last = e
        time.sleep(2 * (i + 1))
    raise last


def check_pages():
    for path in KEY_PAGES:
        name = f"page {path}"
        try:
            status, body = get(BASE + path)
        except Exception as e:  # noqa: BLE001
            record("FAIL", name, str(e))
            continue
        m = re.search(r"<title>\s*(.*?)\s*</title>", body, re.S | re.I)
        if status != 200:
            record("FAIL", name, f"HTTP {status}")
        elif not m or not m.group(1):
            record("FAIL", name, "200 but no <title>")
        else:
            record("PASS", name, f"200, title {m.group(1)[:50]!r}")


def check_sitemaps():
    for path in SITEMAPS:
        name = f"sitemap {path}"
        try:
            status, body = get(BASE + path)
            if status != 200:
                record("FAIL", name, f"HTTP {status}")
                continue
            root = ET.fromstring(body)
            n = sum(1 for e in root.iter() if e.tag.endswith("}loc") or e.tag == "loc")
            record("PASS" if n else "FAIL", name, f"200, parses, {n} URLs" if n else "parses but lists no URLs")
        except Exception as e:  # noqa: BLE001
            record("FAIL", name, str(e))


def check_enquiry():
    try:
        status, body = get(BASE + "/enquiry.js")
    except Exception as e:  # noqa: BLE001
        record("FAIL", "enquiry.js", str(e))
        return
    m = re.search(r'ENDPOINT\s*=\s*"(https://[^"]+)"', body)
    if status != 200:
        record("FAIL", "enquiry.js", f"HTTP {status}")
        return
    if not m:
        record("FAIL", "enquiry.js", "200 but the endpoint URL is not in it")
        return
    record("PASS", "enquiry.js", "200 and carries the endpoint URL")
    try:
        status, text = get(m.group(1), timeout=40)
        if status == 200 and text.strip() == "ok":
            record("PASS", "enquiry endpoint", "GET answers ok")
        else:
            record("FAIL", "enquiry endpoint", f"GET gave HTTP {status}, {text.strip()[:60]!r}, not ok")
    except Exception as e:  # noqa: BLE001
        record("FAIL", "enquiry endpoint", str(e))


def check_redirects():
    for scheme, host in (("http", HOST), ("http", "www." + HOST), ("https", "www." + HOST)):
        name = f"redirect {scheme}://{host}"
        try:
            cls = http.client.HTTPSConnection if scheme == "https" else http.client.HTTPConnection
            c = cls(host, timeout=20)
            c.request("GET", "/", headers=UA)
            r = c.getresponse()
            loc = r.getheader("Location", "")
            c.close()
            if r.status in (301, 308) and loc.rstrip("/") == BASE:
                record("PASS", name, f"{r.status} to {loc}")
            else:
                record("FAIL", name, f"HTTP {r.status}, Location {loc!r}")
        except Exception as e:  # noqa: BLE001
            record("FAIL", name, str(e))


def check_tls():
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((HOST, 443), timeout=20) as s:
            with ctx.wrap_socket(s, server_hostname=HOST) as t:
                cert = t.getpeercert()
        end = datetime.fromtimestamp(ssl.cert_time_to_seconds(cert["notAfter"]), timezone.utc)
        days = (end - datetime.now(timezone.utc)).days
        record("PASS" if days > TLS_MIN_DAYS else "FAIL", "tls certificate", f"{days} days left (expires {end:%Y-%m-%d})")
    except Exception as e:  # noqa: BLE001
        record("FAIL", "tls certificate", str(e))


def check_domain():
    try:
        status, body = get(f"https://rdap.org/domain/{HOST}", timeout=30)
        if status != 200:
            record("WARN", "domain registration", f"lookup gave HTTP {status}")
            return
        events = json.loads(body).get("events", [])
        exp = next((e["eventDate"] for e in events if e.get("eventAction") == "expiration"), None)
        if not exp:
            record("WARN", "domain registration", "lookup has no expiration date")
            return
        end = datetime.fromisoformat(exp.replace("Z", "+00:00"))
        days = (end - datetime.now(timezone.utc)).days
        record("PASS" if days > DOMAIN_MIN_DAYS else "FAIL", "domain registration", f"{days} days left (expires {end:%Y-%m-%d})")
    except Exception as e:  # noqa: BLE001
        record("WARN", "domain registration", f"lookup failed: {e}")


def check_other_sites():
    for host in ("staging.signetartists.com", "admin.signetartists.com"):
        try:
            status, _ = get(f"https://{host}/")
            record("PASS" if status == 200 else "FAIL", f"site {host}", f"HTTP {status}")
        except Exception as e:  # noqa: BLE001
            record("FAIL", f"site {host}", str(e))


def check_last_deploy():
    name = "latest live deploy"
    url = f"https://api.github.com/repos/{REPO}/actions/workflows/deploy.yml/runs?branch=main&per_page=10"
    headers = {"Accept": "application/vnd.github+json"}
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        status, body = get(url, headers=headers)
        if status != 200:
            record("WARN", name, f"could not read the runs: HTTP {status}")
            return
        # A run cancelled by a newer push is normal; judge the newest that was not.
        runs = [r for r in json.loads(body)["workflow_runs"] if r.get("conclusion") != "cancelled"]
        if not runs:
            record("WARN", name, "no runs found")
            return
        r = runs[0]
        label = f"{r['conclusion'] or r['status']}, {r['head_commit']['message'].splitlines()[0][:60]!r}"
        record("FAIL" if r["conclusion"] in ("failure", "timed_out") else "PASS", name, label)
    except Exception as e:  # noqa: BLE001
        record("WARN", name, f"could not read the runs: {e}")


def main():
    check_pages()
    check_sitemaps()
    check_enquiry()
    check_redirects()
    check_tls()
    check_domain()
    check_other_sites()
    check_last_deploy()
    fails, warns = results.count("FAIL"), results.count("WARN")
    print(f"\n{len(results) - fails - warns} passed, {warns} warned, {fails} failed")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
