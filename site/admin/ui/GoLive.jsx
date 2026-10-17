/* Go live: what is on staging and not live, file by file with the copy
   that changed; the saves since; the go-lives since the cutover; revert for
   each; and the button that merges staging into the live branch. */
import { useCallback, useEffect, useState } from "react";
import { GO_LIVE_NEEDS_BUILD, OWNER, REPO } from "../config.js";
import {
  baseline,
  canGoLive,
  goLive,
  goLives,
  history,
  liveRevertPlan,
  liveRun,
  pendingFiles,
  revertCommit,
  revertFile,
  revertLive,
  revertPlan,
  textAt,
} from "../lib/publish.js";
import { jsonDiff, wordDiff } from "../lib/diff.js";
import { commitMessage, fileKind, fileLabel } from "../lib/labels.js";
import { slugOf } from "../lib/site.js";
import { ask, go, session, toast, ui, useRepo } from "../state.js";
import { when } from "./common.jsx";
import { adminPageConfig, assetUrl, pageSettingsFields } from "./fields.jsx";
import { SHARED } from "./Editor.jsx";
import { adminPostConfig, postSettingsFields } from "./PostEditor.jsx";
import { VIDEO_FIELDS } from "../lib/posts.js";

const ORDER = { page: 0, shared: 1, layout: 2, data: 3, media: 4 };

// Act and roster files, field by field, as the act form names them.
const t = (label) => ({ type: "text", label });
const ACT_FIELDS = {
  name: t("Name"), style: t("Style line"), face: t("Fronted by"), spec: t("Lineup"), byline: t("Byline"), material: t("Material"),
  lane: t("Type"), status: t("Flagship"), hidden: t("Hidden"), presentation: t("Byline"),
  bucket_tags: t("Kind of night"), config_tags: t("Size"), genre_tags: t("Genre"), vocals: t("Vocals"), occasion_tags: t("Occasion"), area_tags: t("Area"),
  img: t("Photo"), alt: t("Alt text"), video: t("Video"), video_poster: t("Poster"), blurb: t("Description"), card_line: t("Short description"),
  configRangeLabel: t("Size range"), page: t("Page"), identity: t("About"),
  ladder: { type: "array", label: "Size ladder", arrayFields: { config: t("Size"), build: t("Lineup"), bestFor: t("Best for") } },
  setlist: { type: "object", label: "Setlist", objectFields: { note: t("Note"), items: t("Songs"), groups: { type: "array", label: "Groups", arrayFields: { label: t("Heading"), moment: t("Moment"), count: t("Songs") } } } },
  entity: { type: "object", label: "Search", objectFields: { type: t("Schema type"), sameAs: t("Links") } },
};
const choice = (label, extra) => ({ type: "array", label, arrayFields: { label: t("Name"), ...extra } });
const ROSTER_FIELDS = {
  order: t("Roster order"),
  buckets: choice("Kind of night"),
  rateCard: choice("Size", { rangeLabel: t("Range label"), pieces: t("Musicians") }),
  genres: choice("Genre"),
  occasions: choice("Occasion"),
  areas: choice("Area"),
};
// Tags read as one list of the choices' names, and ladder sizes by name.
function named(repo, a) {
  const r = repo.json("content/roster.json");
  if (!a || !r) return a;
  const name = (key, id) => ((r[key] || []).find((c) => c.id === id) || { label: id }).label;
  const out = { ...a };
  for (const [tag, key] of [["bucket_tags", "buckets"], ["config_tags", "rateCard"], ["genre_tags", "genres"], ["occasion_tags", "occasions"], ["area_tags", "areas"]]) {
    if (Array.isArray(a[tag])) out[tag] = a[tag].map((id) => name(key, id)).join(", ");
  }
  if (Array.isArray(a.ladder)) out.ladder = a.ladder.map((x) => ({ ...x, config: name("rateCard", x.config) }));
  return out;
}
const SHARED_FIELDS = Object.fromEntries(Object.values(SHARED).map((s) => [s.file, s.fields]));

function textDiff(a, b) {
  const la = (a || "").split("\n");
  const lb = (b || "").split("\n");
  const added = lb.filter((x) => !la.includes(x) && x.trim());
  const removed = la.filter((x) => !lb.includes(x) && x.trim());
  return [...removed.map((x) => ({ kind: "changed", where: "", parts: [{ t: "del", s: x }] })), ...added.map((x) => ({ kind: "changed", where: "", parts: [{ t: "ins", s: x }] }))];
}

async function describe(repo, base, item) {
  const { path } = item;
  if (!path.endsWith(".json") && !path.endsWith(".md") && !path.endsWith(".txt") && !path.endsWith(".svg")) return [];
  const a = await textAt(repo, base, path);
  const b = repo.base(path);
  if (!path.endsWith(".json")) return textDiff(a, b);
  const pa = a != null ? JSON.parse(a) : undefined;
  const pb = b != null ? JSON.parse(b) : undefined;
  if (path.startsWith("content/pages/")) {
    if (!pa || !pb) return [];
    return jsonDiff(pa, pb, adminPageConfig.components, pageSettingsFields);
  }
  if (path.startsWith("content/posts/")) {
    if (!pa || !pb) return [];
    return jsonDiff(pa, pb, adminPostConfig.components, postSettingsFields);
  }
  if (path.startsWith("content/videos/")) {
    if (!pa || !pb) return [];
    return jsonDiff(pa, pb, {}, VIDEO_FIELDS);
  }
  if (path.startsWith("content/acts/")) return jsonDiff(named(repo, pa), named(repo, pb), adminPageConfig.components, ACT_FIELDS);
  if (path === "content/roster.json") {
    const order = (x) => x && { ...x, order: (x.order || []).map((id) => (repo.json(`content/acts/${id}.json`) || { name: id }).name).join(", ") };
    return jsonDiff(order(pa), order(pb), adminPageConfig.components, ROSTER_FIELDS);
  }
  return jsonDiff(pa, pb, adminPageConfig.components, SHARED_FIELDS[path] || null);
}

// A committed file as it is at a commit, before staging has built it.
const rawUrl = (path, sha) => assetUrl("/" + path) || `https://raw.githubusercontent.com/${OWNER}/${REPO}/${sha}/${path}`;

function Parts({ parts }) {
  return parts.map((p, i) => (p.t === "del" ? <del key={i}>{p.s}</del> : p.t === "ins" ? <ins key={i}>{p.s}</ins> : <span key={i}>{p.s}</span>));
}

// Where a file is edited, as a route.
function routeOf(path) {
  if (path.startsWith("content/pages/")) return ["page", slugOf(path)];
  if (path.startsWith("content/acts/")) return ["act", slugOf(path)];
  if (path === "content/roster.json") return ["acts"];
  if (path.startsWith("content/layouts/")) return ["layout"];
  if (path.startsWith("content/posts/")) return ["post", slugOf(path)];
  if (path.startsWith("content/videos/")) return ["videos", slugOf(path)];
  const k = Object.entries(SHARED).find(([, s]) => s.file === path);
  return k ? [k[0]] : null;
}

function openFile(path) {
  ui.set({ drawer: null });
  const r = routeOf(path);
  if (r) go(...r);
}

function confirm(title, label) {
  return ask({ title, buttons: [{ label: "Cancel", value: false }, { label, value: true, danger: true }] });
}

export function GoLiveDrawer({ status }) {
  const rev = useRepo();
  const repo = session.repo;
  const api = session.api;
  const [tab, setTab] = useState("pending");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [live, setLive] = useState(null);
  const head = repo.head;

  const load = useCallback(async () => {
    try {
      const base = await baseline(api, repo);
      const files = pendingFiles(base, repo);
      const items = await Promise.all(
        files.map(async (f) => {
          const text = repo.base(f.path);
          let changes = [];
          try {
            changes = await describe(repo, base, f);
          } catch {
            changes = [];
          }
          const label = fileLabel(f.path, text != null ? text : await textAt(repo, base, f.path));
          return { ...f, kind: fileKind(f.path), label, changes };
        })
      );
      items.sort((x, y) => (ORDER[x.kind] ?? 9) - (ORDER[y.kind] ?? 9) || x.label.localeCompare(y.label));
      const [hist, lives] = await Promise.all([history(api, base), canGoLive(base) ? goLives(api) : null]);
      setData({ base, items, hist, lives });
      ui.set({ pending: items.length });
      setErr(null);
    } catch (e) {
      setErr(String(e.message || e));
    }
  }, [api, repo]);

  useEffect(() => {
    repo.save().then(load);
  }, [head]); // eslint-disable-line react-hooks/exhaustive-deps
  void rev;

  const close = () => ui.set({ drawer: null });

  const revertOne = async (it) => {
    if (!(await confirm(`Revert ${it.label}`, "Revert"))) return;
    setBusy(true);
    try {
      await revertFile(repo, data.base, it.path, `Revert ${it.label}`);
      toast("Reverted");
    } catch (e) {
      toast(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const revertSave = async (c) => {
    setBusy(true);
    try {
      const plan = await revertPlan(api, repo, c.sha);
      const title = `Revert ${plan.message}`;
      let anyway = false;
      if (plan.clash.length) {
        anyway = await ask({
          title,
          body: <ul className="plain-list">{plan.clash.map((p) => <li key={p}>{fileLabel(p, repo.get(p))}</li>)}</ul>,
          buttons: [{ label: "Cancel", value: false }, { label: "Revert anyway", value: true, danger: true }],
        });
        if (!anyway) return;
      } else if (!(await confirm(title, "Revert"))) return;
      await revertCommit(repo, plan, title, { anyway });
      toast("Reverted");
    } catch (e) {
      toast(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  // Follow the live branch's deploy of `sha` through to live.
  const follow = async (sha, first) => {
    setLive({ step: 1, sha, first });
    let seen = false;
    for (let i = 0; sha && i < 120; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const run = await liveRun(api, sha);
      if (run && run.status === "completed") {
        setLive({ step: run.conclusion === "success" ? 3 : -1, sha, run, first, error: run.conclusion === "success" ? null : "Build failed" });
        break;
      }
      if (run) {
        seen = true;
        setLive({ step: run.status === "in_progress" ? 2 : 1, sha, run, first });
      } else if (!seen && i >= 24) {
        setLive({ step: -1, sha, first, error: "No build started" });
        break;
      }
    }
    if (!sha) setLive({ step: 3, sha: null, first });
  };

  const doGoLive = async () => {
    if (!canGoLive(data && data.base)) return;
    if (!(await ask({ title: "Go live", buttons: [{ label: "Cancel", value: false }, { label: "Go live", value: true, primary: true }] }))) return;
    setBusy(true);
    setLive({ step: 0, first: "Merging" });
    try {
      const merge = await goLive(api, data.base, `Go live: ${commitMessage(data.items.map((it) => it.label))}`);
      await follow(merge ? merge.sha : null, "Merging");
      await load();
    } catch (e) {
      setLive({ step: -1, first: "Merging", error: String(e.message || e) });
    } finally {
      setBusy(false);
    }
  };

  const revertGoLive = async (g) => {
    setBusy(true);
    try {
      const plan = await liveRevertPlan(api, repo, g);
      const title = `Revert ${plan.message}`;
      let anyway = false;
      if (plan.clash.length) {
        anyway = await ask({
          title,
          body: <ul className="plain-list">{plan.clash.map((p) => <li key={p}>{fileLabel(p, repo.get(p))}</li>)}</ul>,
          buttons: [{ label: "Cancel", value: false }, { label: "Revert anyway", value: true, danger: true }],
        });
        if (!anyway) return;
      } else if (!(await confirm(title, "Revert"))) return;
      setLive({ step: 0, first: "Reverting" });
      const sha = await revertLive(api, repo, plan, title, { anyway });
      await follow(sha, "Reverting");
      await load();
    } catch (e) {
      setLive({ step: -1, first: "Reverting", error: String(e.message || e) });
    } finally {
      setBusy(false);
    }
  };

  const items = data ? data.items : [];
  const canGo = !busy && data && canGoLive(data.base) && items.length > 0 && (status.state === "live" || !GO_LIVE_NEEDS_BUILD);
  const STEPS = [live && live.first ? live.first : "Merging", "Building", "Publishing", "Live"];
  return (
    <>
      <div className="scrim" onClick={close} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Go live">
        <div className="drawer-head">
          <h2>Go live</h2>
          <span style={{ flex: 1 }} />
          <button className="btn ghost sm" onClick={close}>
            Close
          </button>
        </div>
        {live ? null : (
          <div className="tabs" style={{ margin: "0 18px 8px" }}>
            <button aria-selected={String(tab === "pending")} onClick={() => setTab("pending")}>
              Pending ({data ? items.length : "…"})
            </button>
            <button aria-selected={String(tab === "history")} onClick={() => setTab("history")}>
              Saves ({data ? data.hist.commits.length : "…"})
            </button>
            {data && data.lives ? (
              <button aria-selected={String(tab === "lives")} onClick={() => setTab("lives")}>
                Go-lives ({data.lives.length})
              </button>
            ) : null}
          </div>
        )}
        <div className="drawer-body">
          {err ? <p className="warn-line">{err}</p> : null}
          {live ? (
            <div className="steps" aria-live="polite">
              {STEPS.map((s, i) => (
                <div key={s} className={live.step > i || live.step === 3 ? "done" : live.step === i ? "on" : ""}>
                  <i>{live.step > i || live.step === 3 ? "✓" : ""}</i>
                  {s}
                </div>
              ))}
              {live.step === -1 ? <p className="warn-line">{live.error || "Failed"}</p> : null}
            </div>
          ) : !data ? (
            <p className="muted">Loading</p>
          ) : tab === "pending" ? (
            items.length ? (
              <>
                {items.map((it) => (
                  <div className="cgroup" key={it.path}>
                    <div className="cgroup-head">
                      <span className={"kdot " + (it.kind === "media" ? "" : it.kind)} />
                      <b>{it.label}</b>
                      {it.status === "added" ? <span className="badge live">New</span> : it.status === "removed" ? <span className="badge hidden">Deleted</span> : null}
                      <span style={{ flex: 1 }} />
                      {it.status !== "removed" && routeOf(it.path) ? (
                        <button className="link" onClick={() => openFile(it.path)}>
                          Open
                        </button>
                      ) : null}
                      <button className="link" disabled={busy} onClick={() => revertOne(it)}>
                        Revert
                      </button>
                    </div>
                    {/\.(jpe?g|png|gif|webp|svg)$/i.test(it.path) && it.status !== "removed" ? (
                      <div className="change">
                        <img className="img-thumb" src={rawUrl(it.path, repo.head)} alt="" />
                      </div>
                    ) : null}
                    {it.changes.slice(0, 40).map((c, i) => (
                      <div className="change" key={i}>
                        {c.kind === "changed" ? (
                          <>
                            {c.where ? <span className="f">{c.where}</span> : null}
                            <span className="diff">
                              <Parts parts={c.parts} />
                            </span>
                          </>
                        ) : (
                          <span className="f">
                            {c.kind === "added" ? "Added" : c.kind === "removed" ? "Removed" : "Moved"}: <span className="diff">{c.where}</span>
                          </span>
                        )}
                      </div>
                    ))}
                    {it.changes.length > 40 ? <div className="change muted">+{it.changes.length - 40}</div> : null}
                  </div>
                ))}
                {data.hist.code.length ? (
                  <div className="cgroup">
                    <div className="cgroup-head">
                      <span className="kdot layout" />
                      <b>Code</b>
                      <span className="muted">{data.hist.code.length} files</span>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="muted">No changes</p>
            )
          ) : tab === "lives" && data.lives ? (
            data.lives.length ? (
              data.lives.map((g) => (
                <div className="cgroup" key={g.sha}>
                  <div className="cgroup-head">
                    <b>{g.message}</b>
                    <span style={{ flex: 1 }} />
                    <button className="link" disabled={busy} onClick={() => revertGoLive(g)}>
                      Revert
                    </button>
                  </div>
                  <div className="change">
                    <span className="diff">{when(g.date)}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No go-lives</p>
            )
          ) : data.hist.commits.length ? (
            data.hist.commits.map((c) => (
              <div className="cgroup" key={c.sha}>
                <div className="cgroup-head">
                  <b>{c.commit.message.split("\n")[0]}</b>
                  <span style={{ flex: 1 }} />
                  <button className="link" disabled={busy} onClick={() => revertSave(c)}>
                    Revert
                  </button>
                </div>
                <div className="change">
                  <span className="diff">{when(c.commit.committer.date)}</span>
                </div>
              </div>
            ))
          ) : (
            <p className="muted">No saves</p>
          )}
        </div>
        <div className="drawer-foot">
          {live ? (
            <button className="btn primary" disabled={busy} onClick={() => setLive(null)}>
              Done
            </button>
          ) : (
            <>
              <span style={{ flex: 1 }} />
              <button className="btn primary" disabled={!canGo} onClick={doGoLive}>
                Go live{data ? ` (${items.length})` : ""}
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
