/* Every component by name, and how the static build renders a stored item:
   nested blocks (slot fields) become the components Puck would pass. */
import { blockComponents } from "./blocks.jsx";
import { components as sectionComponents } from "./sections.jsx";
import { BlogPosts, CustomHtml, PageIndex, VideoIndex } from "./generated.jsx";

export const blocks = { ...blockComponents, BlogPosts, PageIndex };
export const sections = { ...sectionComponents, CustomHtml, VideoIndex };
export const registry = { ...sections, ...blocks };

export function Item({ c }) {
  const C = registry[c.type];
  if (!C) throw new Error(`No component for ${c.type}`);
  const props = { ...c.props, puck: { isEditing: false } };
  for (const [k, f] of Object.entries(C.fields || {})) {
    if (f.type !== "slot") continue;
    const items = Array.isArray(props[k]) ? props[k] : [];
    props[k] = function SlotItems() {
      return items.map((x) => <Item key={x.props.id} c={x} />);
    };
  }
  const R = C.render;
  return <R {...props} />;
}
