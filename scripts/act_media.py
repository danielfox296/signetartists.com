#!/usr/bin/env python3
"""Act media helper (2026-09-16, the new-act skill).

The four media jobs every new act needs, each writing its own provenance row
into _src/data/media-sources.json as it goes, because an asset without a row
in that ledger does not exist on this site (the ledger is how a removal is
done, and the repo is public).

    python3 scripts/act_media.py photo <url|path> --as img/acts/<id>-<what>.jpg --from <site> [--card img/<id>-card.jpg] [--note "..."] [--force]
        Download (or copy) a photograph, save it as JPEG, optionally write the
        1600x900 centre-cropped card beside it, and record both.

    python3 scripts/act_media.py poster <youtube-id> --as img/acts/<id>-live-poster.jpg --from <site>
        Save YouTube's thumbnail of the hero embed for the VideoObject thumbnailUrl.

    python3 scripts/act_media.py embed <youtube-id> [<youtube-id> ...] [--record "artists/<id>/ hero"]
        Check that each video is playable in an embed (the flag YouTube prints
        on the watch page), print its title and channel, and with --record
        write the video_embeds rows. A video that fails is never placed: the
        embed renders "Video unavailable" and the top of the page goes blank.

Rules carried here rather than in anyone's head:
  * Artists' own photographs are used as they are. No palette duotone: that
    treatment marks the interim stock stills (scripts/stills.py) and a real
    photograph of the act is exactly what the duotone says it is not.
  * Cards are 16:9 at 1600x900, centre crop unless --focus moves it.
  * Videos are embeds of the artist's own uploads, or Signet-channel copies
    made with permission. Nothing is re-hosted without Daniel's say.
  * Instagram is not scraped.
"""
import argparse
import datetime
import hashlib
import io
import json
import pathlib
import re
import shutil
import sys
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
LEDGER = ROOT / "_src" / "data" / "media-sources.json"
UA = {"User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                     "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 signetartists.com asset pull "
                     "(contact hello@signetartists.com)")}
TODAY = datetime.date.today().isoformat()
CARD_W, CARD_H = 1600, 900


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def load_ledger() -> dict:
    return json.loads(LEDGER.read_text(encoding="utf-8"))


def save_ledger(d: dict) -> None:
    LEDGER.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()[:16]


def ensure_free(path: pathlib.Path, force: bool):
    if path.exists() and not force:
        sys.exit(f"{path.relative_to(ROOT)} exists; pass --force to overwrite (and say why in the ledger)")


def cmd_photo(a):
    from PIL import Image, ImageOps
    out = ROOT / a.as_
    ensure_free(out, a.force)
    if a.src.startswith(("http://", "https://")):
        raw = fetch(a.src)
        source = a.src
    else:
        p = pathlib.Path(a.src).expanduser()
        raw = p.read_bytes()
        source = f"Daniel-supplied file {p}"
    im = Image.open(io.BytesIO(raw))
    im = ImageOps.exif_transpose(im).convert("RGB")
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, "JPEG", quality=88, optimize=True)
    print(f"  wrote {out.relative_to(ROOT)}  {im.width}x{im.height}  {out.stat().st_size // 1024} KB")
    ledger = load_ledger()
    row = {"source": source, "from": a.from_, "retrieved": TODAY,
           "verified": f"sha256 {sha(raw)} of the source bytes, {TODAY}"}
    if a.note:
        row["_note"] = a.note
    ledger.setdefault("photos", {})[a.as_] = row
    if a.card:
        card = ROOT / a.card
        ensure_free(card, a.force)
        w, h = im.size
        target = CARD_W / CARD_H
        if w / h > target:
            nw = int(h * target)
            x0 = int((w - nw) * a.focus_x)
            box = (x0, 0, x0 + nw, h)
        else:
            nh = int(w / target)
            y0 = int((h - nh) * a.focus_y)
            box = (0, y0, w, y0 + nh)
        crop = im.crop(box).resize((CARD_W, CARD_H), Image.LANCZOS)
        crop.save(card, "JPEG", quality=86, optimize=True)
        print(f"  wrote {card.relative_to(ROOT)}  {CARD_W}x{CARD_H}  {card.stat().st_size // 1024} KB")
        ledger["photos"][a.card] = {
            "source": f"crop of {a.as_}, 16:9 at {CARD_W}x{CARD_H}, focus {a.focus_x:.2f},{a.focus_y:.2f}",
            "from": a.from_, "retrieved": TODAY,
            "_note": "The roster card and the page og_image.",
        }
    save_ledger(ledger)
    print("  ledger updated")


def cmd_poster(a):
    out = ROOT / a.as_
    ensure_free(out, a.force)
    url = f"https://i.ytimg.com/vi/{a.video_id}/hqdefault.jpg"
    raw = fetch(url)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(raw)
    print(f"  wrote {out.relative_to(ROOT)}  {len(raw) // 1024} KB")
    ledger = load_ledger()
    ledger.setdefault("photos", {})[a.as_] = {
        "source": url, "from": a.from_, "retrieved": TODAY,
        "_note": "YouTube thumbnail of the hero embed, saved for the VideoObject thumbnailUrl.",
        "verified": f"sha256 {sha(raw)}, {TODAY}",
    }
    save_ledger(ledger)
    print("  ledger updated")


def embed_status(vid: str) -> dict:
    """playableInEmbed from the watch page, title and channel from oEmbed."""
    info = {"id": vid, "playable": None, "title": "", "channel": ""}
    try:
        page = fetch(f"https://www.youtube.com/watch?v={vid}").decode("utf-8", "ignore")
        m = re.search(r'"playableInEmbed":(true|false)', page)
        info["playable"] = (m.group(1) == "true") if m else False
    except Exception as e:  # noqa: BLE001
        info["playable"] = False
        info["error"] = str(e)
    try:
        q = urllib.parse.urlencode({"url": f"https://www.youtube.com/watch?v={vid}", "format": "json"})
        o = json.loads(fetch(f"https://www.youtube.com/oembed?{q}").decode("utf-8"))
        info["title"] = o.get("title", "")
        info["channel"] = o.get("author_name", "")
    except Exception as e:  # noqa: BLE001
        info.setdefault("error", str(e))
    return info


def cmd_embed(a):
    ledger = load_ledger()
    bad = 0
    for vid in a.video_ids:
        s = embed_status(vid)
        flag = "OK  " if s["playable"] else "FAIL"
        print(f"  {flag} {vid}  {s['title']!r}  on {s['channel']!r}"
              + (f"  ({s['error']})" if s.get("error") else ""))
        if not s["playable"]:
            bad += 1
            continue
        if a.record:
            ledger.setdefault("video_embeds", {})[vid] = {
                "title": s["title"], "channel": s["channel"],
                "placed": a.record,
                "embed_checked": f"playableInEmbed true, {TODAY}",
            }
    if a.record:
        save_ledger(ledger)
        print("  ledger updated")
    if bad:
        print(f"\n{bad} video(s) are not embeddable. Do not place them; pick another clip or ask the artist.")
    return 1 if bad else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("photo")
    p.add_argument("src", help="URL, or a local path Daniel supplied")
    p.add_argument("--as", dest="as_", required=True, help="repo-relative target, e.g. img/acts/<id>-portrait.jpg")
    p.add_argument("--from", dest="from_", required=True, help="where it came from, e.g. medinablues.com or 'Daniel, 2026-09-16'")
    p.add_argument("--card", help="also write the 1600x900 card crop here, e.g. img/<id>-card.jpg")
    p.add_argument("--focus-x", dest="focus_x", type=float, default=0.5, help="0..1, where the crop centres horizontally")
    p.add_argument("--focus-y", dest="focus_y", type=float, default=0.5, help="0..1, where the crop centres vertically")
    p.add_argument("--note", help="ledger note: what it shows, why it was chosen")
    p.add_argument("--force", action="store_true")
    p.set_defaults(fn=cmd_photo)
    p = sub.add_parser("poster")
    p.add_argument("video_id")
    p.add_argument("--as", dest="as_", required=True)
    p.add_argument("--from", dest="from_", required=True)
    p.add_argument("--force", action="store_true")
    p.set_defaults(fn=cmd_poster)
    p = sub.add_parser("embed")
    p.add_argument("video_ids", nargs="+")
    p.add_argument("--record", help="write video_embeds rows with this placement text, e.g. 'artists/<id>/ hero'")
    p.set_defaults(fn=cmd_embed)
    a = ap.parse_args()
    return a.fn(a) or 0


if __name__ == "__main__":
    sys.exit(main())
