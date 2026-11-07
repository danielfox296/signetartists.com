/* Every page the build writes, in build.py's order, before any is rendered:
   the all-pages index and the feeds read this list. The admin computes the
   same list for its canvas. */
import { outputFor } from "./model.js";

export function plan(c, m) {
  const LAST = ["video", "sitemap"];
  const entry = (d) => {
    const p = d.root.props;
    return { output: outputFor(p.path), title: p.title, description: p.description || "", robots: p.robots || "index, follow", indexLabel: p.indexLabel, watch: false, file: `content/pages/${d.slug}.json` };
  };
  const list = c.pages.filter((d) => !LAST.includes(d.slug)).map(entry);
  for (const v of m.FOOTAGE) list.push({ output: m.watchOutput(v), title: v.name, description: v.description, robots: "index, follow", indexLabel: v.name, watch: true, file: `content/videos/${v.slug}.json` });
  const video = c.pages.find((d) => d.slug === "video");
  if (video) list.push(entry(video));
  return list;
}
