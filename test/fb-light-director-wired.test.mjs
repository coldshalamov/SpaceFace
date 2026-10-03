// FB-074 — the authored light identities drive event lights instead of per-call-site hand tuning.
//
// Contract under test:
//   1. Every `this._flashLight(` in vfx.js lives inside _eventLight — no call site owns a raw
//      colour/intensity literal any more; the director (vfxColorLightDirector.js) is the single
//      writer for event-light identity.
//   2. Every kind/severity routed at a call site resolves a preset row via presetFor.
//   3. A capital kill lights the authored `explosionCapital` plan (five-part audio beat parity).
//   4. The FB-077 reduced-motion floor (eventLightPeakScale 0.1) scales the routed light instead
//      of deleting it — a preset can never zero the cue.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from 'three';

import { presetFor, scalePreset, VFX_LIGHT_PRESETS } from '../src/render/vfxColorLightDirector.js';
import { resolveVfxAccessibilityProfile } from '../src/render/vfxAccessibility.js';
import { vfx } from '../src/render/vfx.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VFX_SOURCE = readFileSync(join(ROOT, 'src/render/vfx.js'), 'utf8');

// --------------------------------------------------------------------------
// Static seam: no inline literals, every routed kind resolves.

test('every event light in vfx.js routes through the director — zero raw _flashLight call sites', () => {
  const callSites = VFX_SOURCE.match(/this\._flashLight\(/g) || [];
  // The only remaining direct call is the single admission hop inside _eventLight itself.
  assert.equal(callSites.length, 1,
    `expected exactly one this._flashLight( (inside _eventLight), found ${callSites.length}`);
});

// Extract the full text of each `this._eventLight(` call (paren-balanced, calls may wrap lines).
function eventLightCallTexts(source) {
  const texts = [];
  let idx = -1;
  while ((idx = source.indexOf('this._eventLight(', idx + 1)) !== -1) {
    let depth = 0;
    let end = idx;
    for (let i = idx; i < source.length; i++) {
      const ch = source[i];
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    texts.push(source.slice(idx, end + 1));
  }
  return texts;
}

test('every kind routed through _eventLight resolves an authored preset', () => {
  const kinds = new Set();
  const severityWords = new Set();
  for (const call of eventLightCallTexts(VFX_SOURCE)) {
    // Kind literals sit before any `severity:` key — the position arg carries no quoted strings
    // and the options object begins at/after the severity expression.
    const sevAt = call.indexOf('severity:');
    const kindRegion = sevAt === -1 ? call : call.slice(0, sevAt);
    const sevRegion = sevAt === -1 ? '' : call.slice(sevAt);
    for (const m of kindRegion.matchAll(/'([a-z][a-z-]*)'/g)) kinds.add(m[1]);
    for (const m of sevRegion.matchAll(/'([a-z][a-z-]*)'/g)) severityWords.add(m[1]);
  }
  assert.ok(kinds.size >= 10, `expected the routed kind vocabulary, found ${kinds.size}`);
  const misses = [...kinds].filter((k) => !presetFor(k));
  assert.deepEqual(misses, [], 'every routed kind must resolve a preset row');
  // Every severity literal routed at a call site must still land a light (base fallback counts
  // as a resolved identity; an outright null would mean the director dropped the event).
  for (const kind of kinds) {
    for (const sev of severityWords) {
      assert.ok(presetFor(kind, sev), `presetFor('${kind}', '${sev}') returned null`);
    }
  }
});

test('every authored severity routed at a call site resolves a distinct preset row', () => {
  // The (kind, severity) pairs the vfx.js call sites actually route. Each must hit its own row —
  // a severity that silently falls back to the base preset would erase the cause/tier identity.
  const routed = [
    ['muzzle', 'rail'], ['muzzle', 'emp'], ['muzzle', 'thermal'], ['muzzle', 'pulse'],
    ['muzzle', 'torpedo'], ['muzzle', 'explosive'],
    ['explosion', 'capital'], ['explosion', 'ignition'], ['explosion', 'burst'],
    ['explosion', 'burst-capital'], ['explosion', 'compression'], ['explosion', 'shear'],
    ['explosion', 'kinetic-ignition'], ['explosion', 'thermal-ignition'], ['explosion', 'tear'],
    ['explosion', 'reactor'], ['explosion', 'reactor-rupture'], ['explosion', 'beat'],
    ['explosion', 'beat-rupture'], ['explosion', 'breach'], ['explosion', 'detonation'],
    ['shield', 'contact'], ['shield', 'break'],
    ['impact', 'hull'], ['impact', 'detonation'],
    ['mining', 'contact'], ['mining', 'yield'], ['mining', 'shatter'],
    ['thrust', 'boost'], ['thrust', 'afterburner'],
    ['tether', 'snap'], ['collision', 'terrain'],
    ['tell', 'mark'], ['tell', 'mark-calm'], ['tell', 'link'],
    ['law', 'calm'], ['vein', 'payout'],
  ];
  for (const [kind, severity] of routed) {
    const base = presetFor(kind);
    const variant = presetFor(kind, severity);
    assert.ok(variant, `presetFor('${kind}', '${severity}') resolved nothing`);
    assert.notEqual(variant, base,
      `severity '${severity}' must pick a distinct row for '${kind}', not fall back to the base`);
  }
});

test('an unknown severity falls back to the base kind rather than dropping the light', () => {
  assert.equal(presetFor('explosion', 'no-such-severity'), presetFor('explosion'));
  assert.equal(presetFor('explosion', 'capital'), VFX_LIGHT_PRESETS.explosionCapital,
    'the capital kill is bound to the explosionCapital plan');
  assert.equal(presetFor('capital-explosion'), VFX_LIGHT_PRESETS.explosionCapital,
    'the historical alias keeps working');
  assert.equal(presetFor('not-a-kind'), null);
});

// --------------------------------------------------------------------------
// Runtime seam: the routed identity reaches the pooled light through _flashLight.

function captureHost() {
  const calls = { lights: [] };
  const host = Object.create(vfx);
  host._flashLight = (...args) => { calls.lights.push(args); return true; };
  return { host, calls };
}

test('_eventLight resolves the authored identity and hands it to the pooled admission path', () => {
  const { host, calls } = captureHost();
  assert.equal(host._eventLight({ x: 4, z: 8 }, 'explosion', { severity: 'capital' }), true);
  const [pos, color, peak, decay, dist, priority] = calls.lights[0];
  assert.deepEqual(pos, { x: 4, z: 8 });
  const plan = scalePreset(VFX_LIGHT_PRESETS.explosionCapital, {});
  assert.equal(color, plan.color);
  assert.equal(peak, plan.peak);
  assert.equal(decay, plan.decay);
  assert.equal(dist, plan.distance);
  assert.equal(priority, plan.priority);
  // The render record carries WHICH authored plan lit the event.
  assert.deepEqual(
    { kind: host._lastEventLightPlan.kind, severity: host._lastEventLightPlan.severity },
    { kind: 'explosion', severity: 'capital' },
  );
  assert.equal(host._lastEventLightPlan.presetColor, VFX_LIGHT_PRESETS.explosionCapital.color);
});

test('a capital kill emits the explosionCapital plan through the destruction pipeline', () => {
  const host = Object.create(vfx);
  const lights = [];
  host._scene = {};
  host._burst = 1;
  host.state = { settings: { video: {}, accessibility: {} } };
  host.bus = { emit() {} };
  host._flashLight = (...args) => { lights.push(args); return true; };
  host._spawnSprite = () => {};
  host._spawnProjectileTrailStreak = () => {};
  host._spawnParticle = () => {};
  host._emitExplosionPhase('ignition', {
    classId: 'capital', x: 0, z: 0, radius: 14, dirX: 1, dirZ: 0, serial: 4242,
  });
  assert.equal(lights.length, 1, 'the capital ignition fires exactly one event light');
  assert.equal(host._lastEventLightPlan.severity, 'capital');
  assert.equal(lights[0][1], VFX_LIGHT_PRESETS.explosionCapital.color,
    'the capital kill lights the authored capital plan, not the generic explosion');
  // The production scale is classScale(capital 1.12) * clamp(sqrt(r/8), 0.78, 1.65).
  const scale = 1.12 * Math.max(0.78, Math.min(1.65, Math.sqrt(14 / 8)));
  assert.equal(lights[0][2], scalePreset(VFX_LIGHT_PRESETS.explosionCapital, { sizeMul: scale }).peak,
    'scalePreset owns the sized peak');
});

test('an authored color source still wins over the preset colour, but never the plan', () => {
  const { host, calls } = captureHost();
  host._eventLight({ x: 0, z: 0 }, 'mining', { severity: 'contact', color: '#cc8833' });
  assert.equal(calls.lights[0][1], '#cc8833', 'the ore tint stays authored');
  assert.equal(calls.lights[0][3], VFX_LIGHT_PRESETS.miningContact.decay);
  assert.equal(calls.lights[0][4], VFX_LIGHT_PRESETS.miningContact.distance);
});

test('an unknown kind is refused — the director is the only writer, never a silent default', () => {
  const { host, calls } = captureHost();
  assert.equal(host._eventLight({ x: 0, z: 0 }, 'no-such-kind'), false);
  assert.equal(calls.lights.length, 0);
});

// --------------------------------------------------------------------------
// FB-077 seam: the reduced-motion floor scales the routed light, never deletes it.

test('reduced motion keeps a non-zero floor through the real pool admission path', () => {
  const reduced = resolveVfxAccessibilityProfile({ video: { motionReduce: true } });
  assert.equal(reduced.eventLightPeakScale, 0.1, 'FB-077: reduced motion holds a 0.1 light floor');

  // Minimal real-pool host: one pooled light slot so _flashLight runs end to end.
  const host = Object.create(vfx);
  host.state = { settings: { video: { motionReduce: true } }, entities: new Map(), playerId: 1 };
  host._playerPos = () => ({ x: 0, z: 0 });
  host._toLocalXZ = (x, z) => ({ x, z });
  const slotObj = new THREE.PointLight(0xffffff, 0, 1);
  host._lights = [{
    slot: 0, obj: slotObj, active: false, intensity: 0, peak: 0, decay: 0, t: 0,
    sustainedKey: null, sustained: false, admissionPriority: 0.5, admissionSerial: -1,
  }];
  host._freeLights = [0];
  host._freeLightCount = 1;
  host._activeLightCount = 0;
  host._admissionSerial = 0;
  host._lightCur = 0;
  host._spawnLocalXZ = {};

  assert.equal(host._eventLight({ x: 0, z: 0 }, 'explosion', { severity: 'capital' }), true,
    'the reduced-motion floor must never zero an event light');
  const expectedPeak = scalePreset(VFX_LIGHT_PRESETS.explosionCapital, {}).peak * 0.1;
  assert.ok(Math.abs(host._lights[0].peak - expectedPeak) < 1e-9,
    `pool slot holds floor-scaled peak ${expectedPeak}, got ${host._lights[0].peak}`);
  assert.ok(host._lights[0].peak > 0, 'the light survives reduced motion');
});
