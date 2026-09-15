# Signet Artists — brand and social strategy

**Written 2026-09-15. Horizon: now through January 2027.**
**Channels: LinkedIn and Instagram. Objective: private corporate parties.**

Internal. Not published, not built, excluded from the deploy.
Read `ICP.md` first; this document assumes it.

---

## 1. Where we actually are

The site is the strongest asset in the business. Sixty-plus pages, a real blog,
GA4 and Search Console wired, market data sourced, a client list that includes
Amazon, NBCUniversal, Charles Schwab, Kroger and the Denver Art Museum.

The social profiles are the weakest. LinkedIn, Instagram and YouTube all exist
and all point at a company that a planner cannot tell is still operating. That
gap is not cosmetic. It is a conversion leak at the exact moment a buyer is
deciding whether we are safe:

> A planner finds the site, likes it, and clicks Instagram to check we are real.
> If the last post is old, we have just told them the most expensive thing we
> could possibly tell them.

So this plan has two jobs, in strict order. **Proof of life first. Brand
building second.** They are not the same job and doing them out of order wastes
the second one.

### The timing problem, stated plainly

Today is 15 September. Our own planner FAQ says office holiday parties are
decided August through October. We are **mid-window with roughly six weeks of
live decision-making left** for November and December 2026.

That is late to start a brand. It is not late to start a campaign. The strategy
below therefore runs two tracks at once:

- **Track A (now to 5 Dec):** capture what is left of the Nov/Dec decision. Direct,
  calendar-driven, unembarrassed about asking.
- **Track B (Oct to mid-Jan):** own the **January office party** from the front.
  The January window has not opened yet. It is the one Q4 occasion where we can
  arrive early rather than late, and Denver venues have already extended their
  holiday packages into the third week of January. This is the highest-leverage
  play available to us this year.

---

## 2. The brand platform

Everything posted on either channel has to be traceable to this.

**Category.** Signet Artists is a Denver corporate entertainment company, not a
band. Bands, small ensembles, a DJ and live band karaoke, on one contract. That
is the actual differentiator and it is the thing a buyer cannot get from hiring
a band directly.

**Promise.** Live music built around your program, with the paperwork your
finance team needs.

**Enemy.** Not other bands. The enemy is **the party that empties at 8:40** and
the vendor who goes quiet when someone asks for a certificate of insurance. Every
piece of content is aimed at one of those two.

**Proof.** Amazon. NBCUniversal. Charles Schwab. Kroger. Denver Art Museum.
Hyatt. Sheraton. Washington Nationals. Monarch Casino. Casa Bonita. Live Nation.
Plus the reviews already cleared in `reviews.json`.

**Voice.** The site's voice, unchanged: concrete, specific, unhurried,
never salesy. It earns trust by knowing operational detail nobody else bothers
to mention. The best single line the company has written is the model:

> The music stops while your CEO is still three steps from the microphone.

That sentence sells more than any adjective. Write more of those.

**The brand-building bet.** We do not win by looking the most glamorous. We win
by being the vendor who visibly knows how an evening works. Competence, shown
repeatedly and specifically, is the brand.

### Hard rules inherited from the site

These are not stylistic preferences. They are standing company law and they
apply to every post, caption, story and comment.

1. **No prices. Ever.** No figure, no range, no "from", no hourly, no percentage,
   no discount. Market information lives on the site; Signet's numbers are
   published nowhere. `scripts/social_queue.py` enforces this mechanically.
2. **No published availability.** No "three December dates left", no countdown
   of open dates, no fabricated scarcity. Urgency comes from **calendar fact**,
   which is true and public: the season is decided August to October, December
   Fridays and Saturdays go first, New Year's Eve books earliest. That is
   plenty.
3. **No em dashes. Never the word "AI". Avoid "chair", and "room" except
   ballroom and green room.** Inherited from `scripts/copy_gate.py`.
4. **No business filler.** No leverage, seamless, solutions, bespoke, curated,
   turnkey, best-in-class. Emotive words are allowed and encouraged;
   unforgettable is fine, seamless is not.
5. **Artist footage only with permission, and no credit disclaimers.** The
   permission ledger is `_src/data/media-sources.json`. The held-back list in
   that file is binding: do not post anything on it.
6. **No third-party faces we have not cleared.** No guest photography of
   identifiable people without permission. This is the single most likely way
   to create a real problem while trying to look busy.

---

## 3. What each channel is for

They are not the same channel with different crops, and posting identical
content to both is the most common way agencies waste a year.

### LinkedIn — the demand channel

**Job:** create and capture corporate demand. This is where the EA, the People
Ops lead, the planner and the hotel catering manager actually are, in work
context, thinking about work problems.

**It works because:** our buyer is a professional whose job involves this
decision, our proof is corporate logos, and our differentiators are contracts,
insurance and run-of-show competence. That content is native to LinkedIn and
looks out of place everywhere else.

**Two surfaces, and the personal one matters more:**

- **Signet Artists company page.** The credibility artifact. A planner checks it
  the way they check a licence. It has to be current, complete and professional.
- **Daniel's personal profile.** This is where the reach is. Personal profiles
  substantially out-distribute company pages on LinkedIn and always have. The
  founder of a music company writing about how corporate evenings actually work
  is an inherently more interesting object than a logo doing the same. **Roughly
  70% of LinkedIn effort goes here.**

The company page reposts and amplifies. The person writes.

### Instagram — the proof channel

**Job:** prove we are real, working and good, to someone who has already heard of
us. Almost nobody will discover us on Instagram and book. Nearly everybody who
considers booking us will look at Instagram.

Treat it as **a portfolio with a pulse**, not a growth channel. Judge it by
whether a planner who lands on the grid concludes "these people work
constantly," not by follower count.

**What goes there:** footage, sound, venues, load-ins, acts, the look of an
evening. Motion over stills. Sound on.

**What does not:** contract terms, net-30, procurement. Nobody is on Instagram
thinking about accounts payable.

### YouTube — the asset library, not a channel

The Signet channel already holds 24 cleared reuploads. It is not a growth
priority. It is the warehouse that feeds Instagram Reels and LinkedIn video, and
the place embeds point at. Keep loading it; do not build a content plan for it.

---

## 4. Content pillars

Five. Every post is one of them. If a draft is not one of them, it does not go
out. The tag is recorded on each queue entry so the mix stays honest.

### 1. The Calendar (`calendar`)
Dated, factual, useful, quietly urgent. When the season is decided. Which nights
go first. How far ahead to book each occasion. When the January window opens.
Why New Year's Eve is different.
*Does the work of scarcity without inventing any.*
**LinkedIn-led. Roughly 20% of posts.**

### 2. The Floor Read (`floor`)
How an evening actually works. Dinner at conversation volume. Silence through
remarks. Loud on cue. The last twenty minutes shaped so the night ends high
instead of getting cut off. Decibel caps and curfews. Dedicated 20-amp circuits
and why sharing one with the catering warmers is the classic load-in failure.
*This is the brand. It is the pillar that makes us look like the only adult in
the vendor list.*
**Both channels. Roughly 30% of posts. The biggest pillar and the most
distinctive.**

### 3. The Paperwork (`paperwork`)
One contract for music and sound. Certificate of insurance naming the venue.
W-9. One itemised invoice. Net-30 and PO numbers. Vendor onboarding, which is
reliably the slowest step in a corporate booking. Working alongside the hotel's
in-house AV instead of against it.
*Unglamorous, low engagement, high conversion. It reaches the person who has
been burned. Do not cut it because the likes are small.*
**LinkedIn almost exclusively. Roughly 15% of posts.**

### 4. The Acts (`acts`)
Who plays and what they sound like. Tejas Singh's looping. The jazz duo on
upright bass and guitar. Dirty Flamenco doing real palos. Live band karaoke.
Yacht rock. The soul and R&B band on a ballroom floor. Solo piano through
arrival and dinner. Which evening each one is for.
*Answers the question the planner FAQ admits we cannot answer any other way:
we do not stage showcases, so footage is the only pre-booking evidence that
can exist.*
**Instagram-led. Roughly 25% of posts.**

### 5. The Proof (`proof`)
Client names. Cleared reviews. Venue types. What a planner said afterwards.
*Use sparingly and never in a row. Proof works as seasoning, not as a diet.*
**Both. Roughly 10% of posts.**

---

## 5. The campaigns

### Track A — Holiday 2026 ("The one they still talk about in February")

**Live: 22 September to 5 December. LinkedIn-weighted.**

The line is already in the company's own corporate copy and it is the best
holiday hook available: everyone in the office remembers that one party. The one
where people who planned to leave after dinner were still there at the end, and
half the office was still talking about it in February.

Campaign spine:
- **Sep 22 to Oct 17 — the decision weeks.** Calendar and Floor Read lead.
  Booking windows, which nights go first, what to settle before you book a
  venue, band or DJ, what to ask a vendor before you sign. The single highest
  value post of the quarter is a plain checklist of what a planner should have
  nailed down before they book entertainment.
- **Oct 20 to Nov 14 — the late-decision weeks.** Paperwork and Proof lead. Aimed
  at the organiser who left it late and is now anxious. Vendor onboarding, COI,
  what can still be arranged, how quickly.
- **Nov 17 to Dec 5 — the live season.** Acts and Floor Read lead. Footage.
  Evidence of a company in the middle of its busiest weeks. This period converts
  next year more than this one, and it is also the best raw material we will
  ever get.
- **Dec 8 onward — hand off to Track B.** Every December post carries a January
  line.

**Landing pages:** `/corporate/holiday-party/`, `/corporate/holiday-party/denver/`,
`/corporate/`, and the cost guide when the question is money.

### Track B — January 2027 ("The party everybody actually comes to")

**Live: 15 October to 15 January. The priority play.**

The insight is already written up in the January blog post and it is genuinely
strong, genuinely useful, and almost nobody in this market is saying it:

> In December the office party competes with three other invitations, a school
> concert and a flight home, and the person who organised it spends December
> organising it instead of enjoying it. In January it is the only thing on the
> calendar that week, the venue has dates, and the planner gets to attend their
> own party.

Denver venues have already moved: several write holiday packages that run into
the third week of January and past it.

This is the campaign to spend the real effort on, for four reasons:
1. The decision window is ahead of us instead of half gone.
2. It rescues every Nov/Dec conversation we lose on date availability. "We are
   full that Friday" becomes "have you considered the second week of January,"
   which is a better evening anyway.
3. It positions Signet as the company that understands where the market is
   moving, which is exactly the competence brand we want.
4. It extends the season by six weeks at a time of year when this business is
   otherwise quiet.

Campaign spine:
- **Mid-Oct to Nov:** plant the idea while people are still choosing December.
  Frame it as a legitimate option, not a consolation prize.
- **Dec:** the "did not get the date you wanted?" moment. This is when it earns.
- **Early Jan:** last call, plus kickoff-dinner and year-in-review framings for
  companies who want the evening to do a job beyond a party.

**Landing pages:** `/blog/january-office-party-ideas/` and the January section of
`/corporate/holiday-party/`.

### Always-on underneath both

Client dinners (Q4 heavy, short decision window, quick to close), galas and
award nights (booked 6 to 12 months ahead, so Q4 content sells spring),
retreats, after-parties, and private hosts.

---

## 6. Cadence

Deliberately survivable. A plan that fails in week five because it demanded
seven authored pieces a week is worse than no plan, because a second dead
account is harder to recover than a first.

### Phase 0 — Proof of life (22 Sep to 5 Oct, two weeks)

The only goal is that both profiles look unmistakably current and complete.

- Profile hygiene first, before any posting: company page banner, description
  in the current brand language, service area, website link, specialties,
  client list. Instagram bio, link, highlights covering Holiday Parties,
  Corporate, The Acts, Weddings.
- **LinkedIn 2 posts a week. Instagram 3 posts a week.**
- Draw entirely on assets that already exist: cleared footage, the act photos,
  the blog archive. **No shoot needed to start.** Not shooting is not an excuse
  to not start.

### Phase 1 — Campaign cadence (6 Oct to 15 Jan)

| | LinkedIn | Instagram |
|---|---|---|
| Company page | 3 a week (Tue, Wed, Thu) | 4 a week: 2 Reels, 1 carousel, 1 still |
| Daniel personal | 2 a week (Tue, Thu) | Stories 3 a week, manual, never scheduled |

Until the Page is approved, run the company-page slots on the personal profile
too rather than leaving them empty. Three a week on a profile that reaches
people beats three a week on a page that cannot post yet.

Roughly seven authored pieces a week, most of them short, several of them
one asset plus three sentences. Write in weekly batches, publish daily.

### Phase 2 — Always-on (after mid-Jan)

LinkedIn 2 a week, Instagram 3 a week, with a hard ramp back up each September.

### Best times, Denver

LinkedIn Tue to Thu, 8:00 to 10:00 local. Instagram late morning and around
18:00. These are starting assumptions; replace them with our own data after
six weeks.

---

## 7. What gets automated, and what absolutely does not

This is the line the whole system is built around.

### Automated

- **Scheduling and publishing.** A post that is written and approved goes out at
  its time without anyone being at a desk.
- **Validation before it goes.** The copy gate runs on every queued post: no
  prices, no availability claims, no banned phrases, no missing link, no missing
  asset, no untagged campaign.
- **UTM tagging**, so GA4 can attribute the enquiry.
- **Cross-posting mechanics**, where a piece is genuinely meant for both.
- **The ledger.** What went out, when, where, with what link.
- **Failure alerts.** A failed publish is loud, not silent.

### Never automated

- **What a post says.** Every word is written by a person. This plan is a set of
  slots and briefs; it does not fill them.
- **Replies to comments and DMs.** A planner who comments is a lead. The reply is
  the sales call.
- **Connection requests and outbound notes.** Automating these on LinkedIn
  violates their terms and risks the account. It is also the one place where a
  human note outperforms anything else we can do.
- **Choosing images and footage.** Permission and taste both live with a person.
- **Engagement with other accounts.** Venue, planner and client posts get real
  comments from a real person or none.

The rule in one line: **the machine handles the calendar and the keys. The
person handles the words and the relationships.**

---

## 8. The system

Three files, one workflow.

```
_marketing/content-queue.yaml   every post: slot, brief, body, asset, link, status
scripts/social_queue.py         validate, lint, list what is due
scripts/social_browser.py       LinkedIn, via a logged-in browser, run locally
scripts/social_publish.py       Instagram, via the Graph API, run by CI
.github/workflows/social.yml    hourly: publish what is due, record it, alert on failure
```

**How a week runs:**

1. Daniel opens `content-queue.yaml` and writes the week's bodies against the
   briefs already in the slots. Substance, by hand, in one sitting.
2. `python3 scripts/social_queue.py --lint` catches a price, a banned word, a
   missing asset or an untagged link before it can embarrass us.
3. Change `status: draft` to `status: ready`, commit, push.
4. The workflow publishes each post at its time and writes the result into
   `_marketing/published.json`.
5. Nobody touches anything at 9am on a Tuesday.

**Credentials** live in GitHub Actions secrets, never in the repo:
`LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_ORG_URN`, `IG_ACCESS_TOKEN`, `IG_USER_ID`.
Without them the workflow runs in dry-run and prints what it would have posted,
which is also how it behaves on a pull request.

**Setup honesty.** LinkedIn's Community Management API needs an approved app
before `w_organization_social` will work, and approval takes time. Instagram
publishing needs a Business or Creator account linked to a Facebook Page, plus a
long-lived token that has to be refreshed about every 60 days. If either is
blocked or slow, point the same queue at Buffer or Later and keep the queue file
as the source of truth. **The queue is the system. The API is a detail.**

**Decided 2026-09-15: LinkedIn goes out through a logged-in browser, not the
API.** Waiting weeks on the Page review during the six weeks that decide the
holiday season was the wrong trade, so `scripts/social_browser.py` drives a real
browser Daniel is already signed in to. Same queue, same copy gate, same ledger;
only the last mile changed.

That route is against LinkedIn's User Agreement, which is a real cost and is
recorded here rather than buried: the account exposed is the personal profile
this plan leans on hardest. The mitigations are structural, not cosmetic. It
runs only on Daniel's machine, never in CI, because a login from a datacenter IP
is the loudest flag available. It runs headed, stops before publishing, and
confirms per post. It stays at the cadence this plan already set, two or three a
week. And it makes no attempt to defeat bot detection, which is the line that
keeps this "his own account posting his own content" rather than something else.

`_marketing/BROWSER-POSTING.md` is the runbook. The Page application stays open
in the background, and `LINKEDIN_ENABLE_API=1` switches the API rail back on the
day it lands.

**Corrected 2026-09-15.** An earlier version of this section claimed the
personal LinkedIn profile could not be posted to by API. That was wrong, and
the mistake mattered, because it is the highest-reach surface in this plan.

LinkedIn has two publishing products and only one of them is gated:

- **Personal profile**, scope `w_member_social`, from the self-serve *Share on
  LinkedIn* product. No review, added from the Products tab, working the same
  day. Queue channel `linkedin-personal`.
- **Company page**, the *Community Management API*. Partner-gated: a review of
  the app and the company, a registered legal entity and a verified Page.
  Weeks. Queue channel `linkedin`.

So the surface that carries most of the reach is the one available immediately,
and the Page can be requested and then forgotten about until it lands. Start on
the personal profile; do not wait for the Page to start posting.

`_marketing/LINKEDIN-SETUP.md` is the runbook, and
`scripts/linkedin_auth.py --doctor` reports what a token actually unlocks by
asking LinkedIn rather than assuming.

Instagram Stories remain the one surface a person must post by hand. Budget
five minutes, twice a week.

One operational note that will otherwise bite in December: a LinkedIn access
token lasts 60 days, and a consumer-tier app is issued no refresh token, so it
has to be replaced by hand. The workflow prints the days remaining on every run
and warns inside a week.

---

## 9. Assets

**What exists and is cleared today:** 24 reuploads on the Signet YouTube channel,
first-party phone footage of Dirty Flamenco, act photography from the artists'
own channels, duotoned venue and gear stills, ten client logos, cleared reviews.

**Enough to run Phase 0 and most of Phase 1 without shooting anything.**

**The real gap, and it is worth naming:** we have no footage of our acts playing
an actual corporate evening, with a full floor, in a ballroom. The planner FAQ
concedes we do not stage showcases and that video is therefore the only
pre-booking evidence that can exist. That makes this the highest-value asset the
company could acquire.

**The cheapest fix is this season.** We are about to play the busiest weeks of
the year. Standing ask for every Nov/Dec and January booking:

- Ask the client at contract for permission to film, in writing, with a clear
  no-guest-faces default. Getting the permission is the hard part and it costs
  nothing to ask.
- Fifteen seconds of wide floor footage per booking, shot from behind the crowd
  so no guest is identifiable.
- One still of the set up and lit ballroom **before doors**, which needs no
  permission at all and is quietly one of the most persuasive images we can
  publish.
- The load-in. Planners love it and it costs nothing.

One season of that and next year's content problem is solved permanently.

---

## 10. The outbound layer

Content alone will not fill November. LinkedIn's real value for this business is
that the buyer is **individually identifiable**, which is not true on any other
channel we have.

Manual, human, roughly 30 minutes a day, and worth more than the posting:

1. **Build the list.** Denver-area companies of 100 to 600 staff, plus the
   people who hold the title in `ICP.md`: EA, Office Manager, People Ops,
   Culture Lead, Chief of Staff. Plus every catering sales manager at the
   downtown hotels and mountain resorts. Plus the independent corporate planners
   and DMCs working this market.
2. **Connect without pitching.** A connection note that mentions their event, or
   their venue, or a genuine detail. Never a rate, never a pitch, never a
   template that reads like one.
3. **Be present in their feed for two weeks before saying anything.** Comment
   with something substantive on their posts. This is the whole trick and almost
   nobody does it.
4. **Then ask one question**, not for the booking: are you doing the December
   party or have you looked at January.
5. **Venue relationships are the compounding asset.** A catering manager who
   knows us is asked "do you know a band?" several times a week. One coffee is
   worth a hundred posts. This should be the highest priority in the entire plan
   after the posting rail is running.

---

## 11. Measurement

Measure the right thing for the phase. Judging Phase 0 by leads is how good
plans get killed in week three.

**Phase 0, proof of life.** Posts shipped against posts planned, which should be
100%. Both profiles complete. Nothing older than seven days on either.

**Phase 1, brand and demand.** Followers on both, tracked weekly for direction
not vanity. LinkedIn company page views and unique visitors. Social sessions in
GA4, which is the honest number. Clicks on posts with UTMs. Comments and DMs
from anyone with an ICP title, which is the leading indicator that matters most.

**The number that decides everything.** Enquiries through the contact form
attributed to social, and how many became bookings. GA4 already records
`pricing_engaged` and the contact submission; the UTM convention closes the
loop:

```
?utm_source=linkedin|instagram&utm_medium=social&utm_campaign=holiday-2026|january-2027
```

**Review monthly, on the first Monday.** Which pillar drove profile visits, which
posts produced an ICP comment, what the enquiries said they saw. Move the mix
toward what worked and delete this plan's guesses when the data contradicts them.

---

## 12. The first fourteen days

Concrete, ordered, and none of it requires a shoot.

**This week (15 to 21 Sep) — set up, do not post yet.**
1. LinkedIn company page: banner, description in current brand language, service
   area, specialties, website link, client list.
2. Instagram: bio, link, four highlight covers (Holiday Parties, Corporate, The
   Acts, Weddings).
3. Daniel's personal profile headline and About rewritten to say what Signet
   does, because this is the profile people will click from every comment.
4. Create the GitHub secrets, or open the LinkedIn app request today, because
   approval is the long pole.
5. Write the first two weeks of bodies against the briefs in
   `content-queue.yaml`.

**Week of 22 Sep — proof of life.**
LinkedIn Tue and Thu, Instagram Mon, Wed, Fri. The Tuesday post is the holiday
booking window, because it is useful, dated, true and it opens the campaign
without asking for anything.

**Week of 29 Sep — the checklist week.**
The highest-value post of the quarter: what a planner should have settled before
they book entertainment. Write it as a LinkedIn carousel and an Instagram
carousel from the same source. Route both to `/planners/booking/`.

**By 5 Oct.** Both profiles current, ten posts shipped, the publishing rail
running unattended, the venue and planner outreach list built, and the January
campaign written and queued while everyone else is still thinking about
December.
