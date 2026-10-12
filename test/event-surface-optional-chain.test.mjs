import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { KNOWN_UNFORWARDED_BUS_EVENTS, MAIN_TO_SIM_BUS_EVENTS } from '../src/core/mainToSimEventSurface.js';

test('optional main-side racing receipt is classified without crossing back into the simulation', () => {
  const cwd = fileURLToPath(new URL('../', import.meta.url));
  const census = JSON.parse(execFileSync(process.execPath, ['scripts/lib/eventSurfaceCensus.mjs'], {
    cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  }));
  const armed = census.rows.find(row => row.type === 'race:armed');
  assert.ok(armed, 'optional bus call must remain visible to the census');
  assert.ok(armed.mainEmitters.includes('src/ui/racingLaunch.js'));
  assert.deepEqual(armed.simSubscribers, []);
  assert.equal(MAIN_TO_SIM_BUS_EVENTS.has('race:armed'), false);
  assert.equal(KNOWN_UNFORWARDED_BUS_EVENTS.has('race:armed'), true);
  assert.equal(MAIN_TO_SIM_BUS_EVENTS.has('game:new'), true, 'gameplay intents still cross the worker boundary');
  assert.equal(KNOWN_UNFORWARDED_BUS_EVENTS.has('game:started'), false, 'duplicate boot receipt remains an error');
});
