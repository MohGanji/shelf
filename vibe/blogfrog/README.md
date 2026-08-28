# BlogFrog

One button. It takes you to a random post from someone else's blog.

Written by hand in July 2022 — the oldest thing on this shelf, and the only one here that
predates vibe coding. Moved under `ganji.me` in August 2026 when `blogfrog.xyz` was retired.

## How a hop works

Pick a blog uniformly, then pick a post within that blog. Both steps matter: a flat pool of
every known post would give a blog with 200 indexed posts ~10× the odds of one with 18, and
would almost never reach the blogs that only have a live random endpoint.

```js
const name = pick(names);                    // uniform across blogs
const url  = blog.random || pick(blog.posts); // uniform within that blog
```

## Where the posts come from

The 2022 version fetched each blog's archive at click time through a CORS proxy and parsed
it in the browser. Blogs don't send `access-control-allow-origin`, so a proxy was the only
way to read them from a page — and that proxy was an open relay on a public port of the
web server. It's gone, and it isn't coming back.

Discovery now happens ahead of time, on a GitHub runner, where the same-origin policy
doesn't apply:

```
weekly cron → runner fetches archives → writes posts.js → commits → deploys
```

A click is then just a redirect. No fetch, no parsing, no third-party dependency, and it
works over https. Blogs that publish their own random-post endpoint (`sive.rs/random` and
friends) are still hit live, so those never go stale at all.

| File | Written by | Purpose |
| --- | --- | --- |
| `tools/blogs.mjs` | you | blog definitions, selectors, retirement notes |
| `tools/harvest.mjs` | you | the indexer |
| `posts.js` | the harvester | generated index — never edit |

## Working on it

```bash
npm ci
npm run harvest:dry   # report what it would find, write nothing
npm run harvest       # rebuild posts.js
```

The harvester refuses to write an index less than half the size of the previous one, or one
where more than half the blogs came back empty. A rate-limited run should fail loudly rather
than quietly gutting the list.

## The font

`Montserrat-Regular.woff2` is a Latin subset, 16KB. The original OTF was 229KB with 1946
glyphs — Cyrillic, Vietnamese, Greek — for a page that renders 67 characters, and it was the
single slowest thing on the page (913ms, and fonts aren't compressed in transit). The CSS
sets `font-display: swap`, so text paints immediately in the fallback rather than staying
invisible while the font downloads.

If you add copy that needs characters outside Latin-1, regenerate it:

```bash
pip install 'fonttools[woff]' brotli
pyftsubset Montserrat-Regular.otf \
  --unicodes='U+0020-007E,U+00A0-00FF,U+2013-2014,U+2018-201D,U+2026,U+20AC' \
  --layout-features='kern,liga' \
  --output-file=fonts/Montserrat/Montserrat-Regular.woff2 --flavor=woff2
```

The full-weight OTF is not in the repo; grab it from Google Fonts if you need to re-subset.

## Adding or fixing a blog

Edit `tools/blogs.mjs`, then `npm run harvest:dry` to check the selector matches. Four
strategies: `random` (the blog has its own random endpoint — best case, nothing to index),
`archive` (one page lists everything), `paginate` / `query` (posts across numbered pages),
and `sitemap` (most robust — use it when a listing page is unreliable).

Selectors rot. When one stops matching, the blog quietly drops to zero and the run warns
about it; check the workflow output rather than assuming silence means health.
