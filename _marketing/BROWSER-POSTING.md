# Posting to the LinkedIn Page through a logged-in browser

The route we are actually using for LinkedIn, instead of waiting weeks on the
Community Management API. Runs on Daniel's machine, drives a real browser he is
already logged into, and reads the same queue and passes the same copy gate as
everything else.

---

## Read this part first

This is against LinkedIn's User Agreement, which prohibits accessing the service
by automated means. Nobody is going to be confused about whether that is true,
so the useful question is what it actually risks and how the design answers it.

**What is at risk:** Daniel's own LinkedIn account. Not just the Signet Page,
the personal profile too, since the Page is administered through it. The
strategy puts most of this plan's reach on that profile, so an account
restriction would cost more than the December bookings it is meant to win.

**What makes an account get flagged**, roughly in order of how likely each is:

1. **Logging in from a datacenter IP.** A new device on an AWS or GitHub
   Actions address is the loudest possible signal. This is why the script never
   runs in CI and why `social.yml` is not wired to it.
2. **Volume and rhythm.** Twenty actions an hour at perfectly even intervals is
   a machine. Two or three posts a week from the laptop that normally browses
   LinkedIn is a person.
3. **Headless and automated-browser fingerprints.** The script runs headed by
   default. It does **not** try to spoof the automation signal, and that is
   deliberate. Actively defeating bot detection is the point where this stops
   being "my own account, posting my own content" and becomes something else.
   If LinkedIn ever blocks this outright, the answer is the API or a scheduling
   tool, not a better disguise.

**What the design does about it:** local only, headed by default, stops before
publishing, confirms per post, paces between actions, waits 20 to 45 seconds
between posts, and never batches a fortnight into one run.

**Keep a fallback.** Buffer, Later and Publer hold real LinkedIn partnerships
and would take the same `content-queue.yaml` unchanged. If the Page application
comes through, or if this ever gets blocked, nothing about the strategy or the
queue changes. Only the last mile does.

---

## Setup, once

```bash
pip install playwright
python3 -m playwright install chromium

python3 scripts/social_browser.py --login
```

A browser window opens. Log in to LinkedIn as you normally would, including any
two-factor step, then come back to the terminal and press Enter.

**Nothing in this script reads, types or stores your password.** The session
lives in a browser profile directory on disk, exactly as your everyday browser
keeps one. That directory is `.browser-profile/` and it is gitignored, because
it is a live credential: anyone who copies it is logged in as you.

You should only need to do this again if LinkedIn signs you out.

### If Playwright complains the executable does not exist

A pip-installed Playwright expects the exact browser build it shipped with, and
will refuse a different one that is already on disk. Either run
`python3 -m playwright install chromium` to fetch the matching build, or point
the script at the one you have:

```bash
export CHROMIUM_PATH=/path/to/chrome
```

The script reads `CHROMIUM_PATH` and passes it through as the executable path.

---

## Posting

Write the body for a slot in `_marketing/content-queue.yaml`, set
`status: ready`, then:

```bash
# Fill the real composer and STOP, so you can read it in the window
python3 scripts/social_browser.py --due

# Same, then ask before each one and publish on a yes
python3 scripts/social_browser.py --due --live

# One specific post, whatever its status
python3 scripts/social_browser.py --post 2026-09-22-linkedin-booking-window --live
```

**The default run does not publish.** It opens the composer, types the post,
takes a screenshot, and waits. That is the dry run, and it is a better one than
any API dry run, because what you are looking at is the actual LinkedIn
composer with the actual post in it.

`--live` publishes, and still asks per post unless you add `--yes`.

### The author check

Posting to your personal feed when you meant the Page is the expensive mistake
here, and it happens silently. So before typing a single character the script
reads the open composer and checks it says Signet Artists. If it does not, it
refuses the post and saves a screenshot rather than guessing.

### Screenshots

Every composed post, every published post and every failure writes a PNG to
`.browser-shots/`. That is your proof of what went out and your first stop when
something breaks. Also gitignored.

---

## What is automated and what is not

Unchanged from the strategy, and worth restating because this route makes it
easy to blur:

**Automated:** opening the composer, typing the approved body, attaching the
chosen media, the copy gate, the ledger, the screenshots.

**Not automated:** every word of every post, replies, comments, DMs, connection
requests, and the decision to publish. The script will not publish without
either your keypress or an explicit `--yes`.

---

## Scheduling it

The hourly GitHub Action cannot do this, by design. If you want it to run
without you, schedule it locally on the machine that is already logged in.

macOS, roughly: a `launchd` agent running
`python3 scripts/social_browser.py --due --live --yes` on weekday mornings.

Before you do that, consider not doing it. `--yes` removes the last human check
before something goes out under the company's name, and the whole cadence is
three posts a week. Opening a terminal on Tuesday morning and typing one command
costs about ninety seconds and keeps a person in the loop at the exact moment it
matters. Run it by hand until the routine is boring, then automate it if you
still want to.

---

## When it breaks

It will, because LinkedIn reskins constantly. The script uses accessible roles
and names rather than CSS classes, which survives most redesigns, but not all.

- **"could not find the 'Start a post' button"** — either the markup moved or
  this account no longer administers the Page. Check the screenshot.
- **"the composer does not look like it is posting as Signet Artists"** — the
  author guard did its job. Open LinkedIn by hand and check which identity the
  composer defaults to.
- **Not logged in** — run `--login` again.

None of these are emergencies. Post by hand that day and fix the selector after.
