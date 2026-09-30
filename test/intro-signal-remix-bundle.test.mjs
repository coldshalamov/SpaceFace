import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const source = readFileSync(new URL('../scripts/build-bundle.mjs', import.meta.url), 'utf8');
const devHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
// Exercise the ACTUAL build rewrite without executing a full multi-GB release.
const body = source.match(/async function buildBundledHtml\(\) \{([\s\S]*?)\n\}\n\nasync function runLockedBuild/)[1];
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const rewrite = new AsyncFunction('readFile', 'join', 'ROOT', body);
test('optional intro entry is bundled and its dynamic import is rewritten for retail', async () => {
  assert(source.includes("join(SRC, 'ui/introSignalRemixBoot.js')"));
  const html = await rewrite(async () => devHtml, join, '/repo');
  assert(html.includes("import('./ui/introSignalRemixBoot.js')"));
  assert(html.includes("from './ui/loadingTerminalArt.js'"));
  assert(!html.includes('./src/'));
  assert(html.includes('.catch(() => { /* Decoration cannot block boot. */ });'));
});
test('a drifted optional entry fails the build instead of shipping a missing source path', async () => {
  const drift = devHtml.replace("import('./src/ui/introSignalRemixBoot.js')", "import('./src/ui/missingIntro.js')");
  await assert.rejects(() => rewrite(async () => drift, join, '/repo'), /no bundled entry reference/);
});
