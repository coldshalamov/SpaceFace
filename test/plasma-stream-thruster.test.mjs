import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  smoothstep,
  PLAYER_PLASMA_STREAM_RECIPE,
} from '../src/render/thruster/recipes/plasmaStreamRecipe.js';
import { createPathSampler } from '../src/render/thruster/systems/pathSampler.js';
import { PlasmaStreamSystem } from '../src/render/thruster/systems/plasmaStream.js';
import {
  PlasmaRibbonPlume,
  JET_LENGTH_WU,
  RIBBON_ACROSS,
} from '../src/render/thruster/ribbon/plasmaRibbons.js';
import { DriveForge } from '../src/render/thruster/ribbon/driveForge.js';
import {
  ContrailTrail,
  STRAND_COUNT,
  TRAIL_SECONDS,
  MIN_STEP_WU,
} from '../src/render/thruster/ribbon/contrailTrail.js';
import {
  IDLE_FLOOR,
  RATES,
  SPEED_SHARE,
  createDriveEnvelope,
  integrateDriveEnvelope,
  resolveDriveTarget,
  resolvePlumeShape,
  sampleDashFlare,
} from '../src/render/thruster/ribbon/driveEnvelope.js';

const THRUST = { drive: 1, throttle: 1, boost: 0, speed: 160, speedDrive: 0.6 };
const BURN = { drive: 1, emitFloor: 0.08, boost: 0, dash: 0 };
const COLD = { drive: 0, emitFloor: 0.08, boost: 0, dash: 0 };

function runFrames(stream, sockets, drive, frames, owner, stepX = 2.0) {
  for (let i = 0; i < frames; i++) {
    if (sockets) sockets[0].x = i * stepX;
    stream.update(1 / 60, sockets, drive, { reducedMotion: false }, owner);
  }
}

function close(a, b, eps = 1e-4) {
  return Math.abs(a - b) <= eps;
}

test('smoothstep is monotonic on unit interval', () => {
  let prev = -1;
  for (let i = 0; i <= 20; i++) {
    const v = smoothstep(0, 1, i / 20);
    assert.ok(v >= prev - 1e-9);
    prev = v;
  }
});

test('path sampler retains equal-spacing history', () => {
  const sampler = createPathSampler(20);
  const owner = { id: 1 };
  for (let i = 0; i < 40; i++) {
    sampler.follow(i * 2.0, 0, 0, 1 / 60, owner, 2.0, 200, 1 / 30);
  }
  const xs = new Float32Array(20);
  const zs = new Float32Array(20);
  const ss = new Float32Array(20);
  const n = sampler.sampleInto(xs, zs, ss, 20);
  assert.ok(n >= 4, `expected history samples, got ${n}`);
  assert.equal(ss[0], 0, 'live head age is 0');
  assert.ok(ss[n - 1] >= 0.9, 'oldest sample near age 1');
});

test('the exhaust is swept ribbon sheets, not points, sprites or a density field', () => {
  const scene = new THREE.Scene();
  const stream = new PlasmaStreamSystem(THREE, PLAYER_PLASMA_STREAM_RECIPE);
  stream.attach(scene);
  assert.ok(stream.group);

  let points = 0;
  let sprites = 0;
  stream.group.traverse((o) => {
    if (o.isPoints) points += 1;
    if (o.isSprite) sprites += 1;
  });
  assert.equal(points, 0, 'point-sprite beads are banned (B4)');
  assert.equal(sprites, 0, 'sprite cards are banned (B2)');

  const sockets = [{ x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 }];
  runFrames(stream, sockets, THRUST, 60, { id: 'player' });

  const info = stream.inspect();
  assert.equal(info.medium, 'ribbon-sheets');
  assert.equal(info.construction, 'swept-ribbon-sheets');
  assert.equal(info.ribbon.grazing, true, 'grazing-angle brightening is mandatory');
  assert.equal(info.ribbon.visible, true, 'the jet draws under thrust');
  assert.ok(info.active, 'stream should be active under thrust');
  stream.dispose();
});

test('the live plume and immutable history are separate objects', () => {
  const scene = new THREE.Scene();
  const stream = new PlasmaStreamSystem(THREE, PLAYER_PLASMA_STREAM_RECIPE);
  stream.attach(scene);
  const sockets = [{ x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 }];
  runFrames(stream, sockets, THRUST, 60, { id: 'split' });

  const info = stream.inspect();
  assert.equal(info.ribbon.element, 'plume');
  assert.equal(info.contrail.element, 'contrail');
  assert.notEqual(info.ribbon.construction, info.contrail.construction);
  assert.equal(info.contrail.construction, 'immutable-worldline-sheets');
  assert.equal(info.contrail.retention, 'time-only');
  assert.equal(info.contrail.sampleCenters, 'immutable-world-space');
  assert.equal(info.contrail.advectsAft, false);
  stream.dispose();
});

test('sheets are wide enough to carry a crease, not one-normal wire strips', () => {
  assert.ok(RIBBON_ACROSS >= 3, `sheets need interior vertices, got ${RIBBON_ACROSS}`);

  const plume = new PlasmaRibbonPlume(THREE, {});
  const sides = plume.geometry.attributes.aSide.array;
  const unique = new Set(Array.from(sides.slice(0, RIBBON_ACROSS)));
  assert.equal(unique.size, RIBBON_ACROSS, 'each vertex across the sheet has a distinct offset');
  assert.ok(Math.min(...unique) < -0.9 && Math.max(...unique) > 0.9);
  assert.ok(plume.material.uniforms.uCurve.value > 0, 'cross-section is curled, not flat');
  plume.dispose();
});

test('the jet is nozzle-local and about two hull lengths, never a dragged tail', () => {
  const plume = new PlasmaRibbonPlume(THREE, {});
  const nozzle = { x: 0, y: 0, z: 0, aftX: -1, aftZ: 0 };
  for (let i = 0; i < 600; i++) {
    nozzle.x += 3;
    plume.update(1 / 60, nozzle, { drive: 1, boost: 0, dash: 0, jetLength: JET_LENGTH_WU });
  }
  const info = plume.inspect();
  assert.ok(info.jetLength <= 8 * 3, `jet must stay short, got ${info.jetLength} WU`);
  assert.equal(info.animated, 'travelling-wave');
  plume.dispose();
});

test('gas flows through the live jet: its form is not a still image', () => {
  const plume = new PlasmaRibbonPlume(THREE, {});
  const nozzle = { x: 0, y: 0, z: 0, aftX: -1, aftZ: 0 };
  const env = { drive: 1, boost: 0, dash: 0, jetLength: JET_LENGTH_WU };

  plume.update(1 / 60, nozzle, env);
  const t0 = plume.material.uniforms.uTime.value;
  const f0 = plume.material.uniforms.uFlicker.value;
  for (let i = 0; i < 30; i++) plume.update(1 / 60, nozzle, env);
  const t1 = plume.material.uniforms.uTime.value;

  assert.ok(t1 > t0, 'the live jet advances in time');
  assert.ok(plume.material.uniforms.uFlowRate.value > 0);
  assert.ok(plume.material.uniforms.uAxialFreq.value > 0);
  assert.notEqual(plume.material.uniforms.uFlicker.value, f0);
  plume.dispose();
});

test('throttle moves live-jet length and never its opacity', () => {
  const base = { jetLength: 17, throatRadius: 1.32, spread: 2.6, radiance: 0.85, opacity: 0.055 };
  const idle = resolvePlumeShape({ spool: IDLE_FLOOR, boost: 0, dash: 0 }, base, {});
  const half = resolvePlumeShape({ spool: 0.5, boost: 0, dash: 0 }, base, {});
  const full = resolvePlumeShape({ spool: 1, boost: 0, dash: 0 }, base, {});

  assert.ok(idle.jetLength < half.jetLength && half.jetLength < full.jetLength);
  assert.ok(idle.jetLength > 0);
  assert.ok(idle.jetLength < full.jetLength * 0.25);
  assert.equal(idle.opacity, full.opacity, 'opacity must not be an animation channel');
});

test('every contrail center sample is an exact position the emitting nozzle occupied', () => {
  const trail = new ContrailTrail(THREE, {});
  const nozzle = { x: 0, y: 0, z: 0 };
  const visited = [];

  let rot = 0;
  for (let i = 0; i < 90; i++) {
    rot += (1 / 60) * 1.2;
    nozzle.x += Math.cos(rot) * 2.0;
    nozzle.z += Math.sin(rot) * 2.0;
    visited.push({ x: nozzle.x, y: nozzle.y, z: nozzle.z });
    trail.update(1 / 60, nozzle, BURN);
  }

  const samples = trail.samplePositions();
  assert.ok(samples.length >= 8, `expected path history, got ${samples.length}`);
  for (const s of samples) {
    let best = Infinity;
    for (const v of visited) {
      best = Math.min(best, Math.hypot(s.x - v.x, s.y - v.y, s.z - v.z));
    }
    assert.ok(best < 1e-3, `contrail center is off the flown path by ${best} WU`);
  }
  assert.ok(trail.inspect().spanWU > 20, 'the recorded history has real extent');
  trail.dispose();
});

test('the contrail is readable overlapping energy sheets, not a pin', () => {
  const trail = new ContrailTrail(THREE, {});
  const u = trail.material.uniforms;

  assert.ok(TRAIL_SECONDS >= 1.0 && TRAIL_SECONDS <= 1.4);
  assert.equal(trail.strands, STRAND_COUNT);
  assert.ok(trail.strands >= 10, `overlapping sheets, got ${trail.strands}`);
  assert.ok(trail.across >= 3, 'sheets need a curved cross-section for grazing');
  assert.ok(u.uRadiance.value >= 1.0);
  assert.ok(u.uRadiusHead.value >= 1.2);
  assert.ok(u.uWidthHead.value >= 1.2);
  assert.ok(u.uRadiusTail.value > u.uRadiusHead.value, 'the static volume has radial depth');
  assert.ok(u.uOpacity.value >= 0.02, `contrail must be readable, opacity ${u.uOpacity.value}`);
  trail.dispose();
});

test('distance and speed cannot trim young history', () => {
  const near = new ContrailTrail(THREE, {});
  const far = new ContrailTrail(THREE, {});
  const a = { x: 0, y: 0, z: 0 };
  const b = { x: 0, y: 0, z: 0 };

  for (let i = 0; i < 40; i++) {
    a.x += 0.5;
    b.x += 4;
    near.update(1 / 60, a, BURN);
    far.update(1 / 60, b, BURN);
  }

  assert.equal(far.liveSampleCount(), near.liveSampleCount(), 'lifetime, not speed, owns retention');
  assert.ok(far.inspect().visibleSpanWU > 140, 'there is no hidden 104 WU distance guillotine');
  assert.equal(far.inspect().distanceTrim, false);
  far.dispose();
  near.dispose();
});

test('a parked ship thrusting lays down no spatial trail', () => {
  const trail = new ContrailTrail(THREE, {});
  const nozzle = { x: 5, y: 0, z: -3 };
  for (let i = 0; i < 600; i++) trail.update(1 / 60, nozzle, BURN);

  const info = trail.inspect();
  assert.ok(info.liveSamples < 2, `holding station must not accumulate a path, got ${info.liveSamples}`);
  assert.equal(info.visible, false);
  assert.ok(info.spanWU < 1e-6);
  trail.dispose();
});

test('sub-step jitter never rewrites or densely resamples the newest fact', () => {
  const trail = new ContrailTrail(THREE, {});
  const nozzle = { x: 0, y: 0, z: 0 };
  const creep = MIN_STEP_WU * 0.1;
  for (let i = 0; i < 300; i++) {
    nozzle.x += creep;
    trail.update(1 / 60, nozzle, BURN);
  }
  const samples = trail.samplePositions();
  assert.ok(samples.length < 60, `distance-spaced sampling, got ${samples.length} samples`);
  for (let i = 1; i < samples.length; i++) {
    assert.ok(Math.abs(samples[i - 1].x - samples[i].x) >= MIN_STEP_WU - 1e-4);
  }
  trail.dispose();
});

test('cutting thrust leaves every young sample fixed in space; age alone removes it', () => {
  const trail = new ContrailTrail(THREE, {});
  const nozzle = { x: 0, y: 0, z: 0 };

  for (let i = 0; i < 30; i++) {
    nozzle.x += 2;
    nozzle.z = Math.sin(i * 0.15) * 4;
    trail.update(1 / 60, nozzle, BURN);
  }
  const before = trail.samplePositions().map((s) => ({ ...s }));
  assert.ok(before.length > 20);

  for (let i = 0; i < 12; i++) {
    nozzle.x += 8;
    nozzle.z -= 5;
    trail.update(1 / 60, nozzle, COLD);
  }

  const after = trail.samplePositions();
  assert.equal(after.length, before.length, 'no young sample may be reeled or distance-trimmed');
  for (let i = 0; i < before.length; i++) {
    assert.ok(close(after[i].x, before[i].x), `sample ${i} moved in x`);
    assert.ok(close(after[i].y, before[i].y), `sample ${i} moved in y`);
    assert.ok(close(after[i].z, before[i].z), `sample ${i} moved in z`);
    assert.ok(close(after[i].age, before[i].age + 0.2, 2e-4), `sample ${i} did not age normally`);
  }
  assert.ok(
    Math.hypot(nozzle.x - after[0].x, nozzle.y - after[0].y, nozzle.z - after[0].z) > 20,
    'the old history must remain behind instead of welding itself to the current nozzle',
  );

  for (let i = 0; i < Math.ceil(TRAIL_SECONDS * 60) + 4; i++) {
    trail.update(1 / 60, nozzle, COLD);
  }
  assert.equal(trail.liveSampleCount(), 0, 'all samples eventually expire on their own clocks');
  assert.equal(trail.mesh.visible, false);
  trail.dispose();
});

test('the history and forge have no pulse clock, travelling bands or live-nozzle override', () => {
  const trail = new ContrailTrail(THREE, {});
  const forge = new DriveForge(THREE, {});
  const uniforms = trail.material.uniforms;
  const bannedUniforms = [
    'uTime',
    'uRingHz',
    'uRingGain',
    'uLiveNozzlePos',
    'uIsEmitting',
    'uHeadArc',
    'uSpanWU',
    'uDissolveWU',
  ];
  for (const name of bannedUniforms) {
    assert.equal(name in uniforms, false, `${name} reintroduces non-history authority`);
  }
  assert.doesNotMatch(trail.material.vertexShader, /\buTime\b|uRing|vBirth/);
  assert.doesNotMatch(trail.material.fragmentShader, /\buTime\b|uRing|vBirth|fract\s*\(/);

  const nozzle = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 30; i++) {
    nozzle.x += 2;
    trail.update(1 / 60, nozzle, BURN);
    assert.equal(trail.bandFlash(1), 1, 'forge compatibility gain must be perfectly steady');
  }
  assert.equal(trail.inspect().temporalModulation, false);
  assert.equal('uFlash' in forge.material.uniforms, false, 'the forge must be steady');
  assert.doesNotMatch(forge.material.fragmentShader, /uFlash|pulse|fract\s*\(/i);
  assert.equal(forge.inspect().temporalModulation, false);
  forge.dispose();
  trail.dispose();
});

test('emission gaps and teleports start disconnected segments without deleting history', () => {
  const trail = new ContrailTrail(THREE, {});
  const nozzle = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 8; i++) {
    nozzle.x += 2;
    trail.update(1 / 60, nozzle, BURN);
  }
  const originalCount = trail.liveSampleCount();
  const originalSegment = trail.samplePositions()[0].segment;

  for (let i = 0; i < 4; i++) {
    nozzle.x += 2;
    trail.update(1 / 60, nozzle, COLD);
  }
  trail.update(1 / 60, nozzle, BURN);
  let samples = trail.samplePositions();
  assert.equal(samples.length, originalCount + 1);
  assert.notEqual(samples[0].segment, originalSegment, 'restart begins a disconnected burn segment');

  const beforeTeleport = samples.length;
  nozzle.x += 1000;
  trail.update(1 / 60, nozzle, BURN);
  samples = trail.samplePositions();
  assert.equal(samples.length, beforeTeleport + 1, 'teleport does not erase young history');
  assert.notEqual(samples[0].segment, samples[1].segment, 'teleport begins a disconnected segment');
  trail.dispose();
});

test('a full history buffer skips births instead of evicting young facts', () => {
  const trail = new ContrailTrail(THREE, { samples: 4, trailSeconds: 10 });
  const nozzle = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 20; i++) {
    nozzle.x += 1;
    trail.update(1 / 60, nozzle, BURN);
  }
  const samples = trail.samplePositions();
  assert.equal(samples.length, 4);
  assert.ok(trail.inspect().capacitySkips > 0);
  assert.ok(samples.every((s) => s.age < 1), 'capacity pressure cannot masquerade as expiry');
  trail.dispose();
});

test('cutting thrust puts the live jet out while recorded light fades in place', () => {
  const scene = new THREE.Scene();
  const stream = new PlasmaStreamSystem(THREE, PLAYER_PLASMA_STREAM_RECIPE);
  stream.attach(scene);
  const sockets = [{ x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 }];
  const owner = { id: 'cutoff' };
  runFrames(stream, sockets, THRUST, 60, owner, 1.5);
  assert.ok(stream.inspect().contrail.liveSamples > 8, 'trail accumulated under thrust');

  const cutoff = { drive: 0, throttle: 0, boost: 0, speed: 0, speedDrive: 0 };
  for (let i = 0; i < 300; i++) {
    stream.update(1 / 60, sockets, cutoff, { reducedMotion: false }, owner);
  }
  const info = stream.inspect();
  assert.equal(info.contrail.liveSamples, 0, 'all recorded light ages out');
  assert.equal(info.ribbon.visible, false, 'a cold drive draws no live jet');
  assert.equal(info.active, false);
  stream.dispose();
});

test('plasma stream reuses one fallback identity without sockets or owner', () => {
  const scene = new THREE.Scene();
  const stream = new PlasmaStreamSystem(THREE, PLAYER_PLASMA_STREAM_RECIPE);
  stream.attach(scene);
  const fallback = stream._fallbackNozzle;

  for (let i = 0; i < 40; i++) {
    fallback.x = i * 0.75;
    stream.update(1 / 60, null, { ...THRUST, speed: 0 }, { reducedMotion: false });
  }

  const info = stream.inspect();
  assert.strictEqual(stream._fallbackNozzle, fallback);
  assert.strictEqual(stream._owner, fallback);
  assert.equal(info.ribbon.visible, true);
  assert.ok(info.path.historyCount > 8);
  stream.dispose();
});

test('the drive spools over roughly half to three-quarters second and cools slower', () => {
  const env = createDriveEnvelope();
  const input = { throttle: 1, speedNorm: 0, boosting: false, dashFired: false, alive: true };
  const dt = 1 / 120;
  let tTo90 = 0;
  const full = resolveDriveTarget(1, 0);
  for (let i = 0; i < 600; i++) {
    integrateDriveEnvelope(env, input, dt);
    if (env.spool >= full * 0.9) {
      tTo90 = (i + 1) * dt;
      break;
    }
  }
  assert.ok(tTo90 > 0.35 && tTo90 < 0.8, `reached 90% at ${tTo90.toFixed(3)}s`);
  assert.ok(RATES.spoolFallTau > RATES.spoolRiseTau);
  assert.ok(RATES.boostFallTau > RATES.boostRiseTau);
  assert.ok(RATES.boostRiseTau < RATES.spoolRiseTau * 0.5);
});

test('idle glows and speed contributes a bounded share throttle cannot swallow', () => {
  assert.equal(resolveDriveTarget(0, 0), IDLE_FLOOR);

  const parked = resolveDriveTarget(1, 0);
  const hauling = resolveDriveTarget(1, 1);
  assert.ok(hauling > parked);
  const share = (hauling - parked) / (1 - IDLE_FLOOR);
  assert.ok(Math.abs(share - SPEED_SHARE) < 0.02);
  assert.ok(hauling <= 1.0001);
  assert.ok(resolveDriveTarget(0, 1) < 0.5, 'coasting is residual heat, not full burn');
});

test('dash is a one-shot supernova with a long cooling tail', () => {
  assert.equal(sampleDashFlare(-1), 0);
  assert.ok(sampleDashFlare(0.05) > 0.9);
  assert.equal(sampleDashFlare(0.12), 1);
  const mid = sampleDashFlare(0.45);
  const late = sampleDashFlare(0.7);
  assert.ok(mid > late && late > 0);
  assert.equal(sampleDashFlare(1.2), 0);

  const env = createDriveEnvelope();
  const input = { throttle: 1, speedNorm: 0, boosting: false, dashFired: true, alive: true };
  integrateDriveEnvelope(env, input, 1 / 60);
  assert.ok(env.dash > 0);
  input.dashFired = false;
  for (let i = 0; i < 200; i++) integrateDriveEnvelope(env, input, 1 / 60);
  assert.equal(env.dash, 0);
});
