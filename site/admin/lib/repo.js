/* The admin's working copy of the staging branch: content/ and img/ as
   they are at the commit it last read, plus the edits not yet saved.

   A save is one commit holding every unsaved file. If staging moved since
   it was read (a Claude session, another tab), the new commit is read
   first and merged file by file: files only they changed are taken, files
   only we changed are kept, and only a file both sides changed is asked
   about. */
import { blobSha, b64ToBytes, fromUtf8, pool, utf8 } from "./github.js";

const TRACKED = ["content", "img"];
export const isText = (p) => p.startsWith("content/") || p.endsWith(".md") || p.endsWith(".svg");

export function createRepo({ api, owner, repo, branch, cache, ask, message, rawBase = "https://raw.githubusercontent.com" }) {
  const st = {
    head: null,
    files: new Map(), // path -> blob sha, at head
    text: new Map(), // path -> text, at head (text files)
    local: new Map(), // path -> {text} | {b64, url} | {sha} | null (deleted)
    saving: false,
    savedAt: null,
    error: null,
    current: null,
    timer: null,
    delay: 5000,
    loading: true,
  };
  const subs = new Set();
  const emit = (ev = {}) => subs.forEach((f) => f(ev));

  async function readTree(commitSha) {
    const c = await api.commit(commitSha);
    const root = await api.tree(c.tree.sha, false);
    const out = new Map();
    await Promise.all(
      root.tree
        .filter((e) => e.type === "tree" && TRACKED.includes(e.path))
        .map(async (e) => {
          const t = await api.tree(e.sha, true);
          if (t.truncated) throw new Error(`${e.path}/ is too large to read in one call`);
          for (const x of t.tree) if (x.type === "blob") out.set(`${e.path}/${x.path}`, x.sha);
        })
    );
    return out;
  }

  // A file's text, by its blob sha: the local cache, else raw by commit,
  // else the API.
  async function readText(path, sha, commitSha) {
    const hit = await cache.get(sha);
    if (hit != null) return hit;
    let text = null;
    if (commitSha) {
      try {
        const r = await fetch(`${rawBase}/${owner}/${repo}/${commitSha}/${path.split("/").map(encodeURIComponent).join("/")}`, { cache: "force-cache" });
        if (r.ok) {
          const bytes = new Uint8Array(await r.arrayBuffer());
          if ((await blobSha(bytes)) === sha) text = fromUtf8(bytes);
        }
      } catch {
        text = null;
      }
    }
    if (text == null) text = fromUtf8(b64ToBytes((await api.blob(sha)).content));
    await cache.set(sha, text);
    return text;
  }

  async function load() {
    st.loading = true;
    emit();
    const head = await api.branchHead(branch);
    const files = await readTree(head);
    const text = new Map();
    await pool([...files].filter(([p]) => isText(p)), 16, async ([p, sha]) => text.set(p, await readText(p, sha, head)));
    st.head = head;
    st.files = files;
    st.text = text;
    st.loading = false;
    emit({ loaded: true });
  }

  // ------------------------------------------------------------ reading

  const has = (p) => (st.local.has(p) ? st.local.get(p) !== null : st.files.has(p));
  function get(p) {
    if (st.local.has(p)) {
      const e = st.local.get(p);
      return e && "text" in e ? e.text : e === null ? undefined : st.text.get(p);
    }
    return st.text.get(p);
  }
  const memo = new Map();
  function json(p) {
    const t = get(p);
    if (t == null) return undefined;
    const m = memo.get(p);
    if (m && m.t === t) return m.v;
    const v = JSON.parse(t);
    memo.set(p, { t, v });
    return v;
  }
  function list(prefix) {
    const out = new Set([...st.files.keys()].filter((p) => p.startsWith(prefix)));
    for (const [p, e] of st.local) {
      if (!p.startsWith(prefix)) continue;
      if (e === null) out.delete(p);
      else out.add(p);
    }
    return [...out].sort();
  }
  const base = (p) => st.text.get(p);
  const baseHas = (p) => st.files.has(p);
  const localUrl = (p) => {
    const e = st.local.get(p);
    return e && e.url ? e.url : null;
  };

  // ------------------------------------------------------------ editing

  // `source` names who made the edit, so an editor knows a change it
  // didn't make and reloads.
  // A file in a save still running keeps its edit, even one back to how it
  // was: the save would otherwise settle on the text it is sending.
  const sending = (p) => !!(st.inflight && st.inflight.has(p));
  function set(p, text, source) {
    if (st.files.has(p) && st.text.get(p) === text && !sending(p)) st.local.delete(p);
    else st.local.set(p, { text });
    emit({ edit: p, source });
    schedule();
  }
  function remove(p, source) {
    if (!st.files.has(p) && !sending(p)) st.local.delete(p);
    else st.local.set(p, null);
    emit({ edit: p, source });
    schedule();
  }
  function putBinary(p, b64, url) {
    st.local.set(p, { b64, url });
    emit({ edit: p });
    schedule();
  }
  function putSha(p, sha) {
    if (st.files.get(p) === sha && !sending(p)) st.local.delete(p);
    else st.local.set(p, { sha });
    emit({ edit: p });
    schedule();
  }
  // Drop unsaved edits to one file.
  function discard(p) {
    st.local.delete(p);
    emit({ edit: p });
  }

  function schedule(ms = st.delay) {
    clearTimeout(st.timer);
    if (!st.local.size) return;
    st.timer = setTimeout(() => save(), ms);
  }

  // ------------------------------------------------------------ saving

  async function commit(snapshot, msg) {
    const parent = st.head;
    const pc = await api.commit(parent);
    const tree = [];
    for (const [path, e] of snapshot) {
      if (e === null) {
        if (st.files.has(path)) tree.push({ path, mode: "100644", type: "blob", sha: null });
      } else if ("text" in e) tree.push({ path, mode: "100644", type: "blob", content: e.text });
      else if ("b64" in e) {
        if (!e.sha) e.sha = (await api.createBlob(e.b64, "base64")).sha;
        tree.push({ path, mode: "100644", type: "blob", sha: e.sha });
      } else tree.push({ path, mode: "100644", type: "blob", sha: e.sha });
    }
    if (!tree.length) return null;
    const t = await api.createTree(pc.tree.sha, tree);
    const c = await api.createCommit(msg, t.sha, [parent]);
    await api.updateRef(branch, c.sha);
    return c.sha;
  }

  async function settle(snapshot, sha) {
    st.head = sha;
    for (const [p, e] of snapshot) {
      if (e === null) {
        st.files.delete(p);
        st.text.delete(p);
      } else if ("text" in e) {
        const s = await blobSha(utf8(e.text));
        st.files.set(p, s);
        st.text.set(p, e.text);
        await cache.set(s, e.text);
      } else {
        st.files.set(p, e.sha);
        if (isText(p)) st.text.set(p, await readText(p, e.sha, sha));
      }
      if (st.local.get(p) === e) st.local.delete(p);
      else if (st.local.has(p)) {
        const now = st.local.get(p);
        if (now && "text" in now && now.text === st.text.get(p)) st.local.delete(p);
      }
    }
  }

  // Read the branch at `remote` and merge it into the working copy.
  async function sync(remote) {
    const files = await readTree(remote);
    const paths = new Set([...files.keys(), ...st.files.keys()]);
    const changed = [...paths].filter((p) => files.get(p) !== st.files.get(p));
    const theirs = new Map();
    await pool(changed.filter((p) => isText(p) && files.has(p)), 12, async (p) => theirs.set(p, await readText(p, files.get(p), remote)));
    const conflicts = [];
    for (const p of changed) {
      if (!st.local.has(p)) continue;
      const mine = st.local.get(p);
      const t = files.has(p) ? (isText(p) ? theirs.get(p) : { sha: files.get(p) }) : null;
      const same = (mine === null && t === null) || (mine && "text" in mine && mine.text === t) || (mine && mine.sha && t && t.sha === mine.sha);
      if (same) st.local.delete(p);
      else conflicts.push({ path: p, mine, theirs: t, base: st.text.get(p) });
    }
    if (conflicts.length) {
      const choice = await ask(conflicts);
      for (const c of conflicts) if (choice.get(c.path) === "theirs") st.local.delete(c.path);
    }
    for (const p of changed) {
      if (theirs.has(p)) st.text.set(p, theirs.get(p));
      else st.text.delete(p);
    }
    st.files = files;
    st.head = remote;
    if (changed.length) emit({ remote: changed });
    return changed;
  }

  // Commit every unsaved file. A call made while a save is running waits
  // for it and then saves what is left.
  function save(msg) {
    clearTimeout(st.timer);
    const run = (st.current || Promise.resolve()).then(() => saveOnce(msg));
    st.current = run.finally(() => {
      if (st.current === tail) st.current = null;
    });
    const tail = st.current;
    return run;
  }

  async function saveOnce(msg) {
    clearTimeout(st.timer);
    if (!st.local.size || st.loading) return;
    st.saving = true;
    emit();
    try {
      for (let attempt = 0; ; attempt++) {
        const remote = await api.branchHead(branch);
        if (remote !== st.head) await sync(remote);
        if (!st.local.size) break;
        const snapshot = new Map(st.local);
        st.inflight = snapshot;
        try {
          const sha = await commit(snapshot, msg || (message ? message([...snapshot.keys()], snapshot) : "Admin edit"));
          if (sha) await settle(snapshot, sha);
          else for (const [p, e] of snapshot) if (st.local.get(p) === e) st.local.delete(p);
          break;
        } catch (e) {
          // The branch moved between the read and the ref update.
          if (e.status === 422 && attempt < 3) continue;
          throw e;
        }
      }
      st.savedAt = Date.now();
      st.error = null;
    } catch (e) {
      st.error = e;
    } finally {
      st.inflight = null;
      st.saving = false;
      emit({ saved: true });
      if (st.local.size) schedule();
    }
  }

  // Pick up commits made elsewhere while nothing is waiting to be saved.
  async function refresh() {
    if (st.loading || st.saving || st.current || st.local.size) return false;
    const remote = await api.branchHead(branch);
    if (remote === st.head) return false;
    st.saving = true;
    try {
      await sync(remote);
    } finally {
      st.saving = false;
      emit();
    }
    return true;
  }

  return {
    st,
    load,
    readTree,
    readText,
    has,
    get,
    json,
    list,
    base,
    baseHas,
    localUrl,
    set,
    remove,
    putBinary,
    putSha,
    discard,
    save,
    refresh,
    schedule,
    subscribe: (f) => (subs.add(f), () => subs.delete(f)),
    get head() {
      return st.head;
    },
    get dirty() {
      return [...st.local.keys()];
    },
  };
}

// The cache of file texts by blob sha: IndexedDB in the browser.
export function idbCache(name = "signet-admin") {
  let dbp = null;
  const open = () =>
    (dbp ||= new Promise((resolve) => {
      try {
        const r = indexedDB.open(name, 1);
        r.onupgradeneeded = () => r.result.createObjectStore("blobs");
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    }));
  const tx = async (mode, fn) => {
    const db = await open();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const t = db.transaction("blobs", mode);
        const r = fn(t.objectStore("blobs"));
        t.oncomplete = () => resolve(r && r.result);
        t.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  };
  return {
    get: (sha) => tx("readonly", (s) => s.get(sha)),
    set: (sha, text) => tx("readwrite", (s) => s.put(text, sha)),
  };
}

export function memoryCache() {
  const m = new Map();
  return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v) };
}
