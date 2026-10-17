/* One post in Puck, drawn as the page it becomes: the site's header, the
   article with its blocks, the footer. Blocks down the left, the post in
   the middle, the selected block's fields or the post's settings on the
   right. */
import { useEffect, useMemo, useState } from "react";
import { createUsePuck, FieldLabel, Puck, useGetPuck } from "@puckeditor/core";
import { Site, useSite } from "../../src/components/parts.jsx";
import { Body } from "../../src/components/layout.jsx";
import { blocks as postBlocks, PostFrame, slugify as anchorOf } from "../../src/components/post.jsx";
import { htmlText } from "../../src/lib/util.js";
import { serialize, siteFrom } from "../lib/site.js";
import { fileLabel } from "../lib/labels.js";
import { keepUnedited, postHtml, POST_RICH } from "../lib/postrich.jsx";
import { apply, hubOptions, hubUrl, hubValue, postPath, postsList, postUrl, renamePost, slugFromUrl, slugProblem, tidyPostProps, videosList } from "../lib/posts.js";
import { go, session, useRepo } from "../state.js";
import { assetUrl, conform, guarded, imageField, place } from "./fields.jsx";
import { AddMenu, Middle, ordered, overrides, PREFIX, PUCK_IFRAME, SectionList, setCanvasContext, useExternal, useStable, VIEWPORTS } from "./Editor.jsx";

const usePuck = createUsePuck();
const ROOT = "root:default-zone";

// ------------------------------------------------------------ fields

const text = (label) => ({ type: "text", label });
const area = (label) => ({ type: "textarea", label });

function StatusInput({ value, onChange, readOnly }) {
  const parent = usePuck((s) => s.appState.data.root.props.parent);
  const canPublish = !!hubUrl(parent);
  return (
    <FieldLabel label="Status" el="div" readOnly={readOnly}>
      <div className="seg" role="group" aria-label="Status">
        <button type="button" aria-pressed={String(!!value)} onClick={() => onChange(true)}>
          Draft
        </button>
        <button type="button" aria-pressed={String(!value)} disabled={!canPublish && !!value} onClick={() => onChange(false)}>
          Published
        </button>
      </div>
    </FieldLabel>
  );
}

// The post's URL: /blog/ and the slug, applied on Enter or when it loses focus.
function PostUrlInput({ value, onChange, readOnly }) {
  const shown = postUrl(value || "");
  const [v, setV] = useState(shown);
  useEffect(() => setV(shown), [shown]);
  const next = slugFromUrl(v, "blog");
  const problem = next !== value ? slugProblem(session.repo, next, value, "post") : null;
  const apply = () => {
    if (next === value || problem) return;
    onChange(next);
  };
  return (
    <FieldLabel label="URL" el="div" readOnly={readOnly}>
      <input
        className={"input mono" + (problem ? " bad" : "")}
        value={v}
        readOnly={readOnly}
        onChange={(e) => setV(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === "Enter") apply();
          if (e.key === "Escape") setV(shown);
        }}
      />
      {problem ? <p className="ferr">{problem}</p> : null}
    </FieldLabel>
  );
}

const dateInput = (label, optional) => ({
  type: "custom",
  label,
  render: function DateInput({ value, onChange, readOnly }) {
    return (
      <FieldLabel label={label} el="div" readOnly={readOnly}>
        <input
          className="input mono"
          type="date"
          value={value || ""}
          readOnly={readOnly}
          onChange={(e) => {
            const d = e.target.value;
            if (d || optional) onChange(d);
          }}
        />
      </FieldLabel>
    );
  },
});

function AuthorInput({ value, onChange, readOnly }) {
  const a = value && typeof value === "object" ? value : {};
  return (
    <FieldLabel label="Author" el="div" readOnly={readOnly}>
      <input className="input" value={a.name || ""} readOnly={readOnly} onChange={(e) => onChange({ ...a, name: e.target.value })} />
    </FieldLabel>
  );
}

function HubInput({ value, onChange, readOnly }) {
  const draft = usePuck((s) => s.appState.data.root.props.draft);
  const opts = hubOptions(session.repo);
  const cur = hubUrl(value);
  const missing = cur && !opts.some((o) => o.value === cur);
  return (
    <FieldLabel label="Hub" el="div" readOnly={readOnly}>
      <select className="select" value={cur} disabled={readOnly} onChange={(e) => onChange(hubValue(e.target.value))}>
        <option value="" disabled={!draft}>
          None
        </option>
        {missing ? <option value={cur}>{cur}</option> : null}
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label} · {o.value}
          </option>
        ))}
      </select>
    </FieldLabel>
  );
}

export const postSettingsFields = {
  draft: { type: "custom", label: "Status", render: StatusInput },
  title: text("Title"),
  eyebrow: text("Eyebrow"),
  dek: area("Dek"),
  slug: { type: "custom", label: "URL", render: PostUrlInput },
  date: dateInput("Date"),
  last_updated: dateInput("Updated", true),
  author: { type: "custom", label: "Author", render: AuthorInput },
  parent: { type: "custom", label: "Hub", render: HubInput },
  hero: { type: "object", label: "Hero", objectFields: { src: imageField("Picture"), alt: area("Alt text") } },
  seo_title: text("SEO title"),
  meta_description: area("Meta description"),
  llms_description: area("llms.txt summary"),
};

// The Video block shows the post's own video, kept in the post's settings.
function PostVideoInput({ readOnly }) {
  const root = usePuck((s) => s.appState.data.root);
  const dispatch = usePuck((s) => s.dispatch);
  const cur = (root.props && root.props.video) || {};
  const vids = videosList(session.repo).filter((e) => e.v.id);
  const known = vids.some((e) => e.v.id === cur.id);
  const pick = (id) => {
    const e = vids.find((x) => x.v.id === id);
    const props = { ...root.props };
    if (e) props.video = { id: e.v.id, title: e.v.name };
    else delete props.video;
    dispatch({ type: "replaceRoot", root: { ...root, props } });
  };
  return (
    <FieldLabel label="Video" el="div" readOnly={readOnly}>
      <select className="select" value={cur.id || ""} disabled={readOnly} onChange={(e) => pick(e.target.value)}>
        <option value="">None</option>
        {cur.id && !known ? <option value={cur.id}>{cur.title || cur.id}</option> : null}
        {vids.map((e) => (
          <option key={e.slug} value={e.v.id}>
            {e.v.name}
          </option>
        ))}
      </select>
    </FieldLabel>
  );
}

function RelatedPostInput({ value, onChange, readOnly }) {
  const posts = postsList(session.repo);
  const known = posts.some((e) => e.p.slug === value);
  return (
    <FieldLabel label="Post" el="div" readOnly={readOnly}>
      <select className="select" value={value || ""} disabled={readOnly} onChange={(e) => onChange(e.target.value)}>
        <option value="" />
        {value && !known ? <option value={value}>{value}</option> : null}
        {posts.map((e) => (
          <option key={e.slug} value={e.p.slug}>
            {e.p.title || e.p.slug}
            {e.p.draft ? " · Draft" : ""}
          </option>
        ))}
      </select>
    </FieldLabel>
  );
}

// The blocks Add block offers, in this order. Chapters stays editable where
// a post has it.
export const POST_BLOCKS = ["Prose", "Subhead", "KeyTakeaways", "Figure", "Pullquote", "Aside", "StatCallout", "ComparisonTable", "DataViz", "Video", "PostCta", "RelatedPosts", "References", "Methodology"];

// What a new block starts with.
const STARTS = {
  Prose: { html: "" },
  Subhead: { text: "" },
  KeyTakeaways: { items: [{ text: "" }] },
  Figure: { src: "", alt: "", caption: "", source: "" },
  Pullquote: { text: "", attribution: "" },
  Aside: { title: "", html: "" },
  StatCallout: { number: "", label: "", source: "" },
  ComparisonTable: { title: "", columns: [{ text: "" }, { text: "" }], rows: [{ cells: [{ text: "" }, { text: "" }] }] },
  DataViz: { chart_type: "bar", title: "", data: [{ label: "", value: 1 }], caption: "", source: "" },
  Video: { caption: "" },
  PostCta: { headline: "", html: "", link: "/contact/", link_text: "Check a Date" },
  RelatedPosts: { posts: [] },
  References: { heading: "Sources", items: [{ text: "", url: "" }] },
  Methodology: { what_we_measured: "", sample: "", date_range: "", caveats: "" },
};

// Copy that is typed on the canvas as well as in the fields: only where the
// block shows the value as it is.
const ON_CANVAS = {
  Subhead: ["text"],
  Aside: ["title"],
  PostCta: ["headline", "link_text"],
  StatCallout: ["label", "source"],
  Pullquote: ["text"],
  Methodology: ["what_we_measured", "sample", "date_range", "caveats"],
};

function postComponents() {
  const out = guarded(postBlocks);
  for (const [name, c] of Object.entries(out)) {
    let fields = {};
    for (const [k, f] of Object.entries(c.fields || {})) {
      if (f.type === "richtext") fields[k] = { ...f, ...POST_RICH };
      else if ((ON_CANVAS[name] || []).includes(k)) fields[k] = { ...f, contentEditable: true };
      else fields[k] = f;
    }
    if (name === "Video") fields = { video: { type: "custom", label: "Video", render: PostVideoInput }, ...fields };
    if (name === "RelatedPosts") fields.posts = { ...fields.posts, getItemSummary: (p) => titleOf(p.slug), arrayFields: { slug: { type: "custom", label: "Post", render: RelatedPostInput } }, defaultItemProps: { slug: "" } };
    if (name === "KeyTakeaways") fields.items = { ...fields.items, getItemSummary: (it) => it.text, defaultItemProps: { text: "" } };
    if (name === "References") fields.items = { ...fields.items, defaultItemProps: { text: "", url: "" } };
    if (name === "DataViz") fields.data = { ...fields.data, defaultItemProps: { label: "", value: 1 } };
    const render = name === "Video" ? VideoOnCanvas(c.render) : name === "Subhead" ? SubheadOnCanvas(c.render) : c.render;
    out[name] = { ...c, fields, render };
  }
  return out;
}

// A subheading typed on the canvas takes its anchor from the stored words.
const SubheadOnCanvas = (R) =>
  function SubheadBlock(props) {
    const getPuck = useGetPuck();
    let words = typeof props.text === "string" ? props.text : "";
    try {
      const item = props.id ? getPuck().getItemById(props.id) : null;
      if (item && typeof item.props.text === "string") words = item.props.text;
    } catch {
      /* the props as given */
    }
    return <R {...props} anchor={props.anchor || anchorOf(words)} />;
  };

// A Video block whose post has no video yet still shows where it sits.
const VideoOnCanvas = (R) =>
  function VideoBlock(props) {
    const s = useSite();
    if (s && s.post && s.post.video && s.post.video.id) return <R {...props} />;
    return (
      <div className="blog-video">
        <div className="blog-video-frame" />
      </div>
    );
  };

const titleOf = (slug) => {
  const e = postsList(session.repo).find((x) => x.p.slug === slug);
  return e ? e.p.title : slug;
};

// The article on the canvas: the post's header and hero from its settings
// as they are edited, and its blocks in their order.
function PostRoot({ children, puck, editMode, id, ...p }) { // eslint-disable-line no-unused-vars
  const s = useSite();
  const content = usePuck((st) => st.appState.data.content);
  const m = s.model;
  const url = postUrl(p.slug || "");
  const hub = hubUrl(p.parent);
  let trail;
  try {
    trail = hub && m.LABELS[hub] ? [...m.crumbTrail(hub), [url, p.title || ""]] : m.crumbTrail(url, p.title || "");
  } catch {
    trail = null;
  }
  const ctx = { ...s, post: p, url, output: `blog/${p.slug}/index.html`, trail };
  return (
    <Site.Provider value={ctx}>
      <Body nav="" trail={trail} output={ctx.output} hubs={s.hubs} indexed>
        <PostFrame p={p} minutes={m.readingTime({ content })} content={content}>
          <div className="blog-body">{children}</div>
        </PostFrame>
      </Body>
    </Site.Provider>
  );
}

export const adminPostConfig = {
  root: { fields: postSettingsFields, render: PostRoot },
  components: postComponents(),
};

// A block's name in the list: its kind, and its first words.
function blockName(c, registry) {
  const def = registry[c.type];
  const kind = def ? def.label || c.type : c.type;
  const p = c.props || {};
  const first = [p.text, p.headline, p.title, p.number, p.heading, p.html, p.caption, p.alt, (p.items && p.items[0] && p.items[0].text) || ""].find((x) => typeof x === "string" && x.replace(/<[^>]+>/g, "").trim());
  const t = first ? htmlText(first).replace(/\s+/g, " ").trim() : "";
  return { kind, text: t.length > 60 ? t.slice(0, 57) + "…" : t };
}

// ------------------------------------------------------------ the editor

// The post's own copy as the file stores it.
function cleanPost(data, config) {
  const fix = (v, fields) => {
    if (Array.isArray(v)) return v.map((x) => fix(x, fields));
    if (!v || typeof v !== "object") return v;
    if (typeof v.type === "string" && v.props && config.components[v.type]) return { ...v, props: fix(v.props, config.components[v.type].fields) };
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      const f = fields && fields[k];
      if (f && f.type === "richtext") out[k] = postHtml(x);
      else if (f && f.type === "array") out[k] = Array.isArray(x) ? x.map((it) => fix(it, f.arrayFields)) : x;
      else if (f && f.type === "object") out[k] = fix(x, f.objectFields);
      else out[k] = x;
    }
    return out;
  };
  return { ...data, content: fix(data.content, null) };
}

// A block saved between being added and getting its starting props has
// only its id; it is still new, and keeps every prop it starts with.
const settled = (content) => content.filter((c) => Object.keys(c.props || {}).length > 1);

// Copy that reads as it did keeps its stored text.
function unedited(next, prev) {
  const before = new Map(prev.map((c) => [c.props.id, c]));
  return next.map((c) => {
    const old = before.get(c.props.id);
    const fields = (adminPostConfig.components[c.type] || {}).fields || {};
    if (!old || old.type !== c.type) return c;
    let props = c.props;
    for (const [k, f] of Object.entries(fields)) {
      if (f.type !== "richtext" || typeof props[k] !== "string") continue;
      const v = keepUnedited(old.props[k], props[k]);
      if (v !== props[k]) props = { ...props, [k]: v };
    }
    return props === c.props ? c : { ...c, props };
  });
}

function AddBlock({ config }) {
  const content = usePuck((s) => s.appState.data.content);
  const sel = usePuck((s) => s.appState.ui.itemSelector);
  const dispatch = usePuck((s) => s.dispatch);
  const groups = [{ title: "", items: POST_BLOCKS.map((name) => ({ name, label: config.components[name].label || name })) }];
  const pick = (type) => {
    const index = sel && sel.zone === ROOT ? sel.index + 1 : content.length;
    const id = `${type}-${crypto.randomUUID().slice(0, 8)}`;
    dispatch({ type: "insert", componentType: type, destinationIndex: index, destinationZone: ROOT, id });
    dispatch({ type: "replace", destinationIndex: index, destinationZone: ROOT, data: { type, props: { id, ...structuredClone(STARTS[type] || {}) } } });
    dispatch({ type: "setUi", ui: { itemSelector: { index, zone: ROOT } } });
  };
  return <AddMenu label="Add block" groups={groups} onPick={pick} />;
}

function RightHead({ config, status }) {
  const selected = usePuck((s) => s.selectedItem);
  const dispatch = usePuck((s) => s.dispatch);
  if (!selected)
    return (
      <div className="insp-head">
        <b>Post</b>
        <span className={"badge " + (status === "draft" ? "draft" : "live")}>{status === "draft" ? "Draft" : "Published"}</span>
      </div>
    );
  const def = config.components[selected.type];
  return (
    <div className="insp-head">
      <button className="btn ghost sm" onClick={() => dispatch({ type: "setUi", ui: { itemSelector: null } })} aria-label="Back">
        ‹
      </button>
      <b>{def ? def.label || selected.type : selected.type}</b>
    </div>
  );
}

function Layout({ config, url, status }) {
  return (
    <div className="pe">
      <aside className="pe-left">
        <div className="insp-label">Blocks</div>
        <SectionList config={config} name={blockName} />
        <div className="add-row">
          <AddBlock config={config} />
        </div>
      </aside>
      <Middle url={url} />
      <aside className="pe-right">
        <RightHead config={config} status={status} />
        <Puck.Fields />
      </aside>
    </div>
  );
}

export function PostEditor({ slug }) {
  const rev = useRepo();
  const repo = session.repo;
  const path = postPath(slug);
  const k = useExternal(path);
  const doc = repo.json(path);
  const site = useMemo(() => {
    try {
      return siteFrom(repo);
    } catch (e) {
      return { error: e };
    }
  }, [rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const initial = useMemo(() => (doc ? structuredClone(doc) : null), [k, slug, !!doc]); // eslint-disable-line react-hooks/exhaustive-deps
  const onChange = useStable((data) => {
    const cur = repo.json(path);
    if (!cur) return;
    const c = cleanPost(data, adminPostConfig);
    const { puck, editMode, children, id, ...rp } = c.root.props || {}; // eslint-disable-line no-unused-vars
    const base = repo.base(path);
    const props = tidyPostProps(cur.root.props, ordered(cur.root.props, rp), base ? JSON.parse(base).root.props : null);
    const next = ordered(cur, { ...cur, root: { ...cur.root, props }, content: unedited(conform(c.content, settled(cur.content), adminPostConfig), cur.content) });
    if (props.slug && props.slug !== cur.root.props.slug && !slugProblem(repo, props.slug, cur.root.props.slug, "post")) {
      apply(repo, renamePost(repo, slug, next));
      go("post", props.slug);
      return;
    }
    if (serialize(next) !== repo.get(path)) repo.set(path, serialize(next), "editor");
  });
  if (!doc)
    return (
      <div className="screen">
        <p className="muted">No such post</p>
      </div>
    );
  if (site.error)
    return (
      <div className="screen">
        <p className="warn-line">{String(site.error.message)}</p>
      </div>
    );
  const p = doc.root.props;
  place.slug = null;
  place.label = fileLabel(path, repo.get(path));
  const ctx = { model: site.m, hubs: site.hubs, built: site.built, prefix: PREFIX, output: `blog/${p.slug}/index.html`, url: postUrl(p.slug), trail: null, indexed: true, post: p, assetUrl };
  setCanvasContext(ctx);
  return (
    <Site.Provider value={ctx}>
      <Puck key={slug + ":" + k} config={adminPostConfig} data={initial} onChange={onChange} viewports={VIEWPORTS} iframe={PUCK_IFRAME} overrides={overrides()}>
        <Layout config={adminPostConfig} url={p.draft ? null : postUrl(p.slug)} status={p.draft ? "draft" : "live"} />
      </Puck>
    </Site.Provider>
  );
}

