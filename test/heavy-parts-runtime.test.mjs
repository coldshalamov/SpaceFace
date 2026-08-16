import assert from 'node:assert/strict';
import test from 'node:test';

import { couplingScale } from '../src/core/fields/fieldKernel.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { Masks } from '../src/core/entity.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { WEAPONS } from '../src/data/weapons.js';
import { resolveBeamVerb } from '../src/combat/industrialBeam.js';
import { combat, makeEnemySpawnSpec } from '../src/systems/combat.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { describeEntity } from '../src/systems/interactionDescriptors.js';
import { heavyPartsRuntime } from '../src/systems/heavyPartsRuntime.js';
import { mining } from '../src/systems/mining.js';
import { physics } from '../src/core/physics.js';
import { buildWeaponDamagePacket, weapons } from '../src/systems/weapons.js';

const BEAM = WEAPONS.find((row) => row.id === 'wpn_heavy_beam_l');

function boot(t, enemyId = 'heavy_gunship', systems = [
  heavyPartsRuntime,
  weapons,
  physics,
  collisionConsequences,
  combat,
  mining,
]) {
  const previousImpulseFlag = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  t.after(() => { COMBAT_FLAGS.weaponImpulseConsequences = previousImpulseFlag; });
  const sim = createSimulation({ seed: 1414, systems });
  t.after(() => sim.dispose());
  const { state, bus, registry } = sim;
  state.mode = 'flight';
  state.settings.gameplay.difficulty = 'standard';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.input.actions = {};
  const player = sim.spawn({
    type: 'ship', team: 0, factionId: 'faction_free',
    pos: { x: -120, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 10, mass: 24, hull: 100, hullMax: 100,
    armorHp: 0, armorMax: 0, shield: 0, shieldMax: 0,
    cap: 1000, capMax: 1000, capRegen: 0, collides: true,
    data: { defId: 'ship_hitch', combatProfileId: 'combat_profile_standard_ship', weapons: [] },
  });
  state.playerId = player.id;
  const enemy = sim.spawn(makeEnemySpawnSpec(enemyId, 9, { x: 120, z: 0 }));
  const events = { hits: [], kills: [], loot: [], detached: [], aftermath: [], impacts: [] };
  bus.on('projectile:hit', (payload) => events.hits.push(payload));
  bus.on('entity:killed', (payload) => events.kills.push(payload));
  bus.on('loot:drop', (payload) => events.loot.push(payload));
  bus.on('heavyPart:detached', (payload) => events.detached.push(payload));
  bus.on('aftermath:created', (payload) => events.aftermath.push(payload));
  bus.on('physics:impact', (payload) => events.impacts.push(payload));
  return { sim, state, bus, registry, player, enemy, events };
}

function partRecord(route, predicate = () => true) {
  const record = route.enemy.data.heavyPartsRuntime.parts.find(predicate);
  assert.ok(record, 'authored heavy part record exists');
  const entity = route.state.entities.get(record.entityId);
  assert.ok(entity && entity.type === 'heavyPart', 'record resolves to a first-class physical child');
  return { record, entity };
}

function hitPart(route, record, damage = 10_000) {
  const entity = route.state.entities.get(record.entityId);
  route.bus.emit('projectile:hit', {
    targetId: entity.id,
    ownerId: route.player.id,
    damage,
    damageType: 'kinetic',
    weaponId: 'wpn_pulse_laser_s',
    pos: { x: entity.pos.x, z: entity.pos.z },
  });
  return entity;
}

function routeWeaponHit(route, target, weaponId) {
  const def = WEAPONS.find((row) => row.id === weaponId);
  assert.ok(def, `weapon definition ${weaponId} exists`);
  const dx = target.pos.x - route.player.pos.x;
  const dz = target.pos.z - route.player.pos.z;
  const length = Math.hypot(dx, dz) || 1;
  const approach = { x: dx / length, z: dz / length };
  const packet = buildWeaponDamagePacket({ defId: weaponId }, def, def.dmg, def.damageType, target.pos);
  packet.hit = {
    pos: { x: target.pos.x, z: target.pos.z },
    approach,
    normal: { x: -approach.x, z: -approach.z },
  };
  return route.registry.get('combat').ensureKernel().routeDamage({
    attackerId: route.player.id,
    targetId: target.id,
    packet,
    origin: { kind: 'weapon', id: weaponId, weaponId },
  });
}

function stripGunshipWeapons(route) {
  const records = route.enemy.data.heavyPartsRuntime.parts.filter((row) => row.partRole === 'weapon');
  assert.equal(records.length, 3);
  for (const record of records) if (!record.destroyed) hitPart(route, record);
  return records;
}

test('production projectile sweep hits the physical child and Rapier advances that same debris body', async (t) => {
  const route = boot(t);
  route.enemy.vel.set(37, 0, -11);
  route.enemy.angVel = 0.4;
  route.registry.get('heavyPartsRuntime').update(SIM_DT, route.state);
  const parentVitals = {
    hull: route.enemy.hull,
    armor: route.enemy.armorHp,
    shield: route.enemy.shield,
  };
  const { record, entity: child } = partRecord(route, (row) => row.partRole === 'weapon');
  const childId = child.id;
  assert.equal(route.state.entityIndex.physicsBodies.includes(child), false,
    'mounted local-follow body is outside Rapier authority');
  const parentVelocity = { x: route.enemy.vel.x, z: route.enemy.vel.z };
  const ox = child.pos.x - route.enemy.pos.x;
  const oz = child.pos.z - route.enemy.pos.z;
  const ol = Math.hypot(ox, oz) || 1;
  const ux = ox / ol;
  const uz = oz / ol;
  const start = { x: child.pos.x + ux * 30, z: child.pos.z + uz * 30 };
  const end = { x: child.pos.x - ux * 3, z: child.pos.z - uz * 3 };
  const projectile = route.sim.spawn({
    type: 'projectile', ownerId: route.player.id, team: route.player.team,
    pos: start, vel: { x: 0, z: 0 }, radius: 0.7, collides: true,
    data: {
      ownerId: route.player.id,
      damage: child.hullMax + 1,
      damageType: 'kinetic',
      weaponId: 'wpn_pulse_laser_s',
      spawnPos: start,
      maxDistance: 1000,
    },
  });
  projectile.prevPos.set(start.x, 0, start.z);
  projectile.pos.set(end.x, 0, end.z);

  route.registry.get('physics').sweepProjectiles(SIM_DT, route.state);

  assert.equal(route.events.hits.at(-1)?.targetId, childId, 'production swept collision resolves the child id');
  assert.equal(record.destroyed, true);
  assert.equal(child.id, childId, 'the mounted entity is detached rather than replaced');
  assert.equal(child.alive, true);
  assert.equal(child.data.heavyPartState, 'debris');
  assert.equal(child.physicsBody.dynamic, true);
  assert.equal(child.physicsBody.material, 'debris');
  assert.equal(route.state.entityIndex.physicsStatics.includes(child), false,
    'exact reindex removes the old physics layer');
  assert.equal(route.state.entityIndex.physicsDynamics.includes(child), true,
    'exact reindex admits the detached identity to dynamic physics without a tree rebuild');
  assert.ok(child.collisionMask & Masks.SHIP, 'detached body remains collision-bearing');
  assert.equal(child.data.masslineTetherable, true);
  assert.notEqual(child.angVel, route.enemy.angVel, 'detachment adds deterministic tumble');
  assert.ok(Math.hypot(child.vel.x - parentVelocity.x, child.vel.z - parentVelocity.z) < 30,
    'debris inherits measured parent velocity plus bounded tangential/separation motion');
  assert.deepEqual({ hull: route.enemy.hull, armor: route.enemy.armorHp, shield: route.enemy.shield }, parentVitals,
    'part HP is independent from parent vitals');
  assert.equal(route.events.kills.length, 0);
  assert.equal(route.events.loot.length, 0);
  assert.equal(route.events.aftermath.length, 0);
  assert.equal(route.state.entityList.filter((entity) => entity.type === 'heavyPart').length,
    route.enemy.data.heavyPartRecipe.parts.length, 'detachment cannot grow the recipe-bounded body count');

  const bound = route.enemy.data.weapons.filter((weapon) => weapon.heavyPartId === record.partId);
  assert.equal(bound.length, 1);
  assert.equal(bound[0].heavyPartDestroyed, true);
  assert.equal(route.enemy.data.weapons.filter((weapon) => weapon.heavyPartDestroyed === true).length, 1,
    'only the destroyed mount binding is disabled');

  const speed = Math.hypot(child.vel.x, child.vel.z);
  const uxDebris = child.vel.x / speed;
  const uzDebris = child.vel.z / speed;
  const payload = route.sim.spawn({
    type: 'payload',
    pos: {
      x: child.pos.x + uxDebris * (child.radius + 14),
      z: child.pos.z + uzDebris * (child.radius + 14),
    },
    vel: { x: 0, z: 0 },
    radius: 4,
    mass: 2,
    collides: true,
    collisionMask: Masks.HEAVY_PART,
    data: { payloadType: 'heavy_part_contact_fixture' },
  });
  const childStart = { x: child.pos.x, z: child.pos.z, rot: child.rot };
  const payloadStart = { x: payload.pos.x, z: payload.pos.z };
  const physicsSystem = route.registry.get('physics');
  assert.equal(await physicsSystem.prepareBackend(route.state, { reset: true }), true);
  assert.equal(route.state.physicsRuntime.diagnostics.backend, 'rapier-dynamic');
  assert.equal(route.state.physicsRuntime.diagnostics.sg02Ready, true);
  for (let i = 0; i < 90; i++) route.sim.step(SIM_DT);

  const debrisContact = route.events.impacts.find((impact) => {
    const ids = [impact.aId, impact.bId];
    return impact.backend === 'rapier-dynamic' && ids.includes(childId) && ids.includes(payload.id);
  });
  assert.ok(debrisContact, 'the detached child enters the live Rapier contact route');
  assert.ok(Math.hypot(child.pos.x - childStart.x, child.pos.z - childStart.z) > 1,
    'the same detached entity advances under inherited linear momentum');
  assert.ok(Math.abs(child.rot - childStart.rot) > 0.01, 'the same detached entity visibly tumbles');
  assert.ok(Math.hypot(payload.pos.x - payloadStart.x, payload.pos.z - payloadStart.z) > 0.25 ||
    Math.hypot(payload.vel.x, payload.vel.z) > 0.25, 'the detached body physically pushes the contacted payload');
  assert.equal(route.events.kills.length, 0);
  assert.equal(route.events.loot.length, 0);
  assert.equal(route.events.aftermath.length, 0);
});

test('selected component aim drives a continuous beam into the mounted child, not abstract parent HP', (t) => {
  const route = boot(t, 'heavy_gunship', [heavyPartsRuntime, weapons, combat]);
  const { record, entity: child } = partRecord(route, (row) => row.partRole === 'weapon');
  const ox = child.pos.x - route.enemy.pos.x;
  const oz = child.pos.z - route.enemy.pos.z;
  const ol = Math.hypot(ox, oz) || 1;
  route.player.pos.set(child.pos.x + ox / ol * 80, 0, child.pos.z + oz / ol * 80);
  const aim = Math.atan2(child.pos.z - route.player.pos.z, child.pos.x - route.player.pos.x);
  route.player.rot = aim;
  route.player.data.weapons = [{
    ...BEAM,
    defId: BEAM.id,
    slotIndex: 0,
    facing: 'front',
    gimbalArc: Math.PI,
    muzzleOffset: [0.8, 0],
    _cooldown: 0,
    _heat: 0,
  }];
  route.state.player.targetId = route.enemy.id;
  route.state.ui.componentSelection = {
    targetId: route.enemy.id,
    componentId: record.partId,
    stableKey: `id:${route.enemy.id}`,
    kind: 'heavyPart',
    verb: 'damage',
  };
  route.state.input.fire = true;
  route.state.input.fireGroup = 1;
  route.state.input.aimAngle = aim;
  const childBefore = child.hull;
  const parentBefore = route.enemy.hull;

  route.sim.step(SIM_DT);

  assert.ok(child.hull < childBefore, 'live beam sweep damages the selected physical child');
  assert.equal(route.enemy.hull, parentBefore, 'beam selection does not seed abstract parent subsystem damage');
});

test('pre-strip hull is floored, weapon strip leaves a living barge, then Rapier terrain contact kills normally', async (t) => {
  const route = boot(t);
  const starter = WEAPONS.find((row) => row.id === 'wpn_pulse_laser_s');
  const shotsInsideTwentySeconds = Math.floor(starter.rof * 20);
  for (let i = 0; i < shotsInsideTwentySeconds; i++) {
    route.bus.emit('projectile:hit', {
      targetId: route.enemy.id,
      ownerId: route.player.id,
      damage: starter.dmg,
      damageType: starter.damageType,
      weaponId: starter.id,
      pos: { x: route.enemy.pos.x, z: route.enemy.pos.z },
    });
  }
  assert.equal(route.enemy.alive, true, 'starter-fit authored cadence cannot kill the fresh heavy inside 20s');

  route.bus.emit('projectile:hit', {
    targetId: route.enemy.id,
    ownerId: route.player.id,
    damage: 10_000,
    damageType: 'kinetic',
    weaponId: starter.id,
    pos: { x: route.enemy.pos.x, z: route.enemy.pos.z },
  });
  assert.equal(route.enemy.hull, 1, 'pre-strip direct damage is lethality-floored');
  assert.equal(route.events.kills.length, 0);

  route.enemy.vel.set(180, 0, 0);
  const physicsSystem = route.registry.get('physics');
  assert.equal(await physicsSystem.prepareBackend(route.state, { reset: true }), true);
  assert.equal(route.state.physicsRuntime.diagnostics.backend, 'rapier-dynamic');
  assert.equal(route.state.physicsRuntime.diagnostics.sg02Ready, true);
  const impulse = routeWeaponHit(route, route.enemy, 'wpn_concussion_cannon_m');
  assert.equal(impulse.ok, true);
  assert.equal(impulse.impulseApplied, true, 'the pre-strip shove crosses production combat physics');
  assert.equal(route.enemy.alive, true, 'the production impulse is still lethality-floored before strip');

  stripGunshipWeapons(route);
  const runtime = route.enemy.data.heavyPartsRuntime;
  assert.equal(runtime.disabled, true);
  assert.equal(runtime.lethalLocked, false, 'the authored strip releases later terrain lethality');
  assert.equal(route.enemy.alive, true, 'strip transition leaves a living body');
  assert.equal(route.enemy.data.towable, true);
  assert.equal(route.enemy.data.beamExtractableHeavy, true);
  assert.equal(route.enemy.data.ai.passive, true);
  assert.ok(route.enemy.data.weapons.every((weapon) => weapon.heavyPartDestroyed === true));

  route.enemy.shield = 0;
  route.enemy.armorHp = 0;
  const rock = route.sim.spawn({
    type: 'asteroid', pos: { x: route.enemy.pos.x + 100, z: route.enemy.pos.z },
    vel: { x: 0, z: 0 }, radius: 20, mass: 1e6, collides: true, data: {},
  });
  for (let i = 0; i < 90 && route.enemy.alive; i++) route.sim.step(SIM_DT);

  assert.equal(route.enemy.alive, false, 'post-strip terrain damage uses the normal lethal path');
  const impact = route.events.impacts.find((payload) => {
    const ids = [payload.aId, payload.bId];
    return payload.backend === 'rapier-dynamic' && ids.includes(route.enemy.id) && ids.includes(rock.id);
  });
  assert.ok(impact, 'Rapier reports the physical disabled-barge/asteroid contact');
  const kill = route.events.kills.find((payload) => payload.id === route.enemy.id);
  assert.ok(kill);
  assert.equal(kill.killerId, route.player.id, 'normal collision provenance survives the barge transition');
});

test('industrial beam accepts only the tagged disabled heavy and yields one finite physical payload', (t) => {
  const route = boot(t);
  const liveDescriptor = describeEntity(route.state, route.enemy);
  assert.equal(resolveBeamVerb(liveDescriptor, { mode: 'extract' }).ok, false, 'ordinary live ship is not extractable');
  assert.equal(route.registry.get('mining')._isValidMineableTarget(route.enemy, route.player, 1000, route.state), false);

  stripGunshipWeapons(route);
  const disabledDescriptor = describeEntity(route.state, route.enemy);
  assert.deepEqual(resolveBeamVerb(disabledDescriptor, { mode: 'auto' }).verb, 'extract');
  assert.equal(resolveBeamVerb(disabledDescriptor, { mode: 'extract' }).ok, true);
  route.state.player.tether = { active: true, targetId: route.enemy.id };
  assert.equal(route.registry.get('mining')._isValidMineableTarget(route.enemy, route.player, 1000, route.state), true);

  const beforePayloads = route.state.entityList.filter((entity) => entity.type === 'payload').length;
  const miner = route.registry.get('mining');
  assert.equal(miner._extractDisabledHeavy(route.player, route.enemy, 10_000, 1), true);
  assert.equal(miner._extractDisabledHeavy(route.player, route.enemy, 10_000, 1), false);
  const payloads = route.state.entityList.filter((entity) => entity.type === 'payload');
  assert.equal(payloads.length, beforePayloads + 1);
  assert.equal(payloads.at(-1).data.payloadType, 'disabled_heavy_extract');
  assert.equal(payloads.at(-1).collides, true);
  assert.equal(route.enemy.alive, true, 'extraction does not delete the towable hulk');
  assert.equal(route.enemy.data.beamExtractableHeavy, false, 'finite extraction cannot be repeated');
});

test('field coupling reaches the exact Iron Maw floor and stays below a light hull response', () => {
  const light = couplingScale({ type: 'ship', mass: 12 });
  const gunshipSpec = makeEnemySpawnSpec('heavy_gunship', 1, { x: 0, z: 0 });
  const ironMawSpec = makeEnemySpawnSpec('dreadnought_boss', 2, { x: 0, z: 0 });
  const gunship = couplingScale({ type: gunshipSpec.type, mass: gunshipSpec.mass });
  const ironMaw = couplingScale({ type: ironMawSpec.type, mass: ironMawSpec.mass });
  assert.equal(light, 1);
  assert.equal(ironMaw, 0.05);
  assert.ok(gunship < light && ironMaw < gunship);
});
