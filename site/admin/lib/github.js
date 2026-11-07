/* The GitHub REST calls the admin makes, with a fine-grained token. Reads
   and writes go through the Git Data API, so one save can carry several
   files in one commit. */

const API = "https://api.github.com";

export class GitHubError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export function github({ token, owner, repo, base = API, fetch: f = globalThis.fetch.bind(globalThis) }) {
  const R = `/repos/${owner}/${repo}`;

  async function req(method, path, body, { cache = "no-store" } = {}) {
    const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers["Content-Type"] = "application/json";
    let r;
    try {
      r = await f(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache });
    } catch (e) {
      throw new GitHubError(0, "Offline", null);
    }
    if (r.status === 204) return null;
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new GitHubError(r.status, (data && data.message) || r.statusText, data);
    return data;
  }

  // Immutable objects (by sha) can come from the browser cache.
  const imm = { cache: "force-cache" };

  return {
    req,
    repo: () => req("GET", R),
    branchHead: async (branch) => (await req("GET", `${R}/git/ref/heads/${encodeURIComponent(branch)}`)).object.sha,
    tagHead: async (tag) => {
      const ref = await req("GET", `${R}/git/ref/tags/${encodeURIComponent(tag)}`);
      if (ref.object.type === "tag") return (await req("GET", `${R}/git/tags/${ref.object.sha}`)).object.sha;
      return ref.object.sha;
    },
    commit: (sha) => req("GET", `${R}/git/commits/${sha}`, null, imm),
    tree: (sha, recursive) => req("GET", `${R}/git/trees/${sha}${recursive ? "?recursive=1" : ""}`, null, imm),
    blob: (sha) => req("GET", `${R}/git/blobs/${sha}`, null, imm),
    createBlob: (content, encoding = "base64") => req("POST", `${R}/git/blobs`, { content, encoding }),
    createTree: (base_tree, tree) => req("POST", `${R}/git/trees`, { base_tree, tree }),
    createCommit: (message, tree, parents) => req("POST", `${R}/git/commits`, { message, tree, parents }),
    updateRef: (branch, sha) => req("PATCH", `${R}/git/refs/heads/${encodeURIComponent(branch)}`, { sha, force: false }),
    createRef: (ref, sha) => req("POST", `${R}/git/refs`, { ref, sha }),
    deleteRef: (ref) => req("DELETE", `${R}/git/refs/${ref}`),
    commits: (branch, n = 50) => req("GET", `${R}/commits?sha=${encodeURIComponent(branch)}&per_page=${n}`),
    commitFiles: (sha) => req("GET", `${R}/commits/${sha}`),
    compare: (base, head) => req("GET", `${R}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`),
    runs: (workflow, branch, n = 5) => req("GET", `${R}/actions/workflows/${workflow}/runs?branch=${encodeURIComponent(branch)}&per_page=${n}`),
    merge: (base, head, commit_message) => req("POST", `${R}/merges`, { base, head, commit_message }),
  };
}

// ---------------------------------------------------------------- bytes

export function b64ToBytes(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export const utf8 = (s) => new TextEncoder().encode(s);
export const fromUtf8 = (b) => new TextDecoder().decode(b);

// The sha git gives a blob: sha1("blob <length>\0" + bytes).
export async function blobSha(bytes) {
  const head = utf8(`blob ${bytes.length}\0`);
  const all = new Uint8Array(head.length + bytes.length);
  all.set(head);
  all.set(bytes, head.length);
  const d = await crypto.subtle.digest("SHA-1", all);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// Run fn over items, n at a time.
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k], k);
    }
  });
  await Promise.all(workers);
  return out;
}
