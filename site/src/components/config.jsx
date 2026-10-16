/* The Puck configs: one for pages, one for posts. The static build renders
   with these same components, calling each one's render directly. */
import { Body } from "./layout.jsx";
import { useSite } from "./parts.jsx";
import { categories as sectionCategories } from "./sections.jsx";
import { blocks, registry, sections } from "./registry.jsx";
import { blocks as postBlocks, PostArticle } from "./post.jsx";

const text = (label) => ({ type: "text", label });

export const pageRootFields = {
  title: text("SEO title"),
  description: { type: "textarea", label: "Meta description" },
  path: text("URL"),
  breadcrumb: text("Breadcrumb"),
  robots: { type: "select", label: "Indexed", options: [{ label: "Yes", value: "index, follow" }, { label: "No", value: "noindex, follow" }] },
  ogImage: text("Share image"),
};

export const pageComponents = registry;

export const pageConfig = {
  root: {
    fields: pageRootFields,
    render: function PageRoot({ children, nav, path }) {
      const s = useSite();
      return (
        <Body nav={nav} trail={s && s.trail} output={s ? s.output : "index.html"} hubs={s ? s.hubs : new Set()} indexed={s ? s.indexed : false}>
          {children}
        </Body>
      );
    },
  },
  categories: {
    ...sectionCategories,
    other: { title: "Other", components: ["CustomHtml", "VideoIndex"] },
    blocks: { title: "Blocks", components: Object.keys(blocks) },
  },
  components: pageComponents,
};

export const postConfig = {
  root: {
    fields: {
      title: text("Title"),
      dek: { type: "textarea", label: "Dek" },
      eyebrow: text("Eyebrow"),
      date: text("Date"),
      last_updated: text("Updated"),
      seo_title: text("SEO title"),
      meta_description: { type: "textarea", label: "Meta description" },
      parent: text("Filed under"),
    },
    render: function PostRoot({ children }) {
      return children;
    },
  },
  components: postBlocks,
};

export { PostArticle };
export default pageConfig;
