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
import {
  ContrailTrail,
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

function runFrames(stream, sockets, drive, frames, owner, stepX = 2.0) {
  for (let i = 0; i < frames; i++) {
    if (sockets) sockets[0].x = i * stepX;
    stream.update(1 / 60, sockets, drive, { reducedMotion: false }, owner);
  }
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
  assert.equal(info.ribbon.grazing, true, 'grazing-angle brightening is mandatory (required §2.2)');
  assert.equal(info.ribbon.visible, true, 'the jet draws under thrust');
  assert.ok(info.active, 'stream should be active under thrust');
  stream.dispose();
});

test('the plume and the contrail are separate elements, not one object', () => {
  const scene = new THREE.Scene();
  const stream = new PlasmaStreamSystem(THREE, PLAYER_PLASMA_STREAM_RECIPE);
  stream.attach(scene);
  const sockets = [{ x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 }];
  runFrames(stream, sockets, THRUST, 60, { id: 'split' });

  const info = stream.inspect();
  assert.equal(info.ribbon.element, 'plume');
  assert.equal(info.contrail.element, 'contrail');
  assert.notEqual(info.ribbon.construction, info.contrail.construction);
  // Making these one object is what forced the jet to be two seconds long, which at cruise is
  // hundreds of world units — a tail welded to the hull rather than a jet.
  assert.equal(info.contrail.advectsAft, false, 'a history trail must never advect along the exhaust axis');
  stream.dispose();
});

test('sheets are wide enough to carry a crease, not one-normal wire strips', () => {
  // A two-vertex strip has a single normal across its whole width, so its grazing term is constant
  // and it can only ever look like wire. The curved cross-section is the reason this reads as sheets.
  assert.ok(RIBBON_ACROSS >= 3, `sheets need interior vertices, got ${RIBBON_ACROSS}`);

  const plume = new PlasmaRibbonPlume(THREE, {});
  const sides = plume.geometry.attributes.aSide.array;
  const unique = new Set(Array.from(sides.slice(0, RIBBON_ACROSS)));
  assert.equal(unique.size, RIBBON_ACROSS, 'each vertex across the sheet is at a distinct offset');
  assert.ok(Math.min(...unique) < -0.9 && Math.max(...unique) > 0.9, 'cross-section spans both rims');
  assert.ok(plume.material.uniforms.uCurve.value > 0, 'cross-section is curled, not flat');
  plume.dispose();
});

test('the jet is nozzle-local and about two hull lengths, never a dragged tail', () => {
  const plume = new PlasmaRibbonPlume(THREE, {});
  const nozzle = { x: 0, y: 0, z: 0, aftX: -1, aftZ: 0 };
  // Fly a long way at full drive. A jet must not grow with distance travelled; only the contrail does.
  for (let i = 0; i < 600; i++) {
    nozzle.x += 3;
    plume.update(1 / 60, nozzle, { drive: 1, boost: 0, dash: 0, jetLength: JET_LENGTH_WU });
  }
  const info = plume.inspect();
  // Hull is ~8 WU. Anything past a few hull lengths is a tail, not a plume.
  assert.ok(info.jetLength <= 8 * 3, `jet must stay short, got ${info.jetLength} WU`);
  assert.equal(info.animated, 'travelling-wave');
  plume.dispose();
});

test('gas flows through the jet: the form is not a still image being translated', () => {
  // The rejected construction keyed every swirl and curl to a parcel's age, and a parcel's
  // age-to-position mapping never changes, so the plume's shape was CONSTANT in the ship's frame.
  // Structure here must be a function of time at a fixed nozzle pose and a fixed drive.
  const plume = new PlasmaRibbonPlume(THREE, {});
  const nozzle = { x: 0, y: 0, z: 0, aftX: -1, aftZ: 0 };
  const env = { drive: 1, boost: 0, dash: 0, jetLength: JET_LENGTH_WU };

  plume.update(1 / 60, nozzle, env);
  const t0 = plume.material.uniforms.uTime.value;
  const f0 = plume.material.uniforms.uFlicker.value;
  for (let i = 0; i < 30; i++) plume.update(1 / 60, nozzle, env);
  const t1 = plume.material.uniforms.uTime.value;

  assert.ok(t1 > t0, 'the jet advances in time even when nothing about the ship changes');
  assert.ok(plume.material.uniforms.uFlowRate.value > 0, 'structures must travel down the jet');
  assert.ok(plume.material.uniforms.uAxialFreq.value > 0, 'there must be structure along the jet to travel');
  assert.notEqual(plume.material.uniforms.uFlicker.value, f0, 'combustion is rough, not perfectly steady');
  plume.dispose();
});

test('throttle moves the jet LENGTH, and never its opacity', () => {
  const base = { jetLength: 17, throatRadius: 1.32, spread: 2.6, radiance: 0.85, opacity: 0.055 };
  const idle = resolvePlumeShape({ spool: IDLE_FLOOR, boost: 0, dash: 0 }, base, {});
  const half = resolvePlumeShape({ spool: 0.5, boost: 0, dash: 0 }, base, {});
  const full = resolvePlumeShape({ spool: 1, boost: 0, dash: 0 }, base, {});

  assert.ok(idle.jetLength < half.jetLength && half.jetLength < full.jetLength,
    'the jet reaches further as the drive comes up');
  assert.ok(idle.jetLength > 0, 'a lit engine still has gas in the bell');
  assert.ok(idle.jetLength < full.jetLength * 0.25, 'a light touch is a stub, not a full-length jet');
  // Transparency is material. How hard the engine runs does not change how see-through its exhaust is.
  assert.equal(idle.opacity, full.opacity, 'opacity must not be an animation channel');
});

test('the contrail exists only where the nozzle has actually been', () => {
  const trail = new ContrailTrail(THREE, {});
  const env = { drive: 1, emitFloor: 0.08 };
  const nozzle = { x: 0, y: 0, z: 0 };
  const visited = [];

  // Fly a quarter circle so the flown path and the current heading clearly disagree.
  let rot = 0;
  for (let i = 0; i < 90; i++) {
    rot += (1 / 60) * 1.2;
    nozzle.x += Math.cos(rot) * 2.0;
    nozzle.z += Math.sin(rot) * 2.0;
    visited.push({ x: nozzle.x, y: nozzle.y, z: nozzle.z });
    trail.update(1 / 60, nozzle, env);
  }

  const samples = trail.samplePositions();
  assert.ok(samples.length >= 8, `expected path history, got ${samples.length}`);
  for (const s of samples) {
    let best = Infinity;
    for (const v of visited) {
      const d = Math.hypot(s.x - v.x, s.y - v.y, s.z - v.z);
      if (d < best) best = d;
    }
    // The whole rule: no vertex anywhere the nozzle has not been. Any aft advection breaks this by
    // world units; the tolerance here is float32 storage precision on ~100 WU coordinates.
    assert.ok(best < 1e-3, `contrail sample is off the flown path by ${best} WU`);
  }
  assert.ok(trail.inspect().spanWU > 20, 'a flown path has real extent');
  trail.dispose();
});

test('a parked ship thrusting lays down no contrail', () => {
  const trail = new ContrailTrail(THREE, {});
  const env = { drive: 1, emitFloor: 0.08 };
  const nozzle = { x: 5, y: 0, z: -3 };
  for (let i = 0; i < 600; i++) trail.update(1 / 60, nozzle, env);

  const info = trail.inspect();
  // One place is not a path. The rejected build put a full-length ribbon behind a stationary ship the
  // instant the throttle moved, because it advected exhaust aft instead of recording positions.
  assert.ok(info.liveSamples < 2, `holding station must not accumulate a trail, got ${info.liveSamples}`);
  assert.equal(info.visible, false, 'nothing to draw');
  assert.ok(info.spanWU < 1e-6, `no spatial extent, got ${info.spanWU}`);
  trail.dispose();
});

test('the contrail needs real movement, not sub-step jitter', () => {
  const trail = new ContrailTrail(THREE, {});
  const env = { drive: 1, emitFloor: 0.08 };
  const nozzle = { x: 0, y: 0, z: 0 };
  const creep = MIN_STEP_WU * 0.1;
  for (let i = 0; i < 300; i++) {
    nozzle.x += creep;
    trail.update(1 / 60, nozzle, env);
  }
  const samples = trail.samplePositions();
  // Samples are spaced by distance, so a crawl produces few of them rather than a dense pile.
  assert.ok(samples.length < 60, `distance-spaced sampling, got ${samples.length} samples`);
  trail.dispose();
});

test('the contrail retires on the clock and drains when the drive goes cold', () => {
  const trail = new ContrailTrail(THREE, {});
  const nozzle = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 120; i++) {
    nozzle.x += 2;
    trail.update(1 / 60, nozzle, { drive: 1, emitFloor: 0.08 });
  }
  assert.ok(trail.inspect().liveSamples > 8, 'trail accumulated under thrust');
  for (const s of trail.samplePositions()) {
    assert.ok(s.age < TRAIL_SECONDS, 'samples retire on the clock');
  }

  // Cold drive: nothing new is recorded and what is left ages out.
  for (let i = 0; i < 240; i++) {
    nozzle.x += 2;
    trail.update(1 / 60, nozzle, { drive: 0, emitFloor: 0.08 });
  }
  const info = trail.inspect();
  assert.equal(info.liveSamples, 0, 'the trail drains once the drive is out');
  assert.equal(info.visible, false, 'and stops drawing');
  trail.dispose();
});

test('cutting thrust puts the jet out and the trail drains', () => {
  const scene = new THREE.Scene();
  const stream = new PlasmaStreamSystem(THREE, PLAYER_PLASMA_STREAM_RECIPE);
  stream.attach(scene);
  const sockets = [{ x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 }];
  const owner = { id: 'cutoff' };
  runFrames(stream, sockets, THRUST, 60, owner, 1.5);
  assert.ok(stream.inspect().contrail.liveSamples > 8, 'trail accumulated under thrust');

  // Release is a spool-down, not a switch: the drive keeps burning weakly while it cools, which is the
  // whole point of the asymmetric envelope. What must not happen is exhaust outliving its clock.
  const cutoff = { drive: 0, throttle: 0, boost: 0, speed: 0, speedDrive: 0 };
  for (let i = 0; i < 300; i++) stream.update(1 / 60, sockets, cutoff, { reducedMotion: false }, owner);
  const info = stream.inspect();
  assert.equal(info.contrail.liveSamples, 0, 'all exhaust ages out once the drive is cold');
  assert.equal(info.ribbon.visible, false, 'a cold drive draws no jet');
  assert.equal(info.active, false, 'a cold drive with no exhaust is not active');
  stream.dispose();
});

test('plasma stream reuses one fallback identity without sockets or an owner', () => {
  const scene = new THREE.Scene();
  const stream = new PlasmaStreamSystem(THREE, PLAYER_PLASMA_STREAM_RECIPE);
  stream.attach(scene);
  const fallback = stream._fallbackNozzle;

  for (let i = 0; i < 40; i++) {
    fallback.x = i * 0.75;
    stream.update(1 / 60, null, { ...THRUST, speed: 0 }, { reducedMotion: false });
  }

  const info = stream.inspect();
  assert.strictEqual(stream._fallbackNozzle, fallback, 'fallback nozzle identity stays stable');
  assert.strictEqual(stream._owner, fallback, 'omitted owner resolves to the same fallback identity');
  assert.equal(info.ribbon.visible, true, 'socketless callers still get a jet');
  assert.ok(info.path.historyCount > 8,
    `fallback identity must retain path history across frames, got ${info.path.historyCount}`);
  stream.dispose();
});

test('the drive spools over roughly half to three-quarters of a second, and cools slower', () => {
  const env = createDriveEnvelope();
  const input = { throttle: 1, speedNorm: 0, boosting: false, dashFired: false, alive: true };
  const dt = 1 / 120;

  let tTo90 = 0;
  const full = resolveDriveTarget(1, 0);
  for (let i = 0; i < 600; i++) {
    integrateDriveEnvelope(env, input, dt);
    if (env.spool >= full * 0.9) { tTo90 = (i + 1) * dt; break; }
  }
  assert.ok(tTo90 > 0.35 && tTo90 < 0.8, `spool must be visible, not a step: reached 90% at ${tTo90.toFixed(3)}s`);

  // Cooling is slower than lighting up.
  assert.ok(RATES.spoolFallTau > RATES.spoolRiseTau, 'drive cools slower than it lights');
  assert.ok(RATES.boostFallTau > RATES.boostRiseTau, 'boost cools slower than it blasts');
  assert.ok(RATES.boostRiseTau < RATES.spoolRiseTau * 0.5, 'boost is a blast, not another spool');
});

test('idle glows, and speed contributes a bounded share that throttle cannot swallow', () => {
  assert.equal(resolveDriveTarget(0, 0), IDLE_FLOOR, 'a live drive idles rather than going black');

  // The old code took Math.max(throttle, speed...), so at full throttle speed could never show.
  const parked = resolveDriveTarget(1, 0);
  const hauling = resolveDriveTarget(1, 1);
  assert.ok(hauling > parked, 'speed must still register at full throttle');
  const share = (hauling - parked) / (1 - IDLE_FLOOR);
  assert.ok(
    Math.abs(share - SPEED_SHARE) < 0.02,
    `speed should own about ${SPEED_SHARE} of the target, measured ${share.toFixed(3)}`,
  );
  assert.ok(hauling <= 1.0001, 'target stays normalised');

  // Coasting fast with no command must not fake a firing drive.
  assert.ok(resolveDriveTarget(0, 1) < 0.5, 'coasting is residual heat, not full burn');
});

test('dash is a one-shot supernova with a long cooling tail', () => {
  assert.equal(sampleDashFlare(-1), 0, 'no flare before a dash');
  assert.ok(sampleDashFlare(0.05) > 0.9, 'flare peaks almost immediately');
  assert.ok(sampleDashFlare(0.12) === 1, 'brief hold at full');
  const mid = sampleDashFlare(0.45);
  const late = sampleDashFlare(0.7);
  assert.ok(mid > late && late > 0, 'release decays rather than cutting');
  assert.equal(sampleDashFlare(1.2), 0, 'flare is over inside about a second');

  const env = createDriveEnvelope();
  const input = { throttle: 1, speedNorm: 0, boosting: false, dashFired: true, alive: true };
  integrateDriveEnvelope(env, input, 1 / 60);
  assert.ok(env.dash > 0, 'dash event lights the flare');
  input.dashFired = false;
  for (let i = 0; i < 200; i++) integrateDriveEnvelope(env, input, 1 / 60);
  assert.equal(env.dash, 0, 'flare is one-shot and clears itself');
});
