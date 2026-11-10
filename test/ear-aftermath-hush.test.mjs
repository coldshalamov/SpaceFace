// barkDirector:silence was emitted at the end of a fight and received by nobody.
// The room now drops once per silence window. A second kill inside that window
// does not restart it. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { AFTERMATH_HUSH, admitAftermathHush } from '../src/audio/combatFeedbackEar.js';

const SEED = 4242;

test('seed 4242: post-combat silence drops the room once per window', () => {
  assert.equal(SEED, 4242);
  assert.ok(AFTERMATH_HUSH.depth > 0.2 && AFTERMATH_HUSH.depth < 0.7,
    'the breath is a drop, not a mute and not a capital hush');
  const book = {};
  assert.equal(admitAftermathHush(book, 18, 10), true);
  assert.equal(book.until, 18);
  assert.equal(admitAftermathHush(book, 20, 12), false, 'a kill inside the window stays quiet');
  assert.equal(book.until, 20, 'the continuing silence window extends without another hush');
  assert.equal(admitAftermathHush(book, 28, 20), true, 'the next fight may breathe again');

  const src = readFileSync(new URL('../src/audio/audioSystem.js', import.meta.url), 'utf8');
  assert.match(src, /bus\.on\('barkDirector:silence'/);
  assert.match(src, /kind: 'aftermath'/);
  assert.match(src, /aftermath: AFTERMATH_HUSH/);
});
