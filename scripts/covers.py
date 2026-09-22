#!/usr/bin/env python3
"""Cover-art walls for the repertoire page.

Ported from foxlessons.com/website/scripts/covers.py. Same pull and match
logic (it's proven); the data shape and the emitted caption are rewired.

    foxlessons: a wall of ALBUMS. caption = player credit / act · album
    here:       a wall of SONGS.   caption = song title / artist · album

One source of truth: the MANIFEST below holds every set (eyebrow, h2, intro
copy) and its six anchor songs. Editorial copy for the sets lives in
../../SETS.md; the full song catalog lives in ../../REPERTOIRE.md. Keep the
three in sync — the manifest carries only the six songs that get art.

    python3 scripts/covers.py pull    # fetch art via Deezer / iTunes
                                      #   -> img/covers/<slug>.jpg (~500-1000px)
                                      #   -> img/covers/SOURCES.md (provenance)
    python3 scripts/covers.py emit    # write _src/pages/repertoire/sections/02-sets.html
    python3 scripts/covers.py pull --force   # re-download existing files too

Pull is idempotent (existing files are skipped) and prints a match report so
every hit can be eyeballed: slug -> matched artist | collection. A cover that
can't be confidently matched is SKIPPED and flagged, never guessed.

Art source: Deezer album search (no key, liberal rate limits), cover_big
500x500 — plenty for ~170-260px display tiles at 2x. iTunes Search API is the
fallback (it 403s bursts from scripts, so it's tried once, politely). Editorial
use identifying the recording a song comes from; provenance (source + id)
recorded in SOURCES.md.

ART IS FROM THE ORIGINAL RECORDING, not a cover version. Where the repertoire
lists two artists (Wagon Wheel, Galway Girl, Dancing in the Moonlight), the
manifest pins the first-released recording.
"""

import html
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COVERS_DIR = os.path.join(ROOT, 'img', 'covers')
SEARCH_URL = 'https://itunes.apple.com/search?{q}'
# The search API 403s non-browser UAs from python; a plain browser UA passes.
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                    'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'}


def C(slug, song, artist, album, search=None, match_artist=None, match_album=None,
      deezer_id=None):
    """One cover. song = the title a planner recognizes (the caption's first
    line), artist = the name on the spine, album = the record it came from.
    deezer_id pins a specific album when search can't surface the real release
    (self-titled records and one-letter titles are the usual offenders)."""
    return {
        'slug': slug, 'song': song, 'artist': artist, 'album': album,
        'search': search or f'{artist} {album}',
        'match_artist': match_artist or artist,
        'match_album': match_album or album,
        'deezer_id': deezer_id,
    }


MANIFEST = [
    {
        'eyebrow': 'Doors to first toast',
        'h2': 'The hour nobody remembers, and everybody feels.',
        'intro': "Guests are finding the bar, finding each other, deciding what kind of night this is. The music keeps the room warm and unhurried, present enough that it isn't silent and quiet enough that nobody raises their voice. We play this hour softer than most bands want to.",
        'covers': [
            C('into-the-mystic', 'Into the Mystic', 'Van Morrison', 'Moondance'),
            C('dock-of-the-bay', "(Sittin' On) The Dock of the Bay", 'Otis Redding', 'The Dock of the Bay'),
            C('three-little-birds', 'Three Little Birds', 'Bob Marley & The Wailers', 'Exodus',
              search='bob marley exodus', match_artist='bob marley'),
            # Self-titled debut; album search buries it under the live records
            # and hits collections. Verified by tracklist (Take It Easy opens).
            C('peaceful-easy-feeling', 'Peaceful Easy Feeling', 'Eagles', 'Eagles',
              deezer_id=6670659),
            C('inaudible-melodies', 'Inaudible Melodies', 'Jack Johnson', 'Brushfire Fairytales'),
            C('slow-burn', 'Slow Burn', 'Kacey Musgraves', 'Golden Hour'),
        ],
    },
    {
        'eyebrow': 'Seated service',
        'h2': 'Conversation leads. We follow.',
        'intro': "Dinner is the easiest set to get wrong. Too much and the room fights the band through the entrée; too little and it feels like the music stopped. Enough melody to be worth hearing, enough restraint to sit under four hundred people talking.",
        'covers': [
            # Self-titled: search can't tell the 1975 record from the band's
            # other releases, so pin it. Verified by tracklist (Rhiannon,
            # Landslide, Over My Head).
            C('landslide', 'Landslide', 'Fleetwood Mac', 'Fleetwood Mac', deezer_id=339661),
            C('fire-and-rain', 'Fire and Rain', 'James Taylor', 'Sweet Baby James'),
            C('wish-you-were-here', 'Wish You Were Here', 'Pink Floyd', 'Wish You Were Here'),
            C('angel-from-montgomery', 'Angel from Montgomery', 'John Prine', 'John Prine'),
            C('the-scientist', 'The Scientist', 'Coldplay', 'A Rush of Blood to the Head'),
            C('hey-there-delilah', 'Hey There Delilah', "Plain White T's", 'All That We Needed',
              search='plain white ts all that we needed', match_artist='plain white'),
        ],
    },
    {
        'eyebrow': 'Plates clearing',
        'h2': 'The twenty minutes that decide the rest of the night.',
        'intro': "Nobody's dancing yet and dinner is over. Most bands wait it out. We use it. The set climbs on purpose, song by song, so that when the floor opens the room is already leaning forward.",
        'covers': [
            C('tiny-dancer', 'Tiny Dancer', 'Elton John', 'Madman Across the Water'),
            C('have-you-ever-seen-the-rain', 'Have You Ever Seen the Rain', 'Creedence Clearwater Revival', 'Pendulum'),
            C('ho-hey', 'Ho Hey', 'The Lumineers', 'The Lumineers'),
            C('ring-of-fire', 'Ring of Fire', 'Johnny Cash', 'Ring of Fire: The Best of Johnny Cash',
              search='johnny cash ring of fire best of', match_album='Ring of Fire'),
            C('lean-on-me', 'Lean on Me', 'Bill Withers', 'Still Bill'),
            C('use-somebody', 'Use Somebody', 'Kings of Leon', 'Only by the Night'),
        ],
    },
    {
        'eyebrow': 'Dancing',
        'h2': 'Songs that work on a room of strangers.',
        'intro': "A floor-filler isn't the best song, it's the song the most people in the room have in common. Four generations, one floor, nobody sitting down because they didn't recognize it. We adjust this set live. If a room wants more country, we go there.",
        'covers': [
            C('brown-eyed-girl', 'Brown Eyed Girl', 'Van Morrison', "Blowin' Your Mind!"),
            C('valerie', 'Valerie', 'Mark Ronson', 'Version'),
            C('i-wanna-dance-with-somebody', 'I Wanna Dance with Somebody', 'Whitney Houston', 'Whitney'),
            C('riptide', 'Riptide', 'Vance Joy', 'Dream Your Life Away'),
            C('dancing-in-the-moonlight', 'Dancing in the Moonlight', 'King Harvest', 'Dancing in the Moonlight'),
            # On Deezer under the artist but absent from album search results.
            C('i-will-wait', 'I Will Wait', 'Mumford & Sons', 'Babel', deezer_id=650717441),
        ],
    },
    {
        'eyebrow': 'The finish',
        'h2': 'Every night should land somewhere.',
        'intro': "The last three songs are the ones people talk about in the car. We plan them with you rather than improvise them, and we'd rather end a song early with the room roaring than play past the moment.",
        'covers': [
            C('dont-stop-believin', "Don't Stop Believin'", 'Journey', 'Escape'),
            C('sweet-caroline', 'Sweet Caroline', 'Neil Diamond', "Brother Love's Travelling Salvation Show",
              search='neil diamond brother love travelling salvation show',
              match_album='Brother Love'),
            C('piano-man', 'Piano Man', 'Billy Joel', 'Piano Man'),
            C('wonderwall', 'Wonderwall', 'Oasis', "(What's the Story) Morning Glory?",
              search='oasis whats the story morning glory', match_album='Morning Glory'),
            # Friends in Low Places is the better closer and stays in the set
            # below — but Garth Brooks withheld his catalog from streaming, so
            # no sleeve exists to pull on either service. Mr. Brightside takes
            # the tile; the liner notes carry the full set either way.
            C('mr-brightside', 'Mr. Brightside', 'The Killers', 'Hot Fuss', deezer_id=164869492),
            C('country-roads', 'Take Me Home, Country Roads', 'John Denver', 'Poems, Prayers & Promises',
              search='john denver poems prayers and promises', match_album='Poems'),
        ],
    },
    {
        # Trade vocabulary, not couple vocabulary. Planners book weddings and
        # say "formalities"; the site never addresses a couple directly.
        'eyebrow': 'Ceremony and formalities',
        'h2': 'The three minutes with no second take.',
        'intro': "Processionals end when the aisle ends rather than when the song does, so we watch and we land it. Same for a first dance or an award walk-up. We also read lyrics before agreeing to anything, which is why a few romantic-sounding requests come back with a phone call.",
        'covers': [
            C('cant-help-falling-in-love', "Can't Help Falling in Love", 'Elvis Presley', 'Blue Hawaii'),
            # A one-letter album title matches everything, so pin it. Deezer
            # carries only the deluxe; same green sleeve as the standard.
            C('thinking-out-loud', 'Thinking Out Loud', 'Ed Sheeran', 'x', deezer_id=7964062),
            C('tennessee-whiskey', 'Tennessee Whiskey', 'Chris Stapleton', 'Traveller'),
            C('god-only-knows', 'God Only Knows', 'The Beach Boys', 'Pet Sounds'),
            # Self-titled again. Verified by tracklist (Your Song opens it).
            # 99998 is the same record but its sleeve carries a DELUXE EDITION
            # band; this release is the clean original art.
            C('your-song', 'Your Song', 'Elton John', 'Elton John', deezer_id=122252),
            C('cover-me-up', 'Cover Me Up', 'Jason Isbell', 'Southeastern'),
        ],
    },
]


# ---------------------------------------------------------------------------
# matching  (unchanged from the foxlessons original)
# ---------------------------------------------------------------------------

def norm(s):
    """Lowercase, strip accents and punctuation, drop a leading 'the '."""
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace('&', ' and ')
    s = re.sub(r'[^a-z0-9 ]+', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    if s.startswith('the '):
        s = s[4:]
    return s


def clean_title(title):
    """Drop reissue tags: (Remastered), [Deluxe Edition], 'Remastered 2011' etc."""
    t = re.sub(r'\s*[\(\[][^\)\]]*[\)\]]', '', title)
    return t.strip(' :-')


def score(cover, hit):
    """0 = no match. Artist must match (any listed alias); album scored
    exact > prefix > substring against the reissue-tag-stripped title.
    Live/tribute/karaoke releases the manifest didn't ask for are demoted so
    the studio art wins ties."""
    aliases = cover['match_artist']
    if isinstance(aliases, str):
        aliases = [aliases]
    if not any(norm(a) in norm(hit['artist']) for a in aliases):
        return 0
    cand = norm(clean_title(hit['title']))
    target = norm(cover['match_album'])
    if not cand or not target:
        return 0
    s = 0
    if cand == target:
        s = 30
    elif cand.startswith(target):
        s = 20
    elif target in cand:
        s = 10
    if s:
        full = norm(hit['title'])
        for bad in ('live', 'tribute', 'karaoke', 'in the style of', 'cover'):
            if bad in full and bad not in target:
                s -= 15
    return max(s, 0)


def http_json(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode('utf-8'))


def search_deezer(term, limit=10):
    """Hits normalized to {artist, title, art, id, source}."""
    q = urllib.parse.urlencode({'q': term, 'limit': limit})
    rows = http_json('https://api.deezer.com/search/album?' + q).get('data', [])
    return [{'artist': a['artist']['name'], 'title': a['title'],
             'art': a.get('cover_big') or a.get('cover_medium'),
             'art_xl': a.get('cover_xl'),
             'id': f"deezer {a['id']}", 'source': 'deezer'} for a in rows if a.get('cover_big')]


def search_itunes(term, limit=10):
    """Fallback only: this API 403s scripted bursts, so one polite try."""
    q = urllib.parse.urlencode({
        'term': term, 'entity': 'album', 'limit': limit, 'country': 'US'})
    try:
        rows = http_json(SEARCH_URL.format(q=q)).get('results', [])
    except Exception:
        return []
    return [{'artist': r.get('artistName', ''), 'title': r.get('collectionName', ''),
             'art': r['artworkUrl100'].replace('100x100bb', '600x600bb'),
             'id': f"itunes {r.get('collectionId', '?')}", 'source': 'itunes'}
            for r in rows if r.get('artworkUrl100')]


def best_hit(cover):
    if cover.get('deezer_id'):
        a = http_json(f"https://api.deezer.com/album/{cover['deezer_id']}")
        return {'artist': a['artist']['name'], 'title': a['title'],
                'art': a['cover_big'], 'art_xl': a.get('cover_xl'),
                'id': f"deezer {a['id']} (pinned)",
                'source': 'deezer'}, 30
    for search in (search_deezer, search_itunes):
        hits = search(cover['search'])
        time.sleep(0.25)
        best, best_key = None, (0,)
        for h in hits:
            s = score(cover, h)
            # tie-break toward the shortest raw title: plain releases beat
            # anniversary/deluxe editions whose art often adds trade dress
            key = (s, -len(h['title']))
            if s and key > best_key:
                best, best_key = h, key
        if best:
            return best, best_key[0]
    return None, 0


def pull(force=False):
    report, misses, sources = [], [], []
    os.makedirs(COVERS_DIR, exist_ok=True)
    for mod in MANIFEST:
        for j, cover in enumerate(mod['covers']):
            dest = os.path.join(COVERS_DIR, cover['slug'] + '.jpg')
            if os.path.exists(dest) and not force:
                report.append(f"  = {cover['slug']}  (already on disk)")
                continue
            best, best_s = best_hit(cover)
            if not best:
                misses.append(f"  ! {cover['slug']}  NO MATCH for term '{cover['search']}'")
                continue
            # first cover of each set is the 2x2 feature tile: renders up to
            # ~500 CSS px, so take the 1000px art when Deezer has it
            art = (best.get('art_xl') if j == 0 else None) or best['art']
            req = urllib.request.Request(art, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            with open(dest, 'wb') as f:
                f.write(data)
            kb = len(data) // 1024
            report.append(
                f"  + {cover['slug']}  [{best_s}] {best['artist']} | "
                f"{best['title']} ({kb}KB, {best['source']})")
            sources.append((cover, best))
            time.sleep(0.15)
    print('\n'.join(report))
    if misses:
        print('\nMISSES (nothing downloaded, fix search terms or pin a deezer_id):')
        print('\n'.join(misses))
    if sources:
        write_sources(sources)
    print(f"\n{len(report)} handled, {len(misses)} misses.")
    return not misses


def write_sources(new_rows):
    """Append provenance rows to img/covers/SOURCES.md (created on first run)."""
    path = os.path.join(COVERS_DIR, 'SOURCES.md')
    exists = os.path.exists(path)
    with open(path, 'a', encoding='utf-8') as f:
        if not exists:
            f.write(
                '# img/covers sources — pulled by scripts/covers.py\n\n'
                'Album cover art for the repertoire-page set walls (Deezer album\n'
                'search primary, iTunes Search API fallback; ~500px). Editorial use:\n'
                'identifying the original recording a song in the set comes from.\n'
                'Rows: slug — song — matched artist — matched album — source id.\n\n')
        for cover, best in new_rows:
            f.write(
                f"{cover['slug']}.jpg — {cover['song']} — {best['artist']} — "
                f"{best['title']} — {best['id']}\n")


# ---------------------------------------------------------------------------
# emit — full-bleed parallax cover walls
# ---------------------------------------------------------------------------
# Each set renders as a 10-column, 3-row tile wall that spans the whole
# viewport (no wrap around the grid). The text block is an island carved out
# of the grid (4 cols x 2 rows), alternating left/right per set. Tiles are
# placed by the hand-drawn maps below; unplaced cells stay empty on purpose.
# Below 1100px the maps collapse to a packed dense grid and the parallax
# stands down.
#
# Ground is .section--night: the site is paper-light and information-first,
# and full-colour album art on cream reads as a busy tile field. On ink it
# reads as records on a shelf. This is the one place the paper system lets
# the outside world in.

COLS = 10
# (col, row, colspan, rowspan) in island-LEFT orientation; the first tile of
# every set is the 2x2 feature. Maps are mirrored for island-right walls.
#
# Every tile stays in columns 5-10. The text island spans all three rows of
# columns 1-4, because rows are locked to 10vw to keep the sleeves square and
# two rows of that is not enough height for the copy at 1100px. Nothing may be
# placed in columns 1-4 or it lands under the text.
LAYOUTS = {
    4: [(6, 1, 2, 2), (9, 1, 1, 1), (5, 3, 1, 1), (8, 3, 1, 1)],
    5: [(6, 1, 2, 2), (9, 1, 1, 1), (5, 2, 1, 1), (10, 2, 1, 1), (8, 3, 1, 1)],
    6: [(6, 1, 2, 2), (9, 1, 1, 1), (5, 2, 1, 1), (10, 2, 1, 1), (6, 3, 1, 1), (9, 3, 1, 1)],
}
DEPTHS = (0.3, 0.5, 0.7, 0.9, 1.0)   # parallax rates; sign flips by slug hash


def _hash(s):
    return sum(ord(c) for c in s)


def tile(cover, place, feature):
    """Caption is the rewire: song title leads, artist · album supports.
    A planner scanning the wall is looking for songs, not sleeves."""
    e = html.escape
    song, artist, album = cover['song'], cover['artist'], cover['album']
    line2 = artist if artist == album else f'{artist} · {album}'
    col, row, cs, rs = place
    h = _hash(cover['slug'])
    depth = 0.22 if feature else DEPTHS[h % len(DEPTHS)] * (1 if (h >> 1) % 2 else -1)
    z = 2 + (h % 3)
    style = f'--c:{col};--r:{row};--cs:{cs};--rs:{rs};--d:{depth:g};--z:{z}'
    return (
        f'    <figure class="wall-tile" style="{style}">\n'
        f'      <img src="{{{{nav_prefix}}}}img/covers/{cover["slug"]}.jpg" '
        f'alt="{e(album)} album cover, {e(artist)}" loading="lazy" decoding="async">\n'
        f'      <figcaption><span class="wall-song">{e(song)}</span>'
        f'<span class="wall-credit">{e(line2)}</span></figcaption>\n'
        f'    </figure>\n')


PARALLAX_JS = """<script>
  // Set-wall parallax: every sleeve drifts at its own rate (--d) against
  // scroll. Desktop-map layouts only (>=1100px; the packed grids hold still),
  // reduced motion wins outright, and with JS off the walls are simply
  // static — placement never depends on this script.
  (function () {
    var mm = window.matchMedia;
    if (!mm || mm('(prefers-reduced-motion: reduce)').matches) return;
    var tiles = [];
    document.querySelectorAll('.cover-wall .wall-tile').forEach(function (t) {
      tiles.push({ el: t, d: parseFloat(t.style.getPropertyValue('--d')) || 0 });
    });
    if (!tiles.length) return;
    var MAX = 96, wide = mm('(min-width: 1100px)').matches, ticking = false;
    function frame() {
      ticking = false;
      var vh = window.innerHeight;
      var shifts = tiles.map(function (t) {
        var r = t.el.getBoundingClientRect();          // read phase
        if (r.bottom < -MAX || r.top > vh + MAX) return null;
        return ((r.top + r.height / 2 - vh / 2) / vh) * t.d * -MAX;
      });
      shifts.forEach(function (y, i) {                 // write phase
        if (y !== null) tiles[i].el.style.transform = 'translate3d(0,' + y.toFixed(1) + 'px,0)';
      });
    }
    function onScroll() {
      if (!wide || ticking) return;
      ticking = true;
      requestAnimationFrame(frame);
    }
    mm('(min-width: 1100px)').addEventListener('change', function (e) {
      wide = e.matches;
      if (!wide) tiles.forEach(function (t) { t.el.style.transform = ''; });
      else onScroll();
    });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    onScroll();
  })();
</script>
"""


def emit():
    out = []
    for i, mod in enumerate(MANIFEST):
        n = len(mod['covers'])
        if n not in LAYOUTS:
            raise SystemExit(f'set {i} ("{mod["eyebrow"]}"): no layout map for {n} covers')
        flip = i % 2 == 1
        places = LAYOUTS[n]
        if flip:
            places = [(COLS + 2 - c - cs, r, cs, rs) for (c, r, cs, rs) in places]
        cls = 'cover-wall cover-wall--flip' if flip else 'cover-wall'
        out.append(f'<section class="section--night {cls}">\n')
        out.append('  <div class="wall-grid">\n')
        out.append('    <div class="wall-text">\n')
        out.append(f'      <span class="eyebrow">{html.escape(mod["eyebrow"])}</span>\n')
        out.append(f'      <h2 class="h2">{html.escape(mod["h2"])}</h2>\n')
        out.append(f'      <p class="prose">{html.escape(mod["intro"])}</p>\n')
        # No CTA inside the last wall. foxlessons puts one there because its
        # instrument pages end on the wall; this page has a close section
        # directly underneath with the same button, and the extra one both
        # duplicates it and overruns the island's height.
        out.append('    </div>\n')
        for j, cover in enumerate(mod['covers']):
            out.append(tile(cover, places[j], feature=(j == 0)))
        out.append('  </div>\n')
        notes = ' · '.join(f"{c['song']}, {c['artist']}" for c in mod['covers'])
        out.append(f'  <div class="wrap"><p class="wall-notes">{html.escape(notes)}</p></div>\n')
        out.append('</section>\n')
        if i < len(MANIFEST) - 1:
            out.append('\n')
    out.append('\n')
    out.append(PARALLAX_JS)
    dest_dir = os.path.join(ROOT, '_src', 'pages', 'repertoire', 'sections')
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, '02-sets.html')
    with open(dest, 'w', encoding='utf-8') as f:
        f.write(''.join(out))
    n = sum(len(m['covers']) for m in MANIFEST)
    print(f'wrote {os.path.relpath(dest, ROOT)} ({len(MANIFEST)} walls, {n} covers)')


if __name__ == '__main__':
    args = sys.argv[1:]
    if not args or args[0] not in ('pull', 'emit'):
        print(__doc__)
        sys.exit(1)
    if args[0] == 'pull':
        ok = pull(force='--force' in args)
        sys.exit(0 if ok else 1)
    emit()
