#!/usr/bin/env python3
"""Roster gate (2026-09-16, the new-act skill).

Every act in _src/data/acts.json, checked against the data contract build.py
renders from, and against every hand-wired surface an act has to be threaded
through before it is really on the site: the page dir, the footer link, the
media provenance ledger, the schema merge, the copy bans.

The reason this exists: an act reaches the roster card, llms.txt, the contact
picker and the Service schema for free the moment it is in acts.json, and
reaches the footer, the copy gate, the provenance ledger and its own page only
if somebody remembers. Three format pages shipped 2026-09-14 outside the copy
gate's directory list. This turns the checklist into a gate.

Run: python3 scripts/act_lint.py            # whole roster
     python3 scripts/act_lint.py <act-id>   # one act
Exit 1 on any ERROR. WARNs print and do not fail.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "_src" / "data"
PAGES = ROOT / "_src" / "pages"
PARTIALS = ROOT / "_src" / "partials"

sys.path.insert(0, str(ROOT / "scripts"))
from copy_gate import CHECKS, COMMENT  # noqa: E402  (the same bans, one list)

roster = json.loads((DATA / "acts.json").read_text(encoding="utf-8"))
MEDIA = json.loads((DATA / "media-sources.json").read_text(encoding="utf-8"))
SITE = json.loads((DATA / "site.json").read_text(encoding="utf-8"))
SEASON = json.loads((DATA / "season.json").read_text(encoding="utf-8"))

ACTS = roster["acts"]
BY_ID = {a["id"]: a for a in ACTS}
RATE_IDS = [r["id"] for r in roster["rateCard"]]
BUCKET_IDS = {b["id"] for b in roster["buckets"]}
GENRE_IDS = {g["id"] for g in roster.get("genres", [])}
AREA_IDS = {a["id"] for a in roster.get("areas", [])}
OCCASION_IDS = {o["id"] for o in roster.get("occasions", [])}
VOCALS = {"sung", "instrumental", "optional"}
SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
YT_EMBED = re.compile(r"youtube(?:-nocookie)?\.com/embed/([A-Za-z0-9_-]{11})")
INTERIM_SOURCES = (ROOT / "img" / "SOURCES.md").read_text(encoding="utf-8") \
    if (ROOT / "img" / "SOURCES.md").exists() else ""
# The interim stock stills are pulled by scripts/stills.py and documented by
# its MANIFEST plus img/SOURCES.md; they are placeholders the shoot replaces,
# not act media, so they need no row in the act ledger.
_stills = (ROOT / "scripts" / "stills.py").read_text(encoding="utf-8") \
    if (ROOT / "scripts" / "stills.py").exists() else ""
INTERIM_SLUGS = set(re.findall(r'^\s{4}"([a-z-]+)": \($', _stills, re.M))

problems: list = []


def err(act_id, msg):
    problems.append(("ERROR", act_id, msg))


def warn(act_id, msg):
    problems.append(("WARN", act_id, msg))


def page_dir_for(page: str) -> pathlib.Path:
    # "artists/tony-medina/" -> _src/pages/artists-tony-medina
    return PAGES / page.strip("/").replace("/", "-")


def has_provenance(path: str) -> bool:
    """A photo is accounted for if the ledger has it, or it is one of the
    interim stills documented in img/SOURCES.md."""
    if path in MEDIA.get("photos", {}):
        entry = MEDIA["photos"][path]
        return "REMOVED" not in entry
    base = pathlib.Path(path).name
    if f"## {base}" in INTERIM_SOURCES:
        return True
    return path.startswith("img/") and path.count("/") == 1 and base[:-4] in INTERIM_SLUGS


def embed_known(vid: str) -> bool:
    embeds = MEDIA.get("video_embeds", {})
    if vid in embeds and "REMOVED" not in embeds[vid]:
        return True
    return vid in MEDIA.get("signet_channel", {}).get("reuploads", {})


def copy_bans(act_id, label, text):
    if not isinstance(text, str):
        return
    for name, pat, fix in CHECKS:
        if pat.search(text):
            err(act_id, f"{label}: [{name}] {fix}: {text[:70]!r}")
    if "$" in text or re.search(r"\d\s?%", text):
        err(act_id, f"{label}: a figure. No Signet price or percentage publishes anywhere")
    if "[" in text and "]" in text:
        warn(act_id, f"{label}: square brackets, an unresolved value")


def check_act(act: dict):
    aid = act.get("id", "?")
    # ---- identity -----------------------------------------------------
    for key in ("id", "name", "presentation", "status", "style", "material",
                "bucket_tags", "config_tags", "from", "img", "alt", "blurb"):
        if key not in act or act[key] in ("", [], None):
            err(aid, f"missing {key}")
    if "video" not in act:
        err(aid, "missing video (null is fine; the key marks the slot)")
    if not SLUG.match(aid):
        err(aid, "id is not a kebab-case slug")
    if act.get("presentation") not in ("face", "spec"):
        err(aid, "presentation must be face or spec")
    if act.get("presentation") == "face" and not act.get("face"):
        err(aid, "a face-led act needs `face`, the one name that publishes")
    if act.get("presentation") == "spec":
        if not act.get("spec"):
            err(aid, "a spec'd act needs `spec`, the instrumentation line")
        if act.get("face"):
            err(aid, "a spec'd act must not carry `face`: no person is named")
    if act.get("status") not in ("flagship", "listing"):
        err(aid, "status must be flagship or listing")

    # ---- tags ---------------------------------------------------------
    for b in act.get("bucket_tags", []):
        if b not in BUCKET_IDS:
            err(aid, f"bucket_tags: unknown bucket {b!r}")
    cfgs = act.get("config_tags", [])
    for c in cfgs:
        if c not in RATE_IDS:
            err(aid, f"config_tags: unknown configuration {c!r}")
    known = [c for c in cfgs if c in RATE_IDS]
    if known != sorted(known, key=RATE_IDS.index):
        err(aid, "config_tags must follow rateCard order (the range label reads first to last)")
    if act.get("from") not in cfgs:
        err(aid, "`from` must be one of config_tags")
    if not act.get("genre_tags"):
        err(aid, "genre_tags is empty; the Genre filter cannot find this act")
    for g in act.get("genre_tags", []):
        if g not in GENRE_IDS:
            err(aid, f"genre_tags: unknown genre {g!r}; add it to genres[] first")
    if act.get("vocals") not in VOCALS:
        err(aid, "vocals must be sung, instrumental or optional")
    # The 2026-09-23 fields: the lane, the occasions, the entity, the card line.
    if "lane" in act and act["lane"] not in ("named", "format"):
        err(aid, "lane must be named or format (omit it to follow presentation)")
    if not act.get("occasion_tags"):
        warn(aid, "occasion_tags is empty; the Occasion filter cannot find this act")
    for o in act.get("occasion_tags", []):
        if o not in OCCASION_IDS:
            err(aid, f"occasion_tags: unknown occasion {o!r}; add it to occasions[] first")
    ent = act.get("entity")
    if ent:
        if ent.get("type") not in ("Person", "MusicGroup"):
            err(aid, "entity.type must be Person or MusicGroup")
        for u in ent.get("sameAs", []):
            if not u.startswith("https://"):
                err(aid, f"entity.sameAs {u!r} is not an https URL")
    if "area_tags" in act:
        if not act["area_tags"]:
            err(aid, "area_tags is empty; omit the key for the whole service area")
        for a in act["area_tags"]:
            if a not in AREA_IDS:
                err(aid, f"area_tags: unknown area {a!r}; add it to areas[] first")

    # ---- media --------------------------------------------------------
    img = act.get("img")
    if img:
        if not (ROOT / "img" / img).exists():
            err(aid, f"img/{img} does not exist")
        elif not has_provenance(f"img/{img}"):
            err(aid, f"img/{img} has no provenance in media-sources.json")
    if act.get("presentation") == "spec" and act.get("alt"):
        for other in ACTS:
            face = other.get("face")
            if face and face in act["alt"]:
                err(aid, f"alt text names {face}; a spec'd act names nobody")
    vid = act.get("video")
    if isinstance(vid, str) and vid:
        if vid.startswith(("http://", "https://")):
            if "youtube-nocookie.com/embed/" not in vid:
                warn(aid, "video: embeds use https://www.youtube-nocookie.com/embed/<id>?rel=0")
            elif "rel=0" not in vid:
                warn(aid, "video: add ?rel=0 so the end screen stays on this act")
            m = YT_EMBED.search(vid)
            if m and not embed_known(m.group(1)):
                err(aid, f"video {m.group(1)} is not in media-sources.json video_embeds or the Signet reuploads")
        else:
            if not (ROOT / vid).exists():
                err(aid, f"video file {vid} does not exist")
            if not act.get("video_poster"):
                err(aid, "a native video needs video_poster (its first frame)")
        poster = act.get("video_poster")
        if poster:
            if not (ROOT / poster).exists():
                err(aid, f"video_poster {poster} does not exist")
            elif not has_provenance(poster) and poster not in MEDIA.get("first_party", {}) \
                    and not poster.startswith("media/"):
                err(aid, f"{poster} has no provenance in media-sources.json")
        else:
            warn(aid, "no video_poster: the VideoObject thumbnail and any native player fall back badly")

    # ---- flagship / generated page fields --------------------------------
    # A flagship with no authored page is generated by build_act_page from
    # these two fields; an act that owns a page reads them from config.json.
    if act.get("status") == "flagship" and not act.get("page"):
        for key in ("seo_title", "meta_description"):
            if not act.get(key):
                err(aid, f"missing {key}; the generated page needs it")
    if act.get("ladder"):
        ladder_cfgs = [r.get("config") for r in act["ladder"]]
        if ladder_cfgs != cfgs:
            err(aid, f"ladder configs {ladder_cfgs} must equal config_tags {cfgs}, in order")
        for r in act["ladder"]:
            for k in ("build", "bestFor"):
                if not r.get(k):
                    err(aid, f"ladder rung {r.get('config')} missing {k}")
    elif act.get("status") == "flagship" and not act.get("page"):
        err(aid, "a generated flagship page needs a ladder")

    # ---- copy ---------------------------------------------------------
    for key in ("style", "spec", "material", "blurb", "seo_title", "meta_description",
                "configRangeLabel", "alt", "card_line"):
        copy_bans(aid, key, act.get(key))
    for i, p in enumerate(act.get("identity", [])):
        copy_bans(aid, f"identity[{i}]", p)
    for r in act.get("ladder", []):
        copy_bans(aid, f"ladder.{r.get('config')}", r.get("build"))
        copy_bans(aid, f"ladder.{r.get('config')}", r.get("bestFor"))
    if act.get("setlist"):
        copy_bans(aid, "setlist.note", act["setlist"].get("note"))
    if not act.get("page"):
        if act.get("seo_title") and len(act["seo_title"]) > 60:
            warn(aid, f"seo_title is {len(act['seo_title'])} chars; 60 is the cap before the suffix")
        if act.get("meta_description") and len(act["meta_description"]) > 160:
            warn(aid, f"meta_description is {len(act['meta_description'])} chars; keep it under 160")

    # ---- the authored page --------------------------------------------
    page = act.get("page")
    if page:
        check_page(act, page)


def check_page(act: dict, page: str):
    aid = act["id"]
    if not page.endswith("/") or not page.startswith(("artists/", "ensembles/")):
        err(aid, f"page {page!r} must look like artists/<slug>/ or ensembles/<slug>/")
    d = page_dir_for(page)
    if not d.exists():
        err(aid, f"page dir {d.relative_to(ROOT)} does not exist (scripts/new_act_page.py scaffolds it)")
        return
    cfg_path = d / "config.json"
    if not cfg_path.exists():
        err(aid, f"{d.name}/config.json missing")
        return
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    if cfg.get("output") != page + "index.html":
        err(aid, f"{d.name}/config.json output {cfg.get('output')!r} != {page + 'index.html'!r}")
    if cfg.get("nav") != "music":
        warn(aid, f"{d.name}/config.json nav should be 'music' so the roster link is current")
    title = cfg.get("title", "")
    pre = title.split("|")[0].strip()
    if not cfg.get("title_exact") or "| Signet Artists" not in title:
        warn(aid, f"{d.name}: title should end '| Signet Artists' with title_exact true")
    if len(pre) > 60:
        warn(aid, f"{d.name}: title is {len(pre)} chars before the suffix; 60 is the cap")
    if len(cfg.get("meta_description", "")) > 160:
        warn(aid, f"{d.name}: meta_description over 160 chars")
    og = cfg.get("og_image", "")
    if not og:
        warn(aid, f"{d.name}: no og_image; the unfurl falls back to the site default")
    elif not og.startswith("http") and not (ROOT / og).exists():
        err(aid, f"{d.name}: og_image {og} does not exist")

    # schema.json: one merged Service node, the act's FAQ, the video
    sp = d / "schema.json"
    if not sp.exists():
        err(aid, f"{d.name}/schema.json missing (service, act, faqs)")
    else:
        sch = json.loads(sp.read_text(encoding="utf-8"))
        if sch.get("act") != aid:
            err(aid, f"{d.name}/schema.json needs \"act\": \"{aid}\" so the page's Service node "
                     "and the roster's node merge instead of both claiming #service")
        svc = sch.get("service") or {}
        if not svc:
            err(aid, f"{d.name}/schema.json has no service block")
        elif set(svc.get("configs", [])) != set(act.get("config_tags", [])):
            err(aid, f"{d.name}/schema.json service.configs {svc.get('configs')} != config_tags")
        faqs = sch.get("faqs", [])
        if not 3 <= len(faqs) <= 8:
            warn(aid, f"{d.name}/schema.json has {len(faqs)} FAQs; the page contract is 3 to 8 "
                      "(raised 2026-09-24: the FAQ is where ops now lives)")
        for i, f in enumerate(faqs):
            copy_bans(aid, f"{d.name} faq[{i}].q", f.get("q"))
            copy_bans(aid, f"{d.name} faq[{i}].a", f.get("a"))
        if sch.get("video") and not act.get("video"):
            err(aid, f"{d.name}/schema.json has a video block but the act carries no video")
        if act.get("video") and not sch.get("video"):
            warn(aid, f"{d.name}/schema.json: the act plays a video but no VideoObject is authored")
        raw = sp.read_text(encoding="utf-8")
        if "TODO" in raw:
            err(aid, f"{d.name}/schema.json still carries a TODO")

    # sections
    sections = sorted((d / "sections").glob("*.html")) if (d / "sections").exists() else []
    if not sections:
        err(aid, f"{d.name}/sections/ is empty")
        return
    body = ""
    for s in sections:
        raw = s.read_text(encoding="utf-8")
        if "TODO" in raw:
            err(aid, f"{s.relative_to(ROOT)} still carries a TODO")
        body += COMMENT.sub("", raw)
    # Either close counts. offer_close_day is the daytime tree's variant
    # (2026-09-19): the same sentence and the same button with "the night" read
    # as "the day". Your Bird Can Sing is the first act page to want it, since
    # a senior living afternoon and a library program are not nights, and the
    # check was written before that variant existed.
    if "{{offer_close:" not in body and "{{offer_close_day:" not in body:
        err(aid, f"{d.name}: no {{{{offer_close:...}}}}; every page ends on the sitewide close")
    if "{{credits}}" not in body:
        warn(aid, f"{d.name}: no {{{{credits}}}} strip; every act page carries it under the intro")
    if "{{page_faqs}}" not in body:
        warn(aid, f"{d.name}: no {{{{page_faqs}}}}; the FAQ block is authored in schema.json")
    for m in re.finditer(r"contact/\?act=([a-z0-9-]+)", body):
        if m.group(1) not in BY_ID:
            err(aid, f"{d.name}: ?act={m.group(1)} is not a roster id")
    if f"?act={aid}" not in body:
        warn(aid, f"{d.name}: no CTA carries ?act={aid}; the contact form will not preselect the act")
    # media the page shows must be in the ledger
    for m in re.finditer(r'src="\{\{nav_prefix\}\}(img/[^"]+)"', body):
        path = m.group(1)
        if not (ROOT / path).exists():
            err(aid, f"{d.name}: {path} does not exist")
        elif not has_provenance(path):
            err(aid, f"{d.name}: {path} has no provenance in media-sources.json")
    for m in YT_EMBED.finditer(body):
        if not embed_known(m.group(1)):
            err(aid, f"{d.name}: embed {m.group(1)} is not in media-sources.json (video_embeds or reuploads)")
    if act.get("video") and act["video"].startswith("http"):
        m = YT_EMBED.search(act["video"])
        if m and m.group(1) not in body:
            warn(aid, f"{d.name}: the act's card video {m.group(1)} is not played on its own page")
    if act.get("presentation") == "spec":
        for other in ACTS:
            face = other.get("face")
            if face and face in body and other["id"] != aid:
                warn(aid, f"{d.name}: names {face}; check it is a review or a deliberate cross-link, never the spec'd act's player")

    # A body link from a parent page. This used to check the footer's Ensembles
    # column; the footer was cut to 20 orientation links on 2026-09-22 and act
    # pages came out of it, so the check follows the link to where it now
    # lives. An act with `page` set renders a card in the roster grid on
    # /music/ automatically, and /sitemap/ lists it from the build, so the real
    # failure this catches is an act whose page exists and whose roster card
    # does not.
    built_roster = ROOT / "music" / "index.html"
    if built_roster.exists():
        import re as _re
        html = built_roster.read_text(encoding="utf-8")
        main = _re.search(r"<main\b.*?</main>", html, _re.S | _re.I)
        leaf = page.rstrip("/").split("/")[-1] + "/"
        if main and leaf not in main.group(0):
            err(aid, f"/music/ has no body link to {page}; run build.py, then check acts.json sets `page`")


def check_roster():
    ids = [a.get("id") for a in ACTS]
    for i in set(ids):
        if ids.count(i) > 1:
            err(i, "duplicate id")
    flagships = [a for a in ACTS if a.get("status") == "flagship"]
    if len(flagships) > 3:
        warn("roster", f"{len(flagships)} flagships; the home grid is a three-up and a fourth orphans a row")
    held = {h["name"] for h in roster.get("holds", [])}
    for a in ACTS:
        if a.get("name") in held:
            err(a["id"], "is also in holds[]; an act is on the site or held, never both")
    # References from other data files
    for lead in SEASON.get("leads", []):
        a = BY_ID.get(lead.get("act"))
        if not a:
            err("season.json", f"leads names unknown act {lead.get('act')!r}")
        elif lead.get("config") not in a.get("config_tags", []):
            err("season.json", f"lead {a['id']} config {lead.get('config')!r} is not in its config_tags")
    for shape in SITE.get("corporateShapes", []):
        a = BY_ID.get(shape.get("act"))
        if not a:
            err("site.json", f"corporateShapes names unknown act {shape.get('act')!r}")
        elif shape.get("config") not in a.get("config_tags", []):
            err("site.json", f"corporate shape {a['id']} config {shape.get('config')!r} is not in its config_tags")
    # Named acts the roster intro promises are look-up-able
    intro = (PAGES / "music" / "sections" / "01-intro.html").read_text(encoding="utf-8")
    for a in ACTS:
        if a.get("presentation") == "face" and a.get("name") not in intro:
            warn(a["id"], "a named act missing from the roster intro's named-acts sentence (Daniel's copy; ask before editing)")
    # music page meta description names genres by hand
    music_cfg = json.loads((PAGES / "music" / "config.json").read_text(encoding="utf-8"))
    md = music_cfg.get("meta_description", "").lower()
    missing = [
        g["label"] for g in roster.get("genres", [])
        if any(g["id"] in a.get("genre_tags", []) for a in ACTS)
        and g["label"].split(" and ")[0].split(",")[0].lower() not in md
    ]
    if missing:
        warn("music/config.json", "meta_description's hand-typed genre list does not mention: "
             + ", ".join(missing))


def main() -> int:
    only = set(sys.argv[1:])
    check_roster()
    for a in ACTS:
        if only and a.get("id") not in only:
            continue
        check_act(a)
    errors = 0
    for level, aid, msg in problems:
        if only and aid not in only and aid not in ("roster", "season.json", "site.json", "music/config.json"):
            continue
        print(f"{level:5s} {aid}: {msg}")
        if level == "ERROR":
            errors += 1
    print(f"\n{errors} error(s), {len(problems) - errors} warning(s)." if problems else "Clean.")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
