# site/

The new build for signetartists.com: React components render `content/` into the
same files `build.py` writes. The Puck editor (Phase 2) uses the same components.

Run everything from the repo root.

| | |
|---|---|
| Install | `npm ci --prefix site` and `pip3 install -r site/scripts/requirements.txt` |
| Build | `node site/scripts/build.mjs --out _site`; with `--images <cache folder>` it also makes the pictures' copies, as the deploys do |
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
- `src/lib/pictures.js` pictures in the built site: a local JPEG or PNG keeps its `<img>`, which gains a `srcset` of
  WebP copies in 480, 800, 1200 and 1600 wide (up to its own width) and each component's `sizes`. No wrapper
  element: the page's element tree is what it was. The editor draws the plain `<img>`. `src/build/images.js` makes the
  copies at deploy time (`--images`), recompresses every JPEG under `img/` and `media/`, and fetches each YouTube
  video's picture to `img/yt/<id>.jpg`; none of it is committed, and the workflows keep it in the Actions cache
- YouTube videos are click-to-play (`YouTube` in `components/parts.jsx`): the video's poster or its YouTube picture
  and a play button, swapped for the player on a click or Enter. The watch pages under `/video/` keep the player.
- The build minifies `styles.css` and gives it a `?v=` of its own; the first picture of a page's first section loads
  first and never lazily
- `admin/` the admin app at admin.signetartists.com (Phase 2)
  - `config.js` the repo, branches and the Go live switch (`GO_LIVE`: Go live works once `main` is built from `content/`)
  - `lib/github.js` the REST calls; `lib/repo.js` the working copy of `staging` (one commit per save, merge per file);
    `lib/publish.js` Go live, the saves and go-lives lists, and revert; `lib/diff.js` readable diffs; `lib/merge3.js` line merge for revert
  - `ui/Editor.jsx` pages, shared parts and the act page layout in Puck; `ui/fields.jsx` the picture, URL, Indexed, act
    and filter-choice fields and the config the admin edits with; `ui/Pages.jsx` the pages list; `ui/GoLive.jsx` the Go
    live drawer
  - `ui/Acts.jsx` the roster and the filter choices; `ui/Act.jsx` one act's form; `ui/Preview.jsx` the site drawn in a
    frame at desktop or phone width; `lib/acts.js` every change to acts, the roster, crop points and act pages
  - `ui/Posts.jsx` the posts list, new post and delete; `ui/PostEditor.jsx` a post in Puck with its settings;
    `ui/Videos.jsx` the videos list and form; `lib/posts.js` what a post's or video's new URL or delete also changes
    (the posts that list it, a redirect); `lib/postrich.jsx` a post's copy (paragraphs and lists), and the paragraphs
    an edit didn't touch keeping their stored text
  - `ui/Layouts.jsx` the act card, post, post card and video page layouts (parts on or off, their order, image ratios)
    with a preview; the act page layout stays in `Editor.jsx`, where a section can be switched off; `ui/Styles.jsx` the
    site styles with contrast; `ui/Media.jsx` and `lib/media.js` the pictures under img/, their uses, replace everywhere
- `src/lib/layouts.js` the layouts' parts and defaults; `src/build/styles.js` the site styles written into the stylesheet
  (unchanged, byte for byte, while they match it)
- `scripts/` the converter (`convert.py`, `sections.py`), the proof (`proof.py`, `domdiff.py`)
- `proof/` the last proof report, the converter report, and `accepted.json`

## content/

| | |
|---|---|
| `pages/<name>.json` | one page in Puck's format: `{root: {props}, content: [sections]}`; a section holds `blocks` |
| `posts/<slug>.json` | one post, Puck's format, the 15 post block types |
| `acts/<id>.json`, `videos/<slug>.json` | one act, one clip. `"hidden": true` takes an act off every list, card and filter |
| `roster.json` | act order and the filter vocabularies |
| `layouts/act-page.json` | the act page layout. A page with `"layout": "act"` and `schema.act` is drawn as these sections, with its own where `ActOwn` sits |
| `shared/` | header, footer, logo strip |
| `layouts/` | the act page layout (Puck's format), and the act card, post, post card and video page layouts |
| `styles.json` | the site styles: colours, type sizes, corners |
| `site.json` | brand, business, lists shared by pages, llms.txt wording |
| `redirects.json`, `robots.txt`, `photo-focus.json`, `repertoire.json` | as named |
| `lastmod.json` | each URL's sitemap date when converted, and the hash of its file |
| `records/` | market rates, media sources and reviews: provenance, not rendered |
