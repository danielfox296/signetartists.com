#!/usr/bin/env python3
"""Fetch album cover art for the songs on every act's song list.

    python3 scripts/act_covers.py            # fetch what's missing
    python3 scripts/act_covers.py --force    # fetch every cover again
    python3 scripts/act_covers.py --check    # list songs with no cover, fetch nothing

Each song in an act's `setlist.songs` ({title, artist, album?}) gets
img/covers/<artist>--<title>.jpg, the sleeve of the record the song first
came out on, found by Deezer track search (iTunes as a fallback). `album`
pins the record when the search picks the wrong one. A song nothing is found
for is drawn by the site as a type tile, so a miss is never an error.
"""

import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ACTS = os.path.join(ROOT, 'content', 'acts')
COVERS = os.path.join(ROOT, 'img', 'covers')
SOURCES = os.path.join(COVERS, 'SOURCES.md')
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                    'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'}

# Releases that aren't the record a song came from.
DEMOTE = ('live', 'karaoke', 'tribute', 'in the style of', 'cover', 'instrumental',
          'lullaby', 'piano version', 'acoustic version', 'remix', 'workout')
LATER = ('greatest hits', 'best of', 'essential', 'collection', 'anthology', 'gold',
         'hits', 'definitive', 'number ones', 'playlist', 'very best')


def slug(s):
    """The site's song slug: same rule as songSlug in site/src/components/sections.jsx."""
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c)).lower()
    s = s.replace('&', ' and ').replace("'", '').replace('’', '')
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def cover_file(song):
    return f"{slug(song['artist'])}--{slug(song['title'])}.jpg"


def norm(s):
    s = unicodedata.normalize('NFKD', s or '')
    s = ''.join(c for c in s if not unicodedata.combining(c)).lower().replace('&', ' and ')
    s = re.sub(r'[^a-z0-9 ]+', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s[4:] if s.startswith('the ') else s


def bare(title):
    """A track or album title without its (Remastered) or [Deluxe] tags."""
    return re.sub(r'\s*[\(\[][^\)\]]*[\)\]]', '', title or '').strip(' :-')


def http_json(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode('utf-8'))


def deezer_tracks(song):
    q = f'artist:"{song["artist"]}" track:"{bare(song["title"])}"'
    rows = http_json('https://api.deezer.com/search/track?' + urllib.parse.urlencode({'q': q, 'limit': 40})).get('data', [])
    if not rows:
        q = f'{song["artist"]} {song["title"]}'
        rows = http_json('https://api.deezer.com/search/track?' + urllib.parse.urlencode({'q': q, 'limit': 40})).get('data', [])
    return [{'artist': r['artist']['name'], 'track': r['title'], 'album': r['album']['title'],
             'art': r['album'].get('cover_xl') or r['album'].get('cover_big'),
             'id': f"deezer album {r['album']['id']}", 'rank': r.get('rank', 0)}
            for r in rows if r.get('album', {}).get('cover_big')]


def itunes_tracks(song):
    q = urllib.parse.urlencode({'term': f'{song["artist"]} {song["title"]}', 'entity': 'song', 'limit': 25, 'country': 'US'})
    try:
        rows = http_json('https://itunes.apple.com/search?' + q).get('results', [])
    except Exception:
        return []
    return [{'artist': r.get('artistName', ''), 'track': r.get('trackName', ''), 'album': r.get('collectionName', ''),
             'art': r['artworkUrl100'].replace('100x100bb', '1000x1000bb'),
             'id': f"itunes album {r.get('collectionId', '?')}", 'rank': 0}
            for r in rows if r.get('artworkUrl100')]


def credits(name):
    """The names in a credit: 'Warren G and Nate Dogg' is two."""
    return {norm(x) for x in re.split(r'\s+(?:and|&|feat\.?|featuring|with|x)\s+|,\s*', name or '', flags=re.I) if x.strip()}


def same_artist(want, got):
    """Exact, or one of the names in a joint credit: a tribute act whose name
    contains the artist's ('The Beatles Complete on Ukulele') never passes."""
    w, g = norm(want), norm(got)
    return w == g or w in credits(got) or g in credits(want) or bool(credits(want) & credits(got))


def score(song, hit):
    if not same_artist(song['artist'], hit['artist']):
        return 0
    want, got = norm(bare(song['title'])), norm(bare(hit['track']))
    if not want or not (got == want or got.startswith(want)):
        return 0
    s = 30 if got == want else 20
    album = norm(hit['album'])
    if song.get('album'):
        target = norm(song['album'])
        s += 40 if norm(bare(hit['album'])) == target else 20 if target in album else 0
    for bad in DEMOTE:
        if bad in album or bad in norm(hit['track']):
            s -= 15
    for later in LATER:
        if later in album:
            s -= 8
    return s


def album_pin(song):
    """The named album itself, when the track search didn't surface it."""
    q = urllib.parse.urlencode({'q': f'{song["artist"]} {song["album"]}', 'limit': 15})
    for a in http_json('https://api.deezer.com/search/album?' + q).get('data', []):
        artist_ok = same_artist(song['artist'], a['artist']['name'])
        if artist_ok and norm(bare(a['title'])) == norm(song['album']) and a.get('cover_big'):
            return {'artist': a['artist']['name'], 'track': song['title'], 'album': a['title'],
                    'art': a.get('cover_xl') or a['cover_big'], 'id': f"deezer album {a['id']}", 'rank': 0}
    return None


def best(song):
    if song.get('album'):
        try:
            hits = deezer_tracks(song)
        except Exception:
            hits = []
        exact = [h for h in hits if score(song, h) > 0 and norm(bare(h['album'])) == norm(song['album'])]
        if exact:
            return max(exact, key=lambda h: (score(song, h), h.get('rank', 0)))
        try:
            pinned = album_pin(song)
        except Exception:
            pinned = None
        if pinned:
            return pinned
    for search in (deezer_tracks, itunes_tracks):
        try:
            hits = search(song)
        except Exception as e:  # network trouble is a miss, not a stop
            print(f'  ! {search.__name__}: {e}')
            hits = []
        scored = sorted(((score(song, h), h.get('rank', 0), h) for h in hits), key=lambda x: (x[0], x[1]), reverse=True)
        if scored and scored[0][0] > 0:
            return scored[0][2]
        time.sleep(0.4)
    return None


def songs():
    seen = {}
    for name in sorted(os.listdir(ACTS)):
        if not name.endswith('.json'):
            continue
        with open(os.path.join(ACTS, name), encoding='utf-8') as f:
            act = json.load(f)
        for s in ((act.get('setlist') or {}).get('songs') or []):
            if s.get('title') and s.get('artist') and s.get('cover') is not False:
                seen.setdefault(cover_file(s), (s, act['id']))
    return seen


def main(argv):
    force, check = '--force' in argv, '--check' in argv
    os.makedirs(COVERS, exist_ok=True)
    rows, misses = [], []
    for file, (song, act) in songs().items():
        dest = os.path.join(COVERS, file)
        if os.path.exists(dest) and not force:
            continue
        if check:
            misses.append((act, song))
            continue
        hit = best(song)
        if not hit:
            misses.append((act, song))
            print(f'  - {song["title"]} ({song["artist"]}): nothing found')
            continue
        req = urllib.request.Request(hit['art'], headers=UA)
        with urllib.request.urlopen(req, timeout=30) as r, open(dest, 'wb') as out:
            out.write(r.read())
        rows.append(f"{file} — {song['title']} — {hit['artist']} — {hit['album']} — {hit['id']}")
        print(f'  + {file}  <- {hit["album"]}')
        time.sleep(0.4)
    if rows:
        with open(SOURCES, 'a', encoding='utf-8') as f:
            f.write('\n' + '\n'.join(rows) + '\n')
    if misses:
        print('\nNo cover (the site draws these as type tiles; add "album" to pin one):')
        for act, s in misses:
            print(f'  {act}: {s["title"]} ({s["artist"]})')
    repeats = mark_repeats()
    print(f'\n{len(rows)} fetched, {len(misses)} without a cover, {repeats} set in type as a repeat sleeve.')


def album_of():
    """file -> the album id it was fetched from, from SOURCES.md (last row wins)."""
    out = {}
    if os.path.exists(SOURCES):
        for line in open(SOURCES, encoding='utf-8'):
            parts = [p.strip() for p in line.split(' — ')]
            if len(parts) == 5 and parts[0].endswith('.jpg'):
                out[parts[0]] = parts[4]
    return out


def mark_repeats():
    """Two songs off one record would show one sleeve twice in an act's
    patchwork, so the later song gets "cover": false and is set in type."""
    albums, n = album_of(), 0
    for name in sorted(os.listdir(ACTS)):
        if not name.endswith('.json'):
            continue
        path = os.path.join(ACTS, name)
        with open(path, encoding='utf-8') as f:
            act = json.load(f)
        seen, changed = set(), False
        for s in ((act.get('setlist') or {}).get('songs') or []):
            if not s.get('artist') or s.get('cover') is False:
                continue
            file = cover_file(s)
            if not os.path.exists(os.path.join(COVERS, file)):
                continue
            key = albums.get(file, file)
            if key in seen:
                s['cover'] = False
                changed, n = True, n + 1
            seen.add(key)
        if changed:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(json.dumps(act, indent=1, ensure_ascii=False) + '\n')
    return n


if __name__ == '__main__':
    main(sys.argv[1:])
