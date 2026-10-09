import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const moduleUrl = new URL('../src/systems/gamepad.js', import.meta.url).href;

for (const method of ['playEffect', 'pulse', 'reset']) {
  test(`a rejected gamepad ${method} promise does not escape into the runtime`, () => {
    // Node's test runner marks even locally observed unhandled rejections as failures. Isolate
    // the browser API simulation so this pins the actual async outcome, not a catch-call count.
    const source = `
      import { createGamepad } from ${JSON.stringify(moduleUrl)};
      process.on('unhandledRejection', (error) => {
        console.error('unhandled haptic rejection:', error.message);
        process.exitCode = 1;
      });
      const actuator = {
        ${method}: () => Promise.reject(new Error('controller disconnected')),
      };
      const gp = createGamepad({ bus: { emit() {} } });
      const pad = { vibrationActuator: actuator };
      gp._applyHaptics(pad, { enabled: true, strong: 0.6, weak: 0.2 });
      gp._applyHaptics(pad, { enabled: false, strong: 0, weak: 0 });
      await new Promise((resolve) => setImmediate(resolve));
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
      encoding: 'utf8', windowsHide: true, timeout: 15000,
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  });
}
