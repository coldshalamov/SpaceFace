import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const source = readFileSync(new URL('../scripts/build-bundle.mjs', import.meta.url), 'utf8');
const devHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bootEntry = readFileSync(new URL('../src/ui/bootEntry.js', import.meta.url), 'utf8');
// Exercise the ACTUAL build rewrite without executing a full multi-GB release.
const body = source.match(/async function buildBundledHtml\(\) \{([\s\S]*?)\r?\n\}\r?\n\r?\nasync function runLockedBuild/)[1];
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const rewrite = new AsyncFunction('readFile', 'join', 'ROOT', body);
test('optional intro entry is bundled and its dynamic import is rewritten for retail', async () => {
  // The optional entries are stable-named entry chunks so bootEntry's literal dynamic imports
  // resolve to the same specifiers in dev (raw modules) and retail (esbuild split chunks).
  assert(source.includes("'ui/introSignalRemixBoot': join(SRC, 'ui/introSignalRemixBoot.js')"));
  assert(source.includes("'ui/loadingTerminalArt': join(SRC, 'ui/loadingTerminalArt.js')"));
  assert(bootEntry.includes("import('./introSignalRemixBoot.js')"));
  assert(bootEntry.includes("import('./loadingTerminalArt.js')"));
  assert(bootEntry.includes('.catch(() => { /* Decoration cannot block boot. */ });'));
  const html = await rewrite(async () => devHtml, join, '/repo');
  assert(html.includes('<script type="module" src="./main.js"></script>'));
  assert(!html.includes('./src/'));
});
test('a drifted optional entry fails the build instead of shipping a missing source path', async () => {
  // A renamed/missing src target leaves a './src/' path behind; the rewrite refuses to ship it.
  const drift = devHtml.replace(
    '<script type="module" src="./src/ui/bootEntry.js"></script>',
    '<script type="module" src="./src/ui/missingEntry.js"></script>');
  await assert.rejects(() => rewrite(async () => drift, join, '/repo'), /entry reference|source-module reference/);
  // The retail chunk lookup only exists while bootEntry issues the literal specifier esbuild
  // rewrites — pin the exact literal so a drifted import fails before the bundle ever ships.
  assert(bootEntry.includes("import('./introSignalRemixBoot.js')"), 'optional remix entry drifted');
});
