// C4 — the physics lab's controls are kit words. The launch verb is the one primary.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/ui/screens/sandbox.js', import.meta.url), 'utf8');

test('the lab does not use the old filled button', () => {
  assert.equal(source.includes("'sf-btn"), false);
  assert.match(source, /k-word k-word--emph k-word--primary sf-sandbox-launch/);
  assert.match(source, /Launch with these settings/);
  assert.match(source, /el\('button', 'k-word k-word--emph', 'Back'\)/);
});
