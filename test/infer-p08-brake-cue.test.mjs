// SFQ-I006 — the bow retro cue follows requested brake force, not the brake button.
//
//   node --test test/infer-p08-brake-cue.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import { vfx } from '../src/render/vfx.js';

const DT = 1 / 60;
const SEED = 4242;
const SCALE = { main: 40, strafe: 40, yaw: 2, reverse: 20 };

function mockVolume() {
  return {
    last: null,
    spool: 0,
    bite: 0,
    demand: 0,
    reset() { this.last = { live: 0, drive: 0 }; },
    update(dt, sockets, params) {
      this.last = {
        dt,
        live: sockets.length,
        drive: params && Number.isFinite(params.drive) ? params.drive : 0,
      };
      return { live: sockets.length };
    },
  };
}

function ctxFor(volume, input) {
  return {
    _energy: { retroVolume: volume },
    _rcsPoseScratch: {},
    _retroSockets: [
      { x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 },
      { x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 },
    ],
    _retroSocketView: [],
    _retroHeldSockets: [{}, {}],
    _retroHeldCount: 0,
    _retroParams: {},
    _spawnLocalXZ: { x: 0, z: 0 },
    _entityLocalXZ: { x: 0, z: 0 },
    _frameMembrane: null,
    _productionRcsFirings: [],
    _rcsSocketObjects: () => null,
    _writeRetroSocketPose: () => false,
    _rcsScaleFor: () => SCALE,
    _toLocalXZ(x, z, out) {
      const t = out || { x: 0, z: 0 };
      t.x = x;
      t.z = z;
      return t;
    },
    state: { input },
  };
}

const player = { pos: { x: 0, z: 0 }, rot: 0, radius: 6, vel: { x: 40, z: 0 } };

function hold(ctx, actuators, frames = 40) {
  for (let i = 0; i < frames; i++) {
    vfx._updateRetroVolume.call(ctx, player, actuators, DT, null);
  }
  return ctx._energy.retroVolume.last;
}

test('brake button with no requested force leaves the retro jets dark (seed 4242)', () => {
  const volume = mockVolume();
  const ctx = ctxFor(volume, { brake: true, moveZ: 0, actions: { brake: true } });
  const last = hold(ctx, {
    reverse: 0,
    main: 0,
    lateral: 0,
    yaw: 0,
    pilotBrake: true,
    brake: 1,
  });
  assert.equal(last.live, 0, 'held brake button must not light the bow jets when reverse force is 0');
  assert.ok(!(last.drive > 0.001), 'retro drive must stay dark without a force request');
  console.log(`SEED=${SEED} button-held reverse=0 live=${last.live} drive=${last.drive}`);
});

test('requested reverse force lights the retro jets with the brake button up (seed 4242)', () => {
  const volume = mockVolume();
  const ctx = ctxFor(volume, { brake: false, moveZ: 0, actions: { brake: false } });
  const last = hold(ctx, {
    reverse: 20,
    main: 0,
    lateral: 0,
    yaw: 0,
    pilotBrake: false,
    brake: 0,
  });
  assert.equal(last.live, 2, 'reverse force must light both bow jets even when the button is up');
  assert.ok(last.drive > 0.05, `retro drive must follow the force request (got ${last.drive})`);
  console.log(`SEED=${SEED} button-up reverse=20 live=${last.live} drive=${last.drive}`);
});
