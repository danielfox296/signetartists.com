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

Two more shapes of his own rewrite are read the same way (2026-10-03). The
later edit's `old` can hold the earlier sentence with more around it (the
run had gained a word at its end before he rewrote it): the sentence is
retired, and the rewrite is the protected one. And once a paragraph carries
bold, italic or a link, CopyDesk edits it one run at a time, so the later
edit's `old` can be a word or two inside the earlier sentence: the sentence
is kept with those words replaced, and that is the protected one. A box,
link-address or unformat edit, and an inserted paragraph, log the words of
the run they are attached to as `old` without changing them, and retire
nothing.

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


# Typos in Daniel's own sentences, corrected on his word (2026-10-03: "fix
# the typos"). The ledger keeps the sentence as he typed it; the site carries
# the corrected spelling, and that corrected sentence is the protected one.
# Each pair is (as typed, as corrected), applied to a ledger string before it
# is looked for. Spelling, a dropped or doubled word, an apostrophe, a capital
# on a proper noun: nothing else belongs here.
TYPOS_CORRECTED_ON_DANIELS_WORD = (
    ("a sample o the signet", "a sample of the signet"),
    ("what get's people", "what gets people"),
    ("We make sure to our bands play", "We make sure our bands play"),
    ("your guests converstaions", "your guests' conversations"),
    ("the evenuings energy", "the evening's energy"),
    ("is criticall.", "is critical."),
    ("it comes down how sensitive", "it comes down to how sensitive"),
    ("the company throws is on one of the things",
     "the company throws is one of the things"),
    ("Tejas Signh", "Tejas Singh"),
    ("some of your guests favorite tunes", "some of your guests' favorite tunes"),
    ("Bring a little latin flavor", "Bring a little Latin flavor"),
    ("Forth of July", "Fourth of July"),
    ("as far our as August", "as far out as August"),
    ("we may choose to approved corporate accounts",
     "we may choose to approve corporate accounts"),
    ("the Front range of Colorado", "the Front Range of Colorado"),
    ("Cove covering the ceremony", "Covering the ceremony"),
    ("and a a bit more or holiday weekends.",
     "and a bit more for holiday weekends."),
    ("is where the we go into resort booking",
     "is where we go into resort booking"),
    ("Live music in Colorado is prices in tiers",
     "Live music in Colorado is priced in tiers"),
    ("a denver party band", "a Denver party band"),
    ("but w hat else is included", "but what else is included"),
    ("a Colorado couples budget", "a Colorado couple's budget"),
    ("a jazz duo on over cocktails", "a jazz duo over cocktails"),
    ("on the dance floor . ", "on the dance floor. "),
    ("an hour on it's own", "an hour on its own"),
    ("some of our recomendations", "some of our recommendations"),
    ("These are the one that run latest and hits hardest.",
     "These are the ones that run latest and hit hardest."),
    ("The intention and flow of most parties similar.",
     "The intention and flow of most parties are similar."),
    ("for the honoree specifically The", "for the honoree specifically. The"),
    ("9 parties with a details of their own.",
     "9 parties with details of their own."),
)


def corrected(text: str) -> str:
    for typed, fixed in TYPOS_CORRECTED_ON_DANIELS_WORD:
        text = text.replace(typed, fixed)
    return text


# Edits that leave the words of their run as they were: a box, a link
# address, an unformat, a paragraph inserted after it. CopyDesk logs that
# run's text as their `old` (STRUCTURAL in copydesk.py), so they never retire
# or rewrite a protected sentence. Until 2026-10-03 they did: resizing a
# paragraph's box retired the sentence in it, and eleven of Daniel's
# sentences, the home page heading among them, had gone unprotected that way.
STRUCTURAL_KINDS = frozenset({"style", "href", "unwrap", "insert"})

# The shortest protected string that a longer `old` on the same page retires
# by containing it. Shorter than this it is a label or a heading, and turning
# up inside a paragraph he rewrote says nothing about the label itself.
CONTAINED_MIN = 40


def compared(text: str) -> str:
    """A ledger string as it is compared with another ledger string: typos
    corrected, then normalized. An `old` logged after a typo was corrected
    on the site carries the corrected spelling, and the `new` it rewrites
    was logged as typed."""
    return normalize(corrected(text))


def run_spans(text: str, old: str, before: str, after: str) -> list:
    """Where the run `old` sits inside the protected string `text`, going by
    the runs the editor showed either side of it (`before` and `after`, the
    edit's neighbors[0] and neighbors[2]). A place counts when what is left
    of the string on each side lines up with the neighbouring run on that
    side, whichever of the two is the longer; a side with nothing left of
    the string needs no neighbour. "almost" in the sentence it was cut from
    counts. "almost" in another sentence on the same page does not."""
    spans = []
    at = text.find(old)
    while at != -1:
        left, right = text[:at].rstrip(), text[at + len(old):].lstrip()
        left_ok = not left or (
            before and (left.endswith(before) or before.endswith(left)))
        right_ok = not right or (
            after and (right.startswith(after) or after.startswith(right)))
        if left_ok and right_ok:
            spans.append((at, at + len(old)))
        at = text.find(old, at + 1)
    return spans


def carried_forward(strings: list, page: str, published: list) -> list:
    """The protected strings of earlier saves, as one later save leaves them.
    `strings` is (page, text) pairs; `published` is the later save's edits
    that reached the site. Only an edit that changes words is read. See
    protected_strings() for the three ways it can retire or change a string."""
    runs = []
    for edit in published:
        if edit.get("kind") in STRUCTURAL_KINDS:
            continue
        old = compared(edit.get("old", ""))
        if not old:
            continue
        new = "" if edit.get("delete") else compared(edit.get("new", ""))
        near = list(edit.get("neighbors") or []) + [None] * 3
        runs.append((old, new, compared(near[0] or ""), compared(near[2] or "")))
    if not runs:
        return strings
    kept = []
    for owner, text in strings:
        was = compared(text)
        if any(old == was for old, _, _, _ in runs):
            continue
        if owner == page:
            if len(was) >= CONTAINED_MIN and any(was in old for old, _, _, _ in runs):
                continue
            cuts = []
            for old, new, before, after in runs:
                spans = run_spans(was, old, before, after)
                if len(spans) == 1:
                    cuts.append(spans[0] + (new,))
            cuts.sort()
            if cuts and all(a[1] <= b[0] for a, b in zip(cuts, cuts[1:])):
                now = was
                for at, upto, new in reversed(cuts):
                    now = now[:at] + new + now[upto:]
                now = normalize(now)
                if not now:
                    continue
                if now != was:
                    text = now
        kept.append((owner, text))
    return kept


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
    settles what its published word edits did to every earlier string, then
    adds its own `new` strings; the two steps run per save, not per edit, so
    one edit in a save never retires a sentence another edit in the same
    save wrote. An earlier string meets a later edit's `old` in three ways:

    The `old` is the string (a rewrite or a delete of Daniel's own
    sentence): the string is retired. This one is read across pages.

    The `old` holds the string with more around it, on the same page, and
    the string is CONTAINED_MIN characters or longer: the string is retired.
    The whole run it sat in was replaced by that edit's `new`, which is
    protected from here on (2026-10-03: a paragraph whose text had gained a
    trailing " The" ahead of a link before he rewrote it).

    The `old` is a run inside the string, on the same page, with the runs
    the editor showed either side of it lining up with the rest of the
    string (run_spans): the string stays protected with that run replaced
    by the edit's `new`. The places are found against the string as it
    stood before the save and then all applied, because the neighbours are
    logged as they stood when the page was opened. A run that is found
    twice in a string, or two runs that overlap, change nothing, and the
    stale string then fails the gate where someone will read it (2026-10-03:
    "almost", in italics, deleted from the corporate opening paragraph).

    A string changed that third way is returned as compared() leaves it,
    not as the ledger spells it.

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
        page = entry.get("page")
        strings = carried_forward(strings, page, published)
        for edit in published:
            if edit.get("delete"):
                continue
            new = edit.get("new", "")
            if new:
                strings.append((page, new))
    return [text for _, text in strings]


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
        needle = normalize(corrected(s))
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
