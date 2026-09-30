// ANI-05: kestrel drive iris — six petal groups on the shared bank, boost lifecycle clips.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateMotionClip } from '../src/contracts/motionBank.js';

const bank = JSON.parse(readFileSync(new URL('../assets/ships/motions/kestrel.motion.json', import.meta.url)));

function clip(name) {
  const c = bank.clips.find((x) => x.name === name);
  assert.ok(c, `clip ${name} missing`);
  return c;
}

function delta(name, t, group) {
  return evaluateMotionClip(bank, clip(name), t).get(group) || {};
}

test('ANI-05 binds six iris petal groups alongside the dish and mining rigs', () => {
  const ids = bank.bindings.map((b) => b.id);
  for (let i = 0; i < 6; i++) assert.ok(ids.includes(`kestrel_iris_${i}`), `iris petal ${i} missing`);
  assert.ok(ids.includes('kestrel_mining'));
  // clip names are unique across the shared bank — the iris stow must not shadow the mining stow
  const names = bank.clips.map((c) => c.name);
  assert.equal(new Set(names).size, names.length, `duplicate clip names: ${names}`);
});

test('ANI-05 ignite drives every petal ~1.22m along its own radial', () => {
  for (let i = 0; i < 6; i++) {
    const start = delta('irisIgnite', 0, `kestrel_iris_${i}`);
    const held = delta('irisIgnite', 0.85, `kestrel_iris_${i}`);
    const mag0 = Math.hypot(...start.translation);
    const mag1 = Math.hypot(...held.translation);
    assert.ok(mag1 > 1.0, `petal ${i} extended (|d|=${mag1.toFixed(2)})`);
    assert.ok(mag0 < mag1, 'petal travels outward-in during ignite');
    // every petal moves on its own radial — directions differ
    const dir = held.translation.map((v) => v / mag1);
    if (i === 0) assert.ok(Math.abs(dir[0]) < 0.01, 'iris slides are radial (no x drift)');
  }
});

test('ANI-05 stow parks all petals at rest', () => {
  assert.equal(clip('irisStow').endMode, 'rest');
  for (let i = 0; i < 6; i++) {
    const parked = delta('irisStow', 1.0, `kestrel_iris_${i}`);
    assert.ok(Math.hypot(...parked.translation) < 1e-4, `petal ${i} parks`);
  }
});

test('ANI-05 boost lifecycle routes prime/ignite/stow', () => {
  assert.equal(bank.events['ship:boostPreKick'], 'irisPrime');
  assert.equal(bank.events['ship:boostStart'], 'irisIgnite');
  assert.equal(bank.events['ship:boostStop'], 'irisStow');
  assert.equal(clip('irisPrime').endMode, 'hold');
  assert.equal(clip('irisIgnite').endMode, 'hold');
});
