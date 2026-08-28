# Making the site findable

## The generator

```
node tools/seo.mjs           # rebuild
node tools/seo.mjs --check   # fail if anything is stale
```

No dependencies. It reads `items.js`, `portfolio.js` and `vibe/projects.js` and writes:

| File | What it is |
| --- | --- |
| `sitemap.xml` | every canonical URL, dated from `git log` |
| `feed.xml` | RSS, newest post first |
| `llms.txt` | the whole site as one page of described links, for agents |
| `index.html` | the Featured / Vibe / Writing lists, between `<!-- seo:… -->` markers |
| `portfolio.html` | the project cards, built with `portfolio.js`'s own `createProjectCard` |
| `vibe/index.html` | the vibe listing |

Those last three used to be built in the browser, which meant a crawler that runs no
JavaScript saw empty `<div>`s and could not find a single post. They are HTML now.

`.github/workflows/deploy.yml` runs the generator on every push, commits any change, then
deploys — so adding a post is still one edit to `items.js`. Run it yourself if you want to
see the result before pushing.

### Nothing about the site is configured in the generator

There is no list of pages in `seo.mjs`, and adding content never means editing it. Each
decision lives in the file that already owns it:

| Decision | Where it lives |
| --- | --- |
| Which pages exist | any `.html` in the repo — the walk finds it |
| A page's URL | its own `<link rel="canonical">` |
| Its title | its own `<title>` |
| Its summary | the page's own opening paragraphs |
| Keeping a page out | `<meta name="robots" content="noindex">` on the page |
| Which projects are featured | `featured: true` in `portfolio.js`, in that file's order |
| How many rows a section shows | `data-show="6"` on the container in `index.html` |
| Which vibe projects are public | `hidden: true` in `vibe/projects.js` |
| The site's domain and name | `index.html`'s canonical and `<title>` |

So a new page joins the sitemap and `llms.txt` by existing with a canonical, and a page opts
out by saying `noindex` — which is how `404.html` and `vibe/tron` (canonical on
`tron.ganji.me`) stay out without being named anywhere.

The one literal list left is `SKIP_DIRS`, which is only about where *not* to look for HTML.

`changefreq` and `priority` are deliberately absent from the sitemap: Google has said for
years that it ignores both, and guessing them would be the only thing in the file claiming
to know how often a page changes.

## How little metadata this site carries

Every page has exactly this, and nothing else:

```html
<html lang="en">
  <title>How computers evolved</title>
  <link rel="canonical" href="https://ganji.me/computer">
  <link rel="alternate" type="application/rss+xml" title="Mo Ganji" href="https://ganji.me/feed.xml">
```

The title is the page's own, with no site name appended. There is **no** `<meta
name="description">`, no Open Graph, no Twitter card, no per-page structured data. None of
those affect whether or how well a page ranks — Open Graph and Twitter tags only draw the
preview card when a link is pasted into a social app, and Google writes its own snippet from
the page text most of the time regardless of what a description says.

`feed.xml` and `llms.txt` therefore quote each page's **opening paragraphs** instead of a
hand-written blurb, so the site describes itself in its own words. Epigraphs are skipped,
since several posts open on somebody else's quote. A page with nothing to quote simply gets
no summary — `/perfectionism` is blank on purpose and stays blank here.

The single exception is one JSON-LD `Person` block on the homepage, carrying a name and
links to GitHub, X, LinkedIn and Bluesky. It exists for one reason: another Mo Ganji, a
tattoo artist, currently owns that name in search results, and `sameAs` links are the
mechanism for telling a search engine these are different people. It makes no claim about
the writing.

## Still to do on the server — none of this can be done from the repo

**1. Redirect `ganji.blog` → `ganji.me` (301).** Both domains currently serve the whole
site at 200. Every page now carries a canonical pointing at `ganji.me`, which resolves the
duplicate-content signal, but a redirect makes it unambiguous. In Cloudflare: Rules →
Redirect Rules, `hostname eq "ganji.blog"` → dynamic `concat("https://ganji.me",
http.request.uri.path)`, status 301, preserve query string.

**2. Fix the `.html` redirect chain.** `https://ganji.me/computer.html` currently 302s to
`http://ganji.me/computer` — insecure — which 301s to https. Three hops. Nothing on the
site links that way any more, but old inbound links and Google's index still do. It should
be a single 301 straight to `https://ganji.me/computer`. The bug is that the origin builds
the redirect without a scheme; fix it in the nginx config on the server.

**3. Serve `/.well-known/`.** `/.well-known/ai-catalog.json` exists in the repo but will
404: every dotfile path on the live site 404s today, including `.github/workflows/deploy.yml`,
so either the deploy script skips dotfiles or nginx has the usual `location ~ /\. { deny all; }`.
Allow `/.well-known/` specifically and confirm the file returns 200 with
`Content-Type: application/json` and `Access-Control-Allow-Origin: *`.

**4. Confirm `robots.txt` is ours.** Cloudflare currently serves a managed content-signals
file with no `User-agent` line at all, which is why the scan called it invalid. Once
`robots.txt` deploys from the repo, check `curl https://ganji.me/robots.txt` actually shows
it. If Cloudflare still overrides, turn off the managed robots.txt in AI Crawl Control —
ours already carries the `Content-Signal` line.

**5. Submit the sitemap.** Google Search Console and Bing Webmaster Tools, verify the domain,
submit `https://ganji.me/sitemap.xml`, then request indexing on the homepage. Bing feeds
DuckDuckGo and ChatGPT search. This is the step that actually gets the site indexed — the
rest only makes it worth indexing.

**6. Optional: `Link` response headers.** A Cloudflare Transform Rule adding
`Link: </llms.txt>; rel="alternate"; type="text/markdown"` and
`Link: </sitemap.xml>; rel="sitemap"` gives agents a pointer before they parse any HTML.

**7. Optional: Markdown for Agents.** A Cloudflare toggle that returns markdown when a
client sends `Accept: text/markdown`. Free, no code.

## Deliberately not done

The scan asked for OAuth/OIDC discovery, `oauth-protected-resource`, `auth.md`, an MCP
server card and an API catalog. This site has no API and no authentication; those files
would advertise endpoints that do not exist. DNS-AID records were skipped for the same
reason — there is no agent service to point them at.

## Known bugs, unrelated to this work

- Every book card in `/library/` links to `/library/<title>` and 404s. The only book with a
  page is *The Courage to Be Disliked*, and it lives at the site root.
- The third entry in `library/items.js` has a `title` that is really a subtitle.
- `/plans/*.md` is publicly served. It is disallowed in `robots.txt`, but the server should
  probably not serve it at all.
- `/heros/` was deleted, so `/heros/` and `/heros/<name>` now 404. Nothing linked to them, so
  nothing on the site breaks; add redirects only if you find them in Search Console.
