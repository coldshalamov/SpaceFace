// Plan 35 — trails & motion readability. Measurement for the owner motion-state gate.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { ENGINE_PROFILES } from '../src/render/vfxProfiles.js';
import { VL_GRAIN_MAX } from '../src/render/velocityLanguage.js';
import { shipDriftTell, DRIFT_SPEED_MIN } from '../src/render/driftTell.js';
import { updateShipPitchPresentation } from '../src/render/shipPitchPresentation.js';
import {
  createMotionReadabilityVfx,
  DRIFT_TELL_CAP,
  TUMBLE_RIBBON_CAP,
  updateMotionReadabilityVfx,
} from '../src/render/motionReadabilityVfx.js';
import { vfx } from '../src/render/vfx.js';

function ship(partial = {}) {
  return {
    id: partial.id ?? 1,
    type: 'ship',
    alive: true,
    pos: partial.pos || { x: 0, z: 0 },
    vel: partial.vel || { x: 0, z: 0 },
    rot: partial.rot ?? 0,
    radius: partial.radius ?? 8,
    maxSpeed: partial.maxSpeed ?? 120,
    flags: partial.flags || {},
    presentation: partial.presentation || {},
    _flightFrame: partial._flightFrame || {},
    angVel: partial.angVel ?? 0,
  };
}

test('a sideways velocity writes a trailing-edge drift tell; nose-aligned flight does not', () => {
  const drifting = ship({ vel: { x: 0, z: 40 }, rot: 0 });
  const tell = shipDriftTell(drifting);
  assert.equal(tell.active, true);
  assert.ok(tell.intensity > 0);
  assert.ok(tell.trailZ < drifting.pos.z, 'skid-glow sits at the trailing edge of the velocity');

  const aligned = ship({ vel: { x: 40, z: 0 }, rot: 0 });
  assert.equal(shipDriftTell(aligned).active, false);

  const slow = ship({ vel: { x: 0, z: DRIFT_SPEED_MIN - 1 }, rot: 0 });
  assert.equal(shipDriftTell(slow).active, false);
});

test('pitch presentation publishes drift so VFX never has to re-derive it from HUD', () => {
  const entity = ship({ id: 2, vel: { x: 0, z: 50 }, rot: 0 });
  const state = {
    playerId: 1,
    simTime: 1,
    entityList: [entity],
    settings: {},
  };
  updateShipPitchPresentation(state, 1 / 60);
  assert.equal(entity.presentation.drift.active, true);
  assert.ok(entity.presentation.drift.intensity > 0);
});

test('drift and tumble draw pooled ribbons, never a camera-facing card, and respect the cap', () => {
  const scene = new THREE.Scene();
  const player = ship({ id: 1, vel: { x: 0, z: 55 }, rot: 0 });
  const npc = ship({
    id: 2,
    pos: { x: 30, z: 0 },
    vel: { x: 20, z: 10 },
    rot: 0.4,
    angVel: 3.2,
    presentation: { tumble: { mode: 'tumbling', spinRibbon: 0.8 } },
  });
  const extra = [];
  for (let i = 0; i < 12; i++) {
    extra.push(ship({
      id: 10 + i,
      pos: { x: i * 12, z: 40 },
      vel: { x: 0, z: 50 },
      rot: 0,
    }));
  }
  const system = Object.create(vfx);
  system._scene = scene;
  system._t = 1.2;
  system._frameMembrane = null;
  system._spawnLocalXZ = { x: 0, z: 0 };
  system.state = {
    mode: 'flight',
    playerId: player.id,
    entityList: [player, npc, ...extra],
    settings: {},
  };
  system._motionReadability = createMotionReadabilityVfx(scene);
  updateShipPitchPresentation(system.state, 1 / 60);
  npc.presentation.tumble = { mode: 'tumbling', spinRibbon: 0.8 };
  const step = 1 / 30;
  for (let i = 0; i < 8; i++) {
    system._t += step;
    for (const entity of system.state.entityList) {
      entity.pos.x += (entity.vel.x || 0) * step;
      entity.pos.z += (entity.vel.z || 0) * step;
    }
    updateShipPitchPresentation(system.state, step);
    npc.presentation.tumble = { mode: 'tumbling', spinRibbon: 0.8 };
    updateMotionReadabilityVfx(system, step);
  }
  const host = system._motionReadability;
  assert.ok(host.driftMap.size >= 1, 'a drifting ship must own a skid ribbon');
  assert.equal(host.tumbleMap.size, 1, 'the tumbling NPC owns the helix ribbon');
  assert.ok(host.driftMap.size <= DRIFT_TELL_CAP);
  assert.ok(host.tumbleMap.size <= TUMBLE_RIBBON_CAP);
  const driftSlot = host.driftMap.get(player.id) || [...host.driftMap.values()][0];
  assert.ok(driftSlot.trail.inspect().visiblePointCount >= 3);
  const tumbleSlot = host.tumbleMap.get(npc.id);
  assert.ok(tumbleSlot.trail.inspect().visiblePointCount >= 3);

  let sprites = 0;
  scene.traverse((object) => { if (object.isSprite) sprites++; });
  assert.equal(sprites, 0, 'motion readability is a ribbon, not a billboard');
});

test('engine plumes scale with thrust, not speed, and boost is a different gear from cruise', () => {
  const system = Object.create(vfx);
  system.state = { playerId: 1, input: {}, player: { cruise: { phase: 'idle' } } };
  system._driveScratch = {
    drive: 0, throttle: 0, speed: 0, speedDrive: 0, boost: 0,
    cruise: 0, reverse: 0, retroOnly: false, brake: 0, dashFired: false,
  };
  system._mainDriveDemandScratch = { main: 0, reverse: 0, retroOnly: false };
  system._plumeDashPending = false;

  const thrusting = ship({
    id: 1,
    vel: { x: 0, z: 0 },
    _flightFrame: { throttle: 1, maxSpeed: 120 },
  });
  const coasting = ship({
    id: 1,
    vel: { x: 90, z: 0 },
    rot: 0,
    _flightFrame: { throttle: 0, maxSpeed: 120 },
  });
  const thrust = { ...system._engineDriveFor(thrusting) };
  const coast = { ...system._engineDriveFor(coasting) };
  assert.ok(thrust.throttle > 0.9);
  assert.ok(thrust.speed < 1);
  assert.ok(coast.speed > 80);
  assert.ok(coast.throttle < 0.1);
  assert.notEqual(thrust.throttle, thrust.speedDrive);

  thrusting.flags = { boosting: true };
  const boost = { ...system._engineDriveFor(thrusting) };
  assert.equal(boost.boost, 1);
  system.state.player.cruise = { phase: 'cruising' };
  thrusting.flags = {};
  const cruise = { ...system._engineDriveFor(thrusting) };
  assert.equal(cruise.cruise, 1);
  assert.equal(cruise.boost, 0);
});

test('heavy engines burn slower-wider than light vector engines; VL grain is the speed-reference layer', () => {
  const heavy = ENGINE_PROFILES.engine_industrial;
  const light = ENGINE_PROFILES.engine_vector;
  assert.ok(heavy.flowSpeed < light.flowSpeed, 'industrial plumes move slower');
  assert.ok(heavy.plumeWidthMul > light.plumeWidthMul, 'industrial plumes are wider');
  assert.ok(VL_GRAIN_MAX > 0 && VL_GRAIN_MAX <= 0.05,
    'speed-reference dust is the existing VL grain layer, not a new particle stack');
});
