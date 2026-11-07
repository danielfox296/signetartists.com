#!/usr/bin/env python3
"""The whole-site proof: today's build against the new one, file by file.

Run from the repo root:  python3 site/scripts/proof.py [--keep]

1. build.py runs, unchanged, in a throwaway checkout of this commit
   (a detached git worktree, so the sitemap's git dates are real).
2. The new build renders content/ into a second folder.
3. Every file build.py wrote is compared with the new build's copy:
   HTML as a normalised DOM (head and body, JSON-LD as data), the XML
   feeds and the text files line by line. robots.txt is compared with the
   repo's own copy, since build.py never writes it.

The report lands in site/proof/: report.md (the summary and every
difference) and report.json. A difference made on purpose is listed in
site/proof/accepted.json with its reason; it stops failing the proof only
once it is marked "accepted": true. Exit status 0 when nothing unaccepted
differs, 1 otherwise."""
import difflib
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import time


HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import domdiff  # noqa: E402

ROOT = pathlib.Path.cwd().resolve()
PROOF = HERE.parent / "proof"
ACCEPTED = PROOF / "accepted.json"


def sh(cmd, cwd, **kw):
    return subprocess.run(cmd, cwd=cwd, check=True, capture_output=True, text=True, **kw)


def old_build(work):
    tree = work / "old"
    sh(["git", "worktree", "add", "--detach", str(tree), "HEAD"], ROOT)

    def snapshot():
        seen = {}
        for dirpath, dirnames, filenames in os.walk(tree):
            rel = pathlib.Path(dirpath).relative_to(tree)
            if rel.parts and rel.parts[0] in (".git", "_src", "site", "content", "scripts"):
                dirnames[:] = []
                continue
            for f in filenames:
                p = pathlib.Path(dirpath) / f
                seen[str(p.relative_to(tree))] = p.stat().st_mtime_ns
        return seen

    before = snapshot()
    time.sleep(0.01)
    sh([sys.executable, "build.py"], tree)
    after = snapshot()
    outputs = [f for f, t in after.items() if before.get(f) != t]
    return tree, sorted(outputs)


def new_build(work):
    out = work / "new"
    sh(["node", str(HERE / "build.mjs"), "--out", str(out)], ROOT)
    files = sorted(str(p.relative_to(out)) for p in out.rglob("*") if p.is_file())
    return out, files


def page_tokens(path):
    doc = domdiff.parse(path.read_text(encoding="utf-8")).getroot()
    head = doc.find("head")
    body = doc.find("body")
    return {
        "head": domdiff.tokens(head) if head is not None else [],
        "body": domdiff.tokens(body) if body is not None else domdiff.tokens(doc),
    }


def compare_html(a, b):
    ta, tb = page_tokens(a), page_tokens(b)
    out = []
    for part in ("head", "body"):
        if ta[part] != tb[part]:
            lines = [d for d in difflib.unified_diff(ta[part], tb[part], "build.py", "new", n=1, lineterm="") if not d.startswith(("---", "+++"))]
            out.append({"part": part, "lines": sum(1 for d in lines if d[:1] in "+-"), "diff": lines[:80]})
    return out


def compare_text(a, b):
    la = a.read_text(encoding="utf-8").splitlines()
    lb = b.read_text(encoding="utf-8").splitlines()
    if la == lb:
        return []
    lines = [d for d in difflib.unified_diff(la, lb, "build.py", "new", n=1, lineterm="") if not d.startswith(("---", "+++"))]
    return [{"part": "text", "lines": sum(1 for d in lines if d[:1] in "+-"), "diff": lines[:80]}]


def main():
    keep = "--keep" in sys.argv
    work = pathlib.Path(tempfile.mkdtemp(prefix="signet-proof-"))
    tree = None
    try:
        tree, old_files = old_build(work)
        new_dir, new_files = new_build(work)
        listed = json.loads(ACCEPTED.read_text()) if ACCEPTED.exists() else {}
        accepted = {k: v for k, v in listed.items() if v.get("accepted")}
        results = {}
        pairs = [(f, tree / f, new_dir / f) for f in old_files]
        pairs.append(("robots.txt", ROOT / "robots.txt", new_dir / "robots.txt"))
        only_old = [f for f in old_files if f not in set(new_files)]
        only_new = [f for f in new_files if f not in set(old_files) and f != "robots.txt"]
        for name, a, b in pairs:
            if not b.exists():
                continue
            diffs = compare_html(a, b) if name.endswith(".html") else compare_text(a, b)
            if diffs:
                results[name] = diffs
        unaccepted = {k: v for k, v in results.items() if k not in accepted}
        summary = {
            "compared": len(pairs) - len(only_old),
            "html": sum(1 for f, _, _ in pairs if f.endswith(".html")),
            "feeds": [f for f, _, _ in pairs if not f.endswith(".html")],
            "only_in_build_py": only_old,
            "only_in_new_build": only_new,
            "files_differing": len(results),
            "differing_lines": sum(d["lines"] for v in results.values() for d in v),
            "accepted": sorted(k for k in results if k in accepted),
            "unaccepted": sorted(unaccepted),
        }
        write_report(summary, results, listed)
        print(json.dumps({k: (v if not isinstance(v, list) or len(v) < 12 else f"{len(v)} files") for k, v in summary.items()}, indent=1))
        if keep:
            print("kept:", work)
        return 0 if not unaccepted and not only_old and not only_new else 1
    finally:
        if tree is not None:
            subprocess.run(["git", "worktree", "remove", "--force", str(tree)], cwd=ROOT, capture_output=True)
        if not keep:
            shutil.rmtree(work, ignore_errors=True)


def write_report(summary, results, listed):
    PROOF.mkdir(exist_ok=True)
    (PROOF / "report.json").write_text(json.dumps({"summary": summary, "differences": results}, indent=1, ensure_ascii=False) + "\n")
    lines = ["# Whole-site proof", "",
             f"- Files compared: {summary['compared']} ({summary['html']} HTML, plus {', '.join(summary['feeds'])})",
             f"- Files that differ: {summary['files_differing']} ({summary['differing_lines']} differing tokens)",
             f"- Accepted differences: {len(summary['accepted'])}",
             f"- Only in build.py's output: {', '.join(summary['only_in_build_py']) or 'none'}",
             f"- Only in the new build's output: {', '.join(summary['only_in_new_build']) or 'none'}", ""]
    for name, diffs in sorted(results.items()):
        entry = listed.get(name)
        tag = ""
        if entry:
            tag = f" ({'accepted' if entry.get('accepted') else 'awaiting a decision'}: {entry['reason']})"
        lines.append(f"## {name}{tag}")
        for d in diffs:
            lines.append(f"{d['part']}: {d['lines']} differing tokens")
            lines.append("```")
            lines.extend(x[:240] for x in d["diff"][:40])
            lines.append("```")
        lines.append("")
    (PROOF / "report.md").write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    sys.exit(main())
