// Wave G8 — steady law is one badge. A change is one line, then the badge again.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LAW_LINE_TTL_S,
  lawChangeLine,
  visibleLawNodes,
  stepLawHud,
} from '../src/ui/sectorLawPresenter.js';

const helios = { sectorId: 'sector_helios', sectorName: 'Helios', level: 'HIGH SECURITY', levelKey: 'high' };
const sker = { sectorId: 'sector_sker_haven', sectorName: 'Sker Haven', level: 'LAWLESS', levelKey: 'lawless' };

test('G8 steady law renders one badge and a change reveals one line that retires', () => {
  const steady = stepLawHud(null, { type: 'steady', profile: helios }, 10);
  assert.deepEqual(visibleLawNodes(steady.mode), ['badge']);
  assert.equal(steady.badge, 'HIGH SECURITY');
  assert.equal(steady.line, '');

  const changed = stepLawHud(steady, { type: 'change', profile: sker }, 20);
  assert.deepEqual(visibleLawNodes(changed.mode), ['line']);
  assert.equal(changed.line, lawChangeLine(sker));
  assert.equal(changed.line, 'SKER HAVEN · LAWLESS');
  assert.doesNotMatch(changed.line, /patrol|jurisdiction|illegal/i);
  assert.equal(changed.hideAt, 20 + LAW_LINE_TTL_S);

  const retired = stepLawHud(changed, null, changed.hideAt);
  assert.deepEqual(visibleLawNodes(retired.mode), ['badge']);
  assert.equal(retired.badge, 'LAWLESS');
  assert.equal(retired.line, '');
});
