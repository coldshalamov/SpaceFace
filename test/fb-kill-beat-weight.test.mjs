// FB-084 — The kill camera beat scales with victim weight and agrees with the ear
//
// Pins:
// 1. KILL_BEAT_TUNING authors four tiers matching the weight ladder:
//    - light: factor 0, durationS 0, holdS 0
//    - medium: factor -0.04 (0.96x), durationS 0.25, holdS 0
//    - heavy: factor -0.07 (0.93x), durationS 0.4, holdS 0.2
//    - capital: factor -0.1 (0.9x), durationS 0.7, holdS 0.35
// 2. resolveKillBeatTier resolves tiers from acoustic mass and capital flag:
//    - mass < ACOUSTIC_MASS_UNKNOWN -> light (no beat)
//    - mass >= ACOUSTIC_MASS_UNKNOWN and < TIER_HEAVY_MASS -> medium
//    - mass >= TIER_HEAVY_MASS and < MASS_HEAVY -> heavy
//    - mass >= MASS_HEAVY or capital === true -> capital
// 3. resolveKillBeat returns zoom: true for tiers with factor < 0 under normal motion.
// 4. resolveKillBeat under reduced motion retains holdS and drops zoom (zoom: false).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  KILL_BEAT_TUNING,
  resolveKillBeatTier,
  resolveKillBeat,
} from '../src/render/camera.js';

test('FB-084: KILL_BEAT_TUNING defines the weight-keyed camera beat table', () => {
  const { tiers } = KILL_BEAT_TUNING;
  assert.ok(tiers, 'tiers defined in KILL_BEAT_TUNING');

  // Light tier: wasp and throw-weight darts get NO beat
  assert.equal(tiers.light.factor, 0);
  assert.equal(tiers.light.durationS, 0);
  assert.equal(tiers.light.holdS, 0);

  // Medium tier: 0.96x kiss for 250 ms
  assert.equal(tiers.medium.factor, -0.04);
  assert.equal(tiers.medium.durationS, 0.25);
  assert.equal(tiers.medium.holdS, 0);

  // Heavy tier: 0.93x kiss for 400 ms with 200 ms hold
  assert.equal(tiers.heavy.factor, -0.07);
  assert.equal(tiers.heavy.durationS, 0.4);
  assert.equal(tiers.heavy.holdS, 0.2);

  // Capital tier: 0.9x kiss for 700 ms with 350 ms hold
  assert.equal(tiers.capital.factor, -0.1);
  assert.equal(tiers.capital.durationS, 0.7);
  assert.equal(tiers.capital.holdS, 0.35);
});

test('FB-084: resolveKillBeatTier scales across wasp, bruiser, and capital masses', () => {
  // Wasp / light swarm (mass 16 < 48)
  assert.equal(resolveKillBeatTier(16), 'light');

  // Medium / standard civilian or fighter (mass 60 >= 48)
  assert.equal(resolveKillBeatTier(60), 'medium');

  // Heavy / bruiser (mass 250 >= 200)
  assert.equal(resolveKillBeatTier(250), 'heavy');

  // Capital (mass 450 >= 400 or capital flag)
  assert.equal(resolveKillBeatTier(450), 'capital');
  assert.equal(resolveKillBeatTier(20, true), 'capital');
});

test('FB-084: resolveKillBeat generates correct zoom and duration descriptors', () => {
  const light = resolveKillBeat(16);
  assert.equal(light.tier, 'light');
  assert.equal(light.zoom, false, 'Light tier has no camera zoom');

  const medium = resolveKillBeat(60);
  assert.equal(medium.tier, 'medium');
  assert.equal(medium.zoom, true);
  assert.equal(medium.factor, -0.04);
  assert.equal(medium.durationS, 0.25);

  const capital = resolveKillBeat(450);
  assert.equal(capital.tier, 'capital');
  assert.equal(capital.zoom, true);
  assert.equal(capital.factor, -0.1);
  assert.equal(capital.durationS, 0.7);
  assert.equal(capital.holdS, 0.35);
});

test('FB-084: reduced motion preserves hold timing and suppresses zoom displacement', () => {
  const heavyReduced = resolveKillBeat(250, { reducedMotion: true });
  assert.equal(heavyReduced.tier, 'heavy');
  assert.equal(heavyReduced.zoom, false, 'Zoom must be false when motionReduce is active');
  assert.equal(heavyReduced.holdS, 0.2, 'Hold duration must be preserved in reduced motion');
  assert.equal(heavyReduced.reducedMotion, true);

  const capitalReduced = resolveKillBeat(450, { reducedMotion: true });
  assert.equal(capitalReduced.tier, 'capital');
  assert.equal(capitalReduced.zoom, false, 'Capital zoom suppressed in reduced motion');
  assert.equal(capitalReduced.holdS, 0.35, 'Capital hold duration preserved in reduced motion');
});
