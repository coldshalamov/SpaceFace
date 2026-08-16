import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { hash32 } from '../src/core/rng.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { economy } from '../src/systems/economy.js';
import {
  createCycle,
  deserializeCycles,
  serializeCycles,
} from '../src/systems/economyCycles.js';
import { createMarketNews, generateHeadline } from '../src/ui/marketNews.js';

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function samplePersonality(stationType, seed = 0x5face, count = 512) {
  const rng = mulberry32(seed);
  const def = COMMODITIES.find((entry) => entry.id === 'cmdty_refined_metals');
  const counts = {};
  for (let index = 0; index < count; index++) {
    const regime = createCycle(rng, def, index * 6000, stationType).regime;
    counts[regime] = (counts[regime] || 0) + 1;
  }
  return counts;
}

function boot() {
  const bus = createBus();
  const state = {
    mode: 'flight', simTime: 0, meta: { seed: 0x5face },
    player: {
      credits: 10000,
      cargo: { items: {}, capVolume: 100, usedVolume: 0 },
      marketMemory: {}, tradeLedger: [], tradeLots: {},
    },
    economy: {}, conflicts: {}, sectorSim: { field: { nodes: {} } },
    world: { currentSectorId: 'sector_helios_prime', sectors: {} },
    ui: {}, nav: {}, entities: new Map(), entityList: [],
  };
  const econ = { ...economy };
  econ.init({ state, bus, helpers: {}, registry: { get: () => null } });
  econ.newGame();
  const voices = [];
  const news = createMarketNews({
    bus,
    state,
    helpers: { voice: { say(payload) { voices.push(payload); return true; } } },
  });
  return { bus, state, econ, news, voices };
}

function keepStationCyclesAlive(state, stationId) {
  for (const cycle of Object.values(state.economy.cycles[stationId] || {})) {
    cycle.regimeEndT = 100000;
  }
}

test('station families produce deterministic, visibly different dominant curve grammars', () => {
  const refinery = samplePersonality('refinery');
  const mining = samplePersonality('mining');
  const blackmarket = samplePersonality('blackmarket');
  const research = samplePersonality('research');

  assert.deepEqual(refinery, samplePersonality('refinery'), 'same seed and station family replay exactly');
  assert.ok(refinery.sine > refinery.rising && refinery.sine > refinery.volatile,
    `refinery rhythm should dominate ${JSON.stringify(refinery)}`);
  assert.ok((mining.rising + mining.falling) > (mining.stable + mining.sine),
    `mining should be dominated by directional supply runs ${JSON.stringify(mining)}`);
  assert.ok((blackmarket.volatile + blackmarket.turbulent) > (blackmarket.stable + blackmarket.sine),
    `black markets should be dominated by choppy families ${JSON.stringify(blackmarket)}`);
  assert.ok((research.cubic + research.sqrt + research.log) > (research.stable + research.sine),
    `research boards should favor non-linear curves ${JSON.stringify(research)}`);
});

test('a live local regime transition reaches the existing market news feed and survives cycle save/load', () => {
  const t = boot();
  const transitions = [];
  t.bus.on('economy:regimeChanged', (payload) => transitions.push(payload));
  try {
    const stationId = 'station_helios';
    const commodityId = 'cmdty_refined_metals';
    keepStationCyclesAlive(t.state, stationId);
    const outgoing = t.state.economy.cycles[stationId][commodityId];
    Object.assign(outgoing, {
      regime: 'stable', family: 'stable', regimeStartT: -1600, regimeEndT: 0,
      phase: 0, frequency: 0.01, amplitude: 0.05, bias: 0,
      slope: 0, a: 0, b: 0, c: 0, amp2: 0, amp3: 0,
    });

    t.bus.emit('dock:docked', { stationId });
    t.state.simTime = 5;
    t.econ.econTick(5, t.state);

    assert.equal(transitions.length, 1, 'one expired local formula produces one explained transition');
    const transition = transitions[0];
    assert.equal(transition.stationId, stationId);
    assert.equal(transition.stationType, 'trade_hub');
    assert.equal(transition.commodityId, commodityId);
    assert.equal(transition.previousRegime, 'stable');
    assert.ok(transition.eventId.startsWith(`regime:${stationId}:${commodityId}:`));

    const expected = generateHeadline({
      type: 'regime', kind: 'regime', regime: transition.regime,
      stationId, commodityId, eventId: transition.eventId,
    }, { seed: hash32(t.state.meta.seed) >>> 0 });
    assert.equal(t.news.getLog().length, 1);
    assert.equal(t.news.getLog()[0].text, expected);
    assert.deepEqual(t.voices, [{ channel: 'news', text: expected, kind: 'regime' }]);

    const savedCycles = serializeCycles(t.state);
    const restored = { economy: { cycles: {} } };
    deserializeCycles(restored, savedCycles);
    assert.deepEqual(
      restored.economy.cycles[stationId][commodityId],
      t.state.economy.cycles[stationId][commodityId],
      'the personality-selected live formula and its continuity blend survive save/load exactly',
    );

    t.econ.ensureMarket('station_ceres', 'refinery', 'M');
    keepStationCyclesAlive(t.state, 'station_ceres');
    const remote = t.state.economy.cycles.station_ceres[commodityId];
    remote.regimeStartT = -1600;
    remote.regimeEndT = 5;
    t.state.simTime = 10;
    t.econ.econTick(5, t.state);
    assert.equal(transitions.length, 1, 'remote market changes do not become galaxy-wide news spam');
    assert.equal(t.news.getLog().length, 1);
  } finally {
    t.news.destroy();
    economy._instance = null;
  }
});
