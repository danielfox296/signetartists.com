# LinkedIn publishing setup

Everything here is a one-time job on a machine with a browser. Budget 30
minutes for the parts you can finish today, plus a wait for the part LinkedIn
controls.

---

## The thing to understand first

LinkedIn does not have "a posting API". It has two, they are different
products, and only one of them is available today.

| | Personal profile | Company page |
|---|---|---|
| Product | **Share on LinkedIn** (self-serve) | **Community Management API** |
| Scope | `w_member_social` | `w_organization_social` and friends |
| Approval | **None. Added from the Products tab, working the same day** | Review of the app *and* the company. Registered legal entity plus a verified Page. Weeks |
| Queue channel | `linkedin-personal` | `linkedin` |
| Reach | **Higher. Personal profiles substantially out-distribute company pages** | Lower, but it is the credibility artifact |

The useful accident here is that **the surface you can have today is the one
that matters more.** Do not wait on the Page to start posting.

Entuned, LLC satisfies the registered-entity requirement, so the Page
application should succeed. It just will not succeed this week.

---

## Step 1. Create the app (10 minutes)

1. Go to <https://www.linkedin.com/developers/apps> and click **Create app**.
2. Name it something like `Signet Artists publishing`.
3. **LinkedIn Page:** enter the Signet Artists page. The app has to be
   associated with a Page you administer, and this is also what the Page
   application later verifies against.
4. Upload a logo, accept the terms, create.
5. **Verify the app.** LinkedIn generates a verification URL. Open it as a Page
   admin and approve. The app does nothing until this is done.

## Step 2. Add the products

On the app's **Products** tab:

- **Sign In with LinkedIn using OpenID Connect** — add it. Self-serve,
  instant. This is what lets the helper work out your person URN.
- **Share on LinkedIn** — add it. Self-serve, instant. This is `w_member_social`,
  the personal posting scope.
- **Community Management API** — request it. This is the slow one. Do it now so
  the clock starts, then carry on without it.

Products can take a few minutes to show as active. Reload the tab.

## Step 3. Add the redirect URL

On the **Auth** tab, under *OAuth 2.0 settings*, add exactly:

```
http://localhost:8765/callback
```

It has to match character for character or the authorisation fails.

While you are on that tab, copy the **Client ID** and **Client Secret**.

## Step 4. Authorise (5 minutes)

On your own machine, in a clone of this repo:

```bash
export LINKEDIN_CLIENT_ID=paste_it_here
export LINKEDIN_CLIENT_SECRET=paste_it_here

python3 scripts/linkedin_auth.py --authorize
```

Your browser opens, you approve, and the terminal prints a block of secrets.
**Run it without `--org` the first time.** Asking for the organisation scopes
before Community Management API is approved makes LinkedIn refuse the whole
authorisation, not just that part.

The output tells you what the token actually unlocks, asked of LinkedIn
directly rather than assumed:

```
WHAT IT UNLOCKS
  personal profile  urn:li:person:XXXXXXXX
  company page      NOT yet. Community Management API is partner-gated
```

## Step 5. Put the secrets in GitHub

Repo → **Settings** → **Secrets and variables** → **Actions** → **New
repository secret**. Add exactly what the helper printed:

| Secret | Needed for |
|---|---|
| `LINKEDIN_CLIENT_ID` | token refresh and the expiry check |
| `LINKEDIN_CLIENT_SECRET` | same |
| `LINKEDIN_ACCESS_TOKEN` | posting |
| `LINKEDIN_PERSON_URN` | posting to your profile |
| `LINKEDIN_REFRESH_TOKEN` | only if the helper printed one |
| `LINKEDIN_ORG_URN` | later, once the Page is approved |

Never commit these, never paste them into a chat, never put them in the queue
file.

## Step 6. Prove it works before it posts anything

```bash
# what can this token do?
LINKEDIN_CLIENT_ID=... LINKEDIN_CLIENT_SECRET=... LINKEDIN_ACCESS_TOKEN=... \
  python3 scripts/linkedin_auth.py --doctor

# what would go out, exactly?
python3 scripts/social_publish.py
```

The dry run prints the full payload for every due post. Read the `commentary`
field and make sure it is what you meant to say.

## Step 7. Go live

1. Write the body for a slot in `_marketing/content-queue.yaml`.
2. Set its `channel` to `linkedin-personal`.
3. `python3 scripts/social_queue.py --lint`
4. Set `status: ready`, commit, push.

The hourly workflow picks it up at its `publish_at`. To fire one immediately,
use **Actions → Social queue → Run workflow** with **live** ticked.

---

## The 60-day trap

A LinkedIn access token expires after 60 days. Refresh tokens are issued to
approved apps only, so a consumer-tier app very likely gets none, which means
**the token must be replaced by hand roughly every two months.**

This is handled, not ignored:

- The workflow runs `linkedin_auth.py --doctor` on every scheduled run and
  prints the days remaining.
- Inside 7 days it prints `<-- RE-AUTHORISE SOON` in the log.
- To replace it: re-run `--authorize` and update `LINKEDIN_ACCESS_TOKEN`.

Put a recurring calendar reminder at 50 days. That is cheaper than discovering
it because a December post did not go out.

## The API version

`LinkedIn-Version` is a `YYYYMM` header and each version is supported for about
a year after release. The default in the scripts is `202608`. When LinkedIn
sunsets it, calls start failing with a version error and `--doctor` prints
`<-- REJECTED, bump it`. Fix it by setting the `LINKEDIN_API_VERSION` secret to
a current version; no code change needed.

## When Community Management API is approved

1. Re-run `python3 scripts/linkedin_auth.py --authorize --org`
2. Add `LINKEDIN_ORG_URN` from the output, update the access token
3. Start using `channel: linkedin` for company-page slots

Keep most slots on `linkedin-personal` anyway. That is where the reach is.

## If the Page application is refused or stalls

The queue file is the system and the API is a detail. Point the same
`content-queue.yaml` at Buffer, Later or Publer, all of which hold their own
LinkedIn partnership, and keep the copy gate and the calendar exactly as they
are. Nothing about the strategy changes.
