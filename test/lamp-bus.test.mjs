// The Lamp Bus (GFX16 slice 2): blinking lamps on Forge bodies through ONE shared clock.
// Gate: (a) the uniform advances and is shared, (b) nav lamps modulate within bounds and never go fully
// dark, (c) reduced-flash flattens them, (d) no extra materials are created per entity.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import * as THREE from 'three';

import {
  LAMP_BUS_VERSION,
  LAMP_CHANNEL_IDS,
  LAMP_CHANNELS,
  LAMP_MAX_FLASH_HZ,
  LAMP_RESERVED_SUFFIXES,
  LAMP_TIME_WRAP_S,
  lampFlashRateHz,
  lampGain,
  lampPhaseForKey,
  resolveLampChannel,
} from '../src/data/lampChannels.js';
import {
  LAMP_GAIN_GLSL,
  LAMP_UNIFORMS,
  installLampBus,
  tickLampBus,
} from '../src/render/lampBus.js';
import { applyAuthoredMaterialProfile } from '../src/render/authoredMaterialProfiles.js';
import { ILLUSTRATED_SURFACE_KEY } from '../src/render/illustratedSurface.js';
import { cloneMaterialPreservingShaderHooks } from '../src/render/materialClone.js';
import { dedicatedMaterialForProbe, sharedMaterialForProbe } from '../src/render/partsLibrary.js';

const NAV_CHANNELS = ['nav_port', 'nav_starboard'];

function forgeLamp(name, finish, role = 'signal') {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#330a08'),
    emissive: new THREE.Color('#ff3a2a'),
    emissiveIntensity: 3,
  });
  material.name = name;
  material.userData = {
    spacefaceFinish: 'forge-v1', spacefaceMaterialRole: role, forgeFinish: finish,
  };
  return material;
}

function resolveIncludes(source) {
  return source.replace(/^[ \t]*#include +<([\w\d./]+)>/gm, (_m, include) => {
    const chunk = THREE.ShaderChunk[include];
    if (chunk === undefined) throw new Error(`Can not resolve #include <${include}>`);
    return resolveIncludes(chunk);
  });
}

function compileHook(material) {
  const lib = THREE.ShaderLib.standard;
  const shader = { vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader, {});
  return shader;
}

// ---------------------------------------------------------------------------------------------
// Authored data
// ---------------------------------------------------------------------------------------------

test('every channel is a flash-and-decay envelope inside the accessibility limits', () => {
  assert.ok(LAMP_CHANNEL_IDS.length >= 5);
  for (const id of LAMP_CHANNEL_IDS) {
    const c = LAMP_CHANNELS[id];
    assert.ok(c.floor > 0 && c.floor < 1, `${id}: floor must be above zero (a lamp is never fully dark)`);
    assert.ok(c.steady > c.floor && c.steady <= 1, `${id}: steady sits between floor and full`);
    assert.ok(c.attack > 0 && c.tau > 0, `${id}: attack and decay are positive`);
    assert.ok(c.attack >= 0.02, `${id}: attack under one 60 Hz frame would be a square wave`);
    const cycles = LAMP_TIME_WRAP_S / c.period;
    assert.ok(Math.abs(cycles - Math.round(cycles)) < 1e-9, `${id}: period must divide the clock wrap`);
    assert.ok(lampFlashRateHz(c) <= LAMP_MAX_FLASH_HZ, `${id}: nominal flash rate over ${LAMP_MAX_FLASH_HZ} Hz`);
    if (c.tapAmp > 0) {
      assert.ok(c.tapAt > c.attack && c.tapAt < c.period, `${id}: second tap sits inside the cycle`);
      assert.ok(c.tapAmp <= 1, `${id}: tap amplitude <= 1`);
    }
  }
  assert.equal(LAMP_BUS_VERSION, 'spaceface-lamp-bus-v1');
});

test('only hull nav lamps and explicit opt-in finishes are ever on a channel', () => {
  // Hull nav lamps, by exact material name AND package slot.
  assert.equal(resolveLampChannel('Material_Emissive_NavRed', { slot: 'hull' }), 'nav_port');
  assert.equal(resolveLampChannel('Material_Emissive_NavGreen', { slot: 'hull' }), 'nav_starboard');
  // Stations and props use glow_red / glow_green for lit trims and dock lamps: untouched.
  assert.equal(resolveLampChannel('Material_Emissive_NavRed', { slot: 'place' }), null);
  assert.equal(resolveLampChannel('Material_Emissive_NavGreen', { slot: 'place' }), null);
  assert.equal(resolveLampChannel('Material_Emissive_NavRed'), null);
  // NEVER from the base finish alone: amber / cyan / warm carry trims, dock lamps and window rows.
  for (const name of [
    'Material_Emissive_Amber', 'Material_Emissive_Cyan', 'Material_Emissive_Warm', 'Material_Thruster',
    // Existing colour variants are different words and must not blink.
    'Material_Emissive_Cyan_jacket', 'Material_Emissive_Cyan_helios', 'Material_Emissive_Cyan_sodium',
    'Material_Emissive_Cyan_copper', 'Material_Emissive_Cyan_blue', 'Material_Emissive_Cyan_warning',
    'Material_Emissive_Cyan_orange', 'Material_Emissive_Cyan_crimson',
  ]) {
    for (const slot of ['hull', 'place', null]) assert.equal(resolveLampChannel(name, { slot }), null, name);
  }
  // Opt-in: a recipe names a variant finish (glow_amber.beacon -> Material_Emissive_Amber_beacon).
  for (const suffix of LAMP_RESERVED_SUFFIXES) {
    for (const slot of ['hull', 'place', null]) {
      assert.equal(resolveLampChannel(`Material_Emissive_Amber_${suffix}`, { slot }), suffix);
      assert.equal(resolveLampChannel(`Material_Emissive_Cyan_${suffix}`, { slot }), suffix);
    }
    assert.ok(LAMP_CHANNELS[suffix], `reserved suffix ${suffix} has a channel`);
  }
});

// ---------------------------------------------------------------------------------------------
// (b) the envelope
// ---------------------------------------------------------------------------------------------

test('nav lamps modulate inside bounds, flash and decay, and never go fully dark', () => {
  for (const id of NAV_CHANNELS) {
    const c = LAMP_CHANNELS[id];
    for (const phase of [0, 0.13, 0.37, 0.5, 0.81, 0.99]) {
      let min = Infinity;
      let max = -Infinity;
      let nearFloor = 0;
      const samples = 3000;
      for (let i = 0; i < samples; i++) {
        const g = lampGain(id, (i / samples) * c.period * 7, phase);
        assert.ok(Number.isFinite(g));
        min = Math.min(min, g);
        max = Math.max(max, g);
        if (g < c.floor + 0.05) nearFloor++;
      }
      assert.ok(min >= c.floor - 1e-9, `${id}: gain ${min} fell below the floor ${c.floor}`);
      assert.ok(min > 0, `${id}: never fully dark`);
      assert.ok(max <= 1 + 1e-9, `${id}: never brighter than the authored lamp`);
      assert.ok(max >= 0.97, `${id}: reaches full light on the flash`);
      // The dim tail is the minority of the cycle, not nearly all of it.
      assert.ok(nearFloor / samples < 0.75, `${id}: sits on the floor ${(nearFloor / samples).toFixed(2)} of the cycle`);
    }
  }
});

test('envelopes are curves, not square waves: bounded frame step, monotone decay', () => {
  for (const id of LAMP_CHANNEL_IDS) {
    const c = LAMP_CHANNELS[id];
    const frame = 1 / 60;
    let worstStep = 0;
    let previous = lampGain(id, 0, 0);
    let intermediate = 0;
    for (let t = frame; t < c.period * 3; t += frame) {
      const g = lampGain(id, t, 0);
      worstStep = Math.max(worstStep, Math.abs(g - previous));
      if (g > c.floor + 0.1 && g < 0.9) intermediate++;
      previous = g;
    }
    // A hard on/off would step the whole (1 - floor) range in one frame.
    assert.ok(worstStep < (1 - c.floor) * 0.95, `${id}: frame step ${worstStep.toFixed(3)} is a square wave`);
    assert.ok(intermediate >= 6, `${id}: needs real intermediate values, got ${intermediate}`);
  }
  // After the peak a single-flash channel only ever decays until the next cycle.
  const beacon = LAMP_CHANNELS.beacon;
  let last = lampGain('beacon', beacon.attack, 0);
  for (let t = beacon.attack; t < beacon.period; t += 0.004) {
    const g = lampGain('beacon', t, 0);
    assert.ok(g <= last + 1e-9, `beacon must decay monotonically (t=${t.toFixed(3)})`);
    last = g;
  }
});

test('no channel exceeds 3 flashes per second, even for a clock running 25% fast', () => {
  for (const id of LAMP_CHANNEL_IDS) {
    const c = LAMP_CHANNELS[id];
    // Count rising crossings of 60% over a minute at 1 kHz; also stretch time by 1.25.
    for (const stretch of [1, 1.25]) {
      let rises = 0;
      let wasHigh = false;
      const seconds = 60;
      for (let ms = 0; ms < seconds * 1000; ms++) {
        const high = lampGain(id, (ms / 1000) * stretch, 0.2) > 0.6;
        if (high && !wasHigh) rises++;
        wasHigh = high;
      }
      assert.ok(rises / seconds <= LAMP_MAX_FLASH_HZ, `${id}: ${(rises / seconds).toFixed(2)} flashes/s`);
    }
  }
  // Port and starboard alternate: their flashes never start together.
  const port = LAMP_CHANNELS.nav_port;
  const star = LAMP_CHANNELS.nav_starboard;
  assert.equal(port.period, star.period);
  assert.ok(Math.abs(star.offset - port.offset - 0.5) < 1e-9);
  assert.ok(lampGain('nav_port', 0, 0) > 0.95 || lampGain('nav_port', 0.04, 0) > 0.95);
  assert.ok(lampGain('nav_starboard', 0.04, 0) < 0.6, 'starboard is mid-cycle while port flashes');
});

test('the cycle fraction is continuous across the clock wrap', () => {
  for (const id of LAMP_CHANNEL_IDS) {
    for (const dt of [0, 0.017, 0.4]) {
      const before = lampGain(id, LAMP_TIME_WRAP_S - 0.5 + dt, 0.3);
      const after = lampGain(id, (LAMP_TIME_WRAP_S - 0.5 + dt) - LAMP_TIME_WRAP_S, 0.3);
      assert.ok(Math.abs(before - after) < 1e-9, `${id}: wrap would pop`);
    }
  }
});

test('phase is a stable cosmetic hash in [0, 1) that spreads sister hulls apart', () => {
  assert.equal(lampPhaseForKey('abc'), lampPhaseForKey('abc'));
  const seen = new Set();
  for (let i = 0; i < 64; i++) {
    const p = lampPhaseForKey(`3f2c9a40-${i}`);
    assert.ok(p >= 0 && p < 1);
    seen.add(Math.floor(p * 8));
  }
  assert.ok(seen.size >= 6, 'phases spread over the cycle');
  const source = readFileSync(new URL('../src/data/lampChannels.js', import.meta.url), 'utf8')
    + readFileSync(new URL('../src/render/lampBus.js', import.meta.url), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/state\.rng|Math\.random|performance\.now|Date\.now/.test(code),
    'lamp phase and clock are cosmetic: no rng, no wall clock inside the bus');
});

// ---------------------------------------------------------------------------------------------
// (a) shared uniform
// ---------------------------------------------------------------------------------------------

test('tickLampBus advances ONE shared uniform and wraps it', () => {
  const timeObject = LAMP_UNIFORMS.sfLampTime;
  const motionObject = LAMP_UNIFORMS.sfLampMotion;
  assert.ok(Object.isFrozen(LAMP_UNIFORMS), 'the uniform table is not replaceable');
  tickLampBus(10, false);
  assert.equal(LAMP_UNIFORMS.sfLampTime.value, 10);
  tickLampBus(10.5, false);
  assert.equal(LAMP_UNIFORMS.sfLampTime.value, 10.5);
  tickLampBus(LAMP_TIME_WRAP_S + 7.25, false);
  assert.equal(LAMP_UNIFORMS.sfLampTime.value, 7.25, 'wraps at the clock period');
  tickLampBus(NaN, false);
  assert.equal(LAMP_UNIFORMS.sfLampTime.value, 0, 'a bad clock reads as zero, never NaN');
  assert.equal(LAMP_UNIFORMS.sfLampTime, timeObject, 'the uniform OBJECT never changes identity');
  assert.equal(LAMP_UNIFORMS.sfLampMotion, motionObject);
  tickLampBus(0, false);
});

test('until the renderer ticks the bus every lamp holds its steady glow (stills, benches and previews)', () => {
  // A fresh process: nothing has ticked yet. Lamps must not freeze at an arbitrary flash phase.
  const busUrl = new URL('../src/render/lampBus.js', import.meta.url).href;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e',
    `import { LAMP_UNIFORMS } from ${JSON.stringify(busUrl)}; console.log('MOTION=' + LAMP_UNIFORMS.sfLampMotion.value);`,
  ], { encoding: 'utf8' });
  const motion = Number(/MOTION=(\S+)/.exec(out)[1]);
  assert.ok(motion >= 0 && motion < 1e-6, `unticked motion is ${motion}`);
  // With motion ~0 the shader's mix(steady, animated, motion) is the channel's steady gain for every phase.
  for (const id of LAMP_CHANNEL_IDS) {
    const c = LAMP_CHANNELS[id];
    for (const phase of [0, 0.3, 0.7]) {
      const animated = lampGain(id, 0.5, phase, false);
      assert.ok(Math.abs((c.steady + (animated - c.steady) * motion) - c.steady) < 1e-6);
    }
  }
});

test('every lamp material reaches the SAME uniform objects; per-material constants stay per material', () => {
  const a = forgeLamp('Material_Emissive_NavRed', 'glow_red');
  const b = forgeLamp('Material_Emissive_NavGreen', 'glow_green');
  assert.equal(installLampBus(a, 'nav_port'), true);
  assert.equal(installLampBus(b, 'nav_starboard'), true);
  const sa = compileHook(a);
  const sb = compileHook(b);
  assert.equal(sa.uniforms.sfLampTime, LAMP_UNIFORMS.sfLampTime);
  assert.equal(sb.uniforms.sfLampTime, LAMP_UNIFORMS.sfLampTime);
  assert.equal(sa.uniforms.sfLampMotion, LAMP_UNIFORMS.sfLampMotion);
  assert.equal(sb.uniforms.sfLampMotion, LAMP_UNIFORMS.sfLampMotion);
  assert.notEqual(sa.uniforms.sfLampShape, sb.uniforms.sfLampShape);
  assert.equal(sa.uniforms.sfLampShape.value.x, LAMP_CHANNELS.nav_port.period);
  assert.equal(sa.uniforms.sfLampShape.value.y, LAMP_CHANNELS.nav_port.floor);
  assert.equal(sa.uniforms.sfLampShape.value.z, LAMP_CHANNELS.nav_port.steady);
  // One program family: both channels share a cache key (only uniforms differ).
  assert.equal(a.customProgramCacheKey(), b.customProgramCacheKey());
  assert.ok(a.customProgramCacheKey().includes(LAMP_BUS_VERSION));
  assert.equal(a.userData.spacefaceLampChannel, 'nav_port');
});

test('ship-local clones (the nav-lamp damage path) inherit the hook and stagger by their own uuid', () => {
  const base = forgeLamp('Material_Emissive_NavRed', 'glow_red');
  installLampBus(base, 'nav_port');
  const clones = [];
  for (let i = 0; i < 24; i++) clones.push(cloneMaterialPreservingShaderHooks(base));
  const phases = new Set();
  for (const clone of clones) {
    assert.equal(clone.onBeforeCompile, base.onBeforeCompile, 'clone keeps the lamp hook');
    assert.equal(clone.customProgramCacheKey(), base.customProgramCacheKey(), 'clone keeps the program key');
    assert.equal(clone.userData.spacefaceLampChannel, 'nav_port');
    const shader = compileHook(clone);
    assert.equal(shader.uniforms.sfLampTime, LAMP_UNIFORMS.sfLampTime, 'clones share the one clock');
    phases.add(Math.floor(shader.uniforms.sfLampShape.value.w * 8));
  }
  assert.ok(phases.size >= 5, `sister hulls must not blink in unison (phase buckets: ${phases.size})`);
});

// ---------------------------------------------------------------------------------------------
// (c) reduced flash
// ---------------------------------------------------------------------------------------------

test('reduced-flash flattens every channel to its steady gain', () => {
  for (const id of LAMP_CHANNEL_IDS) {
    const c = LAMP_CHANNELS[id];
    for (let i = 0; i < 400; i++) {
      assert.equal(lampGain(id, i * 0.037, (i % 7) / 7, true), c.steady);
    }
  }
  // Strobes are tamed hardest: steady is well below full light.
  assert.ok(LAMP_CHANNELS.strobe.steady <= 0.7);
  tickLampBus(5, true);
  assert.equal(LAMP_UNIFORMS.sfLampMotion.value, 0, 'reduced flash drives the shared motion uniform to 0');
  tickLampBus(5, false);
  assert.equal(LAMP_UNIFORMS.sfLampMotion.value, 1);
  // The shader blends steady -> animated by that uniform.
  assert.match(LAMP_GAIN_GLSL, /mix\(sfLampShape\.z, sfAnimated, sfLampMotion\)/);
});

test('the renderer ticks the bus once a frame and wires the existing flash-reduce settings', () => {
  const source = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ tickLampBus \} from '\.\/lampBus\.js';/);
  const calls = source.match(/tickLampBus\(/g) || [];
  assert.equal(calls.length, 1, 'exactly one tick site');
  assert.match(source, /tickLampBus\(authoredNow, _worldSiteA11y\.reducedFlash \|\| !!\(settings\.video && settings\.video\.flashReduce\)\)/);
  assert.match(source, /_worldSiteA11y\.reducedFlash = !!\(settings\.accessibility && settings\.accessibility\.flashReduce\)/);
});

// ---------------------------------------------------------------------------------------------
// (d) no extra materials, no recompile of hulls, correct admission
// ---------------------------------------------------------------------------------------------

test('admission puts hull nav lamps on the bus without creating or cloning any material', () => {
  const originalClone = THREE.Material.prototype.clone;
  const originalCopy = THREE.Material.prototype.copy;
  let cloned = 0;
  THREE.Material.prototype.clone = function spyClone(...args) { cloned++; return originalClone.apply(this, args); };
  THREE.Material.prototype.copy = function spyCopy(...args) { cloned++; return originalCopy.apply(this, args); };
  try {
    const red = forgeLamp('Material_Emissive_NavRed', 'glow_red');
    const green = forgeLamp('Material_Emissive_NavGreen', 'glow_green');
    const amber = forgeLamp('Material_Emissive_Amber', 'glow_amber');
    const cyan = forgeLamp('Material_Emissive_Cyan', 'glow_cyan');
    const warm = forgeLamp('Material_Emissive_Warm', 'glow_warm');
    const jacket = forgeLamp('Material_Emissive_Cyan_jacket', 'glow_cyan');
    const beacon = forgeLamp('Material_Emissive_Amber_beacon', 'glow_amber');
    const stationRed = forgeLamp('Material_Emissive_NavRed', 'glow_red');
    for (const m of [red, green, amber, cyan, warm, jacket, stationRed]) {
      assert.equal(applyAuthoredMaterialProfile(m, 'signal', { assetId: 'SF_TEST', slot: m === stationRed ? 'place' : 'hull' }), true);
    }
    assert.equal(applyAuthoredMaterialProfile(beacon, 'signal', { assetId: 'SF_TEST', slot: 'place' }), true);
    assert.equal(red.userData.spacefaceLampChannel, 'nav_port');
    assert.equal(green.userData.spacefaceLampChannel, 'nav_starboard');
    assert.equal(beacon.userData.spacefaceLampChannel, 'beacon', 'opt-in applies on any slot');
    for (const m of [amber, cyan, warm, jacket, stationRed]) {
      assert.equal(m.userData.spacefaceLampChannel, undefined, `${m.name} must stay steady`);
      assert.equal(m.onBeforeCompile.toString(), new THREE.MeshStandardMaterial().onBeforeCompile.toString());
    }
    // Admission is idempotent: re-applying neither re-installs nor stacks hooks.
    const hook = red.onBeforeCompile;
    applyAuthoredMaterialProfile(red, 'signal', { assetId: 'SF_TEST', slot: 'hull' });
    assert.equal(red.onBeforeCompile, hook);
    // 500 frames of ticking creates nothing.
    for (let i = 0; i < 500; i++) tickLampBus(i / 60, i % 97 === 0);
    tickLampBus(0, false);
    assert.equal(cloned, 0, 'the bus must not clone or copy a material');
  } finally {
    THREE.Material.prototype.clone = originalClone;
    THREE.Material.prototype.copy = originalCopy;
  }
});

test('the real instancing paths keep the hook: ship-local nav clones and the shared-material cache', () => {
  const palette = { hull: '#C8D8F0', accent: '#A0C4FF', thruster: '#88AAFF', dark: '#1A3A8F' };
  // Nav lamps: damageRole navLight -> a ship-local clone per hull (the damage system dims its emissive).
  const nav = forgeLamp('Material_Emissive_NavRed', 'glow_red');
  applyAuthoredMaterialProfile(nav, 'signal', { assetId: 'SF_TEST', slot: 'hull' });
  const navTags = { damageRole: 'navLight' };
  const shipA = new Map();
  const shipB = new Map();
  const cloneA = dedicatedMaterialForProbe(nav, navTags, palette, shipA, 'url|hull|HOOK_NAV_PORT');
  const cloneB = dedicatedMaterialForProbe(nav, navTags, palette, shipB, 'url|hull|HOOK_NAV_PORT');
  assert.notEqual(cloneA, nav, 'nav lamps are ship-local clones today (damage dimming writes emissiveIntensity)');
  assert.notEqual(cloneA, cloneB, 'one clone per ship');
  for (const clone of [cloneA, cloneB]) {
    assert.equal(clone.onBeforeCompile, nav.onBeforeCompile, 'the clone keeps the lamp hook');
    assert.equal(clone.customProgramCacheKey().includes(LAMP_BUS_VERSION), true);
    assert.equal(clone.userData.spacefaceLampChannel, 'nav_port');
    assert.equal(compileHook(clone).uniforms.sfLampTime, LAMP_UNIFORMS.sfLampTime);
  }
  assert.notEqual(
    compileHook(cloneA).uniforms.sfLampShape.value.w, compileHook(cloneB).uniforms.sfLampShape.value.w,
    'each ship staggers on its own',
  );

  // Shared cache: a hooked beacon and a steady trim lamp with IDENTICAL visible properties must never be
  // handed each other's material (first minted would win), in either order.
  for (const order of ['beacon-first', 'trim-first']) {
    const trim = forgeLamp('Material_Emissive_Amber', 'glow_amber');
    const beacon = forgeLamp('Material_Emissive_Amber_beacon', 'glow_amber');
    applyAuthoredMaterialProfile(trim, 'signal', { assetId: 'SF_TEST', slot: 'place' });
    applyAuthoredMaterialProfile(beacon, 'signal', { assetId: 'SF_TEST', slot: 'place' });
    const beaconTwin = forgeLamp('Material_Emissive_Amber_beacon', 'glow_amber');
    applyAuthoredMaterialProfile(beaconTwin, 'signal', { assetId: 'SF_TEST_2', slot: 'place' });
    // A fresh palette wear per order keeps the module-level cache entries from the first pass out of the second.
    const fresh = { ...palette, wear: order === 'beacon-first' ? 0.11 : 0.22 };
    const resolved = order === 'beacon-first'
      ? [sharedMaterialForProbe(beacon, {}, fresh), sharedMaterialForProbe(trim, {}, fresh)]
      : [sharedMaterialForProbe(trim, {}, fresh), sharedMaterialForProbe(beacon, {}, fresh)];
    const [sharedBeacon, sharedTrim] = order === 'beacon-first' ? resolved : [resolved[1], resolved[0]];
    assert.notEqual(sharedBeacon, sharedTrim, `${order}: steady trim must not share the blinking beacon`);
    assert.equal(sharedBeacon.userData.spacefaceLampChannel, 'beacon');
    assert.equal(sharedBeacon.customProgramCacheKey().includes(LAMP_BUS_VERSION), true);
    assert.equal(sharedTrim.userData.spacefaceLampChannel, undefined);
    assert.equal(sharedTrim.customProgramCacheKey().includes(LAMP_BUS_VERSION), false);
    // Two hulls' identical beacons still dedupe to ONE shared material (no per-hull clone).
    assert.equal(sharedMaterialForProbe(beaconTwin, {}, fresh), sharedBeacon);
  }
});

test('lamps are signal-role only: no illustrated-surface hook, no ILLUSTRATED_SURFACE_KEY bump', () => {
  assert.equal(ILLUSTRATED_SURFACE_KEY, 'spaceface-illustrated-surface-v13');
  const red = forgeLamp('Material_Emissive_NavRed', 'glow_red');
  applyAuthoredMaterialProfile(red, 'signal', { assetId: 'SF_TEST', slot: 'hull' });
  assert.equal(red.userData.spacefaceIllustratedSurface, undefined, 'a lamp never wears the paint shader');
  assert.equal(red.customProgramCacheKey().includes(ILLUSTRATED_SURFACE_KEY), false);
  // A hull-paint material is untouched by the bus.
  const paint = forgeLamp('Material_Hull', 'paint', 'hull');
  paint.emissive = new THREE.Color(0x000000);
  applyAuthoredMaterialProfile(paint, 'hull', { assetId: 'SF_TEST', slot: 'hull' });
  assert.equal(paint.userData.spacefaceLampChannel, undefined);
  assert.equal(paint.userData.spacefaceIllustratedSurface, ILLUSTRATED_SURFACE_KEY);
  // Non-forge materials are never touched, even when the name matches.
  const legacy = new THREE.MeshStandardMaterial({ emissive: new THREE.Color('#ff0000'), emissiveIntensity: 2 });
  legacy.name = 'Material_Emissive_NavRed';
  applyAuthoredMaterialProfile(legacy, 'signal', { assetId: 'SF_TEST', slot: 'hull' });
  assert.equal(legacy.userData.spacefaceLampChannel, undefined);
});

test('the patched shader declares what it uses and gates only the emissive term', () => {
  const material = forgeLamp('Material_Emissive_NavRed', 'glow_red');
  assert.equal(installLampBus(material, 'nav_port'), true);
  const shader = compileHook(material);
  const resolved = resolveIncludes(shader.fragmentShader);
  const mainIdx = resolved.indexOf('void main()');
  const defIdx = resolved.indexOf('float sfLampGain()');
  const callIdx = resolved.indexOf('totalEmissiveRadiance *= sfLampGain();');
  assert.ok(defIdx > -1 && defIdx < mainIdx, 'sfLampGain is defined at file scope, before main()');
  assert.ok(callIdx > mainIdx, 'the gain is applied inside main()');
  assert.equal(resolved.split('float sfLampGain()').length, 2, 'defined once');
  // The multiply sits after the emissive map and before the lighting sums read the radiance.
  assert.ok(resolved.indexOf('totalEmissiveRadiance *= emissiveColor.rgb') < callIdx || !resolved.includes('emissiveColor.rgb'));
  assert.ok(callIdx < resolved.indexOf('vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;'));
  // Every sfLamp* identifier used is declared in the assembled shader.
  const declared = new Set();
  for (const m of resolved.matchAll(/\b(?:uniform|varying|attribute)\s+\w+\s+(sfLamp\w+)/g)) declared.add(m[1]);
  for (const m of resolved.matchAll(/\bfloat\s+(sfLamp\w+)\s*\(/g)) declared.add(m[1]);
  const used = new Set(resolved.match(/\bsfLamp\w+/g));
  for (const name of used) assert.ok(declared.has(name), `${name} is used but never declared`);
  assert.deepEqual([...declared].sort(), [
    'sfLampFlash', 'sfLampFlashShape', 'sfLampGain', 'sfLampMotion', 'sfLampShape', 'sfLampTime',
  ]);
  // Vertex stage untouched (no new varying, no attribute): lamps add no vertex data.
  assert.equal(shader.vertexShader, THREE.ShaderLib.standard.vertexShader);
  // Every declared uniform the shader reads is supplied by the hook.
  for (const uniform of ['sfLampTime', 'sfLampMotion', 'sfLampShape', 'sfLampFlash']) {
    assert.ok(shader.uniforms[uniform], `${uniform} supplied`);
  }
});

test('a changed three emissive contract fails loudly instead of silently not blinking', () => {
  const material = forgeLamp('Material_Emissive_NavRed', 'glow_red');
  installLampBus(material, 'nav_port');
  assert.throws(() => material.onBeforeCompile({ vertexShader: '', fragmentShader: 'void main(){}', uniforms: {} }),
    /lamp bus: physical emissive shader contract changed/);
});

test('installLampBus refuses what it cannot animate', () => {
  assert.equal(installLampBus(null, 'nav_port'), false);
  assert.equal(installLampBus(forgeLamp('x', 'glow_red'), 'nope'), false);
  const glassy = forgeLamp('Material_Emissive_NavRed', 'glow_red');
  glassy.transparent = true;
  assert.equal(installLampBus(glassy, 'nav_port'), false);
  assert.equal(installLampBus(new THREE.MeshBasicMaterial(), 'nav_port'), false);
});

test('ticking the bus allocates nothing per frame', (t) => {
  // Measured in a clean child process (the test runner's own garbage would drown the signal), with three
  // loaded exactly as in the game: a tiny 1 MB young generation, a warmed-up loop of varying doubles, three
  // million ticks, and every collection printed between the two markers is the loop's. One boxed number per
  // tick (the failure this guards: LAMP_UNIFORMS sharing three's uniform hidden class) is 48 MB of garbage.
  const busUrl = new URL('../src/render/lampBus.js', import.meta.url).href;
  const script = `
    import { tickLampBus } from ${JSON.stringify(busUrl)};
    const arr = new Float64Array(1024);
    for (let i = 0; i < 1024; i++) arr[i] = 100 + i * 0.01667;
    function drive(n) { for (let i = 0; i < n; i++) tickLampBus(arr[i & 1023], (i & 1023) === 0); }
    drive(1000000);
    console.log('LOOP_BEGIN');
    drive(3000000);
    console.log('LOOP_END');
  `;
  const out = execFileSync(process.execPath, [
    '--max-semi-space-size=1', '--min-semi-space-size=1', '--trace-gc', '--input-type=module', '-e', script,
  ], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const begin = out.indexOf('LOOP_BEGIN');
  const end = out.indexOf('LOOP_END');
  assert.ok(begin >= 0 && end > begin, 'child ran the loop');
  const inLoop = out.slice(begin, end).split('\n').filter((line) => /Scavenge|Mark-Compact|Mark-sweep/i.test(line));
  t.diagnostic(`garbage collections during 3M ticks: ${inLoop.length}`);
  assert.equal(inLoop.length, 0, `tickLampBus allocated: ${inLoop.length} collections in the loop`);
});
