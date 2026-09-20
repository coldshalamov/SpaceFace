// INF-054 — the local map's dense-cluster grammar. Labels place greedily in priority order
// (objective → stations/gates → hostiles → ships; asteroids never label), placement is stable
// for the same world state, and click resolution shares that priority so a click picks the
// candidate the player can see instead of a hidden overlapping hit circle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { labelPriority, placeMapLabels, pickClickTarget } from '../src/ui/screens/localmap.js';

// Monospace-ish measure: 6px per character, enough for overlap arithmetic.
const measure = (text) => String(text).length * 6;

test('the objective label claims its spot; a colliding station label yields', () => {
  const jobs = [
    { x: 400, y: 300, dx: 8, text: 'Ceres Dock', font: 'f', priority: labelPriority('station') },
    { x: 402, y: 302, dx: 12, text: 'Objective', font: 'f', priority: labelPriority('waypoint') },
  ];
  const rects = placeMapLabels(jobs, measure);
  assert.ok(rects[1], 'the objective diamond label is always placed');
  assert.equal(rects[0], null, 'the colliding station label is suppressed, not stacked');
});

test('placement is priority-ordered AND stable within a tier, and reflows as room appears', () => {
  // Two same-tier hostiles at overlapping spots: first drawn wins, every time.
  const two = [
    { x: 100, y: 100, dx: 8, text: 'Raider A', font: 'f', priority: labelPriority('contact', true) },
    { x: 104, y: 100, dx: 8, text: 'Raider B', font: 'f', priority: labelPriority('contact', true) },
  ];
  assert.deepEqual(
    placeMapLabels(two, measure).map((r) => !!r),
    [true, false],
    'first drawn (the model sorts hostiles by threat then distance then id) keeps the label',
  );

  // Zoom in (markers spread): both fit, and the SAME input order is kept.
  const spread = [
    { x: 100, y: 100, dx: 8, text: 'Raider A', font: 'f', priority: labelPriority('contact', true) },
    { x: 300, y: 100, dx: 8, text: 'Raider B', font: 'f', priority: labelPriority('contact', true) },
  ];
  const spreadRects = placeMapLabels(spread, measure);
  assert.ok(spreadRects[0] && spreadRects[1], 'room for both at the tested zoom');
  assert.equal(spreadRects[0].x < spreadRects[1].x, true, 'stable left-to-right placement');

  // Determinism: identical input, identical output.
  assert.deepEqual(placeMapLabels(spread, measure), spreadRects);
});

test('asteroids never take labels; higher priority wins regardless of draw order', () => {
  const jobs = [
    { x: 200, y: 200, dx: 8, text: 'ast belt rock', font: 'f', priority: labelPriority('asteroid') },
    { x: 203, y: 200, dx: 8, text: 'Helios Gate', font: 'f', priority: labelPriority('gate') },
  ];
  const rects = placeMapLabels(jobs, measure);
  assert.ok(rects[1], 'the gate outranks the rock and claims the shared spot');
  assert.equal(rects[0], null);
});

function target(id, sx, sy, radius, priority, labelRect) {
  const t = { targetEntityId: id, sx, sy, radiusPx: radius, label: id };
  if (priority != null) t.priority = priority;
  if (labelRect) t.labelRect = labelRect;
  return t;
}

test('a click between an overlapping station and asteroid picks the station', () => {
  // Station at (400,300) r18, rock at (415,300) r12 — the click at 412 is inside BOTH circles
  // and nearer the rock's center. The old nearest-center rule grabbed the rock.
  const targets = [
    target('rock', 415, 300, 12, labelPriority('asteroid')),
    target('dock', 400, 300, 18, labelPriority('station')),
  ];
  const picked = pickClickTarget(targets, 412, 300);
  assert.equal(picked.targetEntityId, 'dock', 'the station outranks the rock');
});

test('clicking a displayed label selects its owner even outside the marker circle', () => {
  // The objective label text sits at x 412..472; the waypoint marker is 20px at (400,300) —
  // the click at (450,300) is on the NAME, not the diamond.
  const waypoint = target('waypoint', 400, 300, 20, labelPriority('waypoint'), { x: 412, y: 292, w: 60, h: 16 });
  const rock = target('rock', 470, 300, 12, labelPriority('asteroid'));
  const picked = pickClickTarget([waypoint, rock], 450, 300);
  assert.equal(picked.targetEntityId, 'waypoint', 'the displayed name is a click surface');

  // A SUPPRESSED label carries no rect and cannot catch clicks.
  const hidden = target('ghost-label', 600, 400, 12, labelPriority('asteroid'));
  const far = pickClickTarget([hidden], 630, 400);
  assert.equal(far, null, 'a hidden overlapping label never wins a click');
});

test('equal-priority candidates resolve by nearest center, and bare targets still hit', () => {
  const a = target('a', 400, 300, 16, labelPriority('contact'));
  const b = target('b', 408, 300, 16, labelPriority('contact'));
  assert.equal(pickClickTarget([a, b], 407, 300).targetEntityId, 'b');
  // Legacy targets without a priority field (defensive default) still resolve.
  assert.equal(pickClickTarget([target('x', 400, 300, 16)], 400, 300).targetEntityId, 'x');
  assert.equal(pickClickTarget([], 400, 300), null);
});
