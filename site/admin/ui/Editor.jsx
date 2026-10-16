/* Editing in Puck: a page's sections, or one shared part, on the site's own
   components and stylesheet. Sections down the left, the page in the
   middle at desktop or phone width, fields on the right. */
import { useEffect, useMemo, useRef, useState } from "react";
import { createUsePuck, Puck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import { Site } from "../../src/components/parts.jsx";
import { Footer, Header } from "../../src/components/layout.jsx";
import { fixedSections } from "../../src/components/sections.jsx";
import { STAGING_URL } from "../config.js";
import { pageContext, pagePath, serialize, siteFrom } from "../lib/site.js";
import { sectionName } from "../lib/diff.js";
import { go, session, useRepo } from "../state.js";
import { Badge, kindOf, useOutside } from "./common.jsx";
import { adminPageConfig, assetUrl, clean, conform, guarded, imageField, newItem, place } from "./fields.jsx";
import { writePage } from "./Pages.jsx";
import { fileLabel } from "../lib/labels.js";

const usePuck = createUsePuck();
const ROOT = "root:default-zone";
const PREFIX = STAGING_URL + "/";

const VIEWPORTS = [
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
function CanvasContext({ children }) {
  return <Site.Provider value={currentCtx}>{children}</Site.Provider>;
}

function Overlay({ children, componentType, isSelected, hover }) {
  return <div className={"k-overlay k-" + kindOf(componentType) + (isSelected ? " sel" : "") + (hover ? " hov" : "")}>{children}</div>;
}

// ------------------------------------------------------------ left column

function SectionList({ config }) {
  const content = usePuck((s) => s.appState.data.content);
  const sel = usePuck((s) => s.appState.ui.itemSelector);
  const selected = usePuck((s) => s.selectedItem);
  const getParent = usePuck((s) => s.getParentById);
  const dispatch = usePuck((s) => s.dispatch);
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  // The top-level section the selection sits in.
  let top = sel && sel.zone === ROOT ? sel.index : null;
  if (top == null && selected) {
    let cur = selected;
    for (let i = 0; i < 20 && cur; i++) {
      const p = getParent(cur.props.id);
      if (!p) break;
      cur = p;
    }
    top = cur ? content.findIndex((c) => c.props.id === cur.props.id) : null;
  }
  const pick = (i) => {
    dispatch({ type: "setUi", ui: { itemSelector: { index: i, zone: ROOT } } });
    const id = content[i] && content[i].props.id;
    const frame = document.querySelector("#preview-frame, .pe-canvas iframe");
    const doc = frame && frame.contentDocument;
    const el = doc && doc.querySelector(`[data-puck-component="${id}"]`);
    if (el) el.scrollIntoView({ block: "start" });
  };
  const drop = (i) => {
    if (drag != null && drag !== i) dispatch({ type: "reorder", sourceIndex: drag, destinationIndex: drag < i ? i - 1 : i, destinationZone: ROOT });
    setDrag(null);
    setOver(null);
  };
  return (
    <div className="layers" onDragLeave={() => setOver(null)}>
      <button className="layer" onClick={() => go("header")}>
        <span className="kdot shared" />
        <span className="t">Header</span>
      </button>
      {content.map((c, i) => {
        const n = sectionName(c, config.components);
        return (
          <div
            key={c.props.id}
            className={"layer" + (top === i ? " sel" : "") + (over === i ? " dragover" : "")}
            draggable
            onDragStart={(e) => {
              setDrag(i);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (drag == null) return;
              e.preventDefault();
              setOver(i);
            }}
            onDrop={() => drop(i)}
            onDragEnd={() => (setDrag(null), setOver(null))}
            onClick={() => pick(i)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && pick(i)}
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
      {content.length && drag != null ? <div className={"layer end" + (over === content.length ? " dragover" : "")} onDragOver={(e) => (e.preventDefault(), setOver(content.length))} onDrop={() => drop(content.length)} /> : null}
      <button className="layer" onClick={() => go("footer")}>
        <span className="kdot shared" />
        <span className="t">Footer</span>
      </button>
    </div>
  );
}

function AddMenu({ label, groups, onPick }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useOutside(() => setOpen(false));
  const items = groups.flatMap((g) => g.items.map((it) => ({ ...it, group: g.title }))).filter((it) => !q || it.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="add-wrap" ref={ref}>
      <button className="btn sm add-btn" onClick={() => setOpen(!open)}>
        + {label}
      </button>
      {open ? (
        <div className="popover in-flow">
          <input className="input" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="pop-list">
            {items.map((it) => (
              <div
                key={it.name}
                className="pop-item"
                role="button"
                tabIndex={0}
                onClick={() => {
                  setOpen(false);
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

function ViewTools({ url }) {
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
    </div>
  );
}

// The canvas is drawn at the view's real width and scaled to fit, so
// desktop shows the desktop layout on any screen.
function Middle({ url }) {
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
      <ViewTools url={url} />
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

function Layout({ config, title, kind, url, shared }) {
  return (
    <div className="pe">
      <aside className="pe-left">
        <div className="insp-label">{shared ? "Shared" : "Sections"}</div>
        {shared ? <SharedList which={shared} /> : <SectionList config={config} />}
        {shared ? null : (
          <div className="add-row">
            <AddSection config={config} />
            <AddBlock config={config} />
          </div>
        )}
      </aside>
      <Middle url={url} />
      <aside className="pe-right">
        <RightHead title={title} kind={kind} config={config} />
        <Puck.Fields />
      </aside>
    </div>
  );
}

// Re-read the file into Puck when it changes from outside (a merge, a revert).
function useExternal(path) {
  const [k, setK] = useState(0);
  useEffect(
    () =>
      session.repo.subscribe((ev) => {
        if ((ev.remote && ev.remote.includes(path) && !session.repo.st.local.has(path)) || (ev.reload && ev.reload.includes(path))) setK((x) => x + 1);
      }),
    [path]
  );
  return k;
}

const ordered = (orig, next) => {
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
  const initial = useMemo(() => (doc ? structuredClone(doc) : null), [k, slug]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!doc) return <div className="screen"><p className="muted">No such page</p></div>;
  if (site.error) return <div className="screen"><p className="warn-line">{String(site.error.message)}</p></div>;
  const p = doc.root.props;
  place.slug = slug;
  place.label = fileLabel(path, repo.get(path));
  currentCtx = pageContext(site, doc, { prefix: PREFIX, assetUrl });
  const onChange = (data) => {
    const cur = repo.json(path);
    if (!cur) return;
    const c = clean(data, adminPageConfig);
    const next = ordered(cur, { ...cur, root: { ...cur.root, props: ordered(cur.root.props, c.root.props) }, content: conform(c.content, cur.content, adminPageConfig) });
    if (serialize(next) !== repo.get(path)) writePage(slug, next);
  };
  return (
    <Site.Provider value={currentCtx}>
      <Puck
        key={slug + ":" + k}
        config={adminPageConfig}
        data={initial}
        onChange={onChange}
        viewports={VIEWPORTS}
        iframe={{ enabled: true, waitForStyles: false }}
        overrides={{ iframe: Canvas, componentOverlay: Overlay }}
      >
        <Layout config={adminPageConfig} title={place.label} kind="page" url={p.path} />
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
    render: () => <Header nav="" />,
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
    render: () => <Footer />,
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
  const onChange = (data) => {
    const cur = repo.json(s.file);
    const { puck, editMode, children, ...props } = data.root.props || {}; // eslint-disable-line no-unused-vars
    const text = serialize(ordered(cur, props));
    if (text !== repo.get(s.file)) repo.set(s.file, text);
  };
  return (
    <Site.Provider value={currentCtx}>
      <Puck key={which + ":" + k} config={config} data={initial} onChange={onChange} viewports={VIEWPORTS} iframe={{ enabled: true, waitForStyles: false }} overrides={{ iframe: Canvas, componentOverlay: Overlay }}>
        <Layout config={config} title={s.title} kind="shared" shared={which} />
      </Puck>
    </Site.Provider>
  );
}

export { imageField };
