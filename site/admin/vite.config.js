import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Only the admin's own scripts run, and it talks only to GitHub and staging:
// the token in its storage has nowhere else to go. Added to the built page
// only, since the dev server needs its own inline script.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "connect-src 'self' https://api.github.com https://raw.githubusercontent.com https://staging.signetartists.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "style-src 'self' 'unsafe-inline' https://staging.signetartists.com",
  "font-src 'self' data: https://staging.signetartists.com",
  "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");
const csp = {
  name: "csp",
  apply: "build",
  transformIndexHtml: (html) => html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
};

// Puck's stylesheet pulls a font from rsms.me; the admin uses the system
// font and loads nothing from third parties.
const noRemoteFont = {
  name: "no-remote-font",
  transform: (code, id) => (/@puckeditor[\\/]core/.test(id) ? code.replace(/@import\s+["']https:\/\/rsms\.me[^"']*["'];?/g, "") : null),
};

// GH_DEV_TOKEN=... with VITE_API_BASE=/gh: GitHub through the dev or preview
// server, which adds the token, so none is typed into the page.
const proxy = process.env.GH_DEV_TOKEN
  ? {
      "/gh": {
        target: "https://api.github.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/gh/, ""),
        configure: (px) => px.on("proxyReq", (req) => req.setHeader("Authorization", `Bearer ${process.env.GH_DEV_TOKEN}`)),
      },
    }
  : undefined;

// The admin app: `npm --prefix site run admin` to work on it,
// `npm --prefix site run build:admin` for the static build in admin/dist.
export default defineConfig({
  root: import.meta.dirname,
  base: "/",
  publicDir: false,
  plugins: [react(), csp, noRemoteFont],
  build: { outDir: path.resolve(import.meta.dirname, "dist"), emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 1500 },
  server: {
    port: 5794,
    strictPort: true,
    host: "127.0.0.1",
    fs: { allow: [path.resolve(import.meta.dirname, "..")] },
    proxy,
  },
  preview: { port: 5795, strictPort: true, host: "127.0.0.1", proxy },
});
