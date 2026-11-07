/* The site, drawn by its own components with its own stylesheet, in a frame
   of its own at a real desktop or phone width and scaled to fit. A card can
   be cut out of the page it sits on, at the size it has there. */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Site } from "../../src/components/parts.jsx";
import { STAGING_URL } from "../config.js";
import { session } from "../state.js";
import { FOCUS } from "../lib/acts.js";

const PREFIX = STAGING_URL + "/";
export const WIDTHS = { desktop: 1280, phone: 390 };

// Each photo's crop point, the way the build writes it.
function applyFocus(d) {
  const focus = (session.repo && session.repo.json(FOCUS)) || {};
  for (const img of d.querySelectorAll("img")) {
    const src = (img.getAttribute("src") || "").replace(PREFIX, "").replace(/^\/+/, "").split("?")[0];
    const pos = focus[src] || "";
    if (img.style.objectPosition !== pos) img.style.objectPosition = pos;
  }
}

export function SiteFrame({ ctx, width, height = 860, crop, children, label, css }) {
  const outer = useRef(null);
  const frame = useRef(null);
  const [mount, setMount] = useState(null);
  const [boxW, setBoxW] = useState(0);
  const [rect, setRect] = useState(null);

  useLayoutEffect(() => {
    const d = frame.current.contentDocument;
    d.open();
    // YouTube's player needs to be told which site embeds it.
    d.write('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="strict-origin"></head><body><div id="root"></div></body></html>');
    d.close();
    const l = d.createElement("link");
    l.rel = "stylesheet";
    l.href = PREFIX + "styles.css";
    d.head.appendChild(l);
    const st = d.createElement("style");
    st.textContent = "html{scroll-behavior:auto} body{background:#14130e}";
    d.head.appendChild(st);
    // Links inside the preview go nowhere.
    d.addEventListener("click", (e) => {
      if (e.target.closest && e.target.closest("a, button[type=submit]")) e.preventDefault();
    });
    const mo = new MutationObserver(() => applyFocus(d));
    mo.observe(d.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
    setMount(d.getElementById("root"));
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    if (mount) applyFocus(mount.ownerDocument);
  });

  // A stylesheet of its own, over staging's, while site styles are edited.
  useEffect(() => {
    if (!mount) return;
    const d = mount.ownerDocument;
    let st = d.getElementById("site-styles");
    if (!css) {
      if (st) st.remove();
      return;
    }
    if (!st) {
      st = d.createElement("style");
      st.id = "site-styles";
      d.head.appendChild(st);
    }
    if (st.textContent !== css) st.textContent = css;
  }, [mount, css]);

  useEffect(() => {
    const el = outer.current;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The part shown, measured in the frame; re-measured as it changes size.
  useEffect(() => {
    if (!mount || !crop) return setRect(null);
    const d = mount.ownerDocument;
    let ro;
    const measure = () => {
      const el = d.querySelector(crop);
      if (!el) return setRect(null);
      const r = el.getBoundingClientRect();
      const sy = d.defaultView.scrollY;
      setRect((o) => (o && o.x === r.left && o.y === r.top + sy && o.w === r.width && o.h === r.height ? o : { x: r.left, y: r.top + sy, w: r.width, h: r.height }));
    };
    const t = setInterval(measure, 400);
    const el = d.querySelector(crop);
    if (el && "ResizeObserver" in d.defaultView) {
      ro = new d.defaultView.ResizeObserver(measure);
      ro.observe(el);
    }
    measure();
    return () => {
      clearInterval(t);
      if (ro) ro.disconnect();
    };
  }, [mount, crop, children]);

  // The frame at its real width, scaled down to the box; a cut-out part is
  // moved to the box's corner.
  let s;
  let style;
  let inner;
  if (crop) {
    const r = rect || { x: 0, y: 0, w: width, h: 200 };
    s = boxW ? Math.min(1, boxW / r.w) : 1;
    style = { width, height: Math.max(height, r.y + r.h + 40), transform: `translate(${-r.x * s}px, ${-r.y * s}px) scale(${s})` };
    inner = { width: r.w * s, height: r.h * s };
  } else {
    s = boxW && width > boxW ? boxW / width : 1;
    style = { width, height, transform: s < 1 ? `scale(${s})` : undefined };
    inner = { width: width * s, height: height * s };
  }
  return (
    <div className="site-frame" ref={outer}>
      <div className="site-frame-in" style={inner}>
        <iframe ref={frame} title={label || "Preview"} style={style} />
      </div>
      {mount ? createPortal(<Site.Provider value={ctx}>{children}</Site.Provider>, mount) : null}
    </div>
  );
}
