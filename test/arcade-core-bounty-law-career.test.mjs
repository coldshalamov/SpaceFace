import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { hash32 } from '../src/core/rng.js';
import { effectiveActivityForAI } from '../src/ai/doctrine.js';
import {
  HUNTER_LADDER_STEP_IDS,
  hunterCareerAccess,
} from '../src/careers/ladders/hunterLadderDefs.js';
import { activeBountyRumorOffer } from '../src/data/frontierRumors.js';
import { bountyHunt } from '../src/systems/bountyHunt.js';
import { economy } from '../src/systems/economy.js';
import { heat, majorCrimeStainsForState } from '../src/systems/heat.js';
import { missions } from '../src/systems/missions.js';
import { world } from '../src/systems/world.js';

const SECTOR_ID = 'sector_tethys_junction';
const BLACKMARKET_SECTOR_ID = 'sector_pallas_drift';
const BLACKMARKET_ID = 'station_smuggler';

function completedHunterSteps(count) {
  return Object.fromEntries(HUNTER_LADDER_STEP_IDS.map((id, index) => [id, {
    status: index < count ? 'completed' : 'locked',
  }]));
}

test('the live hunter ladder alone derives license, intel, and transponder rank', () => {
  const state = { careers: { ladders: { hunter: { steps: completedHunterSteps(0) } } } };
  assert.deepEqual(hunterCareerAccess(state), {
    id: 'provisional', label: 'Provisional Warrant', minSteps: 0,
    killTier: 1, captureTier: 1, intelTier: 0, transponder: false, completedSteps: 0,
  });
  state.careers.ladders.hunter.steps = completedHunterSteps(4);
  assert.deepEqual(hunterCareerAccess(state), {
    id: 'marshal', label: 'Warrant Marshal', minSteps: 4,
    killTier: 4, captureTier: 4, intelTier: 3, transponder: true, completedSteps: 4,
  });
});

test('posted-WANTED blackmarket quote and priceOf share welcoming terms without crossing spread', () => {
  const state = createGameState(48021);
  state.world.currentSectorId = BLACKMARKET_SECTOR_ID;
  state.player.heat = 0.5;
  state.player.heatZone = {
    active: true, sectorId: BLACKMARKET_SECTOR_ID, center: { x: 0, z: 0 }, radius: 1000,
    level: 3, outsideS: 0, clearAfterS: 600, noticeElapsedS: 45,
    bountyPosted: true, bountyPostedAt: 45,
  };
  const bus = createBus();
  const sys = Object.create(economy);
  sys.init({ state, bus, helpers: {} });
  sys.ensureMarket(BLACKMARKET_ID, 'blackmarket', 'M');

  const commodityId = 'cmdty_luxury_goods';
  const hotBuy = sys.quote(BLACKMARKET_ID, commodityId, 'buy', 1);
  const hotSell = sys.quote(BLACKMARKET_ID, commodityId, 'sell', 1);
  assert.equal(hotBuy.wantedBlackmarket, true);
  assert.equal(hotSell.wantedBlackmarket, true);
  assert.ok(hotSell.unitAvg < hotBuy.unitAvg, 'personal terms retain the blackmarket house edge');
  const hotPriceBuy = sys.priceOf(BLACKMARKET_ID, commodityId, 'buy');
  const hotPriceSell = sys.priceOf(BLACKMARKET_ID, commodityId, 'sell');
  assert.equal(hotPriceBuy, Math.max(1, Math.round(sys.getMarket(BLACKMARKET_ID)[commodityId].lastBuy * 0.94)));
  assert.ok(hotPriceSell <= hotPriceBuy, 'rounded readout cannot advertise a same-port profit');

  state.player.heatZone.bountyPosted = false;
  const coldBuy = sys.quote(BLACKMARKET_ID, commodityId, 'buy', 1);
  const coldSell = sys.quote(BLACKMARKET_ID, commodityId, 'sell', 1);
  const coldPriceBuy = sys.priceOf(BLACKMARKET_ID, commodityId, 'buy');
  const coldPriceSell = sys.priceOf(BLACKMARKET_ID, commodityId, 'sell');
  assert.ok(hotBuy.unitAvg < coldBuy.unitAvg);
  assert.ok(hotSell.unitAvg > coldSell.unitAvg);
  assert.ok(hotPriceBuy < coldPriceBuy && hotPriceSell > coldPriceSell,
    'the market readout uses the same fugitive terms as executable quotes');
  assert.ok(Math.abs(hotBuy.unitAvg / coldBuy.unitAvg - 0.94) < 1e-9);
});

test('accepted marshal warrant stamps exact intel, trick and a real deterministic flee target', () => {
  let seed = 1;
  while (hash32(seed, 'm_1', 'hunter-transponder') % 3 !== 0) seed++;
  const sim = createSimulation({ seed, systems: [missions], updateOrder: [] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  state.world.activeSector = { id: SECTOR_ID, stations: [], gates: [] };
  state.careers = { ladders: { hunter: { steps: completedHunterSteps(4) } } };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 20, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  state.missions.boards.station_tethys = {
    refreshEpoch: 0,
    slots: [{
      id: 'warrant-offer', type: 'bounty_hunt', stationId: 'station_tethys',
      factionId: null, reward_cr: 900, time_limit_s: 600, collateral_cr: 0,
      riskTier: 3, destStationId: 'station_tethys', destSectorId: SECTOR_ID,
      distance: 0, params: { clearCount: 1, targetStrength: 2, fValue: 2, taskTime: 60 },
      title: 'Licensed marshal warrant', brief: 'Exact quarry.', expiresAtEpoch: 1,
    }],
  };

  const sys = sim.registry.get('missions');
  assert.equal(sys.acceptMission('warrant-offer'), true);
  const mission = state.missions.active[0];
  const intel = mission.params.hunterIntel;
  assert.equal(intel.rankId, 'marshal');
  assert.ok(intel.knownFit && intel.knownFit.hull);
  assert.ok(intel.knownGimmick && intel.knownGimmick.id);
  assert.equal(intel.transponder, true);
  const target = state.entities.get(mission.targetEntityIds[0]);
  assert.ok(target && target.alive !== false, 'missions physically spawns the exact warrant target');
  assert.equal(target.data.bountyHunt.trickId, intel.knownGimmick.id);
  assert.equal(target.data.hunterTransponder, true);
  assert.equal(effectiveActivityForAI(target.data.ai).kind, 'flee',
    'the live tactical activity consumer sees a real flee order, not a UI badge');
  const contacts = [];
  sim.bus.on('mission:bountyTargetContacted', (payload) => contacts.push(payload));
  state.world.frontierRumors.byId[`frontier-rumor:bounty:${mission.id}`] = {
    id: `frontier-rumor:bounty:${mission.id}`, phase: 'rumored', kind: 'hunter',
    targetMissionId: mission.id, sectorId: SECTOR_ID,
  };
  target.pos.x = player.pos.x + 500;
  target.pos.z = player.pos.z;
  sys._armAcceptedCombatTargets(mission, state);
  assert.equal(contacts.length, 1, 'real target proximity publishes the exact rumor-resolution seam');
  assert.equal(contacts[0].targetEntityId, target.id);

  const low = createSimulation({ seed, systems: [missions], updateOrder: [] });
  low.state.careers = { ladders: { hunter: { steps: completedHunterSteps(0) } } };
  low.state.missions.boards.station_tethys = {
    refreshEpoch: 0,
    slots: [structuredClone(state.missions.active[0])],
  };
  low.state.missions.boards.station_tethys.slots[0].id = 'too-hot';
  low.state.missions.boards.station_tethys.slots[0].riskTier = 3;
  assert.equal(low.registry.get('missions').acceptMission('too-hot'), false,
    'risk-three authored bounty remains visible but cannot bypass the existing ladder license');
});

test('paid chatter belongs to the exact active warrant and resolves only on its physical contact', () => {
  const state = createGameState(48022);
  state.player.credits = 2000;
  state.missions.active.push({
    id: 'm_exact', type: 'bounty_hunt', status: 'active', destSectorId: SECTOR_ID,
    params: { hunterIntel: {
      intelTier: 2, lastSeen: 'Tethys traffic ledger',
      knownFit: { hull: 'Corsair Raider', weapons: ['wpn_railgun_m'] },
      knownGimmick: { id: 'mine-dropper', label: 'Mine Dropper' },
      transponder: false,
    } },
  });
  const offer = activeBountyRumorOffer(state, 'station_tethys');
  assert.equal(offer.targetMissionId, 'm_exact');
  assert.equal(offer.targetId, 'mission:m_exact');
  assert.match(offer.text, /Tethys traffic ledger/);
  assert.match(offer.text, /Mine Dropper/);

  const charged = [];
  const priorState = world.state;
  const priorBus = world.bus;
  try {
    world.state = state;
    world.bus = { emit(name, payload) { if (name === 'economy:chargeCredits') charged.push(payload); } };
    assert.equal(world._onPurchaseFrontierRumor({ rumorId: offer.id, stationId: 'station_tethys' }), true);
    assert.deepEqual(charged, [{ amount: offer.price, reason: `frontier-rumor:${offer.id}` }]);
    assert.equal(world._onBountyRumorContact({ missionId: 'other', sectorId: SECTOR_ID }), 0);
    assert.equal(world._onBountyRumorContact({ missionId: 'm_exact', sectorId: SECTOR_ID }), 1);
    assert.equal(state.world.frontierRumors.byId[offer.id].phase, 'resolved');
  } finally {
    world.state = priorState;
    world.bus = priorBus;
  }
});

test('Heat alone records station, third-convoy and active-hunter stains; lay-low keeps them and restitution settles them', () => {
  const sim = createSimulation({ seed: 48023, systems: [heat, bountyHunt], updateOrder: [] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 20, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  const kill = (entity, extra = {}) => bus.emit('entity:killed', {
    id: entity.id, killerId: player.id, victimClass: entity.type,
    factionId: entity.factionId, targetHostileToPlayer: false, ...extra,
  });

  const station = sim.spawn({
    type: 'station', team: 2, factionId: 'faction_scn', pos: { x: 100, z: 0 },
    vel: { x: 0, z: 0 }, radius: 80, mass: 10000, hull: 1, hullMax: 1,
    data: { sectorId: SECTOR_ID },
  });
  kill(station, { victimClass: 'station', factionLawful: true });
  for (let i = 0; i < 3; i++) {
    const convoy = sim.spawn({
      type: 'ship', team: 2, factionId: 'faction_mts', pos: { x: 150 + i, z: 0 },
      vel: { x: 0, z: 0 }, radius: 8, mass: 30, hull: 1, hullMax: 1,
      data: { sectorId: SECTOR_ID, ai: { spawnContext: 'convoy_civilian' } },
    });
    kill(convoy);
  }
  assert.deepEqual(majorCrimeStainsForState(state).map((row) => row.kind).sort(), [
    'station_destroyed', 'convoy_massacre',
  ].sort());

  const beforeHunter = state.player.heat;
  const hunter = sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_scn', pos: { x: 200, z: 0 },
    vel: { x: 0, z: 0 }, radius: 8, mass: 30, hull: 1, hullMax: 1,
    data: {
      contractTargetId: player.id,
      bountyHunt: { role: 'hunter', contractId: 'posted:hunter' },
    },
  });
  kill(hunter, { targetHostileToPlayer: true, factionLawful: true });
  assert.ok(state.player.heat > beforeHunter, 'killing the active warrant hunter worsens canonical heat');
  assert.equal(state.player.heatZone.bountyPosted, true);
  assert.equal(majorCrimeStainsForState(state).some((row) => row.kind === 'hunter_killed'), true);

  sim.registry.get('heat')._setHeat(0, 'escaped local search area');
  assert.equal(majorCrimeStainsForState(state, { activeOnly: true }).length, 3,
    'ordinary lay-low clears local WANTED but not deliberate crime history');
  bus.emit('heat:clear', { reason: 'restitution paid' });
  assert.equal(majorCrimeStainsForState(state).length, 3, 'records remain durable history');
  assert.equal(majorCrimeStainsForState(state, { activeOnly: true }).length, 0,
    'explicit restitution is the escape valve for active stain consequences');
});
