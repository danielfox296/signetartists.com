/* A section's or block's width: Narrow, Wide, Full or a width of its own,
   and its alignment, in the fields on the right; and a handle on the right
   edge of the selected one on the canvas that drags its width, snapping to
   Narrow, Wide and Full. Both write the style its box keeps (lib/widths.js). */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createUsePuck, FieldLabel } from "@puckeditor/core";
import { getPath, MIN, NARROW, readWidth, roundRem, setWidth, WIDE } from "../lib/widths.js";

const usePuck = createUsePuck();

const PRESETS = [
  ["narrow", "Narrow"],
  ["wide", "Wide"],
  ["full", "Full"],
  ["custom", "Custom"],
];
const ALIGN = [
  ["left", "Left"],
  ["center", "Center"],
];
const NAME = { narrow: "Narrow", wide: "Wide", full: "Full" };

// ------------------------------------------------------------ the canvas

const canvasDoc = () => {
  const f = document.querySelector(".pe-canvas iframe");
  return f && f.contentDocument;
};

// The element an item's width applies to, inside the box Puck draws the
// item in: a section's column, else the item itself; a call to action's
// words; Puck's box where the item is markup with no box of its own.
export function boxOf(doc, id, type, w) {
  if (!doc || !id) return null;
  const outer = doc.querySelector(`[data-puck-component="${CSS.escape(id)}"]`);
  if (!outer) return null;
  const win = doc.defaultView;
  let root = outer.firstElementChild;
  if (root && win.getComputedStyle(root).display === "contents") root = null;
  if (!root) return outer;
  // (A section switched off in the act page layout sits in a faded box of its own.)
  if (w.kind === "section") return root.querySelector(":scope > .wrap, :scope > section > .wrap") || root;
  if (type === "CloseRow") {
    const words = root.firstElementChild;
    return words && words.tagName === "DIV" && !words.classList.contains("btn-row") ? words : root;
  }
  return root;
}

// What the canvas shows: the box's width in rem, whether it fills what
// holds it, and whether it sits centred in it.
export function measure(box, w) {
  if (!box) return {};
  const win = box.ownerDocument.defaultView;
  const px = (v) => parseFloat(v) || 0;
  const cs = win.getComputedStyle(box);
  const r = box.getBoundingClientRect();
  const inner = w.kind === "img" || cs.boxSizing === "border-box" ? r.width : r.width - px(cs.paddingLeft) - px(cs.paddingRight) - px(cs.borderLeftWidth) - px(cs.borderRightWidth);
  const parent = box.parentElement;
  const ps = win.getComputedStyle(parent);
  const pr = parent.getBoundingClientRect();
  const left = pr.left + px(ps.paddingLeft) + px(ps.borderLeftWidth);
  const right = pr.right - px(ps.paddingRight) - px(ps.borderRightWidth);
  // The room a box has: what holds it, less the box's own padding where its width leaves that out.
  const room = right - left - (r.width - inner);
  const rootPx = px(win.getComputedStyle(box.ownerDocument.documentElement).fontSize) || 16;
  const gapL = r.left - left;
  const gapR = right - r.right;
  return {
    rem: roundRem(inner / rootPx),
    full: inner >= room - 1,
    centred: Math.abs(gapL - gapR) < 2 && gapL > 2,
    right: gapR < 2 && gapL > 2,
    px: inner,
    room,
    rootPx,
  };
}

function useReplace() {
  const getSelector = usePuck((s) => s.getSelectorForId);
  const dispatch = usePuck((s) => s.dispatch);
  return (item, props) => {
    const sel = getSelector(item.props.id);
    if (!sel || props === item.props) return;
    dispatch({ type: "replace", destinationIndex: sel.index, destinationZone: sel.zone, data: { ...item, props } });
  };
}

// ------------------------------------------------------------ the field

function RemInput({ value, onCommit, readOnly }) {
  const [v, setV] = useState(value == null ? "" : String(value));
  useEffect(() => setV(value == null ? "" : String(value)), [value]);
  const commit = () => {
    const n = Number(v);
    if (!v || !Number.isFinite(n)) return setV(value == null ? "" : String(value));
    const rem = Math.max(MIN.box, roundRem(n));
    if (rem !== value) onCommit(rem);
    else setV(String(value));
  };
  return (
    <div className="w-rem">
      <input
        className="input sm"
        type="number"
        min={MIN.box}
        step="0.5"
        value={v}
        readOnly={readOnly}
        aria-label="Width in rem"
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setV(value == null ? "" : String(value));
        }}
      />
      <span>rem</span>
    </div>
  );
}

export function WidthInput({ field, readOnly }) {
  const selected = usePuck((s) => s.selectedItem);
  const replace = useReplace();
  const w = field.width;
  // What the canvas shows, read again as it changes (a new viewport, an edit).
  const [measured, setMeasured] = useState({});
  const id = selected && selected.props.id;
  // Custom opens the width in rem, written once one is entered.
  const [custom, setCustom] = useState(false);
  const stored = selected ? JSON.stringify(getPath(selected.props, w.prop) || "") + selected.props.narrow : "";
  useEffect(() => setCustom(false), [id, stored]);
  useEffect(() => {
    if (!id) return;
    const read = () => {
      const m = measure(boxOf(canvasDoc(), id, selected.type, w), w);
      setMeasured((o) => (o.rem === m.rem && o.full === m.full && o.centred === m.centred ? o : m));
    };
    read();
    const t = setInterval(read, 400);
    return () => clearInterval(t);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!selected) return null;
  const cur = readWidth(selected, w, measured);
  const preset = custom ? "custom" : cur.preset;
  const set = (to) => replace(selected, setWidth(selected, w, { ...to, measured }, selected.type));
  const showAlign = preset && preset !== "full" && !(w.kind === "section" && preset === "wide");
  return (
    <>
      <FieldLabel label="Width" el="div" readOnly={readOnly}>
        <div className="w-field">
          <div className="seg w-seg" role="group" aria-label="Width">
            {PRESETS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                disabled={readOnly}
                aria-pressed={String(preset === k)}
                onClick={() => (k === "custom" ? setCustom(true) : (setCustom(false), set({ preset: k })))}
              >
                {label}
              </button>
            ))}
          </div>
          {preset === "custom" ? <RemInput value={cur.rem} readOnly={readOnly} onCommit={(rem) => set({ preset: "custom", rem })} /> : null}
        </div>
      </FieldLabel>
      {showAlign ? (
        <div className="w-align">
          <FieldLabel label="Alignment" el="div" readOnly={readOnly}>
            <div className="seg w-seg" role="group" aria-label="Alignment">
              {ALIGN.map(([k, label]) => (
                <button key={k} type="button" disabled={readOnly} aria-pressed={String(cur.align === k)} onClick={() => set({ align: k })}>
                  {label}
                </button>
              ))}
            </div>
          </FieldLabel>
        </div>
      ) : null}
    </>
  );
}

export const widthField = (width) => ({ type: "custom", label: "Width", render: WidthInput, width });

// ------------------------------------------------------------ the handle

// Where a drag lands: Full at the edge of what holds the box, Narrow and
// Wide within a rem of their widths, else to the half rem.
function snap(px, start) {
  if (px >= start.room - 2) return { preset: "full" };
  const rem = px / start.rootPx;
  if (Math.abs(rem - NARROW) <= 1) return { preset: "narrow" };
  if (Math.abs(rem - WIDE) <= 1 && WIDE * start.rootPx < start.room - 2) return { preset: "wide" };
  return { preset: "custom", rem: Math.max(start.min, roundRem(rem)) };
}
const remFor = (to) => (to.preset === "narrow" ? NARROW : to.preset === "wide" ? WIDE : to.rem);

// The selected section's or block's right edge, in the canvas (rendered by
// the canvas override, inside the frame).
export function WidthHandle({ doc }) {
  const selected = usePuck((s) => s.selectedItem);
  const config = usePuck((s) => s.config);
  const isDragging = usePuck((s) => s.appState.ui.isDragging);
  const replace = useReplace();
  const def = selected && config.components[selected.type];
  const field = def && def.fields && def.fields._width;
  const w = field && field.width;
  const id = selected && selected.props.id;
  const latest = useRef(null);
  latest.current = { selected, w };
  const [pos, setPos] = useState(null);
  const [label, setLabel] = useState(null);
  const handle = useRef(null);
  const shown = !!(doc && pos && !isDragging);

  // Follow the box as the page lays out, scrolls and changes.
  useEffect(() => {
    if (!doc || !id || !w) return setPos(null);
    const win = doc.defaultView;
    let raf;
    const tick = () => {
      const { selected: it } = latest.current;
      const box = it && boxOf(doc, it.props.id, it.type, w);
      const r = box && box.getBoundingClientRect();
      // At the edge the width is measured to: a section's column ends where its words do.
      const cs = box && win.getComputedStyle(box);
      const pad = cs && cs.boxSizing === "content-box" && w.kind !== "img" ? (parseFloat(cs.paddingRight) || 0) + (parseFloat(cs.borderRightWidth) || 0) : 0;
      const next = r && r.width && r.height ? { x: Math.round(r.right - pad + win.scrollX), y: Math.round(r.top + win.scrollY), h: Math.round(r.height) } : null;
      setPos((p) => (p && next && p.x === next.x && p.y === next.y && p.h === next.h ? p : next));
      raf = win.requestAnimationFrame(tick);
    };
    tick();
    return () => win.cancelAnimationFrame(raf);
  }, [doc, id, w]);

  // Drag: the box is drawn at the new width as it goes; the width is written once, on letting go.
  useEffect(() => {
    const el = handle.current;
    if (!el) return;
    const stop = (e) => e.stopPropagation();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const { selected: it, w: wd } = latest.current;
      const box = it && boxOf(doc, it.props.id, it.type, wd);
      if (!box) return;
      const m = measure(box, wd);
      const start = { x: e.clientX, px: m.px, room: m.room, rootPx: m.rootPx, min: wd.kind === "img" ? MIN.img : MIN.box, both: m.centred || m.right, attr: box.getAttribute("style") };
      let to = null;
      el.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const px = start.px + (start.both ? 2 : 1) * (ev.clientX - start.x);
        to = snap(px, start);
        const css = to.preset === "full" ? (wd.kind === "img" ? "100%" : "none") : `${remFor(to)}rem`;
        if (wd.kind === "img") (box.style.width = css), (box.style.height = "auto");
        else box.style.maxWidth = css;
        // A column that sat at the window's right edge is centred once its width is set.
        if (m.right) (box.style.marginLeft = "auto"), (box.style.marginRight = "auto");
        setLabel(to.preset === "custom" ? `${to.rem} rem` : NAME[to.preset]);
      };
      const up = () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        setLabel(null);
        if (start.attr == null) box.removeAttribute("style");
        else box.setAttribute("style", start.attr);
        const now = latest.current.selected;
        if (to && now) replace(now, setWidth(now, wd, { ...to, measured: m }, now.type));
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("mousedown", stop);
    el.addEventListener("click", stop);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("mousedown", stop);
      el.removeEventListener("click", stop);
    };
  }, [shown, doc]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!shown) return null;
  return createPortal(
    <div ref={handle} className="w-handle" style={{ left: pos.x, top: pos.y, height: pos.h }}>
      {label ? <span className="w-read">{label}</span> : null}
    </div>,
    doc.body
  );
}

// The handle's look, for the canvas's own stylesheet.
export const HANDLE_CSS = `.w-handle{position:absolute;z-index:5;width:16px;margin-left:-8px;cursor:ew-resize;touch-action:none}
.w-handle::before{content:"";position:absolute;left:6px;top:0;bottom:0;width:4px;border-radius:2px;background:#86ace6;box-shadow:0 0 0 1px rgba(0,0,0,.35)}
.w-handle::after{content:"";position:absolute;left:2px;top:50%;width:12px;height:32px;margin-top:-16px;border-radius:6px;background:#86ace6;box-shadow:0 0 0 1px rgba(0,0,0,.35)}
.w-read{position:absolute;right:20px;top:50%;transform:translateY(-50%);z-index:1;background:#86ace6;color:#14130e;font:600 12px/1 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;padding:6px 8px;border-radius:6px;white-space:nowrap;pointer-events:none}`;
