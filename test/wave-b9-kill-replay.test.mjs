// §22 B9 — the last five seconds of a kill play back from the positions the sim stepped.
// Skip leaves the results model. Seeds 4242 and 8008 take the same path to the same place.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  KILL_REPLAY_S,
  captureKillReplay,
  killReplay,
  killReplayActions,
  noteKillReplaySample,
  replaySampleAt,
  resetKillReplay,
  skipKillReplay,
} from '../src/systems/killReplay.js';

function fly(seed) {
  resetKillReplay();
  const steps = Math.round(KILL_REPLAY_S * 60);
  const speed = 40 + (seed % 17);
  for (let i = 0; i < steps; i += 1) {
    const t = i / 60;
    noteKillReplaySample(t * 10, seed * 0.001, t * speed, -t * 12);
  }
  const victim = {
    id: 4,
    collisionRadius: 11,
    pos: { x: (steps / 60) * speed, z: -(steps / 60) * 12 },
  };
  const state = {
    tick: steps,
    seed,
    playerId: 1,
    run: { kind: 'survival', phase: 'combat', seed },
    entities: new Map([[1, { id: 1, pos: { x: steps / 6, z: seed * 0.001 } }]]),
  };
  return captureKillReplay(state, victim);
}

test('five seconds of the same seeded path lands within a hull length', () => {
  for (const seed of [4242, 8008]) {
    const first = fly(seed);
    const again = fly(seed);
    const endA = replaySampleAt(first, KILL_REPLAY_S);
    const endB = replaySampleAt(again, KILL_REPLAY_S);
    const drift = Math.hypot(endA.bx - endB.bx, endA.bz - endB.bz);
    assert.ok(drift < first.hullLength, `seed ${seed} replay drifted ${drift}`);
    assert.equal(first.seed, seed);
    assert.ok(first.samples.length > 60, 'the window is the whole five seconds, not one instant');
    const start = replaySampleAt(first, 0);
    assert.ok(Math.hypot(endA.bx - start.bx, endA.bz - start.bz) > first.hullLength,
      'the body is somewhere else at the end of the five seconds');
  }
});

test('the live ring records a survival step and skip leaves the stunt names', () => {
  resetKillReplay();
  const state = {
    tick: 0,
    run: { kind: 'survival', phase: 'combat', seed: 4242 },
    playerId: 1,
    entities: new Map([[1, { id: 1, alive: true, type: 'ship', pos: { x: 0, z: 0 } }]]),
    entityList: [],
  };
  const other = { id: 2, alive: true, type: 'ship', pos: { x: 30, z: 0 } };
  state.entities.set(2, other);
  state.entityList = [...state.entities.values()];
  killReplay.init({ state });
  for (let i = 0; i < 90; i += 1) {
    state.entities.get(1).pos.x = i;
    other.pos.x = 30 + i * 0.5;
    killReplay.update(1 / 60, state);
  }
  const victim = { id: 2, collisionRadius: 9, pos: { x: other.pos.x, z: 0 } };
  const record = captureKillReplay(state, victim);
  const end = replaySampleAt(record, KILL_REPLAY_S);
  assert.ok(Math.hypot(end.bx - victim.pos.x, end.bz - victim.pos.z) < record.hullLength);

  const result = {
    headline: 'The run ended.',
    stuntKills: [{ name: 'Bolas' }],
    killReplay: record,
  };
  assert.deepEqual(killReplayActions(result), ['Replay the last kill', 'Skip the replay']);
  skipKillReplay(result);
  assert.deepEqual(killReplayActions(result), []);
  assert.equal(result.headline, 'The run ended.');
  assert.deepEqual(result.stuntKills, [{ name: 'Bolas' }]);
});
