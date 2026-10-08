// A bark queued behind a live bark must outlive the 1.5 s bark gap. Seed 4242.
// The old 1.2 s ttl stale-dropped the second line before the gap opened, so a
// firefight's second transmission never reached the floor.
import assert from 'node:assert/strict';
import test from 'node:test';

import { BARK_VOICE_TTL_S } from '../src/systems/barkDirector.js';
import { VoiceQueue } from '../src/ui/voiceArbiter.js';

const SEED = 4242;
const GAP_MS = 1500;

test('seed 4242: bark voice ttl outlives the queue gap', () => {
  assert.equal(SEED, 4242);
  assert.ok(BARK_VOICE_TTL_S * 1000 > GAP_MS, `ttl ${BARK_VOICE_TTL_S}s dies inside the ${GAP_MS}ms bark gap`);

  const queue = new VoiceQueue();
  queue.enqueue({ channel: 'bark', text: 'First hull down.', ttl: BARK_VOICE_TTL_S, id: 'kill:1' }, 0);
  const first = queue.step(0);
  assert.equal(first && first.text, 'First hull down.');

  // Arrives while the first line still holds the floor. The old 1.2 s ttl expired at
  // t = 1400 ms — 100 ms before the gap even opened.
  queue.enqueue({ channel: 'bark', text: 'Second hull down.', ttl: BARK_VOICE_TTL_S, id: 'kill:2' }, 200);
  assert.equal(queue.step(1600), null, 'the gap and the live floor still hold the second line');

  const surfaced = queue.step(BARK_VOICE_TTL_S * 1000 + 50);
  assert.ok(surfaced, 'the second bark must still be queued when the floor frees');
  assert.equal(surfaced.text, 'Second hull down.');
  assert.equal(surfaced.channel, 'bark');
});
