// Hull-burst overhaul, slice A: converted overflow ore is seen and heard.
//
// Ore a full hold refuses now pays credits (combat.arcadeLoot). A converted pickup has no accepted
// `pickup:collected`, so before this it made no sound and showed nothing. `loot:overflowConverted`
// rides the SAME rising scoop chime ladder as an accepted pickup (the floating '+N cr' is DOM code in
// src/ui/floatingText.js and is not unit-tested here; it is a one-line spawn beside the credit chip's).
import assert from 'node:assert/strict';
import test from 'node:test';

import { audio } from '../src/audio/audioSystem.js';

function withStubbedAudio(fn) {
  const originalPlay = audio.play;
  const originalRt = audio.rt;
  const originalState = audio.state;
  const plays = [];
  try {
    audio.play = (id, opts) => { plays.push({ id, opts }); };
    audio.rt = {};
    audio.state = { playerId: 1, simTime: 0 };
    return fn(plays);
  } finally {
    audio.play = originalPlay;
    audio.rt = originalRt;
    audio.state = originalState;
  }
}

test('converted overflow ore climbs the scoop chime ladder like accepted pickups do', () => {
  withStubbedAudio((plays) => {
    audio._onOverflowConverted({ pickupId: 1, credits: 20, pos: { x: 0, z: 0 } });
    audio._onOverflowConverted({ pickupId: 2, credits: 20, pos: { x: 0, z: 0 } });
    audio._onOverflowConverted({ pickupId: 3, credits: 20, pos: { x: 0, z: 0 } });
    const chimes = plays.filter((p) => p.id === 'sfx_pickup_chime').map((p) => p.opts.rate);
    assert.equal(chimes.length, 3, 'one chime per payout');
    assert.ok(chimes[0] < chimes[1] && chimes[1] < chimes[2], `the chain climbs the pentatonic rise (${chimes.join(', ')})`);
    assert.ok(plays.some((p) => p.id === 'sfx_cargo_seat'), 'and each seats like a scoop');
  });
});

test('a payout of nothing makes no sound', () => {
  withStubbedAudio((plays) => {
    audio._onOverflowConverted({ pickupId: 1, credits: 0, pos: { x: 0, z: 0 } });
    audio._onOverflowConverted(null);
    assert.equal(plays.length, 0);
  });
});
