// The bench catalog is the list agents shoot. Every shot id resolves, backdrop files exist,
// and the page still has a loader for the screen that shot mounts.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BACKDROPS, resolveShot, UI_BENCH_SHOTS } from '../scripts/lib/uiBenchCatalog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('every bench shot id is unique and resolves to a screen', () => {
  const seen = new Set();
  for (const shot of UI_BENCH_SHOTS) {
    assert.equal(seen.has(shot.id), false, `duplicate shot id ${shot.id}`);
    seen.add(shot.id);
    assert.equal(resolveShot(shot.id).screen, shot.screen);
    assert.ok(BACKDROPS[shot.backdrop], `${shot.id} backdrop ${shot.backdrop}`);
  }
  assert.equal(resolveShot('title').screen, 'mainMenu');
  assert.equal(resolveShot('station-market').tab, 'market');
  assert.equal(resolveShot('comms-radial').overlay, 'comms');
  assert.equal(resolveShot('chart-galaxy').focus, 'galaxy');
  assert.equal(resolveShot('missing'), null);
});

test('backdrop stills exist and the bench page mounts every screen the catalog names', () => {
  for (const rel of Object.values(BACKDROPS)) {
    const file = path.join(ROOT, rel.replace(/^\.\.\//, ''));
    assert.equal(existsSync(file), true, file);
  }
  const page = readFileSync(path.join(ROOT, 'tools', 'ui-bench.js'), 'utf8');
  const screens = new Set(UI_BENCH_SHOTS.map((shot) => shot.screen));
  for (const screen of screens) {
    const mounted = screen === 'flight' || screen === 'crucibleHud'
      ? page.includes(`=== '${screen}'`) || page.includes(`'${screen}'`)
      : new RegExp(`\\n\\s+${screen}:\\s*\\(\\)`).test(page);
    assert.equal(mounted, true, `tools/ui-bench.js has no loader for ${screen}`);
  }
});
