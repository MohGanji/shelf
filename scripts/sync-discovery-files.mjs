#!/usr/bin/env node
/**
 * Writes robots.txt (Sitemap line), .well-known/api-catalog, openapi servers URL,
 * and absolute skill URLs in agent-skills/index.json from site-origin.config.json.
 * Run after changing origin: node scripts/sync-discovery-files.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getSiteOrigin, repoRoot } from './site-origin.mjs';

const root = repoRoot();
const origin = getSiteOrigin();
const originSlash = `${origin}/`;

const robots = `# https://www.rfc-editor.org/rfc/rfc9309
# Content Signals: https://contentsignals.org/

User-agent: *
Allow: /
Content-Signal: ai-train=no, search=yes, ai-input=no

User-agent: GPTBot
Allow: /
Content-Signal: ai-train=no, search=yes, ai-input=no

User-agent: OAI-SearchBot
Allow: /
Content-Signal: ai-train=no, search=yes, ai-input=no

User-agent: Claude-Web
Allow: /
Content-Signal: ai-train=no, search=yes, ai-input=no

User-agent: Google-Extended
Allow: /
Content-Signal: ai-train=no, search=yes, ai-input=no

User-agent: CCBot
Allow: /
Content-Signal: ai-train=no, search=yes, ai-input=no

Sitemap: ${origin}/sitemap.xml
`;

const apiCatalog = {
  linkset: [
    {
      anchor: originSlash,
      'service-desc': [
        {
          href: `${origin}/openapi.yaml`,
          type: 'application/yaml',
        },
      ],
      'service-doc': [
        {
          href: `${origin}/me.html`,
          type: 'text/html',
        },
      ],
    },
  ],
};

const openapi = `openapi: 3.1.0
info:
  title: ganji.me
  description: |
    Static personal site (HTML). No authenticated HTTP API is offered; pages are
    served as documents. This specification describes the site for discovery only.
  version: "1.0.0"
servers:
  - url: ${origin}
paths: {}
`;

const indexPath = join(root, '.well-known/agent-skills/index.json');
const prev = JSON.parse(readFileSync(indexPath, 'utf8'));
const base = origin.replace(/\/+$/, '');
for (const skill of prev.skills) {
  let path;
  try {
    path = new URL(skill.url).pathname;
  } catch {
    path = skill.url.startsWith('/') ? skill.url : `/${skill.url}`;
  }
  skill.url = `${base}${path}`;
}

writeFileSync(join(root, 'robots.txt'), robots, 'utf8');
writeFileSync(join(root, '.well-known/api-catalog'), `${JSON.stringify(apiCatalog, null, 2)}\n`, 'utf8');
writeFileSync(join(root, 'openapi.yaml'), openapi, 'utf8');
writeFileSync(indexPath, `${JSON.stringify(prev, null, 2)}\n`, 'utf8');

console.log(`sync-discovery-files: origin=${origin}`);
