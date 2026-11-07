/* Media: every picture under img/, where each one is used, uploads, and
   replacing a picture with another everywhere it is used. */
import { useMemo, useRef, useState } from "react";
import { STAGING_URL } from "../config.js";
import { fileLabel } from "../lib/labels.js";
import { isPicture, replacePlan, usesIndex } from "../lib/media.js";
import { serialize, slugOf } from "../lib/site.js";
import { ask, go, session, toast, useRepo } from "../state.js";
import { Modal } from "./common.jsx";
import { place, uploadPicture, uploads } from "./fields.jsx";

// A picture as the admin can show it: an upload not yet built, or staging.
export const pictureUrl = (path) => {
  const up = uploads.get(path);
  if (up) return up.url;
  const local = session.repo.localUrl(path);
  return local || `${STAGING_URL}/${path}`;
};
// The small copy where the site has one.
const thumbUrl = (path) => {
  const t = `img/thumbs/${path.split("/").pop()}`;
  return session.repo.has(t) && !uploads.has(path) ? `${STAGING_URL}/${t}` : pictureUrl(path);
};
const folderOf = (path) => (path.split("/").length > 2 ? path.split("/")[1] : "");

// Where a file is edited.
function routeOf(file) {
  if (file.startsWith("content/pages/")) return ["page", slugOf(file)];
  if (file.startsWith("content/posts/")) return ["post", slugOf(file)];
  if (file.startsWith("content/acts/")) return ["act", slugOf(file)];
  if (file.startsWith("content/videos/")) return ["videos", slugOf(file)];
  if (file === "content/shared/header.json") return ["header"];
  if (file === "content/shared/footer.json") return ["footer"];
  if (file === "content/shared/logo-strip.json") return ["logos"];
  if (file.startsWith("content/layouts/")) return file.endsWith("act-page.json") ? ["layout"] : ["layouts"];
  return null;
}

function useUses() {
  const rev = useRepo();
  return useMemo(() => usesIndex(session.repo), [rev]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function MediaScreen() {
  useRepo();
  const repo = session.repo;
  const uses = useUses();
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("");
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const all = repo.list("img/").filter(isPicture);
  const folders = [...new Set(all.map(folderOf))].sort();
  const shown = all.filter((p) => (!folder || folderOf(p) === (folder === "/" ? "" : folder)) && (!q || p.toLowerCase().includes(q.toLowerCase())));
  const open = sel && repo.has(sel) ? sel : null;
  const upload = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    place.label = "Media";
    try {
      const p = await uploadPicture(f);
      if (p) setSel(p.replace(/^\/+/, ""));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="screen act-screen">
      <div className="screen-head">
        <h1>Media</h1>
        <span className="grow" />
        <button className="btn primary" disabled={busy} onClick={() => input.current && input.current.click()}>
          {busy ? "Uploading" : "Upload"}
        </button>
        <input ref={input} type="file" accept="image/*" hidden onChange={upload} />
      </div>
      <div className="toolbar">
        <input className="input" type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search media" />
        <select className="select" style={{ width: "auto" }} aria-label="Folder" value={folder} onChange={(e) => setFolder(e.target.value)}>
          <option value="">All folders</option>
          {folders.map((f) => (
            <option key={f || "/"} value={f || "/"}>
              {f || "img/"}
            </option>
          ))}
        </select>
        <span className="muted">{shown.length}</span>
      </div>
      <div className={open ? "list-split" : ""}>
        <div className="media-lib">
          {shown.map((p) => (
            <button key={p} type="button" aria-pressed={String(p === open)} onClick={() => setSel(p)}>
              <img src={thumbUrl(p)} alt="" loading="lazy" />
              <span>{p.slice(4)}</span>
              {(uses.get(p) || []).length ? null : <i className="badge draft">Unused</i>}
            </button>
          ))}
        </div>
        {open ? <PictureInfo key={open} path={open} uses={uses.get(open) || []} onClose={() => setSel(null)} onReplaced={setSel} /> : null}
      </div>
    </div>
  );
}

function PictureInfo({ path, uses, onClose, onReplaced }) {
  const repo = session.repo;
  const [size, setSize] = useState(null);
  return (
    <aside className="panel side-col" aria-label="Picture">
      <div className="panel-head">
        <h2 className="ellipsis">{path.split("/").pop()}</h2>
        <span className="grow" />
        <button className="btn ghost sm" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="panel-body">
        <img className="media-big" src={pictureUrl(path)} alt="" onLoad={(e) => setSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} />
        <div className="mono muted small">
          {path}
          {size ? ` · ${size.width}×${size.height}` : ""}
        </div>
        <div className="field">
          <span className="flabel">Used on</span>
          {uses.length ? (
            <div className="stack used-on">
              {uses.map((f) => {
                const r = routeOf(f);
                const label = fileLabel(f, repo.get(f));
                return r ? (
                  <button key={f} className="btn ghost sm" onClick={() => go(...r)}>
                    {label}
                  </button>
                ) : (
                  <span key={f} className="muted">
                    {label}
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="muted">Unused</p>
          )}
        </div>
        {uses.length ? (
          <div>
            <button className="btn" onClick={() => ask({ render: (close) => <ReplaceDialog from={path} close={close} onDone={onReplaced} /> })}>
              Replace everywhere
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

// The size of a picture, from staging or the upload.
function sizeOf(path) {
  const up = uploads.get(path);
  if (up) return Promise.resolve({ width: up.width, height: up.height });
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve({ width: im.naturalWidth, height: im.naturalHeight });
    im.onerror = () => resolve(null);
    im.src = pictureUrl(path);
  });
}

function ReplaceDialog({ from, close, onDone }) {
  const repo = session.repo;
  const [q, setQ] = useState("");
  const [to, setTo] = useState(null);
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const all = repo.list("img/").filter((p) => isPicture(p) && p !== from && (!q || p.toLowerCase().includes(q.toLowerCase())));
  const replace = async (target) => {
    setBusy(true);
    try {
      const size = await sizeOf(target);
      const changes = replacePlan(repo, from, target, size);
      for (const [f, doc] of changes) repo.set(f, serialize(doc));
      close(null);
      toast("Replaced");
      onDone(target);
    } finally {
      setBusy(false);
    }
  };
  const upload = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    place.label = fileLabel(from, null);
    const p = await uploadPicture(f);
    if (p) replace(p.replace(/^\/+/, ""));
  };
  return (
    <Modal
      wide
      title="Replace everywhere"
      onClose={() => close(null)}
      foot={
        <>
          <button className="btn" disabled={busy} onClick={() => input.current && input.current.click()}>
            Upload
          </button>
          <input ref={input} type="file" accept="image/*" hidden onChange={upload} />
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={() => close(null)}>
            Cancel
          </button>
          <button className="btn primary" disabled={!to || busy} onClick={() => replace(to)}>
            Replace
          </button>
        </>
      }
    >
      <input className="input" type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search media" autoFocus />
      <div className="media-lib pick">
        {all.map((p) => (
          <button key={p} type="button" aria-pressed={String(p === to)} onClick={() => setTo(p)}>
            <img src={thumbUrl(p)} alt="" loading="lazy" />
            <span>{p.slice(4)}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

