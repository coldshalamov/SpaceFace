import test from 'node:test';
import assert from 'node:assert/strict';
import { brakeModeWords } from '../src/ui/hud.js';

test('the approach tape names the stop in pilot words, never the solver key', () => {
  assert.equal(brakeModeWords('direct-counterthrust'), 'brake');
  assert.equal(brakeModeWords('flip-and-burn'), 'flip & burn');
  assert.equal(brakeModeWords('some-new-mode'), 'some new mode', 'an unknown mode loses every hyphen, not just the first');
  assert.equal(brakeModeWords(null), '');
});
