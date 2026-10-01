#!/usr/bin/env python3
"""Protected-sentence gate (signet-copy-pass tooling, 2026-09-24).

CopyDesk logs every save to ~/Library/Logs/copydesk-saves.jsonl. Every `new`
string in every Signet save whose `result.ok` is true, and whose edit is not
a delete, is a sentence Daniel wrote or approved with his own hand on the
live site. The copy pass rewrites everything around these sentences; it
never rewrites, tightens, moves or "improves" the sentences themselves.

Three things in the ledger are not that, and are read out of it (2026-10-01):
a dry run (`result.dry_run`) published nothing; an edit whose id is not in
`result.applied` did not publish even though the save did; and a sentence
Daniel himself rewrote or deleted in a later save (that edit's `old` is the
earlier `new`) is no longer his sentence, the rewrite is.

This gate is the enforcement half of that rule: it collects every protected
string from the ledger (144 strings, all unique, as of 2026-10-01) and
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


def inline_stripped_text(path: pathlib.Path) -> str:
    """The page's text with inline formatting tags removed and nothing put in
    their place. visible_text() swaps every tag for a space, which is right
    for block tags and wrong for the bold, italic and link formatting
    CopyDesk has written since v2.0 (2026-10-01): "<strong>ceremony
    musician</strong>, or" came out as "ceremony musician , or" and Daniel's
    own sentence read as missing the day he bolded two words in it. Checked
    alongside visible_text(), never instead of it."""
    import re
    text = path.read_text(encoding="utf-8")
    text = re.sub(r"<script.*?</script>", " ", text, flags=re.DOTALL)
    text = re.sub(r"</?(?:strong|em|b|i|u|a|span)\b[^>]*>", "", text)
    return re.sub(r"<[^>]+>", " ", text)


# Baseline exemption, frozen 2026-09-24 (the day this gate was built, before
# batch 1 of the copy pass touched anything). The ledger is a literal record
# of every `new` string ever saved; it has no idea that a ratified rule
# superseded a sentence outside CopyDesk entirely: the no-published-
# price purge (2026-09-04/05, killed "Rate Card", "We're happy to publish
# our rates!", the pricing-page headers), the no-counts-of-acts ruling
# (2026-09-07, killed every "Seven Acts and growing" variant), the dBA-in-
# numbers fix (AI-TELLS Layer 7 pattern 11, same day this gate was written),
# and the /music/ two-lane rebuild (2026-09-23, replaced the whole old
# roster page's copy). A few are Daniel's own typos ("easilly", "evning",
# "Factos", "bookk", "crown pleasers" for "crowd pleasers") cleaned up by an
# earlier voice sweep before this gate existed to protect the misspelling.
#
# 2026-10-01: 29 entries deleted (58 down to 29). protected_strings() now
# reads later CopyDesk rewrites and deletes, failed edits and dry runs out
# of the ledger itself, so the 23 sentences Daniel rewrote in a later save
# and the 6 that never published no longer reach this check at all.
#
# This list exists so today's tooling pass can wire the gate into the
# deploy workflow without failing on history predating it. It is a
# snapshot, not a policy: it must never grow after today, only shrink (a
# baseline entry that gets restored, deliberately or otherwise, should be
# deleted from here). Any protected sentence missing from the built site
# that is NOT in this set is a real failure — a batch touched or deleted
# something of Daniel's and the gate should stop it.
BASELINE_EXEMPT_2026_09_24 = frozenset({
    "A duo is a great intensity for both arrival and dinner - it's a volume people easilly talk across, and it has the range to lift the last hour if that's where things are headed.",
    'A table of twelve, or three tables of eight. The music sits below conversational volume for the whole night: jazz standards on upright bass and guitar, at a level you can talk across. Book an hour on its own or keep things going from the time your guests arrie through dessert.',
    'Blues and rock covers and originals, a solo or up to a quartet. Real, seasoned players rather than a spotify playlist, at whatever volume makes the venue sing. Rehearsal dinners, welcome drinks, office parties, and any event where live blues and rock is the right idea.',
    'Book a DJ on their own or to carry a late night set after the band steps wraps their set. All run by the same team, with the same contract. A solid DJ gets people moving and is the most common single booking of the corporate season.',
    'Booked on an early weeknight. A short call. A single set rather than the whole evening. A smaller build for the same music. A venue where the load-in is easy.',
    'Brilliant, guitar-based flamenco musical act and one of the only in Colorado available for private events. Dirty flamenco plays real palos, and rhumba both authentically and with a soulful twist. Their polished as a working group is matched by their extensive standing repertoire.',
    'By the kind of night, or by the size of the act.',
    'Common party configurations',
    "Every vendor you hire represents your reputation. Below are some questions and answers to the the one's we've been asked so far.",
    'Factos that affect price',
    'For whomever is running the schedule',
    "From singer-songwriters, covers, jazz, flamenco, funk and DJ options, Signet Artists offers many of our acts as solo, duo, trio and quartet. Some with a notable front-person and others organized by genre and purpose. We've highlighted a few below,",
    'Guitar, bass, drums',
    'Instrumental funk and soul covers at trio size, for a party where the dance floor is close to the tables.',
    'More often a seated dinner with a toast in it than a floor. Live players hang out at a 65 to 72 dBA loudness at the nearest table., and the set is built from the years the guest of honour actually cares about rather than from a generic list.',
    'Most requests we get all into one of the following categories.',
    'Music from artists like Tejas Singh, Dirty Flamenco and Last Consulate, their specific sound and presence comes with the booking.',
    'Send us the flow of the evning, and we’ll help build the music around it.',
    'Seven Acts and growing, with published details for all of them.',
    'Seven flavorful Acts & growing',
    'Seven soulful MUSICAL ACTS & GROWING.',
    'Signet Artists Rate Card',
    "Signet Artists delivers live music for private events in Denver, Colorado and surrounding areas. We provide a variety of genre's and configurations - effortlessly.",
    "Signet Artists delivers music for your event in Denver, Colorado and surrounding areas. A variety of genre's and configurations are available to book - effortlessly. All sized to your event and budget, for private events across Colorado. Enjoy one contract, one point of contact for the night, and our rates published right on the website. Send us the date and the venue - we take care of  the rest.",
    "The other lane are professional players throwing down their best in a format to serve your needs. From Jazz combos, Funk, Live DJs, Singer-Songwriter or Blues and Rock, they're are all configurable to your needs.",
    'This is the one that fills a floor without needing a stage. Usually guitar (or keys), bass and drums. More dancable energy or a fuller-sounding-but-still laid-back jazz ensemble. ',
    'Three musical act configurations cover almost every corporate enquiry: the office holiday party, the client dinner, and the member or association event. A duo or a trio through drinks and dinner, a quartet to fill the dance floor. Our musicians have done this for Amazon, NBCUniversal, Charles Schwab and the Denver Art Museum.',
    'What to actually bookk for a wedding',
    'a sample of crown pleasers',
})


# Sentences Daniel asked in chat to have rewritten, outside CopyDesk. The
# ledger can't know about those: it only retires a sentence when a later
# CopyDesk save names it as `old`. Each entry carries the date and his words.
# This is a record of his instructions, never a way round a miss.
REWRITTEN_ON_DANIELS_WORD = frozenset({
    # 2026-10-01, the For Planners page: "theres a large section near the top
    # that perports to answer questions. but the whole thing is confusing.
    # fix it." The seven document cards became six questions with answers;
    # this was the first card's body, his patch of an agent sentence. Its
    # facts (soundboard channel counts, preferred volume, written to be
    # forwarded, the six things worth confirming at contract) are in the
    # venue answer, and his card heading is kept verbatim as that answer's
    # link.
    "Stage footprint, dedicated circuits, soundboard channel counts, load-in times and preferred volume, It's written to be forwarded to the venue, and it includes the six things worth confirming at contract.",
})


def protected_strings() -> list:
    """Every `new` string Daniel published through CopyDesk on Signet and
    has not since rewritten or deleted there himself.

    An edit counts when its save has result.ok true, is not a dry run, and
    lists the edit's id in result.applied (a save can publish while some of
    its edits fail; those are in result.failed and never reached the site).
    Box, link-address and unformat edits carry an empty `new` and add
    nothing; an inserted paragraph (kind "insert") has a real `new` and
    counts like any other.

    The ledger is append-only, so file order is save order. Each save first
    retires every earlier string that one of its published edits names as
    `old` (a rewrite or a delete of Daniel's own sentence), then adds its
    own `new` strings; the two steps run per save, not per edit, so one edit
    in a save never retires a sentence another edit in the same save wrote.

    Duplicates kept (a sentence written in two places is still one protected
    sentence, but the ledger is the source of truth and de-duping here would
    hide a count drift); callers that want the unique set can dedupe
    themselves."""
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
        result = entry.get("result", {})
        if not result.get("ok") or result.get("dry_run"):
            continue
        applied = result.get("applied")
        applied_ids = {a.get("id") for a in applied if isinstance(a, dict)} \
            if isinstance(applied, list) else set()
        applied_ids.discard(None)
        published = [e for e in entry.get("edits", [])
                     if e.get("id") in applied_ids]
        retired = {normalize(e.get("old", "")) for e in published} - {""}
        if retired:
            strings = [s for s in strings if normalize(s) not in retired]
        for edit in published:
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
    haystacks += [normalize(inline_stripped_text(p)) for p in pages
                  if p.suffix == ".html"]

    misses, baseline_misses = [], []
    for s in unique:
        needle = normalize(s)
        if not needle or s in REWRITTEN_ON_DANIELS_WORD:
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
