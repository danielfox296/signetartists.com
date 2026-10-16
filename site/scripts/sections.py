"""Reading a live section's HTML into a typed section.

classify(html, ctx) returns {"type": ..., "props": {...}} or None. Nothing
here has to be perfect: convert.py renders every typed section back through
the components and keeps the original as Custom HTML wherever the DOM
differs, so a reader that misses a detail costs a fallback, never a change
on the site."""
import re
from dataclasses import dataclass, field

from lxml import html as LH


@dataclass
class Ctx:
    B: object
    page: str
    url: str
    prefix: str
    output: str
    file: str
    tokens: set = field(default_factory=set)
    cfg: dict = field(default_factory=dict)
    schema: dict = None
    raw: str = ""


def classify(html, ctx):
    return None


def video_index_sections(B):
    return [{"type": "VideoIndex", "props": {"id": "VideoIndex-1",
             "eyebrow": "Video Clips", "title": "Video clips of our bands and musicians.",
             "lede": "Every clip is grouped by act. If you see something you like, check out the act's page or just <a href=\"/contact/\">reach out with your date</a>."}}]
