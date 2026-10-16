/* Sign-in, then the admin: the rail, the top bar with staging status,
   saving and Go live, and the screen for the route. */
import { Component, useEffect, useState } from "react";
import { API_BASE, OWNER, REPO, STAGING, STAGING_URL, STAGING_WORKFLOW, SAVE_AFTER_MS } from "../config.js";
import { baseline, pendingFiles } from "../lib/publish.js";
import { github } from "../lib/github.js";
import { createRepo, idbCache } from "../lib/repo.js";
import { commitMessage, fileLabel } from "../lib/labels.js";
import { pagePath, pagesList } from "../lib/site.js";
import { ask, go, session, storedToken, storeToken, ui, useRepo, useUi, watchRepo } from "../state.js";
import { clock, DialogHost, Toast, useNow } from "./common.jsx";
import { PagesScreen } from "./Pages.jsx";
import { PageEditor, SharedEditor, SHARED } from "./Editor.jsx";
import { GoLiveDrawer } from "./GoLive.jsx";

// ------------------------------------------------------------ sign-in

function SignIn({ onDone, error }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(error || null);
  const submit = async (e) => {
    e.preventDefault();
    const t = token.trim();
    if (!t) return;
    setBusy(true);
    setErr(null);
    try {
      const api = github({ token: t, owner: OWNER, repo: REPO, base: API_BASE });
      await api.branchHead(STAGING);
      storeToken(t);
      onDone(t);
    } catch (x) {
      setErr(x.status === 401 ? "Token not accepted" : x.status === 404 || x.status === 403 ? "No access to signetartists.com" : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="signin">
      <form className="panel signin-card" onSubmit={submit}>
        <div className="brand">
          <span className="brand-dot" />
          SIGNET ADMIN
        </div>
        <label className="field">
          <span className="flabel">GitHub token</span>
          <input className="input mono" type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} autoFocus />
        </label>
        {err ? <p className="ferr">{err}</p> : null}
        <button className="btn primary" disabled={busy || !token.trim()}>
          {busy ? "Signing in" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

// ------------------------------------------------------------ staging status

function useStagingStatus() {
  const [st, set] = useState({ state: "unknown" });
  useEffect(() => {
    let timer;
    let alive = true;
    const tick = async () => {
      clearTimeout(timer);
      let next = 30000;
      try {
        await session.repo.refresh().catch(() => false);
        const head = session.repo.head;
        const [runs, liveSha] = await Promise.all([
          session.api.runs(STAGING_WORKFLOW, STAGING, 5),
          fetch(`${STAGING_URL}/commit.txt?t=${Date.now()}`, { cache: "no-store" })
            .then((r) => (r.ok ? r.text() : ""))
            .catch(() => ""),
        ]);
        const run = (runs.workflow_runs || []).find((r) => r.head_sha === head);
        let state = "building";
        if (liveSha.trim() === head) state = "live";
        else if (run && run.status === "completed" && run.conclusion === "failure") state = "failed";
        if (alive) set({ state, run, head });
        if (state === "building") next = 6000;
      } catch {
        next = 30000;
      }
      if (alive) timer = setTimeout(tick, next);
    };
    tick();
    const off = session.repo.subscribe((ev) => {
      if (ev.saved || ev.remote) {
        set((s) => ({ ...s, state: s.head === session.repo.head ? s.state : "building" }));
        clearTimeout(timer);
        timer = setTimeout(tick, 2000);
      }
    });
    return () => {
      alive = false;
      clearTimeout(timer);
      off();
    };
  }, []);
  return st;
}

const STATUS = { live: "Live on staging", building: "Building", failed: "Build failed", unknown: "Staging" };

function StatusPill({ status, path }) {
  const href = status.state === "failed" && status.run ? status.run.html_url : STAGING_URL + (path || "/");
  return (
    <a className={"status-pill " + status.state} href={href} target="_blank" rel="noreferrer">
      <span className="dot" />
      {STATUS[status.state]}
    </a>
  );
}

// ------------------------------------------------------------ shell

function Rail() {
  useRepo();
  const route = useUi((s) => s.route);
  const open = useUi((s) => s.rail);
  const n = pagesList(session.repo).length;
  const cur = route[0] === "page" ? "pages" : route[0];
  const item = (id, label, kind, count) => (
    <button className="rail-item" aria-current={cur === id ? "page" : undefined} onClick={() => go(id)}>
      <span className={"kdot " + kind} />
      {label}
      {count != null ? <span className="n">{count}</span> : null}
    </button>
  );
  return (
    <aside className={"rail" + (open ? " open" : "")} aria-label="Site">
      <div className="rail-head">
        <div className="brand">
          <span className="brand-dot" />
          SIGNET ADMIN
        </div>
        <a className="site-pick" href={STAGING_URL} target="_blank" rel="noreferrer">
          <span className="site-mark">S</span>
          <span>
            <b>Signet Artists</b>
            <small>staging.signetartists.com</small>
          </span>
        </a>
      </div>
      <nav className="rail-nav">
        <div className="rail-group">
          <div className="rail-label">Content</div>
          {item("pages", "Pages", "page", n)}
        </div>
        <div className="rail-group">
          <div className="rail-label">Shared</div>
          {Object.entries(SHARED).map(([k, s]) => (
            <span key={k}>{item(k, s.title, "shared")}</span>
          ))}
        </div>
      </nav>
      <div className="rail-foot">
        <button
          className="btn ghost sm"
          onClick={async () => {
            await session.repo.save();
            storeToken("");
            location.hash = "";
            location.reload();
          }}
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}

function SaveState() {
  useRepo();
  useNow(20000);
  const st = session.repo.st;
  const dirty = st.local.size;
  if (st.saving)
    return (
      <span className="saved busy" role="status">
        Saving
      </span>
    );
  if (st.error)
    return (
      <button className="saved bad" onClick={() => session.repo.save()} title={String(st.error.message || st.error)}>
        Not saved
      </button>
    );
  if (dirty) return <span className="saved wait">Unsaved</span>;
  if (st.savedAt) return <span className="saved">Saved {clock(st.savedAt)}</span>;
  return null;
}

function crumbs(route) {
  const [r, arg] = route;
  if (r === "page") {
    const d = session.repo.json(pagePath(arg));
    const p = d && d.root.props;
    return (
      <>
        <button className="hide-sm" onClick={() => go("pages")}>
          Pages
        </button>
        <span className="hide-sm">›</span>
        <b>{p ? fileLabel(pagePath(arg), session.repo.get(pagePath(arg))) : arg}</b>
      </>
    );
  }
  if (SHARED[r])
    return (
      <>
        <span className="hide-sm">Shared ›</span>
        <b>{SHARED[r].title}</b>
      </>
    );
  return <b>Pages</b>;
}

function Shell() {
  useRepo();
  const route = useUi((s) => s.route);
  const drawer = useUi((s) => s.drawer);
  const pending = useUi((s) => s.pending);
  const status = useStagingStatus();
  const full = route[0] === "page" || !!SHARED[route[0]];
  const dirty = session.repo.st.local.size;
  const pagePathNow = route[0] === "page" ? (session.repo.json(pagePath(route[1])) || { root: { props: {} } }).root.props.path : null;

  useEffect(() => {
    const k = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        session.repo.save();
      }
    };
    window.addEventListener("keydown", k);
    const leave = (e) => {
      if (session.repo.st.local.size || session.repo.st.saving) {
        session.repo.save();
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("keydown", k);
      window.removeEventListener("beforeunload", leave);
    };
  }, []);

  // How many files differ from live, after each save.
  const head = session.repo.head;
  useEffect(() => {
    let alive = true;
    baseline(session.api, session.repo)
      .then((b) => alive && ui.set({ pending: pendingFiles(b, session.repo).length }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [head]);

  let screen;
  if (route[0] === "page") screen = <PageEditor key={route[1]} slug={route[1]} />;
  else if (SHARED[route[0]]) screen = <SharedEditor key={route[0]} which={route[0]} />;
  else screen = <PagesScreen />;

  return (
    <div className={"app" + (full ? " focus" : "")}>
      <Rail />
      {ui.get().rail ? <div className="scrim" style={{ zIndex: 85 }} onClick={() => ui.set({ rail: false })} /> : null}
      <main className="main">
        <header className="top">
          <button className="btn ghost icon menu-btn" aria-label="Menu" onClick={() => ui.set({ rail: true })}>
            ☰
          </button>
          <nav className="crumbs" aria-label="Where you are">
            {crumbs(route)}
          </nav>
          <span className="grow" />
          <StatusPill status={status} path={pagePathNow} />
          <SaveState />
          <button className="btn sm" disabled={!dirty || session.repo.st.saving} onClick={() => session.repo.save()}>
            Save
          </button>
          <button className={"waiting" + (pending ? "" : " none")} onClick={() => ui.set({ drawer: "golive" })}>
            <span className="num">{pending ?? "·"}</span>
            <span className="wl">{pending === 1 ? "change" : "changes"}</span>
          </button>
          <button className="btn primary golive-btn" onClick={() => ui.set({ drawer: "golive" })}>
            Go live
          </button>
        </header>
        <div className={"content" + (full ? " full" : "")}>
          <Catch route={route.join("/")}>{screen}</Catch>
        </div>
      </main>
      {drawer === "golive" ? <GoLiveDrawer status={status} /> : null}
      <DialogHost />
      <Toast />
    </div>
  );
}

// Anything that throws while drawing a screen shows here, not as a blank window.
class Catch extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidUpdate(prev) {
    if (prev.route !== this.props.route && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="screen">
        <p className="warn-line">{String(this.state.error.message || this.state.error)}</p>
        <p>
          <button className="btn" onClick={() => location.reload()}>
            Reload
          </button>
        </p>
      </div>
    );
  }
}

// ------------------------------------------------------------ boot

// Asked when a save finds the same file changed on staging and here.
async function askConflicts(conflicts) {
  const out = new Map();
  for (const c of conflicts) {
    const text = c.mine && c.mine.text != null ? c.mine.text : c.theirs;
    const choice = await ask({
      title: `${fileLabel(c.path, typeof text === "string" ? text : null)} changed on staging`,
      cancel: false,
      buttons: [
        { label: "Keep staging's", value: "theirs" },
        { label: "Keep mine", value: "mine", primary: true },
      ],
    });
    out.set(c.path, choice || "mine");
  }
  return out;
}

function Workspace({ token, onSignOut }) {
  const [state, setState] = useState({ loading: true, error: null });
  useEffect(() => {
    const api = github({ token, owner: OWNER, repo: REPO, base: API_BASE });
    const repo = createRepo({
      api,
      owner: OWNER,
      repo: REPO,
      branch: STAGING,
      cache: idbCache(),
      ask: askConflicts,
      message: (paths, entries) =>
        commitMessage(
          paths
            .filter((p) => p !== "img/SOURCES.md" || paths.length === 1)
            .map((p) => {
              const label = fileLabel(p, repo.get(p) ?? repo.base(p));
              if (entries.get(p) === null) return `Delete ${label}`;
              if (!repo.baseHas(p)) return `New ${label}`;
              return label;
            })
        ),
    });
    repo.st.delay = SAVE_AFTER_MS;
    session.api = api;
    session.repo = repo;
    session.token = token;
    const off = watchRepo(repo);
    repo
      .load()
      .then(() => setState({ loading: false, error: null }))
      .catch((e) => {
        if (e.status === 401) onSignOut("Token not accepted");
        else setState({ loading: false, error: e });
      });
    return off;
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  if (state.error)
    return (
      <div className="signin">
        <div className="panel signin-card">
          <p className="warn-line">{String(state.error.message || state.error)}</p>
          <button className="btn" onClick={() => location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  if (state.loading)
    return (
      <div className="signin">
        <p className="muted">Loading</p>
      </div>
    );
  return <Shell />;
}

export function App() {
  const [token, setToken] = useState(storedToken());
  const [error, setError] = useState(null);
  if (!token)
    return (
      <SignIn
        error={error}
        onDone={(t) => {
          setError(null);
          setToken(t);
        }}
      />
    );
  return (
    <Workspace
      token={token}
      onSignOut={(msg) => {
        storeToken("");
        setError(msg);
        setToken("");
      }}
    />
  );
}
