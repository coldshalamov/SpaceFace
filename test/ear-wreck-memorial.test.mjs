// A deep wreck read emitted scan:wreckInvestigated and the story stayed on
// the glass. The ear now says that sentence once, on the comms channel.
// Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { CHANNEL_PRIORITY, VoiceQueue } from '../src/ui/voiceArbiter.js';
import { wreckMemorialLine } from '../src/audio/combatFeedbackEar.js';

const SEED = 4242;

test('seed 4242: a wreck story speaks once on comms', () => {
  assert.equal(SEED, 4242);
  assert.equal(wreckMemorialLine({ lossId: 'L1' }), null);
  assert.equal(wreckMemorialLine({ story: '  ', lossId: 'L1' }), null);

  const story = 'A Reach hauler went dark near Helios.';
  const line = wreckMemorialLine({ lossId: 'loss-7', story, cold: true });
  assert.equal(line.channel, 'comms');
  assert.equal(CHANNEL_PRIORITY[line.channel], CHANNEL_PRIORITY.comms);
  assert.equal(line.id, 'wreckMemorial:loss-7');
  assert.equal(line.text, story);
  assert.ok(line.ttl > 1.5);

  const queue = new VoiceQueue();
  queue.enqueue(line, 0);
  queue.enqueue(wreckMemorialLine({ lossId: 'loss-7', story }), 0);
  const surfaced = queue.step(0);
  assert.equal(surfaced.text, story);
  assert.equal(queue.pending.length, 0, 'the same loss replaces the one line');
  assert.equal(queue.size, 1);

  const src = readFileSync(new URL('../src/audio/audioSystem.js', import.meta.url), 'utf8');
  assert.match(src, /bus\.on\('scan:wreckInvestigated'/);
  assert.match(src, /voice:say/);
});
