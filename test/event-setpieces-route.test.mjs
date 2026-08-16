import assert from 'node:assert/strict';
import test from 'node:test';

import FALLING_ROCK from '../src/data/encounters/353-event-falling-rock.js';
import STATION_SIEGE from '../src/data/encounters/354-event-station-siege.js';
import CONVOY_LAST_STAND from '../src/data/encounters/355-event-convoy-last-stand.js';
import RUNAWAY_REACTOR from '../src/data/encounters/356-event-runaway-reactor.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { actions } from '../src/systems/actions.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { combat } from '../src/systems/combat.js';
import { encounterDirector, planEncounterShape } from '../src/systems/encounterDirector.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { impulseCharges } from '../src/systems/impulseCharges.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { solveLeadAngle, weapons } from '../src/systems/weapons.js';

const DT = SIM_DT;
const SECTOR_ID = 'sector_helios_prime';
const COMBAT_SECTOR_ID = 'sector_ceres_belt';
const DEFAULT_ROUTE_SECTORS = Object.freeze([
  SECTOR_ID,
  COMBAT_SECTOR_ID,
  'sector_tethys_junction',
  'sector_vesta_forge',
]);
const SETPIECES = [FALLING_ROCK, STATION_SIEGE, CONVOY_LAST_STAND, RUNAWAY_REACTOR];

test('all four setpieces are rare weighted default-route encounters whose news precedes physical reveal', async (t) => {
  for (const shape of SETPIECES) {
    assert.equal(shape.tier, 'major');
    assert.equal(shape.rare, true);
    assert.ok(shape.weight > 0 && shape.weight < 0.2);
    assert.ok(shape.cooldownS >= 86_400);
    const reachable = DEFAULT_ROUTE_SECTORS.flatMap((sectorId) => zonesForSector(sectorId)
      .map((zone) => ({ sectorId, zone })))
      .find(({ zone }) => shape.zoneTypes.includes(zone.type));
    assert.ok(reachable, `${shape.id} has an ordinary zone on the default core route`);
    const planned = planEncounterShape(shape, reachable.zone, reachable.sectorId, 0, shape.id, () => 0.25);
    assert.equal(planned.shapeId, shape.id);
  }

  const route = await bootRoute(t, { playerPos: { x: 180, z: -180 } });
  const requested = request(route, FALLING_ROCK.id, 'warning-order');
  assert.equal(requested.ok, true);
  assert.equal(route.news.at(-1)?.stage, 'warning');
  assert.equal(setpieceBodies(route.state, 'falling_rock').length, 0,
    'the rumor/news beat lands before the physical mass exists');
  route.sim.runTicks(300);
  assert.equal(setpieceBodies(route.state, 'falling_rock').length, 0,
    'the six-second warning remains physical response time, not a same-frame spawn');
  assert.equal(runUntil(route, () => setpieceBodies(route.state, 'falling_rock').length === 1, 150), true);
});

test('falling rock has three distinct production physics solutions', async (t) => {
  await testChargeSolution(t);
  await testMassDriverSolution(t);
  await testTowSolution(t);
});

test('letting the falling rock hit uses Rapier contact and leaves physical debris plus news', async (t) => {
  const route = await bootRoute(t, { playerPos: { x: -320, z: -260 } });
  request(route, FALLING_ROCK.id, 'rock-impact');
  reveal(route, 'falling_rock');
  const live = liveByShape(route, FALLING_ROCK.id);
  const rockId = live.data.rockId;
  const stationId = live.data.stationId;
  assert.equal(runUntil(route, () => route.resolved.some((row) => row.outcome === 'rock_hit_station'), 3000), true,
    routeDump(route));
  assert.ok(route.impacts.some((row) => physicalPair(row, rockId, stationId)),
    'the failure begins at a real Rapier rock/station contact');
  const debris = setpieceBodies(route.state, 'falling_rock_impact');
  assert.equal(debris.length, 6);
  assert.ok(debris.every((body) => body.physicsBody?.dynamic === true && body.collides === true));
  assert.equal(route.news.at(-1)?.outcome, 'rock_hit_station');
});

test('station siege station guns fight live attackers; win and fail both leave honest consequences', async (t) => {
  const defended = await bootRoute(t, { playerPos: { x: 330, z: -260 }, sectorId: COMBAT_SECTOR_ID });
  request(defended, STATION_SIEGE.id, 'siege-defended');
  reveal(defended, 'station_turret');
  const live = liveByShape(defended, STATION_SIEGE.id);
  const turretIds = live.data.turretIds.slice();
  const raiderIds = live.data.raiderIds.slice();
  // Join the defense during the authored one-second response window so the player counter cannot
  // be pre-empted by the live station guns. The remaining attackers are then ordinary shared kills.
  await shootToKill(defended, raiderIds[0], 360);
  assert.equal(runUntil(defended, () => defended.fires.some((row) => turretIds.includes(row.ownerId)), 360), true,
    routeDump(defended));
  for (const id of raiderIds.slice(1)) await shootToKill(defended, id, 360, { requirePlayerHit: false });
  assert.equal(runUntil(defended, () => defended.resolved.some((row) => row.outcome === 'station_held'), 120), true,
    routeDump(defended));
  assert.ok(defended.damage.some((row) => turretIds.includes(row.attackerId)),
    'station turrets enter Weapons and Combat rather than emitting a decorative cue');

  const overrun = await bootRoute(t, { playerPos: { x: -3600, z: -3600 }, sectorId: COMBAT_SECTOR_ID });
  request(overrun, STATION_SIEGE.id, 'siege-overrun');
  reveal(overrun, 'station_turret');
  const failedLive = liveByShape(overrun, STATION_SIEGE.id);
  assert.equal(runUntil(overrun, () => overrun.resolved.some((row) => row.outcome === 'station_overrun'), 3000), true,
    routeDump(overrun));
  const moduleWrecks = setpieceBodies(overrun.state, 'station_siege_module');
  assert.equal(moduleWrecks.length, failedLive.data.turretIds.length);
  assert.ok(moduleWrecks.every((body) => body.physicsBody?.dynamic === false && body.collides === true),
    'destroyed turret modules become static physical terrain');
  assert.equal(overrun.news.at(-1)?.outcome, 'station_overrun');
});

test('convoy last stand resolves through live combat, preserving survivors or physical failure debris', async (t) => {
  const defended = await bootRoute(t, { playerPos: { x: 310, z: -310 }, sectorId: COMBAT_SECTOR_ID });
  request(defended, CONVOY_LAST_STAND.id, 'convoy-defended');
  reveal(defended, null, CONVOY_LAST_STAND.id);
  const live = liveByShape(defended, CONVOY_LAST_STAND.id);
  const freighterIds = live.data.freighterIds.slice();
  for (const id of live.data.raiderIds.slice()) await shootToKill(defended, id, 360);
  assert.equal(runUntil(defended, () => defended.resolved.some((row) => row.outcome === 'convoy_survived'), 120), true,
    routeDump(defended));
  assert.ok(freighterIds.some((id) => defended.state.entities.get(id)?.alive !== false));

  const lost = await bootRoute(t, { playerPos: { x: -3600, z: -3600 }, sectorId: COMBAT_SECTOR_ID });
  request(lost, CONVOY_LAST_STAND.id, 'convoy-lost');
  reveal(lost, null, CONVOY_LAST_STAND.id);
  const failedLive = liveByShape(lost, CONVOY_LAST_STAND.id);
  assert.equal(runUntil(lost, () => lost.resolved.some((row) => row.outcome === 'convoy_destroyed'), 3600), true,
    routeDump(lost));
  assert.equal(setpieceBodies(lost.state, 'freighter').length, 0,
    'no live freighter identity remains after the combat loss');
  const wrecks = setpieceBodies(lost.state, 'convoy_last_stand');
  assert.equal(wrecks.length, failedLive.data.freighterIds.length * 2);
  assert.ok(wrecks.every((body) => body.physicsBody?.dynamic === true && body.collides === true));
  assert.equal(lost.news.at(-1)?.outcome, 'convoy_destroyed');
});

test('runaway reactor can be shot clear or physically collide with the populated lane', async (t) => {
  const stopped = await bootRoute(t, { playerPos: { x: -650, z: 0 } });
  request(stopped, RUNAWAY_REACTOR.id, 'reactor-stopped');
  reveal(stopped, 'runaway_reactor');
  const live = liveByShape(stopped, RUNAWAY_REACTOR.id);
  const reactorId = live.data.reactorId;
  await shootToKill(stopped, reactorId, 360);
  assert.equal(runUntil(stopped, () => stopped.resolved.some((row) => row.outcome === 'reactor_destroyed_safe'), 120), true,
    routeDump(stopped));
  assert.ok(stopped.hits.some((row) => row.targetId === reactorId && row.ownerId === stopped.player.id));
  assert.equal(setpieceBodies(stopped.state, 'reactor_safe_detonation').length, 4);

  const breach = await bootRoute(t, { playerPos: { x: -650, z: -300 } });
  request(breach, RUNAWAY_REACTOR.id, 'reactor-breach');
  reveal(breach, 'runaway_reactor');
  const failed = liveByShape(breach, RUNAWAY_REACTOR.id);
  assert.equal(runUntil(breach, () => breach.resolved.some((row) => row.outcome === 'reactor_lane_breach'), 2400), true,
    routeDump(breach));
  assert.ok(breach.impacts.some((row) => physicalPair(row, failed.data.reactorId, failed.data.laneId)));
  assert.equal(setpieceBodies(breach.state, 'reactor_lane_breach').length, 6);
  assert.equal(breach.news.at(-1)?.outcome, 'reactor_lane_breach');
});

async function testChargeSolution(t) {
  const route = await bootRoute(t, { playerPos: { x: 230, z: 0 }, weaponId: 'wpn_railgun_m' });
  route.state.player.cargo.items.cmdty_impulse_charge = 3;
  route.state.player.cargo.usedVolume = 6;
  route.state.player.cargo.usedMass = 6;
  request(route, FALLING_ROCK.id, 'rock-charges');
  reveal(route, 'falling_rock');
  const live = liveByShape(route, FALLING_ROCK.id);
  const rock = route.state.entities.get(live.data.rockId);
  route.player.rot = 0;
  route.state.input.aimWorld = rock.pos;
  for (let count = 0; count < 3; count++) {
    route.state.input.actions.chargeThrow = true;
    route.sim.step(DT);
    assert.equal(runUntil(route, () => route.chargeSticks.filter((row) => row.hostId === rock.id).length > count, 180), true,
      routeDump(route));
    if (count < 2) {
      assert.equal(runUntil(route, () => (route.player.data.impulseCharges?.throwCdT || 0) <= 0, 420), true);
      route.state.input.aimWorld = rock.pos;
    }
  }
  route.state.input.actions.chargeDetonate = true;
  route.sim.step(DT);
  assert.equal(runUntil(route, () => route.resolved.some((row) => row.outcome === 'stacked_impulse_charges'), 180), true,
    routeDump(route));
  assert.ok(route.chargeDetonations.length >= 3);
  assert.ok(rock.vel.x > 3, 'SG-02 applies the stacked charge impulses to the same falling body');
}

async function testMassDriverSolution(t) {
  const route = await bootRoute(t, { playerPos: { x: 210, z: 0 }, shipId: 'ship_bastion', weaponId: 'wpn_siege_lance_l' });
  request(route, FALLING_ROCK.id, 'rock-drivers');
  reveal(route, 'falling_rock');
  const live = liveByShape(route, FALLING_ROCK.id);
  const rock = route.state.entities.get(live.data.rockId);
  route.state.player.targetId = rock.id;
  route.state.input.autoAim = { targetId: rock.id };
  assert.equal(runUntil(route, () => {
    route.state.input.aimAngle = solveLeadAngle(route.player, rock, 600);
    route.state.input.fire = true;
    route.state.input.fireGroup = 1;
    return route.resolved.some((row) => row.outcome === 'mass_driver_barrage');
  }, 900), true, routeDump(route));
  clearFire(route);
  assert.ok(route.hits.filter((row) => row.targetId === rock.id && row.weaponId === 'wpn_siege_lance_l').length >= 3);
  assert.ok(rock.vel.x > 3, 'catalog mass-driver rounds change the live Rapier trajectory');
}

async function testTowSolution(t) {
  const route = await bootRoute(t, { playerPos: { x: 625, z: 0 }, shipId: 'ship_bastion', weaponId: 'wpn_railgun_m' });
  request(route, FALLING_ROCK.id, 'rock-tow');
  reveal(route, 'falling_rock');
  const live = liveByShape(route, FALLING_ROCK.id);
  const rock = route.state.entities.get(live.data.rockId);
  route.player.rot = 0;
  route.state.input.tetherMode = 'nearest';
  route.state.input.actions.tetherFire = true;
  route.sim.step(DT);
  route.state.input.actions.tetherFire = false;
  assert.equal(runUntil(route, () => route.tethers.some((row) => row.targetId === rock.id), 60), true, routeDump(route));
  route.state.input.moveZ = 1;
  for (let stage = 0; stage < 3 && !route.resolved.length; stage++) {
    route.state.input.boost = true;
    route.sim.runTicks(90);
    route.state.input.boost = false;
    route.sim.runTicks(36);
  }
  assert.equal(runUntil(route, () => route.resolved.some((row) => row.outcome === 'multi_burn_tow'), 900), true,
    routeDump(route));
  assert.ok(route.boostStarts.length >= 2);
  assert.ok(rock.vel.x > 3, 'Flight V3 plus the live Massline reverses the falling body');
}

async function bootRoute(t, {
  playerPos,
  shipId = 'ship_bastion',
  weaponId = 'wpn_siege_lance_l',
  sectorId = SECTOR_ID,
}) {
  const previousImpulseFlag = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  t.after(() => { COMBAT_FLAGS.weaponImpulseConsequences = previousImpulseFlag; });
  const tactical = createTacticalAISystem();
  const systems = [
    tactical, physics, aiPorts, actions, flightV3, weapons,
    impulseCharges, tetherGameplay, encounterDirector, combat,
  ];
  const updateOrder = [
    tactical, actions, flightV3, aiPorts, weapons, impulseCharges,
    physics, combat, tetherGameplay, encounterDirector,
  ];
  const sim = createSimulation({ seed: 20_200_020 + Math.round(playerPos.x), systems, updateOrder });
  const physicsSystem = sim.registry.get('physics');
  t.after(() => {
    physicsSystem._disableSg02DynamicAuthority?.();
    sim.dispose();
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = sectorId;
  state.settings.gameplay.difficulty = 'standard';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.input.actions = {};
  state.input.moveX = 0;
  state.input.moveZ = 0;
  state.input.turnIntent = 0;
  state.input.boost = false;
  const player = sim.spawn(playerSpec(playerPos, shipId, weaponId));
  state.playerId = player.id;
  state.player.targetId = null;
  assert.equal(await physicsSystem.prepareBackend(state, { reset: true }), true);
  assert.equal(state.physicsRuntime.diagnostics.backend, 'rapier-dynamic');

  const news = [];
  const resolved = [];
  const impacts = [];
  const hits = [];
  const damage = [];
  const fires = [];
  const chargeSticks = [];
  const chargeDetonations = [];
  const tethers = [];
  const boostStarts = [];
  bus.on('news:headline', (payload) => news.push(structuredClone(payload)));
  bus.on('encounter:resolved', (payload) => resolved.push(structuredClone(payload)));
  bus.on('physics:impact', (payload) => impacts.push(structuredClone(payload)));
  bus.on('projectile:hit', (payload) => hits.push(structuredClone(payload)));
  bus.on('combat:damage', (payload) => damage.push(structuredClone(payload)));
  bus.on('combat:fire', (payload) => fires.push(structuredClone(payload)));
  bus.on('charge:stuck', (payload) => chargeSticks.push(structuredClone(payload)));
  bus.on('charge:detonated', (payload) => chargeDetonations.push(structuredClone(payload)));
  bus.on('tether:attached', (payload) => tethers.push(structuredClone(payload)));
  bus.on('ship:boostStart', (payload) => boostStarts.push(structuredClone(payload)));
  return {
    sim, state, bus, player, physicsSystem, tactical, sectorId,
    news, resolved, impacts, hits, damage, fires, chargeSticks, chargeDetonations, tethers, boostStarts,
  };
}

function request(route, shapeId, suffix) {
  const shape = SETPIECES.find((candidate) => candidate.id === shapeId);
  const zone = zonesForSector(route.sectorId).find((candidate) => shape?.zoneTypes.includes(candidate.type));
  assert.ok(zone, `${shapeId} has a compatible zone in ${route.sectorId}`);
  return route.sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId,
    encounterId: `plan20-${suffix}`,
    sectorId: route.sectorId,
    zoneId: zone.id,
    anchor: { x: 0, z: 0 },
    force: true,
  });
}

function reveal(route, role = null, shapeId = null) {
  assert.equal(runUntil(route, () => {
    const live = shapeId ? liveByShape(route, shapeId) : Object.values(route.state.encounterDirector.live)[0];
    if (!live || live.phase !== 'physical') return false;
    return role == null || live.ids.some((id) => route.state.entities.get(id)?.data?.setpieceRole === role);
  }, 450), true, routeDump(route));
}

function liveByShape(route, shapeId) {
  return Object.values(route.state.encounterDirector.live).find((entry) => entry.shapeId === shapeId) || null;
}

function setpieceBodies(state, kind) {
  return state.entityList.filter((entity) => entity && entity.alive !== false
    && (entity.data?.setpieceRole === kind || entity.data?.setpieceDebris === kind));
}

async function shootToKill(route, targetId, maxTicks, { requirePlayerHit = true } = {}) {
  const target = route.state.entities.get(targetId);
  if (!target || target.alive === false) return;
  route.state.player.targetId = target.id;
  route.state.input.autoAim = { targetId: target.id };
  const hitCount = route.hits.length;
  assert.equal(runUntil(route, () => {
    if (target.alive === false) return true;
    route.state.input.aimAngle = solveLeadAngle(route.player, target, 600);
    route.state.input.fire = true;
    route.state.input.fireGroup = 1;
    return false;
  }, maxTicks), true, routeDump(route));
  clearFire(route);
  if (requirePlayerHit) {
    assert.ok(route.hits.slice(hitCount).some((row) => row.targetId === target.id && row.ownerId === route.player.id),
      'the target falls only after a real player projectile contact');
  }
}

function clearFire(route) {
  route.state.input.fire = false;
  route.state.input.fireGroup = null;
  route.state.input.autoAim = null;
}

function playerSpec(pos, shipId, weaponId) {
  const slots = shipId === 'ship_bastion' ? 4 : 3;
  return makeShipEntitySpec(shipId, {
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    pos,
    rot: 0,
    fittings: fittingsFromDefaultModules(shipId, Array(slots).fill(weaponId)),
  });
}

function runUntil(route, predicate, maxTicks) {
  for (let tick = 0; tick < maxTicks; tick++) {
    if (predicate()) return true;
    route.sim.step(DT);
  }
  return predicate();
}

function physicalPair(payload, firstId, secondId) {
  return (payload.aId === firstId && payload.bId === secondId)
    || (payload.aId === secondId && payload.bId === firstId);
}

function routeDump(route) {
  return JSON.stringify({
    tick: route.state.tick,
    resolved: route.resolved,
    live: Object.values(route.state.encounterDirector.live).map((entry) => ({
      shapeId: entry.shapeId,
      phase: entry.phase,
      ids: entry.ids,
      roles: entry.roles,
      data: Object.fromEntries(Object.entries(entry.data || {}).filter(([key]) => key !== 'runtimeOffs')),
    })),
    ai: Object.values(route.state.encounterDirector.live).flatMap((entry) => entry.ids.map((id) => {
      const entity = route.state.entities.get(id);
      return entity && { id, team: entity.team, role: entry.roles[id], ai: entity.data?.ai, intent: entity.data?.intent,
        weapons: entity.data?.weapons?.map((weapon) => weapon.defId) };
    }).filter(Boolean)),
    decisions: route.tactical.stack?.lastResult?.decisions,
    hits: route.hits.slice(-12),
    impacts: route.impacts.slice(-12),
    fires: route.fires.slice(-12),
  });
}
