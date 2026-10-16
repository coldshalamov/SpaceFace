// INST-35 — Speed you earned reads differently from speed the thrusters bought.
//
// House seed 4242. Pins both sides of the thruster cap through both seams:
//   - telemetry (`flightTelemetry.js`) exposes the earned-speed boolean, true only above the cap;
//   - the HUD velocity model (`hud.js` `buildVelocityReadout`) carries the flag and the velocity
//     readout marks it (`EARNED`), with plain `WU/S` at or below the cap.
//
// Do NOT: change the flight law (this file asserts presentation only — no kernel import, no
// stepPropulsion), add a second gauge (the mark rides the existing readout text).
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { isEarnedSpeed, resolveThrusterCap } from '../src/core/flight/flightTelemetry.js';
import { buildVelocityReadout } from '../src/ui/hud.js';

const SEED = 4242;

// The real owner chain on the house seed: a seeded state, a player hull on the fleet drive,
// and the catalog profile the live HUD resolves — never a hand-typed cap.
function seededRig() {
  const state = createGameState(SEED);
  const player = {
    id: 1, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    driveId: 'drive_reaction_m',
    data: {},
  };
  state.playerId = 1;
  state.entities.set(1, player);
  state.entityList = [player];
  const profile = resolvePropulsionProfile(player, state);
  const cap = resolveThrusterCap(profile);
  assert.ok(cap > 0, `seed ${SEED} must resolve a positive thruster cap, got ${cap}`);
  return { state, player, profile, cap };
}

function hullAt(speed) {
  return { pos: { x: 0, z: 0 }, vel: { x: speed, z: 0 }, rot: 0 };
}

test('the thruster cap is the catalog governed speed, with a maxSpeed fallback', () => {
  const { profile, cap } = seededRig();
  assert.equal(cap, profile.combatSpeed, 'the cap is the governed combat speed, not a re-derivation');
  assert.equal(resolveThrusterCap({ maxSpeed: 150 }), 150, 'a drive without combatSpeed falls back to maxSpeed');
  assert.equal(resolveThrusterCap({ combatSpeed: 195, maxSpeed: 150 }), 195, 'combatSpeed wins over maxSpeed');
  assert.equal(resolveThrusterCap({}), 0, 'no numbers, no cap — never a phantom threshold');
  assert.equal(resolveThrusterCap(null), 0, 'a missing profile never claims earned speed');
});

test('earned-speed is true only above the cap: below, at, and above', () => {
  const { profile, cap } = seededRig();
  assert.equal(isEarnedSpeed(cap - 5, profile), false, 'below the cap is thruster-bought speed');
  assert.equal(isEarnedSpeed(cap, profile), false, 'riding the cap itself is thruster-bought speed');
  assert.equal(isEarnedSpeed(cap + 5, profile), true, 'above the cap is earned speed');
  assert.equal(isEarnedSpeed(hullAt(cap + 5), profile), true, 'a hull entity reads the same as its speed');
  assert.equal(isEarnedSpeed(hullAt(cap), cap), false, 'an explicit cap number follows the same strict rule');
  assert.equal(isEarnedSpeed(hullAt(cap + 0.5), cap), true, 'any excess counts — the line is the cap, not a band');
  assert.equal(isEarnedSpeed({ vel: { x: cap / Math.SQRT2, z: cap / Math.SQRT2 } }, cap), false,
    'a diagonal at exactly the cap magnitude is still thruster speed');
  assert.equal(isEarnedSpeed(9999, {}), false, 'without a cap nothing can read as earned');
});

test('the HUD velocity model carries the flag and marks the readout', () => {
  const { player, profile, cap } = seededRig();
  const below = buildVelocityReadout({ ...player, vel: { x: cap - 5, z: 0 } }, profile);
  const at = buildVelocityReadout({ ...player, vel: { x: cap, z: 0 } }, profile);
  const above = buildVelocityReadout({ ...player, vel: { x: cap + 5, z: 0 } }, profile);
  assert.equal(below.earnedSpeed, false);
  assert.equal(at.earnedSpeed, false);
  assert.equal(above.earnedSpeed, true);
  assert.equal(above.thrusterCap, cap, 'the model names the cap it measured against');
  assert.equal(below.text, `${cap - 5} WU/S`, 'thruster-bought speed reads plain');
  assert.equal(at.text, `${cap} WU/S`, 'the cap itself reads plain');
  assert.equal(above.text, `${cap + 5} WU/S · EARNED`, 'earned speed is marked in words, not colour alone');
  assert.ok(!below.text.includes('EARNED') && !at.text.includes('EARNED'), 'no mark at or below the cap');
});

test('both seams agree across the cap on the house seed', () => {
  const { profile, cap } = seededRig();
  for (const delta of [-25, -1, 0, 1, 25]) {
    const speed = cap + delta;
    const model = buildVelocityReadout(speed, profile);
    assert.equal(model.earnedSpeed, isEarnedSpeed(speed, profile),
      `HUD flag and telemetry predicate must agree at cap${delta >= 0 ? '+' : ''}${delta}`);
    assert.equal(model.text.includes('EARNED'), delta > 0,
      `readout mark must track the flag at cap${delta >= 0 ? '+' : ''}${delta}`);
  }
  const reuse = {};
  const out = buildVelocityReadout(cap + 10, profile, reuse);
  assert.equal(out, reuse, 'the model honours a caller scratch buffer');
  assert.equal(out.earnedSpeed, true);
});
