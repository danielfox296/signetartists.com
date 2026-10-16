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

// Go live merges staging into the live branch. It stays off until the
// cutover (Phase 3): the list and the button are built, the merge is not
// sent. VITE_GO_LIVE=1 turns it on, for a test against a throwaway branch.
export const GO_LIVE = env.VITE_GO_LIVE === "1";
// Go live waits for staging to have built and rendered what it would send,
// except in that test, where the branch has no staging build.
export const GO_LIVE_NEEDS_BUILD = env.VITE_GO_LIVE_UNBUILT !== "1";

// What counts as live before the cutover, while main has no content/:
// the staging commit the converter's content first arrived in.
export const BASE_TAG = "content-base";

export const SAVE_AFTER_MS = 5000;

// The dev server proxies GitHub at /gh with its own token, so a token never
// has to be typed into a page while the admin is worked on.
export const API_BASE = env.VITE_API_BASE || "https://api.github.com";
