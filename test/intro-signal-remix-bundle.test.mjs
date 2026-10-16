import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pinVercelReleaseHtml } from '../scripts/lib/vercelReleaseBase.mjs';
const source = readFileSync(new URL('../scripts/build-bundle.mjs', import.meta.url), 'utf8');
const devHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const uiStyles = readFileSync(new URL('../styles/ui.css', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/ui/bootEntry.js', import.meta.url), 'utf8');
// Exercise the ACTUAL build rewrite without executing a full multi-GB release.
const body = source.match(/async function buildBundledHtml\(\) \{([\s\S]*?)\r?\n\}\r?\n\r?\nasync function runLockedBuild/)[1];
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const rewrite = new AsyncFunction('readFile', 'join', 'ROOT', 'pinVercelReleaseHtml', body);
const rewriteHtml = (readFile, root = '/repo') => rewrite(readFile, join, root, pinVercelReleaseHtml);

test('retail preserves the media shell and rewrites the actual lightweight entry', async () => {
  assert(source.includes("join(SRC, 'ui/introSignalRemixBoot.js')"));
  assert(source.includes("join(SRC, 'ui/bootEntry.js')"));
  const html = await rewriteHtml(async () => devHtml);
  assert(html.includes('<script type="module" src="./main.js"></script>'));
  assert(!html.includes('./src/'));
  assert(!/<link\b[^>]*rel="modulepreload"/.test(html));
  assert.match(html, /<link\b[^>]*rel="stylesheet"[^>]*href="\.\/styles\/ui\.css"/);
  assert.match(uiStyles, /^\s*@import\s+["']\.\/hud\.css["'];/m,
    'retail HUD styles must remain reachable through the render-blocking stylesheet');
  assert(!/importmap/i.test(html));
  assert(html.includes('styles/boot-visualizer.css'));
  assert(html.includes('data-boot-native="true"'));
  assert(html.includes('assets/cinematics/boot-visualizer.mp4'));
  // The optional import is now in the compiled entry, NOT a second inline HTML launcher.
  assert(entry.includes("import('./introSignalRemixBoot.js')"));
  assert(entry.includes('.catch(() => { /* Decoration cannot block boot. */ });'));
});
test('a drifted lightweight entry fails instead of shipping an unrewritten source path', async () => {
  const drift = devHtml.replace('src="./src/ui/bootEntry.js"', 'src="./src/ui/missingEntry.js"');
  await assert.rejects(() => rewriteHtml(async () => drift), /no bundled entry reference/);
});

test('retail removes development worker prefetches while retaining style hints', async () => {
  const fixture = devHtml.replace('</head>', [
    '<link href="./src/render/renderPackageDigestWorker.js" rel="prefetch" />',
    "<link rel='preload' as='worker' href='./src/render/glbPrepassWorker.js' />",
    '<link rel="prefetch" as="style" href="./styles/station.css" />',
    '</head>',
  ].join('\n'));
  const html = await rewriteHtml(async () => fixture);
  assert(!html.includes('./src/'));
  assert(html.includes('href="./styles/station.css"'));
  assert(html.includes('<script type="module" src="./main.js"></script>'));
});
