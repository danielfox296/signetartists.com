/* Client testimonials, drawn from content/records/testimonials.json. Each one
   is shown with who wrote it, the event, the month and where it was
   published; away from its act's own page it also names the act. */
import { css, cx, esc } from "../lib/util.js";
import { bandClass, F, H, shellFields, useSite } from "./parts.jsx";

const { rich, text } = F;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "2025-02-26" or "2025-02" → "February 2025"; "2025" → "2025".
export function monthYear(d) {
  if (!d) return "";
  const [y, m] = String(d).split("-");
  return m ? `${MONTHS[Number(m) - 1]} ${y}` : y;
}


// The lines under a testimonial: who, the event and the month; then the act
// (with `withAct`, linking its page) and where it was published.
export function reviewCaption(m, t, withAct) {
  const who = [t.author ? `<span class="review-by">${esc(t.author)}</span>` : "", t.role ? esc(t.role) : ""].filter(Boolean).join(", ");
  const what = [t.event ? esc(t.event) : "", monthYear(t.date)].filter(Boolean).join(", ");
  const first = [who, what].filter(Boolean).join(", ");
  const a = withAct && t.act && m.ACT_BY_ID[t.act];
  const act = a && !a.hidden ? `<a href="/${esc(m.actUrl(a))}">${esc(a.name)}</a>` : "";
  const src = sourcePhrase(t.source || {});
  const second = [act, act ? src.charAt(0).toLowerCase() + src.slice(1) : src].filter(Boolean).join(", ");
  return [first ? first + "." : "", second ? `<span class="review-src">${second}.</span>` : ""].filter(Boolean).join(" ");
}

function sourcePhrase(src) {
  const p = src.platform || "";
  if (!p) return "";
  if (/website/i.test(p)) return "From the artist's website";
  if (/^signet/i.test(p)) return "Sent to Signet";
  return `${src.verified ? "Verified review" : "Review"} on ${esc(p)}`;
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

// More than `show` testimonials: the rest wait behind a "More" toggle.
function ReviewList({ items, show, withAct }) {
  const n = show > 0 ? show : items.length;
  const first = items.slice(0, n);
  const rest = items.slice(n);
  return (
    <>
      <div className="review-grid">
        {first.map((t) => <ReviewCard key={t.id} t={t} withAct={withAct} />)}
      </div>
      {rest.length ? (
        <details className="review-more">
          <summary>{`${rest.length} more`}</summary>
          <div className="review-grid">
            {rest.map((t) => <ReviewCard key={t.id} t={t} withAct={withAct} />)}
          </div>
        </details>
      ) : null}
    </>
  );
}

const num = (label) => ({ type: "number", label, min: 0 });

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
  fields: { act: text("Act"), band: shellFields.band, title: rich("Title"), lede: rich("Lede ({name} is the act's name)"), show: num("Shown before More") },
  defaultProps: { band: "ruled", title: "What clients say", show: 4 },
  render: function ActReviewsRender({ act, band, title, lede, show, wrapStyle }) {
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
          <ReviewList items={items} show={show == null ? 4 : show} />
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
    limit: num("How many"),
    show: num("Shown before More"),
  },
  defaultProps: { band: "ruled", title: "What clients say", limit: 6, show: 4 },
  render: function ReviewsRender({ band, title, lede, occasions, acts, ids, limit, show, wrapStyle }) {
    const s = useSite();
    const placed = placedOn(s.page);
    const items = s.model.reviewsWhere({ occasions: list(occasions), acts: list(acts), ids: list(ids) }).filter((t) => !placed.has(t.id)).slice(0, limit > 0 ? limit : undefined);
    if (!items.length) return null;
    return (
      <section className={cx(bandClass(band || "ruled"), "reviews")}>
        <div className="wrap" style={css(wrapStyle)}>
          <H as="h2" className="h2" html={title} />
          <H as="p" className="prose" html={lede} />
          <ReviewList items={items} show={show == null ? 4 : show} withAct />
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
