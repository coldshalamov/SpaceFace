import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const documentUrl = new URL('https://spaceface.test/index.html');

// This is a source-target contract, not an import-closure or browser boot test.
// Installed dependencies and vendored modules have separate installation/build checks.
function sourcePreloads(html) {
  const targets = [];
  const uncommented = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const [tag] of uncommented.matchAll(/<link\b[^>]*>/gi)) {
    const attributes = new Map();
    for (const match of tag.matchAll(/\s([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4]);
    }
    if (!attributes.get('rel')?.toLowerCase().split(/\s+/).includes('modulepreload')) continue;
    const href = attributes.get('href');
    assert.ok(href, 'modulepreload link must name a target');
    const url = new URL(href, documentUrl);
    if (url.origin === documentUrl.origin && url.pathname.startsWith('/src/')) {
      targets.push(decodeURIComponent(url.pathname.slice(1)));
    }
  }
  return targets;
}

function missingTargets(targets, isFile) {
  return [...new Set(targets)].filter((target) => !isFile(target));
}

test('source preload discovery handles link attributes and ignores non-source hints', () => {
  assert.deepEqual(sourcePreloads(`
    <!-- <link rel="modulepreload" href="./src/commented.js"> -->
    <link href='./src/first.js?v=1#module' fetchpriority="high" rel='modulepreload' />
    <LINK REL="MODULEPRELOAD" HREF="/src/second.js">
    <link rel="stylesheet" href="./src/not-a-module.css">
    <link rel="modulepreload" href="https://example.com/src/remote.js">
    <link rel="modulepreload" href="./node_modules/package/index.js">
  `), ['src/first.js', 'src/second.js']);
});

test('missing source targets are reported even when other preloads resolve', () => {
  const targets = sourcePreloads(`
    <link rel="modulepreload" href="./src/present.js">
    <link rel="modulepreload" href="./src/data/encounters/missing.js">
  `);
  assert.deepEqual(missingTargets(targets, (target) => target === 'src/present.js'),
    ['src/data/encounters/missing.js']);
});

test('every index.html source modulepreload points to a shipped file', () => {
  const targets = sourcePreloads(readFileSync(new URL('index.html', root), 'utf8'));
  assert.ok(targets.length > 0, 'must inspect real source modulepreloads');
  assert.ok(targets.some((target) => target.startsWith('src/data/encounters/')),
    'must include the encounter preload wave');
  assert.ok(!targets.includes('src/core/registry.js'),
    'the full simulation registry stays on its ordinary dynamic-import fallback path');
  assert.deepEqual(targets.filter((target) => target.startsWith('src/render/characters/ruckusMeshData/')), [],
    'RU-7 payloads stay off unconditional source preloads and load through explicit warm demand');
  const missing = missingTargets(targets, (target) => {
    try {
      return statSync(new URL(target, root)).isFile();
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
      throw error;
    }
  });
  assert.deepEqual(missing, [], `Missing source modulepreload targets:\n${missing.join('\n')}`);
});
