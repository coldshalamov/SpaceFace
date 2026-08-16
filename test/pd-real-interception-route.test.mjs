import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { WEAPONS } from '../src/data/weapons.js';
import { applyAIFiringIntent } from '../src/systems/aiFireIntent.js';
import { heavyPartsRuntime } from '../src/systems/heavyPartsRuntime.js';
import { combat, makeEnemySpawnSpec } from '../src/systems/combat.js';
import { weapons } from '../src/systems/weapons.js';
import { physics } from '../src/core/physics.js';
import { ObjectiveKind } from '../src/ai/contracts.js';
import { sweptAssignedProjectileContact } from '../src/combat/projectileInterception.js';
import { authorizeAIEngagement } from '../src/ai/engagementAuthority.js';

const MISSILE = WEAPONS.find((row) => row.id === 'wpn_missile_rack_m');
const SIEGE = WEAPONS.find((row) => row.id === 'wpn_siege_lance_l');

function boot(t, { ironMaw = false } = {}) {
  const systems = ironMaw
    ? [heavyPartsRuntime, weapons, physics, combat]
    : [weapons, physics, combat];
  const sim = createSimulation({ seed: ironMaw ? 141502 : 141501, systems });
  t.after(() => sim.dispose());
  const { state, bus, registry } = sim;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.difficulty = 'standard';
  state.world.currentSectorId = 'sector_ceres_belt';
  state.input.actions = {};

  const attacker = sim.spawn({
    type: 'ship', team: 0, factionId: 'faction_free',
    pos: { x: -500, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 10, mass: 24, hull: 500, hullMax: 500,
    shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0,
    cap: 2000, capMax: 2000, capRegen: 0, collides: true,
    data: { combatProfileId: 'combat_profile_standard_ship', weapons: [], combat: {} },
  });
  state.playerId = attacker.id;

  const receipts = [];
  const hits = [];
  const fires = [];
  const kills = [];
  bus.on('combat:projectileIntercepted', (payload) => receipts.push(payload));
  bus.on('projectile:hit', (payload) => hits.push({ tick: state.tick, ...payload }));
  bus.on('combat:fire', (payload) => fires.push(payload));
  bus.on('entity:killed', (payload) => kills.push(payload));
  return { sim, state, bus, registry, attacker, receipts, hits, fires, kills };
}

function runtimeWeapon(def, slotIndex = 0) {
  return {
    ...def,
    defId: def.id,
    slotIndex,
    facing: def.tracking === 'auto_turret' ? 'turret' : 'front',
    facingAngle: 0,
    gimbalArc: Math.PI,
    muzzleOffset: [0.8, 0],
    _cooldown: 0,
    _heat: 0,
  };
}

function launchOrdnance(route, target, offsetZ = 0) {
  const host = route.registry.get('weapons');
  const dir = Math.atan2(target.pos.z - route.attacker.pos.z, target.pos.x - route.attacker.pos.x);
  const projectile = host._spawnProjectile(
    route.attacker,
    runtimeWeapon(MISSILE),
    MISSILE,
    dir,
    target,
    true,
    route.state,
  );
  if (offsetZ) {
    projectile.pos.z += offsetZ;
    projectile.prevPos.z += offsetZ;
    projectile.data.spawnPos.z += offsetZ;
  }
  return projectile;
}

function pdDecision(entityId, wardId, doctrineId = 'interceptor_flyby', phase = 'strike') {
  return {
    entityId,
    action: { actionId: `pd-production-fire-${String(entityId)}` },
    directive: {
      tactic: 'pd_screen',
      objective: {
        kind: ObjectiveKind.SCREEN,
        targetId: wardId,
        reason: `combat_doctrine:${doctrineId}:${phase}`,
      },
    },
    combatDoctrine: {
      fireWindow: true,
      doctrineId,
      phase,
    },
  };
}

async function prepareRapier(route) {
  const owner = route.registry.get('physics');
  assert.equal(await owner.prepareBackend(route.state, { reset: true }), true);
  assert.equal(route.state.physicsRuntime.diagnostics.backend, 'rapier-dynamic');
  assert.equal(route.state.physicsRuntime.diagnostics.sg02Ready, true);
}

function stepWithPd(route, pd, ward) {
  const doctrineId = pd.data && pd.data.ai && pd.data.ai.combatDoctrineId || 'interceptor_flyby';
  const phase = doctrineId === 'capital_broadside' ? 'pd_intercept' : 'strike';
  applyAIFiringIntent(pdDecision(pd.id, ward.id, doctrineId, phase), route.state);
  route.sim.step(SIM_DT);
}

async function fireRealGun(route, target, def = SIEGE, shooter = route.attacker, options = {}) {
  const dx = target.pos.x - shooter.pos.x;
  const dz = target.pos.z - shooter.pos.z;
  const dir = Math.atan2(dz, dx) + (Number(options.directionOffset) || 0);
  const expectedTarget = options.expectedTarget || target;
  const projectile = route.registry.get('weapons')._spawnProjectile(
    shooter,
    runtimeWeapon(def, 90),
    def,
    dir,
    target,
    false,
    route.state,
  );
  if (target.type === 'heavyPart') {
    assert.equal(projectile.data.componentTargetId, target.id,
      'catalog projectile preserves the exact selected mounted component binding');
  }
  const before = route.hits.length;
  for (let tick = 0; tick < 180 && projectile.alive; tick++) route.sim.step(SIM_DT);
  const newHits = route.hits.slice(before);
  const hit = newHits.find((payload) => payload.targetId === expectedTarget.id);
  assert.ok(hit, `real ${def.id} projectile reaches target ${String(expectedTarget.id)}; diag=${JSON.stringify({
    shooter: { id: shooter.id, pos: shooter.pos },
    target: { id: target.id, pos: target.pos, state: target.data && target.data.heavyPartState },
    projectile: { id: projectile.id, alive: projectile.alive, pos: projectile.pos },
    hits: newHits.map((row) => row.targetId),
  })}`);
  return hit;
}

function spawnOutsideComponentGunner(route, parent, part) {
  const ox = part.pos.x - parent.pos.x;
  const oz = part.pos.z - parent.pos.z;
  const length = Math.hypot(ox, oz) || 1;
  const distance = (Number(parent.radius) || 0) + 90;
  return route.sim.spawn({
    type: 'ship', team: 0, factionId: 'faction_free',
    pos: { x: parent.pos.x + ox / length * distance, z: parent.pos.z + oz / length * distance },
    vel: { x: 0, z: 0 }, rot: Math.atan2(-oz, -ox), radius: 1, mass: 24,
    hull: 200, hullMax: 200, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0,
    collides: false, data: { combatProfileId: 'combat_profile_standard_ship', weapons: [] },
  });
}

test('dedicated PD spends two real contacts, leaks the saturated missile, and gun removal leaves the ward open', async (t) => {
  const route = boot(t);
  const ward = route.sim.spawn({
    type: 'ship', team: 1, factionId: 'faction_reach',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 15, mass: 55,
    hull: 500, hullMax: 500, shield: 240, shieldMax: 240,
    armorHp: 0, armorMax: 0, collides: true,
    data: { combatProfileId: 'combat_profile_standard_ship', ai: { squadId: 'pd-route', encounterRole: 'leader' } },
  });
  const pd = route.sim.spawn(makeEnemySpawnSpec('pd_screen_escort', 5, { x: 100, z: 48 }, {
    zoneId: 'zone_pd_route',
    motive: 'assigned_interdiction',
    engagementTrigger: 'authorized_hostile_spawn',
  }));
  pd.data.ai.squadId = 'pd-route';
  pd.data.ai.escortTargetId = ward.id;
  pd.data.ai.forcePlayerTarget = true;
  pd.data.ai.activity = {
    kind: 'screen', targetId: ward.id, reason: 'pd_route',
    anchor: { x: 100, z: 48 }, leashRadius: 2600, startedTick: 0,
  };
  pd.data.ai.roe = 'weapons_free';
  pd.rot = Math.PI;
  await prepareRapier(route);

  const incoming = [];
  const pdTrace = [];
  const boundShotIds = new Set();
  for (let tick = 0; tick < 360; tick++) {
    if (tick === 0) {
      incoming.push(launchOrdnance(route, ward));
      incoming.push(launchOrdnance(route, ward));
      incoming.push(launchOrdnance(route, ward));
    }
    stepWithPd(route, pd, ward);
    for (const shot of route.state.entityList.filter((row) => row.alive && row.data && row.data.pdIntercept)) {
      boundShotIds.add(shot.id);
      const assigned = route.state.entities.get(shot.data.pdIntercept.incomingId);
      if (pdTrace.length < 12) pdTrace.push({
        tick: route.state.tick,
        shot: { id: shot.id, pos: { x: shot.pos.x, z: shot.pos.z }, prev: { x: shot.prevPos.x, z: shot.prevPos.z }, vel: { x: shot.vel.x, z: shot.vel.z } },
        incoming: assigned && { id: assigned.id, pos: { x: assigned.pos.x, z: assigned.pos.z }, prev: { x: assigned.prevPos.x, z: assigned.prevPos.z }, vel: { x: assigned.vel.x, z: assigned.vel.z } },
        contact: assigned ? sweptAssignedProjectileContact(shot, assigned, SIM_DT) : null,
      });
    }
    if (route.receipts.length >= 2 && route.hits.some((payload) => payload.targetId === ward.id)) break;
  }

  assert.equal(route.receipts.length, 2,
    `the authored two-charge screen resolves two physical pairs; diag=${JSON.stringify({
      fires: route.fires.filter((row) => row.ownerId === pd.id).length,
      bound: route.state.entityList.filter((row) => row.data && row.data.pdIntercept).map((row) => ({ id: row.id, alive: row.alive, pos: row.pos, bind: row.data.pdIntercept })),
      pdRuntime: pd.data.pdScreenRuntime,
      hits: route.hits.map((row) => row.targetId),
      incoming: incoming.map((row) => ({ id: row.id, alive: row.alive, pos: row.pos })),
      pdTrace,
    })}`);
  assert.equal(new Set(route.receipts.map((row) => row.incomingId)).size, 2);
  assert.ok(route.receipts.every((row) => Object.isFrozen(row) && Object.isFrozen(row.position)));
  assert.ok(route.receipts.every((row) => row.defenderId === ward.id && row.shooterId === pd.id));
  assert.ok(route.receipts.every((row) => row.sourceId === pd.id));
  assert.ok(route.receipts.every((row) => incoming.some((projectile) => projectile.id === row.incomingId)));
  assert.equal(pd.data.pdScreenRuntime.activeIntercepts, 2,
    `both real contacts remain saturated; receipts=${JSON.stringify(route.receipts.map((row) => row.tick))} hits=${JSON.stringify(route.hits.map((row) => ({ tick: row.tick, targetId: row.targetId })))}`);
  const wardHit = route.hits.find((payload) => payload.targetId === ward.id);
  assert.ok(wardHit, 'the next real missile reaches the ward during saturation');
  const secondContactTick = route.receipts[1].tick;
  assert.deepEqual(route.receipts.map((row) => row.tick), [90, 113],
    'production contact ticks stay deterministic and physically separated');
  assert.equal(wardHit.tick, 156, 'the leaked missile lands on the authored production tick');
  assert.ok(wardHit.tick >= secondContactTick && wardHit.tick - secondContactTick < 45,
    `ward hit tick ${wardHit.tick} must precede recovery at ${secondContactTick + 45}`);
  assert.ok(ward.shield < ward.shieldMax || ward.hull < ward.hullMax, 'the leaked ordnance damages the real ward');
  assert.ok(route.receipts.every((receipt) => boundShotIds.has(receipt.interceptorId)),
    'real weapons fire produced the exact interceptor projectile ids later consumed by physics');
  assert.ok(route.fires.some((payload) => payload.ownerId === pd.id && payload.weaponId === 'wpn_flak_turret_s'));

  for (let shot = 0; shot < 4 && pd.alive; shot++) await fireRealGun(route, pd);
  assert.equal(pd.alive, false, 'a normal gun projectile removes the specialist source');
  const receiptsBefore = route.receipts.length;
  const hitsBefore = route.hits.length;
  launchOrdnance(route, ward);
  for (let tick = 0; tick < 240 && !route.hits.slice(hitsBefore).some((payload) => payload.targetId === ward.id); tick++) {
    route.sim.step(SIM_DT);
  }
  assert.equal(route.receipts.length, receiptsBefore, 'a destroyed source cannot intercept later ordnance');
  assert.ok(route.hits.slice(hitsBefore).some((payload) => payload.targetId === ward.id));
});

test('Iron Maw interception capacity comes from surviving physical PD children', async (t) => {
  const route = boot(t, { ironMaw: true });
  const maw = route.sim.spawn(makeEnemySpawnSpec('dreadnought_boss', 12, { x: 0, z: 0 }, {
    zoneId: 'zone_iron_maw_route',
    motive: 'capital_setpiece',
    engagementTrigger: 'authorized_hostile_spawn',
  }));
  maw.data.ai.forcePlayerTarget = true;
  maw.rot = Math.PI;
  route.state.tick = 120;
  route.state.simTime = 2;
  assert.deepEqual(authorizeAIEngagement({
    state: route.state,
    self: maw,
    target: route.attacker,
    tick: route.state.tick,
    objectiveReason: 'combat_doctrine:capital_broadside:pd_intercept',
  }), { ok: true, reason: 'authorized' });
  assert.deepEqual(authorizeAIEngagement({
    state: route.state,
    self: maw,
    target: route.attacker,
    tick: route.state.tick,
    objectiveReason: 'combat_doctrine:capital_broadside:broadside_fire',
  }), { ok: false, reason: 'doctrine_fire_window' },
  'capital admission is exact to pd_intercept and cannot open generic broadside fire');
  await prepareRapier(route);
  const runtime = maw.data.heavyPartsRuntime;
  const pdRecords = runtime.parts.filter((record) => record.binding
    && record.binding.kind === 'weapon'
    && record.binding.weaponId === 'wpn_flak_turret_s');
  assert.equal(pdRecords.length, 4);
  assert.ok(pdRecords.every((record) => !record.destroyed
    && route.state.entities.get(record.entityId)?.data?.heavyPartState === 'mounted'));

  const first = launchOrdnance(route, maw);
  for (let tick = 0; tick < 300 && route.receipts.length === 0; tick++) stepWithPd(route, maw, maw);
  assert.equal(route.receipts.length, 1);
  const receipt = route.receipts[0];
  assert.equal(receipt.incomingId, first.id);
  assert.equal(receipt.shooterId, maw.id);
  assert.ok(pdRecords.some((record) => record.entityId === receipt.sourceId
    && record.partId === receipt.sourcePartId), 'receipt names the exact mounted PD heavyPart source');

  const missRecord = pdRecords[0];
  const missPart = route.state.entities.get(missRecord.entityId);
  const missGunner = spawnOutsideComponentGunner(route, maw, missPart);
  await fireRealGun(route, missPart, SIEGE, missGunner, {
    directionOffset: 0.15,
    expectedTarget: maw,
  });
  assert.equal(missRecord.destroyed, false,
    'an explicitly selected but genuinely off-course component shot still lands on the parent');
  assert.equal(missPart.data.heavyPartState, 'mounted');

  for (const record of pdRecords) {
    const part = route.state.entities.get(record.entityId);
    const gunner = spawnOutsideComponentGunner(route, maw, part);
    await fireRealGun(route, part, SIEGE, gunner);
    assert.equal(record.destroyed, true);
    assert.equal(part.data.heavyPartState, 'debris');
  }
  assert.ok(pdRecords.every((record) => record.destroyed));
  assert.ok(maw.data.weapons.filter((weapon) => weapon.defId === 'wpn_flak_turret_s')
    .every((weapon) => weapon.heavyPartDestroyed === true));

  route.attacker.pos.set(-500, 0, 0);
  route.attacker.vel.set(0, 0, 0);
  const receiptsBefore = route.receipts.length;
  const hitsBefore = route.hits.length;
  launchOrdnance(route, maw);
  for (let tick = 0; tick < 360 && !route.hits.slice(hitsBefore).some((payload) => payload.targetId === maw.id); tick++) {
    stepWithPd(route, maw, maw);
  }
  assert.equal(route.receipts.length, receiptsBefore, 'zero surviving PD mounts means zero interception authority');
  assert.ok(route.hits.slice(hitsBefore).some((payload) => payload.targetId === maw.id),
    'later ordnance reaches the capital through the production projectile sweep');
});
