/* Going live: what is on staging and not live, the saves made since, the
   go-lives made since the cutover, and putting any of it back. Go live
   itself merges staging into the live branch, once the live branch is
   built from content/. */
import { BASE_TAG, CUTOVER_TAG, GO_LIVE, LIVE, LIVE_WORKFLOW, STAGING } from "../config.js";
import { isText } from "./repo.js";
import { merge3 } from "./merge3.js";

const TRACKED = (p) => p.startsWith("content/") || p.startsWith("img/");

// The content files a commit or compare touched; a rename is both names.
const touched = (files) => [...new Set((files || []).flatMap((f) => [f.filename, f.previous_filename]).filter((p) => p && TRACKED(p)))];

// Go live is on once the live branch is built from content/.
export const canGoLive = (base) => GO_LIVE && !!base && base.ref === LIVE;

// What staging is compared with: the live branch once it is built from
// content/, until then the commit content/ first arrived on staging in.
export async function baseline(api, repo) {
  const live = await api.branchHead(LIVE);
  const files = await repo.readTree(live);
  if (files.has("content/site.json")) return { ref: LIVE, sha: live, files };
  const sha = await api.tagHead(BASE_TAG);
  return { ref: BASE_TAG, sha, files: await repo.readTree(sha) };
}

// Files that differ between the baseline and staging as saved.
export function pendingFiles(base, repo) {
  const head = repo.st.files;
  const paths = new Set([...base.files.keys(), ...head.keys()]);
  const out = [];
  for (const p of [...paths].sort()) {
    const a = base.files.get(p);
    const b = head.get(p);
    if (a === b) continue;
    out.push({ path: p, status: !a ? "added" : !b ? "removed" : "modified" });
  }
  return out;
}

// Saves on staging since the baseline, newest first, and the code files
// that would go live with them.
export async function history(api, base) {
  const c = await api.compare(base.sha, STAGING);
  const code = (c.files || []).filter((f) => !TRACKED(f.filename)).map((f) => f.filename);
  return { commits: [...(c.commits || [])].reverse(), code, behind: c.behind_by };
}

export async function textAt(repo, base, path) {
  const sha = base.files.get(path);
  if (!sha) return undefined;
  return repo.readText(path, sha, base.sha);
}

// Put one file back as it is in the baseline.
export async function revertFile(repo, base, path, message) {
  await repo.save();
  const sha = base.files.get(path);
  if (!sha) repo.remove(path);
  else if (isText(path)) repo.set(path, await repo.readText(path, sha, base.sha));
  else repo.putSha(path, sha);
  await repo.save(message);
  if (repo.st.error) throw repo.st.error;
}

// Undo one save. A file nothing has changed since goes back to what it was
// before the save; a file changed again since has just this save's change
// taken out, line by line. Where that can't be done cleanly the file is in
// `clash`, and the caller asks before putting the whole file back.
export async function revertPlan(api, repo, sha) {
  const d = await api.commitFiles(sha);
  const files = touched(d.files);
  const parent = d.parents[0].sha;
  const after = await api.compare(sha, STAGING);
  const changedSince = new Set((after.files || []).map((f) => f.filename));
  const [before, at] = await Promise.all([repo.readTree(parent), repo.readTree(sha)]);
  const plan = new Map();
  const whole = new Map();
  const clash = [];
  for (const p of files) {
    const old = before.get(p);
    const restore = !old ? null : isText(p) ? await repo.readText(p, old, parent) : { sha: old };
    whole.set(p, restore);
    if (!changedSince.has(p)) {
      plan.set(p, restore);
      continue;
    }
    const mid = at.get(p);
    const now = repo.base(p);
    if (isText(p) && old && mid && now != null) {
      const merged = merge3(await repo.readText(p, mid, sha), now, restore);
      if (merged != null) {
        plan.set(p, merged);
        continue;
      }
    }
    clash.push(p);
  }
  return { message: d.commit.message.split("\n")[0], plan, whole, clash };
}

export async function revertCommit(repo, rp, message, { anyway = false } = {}) {
  await repo.save();
  for (const p of rp.clash) if (anyway) rp.plan.set(p, rp.whole.get(p));
  for (const [p, v] of rp.plan) {
    if (v === null) repo.remove(p);
    else if (typeof v === "string") repo.set(p, v);
    else repo.putSha(p, v.sha);
  }
  await repo.save(message);
  if (repo.st.error) throw repo.st.error;
}

// Merge staging into the live branch. Refused until the live branch is
// built from content/.
export async function goLive(api, base, message) {
  if (!canGoLive(base)) throw new Error("Go live is off");
  return api.merge(LIVE, STAGING, message);
}

// Go-lives since the cutover, newest first: the live branch's own commits,
// following first parents down to the cutover, which can't be reverted here.
export async function goLives(api, n = 20) {
  const stop = await api.tagHead(CUTOVER_TAG).catch(() => null);
  if (!stop) return [];
  const out = [];
  let sha = await api.branchHead(LIVE);
  while (sha !== stop && out.length < n) {
    const c = await api.commit(sha);
    if (!c.parents.length) break;
    out.push({ sha, message: c.message.split("\n")[0], date: c.committer.date, parent: c.parents[0].sha });
    sha = c.parents[0].sha;
  }
  return out;
}

// Undo one go-live on the live site. As with a save: a file nothing has
// changed since goes back to what was live before; a file changed by a
// later go-live has just this one's change taken out, line by line, or is
// in `clash`.
export async function liveRevertPlan(api, repo, g) {
  const c = await api.compare(g.parent, g.sha);
  const files = touched(c.files);
  const head = await api.branchHead(LIVE);
  const [before, at, now] = await Promise.all([repo.readTree(g.parent), repo.readTree(g.sha), repo.readTree(head)]);
  const plan = new Map();
  const whole = new Map();
  const clash = [];
  for (const p of files) {
    const old = before.get(p);
    const restore = !old ? null : isText(p) ? await repo.readText(p, old, g.parent) : { sha: old };
    whole.set(p, restore);
    if (now.get(p) === at.get(p)) {
      if (now.get(p) !== old) plan.set(p, restore);
      continue;
    }
    if (isText(p) && old && at.get(p) && now.get(p)) {
      const merged = merge3(await repo.readText(p, at.get(p), g.sha), await repo.readText(p, now.get(p), head), restore);
      if (merged != null) {
        plan.set(p, merged);
        continue;
      }
    }
    clash.push(p);
  }
  return { message: g.message, plan, whole, clash, head, at, now };
}

// One commit on the live branch that takes the go-live out, which deploys
// the live site, then the same change into staging, so the next go-live
// doesn't bring it back. Run again after a failure, it finishes the part
// staging missed.
export async function revertLive(api, repo, rp, message, { anyway = false } = {}) {
  for (const p of rp.clash) if (anyway) rp.plan.set(p, rp.whole.get(p));
  const entries = treeEntries(rp.plan, rp.now);
  if (!entries.length) {
    await intoStaging(api, repo, rp, rp.head, message);
    return null;
  }
  const hc = await api.commit(rp.head);
  const t = await api.createTree(hc.tree.sha, entries);
  const c = await api.createCommit(message, t.sha, [rp.head]);
  await api.updateRef(LIVE, c.sha);
  await intoStaging(api, repo, rp, c.sha, message);
  return c.sha;
}

function treeEntries(plan, files) {
  const out = [];
  for (const [path, v] of plan) {
    if (v === null) {
      if (files.has(path)) out.push({ path, mode: "100644", type: "blob", sha: null });
    } else if (typeof v === "string") out.push({ path, mode: "100644", type: "blob", content: v });
    else out.push({ path, mode: "100644", type: "blob", sha: v.sha });
  }
  return out;
}

// Merge the live branch into staging. Where git can't, the merge commit is
// made here: a file staging has as it was live takes the revert, one
// changed since takes it line by line, and otherwise staging's edit stays
// and shows as pending.
async function intoStaging(api, repo, rp, liveSha, message) {
  await repo.save();
  try {
    await api.merge(STAGING, LIVE, message);
  } catch (e) {
    if (e.status !== 409) throw e;
    for (let attempt = 0; ; attempt++) {
      const head = await api.branchHead(STAGING);
      const files = await repo.readTree(head);
      const plan = new Map();
      for (const [p, v] of rp.plan) {
        const mine = files.get(p);
        const was = rp.now.get(p);
        if (mine === was) plan.set(p, v);
        else if (typeof v === "string" && mine && was && isText(p)) {
          const merged = merge3(await repo.readText(p, was, rp.head), await repo.readText(p, mine, head), v);
          if (merged != null) plan.set(p, merged);
        }
      }
      const hc = await api.commit(head);
      const entries = treeEntries(plan, files);
      const tree = entries.length ? (await api.createTree(hc.tree.sha, entries)).sha : hc.tree.sha;
      const c = await api.createCommit(message, tree, [head, liveSha]);
      try {
        await api.updateRef(STAGING, c.sha);
        break;
      } catch (err) {
        if (err.status === 422 && attempt < 3) continue;
        throw err;
      }
    }
  }
  await repo.refresh();
}

export async function liveRun(api, sha) {
  const r = await api.runs(LIVE_WORKFLOW, LIVE, 5);
  return (r.workflow_runs || []).find((x) => x.head_sha === sha) || null;
}
