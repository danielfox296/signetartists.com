/* Pieces every screen uses: the four kinds and their colours, dialogs,
   the toast. */
import { useEffect, useRef, useState } from "react";
import { ui, useUi } from "../state.js";

// The four kinds of thing on the site, as the prototype colours them.
// Sections that draw from act, post or video files are data; the parts
// every page shares are shared; layouts arrive in phase 6.
const DATA = new Set(["ActCards", "Cards", "Roster", "Setlist", "ActSizes", "ActHeader", "ActAbout", "ActClose", "ActOwn", "SongCatalog", "VideoIndex", "BlogList", "BlogPosts", "AllPages", "PageIndex", "PagesAndPosts", "ActVideo"]);
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
        {children ? <div className="modal-body">{children}</div> : null}
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

// ------------------------------------------------------------ small controls

export function Seg({ options, value, onChange, sm, label }) {
  return (
    <div className={"seg" + (sm ? " sm" : "")} role="group" aria-label={label || undefined}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={String(o.value === value)} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Choices to tick: several, or with `single` one.
export function Chips({ options, value, onToggle, single }) {
  const on = (v) => (single ? value === v : (value || []).includes(v));
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o.value} type="button" className="chip" aria-pressed={String(on(o.value))} onClick={() => onToggle(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Meter({ n, max }) {
  return (
    <div className={"meter" + (n > max ? " over" : "")}>
      <i>
        <b style={{ width: Math.min(100, (n / max) * 100) + "%" }} />
      </i>
      <span>
        {n}/{max}
      </span>
    </div>
  );
}

export function Stepper({ value, min = 1, max = 20, onChange, label }) {
  return (
    <div className="stepper" role="group" aria-label={label || undefined}>
      <button type="button" aria-label="Fewer" onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <span>{value}</span>
      <button type="button" aria-label="More" onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </div>
  );
}

// A text input that writes on every keystroke but shows what was typed,
// even while the file it writes to is re-read.
export function TextIn({ value, onChange, className = "input", area, ...rest }) {
  const Tag = area ? "textarea" : "input";
  return <Tag className={area ? "textarea" : className} value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

// Rows that can be dragged into a new order. `row` makes an element a
// place to drop; `handle` is what is dragged, and moves with Alt and the
// arrow keys too. A row with no fields in it can be both.
export function useDragRows(onMove) {
  const [drag, setDrag] = useState(null); // {from, over, key}
  const row = (i, key) => ({
    onDragOver: (e) => {
      if (!drag || drag.key !== key) return;
      e.preventDefault();
      if (drag.over !== i) setDrag({ ...drag, over: i });
    },
    onDrop: (e) => {
      if (!drag || drag.key !== key) return;
      e.preventDefault();
      if (drag.from !== i) onMove(drag.from, i, key);
      setDrag(null);
    },
  });
  const handle = (i, key) => ({
    draggable: true,
    onDragStart: (e) => {
      setDrag({ from: i, over: null, key });
      e.dataTransfer.effectAllowed = "move";
      try {
        e.dataTransfer.setData("text/plain", String(i));
      } catch {
        /* nothing */
      }
    },
    onDragEnd: () => setDrag(null),
    onKeyDown: (e) => {
      if (!e.altKey) return;
      if (e.key === "ArrowUp") (e.preventDefault(), onMove(i, i - 1, key));
      if (e.key === "ArrowDown") (e.preventDefault(), onMove(i, i + 1, key));
    },
  });
  const over = (i, key) => !!drag && drag.key === key && drag.over === i && drag.from !== i;
  return { row, handle, over, dragging: (i, key) => !!drag && drag.key === key && drag.from === i };
}
