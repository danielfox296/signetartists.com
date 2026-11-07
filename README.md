# signetartists.com

Static site for Signet Artists — live music for private events, Denver and the
Colorado mountain corridor. Signet Artists is a trade name of Entuned, LLC.

## This repository is public

GitHub Pages serves the site from here, so anyone can read every file and
commit. Keep business reasoning, notes and process out of it: no `notes`,
`_notes` or `_…note` fields in content files, and no strategy in code
comments, READMEs or commit messages. `scripts/no_notes.py` runs before every
build and stops it if a content file carries notes.

## Build

```bash
npm ci --prefix site
node site/scripts/build.mjs --out _site
```

The site is built from `content/` by `site/` (see `site/README.md`). Edit it in
the admin at admin.signetartists.com, or write `content/` on the `staging`
branch; Go live merges `staging` into `main`.

## Deploy

`main` deploys. GitHub Actions builds `content/` with `site/`, publishes to
GitHub Pages, and pings IndexNow with the URLs whose sitemap entry changed.
`staging` builds the same way to staging.signetartists.com.

## Prices

The site publishes no prices. The only figures allowed come from
`content/records/market-rates.json`, each with its source and the date it was
read, rendered through `{{market:<id>}}`; a page that uses one must carry
`{{market_sources}}`. `scripts/copy_check.py` checks the built pages.

## Analytics

- GA4 `G-LL5DKVEX29` on every page; `analytics.js` adds the site events and
  does nothing if gtag is blocked.
- Search Console: domain property, verified by DNS.
- Bing: verified via `BingSiteAuth.xml`; every deploy pings IndexNow.
