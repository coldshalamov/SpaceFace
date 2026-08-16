import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { WEAPONS } from '../src/data/weapons.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import {
  ARCADE_ISLAND_CONTACT_MAX_DELAY_S,
  ARCADE_ISLAND_CONTACT_MIN_DELAY_S,
  ARCADE_ISLAND_CONTACT_REARM_S,
  ARCADE_ISLAND_CONTACT_SHAPE_ID,
  arcadeIslandContactDelay,
  encounterDirector,
  isArcadeIslandContactZone,
} from '../src/systems/encounterDirector.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';

const CERES = 'sector_ceres_belt';
const HELIOS = 'sector_helios_prime';

function zone(sectorId, zoneId) {
  const found = zonesForSector(sectorId).find((candidate) => candidate.id === zoneId);
  assert.ok(found, `fixture zone ${zoneId} exists`);
  return found;
}

function bootIsland({
  seed = 10010,
  sectorId = CERES,
  zoneId = 'zone_ceres_belt',
  tactical = true,
} = {}) {
  const tacticalAI = tactical ? createTacticalAISystem() : null;
  const systems = tactical
    ? [spawnBudget, encounterDirector, aiPorts, tacticalAI]
    : [spawnBudget, encounterDirector];
  const sim = createSimulation({ seed, systems });
  const { state, bus } = sim;
  const targetZone = zone(sectorId, zoneId);
  const center = sectorLocalToGlobalForSector(targetZone.center, sectorId);
  state.mode = 'flight';
  state.world.currentSectorId = sectorId;
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: center.x - Math.min(200, targetZone.radius * 0.25), z: center.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    hull: 200,
    hullMax: 200,
    radius: 8,
    data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;
  const spawned = [];
  bus.on('encounter:spawned', (payload) => {
    if (payload.kind === ARCADE_ISLAND_CONTACT_SHAPE_ID) spawned.push(payload);
  });
  bus.emit('sector:enter', { sectorId });
  bus.emit('world:zoneEntered', { sectorId, zoneId });
  return {
    sim,
    state,
    bus,
    player,
    center,
    targetZone,
    spawned,
    director: sim.registry.get('encounterDirector'),
  };
}

function arcadeLive(state) {
  return Object.values(state.encounterDirector.live)
    .find((live) => live && live.shapeId === ARCADE_ISLAND_CONTACT_SHAPE_ID) || null;
}

function actors(harness, live = arcadeLive(harness.state)) {
  return (live?.ids || []).map((id) => harness.state.entities.get(id)).filter(Boolean);
}

function runUntil(harness, predicate, seconds = 20) {
  const ticks = Math.ceil(seconds * 60);
  for (let tick = 0; tick < ticks; tick++) {
    harness.sim.step();
    if (predicate()) return harness.state.simTime;
  }
  return null;
}

function angularDistance(a, b) {
  let delta = a - b;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return Math.abs(delta);
}

test('deterministic island admission uses the accepted 6-12 second off-glass window', () => {
  const first = arcadeIslandContactDelay(71, CERES, 'zone_ceres_belt', 0);
  const repeat = arcadeIslandContactDelay(71, CERES, 'zone_ceres_belt', 0);
  const nextVisit = arcadeIslandContactDelay(71, CERES, 'zone_ceres_belt', 1);
  assert.equal(first, repeat);
  assert.ok(first >= ARCADE_ISLAND_CONTACT_MIN_DELAY_S && first <= ARCADE_ISLAND_CONTACT_MAX_DELAY_S);
  assert.ok(nextVisit >= ARCADE_ISLAND_CONTACT_MIN_DELAY_S && nextVisit <= ARCADE_ISLAND_CONTACT_MAX_DELAY_S);
  assert.notEqual(first, nextVisit, 'visit ordinal changes the stable entry beat');
});

test('eligible tier-1 island reaches the real Tactical AI fire adapter by 20 seconds', () => {
  const h = bootIsland({ seed: 10011 });
  let firstFireAt = null;
  const contactAt = runUntil(h, () => {
    const live = arcadeLive(h.state);
    if (!live) return false;
    const hostile = actors(h, live).find((entity) => entity.data?.intent?.fire === true);
    if (!hostile) return false;
    firstFireAt = h.state.simTime;
    return true;
  }, 20);

  const live = arcadeLive(h.state);
  assert.ok(live, 'the normal encounter runtime owns the island contact');
  assert.ok(contactAt != null && firstFireAt <= 20, `first hostile fire observed at ${firstFireAt}`);
  const squad = actors(h, live);
  assert.ok(squad.length >= 3 && squad.length <= 4, `tier-1 Wasp group is 3-4, observed ${squad.length}`);
  assert.ok(squad.every((entity) => entity.data?.lootTableId === 'wasp_swarmer'));
  assert.ok(h.sim.helpers.spawnBudget.current() <= 24);
  assert.equal(h.state.encounterDirector.lastMeaningfulAt, live.startedAt,
    'the island contact stamps the existing 30-second meaningful clock');

  const centroid = squad.reduce((sum, entity) => ({ x: sum.x + entity.pos.x, z: sum.z + entity.pos.z }), { x: 0, z: 0 });
  centroid.x /= squad.length;
  centroid.z /= squad.length;
  const distance = Math.hypot(centroid.x - h.player.pos.x, centroid.z - h.player.pos.z);
  assert.ok(distance >= 175 && distance <= 245, `centroid is on the 180-240 WU ring, observed ${distance}`);
  const islandBearing = Math.atan2(h.center.z - h.player.pos.z, h.center.x - h.player.pos.x);
  const spawnBearing = Math.atan2(centroid.z - h.player.pos.z, centroid.x - h.player.pos.x);
  assert.ok(angularDistance(spawnBearing, islandBearing) <= Math.PI / 3 + 0.02,
    'contact arrives within 60 degrees of the island-center bearing');
});

test('tier-2 island keeps the Reaver controller and hard budget never preempts', () => {
  const tierTwo = bootIsland({ seed: 10012, zoneId: 'zone_ceres_derelict', tactical: false });
  assert.ok(runUntil(tierTwo, () => !!arcadeLive(tierTwo.state), 13) != null);
  const squad = actors(tierTwo);
  assert.ok(squad.length >= 4 && squad.length <= 6, `tier-2 group is 4-6, observed ${squad.length}`);
  assert.equal(squad.filter((entity) => entity.data?.lootTableId === 'reaver_pirate').length, 1);
  assert.equal(squad.filter((entity) => entity.data?.lootTableId === 'wasp_swarmer').length, squad.length - 1);
  const leader = squad.find((entity) => entity.data?.lootTableId === 'reaver_pirate');
  const members = squad.filter((entity) => entity !== leader);
  assert.equal(leader.data.ai.encounterRole, 'leader', 'the Reaver is the live morale leader');
  assert.ok(members.every((entity) => entity.data.ai.encounterRole === 'member'));
  assert.ok(members.every((entity) => entity.data.fleeCargo?.commodityId === 'cmdty_scrap_metal'
    && entity.data.fleeCargo.qty === 1), 'the wing carries its bounded flee reserve before combat');

  const saturated = bootIsland({ seed: 10013, tactical: false });
  assert.equal(saturated.sim.helpers.spawnBudget.request(22, 'existing-population'), 22);
  saturated.sim.runTicks(21 * 60);
  assert.equal(arcadeLive(saturated.state), null, 'fewer than three free slots expires without spawning');
  assert.equal(saturated.sim.helpers.spawnBudget.current(), 22, 'existing ships are never preempted');

  const occupied = bootIsland({ seed: 10016, tactical: false });
  occupied.director._clearArcadeIslandContact(true);
  occupied.sim.spawn({
    type: 'ship', team: 1,
    pos: { x: occupied.player.pos.x + 100, z: occupied.player.pos.z },
    vel: { x: 0, z: 0 }, hull: 20, hullMax: 20, radius: 5,
    data: { intent: {}, ai: { passive: false } },
  });
  occupied.bus.emit('world:zoneEntered', { sectorId: CERES, zoneId: occupied.targetZone.id });
  assert.equal(occupied.director._arcadeIslandVisit, null,
    'nearby live hostile contact satisfies the visit without arming another group');
});

test('safe and empty transit do not arm across ten minutes', () => {
  const claim = zone(HELIOS, 'zone_helios_claim');
  assert.equal(isArcadeIslandContactZone(claim), false, 'explicit Helios threat-0 claim stays safe');
  assert.equal(isArcadeIslandContactZone({ id: 'empty', type: 'trade_lane', threat: 1 }), false,
    'generic transit lanes are not islands');

  const h = bootIsland({
    seed: 10014,
    sectorId: HELIOS,
    zoneId: 'zone_helios_claim',
    tactical: false,
  });
  for (let second = 0; second < 600; second++) h.sim.registry.get('encounterDirector').update(1, h.state);
  assert.equal(h.director._arcadeIslandVisit, null);
  assert.equal(h.spawned.length, 0);
});

test('visit is one-shot, rearms after 90 seconds, and Continue load-in remains quiet', () => {
  const h = bootIsland({ seed: 10015, tactical: false });
  assert.ok(runUntil(h, () => !!arcadeLive(h.state), 13) != null);
  assert.equal(h.spawned.length, 1);
  h.bus.emit('world:zoneEntered', { sectorId: CERES, zoneId: h.targetZone.id });
  h.sim.runTicks(10 * 60);
  assert.equal(h.spawned.length, 1, 'repeat entry event cannot duplicate the visit');

  h.bus.emit('world:zoneExited', { sectorId: CERES, zoneId: h.targetZone.id });
  h.bus.emit('world:zoneEntered', { sectorId: CERES, zoneId: h.targetZone.id });
  assert.equal(h.director._arcadeIslandVisit, null, 'boundary farming before 90 seconds cannot re-arm');

  const live = arcadeLive(h.state);
  for (const entity of actors(h, live)) {
    entity.alive = false;
    h.bus.emit('entity:destroyed', { id: entity.id });
  }
  h.director.abort(live, 'fixture_clear');
  h.state.simTime = (live?.startedAt || 0) + ARCADE_ISLAND_CONTACT_REARM_S + 1;
  h.bus.emit('world:zoneExited', { sectorId: CERES, zoneId: h.targetZone.id });
  h.bus.emit('world:zoneEntered', { sectorId: CERES, zoneId: h.targetZone.id });
  assert.ok(h.director._arcadeIslandVisit, 'a genuinely later visit can re-arm');

  h.bus.emit('save:loaded', { slot: 'inside-island' });
  h.bus.emit('world:zoneEntered', { sectorId: CERES, zoneId: h.targetZone.id });
  h.sim.runTicks(21 * 60);
  assert.equal(h.spawned.length, 1, 'Continue inside an island never manufactures an ambush');
});

test('starter Pulse Laser still computes a 2-4 second perfect-hit Wasp TTK', () => {
  const wasp = ENEMY_TYPES.find((enemy) => enemy.id === 'wasp_swarmer');
  const pulse = WEAPONS.find((weapon) => weapon.id === 'wpn_pulse_laser_s');
  assert.ok(wasp && pulse);
  const effectiveHealth = wasp.shield + wasp.armor + wasp.hull;
  const ttk = effectiveHealth / (pulse.dmg * pulse.rof);
  assert.ok(ttk >= 2 && ttk <= 4, `computed perfect-hit TTK ${ttk.toFixed(3)}s`);
});
