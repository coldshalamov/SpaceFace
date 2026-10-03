// Row 220 / SFQ-B021+B025 — a fresh wreck is a usable physical body: latchable by the
// Massline, manipulable by real impulses, carrying its NAMED operational mass through
// normalization, while scripted/kinematic opt-outs and the player-arcade protections hold.
//
// The law this pins (design/program/world-depth-2026-10-02/COHESION.md#physical-body):
// entity.mass is the authored quantity; physicsBody.mass is what every rope/impact
// consumer reads; the two must be the same number on a fresh wreck. hullFracture's
// wreckPhysicsBody already authors mass on the body — the aftermath/mining/salvage
// spawn sites now do the same.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import {
  ensurePhysicsBodySpec,
  isDynamicPhysicsBodyEntity,
  resolvePhysicsBodySpec,
} from '../src/core/physicsAuthority.js';
import { physics } from '../src/core/physics.js';
import { aftermathForSector, aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { resetPendingSlams } from '../src/systems/hullFracture.js';
import { isAttachable, acquisitionDenialReason } from '../src/systems/tetherGameplay.js';

const SEED = 22030;
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
    collides: true,
    flags: {},
    isPlayer: extra.isPlayer === true,
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
    data: { defId: extra.defId || 'ship_wasp', shipClass: extra.shipClass || 'fighter' },
  };
}

async function boot() {
  resetPendingSlams();
  const sim = createSimulation({
    seed: SEED,
    bus: createBus(),
    systems: [aftermathWrecks, physics],
  });
  const { state, helpers } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  // The activity classifier only admits bodies inside the player's physics-reach window to
  // the SG-02 dynamics set — park the player inside that window of the kill site.
  const player = sim.spawn(shipSpec({ defId: 'ship_kestrel', isPlayer: true, pos: { x: -250, z: -250 } }));
  state.playerId = player.id;
  const physicsSys = sim.registry.get('physics');
  const ready = await physicsSys.prepareBackend(state);
  assert.equal(ready, true, 'rapier-dynamic should initialize headless');
  const aftermath = sim.registry.get('aftermathWrecks');
  return {
    sim, state, helpers, player, physicsSys, aftermath,
    cleanup() {
      if (typeof physicsSys._disableSg02DynamicAuthority === 'function') physicsSys._disableSg02DynamicAuthority();
      sim.dispose();
      resetPendingSlams();
    },
  };
}

// A hauler dies in the open black; the aftermath system records the marker and
// materializes the wreck body in the same tick (the sector is current).
function killHaulerIntoWreck(ctx) {
  const victim = ctx.sim.spawn(shipSpec({
    team: 1, defId: 'ship_hauler', shipClass: 'hauler',
    mass: VICTIM_MASS, radius: VICTIM_RADIUS, hull: 1, hullMax: 12,
    pos: { x: 0, z: 0 }, vel: { x: -8, z: 2 },
  }));
  ctx.sim.bus.emit('entity:killed', {
    id: victim.id, killerId: ctx.player.id,
    victimClass: 'hauler', victimVel: { x: -8, z: 2 },
  });
  victim.alive = false;
  const marker = aftermathForSector(ctx.state, SECTOR_ID)
    .find((m) => m && m.victimId === victim.id) || null;
  const wreck = (ctx.state.entityList || []).find((e) => (
    e && e.alive !== false && e.type === 'wreck' && e.data && e.data.markerId === (marker && marker.markerId)
  )) || null;
  return { victim, marker, wreck };
}

function speed(entity) {
  return Math.hypot(Number(entity && entity.vel && entity.vel.x) || 0, Number(entity && entity.vel && entity.vel.z) || 0);
}

test('a fresh wreck normalizes to the named operational mass, not the density default', async () => {
  const ctx = await boot();
  try {
    const { marker, wreck } = killHaulerIntoWreck(ctx);
    assert.ok(marker && wreck, 'the kill must record a marker and materialize its wreck');
    // The three numbers that used to disagree: entity.mass (authored), physicsBody.mass
    // (normalized body spec) and marker.victimMass (durable record) are now one quantity.
    const body = resolvePhysicsBodySpec(wreck);
    assert.equal(wreck.mass, VICTIM_MASS, 'entity carries the victim mass');
    assert.equal(body.mass, VICTIM_MASS, 'normalized body mass IS the named operational mass');
    assert.equal(body.dynamic, true, 'the wreck enters physics as a dynamic body');
    assert.equal(isDynamicPhysicsBodyEntity(wreck), true);
    // A legacy marker with no recorded mass keeps the deliberate 1e6 dead-man mass.
    const legacy = { pos: { x: 5, z: 5 }, sectorId: SECTOR_ID, wreckClass: 'battlefield', markerId: 'legacy' };
    const spec = ctx.aftermath._specForMarker(legacy);
    assert.equal(spec.physicsBody.mass, 1e6, 'no recorded mass keeps the unshiftable-hulk value');
  } finally {
    ctx.cleanup();
  }
});

test('a fresh wreck is latchable and takes a published impulse through the real port', async () => {
  const ctx = await boot();
  try {
    const { wreck } = killHaulerIntoWreck(ctx);
    assert.ok(wreck, 'wreck must be live');
    assert.equal(isAttachable(wreck, ctx.player.id, ctx.state), true, 'the Massline can latch it');

    ctx.sim.step(); // sync the body into the SG-02 index
    const beforeVx = wreck.vel.x;
    // One body impulse J = m·Δv along x: if the accepted solver mass is the named 45, a
    // 900-unit shove must add ~20 wu/s of x-velocity — a density-normalized body would
    // move a different amount. (Measured on the impulse axis: the wreck's own drift
    // cancels out of |vel| and would under-report the delta.)
    const accepted = ctx.helpers.combatPhysics.applyImpulse({
      entityId: wreck.id,
      impulse: { x: VICTIM_MASS * 20, z: 0 },
      point: null,
      reason: 'row220_shove',
      tick: ctx.state.tick,
    });
    assert.equal(accepted, true, 'the dynamic wreck accepts the published impulse');
    ctx.sim.step();
    const dv = wreck.vel.x - beforeVx;
    assert.ok(Math.abs(dv - 20) < 1.5, `Δv ≈ J/m must use the named mass: got ${dv.toFixed(2)}, want ~20`);
  } finally {
    ctx.cleanup();
  }
});

test('kinematic opt-outs hold: scripted and non-dynamic bodies refuse the port', async () => {
  const ctx = await boot();
  try {
    // A scripted proxy (physicsBody:false) — authored pose, no SG-02 body.
    const scripted = ctx.sim.spawn({
      type: 'wreck', pos: { x: 50, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 900,
      hull: 1, collides: true, physicsBody: false, data: {},
    });
    // A kinematic wreck — authored non-dynamic body (the salvage sort_cradle pattern).
    const kin = ctx.sim.spawn({
      type: 'wreck', pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 900,
      hull: 1, collides: true,
      physicsBody: { shape: 'capsule', mass: 900, dynamic: false }, data: {},
    });
    ctx.sim.step();

    assert.equal(isAttachable(scripted, ctx.player.id, ctx.state), false, 'scripted body is not offered');
    assert.equal(acquisitionDenialReason(scripted, ctx.player.id), 'scripted-body');
    // A kinematic body may still be latched (anchoring to fixed mass is core play) —
    // but the motion port must refuse it: no accepted shove, no displacement.
    assert.equal(isAttachable(kin, ctx.player.id, ctx.state), true, 'fixed mass is still an anchor');
    assert.equal(ctx.helpers.combatPhysics.applyImpulse({
      entityId: scripted.id, impulse: { x: 500, z: 0 }, point: null, reason: 'row220', tick: ctx.state.tick,
    }), false, 'a scripted body rejects the port');
    assert.equal(ctx.helpers.combatPhysics.applyImpulse({
      entityId: kin.id, impulse: { x: 500, z: 0 }, point: null, reason: 'row220', tick: ctx.state.tick,
    }), false, 'a non-dynamic body rejects the port');
    ctx.sim.step();
    assert.equal(speed(kin), 0, 'a rejected impulse moves nothing');
    assert.equal(speed(scripted), 0, 'a scripted pose moves only by its owner');
  } finally {
    ctx.cleanup();
  }
});

test('the player arcade protection holds: an off-centre hit adds no spin', async () => {
  const ctx = await boot();
  try {
    const { wreck } = killHaulerIntoWreck(ctx);
    assert.ok(wreck, 'wreck must be live');
    ctx.sim.step();
    // Same off-centre shove on the wreck and the player. The wreck — a physical body —
    // takes the torque arm; the player's helm protection centres it (PQ-137.11).
    const arm = { x: 4, z: 0 };
    ctx.helpers.combatPhysics.applyImpulse({
      entityId: wreck.id, impulse: { x: 0, z: VICTIM_MASS * 15 },
      point: { x: wreck.pos.x + arm.x, z: wreck.pos.z + arm.z },
      reason: 'row220_offcentre', tick: ctx.state.tick,
    });
    ctx.helpers.combatPhysics.applyImpulse({
      entityId: ctx.player.id, impulse: { x: 0, z: ctx.player.mass * 15 },
      point: { x: ctx.player.pos.x + arm.x, z: ctx.player.pos.z + arm.z },
      reason: 'row220_offcentre', tick: ctx.state.tick,
    });
    for (let i = 0; i < 6; i++) ctx.sim.step();
    assert.ok(Math.abs(wreck.angVel) > 0.001, `the wreck must take the spin the hit delivered (got ${wreck.angVel})`);
    assert.ok(speed(ctx.player) > 5, 'the linear half of the hit still lands on the player');
    assert.ok(Math.abs(ctx.player.angVel || 0) < 0.001,
      `the player's hull must not spin from a hit (got ${ctx.player.angVel}) — arcade protection intact`);
  } finally {
    ctx.cleanup();
  }
});

test('the companion shard carries its own named mass on the body', async () => {
  const ctx = await boot();
  try {
    const { marker } = killHaulerIntoWreck(ctx);
    assert.ok(marker, 'marker must exist');
    const shard = (ctx.state.entityList || []).find((e) => (
      e && e.alive !== false && e.type === 'wreck' && e.data && e.data.arenaShardOf === marker.markerId
    )) || null;
    assert.ok(shard, 'the kill must throw its companion shard');
    const body = resolvePhysicsBodySpec(shard);
    assert.equal(shard.mass, VICTIM_MASS * 0.35, 'shard entity mass is 35% of the victim');
    assert.equal(body.mass, shard.mass, 'the shard body keeps the named shard mass');
    assert.equal(body.dynamic, true, 'the shard is ordinary movable debris');
    assert.equal(isAttachable(shard, ctx.player.id, ctx.state), true, 'the shard is latchable debris');
  } finally {
    ctx.cleanup();
  }
});

test('spawn-site parity: every wreck spec that names a mass authors it on the body', () => {
  // The pure normalization contract, proven on the same spec shapes the spawn sites emit —
  // an authored physicsBody.mass is the quantity ensurePhysicsBodySpec keeps.
  for (const [label, entityMass, radius] of [
    ['aftermath marker', 45, 14],
    ['aftermath shard', 15.75, 9],
    ['mining salvage', 24, 7],
    ['recovery hulk', 1800, 10],
    ['intervention hulk', 1e6, 8],
    ['onboarding derelict', 900, 14],
    ['mission tower', 180, 26],
    ['mission pod', 10, 7],
    ['unique wreck', 1e6, 10],
  ]) {
    const e = { type: 'wreck', radius, mass: entityMass, physicsBody: { shape: 'capsule', mass: entityMass } };
    const body = ensurePhysicsBodySpec(e);
    assert.equal(body.mass, entityMass, `${label}: normalized body keeps the named mass`);
    assert.equal(body.radius, radius, `${label}: radius falls through from the entity`);
    assert.equal(body.shape, 'capsule');
  }
});
