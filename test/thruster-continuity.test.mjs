// Slice 1, thruster lifecycle: per-tick CONTINUITY of the live jets.
//
// The owner's complaint: the thrusters "just appear and disappear, it doesn't come out of the thruster
// in a realistic way". Reading the code and simulating it at 60 fps (design record: scratchpad R1_combat
// section 1) showed the pops:
//
//   main drive press    jet 0 -> 68% of its held length in ONE frame (floor + one-pole spool), throat
//                       disc switched on at 42% energy
//   main drive release  throat disc hidden at 150 ms; ribbon mesh hidden at 167 ms while it was still
//                       8.2 WU (~49 px) long at 52% of held radiance
//   retro press         born at 67% length / 57% radiance on frame one
//   retro release       frozen plateau at 64% length for ~0.75 s, then hidden in one frame at 37% radiance
//   fleet mode flip     brake x0.42 / reverse x0.08 length applied as a one-frame step
//
// These tests drive the REAL render owners (PlasmaStreamSystem, PlayerRetroJets, throttleResponse) one
// presentation tick at a time and assert that no tick changes length or radiance by more than a fraction
// of the held value, that nothing is hidden while it is still a body, and that the Wave G10 windows
// (grown inside 120 ms, dark inside a quarter second) still hold. Opacity is never a throttle channel.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { PlasmaStreamSystem } from '../src/render/thruster/systems/plasmaStream.js';
import { PLAYER_PLASMA_STREAM_RECIPE } from '../src/render/thruster/recipes/plasmaStreamRecipe.js';
import {
  PlayerRetroJets,
  RETRO_MIN_VISIBLE_WU,
  applyPlayerRetroVolume,
} from '../src/render/thruster/systems/playerRetroVolume.js';
import {
  DRIVE_MODES,
  integrateModeWeights,
  sampleThrottleInto,
} from '../src/render/thruster/systems/throttleResponse.js';
import { resolveThrusterRecipes } from '../src/render/thruster/recipes/registry.js';
import {
  createDriveEnvelope,
  integrateDriveEnvelope,
  resolveDriveTarget,
} from '../src/render/thruster/ribbon/driveEnvelope.js';
import { createPlumeSlug, stepPlumeSlug } from '../src/render/thruster/ribbon/plumeSlug.js';
import { vfx } from '../src/render/vfx.js';

const DT = 1 / 60;
const THRUST = { drive: 1, throttle: 1, boost: 0, speed: 0, speedDrive: 0 };
const COLD = { drive: 0, throttle: 0, boost: 0, speed: 0, speedDrive: 0 };
const A11Y = { reducedMotion: false };

function makeStream() {
  const stream = new PlasmaStreamSystem(THREE, PLAYER_PLASMA_STREAM_RECIPE);
  stream.attach(new THREE.Scene());
  return stream;
}

/** One tick -> the numbers the renderer actually draws with. */
function sample(stream, sockets, owner, info) {
  stream.update(DT, sockets, info, A11Y, owner);
  const shape = stream._plumeShape;
  const throat = stream._throats[0];
  const dr = throat.material.uniforms.uDrive.value;
  const sm = Math.max(0, Math.min(1, dr / 0.45));
  const lit = sm * sm * (3 - 2 * sm);
  return {
    visible: !!stream._ribbons.mesh.visible,
    length: stream._ribbons.mesh.visible ? shape.jetLength : 0,
    radiance: stream._ribbons.mesh.visible ? shape.radiance : 0,
    root: stream._slug.rootOffset,
    throatVisible: !!throat.visible,
    // the shader's own energy term (plasmaStream THROAT_FRAG)
    throatEnergy: throat.visible ? (0.26 + dr * 0.62) * lit : 0,
    lightOn: !!stream._lightSource.on,
    lightRamp: stream._lightSource.ramp,
    opacity: shape.opacity,
  };
}

function runSequence(stream, owner, plan) {
  const sockets = [{ x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 }];
  const out = [];
  for (const [info, ticks] of plan) {
    for (let i = 0; i < ticks; i++) out.push(sample(stream, sockets, owner, info));
  }
  return out;
}

function maxStep(rows, key, from = 0, to = rows.length) {
  let m = 0;
  for (let i = Math.max(1, from); i < to; i++) m = Math.max(m, Math.abs(rows[i][key] - rows[i - 1][key]));
  return m;
}

test('main drive press: born from nothing and ramped, not 0 -> 68% in one frame', () => {
  const stream = makeStream();
  const rows = runSequence(stream, { id: 'press' }, [[THRUST, 90]]);
  const held = rows[rows.length - 1];
  assert.ok(held.length > 12 && held.radiance > 1, `held jet exists (${held.length.toFixed(2)} WU)`);
  // The lip's standing shock cells (recipe jet.shock) survive the slug rework while the jet is held.
  assert.ok(stream._shock.amplitude > 0 && stream._shock.amplitude === stream._shockBaseAmp,
    'shock-cell amplitude is the recipe value while the slug is attached to the lip');

  const first = rows.find((r) => r.visible);
  assert.ok(first, 'the jet appears');
  // Shipped build: first drawn frame 10.09 WU = 68% of held, radiance 66%.
  assert.ok(first.length <= held.length * 0.20, `first frame is a stub (${first.length.toFixed(2)} WU)`);
  assert.ok(first.radiance <= held.radiance * 0.20, 'and nearly dark');
  assert.ok(first.throatEnergy <= 0.15, `the throat lamp does not pop on (${first.throatEnergy.toFixed(3)})`);

  assert.ok(maxStep(rows, 'length') <= held.length * 0.20, 'no tick moves length by more than 20% of held');
  assert.ok(maxStep(rows, 'radiance') <= held.radiance * 0.30, 'no tick moves radiance by more than 30%');
  assert.ok(maxStep(rows, 'throatEnergy') <= 0.30, 'the throat lamp ramps in');
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].length >= rows[i - 1].length - 1e-6, 'a press only ever lengthens the jet');
  }

  // Wave G10: grown plume inside 120 ms (85% of held length by tick 8 at 60 Hz = 133 ms; 7 ticks = 117 ms).
  const grownAt = rows.findIndex((r) => r.length >= held.length * 0.85);
  assert.ok(grownAt >= 0 && (grownAt + 1) * DT <= 0.14, `85% grown at ${(grownAt + 1) * DT}s`);
  // Opacity is a material, never the throttle.
  assert.ok(rows.every((r) => r.opacity === rows[0].opacity), 'opacity is not a throttle channel');
  stream.dispose();
});

test('main drive release: the slug detaches, tapers to nothing, and is hidden only when nothing is left', () => {
  const stream = makeStream();
  const rows = runSequence(stream, { id: 'release' }, [[THRUST, 90], [COLD, 40]]);
  const held = rows[89];
  const rel = rows.slice(90);

  // Shipped build: ribbon hidden at 167 ms with 8.24 WU / 52% of held radiance; throat hidden at 150 ms
  // at energy 0.31.
  const lastVisible = rel.map((r) => r.visible).lastIndexOf(true);
  assert.ok(lastVisible >= 0 && lastVisible < rel.length - 1, 'the jet does go out');
  const last = rel[lastVisible];
  assert.ok(last.length <= 2.5, `last visible length ${last.length.toFixed(2)} WU`);
  assert.ok(last.radiance <= held.radiance * 0.05, `last visible radiance ${(last.radiance / held.radiance).toFixed(3)} of held`);
  const dark = (lastVisible + 2) * DT;
  assert.ok(dark <= 0.25, `dark inside a quarter second (${dark.toFixed(3)} s)`);

  // No visibility flip while the jet is still a body.
  for (let i = 1; i < rel.length; i++) {
    if (rel[i - 1].visible && !rel[i].visible) {
      assert.ok(rel[i - 1].length <= 2.5 && rel[i - 1].radiance <= held.radiance * 0.05, 'hidden only when spent');
    }
  }
  const all = [rows[89], ...rel];
  assert.ok(maxStep(all, 'length') <= held.length * 0.20, 'no tick moves length by more than 20% of held');
  assert.ok(maxStep(all, 'radiance') <= held.radiance * 0.25, 'no tick moves radiance by more than 25%');
  // The tail LEAVES the throat (the slug travels aft) rather than the head retracting to it.
  const maxRoot = Math.max(...rel.map((r) => r.root));
  assert.ok(maxRoot > 4, `the root detaches from the throat (${maxRoot.toFixed(2)} WU)`);

  // The throat lamp and hull light dim away; they are never switched at a visible brightness.
  const tLast = rel.map((r) => r.throatVisible).lastIndexOf(true);
  assert.ok(rel[tLast].throatEnergy <= 0.05, `throat hidden at energy ${rel[tLast].throatEnergy.toFixed(3)}`);
  assert.ok(maxStep(all, 'throatEnergy') <= 0.30, 'throat lamp has no step');
  assert.ok(maxStep(all, 'lightRamp') <= 0.35, 'hull light has no step');
  stream.dispose();
});

test('a re-press during the tail bends the jet back without a snap or a visibility flip', () => {
  const stream = makeStream();
  const rows = runSequence(stream, { id: 'repress' }, [[THRUST, 90], [COLD, 6], [THRUST, 60]]);
  const held = rows[89];
  assert.ok(maxStep(rows, 'length') <= held.length * 0.22, 'no length step through the re-press');
  assert.ok(maxStep(rows, 'radiance') <= held.radiance * 0.30, 'no radiance step through the re-press');
  assert.ok(maxStep(rows, 'root') <= 3.0, 'the detached root relaxes back, it does not teleport');
  assert.ok(rows.slice(90).every((r) => r.visible), 'the jet never blinks out mid re-press');
  stream.dispose();
});

test('spool is a critically damped spring: starts at zero slope, never overshoots, keeps G10', () => {
  const env = createDriveEnvelope();
  const target = resolveDriveTarget(1, 0);
  integrateDriveEnvelope(env, { throttle: 1, speedNorm: 0, alive: true }, DT);
  assert.ok(env.spool <= target * 0.2, `first tick moves at most 20% (${(env.spool / target).toFixed(3)})`);
  let prev = env.spool;
  let tGrown = 0;
  for (let i = 1; i < 120; i++) {
    integrateDriveEnvelope(env, { throttle: 1, speedNorm: 0, alive: true }, DT);
    assert.ok(env.spool <= target + 1e-9, 'never overshoots from rest');
    assert.ok(env.spool >= prev - 1e-9, 'monotone rise');
    assert.ok(env.spool - prev <= target * 0.25, 'no tick above 25% of the target');
    if (!tGrown && env.spool >= target * 0.9) tGrown = (i + 1) * DT;
    prev = env.spool;
  }
  assert.ok(tGrown > 0 && tGrown <= 0.12 + DT, `90% at ${tGrown}`);
  let tDark = 0;
  for (let i = 0; i < 60; i++) {
    integrateDriveEnvelope(env, { throttle: 0, speedNorm: 0, alive: true }, DT);
    assert.ok(env.spool >= 0, 'never undershoots zero');
    if (!tDark && env.spool <= 0.02) tDark = (i + 1) * DT;
  }
  assert.ok(tDark > 0 && tDark <= 0.25, `dark at ${tDark}`);
});

test('the plume slug allocates nothing and reports the same record', () => {
  const slug = createPlumeSlug();
  const a = stepPlumeSlug(slug, 0.5, 0.5, 12, 1.2, 1.55, DT);
  const b = stepPlumeSlug(slug, 0.0, 0.0, 0, 0, 1.55, DT);
  assert.strictEqual(a, slug);
  assert.strictEqual(b, slug);
});

// ── Retro ───────────────────────────────────────────────────────────────────────────────────

function makeRetro() {
  const jets = new PlayerRetroJets(THREE);
  jets.attach(new THREE.Scene());
  jets.configure('engine_ion_small', 14);
  const sockets = [
    { x: 4, y: 0, z: -2, ax: -1, ay: 0, az: 0 },
    { x: 4, y: 0, z: 2, ax: -1, ay: 0, az: 0 },
  ];
  const params = {};
  return { jets, sockets, params };
}

function retroTick(ctx, peak) {
  applyPlayerRetroVolume(ctx.jets, ctx.sockets, peak, DT, null, ctx.params);
  const shown = !!ctx.jets.group.visible;
  return {
    visible: shown,
    length: shown ? ctx.jets._shape.jetLength : 0,
    radiance: shown ? ctx.jets._shape.radiance : 0,
    opacity: ctx.jets._shape.opacity,
  };
}

test('retro press and release: born small, shrinks away, never a frozen plateau or a 64% pop', () => {
  const ctx = makeRetro();
  const rows = [];
  for (let i = 0; i < 120; i++) rows.push(retroTick(ctx, 1));
  const held = rows[rows.length - 1];
  assert.ok(held.length > 8 && held.radiance > 1.5, `held retro ${held.length.toFixed(2)} WU`);

  const first = rows.find((r) => r.visible);
  // Shipped build: first drawn frame 6.07 WU = 67% of held, radiance 57%.
  assert.ok(first.length <= held.length * 0.20, `born at ${(first.length / held.length).toFixed(2)} of held`);
  assert.ok(first.radiance <= held.radiance * 0.25, 'and dim');

  const rel = [];
  for (let i = 0; i < 150; i++) rel.push(retroTick(ctx, 0));
  const all = [held, ...rel];
  const lastVisible = rel.map((r) => r.visible).lastIndexOf(true);
  assert.ok(lastVisible >= 0 && lastVisible < rel.length - 1, 'the retro jet does go out');
  const last = rel[lastVisible];
  // Shipped build: hidden at 64% of held length, 37% radiance, after ~1.67 s.
  assert.ok(last.length <= Math.max(RETRO_MIN_VISIBLE_WU * 2.5, held.length * 0.12),
    `hidden at ${(last.length / held.length).toFixed(3)} of held length`);
  assert.ok(last.radiance <= held.radiance * 0.08, 'and almost dark');
  assert.ok((lastVisible + 2) * DT <= 1.1, `gone by ${((lastVisible + 2) * DT).toFixed(2)} s`);

  assert.ok(maxStep([...rows.slice(0, 30)], 'length') <= held.length * 0.20, 'press has no length step');
  assert.ok(maxStep(all, 'length') <= held.length * 0.20, 'release has no length step');
  assert.ok(maxStep(rows, 'radiance') <= held.radiance * 0.35, 'press radiance step bounded');
  assert.ok(maxStep(all, 'radiance') <= held.radiance * 0.35, 'release radiance step bounded');

  // No frozen plateau: while the jet is still a body its length keeps falling.
  let flat = 0;
  let worstFlat = 0;
  for (let i = 1; i <= lastVisible; i++) {
    const body = rel[i].length > held.length * 0.2;
    if (body && Math.abs(rel[i].length - rel[i - 1].length) < held.length * 0.004) flat++;
    else flat = 0;
    worstFlat = Math.max(worstFlat, flat);
  }
  assert.ok(worstFlat <= 3, `no plateau while a body (${worstFlat} flat ticks)`);
  for (let i = 1; i < all.length; i++) assert.ok(all[i].length <= all[i - 1].length + 1e-6, 'a release never lengthens the jet');
  assert.ok(rows.concat(rel).every((r) => r.opacity === rows[0].opacity), 'opacity is not a throttle channel');
  ctx.jets.dispose();
});

// ── Fleet / NPC structural mode ───────────────────────────────────────────────────────────────

test('fleet drive mode flips crossfade instead of stepping length', () => {
  const recipe = resolveThrusterRecipes('engine_vector').main;
  const flags = { reducedMotion: false, reducedFlash: false, boostBlend: 0, boost: 0, cruise: 0,
    reverse: 0, retroOnly: false, brake: 0, speedDrive: 0, drive: 1, throttle: 1, mode: null };
  const scratch = { throttle: 0, length: 0, width: 0, turbulence: 0, coreSheathBalance: 0,
    dissipation: 0, flowSpeed: 0, effectiveDrive: 0, mode: 'idle' };

  // The discrete path is the step the owner saw.
  sampleThrottleInto(recipe, 1, { ...flags, mode: 'accel' }, scratch);
  const accelLen = scratch.length;
  sampleThrottleInto(recipe, 1, { ...flags, mode: 'reverse' }, scratch);
  const reverseLen = scratch.length;
  assert.ok(reverseLen < accelLen * 0.15, 'discrete reverse really is a >85% one-frame drop');

  const state = {};
  const lens = [];
  const seq = [['accel', 30], ['reverse', 40], ['accel', 40]];
  for (const [mode, ticks] of seq) {
    for (let i = 0; i < ticks; i++) {
      flags.mode = mode;
      flags.modeWeights = integrateModeWeights(state, mode, DT);
      sampleThrottleInto(recipe, 1, flags, scratch);
      lens.push(scratch.length);
    }
  }
  let worst = 0;
  for (let i = 1; i < lens.length; i++) worst = Math.max(worst, Math.abs(lens[i] - lens[i - 1]));
  assert.ok(worst <= accelLen * 0.25, `worst per-tick length step ${(worst / accelLen).toFixed(3)} of accel`);
  assert.ok(Math.abs(lens[29] - accelLen) < 1e-6, 'a settled mode equals the discrete result');
  assert.ok(lens[69] < accelLen * 0.2, 'the reverse residual is reached');
  assert.ok(Math.abs(lens[lens.length - 1] - accelLen) < accelLen * 0.01, 'and recovered');

  // A one-hot weight vector is exactly the discrete path (regression guard).
  const hot = new Float32Array(DRIVE_MODES.length);
  hot[DRIVE_MODES.indexOf('brake')] = 1;
  const discrete = { ...scratch };
  sampleThrottleInto(recipe, 1, { ...flags, mode: 'brake', modeWeights: null }, discrete);
  sampleThrottleInto(recipe, 1, { ...flags, mode: 'brake', modeWeights: hot }, scratch);
  for (const k of ['length', 'width', 'turbulence', 'flowSpeed', 'effectiveDrive']) {
    assert.ok(Math.abs(scratch[k] - discrete[k]) < 1e-5, `one-hot ${k} matches discrete`);
  }
  assert.strictEqual(integrateModeWeights(state, 'accel', DT), state.modeWeights, 'weights are reused, not reallocated');
});

// ── The sleep gate must not hard-hide a jet in the middle of its taper ──────────────────────────

test('the energy idle-sleep gate stays awake while a released jet is still dying out', () => {
  const stream = makeStream();
  const sockets = [{ x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 }];
  for (let i = 0; i < 90; i++) stream.update(DT, sockets, THRUST, A11Y, { id: 'gate' });
  assert.equal(vfx._energyJetsFading({ plasmaStream: stream }), false, 'a held jet is not fading');
  let fadingTicks = 0;
  for (let i = 0; i < 120; i++) {
    stream.update(DT, sockets, COLD, A11Y, { id: 'gate' });
    if (vfx._energyJetsFading({ plasmaStream: stream })) fadingTicks++;
    // while the ribbon is still drawn the gate must be awake
    if (stream._ribbons.mesh.visible) assert.ok(stream.isFading(), `awake at tick ${i}`);
  }
  assert.ok(fadingTicks >= 10, `the gate stays awake through the taper (${fadingTicks} ticks)`);
  assert.equal(stream.isFading(), false, 'and lets go once the jet and its lamp are spent');
  stream.dispose();

  const ctx = makeRetro();
  for (let i = 0; i < 60; i++) retroTick(ctx, 1);
  assert.equal(ctx.jets.isFading(), false, 'a held brake is braking, not fading');
  let awake = 0;
  for (let i = 0; i < 90; i++) {
    retroTick(ctx, 0);
    if (ctx.jets.group.visible) { assert.ok(ctx.jets.isFading(), 'awake while drawn'); awake++; }
  }
  assert.ok(awake >= 20, `retro tail keeps the gate awake (${awake} ticks)`);
  assert.equal(ctx.jets.isFading(), false);
  ctx.jets.dispose();
});
