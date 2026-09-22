"""Blog renderer for the signetartists.com build.

The shared blog kit, ported from the foxlessons.com generation 2026-08-03
and adapted to this build's idioms: no legacy post formats, directory-style
URLs (/blog/<slug>/), and a `draft` flag the build skips.

A post is _src/pages/blog-<slug>/content.yaml — frontmatter plus a
`sections` list of typed blocks — rendered through the Jinja2 templates in
_src/templates/. Validation collects every problem before returning, so one
lint run reports the whole file.

Needs jinja2, markdown and pyyaml. build.py imports this module lazily and
prints the pip install line when they are missing, so a plain
`python3 build.py` stays stdlib-only until the first post directory exists.
"""

import datetime
import pathlib
import re

import jinja2
import markdown as md_lib
import markupsafe
import yaml

from _src.lib.reading_time import calculate_reading_time

# Eyebrow taxonomy — the category label above the headline. Provisional set
# pending the content pass; extend it here when a real post needs a new one.
VALID_EYEBROWS = {'NOTES', 'PLANNING', 'MUSIC', 'WEDDINGS', 'CORPORATE'}

KNOWN_BLOCK_TYPES = {
    'prose', 'subhead', 'pullquote', 'stat_callout', 'data_viz',
    'figure', 'aside', 'comparison_table', 'key_takeaways',
    'methodology', 'cta', 'related',
    'video', 'transcript', 'references',
}

# Fields required at the top level of every content.yaml.
REQUIRED_FRONTMATTER = {
    'title', 'slug', 'eyebrow', 'dek', 'date', 'author',
    'meta_description', 'sections',
}

# Dates are strings, not YAML dates: an unquoted 2026-08-03 parses to a
# datetime.date and would fail this. The error message says to quote them.
_DATE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
_SLUG = re.compile(r'^[a-z0-9]+(-[a-z0-9]+)*$')


def load_post(yaml_path) -> dict:
    """Parse a content.yaml and return the raw dict."""
    with open(yaml_path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)


def collect_posts(pages_dir) -> list:
    """Parsed dicts for every blog-<slug>/content.yaml under pages_dir.

    Includes drafts — the build filters them out of every publish surface,
    but lint wants them. blog-index has no content.yaml, so the glob's
    blog- prefix never picks it up.
    """
    posts = []
    for entry in sorted(pathlib.Path(pages_dir).glob('blog-*')):
        yaml_path = entry / 'content.yaml'
        if not yaml_path.exists():
            continue
        data = load_post(yaml_path)
        if not isinstance(data, dict):
            data = {'_unparseable': True}
        data['dir_name'] = entry.name
        data['post_dir'] = str(entry)
        posts.append(data)
    return posts


# ---------------------------------------------------------------------------
# Schema validation
# ---------------------------------------------------------------------------

def validate_post(data: dict, yaml_path: str = '<unknown>',
                  dir_name: str = None) -> tuple:
    """Validate a parsed post dict against the blog schema.

    Returns (errors, warnings). Errors are fatal — the build must fail.
    All problems are collected before returning (no fail-fast).
    """
    errors = []
    warnings = []

    if not isinstance(data, dict) or data.get('_unparseable'):
        return ([f"[{yaml_path}] content.yaml is not a YAML mapping"], warnings)

    for field in sorted(REQUIRED_FRONTMATTER):
        if field not in data:
            errors.append(f"[{yaml_path}] Missing required field: {field}")

    eyebrow = data.get('eyebrow', '')
    if eyebrow and eyebrow not in VALID_EYEBROWS:
        errors.append(
            f"[{yaml_path}] Invalid eyebrow '{eyebrow}'. "
            f"Must be one of: {', '.join(sorted(VALID_EYEBROWS))}"
        )

    # Slug drives the public URL (/blog/<slug>/) and must match the
    # directory, or the next person greps for the wrong thing.
    slug = data.get('slug')
    if slug is not None:
        if not isinstance(slug, str) or not _SLUG.match(slug) or slug == 'index':
            errors.append(
                f"[{yaml_path}] slug must be lowercase-hyphenated "
                f"(a-z, 0-9, hyphens; not 'index')"
            )
        elif dir_name is not None and dir_name != f'blog-{slug}':
            errors.append(
                f"[{yaml_path}] slug '{slug}' does not match directory "
                f"'{dir_name}' (expected blog-{slug})"
            )

    for field in ('date', 'last_updated'):
        value = data.get(field)
        if value is not None and not (isinstance(value, str) and _DATE.match(value)):
            errors.append(
                f"[{yaml_path}] {field} must be a quoted \"YYYY-MM-DD\" string"
            )

    if 'draft' in data and not isinstance(data['draft'], bool):
        errors.append(f"[{yaml_path}] draft must be true or false")

    author = data.get('author')
    if isinstance(author, dict):
        if 'name' not in author:
            errors.append(f"[{yaml_path}] author must have a 'name' field")
    elif author is not None:
        errors.append(f"[{yaml_path}] 'author' must be a mapping with at least 'name'")

    hero = data.get('hero')
    if isinstance(hero, dict):
        for key in ('src', 'alt'):
            if key not in hero:
                errors.append(f"[{yaml_path}] hero must have a '{key}' field")
    elif hero is not None:
        errors.append(f"[{yaml_path}] 'hero' must be a mapping with 'src' and 'alt'")

    sections = data.get('sections', [])
    if not isinstance(sections, list):
        errors.append(f"[{yaml_path}] 'sections' must be a list of block dicts")
        return errors, warnings

    has_methodology = False
    has_pilot_data_viz = False
    key_takeaways_index = None

    for i, block in enumerate(sections):
        if not isinstance(block, dict):
            errors.append(f"[{yaml_path}] sections[{i}] is not a dict")
            continue

        btype = block.get('type')
        if btype is None:
            errors.append(f"[{yaml_path}] sections[{i}] missing 'type' field")
            continue

        if btype not in KNOWN_BLOCK_TYPES:
            errors.append(
                f"[{yaml_path}] sections[{i}] unknown block type '{btype}'. "
                f"Known types: {', '.join(sorted(KNOWN_BLOCK_TYPES))}"
            )
            continue

        # A number without attribution is exactly the directory-average
        # hand-waving the published rates exist to displace.
        if btype == 'stat_callout' and 'source' not in block:
            errors.append(
                f"[{yaml_path}] sections[{i}] stat_callout missing "
                f"required 'source' field"
            )

        if btype == 'data_viz':
            caption = str(block.get('caption', '')).lower()
            source = str(block.get('source', '')).lower()
            if 'pilot' in caption or 'pilot' in source:
                has_pilot_data_viz = True

        if btype == 'methodology':
            has_methodology = True

        if btype == 'key_takeaways':
            if key_takeaways_index is None:
                key_takeaways_index = i
            else:
                warnings.append(
                    f"[{yaml_path}] Multiple key_takeaways blocks "
                    f"(indices {key_takeaways_index} and {i})"
                )

    if has_pilot_data_viz and not has_methodology:
        errors.append(
            f"[{yaml_path}] Post contains data_viz citing pilot data but "
            f"no 'methodology' block is present"
        )

    if key_takeaways_index is not None and key_takeaways_index != 0:
        warnings.append(
            f"[{yaml_path}] key_takeaways is at sections[{key_takeaways_index}]; "
            f"it renders first regardless, so put it first in the YAML too"
        )

    return errors, warnings


# ---------------------------------------------------------------------------
# Jinja2 environment
# ---------------------------------------------------------------------------

def create_jinja_env(templates_dir: str) -> jinja2.Environment:
    """Jinja2 environment rooted at _src/templates, with the `markdown`
    filter for prose/aside bodies and `slugify` for subhead anchors."""
    env = jinja2.Environment(
        loader=jinja2.FileSystemLoader(templates_dir),
        autoescape=jinja2.select_autoescape(['html']),
        trim_blocks=True,
        lstrip_blocks=True,
    )

    def _markdown_filter(text):
        if not text:
            return ''
        return md_lib.markdown(
            str(text),
            extensions=['smarty', 'tables', 'fenced_code'],
        )

    env.filters['markdown'] = _markdown_filter

    def _slugify(text):
        slug = re.sub(r'[^\w\s-]', '', str(text).lower())
        return re.sub(r'[\s_]+', '-', slug).strip('-')

    env.filters['slugify'] = _slugify

    return env


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------

def asset_href(src: str, nav_prefix: str) -> str:
    """Depth-correct href for a repo-relative asset like img/foo.jpg.
    External and root-absolute paths pass through untouched."""
    if not src or src.startswith(('http://', 'https://', '/', '#')):
        return src
    return f'{nav_prefix}{src}'


def fmt_date(iso: str) -> str:
    """'2026-08-03' -> 'August 3, 2026' for bylines and index rows."""
    d = datetime.date.fromisoformat(iso)
    return f"{d.strftime('%B')} {d.day}, {d.year}"


def render_block(block: dict, ctx: dict, env: jinja2.Environment) -> str:
    """Render a single typed block through its template partial."""
    block_type = block.get('type')
    if block_type not in KNOWN_BLOCK_TYPES:
        raise ValueError(f"Unknown block type: '{block_type}'")

    # Auto-generate anchor for subheads if not provided
    if block_type == 'subhead' and 'anchor' not in block:
        block = dict(block)  # shallow copy so we don't mutate source
        block['anchor'] = env.filters['slugify'](block.get('text', ''))

    # Generate inline SVG for data_viz blocks
    if block_type == 'data_viz':
        block = dict(block)
        from _src.lib.data_viz import render_chart
        block['svg_html'] = markupsafe.Markup(render_chart(
            chart_type=block.get('chart_type', 'bar'),
            data=block.get('data', []),
            title=block.get('title', ''),
            caption=block.get('caption', ''),
            source=block.get('source', ''),
        ))

    # CTA links and figure images are authored repo-relative ("contact/",
    # "img/foo.jpg"); make them depth-correct for the post's directory URL.
    if block_type == 'cta':
        block = dict(block)
        block['link'] = asset_href(block.get('link', ''), ctx.get('nav_prefix', ''))

    if block_type == 'figure':
        block = dict(block)
        block['src'] = asset_href(block.get('src', ''), ctx.get('nav_prefix', ''))

    # Resolve related post slugs against the full post list. Unknown or
    # draft slugs are dropped rather than rendered as dead cards.
    if block_type == 'related':
        block = dict(block)
        posts_by_slug = {p.get('slug', ''): p for p in ctx.get('all_posts', [])}
        nav_prefix = ctx.get('nav_prefix', '../../')
        resolved = []
        for item in block.get('posts', []):
            slug = item.get('slug', '') if isinstance(item, dict) else str(item)
            post = posts_by_slug.get(slug)
            if post is None or post.get('draft'):
                continue
            hero = post.get('hero') or {}
            resolved.append({
                'slug': slug,
                'title': post.get('title', ''),
                'eyebrow': post.get('eyebrow', ''),
                'dek': post.get('dek', ''),
                'hero_img': asset_href(hero.get('src', ''), nav_prefix),
            })
        block['posts'] = resolved

    template = env.get_template(f"blocks/{block_type}.html")
    return template.render(block=block, ctx=ctx)


def render_post(post_dir, env: jinja2.Environment, all_posts: list = None) -> tuple:
    """Render one post directory to article HTML (the {{content}} slot).

    Returns (article_html, data): data is the parsed YAML plus computed
    fields (reading_time, date_display) — reused by the blog index, RSS,
    sitemap and llms.txt so the numbers can never drift between surfaces.
    Raises ValueError when validation fails.
    """
    post_dir = pathlib.Path(post_dir)
    yaml_path = post_dir / 'content.yaml'
    data = load_post(yaml_path)

    errors, warnings = validate_post(data, str(yaml_path), dir_name=post_dir.name)
    for w in warnings:
        print(f"  WARNING: {w}")
    if errors:
        raise ValueError(
            "Blog schema validation failed:\n" + "\n".join(f"  - {e}" for e in errors)
        )

    sections = data.get('sections', [])
    data['reading_time'] = calculate_reading_time(sections)
    data['date_display'] = fmt_date(data['date'])

    slug = data['slug']
    output = f'blog/{slug}/index.html'
    nav_prefix = '../' * output.count('/')

    ctx = {
        'slug': slug,
        'nav_prefix': nav_prefix,
        'all_posts': all_posts or [],
        'post': data,
    }

    # key_takeaways renders before the body, cta and related after it,
    # wherever they sit in the YAML.
    key_takeaways_html = ''
    cta_html = ''
    related_html = ''
    body_blocks = []
    for block in sections:
        btype = block.get('type')
        if btype == 'key_takeaways':
            key_takeaways_html = render_block(block, ctx, env)
        elif btype == 'cta':
            cta_html = render_block(block, ctx, env)
        elif btype == 'related':
            related_html = render_block(block, ctx, env)
        else:
            body_blocks.append(render_block(block, ctx, env))

    hero = data.get('hero')
    hero_display = None
    if isinstance(hero, dict) and hero.get('src'):
        hero_display = dict(hero)
        hero_display['src'] = asset_href(hero['src'], nav_prefix)

    template = env.get_template('blog_post.html')
    article_html = template.render(
        title=data.get('title', ''),
        slug=slug,
        eyebrow=data.get('eyebrow', ''),
        dek=data.get('dek', ''),
        date=data.get('date', ''),
        date_display=data['date_display'],
        author=data.get('author', {}),
        hero=hero_display,
        reading_time=data['reading_time'],
        nav_prefix=nav_prefix,
        sections_html='\n\n'.join(body_blocks),
        key_takeaways_html=key_takeaways_html,
        cta_html=cta_html,
        related_html=related_html,
    )

    return article_html, data
