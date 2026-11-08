// a11y-hit-vignette — the full-screen damage/death wash honors Reduce flashing and survives
// Reduce motion ("stretch, never silence").
//
// Authored, every hit on the player snaps the red edge wash to its peak and fades it at
// VIG_DECAY, so sustained enemy fire re-fires it at the hit cadence. Before this unit the wash
// ignored "Reduce flashing" entirely and "Reduce motion" deleted it with the FOV punch. These
// checks drive the real feel listeners (combat:damage / player:death) and the real frame
// integration against a recording vignette element.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import {
  VIG_FLASH_HOLD_S,
  VIG_FLASH_RISE_PER_S,
  VIG_REDUCED_PEAK_FLOOR,
  damageVignettePeak,
  feel,
  resolveDamageVignetteProfile,
  stepDamageVignette,
} from '../src/render/feel.js';
import { resolveVfxAccessibilityProfile } from '../src/render/vfxAccessibility.js';

const DT = 1 / 60;
const FULL = { video: { motionReduce: false }, accessibility: {} };
const MOTION = { video: { motionReduce: true }, accessibility: {} };
const FLASH = { video: { motionReduce: false }, accessibility: { flashReduce: true } };
const BOTH = { video: { motionReduce: true }, accessibility: { flashReduce: true } };

function feelHost(settings) {
  const player = { id: 1, pos: { x: 0, z: 0 } };
  const state = {
    mode: 'flight',
    playerId: 1,
    timeScale: 1,
    settings: structuredClone(settings),
    ui: { screenStack: [], docked: false },
    entities: new Map([[1, player]]),
    render: { cameraCtrl: { addTrauma() {}, impactKick() {}, hold() { return true; } } },
  };
  const bus = createBus();
  const vig = { style: { opacity: '0', display: 'none' }, className: '', isConnected: true };
  const host = Object.create(feel);
  host._injectStyle = () => {};
  host._mountVignette = () => {};
  host._ensureVignette = () => vig;
  host._ensureHullCrit = () => null;
  host._updateSpeedLines = () => {};
  host.init({ state, bus, timeEffects: createTimeEffects(state) });
  return { state, bus, host, vig };
}

const opacity = (vig) => (vig.style.display === 'none' ? 0 : Number(vig.style.opacity) || 0);

/** 5 Hz hull hits on the player for `burstS`, then silence; one opacity sample per 60 fps frame. */
function sustainedFire(settings, { burstS = 2, tailS = 5, hitHz = 5 } = {}) {
  const { state, bus, host, vig } = feelHost(settings);
  const every = Math.round(60 / hitHz);
  const burstFrames = Math.round(burstS * 60);
  const samples = [];
  for (let f = 0; f < burstFrames + tailS * 60; f++) {
    if (f < burstFrames && f % every === 0) {
      bus.emit('combat:damage', { attackerId: 8, targetId: 1, hullHit: true, amount: 12 });
    }
    host.frame(DT, state);
    samples.push(opacity(vig));
  }
  return { samples, burstFrames, host };
}

/** Local minima inside a series: the wash dipped and then came back up (a re-strobe). */
function restrobes(samples, from, to) {
  let count = 0;
  let falling = false;
  for (let i = from + 1; i < to; i++) {
    const d = samples[i] - samples[i - 1];
    if (d < -0.002) falling = true;
    else if (d > 0.002 && falling) { count++; falling = false; }
  }
  return count;
}

test('profile follows the shared vfx accessibility axes and their flash opacity scales', () => {
  assert.equal(resolveDamageVignetteProfile(FULL).id, 'full');
  assert.equal(resolveDamageVignetteProfile(undefined).id, 'full', 'no settings is the authored look');
  assert.equal(resolveDamageVignetteProfile(MOTION).id, 'reduced-motion');
  assert.equal(resolveDamageVignetteProfile(FLASH).id, 'reduced-flash');
  assert.equal(resolveDamageVignetteProfile({ video: { flashReduce: true } }).id, 'reduced-flash');
  assert.equal(resolveDamageVignetteProfile(BOTH).id, 'reduced-motion-and-flash');
  for (const s of [FULL, MOTION, FLASH, BOTH]) {
    assert.equal(resolveDamageVignetteProfile(s).peakScale, resolveVfxAccessibilityProfile(s).flashOpacityScale,
      'the wash softens by the same scale the flash sprites use');
  }
  assert.equal(resolveDamageVignetteProfile(FLASH), resolveDamageVignetteProfile(structuredClone(FLASH)),
    'shared immutable records: no allocation on the frame path');
});

test('softened peaks never silence the wash and never exceed the authored peak', () => {
  const full = resolveDamageVignetteProfile(FULL);
  const flash = resolveDamageVignetteProfile(FLASH);
  const motion = resolveDamageVignetteProfile(MOTION);
  assert.equal(damageVignettePeak(0.108, full), 0.108, 'full is authored');
  assert.equal(damageVignettePeak(0.108, flash), VIG_REDUCED_PEAK_FLOOR, 'a light hit is floored, still visible');
  assert.ok(Math.abs(damageVignettePeak(0.55, flash) - 0.165) < 1e-9, 'death wash at the flash scale');
  assert.ok(Math.abs(damageVignettePeak(0.55, motion) - 0.319) < 1e-9, 'death wash at the motion scale');
  assert.equal(damageVignettePeak(0.03, flash), 0.03, 'the floor never lifts a wash above its authored peak');
  for (const bad of [0, -1, NaN, Infinity, undefined]) assert.equal(damageVignettePeak(bad, flash), 0);
});

test('the pure stepper is exactly the authored exponential fade on the full profile', () => {
  const full = resolveDamageVignetteProfile(FULL);
  const v = { level: 0.18, target: 0, hold: 0 };
  let authored = 0.18;
  for (let i = 0; i < 90; i++) {
    stepDamageVignette(v, full, DT);
    authored += -authored * 4.0 * DT;
    if (authored < 0.001) authored = 0;
    assert.equal(v.level, authored, `frame ${i}`);
  }
  const junk = stepDamageVignette({ level: 0.1, target: NaN, hold: -3 }, full, NaN);
  assert.equal(junk.level, 0.1, 'a non-finite frame step holds instead of producing NaN opacity');
});

test('full settings keep the authored wash: it snaps to peak and re-fires with every hit', () => {
  const { samples, burstFrames } = sustainedFire(FULL);
  assert.ok(Math.abs(samples[0] - 0.108 * (1 - 4 * DT)) < 1e-12, 'first frame is the authored peak, decayed once');
  assert.ok(restrobes(samples, 0, burstFrames) >= 8, 'authored look unchanged (and the hazard it poses is real)');
});

test('Reduce flashing turns a burst of fire into one steady swell: no snap, no re-strobe, never dark', () => {
  for (const settings of [FLASH, BOTH]) {
    const { samples, burstFrames } = sustainedFire(settings);
    const maxStep = VIG_FLASH_RISE_PER_S * DT + 1e-9;
    for (let i = 1; i < samples.length; i++) {
      assert.ok(samples[i] - samples[i - 1] <= maxStep, `frame ${i}: the wash swells, it never snaps`);
    }
    assert.ok(samples[0] > 0 && samples[0] <= maxStep, 'the first hit already reads, gently');
    assert.equal(restrobes(samples, 0, burstFrames), 0, 'no dip-and-return while hits keep landing');
    assert.ok(samples.slice(0, burstFrames).every((o) => o > 0), 'the wash is never silenced mid-burst');
    const peak = Math.max(...samples);
    assert.ok(Math.abs(peak - VIG_REDUCED_PEAK_FLOOR) < 1e-9, `softened peak (got ${peak})`);
    // After the last hit the wash holds, then releases slowly and fully.
    const lastHit = burstFrames - (burstFrames % 12 || 12);
    const holdEnd = lastHit + Math.floor(VIG_FLASH_HOLD_S * 60);
    assert.ok(samples[holdEnd - 2] >= peak - 1e-9, 'held at peak through the hold window');
    assert.ok(samples[holdEnd + 30] < peak && samples[holdEnd + 30] > 0, 'then a slow release, not a cut');
    assert.equal(samples.at(-1), 0, 'and it clears');
  }
});

test('Reduce motion keeps the hit wash and the death wash; only the vestibular punch goes', () => {
  {
    const { state, bus, host, vig } = feelHost(MOTION);
    bus.emit('combat:damage', { attackerId: 8, targetId: 1, hullHit: true, amount: 12 });
    host.frame(DT, state);
    assert.equal(host._fovPunch, 0, 'no FOV punch under reduced motion');
    assert.equal(host._beatTimer, 0, 'no chained camera accent under reduced motion');
    assert.ok(Math.abs(opacity(vig) - 0.108 * 0.58) < 1e-9, `the wash still lands (got ${opacity(vig)})`);
    assert.equal(vig.className, 'sf-feel-vig sf-feel-vig--hit');
  }
  {
    const { state, bus, host, vig } = feelHost(MOTION);
    bus.emit('player:death', {});
    host.frame(DT, state);
    assert.equal(host._fovPunch, 0);
    assert.ok(Math.abs(opacity(vig) - 0.319) < 1e-9, 'the death wash still lands');
    assert.equal(vig.className, 'sf-feel-vig sf-feel-vig--death');
  }
});

test('Reduce flashing swells the death wash in over a quarter second instead of snapping it on', () => {
  const { state, bus, host, vig } = feelHost(FLASH);
  bus.emit('player:death', {});
  const samples = [];
  for (let f = 0; f < 120; f++) { host.frame(DT, state); samples.push(opacity(vig)); }
  assert.ok(samples[0] <= VIG_FLASH_RISE_PER_S * DT + 1e-9, 'no first-frame snap');
  const reached = samples.findIndex((o) => Math.abs(o - 0.165) < 1e-9);
  assert.ok(reached >= 15 && reached <= 18, `reaches the softened death peak in ~0.27 s (frame ${reached})`);
  assert.ok(samples.slice(reached, reached + 30).every((o) => Math.abs(o - 0.165) < 1e-9), 'and holds it');
});

test('photo mode still hides a pending swell', () => {
  const { state, bus, host, vig } = feelHost(FLASH);
  bus.emit('combat:damage', { attackerId: 8, targetId: 1, hullHit: true, amount: 12 });
  state.render.photoMode = { active: true };
  host.frame(DT, state);
  assert.equal(host._vig, 0);
  assert.equal(host._vigTarget, 0);
  assert.equal(opacity(vig), 0);
});
