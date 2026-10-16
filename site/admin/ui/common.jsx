/* Pieces every screen uses: the four kinds and their colours, dialogs,
   the toast. */
import { useEffect, useRef, useState } from "react";
import { ui, useUi } from "../state.js";

// The four kinds of thing on the site, as the prototype colours them.
// Sections that draw from act, post or video files are data; the parts
// every page shares are shared; layouts arrive in phase 6.
const DATA = new Set(["ActCards", "Cards", "Roster", "Setlist", "ActSizes", "SongCatalog", "VideoIndex", "BlogList", "BlogPosts", "AllPages", "PageIndex", "PagesAndPosts", "ActVideo"]);
const SHARED = new Set(["LogoStrip"]);
export const kindOf = (type) => (SHARED.has(type) ? "shared" : DATA.has(type) ? "data" : "page");
export const KIND_LABEL = { page: "Page", shared: "Shared", data: "Data", layout: "Layout" };

export function Badge({ kind, children }) {
  return <span className={"badge " + kind}>{children || KIND_LABEL[kind]}</span>;
}

export function Modal({ title, onClose, children, foot, wide }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={wide ? null : { width: "min(480px, calc(100% - 32px))" }}>
        <div className="modal-head">
          <h2>{title}</h2>
        </div>
        <div className="modal-body">{children}</div>
        {foot ? <div className="modal-foot">{foot}</div> : null}
      </div>
    </>
  );
}

export function Field({ label, children, error }) {
  return (
    <label className={"field" + (error ? " has-error" : "")}>
      <span className="flabel">
        {label}
        {error ? <span className="ferr">{error}</span> : null}
      </span>
      {children}
    </label>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="sw" />
      {label ? <span>{label}</span> : null}
    </label>
  );
}

// A question for the person, from ask() in state.js.
export function DialogHost() {
  const d = useUi((s) => s.dialog);
  if (!d) return null;
  if (d.render) return d.render(d.resolve);
  return (
    <Modal
      title={d.title}
      onClose={d.cancel === false ? undefined : () => d.resolve(null)}
      foot={
        <>
          <span style={{ flex: 1 }} />
          {(d.buttons || []).map((b, i) => (
            <button key={i} className={"btn" + (b.primary ? " primary" : "") + (b.danger ? " danger" : "")} onClick={() => d.resolve(b.value)}>
              {b.label}
            </button>
          ))}
        </>
      }
    >
      {d.body}
    </Modal>
  );
}

export function Toast() {
  const t = useUi((s) => s.toast);
  return t ? (
    <div className="toast" role="status">
      {t}
    </div>
  ) : null;
}

export function useOutside(onOut) {
  const ref = useRef(null);
  useEffect(() => {
    const f = (e) => ref.current && !ref.current.contains(e.target) && onOut();
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, [onOut]);
  return ref;
}

export function useNow(ms = 30000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

export const clock = (t) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
export const when = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString() ? clock(d) : d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + clock(d);
};

export const closeDialog = () => ui.set({ dialog: null });
