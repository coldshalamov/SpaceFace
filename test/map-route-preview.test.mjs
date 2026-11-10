import test from 'node:test';
import assert from 'node:assert/strict';
import { computePreviewRoute, formatRoutePlanCost } from '../src/ui/map/routePreview.js';

test('route preview stays inside charted sectors except for the chosen endpoint', () => {
  const sectors = [
    { id: 'start', neighbors: ['charted', 'fog'] },
    { id: 'charted', neighbors: ['start', 'destination'] },
    { id: 'fog', neighbors: ['start', 'charted'] },
    { id: 'destination', neighbors: ['charted'] },
  ];
  const isCharted = (sector) => sector.id === 'start' || sector.id === 'charted';

  assert.deepEqual(computePreviewRoute(sectors, 'start', 'destination', isCharted), [
    'start', 'charted', 'destination',
  ]);
  assert.equal(computePreviewRoute(sectors, 'start', 'unknown', isCharted), null);
  assert.equal(computePreviewRoute(sectors, 'start', 'start', isCharted), null);
});

test('route cost uses reported owner cost and never invents fuel for a fallback path', () => {
  assert.equal(formatRoutePlanCost({ totalHops: 2, totalFuel: 18.6 }), '2 Jumps (Fuel: 19 Units)');
  assert.equal(formatRoutePlanCost({ legs: [{ fuel: 4 }, { fuel: 6 }] }), '2 Jumps (Fuel: 10 Units)');
  assert.equal(formatRoutePlanCost(null, ['start', 'charted']), '1 Jump (Fuel unavailable)');
  assert.equal(formatRoutePlanCost(null, ['start']), null);
});
