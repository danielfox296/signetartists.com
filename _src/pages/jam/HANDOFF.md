# Signet Jam — pitch page handoff

Build target: one self-contained `index.html` (inline CSS + JS) at `signetartists.com/jam`. Structured so it ports into the Bowie SSG later. External loads limited to Google Fonts and GSAP from cdnjs.

Audience: a Denver brewery or distillery owner who received this link from Daniel after a first conversation. The page's job is to make them want the second conversation. It leads with the night and closes with the ask. No pricing, no projections, no FAQ.

---

## 1. Page skeleton

```
<header>  (fixed, minimal: Signet mark left, "Let's talk" link right)
01  Hero
02  The night          (pinned, line-by-line reveal)
03  Who's in the building   (pinned, horizontal track)
04  What it turns into (pinned, three crossfading states)
05  Who's running it   (static)
06  How it works       (two-column ledger, staggered reveal)
07  Close              (static)
<footer>  (Signet, Denver, contact)
```

Each section is a full-viewport `<section>` with a drafting keyline at its top edge and a mono index label (`01 / The night`). Section indices are part of the design, not navigation.

---

## 2. Copy

All copy is final unless marked `{placeholder}`. Do not add headings, subheads, or connective sentences beyond what's here. Line breaks inside section 02 and 04 are intentional and drive the animation.

### 01 Hero

Display line:
```
Signet Jam
```
Venue line (populated from URL param, see §6):
```
at {venue}
```
Fallback when no param:
```
at one venue in Denver
```
Scroll cue: a single thin vertical keyline, 48px, with a slow 2s pulse. No text.

### 02 The night

Each line is its own `<p>`. Reveal in order.

```
It's a quarter to eight on a Sunday and the door's been open since seven.

Six people at the bar. Two of them came for this. The other four are figuring that out.

The sign-up sheet is on the end of the bar, half full, mostly names the bartender already knows.

A drummer is adjusting a hi-hat that was fine. A trumpet player nobody's met is standing by the wall with the case still shut.

The house band counts off the first tune and the case opens.

By the third song the guy who came in for a flight has moved to a stool with a sightline.

Somebody's filming. Somebody always is.

The tune goes somewhere it wasn't supposed to and the bartender looks up.

Same time next week.
```

### 03 Who's in the building

Section label (mono, small): `03 / Who's in the building`

Eight cards on a horizontal track. Each card: a role label (mono), an image slot, two or three sentences (Fraunces). Order is fixed.

**The hosts**
Run the sign-up sheet and the count-offs. Know who should sit in on what, and when to let a tune run.

**The bartender**
By week two she has the band's drinks memorized and a regular who tips like it's Friday.

**The regulars**
Two of them haven't missed one. They pick the seat with the sightline and tell people it's theirs.

**The player who drove in**
Drives in from Aurora with an upright in the back seat. Plays two tunes, stays for the rest.

**The walk-in**
Came in for a flight at 7:30. Left at 10:40 with a name to look up.

**The feature**
Once a month somebody with a name in town gets the second set. Their people come. Their people come back.

**The one with the phone**
Films thirty seconds of the tune that went somewhere. Tags the venue. That's the ad.

**The owner**
Came down to check on the night. Stayed. Started coming down every week.

### 04 What it turns into

Three states, stacked and crossfaded. Each has a mono eyebrow and a short block of prose.

**Eyebrow:** `Month one`
```
A sign-up sheet, a house band, and a night that exists now. People find out the way people find out, which is someone they trust telling them.
```

**Eyebrow:** `Six months in`
```
The sheet fills before the band starts. Players in town know the night by name. The wall by the stage has photos on it that weren't there in the spring. Someone wrote about it.
```

**Eyebrow:** `A year in`
```
Sunday is the night. Bands that came up through the jam are playing the venue's private parties. Out-of-town players ask about it before they land. People plan the weekend around getting there.
```

No closing line after the third state. It ends on "getting there."

### 05 Who's running it

Section label: `05 / Who's running it`

One photo slot (the hosts, on stage or at the bar, not posed). Prose:

```
Signet Jam is run by Daniel Fox and {cohost name}. Daniel plays bass for a living, upright and electric, in bands around Denver, and before that built a company to 180 people and sold it. {Cohost: one sentence, what they play and what they've done.} The house band is working players who play out every week. Signet is the outfit behind it.
```

Small Signet mark below the prose.

### 06 How it works

Section label: `06 / How it works`

Lead line (Fraunces, larger):
```
Every week, same night, one venue. You pick Sunday or Monday.
```

Two columns. Each line is a `<p>` and reveals on its own.

**Left column header (mono):** `The venue brings`
```
The space and a corner for the band.
The staff for the night.
A closet for the backline.
Promo behind the night, from your accounts.
A drink for the band.
```

**Right column header (mono):** `Signet brings`
```
The house band.
The hosts.
The sign-up sheet and the shape of the night.
A featured act every month.
Clips every week, cut and ready to post.
The players, who are the first hundred people who show up.
```

Closing line below both columns (Fraunces):
```
Twelve weeks to start. Then we both decide.
```

### 07 Close

Display line:
```
One venue. Sunday or Monday.
```
Primary button: `Let's talk` → `{calendar link}`
Secondary text link: `{email}`

Optional: a season word can be inserted ("One venue this fall.") if Daniel confirms the timing. Do not add one by default.

### Footer
```
Signet · Denver · {email}
```

---

## 3. Design tokens

Adapted from the daniel-fox.com editorial-industrial set (bone paper, iron-oxide accent, drafting keylines, Fraunces) and inverted for a night page. Keep the same DNA, flip the ground to dark.

```css
:root {
  --ink:        #0E0D0B;   /* page ground, warm near-black */
  --ink-2:      #171512;   /* card surfaces, header on scroll */
  --bone:       #EDE6D8;   /* primary type */
  --bone-60:    rgba(237,230,216,0.60);
  --bone-30:    rgba(237,230,216,0.30);
  --keyline:    rgba(237,230,216,0.16);
  --oxide:      #B5472B;   /* accent: eyebrows, active state, button */
  --oxide-hi:   #D9673F;   /* hover */
  --lamp:       rgba(217,164,65,0.18); /* stage-light glow, radial only */

  --font-display: 'Fraunces', Georgia, serif;
  --font-mono:    'IBM Plex Mono', ui-monospace, Menlo, monospace;

  --measure: 34ch;         /* prose max width in 02 and 04 */
  --gutter: clamp(20px, 4vw, 64px);
  --keyline-w: 1px;
}
```

Fraunces load with `opsz,wght,SOFT` axes: display at opsz 144 / wght 300 / SOFT 50; prose at opsz 48 / wght 400. Plex Mono at 400 and 500 only.

Light/dark: the page is dark by design. Do not add a light theme. Set `color-scheme: dark` and an explicit body background so the viewer frame never shows white.

### Type scale

| Role | Font | Size | Notes |
|---|---|---|---|
| Hero display | Fraunces 300 | `clamp(56px, 11vw, 168px)` | line-height 0.92, letter-spacing -0.02em |
| Hero venue line | Fraunces 300 italic | `clamp(22px, 3.2vw, 44px)` | color `--bone-60` |
| Section prose (02, 04) | Fraunces 400 | `clamp(24px, 2.6vw, 38px)` | line-height 1.25, max-width `--measure` |
| Lead line (06) | Fraunces 400 | `clamp(28px, 3.4vw, 52px)` | |
| Card body (03) | Fraunces 400 | `clamp(17px, 1.3vw, 21px)` | line-height 1.35 |
| Ledger lines (06) | Fraunces 400 | `clamp(18px, 1.5vw, 24px)` | |
| Eyebrow / label | Plex Mono 500 | 12px | uppercase, tracking 0.14em, color `--oxide` |
| Section index | Plex Mono 400 | 11px | color `--bone-30` |
| Button | Plex Mono 500 | 13px | uppercase, tracking 0.12em |

### Drafting keylines

Every section opens with a full-width 1px line in `--keyline`, with 6px tick marks at the left gutter and at 25/50/75/100% of width. The section index label sits just above the line, left-aligned to the gutter. These are decorative and must not affect layout of content below.

The horizontal track in 03 gets a progress keyline: a 1px `--keyline` bar with an `--oxide` fill that tracks scroll progress.

### Imagery

All photo/video slots ship as placeholders: a `--ink-2` surface with a subtle film-grain overlay (SVG turbulence filter, opacity 0.06) and a radial `--lamp` glow offset top-left. Real assets replace them later without layout change.

Slots and ratios:
- Hero background: 16:9 video (muted, loop, `playsinline`) with a 9:16 fallback for portrait. Poster image required.
- 02 background: one 3:2 still, drifts on scroll.
- 03 cards: 4:5 each.
- 05 hosts: 3:2.
- Footer/OG: 1200×630 still.

Images are `object-fit: cover`, `max-width: 100%`, and lazy-loaded below the fold. Total page weight target under 4 MB before real video.

---

## 4. Layout

- Desktop grid: 12 columns, gutter `--gutter`, content max-width 1320px.
- 02 and 04 prose sits in columns 2–7 on desktop, full width on mobile, left-aligned.
- 03 cards: `width: clamp(260px, 30vw, 420px)`, gap 24px. Track padding-left equals the gutter so the first card aligns with the section label.
- 06 ledger: two equal columns from 760px up, stacked below. The lead line spans both.
- Header: 56px tall, transparent at top, gains `--ink-2` at 92% opacity plus a bottom keyline after 40px of scroll.
- Breakpoints: 480, 760, 1100. Nothing bespoke above 1440; let the clamps carry it.

---

## 5. Motion spec

Library: GSAP 3.12.x + ScrollTrigger, loaded from cdnjs as UMD `<script>` tags before the page script. Pin everything with `pinSpacing: true`. All scrub values `true` unless noted. Easing on scrubbed tweens: `none`. Easing on enter-triggered tweens: `power2.out`.

**Header**
Class toggle at `scrollY > 40`. 200ms transition.

**01 Hero**
On load: background media scales 1.06 → 1.0 over 1.6s; display line fades and rises 24px over 0.9s with a 0.2s delay; venue line follows 0.3s later. On scroll: the text block moves at 0.5 speed (parallax `y: 30%`) and fades to 0 by the time the section's bottom hits 40% viewport. Scroll cue fades out at 10% progress.

**02 The night**
Pin the section for `+=280%`. Each `<p>` starts at opacity 0.14 and steps to 1.0 in sequence, one line per equal slice of the pin distance, `stagger` driven by scroll position. The previous line drops to 0.5 when the next line activates, so exactly one line is at full weight at any moment. Background still translates `y: -8%` across the pin. The last line ("Same time next week.") holds at full for the final 12% of the pin before the section releases.

**03 Who's in the building**
Pin the section for a distance equal to `track.scrollWidth - window.innerWidth`. Translate the track from 0 to `-(track.scrollWidth - window.innerWidth)`, scrub. Progress keyline fills in sync. Cards do not animate individually; the track movement is the animation. Snap is off. On touch devices the track also accepts native horizontal swipe via `overflow-x: auto` when ScrollTrigger is disabled (see reduced motion).

**04 What it turns into**
Pin for `+=240%`. Three state blocks absolutely positioned and stacked. State 1 visible at 0, crossfade to state 2 across 30–42% progress, to state 3 across 64–76%. Crossfade is opacity only, plus a 12px upward drift on the incoming block. The eyebrow of the active state is `--oxide`; inactive eyebrows are `--bone-30`. A thin vertical keyline on the left grows from 0 to 100% height across the pin, with three tick marks at the state boundaries.

**05 Who's running it**
No pin. Photo and prose fade up 24px on enter at 70% viewport, once.

**06 How it works**
No pin. Lead line fades up on enter. Ledger lines reveal on enter with an 80ms stagger, left column first then right, once. Closing line reveals last with a 200ms delay.

**07 Close**
No pin. Display line fades up on enter. Button has a 1px `--oxide` border, fills `--oxide` on hover with `--ink` text, 160ms.

**Reduced motion**
On `prefers-reduced-motion: reduce`: kill all ScrollTriggers, remove pins, render every section as a normal vertical stack at full opacity, and switch 03 to a horizontally scrollable track with native overflow and visible scrollbar. Hero media does not autoplay.

**Mobile (< 760px)**
Keep pins but shorten: 02 to `+=200%`, 04 to `+=180%`. Hero uses the 9:16 media. 03 cards at 78vw.

---

## 6. Behavior

**Venue parameter.** Read `?venue=` from `location.search`. If present, set the hero venue line to `at ` + the decoded value using `textContent` (never `innerHTML`). If absent, use the fallback. Also update `document.title` to `Signet Jam at {venue}`. Nothing else on the page is venue-specific.

**Contact.** "Let's talk" opens `{calendar link}` in a new tab. The secondary link is `mailto:{email}`. No form.

**Analytics.** None in v1. Leave a commented slot in `<head>`.

**Header link.** "Let's talk" in the header scrolls to 07 with GSAP ScrollToPlugin, 0.8s.

---

## 7. Head

```html
<title>Signet Jam</title>
<meta name="description" content="A weekly jam at one venue in Denver. Sunday or Monday.">
<meta property="og:title" content="Signet Jam">
<meta property="og:description" content="A weekly jam at one venue in Denver. Sunday or Monday.">
<meta property="og:image" content="{og image url}">
<meta property="og:type" content="website">
<link rel="canonical" href="https://signetartists.com/jam">
<meta name="color-scheme" content="dark">
```

Fonts:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,300..400,50;1,9..144,300,50&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
```

Scripts (before the inline page script):
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollToPlugin.min.js"></script>
```

---

## 8. Placeholders to fill before publishing

- `{cohost name}` and the cohost sentence in 05
- `{calendar link}` (07, header)
- `{email}` (07, footer)
- `{og image url}`
- Real photo/video assets per §3 slots

---

## 9. Acceptance

- Scroll the page top to bottom on desktop and phone: every pin releases cleanly, no jump, no horizontal body scroll.
- 02 shows exactly one line at full weight at any scroll position.
- 03 track reaches its last card fully in view before the section releases.
- 04 ends on "getting there." with state 3 fully visible.
- `?venue=Bierstadt%20Lagerhaus` changes the hero and the tab title. `?venue=<b>x</b>` renders as literal text.
- Reduced motion: page is readable as a plain vertical stack, 03 scrolls horizontally by touch.
- Lighthouse performance ≥ 85 on mobile with placeholder media.
- No em dashes anywhere in rendered copy.
