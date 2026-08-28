/**
 * Builds the files that make this site findable, from the data files that already exist.
 *
 *   node tools/seo.mjs           # write the files
 *   node tools/seo.mjs --check   # exit 1 if anything is stale (CI)
 *
 * Reads  items.js, portfolio.js, vibe/projects.js, and the metadata already written into
 *        each page's <head>.
 * Writes sitemap.xml, feed.xml, llms.txt, and the generated list sections of index.html,
 *        portfolio.html and vibe/index.html.
 *
 * The lists used to be rendered in the browser, which meant a crawler that does not execute
 * JavaScript saw empty divs and no link to a single post. They are generated into the HTML
 * here instead, so each thing is still written down in exactly one place. Add a post to
 * items.js, run this, commit what changes.
 *
 * Nothing about the site's shape is configured here. The page list comes from walking the
 * repo for .html files, and each page's own <link rel="canonical"> is its URL — so a new
 * page joins the sitemap by existing, and a page opts out with <meta name="robots"
 * content="noindex">. Which projects are featured is a `featured: true` in portfolio.js, and
 * how many rows a homepage section shows is a `data-show` on the container in index.html.
 *
 * No dependencies, deliberately — `node tools/seo.mjs` works on a clean checkout.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import vm from 'node:vm'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Directories with nothing crawlable in them. */
const SKIP_DIRS = new Set(['node_modules', 'venv', '.git', '.github', 'tools', 'plans'])

// ------------------------------------------------------------------ reading what is there

const read = (file) => readFileSync(join(ROOT, file), 'utf8')

const attr = (html, re) => html.match(re)?.[1]?.trim()

const titleOf = (html) => (attr(html, /<title>([\s\S]*?)<\/title>/i) ?? '').replace(/\s+/g, ' ')
const canonicalOf = (html) => attr(html, /<link\s+rel="canonical"\s+href="([^"]*)"/i)
const isNoindex = (html) => /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html)

const SUMMARY_CHARS = 200

/**
 * A page's summary, read from the page's own opening rather than a meta description.
 *
 * The pages carry no `<meta name="description">` on purpose — search engines rewrite them
 * most of the time anyway, and the site should describe itself with what it actually says.
 * So feed.xml and llms.txt quote the opening instead. Epigraphs are skipped: several posts
 * open on someone else's words, which describe the quote and not the post.
 */
const summaryOf = (html) => {
  const body = (html.split(/<body[^>]*>/i)[1] ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')

  const parts = []
  for (const m of body.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)) {
    if (/\bclass="[^"]*\bquote\b/i.test(m[1])) continue
    const text = m[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    if (text) parts.push(text)
    if (parts.join(' ').length >= SUMMARY_CHARS) break
  }

  const full = parts.join(' ')
  if (full.length <= SUMMARY_CHARS) return full
  // Prefer ending on a sentence; fall back to the last whole word.
  const window = full.slice(0, SUMMARY_CHARS + 1)
  const sentence = window.search(/[.!?]["']?\s[^]*$/)
  const cut = sentence > SUMMARY_CHARS * 0.5 ? window.slice(0, sentence + 1) : null
  return cut ?? window.slice(0, window.lastIndexOf(' ')).trimEnd() + '…'
}

/**
 * The files git knows about, or null when git cannot answer.
 *
 * An uncommitted page is a draft, and a draft is not a URL yet. Leaving one in the repo
 * therefore keeps it out of the sitemap, the feed and the homepage until it is added —
 * so a post can sit here being polished without being published. CI checks everything
 * out, so this only ever narrows a local run.
 */
const tracked = (() => {
  try {
    const out = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    return new Set(out.split('\n').filter(Boolean))
  } catch {
    return null
  }
})()

/** Every committed .html file in the repo, as paths relative to the root. */
const htmlFiles = (dir = '') => {
  const out = []
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
    const rel = dir ? `${dir}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...htmlFiles(rel))
    else if (entry.name.endsWith('.html') && (tracked === null || tracked.has(rel))) out.push(rel)
  }
  return out
}

/** Last commit that touched the file — the mtime of a fresh clone is the clone's date. */
const lastCommit = (file) => {
  try {
    return (
      execFileSync('git', ['log', '-1', '--format=%cs', '--', file], {
        cwd: ROOT,
        encoding: 'utf8',
      }).trim() || null
    )
  } catch {
    return null
  }
}

/**
 * Runs a site data file and hands back the names it declares.
 *
 * These are browser scripts, not modules: they declare a `const` and then touch the DOM.
 * `const` at the top level of a vm script stays in that script's scope rather than landing
 * on the context, so the names are read back by appending an assignment to the same script.
 *
 * Reading the render templates out too, rather than restating them here, is the point — a
 * card's markup stays defined in the file that has always defined it.
 */
const loadFrom = (file, names) => {
  const ctx = {
    console,
    document: { getElementById: () => null, querySelector: () => null, addEventListener: () => {} },
  }
  ctx.window = ctx
  vm.createContext(ctx)
  vm.runInContext(`${read(file)}\n;__result = [${names.join(', ')}];`, ctx, { filename: file })
  return Object.fromEntries(names.map((n, i) => [n, ctx.__result[i]]))
}

const loadArray = (file, name) => loadFrom(file, [name])[name]

// ------------------------------------------------------------------------- the site itself

const posts = loadArray('items.js', 'posts')
const portfolio = loadFrom('portfolio.js', ['projects', 'createProjectCard'])
const projects = portfolio.projects
const allVibeProjects = loadArray('vibe/projects.js', 'vibeProjects')
const vibeProjects = allVibeProjects.filter((p) => !p.hidden)

/** items.js turns a post's `url` into its filename this way; scripts.js has the original. */
const slug = (name) => name.toLowerCase().replaceAll(' ', '-')

const home = read('index.html')

const vibePath = (p) => `/vibe/${p.url.replace(/^\.\//, '')}`

/** `hidden: true` in vibe/projects.js keeps a project off the listing; it stays unlisted here. */
const unpublished = new Set(allVibeProjects.filter((p) => p.hidden).map(vibePath))

/** The homepage's own canonical and title decide where this site lives and what it is called. */
const SITE = new URL(canonicalOf(home)).origin
const AUTHOR = titleOf(home).trim()

/**
 * Every page worth listing, discovered rather than enumerated.
 *
 * A page is in if it declares a canonical on this origin and is not marked noindex. That
 * keeps two things out on their own say-so: heros/*.html, which are title-only stubs, and
 * vibe/tron, which canonicalises to tron.ganji.me because it is also served from there.
 */
const pages = htmlFiles()
  .map((file) => ({ file, html: read(file) }))
  .filter(({ file, html }) => {
    const canonical = canonicalOf(html)
    if (!canonical) {
      if (!isNoindex(html)) console.warn(`  ${file} has no canonical — leaving it out`)
      return false
    }
    if (isNoindex(html)) return false
    if (!canonical.startsWith(SITE)) {
      console.warn(`  skipping ${file} — its canonical points at ${canonical}`)
      return false
    }
    return true
  })
  .map(({ file, html }) => ({
    file,
    html,
    url: canonicalOf(html),
    path: canonicalOf(html).slice(SITE.length),
    title: titleOf(html).trim(),
    description: summaryOf(html),
  }))
  .filter((p) => !unpublished.has(p.path))

const pageAt = (path) => pages.find((p) => p.path === path)

/** A post with no file yet is still being written; it is not a URL until it is. */
const publishedPosts = posts
  .map((post) => ({ ...post, slug: slug(post.url), page: pageAt(`/${slug(post.url)}`) }))
  .filter((post) => {
    if (!post.page) console.warn(`  skipping "${post.title}" — /${post.slug} is not a page yet`)
    return post.page
  })

/** `2024-12` is as precise as items.js gets, so a post is dated to the 1st of its month. */
const postDate = (post) => `${post.date}-01`

/** Whatever is left once posts and vibe projects are accounted for, homepage first. */
const sectionPages = pages
  .filter(
    (p) =>
      !publishedPosts.some((post) => post.page === p) &&
      !vibeProjects.some((v) => vibePath(v) === p.path)
  )
  .sort((a, b) => (a.path === '/' ? -1 : b.path === '/' ? 1 : a.path.localeCompare(b.path)))

// --------------------------------------------------------------------------- the outputs

const xmlEscape = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * changefreq and priority are left out on purpose: Google has said for years that it ignores
 * both, and guessing them here would be the only thing in this file claiming to know how
 * often a page changes.
 */
const sitemap = () => {
  const dateFor = (p) => {
    const post = publishedPosts.find((x) => x.page === p)
    return post ? postDate(post) : lastCommit(p.file)
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...pages.map((p) => {
      const lastmod = dateFor(p)
      return ['  <url>', `    <loc>${p.url}</loc>`, lastmod ? `    <lastmod>${lastmod}</lastmod>` : null, '  </url>']
        .filter(Boolean)
        .join('\n')
    }),
    '</urlset>',
    '',
  ].join('\n')
}

/** RSS wants RFC 822 dates; a post only knows its month, so it publishes at midnight UTC. */
const rfc822 = (ymd) => new Date(`${ymd}T00:00:00Z`).toUTCString()

const feed = () =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${xmlEscape(AUTHOR)}</title>`,
    `    <link>${SITE}/</link>`,
    `    <description>${xmlEscape(summaryOf(home))}</description>`,
    '    <language>en</language>',
    `    <lastBuildDate>${rfc822(postDate(publishedPosts[0]))}</lastBuildDate>`,
    `    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>`,
    ...publishedPosts.map((post) =>
      [
        '    <item>',
        `      <title>${xmlEscape(post.title)}</title>`,
        `      <link>${post.page.url}</link>`,
        `      <guid isPermaLink="true">${post.page.url}</guid>`,
        `      <pubDate>${rfc822(postDate(post))}</pubDate>`,
        `      <description>${xmlEscape(post.page.description)}</description>`,
        '    </item>',
      ].join('\n')
    ),
    '  </channel>',
    '</rss>',
    '',
  ].join('\n')

/**
 * llms.txt — the whole site as one page of links, for an agent that would otherwise have to
 * crawl and render every page to find out what is here.
 */
const llms = () => {
  const line = (title, url, note) => `- [${title}](${url})${note ? `: ${note}` : ''}`
  return [
    `# ${AUTHOR}`,
    '',
    `> ${summaryOf(home)}`,
    '',
    '## Writing',
    '',
    ...publishedPosts.map((p) => line(p.title, p.page.url, p.page.description)),
    '',
    '## Projects',
    '',
    ...projects.map((p) => line(p.title, p.link, p.blurb || p.description)),
    '',
    '## Vibe projects',
    '',
    'Small things built with an AI model in an afternoon; each notes the model that wrote it.',
    '',
    ...vibeProjects.map((p) => {
      const page = pageAt(vibePath(p))
      return line(p.title, `${SITE}${vibePath(p)}`, `${page?.description || p.note} (${p.model}, ${p.date})`)
    }),
    '',
    '## Pages',
    '',
    ...sectionPages.map((p) => line(p.title, p.url, p.description)),
    '',
    '## Optional',
    '',
    line('RSS feed', `${SITE}/feed.xml`, 'every post, newest first'),
    line('Sitemap', `${SITE}/sitemap.xml`, 'every canonical URL on the site'),
    '',
  ].join('\n')
}

// ---------------------------------------------------------- the generated bits of the pages

/** Replaces what is between `<!-- seo:name -->` and `<!-- /seo:name -->`, markers kept. */
const fillRegion = (html, name, body, file) => {
  const re = new RegExp(`([ \\t]*<!-- seo:${name} -->)[\\s\\S]*?([ \\t]*<!-- /seo:${name} -->)`)
  if (!re.test(html)) throw new Error(`${file} has no <!-- seo:${name} --> region`)
  return html.replace(re, `$1\n${body}\n$2`)
}

/** How many rows a homepage section shows before the "all N" toggle, per the container. */
const showCount = (html, id) =>
  Number(html.match(new RegExp(`<div id="${id}"[^>]*\\bdata-show="(\\d+)"`))?.[1] ?? Infinity)

const featuredRows = () =>
  projects
    .filter((p) => p.featured)
    .map(
      (p) => `            <div class="featured-row">
              <img class="featured-thumb" src="${p.image}" alt="" loading="lazy">
              <span class="featured-text">
                <a class="home-item-title" href="${p.link}">${escapeHtml(p.title)}</a>
                <span class="home-dim">${p.blurb || p.description}</span>
              </span>
            </div>`
    )
    .join('\n')

const vibeCards = (limit) =>
  vibeProjects
    .slice(0, limit)
    .map(
      (p) => `            <div class="vibe-card">
              <a class="home-item-title" href="${vibePath(p)}">${escapeHtml(p.title)}</a>
              <span class="home-dim vibe-note">${p.note}</span>
            </div>`
    )
    .join('\n')

const postRow = (p, indent) =>
  `${indent}<a class="post-row" href="${p.page.path}">` +
  `<span class="post-row-title">${escapeHtml(p.title)}</span>` +
  `<span class="post-row-date">${p.date}</span></a>`

const writingRows = (limit) =>
  [
    ...publishedPosts.slice(0, limit).map((p) => postRow(p, '            ')),
    '            <div class="home-hidden">',
    ...publishedPosts.slice(limit).map((p) => postRow(p, '              ')),
    '            </div>',
    `            <button class="home-more-btn">all ${publishedPosts.length} →</button>`,
  ].join('\n')

const homepage = () => {
  let html = home
  html = fillRegion(html, 'featured', featuredRows(), 'index.html')
  html = fillRegion(html, 'vibe', vibeCards(showCount(html, 'vibe-grid')), 'index.html')
  html = fillRegion(html, 'writing', writingRows(showCount(html, 'writing-list')), 'index.html')
  // The "all N" counts sit outside the regions because they belong to the headings.
  html = html.replace(/(<a id="featured-all"[^>]*>)[^<]*(<\/a>)/, `$1all ${projects.length} →$2`)
  html = html.replace(/(<a id="vibe-all"[^>]*>)[^<]*(<\/a>)/, `$1all ${vibeProjects.length} →$2`)
  return html
}

/** portfolio.js owns the card markup; this only indents what it returns. */
const portfolioPage = () => {
  const cards = projects
    .map((p) => portfolio.createProjectCard(p).trim())
    .join('\n')
    .split('\n')
    .map((l) => (l.trim() ? `                ${l.replace(/^ {8}/, '')}` : l))
    .join('\n')
  return fillRegion(read('portfolio.html'), 'projects', cards, 'portfolio.html')
}

/** Mirrors the DOM the vibe listing used to build at runtime: title, date, then model. */
const vibeEntry = (p) =>
  [
    '          <div class="vibe-entry">',
    '            <div class="vibe-entry-header">',
    `              <div class="vibe-entry-title"><a href="${p.url}">${escapeHtml(p.title)}</a>` +
      (p.model ? `<span class="vibe-entry-model-inline"> (${escapeHtml(p.model)})</span>` : '') +
      '</div>',
    `              <div class="vibe-entry-date">${escapeHtml(p.date)}</div>`,
    p.model ? `              <div class="vibe-entry-model">${escapeHtml(p.model)}</div>` : null,
    '            </div>',
    `            <div class="vibe-entry-note">${p.note ?? ''}</div>`,
    '          </div>',
  ]
    .filter((l) => l !== null)
    .join('\n')

const vibePage = () =>
  fillRegion(read('vibe/index.html'), 'list', vibeProjects.map(vibeEntry).join('\n'), 'vibe/index.html')

// ------------------------------------------------------------------------------- writing

const outputs = [
  ['sitemap.xml', sitemap],
  ['feed.xml', feed],
  ['llms.txt', llms],
  ['index.html', homepage],
  ['portfolio.html', portfolioPage],
  ['vibe/index.html', vibePage],
]

const check = process.argv.includes('--check')
let stale = 0

for (const [file, build] of outputs) {
  const next = build()
  const current = existsSync(join(ROOT, file)) ? read(file) : null
  if (current === next) {
    console.log(`  unchanged  ${file}`)
    continue
  }
  stale++
  if (check) console.error(`  STALE      ${file}`)
  else {
    writeFileSync(join(ROOT, file), next)
    console.log(`  wrote      ${file}`)
  }
}

console.log(
  `\n${pages.length} URLs · ${publishedPosts.length} posts · ` +
    `${projects.length} projects (${projects.filter((p) => p.featured).length} featured) · ` +
    `${vibeProjects.length} vibe projects`
)

if (check && stale) {
  console.error(`\n${stale} file(s) out of date. Run: node tools/seo.mjs`)
  process.exit(1)
}
