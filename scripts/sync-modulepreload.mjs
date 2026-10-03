#!/usr/bin/env node
// Keeps index.html's <link rel="modulepreload"> waves in sync with the transitive static-import
// closure of src/main.js and src/core/registry.js.
//
// Why: on the unbundled path the transitive src graph is otherwise discovered fetch-by-fetch
// during the post-media eval cascade. modulepreload is fetch-only (no eval, no execution), so
// preloading the whole closure moves every discovery fetch up to document parse and leaves
// the cascade fetch-free — without changing the artwork-first evaluation contract.
//
// Usage:
//   node scripts/sync-modulepreload.mjs          — rewrite the generated registry-wave block
//   node scripts/sync-modulepreload.mjs --check  — diff only; exit 1 on any drift

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(root, 'index.html');
const MAIN = join(root, 'src/main.js');
const REGISTRY = join(root, 'src/core/registry.js');

const BEGIN = '<!-- modulepreload:registry:begin -->';
const END = '<!-- modulepreload:registry:end -->';

// Static imports + re-exports only: `from 'x'` or `import 'x'`. Dynamic `import(...)`
// never matches (a `(` follows `import`), and the lazy testing/lab imports correctly stay out.
const IMPORT_RE = /(?:from\s+|import\s+)['"]([^'"]+)['"]/g;

// Repo-root markers a preloadable module lives under — mirrors the importmap targets.
const ROOT_MARKERS = ['/src/', '/vendor/', '/node_modules/'];

// modulepreload compiles the fetched file as a JS module — a `with { type: 'json' }` (or
// any non-module) import resolved to an href must not be hinted as one (the browser then
// MIME-rejects it). Keep those hrefs in `visited` so their absence doesn't widen the wave.
const MODULE_EXT_RE = /\.(m?js|cjs|ts|jsx|tsx|mts|cts)$/i;

// Browser-ordered bare-specifier resolution through the document's own importmap:
// exact key first, then longest trailing-slash prefix match.
function resolveBareSpecifier(spec, importmap) {
  let target = importmap[spec];
  if (target == null) {
    let bestLen = 0;
    for (const key of Object.keys(importmap)) {
      if (key.endsWith('/') && spec.startsWith(key) && key.length > bestLen) {
        bestLen = key.length;
        target = importmap[key] + spec.slice(key.length);
      }
    }
  }
  if (typeof target !== 'string' || !target.startsWith('./')) return null;
  return target;
}

function staticImports(absPath, importmap) {
  const src = readFileSync(absPath, 'utf8');
  const dir = dirname(absPath);
  const out = [];
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1];
    if (spec.startsWith('.')) {
      const resolved = normalize(join(dir, spec)).replace(/\\/g, '/');
      let cut = -1;
      for (const marker of ROOT_MARKERS) {
        const i = resolved.indexOf(marker);
        if (i !== -1 && (cut === -1 || i < cut)) cut = i;
      }
      if (cut === -1) continue;
      out.push(`.${resolved.slice(cut)}`);
    } else {
      const target = resolveBareSpecifier(spec, importmap);
      if (target) out.push(target);
    }
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
// The document importmap is the specifiers' source of truth — bare imports resolve through
// it exactly as the browser resolves them, so the walker covers the same graph.
const importmapMatch = html.match(/<script\s+type="importmap"[^>]*>([\s\S]*?)<\/script>/);
let importmap = {};
if (importmapMatch) {
  try {
    importmap = JSON.parse(importmapMatch[1]).imports || {};
  } catch {
    importmap = {};
  }
}

const existing = preloadedHrefs(htmlSansBlock);
const mainImports = staticImports(MAIN, importmap);
const registryImports = staticImports(REGISTRY, importmap);

// Registry wave: the transitive static-import closure of main.js + registry.js, minus
// anything already preloaded by the hand-maintained waves. The eval cascade would fetch
// exactly this set — one hop was never enough (depth-1 is ~17% of the closure).
// Walk through already-preloaded files too: the cascade fetches their unseen imports just
// as lazily, so `visited` (the walk guard) must not collapse into `seen` (the wanted guard).
const seen = new Set(existing);
const visited = new Set();
const wanted = [];
// BFS in source order: the queue holds `staticImports` results verbatim, so sibling order
// matches each importer's own order. The hand-maintained wave seeds the walk too — its
// files' unseen imports fetch just as lazily inside eval (e.g. KTX2Loader's transcoder
// deps, three.module.js's three.core.js).
const queue = [...mainImports, ...registryImports, ...existing];
while (queue.length) {
  const href = queue.shift();
  if (visited.has(href)) continue;
  visited.add(href);
  if (!MODULE_EXT_RE.test(href)) continue;
  const abs = join(root, href.slice(1));
  let next;
  try {
    next = staticImports(abs, importmap);
  } catch {
    continue; // an href that does not resolve on disk cannot be preloaded — leave it out.
  }
  if (!seen.has(href)) {
    seen.add(href);
    wanted.push(href);
  }
  queue.push(...next);
}

const beginIdx = html.indexOf(BEGIN);
const endIdx = html.indexOf(END);
const hasBlock = beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx;
// Compare href-semantic content only — surrounding indentation is free (the block may sit
// under any nesting level), so strip line edges and drop blank lines before comparing.
const normLines = (s) => s.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
const beginLine = hasBlock ? html.lastIndexOf('\n', beginIdx) + 1 : 0;
const current = hasBlock ? html.slice(beginLine, endIdx + END.length) : '';

// A deps-absent machine cannot resolve /node_modules/ targets — every committed node_modules
// href would read as 'stale' and a rewrite would silently drop the hints. Preserve the
// committed set verbatim (rewrites keep it, --check exempts it from drift); the walk still
// covers the /src/ + /vendor/ closure, and the warning flags the run as non-authoritative.
if (!existsSync(join(root, 'node_modules'))) {
  if (hasBlock) {
    const preserved = [...current.matchAll(/href="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((href) => href.includes('/node_modules/'));
    for (const href of preserved) {
      if (!seen.has(href)) {
        seen.add(href);
        wanted.push(href);
      }
    }
  }
  console.warn('[modulepreload] node_modules absent — /node_modules/ hrefs unverifiable; preserving committed entries. Re-run with dependencies installed for an authoritative sync.');
}

// Emit the block sorted: its content becomes a pure function of the covered set, so a
// regeneration on an identical set (e.g. a PR merge ref whose src tree only reorders
// discovery) cannot produce order-only drift.
wanted.sort();

// Main wave drift: every static import of main.js should appear as a modulepreload somewhere
// in the document (hand-maintained list — this check only reports, never rewrites it). With
// the closure now generated, "missing" means uncovered by either wave — i.e. unreadable.
const wantedSetForMain = new Set(wanted);
const mainMissing = [...new Set(mainImports)].filter((href) => !existing.has(href) && !wantedSetForMain.has(href));
const block = [
  `  ${BEGIN}`,
  ...wanted.map((href) => `  <link rel="modulepreload" href="${href}" />`),
  `  ${END}`,
].join('\n');

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
