#!/usr/bin/env node
// Keeps index.html's <link rel="modulepreload"> waves in sync with the static-import surface
// of src/main.js and src/core/registry.js.
//
// Why: on the unbundled path the transitive src graph is otherwise discovered fetch-by-fetch
// during the post-media eval cascade. modulepreload is fetch-only (no eval, no execution), so
// preloading the registry wave overlaps its discovery with the media wait without changing
// the artwork-first evaluation contract.
//
// Usage:
//   node scripts/sync-modulepreload.mjs          — rewrite the generated registry-wave block
//   node scripts/sync-modulepreload.mjs --check  — diff only; exit 1 on any drift

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(root, 'index.html');
const MAIN = join(root, 'src/main.js');
const REGISTRY = join(root, 'src/core/registry.js');

const BEGIN = '<!-- modulepreload:registry:begin -->';
const END = '<!-- modulepreload:registry:end -->';

// Static imports + re-exports only: `from 'rel'` or `import 'rel'`. Dynamic `import(...)`
// never matches (no `from`), and the lazy testing/lab imports correctly stay out.
const IMPORT_RE = /(?:from\s+|import\s+)['"](\.[^'"]+)['"]/g;

function staticImports(absPath) {
  const src = readFileSync(absPath, 'utf8');
  const dir = dirname(absPath);
  const out = [];
  for (const m of src.matchAll(IMPORT_RE)) {
    const resolved = normalize(join(dir, m[1])).replace(/\\/g, '/');
    if (!resolved.includes('/src/')) continue;
    out.push(`.${resolved.slice(resolved.indexOf('/src/'))}`);
  }
  return out;
}

function preloadedHrefs(html) {
  const set = new Set();
  for (const m of html.matchAll(/<link\s+rel="modulepreload"\s+href="([^"]+)"\s*\/>/g)) {
    set.add(m[1]);
  }
  return set;
}

const html = readFileSync(INDEX, 'utf8');
// The managed block must not count itself as coverage — compute main-wave hrefs from the
// document with the generated block removed.
const beginIdx0 = html.indexOf(BEGIN);
const endIdx0 = html.indexOf(END);
const htmlSansBlock = beginIdx0 !== -1 && endIdx0 > beginIdx0
  ? html.slice(0, beginIdx0) + html.slice(endIdx0 + END.length)
  : html;
const existing = preloadedHrefs(htmlSansBlock);
const mainImports = staticImports(MAIN);
const registryImports = staticImports(REGISTRY);

// Main wave drift: every static import of main.js should appear as a modulepreload somewhere
// in the document (hand-maintained list — this check only reports, never rewrites it).
const mainMissing = [...new Set(mainImports)].filter((href) => !existing.has(href));

// Registry wave: registry.js's static imports in source order, minus anything already
// preloaded by the main wave (eval cascade reaches them through either hop identically).
const seen = new Set(existing);
const wanted = [];
for (const href of registryImports) {
  if (seen.has(href)) continue;
  seen.add(href);
  wanted.push(href);
}
const block = [
  `  ${BEGIN}`,
  ...wanted.map((href) => `  <link rel="modulepreload" href="${href}" />`),
  `  ${END}`,
].join('\n');

const beginIdx = html.indexOf(BEGIN);
const endIdx = html.indexOf(END);
const hasBlock = beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx;
// Compare href-semantic content only — surrounding indentation is free (the block may sit
// under any nesting level), so strip line edges and drop blank lines before comparing.
const normLines = (s) => s.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
const beginLine = hasBlock ? html.lastIndexOf('\n', beginIdx) + 1 : 0;
const current = hasBlock ? html.slice(beginLine, endIdx + END.length) : '';

const drift = normLines(current) !== normLines(block);
const check = process.argv.includes('--check');

if (check) {
  let bad = false;
  if (mainMissing.length) {
    bad = true;
    console.error('[modulepreload] index.html is missing main.js static imports:');
    for (const href of mainMissing) console.error(`  ${href}`);
  }
  if (drift) {
    bad = true;
    const wantedSet = new Set(wanted);
    const currentSet = new Set([...current.matchAll(/href="([^"]+)"/g)].map((m) => m[1]));
    for (const href of wantedSet) if (!currentSet.has(href)) console.error(`[modulepreload] missing registry import: ${href}`);
    for (const href of currentSet) if (!wantedSet.has(href)) console.error(`[modulepreload] stale registry preload: ${href}`);
    if (!hasBlock) console.error('[modulepreload] no managed registry block found');
  }
  if (bad) {
    console.error('[modulepreload] run `node scripts/sync-modulepreload.mjs` to regenerate.');
    process.exit(1);
  }
  console.log(`[modulepreload] in sync — ${mainImports.length} main + ${wanted.length} registry imports covered.`);
  process.exit(0);
}

if (!drift && !mainMissing.length) {
  console.log(`[modulepreload] already in sync (${wanted.length} registry imports).`);
  process.exit(0);
}

let next;
if (hasBlock) {
  next = html.slice(0, beginIdx) + block + html.slice(endIdx + END.length);
} else {
  // First install: anchor the generated block just before </head>.
  next = html.replace('</head>', `${block}\n</head>`);
}
writeFileSync(INDEX, next);
if (mainMissing.length) {
  console.log('[modulepreload] note: hand-maintained main wave is missing:');
  for (const href of mainMissing) console.log(`  ${href}`);
}
console.log(`[modulepreload] wrote ${wanted.length} registry-wave preloads to index.html.`);
