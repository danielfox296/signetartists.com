/* Acts: the roster (order, hidden acts, flagships, new act) and the filter
   choices the acts are tagged with. */
import { useMemo, useState } from "react";
import { CardGrid } from "../../src/components/blocks.jsx";
import { STAGING_URL } from "../config.js";
import {
  actsList,
  addChoice,
  choiceUsers,
  editAct,
  editChoice,
  FACETS,
  focusOf,
  laneOf,
  LANES,
  moveChoice,
  moveInRoster,
  newAct,
  removeChoice,
  renameChoice,
  rosterOf,
  sizeRange,
  VOCALS,
} from "../lib/acts.js";
import { pageContext, siteFrom } from "../lib/site.js";
import { ask, go, session, useRepo } from "../state.js";
import { Field, Modal, Seg, Stepper, useDragRows } from "./common.jsx";
import { assetUrl, previewUrl } from "./fields.jsx";
import { SiteFrame, WIDTHS } from "./Preview.jsx";

export const actImg = (a) => (a.img ? previewUrl("img/" + a.img) : "");
const pos = (f) => `${f.x}% ${f.y}%`;

export function Thumb({ a, cls = "thumb" }) {
  const src = actImg(a);
  if (!src) return <div className={cls} />;
  return <img className={cls} src={src} alt="" style={{ objectPosition: pos(focusOf(session.repo, a.img)) }} />;
}

function Tabs({ at }) {
  return (
    <div className="tabs" role="tablist">
      <button role="tab" aria-selected={String(at === "acts")} onClick={() => go("acts")}>
        Roster
      </button>
      <button role="tab" aria-selected={String(at === "filters")} onClick={() => go("filters")}>
        Filters
      </button>
    </div>
  );
}

// ------------------------------------------------------------ the visitor's filter

// What the roster page's filter does with a card: every chosen menu must
// match one of the card's tags.
const VOCALS_MATCH = { sung: ["sung"], instrumental: ["instrumental"], optional: ["sung", "instrumental"] };
export function matches(a, vf, r) {
  const has = (list, v) => !v || (list || []).includes(v);
  const areas = a.area_tags && a.area_tags.length ? a.area_tags : (r.areas || []).map((x) => x.id);
  return (
    has(a.occasion_tags, vf.occasion) &&
    has(a.bucket_tags, vf.night) &&
    has(a.config_tags, vf.size) &&
    has(a.genre_tags, vf.genre) &&
    has(VOCALS_MATCH[a.vocals || "instrumental"], vf.vocals) &&
    has(areas, vf.area)
  );
}

const VF = [
  ["occasion", "Occasion", "occasions"],
  ["night", "Kind of night", "buckets"],
  ["size", "Size", "rateCard"],
  ["genre", "Genre", "genres"],
  ["vocals", "Vocals", null],
  ["area", "Area", "areas"],
];

function VisitorFilter({ vf, setVf, shown, total }) {
  const r = rosterOf(session.repo);
  const on = Object.values(vf).some(Boolean);
  return (
    <div className="visitor">
      <b>Filter</b>
      {VF.map(([k, label, list]) => (
        <label className="row" key={k} style={{ gap: 6 }}>
          <span className="muted">{label}</span>
          <select className="select" value={vf[k] || ""} onChange={(e) => setVf({ ...vf, [k]: e.target.value })}>
            <option value="">Any</option>
            {(list ? r[list] || [] : VOCALS.filter((v) => v.value !== "optional")).map((o) => (
              <option key={o.id || o.value} value={o.id || o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      {on ? (
        <>
          <span className="badge data">
            {shown} of {total}
          </span>
          <button className="btn ghost sm" onClick={() => setVf({})}>
            Clear
          </button>
        </>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------ where a card shows

// The pages that show an act's card: the roster, the flagship row and any
// list that picks it.
export function cardPlaces(site, a) {
  if (!site || site.error || a.hidden || !a.onRoster) return [];
  const m = site.m;
  const out = [];
  for (const doc of m.pages) {
    let hit = false;
    const walk = (items) => {
      for (const c of items || []) {
        if (c.type === "Roster") hit = true;
        if (c.type === "Cards" && c.props.source !== "picks" && m.actsWhere(c.props).some((x) => x.id === a.id)) hit = true;
        for (const v of Object.values(c.props || {})) if (Array.isArray(v) && v.length && v[0] && v[0].type && v[0].props) walk(v);
      }
    };
    walk(m.pageContent(doc));
    if (hit) out.push({ path: doc.root.props.path, label: doc.root.props.path === "/" ? "Home" : m.crumbLabel(doc.root.props.path) });
  }
  return out;
}

export function useSite() {
  const rev = useRepo();
  return useMemo(() => {
    try {
      return siteFrom(session.repo);
    } catch (e) {
      return { error: e };
    }
  }, [rev]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ------------------------------------------------------------ the roster

const GROUPS = [
  { key: "named", label: "Named acts" },
  { key: "format", label: "Band setups" },
  { key: "hidden", label: "Hidden" },
];
const groupOf = (a) => (a.hidden || !a.onRoster ? "hidden" : laneOf(a));

export function ActsScreen() {
  useRepo();
  const repo = session.repo;
  const site = useSite();
  const [q, setQ] = useState("");
  const [vf, setVf] = useState({});
  const [view, setView] = useState("list");
  const all = actsList(repo);
  const r = rosterOf(repo);
  const filtering = Object.values(vf).some(Boolean);
  const shown = all.filter((a) => (!q || `${a.name} ${a.style}`.toLowerCase().includes(q.toLowerCase())) && (!filtering || matches(a, vf, r)));
  const live = all.filter((a) => groupOf(a) !== "hidden");
  const dirty = new Set(repo.dirty);
  const rows = (key) => shown.filter((a) => groupOf(a) === key);
  const drag = useDragRows((from, to, key) => {
    const list = rows(key);
    if (to < 0 || to >= list.length) return;
    const a = list[from];
    // Dropped on a row: it takes that row's place.
    const target = list[to];
    const order = r.order.filter((x) => x !== a.id);
    const at = order.indexOf(target.id);
    if (!a.onRoster || at < 0) return;
    moveInRoster(repo, a.id, order[from < to ? at + 1 : at] || null);
  });
  const toggleFlag = (a) => editAct(repo, a.id, (x) => (x.status = x.status === "flagship" ? "listing" : "flagship"));
  const flagships = live.filter((a) => a.status === "flagship").length;

  const row = (a, i, key) => {
    const places = cardPlaces(site, a);
    return (
      <tr
        key={a.id}
        {...(key !== "hidden" ? { ...drag.row(i, key), ...drag.handle(i, key) } : {})}
        tabIndex={0}
        className={(drag.over(i, key) ? "dragover" : "") + (drag.dragging(i, key) ? " dragging" : "")}
        onClick={() => go("act", a.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter") go("act", a.id);
          else if (key !== "hidden") drag.handle(i, key).onKeyDown(e);
        }}
      >
        <td style={{ width: 28 }}>{key !== "hidden" ? <span className="handle">⋮⋮</span> : null}</td>
        <td style={{ width: 76 }}>
          <Thumb a={a} />
        </td>
        <td className="namecell">
          <b>{a.name}</b>
          <small>{a.style}</small>
        </td>
        <td>
          <div className="mini-pills">
            {(a.bucket_tags || []).map((b) => (
              <span key={b}>{(r.buckets.find((x) => x.id === b) || { label: b }).label}</span>
            ))}
          </div>
        </td>
        <td className="muted" style={{ whiteSpace: "nowrap" }}>
          {sizeRange(repo, a)}
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <button className="star" aria-pressed={String(a.status === "flagship")} aria-label="Flagship" onClick={() => toggleFlag(a)}>
            ★
          </button>
        </td>
        <td className="muted" style={{ fontSize: 12.5 }}>
          {places.map((p) => p.label).join(", ")}
        </td>
        <td className="row-acts">
          {dirty.has(`content/acts/${a.id}.json`) ? <span className="badge wait">Unsaved</span> : null}
          {!a.page ? <span className="badge draft">No page</span> : null}
        </td>
      </tr>
    );
  };

  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Acts</h1>
        <span className="grow" />
        <button className="btn primary" onClick={() => ask({ render: (close) => <NewAct close={close} /> })}>
          New act
        </button>
      </div>
      <Tabs at="acts" />
      <VisitorFilter vf={vf} setVf={setVf} shown={live.filter((a) => matches(a, vf, r)).length} total={live.length} />
      <div className="toolbar">
        <input className="input" type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search acts" />
        <span className="badge layout">Flagships {flagships}</span>
        <span className="grow" style={{ flex: 1 }} />
        <Seg sm value={view} onChange={setView} options={[{ value: "list", label: "List" }, { value: "cards", label: "Cards" }]} />
      </div>
      {view === "list" ? (
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr>
                <th />
                <th />
                <th>Act</th>
                <th>Kind of night</th>
                <th>Sizes</th>
                <th>Flagship</th>
                <th>Shown on</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((g) => {
                const list = rows(g.key);
                return [
                  <tr className="group" key={"g-" + g.key}>
                    <td colSpan={8}>
                      {g.label} · {list.length}
                    </td>
                  </tr>,
                  ...list.map((a, i) => row(a, i, g.key)),
                ];
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <RosterCards site={site} acts={shown} />
      )}
    </div>
  );
}

// The roster as the site draws it: full cards for named acts, short ones
// for band setups.
function RosterCards({ site, acts }) {
  const [w, setW] = useState("desktop");
  if (!site || site.error) return <p className="warn-line">{String(site && site.error && site.error.message)}</p>;
  const doc = site.m.pages.find((d) => d.content.some((c) => c.type === "Roster")) || site.m.pages[0];
  const ctx = pageContext(site, doc, { prefix: STAGING_URL + "/", assetUrl });
  const ids = new Set(acts.map((a) => a.id));
  const pick = (list) => list.filter((a) => ids.has(a.id));
  const open = (e) => {
    const card = e.target.closest && e.target.closest("article[id^='act-']");
    if (card) go("act", card.id.slice(4));
  };
  return (
    <div className="stack">
      <div className="prev-tools" style={{ justifyContent: "flex-start" }}>
        <Seg sm value={w} onChange={setW} options={[{ value: "desktop", label: "Desktop" }, { value: "phone", label: "Phone" }]} />
      </div>
      <div className={"prev-frame" + (w === "phone" ? " phone" : "")}>
        <SiteFrame ctx={ctx} width={WIDTHS[w]} height={1600} label="Roster">
          <main id="main" onClick={open} style={{ cursor: "pointer" }}>
            <div className="wrap" style={{ paddingBlock: 32, display: "grid", gap: 32 }}>
              <CardGrid acts={pick(site.m.NAMED_ACTS)} cls="card-grid card-grid--3 roster-grid" />
              <CardGrid acts={pick(site.m.FORMAT_ACTS)} compact cls="card-grid card-grid--3 roster-grid" />
            </div>
          </main>
        </SiteFrame>
      </div>
    </div>
  );
}

function NewAct({ close }) {
  const [name, setName] = useState("");
  const [lane, setLane] = useState("named");
  const ok = () => {
    if (!name.trim()) return;
    const id = newAct(session.repo, { name, lane });
    close(null);
    go("act", id);
  };
  return (
    <Modal
      title="New act"
      onClose={() => close(null)}
      foot={
        <>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={() => close(null)}>
            Cancel
          </button>
          <button className="btn primary" disabled={!name.trim()} onClick={ok}>
            Create
          </button>
        </>
      }
    >
      <Field label="Name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ok()} autoFocus />
      </Field>
      <div className="field">
        <span className="flabel">Type</span>
        <Seg value={lane} onChange={setLane} options={LANES} />
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------ filter choices

export function FiltersScreen() {
  useRepo();
  const repo = session.repo;
  const all = actsList(repo);
  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Acts</h1>
      </div>
      <Tabs at="filters" />
      <div className="grid2 filters-grid">
        {FACETS.map((f) => (
          <FacetEditor key={f.key} f={f} />
        ))}
        <div className="panel">
          <div className="panel-head">
            <h2>Vocals</h2>
          </div>
          <div className="panel-body">
            <div className="mini-pills">
              {VOCALS.map((v) => (
                <span key={v.value}>
                  {v.label} · {all.filter((a) => (a.vocals || "instrumental") === v.value).length}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

function FacetEditor({ f }) {
  const repo = session.repo;
  const list = rosterOf(repo)[f.key] || [];
  const [open, setOpen] = useState(null);
  const [del, setDel] = useState(null);
  const [add, setAdd] = useState("");
  const drag = useDragRows((from, to) => moveChoice(repo, f.key, from, to));
  const addOne = () => {
    if (addChoice(repo, f.key, add)) setAdd("");
  };
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{f.name}</h2>
        <span className="badge data">{list.length}</span>
      </div>
      <div className="panel-body">
        <div className="listed">
          {list.map((item, i) => {
            const users = choiceUsers(repo, f.key, item.id);
            const n = users.acts.length;
            return (
              <div key={item.id} className={"item" + (drag.over(i, f.key) ? " dragover" : "")} {...drag.row(i, f.key)}>
                <span className="handle" tabIndex={0} aria-label="Move" {...drag.handle(i, f.key)}>
                  ⋮⋮
                </span>
                <div className="body">
                  <input className="input" aria-label={f.name} value={item.label} onChange={(e) => renameChoice(repo, f.key, item.id, e.target.value)} />
                  {f.key === "rateCard" ? (
                    <div className="row size-row">
                      <label className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                        <span className="muted">Range label</span>
                        <input className="input" style={{ width: 120 }} value={item.rangeLabel || ""} onChange={(e) => editChoice(repo, f.key, item.id, (x) => (x.rangeLabel = e.target.value))} />
                      </label>
                      <span className="muted">Musicians</span>
                      <Stepper value={item.pieces || 1} max={20} label="Musicians" onChange={(v) => editChoice(repo, f.key, item.id, (x) => (x.pieces = v))} />
                    </div>
                  ) : null}
                  {open === item.id ? (
                    <div className="mini-pills">
                      {users.acts.map((a) => (
                        <span key={a.id} className="link" role="button" tabIndex={0} onClick={() => go("act", a.id)}>
                          {a.name}
                        </span>
                      ))}
                      {!n ? <span>None</span> : null}
                    </div>
                  ) : null}
                  {del === item.id ? (
                    <div className="warn-line">
                      <span>
                        {n || users.pages.length
                          ? [n ? `${plural(n, "act")}: ${users.acts.map((a) => a.name).join(", ")}` : null, users.pages.length ? `${plural(users.pages.length, "page")}: ${users.pages.map((p) => p.path).join(", ")}` : null].filter(Boolean).join(". ")
                          : "Unused"}
                      </span>
                      <span className="row" style={{ marginLeft: "auto", flexWrap: "nowrap" }}>
                        <button
                          className="btn sm danger"
                          onClick={() => {
                            removeChoice(repo, f.key, item.id);
                            setDel(null);
                          }}
                        >
                          Remove
                        </button>
                        <button className="btn sm" onClick={() => setDel(null)}>
                          Cancel
                        </button>
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                  <button className="btn ghost sm" onClick={() => setOpen(open === item.id ? null : item.id)}>
                    {plural(n, "act")}
                  </button>
                  <button className="btn ghost sm icon" aria-label={"Remove " + item.label} onClick={() => setDel(item.id)}>
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input className="input" style={{ flex: 1, minWidth: 0 }} aria-label={"New " + f.name} value={add} onChange={(e) => setAdd(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addOne()} />
          <button className="btn" disabled={!add.trim()} onClick={addOne}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
