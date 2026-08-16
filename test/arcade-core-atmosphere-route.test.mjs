import assert from 'node:assert/strict';
import test from 'node:test';

import { FIELD_FLAGS } from '../src/data/fields.js';
import { PLANET_FLAGS } from '../src/data/planets.js';
import {
  ATMOSPHERE_REFERENCE_ENTRY_VELOCITIES,
  runArcadeCoreAtmosphereRoute,
} from '../src/testing/metrics/arcadeCoreAtmosphereRoute.js';

test('Plan 09 atmosphere matrix records real escape-vs-burn outcomes at each entry velocity', async () => {
  const priorPlanet = PLANET_FLAGS.enabled;
  const priorFields = FIELD_FLAGS.enabled;
  PLANET_FLAGS.enabled = false;
  FIELD_FLAGS.enabled = false;
  try {
    const receipt = await runArcadeCoreAtmosphereRoute({ seed: 0xac0913 });
    assert.equal(receipt.route, 'market-atmosphere');
    assert.equal(receipt.family, 'atmosphere');
    assert.deepEqual(receipt.referenceEntryVelocities, ATMOSPHERE_REFERENCE_ENTRY_VELOCITIES);
    assert.equal(receipt.cases.length, ATMOSPHERE_REFERENCE_ENTRY_VELOCITIES.length * 2);

    const rows = new Map(receipt.cases.map((entry) => [
      `${entry.control}:${entry.entryVelocity}`,
      entry,
    ]));
    for (const control of ['full-burn', 'uncontrolled']) {
      for (const entryVelocity of ATMOSPHERE_REFERENCE_ENTRY_VELOCITIES) {
        const row = rows.get(`${control}:${entryVelocity}`);
        assert.ok(row, `${control} at ${entryVelocity} WU/s is present`);
        assert.ok(row.outcome === 'escape' || row.outcome === 'burn', 'the production route reaches a terminal outcome');
        assert.equal(row.fixedDt, 1 / 60);
        assert.equal(row.physicsBackend, 'rapier-dynamic');
        assert.equal(row.stages[0], 'skim');
        assert.ok(row.stages.includes('commit'), 'the real plunge state machine was entered');
        assert.ok(Number.isFinite(row.minRadius) && Number.isFinite(row.finalRadius));
      }
    }

    const controlled = receipt.cases.filter((entry) => entry.control === 'full-burn');
    const uncontrolled = receipt.cases.filter((entry) => entry.control === 'uncontrolled');
    assert.ok(controlled.some((entry) => entry.outcome === 'escape'), 'an authored recovery burn can produce an actual escape');
    assert.ok(uncontrolled.every((entry) => entry.outcome === 'burn'), 'every uncontrolled reference entry burns');

    for (const row of uncontrolled) {
      assert.ok(row.burnS >= 3 && row.burnS <= 6,
        `${row.entryVelocity} WU/s uncontrolled entry burns in the authored 3-6s show (${row.burnS}s)`);
      assert.ok(row.damageWindowS > 0 && row.damagePackets > 0);
      assert.ok(row.stages.includes('breakup') && row.stages.includes('descent') && row.stages.includes('aftermath'));
      const assisted = rows.get(`full-burn:${row.entryVelocity}`);
      assert.ok(assisted.minRadius > row.minRadius,
        `outward control materially changes the ${row.entryVelocity} WU/s physical trajectory`);
    }

    assert.deepEqual(receipt.uncontrolledBurnTimesS, uncontrolled.map((entry) => ({
      entryVelocity: entry.entryVelocity,
      outcome: entry.outcome,
      burnS: entry.burnS,
    })));
  } finally {
    assert.equal(PLANET_FLAGS.enabled, false, 'the route restores the caller planet flag');
    assert.equal(FIELD_FLAGS.enabled, false, 'the route restores the caller field flag');
    PLANET_FLAGS.enabled = priorPlanet;
    FIELD_FLAGS.enabled = priorFields;
  }
});

test('Plan 09 atmosphere route is deterministic for the same seed and velocity', async () => {
  const options = { seed: 0xac0921, entryVelocities: [60] };
  const first = await runArcadeCoreAtmosphereRoute(options);
  const second = await runArcadeCoreAtmosphereRoute(options);
  assert.deepEqual(second, first);
});
