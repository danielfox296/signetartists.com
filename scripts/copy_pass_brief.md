# The copy pass: the agent's brief

You are rewriting Signet Artists copy, one sentence at a time. Daniel has read
the site and found it awful, and several earlier passes have told him it was
done. You won't be believed either: this work is marked by a script and by a
second agent who never sees your reasons.

## What is watching

- Known-bad lines are planted among the real rows, and sentences of Daniel's are
  planted as well. Keep one bad line, or change one of his, and the whole page is
  thrown out and starts again with a fresh agent. You won't be told which.
- A page with rows left blank doesn't pass. Your own word that it's done counts for nothing.
- A cold reader then reads the built page and sends back every line that fails.

## Read before the first row, in full

1. `~/Desktop/private events/SIGNET-VOICE.md`. All of it. It is the whole standard.
2. `~/Desktop/private events/copy-pass/calibration.md`, if your brief says to. Changes he approved on one page.
3. `~/Desktop/private events/copy-pass/corrections.md`, if it exists. Every later correction of his.

## How to read a page

Read the whole ledger first, top to bottom, as the page's one buyer. Then go row by row
and say each line aloud in your head as a person at a friendly Denver booking company
talking to someone planning an event. For each row, ask:

1. Would that person say this sentence out loud to a client? If it sounds written, rewrite it.
2. Would a stranger need to read it twice, or work out what it hints at?
3. Who is doing what? A night, a booking or a set can't want anything or do anything.
4. Is there a subject and a verb, or is a fragment doing a sentence's job?
5. Is any scene, head count, place or person invented? "A terrace", "twenty around a table" and "two guests who have just met" all go.
6. Does it script the event, or say what guests will feel or do?
7. Would the buyer know this word? Trade talk and music terms get plain words, or a gloss.
8. Has the page already said this? Say a fact once, where it works hardest.
9. Does it describe the site, or the site's own categories? A pointer stays only as an invitation.
10. Does it put down anything, including another Signet act?
11. Does it promise anything, or explain a quote?
12. Is the claim absolute where a person would hedge?
13. Does it contradict anything else on the page, or anything true of this act? Take every question literally: a person is not the same as a genre.
14. Is the new sentence as good as what Daniel would type, or is it only the old sentence with its faults filed off?

A clean rule pass is the floor. Would a copywriter sign this sentence? Keep means yes. A sentence that's fine stays, and the standard lists what earlier passes wrongly treated as faults.

Page-level faults are yours too: an opener that isn't a moment the buyer knows, three
sections saying one thing, a phrase repeated down the page, a heading that carries no
search term. Fix them through the rows they live in.

## Filling the ledger

Each row needs `verdict`:

- `keep`: nothing else needed.
- `replace`: needs `new`, the sentence to publish, and `rule`, the one rule it breaks most.
- `delete`: needs `rule`. Deleting a sentence has to lose no fact, or the fact has to appear on another row.

`rule` is one of V1 to V22 from the standard, W (his word table), NEVER (the never list) or TYPO. Add `why`, a few words.

- Keep `<a href>` links and other tags inside the sentence. Drop a link only with its address in `drop_links` and the reason in `why`.
- `locked` rows are Daniel's. Leave them exactly as they are.
- Use a new proper name or number only if it's in the act's data under `content/acts/`, and name the file in `fact_source`. Otherwise it stays out.
- Page titles and search descriptions keep their search terms. Fix the grammar and any fragment, and leave the phrase people type.
- Each page gets its own sentences. Lifting a sentence from another page or from this brief makes a template, and the script catches that too. Daniel's phrases are there to tune your ear, not to paste.

## By kind of page

- **Act and artist pages** sell the act. Make the reader want to book it. Setup detail comes off the page altogether (V12).
- **Occasion and location pages:** the occasion is the desire. Real venues, drives and altitudes stay.
- **Planner, guide and pricing pages** are utility pages. Numbers are the copy, and dBA and footprints belong there. Fix the writing and move nothing out.
- **Blog posts** are long-form. Keep their argument, their sources, their citations and every link, and don't shorten them for its own sake. Fix each sentence. A figure or study claim stays exactly as it stands.
- **Video titles and descriptions:** titles are how people find the clip, so keep the search words, the act and the song. Plain words, no scene-setting.
- **Act data:** a row can show on a roster card, in search results or in llms.txt. Keep it short and plain.
- **Short labels** that are fine stay fine. Keep is a real answer. Don't reword for the sake of it.

## Working rules

- If your batch has several pages, finish one before starting the next, and read each one whole first. Later pages carry planted lines just as the first does.

- Save the ledger after every ten rows. If you're cut off, the next agent carries on from your last save.
- Decide each row yourself. No find-and-replace, no batch rule, no script writing any `verdict` or `new` text beyond saving what you decided.
- Run `python3 scripts/copy_pass.py check <page>` from `~/Desktop/private events/website-staging` when every row on a page has a verdict. Fix what it lists and run it again. If it says REJECTED, leave that page and go on to the next.
- Don't use git, don't change `content/`, and don't start agents of your own.
- Your last message is one line: rows replaced, rows deleted, rows kept.

## The cold reader

You get one numbered file of what a page says and nothing about how it got there. Read the
same standard, then read the page once through as its buyer and once as a stranger,
asking the fourteen questions. Write `{"fails": [{"n": 12, "rule": "V18", "why": "...", "proposal": "..."}]}`
to the answer path you were given, listing every line that fails. Lines were planted
to test you, and missing one voids your read. Flag a fault against a rule, and leave out
matters of taste. An empty list is a real answer if the page earns it.
