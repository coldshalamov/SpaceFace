import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { analyzeReadability, sampleBox } from '../scripts/player-truth/readability.mjs';
import { checkReadability, CLS, THRESHOLDS, VIS } from '../scripts/player-truth/checks.mjs';

const SIZE = 420;
const CENTER = 210;
const RADIUS = 110;

function bodyImage(value, radius = RADIUS) {
  const raw = Buffer.alloc(SIZE * SIZE * 3, 10);
  for (let y = CENTER - radius; y <= CENTER + radius; y++) {
    for (let x = CENTER - radius; x <= CENTER + radius; x++) {
      raw.fill(value, (y * SIZE + x) * 3, (y * SIZE + x) * 3 + 3);
    }
  }
  return raw;
}

test('a capped interior samples the backdrop beyond the complete large body', () => {
  const raw = bodyImage(60);
  const actual = sampleBox(raw, SIZE, SIZE, 3, CENTER, CENTER, 60, RADIUS);
  const cappedBackdrop = sampleBox(raw, SIZE, SIZE, 3, CENTER, CENTER, 60);
  assert.ok(Math.abs(cappedBackdrop.lab[0] - cappedBackdrop.bg[0]) < 0.01,
    'the old capped ring lands entirely inside this large opaque body');
  assert.ok(actual.lab[0] - actual.bg[0] > THRESHOLDS.readabilityLowDeltaL,
    'the real backdrop retains the visible body contrast');
  assert.deepEqual(actual.lab, cappedBackdrop.lab, 'interior work and measured pigment remain capped');
});

test('small-body sampling and genuinely dim large bodies retain their contrast verdict', () => {
  const small = bodyImage(60, 20);
  assert.deepEqual(sampleBox(small, SIZE, SIZE, 3, CENTER, CENTER, 20, 20),
    sampleBox(small, SIZE, SIZE, 3, CENTER, CENTER, 20));
  const dim = sampleBox(bodyImage(12), SIZE, SIZE, 3, CENTER, CENTER, 60, RADIUS);
  assert.ok(Math.abs(dim.lab[0] - dim.bg[0]) < THRESHOLDS.readabilityLowDeltaL);
});

async function analyzeLargeBody(value, overlays = [], vis = VIS.onscreen, key = 7) {
  const file = await sharp(bodyImage(value), {
    raw: { width: SIZE, height: SIZE, channels: 3 },
  }).png().toBuffer();
  const samples = []; const shots = [];
  for (let i = 0; i < 5; i++) {
    const t = i * 100;
    shots.push({ t, endT: t + 5, file, play: true, overlays });
    for (const offset of [0, 5]) samples.push({ t: t + offset, mode: 'flight', vw: SIZE, vh: SIZE,
      e: [[1, CLS.asteroid, 0, 0, 0, 0, CENTER, CENTER, RADIUS, vis, key, 1]] });
  }
  const nearest = t => samples.reduce((best, s) => Math.abs(s.t - t) < Math.abs(best.t - t) ? s : best);
  const readability = await analyzeReadability(shots, nearest, samples);
  return { readability, verdict: checkReadability({ readability }) };
}

test('frame analysis retains the full backdrop radius without claiming body pixel ownership', async () => {
  const { readability, verdict } = await analyzeLargeBody(60);
  assert.equal(readability.classes.asteroid.n, 5);
  assert.equal(readability.classes.asteroid.lowContrastFrac, 0);
  assert.equal(readability.classes.asteroid.contrast.status, 'unmeasured');
  assert.equal(readability.classes.asteroid.contrast.method, 'radius-square');
  assert.equal(verdict.status, 'UNKNOWN', 'a bright patch alone cannot establish a visible asteroid silhouette');
});

test('a faint radius-square contrast diagnostic remains unknown without an opaque silhouette', async () => {
  const { readability, verdict } = await analyzeLargeBody(12);
  assert.equal(readability.classes.asteroid.n, 5);
  assert.equal(readability.classes.asteroid.lowContrastFrac, 1);
  assert.equal(verdict.status, 'UNKNOWN', 'the analyzer has no geometry-owned pixels to attribute to this body');
  assert.match(verdict.detail, /missing asteroid silhouette pixel ownership/);
});

test('a target panel over the body or its sky ring cannot grade HUD text as asteroid pigment', async () => {
  for (const overlays of [[[190, 190, 240, 240]], [[350, 190, 390, 240]]]) {
    const { readability, verdict } = await analyzeLargeBody(12, overlays);
    assert.equal(readability.classes.asteroid.n, 0);
    assert.equal(readability.captureCoherence.rejected.asteroid['hud-occlusion'], 5);
    assert.equal(verdict.status, 'UNKNOWN', 'covered samples do not manufacture a pass');
  }
  const { readability, verdict } = await analyzeLargeBody(12, [[0, 0, 20, 20]]);
  assert.equal(readability.classes.asteroid.n, 5);
  assert.equal(verdict.status, 'UNKNOWN', 'an uncovered patch still needs asteroid silhouette ownership');
});

test('a pooled physics projection over empty sky cannot become a measured asteroid contrast failure', async () => {
  const { readability, verdict } = await analyzeLargeBody(10, [], VIS.pooled, -1);
  assert.equal(readability.classes.asteroid.n, 5, 'projection samples remain available for diagnosis');
  assert.equal(readability.classes.asteroid.lowContrastFrac, 1, 'the empty sky statistic is retained');
  assert.equal(readability.classes.asteroid.contrast.status, 'unmeasured');
  assert.equal(verdict.status, 'UNKNOWN', 'unbound pooled rows cannot supply a pass or an authored-contrast failure');
});

test('unowned asteroid pixels do not waive a measured low-contrast projectile failure', async () => {
  const { readability } = await analyzeLargeBody(10, [], VIS.pooled, -1);
  readability.classes.projectile = { n: 5, lowContrastFrac: 1 };
  const verdict = checkReadability({ readability });
  assert.equal(verdict.status, 'FAIL');
  assert.match(verdict.value, /projectile 100% low-contrast/);
});
