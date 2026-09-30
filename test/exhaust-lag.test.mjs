import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createExhaustLag,
  EXHAUST_LAG_CAPACITY,
} from '../src/render/thruster/ribbon/exhaustLag.js';

const DT = 1 / 60;

function buildSpine(lag, {
  count = 56,
  x = 0, y = 0, z = 0,
  heading = 0,
  nowS = 10,
  tipAgeS = 0.6,
  jetLength = 17,
  maxBendRad = 1.4,
}) {
  const out = new Float32Array(count * 4);
  const tipBend = lag.buildCenterline({
    out, count, x, y, z, heading, nowS, tipAgeS, jetLength, maxBendRad,
  });
  return { out, tipBend };
}

function recordConstantTurn(lag, rate, seconds, startHeading = 0) {
  let t = 0;
  let h = startHeading;
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) {
    lag.record(t, h);
    t += DT;
    h += rate * DT;
  }
  return { t, h };
}

test('a straight heading history produces a straight, evenly spaced spine on the bell', () => {
  const lag = createExhaustLag();
  const { t } = recordConstantTurn(lag, 0, 1);
  const jetLength = 17;
  const { out, tipBend } = buildSpine(lag, {
    x: 10, y: 2, z: -4, heading: 0, nowS: t, tipAgeS: 0.6, jetLength,
  });
  assert.equal(tipBend, 0, 'no rotation, no bend');
  const count = out.length / 4;
  for (let k = 0; k < count; k++) {
    const o = k * 4;
    assert.equal(out[o + 1], 2, 'y held constant');
    assert.ok(Math.abs(out[o + 2] + 4) < 1e-6, 'z held constant');
    assert.ok(Math.abs(out[o] - (10 + jetLength * k / (count - 1))) < 1e-5,
      `station ${k} evenly spaced along +X`);
    assert.equal(out[o + 3], 0, 'bend weight zero');
  }
});

test('a turn bends the tail toward the old heading while the root stays exactly on the bell', () => {
  const lag = createExhaustLag();
  const rate = 1.2; // rad/s — a firm but ordinary helm turn
  const { t, h } = recordConstantTurn(lag, rate, 1.5);
  const jetLength = 17;
  const tipAgeS = 0.6;
  const { out, tipBend } = buildSpine(lag, {
    heading: h, nowS: t, tipAgeS, jetLength,
  });
  assert.equal(out[0], 0);
  assert.equal(out[2], 0, 'station 0 is the bell');

  const count = out.length / 4;
  const along = (k) => jetLength * k / (count - 1);
  const offAxis = (k) => {
    const px = out[k * 4];
    const pz = out[k * 4 + 2];
    const straightX = Math.cos(h) * along(k);
    const straightZ = Math.sin(h) * along(k);
    return Math.hypot(px - straightX, pz - straightZ);
  };
  // Near the root the gas is young: effectively on the current axis.
  assert.ok(offAxis(2) < 0.05, `root neighbourhood must hug the axis, got ${offAxis(2)}`);
  // Halfway down the jet the bend must be plainly visible.
  assert.ok(offAxis(count >> 1) > 0.15,
    `mid-jet must visibly leave the straight axis, got ${offAxis(count >> 1)}`);
  // The tail bends BACK toward the old heading (rate > 0, so old < current): its angular position
  // about the bell lags the current heading, never leads it.
  const tipX = out[(count - 1) * 4];
  const tipZ = out[(count - 1) * 4 + 2];
  const tipAngle = Math.atan2(tipZ, tipX);
  assert.ok(tipAngle < h, 'tail points where the bell used to point');
  assert.ok(tipBend > 0.2, `a 1.2 rad/s turn must show real bend, got ${tipBend}`);
  assert.ok(tipBend <= tipAgeS * rate + 1e-6, 'bend bounded by rate × memory');
});

test('memory expires: holding the heading straight re-straightens the jet', () => {
  const lag = createExhaustLag();
  const { t: t1, h: h1 } = recordConstantTurn(lag, 1.2, 1.0);
  // Hold the new heading for longer than the memory window.
  let t = t1;
  const frames = Math.round(1.4 / DT);
  for (let i = 0; i < frames; i++) {
    lag.record(t, h1);
    t += DT;
  }
  const { tipBend } = buildSpine(lag, { heading: h1, nowS: t, tipAgeS: 0.6 });
  assert.ok(tipBend < 0.02, `aged-out memory must relax the jet, got ${tipBend}`);
});

test('the soft cap bounds a wild spin without knotting the jet', () => {
  const lag = createExhaustLag();
  const maxBend = 1.4;
  const { t, h } = recordConstantTurn(lag, 3.8, 1.5); // full helm spin, sustained
  const { tipBend } = buildSpine(lag, {
    heading: h, nowS: t, tipAgeS: 0.85, maxBendRad: maxBend,
  });
  assert.ok(tipBend <= maxBend + 1e-9, 'bend never exceeds the cap');
  assert.ok(tipBend > maxBend * 0.9, 'a sustained hard spin saturates near the cap');
});

test('unwrapping survives the ±π seam: turning through it bends the same small amount', () => {
  const lagA = createExhaustLag();
  const lagB = createExhaustLag();
  const spin = 0.8;
  // Feed headings the way the production caller does: atan2 output, wrapped to (−π, π]. A turns
  // through the +π seam and so sees the heading snap by −2π mid-record; B turns the same rate
  // far from any seam. The recorder must bridge the snap so both spines bend identically.
  const wrap = (h) => Math.atan2(Math.sin(h), Math.cos(h));
  const recordTurn = (lag, startHeading) => {
    let t = 0;
    let h = startHeading;
    for (let i = 0; i < 60; i++) {
      lag.record(t, wrap(h));
      t += DT;
      h += spin * DT;
    }
    return { t, h };
  };
  const a = recordTurn(lagA, Math.PI - 0.1);
  const b = recordTurn(lagB, 0.4);
  assert.ok(Math.abs((a.h - (Math.PI - 0.1)) - (b.h - 0.4)) < 1e-9, 'same total turn');
  const spineA = buildSpine(lagA, { heading: a.h, nowS: a.t, tipAgeS: 0.6 });
  const spineB = buildSpine(lagB, { heading: b.h, nowS: b.t, tipAgeS: 0.6 });
  assert.ok(spineA.tipBend > 0.2, 'the turn bends');
  assert.ok(Math.abs(spineA.tipBend - spineB.tipBend) < 1e-6,
    `wrap must not alias: ${spineA.tipBend} vs ${spineB.tipBend}`);
});

test('no history or a single sample means a straight spine, never a phantom bend', () => {
  const lag = createExhaustLag();
  const empty = buildSpine(lag, { heading: 2.1, nowS: 5, tipAgeS: 0.6 });
  assert.equal(empty.tipBend, 0);
  lag.record(0, 1.0);
  const one = buildSpine(lag, { heading: 2.1, nowS: 5, tipAgeS: 0.6 });
  assert.equal(one.tipBend, 0, 'one sample is not a history');
});

test('reset forgets the previous owner’s turns', () => {
  const lag = createExhaustLag();
  recordConstantTurn(lag, 1.2, 1.0);
  lag.reset();
  const { tipBend } = buildSpine(lag, { heading: 0.3, nowS: 50, tipAgeS: 0.6 });
  assert.equal(tipBend, 0);
});

test('the ring retires old samples and holds the capacity it promises', () => {
  const lag = createExhaustLag();
  const total = EXHAUST_LAG_CAPACITY * 3 + 17;
  for (let i = 0; i < total; i++) lag.record(i * DT, i * 0.001);
  const info = lag.inspect();
  assert.equal(info.samples, EXHAUST_LAG_CAPACITY, 'ring never grows past capacity');
  // The oldest retained sample is the newest-capacity-th one, not sample 0. Times live in a
  // Float32Array, so the tolerance is float32, not float64.
  assert.ok(Math.abs(info.spanS - (EXHAUST_LAG_CAPACITY - 1) * DT) < 1e-6,
    `retained span should be ${EXHAUST_LAG_CAPACITY - 1} frames, got ${info.spanS}`);
  const oldestAge = (total - 1) * DT - info.spanS;
  assert.ok(Math.abs(oldestAge - (total - EXHAUST_LAG_CAPACITY) * DT) < 1e-5,
    `oldest retained sample should be ${total - EXHAUST_LAG_CAPACITY} frames old, got ${oldestAge}`);
});

test('bend magnitude grows monotonically with how long ago the gas left', () => {
  const lag = createExhaustLag();
  const { t, h } = recordConstantTurn(lag, 1.0, 1.5);
  const { out } = buildSpine(lag, { heading: h, nowS: t, tipAgeS: 0.6 });
  const count = out.length / 4;
  let prev = -1;
  for (let k = 1; k < count; k++) {
    const w = out[k * 4 + 3];
    assert.ok(w >= prev - 1e-9, `bend weight monotone along the jet at station ${k}`);
    assert.ok(w >= 0 && w <= 1);
    prev = w;
  }
});
