/* App state outside React: the route, open drawers and dialogs, and the
   signed-in session (the GitHub client and the working copy). */
import { useSyncExternalStore } from "react";

export function createStore(init) {
  let s = init;
  const subs = new Set();
  return {
    get: () => s,
    set: (p) => {
      s = { ...s, ...(typeof p === "function" ? p(s) : p) };
      subs.forEach((f) => f());
    },
    sub: (f) => (subs.add(f), () => subs.delete(f)),
  };
}

export const parseRoute = (hash) => {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  return parts.length ? parts : ["pages"];
};

export const ui = createStore({ route: parseRoute(location.hash), drawer: null, dialog: null, toast: null, rail: false });
export const useUi = (sel) => useSyncExternalStore(ui.sub, () => sel(ui.get()));

window.addEventListener("hashchange", () => ui.set({ route: parseRoute(location.hash), rail: false }));
export const go = (...parts) => {
  location.hash = "#/" + parts.map(encodeURIComponent).join("/");
};

let toastTimer;
export function toast(msg) {
  clearTimeout(toastTimer);
  ui.set({ toast: msg });
  toastTimer = setTimeout(() => ui.set({ toast: null }), 3200);
}

// A dialog that resolves with what the person chose.
export function ask(dialog) {
  return new Promise((resolve) => ui.set({ dialog: { ...dialog, resolve: (v) => (ui.set({ dialog: null }), resolve(v)) } }));
}

// The signed-in session.
export const session = { api: null, repo: null, token: null };

// Re-render when the working copy changes.
let version = 0;
const vsubs = new Set();
export function watchRepo(repo) {
  return repo.subscribe(() => {
    version++;
    vsubs.forEach((f) => f());
  });
}
export const useRepo = () => useSyncExternalStore((f) => (vsubs.add(f), () => vsubs.delete(f)), () => version);

const KEY = "signet-admin-token";
export const storedToken = () => {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
};
export const storeToken = (t) => {
  try {
    if (t) localStorage.setItem(KEY, t);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: the session lasts as long as the tab */
  }
};
