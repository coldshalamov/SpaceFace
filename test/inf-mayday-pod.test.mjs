// inf-mayday-pod — a pod from a killed crew reads as a lifeboat, not cargo.
//
// Player story: the causal eject loop drops a survivor pod with a 180 s oxygen window, and it
// used to render as the generic sealed cargo canister — same drum, same transponder, same read.
// Now it is an ejection capsule with a distress lamp running a two-short-one-long group whose
// period tightens as the oxygen drains. These tests pin the pure decisions: pod discrimination,
// the lamp rhythm and its urgency pacing, and the accessibility contract (never silenced).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SURVIVOR_POD_PAYLOAD_TYPE,
  MAYDAY_LAMP_COLOR,
  MAYDAY_PERIOD_CALM_S,
  MAYDAY_PERIOD_CRITICAL_S,
  isSurvivorPodEntity,
  maydayUrgency,
  maydayGroupPeriod,
  resolveMaydayLamp,
  maydayViewportBurn,
} from '../src/render/survivorPodVisual.js';

test('only the causal and player-wreck lifeboats are survivor pods', () => {
  const causal = { data: { payloadType: SURVIVOR_POD_PAYLOAD_TYPE, survivorPodCausal: { ejectedAt: 10, expireAt: 190 } } };
  const playerWreck = { data: { payloadType: SURVIVOR_POD_PAYLOAD_TYPE, playerWreck: true, survivorPodCausal: { ejectedAt: 5, expireAt: null } } };
  const squatter = { data: { payloadType: 'wreck_squatter', tetherRole: 'survivor_pod' } };
  const canister = { data: { payloadType: 'crate_common' } };

  assert.equal(isSurvivorPodEntity(causal), true, 'a causal eject pod is a lifeboat');
  assert.equal(isSurvivorPodEntity(playerWreck), true, 'the player wreck pod is a lifeboat');
  assert.equal(isSurvivorPodEntity(squatter), false,
    'a wreck squatter shares the tether role but is not a lifeboat — keeps the canister');
  assert.equal(isSurvivorPodEntity(canister), false, 'ordinary cargo keeps the canister');
  assert.equal(isSurvivorPodEntity(null), false, 'null fails closed');
  assert.equal(isSurvivorPodEntity({}), false, 'no data fails closed');
});

test('urgency runs 0 to 1 across the oxygen window and holds steady without a clock', () => {
  near(maydayUrgency(10, 10, 190), 0, 'fresh eject');
  near(maydayUrgency(100, 10, 190), 0.5, 'half the window');
  near(maydayUrgency(190, 10, 190), 1, 'exhausted');
  near(maydayUrgency(500, 10, 190), 1, 'long past expiry clamps at 1');

  // The player's own wreck pod carries no expiry stamp: distressed, not yet dying.
  near(maydayUrgency(4000, 5, null), 0.25, 'no expiry clock holds the steady urgency');
  near(maydayUrgency(NaN, 10, 190), 0.25, 'NaN now fails safe');
  near(maydayUrgency(50, 100, 90), 0.25, 'inverted window fails safe');

  function near(actual, expected, label) {
    assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: got ${actual}`);
  }
});

test('the lamp code is two shorts then one long, and only inside the group', () => {
  // Sample one calm group densely: expect three distinct lit spans.
  const period = maydayGroupPeriod(0);
  const lit = [];
  const steps = 400;
  for (let i = 0; i < steps; i++) {
    const u = i / steps;
    const sample = resolveMaydayLamp(u * period, 0, 180, 0, 1);
    lit.push(sample.flash > 0.5 ? 1 : 0);
  }
  // Count the lit runs.
  const runs = [];
  let current = lit[0];
  let len = 1;
  for (let i = 1; i < steps; i++) {
    if (lit[i] === current) len++;
    else { runs.push({ v: current, len }); current = lit[i]; len = 1; }
  }
  runs.push({ v: current, len });
  const flashes = runs.filter((r) => r.v === 1);
  assert.equal(flashes.length, 3, `exactly three elements per group (got ${flashes.length})`);
  assert.ok(flashes[0].len < flashes[2].len, `the long element outlasts the shorts (${flashes.map((f) => f.len)})`);
  assert.ok(flashes[1].len < flashes[2].len, 'the second short is still shorter than the long');

  // Between groups the lamp rests — the shout has silence in it.
  const midRest = resolveMaydayLamp(0.92 * period, 0, 180, 0, 1);
  assert.equal(midRest.flash, 0, 'the group ends in silence, not a trailing glow');
});

test('the distress group tightens as the oxygen drains — the pod visibly pants', () => {
  const calm = maydayGroupPeriod(0);
  const mid = maydayGroupPeriod(0.5);
  const critical = maydayGroupPeriod(1);
  assert.ok(calm > mid && mid > critical, `period tightens with urgency (${calm} > ${mid} > ${critical})`);
  near(calm, MAYDAY_PERIOD_CALM_S, 1e-9, 'calm period constant');
  near(critical, MAYDAY_PERIOD_CRITICAL_S, 1e-9, 'critical period constant');

  // At the same wall-clock moment in the group, a dying pod is mid-shout while a fresh pod
  // is still resting: urgency shows without reading a gauge.
  const t = 1.45; // inside the long element for a 1.6 s period, past it for a 0.55 s one
  const fresh = resolveMaydayLamp(t, 0, 100, 0, 1).flash;
  const dying = resolveMaydayLamp(t, 0, 1.5, 0, 1).flash;
  assert.ok(dying > fresh, `a draining pod shouts sooner (${dying} vs ${fresh})`);
  function near(actual, expected, label) {
    assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: got ${actual}`);
  }
});

test('accessibility: reduced motion halves the gain, flash reduction keeps the steady burn, nothing silences the lamp', () => {
  const now = 0.72; // inside the long element
  const full = resolveMaydayLamp(now, 0, 190, 0, 1);
  const slowed = resolveMaydayLamp(now, 0, 190, 0, 0.5);
  const noFlash = resolveMaydayLamp(now, 0, 190, 0, 0);

  assert.ok(slowed.flash > 0 && slowed.flash < full.flash,
    `reduced motion halves the strobe gain (${slowed.flash} vs ${full.flash})`);
  assert.equal(noFlash.flash, 0, 'flash reduction drops the strobe kick');
  assert.ok(maydayViewportBurn(noFlash.flash) > 0.8,
    'the viewport burn stays lit under flash reduction — a beacon is never dark');
  assert.ok(maydayViewportBurn(full.flash) > maydayViewportBurn(0),
    'the burn climbs with the shout');

  // Any phase, any gain: flash stays in band and the period is always finite and positive.
  for (let p = 0; p < 8; p++) {
    for (let i = 0; i < 24; i++) {
      const s = resolveMaydayLamp(i * 0.37, 2, 182, p / 8, p % 2 ? 0.5 : 1);
      assert.ok(s.flash >= 0 && s.flash <= 1, `flash in band at phase ${p}, t=${i}`);
      assert.ok(s.period >= MAYDAY_PERIOD_CRITICAL_S, `period never under critical at phase ${p}`);
    }
  }
});

test('the lamp identity is the warning red, not a commodity tint', () => {
  assert.equal(MAYDAY_LAMP_COLOR, '#ff4a3c',
    'the distress lamp keeps the luminaire warning family, never loot category color');
});
