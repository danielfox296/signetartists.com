/* One act: its words, photo and footage, the filters it is tagged with, its
   sizes and setlist, its page and how search shows it, beside its card and
   its page as the site draws them. Every field writes the act's file. */
import { useRef, useState } from "react";
import { CardGrid } from "../../src/components/blocks.jsx";
import { Body } from "../../src/components/layout.jsx";
import { Item } from "../../src/components/registry.jsx";
import { STAGING_URL } from "../config.js";
import {
  actOf,
  actPage,
  defaultPageUrl,
  deleteAct,
  deletePlan,
  duplicateAct,
  editAct,
  editPageProps,
  editRoster,
  FACETS,
  focusOf,
  laneOf,
  linkedFrom,
  LANE_LABEL,
  LANES,
  movePage,
  pageOff,
  pageOn,
  put,
  rosterOf,
  setFocus,
  sizeRange,
  toggleTag,
  VOCALS,
} from "../lib/acts.js";
import { normPath, pageByPath, pageContext, pathProblem } from "../lib/site.js";
import { ask, go, session, toast, useRepo } from "../state.js";
import { Chips, Field, Meter, Modal, Seg, Stepper, TextIn, Toggle } from "./common.jsx";
import { assetUrl, place, previewUrl, uploadPicture } from "./fields.jsx";
import { actImg, cardPlaces, Thumb, useSite } from "./Acts.jsx";
import { SiteFrame, WIDTHS } from "./Preview.jsx";

const PREFIX = STAGING_URL + "/";
const BRAND = " | Signet Artists";

function F({ label, right, children }) {
  return (
    <label className="field">
      <span className="flabel">
        {label}
        {right != null ? <span className="fright">{right}</span> : null}
      </span>
      {children}
    </label>
  );
}
function Group({ label, right, children }) {
  return (
    <div className="field">
      <div className="flabel">
        {label}
        {right != null ? <span className="fright">{right}</span> : null}
      </div>
      {children}
    </div>
  );
}

const words = (t) => String(t || "").split(/\s+/).filter(Boolean).length;
const firstLine = (t) => {
  const parts = String(t || "").trim().split(/(?<=[.!?])\s+/);
  let line = parts[0] || "";
  if (line.split(/\s+/).filter(Boolean).length < 12 && parts.length > 1) line += " " + parts[1];
  return line;
};
const moveIn = (list, i, d) => {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const l = list.slice();
  [l[i], l[j]] = [l[j], l[i]];
  return l;
};

// YouTube addresses become the privacy-mode embed the site uses.
export function videoUrl(u) {
  const t = String(u || "").trim();
  const m = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(t);
  if (m && !/youtube-nocookie\.com\/embed\//.test(t)) return `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0`;
  return t.replace(/^\/+/, "");
}

// ------------------------------------------------------------ the form

export function ActEditor({ id }) {
  useRepo();
  const repo = session.repo;
  const site = useSite();
  const [ptab, setPtab] = useState("card");
  const [device, setDevice] = useState("desktop");
  const file = actOf(repo, id);
  if (!file)
    return (
      <div className="screen">
        <p className="muted">No such act</p>
      </div>
    );
  const r = rosterOf(repo);
  const a = { ...file, onRoster: r.order.includes(id) };
  const off = a.hidden || !a.onRoster;
  const edit = (fn) => editAct(repo, id, fn);
  const set = (k) => (v) => edit((x) => put(x, k, v));
  const page = actPage(repo, a);
  const layoutPage = !!(page && page.doc.root.props.layout === "act");
  place.label = a.name;
  place.slug = null;
  const jump = (sid) => {
    const el = document.getElementById(sid);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Shown puts an act that isn't on the roster at its end.
  const showHide = () => {
    edit((x) => {
      if (off) delete x.hidden;
      else x.hidden = true;
    });
    if (off && !a.onRoster) editRoster(repo, (ro) => ro.order.push(id));
  };

  return (
    <div className="screen wide act-screen">
      <div className="edit-head">
        <Thumb a={a} cls="edit-thumb" />
        <div style={{ minWidth: 0 }}>
          <h1>{a.name || "Untitled act"}</h1>
          <div className="sub">{LANE_LABEL[laneOf(a)]}</div>
        </div>
        <div className="row">
          {a.status === "flagship" ? <span className="badge layout">Flagship</span> : null}
          {off ? <span className="badge hidden">Hidden</span> : null}
        </div>
        <span style={{ flex: 1 }} />
        <div className="row">
          <button className="btn" onClick={() => go("act", duplicateAct(repo, id))}>
            Duplicate
          </button>
          <button className="btn" onClick={showHide}>
            {off ? "Show" : "Hide"}
          </button>
          <button className="btn danger" onClick={() => ask({ render: (close) => <DeleteAct id={id} close={close} /> })}>
            Delete
          </button>
        </div>
      </div>
      <div className="split">
        <div className="stack" style={{ gap: 16 }}>
          <nav className="secnav" aria-label="Parts of this act">
            {[
              ["basics", "Basics"],
              ["card", "Card"],
              ["filters", "Filters"],
              ["sizes", "Sizes"],
              ["page", "Page"],
              ["search", "Search"],
            ].map(([k, l]) => (
              <button key={k} onClick={() => jump("s-" + k)}>
                {l}
              </button>
            ))}
            <button className="jump-prev" onClick={() => jump("s-preview")}>
              Preview
            </button>
          </nav>

          <section className="panel formsec" id="s-basics">
            <div className="panel-head">
              <h2>Basics</h2>
            </div>
            <div className="panel-body">
              <div className="grid2">
                <F label="Name">
                  <TextIn value={a.name} onChange={set("name")} />
                </F>
                <F label="Style line">
                  <TextIn value={a.style} onChange={set("style")} />
                </F>
              </div>
              <div className="grid2">
                <Group label="Type">
                  <Seg
                    value={laneOf(a)}
                    options={LANES}
                    onChange={(v) =>
                      edit((x) => {
                        if (v === (x.presentation === "face" ? "named" : "format")) delete x.lane;
                        else x.lane = v;
                      })
                    }
                  />
                </Group>
                <Group label="Flagship">
                  <Toggle checked={a.status === "flagship"} onChange={(v) => edit((x) => (x.status = v ? "flagship" : "listing"))} />
                </Group>
              </div>
              <Byline a={a} edit={edit} set={set} />
              <F label="Material">
                <TextIn value={a.material} onChange={set("material")} />
              </F>
            </div>
          </section>

          <section className="panel formsec" id="s-card">
            <div className="panel-head">
              <h2>Card</h2>
            </div>
            <div className="panel-body">
              <div className="photo-edit">
                <div className="stack" style={{ gap: 8 }}>
                  <FocusPick a={a} />
                  <div className="row">
                    <Upload label={a.img ? "Replace" : "Add photo"} onDone={(p) => set("img")(p.replace(/^\/?img\//, ""))} />
                  </div>
                </div>
                <div className="stack">
                  <F label="Alt text">
                    <TextIn area rows={3} value={a.alt} onChange={set("alt")} />
                  </F>
                  <F label="File">
                    <TextIn className="input mono" value={a.img} onChange={set("img")} />
                  </F>
                </div>
              </div>
              <div className="grid2">
                <F label="Video">
                  <VideoIn value={a.video} onChange={set("video")} />
                </F>
                {a.video ? (
                  <Group label="Poster">
                    <div className="row" style={{ flexWrap: "nowrap" }}>
                      {a.video_poster ? <img className="thumb" src={previewUrl(a.video_poster)} alt="" /> : <span className="thumb" />}
                      <Upload label={a.video_poster ? "Replace" : "Add"} onDone={(p) => set("video_poster")(p.replace(/^\//, ""))} />
                      {a.video_poster ? (
                        <button className="btn ghost sm icon" aria-label="Remove poster" onClick={() => set("video_poster")("")}>
                          ✕
                        </button>
                      ) : null}
                    </div>
                  </Group>
                ) : (
                  <div />
                )}
              </div>
              <F label="Description" right={`${words(a.blurb)} words`}>
                <TextIn area rows={5} value={a.blurb} onChange={set("blurb")} />
              </F>
              <F label="Short description">
                <TextIn value={a.card_line} placeholder={firstLine(a.blurb)} onChange={set("card_line")} />
              </F>
            </div>
          </section>

          <section className="panel formsec" id="s-filters">
            <div className="panel-head">
              <h2>Filters</h2>
              <button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={() => go("filters")}>
                Edit filters
              </button>
            </div>
            <div className="panel-body">
              <Facet a={a} f={FACETS[0]} edit={edit} />
              <Facet a={a} f={FACETS[1]} edit={edit} />
              <Facet a={a} f={FACETS[2]} edit={edit} />
              <div className="facet">
                <div className="facet-head">
                  <b>Vocals</b>
                </div>
                <Chips single options={VOCALS} value={a.vocals} onToggle={(v) => edit((x) => (x.vocals = v))} />
              </div>
              <Facet a={a} f={FACETS[3]} edit={edit} />
              <Areas a={a} edit={edit} />
            </div>
          </section>

          <section className="panel formsec" id="s-sizes">
            <div className="panel-head">
              <h2>Sizes</h2>
            </div>
            <div className="panel-body">
              <F label="Size range">
                <TextIn value={a.configRangeLabel} placeholder={sizeRange(repo, { ...a, configRangeLabel: "" })} onChange={set("configRangeLabel")} />
              </F>
              <Ladder a={a} edit={edit} />
            </div>
          </section>

          <section className="panel formsec" id="s-page">
            <div className="panel-head">
              <h2>Page</h2>
            </div>
            <div className="panel-body">
              <div className="grid2">
                <Group label="Page">
                  <Toggle
                    checked={!!a.page}
                    onChange={(v) => ask({ render: (close) => (v ? <PageOnDialog a={a} close={close} /> : <PageOffDialog a={a} page={page} close={close} />) })}
                  />
                </Group>
                {a.page ? <UrlIn a={a} page={page} /> : <div />}
              </div>
              {a.page ? (
                <div className="row">
                  {page ? (
                    <button className="btn sm" onClick={() => go("page", page.slug)}>
                      Edit page
                    </button>
                  ) : (
                    <button className="btn sm" onClick={() => pageOn(repo, id, "/" + a.page)}>
                      Make page
                    </button>
                  )}
                  <a className="btn ghost sm" href={STAGING_URL + "/" + a.page} target="_blank" rel="noreferrer">
                    Open on staging
                  </a>
                </div>
              ) : null}
              {layoutPage ? <About a={a} edit={edit} /> : null}
              <Setlist a={a} edit={edit} />
            </div>
          </section>

          <section className="panel formsec" id="s-search">
            <div className="panel-head">
              <h2>Search</h2>
            </div>
            <div className="panel-body">
              {page ? <PageSearch page={page} /> : null}
              <Entity a={a} edit={edit} />
            </div>
          </section>
        </div>

        <aside className="preview-col" id="s-preview" aria-label="Preview">
          <div className="prev-tools">
            <Seg
              sm
              value={ptab}
              onChange={setPtab}
              options={[
                { value: "card", label: "Card" },
                { value: "short", label: "Short card" },
                { value: "page", label: "Page" },
              ]}
            />
            <Seg
              sm
              value={device}
              onChange={setDevice}
              options={[
                { value: "desktop", label: "Desktop" },
                { value: "phone", label: "Phone" },
              ]}
            />
          </div>
          <div className={"prev-frame" + (device === "phone" ? " phone" : "")}>
            <ActPreview site={site} a={a} page={page} tab={ptab} device={device} />
          </div>
          <div className="prev-cap">
            {ptab === "page" ? (
              a.page ? (
                <a href={STAGING_URL + "/" + a.page} target="_blank" rel="noreferrer" className="mono">
                  /{a.page}
                </a>
              ) : (
                "No page"
              )
            ) : off ? (
              "Hidden"
            ) : (
              cardPlaces(site, a)
                .map((p) => p.label)
                .join(", ")
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ preview

function ActPreview({ site, a, page, tab, device }) {
  if (!site || site.error) return <p className="warn-line">{String((site && site.error && site.error.message) || "")}</p>;
  const m = site.m;
  const act = m.ACT_BY_ID[a.id];
  if (!act) return null;
  if (tab !== "page") {
    const roster = m.pages.find((d) => d.content.some((c) => c.type === "Roster")) || m.pages[0];
    const ctx = pageContext(site, roster, { prefix: PREFIX, assetUrl });
    return (
      <SiteFrame key={"card-" + device} ctx={ctx} width={WIDTHS[device]} crop={`#act-${a.id}`} label="Card">
        <main id="main">
          <section className="section section--ruled">
            <div className="wrap">
              <CardGrid acts={[act]} compact={tab === "short"} cls="card-grid card-grid--3 roster-grid" />
            </div>
          </section>
        </main>
      </SiteFrame>
    );
  }
  // The page: its file, or the act page layout where it has none yet.
  const doc = (page && m.pageByUrl[page.path]) || { root: { props: { path: defaultPageUrl(a), title: a.name, nav: "music", layout: "act", schema: { act: a.id } } }, content: [] };
  const ctx = pageContext(site, doc, { prefix: PREFIX, assetUrl });
  return (
    <SiteFrame key={"page-" + device + doc.root.props.path} ctx={ctx} width={WIDTHS[device]} height={device === "phone" ? 820 : 1900} label="Page">
      <Body nav={doc.root.props.nav || ""} trail={ctx.trail} output={ctx.output} hubs={site.hubs} indexed={ctx.indexed}>
        {m.pageContent(doc).map((x) => (
          <Item key={x.props.id} c={x} />
        ))}
      </Body>
    </SiteFrame>
  );
}

// ------------------------------------------------------------ basics

function Byline({ a, edit, set }) {
  if ("byline" in a)
    return (
      <F label="Byline">
        <TextIn value={a.byline} onChange={set("byline")} />
      </F>
    );
  const face = a.presentation === "face";
  return (
    <Group
      label="Byline"
      right={
        <Seg
          sm
          value={face ? "face" : "spec"}
          options={[
            { value: "face", label: "Fronted by" },
            { value: "spec", label: "Lineup" },
          ]}
          onChange={(v) =>
            edit((x) => {
              const lane = laneOf(x);
              x.presentation = v;
              if (v === "face" && !("face" in x)) x.face = "";
              if (v === "spec" && !("spec" in x)) x.spec = "";
              if (lane === (v === "face" ? "named" : "format")) delete x.lane;
              else x.lane = lane;
            })
          }
        />
      }
    >
      <TextIn value={face ? a.face : a.spec} onChange={set(face ? "face" : "spec")} aria-label="Byline" />
    </Group>
  );
}

// ------------------------------------------------------------ card

function Upload({ label, onDone }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try {
      const p = await uploadPicture(f);
      if (p) onDone(p);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className="btn sm" disabled={busy} onClick={() => input.current && input.current.click()}>
        {busy ? "Uploading" : label}
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={pick} />
    </>
  );
}

// Click the photo where its subject is; the crop keeps that point in view
// wherever the photo appears.
function FocusPick({ a }) {
  const repo = session.repo;
  const ref = useRef(null);
  const src = actImg(a);
  const f = focusOf(repo, a.img);
  const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
  const pick = (e) => {
    const img = ref.current && ref.current.querySelector("img");
    if (!img || !a.img) return;
    const r = img.getBoundingClientRect();
    setFocus(repo, a.img, { x: clamp(((e.clientX - r.left) / r.width) * 100), y: clamp(((e.clientY - r.top) / r.height) * 100) });
  };
  const nudge = (e) => {
    const d = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] }[e.key];
    if (!d || !a.img) return;
    e.preventDefault();
    setFocus(repo, a.img, { x: clamp(f.x + d[0]), y: clamp(f.y + d[1]) });
  };
  if (!src) return <div className="focus-pick empty" />;
  return (
    <div className="focus-pick" ref={ref} onClick={pick} onKeyDown={nudge} role="button" tabIndex={0} aria-label="Crop point">
      <img src={src} alt={a.alt || ""} />
      <span className="dot" style={{ left: f.x + "%", top: f.y + "%" }} />
    </div>
  );
}

function VideoIn({ value, onChange }) {
  const [v, setV] = useState(null);
  const shown = v ?? value ?? "";
  const apply = () => {
    if (v == null) return;
    onChange(videoUrl(v));
    setV(null);
  };
  return <input className="input mono" value={shown} onChange={(e) => setV(e.target.value)} onBlur={apply} onKeyDown={(e) => e.key === "Enter" && apply()} />;
}

// ------------------------------------------------------------ filters

function Facet({ a, f, edit }) {
  const repo = session.repo;
  const list = rosterOf(repo)[f.key] || [];
  return (
    <div className="facet">
      <div className="facet-head">
        <b>{f.name}</b>
      </div>
      <Chips options={list.map((c) => ({ value: c.id, label: c.label }))} value={a[f.tag] || []} onToggle={(v) => edit((x) => put(x, f.tag, toggleTag(repo, x, f, v)))} />
    </div>
  );
}

// No areas listed means every area.
function Areas({ a, edit }) {
  const list = rosterOf(session.repo).areas || [];
  const ids = list.map((c) => c.id);
  const cur = a.area_tags && a.area_tags.length ? a.area_tags : ids;
  const all = cur.length === ids.length && ids.every((x) => cur.includes(x));
  const toggle = (v) =>
    edit((x) => {
      const now = x.area_tags && x.area_tags.length ? x.area_tags : ids;
      const next = now.includes(v) ? now.filter((t) => t !== v) : ids.filter((t) => t === v || now.includes(t));
      if (next.length === ids.length || !next.length) delete x.area_tags;
      else x.area_tags = next;
    });
  return (
    <div className="facet">
      <div className="facet-head">
        <b>Area</b>
        {!all ? (
          <button className="btn ghost sm" onClick={() => edit((x) => delete x.area_tags)}>
            All
          </button>
        ) : null}
      </div>
      <Chips options={list.map((c) => ({ value: c.id, label: c.label }))} value={cur} onToggle={toggle} />
    </div>
  );
}

// ------------------------------------------------------------ sizes

function Ladder({ a, edit }) {
  const card = rosterOf(session.repo).rateCard;
  const rows = a.ladder || [];
  const setRows = (next) => edit((x) => put(x, "ladder", next));
  const setRow = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  // A new row is for the first size the act plays that has none, placed
  // in size order.
  const add = () => {
    const used = new Set(rows.map((r) => r.config));
    const next = (a.config_tags || []).find((c) => !used.has(c)) || (a.config_tags || [])[0] || card[0].id;
    const rank = (id) => card.findIndex((c) => c.id === id);
    const at = rows.findIndex((r) => rank(r.config) > rank(next));
    const row = { config: next, build: "", bestFor: "" };
    setRows(at < 0 ? [...rows, row] : [...rows.slice(0, at), row, ...rows.slice(at)]);
  };
  return (
    <Group label="Size ladder">
      <div className="listed">
        {rows.map((r, i) => (
          <div className="item" key={i}>
            <span className="handle">{i + 1}</span>
            <div className="ladder-row">
              <select className="select" aria-label="Size" value={r.config} onChange={(e) => setRow(i, "config", e.target.value)}>
                {card.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input className="input" aria-label="Lineup" placeholder="Lineup" value={r.build || ""} onChange={(e) => setRow(i, "build", e.target.value)} />
              <input className="input" aria-label="Best for" placeholder="Best for" value={r.bestFor || ""} onChange={(e) => setRow(i, "bestFor", e.target.value)} />
            </div>
            <div className="row" style={{ gap: 2, flexWrap: "nowrap" }}>
              <button className="btn ghost sm icon" aria-label="Move up" onClick={() => setRows(moveIn(rows, i, -1))}>
                ↑
              </button>
              <button className="btn ghost sm icon" aria-label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
      <div>
        <button className="btn sm" onClick={add}>
          + Size
        </button>
      </div>
    </Group>
  );
}

// ------------------------------------------------------------ page

function UrlIn({ a, page }) {
  const repo = session.repo;
  const cur = "/" + a.page;
  const [v, setV] = useState(null);
  const shown = v ?? cur;
  const next = normPath(shown);
  const problem = v != null && next !== cur ? pathProblem(repo, next, page ? page.slug : null) : null;
  const apply = () => {
    if (v == null || next === cur || problem) return;
    const p = movePage(repo, a.id, next);
    if (!p) setV(null);
  };
  return (
    <Field label="URL" error={problem}>
      <input
        className={"input mono" + (problem ? " bad" : "")}
        value={shown}
        onChange={(e) => setV(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === "Enter") apply();
          if (e.key === "Escape") setV(null);
        }}
      />
    </Field>
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

function PageOnDialog({ a, close }) {
  const repo = session.repo;
  const [url, setUrl] = useState(defaultPageUrl(a));
  const path = normPath(url);
  const problem = path ? pathProblem(repo, path, null) : "Invalid";
  const ok = () => {
    if (problem) return;
    if (!pageOn(repo, a.id, path)) close(null);
  };
  return (
    <Modal title="New page" onClose={() => close(null)} foot={<Foot close={close} ok={ok} label="Create" disabled={!!problem} />}>
      <Field label="URL" error={problem}>
        <input className="input mono" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ok()} autoFocus />
      </Field>
    </Modal>
  );
}

function PageOffDialog({ a, page, close }) {
  const repo = session.repo;
  const [to, setTo] = useState("/music/");
  const target = normPath(to);
  const exists = !page || (target && target !== page.path && pageByPath(repo, target));
  const links = page ? linkedFrom(repo, page.path, page.file) : [];
  const ok = () => {
    if (!exists) return;
    pageOff(repo, a.id, target);
    close(null);
  };
  return (
    <Modal title={`Delete /${a.page}`} onClose={() => close(null)} foot={<Foot close={close} ok={ok} label="Delete" danger disabled={!exists} />}>
      {links.length ? <p className="muted" style={{ margin: 0 }}>{linkedLine(links)}</p> : null}
      {page ? (
        <Field label="Redirect to" error={to && !exists ? "No such page" : null}>
          <input className="input mono" value={to} onChange={(e) => setTo(e.target.value)} autoFocus />
        </Field>
      ) : null}
    </Modal>
  );
}

function About({ a, edit }) {
  const paras = a.identity || [];
  const setParas = (next) => edit((x) => put(x, "identity", next));
  return (
    <Group label="About">
      {paras.map((p, i) => (
        <div className="row" key={i} style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
          <textarea className="textarea" rows={3} aria-label={"Paragraph " + (i + 1)} value={p} onChange={(e) => setParas(paras.map((x, j) => (j === i ? e.target.value : x)))} />
          <div className="stack" style={{ gap: 2 }}>
            <button className="btn ghost sm icon" aria-label="Move up" onClick={() => setParas(moveIn(paras, i, -1))}>
              ↑
            </button>
            <button className="btn ghost sm icon" aria-label="Remove paragraph" onClick={() => setParas(paras.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        </div>
      ))}
      <div>
        <button className="btn sm" onClick={() => setParas([...paras, ""])}>
          + Paragraph
        </button>
      </div>
    </Group>
  );
}

const MOMENTS = [
  ["arrival", "Arrival"],
  ["dinner", "Dinner"],
  ["lift", "The turn"],
  ["dance", "Dancing"],
  ["closer", "Closer"],
  ["ceremony", "Ceremony"],
];

// The setlist: the act's own songs, or songs picked from the repertoire by
// the moment of the night.
function Setlist({ a, edit }) {
  const songs = session.repo.json("content/repertoire.json") || [];
  const [q, setQ] = useState("");
  const sl = a.setlist;
  const setSl = (fn) =>
    edit((x) => {
      const n = structuredClone(x.setlist || {});
      fn(n);
      x.setlist = n;
    });
  if (!sl)
    return (
      <Group label="Setlist">
        <div>
          <button className="btn sm" onClick={() => edit((x) => (x.setlist = { note: "", items: [] }))}>
            + Setlist
          </button>
        </div>
      </Group>
    );
  const byMoment = !!sl.from_repertoire;
  const items = sl.items || [];
  const hits = q.trim().length > 1 ? songs.filter((s) => `${s.title} ${s.artist}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];
  const addSong = (title) => {
    const t = title.trim();
    if (!t) return;
    setSl((n) => (n.items = [...(n.items || []), t]));
    setQ("");
  };
  return (
    <Group
      label="Setlist"
      right={
        <Seg
          sm
          value={byMoment ? "moments" : "songs"}
          options={[
            { value: "songs", label: "Songs" },
            { value: "moments", label: "By moment" },
          ]}
          onChange={(v) =>
            setSl((n) => {
              if (v === "moments") {
                n.from_repertoire = true;
                if (!n.groups) n.groups = [{ label: "Dinner", moment: "dinner", count: 6 }];
              } else delete n.from_repertoire;
            })
          }
        />
      }
    >
      <textarea className="textarea" rows={2} aria-label="Note" value={sl.note || ""} onChange={(e) => setSl((n) => (n.note = e.target.value))} />
      {byMoment ? (
        <div className="listed">
          {(sl.groups || []).map((g, i) => (
            <div className="item" key={i}>
              <span className="handle">{i + 1}</span>
              <div className="moment-row">
                <input className="input" aria-label="Heading" value={g.label || ""} onChange={(e) => setSl((n) => (n.groups[i].label = e.target.value))} />
                <select className="select" aria-label="Moment" value={g.moment} onChange={(e) => setSl((n) => (n.groups[i].moment = e.target.value))}>
                  {MOMENTS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <Stepper value={g.count || 1} max={30} label="Songs" onChange={(v) => setSl((n) => (n.groups[i].count = v))} />
              </div>
              <div className="row" style={{ gap: 2, flexWrap: "nowrap" }}>
                <button className="btn ghost sm icon" aria-label="Move up" onClick={() => setSl((n) => (n.groups = moveIn(n.groups, i, -1)))}>
                  ↑
                </button>
                <button className="btn ghost sm icon" aria-label="Remove" onClick={() => setSl((n) => (n.groups = n.groups.filter((_, j) => j !== i)))}>
                  ✕
                </button>
              </div>
            </div>
          ))}
          <div>
            <button className="btn sm" onClick={() => setSl((n) => (n.groups = [...(n.groups || []), { label: "", moment: "dinner", count: 6 }]))}>
              + Group
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="chips">
            {items.map((t, i) => (
              <span key={i} className="chip song" aria-pressed="true">
                <button type="button" className="mv" aria-label={"Move " + t + " up"} onClick={() => setSl((n) => (n.items = moveIn(n.items, i, -1)))}>
                  ‹
                </button>
                {t}
                <button type="button" className="x" aria-label={"Remove " + t} onClick={() => setSl((n) => (n.items = n.items.filter((_, j) => j !== i)))}>
                  ✕
                </button>
              </span>
            ))}
          </div>
          <input className="input" aria-label="Add song" placeholder="Add song" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSong(q)} />
          {hits.length ? (
            <div className="chips">
              {hits.map((s, i) => (
                <button key={i} type="button" className="chip" onClick={() => addSong(s.title)}>
                  + {s.title} · {s.artist}
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
      <div>
        <button className="btn ghost sm danger" onClick={() => edit((x) => delete x.setlist)}>
          Remove setlist
        </button>
      </div>
    </Group>
  );
}

// ------------------------------------------------------------ search

function PageSearch({ page }) {
  const repo = session.repo;
  const p = repo.json(page.file).root.props;
  const title = p.titleExact ? p.title || "" : (p.title || "") + BRAND;
  const desc = p.description || "";
  const setP = (k) => (v) => editPageProps(repo, page.file, (x) => (x[k] = v));
  return (
    <>
      <F label="SEO title">
        <TextIn value={p.title} onChange={setP("title")} />
        <Meter n={title.length} max={60} />
      </F>
      <F label="Meta description">
        <TextIn area rows={3} value={p.description} onChange={setP("description")} />
        <Meter n={desc.length} max={160} />
      </F>
      <div className="gprev" aria-label="Search result">
        <div className="u">signetartists.com › {page.path.replace(/^\/|\/$/g, "").split("/").join(" › ")}</div>
        <div className="t">{title.length > 60 ? title.slice(0, 58) + "…" : title}</div>
        <div className="d">{desc.length > 160 ? desc.slice(0, 157) + "…" : desc}</div>
      </div>
    </>
  );
}

// What search engines are told the act is, and its own sites.
function Entity({ a, edit }) {
  const e = a.entity;
  const links = (e && e.sameAs) || [];
  const setLinks = (next) =>
    edit((x) => {
      if (next.length) x.entity.sameAs = next;
      else delete x.entity.sameAs;
    });
  return (
    <div className="grid2">
      <Group label="Schema type">
        <Seg
          value={e ? e.type : ""}
          options={[
            { value: "", label: "None" },
            { value: "Person", label: "Person" },
            { value: "MusicGroup", label: "Music group" },
          ]}
          onChange={(v) =>
            edit((x) => {
              if (!v) delete x.entity;
              else x.entity = { ...(x.entity || {}), type: v };
            })
          }
        />
      </Group>
      {e ? (
        <Group label="Links">
          {links.map((l, i) => (
            <div className="row" key={i} style={{ flexWrap: "nowrap" }}>
              <input className="input mono" aria-label="Link" value={l} onChange={(ev) => setLinks(links.map((x, j) => (j === i ? ev.target.value : x)))} />
              <button className="btn ghost sm icon" aria-label="Remove link" onClick={() => setLinks(links.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          ))}
          <div>
            <button className="btn sm" onClick={() => setLinks([...links, ""])}>
              + Link
            </button>
          </div>
        </Group>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------ delete

const linkedLine = (pages) => {
  const names = pages.map((p) => p.path);
  return `Linked from ${names.slice(0, 6).join(", ")}${names.length > 6 ? ` and ${names.length - 6} more` : ""}`;
};

function DeleteAct({ id, close }) {
  const repo = session.repo;
  const plan = deletePlan(repo, id);
  const [to, setTo] = useState("/music/");
  const target = normPath(to);
  const exists = !plan.page || (target && target !== plan.page.path && pageByPath(repo, target));
  const ok = () => {
    if (!exists) return;
    deleteAct(repo, id, { redirectTo: target });
    close(null);
    go("acts");
    toast("Deleted");
  };
  const items = [
    plan.page ? `Page ${plan.page.path}` : null,
    plan.links.length ? linkedLine(plan.links) : null,
    plan.clips.length ? `${plan.clips.length} video ${plan.clips.length === 1 ? "clip" : "clips"}` : null,
    ...plan.pages.map((p) => `${p.path}: ${p.cut.n} ${p.cut.n === 1 ? "part" : "parts"}`),
  ].filter(Boolean);
  return (
    <Modal title={`Delete ${plan.a.name}`} onClose={() => close(null)} foot={<Foot close={close} ok={ok} label="Delete" danger disabled={!exists} />}>
      {items.length ? (
        <ul className="plain-list">
          {items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      ) : null}
      {plan.page ? (
        <Field label="Redirect to" error={to && !exists ? "No such page" : null}>
          <input className="input mono" value={to} onChange={(e) => setTo(e.target.value)} autoFocus />
        </Field>
      ) : null}
    </Modal>
  );
}
