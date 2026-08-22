// CRU-002 — Appendix A.8 campaign-contamination boundary (PQ-133 ruling 2).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  assertCampaignBoundaryUnchanged,
  snapshotCampaignBoundary,
} from '../src/core/runState.js';
import { save } from '../src/save/saveSystem.js';
import { runSession } from '../src/systems/runSession.js';

const REQUIRED_SAVE_KEYS = Object.freeze([
  'meta', 'player', 'cargo', 'economy', 'factions', 'world', 'entities', 'combat', 'missions', 'settings',
]);

function populateCampaign(state) {
  const fittings = [{ id: 'mod_campaign_shield' }];
  state.player.credits = 1000;
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings }];
  state.player.activeShipIndex = 0;
  state.player.moduleInventory = [{ id: 'inv_campaign_cell' }];
  state.player.researchedNodes = ['tech_campaign_beam'];
  state.player.researchPoints = 17;
  state.player.heat = 0.42;
  state.player.cargo = {
    items: { ore_silicates: 9 },
    usedVolume: 9,
    usedMass: 9,
    capVolume: 40,
    capMass: 60,
  };
  state.factions = {
    heliopause: { rep: 22, tier: 'cordial', aggro: false },
  };
  state.world.currentSectorId = 'sector_helios_prime';
  return state;
}

function bootSession(seed = 21) {
  const state = populateCampaign(createGameState(seed));
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  runSession.init({ state, bus });
  return { state, bus, emitted };
}

function driveSurvivalRun(bus, state) {
  bus.emit('run:beginRequested', {
    kind: 'survival',
    ruleset: 'scored',
    seed: 7,
    arenaId: 'arena_ricochet_foundry',
  });
  bus.emit('run:transitionRequested', {
    expectedPhase: 'loadout', nextPhase: 'arena_intro', reason: 'ready', tick: 1,
  });
  bus.emit('run:transitionRequested', {
    expectedPhase: 'arena_intro', nextPhase: 'wave_intro', reason: 'intro_done', tick: 2,
  });
  bus.emit('run:transitionRequested', {
    expectedPhase: 'wave_intro', nextPhase: 'active', reason: 'wave_start', tick: 3,
  });
  state.run.credits = 250;
  state.run.xp = 40;
  state.run.modifiers.push({ id: 'glass_cannon' });
  state.run.draftHistory.push({ pick: 'shield_boost' });
  bus.emit('run:transitionRequested', {
    expectedPhase: 'active', nextPhase: 'cleanup', reason: 'wave_clear', tick: 4,
  });
  bus.emit('run:endRequested', { outcome: 'victory', reason: 'act_complete', tick: 5 });
}

function withSave(state, fn) {
  const prev = {
    state: save.state,
    bus: save.bus,
    helpers: save.helpers,
    registry: save.registry,
  };
  save.state = state;
  save.bus = createBus();
  save.helpers = {};
  save.registry = { get() { return null; } };
  try {
    return fn(save);
  } finally {
    save.state = prev.state;
    save.bus = prev.bus;
    save.helpers = prev.helpers;
    save.registry = prev.registry;
  }
}

function serializeAdventurePayload(s) {
  const data = s.serializeData();
  // meta.lastSavedAt is a wall-clock stamp from _serializeMeta. Exclude only that path
  // so the rest of the Adventure payload can be byte-compared across a survival run.
  if (data.meta) delete data.meta.lastSavedAt;
  return JSON.stringify(data);
}

test('a survival run leaves campaign credits, cargo, ships, reputation, research, heat, world, and RNG untouched', () => {
  const { state, bus, emitted } = bootSession(21);
  const before = snapshotCampaignBoundary(state);
  const rng = state.rng;
  const fittings = state.player.ownedShips[0].fittings;
  driveSurvivalRun(bus, state);
  assert.equal(state.run.kind, 'survival');
  assert.equal(state.run.credits, 250);
  assert.equal(state.run.xp, 40);
  assertCampaignBoundaryUnchanged(before, snapshotCampaignBoundary(state));
  assert.equal(state.rng, rng);
  assert.equal(state.player.ownedShips[0].fittings, fittings);
  assert.ok(!emitted.some((entry) => entry.event === 'economy:grantCredits'));
  assert.ok(!emitted.some((entry) => entry.event === 'economy:chargeCredits'));
});

test('assertCampaignBoundaryUnchanged throws naming player.credits when campaign credits drift', () => {
  const { state, bus } = bootSession(22);
  const before = snapshotCampaignBoundary(state);
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: 7 });
  state.player.credits += 1;
  assert.throws(
    () => assertCampaignBoundaryUnchanged(before, snapshotCampaignBoundary(state)),
    (err) => err instanceof Error && /player\.credits/.test(err.message),
  );
});

test('shared fittings/run.modifiers reference is caught by the identity check', () => {
  const { state, bus } = bootSession(23);
  const before = snapshotCampaignBoundary(state);
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: 7 });
  const shared = ['leaked-mod'];
  state.run.modifiers = shared;
  state.player.ownedShips[0].fittings = shared;
  shared.push('mutated-via-run');
  assert.throws(
    () => assertCampaignBoundaryUnchanged(before, snapshotCampaignBoundary(state)),
    (err) => err instanceof Error && /ownedShips\[0\]\.fittings/.test(err.message),
  );
});

test('serializeData omits run while a survival run is live and keeps the same key set', () => {
  const adventure = populateCampaign(createGameState(31));
  const survival = populateCampaign(createGameState(31));
  const { bus } = (() => {
    const raw = createBus();
    const sessionBus = {
      on: raw.on.bind(raw),
      off: raw.off.bind(raw),
      once: raw.once.bind(raw),
      emit: raw.emit.bind(raw),
    };
    runSession.init({ state: survival, bus: sessionBus });
    return { bus: sessionBus };
  })();
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: 7 });
  assert.equal(survival.run.kind, 'survival');

  const adventureKeys = withSave(adventure, (s) => Object.keys(s.serializeData()));
  const survivalKeys = withSave(survival, (s) => {
    const data = s.serializeData();
    assert.ok(!Object.prototype.hasOwnProperty.call(data, 'run'));
    const planKeys = s._saveCapturePlan().map(([key]) => key);
    assert.ok(!planKeys.includes('run'));
    for (const key of REQUIRED_SAVE_KEYS) {
      assert.ok(Object.prototype.hasOwnProperty.call(data, key), `missing save key ${key}`);
    }
    assert.ok(Object.keys(data).length > 20);
    return Object.keys(data);
  });
  assert.deepEqual(survivalKeys, adventureKeys);
});

test('Adventure save payload is byte-identical across a survival run', () => {
  const { state, bus } = bootSession(32);
  const before = withSave(state, serializeAdventurePayload);
  driveSurvivalRun(bus, state);
  const after = withSave(state, serializeAdventurePayload);
  assert.equal(after, before);
});

test('loading a save resets a live survival run so campaign autosave is no longer suppressed', () => {
  const { state, bus } = bootSession(33);
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: 7 });
  assert.equal(state.run.kind, 'survival');
  withSave(state, (s) => {
    assert.equal(s._campaignAutosaveSuppressed(), true);
    bus.emit('save:restoring', { slot: 'manual' });
    assert.equal(state.run.kind, 'adventure');
    assert.equal(state.run.phase, 'inactive');
    assert.equal(s._campaignAutosaveSuppressed(), false);
  });
});

test('campaign autosave suppression is true only for a live survival run', () => {
  const live = populateCampaign(createGameState(34));
  withSave(live, (s) => {
    live.run = { ...live.run, kind: 'survival', phase: 'active' };
    assert.equal(s._campaignAutosaveSuppressed(), true);
  });

  const adventure = populateCampaign(createGameState(35));
  withSave(adventure, (s) => {
    assert.equal(adventure.run.kind, 'adventure');
    assert.equal(s._campaignAutosaveSuppressed(), false);
  });

  const inactiveSurvival = populateCampaign(createGameState(36));
  withSave(inactiveSurvival, (s) => {
    inactiveSurvival.run = { ...inactiveSurvival.run, kind: 'survival', phase: 'inactive' };
    assert.equal(s._campaignAutosaveSuppressed(), false);
  });

  const missing = populateCampaign(createGameState(37));
  delete missing.run;
  withSave(missing, (s) => {
    assert.equal(s._campaignAutosaveSuppressed(), false);
  });

  const nulled = populateCampaign(createGameState(38));
  nulled.run = null;
  withSave(nulled, (s) => {
    assert.equal(s._campaignAutosaveSuppressed(), false);
  });
});
