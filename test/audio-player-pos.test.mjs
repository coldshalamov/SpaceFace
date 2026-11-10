import assert from 'node:assert/strict';
import test from 'node:test';

import { audio } from '../src/audio/audioSystem.js';

function hostWith(state) {
  const host = Object.create(audio);
  host.state = state;
  host.rt = { loops: {}, ctx: { currentTime: 0 } };
  return host;
}

test('positional audio uses a silent origin when the player body has no finite pose', () => {
  const missing = hostWith({ playerId: 1, entities: new Map([[1, { id: 1 }]]) });
  assert.deepEqual(missing._playerPos(), { x: 0, z: 0 });

  const nanPos = hostWith({
    playerId: 1,
    entities: new Map([[1, { id: 1, pos: { x: Number.NaN, z: 4 } }]]),
  });
  assert.deepEqual(nanPos._playerPos(), { x: 0, z: 0 });

  const noEntities = hostWith({});
  assert.deepEqual(noEntities._playerPos(), { x: 0, z: 0 });

  const live = hostWith({
    playerId: 7,
    entities: new Map([[7, { id: 7, pos: { x: 12, z: -3 } }]]),
  });
  assert.deepEqual(live._playerPos(), { x: 12, z: -3 });
});

test('loop panning skips tracked bodies that have lost a finite pose', () => {
  const host = hostWith({
    playerId: 1,
    entities: new Map([
      [1, { id: 1, pos: { x: 0, z: 0 } }],
      [9, { id: 9 }],
    ]),
  });
  host.rt.loops.beam = { trackId: 9, gain: { gain: { setTargetAtTime() { throw new Error('should not schedule'); } } } };
  assert.doesNotThrow(() => host._updateLoopPositions(0));
});
