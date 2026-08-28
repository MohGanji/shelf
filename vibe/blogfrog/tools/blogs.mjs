// Blog sources for the blogfrog index. Hand-edited -- the harvester only ever writes
// posts.js, never this file, so a bad harvest can't corrupt these definitions.
//
// strategy:
//   'random'   -- the blog has its own random-post endpoint. Never harvested: the browser
//                 navigates straight there, so these stay fresh with zero infrastructure.
//   'archive'  -- one page lists every post.
//   'paginate' -- posts spread over /page/1, /page/2, ...  `pages` caps how deep we go.
//   'query'    -- same, but the page number is a query param.
//
// `selector` is run against the fetched page; hrefs are resolved against the page URL,
// so relative ('article/x.html'), root-relative ('/ama') and absolute all work.
// `exclude` drops blog-specific non-post pages the generic nav filter doesn't catch.

export const blogs = {
  // --- random-post endpoints: always live, never harvested -------------------
  dereksivers:      { strategy: 'random', url: 'https://sive.rs/random' },
  timurban:         { strategy: 'random', url: 'https://waitbutwhy.com/random/' },
  lyndabarry:       { strategy: 'random', url: 'https://thenearsightedmonkey.tumblr.com/random' },
  mrmoneymustache:  { strategy: 'random', url: 'https://www.mrmoneymustache.com/?random&post_type=post&post_status=publish' },

  // --- full-archive pages ---------------------------------------------------
  // 2026: markup moved from .archive-table to ul.article-list. `.is-premium` entries
  // are paywalled, so they're dropped rather than sending people to a paywall.
  markmanson:       { strategy: 'archive', url: 'https://markmanson.net/archive', selector: 'ul.article-list > a.article-list__link:not(.is-premium)' },
  ryanholiday:      { strategy: 'archive', url: 'https://ryanholiday.net/archive/', selector: '#smart-archives-list li > a' },
  visa1000:         { strategy: 'archive', url: 'https://visakanv.com/1000/', selector: 'a.entry-wrap' },
  // 2026: div.postindex-title is gone; the index is now a plain list of cover links.
  levelsio:         { strategy: 'archive', url: 'https://levels.io/blog/', selector: 'li > a.cover-link' },
  tannergreer:      { strategy: 'archive', url: 'https://scholars-stage.org/scholars-stage-read-more/', selector: 'li > a', exclude: /\/(transcripts|scholars-stage-read-more|best-of)\// },
  smtm:             { strategy: 'archive', url: 'https://slimemoldtimemold.com/archives/', selector: 'li > a' },
  paco:             { strategy: 'archive', url: 'https://thehellyeahgroup.com/archive', selector: 'a.archive-item-link' },
  // Links here are relative ('article/foo.html') -- resolved against the page URL.
  lawrenceweschler: { strategy: 'archive', url: 'https://lawrenceweschler.com/library/archive', selector: 'p > a' },

  // --- paginated indexes ----------------------------------------------------
  austinkleon:      { strategy: 'paginate', url: 'https://austinkleon.com/page', selector: '.entry-title-link', pages: 15 },
  sethgodin:        { strategy: 'paginate', url: 'https://seths.blog/page', selector: 'div.post > h2 > a', pages: 15 },
  stevenpressfield: { strategy: 'paginate', url: 'https://stevenpressfield.com/blog/page', selector: 'h2 > a', pages: 15 },
  amandaaskell:     { strategy: 'paginate', url: 'https://www.askell.blog/page', selector: 'article > a.u-permalink', pages: 4 },
  neilstrauss:      { strategy: 'paginate', url: 'https://www.neilstrauss.com/blog/page', selector: 'a.more-link', pages: 15 },
  // 2026: every /page/N renders the same 6 featured posts, so scraping the listing caps out
  // at 6 no matter how deep we go. The Yoast sitemap has the real archive instead.
  timferris:        { strategy: 'sitemap', url: 'https://tim.blog/sitemap.xml', sitemapMatch: /post-sitemap/i, sitemapFiles: 3 },
  ericbarker:       { strategy: 'paginate', url: 'https://bakadesuyo.com/blog/page', selector: 'h4 > a', pages: 7 },
  onstartups:       { strategy: 'paginate', url: 'https://www.onstartups.com/page', selector: 'a.post__link', pages: 15 },
  // 2026: HubSpot renamed the card class and dropped /page/N (301s to a 404); pagination
  // is a query param now.
  dharmesh:         { strategy: 'query', url: 'https://blog.hubspot.com/marketing/author/dharmesh-shah', selector: 'h3.blog-post-card-title > a', pages: 6, queryParam: 'page' },
  nofreakingspeaking: { strategy: 'paginate', url: 'https://nofreakingspeaking.com/blog/page', selector: 'h4 > a', pages: 9, trailingSlash: true },
  jnforensics:      { strategy: 'paginate', url: 'https://www.jnforensics.com/blog-1/page', selector: 'div.blog-post-homepage-link-hashtag-hover-color > a', pages: 3 },
  pragmaticengineer:{ strategy: 'paginate', url: 'https://blog.pragmaticengineer.com/page', selector: 'article a', pages: 2 },
  budgetsaresexy:   { strategy: 'paginate', url: 'https://budgetsaresexy.com/page', selector: 'h2 > a', pages: 15 },
  copyblogger:      { strategy: 'paginate', url: 'https://copyblogger.com/page', selector: 'a.entry-title-link', pages: 15 },

  // --- paginated via query param -------------------------------------------
  // 2026: Shopify theme rebuilt on Tailwind; div.blog-item__title-holder no longer exists.
  vv:               { strategy: 'query', url: 'https://visualizevalue.com/blogs/visuals', selector: 'div.group > a', pages: 4, queryParam: 'page' },
};

// Retired 2026-08-28, with the reason each one went. Kept rather than deleted so a future
// pass can tell "checked and dead" apart from "never added".
//
//   elmaghri       -- domain taken over; now serves SEO spam, not the original blog.
//                     Would have sent readers to unrelated commercial pages.
//   unsettle       -- DNS no longer resolves.
//   strangestloop  -- essays list is client-rendered (the HTML ships `${essay.href}`
//                     literally), so there is nothing to scrape server-side. Author
//                     moved to embracinguncertainty.substack.com.
//   doyouevenblog  -- /blog/page/N is 404; site restructured around categories with no
//                     stable post index.
//   annieduke, walkingtheworld, paulsmith, neildegrasstyson, exphistory, brianchesky,
//   thefreelancewrtierguide -- already commented out in the 2022 original.
