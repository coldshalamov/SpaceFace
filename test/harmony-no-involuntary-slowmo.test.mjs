// HARMONY-FIX 4 (R23): no system changes time scale without player input.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('flybyFocus never registers a time-effect request', () => {
  const src = readFileSync(new URL('../src/systems/flybyFocus.js', import.meta.url), 'utf8');
  assert.ok(!/timeEffects\.set\(/.test(src), 'flyby focus must not set a time-scale lease');
});
