// PQ-160.02 — Seeds and ghosts.
//
// Done when: two machines reproduce the same run from the code.
//
// Proven here as two independent OS processes on the production runtime: this process runs a real
// Crucible swarm (rapier-dynamic, scripted pilot) at a fixed seed, exports the run share code and
// the ghost share block, and a clean-room child process — which receives ONLY the code string and
// the ghost file, never the live state — decodes, reruns, and imports. Run hash, ghost content
// hash, and a sampled playback pose must all match.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applyRunShareCode,
  decodeGhostShareText,
  ghostShareForRun,
  ghostShareTextForTape,
  importGhostShareText,
  runShareCodeForRun,
} from '../src/ui/screens/shareCode.js';
import {
  decodeRunShareCode,
  decodeShareBlock,
  encodeRunShareCode,
  encodeShareBlock,
} from '../src/core/runShareCode.js';
import {
  armGhostPlayback,
  canonicalGhostTape,
  ghostHash,
  ghostPlaybackContract,
  ghostPoseAt,
  loadCrucibleMeta,
  resetCrucibleMetaForTests,
  sampleGhostPose,
  takeGhostTape,
  useCrucibleMetaStorage,
} from '../src/systems/survivalRecords.js';
import { crucibleSetupFor } from '../src/ui/crucibleLaunch.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHILD = join(ROOT, 'test', 'helpers', 'pq16002-second-machine.mjs');
const SEED = 16002;
const TICK_CAP = 3600;
const WAVE_COUNT = 1;
const POSE_TICK = 300;
const RESULT_LINE = 'PQ16002_RESULT_JSON:';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(String(k), String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function parseResultLine(stdout) {
  const idx = String(stdout || '').lastIndexOf(RESULT_LINE);
  if (idx < 0) return null;
  const line = String(stdout).slice(idx + RESULT_LINE.length).split(/\r?\n/, 1)[0];
  try { return JSON.parse(line); } catch { return null; }
}

test('PQ-160.02 run share code round-trips and fails closed on tamper', () => {
  const setup = crucibleSetupFor({ starterId: 'physics_toolkit', seed: SEED, arenaId: 'helios_core' }).value;
  const code = runShareCodeForRun(setup, { seed: SEED, ruleset: 'swarm', mutators: ['heavies_only'] });
  assert.equal(typeof code, 'string');
  assert.ok(code.startsWith('SFC1-'), 'run code carries the SFC1 prefix');

  const decoded = decodeRunShareCode(code);
  assert.equal(decoded.ok, true);
  assert.equal(decoded.spec.s, SEED);
  assert.equal(decoded.spec.r, 'swarm');
  assert.equal(decoded.spec.k, 'physics_toolkit');
  assert.deepEqual(decoded.spec.m, ['heavies_only']);

  const applied = applyRunShareCode(code);
  assert.equal(applied.ok, true);
  assert.equal(applied.seed, SEED);
  assert.equal(applied.starterId, 'physics_toolkit');
  assert.equal(applied.arenaId, 'helios_core');
  assert.deepEqual(applied.mutators, ['heavies_only']);

  // Whitespace from a wrapped paste still verifies.
  const wrapped = code.slice(0, 20) + '\n  ' + code.slice(20, 60) + ' ' + code.slice(60);
  assert.equal(decodeRunShareCode(wrapped).ok, true, 'pasted code survives line wrapping');

  // Tamper, truncation, and wrong-prefix all fail closed.
  const tampered = code.slice(0, -10) + 'x' + code.slice(-9);
  assert.equal(decodeRunShareCode(tampered).ok, false);
  assert.equal(decodeRunShareCode(code.slice(0, -12)).ok, false);
  assert.equal(decodeShareBlock(code, 'SFG1').ok, false, 'a run code is not a ghost code');
  assert.equal(applyRunShareCode('not a code').ok, false);
  assert.equal(applyRunShareCode('').ok, false);

  // A starter this build does not ship is denied, never silently substituted.
  const foreign = encodeRunShareCode({ seed: SEED, starterId: 'ship_that_does_not_exist' });
  const denied = applyRunShareCode(foreign);
  assert.equal(denied.ok, false);
  assert.match(denied.error, /not in this version/);
});

test('PQ-160.02 ghost share block round-trips and lands in a fresh profile', () => {
  takeGhostTape(); // drop any leftover recording in this process
  sampleGhostPose({ tick: 0, x: 0, z: 0, r: 0, seed: SEED, hullId: 'ship_hornet' });
  sampleGhostPose({ tick: 6, x: 6, z: 0, r: 0.5, seed: SEED, hullId: 'ship_hornet' });
  sampleGhostPose({ tick: 12, x: 12, z: 3, r: 1, seed: SEED, hullId: 'ship_hornet' });
  const tape = takeGhostTape();
  assert.ok(tape && tape.frames.length === 3);

  const text = ghostShareTextForTape(tape);
  assert.ok(text.startsWith('SFG1-'), 'ghost block carries the SFG1 prefix');

  const decoded = decodeGhostShareText(text);
  assert.equal(decoded.ok, true);
  assert.equal(decoded.hash, ghostHash(tape));

  // Machine B: a fresh profile bag injected at the module seam — the same bag armGhostPlayback
  // reads through loadCrucibleMeta on a second machine.
  const storage = memoryStorage();
  useCrucibleMetaStorage(storage);
  const imported = importGhostShareText(text, storage);
  assert.equal(imported.ok, true);
  assert.equal(imported.hash, ghostHash(tape));
  assert.equal(imported.alreadyPresent, false);
  const again = importGhostShareText(text, storage);
  assert.equal(again.alreadyPresent, true, 're-import is idempotent');

  const profile = loadCrucibleMeta(storage);
  const offer = ghostShareForRun(profile, { seed: SEED });
  assert.ok(offer && offer.hash === imported.hash, 'imported ghost is the share offer for its seed');

  const armed = armGhostPlayback(imported.hash);
  assert.ok(armed && armed.frames.length === 3);
  const contract = ghostPlaybackContract(armed, 6);
  assert.equal(contract.isCombatant, false, 'the shared ghost is never a combatant');
  assert.equal(contract.hasRapierBody, false);
  assert.deepEqual(ghostPoseAt(armed, 6), { x: 6, z: 0, r: 0.5 });

  // Corruption fails closed: the embedded content hash must match the canonical tape.
  const corrupt = text.slice(0, -10) + 'x' + text.slice(-9);
  assert.equal(decodeGhostShareText(corrupt).ok, false);
  const tamperedPayload = encodeShareBlock('SFG1', {
    v: 1,
    hash: '00000000',
    tape: canonicalGhostTape(tape),
  });
  const badHash = decodeGhostShareText(tamperedPayload);
  assert.equal(badHash.ok, false);
  assert.match(badHash.error, /hash mismatch/);

  resetCrucibleMetaForTests();
});

test(
  'PQ-160.02 two machines reproduce the same run from the code (seed 16002)',
  { timeout: 300_000 },
  async () => {
    const { simulateCrucibleSwarm } = await import('../scripts/lib/bench/crucibleBench.mjs');

    // ── Machine A (this process): the real production run, then export code + ghost block.
    const setup = crucibleSetupFor({ starterId: 'physics_toolkit', seed: SEED, arenaId: 'helios_core' }).value;
    takeGhostTape();
    const runA = await simulateCrucibleSwarm({
      arenaId: 'helios_core', loadoutId: 'physics_toolkit', seed: SEED,
      tickCap: TICK_CAP, waveCount: WAVE_COUNT,
    });
    const tapeA = takeGhostTape();
    assert.ok(tapeA && tapeA.frames.length > 0, 'machine A recorded a ghost tape on the real path');
    const ghostHashA = ghostHash(tapeA);
    const ghostText = ghostShareTextForTape(tapeA);
    const code = runShareCodeForRun(setup, {
      seed: SEED, ruleset: 'swarm', arenaId: 'helios_core', mutators: [],
    }, { ghostHash: ghostHashA });
    assert.ok(code && code.startsWith('SFC1-'));

    // The ghost block is the shared file; the run code is the shared code. Both cross the wire.
    const dir = mkdtempSync(join(tmpdir(), 'pq16002-'));
    const ghostFile = join(dir, 'shared-ghost.txt');
    writeFileSync(ghostFile, ghostText + '\n', 'utf8');

    // ── Machine B (clean-room child process): decode the code, rerun, import the ghost.
    const child = spawnSync(process.execPath, [
      CHILD,
      `--code=${code}`,
      `--ghost-file=${ghostFile}`,
      `--tick-cap=${TICK_CAP}`,
      `--wave-count=${WAVE_COUNT}`,
      `--pose-tick=${POSE_TICK}`,
    ], {
      encoding: 'utf8',
      timeout: 240_000,
      maxBuffer: 16 * 1024 * 1024,
      env: process.env,
      windowsHide: true,
    });
    assert.equal(child.status, 0,
      `second machine exited ${child.status}\nstderr:\n${child.stderr}\nstdout:\n${child.stdout}`);
    const machineB = parseResultLine(child.stdout);
    assert.ok(machineB, `second machine printed no result\nstdout:\n${child.stdout}`);
    assert.equal(machineB.ok, true, `second machine failed: ${machineB && machineB.error}`);

    // The code alone rebuilt the launch: same seed, same starter build, same arena.
    assert.equal(machineB.decoded.seed, SEED);
    assert.equal(machineB.decoded.starterId, 'physics_toolkit');
    assert.equal(machineB.decoded.arenaId, 'helios_core');

    // THE DONE-WHEN: both machines' runs are hash-identical.
    assert.equal(machineB.runHash, runA.runHash, 'machine B reproduced the run from the code');
    assert.equal(machineB.ticks, runA.ticks);
    assert.equal(machineB.stopReason, runA.stopReason);

    // The shared ghost imports on machine B and plays back the same pose tape.
    assert.ok(machineB.ghost, 'machine B imported the shared ghost');
    assert.equal(machineB.ghost.armedHash, ghostHashA, 'ghost content hash identical');
    assert.equal(machineB.ghost.hash, ghostHashA);
    assert.equal(machineB.ghost.alreadyPresent, false);
    assert.deepEqual(machineB.ghost.poseAtTick, ghostPoseAt(tapeA, POSE_TICK));
    assert.equal(machineB.ghost.contract.isCombatant, false);
    assert.equal(machineB.ghost.contract.hasRapierBody, false);

    console.log(
      `PQ-160.02 seed=${SEED} ticks=${runA.ticks} stopReason=${runA.stopReason} `
      + `runHash=${runA.runHash} ghostHash=${ghostHashA} ghostFrames=${tapeA.frames.length} `
      + 'machines=2 identical=true',
    );
  },
);

test('PQ-160.02 a shared ghost renders as a translucent hull', async () => {
  const { createCrucibleGhostPresentation, CRUCIBLE_GHOST_OPACITY } = await import(
    '../src/render/crucibleGhost.js'
  );
  takeGhostTape();
  sampleGhostPose({ tick: 0, x: 0, z: 0, r: 0, seed: SEED, hullId: 'ship_hornet' });
  sampleGhostPose({ tick: 6, x: 6, z: 0, r: 0.5, seed: SEED, hullId: 'ship_hornet' });
  const tape = takeGhostTape();
  const text = ghostShareTextForTape(tape);
  const storage = memoryStorage();
  useCrucibleMetaStorage(storage);
  const imported = importGhostShareText(text, storage);
  assert.equal(imported.ok, true);
  const armed = armGhostPlayback(imported.hash);
  assert.ok(armed);

  function fakeMaterial(opacity = 1) {
    return {
      opacity,
      transparent: false,
      depthWrite: true,
      needsUpdate: false,
      clone() { return fakeMaterial(this.opacity); },
      dispose() {},
    };
  }
  function fakeMesh() {
    const mesh = {
      material: fakeMaterial(1),
      visible: false,
      castShadow: true,
      position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
      rotation: { y: 0 },
      userData: {},
      parent: null,
      traverse(fn) { fn(this); },
      clone() { return fakeMesh(); },
    };
    return mesh;
  }

  const added = [];
  const presentation = createCrucibleGhostPresentation();
  presentation.attach({ add(obj) { added.push(obj); } });
  const player = fakeMesh();
  presentation.sync({ tick: 6 }, player);
  assert.equal(CRUCIBLE_GHOST_OPACITY, 0.32);
  assert.ok(added.length >= 1, 'ghost hull must be added to the scene');
  const ghost = added[0];
  assert.equal(ghost.visible, true);
  assert.equal(ghost.position.x, 6);
  assert.equal(ghost.position.z, 0);
  assert.ok(ghost.material.transparent, 'shared ghost hull is translucent');
  assert.ok(ghost.material.opacity <= CRUCIBLE_GHOST_OPACITY + 1e-9);
  assert.equal(ghost.material.depthWrite, false);
  assert.equal(ghost.userData.crucibleGhost, true);
  presentation.dispose();
  resetCrucibleMetaForTests();
});
