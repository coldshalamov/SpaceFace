// SFQ-B091 — survey, cut, and collect are different pictures. Fracture stays its own sheet.
// Seed 4242. The ear for these phases was already four recipes; this pins that and the new sheets.
import assert from 'node:assert/strict';
import test from 'node:test';

import { AUDIO_CUE_TO_RECIPE } from '../src/audio/audioSystem.js';
import { combatVerbRecipe } from '../src/audio/combatVerbCues.js';
import {
  MINING_PHASE_SHEETS,
  miningPhaseSheet,
  paintMiningPhaseSheet,
} from '../src/render/vfxMiningPhases.js';

const SEED = 4242;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('survey, cut, and collect are three sheets; fracture is not one of them', () => {
  assert.equal(SEED, 4242);
  const survey = miningPhaseSheet('mining.survey.classified');
  const cut = miningPhaseSheet('mining.extraction.locked');
  const collect = miningPhaseSheet('mining.yield.collected');
  assert.equal(survey, MINING_PHASE_SHEETS.survey);
  assert.equal(cut, MINING_PHASE_SHEETS.cut);
  assert.equal(collect, MINING_PHASE_SHEETS.collect);
  assert.equal(new Set([survey.shape, cut.shape, collect.shape]).size, 3);
  assert.equal(new Set([survey.color, cut.color, collect.color]).size, 3);
  assert.equal(miningPhaseSheet('mining.fracture.released'), null);
  assert.equal(miningPhaseSheet('mining.fracture.anticipation'), null);
  assert.equal(miningPhaseSheet('mining.rich_core.exposed'), null);
});

test('reduced motion keeps one short sheet in the phase color (seed 4242)', () => {
  const rand = mulberry32(SEED);
  for (const sheet of Object.values(MINING_PHASE_SHEETS)) {
    const full = [];
    const short = [];
    paintMiningPhaseSheet({ sprite: (s) => full.push(s) }, sheet, { x: 0, z: 0 }, 10, false, rand);
    paintMiningPhaseSheet({ sprite: (s) => short.push(s) }, sheet, { x: 0, z: 0 }, 10, true, rand);
    assert.equal(short.length, 1, sheet.phase);
    assert.ok(full.length >= 1, sheet.phase);
    assert.equal(short[0].color, sheet.color);
    if (sheet.shape === 'ring') assert.equal(full.length, 6);
    if (sheet.shape === 'spark') assert.equal(full.length, 2);
    if (sheet.shape === 'bead') assert.equal(full.length, 1);
  }
  const ring = [];
  const spark = [];
  paintMiningPhaseSheet({ sprite: (s) => ring.push(s) }, MINING_PHASE_SHEETS.survey, { x: 1, z: 2 }, 8, false, mulberry32(SEED));
  paintMiningPhaseSheet({ sprite: (s) => spark.push(s) }, MINING_PHASE_SHEETS.cut, { x: 1, z: 2 }, 8, false, mulberry32(SEED));
  assert.notEqual(ring[0].kind, spark[0].kind);
});

test('survey, lock, fracture, and yield already use four different recipes', () => {
  const survey = AUDIO_CUE_TO_RECIPE['presentation.mining.scan_classified'];
  const lock = AUDIO_CUE_TO_RECIPE['presentation.mining.cutter_lock'];
  const fracture = AUDIO_CUE_TO_RECIPE['presentation.mining.fracture_break'];
  const yieldCue = AUDIO_CUE_TO_RECIPE['presentation.mining.yield'];
  const beam = combatVerbRecipe('mining:start');
  const ids = [survey, lock, fracture, yieldCue, beam];
  assert.equal(ids.every(Boolean), true);
  assert.equal(new Set(ids).size, ids.length);
});
