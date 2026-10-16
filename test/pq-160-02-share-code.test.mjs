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
  copyShareText,
  decodeGhostShareText,
  ghostShareForRun,
  ghostShareTextForTape,
  importGhostShareText,
  runShareCodeForRun,
  runShareSummary,
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
  saveCrucibleMeta,
  takeGhostTape,
  useCrucibleMetaStorage,
} from '../src/systems/survivalRecords.js';
import {
  clearCrucibleSetup,
  crucibleSetupFor,
  lastCrucibleSetup,
  requestCrucibleRun,
} from '../src/ui/crucibleLaunch.js';
import { crucibleResultsScreen } from '../src/ui/screens/crucible.js';
import { fakeDom, findAll, findButtons, textLines } from './helpers/fake-dom.mjs';

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

test('share-code decoder rejects non-zero unused base64url tail bits', () => {
  const code = encodeShareBlock('SFC1', { s: 1 });
  const firstDash = code.indexOf('-');
  const lastDash = code.lastIndexOf('-');
  const body = code.slice(firstDash + 1, lastDash);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  assert.equal(body.length % 4, 2, 'fixture must leave four unused tail bits');

  const lastValue = alphabet.indexOf(body.at(-1));
  const mutatedBody = body.slice(0, -1) + alphabet[lastValue ^ 1];
  const mutated = `${code.slice(0, firstDash + 1)}${mutatedBody}${code.slice(lastDash)}`;

  assert.equal(decodeShareBlock(mutated, 'SFC1').ok, false);
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

/* ------------------------------------------------------------------------- *
 * Results: one-click Copy result / Copy ghost. The plate used to offer a text box to select by
 * hand, and on a pad nothing to copy with at all.
 * ------------------------------------------------------------------------- */

const RESULT_4242 = Object.freeze({
  outcome: 'defeat', ruleset: 'swarm', seed: 4242, arenaId: 'helios_core',
  wave: 14, deepestWave: 14, kills: 212, bestChain: 41, score: 1_240_000, credits: 880,
  picks: [
    { verb: 'Ram', defId: 'wpn_concussion_cannon_m', wave: 2 },
    { verb: 'Reel', defId: 'wpn_snarl_webcaster', wave: 4 },
    { verb: 'Ram', defId: 'wpn_concussion_cannon_m', wave: 6 },
  ],
});

function runCodeFor4242() {
  const setup = crucibleSetupFor({ seed: 4242 });
  assert.ok(setup.ok, 'the default starter produces a setup');
  return runShareCodeForRun(setup.value, RESULT_4242);
}

test('Copy result: the summary of a finished seed-4242 swarm run is one stable line', () => {
  const code = runCodeFor4242();
  assert.match(code, /^SFC1-/);
  const line = runShareSummary(RESULT_4242, { code });
  assert.equal(
    line,
    `SpaceFace Crucible - Helios Core - Round 14, chain x41, score 1.2M - seed 4242 - build: Ram, Reel - code ${code}`,
  );
  assert.ok(!/[\r\n]/.test(line), 'one line: it never wraps');
  assert.ok(!line.includes('helios_core'), 'an arena id never reaches a pasted line');
  assert.equal(runShareSummary(RESULT_4242, { code }), line, 'the same result reads the same line');
});

test('Copy result: partial results degrade to fewer words, never to nonsense', () => {
  const code = runCodeFor4242();
  // No round to report: the line is the code alone (null when there is neither).
  assert.equal(runShareSummary({ seed: 4242 }, { code }), code);
  assert.equal(runShareSummary(null, { code }), code);
  assert.equal(runShareSummary(null, {}), null);
  // A Gauntlet result has no kill chain; its figure is the score, and its unit is a wave.
  const gauntlet = runShareSummary(
    { ruleset: 'scored', seed: 77, arenaId: 'helios_core', wave: 5, bestChain: 9, score: 12_345 },
    { code },
  );
  assert.equal(gauntlet, `SpaceFace Crucible - Helios Core - Wave 5, score 12.3K - seed 77 - code ${code}`);
  // An unknown arena is left out rather than named "This run" or by its id.
  const unknown = runShareSummary({ ruleset: 'swarm', seed: 9, arenaId: 'not_a_real_arena', wave: 3 }, { code: null });
  assert.equal(unknown, 'SpaceFace Crucible - Round 3 - seed 9');
  // The big numbers read as words.
  const big = (score) => runShareSummary({ ruleset: 'swarm', wave: 2, score }, {});
  assert.match(big(999), /score 999$/);
  assert.match(big(1000), /score 1K$/);
  assert.match(big(999_950), /score 1M$/);
  assert.match(big(2_500_000_000), /score 2.5B$/);
});

test('copyShareText resolves true only when the host accepted the text', async () => {
  const calls = [];
  assert.equal(await copyShareText('abc', { writeText: (t) => { calls.push(t); return Promise.resolve(); } }), true);
  assert.deepEqual(calls, ['abc']);
  assert.equal(await copyShareText('abc', { writeText: () => Promise.reject(new Error('denied')) }), false);
  assert.equal(await copyShareText('abc', { writeText: () => { throw new Error('sync'); } }), false);
  assert.equal(await copyShareText('abc', {}), false);
  assert.equal(await copyShareText('abc', null), false);
  assert.equal(await copyShareText('', { writeText: () => Promise.resolve() }), false);
});

/** Mount the real results plate over the stub DOM, with a navigator the test controls. */
function mountPlateWithNavigator(result, clipboard) {
  const savedDocument = globalThis.document;
  const doc = fakeDom();
  globalThis.document = doc;
  const root = doc._make('div');
  const bus = { emit() {}, on() { return () => {}; }, off() {}, once() {} };
  const registry = { get: (name) => (name === 'survivalResults' ? { lastResult: () => result } : null) };
  // The document stays global until restore(): a click that falls back builds a field after mount.
  crucibleResultsScreen.mount(root, { bus, registry, state: {} });
  const savedNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: clipboard ? { clipboard } : {}, configurable: true, writable: true,
  });
  const restore = () => {
    if (savedDocument === undefined) delete globalThis.document;
    else globalThis.document = savedDocument;
    if (savedNavigator) Object.defineProperty(globalThis, 'navigator', savedNavigator);
    else delete globalThis.navigator;
  };
  return { root, restore };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));
const byClass = (root, cls) => findAll(root, (n) => String(n.className || '').split(/\s+/).includes(cls));
const click = (button) => button.listeners.click.forEach((fn) => fn({ target: button, preventDefault() {}, stopPropagation() {} }));
const buttonNamed = (root, label) => findButtons(root).find((b) => b.textContent === label);

function withRememberedRun(fn) {
  const bus = { emit() {}, on() { return () => {}; }, off() {}, once() {} };
  return async () => {
    try {
      assert.ok(requestCrucibleRun(bus, crucibleSetupFor({ seed: 4242 }).value, 'swarm'));
      await fn();
    } finally {
      clearCrucibleSetup();
      resetCrucibleMetaForTests();
    }
  };
}

test('Copy result: one click puts the one-line summary on the clipboard exactly once',
  withRememberedRun(async () => {
    const written = [];
    const plate = mountPlateWithNavigator(RESULT_4242, { writeText: (t) => { written.push(t); return Promise.resolve(); } });
    try {
      const copy = buttonNamed(plate.root, 'Copy result');
      assert.ok(copy, 'the share band carries a Copy result word');
      assert.equal(copy.tagName, 'button', 'an ordinary focusable button, so a pad can reach it');
      click(copy);
      await tick();
      const code = runShareCodeForRun(lastCrucibleSetup(), RESULT_4242);
      assert.equal(written.length, 1, 'one click, one clipboard write');
      assert.equal(written[0], runShareSummary(RESULT_4242, { code }));
      assert.match(written[0], /seed 4242/);
      assert.match(written[0], /Round 14/);
      assert.match(written[0], /Helios Core/);
      assert.ok(written[0].endsWith(code), 'the run code rides the line');
      const status = byClass(plate.root, 'sf-crres__share-status')[0];
      assert.ok(status, 'the feedback has its own line');
      assert.equal(status.attributes.role, 'status');
      assert.match(status.textContent, /Result copied/);
      assert.equal(byClass(plate.root, 'sf-crres__share-item').length, 1, 'no fallback field when the copy worked');
    } finally { plate.restore(); }
  }));

test('Copy result with no clipboard: the line lands selected in a field and the note says so',
  withRememberedRun(async () => {
    const plate = mountPlateWithNavigator(RESULT_4242, null);
    try {
      click(buttonNamed(plate.root, 'Copy result'));
      await tick();
      const status = byClass(plate.root, 'sf-crres__share-status')[0];
      assert.match(status.textContent, /selected in the field/);
      assert.doesNotMatch(status.textContent, /copied/i, 'the note never claims a copy that did not happen');
      const field = findAll(plate.root, (n) => n.tagName === 'input' && n.attributes['aria-label'] === 'Result line')[0];
      assert.ok(field, 'the summary is offered in a selectable field');
      assert.equal(field.readOnly, true);
      assert.equal(field.value, runShareSummary(RESULT_4242, { code: runShareCodeForRun(lastCrucibleSetup(), RESULT_4242) }));
      assert.ok(!field.value.includes('\n'));
    } finally { plate.restore(); }
  }));

test('a clipboard that refuses falls back the same way - never a false Copied',
  withRememberedRun(async () => {
    const plate = mountPlateWithNavigator(RESULT_4242, { writeText: () => Promise.reject(new Error('NotAllowedError')) });
    try {
      click(buttonNamed(plate.root, 'Copy result'));
      await tick();
      const text = textLines(plate.root).join('\n');
      assert.match(text, /selected in the field/);
      assert.doesNotMatch(text, /Result copied/);
    } finally { plate.restore(); }
  }));

test('Copy ghost puts the recorded ghost block on the clipboard; its own field is the fallback',
  withRememberedRun(async () => {
    const tape = {
      seed: 4242, hullId: 'ship_kestrel',
      frames: [{ t: 0, x: 0, z: 0, r: 0 }, { t: 60, x: 10, z: 5, r: 0.8 }],
    };
    const hash = ghostHash(tape);
    saveCrucibleMeta({
      ...loadCrucibleMeta(),
      ghosts: {
        byHash: { [String(hash)]: { hash, seed: 4242, hullId: 'ship_kestrel', frameCount: 2, frames: tape.frames, recordedAt: '2026-09-24T00:00:00.000Z' } },
        lastHash: hash,
      },
    });
    const written = [];
    const plate = mountPlateWithNavigator(RESULT_4242, { writeText: (t) => { written.push(t); return Promise.resolve(); } });
    try {
      const copy = buttonNamed(plate.root, 'Copy ghost');
      assert.ok(copy, 'the ghost word appears with a recorded ghost');
      click(copy);
      await tick();
      assert.equal(written.length, 1);
      assert.match(written[0], /^SFG1-/);
      assert.equal(written[0], ghostShareForRun(loadCrucibleMeta(), { seed: 4242 }).text);
      assert.match(byClass(plate.root, 'sf-crres__share-status')[0].textContent, /Ghost copied/);
    } finally { plate.restore(); }

    const bare = mountPlateWithNavigator(RESULT_4242, null);
    try {
      click(buttonNamed(bare.root, 'Copy ghost'));
      await tick();
      assert.match(byClass(bare.root, 'sf-crres__share-status')[0].textContent, /Ghost is selected in its field/);
    } finally { bare.restore(); }
  }));

test('no remembered launch and no ghost: the plate grows no share band and no copy buttons', () => {
  clearCrucibleSetup();
  resetCrucibleMetaForTests();
  const plate = mountPlateWithNavigator(RESULT_4242, null);
  try {
    assert.equal(findButtons(plate.root).some((b) => /^Copy /.test(b.textContent)), false);
  } finally { plate.restore(); }
});
