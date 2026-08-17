// PR95 Plan 19 — physical Drifter Shoals acceptance.
//
// The route boots production anomalyRuntime -> Fields -> rapier-dynamic Physics -> Combat. Drifter
// motion must therefore come from the shared Well impulse and Rapier contacts; the test never calls
// a wildlife steering helper or writes a post-spawn Drifter velocity to manufacture the result.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { DEFAULT_MASK, Masks } from '../src/core/entity.js';
import { physics } from '../src/core/physics.js';
import { readPhysicsTelemetry } from '../src/core/physicsAuthority.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  ORCUS_DRIFTER_SHOAL,
  ORCUS_GRAVITY_EDDY,
  drifterShoalForSector,
} from '../src/data/anomalySites.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { SECTORS } from '../src/data/sectors.js';
import { SECTOR_ZONES } from '../src/data/sectorZones.js';
import {
  DRIFTER_BIOLUMINESCENT_TRAIL_TINT,
  timeTrialLocalBoard,
} from '../src/data/timeTrialCourses.js';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { save } from '../src/save/saveSystem.js';
import { anomalyRuntime } from '../src/systems/anomalyRuntime.js';
import { combat } from '../src/systems/combat.js';
import { fields } from '../src/systems/fields.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';
import { timeTrials } from '../src/systems/timeTrials.js';
import { cycleTarget } from '../src/ui/uiRoot.js';

const SHOAL = ORCUS_DRIFTER_SHOAL;

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function anchor() {
  const zone = (SECTOR_ZONES[SHOAL.sectorId] || [])
    .find((candidate) => candidate && candidate.id === SHOAL.zoneId);
  assert.ok(zone && zone.center, 'canonical Orcus anomaly zone exists');
  return sectorLocalToGlobalForSector(zone.center, SHOAL.sectorId);
}

function liveDrifters(state) {
  return (state.entityList || []).filter((entity) => entity && entity.alive !== false
    && entity.type === 'drone' && entity.data && entity.data.drifterShoalId === SHOAL.id)
    .sort((a, b) => a.data.drifterSlot - b.data.drifterSlot);
}

function identityFingerprint(state) {
  return liveDrifters(state).map((body) => ({
    slot: body.data.drifterSlot,
    stableId: body.data.anomalyStableId,
    radius: body.radius,
  }));
}

function authoredPoseFingerprint(state) {
  const center = anchor();
  return liveDrifters(state).map((body) => ({
    slot: body.data.drifterSlot,
    stableId: body.data.anomalyStableId,
    x: body.pos.x - center.x,
    z: body.pos.z - center.z,
    radius: body.radius,
  }));
}

async function boot(seed = 1901910, options = {}) {
  const priorFields = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const bus = createBus();
  const spoken = [];
  const helpers = {
    voice: {
      say(payload) {
        spoken.push(deepCopy(payload));
        return true;
      },
    },
  };
  const sim = createSimulation({
    seed,
    bus,
    helpers,
    systems: [fields, anomalyRuntime, physics, combat, timeTrials, save],
    updateOrder: options.updatePhysics === false
      ? [anomalyRuntime, fields, combat, save]
      : [anomalyRuntime, fields, physics, combat, save],
  });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SHOAL.sectorId;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';

  const center = anchor();
  const fittings = fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules);
  const spec = makeShipEntitySpec(NEW_GAME.shipId, {
    isPlayer: true,
    player: state.player,
    fittings,
    pos: { x: center.x + 360, z: center.z + 360 },
    rot: 0,
  });
  spec.flags = { ...(spec.flags || {}), persistent: true };
  spec.collisionMask = DEFAULT_MASK.ship;
  const player = sim.spawn(spec);
  state.playerId = player.id;

  const events = { impacts: [], flickers: [], barks: [], outcomes: [], rewards: [] };
  bus.on('physics:impact', (payload) => events.impacts.push(deepCopy(payload)));
  bus.on('anomaly:drifterFlicker', (payload) => events.flickers.push(deepCopy(payload)));
  bus.on('anomaly:drifterUglinessBark', (payload) => events.barks.push(deepCopy(payload)));
  bus.on('combat:outcome', (payload) => events.outcomes.push(deepCopy(payload)));
  for (const event of ['loot:drop', 'economy:grantCredits', 'lootShards:spawn', 'entity:killed']) {
    bus.on(event, (payload) => events.rewards.push({ event, payload: deepCopy(payload) }));
  }

  const physicsOwner = sim.registry.get('physics');
  if (options.preparePhysics !== false) {
    assert.equal(await physicsOwner.prepareBackend(state, { reset: true }), true,
      'real rapier-dynamic authority starts');
  }
  sim.runTicks(options.initialTicks ?? 3);
  return { sim, bus, state, player, events, spoken, physicsOwner, priorFields };
}

function dispose(route) {
  if (route.physicsOwner && typeof route.physicsOwner._disableSg02DynamicAuthority === 'function') {
    route.physicsOwner._disableSg02DynamicAuthority();
  }
  route.sim.dispose();
  FIELD_FLAGS.enabled = route.priorFields;
}

test('one canonical shoal uses drone physics without entering craft, AI, target, reward, or HP rosters', async () => {
  const admitted = SECTORS.filter((sector) => drifterShoalForSector(sector.id));
  assert.deepEqual(admitted.map((sector) => sector.id), [SHOAL.sectorId]);
  assert.ok(admitted.length < SECTORS.length / 2, 'wildlife is a minority-sector observation');
  assert.equal(drifterShoalForSector('sector_helios_prime'), null);

  const route = await boot();
  try {
    const bodies = liveDrifters(route.state);
    assert.equal(bodies.length, SHOAL.count);
    assert.equal(new Set(bodies.map((body) => body.data.anomalyStableId)).size, SHOAL.count);
    for (const body of bodies) {
      assert.equal(body.data.neutralWildlife, true);
      assert.equal(body.flags.invuln, true);
      assert.equal(body.data.worldSiteTargetable, false);
      assert.equal(body.data.targetable, false);
      assert.equal(body.data.noHudHealth, true);
      assert.equal(body.data.noOrdinaryRewards, true);
      assert.deepEqual(body.data.loot, []);
      assert.deepEqual(body.data.weapons, []);
      assert.equal(isAttachable(body, route.player.id), false,
        'the real Massline acquisition owner excludes wildlife from PICK/READY hover receipts');
      assert.equal(readPhysicsTelemetry(body)?.dynamic, true, 'each Drifter is a real Rapier body');
    }
    assert.ok(bodies.every((body) => route.state.entityIndex.drones.includes(body)),
      'Drifters retain the proven drone physics category');
    for (const roster of ['shipLike', 'damageables', 'aiShips', 'weaponShips']) {
      assert.ok(bodies.every((body) => !route.state.entityIndex[roster].includes(body)),
        `neutral wildlife is excluded from ${roster}`);
    }

    const ordinary = route.sim.spawn({
      type: 'drone', team: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
      radius: 2, mass: 3, hull: 10, hullMax: 10, collides: false,
      data: { kind: 'ordinary-drone-control' },
    });
    route.sim.runTicks(1);
    assert.ok(route.state.entityIndex.shipLike.includes(ordinary));
    assert.ok(route.state.entityIndex.damageables.includes(ordinary),
      'ordinary drones keep the existing craft/HP roster behavior');
    assert.equal(isAttachable(ordinary, route.player.id), true,
      'ordinary drones keep the existing physical Massline eligibility');
    route.player.pos.set(anchor().x, 0, anchor().z);
    route.player.prevPos.copy(route.player.pos);
    route.state.player.targetId = null;
    cycleTarget(route.state, 1, route.bus);
    assert.equal(route.state.player.targetId, null,
      'the production target-cycle owner does not admit neutral Drifter wildlife');
    assert.deepEqual(route.events.rewards, []);
  } finally {
    dispose(route);
  }
});

test('the shared Gravity Eddy curves the real bodies and Rapier scatters one on player contact', async () => {
  const priorImpulseReceipts = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  const route = await boot(1901911);
  try {
    const center = anchor();
    const body = liveDrifters(route.state)[0];
    const start = {
      x: body.pos.x, z: body.pos.z,
      vx: body.vel.x, vz: body.vel.z,
    };
    const startDx = start.x - center.x;
    const startDz = start.z - center.z;
    const startRadial = (start.vx * startDx + start.vz * startDz) / Math.hypot(startDx, startDz);
    route.sim.runTicks(150);
    const dx = body.pos.x - center.x;
    const dz = body.pos.z - center.z;
    const curvedRadial = (body.vel.x * dx + body.vel.z * dz) / Math.hypot(dx, dz);
    assert.ok(Math.abs(curvedRadial - startRadial) > 6,
      `shared Well curves the tangential migration (${startRadial} -> ${curvedRadial})`);
    assert.ok(route.state.fields.telemetry.affected >= SHOAL.count,
      'Fields reports the live physical bodies in its bounded affected set');
    assert.equal(route.sim.registry.get('fields').hasExternal(ORCUS_GRAVITY_EDDY.field.id), true);

    const beforeContactSpeed = Math.hypot(body.vel.x, body.vel.z);
    const separation = Math.max(1, route.player.radius + body.radius - 0.5);
    route.player.pos.set(body.pos.x - separation, 0, body.pos.z);
    route.player.prevPos.copy(route.player.pos);
    route.player.vel.set(body.vel.x + 95, 0, body.vel.z);
    assert.equal(await route.physicsOwner.prepareBackend(route.state, { reset: true }), true);
    for (let tick = 0; tick < 12 && route.events.impacts.length === 0; tick++) route.sim.step(SIM_DT);
    const impact = route.events.impacts.find((entry) => entry.playerInvolved
      && (entry.aId === body.id || entry.bId === body.id));
    assert.ok(impact, 'ordinary player-body contact resolves through Rapier impact ownership');
    assert.ok(Math.abs(Math.hypot(body.vel.x, body.vel.z) - beforeContactSpeed) > 2,
      'the contacted Drifter scatters physically instead of playing a fake visual shove');
  } finally {
    dispose(route);
    COMBAT_FLAGS.weaponImpulseConsequences = priorImpulseReceipts;
  }
});

test('a real player projectile produces one flicker/bark but no damage, reward, or combat outcome', async () => {
  const route = await boot(1901912);
  try {
    const body = liveDrifters(route.state)[2];
    const projectile = route.sim.spawn({
      type: 'projectile',
      team: 0,
      ownerId: route.player.id,
      pos: { x: body.pos.x - 28, z: body.pos.z },
      vel: { x: 320, z: 0 },
      rot: 0,
      radius: 1,
      mass: 0.2,
      hull: 1,
      hullMax: 1,
      collides: true,
      collisionMask: Masks.DRONE,
      physicsBody: {
        schemaVersion: 1,
        radius: 1,
        mass: 0.2,
        inertiaY: 0.1,
        dynamic: true,
        ccd: true,
        material: 'projectile',
        revision: 0,
      },
      data: { damage: 40, damageType: 'energy', weaponId: 'wpn_pulse_s' },
    });
    assert.equal(await route.physicsOwner.prepareBackend(route.state, { reset: true }), true);
    for (let tick = 0; tick < 45 && projectile.alive !== false; tick++) route.sim.step(SIM_DT);
    assert.equal(projectile.alive, false, 'the ordinary projectile physically strikes the body');
    assert.equal(route.events.flickers.length, 1);
    assert.equal(route.events.barks.length, 1);
    assert.equal(route.spoken.length, 1);
    assert.equal(route.spoken[0].channel, 'bark');
    assert.equal(route.events.barks[0].combatOutcome, false);
    assert.equal(body.alive, true);
    assert.equal(body.hull, 1, 'Combat rejects damage against the invulnerable wildlife body');
    assert.equal(body.data.drifterHitPulse, 1);
    assert.deepEqual(route.events.outcomes, [], 'the bark is not a combat outcome');
    assert.deepEqual(route.events.rewards, [], 'shooting wildlife creates no kill/loot/wallet route');
    assert.equal(route.state.player.timeTrials.unlockedTrailTints[
      DRIFTER_BIOLUMINESCENT_TRAIL_TINT.id
    ], true, 'the player-caused physical Drifter event unlocks its bioluminescent wake');
    route.bus.emit('timeTrial:selectTrailTint', { tintId: DRIFTER_BIOLUMINESCENT_TRAIL_TINT.id });
    assert.equal(timeTrialLocalBoard(route.state).trailTints.find((entry) => (
      entry.id === DRIFTER_BIOLUMINESCENT_TRAIL_TINT.id
    ))?.selected, true, 'the existing Trials selector accepts the earned Drifter wake');

    route.bus.emit('projectile:hit', { targetId: body.id, ownerId: route.player.id });
    assert.equal(route.events.flickers.length, 2, 'later hits may flicker the struck body');
    assert.equal(route.events.barks.length, 1, 'the small ugliness bark is bounded to one');
    assert.equal(route.spoken.length, 1);
  } finally {
    dispose(route);
  }
});

test('Continue and re-entry deterministically rematerialize one transient physical shoal', async () => {
  const route = await boot(1901913, {
    preparePhysics: false,
    updatePhysics: false,
    initialTicks: 3,
  });
  try {
    const initial = identityFingerprint(route.state);
    const initialPose = authoredPoseFingerprint(route.state);
    const saveOwner = route.sim.registry.get('save');
    const envelope = saveOwner.serialize('plan19-drifter-shoal');
    assert.equal(envelope.data.entities.persistent.some((entity) => entity.data
      && entity.data.drifterShoalId === SHOAL.id), false, 'living shoal bodies are transient');
    assert.equal(saveOwner.loadEnvelope(deepCopy(envelope), 'plan19-drifter-shoal'), true,
      'real Continue restores through the registered production save owner');
    route.sim.runTicks(2);
    assert.deepEqual(identityFingerprint(route.state), initial,
      'Continue reconstructs the same nine stable bodies without serializing transient motion');
    assert.deepEqual(authoredPoseFingerprint(route.state), initialPose,
      'Continue rematerializes the exact same deterministic authored poses');

    route.state.world.currentSectorId = 'sector_helios_prime';
    route.sim.runTicks(2);
    assert.equal(liveDrifters(route.state).length, 0);
    route.state.world.currentSectorId = SHOAL.sectorId;
    route.sim.runTicks(2);
    assert.deepEqual(identityFingerprint(route.state), initial,
      'sector re-entry reconstructs the same stable observation instead of duplicating it');
    assert.deepEqual(authoredPoseFingerprint(route.state), initialPose,
      'sector re-entry rematerializes the same deterministic authored poses');

    const body = liveDrifters(route.state)[0];
    const beforeRapier = { x: body.pos.x, z: body.pos.z };
    assert.equal(await route.physicsOwner.prepareBackend(route.state, { reset: true }), true,
      'the rematerialized Continue bodies are adopted by real Rapier authority');
    route.physicsOwner.update(SIM_DT, route.state);
    route.physicsOwner.update(SIM_DT, route.state);
    assert.ok(Math.hypot(body.pos.x - beforeRapier.x, body.pos.z - beforeRapier.z) > 0.01,
      'the rematerialized body resumes as a moving physical body');
  } finally {
    dispose(route);
  }
});

test('production visualFactory replaces the mechanical drone hull with hard rooted 3D wildlife', async () => {
  const route = await boot(1901914);
  try {
    const body = liveDrifters(route.state)[0];
    const root = createVisualFactory().build(body);
    const presentation = root.userData.drifterShoalPresentation;
    assert.equal(presentation.construction, 'hard_3d_lathed_bell_ribs_and_rooted_tentacles');
    assert.equal(presentation.cameraFacing, false);
    assert.equal(presentation.sprites, 0);
    assert.equal(presentation.points, 0);
    assert.equal(presentation.textureCards, 0);
    assert.ok(root.getObjectByName('DrifterLathedBell')?.isMesh);
    assert.ok(root.getObjectByName('DrifterBioluminescentCore')?.isMesh);
    assert.ok(root.getObjectByName('DrifterOpenUndersideRim')?.isMesh);
    assert.ok(root.getObjectByName('DrifterMeridianRibs')?.isLineSegments);
    assert.ok(root.getObjectByName('DrifterRootedTentacles')?.isGroup);
    assert.ok(root.getObjectByName('DrifterTentacle_0')?.isMesh,
      'thick swept tentacles are real tube geometry, not one-pixel lines');
    assert.equal(root.getObjectByName('DroneCore'), undefined,
      'the physics-category reuse never leaks the mechanical drone visual');

    body.data.drifterMotionReduce = true;
    body.data.drifterFlashReduce = true;
    body.data.drifterHitPulse = 1;
    body.data.drifterFlickerUntil = body.data.drifterPresentationTime + 1;
    root.getObjectByName('DrifterLathedBell').onBeforeRender();
    assert.equal(presentation.reducedMotion, true);
    assert.equal(presentation.reducedFlash, true);
    assert.equal(presentation.lastHitPulse, 1);
  } finally {
    dispose(route);
  }
});
