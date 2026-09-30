import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { feel } from '../src/render/feel.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';

const DT = 1 / 60;
const VISION = 'Player collisions are solid, smooth, and silent on the camera';
const SETTLE_TICKS = 3;

function makePlayerCapsule(id, pose) {
  const radius = 8;
  const mass = 20;
  return {
    id,
    type: 'ship',
    alive: true,
    isPlayer: true,
    radius,
    mass,
    combatSpeed: 100,
    maxSpeed: 100,
    pos: { x: pose.x, z: pose.z },
    vel: { x: pose.vx || 0, z: pose.vz || 0 },
    rot: pose.rot || 0,
    angVel: pose.wy || 0,
    physicsBody: {
      schemaVersion: 1,
      radius,
      mass,
      inertiaY: 320,
      dynamic: true,
      ccd: false,
      shape: 'capsule',
      revision: 0,
    },
    data: { proportions: { length: 1.35, halfWidth: 0.42, height: 0.30 } },
  };
}

function capsuleNose(entity) {
  const proportions = entity.data.proportions;
  return (proportions.length * entity.physicsBody.radius) * 0.5;
}

function makeFixedRock(id, pose, radius = 18) {
  return {
    id,
    type: 'asteroid',
    alive: true,
    radius,
    mass: 1_000_000,
    pos: { x: pose.x, z: pose.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    physicsBody: {
      schemaVersion: 1,
      radius,
      mass: 1_000_000,
      inertiaY: 1_000_000,
      dynamic: false,
      ccd: false,
      revision: 0,
    },
    data: {},
  };
}

function makeWall(id, pose) {
  const radius = 20;
  return {
    id,
    type: 'asteroid',
    alive: true,
    radius,
    mass: 1_000_000,
    pos: { x: pose.x, z: pose.z },
    vel: { x: 0, z: 0 },
    rot: Math.PI / 2,
    angVel: 0,
    physicsBody: {
      schemaVersion: 1,
      radius,
      mass: 1_000_000,
      inertiaY: 1_000_000,
      dynamic: false,
      ccd: false,
      shape: 'capsule',
      revision: 0,
    },
    data: { proportions: { length: 20, halfWidth: 0.02, height: 0.02 } },
  };
}

test('head-on player/rock contact: the hull stops at the surface instead of pressing inward', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const player = makePlayerCapsule(1, { x: -50, z: 0, vx: 80, vz: 0 });
    const rock = makeFixedRock(10, { x: 0, z: 0 });
    owner.syncFromEntities([player, rock]);

    const nose = capsuleNose(player);
    let contacted = false;
    let contactTick = -1;
    let inwardSustained = 0;
    let minSurfaceGap = Infinity;
    let crossedThrough = false;
    for (let i = 0; i < 120; i++) {
      owner.step(DT);
      const receipts = owner.drainContactImpacts();
      if (!contacted && receipts.some((r) => r.aId === player.id || r.bId === player.id)) {
        contacted = true;
        contactTick = i;
      }
      if (contacted) {
        const dx = rock.pos.x - player.pos.x;
        const dz = rock.pos.z - player.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        const inward = (player.vel.x * dx + player.vel.z * dz) / d;
        if (i > contactTick + SETTLE_TICKS && inward > inwardSustained) inwardSustained = inward;
        const gap = d - rock.physicsBody.radius - nose;
        if (gap < minSurfaceGap) minSurfaceGap = gap;
        if (player.pos.x > rock.pos.x) crossedThrough = true;
      }
    }

    assert.equal(contacted, true, 'the fixture must actually strike the rock');
    assert.ok(inwardSustained <= 1,
      `${VISION}: sustained contact may not keep pressing the hull inward (max inward ${inwardSustained.toFixed(2)} WU/s)`);
    assert.equal(crossedThrough, false,
      `${VISION}: a fixed rock is solid — the hull never passes through its centre line`);
    assert.ok(minSurfaceGap > -0.5,
      `${VISION}: the visible capsule may not grossly overlap the rock face (gap ${minSurfaceGap.toFixed(2)} WU)`);
  } finally {
    owner.dispose();
  }
});

test('oblique player/wall contact: tangential velocity survives and the hull slides', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const player = makePlayerCapsule(1, { x: -50, z: -20, vx: 80, vz: 40 });
    const wall = makeWall(10, { x: 0, z: 0 });
    owner.syncFromEntities([player, wall]);

    let contacted = false;
    let contactTick = -1;
    let zAtContact = null;
    let zProgressAfterContact = 0;
    let maxNormalOut = 0;
    let minTangential = Infinity;
    let maxTangential = -Infinity;
    let crossedThrough = false;
    for (let i = 0; i < 120; i++) {
      owner.step(DT);
      const receipts = owner.drainContactImpacts();
      if (!contacted && receipts.some((r) => r.aId === player.id || r.bId === player.id)) {
        contacted = true;
        contactTick = i;
        zAtContact = player.pos.z;
      }
      if (contacted) {
        if (player.vel.x > maxNormalOut) maxNormalOut = player.vel.x;
        if (i > contactTick + SETTLE_TICKS) {
          if (player.vel.z < minTangential) minTangential = player.vel.z;
          if (player.vel.z > maxTangential) maxTangential = player.vel.z;
        }
        if (player.pos.z > zAtContact) {
          zProgressAfterContact = Math.max(zProgressAfterContact, player.pos.z - zAtContact);
        }
        if (player.pos.x > wall.pos.x + 2) crossedThrough = true;
      }
    }

    assert.equal(contacted, true, `the fixture must actually meet the wall (tick ${contactTick})`);
    assert.ok(maxNormalOut <= 1,
      `${VISION}: a flat wall must block the normal axis (max vx ${maxNormalOut.toFixed(2)} WU/s)`);
    assert.ok(minTangential >= 40 * 0.95,
      `${VISION}: tangential slide is preserved within 5% (min vz ${minTangential.toFixed(2)} of 40)`);
    assert.ok(maxTangential <= 40 * 1.05,
      `${VISION}: contact may not add tangential speed either (max vz ${maxTangential.toFixed(2)})`);
    assert.ok(zProgressAfterContact > 5,
      `${VISION}: the hull keeps travelling along the wall (z progress ${zProgressAfterContact.toFixed(1)} WU from contact)`);
    assert.equal(crossedThrough, false,
      `${VISION}: the hull may not phase through the wall face`);
    assert.ok(Math.abs(player.rot) < 0.02 && Math.abs(player.angVel) < 0.02,
      `${VISION}: authored heading is kept (rot ${player.rot}, angVel ${player.angVel})`);
  } finally {
    owner.dispose();
  }
});

function feelHost() {
  const bus = createBus();
  const host = Object.create(feel);
  const triggers = [];
  const traumas = [];
  const kicks = [];
  const timeScaleWrites = [];
  const player = {
    id: 1, type: 'ship', mass: 20, alive: true,
    pos: { x: -24, z: 0 }, vel: { x: 80, z: 0 },
  };
  const rock = {
    id: 2, type: 'asteroid', mass: 1_000_000, alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
  };
  const npcA = { id: 3, type: 'ship', mass: 24, alive: true, pos: { x: 40, z: 60 }, vel: { x: 10, z: 0 } };
  const npcB = { id: 4, type: 'ship', mass: 24, alive: true, pos: { x: 60, z: 60 }, vel: { x: -10, z: 0 } };
  host.bus = bus;
  host.state = {
    mode: 'flight',
    tick: 9,
    playerId: 1,
    entities: new Map([[1, player], [2, rock], [3, npcA], [4, npcB]]),
    settings: { video: { motionReduce: false } },
    render: {
      cameraCtrl: {
        addTrauma: (amount) => traumas.push(amount),
        impactKick: (x, z, wu) => kicks.push({ x, z, wu }),
      },
    },
    ui: {},
  };
  host.timeEffects = { set: (...a) => timeScaleWrites.push(a), clear: () => {} };
  host._hsTimer = 0;
  host._hsRampIn = 0;
  host._hsFreezeTimer = 0;
  host._hsRequest = { scale: 0.12 };
  host._collisionHitstopCooldown = 0;
  host._armedCollisionDeltaV = 0;
  host._pendingCollisionFeel = null;
  host._collisionFeelScratch = {};
  host._collisionFeelContext = {};
  host._armedCollisionTick = null;
  host._armedCollisionAId = null;
  host._armedCollisionBId = null;
  host._chainBeats = new Map();
  host._chainBeatQueued = 0;
  host._fovPunch = 0;
  host._trigger = (hsDur, fovAdd, vigPeak, vigCls) => triggers.push({ hsDur, fovAdd, vigPeak, vigCls });
  host._subscribe();
  return { host, bus, triggers, traumas, kicks, timeScaleWrites };
}

test('ordinary player contact never arms hitstop, FOV punch, trauma, or impact kick', () => {
  const { host, bus, triggers, traumas, kicks, timeScaleWrites } = feelHost();
  const fovBefore = host._fovPunch;

  bus.emit('physics:impact', {
    aId: 1, bId: 2, dp: 400, impulse: 20, tick: 10,
    pos: { x: -24, z: 0 }, normal: { x: -1, z: 0 },
    playerInvolved: true, playerDeltaV: 20, preSolveClosingSpeed: 80,
  });
  host._flushPendingCollision();

  bus.emit('combat:collisionConsequence', {
    targetId: 1, otherId: 2, deltaV: 40, exchangedMomentum: 800,
    feelDeltaV: 80, tick: 11, pos: { x: -24, z: 0 },
    provenance: { actorId: 7 },
  });
  host._flushPendingCollision();

  assert.equal(host._pendingCollisionFeel, null, 'no collision beat may stay queued for a player contact');
  assert.equal(triggers.length, 0, `${VISION}: player contact must not arm a hitstop/time dip`);
  assert.equal(timeScaleWrites.length, 0, `${VISION}: player contact must not write a timeScale request`);
  assert.equal(traumas.length, 0, `${VISION}: player contact must not add camera trauma`);
  assert.equal(kicks.length, 0, `${VISION}: player contact must not punch an impact kick`);
  assert.equal(host._fovPunch, fovBefore, `${VISION}: player contact must not punch the FOV envelope`);

  bus.emit('combat:collisionConsequence', {
    targetId: 3, otherId: 4, deltaV: 60, exchangedMomentum: 1200,
    feelDeltaV: 60, tick: 12, pos: { x: 50, z: 60 },
    provenance: { actorId: 7 },
  });
  host._flushPendingCollision();
  assert.equal(triggers.length, 0, `${VISION}: ambient NPC contact must not freeze the player's view`);
  assert.equal(traumas.length, 0, `${VISION}: ambient NPC contact must not shake the player's camera`);
  assert.equal(kicks.length, 0, `${VISION}: ambient NPC contact must not kick the player's camera`);

  bus.emit('combat:collisionConsequence', {
    targetId: 3, otherId: 4, deltaV: 60, exchangedMomentum: 1200,
    feelDeltaV: 60, tick: 13, pos: { x: 50, z: 60 },
    provenance: { actorId: 1 },
  });
  host._flushPendingCollision();
  assert.ok(triggers.length > 0 || traumas.length > 0,
    `${VISION}: a player-caused remote throw keeps its presentation beat`);
});
