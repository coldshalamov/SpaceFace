// test/frame-strip.test.mjs — the capture's own rules, testable without a browser.
//
// Vision authority: design/program/FUN_CONVERGENCE_LOOP.md §0, the LAZY face —
// "Nobody played it. The path follower 'followed the path' at walking speed and passed its own
// tracking test." The capture that this file guards once photographed the title screen for 25
// seconds and reported PASS. These are the rules that make that impossible to repeat.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  retentionMask,
  condenseMoments,
  compareStripEventTicks,
  MOMENT_IMPACT_FLOOR,
  NORMAL_SPEED_FLOOR,
  STRIP_SCENARIOS,
  HUD_TEXT_OFF_CSS,
  CHROME_ARGS,
  DEFAULT_STRIP_DIR,
  DEFAULT_MANIFEST_DIR,
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
