import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  clearCrucibleSetup,
  canChooseSwarmOpeningLesson,
  crucibleLaunchConfig,
  crucibleSetupFor,
  lastCrucibleSetup,
  requestCrucibleRun,
} from '../src/ui/crucibleLaunch.js';
import { loadCrucibleMeta, saveCrucibleMeta, useCrucibleMetaStorage } from '../src/systems/survivalRecords.js';
import { crucibleScreen } from '../src/ui/screens/crucible.js';
import { applyRunShareCode, doorRunShareCode } from '../src/ui/screens/shareCode.js';
import { installDom } from './helpers/mini-dom.mjs';

function memoryStorage() {
  const rows = new Map();
  return { getItem: (key) => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, String(value)), removeItem: (key) => rows.delete(key) };
}

test('ordinary first Swarm launch opens the generated horde; explicit training choice keeps the lesson', () => {
  useCrucibleMetaStorage(memoryStorage());
  clearCrucibleSetup();
  const emitted = [];
  const bus = { emit: (event, payload) => emitted.push({ event, payload }), on() {}, off() {}, once() {} };
  try {
  const first = crucibleSetupFor({ starterId: 'kinetic_baseline', seed: 4242 });
  assert.equal(first.ok, true);
  const ordinary = crucibleLaunchConfig(first.value, 'swarm');
  assert.notEqual(ordinary.openingLesson, true, 'a fresh profile does not silently get the tutorial hold');
  assert.equal(ordinary.survivalSetup.seed, 4242);
  assert.equal(requestCrucibleRun(bus, first.value, 'swarm'), true);
  assert.notEqual(lastCrucibleSetup().openingLesson, true, 'default launch and retry remain immediate-horde runs');
  const ordinaryRequest = emitted.find(({ event }) => event === 'game:new');
  assert.ok(ordinaryRequest);
  assert.notEqual(ordinaryRequest.payload.crucibleSetup.openingLesson, true,
    'native boot payload does not re-enable the first-profile tutorial');
  assert.equal(ordinaryRequest.payload.crucibleSetup.zeroScrapOpening, undefined,
    'an older launch without the new door choice retains its funding policy');

  const training = crucibleSetupFor({ starterId: 'kinetic_baseline', seed: 4243 });
  training.value.openingLesson = true;
  const lesson = crucibleLaunchConfig(training.value, 'swarm', { openingLesson: true });
  assert.equal(lesson.openingLesson, true, 'the visible training option survives launch config construction');
  assert.equal(lesson.survivalSetup.seed, 4243);
  assert.equal(requestCrucibleRun(bus, training.value, 'swarm'), true);
  assert.equal(lastCrucibleSetup().openingLesson, true, 'retry snapshot retains the chosen training opening');
  const trainingRequest = emitted.filter(({ event }) => event === 'game:new')[1];
  assert.equal(trainingRequest.payload.crucibleSetup.openingLesson, true,
    'native boot payload preserves the explicit training choice');

  const wrapped = crucibleSetupFor({ starterId: 'kinetic_baseline', seed: 4244 });
  assert.equal(requestCrucibleRun(bus, wrapped, 'swarm'), true);
  const wrappedRequest = emitted.filter(({ event }) => event === 'game:new')[2];
  assert.equal(wrappedRequest.payload.crucibleSetup.survivalSetup.hullId, wrapped.value.hullId);
  assert.equal(wrappedRequest.payload.crucibleSetup.survivalSetup.seed, 4244);
  assert.notEqual(wrappedRequest.payload.crucibleSetup.openingLesson, true);
  } finally {
    useCrucibleMetaStorage(null);
    clearCrucibleSetup();
  }
});

test('training availability follows selected challenge state, not offer availability', () => {
  assert.equal(canChooseSwarmOpeningLesson({ ruleset: 'swarm' }), true);
  assert.equal(canChooseSwarmOpeningLesson({ ruleset: 'swarm', weekly: true }), false);
  assert.equal(canChooseSwarmOpeningLesson({ ruleset: 'swarm', daily: true }), false);
  assert.equal(canChooseSwarmOpeningLesson({ ruleset: 'swarm', raceGhost: true }), false);
  assert.equal(canChooseSwarmOpeningLesson({ ruleset: 'swarm', pendingShare: { ghostHash: 42 } }), false);
  assert.equal(canChooseSwarmOpeningLesson({ ruleset: 'swarm', practiceQueued: true }), false);
  assert.equal(canChooseSwarmOpeningLesson({ ruleset: 'scored' }), false);
  // An available weekly/ghost record is not itself a selection, so it cannot suppress training.
  assert.equal(canChooseSwarmOpeningLesson({ ruleset: 'swarm', weeklyOfferAvailable: true, ghostAvailable: true }), true);
});

test('the one-enemy start leaves checkpoint launches alone and restores the choice at Round 1', () => {
  useCrucibleMetaStorage(memoryStorage());
  const profile = loadCrucibleMeta();
  profile.ladder.arenas.helios_core = { zones: { 0: { stars: 1 } }, checkpoint: 1, bestWave: 10 };
  saveCrucibleMeta(profile);
  const { document, restore } = installDom();
  document.addEventListener = (...args) => document.body.addEventListener(...args);
  document.removeEventListener = (...args) => document.body.removeEventListener(...args);
  const createElement = document.createElement.bind(document);
  document.createElement = (tag) => {
    const node = createElement(tag);
    node.append = (...children) => {
      for (const child of children) {
        node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
      }
    };
    node.prepend = child => node.insertBefore(child, node.firstChild);
    node.removeChild = child => {
      node.childNodes.splice(node.childNodes.indexOf(child), 1);
      child.parentNode = null;
      return child;
    };
    node.replaceChild = (child, previous) => { previous.replaceWith(child); return previous; };
    node.replaceChildren = (...children) => {
      for (const child of [...node.childNodes]) node.removeChild(child);
      node.append(...children);
    };
    return node;
  };
  const root = document.createElement('div');
  document.body.appendChild(root);
  const screen = Object.create(crucibleScreen);
  const bus = createBus();
  const launches = [];
  bus.on('game:new', p => launches.push(p.crucibleSetup));
  try {
    screen.mount(root, { state: createGameState(4242), bus, registry: { get: () => null } });
    const toggle = root.querySelector('[aria-label="Start with one enemy"]');
    const thinPurse = [...root.querySelectorAll('.sf-crd-threat')].find(node => node.dataset.threatId === 'thin_purse');
    const summary = root.querySelector('.orr-prep-summary');
    const purseTiles = () => [...root.querySelectorAll('.orr-prep-stake-number')].map(node => node.textContent);
    const zone = (label) => [...root.querySelectorAll('.sf-crd-zone-pick')]
      .find(node => label.test(node.textContent));
    const launch = () => {
      root.querySelector('.orr-prep-continue').click();
      assert.equal(root.dataset.prepStep, '1');
      const review = root.querySelector('.sf-swarm-enter-key');
      assert.match(review.textContent, /^Review equipment/);
      review.click();
    };
    assert.equal(toggle.disabled, false);
    assert.equal(thinPurse.hidden, true);
    assert.match(summary.textContent, /0 Scrap to start/);
    assert.deepEqual(purseTiles(), ['0 Scrap', '0 Scrap', '0 Scrap', '0 Scrap']);
    assert.equal(toggle.getAttribute('aria-pressed'), 'false');
    toggle.click();
    assert.match(toggle.textContent, /then the wave/);

    zone(/Round 11/).click();
    assert.equal(thinPurse.hidden, false);
    thinPurse.click();
    assert.match(summary.textContent, /cr to spend/);
    assert.ok(purseTiles().includes('2,400 cr'));
    assert.equal(toggle.disabled, true);
    assert.equal(toggle.getAttribute('aria-pressed'), 'false');
    assert.match(toggle.textContent, /Round 1 only/);
    launch();
    assert.equal(launches[0].survivalSetup.wave, 11);
    assert.equal(launches[0].zeroScrapOpening, undefined);
    assert.deepEqual(launches[0].swarmThreats, ['thin_purse']);
    assert.notEqual(launches[0].openingLesson, true);

    root.querySelector('#sf-prep-tab-0').click();
    zone(/^Round 1\b/).click();
    assert.equal(thinPurse.hidden, true);
    assert.match(summary.textContent, /0 Scrap to start/);
    assert.equal(toggle.disabled, false);
    assert.equal(toggle.getAttribute('aria-pressed'), 'true');
    launch();
    assert.equal(launches[1].survivalSetup.wave, 1);
    assert.equal(launches[1].zeroScrapOpening, true);
    assert.equal(launches[1].swarmThreats, undefined);
    assert.equal(launches[1].openingLesson, true);

    const button = (label) => [...root.querySelectorAll('button')].find(node => node.textContent === label);
    const field = root.querySelector('.sf-crd-code');
    const thickPack = [...root.querySelectorAll('.sf-crd-threat')].find(node => node.dataset.threatId === 'thick_pack');
    thickPack.click();
    button('Copy code').click();
    const copied = field.value;
    const decoded = applyRunShareCode(copied);
    assert.equal(decoded.zeroScrapOpening, true);
    assert.equal(decoded.openingLesson, true);
    assert.deepEqual(decoded.swarmThreats, ['thick_pack'], 'the disabled Thin Purse is absent from the exported rules');

    thickPack.click();
    toggle.click();
    const kestrel = [...root.querySelectorAll('.sf-crd-hull')].find(node => node.dataset.starterId === 'hull:ship_kestrel');
    kestrel.click();
    assert.equal(kestrel.getAttribute('aria-pressed'), 'true');
    field.value = copied;
    button('Use code').click();
    assert.match(summary.textContent, /Hornet.*0 Scrap to start/);
    assert.equal(kestrel.getAttribute('aria-pressed'), 'false');
    assert.equal(toggle.getAttribute('aria-pressed'), 'true');
    assert.equal(thickPack.getAttribute('aria-pressed'), 'true');
    assert.equal(thinPurse.hidden, true);
    root.querySelector('.sf-swarm-enter-key').click();
    assert.deepEqual(launches[2].survivalSetup, launches[1].survivalSetup);
    assert.equal(launches[2].zeroScrapOpening, true);
    assert.equal(launches[2].openingLesson, true);
    assert.deepEqual(launches[2].swarmThreats, ['thick_pack']);
    assert.deepEqual(launches[2].survivalSetup.loadout, [], 'the recipient picks manually in Equipment');

    const locked = doorRunShareCode({ starterId: 'hull:ship_hornet', seed: 4242, arenaId: 'the_hive',
      ruleset: 'swarm', stake: 'exhibition', zeroScrapOpening: true });
    assert.equal(locked.ok, true);
    field.value = locked.code;
    button('Use code').click();
    assert.match(root.textContent, /Unlock The Hive to use this run code\./i);
    assert.match(summary.textContent, /Ricochet Foundry.*0 Scrap to start/, 'a locked share cannot switch to a fallback room');

    const share = doorRunShareCode({ starterId: 'hull:ship_hornet', seed: 4242,
      arenaId: 'helios_core', ruleset: 'swarm', stake: 'exhibition' });
    assert.equal(share.ok, true);
    field.value = share.code;
    button('Use code').click();
    assert.equal(thinPurse.hidden, false);
    assert.match(summary.textContent, /2,400 cr to spend/);
    root.querySelector('.sf-swarm-enter-key').click();
    assert.equal(launches[3].survivalSetup.hullId, 'ship_hornet');
    assert.deepEqual(launches[3].survivalSetup.loadout, []);
    assert.equal(launches[3].swarmStake, 'exhibition');
    assert.equal(launches[3].zeroScrapOpening, undefined, 'a shared bare hull does not silently adopt new door funding');
  } finally {
    screen.dispose();
    restore();
    useCrucibleMetaStorage(null);
    clearCrucibleSetup();
  }
});
