import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  VFX_LIGHT_KINDS,
  VFX_LIGHT_PRESETS,
  presetFor,
  scalePreset,
  describeVfxLightPlan,
} from '../src/render/vfxColorLightDirector.js';

// Pool sizes are read from disk, not imported: vfx.js currently pulls a dirty
// foreign selectionSigil.js whose GLSL comment breaks node --test parsing.
// The audit script enforces the same 6+2 invariant against the source text.
function poolSize(path, name) {
  const src = readFileSync(new URL(path, import.meta.url), 'utf8');
  const m = src.match(new RegExp(name + '\\s*=\\s*(\\d+)'));
  assert.ok(m, `${name} not found in ${path}`);
  return Number(m[1]);
}

test('light pools stay fixed: 6 event + 2 weapon, director resizes nothing', () => {
  assert.equal(poolSize('../src/render/vfx.js', 'EVENT_LIGHT_POOL_SIZE'), 6);
  assert.equal(poolSize('../src/render/weapons/weaponLights.js', 'WEAPON_LIGHT_POOL_SIZE'), 2);
});

test('every VFX light kind resolves a bounded preset', () => {
  assert.ok(Array.isArray(VFX_LIGHT_KINDS) && VFX_LIGHT_KINDS.length >= 8);
  for (const kind of VFX_LIGHT_KINDS) {
    const preset = presetFor(kind);
    assert.ok(preset, `missing preset for ${kind}`);
    assert.ok(Number.isFinite(preset.peak) && preset.peak > 0 && preset.peak <= 12,
      `${kind} peak out of bounds: ${preset.peak}`);
    assert.ok(Number.isFinite(preset.distance) && preset.distance >= 60 && preset.distance <= 220,
      `${kind} distance out of bounds: ${preset.distance}`);
    assert.ok(Number.isFinite(preset.decay) && preset.decay >= 4 && preset.decay <= 12,
      `${kind} decay out of bounds: ${preset.decay}`);
    assert.ok(/^#[0-9a-fA-F]{6}$/.test(preset.color), `${kind} color not hex: ${preset.color}`);
  }
});

test('unknown kinds fail closed, scaling never invents color', () => {
  assert.equal(presetFor('not-a-kind'), null);
  assert.equal(presetFor(null), null);
  const base = presetFor('explosion');
  const scaled = scalePreset(base, { sizeMul: 4 });
  assert.equal(scaled.color, base.color);
  assert.ok(scaled.peak > base.peak && scaled.peak < base.peak * 2,
    `sqrt scaling bounds violated: ${base.peak} -> ${scaled.peak}`);
  assert.equal(scalePreset(null), null);
  const plan = describeVfxLightPlan();
  assert.equal(plan.schema, 'spaceface.vfxColorLightDirector.v1');
});
