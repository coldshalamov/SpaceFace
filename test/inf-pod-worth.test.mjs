// inf-pod-worth — a drop's beacon answers what the lot is worth.
//
// Player story: every drop used to glow identically, so a 9,800-credit unbroken lens read
// exactly like a 7-credit silicate chunk at flight range — the chase was blind. Now the lot's
// own price grades its light: junk rests dim, the median drop keeps today's read, rich lots
// burn hotter, kick wider, and carry the double band. These tests pin the pure decisions:
// tier bands against the live price table, the per-tier read parameters, and the halo pose's
// worth response (with the old no-tier call staying bit-identical).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  WORTH_PLAIN_LOT_CR,
  WORTH_RICH_LOT_CR,
  pickupLotValue,
  worthTierFor,
  worthReadFor,
  WORTH_READS,
} from '../src/render/pickupWorthRead.js';
import { resolvePickupHaloPose } from '../src/render/pickupMotionPresentation.js';
import { COMMODITIES } from '../src/data/commodities.js';

const priceOf = (id) => COMMODITIES.find((c) => c.id === id).basePrice;
const near = (a, b, eps, label) => assert.ok(Math.abs(a - b) <= eps, `${label}: got ${a}`);

test('lot value is price times units, read off the drop itself', () => {
  const silicate = priceOf('cmdty_silicate'); // 7 cr — the cheapest good
  const lens = priceOf('cmdty_unbroken_lens'); // 9800 cr — a rich tech drop
  near(pickupLotValue({ commodityId: 'cmdty_silicate', amount: 2 }), silicate * 2, 1e-9, 'two units of silicate');
  near(pickupLotValue({ commodityId: 'cmdty_silicate' }), silicate, 1e-9, 'unitless drop defaults to one');
  near(pickupLotValue({ commodityId: 'cmdty_unbroken_lens', amount: 1 }), lens, 1e-9, 'one lens');
  assert.equal(pickupLotValue({ commodityId: 'cmdty_unknown_thing', amount: 9 }), null,
    'an unpriceable id makes no claim');
  assert.equal(pickupLotValue(null), null, 'no data makes no claim');
});

test('tiers band the live table: junk under 60, plain to 900, rich above', () => {
  assert.equal(worthTierFor({ commodityId: 'cmdty_silicate', amount: 3 }), 0,
    'a 21 cr silicate chunk is junk');
  assert.equal(worthTierFor({ commodityId: 'cmdty_ore_iron', amount: 5 }), 1,
    'a 70 cr iron lot is plain');
  assert.equal(worthTierFor({ commodityId: 'cmdty_gem_diamond', amount: 1 }), 2,
    'a diamond is rich');
  assert.equal(worthTierFor({ commodityId: 'cmdty_ore_iron', amount: 70 }), 2,
    'enough units price any good up into rich');
  assert.equal(worthTierFor({ commodityId: 'cmdty_not_real', amount: 9000 }), 1,
    'unpriceable drops read plain, never dim on a guess');
  assert.equal(worthTierFor(undefined), 1, 'no data reads plain');
  // Band boundaries sit exactly where the constants say.
  const mid = priceOf('cmdty_ore_copper'); // 24 cr
  assert.equal(worthTierFor({ commodityId: 'cmdty_ore_copper', amount: Math.ceil(WORTH_PLAIN_LOT_CR / mid) }), 1,
    'the plain band opens at its constant');
  assert.equal(worthTierFor({ commodityId: 'cmdty_ore_copper', amount: Math.floor((WORTH_PLAIN_LOT_CR - 1) / mid) }), 0,
    'just under the band is junk');
});

test('the read grades the light: junk dim, plain today, rich hotter with the double band', () => {
  const junk = worthReadFor(0);
  const plain = worthReadFor(1);
  const rich = worthReadFor(2);
  assert.ok(junk.glintHeat < plain.glintHeat, 'junk glint rests under plain');
  assert.equal(plain.glintHeat, 1, 'plain keeps today’s glint exactly');
  assert.ok(rich.glintHeat > plain.glintHeat, 'rich glint burns hotter');
  assert.ok(junk.haloFloor < plain.haloFloor, 'junk halo rests dimmer');
  assert.equal(plain.haloFloor, 0.55, 'plain halo floor is today’s 0.55');
  assert.ok(rich.haloFloor > plain.haloFloor, 'rich halo rests brighter');
  assert.ok(rich.haloKick > plain.haloKick, 'rich kicks wider on the transponder beat');
  assert.equal(plain.doubleBand, false, 'plain drops carry no second band');
  assert.equal(rich.doubleBand, true, 'rich drops build the double band');
  // Out-of-range tiers clamp instead of exploding.
  assert.equal(worthReadFor(9), rich, 'tier above the table clamps to rich');
  assert.equal(worthReadFor(-3), junk, 'negative tier clamps to junk');
  assert.equal(worthReadFor(NaN), plain, 'NaN tier reads plain');
  assert.ok(WORTH_PLAIN_LOT_CR < WORTH_RICH_LOT_CR, 'the bands are ordered');
});

test('the halo pose answers worth and stays bit-identical for no-tier callers', () => {
  const plain = worthReadFor(1);
  const rich = worthReadFor(2);
  const junk = worthReadFor(0);
  const t = 1.37;
  const baseline = resolvePickupHaloPose(t, 0.4, false, null);
  const plainPose = resolvePickupHaloPose(t, 0.4, false, null, plain.haloFloor, plain.haloKick);
  near(baseline.glow, plainPose.glow, 1e-12, 'no-tier call equals the plain read');
  near(baseline.spinX, plainPose.spinX, 1e-12, 'precession unchanged');
  const richPose = resolvePickupHaloPose(t, 0.4, false, null, rich.haloFloor, rich.haloKick);
  const junkPose = resolvePickupHaloPose(t, 0.4, false, null, junk.haloFloor, junk.haloKick);
  assert.ok(richPose.glow > plainPose.glow, `rich ring rests brighter (${richPose.glow} vs ${plainPose.glow})`);
  assert.ok(junkPose.glow < plainPose.glow, `junk ring rests dimmer (${junkPose.glow} vs ${plainPose.glow})`);
  // The glow stays a legal opacity for every tier across a full flash cycle.
  for (let i = 0; i < 40; i++) {
    for (const read of WORTH_READS) {
      const pose = resolvePickupHaloPose(i * 0.1, 0.3, false, null, read.haloFloor, read.haloKick);
      assert.ok(pose.glow >= 0 && pose.glow <= 1.2,
        `glow in band for floor ${read.haloFloor} at t=${i * 0.1} (${pose.glow})`);
    }
  }
  // Reduced motion keeps every tier's ring present, only calmer — never a dark ring.
  const richCalm = resolvePickupHaloPose(t, 0.4, true, null, rich.haloFloor, rich.haloKick);
  assert.ok(richCalm.glow >= rich.haloFloor - 0.18, 'reduced motion keeps the rich floor readable');
});
