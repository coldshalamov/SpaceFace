import assert from 'node:assert/strict';
import test from 'node:test';
import { pdScreenPosition } from '../src/ai/pdScreen.js';

// FB-018 interception semantics (battery channel, authored chance/cadence, saturation) are pinned
// by fb-flak-interception.test.mjs against the shipped countermeasures implementation. This file
// keeps the pdScreen geometry case from the parallel draft of the same row.
test('FB-018: pdScreenPosition resolves escort screen position ahead of charge toward threat', () => {
  const charge = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const threat = { pos: { x: 500, z: 0 } };
  const pos = pdScreenPosition(charge, threat, 200);
  assert.ok(pos, 'screen position calculated');
  assert.ok(pos.x > 100 && pos.x <= 200, `pos.x should be toward threat: ${pos.x}`);
  assert.equal(Math.round(pos.z), 0);
});
