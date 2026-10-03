// NXI-169 — a shortage-backed board offer is only as live as the starvation that posted it.
// Accepting revalidates the destination yard's real hopper: a resolved shortage retires the
// stale offer instead of paying the scarcity premium — while accepted contracts and still-
// starving offers are untouched.
import test from 'node:test';
import assert from 'node:assert/strict';

import * as missionData from '../src/data/missions.js';
import { missions } from '../src/systems/missions.js';

class Bus {
  constructor() { this.handlers = new Map(); this.log = []; }
  on(name, fn) { const rows = this.handlers.get(name) || []; rows.push(fn); this.handlers.set(name, rows); }
  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
  of(name) { return this.log.filter((e) => e.name === name).map((e) => e.payload); }
}

// Ceres Refinery (type 'refinery', sector tier 1) runs recipe_refine_iron on cmdty_ore_iron:
// the leg is starving while stock/baseEq < 0.3.
function baseState({ oreFill = 0.02 } = {}) {
  return {
    meta: { seed: 169, playtimeS: 0 },
    seed: 169,
    tick: 0,
    simTime: 100,
    mode: 'flight',
    playerId: 1,
    player: {
      credits: 500000,
      researchPoints: 0,
      cargo: { items: {}, capVolume: 500, capMass: 500, usedVolume: 0, usedMass: 0 },
      stats: {},
    },
    missions: {
      boards: {},
      active: [],
      completedLog: [],
      receipts: [],
      nextId: 1,
      config: JSON.parse(JSON.stringify(missionData.MISSION_TUNING)),
    },
    story: { beatIndex: 2, branch: null, flags: {}, chainProgress: 0 },
    factions: { faction_scn: { rep: 500 }, faction_dmc: { rep: 300 } },
    world: { currentSectorId: 'sector_helios_prime', activeSector: { stations: [] } },
    economy: {
      markets: {
        station_ceres: { cmdty_ore_iron: { stock: Math.round(100 * oreFill), baseEq: 100 } },
      },
    },
    entities: new Map(),
    entityList: [],
    ui: { docked: false, dockedStationId: null, trackedMissionId: null },
    nav: {},
    settings: { gameplay: { tutorialHints: false } },
  };
}

function boot(state) {
  const bus = new Bus();
  const sys = { ...missions };
  sys.init({ state, bus, helpers: { voice: { say: () => true } }, registry: { get: () => null } });
  return { bus, sys };
}

let nextBoardOffer = 0;
function shortageOffer(over = {}) {
  return {
    id: 'mo_test_starved_' + (nextBoardOffer++),
    source: 'economyContract',
    type: 'cargo_delivery',
    stationId: 'station_helios',
    factionId: 'faction_dmc',
    destStationId: 'station_ceres',
    destSectorId: 'sector_ceres_belt',
    distance: 900,
    reward_cr: 9000,
    collateral_cr: 0,
    riskTier: 1,
    preloadedCargo: true,
    time_limit_s: 600,
    duration_s: 600,
    params: { cmdtyId: 'cmdty_ore_iron', qty: 10, cargoValue: 140, fValue: 1.0175, taskTime: 20, passengers: 0 },
    title: 'Yard feed run: 10u Iron Ore into Ceres Refinery (line starved)',
    summary: "Ceres Refinery's yard is starving for Iron Ore — its line is idling on an empty hopper.",
    cause: { tag: 'industry_starved', axis: 'pricePressure', line: 'the hopper is empty' },
    expiresAtEpoch: 4,
    storyTag: null,
    ...over,
  };
}

test('NXI-169: a resolved shortage retires its stale board offer at acceptance', () => {
  const state = baseState({ oreFill: 0.02 });
  const { bus, sys } = boot(state);
  const offer = shortageOffer();
  state.missions.boards.station_helios = { slots: [offer] };

  // The yard's hopper refills (NPC traffic, a prior sale) while the old board stays open.
  state.economy.markets.station_ceres.cmdty_ore_iron.stock = 400;

  const accepted = sys.acceptMission(offer.id);

  assert.equal(accepted, false, 'the stale relief run is not accepted');
  assert.deepEqual(state.missions.boards.station_helios.slots, [], 'the stale offer leaves the board');
  assert.equal(bus.of('mission:accepted').length, 0, 'no acceptance event fired');
  assert.equal(state.missions.active.length, 0, 'no contract went active');
  assert.equal(state.player.cargo.items.cmdty_ore_iron || 0, 0, 'no sealed cargo was loaded');
  assert.ok(bus.of('toast').some((t) => /relief|stale|no longer/i.test(t.text || '')), 'the player is told why');
});

test('NXI-169: a still-starving yard still takes its relief run (neighboring success)', () => {
  const state = baseState({ oreFill: 0.02 });
  const { bus, sys } = boot(state);
  const offer = shortageOffer();
  state.missions.boards.station_helios = { slots: [offer] };

  const accepted = sys.acceptMission(offer.id);

  assert.equal(accepted, true, 'the live relief run accepts normally');
  assert.equal(state.missions.active.length, 1, 'the contract went active');
  assert.equal(state.missions.active[0].params.cmdtyId, 'cmdty_ore_iron');
  assert.equal(state.player.cargo.items.cmdty_ore_iron, 10, 'the sealed manifest loaded');
  assert.equal(bus.of('mission:accepted').length, 1);
  assert.deepEqual(
    state.missions.boards.station_helios.slots.filter((o) => o.id === offer.id),
    [],
    'the accepted offer left the board',
  );
});

test('NXI-169 guardrail: an already-accepted delivery keeps its terms after the shortage resolves', () => {
  const state = baseState({ oreFill: 0.02 });
  const { bus, sys } = boot(state);
  const m = {
    id: 'm_feed',
    type: 'cargo_delivery',
    status: 'active',
    title: 'Yard feed run',
    factionId: 'faction_dmc',
    stationId: 'station_helios',
    destStationId: 'station_ceres',
    destSectorId: 'sector_ceres_belt',
    reward_cr: 9000,
    collateral_cr: 0,
    objectiveProgress: 0,
    objectiveTarget: 10,
    targetEntityIds: [],
    params: { cmdtyId: 'cmdty_ore_iron', qty: 10 },
    source: 'economyContract',
    cause: { tag: 'industry_starved', axis: 'pricePressure', line: 'the hopper was empty' },
    preloadedCargo: true,
  };
  state.missions.active.push(m);
  state.player.cargo.items.cmdty_ore_iron = 10;
  state.player.cargo.usedVolume = 10;

  // The hopper fully refills before the hauler arrives — the accepted contract is not reopened.
  state.economy.markets.station_ceres.cmdty_ore_iron.stock = 400;

  const grants = [];
  bus.on('economy:grantCredits', (p) => grants.push(p));

  bus.emit('dock:docked', { stationId: 'station_ceres' });

  assert.equal(m.status, 'completed', 'the accepted contract settles at the dock');
  const reward = grants.find((g) => g.reason === 'mission:m_feed');
  assert.ok(reward, 'a reward grant posted');
  assert.equal(reward.amount, 9000, 'its recorded terms pay — no retroactive cancel');
});
