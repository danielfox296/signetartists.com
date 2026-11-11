/* An act's awards, press and stages (`honors` in content/acts/<id>.json).
   Awards, nominations and the like are drawn as laurels; press, TV and radio
   carry the outlet's mark where there is one; stages, collaborations and
   training are a plain list. One-colour marks live in img/honors/. */
import { Fragment } from "react";
import { cx } from "../lib/util.js";
import { useHref } from "./parts.jsx";

// The word over a laurel, by kind.
export const LAUREL = { award: "Winner", finalist: "Finalist", honoree: "Honoree", nomination: "Nominee", invited: "Invited" };
const PRESS = { press: "Press", tv: "TV", radio: "Radio" };
const ORDER = ["award", "honoree", "finalist", "nomination", "invited"];

export const honorsOf = (a) => (a && Array.isArray(a.honors) ? a.honors : []);
export const laurelsOf = (a) =>
  honorsOf(a)
    .filter((h) => LAUREL[h.kind])
    .map((h, i) => [h, i])
    .sort((x, y) => ORDER.indexOf(x[0].kind) - ORDER.indexOf(y[0].kind) || x[1] - y[1])
    .map(([h]) => h);
export const pressOf = (a) => honorsOf(a).filter((h) => PRESS[h.kind]);
export const creditsOf = (a) => honorsOf(a).filter((h) => !LAUREL[h.kind] && !PRESS[h.kind]);
// Stages and training that carry a mark (Swallow Hill, Dazzle, Berklee) also
// join the row of marks.
export const markedOf = (a) => honorsOf(a).filter((h) => h.logo);

// One half of a laurel wreath: a stem curving up and out, leaves set along it
// in pairs. Worked out once; the right half is the same drawing mirrored.
const BRANCH = (() => {
  const P0 = [36, 118], P1 = [-8, 66], P2 = [26, 6];
  const at = (t) => [0, 1].map((k) => (1 - t) ** 2 * P0[k] + 2 * (1 - t) * t * P1[k] + t * t * P2[k]);
  const tan = (t) => [0, 1].map((k) => 2 * (1 - t) * (P1[k] - P0[k]) + 2 * t * (P2[k] - P1[k]));
  const f = (n) => Math.round(n * 10) / 10;
  // A pointed leaf from its base at the origin along +x.
  const leaf = (x, y, ang, len, w) =>
    `<path transform="translate(${f(x)} ${f(y)}) rotate(${f(ang)})" d="M0 0Q${f(len * 0.45)} ${f(-w)} ${f(len)} 0Q${f(len * 0.45)} ${f(w)} 0 0Z"/>`;
  const out = [];
  const N = 7;
  for (let i = 0; i < N; i++) {
    const t = 0.08 + i * 0.125;
    const [x, y] = at(t);
    const [dx, dy] = tan(t);
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    const k = 1 - i * 0.06;
    out.push(leaf(x, y, ang - 48, 19 * k, 5.8 * k));
    out.push(leaf(x, y, ang + 34, 14 * k, 4.4 * k));
  }
  const [tx, ty] = at(1);
  const [ex, ey] = tan(1);
  out.push(leaf(tx, ty, (Math.atan2(ey, ex) * 180) / Math.PI, 11, 3.4));
  const stem = `<path d="M${P0[0]} ${P0[1]}Q${P1[0]} ${P1[1]} ${P2[0]} ${P2[1]}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`;
  return stem + out.join("");
})();

// A small pair of branches, for a card's award line.
export function MiniLaurel() {
  return (
    <svg className="card-honor-icon" viewBox="-22 -6 120 128" aria-hidden="true" focusable="false" fill="currentColor"
      dangerouslySetInnerHTML={{ __html: `<g>${BRANCH}</g><g transform="translate(76 0) scale(-1 1)">${BRANCH}</g>` }} />
  );
}

export function Branch({ right }) {
  return (
    <svg className={cx("laurel-branch", right && "laurel-branch--r")} viewBox="-22 -6 70 128" aria-hidden="true" focusable="false" fill="currentColor"
      dangerouslySetInnerHTML={{ __html: BRANCH }} />
  );
}

const fromYear = (h) => [h.from, h.year].filter(Boolean).join(", ");

// One laurel: the kind over the honour, the giver and year under it.
export function Laurel({ h, act, href: link, small, plain }) {
  const href = useHref();
  const body = (
    <>
      <Branch />
      <span className="laurel-text">
        <span className="laurel-kind">{LAUREL[h.kind]}</span>
        <span className="laurel-title">{h.title}</span>
        {fromYear(h) ? <span className="laurel-from">{fromYear(h)}</span> : null}
        {act ? <span className="laurel-act">{act}</span> : null}
      </span>
      <Branch right />
    </>
  );
  const to = plain ? null : link || h.link;
  return (
    <li className={cx("laurel", small && "laurel--small")}>
      {to ? <a className="laurel-link" href={link ? link : href(to)} rel={link ? undefined : "noopener"}>{body}</a> : <div className="laurel-link">{body}</div>}
    </li>
  );
}

export function LaurelRow({ items, small, plain, cls }) {
  if (!items.length) return null;
  return (
    <ul className={cx("laurels", small && "laurels--small", cls)}>
      {items.map((h, i) => <Laurel key={i} h={h} small={small} plain={plain} />)}
    </ul>
  );
}

// An outlet's or awarding body's mark, or its name set in capitals.
// Each mark's height against the base: a square crest and a wide wordmark at
// one pixel height never look the same size.
const MARK_H = {
  "honors/swallow-hill.png": 1.45, "honors/dazzle.png": 1.5, "honors/josie-music-awards.png": 1.7, "honors/jazziz.png": 1.5,
  "honors/focoma.svg": 1.45, "honors/wammies.svg": 1.05, "honors/9news.png": 0.8, "honors/berklee.svg": 0.75,
  "honors/rolling-stone-india.png": 0.9, "honors/vail-daily.png": 0.75, "honors/denver-gazette.png": 1.1, "honors/gazette.png": 1.05,
};

export function Mark({ h }) {
  const href = useHref();
  if (h.logo) return <img className="honor-mark" style={{ "--mark-h": String(MARK_H[h.logo] ?? 1) }} src={href(`/img/${h.logo}`)} alt={h.from || ""} loading="lazy" decoding="async" />;
  return <span className="honor-mark honor-mark--type">{h.from}</span>;
}

// The marks of an act, once each, for the hero.
export function MarkRow({ items, cls }) {
  const seen = new Set();
  const list = items.filter((h) => h.logo && !seen.has(h.logo) && seen.add(h.logo));
  if (!list.length) return null;
  return (
    <ul className={cx("honor-marks", cls)} aria-label="Awards, press and stages">
      {list.map((h, i) => <li key={i}><Mark h={h} /></li>)}
    </ul>
  );
}

const Linked = ({ to, children }) => {
  const href = useHref();
  return to ? <a href={href(to)} rel="noopener">{children}</a> : children;
};

export function PressList({ items }) {
  if (!items.length) return null;
  return (
    <ul className="press-list">
      {items.map((h, i) => (
        <li key={i} className={cx("press-item", h.quote && "press-item--quote")}>
          <div className="press-mark"><Mark h={h} /></div>
          <div className="press-body">
            <p className="press-kicker">{[PRESS[h.kind], h.logo ? h.from : null, h.year].filter(Boolean).join(" · ")}</p>
            {h.quote ? <p className="press-quote">“{h.quote}”</p> : null}
            <p className="press-title">
              <Linked to={h.link}>{h.title}</Linked>
              {h.who ? <span className="honor-who"> ({h.who})</span> : null}
            </p>
            {h.detail ? <p className="press-detail">{h.detail}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CreditList({ items }) {
  if (!items.length) return null;
  return (
    <ul className="honor-credits">
      {items.map((h, i) => (
        <li key={i}>
          {h.who ? <span className="honor-who">{h.who}: </span> : null}
          <Linked to={h.link}>{h.title}</Linked>
          {h.from && !h.title.includes(h.from) ? <span className="honor-from">, {h.from}</span> : null}
          {h.year ? <span className="honor-year"> ({h.year})</span> : null}
        </li>
      ))}
    </ul>
  );
}

export { Fragment };
