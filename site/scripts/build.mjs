// Bundle the build (JSX) with esbuild and run it. Run from the repo root:
//   node site/scripts/build.mjs --out _site
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outfile = path.join(site, ".build", "main.mjs");
await build({
  entryPoints: [path.join(site, "src", "build", "main.jsx")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  jsx: "automatic",
  packages: "external",
  logLevel: "warning",
  nodePaths: [path.join(site, "node_modules")],
});
const r = spawnSync(process.execPath, [outfile, ...process.argv.slice(2)], { stdio: "inherit", env: { ...process.env, NODE_PATH: path.join(site, "node_modules") } });
process.exit(r.status ?? 1);
