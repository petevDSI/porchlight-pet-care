#!/usr/bin/env node
/*
 * Builds the legal pages from tools/legal/*.md.
 *
 *   node tools/build-legal.js
 *
 * Writes:
 *   legal/<slug>.html                  public pages (one per document, plus /legal index)
 *   assets/legal-docs.js               document keys, versions and fingerprints used by the checkboxes
 *   supabase/migrations/20261118_legal_doc_versions.sql   registers the versions in the database
 *
 * Each document has a version (front matter) and a SHA-256 fingerprint of its text. A consent record stores both,
 * so we can always show exactly which words someone agreed to. If you change a document's text, you MUST change its
 * version too; this script stops if you forget.
 *
 * tools/legal/config.json: { "draft": true } shows a "draft pending legal review" banner on every page.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(__dirname, 'legal');
const OUT = path.join(ROOT, 'legal');
const CFG = JSON.parse(fs.readFileSync(path.join(SRC, 'config.json'), 'utf8'));

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Which document each cross-reference points to (so "the Animals in the Home Policy" becomes a link).
const LINK_TITLES = {};

function parse(file) {
  const raw = fs.readFileSync(path.join(SRC, file), 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(file + ': missing front matter');
  const meta = {};
  m[1].split('\n').forEach((l) => { const i = l.indexOf(':'); if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
  for (const k of ['key', 'title', 'version', 'audience', 'summary']) if (!meta[k]) throw new Error(file + ': front matter needs ' + k);
  meta.internal = meta.internal === 'true';
  meta.slug = file.replace(/\.md$/, '');
  meta.body = m[2].trim() + '\n';
  meta.hash = crypto.createHash('sha256').update(raw.replace(/\r\n/g, '\n')).digest('hex');
  return meta;
}

function inline(s) {
  s = esc(s);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])_(.+?)_(?=[\s).,;:]|$)/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g, '<a href="$2">$1</a>');
  // One pass over the names (longest first) so a full title is never linked twice or nested inside another link.
  const names = Object.keys(LINK_TITLES);
  if (names.length) {
    const re = new RegExp(names.map((t) => esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
    s = s.replace(/(<a [^>]*>.*?<\/a>)|([^<]+|<[^>]*>)/g, (all, link, other) => {
      if (link) return link;
      return other.startsWith('<') ? other : other.replace(re, (t) => '<a href="' + LINK_TITLES[t.replace(/&amp;/g, '&')] + '">' + t + '</a>');
    });
  }
  return s;
}

function render(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  const flushPara = (buf) => { if (buf.length) out.push('<p>' + inline(buf.join(' ')) + '</p>'); };
  let para = [];
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*$/.test(l)) { flushPara(para); para = []; i++; continue; }
    let m;
    if ((m = l.match(/^(#{2,3})\s+(.*)$/))) {
      flushPara(para); para = [];
      const lvl = m[1].length;
      const id = m[2].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      out.push('<h' + lvl + ' id="' + id + '">' + inline(m[2]) + '</h' + lvl + '>');
      i++; continue;
    }
    if (/^- /.test(l) || /^\d+\.\s/.test(l)) {
      flushPara(para); para = [];
      const ordered = /^\d+\.\s/.test(l);
      const items = [];
      while (i < lines.length && (ordered ? /^\d+\.\s/.test(lines[i]) : /^- /.test(lines[i]))) {
        let t = lines[i].replace(ordered ? /^\d+\.\s+/ : /^- /, '');
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i])) { t += ' ' + lines[i].trim(); i++; }
        items.push('<li>' + inline(t) + '</li>');
      }
      out.push((ordered ? '<ol>' : '<ul>') + items.join('') + (ordered ? '</ol>' : '</ul>'));
      continue;
    }
    para.push(l.trim());
    i++;
  }
  flushPara(para);
  return out.join('\n');
}

function page(meta, bodyHtml, all) {
  const others = all.filter((d) => !d.internal).map((d) =>
    '<li' + (d.key === meta.key ? ' aria-current="page"' : '') + '><a href="/legal/' + d.slug + '">' + esc(d.title) + '</a></li>').join('');
  const banner = CFG.draft ? '<p class="notice info" style="margin-bottom:18px">Draft pending legal review. These documents may change before launch.</p>' : '';
  return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + esc(meta.title) + ' | Porchlight Pet &amp; Home Care</title>\n' +
    '<meta name="description" content="' + esc(meta.summary) + '">\n' +
    '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 38 44\'%3E%3Cpath d=\'M6 16 19 7l13 9z\' fill=\'%2314233B\'/%3E%3Crect x=\'9\' y=\'16\' width=\'20\' height=\'21\' rx=\'3\' fill=\'%23F2B33D\' stroke=\'%2314233B\' stroke-width=\'2.5\'/%3E%3C/svg%3E">\n' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Figtree:wght@400;500;600;700&display=swap">\n' +
    '<link rel="stylesheet" href="/assets/porchlight.css">\n</head>\n<body>\n' +
    '<header class="topbar"><div class="in">\n<a class="brand" href="/" aria-label="Porchlight home"><svg aria-hidden="true" width="32" height="38" viewBox="0 0 38 44" fill="none"><path d="M19 2v5" stroke="#14233B" stroke-width="2.5" stroke-linecap="round"/><path d="M6 16 19 7l13 9z" fill="#14233B"/><rect x="9" y="16" width="20" height="21" rx="3" fill="#F2B33D" stroke="#14233B" stroke-width="2.5"/><path d="M13 41h12" stroke="#14233B" stroke-width="2.5" stroke-linecap="round"/></svg><span><b>Porchlight</b><small>Pet &amp; Home Care</small></span></a>\n<a class="btn ghost sm" href="/portal">Login</a>\n</div></header>\n' +
    '<main class="page narrow">\n' + banner +
    '<article class="panel legal">\n<p class="eyebrow">Legal</p>\n<h1 class="display" style="font-size:clamp(30px,5vw,42px);line-height:1.08">' + esc(meta.title) + '</h1>\n' +
    '<p class="small muted">Version ' + esc(meta.version) + ' &middot; applies to ' + esc(meta.audience) + '</p>\n' + bodyHtml + '\n</article>\n' +
    '<nav class="panel legal-nav" aria-label="All legal documents"><h2 style="font-size:20px">All documents</h2><ul>' + others + '</ul></nav>\n' +
    '</main>\n</body>\n</html>\n';
}

function indexPage(all) {
  const rows = all.filter((d) => !d.internal).map((d) =>
    '<li><a href="/legal/' + d.slug + '"><strong>' + esc(d.title) + '</strong></a><br><span class="small muted">' + esc(d.summary) + ' (version ' + esc(d.version) + ')</span></li>').join('');
  const meta = { key: 'index', title: 'Legal', version: new Date().toISOString().slice(0, 10), audience: 'everyone', summary: 'Porchlight terms, privacy policy, agreements and safety policies.', slug: 'index' };
  return page(meta, '<p>These are the agreements and policies that apply when you use Porchlight. Each one is versioned, and we record which version you accepted.</p><ul class="legal-list">' + rows + '</ul>', all)
    .replace('<p class="small muted">Version ' + esc(meta.version) + ' &middot; applies to everyone</p>\n', '');
}

// ---------------------------------------------------------------- run
const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.md')).sort();
const docs = files.map(parse);
const keys = new Set();
docs.forEach((d) => { if (keys.has(d.key)) throw new Error('duplicate key ' + d.key); keys.add(d.key); });
docs.filter((d) => !d.internal).forEach((d) => { LINK_TITLES[d.title] = '/legal/' + d.slug; });
// shorter names people use in the text
LINK_TITLES['Owner Service Agreement'] = '/legal/owner-agreement';
LINK_TITLES['Independent Sitter Agreement'] = '/legal/sitter-agreement';
LINK_TITLES['Privacy Policy'] = '/legal/privacy-policy';
LINK_TITLES['Terms of Service'] = '/legal/terms-of-service';
LINK_TITLES['Animals in the Home Policy'] = '/legal/animals-in-the-home-policy';
LINK_TITLES['Home Standards, Cameras and Safety Policy'] = '/legal/home-standards-and-safety';
LINK_TITLES['Overnight Stay Addendum'] = '/legal/overnight-addendum';
// "Owner Service Agreement" is a prefix of the full title; link it once, longest first.
const ordered = Object.keys(LINK_TITLES).sort((a, b) => b.length - a.length);
const linkMap = {}; ordered.forEach((k) => { linkMap[k] = LINK_TITLES[k]; });
Object.keys(LINK_TITLES).forEach((k) => delete LINK_TITLES[k]);
ordered.forEach((k) => { LINK_TITLES[k] = linkMap[k]; });

// Guard: text changed but version did not.
const regPath = path.join(ROOT, 'assets', 'legal-docs.js');
if (fs.existsSync(regPath)) {
  const prev = fs.readFileSync(regPath, 'utf8').match(/window\.PorchlightLegal\s*=\s*(\{[\s\S]*?\});/);
  if (prev) {
    const old = JSON.parse(prev[1]).docs || {};
    docs.filter((d) => !d.internal).forEach((d) => {
      const o = old[d.key];
      if (o && o.version === d.version && o.hash !== d.hash) {
        throw new Error('"' + d.title + '" changed but its version is still ' + d.version + '. Change the version line at the top of tools/legal/' + d.slug + '.md and run again.');
      }
    });
  }
}

fs.mkdirSync(OUT, { recursive: true });
docs.filter((d) => !d.internal).forEach((d) => fs.writeFileSync(path.join(OUT, d.slug + '.html'), page(d, render(d.body), docs)));
fs.writeFileSync(path.join(OUT, 'index.html'), indexPage(docs));

const reg = { docs: {} };
docs.filter((d) => !d.internal).forEach((d) => { reg.docs[d.key] = { title: d.title, version: d.version, hash: d.hash, url: '/legal/' + d.slug }; });
fs.writeFileSync(regPath, '/* Generated by tools/build-legal.js. Do not edit. */\nwindow.PorchlightLegal = ' + JSON.stringify(reg, null, 2) + ';\n');

const q = (s) => "'" + s.replace(/'/g, "''") + "'";
const sql = ['-- Generated by tools/build-legal.js. Registers the version and fingerprint of each legal document.',
  '-- Safe to re-run: existing rows are left alone. When a document changes, its version changes, so a new row is added.',
  'insert into public.porchlight_legal_docs (doc_key, version, title, sha256, url) values'].concat(
  [Object.keys(reg.docs).map((k) => { const d = reg.docs[k]; return '  (' + [q(k), q(d.version), q(d.title), q(d.hash), q(d.url)].join(', ') + ')'; }).join(',\n') + '\non conflict (doc_key, version) do nothing;\n']).join('\n');
fs.writeFileSync(path.join(ROOT, 'supabase', 'migrations', '20261118_legal_doc_versions.sql'), sql);

console.log('Built ' + (docs.length - 1) + ' pages plus index. Versions:');
Object.keys(reg.docs).forEach((k) => console.log('  ' + k.padEnd(12) + reg.docs[k].version + '  ' + reg.docs[k].hash.slice(0, 12)));
