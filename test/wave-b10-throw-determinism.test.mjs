// §22 B10 — the rope's combat result is the same class of outcome on both seeds.
//
// The opening throw kills on seed 4242 and on seed 8008 — a kill each, never a split
// where one seed kills and the other does not. Both kills carry throw attribution
// (terrain self-kill or the player's whip/meeting; a stray bullet's kill never counts,
// by the driver's own guard).
//
// Vehicle: the A6 opening-slice driver stopped one tick after the throw_kill beat
// (stopAfterBeat), so each seed runs only the raid+latch+swing+release prefix.
import assert from 'node:assert/strict';
import test from 'node:test';

import { runOpeningSliceA6 } from '../tools/agentic/a6OpeningSlice.mjs';

const SEEDS = [4242, 8008];

for (const seed of SEEDS) {
  test(`the opening throw kills on seed ${seed}`, { timeout: 600_000 }, async () => {
    const result = await runOpeningSliceA6({ seed, stopAfterBeat: 'throw_kill' });
    const names = result.beats.map((b) => b.name);
    assert.ok(names.includes('raid'), `no raid beat (phase ${result.phase}, saw ${names.join(',')})`);
    assert.ok(names.includes('throw_kill'), `no throw_kill beat (phase ${result.phase}, saw ${names.join(',')})`);
    const kill = result.beats.find((b) => b.name === 'throw_kill');
    assert.ok(kill.victim != null, 'throw_kill has no victim');
    // Same class: the kill is the throw's work — exactly the driver's own guard:
    // terrain (null), self (victim), the player's whip, or the thrown payload
    // meeting a bystander. A stray bullet's kill never credits the beat.
    assert.ok(kill.payload != null, 'throw_kill names its payload');
    const attributed = kill.killerId == null || kill.killerId === kill.victim
      || kill.killerId === result.playerId || kill.killerId === kill.payload;
    assert.ok(attributed, `throw_kill misattributed (killer=${kill.killerId}, victim=${kill.victim})`);
    console.log(`B10 seed=${seed} victim=${kill.victim} killer=${kill.killerId} via=${kill.via || 'meeting'} t=${kill.t.toFixed(1)}`);
  });
}
