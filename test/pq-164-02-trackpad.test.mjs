// PQ-164.02 — Deck and trackpad.
//
// Trackpad gestures write the existing Massline key/grammar seams through touch.tick(inputHost).
// Seed 16402. The first-ten-minute verbs (latch, reel, throw, stroke, boost) must all complete
// on that route. Deck 1280×800 is a separate capture script.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  TRACKPAD_BOOST_CODES,
  TRACKPAD_FIRST_TEN_VERBS,
  TRACKPAD_LATCH_CODES,
  TRACKPAD_REEL_IN_CODES,
  TRACKPAD_THROW_CODES,
  DECK_VIEWPORT,
  DECK_UI_SCALE,
  DECK_CAPTURE_SEED,
  FIRST_TEN_MINUTES_S,
  applyDeckUiScale,
  applyTrackpadToInputHost,
  createTouch,
  deckViewportFits,
  driveTrackpadGesture,
  measureDeckCapture,
  runTrackpadFirstTenMinutes,
} from '../src/systems/touch.js';
import {
  STEAM_DECK_HEADER,
  STEAM_DECK_NOTE,
} from '../src/ui/screens/settings.js';
import { runDeckSettingsCapture } from '../scripts/lib/pq16402-deck.mjs';

const SEED = 16402;

function host() {
  return {
    _keys: Object.create(null),
    _m2: false,
    state: {
      tick: SEED,
      simTime: SEED / 60,
      player: { tether: { active: true } },
      input: { autoFire: true },
    },
    helpers: {
      raycastToPlane: ({ x, y }) => ({ x: x * 10, z: y * 10 }),
      worldToScreen: () => ({ x: 640, y: 400 }),
    },
  };
}

test('PQ-164.02 seed 16402: latch/reel/throw/stroke/boost write existing key seams via touch.tick', () => {
  const touch = createTouch({ state: {}, bus: { emit() {} } });
  const input = host();
  const latched = { player: { tether: { active: true } }, input: { autoFire: true } };

  driveTrackpadGesture(touch, 'latch', {}, latched);
  touch.tick(0.016, input.state, input);
  for (const code of TRACKPAD_LATCH_CODES) {
    assert.equal(input._keys[code], true, `latch must hold ${code}`);
  }

  driveTrackpadGesture(touch, 'reel', { deltaY: 40 }, latched);
  touch.tick(0.016, input.state, input);
  for (const code of TRACKPAD_REEL_IN_CODES) {
    assert.equal(input._keys[code], true, `reel-in must hold ${code}`);
  }
  assert.equal(input._keys.Space, true, 'reel holds the Massline key so grammar enters line-control');

  driveTrackpadGesture(touch, 'throw', {}, latched);
  touch.tick(0.016, input.state, input);
  for (const code of TRACKPAD_THROW_CODES) {
    assert.equal(input._keys[code], true, `throw must hold ${code}`);
  }
  assert.equal(input._m2, true, 'throw also arms RMB throwArm seam');

  driveTrackpadGesture(touch, 'boost', {}, latched);
  touch.tick(0.016, input.state, input);
  for (const code of TRACKPAD_BOOST_CODES) {
    assert.equal(input._keys[code], true, `pinch-boost must hold ${code}`);
  }

  driveTrackpadGesture(touch, 'stroke', { dx: 48, dy: -24 }, input.state);
  const applied = applyTrackpadToInputHost(touch, input, input.state);
  assert.ok(touch.trackpad.verbs.includes('stroke'), `stroke must be observed, got ${touch.trackpad.verbs}`);
  assert.ok(Array.isArray(applied.injected));

  console.log(`PQ-164.02 seed=${SEED} verbs=${touch.trackpad.verbs.join(',')} keys-ok=true`);
});

test('PQ-164.02 trackpad route completes the first ten minutes', () => {
  const touch = createTouch({ state: {}, bus: { emit() {} } });
  const input = host();
  const report = runTrackpadFirstTenMinutes(touch, input, input.state);
  assert.equal(report.seed, SEED);
  assert.equal(FIRST_TEN_MINUTES_S, 600);
  assert.equal(report.durationS, FIRST_TEN_MINUTES_S, 'the first ten minutes is a 600 s session, not a five-item loop');
  assert.ok(report.steps >= 600);
  assert.deepEqual(report.verbs, TRACKPAD_FIRST_TEN_VERBS.slice());
  assert.equal(report.complete, true, `missing verbs: ${TRACKPAD_FIRST_TEN_VERBS.filter((v) => !report.observed.includes(v))}`);
  assert.ok(report.keys.latch.some((c) => TRACKPAD_LATCH_CODES.includes(c)));
  assert.ok(report.keys.reel.some((c) => TRACKPAD_REEL_IN_CODES.includes(c) || c === 'KeyW'));
  assert.ok(report.keys.throw.some((c) => TRACKPAD_THROW_CODES.includes(c)));
  assert.ok(report.keys.boost.some((c) => TRACKPAD_BOOST_CODES.includes(c)));
  console.log(`PQ-164.02 first-ten complete=${report.complete} durationS=${report.durationS} steps=${report.steps}`);
});

test('PQ-164.02 ui input consumes latched trackpad wheel; settings names the Deck', () => {
  const uiSrc = readFileSync(fileURLToPath(new URL('../src/ui/input.js', import.meta.url)), 'utf8');
  assert.match(uiSrc, /ingestTrackpadWheel/);
  assert.match(uiSrc, /onTrackpadPointer/);
  assert.match(STEAM_DECK_HEADER, /Steam Deck/);
  assert.match(STEAM_DECK_NOTE, /1280/);
  assert.match(STEAM_DECK_NOTE, /Trackpad/);
  const settingsSrc = readFileSync(fileURLToPath(new URL('../src/ui/screens/settings.js', import.meta.url)), 'utf8');
  assert.match(settingsSrc, /STEAM_DECK_HEADER/);
  assert.match(settingsSrc, /STEAM_DECK_NOTE/);
});

test('PQ-164.02 Deck viewport is 1280x800; other sizes fail the capture pin', () => {
  assert.equal(DECK_CAPTURE_SEED, SEED);
  assert.equal(DECK_VIEWPORT.width, 1280);
  assert.equal(DECK_VIEWPORT.height, 800);
  assert.equal(DECK_UI_SCALE, 1);
  assert.equal(deckViewportFits(1280, 800), true);
  assert.equal(deckViewportFits(1920, 1080), false);
  assert.equal(deckViewportFits(1280, 720), false);
  const root = { style: { props: Object.create(null), setProperty(k, v) { this.props[k] = String(v); }, getPropertyValue(k) { return this.props[k]; } } };
  assert.equal(applyDeckUiScale(root, DECK_UI_SCALE), 1);
  assert.equal(root.style.props['--ui-scale'], '1');
  const miss = measureDeckCapture({
    width: 1920, height: 1080, uiScale: 1, overflowX: 0, overflowY: 0,
    noteVisible: true, noteInView: true,
  });
  assert.equal(miss.ok, false);
  assert.equal(miss.sizeOk, false);
  console.log(`PQ-164.02 seed=${SEED} deck=${DECK_VIEWPORT.width}x${DECK_VIEWPORT.height} scale=${DECK_UI_SCALE}`);
});

test('PQ-164.02 seed 16402: shipped Settings sheet names Deck at 1280x800', () => {
  const report = runDeckSettingsCapture({ seed: SEED, width: 1280, height: 800, uiScale: 1 });
  assert.equal(report.seed, SEED);
  assert.equal(report.ok, true, `deck pin failed ${JSON.stringify(report)}`);
  assert.equal(report.noteVisible, true);
  assert.equal(report.noteInView, true);
  assert.equal(report.header, STEAM_DECK_HEADER);
  assert.match(report.note, /middle-tap/);
  console.log(`PQ-164.02 deck-sheet ok=${report.ok} size=${report.width}x${report.height} scale=${report.uiScale} overflowX=${report.overflowX}`);
});
