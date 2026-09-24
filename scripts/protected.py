#!/usr/bin/env python3
"""Protected-sentence gate (signet-copy-pass tooling, 2026-09-24).

CopyDesk logs every save to ~/Library/Logs/copydesk-saves.jsonl. Every `new`
string in every Signet save whose `result.ok` is true, and whose edit is not
a delete, is a sentence Daniel wrote or approved with his own hand on the
live site. The copy pass rewrites everything around these sentences; it
never rewrites, tightens, moves or "improves" the sentences themselves.

This gate is the enforcement half of that rule: it collects every protected
string from the ledger (232 strings, 162 unique, as of 2026-09-24) and
checks that each one still appears, verbatim, somewhere in the built site.
A miss means a batch touched a protected sentence, or deleted the section
that carried it, either of which is a stop-the-batch failure.

The check normalizes both sides the same way: HTML-unescaped (the ledger's
"new" strings carry raw entities like &amp;, the built pages carry the same
entities pre-render) and whitespace-collapsed (source HTML wraps a sentence
across lines; the ledger's copy does not). A protected string that spans a
tag boundary in the built page (a <span> landing mid-sentence) still passes,
because the search runs against the tag-stripped text of each page, the same
extraction copy_gate.py uses for its money and em-dash audits.

Run: python3 scripts/protected.py
Exit 1 on any miss.
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LEDGER = pathlib.Path.home() / "Library" / "Logs" / "copydesk-saves.jsonl"
PROPERTY = "signetartists"

sys.path.insert(0, str(ROOT / "scripts"))
from copy_gate import built_pages, visible_text  # noqa: E402


def normalize(text: str) -> str:
    import html
    import re
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


# Baseline exemption, frozen 2026-09-24 (the day this gate was built, before
# batch 1 of the copy pass touched anything). The ledger is a literal record
# of every `new` string ever saved; it has no idea that a later CopyDesk
# edit rewrote or deleted that same sentence again (21 of these), or that a
# ratified rule superseded it outside CopyDesk entirely: the no-published-
# price purge (2026-09-04/05, killed "Rate Card", "We're happy to publish
# our rates!", the pricing-page headers), the no-counts-of-acts ruling
# (2026-09-07, killed every "Seven Acts and growing" variant), the dBA-in-
# numbers fix (AI-TELLS Layer 7 pattern 11, same day this gate was written),
# and the /music/ two-lane rebuild (2026-09-23, replaced the whole old
# roster page's copy). A few are Daniel's own typos ("easilly", "evning",
# "Factos", "bookk", "crown pleasers" for "crowd pleasers") cleaned up by an
# earlier voice sweep before this gate existed to protect the misspelling.
#
# This list exists so today's tooling pass can wire the gate into the
# deploy workflow without failing on history predating it. It is a
# snapshot, not a policy: it must never grow after today, only shrink (a
# baseline entry that gets restored, deliberately or otherwise, should be
# deleted from here). Any protected sentence missing from the built site
# that is NOT in this set is a real failure — a batch touched or deleted
# something of Daniel's and the gate should stop it.
BASELINE_EXEMPT_2026_09_24 = frozenset({
    '. Signet\'s {rates} are "on request".',
    "A duo is a great intensity for both arrival and dinner - it's a volume people easilly talk across, and it has the range to lift the last hour if that's where things are headed.",
    'A table of twelve, or three tables of eight. The music sits below conversational volume for the whole night: jazz standards on upright bass and guitar, at a level you can talk across. Book an hour on its own or keep things going from the time your guests arrie through dessert.',
    'Authentic and intimate with a specialty in building familiar songs from the ground up with his amazing ear and technology, Tejas brings a wide variety of fan favorite songs and is also available to play his original, singer-songwriter material to your event.',
    'Blues and rock covers and originals, a solo or up to a quartet. Real, seasoned players rather than a spotify playlist, at whatever volume makes the venue sing. Rehearsal dinners, welcome drinks, office parties, and any event where live blues and rock is the right idea.',
    'Book a DJ on their own or to carry a late night set after the band steps wraps their set. All run by the same team, with the same contract. A solid DJ gets people moving and is the most common single booking of the corporate season.',
    'Booked on an early weeknight. A short call. A single set rather than the whole evening. A smaller build for the same music. A venue where the load-in is easy.',
    "Booking a band for other people can be nerve-racking. You're picking something everyone has an opinion about, usually on a date that cannot move, and to some degree, your taste and reputation are on the line.",
    'Brilliant, guitar-based flamenco musical act and one of the only in Colorado available for private events. Dirty flamenco plays real palos, and rhumba both authentically and with a soulful twist. Their polished as a working group is matched by their extensive standing repertoire.',
    'Brilliant, guitar-based flamenco musical act and one of the only ones in Colorado available for private event bookings. Dirty flamenco plays real palos, and rhumba both authentically and with a soulful twist. They are a polished, working group with an extensive standing repertoire.',
    'By the kind of night, or by the size of the act.',
    'Common party configurations',
    "Every vendor you hire represents your reputation. Below are some questions and answers to the the one's we've been asked so far.",
    'Everything is planned before we get there.',
    'FLAVORFUL MUSICAL ACTS &amp; GROWING.',
    'Factos that affect price',
    'For whomever is running the schedule',
    "From singer-songwriter covers, jazz standards, flamenco, funk and DJ options, Signet Artists can configure many acts for your event as solo, duo, trio and quartet. Some artists are named acts, with a notable front-person. Others are booked as formats, and organized by instrumentation and genre. We've highlighted a few below, but check out our whole roster to see what's available.",
    "From singer-songwriter covers, jazz standards, flamenco, funk and DJ options, Signet Artists configures many of our acts for your event as solo, duo, trio and quartet. Some acts feature a notable front-person, others are formats organized by instrumentation and genre. We've highlighted a few below, but check out our whole roster to see what's available.",
    "From singer-songwriters, covers, jazz, flamenco, funk and DJ options, Signet Artists offers many of our acts as solo, duo, trio and quartet. Some with a notable front-person and others organized by genre and purpose. We've highlighted a few below,",
    'Guitar, bass, drums',
    'Instrumental funk and soul covers at trio size, for a party where the dance floor is close to the tables.',
    'Jazz standards on upright bass and guitar, bring immediate class to a cocktail hour or special event. The Signet Jazz duo specializes in music for when guests arrive, sip cocktails or enjoy dinner. This act is the perfect glue for special evenings when music holds the night together effortlessly, and the volume and genre sit perfectly under riveting conversations.',
    'LIVE ENTERTAINMENT IN COLORADO',
    'Lindy R., a four-hour outdoor company picnic, October 2025.',
    'Live music for your event. From solo to quartet.',
    'More often a seated dinner with a toast in it than a floor. Live players hang out at a 65 to 72 dBA loudness at the nearest table., and the set is built from the years the guest of honour actually cares about rather than from a generic list.',
    'Most requests we get all into one of the following categories.',
    'Music from artists like Tejas Singh, Dirty Flamenco and Last Consulate, their specific sound and presence comes with the booking.',
    "Note: Professional live sound represents a significant different in the range of the quotes above. It's included with some acts' prices and with others, an add-on. Insurance, travel considerations, and a point of contact for the night can cause the price to vary in a similar way.",
    'Our Roster',
    'Send us the flow of the evning, and we’ll help build the music around it.',
    'Seven Acts and growing, and published details for all of them.',
    'Seven Acts and growing, with published details for all of them.',
    'Seven FLAVORFUL MUSICAL ACTS & GROWING.',
    'Seven flavorful Acts & growing',
    'Seven soulful MUSICAL ACTS & GROWING.',
    'Signet Artists Rate Card',
    "Signet Artists delivers live music for private events in Denver, Colorado and surrounding areas. We provide a variety of genre's and configurations - effortlessly.",
    "Signet Artists delivers music for your event in Denver, Colorado and surrounding areas. A variety of genre's and configurations are available to book - effortlessly. All sized to your event and budget, for private events across Colorado. Contact us with the date and the venue - and we take care of  the rest.",
    "Signet Artists delivers music for your event in Denver, Colorado and surrounding areas. A variety of genre's and configurations are available to book - effortlessly. All sized to your event and budget, for private events across Colorado. Enjoy one contract, one point of contact for the night, and our rates published right on the website. Send us the date and the venue - we take care of  the rest.",
    "So we make it hard to get wrong. You get the act that fits your vision, sound support that's the right size for the venue, and clear, professional support all along the way. Tell us the date and the event's vision, and we'll help you find the perfect fit.",
    'Tell us your needs and we can recommend an amazing act tonight',
    "The other lane are professional players throwing down their best in a format to serve your needs. From Jazz combos, Funk, Live DJs, Singer-Songwriter or Blues and Rock, they're are all configurable to your needs.",
    'This is the one that fills a floor without needing a stage. Usually guitar (or keys), bass and drums. More dancable energy or a fuller-sounding-but-still laid-back jazz ensemble. ',
    'Three musical act configurations cover almost every corporate enquiry: the office holiday party, the client dinner, and the member or association event. A duo or a trio through drinks and dinner, a quartet to fill the dance floor. Our musicians have done this for Amazon, NBCUniversal, Charles Schwab and the Denver Art Museum.',
    'Three musical act configurations cover almost every corporate enquiry: the office holiday party, the client dinner, and the member or association event. A duo or a trio through drinks and dinner, a quartet when the floor has to fill, and one contract across the whole night. Our players have done this for Amazon, NBCUniversal, Charles Schwab and the Denver Art Museum, and the paperwork your finance team needs arrives without anyone chasing it.',
    'Together we map the venue and consider the details like power and sound so the timeline works with your vision.',
    'Trio+',
    'We map the stage, power and sound are with the venue before event day, the timeline is coordinated with your timeline.',
    "We're happy to publish our rates!",
    "We've compiled a Denver-first, price rubric for those clients who are still preparing the budget for their event. The figures have been sourced from published cost guides and wedding budget datasets.",
    'What changes a booking price',
    'What to actually bookk for a wedding',
    'a sample of crown pleasers',
    'nobody wants to get it wrong',
    'planned before we arrive.',
    'researched colorado market rates',
})


def protected_strings() -> list:
    """Every `new` string from a non-delete edit in a Signet save whose
    result.ok is true. Duplicates kept (a sentence edited more than once
    across saves is still one protected sentence, but the ledger is the
    source of truth and de-duping here would hide a count drift); callers
    that want the unique set can dedupe themselves."""
    if not LEDGER.exists():
        print(f"no ledger at {LEDGER}; nothing to protect")
        return []
    strings = []
    for line in LEDGER.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        entry = json.loads(line)
        if entry.get("property") != PROPERTY:
            continue
        if not entry.get("result", {}).get("ok"):
            continue
        for edit in entry.get("edits", []):
            if edit.get("delete"):
                continue
            new = edit.get("new", "")
            if new:
                strings.append(new)
    return strings


def main() -> int:
    all_strings = protected_strings()
    unique = sorted(set(all_strings))
    if not unique:
        print("0 protected strings; nothing to check.")
        return 0

    pages = built_pages()
    haystacks = [normalize(visible_text(p)) for p in pages]

    misses, baseline_misses = [], []
    for s in unique:
        needle = normalize(s)
        if not needle:
            continue
        if any(needle in h for h in haystacks):
            continue
        (baseline_misses if s in BASELINE_EXEMPT_2026_09_24 else misses).append(s)

    for m in baseline_misses:
        print(f"baseline (pre-2026-09-24, not a batch failure): {m!r}")
    for m in misses:
        print(f"MISSING: {m!r}")

    print(f"\n{len(all_strings)} protected string(s), {len(unique)} unique, "
          f"{len(baseline_misses)} pre-existing baseline miss(es), "
          f"{len(misses)} new miss(es).")
    return 1 if misses else 0


if __name__ == "__main__":
    sys.exit(main())
