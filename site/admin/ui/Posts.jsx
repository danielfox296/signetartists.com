/* The posts list: search, hub and status, new post, delete. */
import { useState } from "react";
import { apply, deletePost, freeUrl, hubLabel, thumbFor, hubUrl, newPost, postPath, postsList, postStatus, postUrl, slugify, slugFromUrl, slugProblem } from "../lib/posts.js";
import { pageByPath, normPath, serialize } from "../lib/site.js";
import { previewUrl } from "./fields.jsx";
import { ask, go, session, toast, ui, useRepo, useUi } from "../state.js";
import { Field, Modal } from "./common.jsx";

const BADGE = { draft: ["draft", "Draft"], wait: ["wait", "Changed"], live: ["live", "Live"] };

// The files that differ from live, as the top bar last counted them.
export const usePending = () => useUi((s) => s.pendingPaths);

export function PostsScreen() {
  useRepo();
  const repo = session.repo;
  const [q, setQ] = useState("");
  const [hub, setHub] = useState("");
  const [st, setSt] = useState("");
  const pending = usePending();
  const posts = postsList(repo);
  const hubs = [...new Set(posts.map((e) => hubUrl(e.p.parent)).filter(Boolean))].sort();
  const shown = posts.filter(
    (e) => (!q || `${e.p.title || ""} ${e.p.eyebrow || ""} ${e.p.slug}`.toLowerCase().includes(q.toLowerCase())) && (!hub || hubUrl(e.p.parent) === hub) && (!st || postStatus(e, pending) === st)
  );
  const dirty = new Set(repo.dirty);
  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Posts</h1>
        <span className="grow" />
        <button className="btn primary" onClick={() => ask({ render: (close) => <NewPost close={close} /> })}>
          New post
        </button>
      </div>
      <div className="toolbar">
        <input className="input" type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search posts" />
        <select className="select" style={{ width: "auto" }} aria-label="Hub" value={hub} onChange={(e) => setHub(e.target.value)}>
          <option value="">All hubs</option>
          {hubs.map((h) => (
            <option key={h} value={h}>
              {hubLabel(repo, h)}
            </option>
          ))}
        </select>
        <div className="seg sm" role="group" aria-label="Status">
          {[["", "All"], ["live", "Live"], ["wait", "Changed"], ["draft", "Drafts"]].map(([v, l]) => (
            <button key={v} aria-pressed={String(st === v)} onClick={() => setSt(v)}>
              {l}
            </button>
          ))}
        </div>
        <span className="muted">{shown.length}</span>
      </div>
      <div className="table-wrap">
        <table className="list">
          <thead>
            <tr>
              <th />
              <th>Post</th>
              <th>Hub</th>
              <th>Date</th>
              <th>Blocks</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => {
              const [cls, label] = BADGE[postStatus(e, pending)];
              const src = e.p.hero && e.p.hero.src;
              return (
                <tr key={e.slug} onClick={() => go("post", e.slug)}>
                  <td style={{ width: 76 }}>{src ? <img className="thumb" src={previewUrl(thumbFor(repo, src))} alt="" loading="lazy" onError={(ev) => (ev.currentTarget.style.visibility = "hidden")} /> : <div className="thumb" />}</td>
                  <td className="namecell">
                    <b>{e.p.title || "Untitled"}</b>
                    <small>{e.p.eyebrow}</small>
                  </td>
                  <td className="muted">{e.p.parent ? hubLabel(repo, hubUrl(e.p.parent)) : ""}</td>
                  <td className="muted mono" style={{ whiteSpace: "nowrap" }}>
                    {e.p.date}
                  </td>
                  <td className="muted">{e.doc.content.length}</td>
                  <td>
                    <span className={"badge " + cls}>{label}</span>
                  </td>
                  <td className="row-acts" onClick={(ev) => ev.stopPropagation()}>
                    {dirty.has(e.file) ? <span className="badge wait">Unsaved</span> : null}
                    <button className="btn ghost sm danger" onClick={() => ask({ render: (close) => <DeletePost slug={e.slug} close={close} /> })}>
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
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

function NewPost({ close }) {
  const repo = session.repo;
  const posts = postsList(repo);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [touched, setTouched] = useState(false);
  const [start, setStart] = useState("blank");
  const [from, setFrom] = useState(posts[0] && posts[0].slug);
  const slug = touched ? slugFromUrl(url, "blog") : slugify(title);
  const problem = slug ? slugProblem(repo, slug, null, "post") : null;
  const ok = () => {
    if (!title.trim() || !slug || problem) return;
    const src = start === "copy" ? posts.find((e) => e.slug === from) : null;
    const doc = newPost({ title: title.trim(), slug, from: src ? src.doc : null });
    const red = freeUrl(repo, postUrl(slug));
    if (red) repo.set("content/redirects.json", serialize(red));
    repo.set(postPath(slug), serialize(doc));
    close(null);
    go("post", slug);
  };
  return (
    <Modal title="New post" onClose={() => close(null)} foot={<Foot close={close} ok={ok} label="Create" disabled={!title.trim() || !slug || !!problem} />}>
      <Field label="Title">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </Field>
      <Field label="URL" error={problem}>
        <input
          className="input mono"
          value={touched ? url : postUrl(slug)}
          onChange={(e) => {
            setTouched(true);
            setUrl(e.target.value);
          }}
        />
      </Field>
      <div className="field">
        <span className="flabel">Start from</span>
        <div className="seg" role="group">
          <button aria-pressed={String(start === "blank")} onClick={() => setStart("blank")}>
            Blank
          </button>
          <button aria-pressed={String(start === "copy")} onClick={() => setStart("copy")}>
            Copy of a post
          </button>
        </div>
      </div>
      {start === "copy" ? (
        <Field label="Post">
          <select className="select" value={from} onChange={(e) => setFrom(e.target.value)}>
            {posts.map((e) => (
              <option key={e.slug} value={e.slug}>
                {e.p.title || e.slug}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
    </Modal>
  );
}

function DeletePost({ slug, close }) {
  const repo = session.repo;
  const doc = repo.json(postPath(slug));
  const p = doc.root.props;
  const published = !p.draft;
  const [to, setTo] = useState(hubUrl(p.parent) || "/blog/");
  const target = normPath(to);
  const exists = !published || (target && pageByPath(repo, target));
  const ok = () => {
    if (!exists) return;
    apply(repo, deletePost(repo, slug, published ? target : null));
    close(null);
    toast("Deleted");
    if (ui.get().route[0] === "post") go("posts");
  };
  return (
    <Modal title={`Delete ${p.title || postUrl(p.slug)}`} onClose={() => close(null)} foot={<Foot close={close} ok={ok} label="Delete" danger disabled={!exists} />}>
      {published ? (
        <Field label="Redirect to" error={to && !exists ? "No such page" : null}>
          <input className="input mono" value={to} onChange={(e) => setTo(e.target.value)} autoFocus />
        </Field>
      ) : null}
    </Modal>
  );
}
