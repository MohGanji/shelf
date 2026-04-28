# Blog posts index

Use when listing or linking to individual posts on **ganji.me**.

## Post URLs

Posts are served as `https://ganji.me/{slug}.html`, where `slug` is derived from the
post `url` field in `items.js`: lowercased with spaces replaced by hyphens.

## Source of truth

The ordered list of posts (title, url slug, date) is defined in `/items.js` on the site
repository. The homepage loads this file and renders the index.

## Discoverability

- `sitemap.xml` includes post pages and other HTML routes.
- `robots.txt` references the sitemap and declares Content-Signal preferences.