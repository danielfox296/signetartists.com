/* Editing in Puck: a page's sections, or one shared part, on the site's own
   components and stylesheet. Sections down the left, the page in the
   middle at desktop or phone width, fields on the right. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createUsePuck, FieldLabel, Puck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import { Site, useSite } from "../../src/components/parts.jsx";
import { Item } from "../../src/components/registry.jsx";
import { Footer, Header } from "../../src/components/layout.jsx";
import { fixedSections } from "../../src/components/sections.jsx";
import { STAGING_URL } from "../config.js";
import { ACT_LAYOUT, pageContext, pagePath, serialize, siteFrom } from "../lib/site.js";
import { pageConfig } from "../../src/components/config.jsx";
import { sectionName } from "../lib/diff.js";
import { go, session, useRepo } from "../state.js";
import { Badge, kindOf, Toggle, useOutside } from "./common.jsx";
import { adminPageConfig, assetUrl, clean, conform, guarded, imageField, newItem, place } from "./fields.jsx";
import { writePage } from "./Pages.jsx";
import { fileLabel } from "../lib/labels.js";

const usePuck = createUsePuck();
const ROOT = "root:default-zone";
export const PREFIX = STAGING_URL + "/";

export const VIEWPORTS = [
  { width: 1280, height: "auto", label: "Desktop", icon: "Monitor" },
  { width: 390, height: "auto", label: "Phone", icon: "Smartphone" },
];


// The site's stylesheet, inside the canvas only, and each photo's crop
// point the way the build applies it.
function Canvas({ children, document: d }) {
  useEffect(() => {
    if (!d || d.getElementById("signet-css")) return;
    const l = d.createElement("link");
    l.id = "signet-css";
    l.rel = "stylesheet";
    l.href = PREFIX + "styles.css";
    d.head.appendChild(l);
    const st = d.createElement("style");
    st.textContent = "html{scroll-behavior:auto} body{background:#14130e}";
    d.head.appendChild(st);
  }, [d]);
  useEffect(() => {
    if (!d) return;
    const focus = (session.repo && session.repo.json("content/photo-focus.json")) || {};
    const apply = () => {
      for (const img of d.querySelectorAll("img")) {
        const src = (img.getAttribute("src") || "").replace(PREFIX, "").replace(/^\/+/, "").split("?")[0];
        const pos = focus[src];
        if (pos && img.style.objectPosition !== pos) img.style.objectPosition = pos;
      }
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(d.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
    return () => mo.disconnect();
  }, [d]);
  return <CanvasContext>{children}</CanvasContext>;
}

// Puck renders the canvas through a portal: the site context is passed in again.
let currentCtx = null;
export const setCanvasContext = (ctx) => {
  currentCtx = ctx;
};
function CanvasContext({ children }) {
  return <Site.Provider value={currentCtx}>{children}</Site.Provider>;
}

// Puck's props stay the same objects from render to render: a new
// overrides object makes Puck rebuild the canvas, and the copy being typed
// loses focus after one letter.
export const PUCK_IFRAME = { enabled: true, waitForStyles: false };
let OVERRIDES = null;
export const overrides = () => (OVERRIDES ||= { iframe: Canvas, componentOverlay: Overlay });
// An onChange whose identity never changes, calling the latest handler.
export function useStable(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...a) => ref.current(...a), []);
}

function Overlay({ children, componentType, isSelected, hover }) {
  return <div className={"k-overlay k-" + kindOf(componentType) + (isSelected ? " sel" : "") + (hover ? " hov" : "")}>{children}</div>;
}

// ------------------------------------------------------------ left column

export function SectionList({ config, name = sectionName }) {
  const content = usePuck((s) => s.appState.data.content);
  const sel = usePuck((s) => s.appState.ui.itemSelector);
  const selected = usePuck((s) => s.selectedItem);
  const getSelector = usePuck((s) => s.getSelectorForId);
  const dispatch = usePuck((s) => s.dispatch);
  const list = useRef(null);
  const [drag, setDrag] = useState(null); // {from, to}
  // The top-level section the selection sits in.
  let top = sel && sel.zone === ROOT ? sel.index : null;
  if (top == null && selected) {
    const ids = new Set(content.map((c) => c.props.id));
    let id = selected.props.id;
    for (let i = 0; i < 20 && id && !ids.has(id); i++) {
      const s = getSelector(id);
      id = s && s.zone ? s.zone.split(":")[0] : null;
    }
    top = id ? content.findIndex((c) => c.props.id === id) : null;
  }
  const pick = (i) => {
    dispatch({ type: "setUi", ui: { itemSelector: { index: i, zone: ROOT } } });
    const id = content[i] && content[i].props.id;
    const frame = document.querySelector(".pe-canvas iframe");
    const doc = frame && frame.contentDocument;
    const el = doc && doc.querySelector(`[data-puck-component="${id}"]`);
    if (el) el.scrollIntoView({ block: "start" });
  };
  const move = (from, to) => {
    if (to < 0 || to >= content.length || from === to) return;
    dispatch({ type: "reorder", sourceIndex: from, destinationIndex: to, destinationZone: ROOT });
    dispatch({ type: "setUi", ui: { itemSelector: { index: to, zone: ROOT } } });
  };
  // Drag with the pointer: rows move once it has travelled a few pixels.
  const down = (i) => (e) => {
    if (e.button !== 0) return;
    // On a touch screen only the handle drags; the rest of the row scrolls.
    if (e.pointerType === "touch" && !e.target.closest(".handle")) {
      const off = () => (window.removeEventListener("pointerup", end), window.removeEventListener("pointercancel", off));
      const end = () => (off(), pick(i));
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", off);
      return;
    }
    const y0 = e.clientY;
    let moved = false;
    const rows = [...list.current.querySelectorAll("[data-row]")].map((el) => el.getBoundingClientRect());
    const at = (y) => {
      let t = rows.findIndex((r) => y < r.top + r.height / 2);
      if (t === -1) t = rows.length;
      return t > i ? t - 1 : t;
    };
    const mv = (ev) => {
      if (!moved && Math.abs(ev.clientY - y0) < 5) return;
      moved = true;
      setDrag({ from: i, to: at(ev.clientY) });
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      setDrag(null);
      if (moved) move(i, at(ev.clientY));
      else pick(i);
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };
  return (
    <div className="layers" ref={list}>
      <button className="layer" onClick={() => go("header")}>
        <span className="kdot shared" />
        <span className="t">Header</span>
      </button>
      {content.map((c, i) => {
        const n = name(c, config.components);
        const target = drag && drag.to === i && drag.from !== i;
        return (
          <div
            key={c.props.id}
            data-row
            className={"layer" + (top === i ? " sel" : "") + (c.props.hidden ? " off" : "") + (drag && drag.from === i ? " dragging" : "") + (target ? (drag.to > drag.from ? " dropafter" : " dragover") : "")}
            onPointerDown={down(i)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter") pick(i);
              if (e.altKey && e.key === "ArrowUp") (e.preventDefault(), move(i, i - 1));
              if (e.altKey && e.key === "ArrowDown") (e.preventDefault(), move(i, i + 1));
            }}
          >
            <span className={"kdot " + kindOf(c.type)} />
            <span className="t" title={n.text || n.kind}>
              {n.text || n.kind}
            </span>
            <span className="handle" aria-hidden="true">
              ⋮⋮
            </span>
          </div>
        );
      })}
      <button className="layer" onClick={() => go("footer")}>
        <span className="kdot shared" />
        <span className="t">Footer</span>
      </button>
    </div>
  );
}

export function AddMenu({ label, groups, onPick }) {
  const [at, setAt] = useState(null);
  const [q, setQ] = useState("");
  const ref = useOutside(() => setAt(null));
  const btn = useRef(null);
  const items = groups.flatMap((g) => g.items.map((it) => ({ ...it, group: g.title }))).filter((it) => !q || it.label.toLowerCase().includes(q.toLowerCase()));
  const toggle = () => {
    if (at) return setAt(null);
    const r = btn.current.getBoundingClientRect();
    const h = Math.min(380, window.innerHeight - 24);
    const top = r.bottom + 6 + h > window.innerHeight ? Math.max(12, r.top - 6 - h) : r.bottom + 6;
    setAt({ left: Math.max(8, r.left), top, maxHeight: h });
  };
  return (
    <div className="add-wrap" ref={ref}>
      <button ref={btn} className="btn sm add-btn" onClick={toggle}>
        + {label}
      </button>
      {at ? (
        <div className="popover" style={at}>
          <input className="input" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="pop-list">
            {items.map((it) => (
              <div
                key={it.name}
                className="pop-item"
                role="button"
                tabIndex={0}
                onClick={() => {
                  setAt(null);
                  setQ("");
                  onPick(it.name);
                }}
              >
                <b>
                  <span className={"kdot " + kindOf(it.name)} /> {it.label}
                </b>
                <small>{it.group}</small>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Insert, then fill in the starting props (see newItem in fields.jsx).
function insertNew(dispatch, type, index, zone) {
  const id = `${type}-${crypto.randomUUID().slice(0, 8)}`;
  dispatch({ type: "insert", componentType: type, destinationIndex: index, destinationZone: zone, id });
  dispatch({ type: "replace", destinationIndex: index, destinationZone: zone, data: newItem(type, id) });
  dispatch({ type: "setUi", ui: { itemSelector: { index, zone } } });
}

function AddSection({ config }) {
  const content = usePuck((s) => s.appState.data.content);
  const sel = usePuck((s) => s.appState.ui.itemSelector);
  const dispatch = usePuck((s) => s.dispatch);
  const cats = config.categories || {};
  const groups = ["sections", "parts", "other"]
    .filter((k) => cats[k])
    .map((k) => ({ title: cats[k].title, items: cats[k].components.map((name) => ({ name, label: config.components[name].label || name })) }));
  const pick = (name) => {
    const at = sel && sel.zone === ROOT ? sel.index + 1 : content.length;
    insertNew(dispatch, name, at, ROOT);
  };
  return <AddMenu label="Add section" groups={groups} onPick={pick} />;
}

// Blocks go into the selected section, or after the selected block.
function AddBlock({ config }) {
  const selected = usePuck((s) => s.selectedItem);
  const sel = usePuck((s) => s.appState.ui.itemSelector);
  const dispatch = usePuck((s) => s.dispatch);
  if (!selected) return null;
  const slotOf = (item) => {
    const f = config.components[item.type] && config.components[item.type].fields;
    const k = f && Object.keys(f).find((x) => f[x].type === "slot");
    return k ? { zone: `${item.props.id}:${k}`, size: (item.props[k] || []).length } : null;
  };
  let target = slotOf(selected);
  if (!target && sel && sel.zone && sel.zone !== ROOT) target = { zone: sel.zone, size: sel.index + 1 };
  if (!target) return null;
  const cats = config.categories || {};
  const groups = cats.blocks ? [{ title: cats.blocks.title, items: cats.blocks.components.map((name) => ({ name, label: config.components[name].label || name })) }] : [];
  const pick = (name) => {
    insertNew(dispatch, name, target.size, target.zone);
  };
  return <AddMenu label="Add block" groups={groups} onPick={pick} />;
}

// ------------------------------------------------------------ middle

// The width the canvas is drawn at: the admin's own, kept across pages.
const viewStore = { width: 1280, subs: new Set() };
function useViewWidth() {
  const [w, setW] = useState(viewStore.width);
  useEffect(() => {
    viewStore.subs.add(setW);
    return () => viewStore.subs.delete(setW);
  }, []);
  return [w, (x) => ((viewStore.width = x), viewStore.subs.forEach((f) => f(x)))];
}

function ViewTools({ url, act }) {
  const [current, setW] = useViewWidth();
  return (
    <div className="prev-tools">
      <div className="seg" role="group" aria-label="View">
        {VIEWPORTS.map((v) => (
          <button key={v.label} aria-pressed={String(current === v.width)} onClick={() => setW(v.width)}>
            {v.label}
          </button>
        ))}
      </div>
      {url ? (
        <a className="prev-url mono" href={STAGING_URL + url} target="_blank" rel="noreferrer">
          {url}
        </a>
      ) : null}
      {act ? (
        <button className="btn ghost sm" onClick={() => go("act", act)}>
          Edit act
        </button>
      ) : null}
    </div>
  );
}

// The canvas is drawn at the view's real width and scaled to fit, so
// desktop shows the desktop layout on any screen.
export function Middle({ url, act }) {
  const [width] = useViewWidth();
  const box = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const phone = width < 768;
  const scale = size.w && width > size.w ? size.w / width : 1;
  return (
    <div className="pe-mid">
      <ViewTools url={url} act={act} />
      <div className={"pe-stage" + (phone ? " phone" : "")} ref={box}>
        <div className="pe-canvas" style={{ width, height: scale < 1 ? size.h / scale : "100%", transform: scale < 1 ? `scale(${scale})` : undefined }}>
          <Puck.Preview />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ right column

function RightHead({ title, kind, config }) {
  const selected = usePuck((s) => s.selectedItem);
  const dispatch = usePuck((s) => s.dispatch);
  if (!selected)
    return (
      <div className="insp-head">
        <b>{title}</b>
        <Badge kind={kind} />
      </div>
    );
  const def = config.components[selected.type];
  const k = kindOf(selected.type);
  return (
    <div className="insp-head">
      <button className="btn ghost sm" onClick={() => dispatch({ type: "setUi", ui: { itemSelector: null } })} aria-label="Back">
        ‹
      </button>
      <b>{def ? def.label || selected.type : selected.type}</b>
      <Badge kind={k} />
    </div>
  );
}

// ------------------------------------------------------------ the editor

function SharedList({ which }) {
  return (
    <div className="layers">
      {Object.entries(SHARED).map(([k, s]) => (
        <button key={k} className={"layer" + (k === which ? " sel" : "")} onClick={() => go(k)}>
          <span className="kdot shared" />
          <span className="t">{s.title}</span>
        </button>
      ))}
    </div>
  );
}

function Layout({ config, title, kind, url, shared, top, act }) {
  return (
    <div className="pe">
      <aside className="pe-left">
        {top}
        <div className="insp-label">{shared ? "Shared" : "Sections"}</div>
        {shared ? <SharedList which={shared} /> : <SectionList config={config} />}
        {shared ? null : (
          <div className="add-row">
            <AddSection config={config} />
            <AddBlock config={config} />
          </div>
        )}
      </aside>
      <Middle url={url} act={act} />
      <aside className="pe-right">
        <RightHead title={title} kind={kind} config={config} />
        <Puck.Fields />
      </aside>
    </div>
  );
}

// Re-read the file into Puck when it changes from outside (a merge, a revert).
export function useExternal(path) {
  const [k, setK] = useState(0);
  useEffect(
    () =>
      session.repo.subscribe((ev) => {
        if ((ev.remote && ev.remote.includes(path) && !session.repo.st.local.has(path)) || (ev.edit === path && ev.source !== "editor")) setK((x) => x + 1);
      }),
    [path]
  );
  return k;
}

export const ordered = (orig, next) => {
  const out = {};
  for (const k of Object.keys(orig)) if (k in next) out[k] = next[k];
  for (const k of Object.keys(next)) if (!(k in out)) out[k] = next[k];
  return out;
};

export function PageEditor({ slug }) {
  const rev = useRepo();
  const repo = session.repo;
  const path = pagePath(slug);
  const k = useExternal(path);
  const doc = repo.json(path);
  // The model is rebuilt as content changes elsewhere; the open page's own
  // edits reach the canvas through Puck.
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
    const c = clean(data, adminPageConfig);
    const next = ordered(cur, { ...cur, root: { ...cur.root, props: ordered(cur.root.props, c.root.props) }, content: conform(c.content, cur.content, adminPageConfig) });
    if (serialize(next) !== repo.get(path)) writePage(slug, next, "editor");
  });
  if (!doc) return <div className="screen"><p className="muted">No such page</p></div>;
  if (site.error) return <div className="screen"><p className="warn-line">{String(site.error.message)}</p></div>;
  const p = doc.root.props;
  place.slug = slug;
  place.label = fileLabel(path, repo.get(path));
  currentCtx = pageContext(site, doc, { prefix: PREFIX, assetUrl });
  return (
    <Site.Provider value={currentCtx}>
      <Puck
        key={slug + ":" + k}
        config={adminPageConfig}
        data={initial}
        onChange={onChange}
        viewports={VIEWPORTS}
        iframe={PUCK_IFRAME}
        overrides={overrides()}
      >
        <Layout config={adminPageConfig} title={place.label} kind="page" url={p.path} act={(site.m.ACT_BY_URL[p.path] || {}).id} />
      </Puck>
    </Site.Provider>
  );
}

// ------------------------------------------------------------ layouts

// The act page layout: the sections every page on it shows, drawn with one
// act's details, and where each act's own sections go.
// A layout section can be switched off: it stays in the layout, faded on
// the canvas, and the act pages leave it out.
function ShownInput({ value, onChange, readOnly }) {
  return (
    <FieldLabel label="Shown" el="div" readOnly={readOnly}>
      <Toggle checked={!value} onChange={(on) => onChange(on ? undefined : true)} />
    </FieldLabel>
  );
}
const switchable = (c) => ({
  ...c,
  fields: { hidden: { type: "custom", label: "Shown", render: ShownInput }, ...c.fields },
  render: function LayoutSection(props) {
    const R = c.render;
    return props.hidden ? (
      <div style={{ opacity: 0.35 }}>
        <R {...props} />
      </div>
    ) : (
      <R {...props} />
    );
  },
});
const layoutConfig = {
  ...adminPageConfig,
  components: Object.fromEntries(Object.entries(adminPageConfig.components).map(([name, c]) => [name, name === "ActOwn" ? c : switchable(c)])),
  root: { fields: {}, render: pageConfig.root.render },
  categories: { ...adminPageConfig.categories, other: { title: "Other", components: ["ActOwn", "CustomHtml"] } },
};

let layoutAct = null;
export function LayoutEditor() {
  const rev = useRepo();
  const repo = session.repo;
  const k = useExternal(ACT_LAYOUT);
  const doc = repo.json(ACT_LAYOUT);
  const site = useMemo(() => {
    try {
      return siteFrom(repo);
    } catch (e) {
      return { error: e };
    }
  }, [rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const acts = site.error ? [] : site.m.ALL_ACTS;
  const usesIt = acts.find((a) => a.page && site.m.usesLayout(site.m.pageByUrl["/" + a.page]));
  const [actId, setActId] = useState(layoutAct || (usesIt || acts[0] || {}).id);
  const initial = useMemo(() => (doc ? structuredClone(doc) : null), [k, actId, !!doc]); // eslint-disable-line react-hooks/exhaustive-deps
  const onChange = useStable((data) => {
    const cur = repo.json(ACT_LAYOUT);
    if (!cur) return;
    const c = clean(data, layoutConfig);
    const next = ordered(cur, { ...cur, content: conform(c.content, cur.content, layoutConfig) });
    if (serialize(next) !== repo.get(ACT_LAYOUT)) repo.set(ACT_LAYOUT, serialize(next), "editor");
  });
  if (!doc) return <div className="screen"><p className="muted">No act page layout</p></div>;
  if (site.error) return <div className="screen"><p className="warn-line">{String(site.error.message)}</p></div>;
  const a = site.m.ACT_BY_ID[actId] || acts[0];
  const path = a && a.page ? "/" + a.page : "/artists/act/";
  const synth = { root: { props: { path, title: a ? a.name : "", nav: "music", layout: "act", schema: { act: a ? a.id : "" } } }, content: [] };
  place.slug = null;
  place.label = "Act page layout";
  currentCtx = pageContext(site, synth, { prefix: PREFIX, assetUrl });
  const pick = (
    <label className="field layout-act">
      <span className="insp-label">Act</span>
      <select
        className="select"
        value={a ? a.id : ""}
        onChange={(e) => {
          layoutAct = e.target.value;
          setActId(e.target.value);
        }}
      >
        {acts.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <Site.Provider value={currentCtx}>
      <Puck key={"layout:" + k + ":" + (a ? a.id : "")} config={layoutConfig} data={initial} onChange={onChange} viewports={VIEWPORTS} iframe={PUCK_IFRAME} overrides={overrides()}>
        <Layout config={layoutConfig} title="Act page" kind="layout" url={null} top={pick} />
      </Puck>
    </Site.Provider>
  );
}

// ------------------------------------------------------------ shared parts

const text = (label) => ({ type: "text", label });
const link = (styles) => ({
  label: text("Label"),
  href: text("Link"),
  ...(styles ? { cls: { type: "select", label: "Style", options: styles } } : {}),
});
const summary = (x) => x.label || x.title || x.name || x.text || "";

// A little of the home page around a header or footer, for context.
function HomeSections({ from, to }) {
  const s = useSite();
  const home = s.model.c.pages.find((d) => d.root.props.path === "/");
  if (!home) return null;
  return home.content.slice(from, to).map((x) => <Item key={x.props.id} c={x} />);
}

function LogoStripPreview(props) {
  const L = fixedSections.LogoStrip.render;
  return <L band="ruled" label={props.label} showAlso={!!props.also} />;
}

export const SHARED = {
  header: {
    file: "content/shared/header.json",
    title: "Header",
    fields: {
      tagline: text("Tagline"),
      nav: { type: "array", label: "Menu", getItemSummary: summary, arrayFields: link([{ label: "Link", value: "" }, { label: "Button", value: "btn btn--sm" }]) },
      navMobile: { type: "array", label: "Phone menu", getItemSummary: summary, arrayFields: link([{ label: "Link", value: "" }, { label: "Button", value: "btn nav-mobile-cta" }]) },
    },
    part: "header",
    render: () => (
      <>
        <Header nav="" />
        <div className="k-context">
          <HomeSections from={0} to={2} />
        </div>
      </>
    ),
  },
  footer: {
    file: "content/shared/footer.json",
    title: "Footer",
    fields: {
      line: { type: "textarea", label: "Line" },
      links: { type: "array", label: "Links", getItemSummary: summary, arrayFields: link() },
      columns: { type: "array", label: "Columns", getItemSummary: summary, arrayFields: { title: text("Title"), links: { type: "array", label: "Links", getItemSummary: summary, arrayFields: link() } } },
      baseLinks: { type: "array", label: "Bottom links", getItemSummary: summary, arrayFields: link() },
      meta: { type: "array", label: "Small print", getItemSummary: summary, arrayFields: { text: text("Text") } },
    },
    part: "footer",
    render: () => (
      <>
        <div className="k-context">
          <HomeSections from={-1} />
        </div>
        <Footer />
      </>
    ),
  },
  logos: {
    file: "content/shared/logo-strip.json",
    title: "Logo strip",
    fields: null, // built from the SVGs in img/logos/
    part: "logoStrip",
    render: LogoStripPreview,
  },
};

function sharedConfig(key, repo) {
  const s = SHARED[key];
  let fields = s.fields;
  if (!fields) {
    const ids = repo
      .list("img/logos/")
      .filter((p) => p.endsWith(".svg"))
      .map((p) => p.split("/").pop().replace(/\.svg$/, ""));
    fields = {
      label: text("Label"),
      logos: {
        type: "array",
        label: "Logos",
        getItemSummary: summary,
        arrayFields: { id: { type: "select", label: "Logo", options: ids.map((x) => ({ label: x, value: x })) }, name: text("Name"), h: { type: "number", label: "Size", min: 0.3, max: 3, step: 0.05 } },
        defaultItemProps: { id: ids[0], name: "", h: 1 },
      },
      also: { type: "textarea", label: "Line under" },
    };
  }
  return {
    root: {
      fields,
      render: function SharedRoot(props) {
        const base = currentCtx;
        const { puck, editMode, children, ...data } = props; // eslint-disable-line no-unused-vars
        const ctx = { ...base, model: { ...base.model, c: { ...base.model.c, [s.part]: { ...base.model.c[s.part], ...data } } } };
        const R = s.render;
        return (
          <Site.Provider value={ctx}>
            <main id="main">
              <R {...data} />
            </main>
          </Site.Provider>
        );
      },
    },
    components: guarded({}),
  };
}

export function SharedEditor({ which }) {
  const rev = useRepo();
  const repo = session.repo;
  const s = SHARED[which];
  const k = useExternal(s.file);
  const doc = repo.json(s.file);
  const site = useMemo(() => siteFrom(repo), [rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const config = useMemo(() => sharedConfig(which, repo), [which]); // eslint-disable-line react-hooks/exhaustive-deps
  const initial = useMemo(() => ({ root: { props: structuredClone(doc) }, content: [] }), [k, which]); // eslint-disable-line react-hooks/exhaustive-deps
  const home = site.c.pages.find((d) => d.root.props.path === "/");
  currentCtx = pageContext(site, home, { prefix: PREFIX, assetUrl });
  place.slug = null;
  place.label = s.title;
  const onChange = useStable((data) => {
    const cur = repo.json(s.file);
    const { puck, editMode, children, ...props } = data.root.props || {}; // eslint-disable-line no-unused-vars
    const text = serialize(ordered(cur, props));
    if (text !== repo.get(s.file)) repo.set(s.file, text, "editor");
  });
  return (
    <Site.Provider value={currentCtx}>
      <Puck key={which + ":" + k} config={config} data={initial} onChange={onChange} viewports={VIEWPORTS} iframe={PUCK_IFRAME} overrides={overrides()}>
        <Layout config={config} title={s.title} kind="shared" shared={which} />
      </Puck>
    </Site.Provider>
  );
}

export { imageField };
