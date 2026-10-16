/* The pages list: search, new page, page settings, delete. */
import { useMemo, useState } from "react";
import { blankPage, copyPage, normPath, pageByPath, pagePath, pagesList, pathProblem, repoint, serialize, slugForPath } from "../lib/site.js";
import { createModel } from "../../src/lib/model.js";
import { contentFrom } from "../lib/site.js";
import { ask, go, session, toast, ui, useRepo } from "../state.js";
import { Field, Modal, Toggle } from "./common.jsx";

// The home page and the 404 page keep their URLs and can't be deleted.
export const fixedPath = (path) => path === "/" || path.endsWith(".html");

const shortTitle = (t) => String(t || "").replace(/\s*\|\s*Signet Artists\s*$/, "");

// Write a page's new version, and fix what points at it if its URL moved.
export function writePage(slug, next, source) {
  const repo = session.repo;
  const file = pagePath(slug);
  const cur = repo.json(file);
  const from = cur && cur.root.props.path;
  const to = next.root.props.path;
  if (cur && from !== to) {
    for (const [f, v] of repoint(repo, from, to)) if (f !== file) repo.set(f, serialize(v), source);
  }
  repo.set(file, serialize(next), source);
}

function groupOf(path) {
  if (path === "/" || path.endsWith(".html")) return path === "/" ? "Home" : path.slice(1);
  return path.split("/")[1];
}

export function PagesScreen() {
  useRepo();
  const [q, setQ] = useState("");
  const pages = pagesList(session.repo);
  const shown = pages.filter((p) => !q || (p.title + " " + p.path).toLowerCase().includes(q.toLowerCase()));
  const groups = [];
  for (const p of shown) {
    const g = groupOf(p.path);
    let grp = groups.find((x) => x.key === g);
    if (!grp) {
      const hub = pages.find((x) => x.path === `/${g}/`);
      grp = { key: g, label: hub ? hub.doc.root.props.breadcrumb || shortTitle(hub.title).split(":")[0] : g.replace(/^./, (c) => c.toUpperCase()), rows: [] };
      groups.push(grp);
    }
    grp.rows.push(p);
  }
  const dirty = new Set(session.repo.dirty);
  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Pages</h1>
        <span className="grow" />
        <button className="btn primary" onClick={() => ask({ render: (close) => <NewPage close={close} /> })}>
          New page
        </button>
      </div>
      <div className="toolbar">
        <input className="input" type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search pages" />
        <span className="muted">{shown.length}</span>
      </div>
      <div className="table-wrap">
        <table className="list">
          <thead>
            <tr>
              <th>Page</th>
              <th>Address</th>
              <th>Sections</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => [
              <tr className="group" key={"g-" + g.key}>
                <td colSpan={4}>{g.label}</td>
              </tr>,
              ...g.rows.map((p) => (
                <tr key={p.slug} onClick={() => go("page", p.slug)}>
                  <td className="namecell">
                    <b>{shortTitle(p.title)}</b>
                  </td>
                  <td className="mono muted">{p.path}</td>
                  <td className="muted">{p.doc.content.length}</td>
                  <td className="row-acts" onClick={(e) => e.stopPropagation()}>
                    {dirty.has(p.file) ? <span className="badge wait">Unsaved</span> : null}
                    {p.robots.startsWith("noindex") ? <span className="badge draft">noindex</span> : null}
                    <button className="btn ghost sm" onClick={() => ask({ render: (close) => <Settings slug={p.slug} close={close} /> })}>
                      Settings
                    </button>
                    {fixedPath(p.path) ? null : (
                      <button className="btn ghost sm danger" onClick={() => ask({ render: (close) => <DeletePage slug={p.slug} close={close} /> })}>
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Foot({ close, ok, label, disabled, danger }) {
  return (
    <>
      <span style={{ flex: 1 }} />
      <button className="btn" onClick={() => close(null)}>
        Cancel
      </button>
      <button className={"btn " + (danger ? "danger" : "primary")} disabled={disabled} onClick={ok}>
        {label}
      </button>
    </>
  );
}

function NewPage({ close }) {
  const repo = session.repo;
  const pages = pagesList(repo);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [start, setStart] = useState("blank");
  const [from, setFrom] = useState(pages[0] && pages[0].slug);
  const path = normPath(url);
  const problem = url ? pathProblem(repo, path, null) : null;
  const ok = () => {
    if (!title.trim() || !path || problem) return;
    let slug = slugForPath(path);
    for (let i = 2; repo.has(pagePath(slug)); i++) slug = `${slugForPath(path)}-${i}`;
    const src = pages.find((p) => p.slug === from);
    const doc = start === "copy" && src ? copyPage(src.doc, path, title.trim()) : blankPage(path, title.trim());
    const red = repo.json("content/redirects.json");
    if (red.some((r) => r.from === path))
      repo.set(
        "content/redirects.json",
        serialize(red.filter((r) => r.from !== path))
      );
    repo.set(pagePath(slug), serialize(doc));
    close(null);
    go("page", slug);
  };
  return (
    <Modal title="New page" onClose={() => close(null)} foot={<Foot close={close} ok={ok} label="Create" disabled={!title.trim() || !path || !!problem} />}>
      <Field label="Title">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </Field>
      <Field label="URL" error={problem}>
        <input className="input mono" value={url} onChange={(e) => setUrl(e.target.value)} />
      </Field>
      <div className="field">
        <span className="flabel">Start from</span>
        <div className="seg" role="group">
          <button aria-pressed={String(start === "blank")} onClick={() => setStart("blank")}>
            Blank
          </button>
          <button aria-pressed={String(start === "copy")} onClick={() => setStart("copy")}>
            Copy of a page
          </button>
        </div>
      </div>
      {start === "copy" ? (
        <Field label="Page">
          <select className="select" value={from} onChange={(e) => setFrom(e.target.value)}>
            {pages.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.path} · {shortTitle(p.title)}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
    </Modal>
  );
}

function Settings({ slug, close }) {
  const repo = session.repo;
  const doc = repo.json(pagePath(slug));
  const p = doc.root.props;
  const [v, setV] = useState({ title: p.title || "", description: p.description || "", path: p.path, indexed: !(p.robots || "").startsWith("noindex") });
  const fixed = fixedPath(p.path);
  const path = fixed ? p.path : normPath(v.path);
  const problem = path !== p.path ? pathProblem(repo, path, slug) : null;
  const ok = () => {
    if (problem) return;
    const next = structuredClone(doc);
    const r = next.root.props;
    r.title = v.title;
    r.description = v.description;
    r.path = path;
    const robots = v.indexed ? "index, follow" : "noindex, follow";
    if ((p.robots || "index, follow") !== robots) r.robots = robots;
    writePage(slug, next);
    close(null);
  };
  return (
    <Modal title="Page settings" onClose={() => close(null)} foot={<Foot close={close} ok={ok} label="Save" disabled={!!problem} />}>
      <Field label="SEO title">
        <input className="input" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} autoFocus />
      </Field>
      <Field label="Meta description">
        <textarea className="textarea" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </Field>
      <Field label="URL" error={problem}>
        <input className="input mono" value={v.path} readOnly={fixed} onChange={(e) => setV({ ...v, path: e.target.value })} />
      </Field>
      <div className="field">
        <span className="flabel">Indexed</span>
        <Toggle checked={v.indexed} onChange={(x) => setV({ ...v, indexed: x })} />
      </div>
    </Modal>
  );
}

function DeletePage({ slug, close }) {
  const repo = session.repo;
  const doc = repo.json(pagePath(slug));
  const path = doc.root.props.path;
  const parent = useMemo(() => {
    try {
      return createModel(contentFrom(repo)).crumbParent(path) || "/";
    } catch {
      return "/";
    }
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  const [to, setTo] = useState(parent);
  const target = normPath(to);
  const exists = target && target !== path && pageByPath(repo, target);
  const ok = () => {
    if (!exists) return;
    for (const [f, v] of repoint(repo, path, target, { deleted: true })) if (f !== pagePath(slug)) repo.set(f, serialize(v));
    repo.remove(pagePath(slug));
    close(null);
    toast("Deleted");
    if (ui.get().route[0] === "page") go("pages");
  };
  return (
    <Modal title={`Delete ${path}`} onClose={() => close(null)} foot={<Foot close={close} ok={ok} label="Delete" danger disabled={!exists} />}>
      <Field label="Redirect to" error={to && !exists ? "No such page" : null}>
        <input className="input mono" value={to} onChange={(e) => setTo(e.target.value)} autoFocus />
      </Field>
    </Modal>
  );
}
