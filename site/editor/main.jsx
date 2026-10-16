/* A development editor: one page from content/ in Puck, with the site's
   own components and stylesheet on the canvas. Phase 2 builds the admin;
   this only proves the configs load. Open /?page=weddings */
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Puck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import { pageConfig } from "../src/components/config.jsx";
import { Site } from "../src/components/parts.jsx";
import { createModel, outputFor } from "../src/lib/model.js";

const files = import.meta.glob("../../content/**/*.json", { eager: true, import: "default" });
const logos = import.meta.glob("../../img/logos/*.svg", { eager: true, query: "?raw", import: "default" });
const thumbs = new Set(Object.keys(import.meta.glob("../../img/thumbs/*")).map((k) => k.replace("../../", "")));
const at = (p) => files[`../../content/${p}`];
const under = (dir) =>
  Object.entries(files)
    .filter(([k]) => k.startsWith(`../../content/${dir}/`))
    .map(([k, v]) => [k.split("/").pop().replace(".json", ""), v])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

const content = {
  site: at("site.json"),
  header: at("shared/header.json"),
  footer: at("shared/footer.json"),
  logoStrip: at("shared/logo-strip.json"),
  roster: at("roster.json"),
  acts: Object.fromEntries(under("acts")),
  videos: under("videos").map(([, v]) => v).sort((a, b) => a.order - b.order),
  posts: under("posts").map(([, d]) => d),
  pages: under("pages").map(([slug, d]) => Object.assign(structuredClone(d), { slug })),
  redirects: at("redirects.json"),
  photoFocus: at("photo-focus.json"),
  lastmod: {},
  repertoire: at("repertoire.json"),
  logoSvg: (id) => logos[`../../img/logos/${id}.svg`] || "<svg></svg>",
  exists: (rel) => thumbs.has(rel),
};
const model = createModel(content);
const slug = new URLSearchParams(location.search).get("page") || "weddings";
const doc = content.pages.find((d) => d.slug === slug);
const output = outputFor(doc.root.props.path);
const ctx = { model, hubs: new Set(), built: [], prefix: "/", output, url: doc.root.props.path, trail: model.breadcrumbs(output, ""), indexed: true, page: doc };

// The site's stylesheet goes inside the canvas only.
function Canvas({ children, document: d }) {
  useEffect(() => {
    if (!d || d.getElementById("signet-css")) return;
    const l = d.createElement("link");
    l.id = "signet-css";
    l.rel = "stylesheet";
    l.href = "/styles.css";
    d.head.appendChild(l);
  }, [d]);
  return <Site.Provider value={ctx}>{children}</Site.Provider>;
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Site.Provider value={ctx}>
      <Puck config={pageConfig} data={doc} headerTitle={doc.root.props.title} overrides={{ iframe: Canvas }} onChange={(d) => (window.__data = d)} />
    </Site.Provider>
  </StrictMode>
);
