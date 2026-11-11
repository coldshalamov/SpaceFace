// Review 2026-11-11 (HIGH): "Keep going" is clicked on the main thread and handled by the run owner in
// the simulation worker. The click only works if the event is in the main→sim forward set.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAIN_TO_SIM_BUS_EVENTS } from '../src/core/mainToSimEventSurface.js';

test('the Keep going request crosses the main→worker boundary', () => {
  assert.ok(MAIN_TO_SIM_BUS_EVENTS.has('run:swarmDeepRequested'));
});
