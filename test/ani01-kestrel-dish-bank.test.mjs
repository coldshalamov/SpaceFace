// ANI-01 seal test: the shipped kestrel motion bank must validate against its contract, describe
// exactly the MOTION_ pivots the compiled render package carries, and its runtime-table reference
// must hash-bind the bytes on disk.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { evaluateMotionClip, validateMotionBank } from '../src/contracts/motionBank.js';

const BANK_PATH = 'assets/ships/motions/kestrel.motion.json';
const PACKAGE_PATH = 'assets/ships/release/render-packages/kestrel/render-package.json';

const bank = JSON.parse(readFileSync(BANK_PATH, 'utf8'));
const pkg = JSON.parse(readFileSync(PACKAGE_PATH, 'utf8'));

test('ANI-01 kestrel bank validates and is sealed into the runtime table', () => {
  assert.equal(validateMotionBank(bank), bank);
  assert.equal(bank.rigId, 'kestrel_dish');

  const ref = pkg.runtime && pkg.runtime.motionBank;
  assert.ok(ref, 'kestrel render package must carry runtime.motionBank');
  const bytes = readFileSync(BANK_PATH);
  assert.equal(ref.bytes, bytes.length);
  assert.equal(ref.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(ref.uri, BANK_PATH);
  assert.equal(ref.rigId, bank.rigId);

  // Every binding's declared node exists in the compiled package graph.
  const nodeNames = new Set((pkg.nodes || []).map((n) => n.nodeName));
  for (const binding of bank.bindings) {
    assert.ok(nodeNames.has(binding.node), `compiled package is missing ${binding.node}`);
  }
});

test('ANI-01 scan clip lifts then yaws the dish and returns to rest', () => {
  const clip = bank.clips.find((c) => c.name === 'scan');
  assert.ok(clip, 'bank must declare a scan clip');
  assert.equal(clip.endMode, 'rest');

  const atRest = evaluateMotionClip(bank, clip, 0);
  const stemT = atRest.get('kestrel_dish_stem');
  assert.ok(Math.abs(stemT.translation[1]) < 1e-3, 'stem starts at rest height');

  const mid = evaluateMotionClip(bank, clip, clip.durationS / 2);
  const stemMid = mid.get('kestrel_dish_stem');
  // The lift channel peaks near the dish's quarter-diameter lift (~0.42 m) — the spec number.
  const peak = Math.max(...clip.channels
    .filter((c) => c.group === 'kestrel_dish_stem' && c.path === 'translation')
    .flatMap((c) => {
      const out = [];
      for (let i = 0; i < c.times.length; i++) out.push(c.values[i * 3 + 1]);
      return out;
    }));
  assert.ok(Math.abs(peak - 0.42) < 0.02, `stem lift should peak near 0.42 m (got ${peak})`);
  assert.ok(stemMid.translation[1] > 0.2, 'stem is lifted mid-scan');

  const yawMid = evaluateMotionClip(bank, clip, 2.5).get('kestrel_dish');
  assert.ok(Math.abs(yawMid.rotation[1]) > 0.15, 'dish yaws during the scan');
});

test('ANI-01 events map routes scan:pulse to the scan clip', () => {
  assert.equal(bank.events['scan:pulse'], 'scan');
});

// --- ANI-02 mining-head clips in the shared kestrel bank ----------------------------

test('ANI-02 kestrel_mining binding exists and deploy holds the head extended', () => {
  const binding = bank.bindings.find((b) => b.id === 'kestrel_mining');
  assert.ok(binding, 'bank must bind the kestrel_mining pivot');
  assert.equal(binding.node, 'MOTION_KESTREL_MINING');

  const deploy = bank.clips.find((c) => c.name === 'deploy');
  assert.ok(deploy, 'bank must declare a deploy clip');
  assert.equal(deploy.endMode, 'hold', 'deploy holds the head out for the beam duration');

  const parked = evaluateMotionClip(bank, deploy, 0).get('kestrel_mining');
  assert.ok(Math.abs(parked.translation[0]) < 1e-3, 'deploy starts at rest');

  // Half the 0.68 m cutter face: travel peaks near 0.34 m along the head axis (glTF +X).
  const channel = deploy.channels
    .find((c) => c.group === 'kestrel_mining' && c.path === 'translation');
  const xs = [];
  for (let i = 0; i < channel.times.length; i++) xs.push(channel.values[i * 3]);
  const peak = Math.max(...xs);
  assert.ok(Math.abs(peak - 0.34) < 0.06, `deploy travel should peak near 0.34 m (got ${peak})`);

  const held = evaluateMotionClip(bank, deploy, deploy.durationS).get('kestrel_mining');
  assert.ok(Math.abs(held.translation[0] - 0.34) < 0.01, 'deploy ends holding full extension');
});

test('ANI-02 stow withdraws to rest and events map routes the beam lifecycle', () => {
  const stow = bank.clips.find((c) => c.name === 'stow');
  assert.ok(stow, 'bank must declare a stow clip');
  assert.equal(stow.endMode, 'rest', 'stow parks the head');

  const start = evaluateMotionClip(bank, stow, 0).get('kestrel_mining');
  assert.ok(Math.abs(start.translation[0] - 0.34) < 0.01, 'stow starts from deployed extension');
  const end = evaluateMotionClip(bank, stow, stow.durationS).get('kestrel_mining');
  assert.ok(Math.abs(end.translation[0]) < 1e-3, 'stow ends at rest');

  const bite = bank.clips.find((c) => c.name === 'bite');
  assert.ok(bite, 'bank must declare a bite clip');
  assert.equal(bite.endMode, 'hold');
  const biteStart = evaluateMotionClip(bank, bite, 0).get('kestrel_mining');
  assert.ok(Math.abs(biteStart.translation[0] - 0.34) < 0.01, 'bite starts from deployed extension');

  assert.equal(bank.events['mining:start'], 'deploy');
  assert.equal(bank.events['mining:yield'], 'bite');
  assert.equal(bank.events['mining:stop'], 'stow');
  assert.equal(bank.events['beam:denied'], 'stow');
});
