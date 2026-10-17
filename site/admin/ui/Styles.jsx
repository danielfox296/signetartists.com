/* Site styles: the colours, the type sizes and the corners, kept in
   content/styles.json and written into the stylesheet when staging builds.
   Each text colour shows its contrast against the grounds it sits on. */
import { useEffect, useState } from "react";
import { COLORS, stylesheet, stylesOf } from "../../src/build/styles.js";
import { STAGING_URL } from "../config.js";
import { b64ToBytes, fromUtf8 } from "../lib/github.js";
import { pageContext, serialize, STYLES } from "../lib/site.js";
import { session, useRepo } from "../state.js";
import { Seg } from "./common.jsx";
import { assetUrl } from "./fields.jsx";
import { useSite } from "./Acts.jsx";
import { SiteFrame, WIDTHS } from "./Preview.jsx";
import { Item } from "../../src/components/registry.jsx";
import { Body } from "../../src/components/layout.jsx";

const PREFIX = STAGING_URL + "/";

const NAMES = {
  "--paper": "Background",
  "--paper-sunk": "Band",
  "--rule": "Rule",
  "--rule-strong": "Border",
  "--ink": "Text",
  "--ink-soft": "Text secondary",
  "--ink-faint": "Text muted",
  "--brass": "Accent",
  "--brass-bright": "Accent light",
};
// What each colour is checked for, against both grounds.
const TEXT = ["--ink", "--ink-soft", "--ink-faint", "--brass", "--brass-bright"];
const NEED = { text: 4.5, border: 3 };

function luminance(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  if (x == null || y == null) return null;
  const [hi, lo] = x > y ? [x, y] : [y, x];
  return (hi + 0.05) / (lo + 0.05);
}

// The stylesheet as the repo has it, read once per staging commit.
let source = { head: null, text: null };
async function readStylesheet() {
  const head = session.repo.head;
  if (source.head === head && source.text) return source.text;
  const api = session.api;
  const c = await api.commit(head);
  const t = await api.tree(c.tree.sha, false);
  const e = t.tree.find((x) => x.path === "styles.css");
  if (!e) throw new Error("No styles.css");
  const text = fromUtf8(b64ToBytes((await api.blob(e.sha)).content));
  source = { head, text };
  return text;
}

// The stylesheet as the preview frame loads it: links to its fonts made whole.
const forFrame = (css) => css.replace(/url\((["']?)(?!https?:|data:|\/)([^)"']+)\1\)/g, (_, q, u) => `url(${q}${PREFIX}${u}${q})`);

export function StylesScreen() {
  useRepo();
  const site = useSite();
  const [css, setCss] = useState(source.text);
  const [err, setErr] = useState(null);
  const [device, setDevice] = useState("desktop");
  const head = session.repo.head;
  useEffect(() => {
    let alive = true;
    readStylesheet()
      .then((t) => alive && setCss(t))
      .catch((e) => alive && setErr(e));
    return () => {
      alive = false;
    };
  }, [head]);
  if (err) return <div className="screen"><p className="warn-line">{String(err.message || err)}</p></div>;
  if (!css || site.error) return <div className="screen"><p className="muted">Loading</p></div>;

  const base = stylesOf(css);
  const stored = session.repo.json(STYLES) || {};
  const cur = { colors: { ...base.colors, ...(stored.colors || {}) }, type: { ...base.type, ...(stored.type || {}) }, corners: stored.corners ?? base.corners };
  const write = (next) => {
    const out = {};
    for (const k of Object.keys(stored)) if (k in next) out[k] = next[k];
    for (const k of Object.keys(next)) if (!(k in out)) out[k] = next[k];
    const text = serialize(out);
    if (text !== session.repo.get(STYLES)) session.repo.set(STYLES, text, "styles");
  };
  const setColor = (k, v) => write({ ...cur, colors: { ...cur.colors, [k]: v.toLowerCase() } });
  const setType = (k, v) => write({ ...cur, type: { ...cur.type, [k]: v } });
  const grounds = [cur.colors["--paper"], cur.colors["--paper-sunk"]];
  const worst = (c) => Math.min(...grounds.map((g) => contrast(c, g) || 0));
  const isBase = JSON.stringify(cur) === JSON.stringify(base);

  const home = site.m.pages.find((d) => d.root.props.path === "/") || site.m.pages[0];
  const ctx = pageContext(site, home, { prefix: PREFIX, assetUrl });

  return (
    <div className="screen act-screen">
      <div className="screen-head">
        <h1>Site styles</h1>
        <span className="grow" />
        <button className="btn" disabled={isBase} onClick={() => write(base)}>
          Reset
        </button>
      </div>
      <div className="split">
        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2>Colours</h2>
            </div>
            <div className="panel-body">
              {COLORS.map((k) => {
                const v = cur.colors[k];
                const kind = TEXT.includes(k) ? "text" : k === "--rule-strong" ? "border" : null;
                const r = kind ? worst(v) : null;
                return (
                  <div className="swatch" key={k}>
                    <input type="color" aria-label={NAMES[k]} value={/^#[0-9a-f]{6}$/i.test(v) ? v : "#000000"} onChange={(e) => setColor(k, e.target.value)} />
                    <div className="swatch-name">
                      <b>{NAMES[k]}</b>
                      <HexIn value={v} onChange={(x) => setColor(k, x)} />
                    </div>
                    {r != null ? <span className={"badge " + (r >= NEED[kind] ? "live" : "wait")}>{r.toFixed(1)}:1</span> : <span />}
                  </div>
                );
              })}
            </div>
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>Type</h2>
            </div>
            <div className="panel-body">
              <Slider label="Headings" value={cur.type.headings} min={80} max={130} step={5} unit="%" onChange={(v) => setType("headings", v)} />
              <Slider label="Body" value={cur.type.body} min={85} max={120} step={5} unit="%" onChange={(v) => setType("body", v)} />
            </div>
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>Corners</h2>
            </div>
            <div className="panel-body">
              <Slider label="Radius" value={cur.corners} min={0} max={16} step={1} unit="px" onChange={(v) => write({ ...cur, corners: v })} />
            </div>
          </section>
        </div>
        <aside className="preview-col">
          <div className="prev-tools">
            <Seg sm options={[{ value: "desktop", label: "Desktop" }, { value: "phone", label: "Phone" }]} value={device} onChange={setDevice} />
          </div>
          <div className={"prev-frame " + device}>
            <SiteFrame key={"styles-" + device} ctx={ctx} width={WIDTHS[device]} height={device === "phone" ? 1500 : 1400} css={forFrame(stylesheet(css, cur))} label="Site styles">
              <Body nav="" trail={null} output="index.html" hubs={site.hubs} indexed={false}>
                {home.content.slice(0, 4).map((x) => (
                  <Item key={x.props.id} c={x} />
                ))}
              </Body>
            </SiteFrame>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, unit, onChange }) {
  return (
    <label className="field">
      <span className="flabel">
        {label}
        <span className="fright mono">
          {value}
          {unit}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

// A colour typed as hex, applied once it is a whole colour.
function HexIn({ value, onChange }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      className="input mono sm"
      value={v}
      aria-label="Hex"
      spellCheck={false}
      onChange={(e) => {
        const x = e.target.value.trim();
        setV(x);
        if (/^#[0-9a-f]{6}$/i.test(x)) onChange(x);
      }}
      onBlur={() => setV(value)}
    />
  );
}
