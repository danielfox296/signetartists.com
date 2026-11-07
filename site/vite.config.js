import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Development only: the editor page, with the repo root served as is so the
// canvas gets styles.css, img/ and vendor/fonts/.
export default defineConfig({
  root: path.resolve(__dirname, "editor"),
  publicDir: path.resolve(__dirname, ".."),
  plugins: [react()],
  server: { port: 5793, strictPort: true, host: "127.0.0.1", fs: { allow: [path.resolve(__dirname, "..")] } },
});
