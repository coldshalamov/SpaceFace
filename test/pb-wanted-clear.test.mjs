// Seed 4242. The flight WANTED alert names how long this heat level takes to clear.
// A lawful heat value does not invent a clock.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { heatClearSecondsForLevel, heatLevelFor } from '../src/systems/heat.js';
import { wantedAlertText } from '../src/ui/wantedReason.js';

const SEED = 4242;

test('seed 4242 the wanted alert names the clear time', () => {
  assert.equal(SEED, 4242);
  const heat = 0.2;
  const seconds = Math.ceil(heatClearSecondsForLevel(heatLevelFor(heat)));
  assert.ok(seconds > 0);
  const first = wantedAlertText(heat, '', false);
  const refresh = wantedAlertText(heat, ' · KILL', true);
  assert.equal(first, `WANTED · LAW ENFORCEMENT ACTIVE · clears in ${seconds}s`);
  assert.equal(refresh, `WANTED (LOW) · HUNTERS INBOUND · clears in ${seconds}s · KILL`);
  assert.equal(wantedAlertText(0, '', false).includes('clears in'), false);
  const hud = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
  assert.match(hud, /wantedAlertText\(v, reason, false\)/);
  assert.match(hud, /wantedAlertText\(v, reason, true\)/);
});
