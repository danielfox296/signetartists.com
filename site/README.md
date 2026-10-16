# site/

The new build for signetartists.com: React components render `content/` into the
same files `build.py` writes. The Puck editor (Phase 2) uses the same components.

Run everything from the repo root.

| | |
|---|---|
| Install | `npm ci --prefix site` and `pip3 install -r site/scripts/requirements.txt` |
| Build | `node site/scripts/build.mjs --out _site` |
| Convert `_src/` into `content/` | `python3 site/scripts/convert.py` |
| Whole-site proof | `python3 site/scripts/proof.py` (report in `site/proof/report.md`) |
| Editor, development only | `npm --prefix site run dev`, then http://127.0.0.1:5793/?page=weddings |

## Layout

- `src/components/` the components and their Puck fields
  - `sections.jsx` section types, `blocks.jsx` the blocks a section holds
  - `generated.jsx` lists built from data (video index, blog list, all pages)
  - `post.jsx` blog posts, `layout.jsx` header, footer, breadcrumb, sibling lists
  - `config.jsx` the Puck configs, `registry.jsx` how the build renders stored items
- `src/lib/model.js` everything derived from `content/`: act facts, trails, sibling and hub lists, posts by parent
- `src/build/` the build: `main.jsx`, `head.js`, `schema.js` (JSON-LD), `feeds.js`
- `scripts/` the converter (`convert.py`, `sections.py`), the proof (`proof.py`, `domdiff.py`)
- `proof/` the last proof report, the converter report, and `accepted.json`

## content/

| | |
|---|---|
| `pages/<name>.json` | one page in Puck's format: `{root: {props}, content: [sections]}`; a section holds `blocks` |
| `posts/<slug>.json` | one post, Puck's format, the 15 post block types |
| `acts/<id>.json`, `videos/<slug>.json` | one act, one clip |
| `roster.json` | act order and the filter vocabularies |
| `shared/` | header, footer, logo strip |
| `site.json` | brand, business, lists shared by pages, llms.txt wording |
| `redirects.json`, `robots.txt`, `photo-focus.json`, `repertoire.json` | as named |
| `lastmod.json` | each URL's sitemap date when converted, and the hash of its file |
| `records/` | market rates, media sources and reviews: provenance, not rendered |
