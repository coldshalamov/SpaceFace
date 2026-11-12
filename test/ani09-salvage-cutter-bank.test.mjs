// ANI-09 seal test: the shipped salvage-cutter motion bank must validate against its contract,
// describe the MOTION_ pivots the compiled render package carries, and its runtime-table reference
// must hash-bind the bytes on disk.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { evaluateMotionClip, validateMotionBank } from '../src/contracts/motionBank.js';

const BANK_PATH = 'assets/ships/motions/salvage-cutter.motion.json';
const PACKAGE_PATH = 'assets/ships/release/render-packages/salvage-cutter/render-package.json';

const bank = JSON.parse(readFileSync(BANK_PATH, 'utf8'));
const pkg = JSON.parse(readFileSync(PACKAGE_PATH, 'utf8'));

test('ANI-09 salvage-cutter bank validates and is sealed into the runtime table', () => {
  assert.equal(validateMotionBank(bank), bank);
  assert.equal(bank.rigId, 'salvage_cutter_jaw');

  const ref = pkg.runtime && pkg.runtime.motionBank;
  assert.ok(ref, 'salvage-cutter render package must carry runtime.motionBank');
  const bytes = readFileSync(BANK_PATH);
  assert.equal(ref.bytes, bytes.length);
  assert.equal(ref.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(ref.uri, BANK_PATH);
  assert.equal(ref.rigId, bank.rigId);

  const nodeNames = new Set((pkg.nodes || []).map((n) => n.nodeName));
  for (const binding of bank.bindings) {
    assert.ok(nodeNames.has(binding.node), `compiled package is missing ${binding.node}`);
  }
});

test('ANI-09 jawOpen yaws both jaws apart ~20 degrees and holds', () => {
  const clip = bank.clips.find((c) => c.name === 'jawOpen');
  assert.ok(clip, 'bank must declare a jawOpen clip');
  assert.equal(clip.endMode, 'hold', 'jawOpen holds the gape during a cut');

  const parked = evaluateMotionClip(bank, clip, 0).get('salvage_jaw_port');
  // glTF y quaternion component is zero at rest yaw
  assert.ok(Math.abs(parked.rotation[1]) < 1e-6, 'port jaw starts at rest');

  const held = evaluateMotionClip(bank, clip, clip.durationS).get('salvage_jaw_port');
  // sin(20deg / 2) = 0.1736 — glTF yaw quaternion y
  assert.ok(Math.abs(held.rotation[1] - 0.1736) < 0.01, `port jaw holds ~20 deg (got ${held.rotation[1]})`);

  const heldStar = evaluateMotionClip(bank, clip, clip.durationS).get('salvage_jaw_star');
  assert.ok(Math.abs(heldStar.rotation[1] + 0.1736) < 0.01, 'starboard jaw mirrors port');
});

test('ANI-09 rods re-aim and retract with the open jaw; clips and events line up', () => {
  const open = bank.clips.find((c) => c.name === 'jawOpen');
  const ram = evaluateMotionClip(bank, open, open.durationS).get('salvage_ram_port');
  // Rod slides ~0.30 m back along its axis (dominantly -x) and re-aims ~26 deg (sin(13)=0.225).
  assert.ok(ram.translation[0] < -0.2, `ram retracts along its axis (got ${ram.translation[0]})`);
  assert.ok(Math.abs(ram.rotation[1] - 0.225) < 0.02, `ram re-aims ~26 deg (got ${ram.rotation[1]})`);

  const bite = bank.clips.find((c) => c.name === 'jawBite');
  assert.ok(bite, 'bank must declare a jawBite clip');
  assert.equal(bite.endMode, 'hold');

  const release = bank.clips.find((c) => c.name === 'jawRelease');
  assert.ok(release, 'bank must declare a jawRelease clip');
  assert.equal(release.endMode, 'rest');
  const end = evaluateMotionClip(bank, release, release.durationS).get('salvage_jaw_port');
  assert.ok(Math.abs(end.rotation[1]) < 1e-6, 'jawRelease parks the jaw at rest');

  const cycle = bank.clips.find((c) => c.name === 'jawCycle');
  assert.ok(cycle, 'bank must declare a jawCycle clip');
  assert.equal(cycle.endMode, 'rest', 'one full work cycle returns to rest');
  const mid = evaluateMotionClip(bank, cycle, 0.8).get('salvage_jaw_port');
  assert.ok(Math.abs(mid.rotation[1] - 0.1736) < 0.02, 'cycle holds the gape mid-clip');
  const done = evaluateMotionClip(bank, cycle, cycle.durationS).get('salvage_jaw_port');
  assert.ok(Math.abs(done.rotation[1]) < 1e-6, 'cycle ends at rest');

  assert.equal(bank.events['salvage:npcExtraction'], 'jawCycle');
  assert.equal(bank.events['mining:start'], 'jawOpen');
  assert.equal(bank.events['mining:yield'], 'jawBite');
  assert.equal(bank.events['salvage:cutComplete'], 'jawBite');
  assert.equal(bank.events['mining:stop'], 'jawRelease');
  assert.equal(bank.events['beam:denied'], 'jawRelease');
});
