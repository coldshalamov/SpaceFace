// research-grants — first-contact RP events pay once per durable record,
// through the missions sole-writer seam (PQ-155 follow-on).
import assert from 'node:assert/strict';
import test from 'node:test';

import { hash32, mulberry32 } from '../src/core/rng.js';
import { MISSION_TUNING, STORY_BEATS } from '../src/data/missions.js';
import { clauseById } from '../src/data/contractClauses.js';
import {
  RESEARCH_GRANTS,
  CLAUSE_HONOR_RP,
  RESEARCH_FIRSTS_CAP,
} from '../src/data/researchGrants.js';
import { contractClausesSystem } from '../src/systems/contractClauses.js';
import { missions } from '../src/systems/missions.js';

class Bus {
  constructor() {
    this.handlers = new Map();
    this.log = [];
  }
  on(name, fn) {
    const rows = this.handlers.get(name) || [];
    rows.push(fn);
    this.handlers.set(name, rows);
    return () => this.off(name, fn);
  }
  off(name, fn) {
    this.handlers.set(name, (this.handlers.get(name) || []).filter((entry) => entry !== fn));
  }
  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
}

function baseState() {
  return {
    meta: { seed: 47, playtimeS: 0 },
    seed: 47,
    tick: 0,
    simTime: 20,
    mode: 'flight',
    playerId: 1,
    player: {
      credits: 5000,
      researchPoints: 0,
      cargo: { items: {}, capVolume: 20, capMass: 20, usedVolume: 0, usedMass: 0 },
      stats: {},
    },
    missions: {
      boards: {},
      active: [],
      completedLog: [],
      receipts: [],
      nextId: 1,
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
  const bus = new Bus();
  const missionSystem = { ...missions };
  missionSystem.init({ state, bus, helpers: { hash32, mulberry32, voice: { say: () => true } } });
  return { state, bus, missionSystem };
}

function rpEvents(bus) {
  return bus.log.filter((entry) => entry.name === 'research:pointsChanged');
}

test('every RESEARCH_GRANTS event pays once per durable record', () => {
  const { state, bus } = boot();
  const cases = [
    ['anomaly:triangulated', { poiId: 'poi_alpha' }, { poiId: 'poi_beta' }],
    ['signal:investigated', { signalId: 'sig_1' }, { signalId: 'sig_2' }],
    ['scanner:ghostRevealed', { entityId: 42 }, { entityId: 43 }],
    ['uniqueWreck:resolved', { wreckId: 'wreck_a' }, { wreckId: 'wreck_b' }],
    ['claim:trophyHeadGranted', { aceId: 'ace_vex' }, { aceId: 'ace_mara' }],
  ];
  let expected = 0;
  for (const [event, first, second] of cases) {
    const spec = RESEARCH_GRANTS[event];
    bus.emit(event, first);
    expected += spec.rp;
    assert.equal(state.player.researchPoints, expected, `${event} first pays ${spec.rp}`);
    bus.emit(event, first); // same durable record: no second pay
    assert.equal(state.player.researchPoints, expected, `${event} repeat deduped`);
    bus.emit(event, second); // a different record pays again
    expected += spec.rp;
    assert.equal(state.player.researchPoints, expected, `${event} second record pays`);
  }
  const keys = Object.keys(state.player.researchFirsts);
  assert.equal(keys.length, cases.length * 2);
  assert.ok(keys.includes('anomaly:poi_alpha'));
  assert.ok(keys.includes('ace:ace_mara'));
  const last = rpEvents(bus).at(-1);
  assert.match(last.payload.source, /^first:claim:trophyHeadGranted$/);
});

test('missing or malformed dedup fields pay nothing and never throw', () => {
  const { state, bus } = boot();
  for (const event of Object.keys(RESEARCH_GRANTS)) {
    bus.emit(event, {});
    bus.emit(event, null);
    bus.emit(event, { unrelated: 'x' });
  }
  assert.equal(state.player.researchPoints, 0);
  assert.equal(state.player.researchFirsts, undefined, 'no ledger is created for empty grants');
});

test('researchFirsts survives a JSON save round-trip and stays bounded', () => {
  const { state, bus } = boot();
  bus.emit('anomaly:triangulated', { poiId: 'poi_persist' });
  const restored = JSON.parse(JSON.stringify(state.player.researchFirsts));
  state.player.researchFirsts = restored;
  bus.emit('anomaly:triangulated', { poiId: 'poi_persist' });
  assert.equal(state.player.researchPoints, RESEARCH_GRANTS['anomaly:triangulated'].rp,
    'a persisted first cannot pay twice');

  state.player.researchFirsts = {};
  for (let i = 0; i < RESEARCH_FIRSTS_CAP; i += 1) {
    state.player.researchFirsts[`anomaly:fill_${i}`] = i;
  }
  const before = state.player.researchPoints;
  bus.emit('anomaly:triangulated', { poiId: 'poi_newest' });
  assert.equal(state.player.researchPoints, before + RESEARCH_GRANTS['anomaly:triangulated'].rp,
    'a new first still pays at cap by evicting the oldest stamp');
  assert.equal(Object.keys(state.player.researchFirsts).length, RESEARCH_FIRSTS_CAP);
  assert.equal(state.player.researchFirsts['anomaly:fill_0'], undefined, 'oldest evicted');
});

test('B0 story reward pays the field-sample RP through the sole writer', () => {
  const { state, bus, missionSystem } = boot();
  const beat = STORY_BEATS[0];
  assert.ok(beat.reward.rp > 0, 'cold_start reward carries the field-sample RP');
  missionSystem._advanceStory(beat);
  assert.equal(state.player.researchPoints, beat.reward.rp);
  const granted = rpEvents(bus).find((entry) => entry.payload.source === `story:${beat.id}`);
  assert.ok(granted, 'story RP emits research:pointsChanged with a story source');
});

test('an honored contract clause pays fieldwork RP at settlement', () => {
  const clause = clauseById('cargo_intact');
  const offer = {
    id: 'offer_rp_clause',
    type: 'cargo_delivery',
    stationId: 'station_helios',
    factionId: 'faction_mts',
    params: { cmdtyId: 'cmdty_salvage_electronics', qty: 1 },
    reward_cr: 1000,
    collateral_cr: 0,
    riskTier: 1,
    destStationId: 'station_beltout',
    destSectorId: 'sector_ceres_belt',
    distance: 1200,
    title: 'RP clause check',
    summary: 'x',
    source: 'careerContract',
    preloadedCargo: true,
    clauses: [{
      id: clause.id, event: clause.event, label: clause.label,
      prose: clause.prose, rewardMult: clause.rewardMult,
    }],
  };
  const state = baseState();
  state.missions.boards[offer.stationId] = { refreshEpoch: 0, slots: [offer] };
  const bus = new Bus();
  const missionSystem = { ...missions };
  const clauseSystem = { ...contractClausesSystem };
  missionSystem.init({ state, bus, helpers: { hash32, mulberry32, voice: { say: () => true } } });
  clauseSystem.init({ state, bus, helpers: { hash32, mulberry32, voice: { say: () => true } } });

  bus.emit('ui:acceptMission', { missionId: offer.id });
  assert.equal(state.missions.active.length, 1);
  bus.emit('dock:docked', { stationId: offer.destStationId });
  assert.equal(state.missions.active.length, 0);
  const honor = bus.log.find((entry) => entry.name === 'contract:clauseHonored');
  assert.ok(honor, 'clause honored at settlement');
  const rpEvent = rpEvents(bus).find((entry) => entry.payload.source === 'clause_honor');
  assert.ok(rpEvent, 'clause honor emits an RP grant');
  assert.equal(rpEvent.payload.granted, CLAUSE_HONOR_RP);
  assert.equal(state.player.researchPoints, CLAUSE_HONOR_RP);
  clauseSystem.destroy();
});

test('recon_scan settlement pays the widened tier-scaled RP', () => {
  const offer = {
    id: 'offer_rp_recon',
    type: 'recon_scan',
    stationId: 'station_helios',
    factionId: 'faction_mts',
    params: { scanTargets: 1 },
    reward_cr: 500,
    collateral_cr: 0,
    riskTier: 2,
    destStationId: 'station_beltout',
    destSectorId: 'sector_ceres_belt',
    distance: 800,
    title: 'RP recon check',
    summary: 'x',
    source: 'careerContract',
  };
  const state = baseState();
  state.missions.boards[offer.stationId] = { refreshEpoch: 0, slots: [offer] };
  state.world.currentSectorId = 'sector_ceres_belt';
  const bus = new Bus();
  const missionSystem = { ...missions };
  missionSystem.init({ state, bus, helpers: { hash32, mulberry32, voice: { say: () => true } } });
  bus.emit('ui:acceptMission', { missionId: offer.id });
  const active = state.missions.active.find((m) => m.sourceOfferId === offer.id || m.title === offer.title);
  assert.ok(active, 'recon mission accepted');
  bus.emit('scan:completed', { targetId: null, sectorId: 'sector_ceres_belt', found: {} });
  assert.equal(state.missions.active.includes(active), false, 'one scan completes a 1-target recon');
  const rpEvent = rpEvents(bus).find((entry) => !entry.payload.source);
  assert.ok(rpEvent, 'mission settlement emits an RP grant');
  assert.equal(state.player.researchPoints, 4 + offer.riskTier * 2,
    'recon_scan pays 4 + 2*riskTier at settlement');
});
