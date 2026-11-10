import assert from 'node:assert/strict';
import test from 'node:test';
import { placeChartLabels } from '../src/ui/orrery/chartLabels.js';

const candidates = [
  { id: 'station', kind: 'station', text: 'STATION', x: -64, y: -64, width: 30, height: 12, anchorRadius: 5 },
  { id: 'pin', kind: 'gate', text: 'PIN', x: -12, y: -64, width: 34, height: 12, anchorRadius: 5, selected: true },
];
const bounds = { x: -256, y: -256, width: 512, height: 512 };
const summary = (placements) => placements.map(({ id, x, y, side, visible, reason }) => ({ id, x, y, side, visible, reason }));

test('mark collisions across negative grid boundaries retain sides and ignore repeated membership', () => {
  const disc = { x: -28, y: -64, r: 8 };
  const env = { bounds, discs: [disc] };
  const input = structuredClone({ candidates, env });
  const expected = [
    { id: 'pin', x: -3, y: -70, side: 'right', visible: true, reason: undefined },
    { id: 'station', x: -103, y: -70, side: 'left', visible: true, reason: undefined },
  ];
  assert.deepEqual(summary(placeChartLabels(candidates, env)), expected);
  assert.deepEqual(summary(placeChartLabels(candidates, { ...env, discs: [disc, disc] })), expected);
  assert.deepEqual({ candidates, env }, input);
});

test('oversized marks retain collision and forced fallback in empty viewports', () => {
  const giant = { x: 0, y: 0, r: 1e7 };
  for (const viewport of [bounds, { x: 0, y: 0, width: 0, height: 0 }]) {
    const placements = placeChartLabels(candidates, { bounds: viewport, discs: [giant, giant] });
    assert.deepEqual(summary(placements), [
      { id: 'pin', x: -3, y: -70, side: 'right', visible: true, reason: undefined },
      { id: 'station', x: -64, y: -64, side: undefined, visible: false, reason: 'collision' },
    ]);
  }
});
