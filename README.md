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

## Social (`_marketing/`, 2026-09-15)

Brand and social strategy for LinkedIn and Instagram, plus the rail that
publishes it. **Internal. Not part of the site**: `_marketing/` is excluded from
the deploy's rsync and `deploy.yml` ignores pushes that only touch it, so the
ledger commit the social workflow makes never rebuilds the site or pings
IndexNow.

```
_marketing/BRAND-SOCIAL-STRATEGY.md  positioning, pillars, campaigns, cadence
_marketing/ICP.md                    who we sell to, and their buying calendar
_marketing/content-queue.yaml        every post: slot, brief, body, asset, link
_marketing/LINKEDIN-SETUP.md         the one-time LinkedIn credential runbook
_marketing/published.json            what actually went out (written by CI)
scripts/social_queue.py              validate the queue; list what is due
scripts/social_publish.py            post it (dry run unless --live + secrets)
scripts/linkedin_auth.py             OAuth helper; --doctor says what a token can do
.github/workflows/social.yml         hourly publish; copy gate on every PR
```

**LinkedIn publishes through a logged-in browser, not the API** (decided
2026-09-15). The Community Management API is partner-gated behind a review of
the app and the company, which is weeks, and the holiday season is being decided
now. `scripts/social_browser.py` drives a real browser on Daniel's machine:
same queue, same copy gate, same ledger, different last mile.

It runs **locally only, never in CI** — a LinkedIn login from a GitHub runner is
a datacenter IP on an unrecognised device, which is the fastest way to get an
account challenged. `social.yml` therefore holds no LinkedIn credential and
`social_publish.py` stands LinkedIn down unless `LINKEDIN_ENABLE_API=1`. It runs
headed, stops before publishing, confirms per post, and makes no attempt to
defeat bot detection. This is against LinkedIn's User Agreement; the reasoning
and the mitigations are in `_marketing/BROWSER-POSTING.md`.

The API route is kept for the day the Page is approved.
`_marketing/LINKEDIN-SETUP.md` is that runbook, and it is still the reference
for the two LinkedIn products: the personal profile (`w_member_social`,
self-serve, no review) and the company page (Community Management API,
partner-gated).

`LinkedIn-Version` is a `YYYYMM` header supported for about a year. The default
is `202608`; override it with the `LINKEDIN_API_VERSION` secret when it sunsets.
An access token lasts 60 days and a consumer-tier app gets no refresh token, so
the workflow prints the days remaining on every run and warns inside a week.

**The substance of every post is written by a person.** Nothing generates a
body. The automation owns the calendar and the keys only; see the strategy's
section 7 for the full line, which includes never automating replies, DMs,
connection requests or engagement.

The queue runs under the same law as the site, enforced mechanically by
`social_queue.py`:

- **No figure at all.** Not just no Signet price: social carries no dollar
  figure and no percentage, because the site's one exemption (a sourced market
  figure printed beside its source) cannot survive in a caption.
- **No availability claims.** `dates left`, `spots left`, `book fast` and their
  family are refused. Urgency comes from calendar fact, which is true and
  already published.
- The `copy_gate.py` bans carry over: em dashes, the word AI, chair, room
  outside ballroom and green room, business filler.
- Instagram media must be a file this site serves, since the Graph API fetches
  a URL rather than taking an upload. A YouTube link is refused at `ready`.

```bash
python3 scripts/social_queue.py --lint     # validate everything
python3 scripts/social_queue.py --due      # JSON of posts due now
python3 scripts/social_publish.py          # dry run, prints the payloads
```

Only `status: ready` publishes; `brief` and `draft` are the normal state of most
of the file. `_marketing/published.json` makes the job idempotent, so the hourly
schedule never double-posts.

Credentials are GitHub Actions secrets, never in the repo:
`LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_ACCESS_TOKEN`,
`LINKEDIN_REFRESH_TOKEN` (when issued), `LINKEDIN_PERSON_URN`,
`LINKEDIN_ORG_URN`, `IG_ACCESS_TOKEN`, `IG_USER_ID`. A missing secret degrades
to dry run rather than failing the workflow.

Instagram Stories are the only surface that stays manual. They are queued as
`channel: manual` and skipped by the publisher.

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
