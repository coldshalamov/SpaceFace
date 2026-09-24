// C4 — a claimed body's screen uses the flight kit for its verbs.
// One lamp. No filled accent button.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/ui/screens/base.js', import.meta.url), 'utf8');

test('claimed-body verbs are kit words, not filled accent buttons', () => {
  assert.equal(source.includes('sf-btn'), false);
  assert.match(source, /k-word k-word--emph k-word--primary/);
  assert.match(source, /close\.textContent = 'Close'/);
  assert.match(source, /--k-signal: var\(--dp-lamp\)/);
  assert.doesNotMatch(source, /linear-gradient\(180deg/);
  assert.doesNotMatch(source, /#sf-base button\.sf-btn/);
  assert.doesNotMatch(source, /padding:6px/);
  assert.match(source, /didCommit === 'denied'/);
});
