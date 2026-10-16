/* Going live: what is on staging and not live, the saves made since, and
   putting any of it back. Go live itself merges staging into the live
   branch, and is off until the cutover (config GO_LIVE). */
import { BASE_TAG, GO_LIVE, LIVE, LIVE_WORKFLOW, STAGING } from "../config.js";
import { isText } from "./repo.js";
import { merge3 } from "./merge3.js";

const TRACKED = (p) => p.startsWith("content/") || p.startsWith("img/");

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
  const files = (d.files || []).map((f) => f.filename).filter(TRACKED);
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

// Merge staging into the live branch. Refused while GO_LIVE is off.
export async function goLive(api, message) {
  if (!GO_LIVE) throw new Error("Go live is off until the cutover");
  return api.merge(LIVE, STAGING, message);
}

export async function liveRun(api, sha) {
  const r = await api.runs(LIVE_WORKFLOW, LIVE, 5);
  return (r.workflow_runs || []).find((x) => x.head_sha === sha) || null;
}
