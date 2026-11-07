#!/usr/bin/env python3
"""Fail if any content file carries internal notes.

Content files hold what the site renders and nothing else: no page `notes`
object, no `_notes`, no other text field whose key starts with an underscore
(`_file` is the one exception), and no `holds`, `held_back` or `depth` list.

Run: python3 scripts/no_notes.py
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def found(node, path):
    if isinstance(node, dict):
        for key, value in node.items():
            here = f"{path}/{key}"
            if key == "notes" and isinstance(value, dict):
                yield here
            elif key == "_notes" or (key.startswith("_") and key != "_file" and isinstance(value, str)):
                yield here
            elif key in ("holds", "held_back") or (key == "depth" and isinstance(value, list) and value):
                yield here
            else:
                yield from found(value, here)
    elif isinstance(node, list):
        for i, value in enumerate(node):
            yield from found(value, f"{path}/{i}")


def main() -> int:
    hits = []
    for f in sorted((ROOT / "content").rglob("*.json")):
        rel = f.relative_to(ROOT)
        hits += [f"{rel}: {p}" for p in found(json.loads(f.read_text(encoding="utf-8")), "")]
    for name in ("media-sources.json", "reviews.json"):
        if (ROOT / "content" / "records" / name).exists():
            hits.append(f"content/records/{name}: belongs in the private records")
    for h in hits:
        print(f"NOTE {h}")
    print(f"no_notes: {len(hits)} note field(s) in content/")
    if hits:
        print("This repository is public: take these fields out and keep the notes outside it.")
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main())
