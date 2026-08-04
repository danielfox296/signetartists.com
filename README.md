# signetartists.com

Static site for Signet Artists — live music for private events, Denver and the
Colorado mountain corridor. Signet Artists is a trade name of Entuned, LLC.

Same idiom as daniel-fox.com, danielchristopherfox.com and foxlessons.com.

## Build

```bash
python3 build.py
```

Pure Python stdlib for the pages. The blog kit needs `jinja2`, `markdown`
and `pyyaml` (imported lazily — with no `blog-*` post directories the build
runs stdlib-only; the deploy workflow pip-installs them).

**Edit `_src/`. Never edit root `*.html` by hand** — the build overwrites it.

## Layout

```
_src/data/site.json          every brand value, the rate card, FAQs
_src/layouts/base.html       page shell
_src/partials/               header, footer
_src/pages/<slug>/
    config.json              title, meta description, output path, nav key, schema
    sections/NN-*.html       concatenated in sorted order
_src/pages/blog-<slug>/
    content.yaml             one blog post: frontmatter + typed section blocks
_src/templates/              blog post template + one partial per block type
_src/lib/                    blog renderer, reading time, SVG charts
build.py                     generator
styles.css                   hand-written, ported from the Tailwind build
CNAME                        signetartists.com
```

Generated on every build: `sitemap.xml`, `llms.txt`, `rss.xml`, and the HTML
at the root.

## Blog

The shared blog kit (ported from the foxlessons.com generation, restyled to
this site's tokens). A post is `_src/pages/blog-<slug>/content.yaml`;
`_src/pages/blog-sample-post/` is the always-valid authoring reference and
documents every block type and frontmatter field.

```bash
python3 build.py --lint    # validate every post, drafts included
```

- `draft: true` keeps a post off every publish surface (HTML, index, RSS,
  sitemap, llms.txt) while lint still validates it. Drafts must stay
  lint-clean: the deploy workflow runs `--lint` before building.
- The build derives everything else: `/blog/<slug>/` URL, index row, reading
  time, RSS item, sitemap `<lastmod>` (from `last_updated` or `date`), the
  llms.txt Blog section, and Article JSON-LD whose publisher is the site's
  MusicGroup entity.
- The blog index (`/blog/`) is a regular page (`_src/pages/blog-index/`)
  whose `{{blog_cards}}` token fills with published posts, newest first. It
  is deliberately not in the site nav yet — link it when the first real
  post ships.

## Section tokens

A section can drop in any of these and the build fills them from `site.json`:

`{{rate_table_summary}}` `{{rate_table_full}}` `{{included_list}}`
`{{included_list_columns}}` `{{extras_list}}` `{{faq_list}}` `{{acts_grid}}`
`{{acts_sections}}` `{{event_types}}` `{{blog_cards}}`

Brand tokens work anywhere: `{{brand_name}}` `{{brand_tagline}}` `{{brand_intro}}`
`{{brand_email}}` `{{brand_service_area}}` `{{brand_legal_name}}`
`{{form_action}}` `{{site_url}}`.

Values in `[square brackets]` in `site.json` render with a dotted underline in the
browser, so an unresolved decision is visible while browsing rather than shipping
silently. `build.py` also prints them at the end of every build.

## Deploy

Push to `main`. GitHub Actions lints the blog, builds, publishes to GitHub
Pages, and pings IndexNow with the URLs whose sitemap entry changed.

## Still open

- The contact form posts to formsubmit.co and needs its endpoint activated
- The music page's "The players" section is an unresolved decision — names are
  deliberately not published
- Blog index copy is placeholder pending the voice/ICP content pass; no real
  posts exist yet (publishing cadence floor: one per month once live)
