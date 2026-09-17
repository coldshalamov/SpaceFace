// daily-featured — one rolled offer per station per UTC day bucket pays the featured premium.
// The pick is deterministic inside (day key, station, epoch, world seed); the mark rides the
// offer through accept → active → settlement, where it adds a small standing bonus. Retained
// and authored rows are never repriced.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { hash32 } from '../src/core/rng.js';
import { mulberry32 } from '../src/core/rng.js';
import { MISSION_TUNING } from '../src/data/missions.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { missionDossierHtml } from '../src/ui/station/screens/contracts.js';

const STATION = 'station_helios';
const DAY_A = '2026-03-04';
const DAY_B = '2026-03-05';

function boardFor(seed, dayKey, simTime = 0) {
  const sim = createSimulation({ seed, systems: [missionsProto], updateOrder: [] });
  const sys = sim.registry.get('missions');
  sys._dayKey = () => dayKey;
  sim.state.simTime = simTime;
  const board = structuredClone(sys.ensureBoard(STATION));
  sim.dispose();
  return board;
}

test('each station board marks exactly one featured offer, deterministic inside the day', () => {
  for (let seed = 1; seed <= 24; seed++) {
    const simTime = (seed % 5) * 601;
    const first = boardFor(seed, DAY_A, simTime);
    const replay = boardFor(seed, DAY_A, simTime);
    assert.deepEqual(replay, first, `seed ${seed} featured pick must replay inside the day`);
    const marked = first.slots.filter((o) => o && o.featured);
    assert.equal(marked.length, 1, `seed ${seed} carries exactly one featured offer`);
    const pick = marked[0];
    assert.equal(pick.featured.dayKey, DAY_A);
    assert.equal(pick.featured.rewardMult, MISSION_TUNING.featured.rewardMult);
    assert.equal(pick.featured.repBonus, MISSION_TUNING.featured.repBonus);
    assert.equal(pick.reward_cr,
      Math.round(pick.featured.baseRewardCr * MISSION_TUNING.featured.rewardMult),
      'the board shows the boosted figure, not a tooltip fiction');
    assert.ok(!pick.storyTag && !pick.source, 'featured only ever marks a plain procedural roll');
  }
});

test('the day key is a hash input: a different day re-picks without touching older marks', () => {
  const a = boardFor(7, DAY_A, 0);
  const b = boardFor(7, DAY_B, 0);
  assert.equal(a.slots.find((o) => o.featured).featured.dayKey, DAY_A);
  assert.equal(b.slots.find((o) => o.featured).featured.dayKey, DAY_B);
  // Same underlying offers — only the mark moves (or lands on the same slot by chance).
  for (const [i, offer] of b.slots.entries()) {
    const prev = a.slots[i];
    if (!prev || offer.id !== prev.id) continue;
    assert.equal(offer.reward_cr,
      offer.featured ? Math.round(offer.featured.baseRewardCr * offer.featured.rewardMult)
        : prev.featured ? prev.featured.baseRewardCr : prev.reward_cr,
      'a non-featured roll is never silently repriced');
  }
});

function baseState() {
  return {
    tick: 0,
    simTime: 0,
    meta: { seed: 47, playtimeS: 0 },
    playerId: 1,
    player: {
      credits: 5000,
      researchPoints: 0,
      cargo: { items: {}, capVolume: 20, capMass: 20, usedVolume: 0, usedMass: 0 },
      stats: {},
    },
    missions: {
      boards: {}, active: [], completedLog: [], receipts: [], nextId: 1,
      config: JSON.parse(JSON.stringify(MISSION_TUNING)),
    },
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    factions: {},
    world: { currentSectorId: 'sector_helios_prime', activeSector: { stations: [] } },
    entities: new Map(),
    entityList: [],
    ui: { docked: false, dockedStationId: null, trackedMissionId: null },
    nav: {},
    settings: { gameplay: { tutorialHints: false } },
  };
}

function boot() {
  const state = baseState();
  const bus = createBus();
  const log = [];
  bus.log = log;
  const origEmit = bus.emit.bind(bus);
  bus.emit = (name, payload) => { log.push({ name, payload }); return origEmit(name, payload); };
  const missionSystem = { ...missionsProto };
  missionSystem.init({ state, bus, helpers: { hash32, mulberry32, voice: { say: () => true } } });
  return { state, bus, missionSystem };
}

function featuredOffer(over = {}) {
  return {
    id: 'offer_featured_1',
    type: 'cargo_delivery',
    stationId: STATION,
    factionId: 'faction_mts',
    params: { cmdtyId: 'cmdty_salvage_electronics', qty: 1 },
    reward_cr: 1750,
    collateral_cr: 0,
    riskTier: 1,
    destStationId: 'station_beltout',
    destSectorId: 'sector_ceres_belt',
    distance: 1200,
    title: 'Featured delivery',
    summary: 'x',
    preloadedCargo: true,
    featured: { dayKey: DAY_A, rewardMult: 1.75, repBonus: 3, baseRewardCr: 1000 },
    ...over,
  };
}

test('the mark rides accept → settlement: boosted credits pay and the rep bonus posts', () => {
  const { state, bus } = boot();
  const offer = featuredOffer();
  state.missions.boards[offer.stationId] = { refreshEpoch: 0, slots: [offer] };

  bus.emit('ui:acceptMission', { missionId: offer.id });
  assert.equal(state.missions.active.length, 1);
  const active = state.missions.active[0];
  assert.equal(active.featured.dayKey, DAY_A, 'the instance carries the mark');
  assert.equal(active.featured.baseRewardCr, 1000);

  bus.emit('dock:docked', { stationId: offer.destStationId });
  assert.equal(state.missions.active.length, 0);

  const grant = bus.log.find((e) => e.name === 'economy:grantCredits'
    && e.payload.reason === `mission:${active.id}`);
  assert.equal(grant.payload.amount, 1750, 'the boosted figure is the paid figure');

  const completed = bus.log.find((e) => e.name === 'mission:completed');
  assert.equal(completed.payload.featured.dayKey, DAY_A);
  assert.equal(completed.payload.featured.repBonus, 3);
  // cargo_delivery BASE_REP 3 at risk 1 → round(3 * 1.4) = 4, + 3 featured = 7 → repMult 7/15.
  assert.equal(Math.round(completed.payload.repMult * 15), 7,
    'repMult sizes so factions apply the spec rep plus the featured bonus');

  const receipt = state.missions.receipts.at(-1);
  assert.equal(receipt.repDelta, 7, 'the receipt audits the boosted standing');
});

test('a plain offer keeps the spec rep and no featured mark on the wire', () => {
  const { state, bus } = boot();
  const offer = featuredOffer({ id: 'offer_plain_1', reward_cr: 1000 });
  delete offer.featured;
  state.missions.boards[offer.stationId] = { refreshEpoch: 0, slots: [offer] };
  bus.emit('ui:acceptMission', { missionId: offer.id });
  bus.emit('dock:docked', { stationId: offer.destStationId });
  const completed = bus.log.find((e) => e.name === 'mission:completed');
  assert.equal(completed.payload.featured, undefined);
  assert.equal(Math.round(completed.payload.repMult * 15), 4);
});

test('the dossier explains the premium terms', () => {
  const { state } = boot();
  const html = missionDossierHtml(featuredOffer(), state, { origin: 'Helios' });
  assert.match(html, /Featured/);
  assert.match(html, /×1\.75/);
  assert.match(html, /\+3 rep/);
  const plain = missionDossierHtml(
    featuredOffer({ id: 'x', featured: undefined, title: 'Ordinary haul' }), state, {});
  assert.doesNotMatch(plain, /Featured/);
});
