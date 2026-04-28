#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { getSiteOrigin } from './site-origin.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = join(__dirname, '..');
const BASE = getSiteOrigin();

function fmt(name) {
  return String(name).toLowerCase().replaceAll(' ', '-');
}

function extractPostUrls(itemsSrc) {
  const urls = [];
  const re = /url:\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(itemsSrc)) !== null) {
    if (m[1].includes('//')) continue;
    urls.push(m[1]);
  }
  return urls;
}

function walkHtmlFiles(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const name = ent.name;
    if (name === 'node_modules' || name === '.git' || name === '.cursor') continue;
    const full = join(dir, name);
    if (ent.isDirectory()) {
      walkHtmlFiles(full, acc);
    } else if (ent.isFile() && name.endsWith('.html')) {
      acc.push(full);
    }
  }
  return acc;
}

function toLocPath(filePath) {
  const rel = relative(root, filePath).replaceAll('\\', '/');
  if (rel === 'index.html') return `${BASE}/`;
  if (rel.endsWith('/index.html')) return `${BASE}/${rel.slice(0, -'/index.html'.length)}/`;
  return `${BASE}/${rel}`;
}

const itemsSrc = readFileSync(join(root, 'items.js'), 'utf8');
const postSlugs = new Set(extractPostUrls(itemsSrc).map(fmt));

const fromItems = [...postSlugs].map((slug) => `${BASE}/${slug}.html`);

const htmlFiles = walkHtmlFiles(root);
const fromDisk = htmlFiles.map(toLocPath);

const skip = new Set([
  `${BASE}/404.html`,
]);

const all = new Set([...fromDisk, ...fromItems]);
for (const s of skip) all.delete(s);

const urls = [...all].sort();

const today = new Date().toISOString().slice(0, 10);
const body = urls
  .map(
    (loc) => `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`
  )
  .join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;

writeFileSync(join(root, 'sitemap.xml'), xml, 'utf8');
console.log(`sitemap.xml: ${urls.length} URLs`);

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}
