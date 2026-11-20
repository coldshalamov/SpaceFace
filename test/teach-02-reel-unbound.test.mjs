import assert from 'node:assert/strict';
import test from 'node:test';

import { MASSLINE_HOLD_S, reelRebindText, reelUnboundHoldSentence } from '../src/systems/masslineInputGrammar.js';

test('an unbound reel row names the hold path', () => {
  const sentence = reelUnboundHoldSentence();
  assert.match(sentence, /Hold the Line to reel in/, 'R17: hold = reel in');
  assert.match(sentence, /with S to pay out/, 'R17: hold + S = pay out');
  assert.match(sentence, new RegExp(String(MASSLINE_HOLD_S)));
  assert.equal(reelRebindText('reelIn', []), sentence);
  assert.equal(reelRebindText('reelOut', null), sentence);
  assert.equal(reelRebindText('reelIn', ['KeyW']), '');
  assert.equal(reelRebindText('fire', []), '');
});
