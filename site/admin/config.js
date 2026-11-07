/* Where the admin reads and writes. The env overrides exist for testing
   against throwaway branches; the deployed admin uses the defaults. */
const env = (typeof import.meta !== "undefined" && import.meta.env) || {};

export const OWNER = "danielfox296";
export const REPO = "signetartists.com";
export const STAGING = env.VITE_STAGING_BRANCH || "staging";
export const LIVE = env.VITE_LIVE_BRANCH || "main";
export const STAGING_URL = env.VITE_STAGING_URL || "https://staging.signetartists.com";
export const STAGING_WORKFLOW = "staging.yml";
export const LIVE_WORKFLOW = "deploy.yml";

// Go live merges staging into the live branch. It is on once the live
// branch is built from content/ (from the cutover); before that, and if the
// live branch is ever put back on build.py, the button can't be pressed.
// VITE_GO_LIVE=0 turns it off.
export const GO_LIVE = env.VITE_GO_LIVE !== "0";
// Go live waits for staging to have built and rendered what it would send,
// except in that test, where the branch has no staging build.
export const GO_LIVE_NEEDS_BUILD = env.VITE_GO_LIVE_UNBUILT !== "1";

// What counts as live before the cutover, while main has no content/:
// the staging commit the converter's content first arrived in.
export const BASE_TAG = "content-base";

// The live branch's first commit built from content/. Go-lives after it can
// be reverted from the admin; the cutover itself can't.
export const CUTOVER_TAG = env.VITE_CUTOVER_TAG || "cutover";

export const SAVE_AFTER_MS = 5000;

// The dev server proxies GitHub at /gh with its own token, so a token never
// has to be typed into a page while the admin is worked on.
export const API_BASE = env.VITE_API_BASE || "https://api.github.com";
