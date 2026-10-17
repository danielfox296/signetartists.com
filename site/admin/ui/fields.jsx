/* The admin's own field types and the Puck configs it edits with: the
   site's components, with picture fields that upload, a URL field that
   applies on Enter or when it loses focus, and a guard around every
   section so one that can't render shows as such instead of stopping the
   editor. */
import { Component, useEffect, useRef, useState } from "react";
import { createUsePuck, FieldLabel, setDeep, useGetPuck } from "@puckeditor/core";
import { pageConfig } from "../../src/components/config.jsx";
import { inline, useSite } from "../../src/components/parts.jsx";
import { Item } from "../../src/components/registry.jsx";
import { actsList, rosterOf } from "../lib/acts.js";
import { normPath, pathProblem } from "../lib/site.js";
import { fileSlug, freePath, resize, sourcesEntry } from "../lib/images.js";
import { RICH } from "../lib/richtext.jsx";
import { STAGING_URL } from "../config.js";
import { ask, session } from "../state.js";
import { Field, Modal, Toggle } from "./common.jsx";

// Pictures uploaded this session: path -> {url, width, height}.
export const uploads = new Map();
// What the editor has open, for "Used on" in picture credits and for the URL check.
export const place = { label: "", slug: null };

export const assetUrl = (u) => {
  if (typeof u !== "string") return null;
  const p = u.replace(/^\/+/, "");
  const up = uploads.get(p);
  return up ? up.url : null;
};
export const previewUrl = (u) => {
  if (!u) return "";
  if (/^(https?:|data:|blob:)/.test(u)) return u;
  return assetUrl(u) || `${STAGING_URL}/${u.replace(/^\/+/, "")}`;
};

// ------------------------------------------------------------ pictures

function CreditDialog({ name, resolve }) {
  const [v, setV] = useState({ creator: "", licence: "", source: "" });
  const f = (k) => (e) => setV({ ...v, [k]: e.target.value });
  return (
    <Modal
      title={name}
      onClose={() => resolve(null)}
      foot={
        <>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={() => resolve(null)}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => resolve(v)}>
            Upload
          </button>
        </>
      }
    >
      <Field label="Creator">
        <input className="input" value={v.creator} onChange={f("creator")} autoFocus />
      </Field>
      <Field label="Licence">
        <input className="input" value={v.licence} onChange={f("licence")} />
      </Field>
      <Field label="Source">
        <input className="input" value={v.source} onChange={f("source")} />
      </Field>
    </Modal>
  );
}

export async function uploadPicture(file) {
  const credit = await ask({ render: (resolve) => <CreditDialog name={file.name} resolve={resolve} /> });
  if (!credit) return null;
  const repo = session.repo;
  const img = await resize(file);
  const path = freePath(repo, fileSlug(file.name), img.ext);
  const url = URL.createObjectURL(img.blob);
  uploads.set(path, { url, width: img.width, height: img.height });
  repo.putBinary(path, img.b64, url);
  const today = new Date().toISOString().slice(0, 10);
  const entry = sourcesEntry(path.replace(/^img\//, ""), { ...credit, usedOn: place.label }, img, today);
  const cur = repo.get("img/SOURCES.md") || "";
  repo.set("img/SOURCES.md", cur.replace(/\n*$/, "\n\n") + entry);
  return "/" + path;
}

const usePuck = createUsePuck();
const getDeep = (o, path) => path.split(".").reduce((cur, part) => {
  if (cur == null) return cur;
  const [prop, i] = part.replace("]", "").split("[");
  const v = cur[prop];
  return i !== undefined ? (v || [])[Number(i)] : v;
}, o);

function ImageInput({ field, name, value, onChange, readOnly }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const selected = usePuck((s) => s.selectedItem);
  const getSelector = usePuck((s) => s.getSelectorForId);
  const dispatch = usePuck((s) => s.dispatch);
  const v = typeof value === "string" ? value : "";
  // A new picture brings its own width and height, where the item has them.
  const setPicture = (p) => {
    const up = uploads.get(p.replace(/^\/+/, ""));
    const sel = selected && getSelector(selected.props.id);
    if (!up || !sel || !name || !name.endsWith("src")) return onChange(p);
    const base = name.slice(0, -3).replace(/\.$/, "");
    let props = setDeep(selected.props, name, p);
    const parent = base ? getDeep(props, base) : props;
    for (const k of ["width", "height"])
      if (parent && k in parent) props = setDeep(props, (base ? base + "." : "") + k, typeof parent[k] === "number" ? up[k] : String(up[k]));
    dispatch({ type: "replace", destinationIndex: sel.index, destinationZone: sel.zone, data: { ...selected, props } });
  };
  const pick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const p = await uploadPicture(file);
      if (p) setPicture(p);
    } finally {
      setBusy(false);
    }
  };
  return (
    <FieldLabel label={field.label || "Picture"} el="div" readOnly={readOnly}>
      <div className="img-field">
        {v ? <img className="img-thumb" src={previewUrl(v)} alt="" /> : <span className="img-thumb" />}
        <div className="img-side">
          <input className="input mono" value={v} readOnly={readOnly} onChange={(e) => onChange(e.target.value)} />
          <button type="button" className="btn sm" disabled={readOnly || busy} onClick={() => input.current && input.current.click()}>
            {busy ? "Uploading" : "Upload"}
          </button>
          <input ref={input} type="file" accept="image/*" hidden onChange={pick} />
        </div>
      </div>
    </FieldLabel>
  );
}

export const imageField = (label) => ({ type: "custom", label, render: ImageInput });

// ------------------------------------------------------------ page settings

function UrlInput({ field, value, onChange, readOnly }) {
  const [v, setV] = useState(value || "");
  useEffect(() => setV(value || ""), [value]);
  const fixed = typeof value === "string" && (value === "/" || value.endsWith(".html"));
  const next = normPath(v);
  const problem = next !== value ? pathProblem(session.repo, next, place.slug) : null;
  const apply = () => {
    if (next === value || problem) return;
    onChange(next);
  };
  return (
    <FieldLabel label={field.label} el="div" readOnly={readOnly || fixed}>
      <input
        className={"input mono" + (problem && v !== value ? " bad" : "")}
        value={v}
        readOnly={readOnly || fixed}
        onChange={(e) => setV(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === "Enter") apply();
          if (e.key === "Escape") setV(value || "");
        }}
      />
      {problem && v !== value ? <p className="ferr">{problem}</p> : null}
    </FieldLabel>
  );
}

function IndexedInput({ field, value, onChange, readOnly }) {
  const on = !String(value || "index, follow").startsWith("noindex");
  return (
    <FieldLabel label={field.label} el="div" readOnly={readOnly}>
      <Toggle checked={on} onChange={(x) => onChange(x ? "index, follow" : "noindex, follow")} />
    </FieldLabel>
  );
}

export const pageSettingsFields = {
  title: { type: "text", label: "SEO title" },
  description: { type: "textarea", label: "Meta description" },
  path: { type: "custom", label: "URL", render: UrlInput },
  robots: { type: "custom", label: "Indexed", render: IndexedInput },
};

// ------------------------------------------------------------ acts and choices

// An act from the roster. A part of an act page may leave it empty, and
// then shows the page's own act.
function ActPick({ field, value, onChange, readOnly }) {
  const acts = actsList(session.repo);
  return (
    <FieldLabel label={field.label} el="div" readOnly={readOnly}>
      <select className="select" value={value || ""} disabled={readOnly} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">{field.pageAct ? "This page's act" : ""}</option>
        {acts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </FieldLabel>
  );
}

// A choice from one of the roster's filter lists.
function ChoicePick({ field, value, onChange, readOnly }) {
  const list = rosterOf(session.repo)[field.list] || [];
  return (
    <FieldLabel label={field.label} el="div" readOnly={readOnly}>
      <select className="select" value={value || ""} disabled={readOnly} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="" />
        {list.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
    </FieldLabel>
  );
}

const CHOICE_LISTS = { occasion: "occasions", night: "buckets" };

// Act cards show only the fields their source uses.
const CARD_FIELDS = { flagships: [], occasion: ["occasion", "compact"], night: ["night", "compact"], acts: ["acts", "compact"], picks: ["picks"] };
const RESOLVE = {
  Cards: (data, { fields }) => {
    const show = CARD_FIELDS[data.props.source || "flagships"] || [];
    return Object.fromEntries(Object.entries(fields).filter(([k]) => k === "source" || show.includes(k)));
  },
};

// ------------------------------------------------------------ configs

const PICTURE_KEYS = new Set(["src", "poster"]);

// Picture fields become uploads, wherever they sit; act and choice fields
// pick from the roster.
function mapFields(fields, nested = false) {
  const out = {};
  for (const [k, f] of Object.entries(fields || {})) {
    if (!f) continue;
    if (k === "act" && f.type === "text") out[k] = { type: "custom", label: f.label, render: ActPick, pageAct: !nested };
    else if (CHOICE_LISTS[k] && f.type === "text") out[k] = { type: "custom", label: f.label, render: ChoicePick, list: CHOICE_LISTS[k] };
    else if (PICTURE_KEYS.has(k) && f.type === "text") out[k] = imageField(f.label === "File" ? "Picture" : f.label);
    else if (f.type === "richtext") out[k] = { ...f, ...RICH };
    // Inline CSS fields say so, so they don't read as a second "Style".
    else if (f.type === "text" && /style$/i.test(k) && f.label) out[k] = { ...f, label: f.label.replace(/\bStyle\b/, "CSS").replace(/\bstyle\b/, "CSS") };
    else if (f.type === "object") out[k] = { ...f, objectFields: mapFields(f.objectFields, true) };
    else if (f.type === "array") {
      out[k] = { ...f, arrayFields: mapFields(f.arrayFields, true) };
      // A list of acts reads as their names.
      if (f.arrayFields && f.arrayFields.act) out[k].getItemSummary = (it) => (it && it.act && (session.repo.json(`content/acts/${it.act}.json`) || {}).name) || (it && it.act) || "";
    }
    else out[k] = f;
  }
  return out;
}

// A new item, from the component's starting props, with new ids all the
// way down. Puck is given no defaultProps: it would show them in place of
// any prop a stored item leaves out (a heading with no lede would read
// "Lede"), and write them into the file on the next edit.
const uid = (type) => `${type}-${crypto.randomUUID().slice(0, 8)}`;
function freshIds(v) {
  if (Array.isArray(v)) return v.map(freshIds);
  if (v && typeof v === "object") {
    if (typeof v.type === "string" && v.props) {
      const { id, ...props } = v.props; // eslint-disable-line no-unused-vars
      return { ...v, props: { id: uid(v.type), ...freshIds(props) } };
    }
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, freshIds(x)]));
  }
  return v;
}
export const STARTS = {};
export function newItem(type, id) {
  return { type, props: { ...freshIds(STARTS[type] || {}), id } };
}

class Guard extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <section className="section section--ruled">
          <div className="wrap">
            <p className="note">{this.props.name}: {String(this.state.error.message || this.state.error)}</p>
          </div>
        </section>
      );
    return this.props.children;
  }
}

// Puck hands a component an inline editor for every rich text field, even
// one the stored item doesn't have; the component would then draw an empty
// paragraph the site doesn't have. Those fields are passed as absent.
function present(props, raw, fields) {
  if (!raw || !fields) return props;
  let out = props;
  for (const [k, f] of Object.entries(fields)) {
    if (!f) continue;
    if (f.type === "richtext" && raw[k] == null && props[k] != null) {
      if (out === props) out = { ...props };
      out[k] = undefined;
    } else if (f.type === "array" && Array.isArray(props[k]) && Array.isArray(raw[k])) {
      const items = props[k].map((it, i) => present(it, raw[k][i], f.arrayFields));
      if (items.some((it, i) => it !== props[k][i])) {
        if (out === props) out = { ...props };
        out[k] = items;
      }
    } else if (f.type === "object" && props[k] && raw[k]) {
      const o = present(props[k], raw[k], f.objectFields);
      if (o !== props[k]) {
        if (out === props) out = { ...props };
        out[k] = o;
      }
    }
  }
  return out;
}

export function guarded(components) {
  const out = {};
  for (const [name, c] of Object.entries(components)) {
    const R = c.render;
    if (c.defaultProps) STARTS[name] = c.defaultProps;
    const fields = mapFields(c.fields);
    out[name] = {
      ...c,
      fields,
      ...(RESOLVE[name] ? { resolveFields: RESOLVE[name] } : {}),
      defaultProps: undefined,
      render: function Guarded(props) {
        const getPuck = useGetPuck();
        let p = props;
        try {
          const item = props.id ? getPuck().getItemById(props.id) : null;
          if (item) p = present(props, item.props, fields);
        } catch {
          p = props;
        }
        return (
          <Guard name={c.label || name}>
            <R {...p} />
          </Guard>
        );
      },
    };
  }
  return out;
}

// A page on the act page layout shows the layout's parts around its own
// sections, as the build puts them together.
function LayoutParts({ items }) {
  return items.length ? <div className="k-context">{items.map((x) => <Item key={x.props.id} c={x} />)}</div> : null;
}
function AdminPageRoot(props) {
  const s = useSite();
  const R = pageConfig.root.render;
  const doc = s && s.page;
  if (!doc || !s.model.usesLayout(doc)) return <R {...props} />;
  const parts = s.model.LAYOUT.content;
  const i = parts.findIndex((x) => x.type === "ActOwn");
  return (
    <R {...props}>
      <LayoutParts items={i < 0 ? parts : parts.slice(0, i)} />
      {props.children}
      <LayoutParts items={i < 0 ? [] : parts.slice(i + 1)} />
    </R>
  );
}

export const adminPageConfig = {
  ...pageConfig,
  root: { ...pageConfig.root, fields: pageSettingsFields, render: AdminPageRoot },
  components: guarded(pageConfig.components),
};

// ------------------------------------------------------------ clean data

// What Puck hands back, as the files store it: copy edited on the canvas
// loses the paragraph wrapper the editor adds, and a picture uploaded this
// session brings its own size.
export function clean(data, config) {
  const fix = (v, fields) => {
    if (Array.isArray(v)) return v.map((x) => fix(x, fields));
    if (!v || typeof v !== "object") return v;
    if (typeof v.type === "string" && v.props && config.components[v.type]) {
      return { ...v, props: fix(v.props, config.components[v.type].fields) };
    }
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      const f = fields && fields[k];
      if (f && f.type === "richtext" && typeof x === "string") out[k] = inline(x);
      else if (f && f.type === "object") out[k] = fix(x, f.objectFields);
      else if (f && f.type === "array") out[k] = Array.isArray(x) ? x.map((it) => fix(it, f.arrayFields)) : x;
      else if (f && f.type === "slot") out[k] = fix(x, null);
      else out[k] = x;
    }
    if (typeof out.src === "string") {
      const up = uploads.get(out.src.replace(/^\/+/, ""));
      if (up) {
        if ("width" in out) out.width = typeof out.width === "number" ? up.width : String(up.width);
        if ("height" in out) out.height = typeof out.height === "number" ? up.height : String(up.height);
      }
    }
    return out;
  };
  return { ...data, root: { ...data.root, props: fix(data.root.props, config.root.fields) }, content: fix(data.content, null) };
}

// Keep each item's props in the order its file had them, and leave out the
// empty slot Puck adds to an item that had none, so a save changes only
// what was edited.
export function conform(next, prev, config) {
  const before = new Map();
  const index = (v) => {
    if (Array.isArray(v)) v.forEach(index);
    else if (v && typeof v === "object") {
      if (typeof v.type === "string" && v.props && v.props.id) before.set(v.props.id, v.props);
      Object.values(v).forEach(index);
    }
  };
  index(prev);
  const fix = (v) => {
    if (Array.isArray(v)) return v.map(fix);
    if (!v || typeof v !== "object") return v;
    if (typeof v.type === "string" && v.props) {
      const old = before.get(v.props.id);
      const fields = (config.components[v.type] && config.components[v.type].fields) || {};
      const props = {};
      const keys = old ? [...Object.keys(old).filter((k) => k in v.props), ...Object.keys(v.props).filter((k) => !(k in old))] : Object.keys(v.props);
      for (const k of keys) {
        const x = v.props[k];
        if (old && !(k in old) && fields[k] && fields[k].type === "slot" && Array.isArray(x) && !x.length) continue;
        if (old && !(k in old) && fields[k] && fields[k].type === "richtext" && (x === "" || x === "<p></p>")) continue;
        props[k] = fix(x);
      }
      return { ...v, props };
    }
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fix(x)]));
  };
  return fix(next);
}
