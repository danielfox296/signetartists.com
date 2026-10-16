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
| Admin, development | `GH_DEV_TOKEN=$(gh auth token) VITE_API_BASE=/gh VITE_STAGING_BRANCH=<a throwaway branch> VITE_LIVE_BRANCH=<another> VITE_CUTOVER_TAG=<a tag on it> npm --prefix site run admin`, then http://127.0.0.1:5794/ and sign in with any text |
| Admin, build | `npm --prefix site run build:admin` (into `site/admin/dist`); `.github/workflows/admin.yml` builds and deploys it from `staging` |
| Deploy | `.github/workflows/deploy.yml` builds `main` to signetartists.com; `staging.yml` builds `staging` to staging.signetartists.com |

## Layout

- `src/components/` the components and their Puck fields
  - `sections.jsx` section types, `blocks.jsx` the blocks a section holds
  - `generated.jsx` lists built from data (video index, blog list, all pages)
  - `post.jsx` blog posts, `layout.jsx` header, footer, breadcrumb, sibling lists
  - `config.jsx` the Puck configs, `registry.jsx` how the build renders stored items
- `src/lib/model.js` everything derived from `content/`: act facts, trails, sibling and hub lists, posts by parent
- `src/build/` the build: `main.jsx`, `head.js`, `schema.js` (JSON-LD), `feeds.js`
- `admin/` the admin app at admin.signetartists.com (Phase 2)
  - `config.js` the repo, branches and the Go live switch (`GO_LIVE`: Go live works once `main` is built from `content/`)
  - `lib/github.js` the REST calls; `lib/repo.js` the working copy of `staging` (one commit per save, merge per file);
    `lib/publish.js` Go live, the saves and go-lives lists, and revert; `lib/diff.js` readable diffs; `lib/merge3.js` line merge for revert
  - `ui/Editor.jsx` pages and shared parts in Puck; `ui/fields.jsx` the picture, URL and Indexed fields and the config the
    admin edits with; `ui/Pages.jsx` the pages list; `ui/GoLive.jsx` the Go live drawer
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
