#!/usr/bin/env python3
"""The line-by-line copy pass (2026-11-03).

Daniel, after finding "awful writing across the site": "we need to make the
same thoughtful changes across the entire site. please design a process where
the agent won't get lazy."

An agent can't mark its own work done here. Every sentence on a page is a row
in a ledger and needs a verdict. Known-bad lines are planted among the real
ones, and a page that misses one is rejected whole. A second agent that never
saw the first one's reasons reads the built page cold, with lines planted for
it too. Only this script can move a page to done.

    extract PAGE...       write the ledger for each page
    check PAGE            test a filled ledger; prints PASS or what failed
    apply PAGE            write a passing ledger into content/
    reader-pack PAGE      number the built page for the cold reader
    reader-check PAGE     test the reader's answer; clean means done
    close PAGE            the editor settles the last notes and closes the page
    status                the board
    exam                  write the entrance exam
    exam-score [LEDGER]   mark it against the lines Daniel approved changing

PAGE is a content path without .json, such as pages/ensembles-solo-guitarist.
The working files live in ~/Desktop/private events/copy-pass, outside the
repo, so a cut-off agent loses nothing. Run from the staging worktree.
"""
import argparse
import hashlib
import html
import json
import pathlib
import random
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
WORK = pathlib.Path.home() / "Desktop" / "private events" / "copy-pass"
LEDGERS, KEYS, PACKS = WORK / "ledger", WORK / "sealed", WORK / "reader"
STATE = WORK / "state.json"
BANK = ROOT / "scripts" / "copy_pass_canaries.json"
EXAM_REV, EXAM_PAGE = "698083c5", "pages/ensembles-spanish-guitarist"

# Fields that never hold copy. Anything else with words in it gets a row, so
# a new field lands in the ledger rather than being missed.
SKIP_KEYS = {
    "id", "src", "href", "cls", "band", "type", "path", "ogImage", "nav", "img", "poster",
    "file", "slug", "act", "page", "loading", "decoding", "kind", "tag", "titleTag",
    "titleClass", "pos", "reader", "schema_note", "reason", "areaServed", "knowsAbout",
    "name", "face", "breadcrumb", "number", "uploadDate", "duration", "configs", "bucket",
    "alt", "by", "source", "url", "author", "date", "items_ref", "depth",
}
SKIP_SUFFIX = ("Style", "_tags", "Class", "Url", "Id")
BLOCK = re.compile(r"(</?(?:p|ul|ol|li|h[1-6]|blockquote|table|tr|td|th|div|figure|figcaption|section|br)\b[^>]*>)")
BREAK = re.compile(r"(?<=[.?!])(?<!\bSt\.)(?<!\bMt\.)(?<!\bDr\.)(?<!\bvs\.)(?<!\bMr\.)(?<!\bMs\.)(\s+)(?=[A-Z“\"‘'(<0-9])")
RULE = re.compile(r"^(P[1-8]|R(1[0-5]|[1-9])|L[1-8](\.\d{1,2})?|W|BAN|TYPO|FACT)$")

# Hard fails in anything a writer proposes. His own sentences are locked, so
# none of this ever reaches them.
BANS = [
    ("em dash", r"—"), ("quietly", r"\bquietly\b"), ("guaranteed", r"\bguarantee[ds]?\b"),
    ("room", r"(?<![a-z-])rooms?\b(?!\s+(?:block|rate))"), ("chair", r"\bchairs?\b"),
    ("the night wants", r"\b(?:night|evening|event|party|dinner|crowd|floor|booking)s? (?:that )?wants?\b"),
    ("books for", r"\bbooks? (?:for|as)\b"), ("a booking", r"\bplays? (?:a|the) booking\b"),
    ("under the X", r"\bunder (?:the|your) (?:first|whole|dinner|dessert|meal|toast)"),
    ("fills a floor", r"\b(?:fills?|carr(?:y|ies)) (?:a|the) (?:dance )?floor\b"),
    ("figure", r"\bthe figures?\b"), ("footage", r"\bfootage\b|\bon film\b"),
    ("named contact", r"\bnamed (?:contact|person)\b"), ("pack down", r"\bpack[- ]?down\b"),
    ("the set", r"\bthe set is built\b"), ("conversation volume", r"\bconversation volume\b"),
    ("agree a", r"\bagree (?:a|the) (?:plan|date|time|price)\b"),
    ("British", r"\b(?:afterwards|catalogue|honour|colour|favourite|enquir|organis|programme)\w*"),
    ("Layer 1 and 2 words", r"\b(?:delve|tapestry|testament|seamless(?:ly)?|elevates?|bespoke|curated|unforgettable|world-class|premier|genuinely|honestly|truly|candidly)\b"),
    ("the version of", r"\bthe version (?:of|where)\b"), ("the shape of", r"\bthe shape of\b"),
    ("the move", r"\bthe move\b"), ("load-bearing", r"\bload-bearing\b"), ("full stop", r"\bfull stop\b"),
    ("not X but Y", r"\bnot (?:just |only |merely )?[a-z]+(?: [a-z]+){0,3},? but\b"),
]
UNCONTRACTED = re.compile(r"\b(it is|that is|there is|they are|we will|we are|you will|you are|do not|does not|cannot|will not)\b", re.I)
SHORT_OK = {"yes", "no", "not exactly", "yes, we can", "of course", "usually"}
FACT_WORDS = {
    "Denver", "Colorado", "Signet", "Artists", "Boulder", "Vail", "Aspen", "I", "We", "January",
    "February", "March", "April", "May", "June", "July", "August", "September", "October",
    "November", "December", "Christmas", "Birthday", "Front", "Range", "Live", "Music", "Cost",
    "Guide", "Check", "Artist", "Roster", "House", "Ensembles", "Featured",
}
HEAD_FIELDS = {"title", "eyebrow", "term", "q", "label", "heading", "headline", "link_text", "seo_title",
               "seoTitle", "dek", "style", "material", "spec", "build", "bestFor", "note", "caption"}
MOLD_PAGES = 4
# His words from chat, which the CopyDesk record can't know about.
ALSO_HIS = ("Perfect booking for",)
# Pages he has approved as they stand. They are never extracted.
APPROVED = {"pages/ensembles-beatles-sing-along"}


def die(msg):
    sys.exit(msg)


def norm(text):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", text))).strip()


def load_state():
    return json.loads(STATE.read_text()) if STATE.exists() else {}


def save_state(state):
    STATE.write_text(json.dumps(state, indent=1, ensure_ascii=False))


def sealed(page):
    return json.loads((KEYS / f"{tag(page)}.json").read_text())


def tag(page):
    return page.replace("/", "__")


def source(page, rev=None):
    rel = f"content/{page}.json"
    if rev:
        return subprocess.run(["git", "show", f"{rev}:{rel}"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return (ROOT / rel).read_text(encoding="utf-8")


def leaves(node, path=()):
    """Every string that can hold copy, in page order."""
    if isinstance(node, dict):
        for key, value in node.items():
            if key.startswith("_") or key in SKIP_KEYS or key.endswith(SKIP_SUFFIX):
                continue
            if key == "notes" and "reader" in (value or {}):
                continue
            yield from leaves(value, path + (key,))
    elif isinstance(node, list):
        for i, value in enumerate(node):
            yield from leaves(value, path + (i,))
    elif isinstance(node, str):
        text = norm(node)
        last = next((p for p in reversed(path) if isinstance(p, str)), "")
        if re.search(r"[A-Za-z]", text) and not re.match(r"https?://|/", text):
            if last != "items" or len(text.split()) >= 6:
                if len(text.split()) >= 2 or last in HEAD_FIELDS:
                    yield path, node


def split(text):
    """Text into [sentence, separator, sentence, ...], losing nothing: ''.join gives it back."""
    parts = []
    for chunk in BLOCK.split(text):
        if BLOCK.fullmatch(chunk or ""):
            parts.append((False, chunk))
            continue
        pieces = BREAK.split(chunk)
        run = ""
        for i, piece in enumerate(pieces):
            if i % 2:
                # a break inside an open tag isn't a break
                if run.count("<a") + run.count("<strong") + run.count("<em") != run.count("</a") + run.count("</strong") + run.count("</em"):
                    run += piece
                else:
                    parts.append((True, run))
                    parts.append((False, piece))
                    run = ""
            else:
                run += piece
        if run:
            parts.append((True, run) if re.search(r"[A-Za-z]", norm(run)) else (False, run))
    return parts


def get(node, path):
    for step in path:
        node = node[step]
    return node


def put(node, path, value):
    get(node, path[:-1])[path[-1]] = value


def where(doc, path):
    label = "Page data"
    if path and path[0] == "content" and len(path) > 1:
        label = doc["content"][path[1]].get("type", "Section")
    last = next((p for p in reversed(path) if isinstance(p, str)), "")
    return f"{label} > {last}"


def protected():
    sys.path.insert(0, str(ROOT / "scripts"))
    from protected import protected_strings, compared
    return [compared(s) for s in protected_strings()] + list(ALSO_HIS), compared


def extract(page, rev=None, name=None):
    if page in APPROVED and not rev:
        die(f"{page} is approved as it stands")
    doc = json.loads(source(page, rev))
    theirs, compared = protected()
    rows, slots = [], []
    for path, text in leaves(doc):
        parts = split(text)
        for i, (is_line, piece) in enumerate(parts):
            if not is_line:
                continue
            flat = compared(norm(piece))
            locked = len(flat) > 3 and any(flat in s or (len(s) > 40 and s in flat) for s in theirs)
            rid = hashlib.sha1(f"{page}|{path}|{i}|{piece}".encode()).hexdigest()[:8]
            rows.append({"id": rid, "where": where(doc, path), "line": piece.strip(), "locked": locked,
                         "verdict": "keep" if locked else None, "rule": None, "new": None})
            slots.append({"id": rid, "path": list(path), "index": i, "orig": piece})
    open_rows = [r for r in rows if not r["locked"]]
    bank = json.loads(BANK.read_text())
    rng = random.SystemRandom()
    planted = []
    if open_rows and not name:
        bad = rng.sample(bank["writer_bad"], min(len(bank["writer_bad"]), max(3, len(open_rows) // 25)))
        good = rng.sample(bank["good"], 1 + len(open_rows) // 60)
        for kind, lines in (("bad", bad), ("good", good)):
            for line in lines:
                rid = hashlib.sha1(f"{page}|{line}|{rng.random()}".encode()).hexdigest()[:8]
                spot = rng.randrange(1, len(rows))
                rows.insert(spot, {"id": rid, "where": rows[spot]["where"], "line": line, "locked": False,
                                   "verdict": None, "rule": None, "new": None})
                planted.append({"id": rid, "kind": kind, "line": line})
    label = name or tag(page)
    (LEDGERS / f"{label}.json").write_text(json.dumps({"page": page, "rows": rows}, indent=1, ensure_ascii=False))
    (KEYS / f"{label}.json").write_text(json.dumps({"page": page, "slots": slots, "planted": planted,
                                                     "source_sha": hashlib.sha1(source(page, rev).encode()).hexdigest()}, ensure_ascii=False))
    state = load_state()
    entry = state.setdefault(label, {"page": page, "writer_runs": 0, "reader_runs": 0, "status": "open"})
    entry["writer_runs"] += 1
    entry.update(status="open", lines=len(rows) - len(planted), locked=sum(r["locked"] for r in rows))
    save_state(state)
    print(f"{label}: {entry['lines']} lines, {entry['locked']} of them Daniel's and locked, ledger at {LEDGERS / (label + '.json')}")


def rewrite(page, ledger, key):
    """The page as it would be with this ledger applied, as a parsed doc."""
    doc = json.loads(source(page))
    by_id = {r["id"]: r for r in ledger["rows"]}
    paths = {}
    for slot in key["slots"]:
        paths.setdefault(tuple(slot["path"]), []).append(slot)
    for path, slots in paths.items():
        parts = split(get(doc, path))
        for slot in slots:
            row = by_id[slot["id"]]
            if row["verdict"] == "replace":
                parts[slot["index"]] = (True, slot["orig"].replace(slot["orig"].strip(), row["new"]))
            elif row["verdict"] == "delete":
                parts[slot["index"]] = (True, "")
        put(doc, path, re.sub(r"  +", " ", "".join(p for _, p in parts)).strip())
    return prune(doc)


def prune(doc):
    """A deleted FAQ or row takes its emptied partner with it."""
    def walk(node):
        if isinstance(node, dict):
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            node[:] = [v for v in node if not (isinstance(v, dict) and (("q" in v and not (v.get("a") or "").strip()) or ("term" in v and not (v.get("text") or "").strip())))]
            for value in node:
                walk(value)
    walk(doc)
    return doc


def hrefs(text):
    return re.findall(r'href=\\?"([^"\\]+)', text)


def problems(page, label):
    ledger = json.loads((LEDGERS / f"{label}.json").read_text())
    key = sealed(label)
    rows = ledger["rows"]
    original = {s["id"]: s for s in key["slots"]}
    planted = {p["id"]: p for p in key["planted"]}
    fails = []
    for row in rows:
        rid, verdict = row["id"], row.get("verdict")
        if row.get("locked"):
            if verdict != "keep" or row.get("new"):
                fails.append(f"{rid}: this sentence is Daniel's and can't change")
            continue
        if verdict not in ("keep", "replace", "delete"):
            fails.append(f"{rid}: no verdict")
            continue
        if verdict == "keep":
            continue
        if not RULE.match(row.get("rule") or ""):
            fails.append(f"{rid}: '{row.get('rule')}' isn't a rule id")
        if verdict == "replace":
            new = (row.get("new") or "").strip()
            if not new or new == row["line"]:
                fails.append(f"{rid}: replace with no new text")
                continue
            if rid in planted:
                continue
            fails += [f"{rid}: {name} in the new text" for name, pat in BANS if re.search(pat, new, re.I)]
            if UNCONTRACTED.search(new):
                fails.append(f"{rid}: contract '{UNCONTRACTED.search(new).group(1)}'")
            field = row["where"].split(" > ")[-1]
            if field not in HEAD_FIELDS and len(norm(new).split()) <= 3 and norm(new).lower().rstrip(".?!") not in SHORT_OK:
                fails.append(f"{rid}: a fragment closer, write the whole sentence")
    miss_bad = [p for p in planted.values() if next(r for r in rows if r["id"] == p["id"]).get("verdict") == "keep" and p["kind"] == "bad"]
    hit_good = [p for p in planted.values() if next(r for r in rows if r["id"] == p["id"]).get("verdict") != "keep" and p["kind"] == "good"]
    if fails:
        return fails, None
    if miss_bad or hit_good:
        return [], f"{len(miss_bad)} bad line(s) kept, {len(hit_good)} good line(s) changed"

    # What only shows once the page is whole.
    before = source(page)
    after = json.dumps(rewrite(page, ledger, key), ensure_ascii=False)
    keep_links = {u for r in rows for u in (r.get("drop_links") or [])}
    fails += [f"link lost: {u} (name it in drop_links on the row, with the reason in why)" for u in sorted(set(hrefs(before)) - set(hrefs(after)) - keep_links)]
    known = set(re.findall(r"[A-Za-z0-9$][\w$,'’-]*", norm(before))) | FACT_WORDS
    for row in rows:
        if row.get("verdict") == "replace" and row["id"] not in planted and not row.get("fact_source"):
            words = norm(row["new"]).split()
            for i, word in enumerate(words):
                token = word.strip(".,;:?!()\"“”'’")
                prior = i == 0 or words[i - 1][-1] in ".?!:"
                numeric = re.search(r"\d", token)
                if token and (numeric or (token[0].isupper() and not prior)) and token not in known and token.rstrip("s") not in known:
                    fails.append(f"{row['id']}: '{token}' isn't on this page. Take it out, or name where it came from in fact_source")
    fails += mold(label, rows, planted)
    return fails, None


def mold(label, rows, planted):
    """The same fresh wording on page after page is a template, however good."""
    def grams(text):
        words = re.findall(r"[a-z'’]+", norm(text).lower())
        return {" ".join(words[i:i + 6]) for i in range(len(words) - 5)}

    others = {}
    for path in LEDGERS.glob("*.json"):
        if path.stem == label or path.stem.startswith("exam"):
            continue
        for row in json.loads(path.read_text())["rows"]:
            if row.get("verdict") == "replace" and row.get("new"):
                for gram in grams(row["new"]):
                    others.setdefault(gram, set()).add(path.stem)
    fails = []
    for row in rows:
        if row.get("verdict") == "replace" and row["id"] not in planted:
            for gram in grams(row["new"]):
                if len(others.get(gram, ())) + 1 >= MOLD_PAGES:
                    fails.append(f"{row['id']}: '{gram}' is now on {MOLD_PAGES} pages. Say it another way")
    return fails


def check(page):
    label = tag(page)
    fails, rejected = problems(page, label)
    state = load_state()
    if rejected:
        state[label]["status"] = "rejected"
        save_state(state)
        # Which lines is not said, so the page can't be patched. It starts again.
        print(f"REJECTED {label}: the planted lines were not handled ({rejected}).")
        print("Extract again and give the page to a fresh agent.")
        return 1
    if fails:
        print(f"FAIL {label}: {len(fails)}")
        print("\n".join(f"  {f}" for f in fails))
        return 1
    state[label]["status"] = "writer-passed"
    save_state(state)
    rows = json.loads((LEDGERS / f"{label}.json").read_text())["rows"]
    print(f"PASS {label}: {sum(r['verdict'] == 'replace' for r in rows)} replaced, {sum(r['verdict'] == 'delete' for r in rows)} deleted, {sum(r['verdict'] == 'keep' for r in rows)} kept")
    return 0


def apply(page):
    label = tag(page)
    if load_state().get(label, {}).get("status") != "writer-passed":
        die(f"{label} hasn't passed check")
    key = sealed(label)
    if hashlib.sha1(source(page).encode()).hexdigest() != key["source_sha"]:
        die(f"{page} changed since it was extracted, and any change of Daniel's wins. Extract it again.")
    ledger = json.loads((LEDGERS / f"{label}.json").read_text())
    doc = rewrite(page, ledger, key)
    path = ROOT / f"content/{page}.json"
    path.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    state = load_state()
    state[label]["status"] = "applied"
    save_state(state)
    print(f"applied {label}")


def built_lines(page, site):
    doc = json.loads(source(page))
    url = doc.get("root", {}).get("props", {}).get("path") or f"/blog/{page.split('/')[-1]}/"
    text = (pathlib.Path(site) / url.strip("/") / "index.html").read_text(encoding="utf-8")
    main = re.search(r"<main\b.*?</main>", text, re.S)
    body = re.sub(r"<(script|style|svg|iframe)\b.*?</\1>", " ", main.group(0), flags=re.S)
    body = re.sub(r"</?(?:a|strong|em|b|i|span)\b[^>]*>", "", body)
    lines = []
    for piece in re.split(r"<[^>]+>", body):
        lines += [p for i, p in enumerate(BREAK.split(html.unescape(re.sub(r"\s+", " ", piece)).strip())) if i % 2 == 0 and p.strip()]
    meta = [m for m in re.findall(r'<(?:title>([^<]+)|meta name="description" content="([^"]+))', text)]
    return ["Page title: " + html.unescape("".join(meta[0]))] + ["Search description: " + html.unescape("".join(meta[1]))] + lines


def reader_pack(page, site):
    label = tag(page)
    lines = built_lines(page, site)
    bank = json.loads(BANK.read_text())
    rng = random.SystemRandom()
    plants = rng.sample(bank["reader_bad"], min(len(bank["reader_bad"]), max(2, len(lines) // 40)))
    for line in plants:
        lines.insert(rng.randrange(3, len(lines)), line)
    numbered = [{"n": i + 1, "line": line} for i, line in enumerate(lines)]
    (PACKS / f"{label}.json").write_text(json.dumps({"page": page, "lines": numbered}, indent=1, ensure_ascii=False))
    (KEYS / f"{label}.reader.json").write_text(json.dumps([n["n"] for n in numbered if n["line"] in plants]))
    state = load_state()
    state[label]["reader_runs"] = state[label].get("reader_runs", 0) + 1
    save_state(state)
    print(f"{label}: {len(lines)} lines at {PACKS / (label + '.json')}. Answer goes in {PACKS / (label + '.answer.json')}")


def reader_check(page):
    label = tag(page)
    answer = json.loads((PACKS / f"{label}.answer.json").read_text())
    plants = set(json.loads((KEYS / f"{label}.reader.json").read_text()))
    flagged = {f["n"]: f for f in answer["fails"]}
    state = load_state()
    if plants - set(flagged):
        state[label]["status"] = "reader-void"
        save_state(state)
        print(f"VOID {label}: the reader missed planted lines. Pack it again for a fresh reader.")
        return 1
    lines = {n["n"]: n["line"] for n in json.loads((PACKS / f"{label}.json").read_text())["lines"]}
    theirs, compared = protected()
    # A sentence of Daniel's stays whatever the reader thinks of it.
    real = [f for n, f in flagged.items() if n not in plants and compared(lines[n]) not in theirs]
    if real:
        state[label]["status"] = "reopened"
        save_state(state)
        notes = [f"Line: {lines[f['n']]}\nFault ({f.get('rule')}): {f.get('why')}\nReader's suggestion: {f.get('proposal')}\n" for f in real]
        (PACKS / f"{label}.notes.md").write_text("\n".join(notes))
        print(f"REOPENED {label}: {len(real)} line(s), notes for the next writer at {PACKS / (label + '.notes.md')}")
        return 1
    state[label]["status"] = "done"
    save_state(state)
    print(f"DONE {label}")
    return 0


def close(page):
    """After the third cold read the main session settles what's left by hand
    and closes the page, so a reader can't keep a page open on smaller and
    smaller notes. Daniel's read is the check on that."""
    label = tag(page)
    state = load_state()
    if state[label].get("reader_runs", 0) < 2 or state[label]["status"] != "reopened":
        die(f"{label} needs a reopened second read first")
    state[label]["status"] = "done"
    state[label]["closed_by_editor"] = True
    save_state(state)
    print(f"DONE {label}, closed by the editor")


def status():
    state = load_state()
    for label, entry in sorted(state.items()):
        print(f"{entry['status']:14} writer x{entry.get('writer_runs', 0)} reader x{entry.get('reader_runs', 0)} {entry.get('lines', '?'):>4} lines  {label}")
    counts = {}
    for entry in state.values():
        counts[entry["status"]] = counts.get(entry["status"], 0) + 1
    print(counts)


def exam_score(label="exam"):
    ledger = json.loads((LEDGERS / f"{label}.json").read_text())
    now = norm(source(EXAM_PAGE).replace("\\n", " "))
    must = [r for r in ledger["rows"] if not r["locked"] and norm(r["line"]) not in now]
    caught = [r for r in must if r.get("verdict") in ("replace", "delete")]
    undone = [r for r in ledger["rows"] if not r["locked"] and not r.get("verdict")]
    print(f"caught {len(caught)} of {len(must)}, {len(undone)} rows with no verdict")
    for row in must:
        if row not in caught:
            print(f"  MISSED {row['line'][:110]}")
    return 0 if len(caught) >= 0.9 * len(must) and not undone else 1


def main():
    WORK.mkdir(exist_ok=True)
    for folder in (LEDGERS, KEYS, PACKS):
        folder.mkdir(exist_ok=True)
    parser = argparse.ArgumentParser()
    parser.add_argument("command")
    parser.add_argument("pages", nargs="*")
    parser.add_argument("--site", default="_site")
    args = parser.parse_args()
    if args.command == "extract":
        for page in args.pages:
            extract(page)
    elif args.command == "check":
        return check(args.pages[0])
    elif args.command == "apply":
        apply(args.pages[0])
    elif args.command == "reader-pack":
        reader_pack(args.pages[0], args.site)
    elif args.command == "reader-check":
        return reader_check(args.pages[0])
    elif args.command == "close":
        close(args.pages[0])
    elif args.command == "status":
        status()
    elif args.command == "exam":
        extract(EXAM_PAGE, EXAM_REV, "exam")
    elif args.command == "exam-score":
        return exam_score(*args.pages)
    else:
        die(__doc__)
    return 0


if __name__ == "__main__":
    sys.exit(main())
