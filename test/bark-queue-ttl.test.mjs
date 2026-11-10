/**
 * Bark-channel voice.say ttl is BOTH the floor-hold duration and the queue stale-drop deadline
 * (VoiceQueue expireAt = enqueuedAt + ttl). Barks are rate-limited by a 1.5 s gap, so a bark
 * enqueued behind another bark needs more patience than the gap to ever surface. Calls that
 * passed ttl:1 expired unread in exactly the busy combat moments they fire in — the mayday
 * hail, its salvage receipt, the pirate yield and the disguise reveal.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { VoiceQueue } from '../src/ui/voiceArbiter.js';
import { survivorPod } from '../src/systems/survivorPod.js';
import { pirateDisengage } from '../src/systems/pirateDisengage.js';

const GAP_S = 1.5; // BARK_MIN_GAP_MS / 1000 — the patience a queued bark needs to outlive.

function voiceInto(queue, now = 0) {
  return { say: (msg) => { queue.enqueue(msg, now); return true; } };
}

test('a mayday enqueued behind a held bark floor still reaches the player', () => {
  const queue = new VoiceQueue();
  // Floor held by an ordinary firefight bark for 4 s; the mayday arrives mid-firefight.
  queue.enqueue({ channel: 'bark', text: 'Taking hits — breaking off!', ttl: 4, id: 'b1' }, 0);
  const first = queue.step(0);
  assert.ok(first && first.text.includes('breaking off'));

  const sys = Object.assign(Object.create(survivorPod), {
    helpers: { voice: voiceInto(queue, 900) }, // arbiter clock is ms
    _bus: createBus(),
  });
  sys._speakMayday({ data: {} }, { id: 77 }, { entityId: 77, factionId: 'faction_neutral' });

  // Bark-blocked until the gap clears; the occupant holds until t = 4 s. With the old ttl:1 the
  // mayday stale-dropped at t ≈ 1.9 s and never surfaced.
  queue.step(2000);
  const surfaced = queue.step(4100);
  assert.ok(surfaced, 'the mayday must outlive the occupied floor, not expire in the queue');
  assert.match(surfaced.text, /Mayday/);
});

test('the survivor salvage receipt and pirate yield carry enough ttl to outlive the bark gap', () => {
  const queue = new VoiceQueue();
  const sys = Object.assign(Object.create(survivorPod), {
    helpers: { voice: voiceInto(queue) },
    _bus: createBus(),
  });
  sys._speakSalvageReceipt({ victimLabel: 'Mule crew' }, 88, 'faction_neutral');
  const receipt = queue.pending[0];
  assert.ok(receipt.ttlMs / 1000 > GAP_S, `salvage receipt ttl ${receipt.ttlMs}ms dies inside the bark gap`);

  const pirate = Object.assign(Object.create(pirateDisengage), {
    helpers: { voice: voiceInto(queue) },
    state: { meta: { seed: 42 } },
    _emit: () => {},
    bus: createBus(),
  });
  // The disengage/surrender bark is the player-facing close of the beat.
  pirate._speak({ squadId: 's1', outcome: 'surrendered', reason: 'outgunned' }, { factionId: 'faction_reach', data: {} });
  const barkCalls = queue.pending.filter((e) => e.kind === 'pirateDisengage' || e.channel === 'bark');
  assert.ok(barkCalls.length > 0, 'the disengage speak must produce a voice call');
  for (const e of barkCalls) {
    assert.ok(e.ttlMs / 1000 > GAP_S, `pirateDisengage ttl ${e.ttlMs}ms dies inside the bark gap`);
  }
});
