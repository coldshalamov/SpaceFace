import assert from 'node:assert/strict';
import test from 'node:test';

import { actions } from '../src/systems/actions.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { readRecentImpulseProvenance } from '../src/combat/impulseKernel.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { combat, makeEnemySpawnSpec } from '../src/systems/combat.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { heavyPartsRuntime } from '../src/systems/heavyPartsRuntime.js';
import { makeShipEntitySpec, fittingsFromDefaultModules } from '../src/systems/ships.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { solveLeadAngle, weapons } from '../src/systems/weapons.js';

const DT = SIM_DT;
const PLAYER_WEAPON_ID = 'wpn_siege_lance_l';

test('Carrier-lite launches five ordinary craft from two live bays and Tactical takes them over', async (t) => {
  const route = await bootRoute(t, 'heavy_carrier_lite', {
    playerPos: { x: 0, z: 180 },
    enemyPos: { x: 0, z: 0 },
    enemyRot: Math.PI / 2,
  });
  const launches = [];
  route.bus.on('heavy:bayLaunch', (payload) => launches.push(payload));

  for (let guard = 0; guard < 600 && launches.length < 5; guard++) route.sim.step(DT);
  assert.equal(launches.length, 5, 'the intact pair spends its exact authored 2+3 capacity');
  assert.deepEqual(countBy(launches, 'bayPartId'), {
    heavy_carrier_lite_bay_port: 2,
    heavy_carrier_lite_bay_starboard: 3,
  });
  assert.deepEqual(countBy(launches, 'archetype'), { mote_swarmer: 3, wasp_swarmer: 2 });

  for (let i = 0; i < 30; i++) route.sim.step(DT);
  const decisions = route.tactical.stack?.lastResult?.decisions || [];
  for (const launch of launches) {
    const actor = route.state.entities.get(launch.entityId);
    assert.ok(actor && actor.alive !== false && actor.type === 'ship');
    assert.equal(actor.data.heavyLaunch.carrierId, route.enemy.id);
    assert.equal(actor.data.heavyLaunch.bayPartId, launch.bayPartId);
    assert.ok(actor.collides, 'the launched ordinary actor is a physical production ship');
    assert.ok(decisions.some((decision) => decision.entityId === actor.id),
      `Tactical owns launched actor ${actor.id} on the ordinary route`);
  }
  assert.equal(route.state.physicsRuntime.diagnostics.backend, 'rapier-dynamic');
});

test('a production shot strips one live Carrier bay before it empties and removes only its remaining capacity', async (t) => {
  const route = await bootRoute(t, 'heavy_carrier_lite', {
    playerPos: { x: 0, z: 330 },
    enemyPos: { x: 0, z: 0 },
    enemyRot: 0,
  });
  const launches = [];
  route.bus.on('heavy:bayLaunch', (payload) => launches.push(payload));
  assert.equal(route.enemy.data.heavyFightShape.tell, 'paired_hangar_slots_and_launch_flashes');
  const bays = route.enemy.data.heavyPartsRuntime.parts.filter((record) => record.partRole === 'bay');
  const strippedBay = bays.sort((a, b) => partDistanceSq(route, a) - partDistanceSq(route, b))[0];
  await productionShotStrip(route, strippedBay);
  const usesAtDetach = strippedBay.uses;
  assert.equal(usesAtDetach, 0, 'the production shot lands inside the opening launch tell');
  for (let i = 0; i < 480; i++) route.sim.step(DT);

  const survivingBay = bays.find((record) => record !== strippedBay);
  assert.equal(strippedBay.uses, usesAtDetach, 'the stripped bay cannot spend another launch');
  assert.ok(strippedBay.uses < strippedBay.binding.capacity, 'the shot lands before that bay empties');
  assert.equal(survivingBay.uses, survivingBay.binding.capacity, 'the other physical bay keeps its own capacity');
  assert.equal(launches.length, strippedBay.uses + survivingBay.uses);
  assert.ok(launches.length < 5, 'the counter materially reduces the intact screen');
});

test('Foundry uses close industrial cutters and a player projectile detonates physical ore with player impulse provenance', async (t) => {
  const route = await bootRoute(t, 'heavy_foundry', {
    playerPos: { x: 160, z: 0 },
    enemyPos: { x: 0, z: 0 },
    enemyRot: 0,
    playerLoadout: 'turret',
  });
  const cutterFire = [];
  const releases = [];
  const detonations = [];
  const projectileHits = [];
  route.bus.on('combat:fire', (payload) => {
    if (payload?.ownerId === route.enemy.id && payload.weaponId === 'wpn_beam_laser_m') cutterFire.push(payload);
  });
  route.bus.on('heavy:chargedOreReleased', (payload) => releases.push(payload));
  route.bus.on('heavy:chargedOreDetonated', (payload) => detonations.push(payload));
  route.bus.on('projectile:hit', (payload) => projectileHits.push(payload));
  const playerVitalsBefore = totalVitals(route.player);
  let minDistance = Infinity;
  let commitWitness = null;

  for (let guard = 0; guard < 300 && (!cutterFire.length || !releases.length); guard++) {
    route.sim.step(DT);
    minDistance = Math.min(minDistance, Math.hypot(
      route.enemy.pos.x - route.player.pos.x,
      route.enemy.pos.z - route.player.pos.z,
    ));
    const decision = route.tactical.stack?.lastResult?.decisions?.find((row) => row.entityId === route.enemy.id);
    if (!commitWitness && decision?.combatDoctrine?.phase === 'commit') {
      commitWitness = { decision, intent: { ...(route.enemy.data.intent || {}) } };
    }
  }
  assert.ok(cutterFire.length > 0,
    `the production Weapons owner fires the fixed close-range cutter pair: ${JSON.stringify({ minDistance, commitWitness, latest: route.tactical.stack?.lastResult?.decisions })}`);
  assert.ok(cutterFire.some((payload) => payload.continuous === true && payload.range === 300));
  assert.ok(totalVitals(route.player) < playerVitalsBefore,
    'the live beam enters ordinary Combat authority rather than stopping at a cue');
  assert.equal(releases.length, 1);

  const mine = route.state.entities.get(releases[0].mineId);
  assert.ok(mine && mine.alive !== false && mine.type === 'payload');
  assert.equal(mine.data.kind, 'charged_ore_mine');
  assert.equal(mine.ttl, Infinity, 'the counter is physical interaction, not an expiry timer');
  assert.equal(mine.data.dieAt, undefined);
  assert.equal(mine.physicsBody.dynamic, true);
  assert.ok(route.state.entityIndex.physicsDynamics.includes(mine), 'Rapier owns the released ore body');

  const enemyVelocityBefore = { x: route.enemy.vel.x, z: route.enemy.vel.z };
  await productionShotEntity(route, mine);
  for (let i = 0; i < 4; i++) route.sim.step(DT);

  assert.ok(projectileHits.some((payload) => payload.targetId === mine.id && payload.ownerId === route.player.id),
    'a catalog projectile reaches the physical ore through the swept collision route');
  assert.equal(mine.data.detonated, true);
  assert.equal(mine.alive, false);
  assert.equal(detonations.at(-1)?.trigger, 'projectile');
  const provenance = readRecentImpulseProvenance(route.enemy, route.state.tick, 30);
  assert.equal(provenance?.tag, 'charged_ore_detonation');
  assert.equal(provenance?.actorId, route.player.id, 'the real player shot owns the physical counter');
  assert.ok(Math.hypot(
    route.enemy.vel.x - enemyVelocityBefore.x,
    route.enemy.vel.z - enemyVelocityBefore.z,
  ) > 1, 'the detonation physically changes the heavy body through Rapier');
});

test('a production shot through the live Foundry rack ends all later ore releases', async (t) => {
  const route = await bootRoute(t, 'heavy_foundry', {
    playerPos: { x: 0, z: 300 },
    enemyPos: { x: 0, z: 0 },
    enemyRot: 0,
  });
  const releases = [];
  route.bus.on('heavy:chargedOreReleased', (payload) => releases.push(payload));
  const rack = route.enemy.data.heavyPartsRuntime.parts
    .find((record) => record.partId === 'heavy_foundry_ore_mine_rack');
  await productionShotStrip(route, rack);
  assert.equal(rack.uses, 0, 'the exposed rack is stripped during its visible opening tell');
  for (let i = 0; i < 360; i++) route.sim.step(DT);
  assert.equal(releases.length, 0);
  assert.equal(rack.uses, 0);
});

async function bootRoute(t, enemyId, { playerPos, enemyPos, enemyRot, playerLoadout = 'siege' }) {
  const previousImpulseFlag = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  t.after(() => { COMBAT_FLAGS.weaponImpulseConsequences = previousImpulseFlag; });
  const tactical = createTacticalAISystem({ config: { trace: { enabled: false } } });
  // Init order keeps the Heavy listener ahead of Combat for physical ore detonation. Update order is
  // the production Tactical/Flight/Weapons/Rapier/Combat route relevant to this packet.
  const systems = [tactical, physics, aiPorts, collisionConsequences, heavyPartsRuntime, actions, flightV3, weapons, combat];
  const updateOrder = [tactical, actions, flightV3, aiPorts, collisionConsequences, heavyPartsRuntime, weapons, physics, combat];
  const sim = createSimulation({ seed: 14445, systems, updateOrder });
  const physicsSystem = sim.registry.get('physics');
  t.after(() => {
    physicsSystem._disableSg02DynamicAuthority?.();
    sim.dispose();
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.settings.gameplay.difficulty = 'standard';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.input.actions = {};
  state.input.moveX = 0;
  state.input.moveZ = 0;
  state.input.turnIntent = 0;
  state.input.boost = false;
  const playerRot = Math.atan2(enemyPos.z - playerPos.z, enemyPos.x - playerPos.x);
  const player = sim.spawn(physicalPlayer(playerPos, playerRot, playerLoadout));
  state.playerId = player.id;
  state.player.targetId = null;
  const enemy = sim.spawn(makeEnemySpawnSpec(enemyId, 12, enemyPos));
  enemy.rot = enemyRot;
  enemy.data.encounter = true;
  assert.equal(await physicsSystem.prepareBackend(state, { reset: true }), true);
  assert.equal(state.physicsRuntime.diagnostics.backend, 'rapier-dynamic');
  return { sim, state, bus, player, enemy, tactical, physicsSystem };
}

async function productionShotStrip(route, record) {
  const part = route.state.entities.get(record.entityId);
  assert.ok(part && part.data.heavyPartState === 'mounted');
  route.state.player.targetId = route.enemy.id;
  route.state.ui.componentSelection = {
    kind: 'heavyPart', targetId: route.enemy.id, componentId: record.partId,
  };
  route.state.input.autoAim = { targetId: route.enemy.id };
  const hits = [];
  const offHit = route.bus.on('projectile:hit', (payload) => {
    if (payload?.ownerId === route.player.id) hits.push(payload);
  });
  try {
    for (let guard = 0; guard < 240 && !record.destroyed; guard++) {
      route.state.input.aimAngle = Math.atan2(part.pos.z - route.player.pos.z, part.pos.x - route.player.pos.x);
      route.state.input.fire = true;
      route.state.input.fireGroup = 1;
      route.sim.step(DT);
    }
  } finally {
    clearPlayerFire(route);
    route.state.ui.componentSelection = null;
    offHit?.();
  }
  assert.ok(hits.some((payload) => payload.targetId === part.id && payload.weaponId === PLAYER_WEAPON_ID),
    `${record.partId} receives a real catalog projectile: ${JSON.stringify({ hits, player: route.player.pos, enemy: route.enemy.pos, part: part.pos })}`);
  assert.equal(record.destroyed, true);
  assert.equal(part.data.heavyPartState, 'debris');
  return part;
}

async function productionShotEntity(route, target) {
  route.state.player.targetId = target.id;
  route.state.input.autoAim = { targetId: target.id };
  try {
    for (let guard = 0; guard < 180 && target.alive !== false; guard++) {
      const projectileSpeed = route.player.data.weapons.find((weapon) => Number.isFinite(weapon.projSpeed))?.projSpeed || 600;
      route.state.input.aimAngle = solveLeadAngle(route.player, target, projectileSpeed);
      route.state.input.fire = true;
      route.state.input.fireGroup = 1;
      route.sim.step(DT);
    }
  } finally {
    clearPlayerFire(route);
  }
  assert.equal(target.alive, false, 'the real shot resolves the physical target');
}

function clearPlayerFire(route) {
  route.state.input.fire = false;
  route.state.input.fireGroup = null;
  route.state.input.autoAim = null;
}

function physicalPlayer(pos, rot, loadout) {
  if (loadout === 'turret') {
    return makeShipEntitySpec('ship_hornet', {
      isPlayer: true,
      team: 0,
      factionId: 'faction_free',
      pos,
      rot,
      fittings: fittingsFromDefaultModules('ship_hornet', Array(3).fill('wpn_railgun_m')),
    });
  }
  return makeShipEntitySpec('ship_bastion', {
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    pos,
    rot,
    fittings: fittingsFromDefaultModules('ship_bastion', Array(4).fill(PLAYER_WEAPON_ID)),
  });
}

function totalVitals(entity) {
  return (entity.hull || 0) + (entity.armorHp || 0) + (entity.shield || 0);
}

function partDistanceSq(route, record) {
  const part = route.state.entities.get(record.entityId);
  const dx = part.pos.x - route.player.pos.x;
  const dz = part.pos.z - route.player.pos.z;
  return dx * dx + dz * dz;
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) out[row[key]] = (out[row[key]] || 0) + 1;
  return out;
}
