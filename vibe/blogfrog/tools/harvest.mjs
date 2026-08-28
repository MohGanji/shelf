#!/usr/bin/env node
// Rebuild posts.js -- the static index blogfrog picks from.
//
// Runs on a GitHub runner, never on the server: a server has no same-origin policy, which
// is the whole reason the 2022 version needed a CORS proxy. That proxy is gone and is not
// coming back; this replaces it.
//
//   node tools/harvest.mjs           # write posts.js
//   node tools/harvest.mjs --dry-run # report only, write nothing
//
// Only posts.js is written. blogs.mjs is hand-maintained and never touched.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse } from 'node-html-parser';
import { blogs } from './blogs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'posts.js');

const MAX_PER_BLOG = 200;   // keeps posts.js a few hundred KB, not a few MB
const CONCURRENCY = 4;      // blogs fetched at once
const PAGE_DELAY_MS = 250;  // politeness between pages of the same blog
const SHRINK_LIMIT = 0.5;   // refuse to write an index this much smaller than the last one
// A plain browser UA. An identifying bot string gets a 403 from several of these blogs
// (nofreakingspeaking among them). This runs once a week over a couple hundred pages --
// less traffic than a single curious reader clicking through an archive.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const DRY = process.argv.includes('--dry-run');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Nav/meta pages that show up in almost every blog's markup and are never posts.
const NAV = [
  /^\/?$/, /\/(category|tag|author|topics|page)\//i, /\/(feed|rss|sitemap)(\/|$|\.)/i,
  /\/(about|contact|privacy|terms|subscribe|newsletter|search|login|signup|archives?|index)(\/|$|\.)/i,
];

function isPost(url, pageUrl, blog) {
  let u;
  try { u = new URL(url, pageUrl); } catch { return false; }
  if (!/^https?:$/.test(u.protocol)) return false;
  // Same-host only. This is the guard that would have caught the elmaghri takeover:
  // when a domain changes hands, its links stop pointing at itself.
  if (u.host !== new URL(pageUrl).host) return false;
  if (blog.exclude && blog.exclude.test(u.pathname)) return false;
  return !NAV.some((re) => re.test(u.pathname));
}

async function get(url, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 25000);
    try {
      const r = await fetch(url, {
        signal: ctl.signal, redirect: 'follow',
        headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
      });
      if (r.ok) return await r.text();
      if (r.status === 404 || r.status === 410) return null;   // genuinely gone; don't retry
      if (i === tries) return null;
    } catch {
      if (i === tries) return null;
    } finally { clearTimeout(to); }
    await sleep(500 * i);
  }
  return null;
}

function extract(html, pageUrl, blog) {
  const root = parse(html);
  let nodes;
  try {
    nodes = root.querySelectorAll(blog.selector);
  } catch {
    return [];   // selector syntax the parser can't handle -- reported as 0 by the caller
  }
  const out = [];
  for (const n of nodes) {
    const href = n.getAttribute('href');
    if (!href || !isPost(href, pageUrl, blog)) continue;
    out.push(new URL(href, pageUrl).href.replace(/#.*$/, ''));
  }
  return out;
}

const pageUrl = (b, p) =>
  b.strategy === 'paginate' ? `${b.url.replace(/\/$/, '')}/${p}${b.trailingSlash ? '/' : ''}`
  : b.strategy === 'query' ? `${b.url}?${b.queryParam}=${p}`
  : b.url;

// Sitemaps beat scraped markup where a listing page is unreliable: they are machine-readable
// by design, list the whole archive, and survive theme rewrites that break CSS selectors.
async function harvestSitemap(name, b) {
  const locsIn = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);

  const root = await get(b.url);
  if (!root) return { name, posts: [], count: 0 };

  // A sitemap index points at child sitemaps; a plain sitemap points straight at pages.
  const children = locsIn(root).filter((u) => /\.xml/i.test(u) && (!b.sitemapMatch || b.sitemapMatch.test(u)));
  const sources = children.length ? children.slice(0, b.sitemapFiles ?? 3) : [null];

  const seen = new Set();
  for (const src of sources) {
    if (seen.size >= MAX_PER_BLOG) break;
    const xml = src === null ? root : await get(src);
    if (!xml) continue;
    for (const u of locsIn(xml)) {
      if (/\.xml$/i.test(u) || !isPost(u, b.url, b)) continue;
      if (seen.size < MAX_PER_BLOG) seen.add(u.replace(/#.*$/, ''));
    }
    if (src !== null) await sleep(PAGE_DELAY_MS);
  }
  return { name, posts: [...seen], count: seen.size };
}

async function harvest(name, b) {
  if (b.strategy === 'random') return { name, random: b.url, count: 0 };
  if (b.strategy === 'sitemap') return harvestSitemap(name, b);

  const seen = new Set();
  const pages = b.strategy === 'archive' ? 1 : (b.pages ?? 5);
  let emptyStreak = 0;

  for (let p = 1; p <= pages && seen.size < MAX_PER_BLOG; p++) {
    const url = pageUrl(b, p);
    const html = await get(url);
    if (!html) { if (++emptyStreak >= 2) break; continue; }
    const found = extract(html, url, b);
    // Two consecutive pages adding nothing means we've run past the end of the archive.
    if (found.length === 0) { if (++emptyStreak >= 2) break; } else { emptyStreak = 0; }
    for (const u of found) { if (seen.size < MAX_PER_BLOG) seen.add(u); }
    if (p < pages) await sleep(PAGE_DELAY_MS);
  }
  return { name, posts: [...seen], count: seen.size };
}

// ---- run ------------------------------------------------------------------
const names = Object.keys(blogs);
const results = [];
for (let i = 0; i < names.length; i += CONCURRENCY) {
  const batch = names.slice(i, i + CONCURRENCY);
  results.push(...await Promise.all(batch.map((n) => harvest(n, blogs[n]))));
  process.stderr.write(`  ${Math.min(i + CONCURRENCY, names.length)}/${names.length}\n`);
}

const indexed = results.filter((r) => r.posts);
const live = results.filter((r) => r.random);
const empty = indexed.filter((r) => r.count === 0);
const total = indexed.reduce((s, r) => s + r.count, 0);

console.log('\nblog                 posts');
console.log('-'.repeat(34));
for (const r of [...results].sort((a, b) => (a.count || 0) - (b.count || 0))) {
  console.log(`${r.name.padEnd(21)}${r.random ? 'live (random endpoint)' : r.count}`);
}
console.log(`\n${indexed.length} indexed blogs, ${total} posts, plus ${live.length} live random endpoints`);
if (empty.length) console.log(`WARNING: ${empty.length} returned nothing -> ${empty.map((e) => e.name).join(', ')}`);

// Guard: a bad run (rate limiting, a network blip) must not quietly gut the index.
let previous = 0;
try {
  previous = (readFileSync(OUT, 'utf8').match(/"https?:/g) || []).length;
} catch { /* first run */ }
if (previous && total < previous * SHRINK_LIMIT) {
  console.error(`\nREFUSING TO WRITE: ${total} posts is under ${SHRINK_LIMIT * 100}% of the previous ${previous}.`);
  console.error('Re-run, or pass --force if the shrink is intentional.');
  if (!process.argv.includes('--force')) process.exit(1);
}
if (empty.length > indexed.length / 2) {
  console.error('\nREFUSING TO WRITE: more than half the blogs returned nothing; likely a network problem here, not upstream.');
  if (!process.argv.includes('--force')) process.exit(1);
}

if (DRY) { console.log('\n--dry-run: posts.js not written'); process.exit(0); }

const payload = { generated: new Date().toISOString().slice(0, 10), blogs: {} };
for (const r of results) {
  payload.blogs[r.name] = r.random ? { random: r.random } : { posts: r.posts };
}

writeFileSync(OUT,
`// GENERATED FILE -- do not edit.
// Rebuilt by tools/harvest.mjs (weekly, via .github/workflows/refresh-blogfrog.yml).
// To add or fix a blog, edit tools/blogs.mjs instead.
const BLOG_INDEX = ${JSON.stringify(payload, null, 2)};
`);
console.log(`\nwrote posts.js  (${(readFileSync(OUT, 'utf8').length / 1024).toFixed(0)} KB)`);
