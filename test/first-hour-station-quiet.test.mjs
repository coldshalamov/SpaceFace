// ONEVOICE-STATION-QUIET-IMPL
// While onboarding is active, ambient station broadcasts and nonessential
// economy-news voice stay silent (spec2/00 one-voice + first-hour B4 dock).
// Durable economy state / field offers still land; speech resumes after tutorial.
//
// Production surfaces only:
//   src/systems/stationBroadcast.js
//   src/systems/economyContracts.js
//
// Run:
//   node --test test/first-hour-station-quiet.test.mjs
// Adjacent checks (not modified by this lane):
//   npm run check:station-broadcast
//   npm run check:economy-born-missions
//   npm run check:first-hour

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  stationBroadcast,
  STATION_BROADCASTS,
  isOnboardingActive as broadcastOnboardingActive,
} from '../src/systems/stationBroadcast.js';
import {
  economyContracts,
  isOnboardingActive as contractsOnboardingActive,
  isStationEpochEvaluated,
  ensureFieldContractState,
} from '../src/systems/economyContracts.js';
import { SECTORS } from '../src/data/sectors.js';

const HOME = SECTORS.find((s) => (s.stations || []).length > 0);
assert.ok(HOME, 'catalog has a sector with stations');
const STATION = HOME.stations[0];

// ── fixtures ───────────────────────────────────────────────────────────────────────────────────

function makeBus() {
  const handlers = new Map();
  const emitLog = [];
  return {
    emitLog,
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off(evt, fn) {
      const list = handlers.get(evt) || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    emit(evt, payload) {
      emitLog.push({ evt, payload });
      for (const fn of (handlers.get(evt) || []).slice()) fn(payload);
    },
  };
}

function makeBroadcastCtx({ onboarding = null } = {}) {
  const bus = makeBus();
  const sayCalls = [];
  const tics = [];
  bus.on('station:broadcastTic', (p) => tics.push(p));
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 } };
  const station = {
    id: 2, type: 'station', alive: true, pos: { x: 100, z: 0 },
    data: { stationId: 'station_test', stationTypeId: 'refinery', factionId: 'faction_dmc' },
  };
  const state = {
    mode: 'flight',
    simTime: 100,
    playerId: 1,
    entities: new Map([[1, player], [2, station]]),
    entityList: [player, station],
    onboarding: onboarding,
  };
  const arbQueue = { active: null, pending: [] };
  const ctx = {
    bus,
    state,
    helpers: { voice: { say(msg) { sayCalls.push(msg); return true; } } },
    registry: { get(name) { return name === 'voiceArbiter' ? { queue: arbQueue } : null; } },
  };
  return { ctx, bus, state, sayCalls, tics, arbQueue };
}

function fieldNode({ pricePressure = 0.32, priceTag = 'route_scarcity' } = {}) {
  return {
    danger: 0.2,
    pricePressure,
    influence: { faction_scn: 0.4, faction_mts: 0.3, faction_reach: 0.3 },
    dominantFactionId: 'faction_scn',
    dominantInfluence: 0.4,
    contestMargin: 0.1,
    trend: { danger: 0, pricePressure: 0, influence: 0 },
    driver: { danger: 'structural_baseline', pricePressure: priceTag, influence: 'territorial_anchor' },
  };
}

function makeContractState({ onboarding = null, seed = 7, simTime = 100 } = {}) {
  const player = { id: 1, type: 'ship', alive: true, team: 1, pos: { x: 0, z: 0 } };
  return {
    mode: 'flight',
    simTime,
    playerId: 1,
    meta: { seed },
    world: { currentSectorId: HOME.id, sectors: {} },
    entities: new Map([[1, player]]),
    entityList: [player],
    player: {
      credits: 50000,
      researchPoints: 0,
      stats: {},
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 500, capMass: 500 },
    },
    factions: { [STATION.factionId || HOME.factionId]: { rep: 50 } },
    nav: {},
    ui: {},
    onboarding,
    sectorSim: {
      field: {
        version: 1,
        epochDays: 2,
        nodes: { [HOME.id]: fieldNode() },
      },
      sectors: {},
      meta: {},
    },
  };
}

function makeVoice() {
  const calls = [];
  return { calls, say(m) { calls.push(m); return true; } };
}

function freshContracts() {
  return { ...economyContracts };
}

function freshBroadcast() {
  // Shared module singleton — always re-init against a fresh ctx; destroy after.
  return stationBroadcast;
}

// ── isOnboardingActive helpers ─────────────────────────────────────────────────────────────────

test('isOnboardingActive is true only while active and not finished', () => {
  assert.equal(broadcastOnboardingActive(null), false);
  assert.equal(contractsOnboardingActive(null), false);
  assert.equal(broadcastOnboardingActive({}), false);
  assert.equal(broadcastOnboardingActive({ onboarding: { active: true, finished: false } }), true);
  assert.equal(contractsOnboardingActive({ onboarding: { active: true, finished: false } }), true);
  assert.equal(broadcastOnboardingActive({ onboarding: { active: false, finished: true } }), false);
  assert.equal(broadcastOnboardingActive({ onboarding: { active: true, finished: true } }), false);
  assert.equal(broadcastOnboardingActive({ onboarding: { active: false, finished: false } }), false);
});

// ── stationBroadcast quiet during onboarding ───────────────────────────────────────────────────

test('stationBroadcast speaks near a station when onboarding is idle', () => {
  const sys = freshBroadcast();
  const { ctx, sayCalls, tics } = makeBroadcastCtx({ onboarding: null });
  sys.init(ctx);
  sys._tick();
  assert.equal(sayCalls.length, 1, 'ambient line fires when tutorial is idle');
  assert.equal(sayCalls[0].channel, 'ambient');
  assert.ok(STATION_BROADCASTS.refinery.lines.includes(sayCalls[0].text));
  assert.equal(tics.length, 1, 'cosmetic tic rides with the spoken line');
  sys.destroy();
});

test('stationBroadcast is silent while onboarding is active', () => {
  const sys = freshBroadcast();
  const { ctx, sayCalls, tics } = makeBroadcastCtx({
    onboarding: { active: true, finished: false },
  });
  sys.init(ctx);
  sys._tick();
  assert.equal(sayCalls.length, 0, 'no ambient line while tutorial owns the channel');
  assert.equal(tics.length, 0, 'no broadcast tic while tutorial owns the channel');
  sys.destroy();
});

test('stationBroadcast resumes after tutorial completion', () => {
  const sys = freshBroadcast();
  const { ctx, state, sayCalls, tics } = makeBroadcastCtx({
    onboarding: { active: true, finished: false },
  });
  sys.init(ctx);
  sys._tick();
  assert.equal(sayCalls.length, 0, 'quiet during tutorial');

  // Tutorial complete — either finished flag or active cleared (live onboarding does both).
  state.onboarding = { active: false, finished: true };
  sys._tick();
  assert.equal(sayCalls.length, 1, 'ambient speech resumes after tutorial completion');
  assert.equal(sayCalls[0].channel, 'ambient');
  assert.equal(tics.length, 1);
  sys.destroy();
});

// ── economyContracts: durable offer, quiet news during onboarding ──────────────────────────────

test('economyContracts still posts field offers while onboarding is active', () => {
  const bus = makeBus();
  const voice = makeVoice();
  const state = makeContractState({ onboarding: { active: true, finished: false } });
  const sys = freshContracts();
  sys.init({ bus, state, helpers: { voice } });
  bus.emit('dock:docked', { stationId: STATION.id });

  const offers = bus.emitLog.filter((e) => e.evt === 'mission:offered');
  assert.equal(offers.length, 1, 'durable mission:offered still emits during onboarding');
  assert.equal(offers[0].payload.source, 'economyContract');
  assert.equal(offers[0].payload.cause.tag, 'route_scarcity');

  const own = ensureFieldContractState(state);
  assert.equal(
    isStationEpochEvaluated(own, STATION.id, 0),
    true,
    'station-epoch dedupe bag is marked (durable economy state)',
  );
});

test('economyContracts suppresses news voice and toast at first dock while onboarding is active', () => {
  const bus = makeBus();
  const voice = makeVoice();
  const state = makeContractState({ onboarding: { active: true, finished: false } });
  const sys = freshContracts();
  sys.init({ bus, state, helpers: { voice } });
  bus.emit('dock:docked', { stationId: STATION.id });

  assert.equal(voice.calls.length, 0, 'no news voice during onboarding first dock');
  const toasts = bus.emitLog.filter((e) => e.evt === 'toast');
  assert.equal(toasts.length, 0, 'no fallback toast during onboarding first dock');
  // Offer still present (voice-only suppress).
  assert.equal(bus.emitLog.filter((e) => e.evt === 'mission:offered').length, 1);
});

test('economyContracts resumes news voice after tutorial completion', () => {
  const bus = makeBus();
  const voice = makeVoice();
  // Post-tutorial: finished + inactive (matches live onboarding tear-down).
  const state = makeContractState({
    onboarding: { active: false, finished: true },
    simTime: 100,
  });
  const sys = freshContracts();
  sys.init({ bus, state, helpers: { voice } });
  bus.emit('dock:docked', { stationId: STATION.id });

  assert.equal(bus.emitLog.filter((e) => e.evt === 'mission:offered').length, 1);
  assert.equal(voice.calls.length, 1, 'news line fires after tutorial completion');
  assert.equal(voice.calls[0].channel, 'news');
  assert.equal(voice.calls[0].kind, 'contract');
});

test('economyContracts news suppress does not change offer payload shape', () => {
  const run = (onboarding) => {
    const bus = makeBus();
    const voice = makeVoice();
    const state = makeContractState({ onboarding, seed: 11, simTime: 100 });
    const sys = freshContracts();
    sys.init({ bus, state, helpers: { voice } });
    bus.emit('dock:docked', { stationId: STATION.id });
    const offer = bus.emitLog.find((e) => e.evt === 'mission:offered');
    assert.ok(offer, 'offer present');
    return { offer: offer.payload, voiceCount: voice.calls.length };
  };

  const quiet = run({ active: true, finished: false });
  const loud = run({ active: false, finished: true });
  assert.deepStrictEqual(
    quiet.offer,
    loud.offer,
    'onboarding voice gate must not alter the durable offer (sim outcomes unchanged)',
  );
  assert.equal(quiet.voiceCount, 0);
  assert.equal(loud.voiceCount, 1);
});
