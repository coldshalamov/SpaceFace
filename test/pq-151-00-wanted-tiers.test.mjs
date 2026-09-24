// PQ-151.00 — four WANTED tiers named from existing heat levels; scan slips the
// search zone; bounty posts a hunter that arrives from a reserve point (no teleport).
import assert from 'node:assert/strict';
import test from 'node:test';

import { physics } from '../src/core/physics.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { reserveArrivalPoint } from '../src/law/authorityResponse.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { bountyHunt } from '../src/systems/bountyHunt.js';
import { flightV3 } from '../src/systems/flightV3.js';
import {
  heat,
  heatLevelFor,
  wantedTierFor,
  wantedTierInfo,
  WANTED_TIER,
  WANTED_TIER_INFO,
  THRESHOLD,
} from '../src/systems/heat.js';
import { lawSecurity, wantedWarrantFor } from '../src/systems/lawSecurity.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { actions } from '../src/systems/actions.js';

const SEED_SCAN = 15100;
const SEED_BOUNTY = 15102;
const SECTOR = 'sector_helios_prime';

function boot(seed, systems = [heat, lawSecurity, bountyHunt, spawnBudget]) {
  const sim = createSimulation({ seed, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  if (!state.world.sectors) state.world.sectors = {};
  state.world.sectors[SECTOR] = { id: SECTOR, factionId: 'faction_scn', security: 0.9, tier: 0 };
  state.player.heat = 0;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  const changes = [];
  bus.on('heat:changed', (p) => changes.push(p));
  const warrants = [];
  bus.on('law:wantedWarrantPosted', (p) => warrants.push(p));
  return {
    sim, state, bus, player, changes, warrants,
    heat: sim.registry.get('heat'),
    law: sim.registry.get('lawSecurity'),
    hunt: sim.registry.get('bountyHunt'),
  };
}

function killCivilian(bus, state, id = 404) {
  bus.emit('entity:killed', {
    id,
    killerId: state.playerId,
    type: 'ship',
    victimClass: 'ship',
    factionId: 'faction_free',
    factionLawful: false,
    targetHostileToPlayer: false,
  });
}

function killLawman(bus, state, id = 505) {
  bus.emit('entity:killed', {
    id,
    killerId: state.playerId,
    type: 'ship',
    victimClass: 'ship',
    factionId: 'faction_scn',
    factionLawful: true,
    targetHostileToPlayer: false,
  });
}

function liveHunters(state) {
  return (state.entityList || []).filter((e) => (
    e && e.alive !== false && e.data && e.data.bountyHunt && e.data.bountyHunt.role === 'hunter'
  ));
}

test('four WANTED tiers are named from existing heat levels', () => {
  assert.equal(wantedTierFor(0), WANTED_TIER.NONE);
  assert.equal(wantedTierFor(THRESHOLD - 0.01), WANTED_TIER.NONE);
  assert.equal(wantedTierFor(THRESHOLD), WANTED_TIER.SCAN);
  assert.equal(heatLevelFor(THRESHOLD), 1);
  assert.equal(wantedTierFor(0.20), WANTED_TIER.SCAN);
  assert.equal(wantedTierFor(0.21), WANTED_TIER.BOUNTY);
  assert.equal(heatLevelFor(0.21), 2);
  assert.equal(wantedTierFor(0.40), WANTED_TIER.BOUNTY);
  assert.equal(wantedTierFor(0.41), WANTED_TIER.NETS);
  assert.equal(wantedTierFor(0.80), WANTED_TIER.NETS);
  assert.equal(wantedTierFor(0.81), WANTED_TIER.IMPOUND);
  assert.equal(wantedTierFor(1), WANTED_TIER.IMPOUND);

  assert.equal(WANTED_TIER_INFO.scan.label, 'fine/scan');
  assert.equal(WANTED_TIER_INFO.bounty.label, 'bounty/hunters');
  assert.equal(WANTED_TIER_INFO.nets.label, 'nets/wedges');
  assert.equal(WANTED_TIER_INFO.impound.label, 'impound/heist');
  assert.equal(WANTED_TIER_INFO.scan.escape, 'leave_search_zone');
  assert.equal(WANTED_TIER_INFO.bounty.escape, 'leave_search_zone');
  assert.equal(WANTED_TIER_INFO.scan.playable, true);
  assert.equal(WANTED_TIER_INFO.bounty.playable, true);
  assert.equal(WANTED_TIER_INFO.nets.playable, true, 'nets/wedges is a posted checkpoint with a physical break');
  assert.equal(WANTED_TIER_INFO.impound.playable, true, 'impound/heist is a yard with pay, work, and steal-back');
});

test(`seed ${SEED_SCAN}: scan-tier escape is leave the search zone so heat drops`, () => {
  const { sim, state, player, changes } = boot(SEED_SCAN);
  killCivilian(sim.bus, state);

  assert.ok(state.player.heat >= THRESHOLD, `civilian kill heat ${state.player.heat} must cross WANTED`);
  assert.equal(state.player.wantedTier, WANTED_TIER.SCAN);
  assert.equal(wantedTierFor(state.player.heat), WANTED_TIER.SCAN);
  assert.equal(state.player.heatZone.active, true);
  assert.ok(state.player.heatZone.radius > 0);
  assert.equal(changes.at(-1).tier, WANTED_TIER.SCAN);
  assert.equal(changes.at(-1).escape, 'leave_search_zone');
  assert.equal(liveHunters(state).length, 0, 'scan band must not post a hunter');

  const raised = state.player.heat;
  player.pos.x = state.player.heatZone.center.x + state.player.heatZone.radius + 80;
  player.pos.z = state.player.heatZone.center.z;
  const waitS = (state.player.heatZone.clearAfterS || 5) + 1;
  for (let i = 0; i < Math.ceil(waitS / SIM_DT); i++) sim.step();

  assert.ok(state.player.heat < raised, 'leaving the search zone must drop heat');
  assert.equal(state.player.heat, 0, 'scan-tier escape clears the one-level search');
  assert.equal(state.player.wantedTier, WANTED_TIER.NONE);
  assert.equal(state.player.heatZone.active, false);
  sim.dispose();
});

test(`seed ${SEED_BOUNTY}: bounty-tier posts a hunter that arrives from a reserve point`, () => {
  const { sim, state, player, changes, warrants } = boot(SEED_BOUNTY);
  killLawman(sim.bus, state);
  sim.step();
  if (sim.registry.get('bountyHunt')) sim.registry.get('bountyHunt').update(SIM_DT, state);

  assert.equal(state.player.wantedTier, WANTED_TIER.BOUNTY);
  assert.equal(wantedTierInfo(state.player.heat).label, 'bounty/hunters');
  assert.equal(changes.at(-1).tier, WANTED_TIER.BOUNTY);

  const warrant = wantedWarrantFor(state);
  assert.ok(warrant, 'lawSecurity posts a player warrant in the bounty band');
  assert.equal(warrant.targetId, state.playerId);
  assert.equal(warrant.tier, WANTED_TIER.BOUNTY);
  assert.equal(warrants.length, 1);

  const hunters = liveHunters(state);
  assert.equal(hunters.length, 1, 'exactly one warrant hunter');
  const hunter = hunters[0];
  assert.equal(hunter.id, warrant.hunterId);
  assert.equal(hunter.data.contractTargetId, state.playerId);
  assert.equal(hunter.data.wantedWarrant, true);
  assert.equal(hunter.data.missionPinned, true);
  assert.equal(hunter.data.bountyHunt.pursuing, true);

  const expected = reserveArrivalPoint({
    anchor: state.player.heatZone.center,
    aggressorPos: player.pos,
    jurisdictionRadius: state.player.heatZone.radius,
    seed: SEED_BOUNTY,
    incidentId: warrant.contractId,
  });
  assert.deepEqual({ x: hunter.pos.x, z: hunter.pos.z }, expected);
  const dist = Math.hypot(hunter.pos.x - player.pos.x, hunter.pos.z - player.pos.z);
  assert.ok(dist >= 900, `hunter must fly from somewhere (dist ${dist}), not spawn on the player`);
  assert.ok(hunter.maxSpeed > 0 && hunter.thrust > 0, 'warrant hunter is a flyable hull');
  assert.equal(hunter.vel.x, 0);
  assert.equal(hunter.vel.z, 0);
  sim.dispose();
});

test(`seed ${SEED_BOUNTY}: warrant hunter flies inward from the reserve point`, async () => {
  const sim = createSimulation({
    seed: SEED_BOUNTY,
    systems: [
      heat, lawSecurity, bountyHunt, spawnBudget,
      createTacticalAISystem({ seed: SEED_BOUNTY }),
      actions, flightV3, aiPorts, physics,
    ],
  });
  const { state } = sim;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  if (!state.input.actions) state.input.actions = { brake: false, autopursuit: false };
  state.world.currentSectorId = SECTOR;
  if (!state.world.sectors) state.world.sectors = {};
  state.world.sectors[SECTOR] = { id: SECTOR, factionId: 'faction_scn', security: 0.9, tier: 0 };
  state.player.heat = 0;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 8, mass: 28,
    thrust: 40, turnRate: 2.2, maxSpeed: 80, drag: 1.25,
  });
  state.playerId = player.id;
  const physicsSys = sim.registry.get('physics');
  assert.equal(await physicsSys.prepareBackend(state), true, 'rapier-dynamic should initialize');

  killLawman(sim.bus, state);
  sim.step();
  const hunter = liveHunters(state)[0];
  assert.ok(hunter, 'bounty band must post the hunter before we measure the flight');
  const warrantArrival = { x: hunter.pos.x, z: hunter.pos.z };
  const startDist = Math.hypot(hunter.pos.x - player.pos.x, hunter.pos.z - player.pos.z);
  assert.ok(startDist >= 900, `start dist ${startDist} must be a reserve arrival, not a teleport`);

  for (let i = 0; i < 480; i++) sim.step();
  const endDist = Math.hypot(hunter.pos.x - player.pos.x, hunter.pos.z - player.pos.z);
  const moved = Math.hypot(hunter.pos.x - warrantArrival.x, hunter.pos.z - warrantArrival.z);
  assert.ok(moved > 40, `hunter must leave the reserve point (moved ${moved.toFixed(1)})`);
  assert.ok(endDist >= 900, `hunter must not teleport onto the player (end ${endDist.toFixed(1)})`);
  assert.ok(endDist < startDist - 20, `hunter must close from ${startDist.toFixed(1)} to ${endDist.toFixed(1)}`);
  if (typeof physicsSys._disableSg02DynamicAuthority === 'function') {
    physicsSys._disableSg02DynamicAuthority();
  }
  sim.dispose();
});

test(`seed ${SEED_BOUNTY}: leaving the search zone drops bounty to scan and the hunter breaks off`, () => {
  const { sim, state, player } = boot(SEED_BOUNTY);
  killLawman(sim.bus, state);
  sim.step();
  if (sim.registry.get('bountyHunt')) sim.registry.get('bountyHunt').update(SIM_DT, state);

  assert.equal(state.player.wantedTier, WANTED_TIER.BOUNTY);
  const hunter = liveHunters(state)[0];
  assert.ok(hunter, 'bounty band posts a hunter before the slip');
  assert.equal(hunter.data.bountyHunt.pursuing, true);

  const zone = state.player.heatZone;
  player.pos.x = zone.center.x + zone.radius + 80;
  player.pos.z = zone.center.z;
  const waitS = (zone.clearAfterS || 6) + 1;
  for (let i = 0; i < Math.ceil(waitS / SIM_DT) + 2; i++) sim.step();

  assert.equal(state.player.wantedTier, WANTED_TIER.SCAN, 'one zone-leave drops the bounty band, not a purchase');
  assert.equal(wantedWarrantFor(state), null, 'the warrant ends when the band drops');
  const slipped = state.entities.get(hunter.id);
  assert.ok(slipped && slipped.alive !== false, 'the hunter does not teleport away');
  assert.equal(slipped.data.bountyHunt.pursuing, false, 'the hunter breaks off after the slip');
  sim.dispose();
});

test('impound band is a playable yard world', () => {
  assert.equal(WANTED_TIER_INFO.impound.playable, true);
  assert.equal(WANTED_TIER_INFO.impound.escape, 'steal_ship_back');
  assert.equal(wantedTierFor(0.5), WANTED_TIER.NETS);
  assert.equal(wantedTierFor(0.9), WANTED_TIER.IMPOUND);
});
