import assert from 'node:assert/strict';
import test from 'node:test';

import { physics } from '../src/core/physics.js';
import { createSimulation } from '../src/core/sim.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { actions } from '../src/systems/actions.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { combat, makeEnemySpawnSpec } from '../src/systems/combat.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { heavyPartsRuntime } from '../src/systems/heavyPartsRuntime.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { weapons } from '../src/systems/weapons.js';

const DT = 1 / 60;

test('Gunship applies real 360-degree fire pressure until production shots strip its physical mounts', async (t) => {
  const route = await bootHeavyRoute(t, 'heavy_gunship', {
    playerPos: { x: -250, z: 0 }, enemyPos: { x: 0, z: 0 }, enemyRot: 0,
  });
  const fires = [];
  route.bus.on('combat:fire', (payload) => {
    if (payload?.ownerId === route.enemy.id) fires.push(payload);
  });

  const actionReasons = new Set();
  for (let i = 0; i < 180 && fires.length === 0; i++) {
    route.sim.step(DT);
    const reason = latestDecision(route)?.action?.reason;
    if (reason) actionReasons.add(reason);
  }
  const decision = latestDecision(route);
  assert.equal(decision?.combatDoctrine?.heavyFight?.kind, 'turret_boat');
  assert.equal(decision?.combatDoctrine?.maneuverKind, 'orbit');
  assert.equal(decision?.combatDoctrine?.preferredRange, 390);
  assert.ok(route.enemy.data.weapons.every((weapon) => Math.abs(weapon.gimbalArc - Math.PI * 2) < 1e-9));
  assert.ok(fires.length > 0, `a target directly behind the hull is engaged through real weapon service: ${JSON.stringify({ actionReasons: [...actionReasons], decision, trace: route.state.combat.trace.events.slice(-12) })}`);

  assert.equal(liveWeaponParts(route).length, 3);
  while (liveWeaponParts(route).length > 0) {
    // Mounted siblings remain honest collision bodies. Recompute the nearest live surface mount
    // each time instead of asking component targeting to ghost an intervening physical turret.
    const record = liveWeaponParts(route)
      .sort((a, b) => partDistanceSq(route, a) - partDistanceSq(route, b))[0];
    await productionShotStrip(route, record);
    for (let i = 0; i < 15; i++) route.sim.step(DT);
  }
  assert.equal(route.enemy.data.heavyPartsRuntime.disabled, true);
  assert.equal(route.enemy.data.heavyDisabled, true);
  assert.equal(route.enemy.alive, true);
  assert.equal(route.enemy.data.towable, true);
  assert.ok(route.enemy.data.weapons.every((weapon) => weapon.heavyPartDestroyed === true));

  const fireCountAtStrip = fires.length;
  for (let i = 0; i < 90; i++) route.sim.step(DT);
  assert.equal(fires.length, fireCountAtStrip, 'the living barge has no abstract guns left to fire');
});

test('Ramscoop freezes its telegraphed lane, misses a real dodge, and hits terrain through Rapier/combat', async (t) => {
  const route = await runRamscoopRoute(t, { stripProw: false });
  assert.equal(route.telegraphs.filter((entry) => entry.kind === 'ram_burn').length, 1,
    `one visible spool announces the committed burn: ${JSON.stringify({ commit: route.commit, terrain: route.terrainImpact, latest: latestDecision(route)?.combatDoctrine })}`);
  assert.ok(route.commit, 'the live Tactical stack reaches the committed phase');
  assert.equal(route.commit.maneuverTargetId, null, 'the charge stops tracking the player');
  assert.equal(route.commit.committedCollisionCourse, true);
  assert.equal(route.commit.boostDuringCommit, true);
  assert.equal(route.commit.preferredRange, 0);
  assert.ok(Math.abs(route.lockedPoint.z) < 1e-6, 'the locked lane preserves the pre-dodge bearing');
  assert.ok(Math.abs(route.player.pos.z) > 80, 'Flight V3 carries the player clear of the frozen line');
  assert.equal(route.playerImpact, null, 'the committed heavy does not magically bend into the dodge');
  assert.ok(route.terrainImpact, `the same heavy body reaches the asteroid through Rapier: ${JSON.stringify({ enemyPos: route.enemy.pos, enemyVel: route.enemy.vel, latest: latestDecision(route)?.combatDoctrine, impacts: route.impacts.slice(-8) })}`);
  assert.ok(route.consequence, 'the physical terrain contact enters collision consequence/combat authority');
  assert.ok(route.consequence.impactDamage > 0, 'the Ramscoop mass makes its own collision consequential');
  assert.ok(route.vitalsAfter < route.vitalsBefore, 'normal combat vitals absorb the real impact');
});

test('a production projectile that removes the armored prow revokes the ram and changes the physical route', async (t) => {
  const route = await runRamscoopRoute(t, { stripProw: true });
  assert.equal(route.prow.data.heavyPartState, 'debris');
  assert.equal(route.enemy.data.heavyProwDisabled, true);
  assert.equal(route.enemy.data.intent.ramPlate, false);
  assert.equal(route.commit, null, 'the live doctrine falls back once the physical plate is gone');
  assert.equal(route.terrainImpact, null, 'the ordinary obstacle-aware fallback does not repeat the committed crash');
});

async function runRamscoopRoute(t, { stripProw }) {
  const route = await bootHeavyRoute(t, 'heavy_ramscoop', {
    playerPos: { x: 120, z: 0 }, enemyPos: { x: -180, z: 0 }, enemyRot: 0,
  });
  const rock = route.sim.spawn({
    type: 'asteroid', alive: true, collides: true,
    pos: { x: 220, z: 0 }, vel: { x: 0, z: 0 }, radius: 46, mass: 1e6,
    hull: 10_000, hullMax: 10_000, data: {},
  });
  // The new static must exist before the one backend preparation used by the route.
  assert.equal(await route.physicsSystem.prepareBackend(route.state, { reset: true }), true);
  assert.equal(route.state.physicsRuntime.diagnostics.backend, 'rapier-dynamic');

  const telegraphs = [];
  const impacts = [];
  const consequences = [];
  route.bus.on('ai:telegraph', (payload) => {
    if (payload?.entityId === route.enemy.id) telegraphs.push(payload);
  });
  route.bus.on('physics:impact', (payload) => impacts.push(payload));
  route.bus.on('combat:collisionConsequence', (payload) => consequences.push(payload));

  const prowRecord = route.enemy.data.heavyPartsRuntime.parts.find((part) => part.partRole === 'prow');
  const prow = route.state.entities.get(prowRecord.entityId);
  if (stripProw) await productionShotStrip(route, prowRecord);

  const vitalsBefore = route.enemy.hull + route.enemy.armorHp + route.enemy.shield;
  let commit = null;
  let lockedPoint = null;
  for (let guard = 0; guard < 960; guard++) {
    const live = latestDecision(route)?.combatDoctrine || null;
    if (!commit && live?.phase === 'ram_commit') {
      commit = live;
      lockedPoint = { ...live.flightPoint };
      route.state.input.moveX = 1;
      route.state.input.moveZ = 0;
      route.state.input.boost = true;
    }
    if (stripProw) {
      route.state.input.moveX = 1;
      route.state.input.moveZ = 0;
    }
    route.sim.step(DT);
    if (impacts.some((payload) => pair(payload, route.enemy.id, rock.id))) break;
  }
  const terrainImpact = impacts.find((payload) => pair(payload, route.enemy.id, rock.id)) || null;
  const playerImpact = impacts.find((payload) => pair(payload, route.enemy.id, route.player.id)) || null;
  const consequence = consequences.find((payload) => payload.targetId === route.enemy.id && payload.surface === 'terrain') || null;
  return {
    ...route, rock, prow, telegraphs, impacts, commit, lockedPoint,
    terrainImpact, playerImpact, consequence,
    vitalsBefore,
    vitalsAfter: route.enemy.hull + route.enemy.armorHp + route.enemy.shield,
  };
}

async function bootHeavyRoute(t, enemyId, { playerPos, enemyPos, enemyRot }) {
  const priorFlag = COMBAT_FLAGS.weaponImpulseConsequences;
  // Ramscoop acceptance needs contact damage; Gunship acceptance isolates weapon/part authority so
  // an incidental hull bump cannot detach the mounts through parent death before the aimed shot.
  COMBAT_FLAGS.weaponImpulseConsequences = enemyId === 'heavy_ramscoop';
  t.after(() => { COMBAT_FLAGS.weaponImpulseConsequences = priorFlag; });
  const tactical = createTacticalAISystem({ config: { trace: { enabled: false } } });
  const systems = [physics, combat, actions, collisionConsequences, aiPorts, tactical, flightV3, heavyPartsRuntime, weapons];
  const updateOrder = [tactical, actions, flightV3, aiPorts, collisionConsequences, heavyPartsRuntime, weapons, physics, combat];
  const sim = createSimulation({ seed: 14143, systems, updateOrder });
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
  const player = sim.spawn(enemyId === 'heavy_gunship'
    ? physicalPlayer(playerPos, playerRot, 'ship_hornet', 'wpn_railgun_m', 1, true)
    : physicalPlayer(playerPos, playerRot, 'ship_hornet', 'wpn_railgun_m', 3));
  state.playerId = player.id;
  state.player.targetId = null;
  const enemy = sim.spawn(makeEnemySpawnSpec(enemyId, 9, enemyPos));
  enemy.rot = enemyRot;
  enemy.data.encounter = true;
  // Gunship does not add later fixtures, so its backend can be prepared immediately.
  if (enemyId === 'heavy_gunship') {
    assert.equal(await physicsSystem.prepareBackend(state, { reset: true }), true);
  }
  return { sim, state, bus, player, enemy, tactical, physicsSystem };
}

async function productionShotStrip(route, record) {
  const part = route.state.entities.get(record.entityId);
  assert.ok(part && part.data.heavyPartState === 'mounted');
  const weaponId = route.player.data.weapons[0].defId;
  const fired = [];
  const hits = [];
  const offFire = route.bus.on('combat:fire', (payload) => {
    if (payload?.ownerId === route.player.id && payload.weaponId === weaponId) {
      const projectile = [...route.state.entityList].reverse().find((entity) => entity.type === 'projectile'
        && entity.ownerId === route.player.id && entity.alive !== false);
      fired.push({ ...payload, componentTargetId: projectile?.data?.componentTargetId ?? null });
    }
  });
  const offHit = route.bus.on('projectile:hit', (payload) => {
    if (payload?.ownerId === route.player.id) hits.push(payload);
  });
  route.state.player.targetId = route.enemy.id;
  route.state.ui.componentSelection = {
    kind: 'heavyPart', targetId: route.enemy.id, componentId: record.partId,
  };
  route.state.input.autoAim = { targetId: route.enemy.id };
  try {
    for (let guard = 0; guard < 240 && !record.destroyed; guard++) {
      const livePart = route.state.entities.get(record.entityId);
      assert.ok(livePart && livePart.alive !== false, `${record.partId} remains a live shot target`);
      route.state.input.aimAngle = Math.atan2(
        livePart.pos.z - route.player.pos.z,
        livePart.pos.x - route.player.pos.x,
      );
      route.state.input.fire = true;
      route.state.input.fireGroup = 1;
      route.sim.step(DT);
    }
  } finally {
    route.state.input.fire = false;
    route.state.input.fireGroup = null;
    route.state.input.autoAim = null;
    route.state.ui.componentSelection = null;
    offFire?.();
    offHit?.();
  }
  assert.ok(fired.length > 0, `${record.partId} receives a catalog shot from the live Weapons owner`);
  assert.ok(fired.some((payload) => payload.componentTargetId === part.id),
    `${record.partId} stays bound to the production projectile: ${JSON.stringify(fired)}`);
  assert.ok(hits.some((payload) => payload.targetId === part.id && payload.weaponId === weaponId),
    `${record.partId} receives an unobstructed production hit: ${JSON.stringify(hits)}`);
  assert.equal(record.destroyed, true, `${record.partId} is stripped through production projectile/combat authority`);
  return part;
}

function latestDecision(route) {
  return route.tactical.stack?.lastResult?.decisions.find((entry) => entry.entityId === route.enemy.id) || null;
}

function liveWeaponParts(route) {
  return route.enemy.data.heavyPartsRuntime.parts
    .filter((record) => record.partRole === 'weapon' && record.destroyed !== true);
}

function partDistanceSq(route, record) {
  const part = route.state.entities.get(record.entityId);
  const dx = part.pos.x - route.player.pos.x;
  const dz = part.pos.z - route.player.pos.z;
  return dx * dx + dz * dz;
}

function physicalPlayer(pos, rot, shipId, weaponId, weaponCount, turretOnly = false) {
  const fittings = fittingsFromDefaultModules(shipId, Array(turretOnly ? 3 : weaponCount).fill(weaponId));
  if (turretOnly) {
    fittings[0] = null;
    fittings[1] = null;
  }
  return makeShipEntitySpec(shipId, {
    isPlayer: true, team: 0, factionId: 'faction_free', pos, rot, fittings,
  });
}

function pair(payload, a, b) {
  const ids = [payload?.aId, payload?.bId];
  return ids.includes(a) && ids.includes(b) && payload?.backend === 'rapier-dynamic';
}
