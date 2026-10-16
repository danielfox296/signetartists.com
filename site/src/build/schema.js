/* Structured data, built from the same files the page renders from. The
   FAQPage on a page is its visible Questions sections. */
import { htmlText, pyjson } from "../lib/util.js";

export const schemaTag = (payload) => `<script type="application/ld+json">${pyjson(payload)}</script>`;

export function makeSchema(m) {
  const { SITE_URL, brand, site } = m;
  const biz = site.business;

  const localBusinessNode = () => {
    const node = {
      "@type": "LocalBusiness",
      "@id": `${SITE_URL}/#business`,
      name: brand.name,
      description: brand.intro,
      url: SITE_URL,
      email: brand.email,
      address: { "@type": "PostalAddress", addressLocality: brand.city, addressRegion: brand.region, addressCountry: "US" },
      areaServed: m.SERVICE_AREAS.map((n) => ({ "@type": "Place", name: n })),
      priceRange: biz.priceRange,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/img/icon-512.png`, width: 512, height: 512 },
      image: biz.images.map((i) => `${SITE_URL}/${i}`),
      slogan: brand.tagline || "",
      founder: biz.founder,
      knowsAbout: biz.knowsAbout,
    };
    const maps = (brand.sameAs || []).filter((u) => u.includes("maps.google.com"));
    if (maps.length) node.hasMap = maps[0];
    if (brand.sameAs && brand.sameAs.length) node.sameAs = brand.sameAs;
    return node;
  };

  const actServiceNode = (a) => ({
    "@type": "Service",
    "@id": a.page ? `${SITE_URL}/${m.actUrl(a)}#service` : `${SITE_URL}/${m.ACTS_BASE}/#service-${a.id}`,
    name: a.name,
    serviceType: `${a.style} for private events`,
    description: a.blurb,
    provider: { "@id": `${SITE_URL}/#business` },
    areaServed: m.actAreas(a).map((n) => ({ "@type": "Place", name: n })),
  });

  const actEntityNode = (a) => {
    const e = a.entity;
    if (!e) return null;
    const url = `${SITE_URL}/${m.actUrl(a)}`;
    const node = { "@type": e.type, "@id": a.page ? `${url}#act` : `${SITE_URL}/${m.ACTS_BASE}/#entity-${a.id}`, name: a.name, url, image: `${SITE_URL}/img/${a.img}` };
    if (e.type === "MusicGroup") node.genre = (a.genre_tags || []).map((g) => m.GENRE_LABEL[g]);
    if (e.sameAs) node.sameAs = e.sameAs;
    return node;
  };
  const rosterEntityNodes = () => m.ACTS.map(actEntityNode).filter(Boolean);

  const faqPage = (items) => ({
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({ "@type": "Question", name: htmlText(f.q), acceptedAnswer: { "@type": "Answer", text: htmlText(f.a) } })),
  });

  // The questions a page shows and offers to search: its Questions sections
  // marked for it, leaving out any answer still marked open.
  const pageFaqs = (doc) =>
    doc.content.filter((c) => c.type === "Questions" && c.props.schema).flatMap((c) => (c.props.items || []).filter((f) => !f.open));

  const ogFor = (p) => {
    const og = p.ogImage || "";
    return og.startsWith("http://") || og.startsWith("https://") ? og : og ? `${SITE_URL}/${og.replace(/^\/+/, "")}` : `${SITE_URL}/img/og-default.png`;
  };

  // The page's own graph: what schema.json held under build.py.
  const pageGraph = (doc, canonical) => {
    const p = doc.root.props;
    const sc = p.schema;
    const graph = [localBusinessNode()];
    const svc = sc.service;
    let act = sc.act ? m.ACT_BY_ID[sc.act] : null;
    if (p.schemaKind === "roster") graph.push(...m.ACTS.map(actServiceNode), ...rosterEntityNodes());
    let pageEntity = null;
    if (act && `${SITE_URL}/${m.actUrl(act)}` === canonical) pageEntity = actEntityNode(act);
    let node = null;
    if (act && svc && `${SITE_URL}/${m.actUrl(act)}` === canonical) {
      node = actServiceNode(act);
      if (svc.name !== act.name) node.alternateName = svc.name;
      node.serviceType = svc.serviceType;
      if (svc.description) node.description = svc.description;
      if (svc.areaServed && svc.areaServed.length) node.areaServed = svc.areaServed.map((n) => ({ "@type": "Place", name: n }));
      act = null;
    } else if (svc) {
      node = {
        "@type": "Service",
        "@id": `${canonical}#service`,
        name: svc.name,
        serviceType: svc.serviceType,
        description: svc.description || "",
        provider: { "@id": `${SITE_URL}/#business` },
        areaServed: (svc.areaServed || m.SERVICE_AREAS).map((n) => ({ "@type": "Place", name: n })),
      };
    }
    if (node) {
      const reviews = sc.reviews || [];
      if (reviews.length) {
        node.review = reviews.map((r) => ({
          "@type": "Review",
          author: { "@type": "Person", name: r.author },
          reviewBody: r.body,
          reviewRating: { "@type": "Rating", ratingValue: r.rating ?? 5, bestRating: 5 },
          datePublished: r.date || "",
        }));
      }
      graph.push(node);
    }
    if (act) graph.push(actServiceNode(act));
    if (sc.video) {
      const a = m.ACT_BY_ID[sc.act];
      const vid = sc.video;
      const vn = { "@type": "VideoObject", "@id": `${canonical}#video`, name: vid.name, description: vid.description, thumbnailUrl: `${SITE_URL}/${a.video_poster}`, uploadDate: vid.uploadDate, duration: vid.duration };
      if (/^https?:\/\//.test(a.video)) vn.embedUrl = a.video;
      else vn.contentUrl = `${SITE_URL}/${a.video}`;
      const k = m.footageKey(a.video);
      if (m.FOOTAGE_BY_KEY[k]) vn.url = m.watchUrl(m.FOOTAGE_BY_KEY[k]);
      graph.push(vn);
    }
    for (const v of sc.videos || []) {
      const id = v.id;
      const vn = {
        "@type": "VideoObject",
        "@id": `${canonical}#video-${id}`,
        name: v.name,
        description: v.description,
        thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        uploadDate: v.uploadDate,
        duration: v.duration,
        embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
        contentUrl: `https://www.youtube.com/watch?v=${id}`,
        publisher: { "@id": `${SITE_URL}/#business` },
      };
      if (m.FOOTAGE_BY_KEY[id]) vn.url = m.watchUrl(m.FOOTAGE_BY_KEY[id]);
      if (v.clips && v.clips.length) {
        vn.hasPart = v.clips.map((c) => ({ "@type": "Clip", name: c.name, startOffset: c.start, endOffset: c.end, url: `https://www.youtube.com/watch?v=${id}&t=${Math.trunc(c.start)}s` }));
      }
      graph.push(vn);
    }
    const webpage = {
      "@type": "WebPage",
      "@id": canonical,
      url: canonical,
      name: p.title || brand.name,
      isPartOf: { "@type": "WebSite", url: SITE_URL, name: brand.name },
      about: { "@id": `${SITE_URL}/#business` },
      primaryImageOfPage: { "@type": "ImageObject", url: ogFor(p) },
    };
    if (pageEntity) {
      graph.push(pageEntity);
      webpage.about = { "@id": pageEntity["@id"] };
      webpage.mainEntity = { "@id": pageEntity["@id"] };
    }
    graph.push(webpage);
    const faqs = pageFaqs(doc);
    if (faqs.length) graph.push(faqPage(faqs));
    return { "@context": "https://schema.org", "@graph": graph };
  };

  // Pages with no schema of their own carry one of the site's set graphs.
  const kindSchema = (doc) => {
    const kind = doc.root.props.schemaKind;
    const faqs = pageFaqs(doc);
    if (kind === "organization") return { "@context": "https://schema.org", ...localBusinessNode() };
    if (kind === "faq" || kind === "plannerfaq") return { "@context": "https://schema.org", ...faqPage(faqs) };
    if (kind === "roster") return { "@context": "https://schema.org", "@graph": [localBusinessNode(), ...m.ACTS.map(actServiceNode), ...rosterEntityNodes()] };
    if (kind === "pricing") return { "@context": "https://schema.org", "@graph": [localBusinessNode(), ...m.ACTS.map(actServiceNode), faqPage(faqs)] };
    return null;
  };

  const pageSchema = (doc, canonical) => {
    if (doc.root.props.schema) return schemaTag(pageGraph(doc, canonical));
    const k = kindSchema(doc);
    return k ? schemaTag(k) : "";
  };

  const breadcrumbSchema = (trail) =>
    schemaTag({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: trail.map(([u, label], i) => ({ "@type": "ListItem", position: i + 1, name: label, item: SITE_URL + u })),
    });

  const articleSchema = (post, canonical, ogImage) => {
    const authorName = (post.author || {}).name ?? brand.name;
    const entity = { "@type": "LocalBusiness", "@id": `${SITE_URL}/#business`, name: brand.name, url: SITE_URL, logo: { "@type": "ImageObject", url: `${SITE_URL}/img/icon-512.png` } };
    return {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title || "",
      description: post.meta_description || "",
      author: authorName === brand.name ? entity : { "@type": "Person", name: authorName },
      publisher: entity,
      datePublished: post.date || "",
      dateModified: post.last_updated || post.date || "",
      image: ogImage,
      mainEntityOfPage: { "@type": "WebPage", "@id": canonical, primaryImageOfPage: { "@type": "ImageObject", url: ogImage } },
    };
  };

  const watchSchema = (v, canonical) => {
    const node = {
      "@type": "VideoObject",
      "@id": `${canonical}#video`,
      name: v.name,
      description: v.description,
      thumbnailUrl: m.watchThumb(v),
      uploadDate: v.uploadDate,
      duration: v.duration,
      url: canonical,
      publisher: { "@id": `${SITE_URL}/#business` },
    };
    if (v.id) {
      node.embedUrl = `https://www.youtube-nocookie.com/embed/${v.id}`;
      node.contentUrl = `https://www.youtube.com/watch?v=${v.id}`;
    } else node.contentUrl = `${SITE_URL}/${v.file}`;
    const graph = [localBusinessNode(), node];
    const ent = actEntityNode(m.ACT_BY_ID[v.act]);
    if (ent) {
      graph.push(ent);
      node.about = { "@id": ent["@id"] };
    }
    graph.push({
      "@type": "WebPage",
      "@id": canonical,
      url: canonical,
      name: v.name,
      isPartOf: { "@type": "WebSite", url: SITE_URL, name: brand.name },
      about: { "@id": `${SITE_URL}/#business` },
      primaryImageOfPage: { "@type": "ImageObject", url: m.watchThumb(v) },
      mainEntity: { "@id": node["@id"] },
      video: { "@id": node["@id"] },
    });
    return { "@context": "https://schema.org", "@graph": graph };
  };

  const videoIndexSchema = (doc, canonical, listed) => {
    const p = doc.root.props;
    return {
      "@context": "https://schema.org",
      "@graph": [
        localBusinessNode(),
        {
          "@type": "CollectionPage",
          "@id": canonical,
          url: canonical,
          name: p.title,
          description: p.description,
          isPartOf: { "@type": "WebSite", url: SITE_URL, name: brand.name },
          about: { "@id": `${SITE_URL}/#business` },
          mainEntity: { "@type": "ItemList", itemListElement: listed.map((v, i) => ({ "@type": "ListItem", position: i + 1, name: v.name, url: m.watchUrl(v) })) },
        },
      ],
    };
  };

  return { localBusinessNode, actServiceNode, actEntityNode, pageSchema, breadcrumbSchema, articleSchema, watchSchema, videoIndexSchema, ogFor, pageFaqs };
}
