import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { applyLaneMode } from '../src/core/simLaneCommands.js';
import { fakeDom } from './helpers/fake-dom.mjs';
import {
  composeWindowTitle,
  syncWindowTitle,
} from '../src/ui/windowTitle.js';

// Fixed seed 4242. The seed is debug state: it must never appear in the window title.
const SEED = 4242;

function flightView(extra = {}) {
  return {
    mode: 'flight',
    runKind: 'adventure',
    sectorName: 'Helios Prime',
    seed: SEED,
    fps: 144,
    tick: 9000,
    entityId: 'ent_player_1',
    ...extra,
  };
}

test('in flight the window title names the mode and the sector, and leaves debug state out', () => {
  const doc = { title: 'SpaceFace' };
  let writes = 0;
  const counting = {
    get title() { return doc.title; },
    set title(value) { writes += 1; doc.title = value; },
  };

  assert.equal(syncWindowTitle(counting, flightView()), 'Adventure — Helios Prime');
  assert.equal(doc.title, 'Adventure — Helios Prime');
  assert.equal(doc.title.includes(String(SEED)), false);
  assert.equal(doc.title.includes('144'), false);
  assert.equal(doc.title.includes('9000'), false);
  assert.equal(doc.title.includes('ent_player_1'), false);

  syncWindowTitle(counting, flightView({ tick: 9001, fps: 30, seed: SEED }));
  assert.equal(writes, 1, 'a later tick must not rewrite the same title');

  assert.equal(
    composeWindowTitle(flightView({ runKind: null, ruleset: 'swarm' })),
    'Swarm — Helios Prime',
  );
  assert.equal(
    composeWindowTitle(flightView({ runKind: null, ruleset: 'scored' })),
    'Gauntlet — Helios Prime',
  );
  assert.equal(
    composeWindowTitle(flightView({ runKind: null, ruleset: 'boss_circuit', sectorName: 'Ceres Belt' })),
    'Boss circuit — Ceres Belt',
  );
  assert.equal(
    composeWindowTitle(flightView({ runKind: 'adventure', ruleset: 'trial_one_hull' })),
    'Adventure — Helios Prime',
  );
  assert.equal(
    composeWindowTitle(flightView({ runKind: null, ruleset: 'trial_one_hull' })).includes('trial'),
    false,
  );
});

test('the shell shows the menu title, and a raw sector id is never the window title', () => {
  const doc = { title: 'Adventure — Helios Prime' };
  assert.equal(syncWindowTitle(doc, {
    mode: 'menu',
    shell: true,
    sectorName: 'Helios Prime',
    seed: SEED,
    fps: 60,
    tick: 3,
  }), 'SpaceFace');
  assert.equal(doc.title, 'SpaceFace');
  assert.equal(doc.title.includes('Helios'), false);

  const refused = composeWindowTitle(flightView({ sectorName: 'sector_helios_prime' }));
  assert.equal(refused, 'SpaceFace');
  assert.equal(refused.includes('sector_'), false);
  assert.equal(composeWindowTitle(flightView({ sectorName: '—' })), 'SpaceFace');
});

// Execute the real ui.init/destroy, with only unrelated visual mounts replaced.
// The title installer, state, bus, screen manager and mode applier stay real.
async function mountUi(t) {
  const mounts = {
    './entityLinks.js': ['createEntityLinks'], './whyReveal.js': ['mountWhyReveal'],
    './input.js': ['createUiInput'], './views/hudStyles.js': ['injectHudCss'],
    './racingHud.js': ['mountRacingHud'],
    './physicalJobsPrompt.js': ['createPhysicalJobsPrompt'],
    '../render/spectrum/overlay.js': ['mountSpectrumOverlay'],
    './hud.js': ['createHud'], './bandHud.js': ['createBandHud'],
    './worldObjectInteraction.js': ['createWorldObjectInteraction'],
    './aftermathChoicePrompt.js': ['createAftermathChoicePrompt'],
    './encounterChoicePrompt.js': ['createEncounterChoicePrompt'],
    './lawfulInspectionPrompt.js': ['createLawfulInspectionPrompt'],
    './promptDeck.js': ['createPromptDeck'], './toasts.js': ['createToasts'],
    './watchlistHud.js': ['createWatchlistHud'], './globalFind.js': ['createGlobalFind'],
    './discoveryPlate.js': ['createDiscoveryPlate'], './marketNews.js': ['createMarketNews'],
    './alerts.js': ['createAlerts'], './comms.js': ['createComms'],
    './nemesisComms.js': ['mountNemesisComms'], './wingmanRadial.js': ['createWingmanRadial'],
    './capitalBossOverlayMount.js': ['mountCapitalBossOverlay'],
    './kit/index.js': ['bindSound', 'bindTemperature'],
    './physicsVenues.js': ['installPhysicsVenueHooks', 'mountPhysicsVenueHud'],
  };
  const rootUrl = new URL('../src/ui/uiRoot.js?window-title-wiring', import.meta.url).href;
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      const names = context.parentURL === rootUrl && mounts[specifier];
      if (!names) return nextResolve(specifier, context);
      const source = names.map(name => `export function ${name}() { return Object.assign(() => {}, {
        destroy() {}, dispose() {}, frame() {}, isModalOpen() { return false; }
      }); }`).join('\n');
      return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    },
  });
  t.after(() => hook.deregister());
  const { ui } = await import(rootUrl);
  const doc = fakeDom();
  const make = doc.createElement;
  doc.createElement = tag => {
    const node = make(tag);
    node.removeEventListener = () => {};
    node.removeChild = child => { node.children = node.children.filter(item => item !== child); child.parentNode = null; };
    node.remove = () => node.parentNode?.removeChild(node);
    return node;
  };
  doc.createElementNS = (_, tag) => doc.createElement(tag);
  doc.head.removeChild = child => { doc.head.children = doc.head.children.filter(item => item !== child); child.parentNode = null; };
  doc.body = doc.createElement('body');
  doc.documentElement = doc.createElement('html');
  doc.head.appendChild(doc.documentElement);
  doc.documentElement.appendChild(doc.body);
  doc.title = 'SpaceFace';
  doc.activeElement = doc.body;
  doc.addEventListener = doc.removeEventListener = () => {};
  for (const id of ['ui-root', 'hud', 'screens', 'modal-backdrop']) {
    const node = doc.createElement('div');
    node.id = id;
    doc.body.appendChild(node);
  }
  const win = {
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  };
  doc.defaultView = win;
  const globals = { document: doc, window: win, sessionStorage: { getItem: () => '1' },
    requestAnimationFrame: () => 1, setTimeout: () => 1, clearTimeout: () => {} };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, globalThis[key]]));
  Object.assign(globalThis, globals);
  let owner;
  t.after(() => {
    owner?.destroy();
    for (const key of Object.keys(globals)) {
      if (previous[key] === undefined) delete globalThis[key];
      else globalThis[key] = previous[key];
    }
  });
  const state = createGameState(SEED);
  state.world.currentSectorId = 'sector_helios_prime';
  const bus = createBus();
  owner = Object.create(ui);
  // Screen registration loads the whole menu/media graph; this unit tests the root mount.
  owner.registerScreens = () => {};
  owner.init({ state, bus, helpers: {} });
  await Promise.resolve();
  return { state, bus, doc, owner };
}

test('the real UI root installs a state-driven title without a command bar or HUD markers', async t => {
  const { state, bus, doc, owner } = await mountUi(t);
  const expectTitle = value => {
    assert.equal(doc.title, value);
    assert.doesNotMatch(doc.title, /4242|_|ent_player|fps|tick/i);
  };
  assert.equal(owner.commandBar, null);
  assert.equal(doc.body.querySelector('[data-k="sector"]'), null);
  expectTitle('SpaceFace');

  applyLaneMode(state, bus, 'flight');
  bus.emit('game:started', {});
  expectTitle('Adventure — Helios Prime');
  state.world.currentSectorId = 'sector_ceres_belt';
  bus.emit('sector:enter', { sectorId: state.world.currentSectorId });
  expectTitle('Adventure — Ceres Belt');

  for (const [ruleset, label] of [['swarm', 'Swarm'], ['scored', 'Gauntlet'], [null, 'Crucible']]) {
    state.run = createRunState({ kind: 'survival', ruleset, seed: SEED });
    state.run.phase = 'wave';
    bus.emit('run:started', { kind: 'survival', ruleset, seed: SEED });
    expectTitle(`${label} — Ceres Belt`);
    applyLaneMode(state, bus, 'paused');
    expectTitle(`${label} — Ceres Belt`);
    applyLaneMode(state, bus, 'flight');
  }

  state.run = createRunState();
  state.missions.active.push({ id: 'race_fixture_4242', type: 'race', status: 'active', params: { racingContractId: 'circuit_fixture' } });
  bus.emit('mission:accepted', { missionId: 'race_fixture_4242' });
  expectTitle('Racing — Ceres Belt');
  state.missions.active = [];
  bus.emit('mission:updated', { missionId: 'race_fixture_4242' });
  expectTitle('Adventure — Ceres Belt');

  // Neither unknown IDs nor unrelated debug/per-tick changes become title text.
  state.world.currentSectorId = 'sector_unknown_4242';
  bus.emit('sector:enter', { sectorId: state.world.currentSectorId });
  expectTitle('SpaceFace');
  state.world.currentSectorId = 'sector_ceres_belt';
  bus.emit('sector:enter', { sectorId: state.world.currentSectorId });
  state.world.currentSectorId = 'sector_helios_prime';
  state.tick = 99999;
  bus.emit('tick', { tick: state.tick });
  bus.emit('sim:tick', { tick: state.tick });
  expectTitle('Adventure — Ceres Belt');

  // Worker mode events reach presentation before their state mirror catches up.
  bus.emit('mode:changed', { mode: 'menu', previousMode: 'flight' });
  expectTitle('SpaceFace');
  bus.emit('run:ended', { outcome: 'aborted' });
  expectTitle('SpaceFace');
  applyLaneMode(state, bus, 'flight');
  expectTitle('Adventure — Helios Prime');
  bus.emit('game:exitToMenu', { source: 'pause' });
  expectTitle('SpaceFace');

  applyLaneMode(state, bus, 'menu');
  bus.emit('game:exitToMenu', { source: 'pause' });
  expectTitle('SpaceFace');
  owner.destroy();
  applyLaneMode(state, bus, 'flight');
  bus.emit('sector:enter', { sectorId: state.world.currentSectorId });
  expectTitle('SpaceFace');
});
