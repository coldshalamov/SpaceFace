import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

import { buildUiCssSidecars } from '../scripts/lib/buildUiCssSidecars.mjs';
import { ensureHudStylesheet } from '../src/ui/views/hudStylesheet.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('tracked UI CSS sidecars exactly match their authored sources', async () => {
  const result = await buildUiCssSidecars({ root: ROOT, check: true });
  assert.deepEqual(result.map(({ path, changed }) => ({ path, changed })), [
    { path: 'styles/deckplate.generated.css', changed: false },
    { path: 'styles/hud-flight.generated.css', changed: false },
  ]);
});

test('canonical HTML preserves Deckplate, station insertion point, then HUD cascade', async () => {
  const html = await readFile(resolve(ROOT, 'index.html'), 'utf8');
  const station = await readFile(resolve(ROOT, 'src/ui/station/stationStyles.js'), 'utf8');
  const deckplate = html.indexOf('id="sf-deckplate-style"');
  const hud = html.indexOf('id="sf-hud-style"');
  assert.ok(deckplate >= 0 && hud > deckplate,
    'the HUD stylesheet must follow the Deckplate link');
  assert.match(station, /getElementById\('sf-deckplate-style'\)/,
    'station styles must keep using the Deckplate insertion anchor');
  assert.ok(html.includes('./styles/deckplate.generated.css'));
  assert.ok(html.includes('./styles/hud-flight.generated.css'));
  assert.ok(!html.includes('src/ui/views/hudStyles.js'), 'the large authoring module must not be preloaded');
});

test('embedded UI hosts resolve fallback sheets from the app root', () => {
  const nodes = new Map();
  const doc = {
    defaultView: {},
    head: { appendChild(node) { nodes.set(node.id, node); node.parentNode = this; } },
    getElementById(id) { return nodes.get(id) || null; },
    createElement(tagName) { return { tagName, id: '', rel: '', href: '', parentNode: null }; },
  };
  ensureHudStylesheet(doc);
  assert.equal(nodes.get('sf-deckplate-style')?.href, '/styles/deckplate.generated.css');
  assert.equal(nodes.get('sf-hud-style')?.href, '/styles/hud-flight.generated.css');
});
