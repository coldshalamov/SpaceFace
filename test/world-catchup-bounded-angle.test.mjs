import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { advanceWorldRecord, advanceWorldRecordInto, ballisticDrift } from '../src/world/worldCatchup.js';

test('ballistic catch-up keeps signed half-turn boundaries and ordinary drift', () => {
  for (const angle of [-Math.PI, Math.PI, -3 * Math.PI, 3 * Math.PI]) {
    const out = ballisticDrift({ x: 1, z: 2 }, { x: 3, z: -1 }, angle, 0, 2);
    assert.equal(out.rot, Math.sign(angle) * Math.PI);
    assert.deepEqual(out.pos, { x: 7, z: 0 });
  }
  const record = { alive: true, pos: { x: 1, z: 2 }, vel: { x: 3, z: -1 }, rot: 0.1, angVel: 0.2 };
  const copy = advanceWorldRecord(record, 0, 2.5);
  const into = advanceWorldRecordInto(structuredClone(record), 0, 2.5);
  assert.deepEqual(into, copy);
  assert.ok(Math.abs(copy.rot - 0.6) < 1e-12);
});

test('restored large finite rotations and long absences cannot freeze world catch-up', () => {
  const moduleUrl = new URL('../src/world/worldCatchup.js', import.meta.url).href;
  // The old subtraction loop makes no numeric progress at this magnitude. Run the real
  // owner in a separate process so a regressed Continue path fails instead of hanging CI.
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    const { ballisticDrift, advanceWorldRecord, advanceWorldRecordInto, advanceResourceBody } = await import(${JSON.stringify(moduleUrl)});
    for (const rot of [1e20, -1e20]) {
      const record = { alive: true, pos: { x: 1, z: 2 }, vel: { x: 3, z: -1 }, rot, angVel: 0 };
      const expected = rot % (Math.PI * 2);
      const normalized = expected > Math.PI ? expected - Math.PI * 2 : (expected < -Math.PI ? expected + Math.PI * 2 : expected);
      for (const out of [ballisticDrift(record.pos, record.vel, rot, 0, 1), advanceWorldRecord(record, 0, 1), advanceWorldRecordInto(structuredClone(record), 0, 1), advanceResourceBody(record, 0, 1)]) {
        assert.equal(out.rot, normalized);
        assert.ok(Number.isFinite(out.rot));
        assert.ok(Math.abs(out.rot) <= Math.PI);
      }
    }
    const yearsAway = ballisticDrift({ x: 0, z: 0 }, { x: 0, z: 0 }, 0, 2, 315360000);
    assert.ok(Number.isFinite(yearsAway.rot));
    assert.ok(Math.abs(yearsAway.rot) <= Math.PI);
  `], { timeout: 5000, encoding: 'utf8' });
  assert.equal(result.error, undefined, `world catch-up did not finish: ${result.error?.message || ''}`);
  assert.equal(result.status, 0, result.stderr);
});
