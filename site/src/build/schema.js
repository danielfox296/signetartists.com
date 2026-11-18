/* Structured data, built from the same files the page renders from. The
   FAQPage on a page is its visible Questions sections. */
import { htmlText, pyjson } from "../lib/util.js";

// Leaves out any property whose value is null, undefined, an empty string or
// an empty array, at every depth.
export function prune(v) {
  if (Array.isArray(v)) return v.map(prune).filter((x) => x !== undefined);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      const y = prune(x);
      if (y === null || y === undefined || y === "" || (Array.isArray(y) && !y.length)) continue;
      out[k] = y;
    }
    return out;
  }
  return v;
}

export const schemaTag = (payload) => `<script type="application/ld+json">${pyjson(prune(payload))}</script>`;

export function makeSchema(m) {
  const { SITE_URL, brand, site } = m;
  const biz = site.business;

  const localBusinessNode = () => {
    const node = {
      "@type": ["LocalBusiness", "Organization"],
      "@id": `${SITE_URL}/#business`,
      name: brand.name,
      description: brand.intro,
      url: SITE_URL,
      email: brand.email,
      address: { "@type": "PostalAddress", addressLocality: brand.city, addressRegion: brand.region, addressCountry: "US" },
      areaServed: m.SERVICE_AREAS.map((n) => ({ "@type": "Place", name: n })),
      priceRange: biz.priceRange,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/img/logo-512.png`, width: 512, height: 512 },
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

  // The act's own entity node: every act has one. Its id is the act page's
  // URL plus #act. The type is the one the act's file declares (a Featured
  // Artist), else MusicGroup, which is what a house format is.
  const actEntityId = (a) => (a.page ? `${SITE_URL}/${m.actUrl(a)}#act` : `${SITE_URL}/${m.ACTS_BASE}/#entity-${a.id}`);

  // The service is provided by the business; the act is what the service
  // delivers, so it is linked with serviceOutput when the graph carries the
  // act's node.
  const actServiceNode = (a, withEntity = false) => {
    const node = {
      "@type": "Service",
      "@id": a.page ? `${SITE_URL}/${m.actUrl(a)}#service` : `${SITE_URL}/${m.ACTS_BASE}/#service-${a.id}`,
      name: a.name,
      serviceType: `${a.style} for private events`,
      description: a.blurb,
      provider: { "@id": `${SITE_URL}/#business` },
      areaServed: m.actAreas(a).map((n) => ({ "@type": "Place", name: n })),
    };
    if (withEntity) node.serviceOutput = { "@id": actEntityId(a) };
    return node;
  };

  const actEntityNode = (a) => {
    if (!a) return null;
    const e = a.entity || {};
    const type = e.type || "MusicGroup";
    const url = `${SITE_URL}/${m.actUrl(a)}`;
    const node = { "@type": type, "@id": actEntityId(a), name: a.name, url, image: `${SITE_URL}/img/${a.img}` };
    if (type === "MusicGroup") node.genre = (a.genre_tags || []).map((g) => m.GENRE_LABEL[g]).filter(Boolean);
    if (e.sameAs) node.sameAs = e.sameAs;
    // What the act has won (honors in its act file), as schema.org award text.
    const won = (a.honors || []).filter((h) => h.kind === "award" || h.kind === "honoree").map((h) => `${h.title}${h.from ? `, ${h.from}` : ""}${h.year ? ` (${h.year})` : ""}`);
    if (won.length) node.award = won;
    return node;
  };
  const rosterEntityNodes = () => m.ACTS.map(actEntityNode).filter(Boolean);
  const rosterNodes = () => [...m.ACTS.map((a) => actServiceNode(a, true)), ...rosterEntityNodes()];

  const faqPage = (items) => ({
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({ "@type": "Question", name: htmlText(f.q), acceptedAnswer: { "@type": "Answer", text: htmlText(f.a) } })),
  });

  const websiteNode = () => ({
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: brand.name,
    publisher: { "@id": `${SITE_URL}/#business` },
  });

  // A page that reads as an article (a guide, a worked template, a long
  // explainer) says so: root.props.schemaArticle is "on" (the admin's
  // Article schema switch). Its dates are the page's own, the day it was
  // first published and the day its file last changed.
  const articleNode = (p, canonical, dates, image) => {
    const headline = (p.title || brand.name).replace(new RegExp(`\\s*\\|\\s*${brand.name}$`), "");
    const entity = { "@id": `${SITE_URL}/#business` };
    const node = {
      "@type": "Article",
      "@id": `${canonical}#article`,
      headline,
      description: p.description || "",
      image,
      author: entity,
      publisher: entity,
      mainEntityOfPage: { "@id": canonical },
    };
    if (dates.published) node.datePublished = dates.published;
    if (dates.modified) node.dateModified = dates.modified;
    return node;
  };

  // The questions a page shows and offers to search: its Questions sections
  // marked for it, leaving out any answer still marked open.
  const pageFaqs = (doc) => {
    const out = [];
    const walk = (items) => {
      for (const c of items || []) {
        if (c.type === "Faq" && c.props.schema) out.push(...(c.props.items || []).filter((f) => !f.open));
        for (const v of Object.values(c.props || {})) if (Array.isArray(v) && v.length && v[0] && v[0].type && v[0].props) walk(v);
      }
    };
    walk(doc.content);
    return out;
  };

  const ogFor = (p) => {
    const og = p.ogImage || "";
    return og.startsWith("http://") || og.startsWith("https://") ? og : og ? `${SITE_URL}/${og.replace(/^\/+/, "")}` : `${SITE_URL}/img/og-signet-v2.jpg`;
  };

  // The page's own graph: what schema.json held under build.py.
  const pageGraph = (doc, canonical, dates = {}) => {
    const p = doc.root.props;
    const sc = p.schema || {};
    const graph = [localBusinessNode()];
    const svc = sc.service;
    let act = sc.act ? m.ACT_BY_ID[sc.act] : null;
    if (p.schemaKind === "roster") graph.push(...rosterNodes());
    let pageEntity = null;
    if (act && `${SITE_URL}/${m.actUrl(act)}` === canonical) pageEntity = actEntityNode(act);
    let node = null;
    if (act && svc && `${SITE_URL}/${m.actUrl(act)}` === canonical) {
      node = actServiceNode(act, !!pageEntity);
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
    // A service sold as named packages: each package is its own Service, tied
    // to the page's service, with what it includes and no price.
    const packages = svc && !act ? svc.packages || [] : [];
    const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (node && packages.length) node.isRelatedTo = packages.map((k) => ({ "@id": `${canonical}#package-${slug(k.name)}` }));
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
      for (const k of packages) {
        graph.push({
          "@type": "Service",
          "@id": `${canonical}#package-${slug(k.name)}`,
          name: k.name,
          serviceType: svc.serviceType,
          description: k.description || "",
          provider: { "@id": `${SITE_URL}/#business` },
          areaServed: node.areaServed,
          isRelatedTo: { "@id": node["@id"] },
        });
      }
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
    // A preferred vendor's page is about them, not us. Their node keeps the
    // @id their own site gives the business, so the two read as one entity.
    if (sc.vendor) pageEntity = { "@type": ["ProfessionalService", "Organization"], ...sc.vendor };
    if (pageEntity) {
      graph.push(pageEntity);
      webpage.about = { "@id": pageEntity["@id"] };
      webpage.mainEntity = { "@id": pageEntity["@id"] };
    }
    if (p.schemaArticle === "on") {
      const article = articleNode(p, canonical, dates, ogFor(p));
      graph.push(article);
      if (!webpage.mainEntity) webpage.mainEntity = { "@id": article["@id"] };
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
    if (kind === "organization") return { "@context": "https://schema.org", "@graph": [localBusinessNode(), websiteNode()] };
    if (kind === "faq" || kind === "plannerfaq") {
      const p = doc.root.props;
      const canonical = `${SITE_URL}${p.path}`;
      const page = { ...faqPage(faqs), "@id": canonical, url: canonical, name: p.title || brand.name, isPartOf: { "@type": "WebSite", url: SITE_URL, name: brand.name }, about: { "@id": `${SITE_URL}/#business` } };
      return { "@context": "https://schema.org", "@graph": [localBusinessNode(), page] };
    }
    if (kind === "vendorlist") {
      const canonical = `${SITE_URL}${doc.root.props.path}`;
      const seen = new Set();
      const vendors = [];
      for (const c of doc.content) {
        if (c.type !== "VendorList") continue;
        for (const v of c.props.vendors || []) {
          if (seen.has(v.name)) continue;
          seen.add(v.name);
          vendors.push(v);
        }
      }
      return {
        "@context": "https://schema.org",
        "@graph": [
          localBusinessNode(),
          {
            "@type": "CollectionPage",
            "@id": canonical,
            url: canonical,
            name: doc.root.props.title,
            description: doc.root.props.description,
            isPartOf: { "@type": "WebSite", url: SITE_URL, name: brand.name },
            about: { "@id": `${SITE_URL}/#business` },
            mainEntity: { "@type": "ItemList", itemListElement: vendors.map((v, i) => ({ "@type": "ListItem", position: i + 1, name: v.name, url: v.page ? `${SITE_URL}${v.page}` : v.url })) },
          },
        ],
      };
    }
    if (kind === "roster") return { "@context": "https://schema.org", "@graph": [localBusinessNode(), ...rosterNodes()] };
    if (kind === "pricing") return { "@context": "https://schema.org", "@graph": [localBusinessNode(), ...m.ACTS.map((a) => actServiceNode(a)), faqPage(faqs)] };
    return null;
  };

  // A venue page: the hotel or resort as a place, the live music we offer
  // there as a service, the acts the page names, and its questions.
  const venueGraph = (doc, canonical) => {
    const p = doc.root.props;
    const v = p.venue;
    const kind = String(v.kind || "").toLowerCase();
    const placeType = kind.includes("resort") ? "Resort" : kind.includes("hotel") ? "Hotel" : "EventVenue";
    const place = {
      "@type": placeType,
      "@id": `${canonical}#venue`,
      name: v.name,
      description: v.area || "",
      address: { "@type": "PostalAddress", addressRegion: "CO", addressCountry: "US" },
      containedInPlace: { "@type": "Place", name: `${v.group}, Colorado` },
    };
    if (p.heroImage) place.image = `${SITE_URL}/${p.heroImage.replace(/^\/+/, "")}`;
    const venue = (m.VENUES || []).find((x) => x.path === p.path);
    const acts = venue ? [...venue.named].map((id) => m.ACT_BY_ID[id]).filter((a) => a && !a.hidden) : [];
    const service = {
      "@type": "Service",
      "@id": `${canonical}#service`,
      name: `Live music at ${v.name}`,
      serviceType: "Live music for weddings and events",
      description: p.description || "",
      provider: { "@id": `${SITE_URL}/#business` },
      areaServed: { "@id": place["@id"] },
    };
    const webpage = {
      "@type": "WebPage",
      "@id": canonical,
      url: canonical,
      name: p.title || brand.name,
      isPartOf: { "@type": "WebSite", url: SITE_URL, name: brand.name },
      about: { "@id": place["@id"] },
      mainEntity: { "@id": service["@id"] },
      primaryImageOfPage: { "@type": "ImageObject", url: place.image || ogFor(p) },
    };
    const entities = acts.map(actEntityNode).filter(Boolean);
    if (entities.length) webpage.mentions = entities.map((e) => ({ "@id": e["@id"] }));
    const graph = [localBusinessNode(), place, service, webpage, ...entities];
    const faqs = pageFaqs(doc);
    if (faqs.length) graph.push(faqPage(faqs));
    return { "@context": "https://schema.org", "@graph": graph };
  };

  // Every other page: the business and the page, typed by what it is.
  const plainGraph = (doc, canonical) => {
    const p = doc.root.props;
    const type = { "/about/": "AboutPage", "/contact/": "ContactPage", "/blog/": "CollectionPage", "/venues/": "CollectionPage" }[p.path] || "WebPage";
    const webpage = {
      "@type": type,
      "@id": canonical,
      url: canonical,
      name: p.title || brand.name,
      description: p.description || "",
      isPartOf: { "@type": "WebSite", url: SITE_URL, name: brand.name },
      about: { "@id": `${SITE_URL}/#business` },
      primaryImageOfPage: { "@type": "ImageObject", url: ogFor(p) },
    };
    if (p.path === "/venues/" && m.VENUES && m.VENUES.length) {
      webpage.mainEntity = { "@type": "ItemList", itemListElement: m.VENUES.map((v, i) => ({ "@type": "ListItem", position: i + 1, name: v.name, url: `${SITE_URL}${v.path}` })) };
    }
    const graph = [localBusinessNode(), webpage];
    if (p.path === "/about/") graph.push(websiteNode());
    const faqs = pageFaqs(doc);
    if (faqs.length) graph.push(faqPage(faqs));
    return { "@context": "https://schema.org", "@graph": graph };
  };

  const pageSchema = (doc, canonical, dates) => {
    if (doc.root.props.schema || doc.root.props.schemaArticle === "on") return schemaTag(pageGraph(doc, canonical, dates));
    const k = kindSchema(doc);
    if (k) return schemaTag(k);
    if ((doc.root.props.robots || "").startsWith("noindex")) return "";
    if (doc.root.props.venue) return schemaTag(venueGraph(doc, canonical));
    return schemaTag(plainGraph(doc, canonical));
  };

  const breadcrumbSchema = (trail) =>
    schemaTag({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: trail.map(([u, label], i) => ({ "@type": "ListItem", position: i + 1, name: label, item: SITE_URL + u })),
    });

  const articleSchema = (post, canonical, ogImage, modified) => {
    const authorName = (post.author || {}).name ?? brand.name;
    const entity = { "@type": "LocalBusiness", "@id": `${SITE_URL}/#business`, name: brand.name, url: SITE_URL, logo: { "@type": "ImageObject", url: `${SITE_URL}/img/logo-512.png` } };
    return {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title || "",
      description: post.meta_description || "",
      author: authorName === brand.name ? entity : { "@type": "Person", name: authorName },
      publisher: entity,
      datePublished: post.date || "",
      dateModified: [post.last_updated, modified].filter((d) => d && d >= (post.date || "")).sort().pop() || post.date || "",
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
