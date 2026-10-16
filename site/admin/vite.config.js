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
  transformIndexHtml: (html) => html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
};

// The admin app: `npm --prefix site run admin` to work on it,
// `npm --prefix site run build:admin` for the static build in admin/dist.
export default defineConfig({
  root: import.meta.dirname,
  base: "/",
  publicDir: false,
  plugins: [react(), csp],
  build: { outDir: path.resolve(import.meta.dirname, "dist"), emptyOutDir: true, sourcemap: false },
  server: {
    port: 5794,
    strictPort: true,
    host: "127.0.0.1",
    fs: { allow: [path.resolve(import.meta.dirname, "..")] },
    // GH_DEV_TOKEN=... with VITE_API_BASE=/gh: GitHub through the dev server.
    proxy: process.env.GH_DEV_TOKEN
      ? {
          "/gh": {
            target: "https://api.github.com",
            changeOrigin: true,
            rewrite: (p) => p.replace(/^\/gh/, ""),
            configure: (proxy) => proxy.on("proxyReq", (req) => req.setHeader("Authorization", `Bearer ${process.env.GH_DEV_TOKEN}`)),
          },
        }
      : undefined,
  },
  preview: { port: 5795, strictPort: true, host: "127.0.0.1" },
});
