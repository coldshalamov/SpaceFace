// PR95 Plan 19 — physical Crystal Shoals acceptance.
//
// The route boots production anomalyRuntime -> rapier-dynamic Physics. Chimes must therefore begin
// with a real contact-force receipt; the test never calls the anomaly's private handler or writes a
// crystal pose after spawn to manufacture a receipt.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { DEFAULT_MASK, Masks } from '../src/core/entity.js';
import { physics } from '../src/core/physics.js';
import { readPhysicsTelemetry } from '../src/core/physicsAuthority.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  PALLAS_CRYSTAL_SHOAL,
  crystalShoalForSector,
} from '../src/data/anomalySites.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { SECTORS } from '../src/data/sectors.js';
import { SECTOR_ZONES } from '../src/data/sectorZones.js';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { save } from '../src/save/saveSystem.js';
import { anomalyRuntime } from '../src/systems/anomalyRuntime.js';
import { combat } from '../src/systems/combat.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';
import { cycleTarget } from '../src/ui/uiRoot.js';

const SHOAL = PALLAS_CRYSTAL_SHOAL;

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalAnchor() {
  const zone = (SECTOR_ZONES[SHOAL.sectorId] || [])
    .find((candidate) => candidate && candidate.id === SHOAL.zoneId);
  assert.ok(zone && zone.center, 'canonical Pallas mining belt exists');
  const sector = SECTORS.find((candidate) => candidate && candidate.id === SHOAL.sectorId);
  const field = (sector && sector.fields || [])
    .find((candidate) => candidate.id === SHOAL.iceFieldId && candidate.type === SHOAL.iceFieldType);
  assert.ok(field, 'canonical Pallas ice field exists');
  return sectorLocalToGlobalForSector(zone.center, SHOAL.sectorId);
}

function liveCrystals(state) {
  return (state.entityList || []).filter((entity) => entity && entity.alive !== false
    && entity.type === 'drone' && entity.data && entity.data.crystalShoalId === SHOAL.id)
    .sort((a, b) => a.data.crystalSlot - b.data.crystalSlot);
}

function descriptorFingerprint(state) {
  const center = canonicalAnchor();
  return liveCrystals(state).map((body) => ({
    slot: body.data.crystalSlot,
    stableId: body.data.anomalyStableId,
    x: body.pos.x - center.x,
    z: body.pos.z - center.z,
    vx: body.vel.x,
    vz: body.vel.z,
    rot: body.rot,
    angVel: body.angVel,
    radius: body.radius,
    mass: body.mass,
    motionProfileId: body.data.motionProfileId,
  }));
}

async function boot(seed = 1901990, options = {}) {
  const bus = createBus();
  const sim = createSimulation({
    seed,
    bus,
    systems: [anomalyRuntime, physics, combat, save],
    updateOrder: options.updatePhysics === false
      ? [anomalyRuntime, combat, save]
      : [anomalyRuntime, physics, combat, save],
  });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SHOAL.sectorId;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';

  const center = canonicalAnchor();
  const fittings = fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules);
  const spec = makeShipEntitySpec(NEW_GAME.shipId, {
    isPlayer: true,
    player: state.player,
    fittings,
    pos: { x: center.x + 500, z: center.z + 500 },
    rot: 0,
  });
  spec.flags = { ...(spec.flags || {}), persistent: true };
  spec.collisionMask = DEFAULT_MASK.ship;
  const player = sim.spawn(spec);
  state.playerId = player.id;

  const events = { impacts: [], chimes: [], audio: [], rewards: [], damage: [] };
  bus.on('physics:impact', (payload) => events.impacts.push(deepCopy(payload)));
  bus.on('anomaly:crystalChime', (payload) => events.chimes.push(deepCopy(payload)));
  bus.on('audio:cue', (payload) => events.audio.push(deepCopy(payload)));
  bus.on('combat:damage', (payload) => events.damage.push(deepCopy(payload)));
  for (const event of ['loot:drop', 'economy:grantCredits', 'lootShards:spawn', 'entity:killed']) {
    bus.on(event, (payload) => events.rewards.push({ event, payload: deepCopy(payload) }));
  }

  const physicsOwner = sim.registry.get('physics');
  if (options.preparePhysics !== false) {
    assert.equal(await physicsOwner.prepareBackend(state, { reset: true }), true,
      'real rapier-dynamic authority starts');
  }
  sim.runTicks(options.initialTicks ?? 3);
  return { sim, bus, state, player, events, physicsOwner };
}

function dispose(route) {
  if (route.physicsOwner && typeof route.physicsOwner._disableSg02DynamicAuthority === 'function') {
    route.physicsOwner._disableSg02DynamicAuthority();
  }
  route.sim.dispose();
}

test('one canonical Pallas ice-belt field stays outside combat, Massline, HP, mining, and reward rosters', async () => {
  const admitted = SECTORS.filter((sector) => crystalShoalForSector(sector.id));
  assert.deepEqual(admitted.map((sector) => sector.id), [SHOAL.sectorId]);
  assert.ok(admitted.length < SECTORS.length / 2, 'the singing field is a minority-sector observation');
  assert.equal(crystalShoalForSector('sector_helios_prime'), null);
  canonicalAnchor();

  const route = await boot();
  try {
    const bodies = liveCrystals(route.state);
    assert.equal(bodies.length, SHOAL.count);
    assert.equal(new Set(bodies.map((body) => body.data.anomalyStableId)).size, SHOAL.count);
    for (const body of bodies) {
      assert.equal(body.data.neutralAnomalyBody, true);
      assert.equal(body.flags.invuln, true);
      assert.equal(body.flags.persistent, false);
      assert.equal(body.data.worldSiteTargetable, false);
      assert.equal(body.data.targetable, false);
      assert.equal(body.data.noHudHealth, true);
      assert.equal(body.data.noOrdinaryRewards, true);
      assert.deepEqual(body.data.loot, []);
      assert.deepEqual(body.data.weapons, []);
      assert.equal(body.data.iceFieldId, SHOAL.iceFieldId);
      assert.equal(body.data.motionProfileId, 'drift_shear');
      assert.equal(isAttachable(body, route.player.id), false);
      assert.equal(readPhysicsTelemetry(body)?.dynamic, true, 'each growth is a real Rapier body');
    }
    assert.ok(bodies.every((body) => route.state.entityIndex.drones.includes(body)),
      'growths retain only the proven drone physics category');
    for (const roster of ['shipLike', 'damageables', 'aiShips', 'weaponShips', 'mineables', 'payloads']) {
      assert.ok(bodies.every((body) => !route.state.entityIndex[roster].includes(body)),
        `neutral anomaly matter is excluded from ${roster}`);
    }

    const ordinary = route.sim.spawn({
      type: 'drone', team: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
      radius: 2, mass: 3, hull: 10, hullMax: 10, collides: false,
      data: { kind: 'ordinary-drone-control' },
    });
    route.sim.runTicks(1);
    assert.ok(route.state.entityIndex.shipLike.includes(ordinary));
    assert.ok(route.state.entityIndex.damageables.includes(ordinary));
    assert.equal(isAttachable(ordinary, route.player.id), true,
      'ordinary drones keep their existing craft and Massline behavior');

    route.player.pos.set(canonicalAnchor().x, 0, canonicalAnchor().z);
    route.player.prevPos.copy(route.player.pos);
    route.state.player.targetId = null;
    cycleTarget(route.state, 1, route.bus);
    assert.equal(route.state.player.targetId, null);
    assert.deepEqual(route.events.rewards, []);
  } finally {
    dispose(route);
  }
});

test('real Rapier player and debris contacts sound bounded positional chimes without damage or value', async () => {
  const priorImpactReceipts = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  const route = await boot(1901991);
  try {
    const [playerCrystal, debrisCrystal] = liveCrystals(route.state);
    const opening = {
      hull: route.player.hull,
      credits: route.state.player.credits,
      cargo: deepCopy(route.state.player.cargo.items),
    };

    const separation = Math.max(1, route.player.radius + playerCrystal.radius - 0.6);
    route.player.pos.set(playerCrystal.pos.x - separation, 0, playerCrystal.pos.z);
    route.player.prevPos.copy(route.player.pos);
    route.player.vel.set(playerCrystal.vel.x + 82, 0, playerCrystal.vel.z);
    assert.equal(await route.physicsOwner.prepareBackend(route.state, { reset: true }), true);
    for (let tick = 0; tick < 18 && route.events.chimes.length === 0; tick++) route.sim.step(SIM_DT);

    const playerChime = route.events.chimes.find((entry) => entry.crystalId === playerCrystal.id
      && entry.contactType === 'player');
    assert.ok(playerChime, 'player crossing/contact starts from a real crystal physics impact');
    assert.equal(playerChime.physicsBackend, 'rapier-dynamic');
    assert.equal(playerChime.audioRecipeId, 'sfx_vent_chime');
    assert.equal(playerChime.reward, false);
    assert.equal(playerChime.damage, false);
    assert.ok(route.events.impacts.some((entry) => entry.backend === 'rapier-dynamic'
      && (entry.aId === playerCrystal.id || entry.bId === playerCrystal.id)
      && entry.playerInvolved));
    assert.ok(route.events.audio.some((entry) => entry.sourceEvent === 'anomaly:crystalChime'
      && entry.id === 'sfx_vent_chime' && entry.sourceEntityId === playerCrystal.id));

    const debris = route.sim.spawn({
      type: 'wreck',
      team: 2,
      pos: { x: debrisCrystal.pos.x - debrisCrystal.radius - 5.4, z: debrisCrystal.pos.z },
      vel: { x: debrisCrystal.vel.x + 54, z: debrisCrystal.vel.z },
      radius: 5,
      mass: 18,
      hull: 1,
      hullMax: 1,
      collides: true,
      collisionMask: Masks.DRONE,
      flags: { invuln: true },
      physicsBody: {
        schemaVersion: 1,
        radius: 5,
        mass: 18,
        inertiaY: 225,
        dynamic: true,
        ccd: false,
        shape: 'ball',
        material: 'debris',
        revision: 0,
      },
      data: { kind: 'test_debris', noOrdinaryRewards: true, salvagePool: {} },
    });
    for (let tick = 0; tick < 30 && !route.events.chimes.some((entry) => entry.contactEntityId === debris.id); tick++) {
      route.sim.step(SIM_DT);
    }
    const debrisChime = route.events.chimes.find((entry) => entry.contactEntityId === debris.id);
    assert.ok(debrisChime, 'ordinary dynamic debris passing through a growth also sounds the field');
    assert.equal(debrisChime.contactType, 'wreck');

    const chimeCount = route.events.chimes.length;
    route.bus.emit('physics:impact', {
      consequenceKernelVersion: 1,
      backend: 'forged',
      tick: route.state.tick,
      aId: playerCrystal.id,
      bId: route.player.id,
      dp: 50,
      pos: { x: playerCrystal.pos.x, z: playerCrystal.pos.z },
    });
    assert.equal(route.events.chimes.length, chimeCount,
      'per-body sim-time cooldown prevents contact-force spam from becoming a chord flood');
    assert.equal(route.player.hull, opening.hull);
    assert.equal(route.state.player.credits, opening.credits);
    assert.deepEqual(route.state.player.cargo.items, opening.cargo);
    assert.equal(playerCrystal.hull, 1);
    assert.equal(debrisCrystal.hull, 1);
    assert.deepEqual(route.events.rewards, []);
    assert.deepEqual(route.events.damage, [], 'the anomaly never authors a damage packet');
  } finally {
    dispose(route);
    COMBAT_FLAGS.weaponImpulseConsequences = priorImpactReceipts;
  }
});

test('Continue and sector re-entry deterministically rematerialize one transient singing field', async () => {
  const route = await boot(1901992, {
    preparePhysics: false,
    updatePhysics: false,
    initialTicks: 3,
  });
  try {
    const initial = descriptorFingerprint(route.state);
    const saveOwner = route.sim.registry.get('save');
    const envelope = saveOwner.serialize('plan19-crystal-shoal');
    assert.equal(envelope.data.entities.persistent.some((entity) => entity.data
      && entity.data.crystalShoalId === SHOAL.id), false, 'singing-field bodies are transient');
    assert.equal(saveOwner.loadEnvelope(deepCopy(envelope), 'plan19-crystal-shoal'), true,
      'real Continue restores through the registered production save owner');
    route.sim.runTicks(2);
    assert.deepEqual(descriptorFingerprint(route.state), initial,
      'Continue reconstructs the same stable descriptors without duplicate bodies');

    route.state.world.currentSectorId = 'sector_helios_prime';
    route.sim.runTicks(2);
    assert.equal(liveCrystals(route.state).length, 0);
    route.state.world.currentSectorId = SHOAL.sectorId;
    route.sim.runTicks(2);
    assert.deepEqual(descriptorFingerprint(route.state), initial,
      'sector re-entry reconstructs the same ice-field observation exactly once');

    const body = liveCrystals(route.state)[0];
    const beforeRapier = { x: body.pos.x, z: body.pos.z, rot: body.rot };
    assert.equal(await route.physicsOwner.prepareBackend(route.state, { reset: true }), true);
    route.physicsOwner.update(SIM_DT, route.state);
    route.physicsOwner.update(SIM_DT, route.state);
    assert.ok(Math.hypot(body.pos.x - beforeRapier.x, body.pos.z - beforeRapier.z) > 0.001
      || Math.abs(body.rot - beforeRapier.rot) > 0.0001,
    'the rematerialized growth resumes shared drift-shear/Rapier motion');
  } finally {
    dispose(route);
  }
});

test('production visualFactory builds designed hard-3D mineral clusters with reduced-flash treatment', async () => {
  const route = await boot(1901993);
  try {
    const body = liveCrystals(route.state)[0];
    const root = createVisualFactory().build(body);
    const presentation = root.userData.crystalShoalPresentation;
    assert.equal(presentation.construction,
      'hard_3d_fractured_root_custom_faceted_prisms_and_interior_lattice');
    assert.equal(presentation.cameraFacing, false);
    assert.equal(presentation.sprites, 0);
    assert.equal(presentation.points, 0);
    assert.equal(presentation.textureCards, 0);
    assert.ok(root.getObjectByName('CrystalShoalFracturedRoot')?.isMesh);
    assert.ok(root.getObjectByName('CrystalShoalPrismaticGrowths')?.isGroup);
    assert.ok(root.getObjectByName('CrystalFacetedPrism_0')?.isMesh);
    assert.ok(root.getObjectByName('CrystalFacetEdges_0')?.isLineSegments);
    assert.ok(root.getObjectByName('CrystalShoalInteriorLattice')?.isLineSegments);
    assert.equal(root.getObjectByName('DroneCore'), undefined,
      'the physics-category reuse never leaks the mechanical drone visual');

    body.data.crystalMotionReduce = true;
    body.data.crystalFlashReduce = true;
    root.getObjectByName('CrystalShoalFracturedRoot').onBeforeRender();
    assert.equal(presentation.reducedMotion, true);
    assert.equal(presentation.reducedFlash, true);
  } finally {
    dispose(route);
  }
});
