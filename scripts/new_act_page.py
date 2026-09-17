#!/usr/bin/env python3
"""Scaffold an act's authored page from its acts.json entry (2026-09-16).

    python3 scripts/new_act_page.py <act-id> [--kind artists|ensembles] [--slug <url-slug>] [--dry-run]

Writes _src/pages/<kind>-<slug>/ with config.json, schema.json and the section
files in the shape of the ratified exemplars (artists-tony-medina for a named
act, ensembles-yacht-rock for a spec'd format), prefilled from the act's data
where the data exists and marked TODO where copy still has to be written. It
sets `page` on the act in acts.json and adds the footer link, because those
two are the wiring people forget. scripts/act_lint.py refuses a page with a
TODO left in it, so nothing half-written can build its way onto the site.

Defaults: a face-led act goes under /artists/<id>/, a spec'd format under
/ensembles/<id>/. Pass --slug when the URL should carry the phrase buyers type
rather than the act's name (Dirty Flamenco lives at /ensembles/flamenco-trio/),
--kind ensembles for a named group, and --shape to pick the section set
independently of the URL (a named group takes the artist shape by default).
"""
import argparse
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "_src" / "data"
PAGES = ROOT / "_src" / "pages"
FOOTER = ROOT / "_src" / "partials" / "footer.html"
ACTS_FILE = DATA / "acts.json"

roster = json.loads(ACTS_FILE.read_text(encoding="utf-8"))
RATE = {r["id"]: r for r in roster["rateCard"]}
AREAS = roster.get("areas", [])
AREA_LABEL = {a["id"]: a["label"] for a in AREAS}


def esc(s: str) -> str:
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace("’", "&rsquo;").replace("‘", "&lsquo;"))


def config_range(act: dict) -> str:
    if act.get("configRangeLabel"):
        return act["configRangeLabel"]
    cfgs = [RATE[c] for c in act["config_tags"]]
    if len(cfgs) == 1:
        return cfgs[0]["label"].lower()
    return f'{cfgs[0]["label"].lower()} to {cfgs[-1]["rangeLabel"]}'


def video_block(act: dict, kind: str) -> str:
    v = act.get("video")
    if isinstance(v, str) and v.startswith("http"):
        return (
            '    <div class="act-video">\n'
            f'      <iframe src="{esc(v)}" title="TODO: {esc(act["name"])} playing <song>" loading="lazy" '
            'allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture" allowfullscreen></iframe>\n'
            '    </div>'
        )
    if isinstance(v, str) and v:
        poster = f' poster="{{{{nav_prefix}}}}{esc(act["video_poster"])}"' if act.get("video_poster") else ""
        return (
            '    <div class="act-video">\n'
            f'      <video src="{{{{nav_prefix}}}}{esc(v)}"{poster} title="{esc(act["name"])} performing" '
            'controls preload="metadata" playsinline></video>\n'
            '    </div>'
        )
    who = act["name"] if kind == "artists" else f'the {act["name"].lower()}'
    return (
        f'    <div class="act-video act-video--empty" data-tbd="true" role="img" aria-label="Video of {esc(who)} is not published yet.">\n'
        f'      <img class="act-video-poster" src="{{{{nav_prefix}}}}img/{esc(act["img"])}" alt="" width="1600" height="900" decoding="async">\n'
        '      <p class="act-video-note">Footage slot</p>\n'
        '    </div>'
    )


def artist_sections(act: dict) -> dict:
    name, aid = act["name"], act["id"]
    byline = (f'A named act. {act["byline"]} {act["material"]}, {config_range(act)}.'
              if act.get("byline") else f'A named act. {act["material"]}, {config_range(act)}.')
    identity = "".join(f'    <p class="prose">{esc(p)}</p>\n' for p in act.get("identity", [])) or \
        "    <!-- TODO: four or five identity paragraphs. What the act sounds like, what the book is,\n" \
        "         how it scales, what proves it (their own site, channel, catalogue), and the\n" \
        "         named-act promise as the last paragraph. Every claim traces to something published. -->\n" \
        '    <p class="prose">This is a named act, booked under the name of the person who fronts it, and if anyone in the lineup changes, we tell you in advance.</p>\n'
    if act.get("setlist") and act["setlist"].get("from_repertoire"):
        book = f"{{{{act_setlist:{aid}}}}}\n"
    elif act.get("setlist") and act["setlist"].get("items"):
        items = "".join(f'          <li><span class="song-title">{esc(t)}</span></li>\n' for t in act["setlist"]["items"])
        book = (
            '<section class="section section--ruled">\n  <div class="wrap">\n    <div class="heading">\n'
            '      <p class="eyebrow">The book</p>\n      <h2 class="h2">A sample of the book.</h2>\n'
            f'      <p class="lede">{esc(act["setlist"].get("note", ""))}</p>\n    </div>\n'
            '    <div class="split split--three">\n      <div>\n        <h3 class="h5">TODO: group label</h3>\n'
            f'        <ul class="setlist">\n{items}        </ul>\n      </div>\n    </div>\n'
            '    <p class="note">The wider covers book is published as <a href="{{nav_prefix}}repertoire/">the song list</a>.</p>\n'
            '  </div>\n</section>\n'
        )
    else:
        book = "<!-- TODO: the book. Either {{act_setlist:" + aid + "}} (a repertoire pull, needs setlist.from_repertoire in acts.json)\n" \
               "     or an authored list whose every title is a cover the page's footage plays. -->\n"
    return {
        "01-hero.html": (
            "<!-- The act hero, mirroring build.py act_hero: eyebrow is the style, the name is\n"
            "     the h1, the byline is the face line, the blurb is the lede. -->\n"
            '<section class="section section--top act-hero">\n  <div class="wrap">\n    <div class="heading">\n'
            f'      <p class="eyebrow eyebrow--slab">{esc(act["style"])}</p>\n'
            f'      <h1 class="h1 display">{esc(name)}</h1>\n'
            f'      <p class="act-face">{esc(byline)}</p>\n'
            f'      <p class="lede">{esc(act["blurb"])}</p>\n'
            '      <div class="btn-row">\n'
            f'        <a class="btn" href="{{{{nav_prefix}}}}contact/?act={aid}">Check a date</a>\n'
            '        <a class="btn btn--outline" href="{{nav_prefix}}pricing/">See pricing</a>\n'
            '      </div>\n'
            '      <!-- The named-acts promise on /music/ is "you can go and look them up"; these are\n'
            '           the look-up. Verify both against the artist\'s own site. -->\n'
            '      <p class="note">Hear them first: <a href="TODO">TODO site</a> and <a href="TODO">their channel</a>.</p>\n'
            '    </div>\n'
            f'{video_block(act, "artists")}\n'
            '  </div>\n</section>\n'
        ),
        "01a-credits.html": (
            "<!-- The client strip, the same block the other act pages carry. -->\n"
            '<section class="section section--ruled credits" aria-label="Where our artists have played">\n'
            '  <div class="wrap">\n    {{credits}}\n  </div>\n</section>\n'
        ),
        "02-identity.html": (
            "<!-- The identity paragraphs, ratified in acts.json and kept close to source. -->\n"
            '<section class="section section--ruled">\n  <div class="wrap wrap--narrow">\n'
            f"{identity}"
            '  </div>\n</section>\n'
        ),
        "03-ladder.html": (
            "<!-- The configuration ladder, rendered from acts.json by the token. -->\n"
            f"{{{{act_ladder:{aid}}}}}\n"
        ),
        "04-occasions.html": (
            "<!-- Where the ladder lands: up-links to the occasion pages this act suits, written\n"
            "     as repertoire and format range only. Pick the four this act actually fits. -->\n"
            '<section class="section section--ruled">\n  <div class="wrap">\n    <div class="heading">\n'
            '      <p class="eyebrow">Occasions</p>\n'
            f'      <h2 class="h2">Common occasions for {esc(name)}.</h2>\n'
            '      <p class="lede">TODO: one sentence on why these four, and that each has a page of its own.</p>\n'
            '    </div>\n\n    <dl class="def-list def-list--stack">\n'
            + "".join(
                '      <div class="def-row">\n'
                f'        <dt><a href="{{{{nav_prefix}}}}{href}">{label}</a></dt>\n'
                '        <dd>TODO: which size of this act the occasion wants, and why, in one or two sentences.</dd>\n'
                '      </div>\n'
                for href, label in [
                    ("private-parties/", "Milestones and private parties"),
                    ("corporate/holiday-party/", "Office holiday parties"),
                    ("corporate/", "Client evenings and corporate dinners"),
                    ("weddings/cocktail-hour/", "Wedding cocktail hours"),
                ]
            )
            + '    </dl>\n\n'
            '    <p class="note">How the music sits around speeches and a program is planned with the <a href="{{nav_prefix}}planners/run-of-show/">run of show</a>. '
            'What live music costs across Colorado, size by size, is set out in the <a href="{{nav_prefix}}guides/live-music-cost-colorado/">cost guide</a>.</p>\n'
            '  </div>\n</section>\n'
        ),
        "05-book.html": book,
        "05b-footage.html": (
            "<!-- Real media, from the artist's own site and channel with their permission.\n"
            "     Per-asset provenance: _src/data/media-sources.json. Every embed here passed\n"
            "     scripts/act_media.py embed. List what was held back and why, here, so the\n"
            "     next session does not reinstate it. -->\n"
            '<section class="section section--ruled section--sunk">\n  <div class="wrap">\n    <div class="heading">\n'
            '      <p class="eyebrow">The footage</p>\n'
            '      <h2 class="h2">TODO: what the clips below are, in one line.</h2>\n'
            '      <p class="lede">TODO: what plays above, and what plays below.</p>\n'
            '    </div>\n    <div class="video-grid">\n'
            '      <!-- TODO: <div class="act-video"><iframe src="https://www.youtube-nocookie.com/embed/<id>?rel=0" title="..." loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture" allowfullscreen></iframe></div> -->\n'
            '    </div>\n    <div class="media-grid">\n'
            '      <!-- TODO: <figure><img src="{{nav_prefix}}img/acts/<id>-<what>.jpg" alt="..." loading="lazy" decoding="async"></figure> -->\n'
            '    </div>\n  </div>\n</section>\n'
        ),
        "06-faqs.html": (
            "<!-- The page FAQ, rendered from this dir's schema.json so the visible block and the\n"
            "     FAQPage markup can never drift apart. -->\n"
            '<section class="section section--ruled section--sunk">\n  <div class="wrap">\n'
            '    <h2 class="h3">Booking questions</h2>\n'
            '    <p class="note">The operational detail, footprints to power, is on the <a href="{{nav_prefix}}planners/technical/">technical page</a>.</p>\n'
            '    {{page_faqs}}\n  </div>\n</section>\n'
        ),
        "07-close.html": (
            "<!-- The sitewide offer close. Only the headline is this page's own, and nothing\n"
            "     follows it. -->\n"
            f"{{{{offer_close:TODO: one headline that names {esc(name)} and the night.}}}}\n"
        ),
    }


def format_sections(act: dict) -> dict:
    name, aid = act["name"], act["id"]
    low = name.lower()
    rows = "".join(
        '      <div class="def-row">\n'
        f'        <dt>{esc(RATE[c]["label"])}</dt>\n'
        '        <dd>TODO: the build at this size and where it lands. Footprint and load-in from planners/technical.</dd>\n'
        '      </div>\n'
        for c in act["config_tags"]
    )
    return {
        "01-intro.html": (
            "<!-- Format spoke, spec'd. The h1 and lede carry the buyer's words. No player is\n"
            "     named anywhere on this page. -->\n"
            '<section class="section section--top">\n  <div class="wrap">\n    <div class="heading">\n'
            f'      <p class="eyebrow eyebrow--slab">{esc(name)}</p>\n'
            f'      <h1 class="h2 display">TODO: a sentence-case headline with a period, in the buyer\'s words.</h1>\n'
            f'      <p class="lede">{esc(act["blurb"])}</p>\n'
            '      <p class="prose">TODO: the occasions it fits, as a picture of the night.</p>\n'
            '      <div class="btn-row">\n'
            f'        <a class="btn" href="{{{{nav_prefix}}}}contact/?act={aid}">Check a Date</a>\n'
            '        <a class="btn btn--outline" href="{{nav_prefix}}pricing/">See Pricing</a>\n'
            '      </div>\n    </div>\n'
            f'{video_block(act, "ensembles")}\n'
            '  </div>\n</section>\n'
        ),
        "01a-credits.html": (
            "<!-- The client strip, sitewide. Directly under the intro so the names land on the\n"
            "     first screen. -->\n"
            '<section class="section section--ruled credits" aria-label="Where our artists have played">\n'
            '  <div class="wrap">\n    {{credits}}\n  </div>\n</section>\n'
        ),
        "02-set.html": (
            '<section class="section section--ruled section--sunk">\n  <div class="wrap">\n    <div class="heading">\n'
            '      <p class="eyebrow">The set</p>\n      <h2 class="h2">A sample of the set.</h2>\n'
            '      <p class="lede">TODO: the artists and songs that define the book, the way a buyer would name them.</p>\n'
            '    </div>\n'
            '    <p class="prose">A set is built around the flow of your evening. TODO: how a dinner set and a floor set differ for this act. '
            'The wider covers list is on the <a href="{{nav_prefix}}repertoire/">repertoire page</a>.</p>\n'
            '  </div>\n</section>\n'
        ),
        "03-builds.html": (
            '<section class="section section--ruled">\n  <div class="wrap">\n    <div class="heading">\n'
            '      <p class="eyebrow">Configurations</p>\n'
            f'      <h2 class="h2">TODO: the sizes, in one headline.</h2>\n'
            '    </div>\n    <dl class="def-list def-list--stack">\n'
            f"{rows}"
            '    </dl>\n'
            '    <p class="note">Footprints and power by size are on the <a href="{{nav_prefix}}planners/technical/">technical page</a>.</p>\n'
            '  </div>\n</section>\n'
        ),
        "04-occasions.html": (
            '<section class="section section--ruled section--sunk">\n  <div class="wrap">\n    <div class="heading">\n'
            '      <p class="eyebrow">Occasions</p>\n'
            f'      <h2 class="h2">Common occasions for {esc(low)}.</h2>\n'
            '    </div>\n    <dl class="def-list def-list--stack">\n'
            '      <div class="def-row">\n        <dt>TODO: occasion</dt>\n'
            '        <dd>TODO: why, with a link to the occasion page or the post that ranks for it.</dd>\n      </div>\n'
            '    </dl>\n  </div>\n</section>\n'
        ),
        "05-booking.html": (
            '<section class="section section--ruled">\n  <div class="wrap">\n    <div class="heading">\n'
            '      <p class="eyebrow">Booking it</p>\n'
            '      <h2 class="h2">TODO: the whole evening, or the set after dinner.</h2>\n'
            '      <p class="lede">TODO: how it books, what it pairs with on the same contract.</p>\n'
            '    </div>\n'
            '    <p class="note">Send the date, the venue and the headcount, and we&rsquo;ll come back with a recommendation on configuration. '
            '<a href="{{nav_prefix}}pricing/">What live music costs in this market</a>.</p>\n'
            '  </div>\n</section>\n'
        ),
        "06-faqs.html": (
            '<section class="section section--ruled section--sunk">\n  <div class="wrap">\n'
            f'    <h2 class="h3">{esc(name)} questions</h2>\n'
            '    <p class="note">The operational questions, from substitutions to decibel caps, are on the <a href="{{nav_prefix}}planners/faq/">full question list</a>.</p>\n'
            '    {{page_faqs}}\n  </div>\n</section>\n\n'
            f"{{{{offer_close:TODO: book the {esc(low)} for the night.}}}}\n"
        ),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("act_id")
    ap.add_argument("--kind", choices=["artists", "ensembles"])
    ap.add_argument("--slug")
    ap.add_argument("--shape", choices=["artist", "format"],
                    help="section shape; default artist for a face-led act, format for a spec'd one")
    ap.add_argument("--dry-run", action="store_true", help="print what would be written, touch nothing")
    a = ap.parse_args()

    acts = {x["id"]: x for x in roster["acts"]}
    if a.act_id not in acts:
        sys.exit(f"{a.act_id} is not in acts.json; add the data entry first (references/data-schema.md)")
    act = acts[a.act_id]
    kind = a.kind or ("artists" if act["presentation"] == "face" else "ensembles")
    slug = a.slug or act["id"]
    page = f"{kind}/{slug}/"
    d = PAGES / f"{kind}-{slug}"
    if d.exists():
        sys.exit(f"{d.relative_to(ROOT)} already exists")
    if act.get("page") and act["page"] != page:
        sys.exit(f"{act['id']} already owns {act['page']}")

    areas = [AREA_LABEL[i] for i in act.get("area_tags", [])] or \
            ["Denver", "Boulder", "Colorado Springs", "Vail", "Aspen", "Beaver Creek", "Breckenridge"]
    config = {
        "_note": f"Scaffolded {pathlib.Path(__file__).name} from acts.json {act['id']}. "
                 "Title: under 60 chars before the pipe. Identity copy lives in acts.json and is mirrored here.",
        "title": f"TODO: {act['name']}: <what it is> in Denver | Signet Artists",
        "title_exact": True,
        "meta_description": act.get("meta_description") or "TODO: 140 to 160 chars, the act and where it plays.",
        "output": page + "index.html",
        "nav": "music",
        "og_image": f"img/{act['img']}",
    }
    schema = {
        "service": {
            "name": f"TODO: what is booked, e.g. 'Blues and rock band'",
            "serviceType": f"TODO: {act['style']} for private and corporate events",
            "description": "TODO: one factual sentence: who, what, sizes, where.",
            "areaServed": areas,
            "configs": act["config_tags"],
        },
        "act": act["id"],
        "faqs": [
            {"q": f"What does {act['name']} play?", "a": "TODO: answer inside the first sentence, then one supporting fact."},
            {"q": "How small can this booking be?", "a": "TODO"},
            {"q": "Will it fill a dance floor?", "a": "TODO"},
            {"q": "Can it play outdoors?", "a": "TODO"},
        ],
    }
    if isinstance(act.get("video"), str) and act["video"]:
        schema["video"] = {
            "name": f"TODO: {act['name']} live: <what it is> for private events in Denver",
            "description": "TODO: what the clip shows and the night it stands for.",
            "uploadDate": "TODO: YYYY-MM-DD",
            "duration": "TODO: PT0M0S",
        }
    shape = a.shape or ("artist" if act["presentation"] == "face" else "format")
    sections = artist_sections(act) if shape == "artist" else format_sections(act)

    if a.dry_run:
        print(f"would write {d.relative_to(ROOT)}/")
        print(json.dumps(config, indent=2)); print(json.dumps(schema, indent=2))
        for n, body in sections.items():
            print(f"\n----- sections/{n}\n{body}")
        return 0

    (d / "sections").mkdir(parents=True)
    (d / "config.json").write_text(json.dumps(config, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (d / "schema.json").write_text(json.dumps(schema, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    for n, body in sections.items():
        (d / "sections" / n).write_text(body, encoding="utf-8")

    # acts.json: the page field is what routes every card and llms line here
    if act.get("page") != page:
        new = {}
        for k, v in act.items():
            new[k] = v
            if k == "status":
                new["page"] = page
        act.clear(); act.update(new)
        ACTS_FILE.write_text(json.dumps(roster, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # footer: the Ensembles column, one link per act page
    footer = FOOTER.read_text(encoding="utf-8")
    link = f'          <li><a href="{{{{nav_prefix}}}}{page}">{esc(act["name"])}</a></li>\n'
    if link.strip() not in footer:
        marker = '<p class="eyebrow">Ensembles</p>'
        i = footer.index(marker)
        j = footer.index("        </ul>", i)
        footer = footer[:j] + link + footer[j:]
        FOOTER.write_text(footer, encoding="utf-8")

    print(f"wrote {d.relative_to(ROOT)}/ ({len(sections)} sections), set page on {act['id']}, footer link added.")
    print("Next: fill every TODO, then python3 scripts/act_lint.py " + act["id"]
          + " && python3 build.py && python3 scripts/copy_gate.py && python3 scripts/uniqueness_check.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
