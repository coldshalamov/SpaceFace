import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  NEW_GAME_PLUS_SCHEMA,
  buildNewGamePlusCandidate,
  buildNewGamePlusOverlay,
  normalizeStoryNewGamePlusRecord,
} from '../src/core/newGamePlus.js';
import { FRESH_RUN_SYSTEMS, resetFreshRunSystems } from '../src/core/runReset.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { THREAD_B_FRAGMENT_ID } from '../src/data/narrative.js';
import { fnv1a } from '../src/save/checksum.js';
import { save } from '../src/save/saveSystem.js';
import { aceMemory as aceMemoryProto } from '../src/systems/aceMemory.js';
import { story as storyProto } from '../src/systems/story.js';

function completedRunData() {
  return {
    meta: { seed: 4701, playtimeS: 900, createdAt: '', lastSavedAt: '' },
    player: {
      credits: 999999,
      activeShipIndex: 0,
      moduleInventory: [
        { instanceId: 'relic', defId: 'unique_veil_cutter' },
        { instanceId: 'spare', defId: 'mod_market_data_s' },
      ],
      ownedShips: [{ defId: 'ship_kestrel', fittings: ['wpn_pulse_laser_s', 'mod_engine_ion_m'] }],
    },
    cargo: { items: {}, capVolume: 40, capMass: 60 },
    economy: {},
    factions: {},
    world: {
      currentSectorId: 'sector_helios_prime',
      sectors: { sector_helios_prime: { id: 'sector_helios_prime', name: 'Helios Prime' } },
    },
    entities: {
      player: {
        id: 'saved-player', type: 'ship', defId: 'ship_kestrel', pos: { x: 0, z: 0 },
        vel: { x: 0, z: 0 }, rot: 0, angVel: 0, hull: 100, shield: 100, cap: 100,
        flags: {}, data: {},
      },
      persistent: [], simTime: 900, tick: 54000,
    },
    missions: {
      boards: {}, active: [], completedLog: [], receipts: [], nextId: 1,
      story: { beatIndex: 7, flags: {}, endgameChoice: 'E', endgameResolved: true },
    },
    automation: {},
    aceMemory: {
      schemaVersion: 2, news: { old: true }, activeReturns: { 77: { aceId: 'ace_yara_no_cut' } },
      cultureIntros: {},
      ace_yara_no_cut: {
        encountered: true, fled: true, defeated: false, returnScheduled: false,
        returnTier: 2, fleeCount: 3, encounterCount: 4,
      },
      ace_toll_saint_venn: {
        encountered: true, fled: true, defeated: true, returnTier: 3, fleeCount: 2,
      },
      not_an_ace: { fled: true, defeated: false, returnTier: 99 },
    },
    settings: { gameplay: {}, video: {}, audio: {}, controls: {} },
  };
}

function envelopeFor(data, slot = 'legacy') {
  const savedAt = '2026-08-06T12:00:00.000Z';
  return {
    fmt: 'spaceface-save', version: CURRENT_VERSION, savedAt, playtimeS: 900, slot,
    checksum: fnv1a(JSON.stringify(data)), data,
  };
}

function withStorage(entries, fn) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map(entries);
  const storage = {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try { return fn(storage); }
  finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
}

test('completed run projects one selectable keepsake and only unresolved named-hunter grudges', () => {
  const data = completedRunData();
  const candidate = buildNewGamePlusCandidate(data, { slot: 'legacy', savedAt: 'now' });
  assert.equal(candidate.schema, NEW_GAME_PLUS_SCHEMA);
  assert.equal(candidate.sourceEnding, 'E');
  assert.equal(candidate.sourceEndingTitle, 'THE NEXT RUN');
  assert.equal(candidate.keepsakes[0].defId, 'unique_veil_cutter', 'authored relics sort first');
  assert.deepEqual(new Set(candidate.keepsakes.map((item) => item.defId)), new Set([
    'unique_veil_cutter', 'mod_market_data_s', 'wpn_pulse_laser_s', 'mod_engine_ion_m',
  ]));
  assert.equal(candidate.grudgeCount, 1, 'defeated and unknown hunters do not carry');

  const overlay = buildNewGamePlusOverlay(data, { keepsakeId: 'mod_market_data_s' }, { slot: 'legacy' });
  assert.equal(overlay.keepsake.defId, 'mod_market_data_s');
  assert.deepEqual(overlay.grudges, [{
    aceId: 'ace_yara_no_cut', returnTier: 2, fleeCount: 3, encounterCount: 4,
  }]);
  assert.equal(buildNewGamePlusOverlay(data, { keepsakeId: 'not_owned' }, { slot: 'legacy' }), null);
  assert.equal(buildNewGamePlusCandidate({ ...data, missions: { story: { endgameChoice: null } } }), null);
});

test('save owner discovers and revalidates a completed source without exposing the full run', () => {
  const env = envelopeFor(completedRunData());
  withStorage([['sf.save.legacy', JSON.stringify(env)]], () => {
    const candidate = save.getNewGamePlusCandidate();
    assert.equal(candidate.sourceSlot, 'legacy');
    assert.equal(candidate.sourceEnding, 'E');
    assert.equal(candidate.keepsakes.some((item) => item.defId === 'unique_veil_cutter'), true);

    const overlay = save.prepareNewGamePlus({ slot: 'legacy', keepsakeId: 'unique_veil_cutter' });
    assert.equal(overlay.sourceSlot, 'legacy');
    assert.equal(overlay.keepsake.defId, 'unique_veil_cutter');
    assert.equal(Object.hasOwn(overlay, 'player'), false);
    assert.equal(Object.hasOwn(overlay, 'world'), false);
  });
});

test('fresh New Game clears ace memory; New Run+ rebuilds deterministic unresolved pressure only', () => {
  assert.equal(FRESH_RUN_SYSTEMS.includes('aceMemory'), true);
  const state = createGameState(9981);
  const bus = createBus();
  const aceMemory = Object.assign({}, aceMemoryProto);
  aceMemory.init({ state, bus, helpers: {}, registry: { get: () => null } });
  state.aceMemory.stale = { fled: true };
  resetFreshRunSystems({ get: (name) => name === 'aceMemory' ? aceMemory : null });
  assert.equal(state.aceMemory.stale, undefined);

  const carried = [{ aceId: 'ace_yara_no_cut', returnTier: 2, fleeCount: 3, encounterCount: 4 }];
  assert.equal(aceMemory.applyNewGamePlusGrudges(carried), 1);
  const rec = state.aceMemory.ace_yara_no_cut;
  assert.equal(rec.returnScheduled, true);
  assert.equal(rec.returnsBigger, true);
  assert.equal(rec.defeated, false);
  assert.equal(rec.carriedFromPriorRun, true);
  assert.ok(rec.returnAt >= 360 && rec.returnAt < 780);
  assert.deepEqual(state.aceMemory.news, {});
  assert.deepEqual(state.aceMemory.activeReturns, {});

  const state2 = createGameState(9981);
  const aceMemory2 = Object.assign({}, aceMemoryProto);
  aceMemory2.init({ state: state2, bus: createBus(), helpers: {}, registry: { get: () => null } });
  aceMemory2.newGame();
  aceMemory2.applyNewGamePlusGrudges(carried);
  assert.equal(state2.aceMemory.ace_yara_no_cut.returnAt, rec.returnAt);
});

test('story owns a save-safe visible legacy receipt after game start', () => {
  const overlay = buildNewGamePlusOverlay(
    completedRunData(),
    { keepsakeId: 'unique_veil_cutter' },
    { slot: 'legacy', savedAt: '2026-08-06T12:00:00.000Z' },
  );
  const state = createGameState(7711);
  state.onboarding = { active: true, finished: false };
  const bus = createBus();
  const started = [];
  bus.on('story:newGamePlusStarted', (payload) => started.push(payload));
  const story = Object.assign({}, storyProto);
  story.init({ state, bus, helpers: { voice: { say() {} } }, registry: { get: () => null } });
  bus.emit('game:started', { newGamePlus: overlay });

  assert.equal(started.length, 1);
  assert.equal(state.story.newGamePlus.sourceEnding, 'E');
  assert.equal(state.story.newGamePlus.keepsakeId, 'unique_veil_cutter');
  assert.equal(state.story.newGamePlus.hunterGrudgeCount, 1);
  assert.equal(state.player.cargo.items[THREAD_B_FRAGMENT_ID], 1, 'ordinary opening fragment remains');
  assert.deepEqual(
    normalizeStoryNewGamePlusRecord(JSON.parse(JSON.stringify(state.story.newGamePlus))),
    state.story.newGamePlus,
  );
});
