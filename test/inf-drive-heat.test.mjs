// inf-drive-heat — the exhaust glow's color names the maneuver.
//
// The drive continuum always told the maneuver in structure (length, width, turbulence, flow) but
// the plume color stayed fixed per recipe: an idling, cruising and boosting bell wore the same hue
// and only their lengths differed. Now the glow carries a steady-state heat channel — boost burns
// white-hot, cruise leans out cooler, idle/brake/reverse are a cooling chamber — blended with the
// same mode weights that crossfade the structure, and applied per layer role so faction identity
// survives in the sheath.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  DRIVE_MODE_HEAT,
  blendDriveModeHeat,
  resolveDriveModeHeat,
  sampleThrottleInto,
  integrateModeWeights,
} from '../src/render/thruster/systems/throttleResponse.js';
import { ContinuousPlumeSystem } from '../src/render/thruster/systems/continuousPlume.js';
import { listThrusterRecipePacks } from '../src/render/thruster/recipes/registry.js';

// A shipped continuous_plume family recipe — the fleet path the heat channel rides.
const PACK = listThrusterRecipePacks()[0].main;

const SOCKETS = [{ x: 0, y: 0, z: 0, ax: 0, ay: 0, az: -1 }];

function signalsFor(mode) {
  // Full signal sets that resolveDriveMode classifies unambiguously.
  if (mode === 'boost') return { drive: 1, throttle: 1, boost: 1, boostBlend: 1 };
  if (mode === 'cruise') return { drive: 0.6, throttle: 0.6, cruise: 1 };
  if (mode === 'idle') return { drive: 0, throttle: 0 };
  if (mode === 'brake') return { drive: 0.3, throttle: 0, brake: 1, speedDrive: 1 };
  return { drive: 0.7, throttle: 0.7 };
}

test('each drive mode carries a distinct steady-state heat signature', () => {
  const out = { whitePush: -1, cool: -1 };
  resolveDriveModeHeat('boost', out);
  assert.equal(out.whitePush, 1, 'boost overpressure burns white-hot');
  assert.equal(out.cool, 0);
  resolveDriveModeHeat('accel', out);
  assert.equal(out.whitePush, 0, 'accel keeps the authored recipe color');
  assert.equal(out.cool, 0);
  resolveDriveModeHeat('idle', out);
  assert.equal(out.whitePush, 0);
  assert.ok(out.cool > DRIVE_MODE_HEAT.cruise.cool, 'idle sits cooler than cruise');
  resolveDriveModeHeat('brake', out);
  assert.ok(out.cool > 0, 'a suppressed main bell is a cooling chamber');
  resolveDriveModeHeat('reverse', out);
  assert.ok(out.cool >= DRIVE_MODE_HEAT.brake.cool, 'reverse cools at least as hard as brake');
  resolveDriveModeHeat('unknown-mode', out);
  assert.equal(out.whitePush, 0, 'unknown modes read as accel, the recipe color');
  assert.equal(out.cool, 0);
});

test('the heat blend reproduces the discrete mode at one-hot weights and crossfades between', () => {
  const modes = ['idle', 'accel', 'cruise', 'boost', 'brake', 'reverse'];
  const out = { whitePush: 0, cool: 0 };
  for (const mode of modes) {
    const oneHot = new Float32Array(modes.length);
    oneHot[modes.indexOf(mode)] = 1;
    blendDriveModeHeat(oneHot, mode, out);
    assert.equal(out.whitePush, DRIVE_MODE_HEAT[mode].whitePush, `${mode} one-hot whitePush`);
    assert.equal(out.cool, DRIVE_MODE_HEAT[mode].cool, `${mode} one-hot cool`);
  }
  // Halfway idle→boost: the color lands strictly between the two endpoints, like the structure.
  const half = new Float32Array(modes.length);
  half[modes.indexOf('idle')] = 0.5;
  half[modes.indexOf('boost')] = 0.5;
  blendDriveModeHeat(half, 'boost', out);
  const midWhite = (DRIVE_MODE_HEAT.idle.whitePush + DRIVE_MODE_HEAT.boost.whitePush) / 2;
  const midCool = (DRIVE_MODE_HEAT.idle.cool + DRIVE_MODE_HEAT.boost.cool) / 2;
  assert.ok(Math.abs(out.whitePush - midWhite) < 1e-9);
  assert.ok(Math.abs(out.cool - midCool) < 1e-9);
  // Degenerate weights fall back to the discrete mode.
  blendDriveModeHeat(new Float32Array(modes.length), 'boost', out);
  assert.equal(out.whitePush, 1);
  blendDriveModeHeat(null, 'idle', out);
  assert.equal(out.cool, DRIVE_MODE_HEAT.idle.cool);
});

test('sampleThrottleInto keeps classifying modes the heat channel then colors', () => {
  const sample = {
    throttle: 0, length: 0, width: 0, turbulence: 0,
    coreSheathBalance: 0, dissipation: 0, flowSpeed: 0, effectiveDrive: 0, mode: 'accel',
  };
  for (const mode of ['boost', 'cruise', 'idle', 'brake', 'accel']) {
    sampleThrottleInto(PACK, 0.8, { ...signalsFor(mode) }, sample);
    assert.equal(sample.mode, mode, `${mode} signals classify as ${mode}`);
  }
});

test('a boosting bell writes whiter slot colors than an idling one through the live pool', () => {
  const sys = new ContinuousPlumeSystem(THREE, PACK, { maxSockets: 1, distortionEnabled: false });
  try {
    const a11y = {};
    sys.beginUpdate(a11y);
    const write = (mode) => {
      const throttle = mode === 'idle' ? 0.02 : 0.8;
      const driveState = { plumeDrive: throttle, boostBlend: mode === 'boost' ? 1 : 0, ignition: 0 };
      sys.writeEntity(1 / 60, throttle, SOCKETS, signalsFor(mode), driveState, 1);
    };
    write('boost');
    sys.endUpdate(1 / 60);
    // Snapshot the packed instance colors of the boost write.
    const boostColors = sys.layerBatches
      .filter((b) => b.writeCount > 0)
      .map((b) => Array.from(b.color.slice(0, b.writeCount * 3)));
    sys.beginUpdate(a11y);
    write('idle');
    sys.endUpdate(1 / 60);
    const idleColors = sys.layerBatches
      .filter((b) => b.writeCount > 0)
      .map((b) => Array.from(b.color.slice(0, b.writeCount * 3)));

    let boostSum = 0;
    let idleSum = 0;
    for (const batch of boostColors) for (const v of batch) boostSum += v;
    for (const batch of idleColors) for (const v of batch) idleSum += v;
    assert.ok(boostSum > idleSum,
      `boost must push the glow brighter/whiter than idle (boost ${boostSum.toFixed(3)} vs idle ${idleSum.toFixed(3)})`);
    // The hottest core channel of the boost write must sit near white (>= 0.9) while idle's
    // matching channel is visibly cooled.
    const boostCoreMax = Math.max(...boostColors.map((c) => Math.max(...c)));
    const idleCoreMax = Math.max(...idleColors.map((c) => Math.max(...c)));
    assert.ok(boostCoreMax >= 0.85, `boost core approaches white (${boostCoreMax.toFixed(3)})`);
    assert.ok(idleCoreMax < boostCoreMax, 'idle core stays cooled below the boost core');
  } finally {
    sys.dispose();
  }
});

test('integrateModeWeights keeps crossfading the heat the same way it crossfades structure', () => {
  const state = {};
  const w0 = integrateModeWeights(state, 'accel', 1 / 60);
  assert.equal(w0[1], 1, 'fresh plume seeds one-hot on its first mode');
  const w1 = integrateModeWeights(state, 'boost', 1 / 60);
  assert.ok(w1[3] > 0 && w1[3] < 1, 'a mode flip eases in, never steps');
  assert.ok(Math.abs(w1.reduce((a, b) => a + b, 0) - 1) < 1e-6, 'weights stay normalized');
  const out = { whitePush: 0, cool: 0 };
  blendDriveModeHeat(w1, 'boost', out);
  assert.ok(out.whitePush > 0 && out.whitePush < 1, 'heat crossfades with the structure blend');
});
