/* Going live: what is on staging and not live, the saves made since, and
   putting any of it back. Go live itself merges staging into the live
   branch, and is off until the cutover (config GO_LIVE). */
import { BASE_TAG, GO_LIVE, LIVE, LIVE_WORKFLOW, STAGING } from "../config.js";
import { isText } from "./repo.js";

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

// Undo one save: each file it changed goes back to what it was before it.
// Files changed again since are listed in `later` for the caller to ask about.
export async function revertPlan(api, repo, sha) {
  const d = await api.commitFiles(sha);
  const files = (d.files || []).map((f) => f.filename).filter(TRACKED);
  const parent = d.parents[0].sha;
  const after = await api.compare(sha, STAGING);
  const later = new Set((after.files || []).map((f) => f.filename));
  return { message: d.commit.message.split("\n")[0], parent, files, later: files.filter((f) => later.has(f)) };
}

export async function revertCommit(repo, plan, message) {
  await repo.save();
  const before = await repo.readTree(plan.parent);
  for (const p of plan.files) {
    const sha = before.get(p);
    if (!sha) repo.remove(p);
    else if (isText(p)) repo.set(p, await repo.readText(p, sha, plan.parent));
    else repo.putSha(p, sha);
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
