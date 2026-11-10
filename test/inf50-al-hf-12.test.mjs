// AL-HF-12 — Mira commits to the Quarry Hook. Rook and Sable keep the ordinary line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RACING_PERSONALITIES, createRacingDriver, racingDriverIntent } from '../src/ai/racingDriver.js';

const SEED = 4242;
const GATES = Object.freeze([
  Object.freeze({ x: 0, z: 0 }),
  Object.freeze({ x: 400, z: 0 }),
  Object.freeze({ x: 800, z: 0 }),
]);

function ship() {
  return {
    id: 'racer', type: 'ship', alive: true, radius: 18, mass: 20, rot: 0, angVel: 0,
    pos: { x: 300, z: 0 }, vel: { x: 40, z: 0 }, data: { shipDefId: 'ship_kestrel' },
  };
}

function hook() {
  return {
    id: 'quarry-hook', alive: true, name: 'Quarry Hook', radius: 12,
    pos: { x: 300, z: 80 },
    data: { name: 'Quarry Hook', raceSetPiece: { id: 'quarry_hook', kind: 'anchor' } },
  };
}

function drive(personality, { hookLaps = [0, 1, 2], laps = [0, 1, 2] } = {}) {
  const driver = createRacingDriver(personality, 'club');
  const body = ship();
  const anchor = hook();
  const intents = [];
  for (const lap of laps) {
    intents.push(racingDriverIntent(driver, {
      entity: body,
      params: { nextGate: 1, lap, gateRadiusWU: 80 },
      gates: GATES,
      nearby: hookLaps.includes(lap) ? [anchor] : [],
      dt: 1 / 60,
    }));
  }
  return { driver, intents };
}

test('seed 4242: Mira anchors the Quarry Hook on at least two of three laps', () => {
  assert.equal(SEED, 4242);
  const mira = RACING_PERSONALITIES.find((row) => row.id === 'mira');
  const pace = mira.pace;
  const { driver, intents } = drive(mira, { hookLaps: [0, 1] });
  assert.ok(driver.anchorLaps.length >= 2);
  assert.deepEqual(driver.anchorLaps.slice(0, 2), [0, 1]);
  assert.equal(intents[0].anchor.id, 'quarry_hook');
  assert.equal(intents[0].anchor.name, 'Quarry Hook');
  assert.equal(intents[1].anchor.lap, 1);
  assert.equal(intents[2].anchor, undefined);
  racingDriverIntent(driver, {
    entity: ship(), params: { nextGate: 1, lap: 0, gateRadiusWU: 80 }, gates: GATES, nearby: [hook()], dt: 1 / 60,
  });
  assert.equal(driver.anchorLaps.filter((lap) => lap === 0).length, 1);
  assert.equal(mira.pace, pace);
});

test('seed 4242: Rook and Sable do not take the Quarry Hook', () => {
  for (const id of ['rook', 'sable']) {
    const personality = RACING_PERSONALITIES.find((row) => row.id === id);
    const pace = personality.pace;
    const { driver, intents } = drive(personality, { hookLaps: [0, 1, 2] });
    assert.equal(driver.anchorLaps.length, 0);
    assert.equal(intents.every((intent) => intent.anchor === undefined), true);
    assert.equal(personality.pace, pace);
  }
  const mira = RACING_PERSONALITIES.find((row) => row.id === 'mira');
  const missed = drive(mira, { hookLaps: [] });
  assert.equal(missed.driver.anchorLaps.length, 0);
  assert.equal(missed.intents.every((intent) => intent.anchor === undefined), true);
});
