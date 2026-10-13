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

async function analyzeLargeBody(value) {
  const file = await sharp(bodyImage(value), {
    raw: { width: SIZE, height: SIZE, channels: 3 },
  }).png().toBuffer();
  const samples = []; const shots = [];
  for (let i = 0; i < 5; i++) {
    const t = i * 100;
    shots.push({ t, endT: t + 5, file, play: true });
    for (const offset of [0, 5]) samples.push({ t: t + offset, mode: 'flight', vw: SIZE, vh: SIZE,
      e: [[1, CLS.asteroid, 0, 0, 0, 0, CENTER, CENTER, RADIUS, VIS.onscreen, 7, 1]] });
  }
  const nearest = t => samples.reduce((best, s) => Math.abs(s.t - t) < Math.abs(best.t - t) ? s : best);
  const readability = await analyzeReadability(shots, nearest, samples);
  return { readability, verdict: checkReadability({ readability }) };
}

test('frame analysis passes the true body bounds to the backdrop sampler', async () => {
  const { readability, verdict } = await analyzeLargeBody(60);
  assert.equal(readability.classes.asteroid.n, 5);
  assert.equal(readability.classes.asteroid.lowContrastFrac, 0);
  assert.equal(verdict.status, 'PASS');
});

test('frame analysis still fails genuinely faint large opaque bodies', async () => {
  const { readability, verdict } = await analyzeLargeBody(12);
  assert.equal(readability.classes.asteroid.n, 5);
  assert.equal(readability.classes.asteroid.lowContrastFrac, 1);
  assert.equal(verdict.status, 'FAIL');
});
