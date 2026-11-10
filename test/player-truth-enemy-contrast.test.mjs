import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { analyzeReadability, sampleBox } from '../scripts/player-truth/readability.mjs';
import { checkReadability, CLS, VIS, THRESHOLDS } from '../scripts/player-truth/checks.mjs';

test('sparse bright enemy pixels cannot turn a radius-square diagnostic into hull contrast', async () => {
  const width = 120, height = 120, cx = 60, cy = 60, radius = 20;
  const raw = Buffer.alloc(width * height * 3, 10);
  // A narrow, visible fighter crosses a mostly empty collision-radius square.
  // Every actual hull pixel differs strongly; averaging sky into it still fails ΔL 8.
  for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 13; x <= cx + 13; x++) {
    const i = (y * width + x) * 3;
    raw[i] = 180; raw[i + 1] = 30; raw[i + 2] = 45;
  }
  const box = sampleBox(raw, width, height, 3, cx, cy, radius);
  assert.ok(Math.abs(box.lab[0] - box.bg[0]) < THRESHOLDS.readabilityLowDeltaL);
  const image = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
  const shots = [], samples = [];
  for (let i = 0; i < 5; i++) {
    const t = i * 100;
    shots.push({ t, endT: t + 5, file: image, play: true });
    for (const offset of [0, 5]) samples.push({ t: t + offset, vw: width, vh: height,
      e: [[1, CLS.enemy, 0, 0, 0, 0, cx, cy, radius, VIS.onscreen, 1, 2]] });
  }
  const nearest = t => samples.reduce((best, s) => Math.abs(s.t - t) < Math.abs(best.t - t) ? s : best);
  const readability = await analyzeReadability(shots, nearest, samples);
  assert.equal(readability.classes.enemy.lowContrastFrac, 1, 'the original box statistic is retained');
  const verdict = checkReadability({ readability });
  assert.equal(verdict.status, 'UNKNOWN');
  assert.match(verdict.detail, /missing enemy silhouette pixel ownership/);
  assert.match(verdict.value, /radius-square diagnostic/);
});

test('supported enemy hull contrast and class separation keep their unchanged failures', () => {
  const enemy = { n: 5, lowContrastFrac: 1, contrast: { status: 'measured', method: 'native-hull-pixels' } };
  assert.equal(checkReadability({ readability: { classes: { enemy }, pairs: [] } }).status, 'FAIL');
  const pair = { a: 'enemy', b: 'asteroid', nA: 5, nB: 5, sep: .4, dColor: 3, sizeRatio: 1 };
  const classes = { enemy: { ...enemy, lowContrastFrac: 0 }, asteroid: { n: 5, lowContrastFrac: 0 } };
  assert.equal(checkReadability({ readability: { classes, pairs: [pair] } }).status, 'FAIL');
});

test('unsupported enemy pixels cannot waive an independent supported contrast or separation failure', () => {
  const enemy = { n: 5, lowContrastFrac: 1, contrast: { status: 'unmeasured', method: 'radius-square', reason: 'missing enemy silhouette pixel ownership' } };
  const classes = { enemy, asteroid: { n: 5, lowContrastFrac: 1 }, projectile: { n: 5, lowContrastFrac: 0 } };
  assert.equal(checkReadability({ readability: { classes, pairs: [] } }).status, 'FAIL');
  const pairs = [{ a: 'enemy', b: 'asteroid', nA: 5, nB: 5, sep: .2 },
    { a: 'asteroid', b: 'projectile', nA: 5, nB: 5, sep: .3 }];
  const verdict = checkReadability({ readability: { classes, pairs } });
  assert.equal(verdict.status, 'FAIL');
  assert.match(verdict.offenders[0].line, /asteroid vs projectile/);
});

test('unsupported enemy separation remains UNKNOWN even when the radius statistic looks readable', () => {
  const enemy = { n: 5, lowContrastFrac: 0, contrast: { status: 'unmeasured', method: 'radius-square', reason: 'missing enemy silhouette pixel ownership' } };
  const classes = { enemy, asteroid: { n: 5, lowContrastFrac: 0 } };
  for (const sep of [.2, 4]) {
    const verdict = checkReadability({ readability: { classes, pairs: [{ a: 'enemy', b: 'asteroid', nA: 5, nB: 5, sep }] } });
    assert.equal(verdict.status, 'UNKNOWN');
    assert.match(verdict.detail, /missing enemy silhouette pixel ownership/);
  }
});
