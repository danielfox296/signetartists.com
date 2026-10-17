/* Videos: the list, and one video's form beside it. Each video has its own
   watch page, a place in the video index and in the video sitemap, all
   built from its file. */
import { useEffect, useRef, useState } from "react";
import { STAGING_URL } from "../config.js";
import { apply, deleteVideo, freeUrl, isoDuration, mmss, newVideo, renameVideo, slugFromUrl, slugify, slugProblem, videoPath, videosList, watchUrl, youtubeId, ytThumb } from "../lib/posts.js";
import { normPath, pageByPath, serialize } from "../lib/site.js";
import { ask, go, session, toast, useRepo } from "../state.js";
import { Field, Modal } from "./common.jsx";
import { previewUrl, uploadPicture } from "./fields.jsx";

const actsOf = (repo) => {
  const roster = repo.json("content/roster.json");
  return (roster.order || []).map((id) => repo.json(`content/acts/${id}.json`)).filter(Boolean);
};
const actName = (repo, id) => {
  const a = repo.json(`content/acts/${id}.json`);
  return a ? a.name : id || "";
};
const thumbOf = (v) => (v.poster ? previewUrl(v.poster) : ytThumb(v.id));

export function VideosScreen({ slug }) {
  useRepo();
  const repo = session.repo;
  const [act, setAct] = useState("");
  const [q, setQ] = useState("");
  const all = videosList(repo);
  const shown = all.filter((e) => (!act || e.v.act === act) && (!q || `${e.v.name} ${e.slug}`.toLowerCase().includes(q.toLowerCase())));
  const acts = [...new Set(all.map((e) => e.v.act))];
  const open = slug && repo.has(videoPath(slug)) ? slug : null;
  const dirty = new Set(repo.dirty);
  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Videos</h1>
        <span className="grow" />
        <button className="btn primary" onClick={() => ask({ render: (close) => <NewVideo close={close} /> })}>
          New video
        </button>
      </div>
      <div className="toolbar">
        <input className="input" type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search videos" />
        <select className="select" style={{ width: "auto" }} aria-label="Act" value={act} onChange={(e) => setAct(e.target.value)}>
          <option value="">All acts</option>
          {acts.map((id) => (
            <option key={id} value={id}>
              {actName(repo, id)}
            </option>
          ))}
        </select>
        <span className="muted">{shown.length}</span>
      </div>
      <div className={open ? "split" : ""}>
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr>
                <th />
                <th>Video</th>
                <th>Act</th>
                <th>Length</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.slug} className={e.slug === open ? "on" : undefined} onClick={() => go("videos", e.slug)}>
                  <td style={{ width: 76 }}>{thumbOf(e.v) ? <img className="thumb" src={thumbOf(e.v)} alt="" loading="lazy" /> : <div className="thumb" />}</td>
                  <td className="namecell">
                    <b>{e.v.name}</b>
                    <small className="mono">{e.v.uploadDate}</small>
                  </td>
                  <td className="muted">{actName(repo, e.v.act)}</td>
                  <td className="muted mono">
                    {mmss(e.v.duration)}
                    {dirty.has(e.file) ? <span className="badge wait" style={{ marginLeft: 8 }}>Unsaved</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {open ? <VideoForm key={open} slug={open} /> : null}
      </div>
    </div>
  );
}

// A field that applies what was typed on Enter or when it loses focus.
function Committed({ value, onApply, problem, mono }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const bad = v !== value ? problem(v) : null;
  const done = () => {
    if (v === value) return;
    if (bad) return setV(value);
    onApply(v);
  };
  return (
    <>
      <input
        className={"input" + (mono ? " mono" : "") + (bad ? " bad" : "")}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={done}
        onKeyDown={(e) => {
          if (e.key === "Enter") done();
          if (e.key === "Escape") setV(value);
        }}
      />
      {bad ? <p className="ferr">{bad}</p> : null}
    </>
  );
}

function VideoForm({ slug }) {
  const repo = session.repo;
  const path = videoPath(slug);
  const v = repo.json(path);
  const file = useRef(null);
  const [busy, setBusy] = useState(false);
  if (!v) return null;
  const set = (patch) => {
    const cur = repo.json(path);
    const next = { ...cur, ...patch };
    const text = serialize(next);
    if (text !== repo.get(path)) repo.set(path, text, "videos");
  };
  const rename = (s) => {
    const next = { ...repo.json(path), slug: s };
    apply(repo, renameVideo(repo, slug, next), "videos");
    go("videos", s);
  };
  const pick = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try {
      const p = await uploadPicture(f);
      if (p) set({ poster: p.replace(/^\/+/, "") });
    } finally {
      setBusy(false);
    }
  };
  const thumb = thumbOf(v);
  return (
    <aside className="panel preview-col" aria-label="Video">
      <div className="panel-head">
        <h2>Video</h2>
        <span className="grow" />
        <a className="btn ghost sm" href={STAGING_URL + watchUrl(v.slug)} target="_blank" rel="noreferrer">
          View
        </a>
        <button className="btn ghost sm" onClick={() => go("videos")}>
          Close
        </button>
      </div>
      <div className="panel-body">
        <div className="video-still">{thumb ? <img src={thumb} alt="" /> : null}</div>
        <Field label="Title">
          <input className="input" value={v.name || ""} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Description">
          <textarea className="textarea" rows={3} value={v.description || ""} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <Field label="Act">
          <select className="select" value={v.act} onChange={(e) => set({ act: e.target.value })}>
            {actsOf(repo).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid2">
          <Field label="YouTube ID">
            <Committed mono value={v.id || ""} problem={(x) => (!youtubeId(x) && !v.file ? "Required" : null)} onApply={(x) => set({ id: youtubeId(x) || null })} />
          </Field>
          <Field label="Date">
            <input className="input mono" type="date" value={v.uploadDate || ""} onChange={(e) => e.target.value && set({ uploadDate: e.target.value })} />
          </Field>
        </div>
        <div className="grid2">
          <Field label="Length">
            <Committed mono value={mmss(v.duration)} problem={(x) => (isoDuration(x) ? null : "Invalid")} onApply={(x) => set({ duration: isoDuration(x) })} />
          </Field>
          <span />
        </div>
        <Field label="URL">
          <Committed
            mono
            value={watchUrl(v.slug)}
            problem={(x) => slugProblem(repo, slugFromUrl(x, "video"), v.slug, "video")}
            onApply={(x) => {
              const s = slugFromUrl(x, "video");
              if (s !== v.slug) rename(s);
            }}
          />
        </Field>
        <div className="field">
          <span className="flabel">Poster</span>
          <div className="img-field">
            {v.poster ? <img className="img-thumb" src={previewUrl(v.poster)} alt="" /> : <span className="img-thumb" />}
            <div className="img-side">
              <span className="mono muted">{v.poster || "YouTube"}</span>
              <div className="row">
                <button type="button" className="btn sm" disabled={busy} onClick={() => file.current && file.current.click()}>
                  {busy ? "Uploading" : "Upload"}
                </button>
                {v.poster ? (
                  <button type="button" className="btn sm ghost" onClick={() => set({ poster: null })}>
                    Remove
                  </button>
                ) : null}
              </div>
              <input ref={file} type="file" accept="image/*" hidden onChange={pick} />
            </div>
          </div>
        </div>
        <div>
          <button className="btn danger sm" onClick={() => ask({ render: (close) => <DeleteVideo slug={slug} close={close} /> })}>
            Delete video
          </button>
        </div>
      </div>
    </aside>
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

function NewVideo({ close }) {
  const repo = session.repo;
  const acts = actsOf(repo);
  const [name, setName] = useState("");
  const [yt, setYt] = useState("");
  const [act, setAct] = useState(acts[0] && acts[0].id);
  const [len, setLen] = useState("");
  const slug = slugify(name);
  const problem = slug ? slugProblem(repo, slug, null, "video") : null;
  const id = youtubeId(yt);
  const duration = isoDuration(len);
  const ready = name.trim() && slug && !problem && id && act && duration;
  const ok = () => {
    if (!ready) return;
    const red = freeUrl(repo, watchUrl(slug));
    if (red) repo.set("content/redirects.json", serialize(red));
    repo.set(videoPath(slug), serialize(newVideo(repo, { name: name.trim(), slug, id, act, duration })));
    close(null);
    go("videos", slug);
  };
  return (
    <Modal title="New video" onClose={() => close(null)} foot={<Foot close={close} ok={ok} label="Create" disabled={!ready} />}>
      <Field label="Title" error={problem}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <Field label="YouTube ID">
        <input className="input mono" value={yt} onChange={(e) => setYt(e.target.value)} />
      </Field>
      <div className="grid2">
        <Field label="Act">
          <select className="select" value={act} onChange={(e) => setAct(e.target.value)}>
            {acts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Length" error={len && !duration ? "Invalid" : null}>
          <input className="input mono" value={len} onChange={(e) => setLen(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function DeleteVideo({ slug, close }) {
  const repo = session.repo;
  const v = repo.json(videoPath(slug));
  const a = repo.json(`content/acts/${v.act}.json`);
  const [to, setTo] = useState(a && a.page ? "/" + a.page : "/video/");
  const target = normPath(to);
  const exists = target && pageByPath(repo, target);
  const ok = () => {
    if (!exists) return;
    apply(repo, deleteVideo(repo, slug, target));
    close(null);
    toast("Deleted");
    go("videos");
  };
  return (
    <Modal title={`Delete ${v.name}`} onClose={() => close(null)} foot={<Foot close={close} ok={ok} label="Delete" danger disabled={!exists} />}>
      <Field label="Redirect to" error={to && !exists ? "No such page" : null}>
        <input className="input mono" value={to} onChange={(e) => setTo(e.target.value)} autoFocus />
      </Field>
    </Modal>
  );
}
