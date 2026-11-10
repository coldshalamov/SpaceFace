import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPresentPhaseClock,
  endPresentPhaseFrame,
  measurePresentPhase,
  presentPhaseReport,
} from '../src/render/presentPhaseTimers.js';

test('disabled clocks do not wrap the work in timers', () => {
  const clock = createPresentPhaseClock({ enabled: false, now: () => 0 });
  const result = measurePresentPhase(clock, 'present', () => 17);
  assert.equal(result, 17);
  assert.equal(clock.totals.present, 0);
});

test('enabled clocks name each present-path bill', () => {
  let t = 0;
  const clock = createPresentPhaseClock({ enabled: true, now: () => t });
  measurePresentPhase(clock, 'sim', () => { t += 4; });
  measurePresentPhase(clock, 'present', () => { t += 11; });
  measurePresentPhase(clock, 'ui', () => { t += 2; });
  const last = endPresentPhaseFrame(clock);
  assert.equal(last.sim, 4);
  assert.equal(last.present, 11);
  assert.equal(last.ui, 2);
  const report = presentPhaseReport(clock);
  assert.equal(report.frames, 1);
  assert.equal(report.averages.present, 11);
  assert.equal(report.averages.vfx, 0);
});
