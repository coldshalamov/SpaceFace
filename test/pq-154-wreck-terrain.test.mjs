// PQ-154 — a wreck is a place: terrain you collide with, a body you can throw, a value you can
// read. The packet's leaves (.00 fracture, .01 ecology, .02 player wreck) own their own suites;
// this one pins the terrain contract of a DURABLE aftermath wreck on the sector route, fixed-seed:
//   - collidable: it materializes as a dynamic SG-02 body carrying the victim's real mass and
//     radius, blocks line of sight, and a chase-speed slam into it routes real impact damage;
//   - tetherable: the Massline can latch it, and the same meeting law the throw release uses pays
//     the wreck-as-ammunition receipt against a hull;
//   - readable: the wreck's scan identity carries the salvage pool the death economy pays out;
//   - durable: the marker survives the save round trip and rematerializes the same body.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { witnessLineOfSight } from '../src/combat/lineOfSight.js';
import { resolveCollisionConsequence } from '../src/combat/impulseKernel.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { aftermathForSector, aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { resetPendingSlams } from '../src/systems/hullFracture.js';
import { combat } from '../src/systems/combat.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';

const SEED = 15430;
const SECTOR_ID = 'sector_helios_prime';
const VICTIM_MASS = 45;
const VICTIM_RADIUS = 14;

function shipSpec(extra = {}) {
  return {
    type: 'ship',
    team: extra.team != null ? extra.team : 0,
    pos: extra.pos || { x: 0, z: 0 },
    vel: extra.vel || { x: 0, z: 0 },
    rot: 0,
    angVel: extra.angVel != null ? extra.angVel : 0,
    radius: extra.radius || 12,
    mass: extra.mass || 18,
    hull: extra.hull != null ? extra.hull : 400,
    hullMax: extra.hullMax != null ? extra.hullMax : extra.hull || 400,
    shield: 0,
    shieldMax: 0,
    armorHp: 0,
    armorMax: 0,
    collides: true,
    flags: {},
    physicsBody: {
      schemaVersion: 1,
      radius: extra.radius || 12,
      mass: extra.mass || 18,
      inertiaY: 40,
      dynamic: true,
      ccd: true,
      material: 'ship',
      revision: 0,
    },
    data: {
      defId: extra.defId || 'ship_wasp',
      shipClass: extra.shipClass || 'fighter',
      combatProfileId: 'combat_profile_standard_ship',
    },
  };
}

function boot(seed = SEED) {
  resetPendingSlams();
  const sim = createSimulation({
    seed,
    systems: [aftermathWrecks, collisionConsequences, combat],
  });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  const player = sim.spawn(shipSpec({
    defId: 'ship_kestrel',
    pos: { x: -4000, z: -4000 },
  }));
  state.playerId = player.id;
  // The sim host forks module singletons; the forked aftermath instance (not the raw definition)
  // owns this run's markers and is the save owner under test.
  const aftermath = sim.registry.get('aftermathWrecks');
  assert.ok(aftermath && aftermath !== aftermathWrecks, 'aftermath must be a forked sim instance');
  return { sim, state, player, aftermath };
}

// A hauler dies in the open black; the aftermath system records the marker and materializes the
// wreck body in the same tick (the sector is current).
function killHaulerIntoWreck(ctx, extra = {}) {
  const victim = ctx.sim.spawn(shipSpec({
    team: 1,
    defId: 'ship_hauler',
    shipClass: 'hauler',
    mass: VICTIM_MASS,
    hull: 1,
    hullMax: 12,
    radius: VICTIM_RADIUS,
    pos: extra.pos || { x: 0, z: 0 },
    vel: extra.vel || { x: -8, z: 2 },
    angVel: 0.35,
  }));
  ctx.sim.bus.emit('entity:killed', {
    id: victim.id,
    killerId: ctx.player.id,
    victimClass: 'hauler',
    victimVel: { x: -8, z: 2 },
  });
  // The kill flow retires the hull; the marker and its wreck body are what remain.
  victim.alive = false;
  const marker = aftermathForSector(ctx.state, SECTOR_ID)
    .find((item) => item && item.victimId === victim.id) || null;
  const wreck = (ctx.state.entityList || []).find((entity) => (
    entity && entity.alive !== false && entity.type === 'wreck'
    && entity.data && entity.data.markerId === (marker && marker.markerId)
  )) || null;
  return { victim, marker, wreck };
}

function dispose(ctx) {
  ctx.sim.dispose();
  resetPendingSlams();
}

test('PQ-154 terrain seed 15430: a durable wreck materializes as a dynamic body with real mass', () => {
  const ctx = boot();
  try {
    const { marker, wreck } = killHaulerIntoWreck(ctx);
    assert.ok(marker, 'the kill must record a durable aftermath marker');
    assert.ok(wreck, 'the marker must materialize a live wreck body in the current sector');
    assert.notEqual(wreck.collides, false, 'the wreck must be a collidable body (default collides)');

    const body = resolvePhysicsBodySpec(wreck);
    console.log(`PQ-154 terrain: wreck mass=${body.mass} radius=${body.radius} shape=${body.shape} `
      + `dynamic=${body.dynamic} material=${body.material} markerMass=${marker.victimMass} seed=${SEED}`);

    assert.equal(body.dynamic, true, 'the wreck must enter physics as a dynamic body (terrain, not paint)');
    assert.equal(body.mass, VICTIM_MASS, 'dead man\'s mass: the body carries the victim\'s real mass');
    assert.equal(body.radius, VICTIM_RADIUS, 'the wreck fills the circle the hull filled');
    assert.equal(body.shape, 'capsule');
    assert.equal(body.material, 'debris');
    assert.equal(wreck.vel.x, -8, 'the body keeps the drift it died with');
    assert.equal(wreck.vel.z, 2);
  } finally {
    dispose(ctx);
  }
});

test('PQ-154 terrain seed 15430: a wreck blocks line of sight like terrain', () => {
  const ctx = boot();
  try {
    const { wreck } = killHaulerIntoWreck(ctx);
    assert.ok(wreck, 'wreck must be live');
    const observer = { id: 999999, pos: { x: wreck.pos.x, z: wreck.pos.z - 600 }, alive: true };
    const destination = { x: wreck.pos.x, z: wreck.pos.z + 600 };
    assert.equal(
      witnessLineOfSight(ctx.state, observer, destination),
      false,
      'the segment through the wreck must be blocked',
    );
    assert.equal(
      witnessLineOfSight(ctx.state, observer, destination, [wreck.id]),
      true,
      'ignoring the wreck clears the same segment',
    );
  } finally {
    dispose(ctx);
  }
});

test('PQ-154 terrain seed 15430: an NPC chase into a wreck routes the debris-surface slam', () => {
  // Process maps boot legacy47a (gated off); production seeds this flag ON. Same toggle the
  // fracture suite uses to exercise the production consequence path headlessly.
  const previousFlag = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  const ctx = boot();
  try {
    const { wreck } = killHaulerIntoWreck(ctx);
    assert.ok(wreck, 'wreck must be live');
    const chaser = ctx.sim.spawn(shipSpec({
      team: 1,
      defId: 'ship_wasp',
      pos: { x: wreck.pos.x - 40, z: wreck.pos.z },
      vel: { x: 60, z: 0 },
    }));
    const hullBefore = chaser.hull;
    const receipts = [];
    const onConsequence = (payload) => receipts.push(payload);
    ctx.sim.bus.on('combat:collisionConsequence', onConsequence);
    ctx.sim.bus.emit('physics:impact', {
      consequenceKernelVersion: 1,
      tick: ctx.state.tick,
      aId: chaser.id,
      bId: wreck.id,
      causalActorId: null,
      impulse: 4000,
      dp: 4000,
      preSolveClosingSpeed: 55,
      pos: { x: wreck.pos.x, z: wreck.pos.z },
      normal: { x: -1, z: 0 },
    });
    ctx.sim.bus.off('combat:collisionConsequence', onConsequence);

    const receipt = receipts.find((row) => row && row.targetId === chaser.id) || null;
    const slam = receipt ? receipt.impactDamage : 0;
    console.log(`PQ-154 terrain: chase-into-wreck slam damage=${slam} `
      + `surface=${receipt && receipt.surface} closing=55 mass=${chaser.mass} seed=${SEED}`);

    assert.ok(receipt, 'the slam must publish a collision consequence for the chasing hull');
    assert.equal(receipt.surface, 'debris', 'a wreck is the debris surface of this law');
    assert.ok(slam > 0, 'a 55 wu/s chase into a mass-45 wreck must cost real hull');
    assert.ok(chaser.hull < hullBefore, 'the slam damage must actually land on the chaser');
  } finally {
    dispose(ctx);
    COMBAT_FLAGS.weaponImpulseConsequences = previousFlag;
  }
});

test('PQ-154 terrain seed 15430: a wreck is latchable and pays the thrown-meeting receipt', () => {
  const ctx = boot();
  try {
    const { wreck } = killHaulerIntoWreck(ctx);
    assert.ok(wreck, 'wreck must be live');
    assert.equal(
      isAttachable(wreck, ctx.player.id, ctx.state),
      true,
      'the Massline must be able to latch the wreck (wreck becomes ammunition)',
    );

    // The same law-level read the throw release makes (masslineThrow.impactAtSpeed): the latched
    // wreck meets a hostile hull at speed and the meeting is rated through the consequence kernel.
    const target = ctx.sim.spawn(shipSpec({
      team: 1,
      defId: 'ship_wasp',
      pos: { x: wreck.pos.x + 120, z: wreck.pos.z },
    }));
    const speed = 60;
    const receipt = resolveCollisionConsequence({
      target,
      other: wreck,
      exchangedMomentum: Math.max(1, wreck.mass * speed),
      tick: 0,
      provenance: { actorId: null, weaponId: 'massline', tag: 'massline', appliedTick: 0 },
      preSolveClosingSpeed: speed,
    });
    const thrown = receipt ? receipt.impactDamage : 0;
    console.log(`PQ-154 terrain: thrown-wreck meeting damage=${thrown} `
      + `surface=${receipt && receipt.surface} wreckMass=${wreck.mass} speed=${speed} seed=${SEED}`);

    assert.ok(receipt, 'a thrown wreck meeting a hull must rate a consequence receipt');
    assert.equal(receipt.surface, 'debris');
    assert.ok(thrown > 0, 'a 60 wu/s wreck meeting must cost the target real hull');
  } finally {
    dispose(ctx);
  }
});

test('PQ-154 terrain seed 15430: the wreck scan reads the salvage pool the death economy pays', () => {
  const ctx = boot();
  try {
    const { marker, wreck } = killHaulerIntoWreck(ctx);
    assert.ok(marker && wreck, 'marker and wreck must be live');
    const pool = wreck.data && wreck.data.salvagePool;
    assert.ok(pool && typeof pool === 'object', 'the wreck must carry a salvage pool');
    const total = Object.values(pool).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
    console.log(`PQ-154 terrain: scan="${wreck.data.scanLabel}" poolTotal=${total} `
      + `pool=${JSON.stringify(pool)} markerShared=${pool === marker.salvagePool} seed=${SEED}`);

    assert.ok(total > 0, 'the scan must have a readable salvage value');
    assert.ok(wreck.data.scanLabel && wreck.data.scanLabel.length > 0, 'the scan must name the hulk');
    assert.equal(pool === marker.salvagePool, true, 'live wreck and durable marker share one pool');
    // The compact manifest the scanner strip resolves from the "??? UNSCANNED" ghost is built
    // from exactly this pool (scanner.js buildWreckManifest): same { id, qty } projection.
    const manifest = Object.entries(pool)
      .map(([id, qty]) => ({ id, qty: Math.round(Number(qty) || 0) }))
      .filter((row) => row.qty > 0);
    assert.ok(manifest.length >= 1 && manifest.every((row) => row.id && row.qty > 0),
      'the pool must project to a non-empty scan manifest');
  } finally {
    dispose(ctx);
  }
});

test('PQ-154 terrain seed 15430: the save round trip rematerializes the same terrain body', () => {
  const first = boot();
  let saved = null;
  let markerId = null;
  try {
    const { marker, wreck } = killHaulerIntoWreck(first);
    assert.ok(marker && wreck, 'marker and wreck must be live');
    markerId = marker.markerId;
    first.sim.bus.emit('sector:exit', { sectorId: SECTOR_ID });
    saved = JSON.parse(JSON.stringify(first.aftermath.serialize()));
    assert.ok(saved && saved.bySector[SECTOR_ID], 'the sector bag must persist');
  } finally {
    dispose(first);
  }

  const resumed = boot();
  try {
    // Production restore order from saveSystem: restoring, enter, owner deserialize, loaded.
    resumed.sim.bus.emit('save:restoring', {});
    resumed.sim.bus.emit('sector:enter', { sectorId: SECTOR_ID });
    resumed.aftermath.deserialize(saved);
    resumed.sim.bus.emit('save:loaded', {});

    const marker = aftermathForSector(resumed.state, SECTOR_ID)
      .find((item) => item && item.markerId === markerId) || null;
    const wreck = (resumed.state.entityList || []).find((entity) => (
      entity && entity.alive !== false && entity.type === 'wreck'
      && entity.data && entity.data.markerId === markerId
    )) || null;
    assert.ok(marker, 'the marker must survive Continue');
    assert.ok(wreck, 'the wreck must rematerialize after Continue');
    const body = resolvePhysicsBodySpec(wreck);
    const pool = wreck.data.salvagePool || {};
    const poolTotal = Object.values(pool).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
    console.log(`PQ-154 terrain: remat mass=${body.mass} dynamic=${body.dynamic} `
      + `poolTotal=${poolTotal} seed=${SEED}`);
    assert.equal(body.dynamic, true, 'rematerialized wreck is still dynamic terrain');
    assert.equal(body.mass, VICTIM_MASS, 'rematerialized wreck keeps the victim\'s mass');
    assert.notEqual(wreck.collides, false, 'rematerialized wreck stays collidable');
    assert.ok(poolTotal > 0, 'the rematerialized wreck still carries its salvage value');
  } finally {
    dispose(resumed);
  }
});
