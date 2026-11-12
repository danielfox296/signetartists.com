/* Client testimonials, drawn from content/records/testimonials.json. Each one
   is shown with the person who left it and, away from its act's own page,
   the act, linking its page. */
import { css, cx, esc } from "../lib/util.js";
import { bandClass, F, H, shellFields, useSite } from "./parts.jsx";

const { rich, text } = F;

// The line under a testimonial: who left it, then (with `withAct`) the act.
export function reviewCaption(m, t, withAct) {
  const who = t.author ? `<span class="review-by">${esc(t.author)}</span>` : "";
  const a = withAct && t.act && m.ACT_BY_ID[t.act];
  const act = a && !a.hidden ? `<a href="/${esc(m.actUrl(a))}">${esc(a.name)}</a>` : "";
  const line = [who, act].filter(Boolean).join(", ");
  return line ? `<span class="review-who">${line}</span>` : "";
}

export function ReviewCard({ t, withAct, cls }) {
  const s = useSite();
  return (
    <figure className={cx("review-pull", cls)}>
      <H as="blockquote" html={t.quote} />
      <H as="figcaption" html={reviewCaption(s.model, t, withAct)} />
    </figure>
  );
}

// A testimonials section shows one testimonial, set large on its own: the
// first one named by id, else the best of the ones that match. Testimonials
// are spread through a page and across the site one at a time, never
// gathered into a wall (Daniel, 2026-11-11).
const len = (t) => String(t.quote || "").replace(/<[^>]+>/g, "").length;
export function bestReview(items) {
  if (!items.length) return null;
  const mid = items.filter((t) => len(t) >= 80 && len(t) <= 260 && !/\[/.test(t.quote));
  if (mid.length) return mid.reduce((a, b) => (len(b) > len(a) ? b : a));
  const any = items.filter((t) => len(t) >= 60);
  return (any.length ? any : items).reduce((a, b) => (len(b) < len(a) ? b : a));
}

function ReviewFeature({ t, withAct }) {
  const s = useSite();
  if (!t) return null;
  return (
    <figure className={cx("review-feature", len(t) > 300 && "review-feature--long")}>
      <H as="blockquote" html={t.quote} />
      <H as="figcaption" html={reviewCaption(s.model, t, withAct)} />
    </figure>
  );
}

// The testimonials a page already places in Testimonial blocks: a section
// on the same page does not repeat them.
function placedOn(page) {
  const placed = new Set();
  const walk = (o) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") {
      if (o.type === "Review" && o.props && o.props.review) placed.add(o.props.review);
      Object.values(o).forEach(walk);
    }
  };
  walk(page && page.content);
  return placed;
}

// An act page: every testimonial for the act. Draws nothing when it has none.
export const ActReviews = {
  label: "Act testimonials",
  fields: { act: text("Act"), band: shellFields.band, title: rich("Title"), lede: rich("Lede ({name} is the act's name)"), pick: text("Testimonial id (empty for the best)") },
  defaultProps: { band: "ruled", title: "What clients say" },
  render: function ActReviewsRender({ act, band, title, lede, pick, wrapStyle }) {
    const s = useSite();
    const a = act ? s.model.ACT_BY_ID[act] : s.model.pageAct(s.page);
    const placed = placedOn(s.page);
    const items = a ? s.model.reviewsFor(a.id).filter((t) => !placed.has(t.id)) : [];
    if (!items.length) return null;
    return (
      <section className={cx(bandClass(band || "ruled"), "reviews")} id="testimonials">
        <div className="wrap" style={css(wrapStyle)}>
          <H as="h2" className="h2" html={title || "What clients say"} />
          <H as="p" className="prose" html={typeof lede === "string" ? lede.replace(/\{name\}/g, esc(a.name)) : lede} />
          <ReviewFeature t={(pick && items.find((t) => t.id === pick)) || bestReview(items)} />
        </div>
      </section>
    );
  },
};

// Any page: testimonials picked by occasion and act, or named one by one.
export const Reviews = {
  label: "Testimonials",
  fields: {
    band: shellFields.band,
    title: rich("Title"),
    lede: rich("Lede"),
    occasions: text("Occasions (comma separated: wedding, ceremony, corporate, birthday, home, holiday, party, cocktail, venue)"),
    acts: text("Acts (comma separated ids; empty for all)"),
    ids: text("Testimonials (comma separated ids; overrides the filters)"),
  },
  defaultProps: { band: "ruled", title: "What clients say" },
  render: function ReviewsRender({ band, title, lede, occasions, acts, ids, wrapStyle }) {
    const s = useSite();
    const placed = placedOn(s.page);
    const items = s.model.reviewsWhere({ occasions: list(occasions), acts: list(acts), ids: list(ids) }).filter((t) => !placed.has(t.id));
    if (!items.length) return null;
    return (
      <section className={cx(bandClass(band || "ruled"), "reviews")}>
        <div className="wrap" style={css(wrapStyle)}>
          <H as="h2" className="h2" html={title} />
          <H as="p" className="prose" html={lede} />
          <ReviewFeature t={list(ids).length ? items[0] : bestReview(items)} withAct />
        </div>
      </section>
    );
  },
};

// One testimonial inside a section, by its id in the store.
export const Review = {
  label: "Testimonial",
  fields: { review: text("Testimonial id"), withAct: { type: "radio", label: "Name the act", options: [{ label: "Yes", value: true }, { label: "No", value: false }] } },
  defaultProps: { withAct: true },
  render: function ReviewRender({ review: id, withAct }) {
    const s = useSite();
    const t = s.model.REVIEW_BY_ID[id];
    if (!t) return null;
    return <ReviewCard t={t} withAct={withAct !== false} />;
  },
};

const list = (v) => (Array.isArray(v) ? v : String(v || "").split(",")).map((x) => String(x).trim()).filter(Boolean);
