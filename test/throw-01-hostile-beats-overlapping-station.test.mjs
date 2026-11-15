// THROW-01: a hostile under the cursor wins over a big station whose radius also covers the cursor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { preciseCursorScore } from '../src/systems/tetherGameplay.js';
import { classifyMasslineIntent } from '../src/combat/masslineTargetScoring.js';

const station = { id: 1, type: 'station', team: 0, alive: true, pos: { x: 0, z: 0 }, radius: 120, mass: 100000 };
const ship = { id: 2, type: 'ship', team: 1, alive: true, pos: { x: 60, z: 0 }, radius: 8, mass: 16 };
const player = { id: 9, pos: { x: -300, z: 0 }, vel: { x: 0, z: 0 } };

test('cursor on, near or just off a hostile that sits inside a station radius: the hostile is the pick', () => {
  for (const [dx, dz] of [[0, 0], [4, 0], [0, 6], [-8, 0], [10, 8]]) {
    const aim = { x: ship.pos.x + dx, z: ship.pos.z + dz };
    const sShip = preciseCursorScore(ship, aim), sStation = preciseCursorScore(station, aim);
    assert.ok(sShip > sStation, `offset ${dx},${dz}: ship ${sShip.toFixed(3)} vs station ${sStation.toFixed(3)}`);
    const ctx = classifyMasslineIntent(player, [station, ship], { cursorPrecisionOf: (e) => preciseCursorScore(e, aim) });
    if (ctx.forceId != null) assert.equal(ctx.forceId, ship.id, `offset ${dx},${dz}: forced pick is the hostile`);
  }
});
