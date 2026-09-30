import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const source = readFileSync(new URL('../scripts/build-bundle.mjs', import.meta.url), 'utf8');
const devHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/ui/bootEntry.js', import.meta.url), 'utf8');
// Exercise the ACTUAL build rewrite without executing a full multi-GB release.
const body = source.match(/async function buildBundledHtml\(\) \{([\s\S]*?)\n\}\n\nasync function runLockedBuild/)[1];
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const rewrite = new AsyncFunction('readFile', 'join', 'ROOT', body);

test('retail preserves the media shell and rewrites the actual lightweight entry', async () => {
  assert(source.includes("join(SRC, 'ui/introSignalRemixBoot.js')"));
  assert(source.includes("join(SRC, 'ui/bootEntry.js')"));
  const html = await rewrite(async () => devHtml, join, '/repo');
  assert(html.includes('<script type="module" src="./main.js"></script>'));
  assert(!html.includes('./src/'));
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
  await assert.rejects(() => rewrite(async () => drift, join, '/repo'), /no bundled entry reference/);
});
