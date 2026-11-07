#!/usr/bin/env python3
"""Parse ../../REPERTOIRE.md into the searchable catalog section.

REPERTOIRE.md (in the planning workspace, one level above this repo) is the
single source of truth for the song book. Nothing here is hand-maintained:

    python3 scripts/repertoire.py     # -> _src/pages/repertoire/sections/03-catalog.html
                                      #    _src/data/repertoire.json

The emitted section is a plain list that works with JavaScript off — filtering
is progressive enhancement layered on top, never the thing that makes the songs
visible. Filter chips are built from the tags actually present, so adding a tag
in the Markdown adds a chip without touching this file.

Two line shapes are accepted, matching how REPERTOIRE.md is written:

    - Song Title — `E3` `dance` `singalong`             (under a **Artist** heading)
    - **Song Title** — Artist · `E3` `dance`            (flat list)
"""

import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.normpath(os.path.join(ROOT, '..', 'REPERTOIRE.md'))

# Tag vocabulary, in display order. Anything in the Markdown that isn't here is
# still carried through to the data — it just doesn't get a chip, so a typo
# shows up as a missing filter rather than a silently dropped song.
ENERGY = ['E1', 'E2', 'E3', 'E4', 'E5']
MOMENTS = [
    ('arrival', 'Arrival'), ('dinner', 'Dinner'), ('lift', 'The turn'),
    ('dance', 'Dancing'), ('closer', 'Closer'), ('ceremony', 'Ceremony'),
]
FLAGS = [
    ('singalong', 'Everyone knows it'), ('firstdance', 'First dance'),
    ('request', 'Requested often'), ('band', 'Needs the full band'),
    ('lyric-trap', 'Read the lyrics first'), ('check-lyrics', 'Clear with the client'),
]

SECTION = re.compile(r'^##\s+(.*)$')
ARTIST_HEAD = re.compile(r'^\*\*(.+?)\*\*\s*$')
TAGS = re.compile(r'`([^`]+)`')
# "- **Song** — Artist · rest"  or  "- Song — rest"
FLAT = re.compile(r'^-\s+\*\*(.+?)\*\*\s+—\s+(.+?)\s+·\s+(.*)$')
UNDER = re.compile(r'^-\s+(.+?)\s+—\s+(.*)$')

SKIP_SECTIONS = {'Tag legend', 'Maintenance notes'}


def parse(path):
    songs, section, artist = [], None, None
    with open(path, encoding='utf-8') as f:
        for raw in f:
            line = raw.rstrip('\n')
            m = SECTION.match(line)
            if m:
                section, artist = m.group(1).strip(), None
                continue
            if section is None or section in SKIP_SECTIONS:
                continue
            m = ARTIST_HEAD.match(line)
            if m:
                artist = m.group(1).strip()
                continue
            if not line.startswith('- '):
                continue
            m = FLAT.match(line)
            if m:
                title, who, rest = m.group(1), m.group(2), m.group(3)
            else:
                m = UNDER.match(line)
                if not m or not artist:
                    continue
                title, who, rest = m.group(1), artist, m.group(2)
            tags = TAGS.findall(rest)
            if not tags:
                continue
            # Strip the italic aside some rows carry, e.g. "*(1973 — filed here)*"
            title = re.sub(r'\s*\*\(.*?\)\*\s*$', '', title).strip()
            songs.append({
                'title': title,
                'artist': who.strip(),
                'section': section,
                'energy': next((t for t in tags if t in ENERGY), None),
                'moments': [t for t in tags if t in dict(MOMENTS)],
                'flags': [t for t in tags if t in dict(FLAGS)],
            })
    return songs


def chips(songs):
    """Only offer a filter that would actually return something."""
    present = set()
    for s in songs:
        present.update(s['moments'])
        present.update(s['flags'])
    out = []
    for key, label in MOMENTS + FLAGS:
        if key in present:
            out.append((key, label))
    return out


def emit(songs):
    e = html.escape
    o = []
    o.append('<section class="section section--sunk section--ruled catalog" id="catalog">\n')
    o.append('  <div class="wrap">\n')
    o.append('    <div class="heading">\n')
    o.append('      <p class="eyebrow">Everything else</p>\n')
    o.append(f'      <h2 class="h2">The whole book, all {len(songs)} of them.</h2>\n')
    o.append('      <p class="lede">The sets above are how a night gets built. This is what '
             'they get built from. If your client asks for something that isn&#x27;t here, the '
             'first learned song is included in every booking.</p>\n')
    o.append('    </div>\n')

    o.append('    <div class="catalog-controls" data-catalog-controls hidden>\n')
    o.append('      <label class="catalog-search">\n')
    o.append('        <span class="visually-hidden">Search the repertoire</span>\n')
    o.append('        <input type="search" placeholder="Search a song or artist" '
             'data-catalog-search autocomplete="off">\n')
    o.append('      </label>\n')
    o.append('      <div class="catalog-chips" role="group" aria-label="Filter by moment">\n')
    for key, label in chips(songs):
        o.append(f'        <button type="button" class="chip" data-filter="{e(key)}" '
                 f'aria-pressed="false">{e(label)}</button>\n')
    o.append('      </div>\n')
    o.append('      <p class="catalog-count note" data-catalog-count aria-live="polite"></p>\n')
    o.append('    </div>\n')

    o.append('    <ul class="catalog-list" data-catalog-list>\n')
    for s in songs:
        tags = ' '.join(([s['energy']] if s['energy'] else []) + s['moments'] + s['flags'])
        hay = f"{s['title']} {s['artist']}".lower()
        o.append(
            f'      <li class="catalog-row" data-tags="{e(tags)}" data-search="{e(hay)}">'
            f'<span class="catalog-song">{e(s["title"])}</span>'
            f'<span class="catalog-artist">{e(s["artist"])}</span></li>\n')
    o.append('    </ul>\n')
    o.append('    <p class="catalog-empty note" data-catalog-empty hidden>'
             'Nothing here by that name — which doesn&#x27;t mean we won&#x27;t play it. '
             '<a href="{{nav_prefix}}contact/">Ask.</a></p>\n')
    o.append('  </div>\n')
    o.append(CATALOG_JS)
    o.append('</section>\n')
    return ''.join(o)


CATALOG_JS = """  <script>
    // Progressive enhancement only: the full list is in the HTML and readable
    // with JS off, which is why the controls ship hidden and this reveals them.
    (function () {
      var root = document.getElementById('catalog');
      if (!root) return;
      var controls = root.querySelector('[data-catalog-controls]');
      var search = root.querySelector('[data-catalog-search]');
      var count = root.querySelector('[data-catalog-count]');
      var empty = root.querySelector('[data-catalog-empty]');
      var rows = Array.prototype.slice.call(root.querySelectorAll('.catalog-row'));
      var chips = Array.prototype.slice.call(root.querySelectorAll('.chip'));
      if (!rows.length) return;
      controls.hidden = false;
      var active = [];
      function apply() {
        var q = (search.value || '').trim().toLowerCase();
        var shown = 0;
        rows.forEach(function (row) {
          var tags = row.getAttribute('data-tags').split(' ');
          var okTags = active.every(function (t) { return tags.indexOf(t) !== -1; });
          var okText = !q || row.getAttribute('data-search').indexOf(q) !== -1;
          var show = okTags && okText;
          row.hidden = !show;
          if (show) shown++;
        });
        count.textContent = shown === rows.length
          ? rows.length + ' songs'
          : shown + ' of ' + rows.length + ' songs';
        empty.hidden = shown !== 0;
      }
      chips.forEach(function (chip) {
        chip.addEventListener('click', function () {
          var tag = chip.getAttribute('data-filter');
          var i = active.indexOf(tag);
          if (i === -1) { active.push(tag); } else { active.splice(i, 1); }
          chip.setAttribute('aria-pressed', i === -1 ? 'true' : 'false');
          apply();
        });
      });
      search.addEventListener('input', apply);
      apply();
    })();
  </script>
"""


def main():
    if not os.path.exists(SOURCE):
        sys.exit(f'REPERTOIRE.md not found at {SOURCE}. It lives in the planning '
                 'workspace one level above this repo.')
    songs = parse(SOURCE)
    if not songs:
        sys.exit('Parsed 0 songs — the Markdown shape changed. Fix the parser, '
                 'do not hand-edit the output.')

    dest_dir = os.path.join(ROOT, '_src', 'pages', 'repertoire', 'sections')
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, '03-catalog.html')
    with open(dest, 'w', encoding='utf-8') as f:
        f.write(emit(songs))

    data_dir = os.path.join(ROOT, '_src', 'data')
    with open(os.path.join(data_dir, 'repertoire.json'), 'w', encoding='utf-8') as f:
        json.dump(songs, f, indent=2, ensure_ascii=False)

    untagged = [s['title'] for s in songs if not s['energy']]
    print(f'parsed {len(songs)} songs -> {os.path.relpath(dest, ROOT)}')
    print(f'  sections: {len(set(s["section"] for s in songs))}, '
          f'chips: {len(chips(songs))}')
    if untagged:
        print(f'  NOTE {len(untagged)} without an energy tag: {", ".join(untagged[:5])}')


if __name__ == '__main__':
    main()
