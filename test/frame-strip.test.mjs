// test/frame-strip.test.mjs — the capture's own rules, testable without a browser.
//
// Vision authority: design/program/FUN_CONVERGENCE_LOOP.md §0, the LAZY face —
// "Nobody played it. The path follower 'followed the path' at walking speed and passed its own
// tracking test." The capture that this file guards once photographed the title screen for 25
// seconds and reported PASS. These are the rules that make that impossible to repeat.

import test from 'node:test';
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdirSync, writeFileSync, existsSync, symlinkSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  retentionMask,
  waitForRealtime,
  installDrawHooks,
  condenseMoments,
  compareStripEventTicks,
  MOMENT_IMPACT_FLOOR,
  NORMAL_SPEED_FLOOR,
  STRIP_SCENARIOS,
  HUD_TEXT_OFF_CSS,
  CHROME_ARGS,
  DEFAULT_STRIP_DIR,
  DEFAULT_MANIFEST_DIR,
  assertSafeLeafToken,
  assertStrictDescendant,
  assertRealpathChainContained,
  cleanTargetDirectory,
} from '../scripts/lib/bench/frameStripCapture.mjs';

const at = (simTime) => ({ simTime });
/** 20 fps of samples, the rate the screencast actually delivers. */
const stream = (seconds) => Array.from({ length: seconds * 20 }, (_, i) => at(i / 20));

test('baseline cadence is 4 frames a second when nothing is happening', () => {
  const samples = stream(10);
  const keep = retentionMask(samples, []);
  const kept = keep.filter(Boolean).length;
  assert.ok(kept >= 39 && kept <= 41, `expected ~40 frames from ten quiet seconds, got ${kept}`);
});

test('cadence rises to 8 frames a second around a moment, and no higher', () => {
  // One moment at 30 s with an 8 s lead and 12 s tail covers 22-42 s.
  const samples = Array.from({ length: 60 * 20 }, (_, i) => at(i / 20));
  const keep = retentionMask(samples, [{ simTime: 30 }]);
  const inWindow = samples.filter((s, i) => keep[i] && s.simTime >= 23 && s.simTime <= 41).length;
  const outside = samples.filter((s, i) => keep[i] && s.simTime > 45).length;
  const windowSpan = 41 - 23;
  const outsideSpan = 60 - 45;
  assert.ok(inWindow / windowSpan > 7 && inWindow / windowSpan < 9,
    `around a moment the strip should run at 8 frames a second, got ${(inWindow / windowSpan).toFixed(1)}`);
  assert.ok(outside / outsideSpan > 3 && outside / outsideSpan < 5,
    `away from a moment the strip should fall back to 4 frames a second, got ${(outside / outsideSpan).toFixed(1)}`);
});

test('a bump is not a moment: contact noise is filtered and clusters are merged', () => {
  // What the real game actually published: 128 physics:impact events in five seconds, each
  // exchanging 2-4 momentum, from hostiles jostling on the spawn ring.
  const noise = Array.from({ length: 128 }, (_, i) => ({
    type: 'physics:impact', tick: i, simTime: i * 0.04, playerInvolved: false, magnitude: 2 + (i % 3),
  }));
  assert.equal(condenseMoments(noise).length, 0, 'spawn-ring jostling is not a moment');

  const real = [
    ...noise,
    { type: 'physics:impact', tick: 300, simTime: 5.0, playerInvolved: true, magnitude: 3 },
    { type: 'physics:impact', tick: 600, simTime: 10.0, playerInvolved: false, magnitude: MOMENT_IMPACT_FLOOR + 5 },
    // three events inside half a second are one thing happening, not three
    { type: 'entity:killed', tick: 900, simTime: 15.0, playerInvolved: false, magnitude: 0 },
    { type: 'physics:impact', tick: 906, simTime: 15.1, playerInvolved: true, magnitude: 90 },
    { type: 'combat:collisionConsequence', tick: 912, simTime: 15.2, playerInvolved: false, magnitude: 0 },
  ];
  const out = condenseMoments(real);
  assert.equal(out.length, 3, `expected three moments, got ${out.length}`);
  assert.equal(out[0].simTime, 5.0, 'an impact the player was in is always a moment, however small');
  assert.equal(out[2].merged, 3, 'the cluster at fifteen seconds is one moment');
});

test('two runs of one seed must agree on when things happened', () => {
  const a = { moments: [{ type: 'entity:killed', tick: 300 }, { type: 'physics:impact', tick: 512 }] };
  const b = { moments: [{ type: 'entity:killed', tick: 300 }, { type: 'physics:impact', tick: 512 }] };
  assert.equal(compareStripEventTicks(a, b).identical, true);

  const drifted = { moments: [{ type: 'entity:killed', tick: 300 }, { type: 'physics:impact', tick: 999 }] };
  const cmp = compareStripEventTicks(a, drifted);
  assert.equal(cmp.identical, false);
  assert.equal(cmp.mismatches[0].index, 1);
});

test('frames land in .devshots and only the manifest lands in a committed receipt', () => {
  // .gitignore ignores design/program/roadmap/receipts/fun-loop/strips/, so a manifest written
  // there would silently never be committed. fa099c61 untracked 337 title-screen PNGs; the
  // separation is the reason this does not happen twice.
  assert.match(DEFAULT_STRIP_DIR.replace(/\\/g, '/'), /\.devshots\/fun-loop\/strips$/);
  assert.match(DEFAULT_MANIFEST_DIR.replace(/\\/g, '/'), /receipts\/fun-loop\/manifests$/);
  assert.doesNotMatch(DEFAULT_MANIFEST_DIR.replace(/\\/g, '/'), /receipts\/fun-loop\/strips/);
});

test('the capture is set up to photograph the game, not the title screen', () => {
  // The vision sentence this serves, from FUN_CONVERGENCE_LOOP.md §0:
  const sentence = 'A capture at the shipping camera, at normal speed, graded by a critic that can see';

  assert.ok(HUD_TEXT_OFF_CSS.includes('#cinematic-splash'),
    `the title cinematic must be hidden, or the strip photographs it — ${sentence}`);
  assert.ok(HUD_TEXT_OFF_CSS.includes('.sf-crun'),
    `the run readout is HUD text and must be off — ${sentence}`);
  assert.ok(CHROME_ARGS.includes('--disable-renderer-backgrounding')
    && CHROME_ARGS.includes('--disable-background-timer-throttling'),
    `an occluded window throttles and the strip becomes slow motion — ${sentence}`);
  assert.ok(NORMAL_SPEED_FLOOR >= 0.6,
    `"at normal speed" needs a number to fail against — ${sentence}`);

  for (const [id, s] of Object.entries(STRIP_SCENARIOS)) {
    assert.ok(s.durationS >= 15, `${id} is too short to tell a story`);
    assert.ok(Array.isArray(s.tape), `${id} must declare an input tape, even an empty one`);
  }
  const piloted = STRIP_SCENARIOS.swarm_piloted;
  assert.ok(piloted.tape.length > 0,
    'a critic asked whether the ship turns inside the screen needs frames in which someone turned');
  assert.ok(piloted.tape.some((s) => s.mouseDown), 'and frames in which someone fired');
});


// ---------------------------------------------------------------------------------------------
// The empty-arena guard. Added 2026-09-04, after the "repaired" capture wrote 403 frames of a
// ringed planet and a star field with no ship anywhere in them and a manifest that said
// playerOnScreen: true for every one. See waitForHullsDrawn in frameStripCapture.mjs.
// ---------------------------------------------------------------------------------------------

test('the capture proves the ships were DRAWN, not merely inside the frustum', async () => {
  const src = await readFile(new URL('../scripts/lib/bench/frameStripCapture.mjs', import.meta.url), 'utf8');

  assert.match(src, /export async function waitForHullsDrawn/,
    'there is a gate that waits for the renderer to draw the ships');
  assert.match(src, /onAfterRender/,
    'the gate asks three.js what it actually submitted, which is the only thing that cannot be a claim');
  assert.match(src, /screenshot\(\{ clip/,
    'and confirms it with lit pixels where the hull is, so one broken signal cannot pass alone');
  assert.match(src, /the renderer never drew the ships/,
    'a capture whose ships never arrived throws instead of writing a manifest');
  assert.match(src, /refusing to write a manifest/,
    'and a strip whose median frame has no hull in it is refused too');
  assert.match(src, /hullPartsDrawn/,
    'every retained frame records whether the ship was drawn in it');
  assert.match(src, /webglRenderer/,
    'the manifest names the GPU that drew the pictures');
  assert.match(src, /hudTextVerifiedAtEnd/,
    'HUD text is verified again at the end, because a caption can arrive at second nine');
});

test('the capture binds sourceIdentity, harnessDigest, sourceTag path isolation, and stale frame cleanup', async () => {
  const src = await readFile(new URL('../scripts/lib/bench/frameStripCapture.mjs', import.meta.url), 'utf8');

  assert.match(src, /computeProductionSourceIdentity/,
    'the capture imports and computes production source identity');
  assert.match(src, /computeFunLoopHarnessDigest/,
    'the capture imports and computes fun loop harness digest');
  assert.match(src, /rawTag = candidateId \|\|/,
    'the capture paths are partitioned by candidateId / sourceTag');
  assert.match(src, /cleanTargetDirectory/,
    'stale image files are wiped before new frames are written');
  assert.match(src, /realpathSync/,
    'cleanup compares realpath results so a junction cannot escape the authorized root');
  assert.match(src, /receiptDir/,
    'new manifests record the capture-owned receipt directory for the PNG contact sheet');
  assert.match(src, /frameFormat:\s*(FRAME_FORMAT|'jpeg')/,
    'the manifest declares jpeg format for critic consumption');
  assert.match(src, /\.jpg/,
    'retained frames are written with .jpg extension');
});

test('unsafe candidate tags and path segments are refused rather than normalized', () => {
  for (const bad of ['..\\..\\..\\assets\\ships', '..\\crucible\\victim-hash', '../outside', 'a/b', 'C:foo', '..', '.', '']) {
    assert.throws(() => assertSafeLeafToken(bad, 'candidateId'), /unsafe/);
  }
  assert.equal(assertSafeLeafToken('abc_1.2-3', 'candidateId'), 'abc_1.2-3');
});

test('cleanup unlinks only inside the authorized target and cannot remove a sibling candidate', () => {
  const root = mkdtempSync(join(tmpdir(), 'sf-strip-clean-'));
  try {
    const aDir = join(root, 'crucible', 'candidate-a', 'strip');
    const bDir = join(root, 'crucible', 'candidate-b', 'strip');
    mkdirSync(aDir, { recursive: true });
    mkdirSync(bDir, { recursive: true });
    const victim = join(bDir, 'victim.jpg');
    writeFileSync(join(aDir, 'frame_000.jpg'), 'old');
    writeFileSync(join(aDir, 'strip-manifest.json'), '{}');
    writeFileSync(victim, 'keep');
    cleanTargetDirectory(aDir, root);
    assert.equal(existsSync(join(aDir, 'frame_000.jpg')), false);
    assert.equal(existsSync(victim), true);

    const outsideRoot = mkdtempSync(join(tmpdir(), 'sf-strip-outside-'));
    try {
      const sentinel = join(outsideRoot, 'keep.jpg');
      writeFileSync(sentinel, 'keep');
      assert.throws(() => assertStrictDescendant(join(outsideRoot, 'keep.jpg'), root, 'targetDir'), /not a strict descendant/);
      assert.equal(existsSync(sentinel), true);
    } finally {
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('cleanup refuses a junction or symlink that escapes the authorized root', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'sf-strip-junc-'));
  const outside = mkdtempSync(join(tmpdir(), 'sf-strip-junc-out-'));
  try {
    mkdirSync(join(root, 'crucible'), { recursive: true });
    const sentinel = join(outside, 'victim.jpg');
    writeFileSync(sentinel, 'keep');
    const junctionPath = join(root, 'crucible', 'evil-tag');
    try {
      symlinkSync(outside, junctionPath, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (err) {
      t.skip(`platform cannot create a directory symlink/junction: ${err.message}`);
      return;
    }
    assert.throws(
      () => assertRealpathChainContained(join(junctionPath, 'strip'), root, 'targetDir'),
      /reparse|symlink|realpath|escape/,
    );
    assert.throws(() => cleanTargetDirectory(junctionPath, root), /reparse|symlink|realpath|escape|not a/);
    assert.equal(existsSync(sentinel), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});


test('capture readiness rejects a fast empty-arena window followed by slow hull admission', async (t) => {
  let now = 0, sim = 0, windows = 0;
  t.mock.method(Date, 'now', () => now);
  const fractions = [0.9, 0.14, 0.9, 0.9, 0.9];
  const page = { evaluate: async () => sim, waitForTimeout: async ms => { now += ms; sim += fractions[windows++] * ms / 1000; } };
  const result = await waitForRealtime(page, { windowMs: 1000, maxWaitMs: 5000 });
  assert.equal(result.reachedFloor, true);
  assert.equal(windows, 5, 'normal speed must be sustained after the slow interval');
});

test('capture readiness does not accept one late fast window at timeout', async (t) => {
  let now = 0, sim = 0, windows = 0;
  t.mock.method(Date, 'now', () => now);
  const fractions = [0.14, 0.14, 0.9];
  const page = { evaluate: async () => sim, waitForTimeout: async ms => { now += ms; sim += fractions[windows++] * ms / 1000; } };
  assert.equal((await waitForRealtime(page, { windowMs: 1000, maxWaitMs: 3000 })).reachedFloor, false);
});


test('draw observer reads submitted matrices without updating the scene or retaining an old owner', async () => {
  const previousWindow = globalThis.window;
  const camera = {};
  const mesh = { isMesh: true, name: 'LOD0_hull', parent: {}, matrixWorld: new THREE.Matrix4().makeTranslation(10, 0, 0), getWorldPosition() { throw new Error('observer must not update scene transforms'); } };
  const player = { id: 1, pos: { x: 10, z: 0 } };
  const enemy = { id: 2, pos: { x: 30, z: 0 }, alive: true, data: { runCohort: 'survival' } };
  globalThis.window = { SF: { THREE, state: { playerId: 1, entities: new Map([[1, player]]), entityList: [player, enemy], render: { camera, scene: { traverse(fn) { fn(mesh); } } } } } };
  try {
    await installDrawHooks({ evaluate: async (fn, arg) => fn(arg) });
    mesh.onAfterRender(null, null, camera);
    assert.equal(window.__stripTally().player, 1);
    mesh.matrixWorld.makeTranslation(30, 0, 0);
    mesh.onAfterRender(null, null, camera);
    const moved = window.__stripTally();
    assert.equal(moved.player, 0);
    assert.equal(moved.hostilesDrawing, 1, 'pooled parts are attributed using their current submitted position');
  } finally { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; }
});

// ---------------------------------------------------------------------------------------------
// The two tapes that expose the 2026-09-03 audit findings (FEEL_CONTRACT §A) on a build that still
// has them. PQ-173.02: "the critic reproduces the audit findings on a pre-fix build from frames
// alone" — which needs frames in which the ship did the thing the finding confiscated.
// ---------------------------------------------------------------------------------------------

test('the audit tapes drive the real input path with live bindings, in order, inside their span', async () => {
  const { MOMENT_EVENTS, driveRealCrucibleRoute } = await import('../scripts/lib/bench/frameStripCapture.mjs');
  const liveKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight']);
  for (const id of ['earned_speed', 'shove_light']) {
    const s = STRIP_SCENARIOS[id];
    assert.ok(s, `${id} must exist`);
    assert.equal(s.loadoutId, 'physics_toolkit', `${id} flies the kit with the shove weapon`);
    let last = -1;
    for (const step of s.tape) {
      assert.ok(step.atS > last, `${id}: tape must be in time order`);
      assert.ok(step.atS < s.durationS, `${id}: a step after the strip ends is not on any frame`);
      last = step.atS;
      for (const k of ['keyDown', 'keyUp']) if (step[k]) assert.ok(liveKeys.has(step[k]), `${id}: ${step[k]} is not a live binding`);
    }
  }
  // A1/A2: boost past the cap, keep forward held after boost, then hands off, then brake.
  const es = STRIP_SCENARIOS.earned_speed.tape;
  const boostOff = es.find((s) => s.keyUp === 'ShiftLeft');
  const forwardOff = es.find((s) => s.keyUp === 'KeyW');
  const brakeOn = es.find((s) => s.keyDown === 'KeyS');
  assert.ok(boostOff && forwardOff && brakeOn, 'boost release, forward release and a deliberate brake are the three regimes');
  assert.ok(forwardOff.atS - boostOff.atS >= 6, 'forward is held above the cap long enough for a governor brake to show');
  assert.ok(brakeOn.atS - forwardOff.atS >= 6, 'hands off long enough for neutral counter-thrust to show');
  // A4/A5: long shove bursts with the nose sweeping.
  const sl = STRIP_SCENARIOS.shove_light.tape;
  const bursts = sl.filter((s) => s.mouseDown).length;
  assert.ok(bursts >= 4, 'several bursts, so at least one lands on a light ship along its motion');
  assert.ok(sl.some((s) => s.keyDown === 'KeyA') && sl.some((s) => s.keyDown === 'KeyD'), 'the nose sweeps both ways');
  assert.ok(sl.some((s) => s.aim === 'nearestHostile') && sl.findIndex((s) => s.aim === 'nearestHostile') < sl.findIndex((s) => s.mouseDown),
    'the cursor is on a hostile before the trigger is held: a cannon fired into a corner of the glass shoves nothing');
  // The player's own shot landing is a moment, so the critic gets before/at/after around a shove.
  assert.ok(MOMENT_EVENTS.includes('projectile:hit'));
  assert.equal(typeof driveRealCrucibleRoute, 'function', 'the click-through is one exported route, not a copy');
});

test('a merged moment keeps what the ship met', () => {
  const out = condenseMoments([
    { type: 'physics:impact', tick: 600, simTime: 10.0, playerInvolved: false, magnitude: MOMENT_IMPACT_FLOOR + 5, surface: null },
    { type: 'combat:collisionConsequence', tick: 606, simTime: 10.1, playerInvolved: false, magnitude: 0, surface: 'terrain' },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].surface, 'terrain', 'the consequence knew the surface; the merged moment must not lose it');
});

test('a strip says where it ran slow, not just how slow on average', async () => {
  const { realtimeBySegment } = await import('../scripts/lib/bench/frameStripCapture.mjs');
  // Ten seconds of frames at 4 fps: real time for the first five wall seconds, half speed after.
  const frames = [];
  for (let i = 0; i <= 40; i++) {
    const wallS = i * 0.25;
    frames.push({ wallS, simTime: wallS <= 5 ? wallS : 5 + (wallS - 5) * 0.5 });
  }
  const segs = realtimeBySegment(frames, 5);
  assert.equal(segs.length, 2);
  assert.equal(segs[0].realtime, 1);
  assert.equal(segs[1].realtime, 0.5, 'the slow half is named as the slow half');
  assert.deepEqual(realtimeBySegment([{ wallS: 0, simTime: 0 }]), []);
});

test('visible jitter is read from the pictures: a wobble after a contact is a reversal inside half a second', async () => {
  const { measureVisibleJitter, VISIBLE_JITTER_WINDOW_S, createInputDriver, PRESS_METHOD, STRIP_SCENARIOS } = await import('../scripts/lib/bench/frameStripCapture.mjs');
  const frame = (t, rot, x, y) => ({ simTime: t, playerRot: rot, playerScreenXY: [x, y] });
  // Eight frames a second, heading turning steadily one way, the hull sliding steadily: no wobble.
  const calm = [];
  for (let i = 0; i < 12; i++) calm.push(frame(10 + i / 8, 0.02 * i, 0.5 + 0.01 * i, 0.5));
  const contact = [{ type: 'physics:impact', simTime: 10.0, playerInvolved: true, magnitude: 30 }];
  const c = measureVisibleJitter(calm, contact);
  assert.equal(c.measured, true);
  assert.equal(c.windows, 1);
  assert.equal(c.events, 0, 'a steady turn after a bump is not jitter');
  assert.equal(VISIBLE_JITTER_WINDOW_S, 0.5);
  // The same frames with the heading flapping back and forth: a wobble a viewer sees.
  const wobble = calm.map((f, i) => ({ ...f, playerRot: i % 2 ? 0.05 : -0.05 }));
  const w = measureVisibleJitter(wobble, contact);
  assert.ok(w.headingReversals >= 2 && w.events === 1, `B13: "never produces visible jitter" — got ${JSON.stringify(w)}`);
  // A contact nobody was in, or no contact at all, measures nothing about the player.
  assert.equal(measureVisibleJitter(calm, [{ ...contact[0], playerInvolved: false }]).note, 'no contact involved the player inside the strip');
  // Too few frames in the window is honest, not a pass.
  assert.equal(measureVisibleJitter(calm.slice(0, 2), contact).measured, false);
  // The press goes through the screencast's own session when one exists (the plain press was measured to drop).
  const sent = [];
  const fakePage = { mouse: { move: async () => {}, down: async () => { sent.push('pw-down'); }, up: async () => {} }, keyboard: { down: async () => {}, up: async () => {} }, evaluate: async () => null };
  const fakeCdp = { send: async (m, p) => { sent.push(`${m}:${p.type}`); } };
  const d = createInputDriver(fakePage, { getCdp: () => fakeCdp });
  await d.runStep({ atS: 0, mouseDown: true });
  assert.ok(sent.includes('Input.dispatchMouseEvent:mousePressed') && !sent.includes('pw-down'));
  assert.equal(d.pressMethod, PRESS_METHOD.cdp);
  const d2 = createInputDriver(fakePage, { getCdp: () => null });
  await d2.runStep({ atS: 0, mouseDown: true });
  assert.equal(d2.pressMethod, PRESS_METHOD.playwright);
  // The rope tape latches with the Massline key on a rock, swings under forward, and lets go.
  const rope = STRIP_SCENARIOS.rope_swing;
  assert.equal(rope.loadoutId, 'massline_rig');
  assert.ok(rope.tape.some((s) => s.aim === 'nearestAsteroid') && rope.tape.filter((s) => s.keyDown === 'Space').length === 2);
  assert.ok(Array.isArray(STRIP_SCENARIOS.shove_light.warmup) && STRIP_SCENARIOS.shove_light.warmup.some((s) => s.mouseDown), 'the first shot is paid before the strip');
});

test('the player\'s hit outranks a bump when moments merge, and jitter windows count only contacts inside the span', async () => {
  const { measureVisibleJitter } = await import('../scripts/lib/bench/frameStripCapture.mjs');
  const merged = condenseMoments([
    { type: 'physics:impact', tick: 600, simTime: 10.0, playerInvolved: false, magnitude: MOMENT_IMPACT_FLOOR + 5 },
    { type: 'projectile:hit', tick: 606, simTime: 10.1, playerInvolved: true, magnitude: 420, surface: 'ship' },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].type, 'projectile:hit', 'the first aimed shove strip fired 27 rounds and the manifest showed none');
  assert.equal(merged[0].playerInvolved, true);
  const frames = [];
  for (let i = 0; i < 12; i++) frames.push({ simTime: 20 + i / 8, playerRot: 0.01 * i, playerScreenXY: [0.5, 0.5] });
  const before = [{ type: 'physics:impact', simTime: 12.0, playerInvolved: true, magnitude: 30 }];
  assert.equal(measureVisibleJitter(frames, before).windows, 0, 'a contact before the first frame has no window a viewer can see');
});
