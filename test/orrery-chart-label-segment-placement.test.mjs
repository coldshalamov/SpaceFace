import assert from 'node:assert/strict';
import test from 'node:test';

import { placeChartLabels } from '../src/ui/orrery/chartLabels.js';

const candidate = [{ id: 'x', x: 100, y: 100, anchorRadius: 2, width: 20, height: 12, text: 'X' }];
const bounds = { x: 0, y: 0, width: 300, height: 300 };

test('chart label segment collision costs preserve the nearest clear seat', () => {
  const crossing = placeChartLabels(candidate, {
    bounds,
    segments: [{ x1: 125, y1: 90, x2: 125, y2: 115 }],
  });
  assert.deepEqual(
    { side: crossing[0].side, x: crossing[0].x, y: crossing[0].y, visible: crossing[0].visible },
    { side: 'left', x: 74, y: 94, visible: true },
  );

  const remote = placeChartLabels(candidate, {
    bounds,
    segments: [{ x1: 200, y1: 200, x2: 240, y2: 240 }],
  });
  assert.deepEqual(
    { side: remote[0].side, x: remote[0].x, y: remote[0].y, visible: remote[0].visible },
    { side: 'right', x: 106, y: 94, visible: true },
  );
});

test('chart label segment clipping rejects corner-near misses and retains touches', () => {
  const edgeCandidate = [{ id: 'edge', x: -6, y: 5, anchorRadius: 2, width: 10, height: 10, text: 'X' }];
  const edgeBounds = { x: -50, y: -50, width: 100, height: 100 };
  const misses = [
    { x1: -5, y1: 4, x2: 5, y2: -6 },
    { x1: 5, y1: -6, x2: -5, y2: 4 },
  ];
  for (const segment of misses) {
    const [placed] = placeChartLabels(edgeCandidate, { bounds: edgeBounds, segments: [segment] });
    assert.equal(placed.side, 'right', 'a bounding-box overlap without segment intersection does not add route cost');
  }

  const touches = [
    { x1: -5, y1: 5, x2: 5, y2: -5 },
    { x1: 0, y1: 0, x2: 0, y2: 0 },
  ];
  for (const segment of touches) {
    const [placed] = placeChartLabels(edgeCandidate, { bounds: edgeBounds, segments: [segment] });
    assert.equal(placed.side, 'left', 'a corner or point touch retains segment collision cost');
  }
});
