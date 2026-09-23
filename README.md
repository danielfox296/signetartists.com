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
_src/data/site.json          every brand value, the FAQs, what is itemised
_src/data/market-rates.json  sourced market figures + provenance (the ONLY
                             dollar figures or percentages the site may print)
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

`_src/pages/jam/` is the Signet Jam pitch page (2026-09-16), a private
share: Daniel sends `/jam/?venue=Name` after a first conversation with a
venue owner. It is a normal page of the build, so it gets the site header,
footer, styles and analytics, but it is linked from no nav or footer and its
`robots: noindex` keeps it out of the sitemap, llms.txt and search. Page-scoped
CSS and the GSAP motion live in its own sections (`00-style.html`,
`08-script.html`); `?motion=off` renders the plain stack. The handoff it was
built from is `HANDOFF.md` in that dir.

## Blog

The shared blog kit (ported from the foxlessons.com generation, restyled to
this site's tokens). A post is `_src/pages/blog-<slug>/content.yaml`;
`_src/pages/blog-sample-post/` is the always-valid authoring reference and
documents every block type and frontmatter field. `_src/pages/blog-venue-post-template/` is the second
draft-only reference: the "[ensemble] at [venue]" real-event post, with its
permission gates and the same-week link asks it triggers in its header comment;
clip titles for those posts come from `../FOOTAGE-TITLES.md`.

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
  whose `{{blog_cards}}` token fills with published posts, newest first.
  It is linked from the footer.

## Adding an act

The roster is `_src/data/acts.json`; the cards, filters, contact picker,
llms.txt and Service schema render from it. The publishing routine (scrape
the act's site, data entry with tags, media with provenance, the page, the
wiring, the gates, the deploy, the profiles) is the `signet-new-act` skill.
Its tooling lives here:

- `scripts/act_lint.py [id]` — the roster gate: fields, tag vocabularies,
  media provenance, the page dir, the schema merge, the roster link, the
  copy bans. Run it with the other gates.
- `scripts/nav_lint.py` — the navigation gate, run on the **built** html and
  wired into the deploy workflow, so it blocks a release rather than being
  remembered. Three checks across the header row, the mobile menu, every
  footer column and the 404 list: the same destination twice in one list, two
  rows in one list answering the same question, and one destination wearing
  different labels across those surfaces. The second check reads a curated
  `TOPICS` table, because the pair that prompted it — "Pricing" and "What live
  music costs" — shares no words with itself and no string comparison would
  ever have found it. Add a group when two pages start answering one question.
- `scripts/act_media.py photo|poster|embed` — fetch and crop a photograph,
  save a hero poster, check that a YouTube clip is embeddable; each writes
  its row into `media-sources.json`.
- `scripts/new_act_page.py <id>` — scaffold `_src/pages/<artists|ensembles>-<slug>/`
  from the act's entry, set `page`, add the footer link.

Tags (2026-09-16): `bucket_tags` (kind of night), `config_tags` (size),
`genre_tags`, `vocals` and optional `area_tags`, each against a vocabulary at
the top of `acts.json`. A filter select renders only for a facet the roster
varies on. `areas[]` is also the business's service area.

Two lanes (2026-09-23): `/music/` renders the configurations first (compact
cards, smallest first) and the named acts second (full cards), both from
`acts.json`. `lane` (`named` | `format`) follows `presentation` unless set by
hand; `occasion_tags` (against `occasions[]`) drive the Occasion filter and
the `?occasion=` deep link; `entity` emits a Person or MusicGroup node with
`sameAs` for a named act; an act without a `page` is addressed as
`/music/#act-<id>` everywhere. The three party formats' tiles are drawn by
`scripts/format_art.py`. `scripts/copy_gate.py music` gates the roster copy.

## Section tokens

A section can drop in any of these and the build fills them from `site.json`:

`{{market_table}}` `{{market_sources}}` `{{included_list}}`
`{{included_list_columns}}` `{{extras_list}}` `{{faq_list}}` `{{acts_grid}}`
`{{acts_sections}}` `{{event_types}}` `{{blog_cards}}`

Parameterized: `{{market:<id>}}` `{{act_ladder:<act>}}` `{{act_setlist:<act>}}`
`{{offer_close:Headline.}}`. An unknown id fails the build.

Brand tokens work anywhere: `{{brand_name}}` `{{brand_tagline}}` `{{brand_intro}}`
`{{brand_email}}` `{{brand_service_area}}` `{{brand_legal_name}}`
`{{form_action}}` `{{site_url}}`.

Values in `[square brackets]` in `site.json` render with a dotted underline in the
browser, so an unresolved decision is visible while browsing rather than shipping
silently. `build.py` also prints them at the end of every build.

## Deploy

Push to `main`. GitHub Actions lints the blog, builds, publishes to GitHub
Pages, and pings IndexNow with the URLs whose sitemap entry changed.

## No published prices (2026-09-04)

Signet publishes no price of any kind on this site: no card, floor, "from",
range, hourly, call-out figure, uplift percentage, travel figure or discount
rule. What the site publishes is *market* information.

- **The only dollar figures and percentages allowed anywhere** come from
  `_src/data/market-rates.json`, each with the URL it was read from and the
  date it was read, rendered through `{{market:<id>}}`. Never type a figure
  into a section, a FAQ answer, a description or a blog cell.
- A page that resolves a `market:` token **must** carry `{{market_sources}}`
  or the build stops. That token prints the Sources note listing exactly the
  sources that page used.
- `{{market_table}}` renders the market ranges as one table. It carries
  `.rate-table`, so `analytics.js`'s `pricing_engaged` observer still fires
  when a reader reaches the money block; the event means what it always meant.
- Structured data emits **no** `Offer` and no `makesOffer`. `Service` nodes
  stay. Only `market:` resolves inside `schema.json` strings.
- Retired with the card: `rate_range`, `rate_range_resort`, `rate_hour`,
  `rate_4h`, `rate_1h`, `act_from`, `rate_card_table`, `rate_table_summary`,
  `rate_table_full`, the quote engine (`quote.js`, `_src/partials/quote-engine.html`,
  the pricing page's `02b-quote` section, the `quote engine` block in
  `styles.css`, the `quote_configured` event), the roster's price filter, and
  `llms.txt`'s rate-card and hourly-build sections.
- `scripts/copy_gate.py` audits **every built page plus llms.txt**, not a
  directory list: every figure against `market-rates.json`, plus a phrase ban
  ("rate card", "published rates", "from $", "starting at", "10% off" and the
  rest). Zero hits required.
- Signet's internal numbers live in `../OFFER.md` and nowhere in this repo.

## Analytics & search wiring

Verified end to end 2026-08-09 — tag markup on every built page, the served
Google config for the ID, DNS, live redirect chains, deploy history:

- **GA4**: `G-LL5DKVEX29`, set as `GA_MEASUREMENT_ID` in `build.py` and
  emitted into every page head; live since the first deploy on 2026-08-01.
  `analytics.js` layers the four site events on top and no-ops if gtag is
  blocked.
- **Search Console**: domain property, verified via a DNS TXT record at the
  registrar; Google has collected Search impressions since 2026-08-06. Its
  "Page with redirect" notices are the benign http→https, www→apex and
  no-trailing-slash consolidations — all 301 to the canonical URL.
- **Bing**: verified via `BingSiteAuth.xml` at the site root; every deploy
  pings IndexNow with the URLs whose sitemap entry changed.

Console side, completed 2026-08-12 from a browser session on Daniel's
machine:

- Search Console is linked to the GA4 property (GA Admin → Product links →
  Search Console links), same as the other sites.
- `sitemap.xml` shows Success in both Search Console and Bing Webmaster
  Tools, 17 URLs each.
- Live smoke test passed: with ad blocking off, Realtime received
  page_view and pricing_engaged on the stream. The 2026-08 "no data"
  scare was client-side ad blocking, not the tag.

Ad blockers eat gtag.js, so everyday browsing from this desk mostly never
reaches GA — test in a private window with blocking off before concluding
anything is broken. The 404 page serves the same tag as every other page
(verified against a live bad-URL fetch), so a mistyped address should
record a page_view carrying that URL as page_location.

## Still open

- The music page's "The players" section is an unresolved decision — names are
  deliberately not published
- Blog publishing cadence floor: one per month (the first posts shipped
  2026-08-05)
