import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Canonical origin for generated discovery files (sitemap, robots Sitemap: line,
 * api-catalog, agent-skills index URLs, OpenAPI servers).
 * Edit site-origin.config.json to your preferred primary host; the same files are
 * deployed for multiple hostnames, but absolute URIs in these artifacts use this value.
 */
export function getSiteOrigin() {
  const p = join(root, 'site-origin.config.json');
  if (existsSync(p)) {
    try {
      const j = JSON.parse(readFileSync(p, 'utf8'));
      const o = String(j.origin ?? '')
        .trim()
        .replace(/\/+$/, '');
      if (o.startsWith('http://') || o.startsWith('https://')) return o;
    } catch (_) {
      /* fall through */
    }
  }
  return 'https://ganji.me';
}

export function repoRoot() {
  return root;
}
