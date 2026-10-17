/* Layouts: the act card, act page, post, post card and video page. Each one
   is a list of parts that can be switched off and dragged into order, and
   the image ratios, drawn by the site's own components as they change. */
import { useState } from "react";
import { STAGING_URL } from "../config.js";
import { LAYOUT_FILES, layoutOf } from "../../src/lib/layouts.js";
import { CardGrid } from "../../src/components/blocks.jsx";
import { PostArticle, blocks as postBlocks } from "../../src/components/post.jsx";
import { BlogPosts, WatchPage } from "../../src/components/generated.jsx";
import { Body } from "../../src/components/layout.jsx";
import { ACT_LAYOUT, pageContext, serialize } from "../lib/site.js";
import { go, session, useRepo, useUi } from "../state.js";
import { Field, Seg, TextIn, Toggle, useDragRows } from "./common.jsx";
import { assetUrl } from "./fields.jsx";
import { useSite } from "./Acts.jsx";
import { SiteFrame, WIDTHS } from "./Preview.jsx";

const PREFIX = STAGING_URL + "/";
export const layoutPath = (key) => `content/layouts/${LAYOUT_FILES[key]}`;

export const LAYOUTS = {
  card: { name: "Act card", kind: "act" },
  actPage: { name: "Act page", kind: "act" },
  post: { name: "Post", kind: "post" },
  postCard: { name: "Post card", kind: "post" },
  video: { name: "Video page", kind: "video" },
};

export const PART_LABEL = {
  card: { media: "Image", kind: "Style line", name: "Name", face: "Lineup", tags: "Tags", blurb: "Description", sizes: "Size range", link: "Link" },
  post: { eyebrow: "Eyebrow", title: "Title", dek: "Dek", byline: "Byline", hero: "Hero", contents: "Contents" },
  postCard: { photo: "Photo", eyebrow: "Eyebrow", date: "Date", time: "Reading time", title: "Title", dek: "Dek" },
  video: { style: "Style line", title: "Title", player: "Video", description: "Description", buttons: "Buttons", more: "More videos" },
};

const ratios = (list) => list.map((r) => ({ value: r, label: r.replace(/\s*\/\s*/, ":") }));

// ------------------------------------------------------------ the list

export function LayoutsScreen() {
  useRepo();
  const site = useSite();
  const pending = useUi((s) => s.pendingPaths);
  if (site.error) return <div className="screen"><p className="warn-line">{String(site.error.message)}</p></div>;
  const m = site.m;
  const used = {
    card: `${m.ACTS.length} acts`,
    actPage: `${m.pages.filter((d) => m.usesLayout(d)).length} pages`,
    post: `${m.published.length} posts`,
    postCard: `${m.published.length} posts`,
    video: `${m.FOOTAGE.length} pages`,
  };
  const changed = (path) => pending && pending.has(path);
  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Layouts</h1>
      </div>
      <div className="lay-cards">
        {Object.entries(LAYOUTS).map(([id, l]) => (
          <button key={id} className="lay-card" onClick={() => (id === "actPage" ? go("layout") : go("layouts", id))}>
            <b>{l.name}</b>
            <p>{used[id]}</p>
            {changed(id === "actPage" ? ACT_LAYOUT : layoutPath(id)) ? <span className="badge wait">Changed</span> : null}
          </button>
        ))}
        <button className="lay-card" onClick={() => go("styles")}>
          <b>Site styles</b>
          <p>All pages</p>
          {changed("content/styles.json") ? <span className="badge wait">Changed</span> : null}
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ one layout

// Write a layout: the file keeps its own key order, and one that doesn't
// exist yet is written whole.
function writeLayout(key, next) {
  const repo = session.repo;
  const path = layoutPath(key);
  const stored = repo.json(path);
  let out = next;
  if (stored) {
    out = {};
    for (const k of Object.keys(stored)) if (k in next) out[k] = next[k];
    for (const k of Object.keys(next)) if (!(k in out)) out[k] = next[k];
  }
  const text = serialize(out);
  if (text !== repo.get(path)) repo.set(path, text, "layouts");
}

export function LayoutForm({ id }) {
  useRepo();
  const site = useSite();
  const meta = LAYOUTS[id];
  const [device, setDevice] = useState("desktop");
  const [subject, setSubject] = useState(null);
  const [short, setShort] = useState(false);
  const L = layoutOf(session.repo.json(layoutPath(id)), id);
  const set = (patch) => writeLayout(id, { ...L, ...patch });
  const move = (from, to) => {
    if (to < 0 || to >= L.parts.length || from === to) return;
    const parts = L.parts.slice();
    const [x] = parts.splice(from, 1);
    parts.splice(to, 0, x);
    set({ parts });
  };
  const drag = useDragRows(move);
  if (!meta || id === "actPage") return <div className="screen"><p className="muted">No such layout</p></div>;
  if (site.error) return <div className="screen"><p className="warn-line">{String(site.error.message)}</p></div>;
  const m = site.m;
  const labels = PART_LABEL[id];

  const subjects =
    meta.kind === "act"
      ? m.ACTS.map((a) => ({ value: a.id, label: a.name }))
      : meta.kind === "post"
        ? m.published.map((d) => ({ value: d.root.props.slug, label: d.root.props.title }))
        : m.FOOTAGE.map((v) => ({ value: v.slug, label: v.name }));
  const pick = subjects.some((s) => s.value === subject) ? subject : subjects[0] && subjects[0].value;

  return (
    <div className="screen act-screen">
      <div className="edit-head">
        <h1>{meta.name}</h1>
        <span className="badge layout">Layout</span>
      </div>
      <div className="split">
        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2>Parts</h2>
            </div>
            <div className="panel-body">
              <div className="listed">
                {L.parts.map((p, i) => (
                  <div key={p.id} className={"item part" + (p.on ? "" : " off") + (drag.over(i, "parts") ? " dragover" : "")} {...drag.row(i, "parts")}>
                    <span className="handle" tabIndex={0} aria-label={`Move ${labels[p.id]}`} {...drag.handle(i, "parts")}>
                      ⋮⋮
                    </span>
                    <span className="lbl">{labels[p.id]}</span>
                    <Toggle checked={p.on} onChange={(on) => set({ parts: L.parts.map((x, j) => (j === i ? { ...x, on } : x)) })} />
                  </div>
                ))}
              </div>
            </div>
          </section>
          {id === "video" ? null : (
            <section className="panel">
              <div className="panel-head">
                <h2>Details</h2>
              </div>
              <div className="panel-body">
                {id === "card" ? (
                  <>
                    <div className="field">
                      <span className="flabel">Image ratio</span>
                      <Seg sm options={ratios(["16 / 9", "3 / 2", "4 / 3", "1 / 1", "4 / 5"])} value={L.ratio} onChange={(v) => set({ ratio: v })} />
                    </div>
                    <div className="field">
                      <span className="flabel">Description</span>
                      <Seg sm options={[{ value: "full", label: "Full" }, { value: "short", label: "Short" }]} value={L.blurb} onChange={(v) => set({ blurb: v })} />
                    </div>
                    <div className="field">
                      <span className="flabel">Tags</span>
                      <Seg sm options={[{ value: "buckets", label: "Kind of night" }, { value: "occasions", label: "Occasion" }]} value={L.tags} onChange={(v) => set({ tags: v })} />
                    </div>
                    <Field label="Link text">
                      <TextIn value={L.link} onChange={(v) => set({ link: v })} />
                    </Field>
                  </>
                ) : null}
                {id === "post" ? (
                  <div className="field">
                    <span className="flabel">Hero ratio</span>
                    <Seg sm options={ratios(["16 / 9", "3 / 2", "21 / 9", "4 / 3"])} value={L.heroRatio} onChange={(v) => set({ heroRatio: v })} />
                  </div>
                ) : null}
                {id === "postCard" ? (
                  <div className="field">
                    <span className="flabel">Image ratio</span>
                    <Seg sm options={ratios(["16 / 9", "3 / 2", "4 / 3", "1 / 1"])} value={L.ratio} onChange={(v) => set({ ratio: v })} />
                  </div>
                ) : null}
              </div>
            </section>
          )}
        </div>
        <aside className="preview-col">
          <div className="prev-tools">
            <select className="select" style={{ width: "auto", maxWidth: "100%" }} aria-label="Preview with" value={pick || ""} onChange={(e) => setSubject(e.target.value)}>
              {subjects.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            {id === "card" ? <Seg sm options={[{ value: false, label: "Full" }, { value: true, label: "Short" }]} value={short} onChange={setShort} /> : null}
            <Seg sm options={[{ value: "desktop", label: "Desktop" }, { value: "phone", label: "Phone" }]} value={device} onChange={setDevice} />
          </div>
          <div className={"prev-frame " + device}>
            <LayoutPreview id={id} site={site} subject={pick} device={device} short={short} />
          </div>
        </aside>
      </div>
    </div>
  );
}

// The layout drawn with one act, post or video, by the site's components.
function LayoutPreview({ id, site, subject, device, short }) {
  const m = site.m;
  const width = WIDTHS[device];
  if (id === "card") {
    const first = m.ACT_BY_ID[subject] || m.ACTS[0];
    const acts = [first, ...m.ACTS.filter((a) => a !== first)].slice(0, 3);
    const roster = m.pages.find((d) => d.content.some((c) => c.type === "Roster")) || m.pages[0];
    const ctx = pageContext(site, roster, { prefix: PREFIX, assetUrl });
    return (
      <SiteFrame key={"card-" + device} ctx={ctx} width={width} height={device === "phone" ? 1800 : 900} label="Act card">
        <main id="main">
          <section className="section section--ruled">
            <div className="wrap">
              <CardGrid acts={acts} compact={short} />
            </div>
          </section>
        </main>
      </SiteFrame>
    );
  }
  if (id === "post" || id === "postCard") {
    const doc = m.postBySlug[subject] || m.published[0];
    if (!doc) return null;
    const p = doc.root.props;
    if (id === "post") {
      const synth = { root: { props: { path: `/blog/${p.slug}/`, title: p.title, robots: p.robots } }, content: [] };
      const ctx = { ...pageContext(site, synth, { prefix: PREFIX, assetUrl }), post: p };
      return (
        <SiteFrame key={"post-" + device} ctx={ctx} width={width} height={device === "phone" ? 1600 : 1300} label="Post">
          <Body nav="" trail={null} output={`blog/${p.slug}/index.html`} hubs={site.hubs} indexed={false}>
            <PostArticle doc={doc} />
          </Body>
        </SiteFrame>
      );
    }
    // The blog list, and the related posts block, with this post first.
    const blog = m.pages.find((d) => d.content.some((c) => (c.props.blocks || []).some((b) => b.type === "BlogPosts"))) || m.pages.find((d) => d.root.props.path === "/blog/");
    const ctx = pageContext(site, blog || { root: { props: { path: "/blog/" } }, content: [] }, { prefix: PREFIX, assetUrl });
    const others = m.published.filter((d) => d !== doc).slice(0, 2);
    const listModel = { ...m, published: [doc, ...others] };
    const Related = postBlocks.RelatedPosts.render;
    const Blog = BlogPosts.render;
    return (
      <SiteFrame key={"postcard-" + device} ctx={{ ...ctx, model: listModel }} width={width} height={device === "phone" ? 1900 : 1250} label="Post card">
        <main id="main">
          <section className="section section--ruled">
            <div className="wrap">
              <Blog />
            </div>
          </section>
          <section className="section section--ruled">
            <div className="wrap">
              <Related posts={[doc, ...others].map((d) => ({ slug: d.root.props.slug }))} />
            </div>
          </section>
        </main>
      </SiteFrame>
    );
  }
  const v = m.FOOTAGE.find((x) => x.slug === subject) || m.FOOTAGE[0];
  if (!v) return null;
  const synth = { root: { props: { path: `/video/${v.slug}/`, title: v.name } }, content: [] };
  const ctx = pageContext(site, synth, { prefix: PREFIX, assetUrl });
  return (
    <SiteFrame key={"video-" + device} ctx={ctx} width={width} height={device === "phone" ? 1300 : 1100} label="Video page">
      <main id="main">
        <WatchPage v={v} />
      </main>
    </SiteFrame>
  );
}
