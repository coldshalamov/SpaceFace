import assert from 'node:assert/strict';
import test from 'node:test';

import { yieldToNextPresent } from '../src/render/startupGpuResidency.js';

test('next-present yield resumes in a macrotask after the requested frame callback', async () => {
  const timeline = [];
  const frames = [];
  const tasks = [];
  let resumed = false;

  const pending = yieldToNextPresent({
    requestFrame(callback) {
      timeline.push('request-frame');
      frames.push(callback);
    },
    scheduleTask(callback) {
      timeline.push('schedule-task');
      tasks.push(callback);
    },
  }).then(() => {
    resumed = true;
    timeline.push('resumed');
  });

  assert.deepEqual(timeline, ['request-frame']);
  frames.shift()();
  await Promise.resolve();
  assert.equal(resumed, false, 'the rAF callback itself cannot resume GPU work');
  assert.deepEqual(timeline, ['request-frame', 'schedule-task']);

  tasks.shift()();
  await pending;
  assert.equal(resumed, true);
  assert.deepEqual(timeline, ['request-frame', 'schedule-task', 'resumed']);
});
