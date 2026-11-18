#!/usr/bin/env python3
"""Turn a built site into the staging site.

Every page gets a noindex tag, and every form posts nowhere: a send goes to the
thanks page and no email leaves. Exits non-zero if a page has no <head> to take
the tag or a form still sends.

    python3 scripts/make_staging.py _site
"""
import pathlib
import re
import sys

TAG = '<meta name="robots" content="noindex">'
ROBOTS = re.compile(r'<meta\s+name=["\']robots["\'][^>]*>', re.I)
HEAD = re.compile(r'<head(\s[^>]*)?>', re.I)
FORM = re.compile(r'<form\b([^>]*)>', re.I)
ACTION = re.compile(r'\saction="[^"]*"', re.I)


def main(root):
    turned = []

    def off(m):
        turned.append(1)
        attrs = ACTION.sub('', m.group(1))
        return ('<form action="/thanks/"' + attrs +
                ' onsubmit="event.preventDefault();location.href=\'/thanks/\'">')

    pages, missing, sending = 0, [], []
    for p in sorted(pathlib.Path(root).rglob('*.html')):
        s = p.read_text(encoding='utf-8')
        s, n = ROBOTS.subn(TAG, s)
        if not n:
            s, n = HEAD.subn(lambda m: m.group(0) + '\n' + TAG, s, count=1)
        if not n:
            missing.append(str(p))
            continue
        s = FORM.sub(lambda m: off(m) if 'action=' in m.group(1) else m.group(0), s)
        if 'formsubmit.co' in s:
            sending.append(str(p))
        p.write_text(s, encoding='utf-8')
        pages += 1
    if missing:
        sys.exit('No <head> to take noindex: ' + ', '.join(missing))
    if sending:
        sys.exit('A form still sends: ' + ', '.join(sending))
    print(f'noindex on {pages} pages, {len(turned)} forms off')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('usage: make_staging.py <site dir>')
    main(sys.argv[1])
