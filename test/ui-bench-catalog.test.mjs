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
import { crucibleScreen } from '../src/ui/screens/crucible.js';

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

test('bench replacement retires the real hangar preview before discarding its screen', async () => {
  const source = readFileSync(path.join(ROOT, 'tools', 'ui-bench.js'), 'utf8');
  const ast = parse(source, { sourceType: 'module' });
  const releaseNode = ast.program.body.find(node => node.type === 'FunctionDeclaration'
    && node.id.name === 'releaseCurrentBenchScreen');
  const gotoNode = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'goto');
  assert.ok(releaseNode, 'the real bench owns outgoing screen retirement');
  assert.ok(gotoNode, 'exercise the real navigation caller');
  const events = [], screen = Object.create(crucibleScreen);
  const context = { currentScreen: screen, state: {}, bus: {}, manager: {}, registry: {}, screenMemory: {} };
  screen._embarkSpecActive = true;
  screen._armEmbarkSpec = () => assert.fail('a retired hangar must not speculate');
  screen._preparation = {
    setActive(active) {
      assert.equal(active, false, 'the outgoing preview stops drawing');
      assert.equal(context.currentScreen, null, 'nested navigation cannot release the same owner again');
      events.push('preview stopped');
    },
    dispose() { events.push('preview disposed'); },
  };
  const release = runInNewContext(`(${source.slice(releaseNode.start, releaseNode.end)})`, context);
  const nextFixture = new Error('next fixture boundary');
  Object.assign(context, {
    releaseCurrentBenchScreen: release, releaseFlightPopup: null, currentAlias: null,
    window: {}, manifestFixture: null, resolveShot: id => ({ id, screen: id }),
    applyBackdrop() {
      assert.deepEqual(events, ['preview stopped', 'preview disposed'],
        'retire the outgoing owner before replacing visuals or reseeding the fixture');
      throw nextFixture;
    },
  });
  const navigate = runInNewContext(`(${source.slice(gotoNode.start, gotoNode.end)})`, context);
  await assert.rejects(navigate('mainMenu'), error => error === nextFixture);
  assert.deepEqual(events, ['preview stopped', 'preview disposed']);
  assert.equal(screen._preparation, null, 'the real screen no longer retains its old WebGL preview');
  assert.equal(screen._armEmbarkSpec, null);
  assert.equal(screen._embarkSpecActive, false);
  release();
  assert.equal(events.length, 2, 'an already retired screen cannot be disposed twice');

  let cleanupCalls = 0;
  context.currentScreen = { _cleanup() { cleanupCalls++; }, onHide(ctx) {
    assert.equal(ctx.state, context.state);
    assert.equal(ctx.screenManager, context.manager);
    this._cleanup();
  } };
  release();
  assert.equal(cleanupCalls, 1, 'session owners such as Drill perform their own cleanup once');

  let disposedAfterFailure = false;
  context.currentScreen = { onHide() { throw new Error('hide failed'); }, dispose() { disposedAfterFailure = true; } };
  assert.throws(release, /hide failed/);
  assert.equal(disposedAfterFailure, true, 'a hide failure cannot strand the discarded renderer');
  assert.equal(context.currentScreen, null);
});
