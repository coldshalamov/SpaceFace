// The bench catalog is the list agents shoot. Every shot id resolves, backdrop files exist,
// and the page still has a loader for the screen that shot mounts.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { parse } from '@babel/parser';

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
  for (const [id, mapAlias] of [['localmap', 'localmap'], ['localmap-legacy', 'localmap'],
    ['starmap', 'starmap'], ['starmap-legacy', 'starmap']]) {
    const shot = resolveShot(id);
    assert.deepEqual({ screen: shot.screen, chart: shot.chart, backdrop: shot.backdrop, mapAlias: shot.mapAlias },
      { screen: 'galaxyMap', chart: 'seeded', backdrop: 'space', mapAlias }, id);
  }
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
    const mounted = screen === 'flight' || screen === 'crucibleHud' || screen === 'mobileFlight'
      ? page.includes(`=== '${screen}'`) || page.includes(`'${screen}'`)
      : new RegExp(`\\n\\s+${screen}:\\s*\\(\\)`).test(page);
    assert.equal(mounted, true, `tools/ui-bench.js has no loader for ${screen}`);
  }
});

test('bench screen availability is correct before the first title mount and rejects missing destinations', () => {
  const source = readFileSync(path.join(ROOT, 'tools', 'ui-bench.js'), 'utf8');
  const ast = parse(source, { sourceType: 'module' });
  const declarations = ast.program.body.filter(node => node.type === 'VariableDeclaration').flatMap(node => node.declarations);
  const initializer = name => {
    const node = declarations.find(declaration => declaration.id.name === name)?.init;
    assert.ok(node, `${name} is declared by the real bench`);
    return source.slice(node.start, node.end);
  };
  // Execute the real registry and manager definitions without importing the browser fixture.
  // Loader functions remain lazy: no game screen, renderer or network work runs in this test.
  const SCREENS = runInNewContext(`(${initializer('SCREENS')})`);
  const stack = [];
  const manager = runInNewContext(`(${initializer('manager')})`, { SCREENS, stack });
  for (const id of ['mainMenu', 'newGame', 'crucible', 'settings', 'help']) {
    assert.equal(manager.hasScreen(id), true, `${id} is available while the initial stack is empty`);
  }
  for (const id of [undefined, 'missing-screen', 'constructor', 'toString']) {
    assert.equal(manager.hasScreen(id), false, 'an unsupported route must stay unavailable');
  }
  stack.push('mainMenu');
  assert.equal(manager.hasScreen('crucible'), true);
  assert.equal(manager.hasScreen('missing-screen'), false, 'opening a screen does not register every destination');
});
