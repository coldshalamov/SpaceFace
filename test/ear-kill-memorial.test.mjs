// A kill's chronicle line speaks once, on a real channel. The radio offer used
// to ride 'band' (not in the arbiter table) at a forced priority of 12, so it
// degraded toward info and could be mistaken for the numbers station. Repeating
// the same source ref replaces that one line; it does not stack a second.
// Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createChroniclerVoiceBridge } from '../src/chronicler/voiceBridge.js';
import { CHANNEL_PRIORITY, VoiceQueue } from '../src/ui/voiceArbiter.js';

const SEED = 4242;

test('seed 4242: a kill memorial speaks once on the news channel', () => {
  assert.equal(SEED, 4242);
  assert.equal(CHANNEL_PRIORITY.band, undefined);
  assert.ok(CHANNEL_PRIORITY.news > CHANNEL_PRIORITY.info);

  const bus = createBus();
  const queue = new VoiceQueue();
  let offers = 0;
  bus.on('chronicler:voiceAccepted', () => { offers += 1; });
  createChroniclerVoiceBridge({
    bus,
    helpers: {
      voice: {
        say(msg) {
          queue.enqueue(msg, 0);
          return true;
        },
      },
    },
  });

  const line = {
    text: 'You destroyed the bruiser in Helios.',
    sourceRef: 'kill:bruiser:r1',
    storyId: 'story-bruiser',
    sectorId: 'sector_helios_prime',
  };
  bus.emit('chronicler:radio', line);
  bus.emit('chronicler:radio', line);
  assert.equal(offers, 2, 'the bridge accepts each offer');
  const surfaced = queue.step(0);
  assert.ok(surfaced, 'the memorial takes the floor');
  assert.equal(surfaced.channel, 'news');
  assert.equal(surfaced.priority, CHANNEL_PRIORITY.news);
  assert.equal(surfaced.text, line.text);
  assert.equal(queue.pending.length, 0, 'the repeat replaced the one line');
  assert.equal(queue.size, 1);
});
