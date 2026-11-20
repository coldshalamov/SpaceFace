// SEED-ST-11: the speed readout spells meters for speech. The visible unit is m/s — the
// plain-units sweep (2026-11-20) dropped the WU/u jargon from the HUD; speech keeps the spelled-out words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGameState } from '../src/core/gameState.js';
import {
  buildVelocityReadout,
  distanceUnitSpeech,
  objectiveTravelReadout,
  speedUnitSpeech,
} from '../src/ui/hud.js';

const HUD_SRC = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');

test('seed 4242 speed readout spells meters and keeps the m/s mark', () => {
  const state = createGameState(4242);
  assert.equal(state.meta.seed, 4242);
  assert.equal(speedUnitSpeech(40), '40 meters per second');
  assert.equal(speedUnitSpeech(40, true), '40 meters per second, earned');

  const plain = buildVelocityReadout(40, 100);
  assert.equal(plain.text, '40 m/s');
  assert.equal(plain.spoken, '40 meters per second');
  assert.doesNotMatch(plain.text, /world units/);

  const earned = buildVelocityReadout(140, 100);
  assert.equal(earned.text, '140 m/s · EARNED');
  assert.equal(earned.spoken, '140 meters per second, earned');

  const player = { id: 1, pos: { x: 0, z: 0 }, vel: { x: 30, z: 40 } };
  const travelState = { playerId: 1, entities: new Map([[1, player]]) };
  const travel = objectiveTravelReadout(travelState, { pos: { x: 300, z: 400 } });
  assert.equal(travel.distanceText, '500 m');
  assert.equal(travel.distanceSpoken, undefined, 'the travel record keeps its pinned shape');
  assert.equal(distanceUnitSpeech(travel.distanceText), '500 meters');
  assert.equal(distanceUnitSpeech('1.0k WU'), '1.0k meters');
  assert.equal(distanceUnitSpeech('12 u'), '12 meters');
  assert.equal(distanceUnitSpeech('0 u'), '0 meters');
  assert.equal(distanceUnitSpeech('4.0 km'), '4.0 kilometers');
  assert.equal(distanceUnitSpeech('ROUTE PENDING'), '');

  assert.match(HUD_SRC, /applySpeedSpeech\(vt\.spool, velocity\.spoken\)/);
  assert.match(HUD_SRC, /applyDistanceSpeech\(elNavDist, distText\)/);
  assert.match(HUD_SRC, /applyDistanceSpeech\(arrowLabel, travel\.distanceText\)/);
  assert.match(HUD_SRC, /setAttr\(arrow, 'aria-label', `Current objective:/);
});
