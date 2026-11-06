import assert from 'node:assert/strict';
import test from 'node:test';

import { RendererInfoMonitor } from '../src/testing/perf/rendererInfoMonitor.js';

test('first sampled program after an empty warmup baseline is reported as a late compile', () => {
  const monitor = new RendererInfoMonitor();
  monitor.enable();
  monitor.markWarmupComplete(0);

  const frame = monitor.sample({
    info: {
      render: { calls: 1 },
      memory: { geometries: 1, textures: 0 },
      programs: [{}],
    },
  }, 0.02);

  assert.equal(frame.programs, 1);
  assert.equal(monitor.anomalies.length, 1);
  assert.equal(monitor.anomalies[0].type, 'mid_flight_shader_compilation');
  assert.equal(monitor.anomalies[0].newPrograms, 1);
});

test('programs present at the warmup baseline do not create a false late-compile warning', () => {
  const monitor = new RendererInfoMonitor();
  monitor.enable();
  monitor.markWarmupComplete(3);
  monitor.sample({ info: { render: {}, memory: {}, programs: [{}, {}, {}] } });

  assert.equal(monitor.anomalies.length, 0);
});
