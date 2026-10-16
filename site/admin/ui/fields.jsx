/* The admin's own field types and the Puck configs it edits with: the
   site's components, with picture fields that upload, a URL field that
   applies on Enter or when it loses focus, and a guard around every
   section so one that can't render shows as such instead of stopping the
   editor. */
import { Component, useEffect, useRef, useState } from "react";
import { FieldLabel } from "@puckeditor/core";
import { pageConfig } from "../../src/components/config.jsx";
import { inline } from "../../src/components/parts.jsx";
import { normPath, pathProblem } from "../lib/site.js";
import { fileSlug, freePath, resize, sourcesEntry } from "../lib/images.js";
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

function ImageInput({ field, value, onChange, readOnly }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const v = typeof value === "string" ? value : "";
  const pick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const p = await uploadPicture(file);
      if (p) onChange(p);
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
  const fixed = typeof value === "string" && value.endsWith(".html");
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

// ------------------------------------------------------------ configs

const PICTURE_KEYS = new Set(["src", "poster"]);

// Picture fields become uploads, wherever they sit.
function mapFields(fields) {
  const out = {};
  for (const [k, f] of Object.entries(fields || {})) {
    if (!f) continue;
    if (PICTURE_KEYS.has(k) && f.type === "text") out[k] = imageField(f.label === "File" ? "Picture" : f.label);
    else if (f.type === "object") out[k] = { ...f, objectFields: mapFields(f.objectFields) };
    else if (f.type === "array") out[k] = { ...f, arrayFields: mapFields(f.arrayFields) };
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

export function guarded(components) {
  const out = {};
  for (const [name, c] of Object.entries(components)) {
    const R = c.render;
    if (c.defaultProps) STARTS[name] = c.defaultProps;
    out[name] = {
      ...c,
      fields: mapFields(c.fields),
      defaultProps: undefined,
      render: function Guarded(props) {
        return (
          <Guard name={c.label || name}>
            <R {...props} />
          </Guard>
        );
      },
    };
  }
  return out;
}

export const adminPageConfig = {
  ...pageConfig,
  root: { ...pageConfig.root, fields: pageSettingsFields },
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
        props[k] = fix(x);
      }
      return { ...v, props };
    }
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fix(x)]));
  };
  return fix(next);
}
