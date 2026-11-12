#!/usr/bin/env node
// Porchlight Journal builder (no dependencies). Run from the repo root:  node tools/blog/build-blog.js
// Reads tools/blog/articles/*.md (front matter + simple markdown) and writes
//   blog/index.html, blog/<slug>.html, blog/feed.xml, assets/blog.css, sitemap.xml (blog entries)
// Same pattern as tools/build-services.js: generated files are committed; Vercel serves them as static pages.

const fs = require("fs");
const path = require("path");

const SRC = __dirname;
const REPO = path.resolve(SRC, "..", "..");
const SITE = "https://porchlightpetcare.com";
const OUT = path.join(REPO, "blog");

const cfg = {
  blogTitle: "The Porchlight Journal",
  blogTagline: "Practical pet sitting, dog walking and pet care advice from Porchlight Pet & Home Care in Belmont, NC.",
  author: "Porchlight Pet & Home Care",
  serviceArea: "Belmont, Mt. Holly, Cramerton, McAdenville, Lowell, Ranlo, East Gastonia, Clover, York, India Hook, Newport and Lake Wylie",
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const fmtDate = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

// ---------- parsing ----------
function parseFrontMatter(raw, file) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing front matter`);
  const meta = {};
  m[1].split("\n").forEach((line) => {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  });
  for (const k of ["title", "date", "category", "excerpt"]) if (!meta[k]) throw new Error(`${file}: front matter missing "${k}"`);
  return { meta, body: m[2].trim() };
}

function inline(s) {
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  return s;
}

function markdown(src) {
  const out = [];
  for (const b of src.split(/\n{2,}/)) {
    const lines = b.split("\n");
    if (/^### /.test(b)) out.push(`<h3>${inline(b.slice(4))}</h3>`);
    else if (/^## /.test(b)) out.push(`<h2 id="${slugify(b.slice(3))}">${inline(b.slice(3))}</h2>`);
    else if (lines.every((l) => /^- /.test(l))) out.push("<ul>" + lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join("") + "</ul>");
    else if (lines.every((l) => /^\d+\. /.test(l))) out.push("<ol>" + lines.map((l) => `<li>${inline(l.replace(/^\d+\. /, ""))}</li>`).join("") + "</ol>");
    else if (lines.every((l) => /^> /.test(l))) out.push(`<aside class="callout">${lines.map((l) => inline(l.slice(2))).join("<br>")}</aside>`);
    else out.push(`<p>${inline(lines.join(" "))}</p>`);
  }
  return out.join("\n");
}

// ---------- load ----------
const CAT = {
  "Getting Started": "🏡", "Health & Vet": "🩺", "Walking & Exercise": "🦮", "Safety": "🛟",
  "Travel Prep": "🧳", "Cats & Small Pets": "🐈", "Seasonal": "🍂",
};

// ---------- images ----------
// Personal photos live in /assets/img/blog (resized from assets/img/pack); the rest are Unsplash.
const U = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&h=675&q=75`;
const L = (n, pos) => ({ src: `/assets/img/blog/${n}.jpg`, pos });
const IMG = {
  "pet-sitter-meet-and-greet": { ...L("kraig-bowie", "50% 35%"), alt: "Kraig relaxing at a table with a dog beside him" },
  "hot-weather-dog-walking": { src: U("1663501258049-77f9638cbaea"), alt: "A dog drinking water on a warm day" },
  "overnight-stay-checklist": { ...L("maizy-bedtime", "50% 45%"), alt: "A small dog tucked into pillows at bedtime" },
  "fireworks-and-storm-anxiety": { src: U("1636289571953-da28b660ee2d"), alt: "Fireworks lighting up the night sky" },
  "pet-sitter-vs-boarding": { ...L("couch-pile", "50% 35%"), alt: "Dogs and cats snuggled together on a couch at home" },
  "dog-vaccines-before-a-stay": { src: U("1630359486912-4b085e38f1e7"), alt: "A veterinarian examining a dog" },
  "cat-vaccines-and-health-checks": { ...L("cat-silver-longhair", "50% 45%"), alt: "A silver long-haired cat sitting upright" },
  "pet-care-instruction-sheet": { src: U("1761322572550-967ea8c0bfd9"), alt: "An open notebook and pen on a desk" },
  "pet-medications-while-away": { src: U("1629225303555-755fd9c64ea2"), alt: "A person giving a dog a tablet" },
  "dog-walking-basics": { ...L("pack-hilltop", "50% 60%"), alt: "Three dogs resting in a grassy field on a hilltop walk" },
  "flea-tick-heartworm-prevention": { src: U("1554039533-eb4a99deaf72"), alt: "A dog standing in grass outdoors" },
  "caring-for-cats-while-away": { ...L("cat-kitten-eating", "50% 40%"), alt: "A kitten eating from a dish on the living room floor" },
  "separation-anxiety-in-dogs": { ...L("maizy-window", "50% 55%"), alt: "A small dog watching from a window bed" },
  "pet-emergency-plan": { ...L("flight-cat-carrier", "50% 40%"), alt: "A cat in a carrier ready to travel" },
  "halloween-pet-hazards": { src: U("1539477436787-f6bb31522b39"), alt: "Halloween pumpkins" },
  "microchips-and-pet-id": { src: U("1667716705760-233650f8f3fe"), alt: "A dog wearing an ID tag on its collar" },
  "exotic-and-small-pet-care": { src: U("1758206411649-1e4e76ac0e1d"), alt: "A bearded dragon resting on a branch" },
  "senior-pet-care-while-traveling": { src: U("1608469926865-b2d2200bb2f6"), alt: "A senior dog resting calmly" },
  "puppy-and-kitten-care": { ...L("eden-puppy", "50% 68%"), alt: "A happy puppy running across the grass" },
  "holiday-pet-sitting-planning": { ...L("maizy-car", "50% 65%"), alt: "A dog riding in the front seat of a car" },
};
const imgTag = (p, hero) => {
  const i = IMG[p.slug];
  if (!i) return "";
  return `<img src="${i.src}" alt="${esc(i.alt)}" width="1200" height="675"${i.pos ? ` style="object-position:${i.pos}"` : ""} ${hero ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
};
// Related service page per category, shown in the end-of-article box
const SERVICE_LINKS = {
  default: [["Overnight pet sitting", "/services/overnight-pet-sitting"], ["Dog walking", "/services/dog-walking"], ["Drop-in visits", "/services/drop-in-visits"]],
  "Cats & Small Pets": [["Cat sitting", "/services/cat-sitting"], ["Birds, reptiles and fish", "/services/exotic-pet-sitting"], ["Drop-in visits", "/services/drop-in-visits"]],
  "Walking & Exercise": [["Dog walking", "/services/dog-walking"], ["Drop-in visits", "/services/drop-in-visits"], ["Pet taxi", "/services/pet-taxi"]],
};

const posts = fs.readdirSync(path.join(SRC, "articles")).filter((f) => f.endsWith(".md")).sort().map((f) => {
  const { meta, body } = parseFrontMatter(fs.readFileSync(path.join(SRC, "articles", f), "utf8"), f);
  const words = body.split(/\s+/).length;
  const refs = (meta.refs || "").split(";").map((r) => r.trim()).filter(Boolean).map((r) => {
    const [name, url] = r.split("|").map((x) => x.trim());
    return { name, url };
  });
  return { ...meta, slug: meta.slug || slugify(meta.title), html: markdown(body), minutes: Math.max(2, Math.round(words / 220)), refs, icon: CAT[meta.category] || "🐾" };
}).sort((a, b) => (a.date < b.date ? 1 : -1));

const seen = new Set();
posts.forEach((p) => { if (seen.has(p.slug)) throw new Error("duplicate slug " + p.slug); seen.add(p.slug); });
const urlOf = (p) => `/blog/${p.slug}`;

// ---------- shared chrome (mirrors the main site header/footer) ----------
const LOGO = `<svg aria-hidden="true" width="38" height="44" viewBox="0 0 38 44" fill="none"><path d="M19 2v5" stroke="#14233B" stroke-width="2.5" stroke-linecap="round"/><path d="M6 16 19 7l13 9z" fill="#14233B"/><rect x="9" y="16" width="20" height="21" rx="3" fill="#F2B33D" stroke="#14233B" stroke-width="2.5"/><path d="M19 22c2.6 2.6 3.6 4.6 3.6 6.4a3.6 3.6 0 0 1-7.2 0c0-1.8 1-3.8 3.6-6.4z" fill="#FFFFFF"/><path d="M13 41h12" stroke="#14233B" stroke-width="2.5" stroke-linecap="round"/></svg>`;
const FAVICON = `<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 38 44'%3E%3Cpath d='M6 16 19 7l13 9z' fill='%2314233B'/%3E%3Crect x='9' y='16' width='20' height='21' rx='3' fill='%23F2B33D' stroke='%2314233B' stroke-width='2.5'/%3E%3C/svg%3E">`;

const head = ({ title, desc, path: p, extra = "" }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${p}">
<meta property="og:type" content="${extra.includes("article:") ? "article" : "website"}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}${p}">
<link rel="alternate" type="application/rss+xml" title="${esc(cfg.blogTitle)}" href="/blog/feed.xml">
${FAVICON}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Figtree:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/assets/services.css">
<link rel="stylesheet" href="/assets/blog.css">
${extra}
</head>`;

const header = () => `<header class="site-header"><div class="wrap">
<a class="brand" href="/" aria-label="Porchlight Pet and Home Care, home">
${LOGO}
<span class="brand-name"><b>Porchlight</b><span>Pet &amp; Home Care</span></span></a>
<nav class="nav" aria-label="Main">
<a href="/services">Services</a>
<a href="/about">About</a>
<a href="/blog" aria-current="page">Blog</a>
<a href="/testimonials">Reviews</a>
<a href="/portal">Client login</a>
<a class="btn btn-navy" href="/#booking">Book a visit</a>
</nav>
</div></header>`;

const footer = () => `<footer class="site-footer">
<div class="wrap">
<div class="foot-cols">
<div style="max-width:340px">
<p class="display" style="font-size:24px;color:#fff">Porchlight Pet &amp; Home Care</p>
<p style="margin-top:8px">Dog walking, pet sitting and home care in Belmont, NC and nearby.</p>
</div>
<div><h4>Porchlight</h4><a href="/about">About Kraig</a><a href="/blog">Blog</a><a href="/testimonials">Reviews</a><a href="/intake">New client form</a><a href="/portal">Client login</a></div>
<div><h4>Services</h4><a href="/services/overnight-pet-sitting">Overnight stays</a><a href="/services/dog-walking">Dog walking</a><a href="/services/drop-in-visits">Drop-in visits</a><a href="/services/cat-sitting">Cat sitting</a><a href="/services/exotic-pet-sitting">Birds, reptiles and fish</a><a href="/services/home-check-ins">Home check-ins</a><a href="/services/pet-taxi">Pet taxi</a></div>
<div><h4>Contact</h4><a href="tel:+14704243183">470-424-3183</a><a href="mailto:hello@porchlightpetcare.com">hello@porchlightpetcare.com</a><p style="padding:4px 0">Belmont, NC 28012</p></div>
</div>
<div class="foot-base"><p>© ${new Date().getFullYear()} Porchlight Pet &amp; Home Care. Insured and bonded.</p><p>Articles are general information, not veterinary advice. <a href="/blog/feed.xml">RSS</a></p></div>
</div>
</footer>`;

const card = (p) => `<article class="card" data-cat="${esc(p.category)}">
<a class="thumb" href="${urlOf(p)}" tabindex="-1" aria-hidden="true">${imgTag(p) || `<span>${p.icon}</span>`}</a>
<div class="card-body">
<p class="meta"><span class="tag">${esc(p.category)}</span> <time datetime="${p.date}">${fmtDate(p.date)}</time></p>
<h3 class="display"><a href="${urlOf(p)}">${esc(p.title)}</a></h3>
<p class="ex">${esc(p.excerpt)}</p>
<p class="meta">${p.minutes} min read</p>
</div>
</article>`;

const write = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

// ---------- pages ----------
function indexPage() {
  const [feat, ...rest] = posts;
  const cats = [...new Set(posts.map((p) => p.category))];
  const ld = { "@context": "https://schema.org", "@type": "Blog", name: cfg.blogTitle, url: SITE + "/blog", description: cfg.blogTagline, publisher: { "@type": "LocalBusiness", "@id": SITE + "/#business", name: "Porchlight Pet & Home Care" } };
  write(path.join(OUT, "index.html"), `${head({ title: `${cfg.blogTitle} | Porchlight Pet & Home Care`, desc: cfg.blogTagline, path: "/blog", extra: `<script type="application/ld+json">${JSON.stringify(ld)}</script>` })}
<body>
${header()}
<main id="top">
<section class="blog-hero"><div class="wrap">
<p class="eyebrow">The Porchlight Journal</p>
<h1 class="display">Pet care advice for homeowners and pet owners</h1>
<p class="lede">Vet basics, vaccines, walking, and how to get your pet and your home ready for a sitter, written for people in and around Belmont, NC.</p>
</div></section>
<section class="blog-body"><div class="wrap">
<article class="feature">
<a class="thumb big" href="${urlOf(feat)}" tabindex="-1" aria-hidden="true">${imgTag(feat) || `<span>${feat.icon}</span>`}</a>
<div class="feature-text">
<p class="meta"><span class="tag tag-amber">Latest</span> <span class="tag">${esc(feat.category)}</span> <time datetime="${feat.date}">${fmtDate(feat.date)}</time></p>
<h2 class="display"><a href="${urlOf(feat)}">${esc(feat.title)}</a></h2>
<p class="ex">${esc(feat.excerpt)}</p>
<p><a class="btn btn-navy" href="${urlOf(feat)}">Read the article</a> <span class="meta">${feat.minutes} min read</span></p>
</div>
</article>
<div class="filters" role="group" aria-label="Filter by topic">
<button class="pill on" data-filter="all">All (${posts.length})</button>
${cats.map((c) => `<button class="pill" data-filter="${esc(c)}">${CAT[c] ? CAT[c] + " " : ""}${esc(c)}</button>`).join("\n")}
</div>
<div class="grid" id="grid">
${rest.map(card).join("\n")}
</div>
<p class="empty" id="empty" hidden>No articles in this topic yet.</p>
</div></section>
</main>
${footer()}
<script>
(function(){
var pills=document.querySelectorAll('.pill'),cards=document.querySelectorAll('#grid .card'),empty=document.getElementById('empty');
pills.forEach(function(p){p.addEventListener('click',function(){
pills.forEach(function(x){x.classList.remove('on')});p.classList.add('on');
var f=p.getAttribute('data-filter'),n=0;
cards.forEach(function(c){var show=f==='all'||c.getAttribute('data-cat')===f;c.hidden=!show;if(show)n++});
empty.hidden=n>0;
})});
})();
</script>
</body></html>
`);
}

function articlePage(p, i) {
  const related = [...posts.filter((x) => x.slug !== p.slug && x.category === p.category), ...posts.filter((x) => x.slug !== p.slug && x.category !== p.category)].slice(0, 3);
  const older = posts[i + 1], newer = posts[i - 1];
  const svc = SERVICE_LINKS[p.category] || SERVICE_LINKS.default;
  const ld = {
    "@context": "https://schema.org", "@type": "BlogPosting", headline: p.title, description: p.excerpt,
    datePublished: p.date, dateModified: p.date, articleSection: p.category,
    author: { "@type": "Organization", name: cfg.author }, mainEntityOfPage: SITE + urlOf(p),
    publisher: { "@type": "LocalBusiness", "@id": SITE + "/#business", name: "Porchlight Pet & Home Care" },
  };
  write(path.join(OUT, p.slug + ".html"), `${head({ title: `${p.title} | Porchlight Pet & Home Care`, desc: p.excerpt, path: urlOf(p), extra: `<meta property="article:published_time" content="${p.date}">\n<script type="application/ld+json">${JSON.stringify(ld)}</script>` })}
<body>
${header()}
<main id="top">
<div class="wrap narrow">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/blog">Blog</a> &rsaquo; ${esc(p.category)}</nav>
<article class="post">
<header>
<p class="meta"><span class="tag">${p.icon} ${esc(p.category)}</span></p>
<h1 class="display">${esc(p.title)}</h1>
<p class="byline">By ${esc(cfg.author)} &middot; <time datetime="${p.date}">${fmtDate(p.date)}</time> &middot; ${p.minutes} min read</p>
</header>
${imgTag(p, true) ? `<figure class="hero">${imgTag(p, true)}</figure>` : ""}
<div class="prose">
${p.html}
</div>
${p.refs.length ? `<section class="refs"><h2>Further reading</h2><ul>${p.refs.map((r) => `<li><a href="${r.url}" rel="noopener">${esc(r.name)}</a></li>`).join("")}</ul></section>` : ""}
<p class="disclaimer">This article is general information for pet owners and is not a substitute for advice from your veterinarian.</p>
</article>
<aside class="cta">
<h2 class="display">Need a hand with your pet?</h2>
<p>Porchlight offers pet sitting, dog walking and home check-ins in ${esc(cfg.serviceArea)}. Start with a free meet &amp; greet so your pet and your sitter can get acquainted before you leave.</p>
<p class="cta-links">${svc.map(([t, h]) => `<a href="${h}">${esc(t)}</a>`).join("")}</p>
<p><a class="btn btn-amber" href="/#booking">Book a visit</a></p>
</aside>
<nav class="pager" aria-label="More articles">
${older ? `<a href="${urlOf(older)}"><span>&larr; Older</span>${esc(older.title)}</a>` : "<span></span>"}
${newer ? `<a class="r" href="${urlOf(newer)}"><span>Newer &rarr;</span>${esc(newer.title)}</a>` : "<span></span>"}
</nav>
</div>
<section class="blog-body related"><div class="wrap"><h2 class="display">Keep reading</h2><div class="grid">${related.map(card).join("\n")}</div></div></section>
</main>
${footer()}
</body></html>
`);
}

function feed() {
  const items = posts.map((p) => `<item><title>${esc(p.title)}</title><link>${SITE}${urlOf(p)}</link><guid>${SITE}${urlOf(p)}</guid><pubDate>${new Date(p.date + "T12:00:00Z").toUTCString()}</pubDate><category>${esc(p.category)}</category><description>${esc(p.excerpt)}</description></item>`).join("\n");
  write(path.join(OUT, "feed.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${esc(cfg.blogTitle)}</title><link>${SITE}/blog</link><description>${esc(cfg.blogTagline)}</description><language>en-us</language>\n${items}\n</channel></rss>\n`);
}

// Keeps blog URLs in the main sitemap (replaces any previously generated blog entries)
function sitemap() {
  const f = path.join(REPO, "sitemap.xml");
  let xml = fs.readFileSync(f, "utf8").replace(/\s*<url><loc>https:\/\/porchlightpetcare\.com\/blog[^<]*<\/loc>(?:<lastmod>[^<]*<\/lastmod>)?<\/url>/g, "");
  const entries = [{ loc: "/blog", date: posts[0].date }, ...posts.map((p) => ({ loc: urlOf(p), date: p.date }))]
    .map((u) => `\n  <url><loc>${SITE}${u.loc}</loc><lastmod>${u.date}</lastmod></url>`).join("");
  xml = xml.replace("</urlset>", entries.replace(/^\n/, "\n") + "\n</urlset>").replace(/\n{2,}<\/urlset>/, "\n</urlset>");
  fs.writeFileSync(f, xml);
}

// ---------- run ----------
fs.rmSync(OUT, { recursive: true, force: true });
indexPage();
posts.forEach(articlePage);
feed();
sitemap();
fs.copyFileSync(path.join(SRC, "blog.css"), path.join(REPO, "assets", "blog.css"));
console.log(`Built ${posts.length} articles -> blog/ (${posts[posts.length - 1].date} to ${posts[0].date})`);
