// INF-instrument (seed 4242) — the scan ping is an answer, not a decoration.
//
// The local map draws the scanner's unresolved-contact ping and names it in its legend, but the
// mark used to join neither the click targets nor the label pass: clicking the "?" snapped to an
// overlapping rock or dropped an anonymous "Map fix" course. The ping now rides the map's own
// grammar — pingOverlayMarks builds the standard target (kind 'ping', named course, contact-tier
// priority), and the existing pickClickTarget / placeMapLabels machinery resolves a click on it
// the way the player sees the map.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PING_COURSE_LABEL,
  labelPriority,
  pickClickTarget,
  placeMapLabels,
  pingOverlayMarks,
} from '../src/ui/screens/localmap.js';

const SEED = 4242;

// Screen projection halves world units — same shape the real wx/wz closures have.
const wx = (x) => x / 2;
const wz = (z) => z / 2;

function seedState() {
  return {
    meta: { seed: SEED },
    simTime: 1200,
    world: {
      currentSectorId: 'helios',
      scanPings: {
        helios: [
          { id: 'signal:4242-a', pos: { x: 1800, z: -700 }, kind: 'unknown' },
          { id: 'signal:4242-b', pos: { x: -420, z: 260 }, kind: 'unknown' },
        ],
        ceres: [{ id: 'signal:4242-offsector', pos: { x: 0, z: 0 }, kind: 'unknown' }],
      },
    },
  };
}

test('seed 4242: every ping of the CURRENT sector becomes a named courseable mark', () => {
  const marks = pingOverlayMarks(seedState(), wx, wz);
  assert.equal(marks.length, 2, 'the off-sector bucket is never drawn here');
  const mark = marks[0];
  assert.equal(mark.x, 900);
  assert.equal(mark.y, -350);
  assert.equal(mark.target.kind, 'ping');
  assert.equal(mark.target.label, PING_COURSE_LABEL);
  assert.equal(mark.target.label, 'Unresolved contact');
  assert.equal(mark.target.targetEntityId, 'signal:4242-a');
  assert.deepEqual(mark.target.pos, { x: 1800, z: -700 });
  assert.equal(mark.target.arrivalRadius, 44, 'arrive close enough to re-pulse, not on top of it');
  assert.equal(mark.target.priority, labelPriority('ping'));
});

test('seed 4242: the ping label yields to stations but outranks asteroid dots', () => {
  const state = seedState();
  const marks = pingOverlayMarks(state, wx, wz);
  const pingJob = { ...marks[0].target, x: marks[0].x, y: marks[0].y, dx: 10, text: marks[0].target.label };
  const measure = (text) => String(text).length * 6;

  // Room to itself: the ping is named on the map.
  const alone = placeMapLabels([pingJob], measure);
  assert.ok(alone[0], 'an uncontested ping carries its name');

  // A station label claims the same spot: the permanent landmark wins, the ping stays a mark
  // (its marker circle still catches the click).
  const stationJob = { x: marks[0].x + 2, y: marks[0].y, dx: 8, text: 'Helios Dock', font: 'f', priority: labelPriority('station') };
  const contested = placeMapLabels([stationJob, pingJob], measure);
  assert.ok(contested[0], 'the station keeps the shared spot');
  assert.equal(contested[1], null, 'the ping label yields instead of stacking');
});

test('seed 4242: clicking the "?" sets course to the ping, not the rock under it', () => {
  const state = seedState();
  const marks = pingOverlayMarks(state, wx, wz);
  const ping = marks[0].target;
  // A belt rock one rock-radius away from the ping mark, plus a station further off:
  // the click lands inside all three circles on a dense belt.
  const rock = {
    sx: ping.sx + 8, sy: ping.sy, radiusPx: 12, targetEntityId: 'rock-1',
    pos: { x: 1832, z: -700 }, label: 'rock-1', kind: 'asteroid',
    arrivalRadius: 64, priority: labelPriority('asteroid'),
  };
  const dock = {
    sx: ping.sx + 30, sy: ping.sy, radiusPx: 18, targetEntityId: 'dock-1',
    pos: { x: 1860, z: -700 }, label: 'Helios Dock', kind: 'station',
    arrivalRadius: 90, priority: labelPriority('station'),
  };
  // Inside the ping AND the rock, nearer the rock's center: the ping (contact tier) outranks
  // the asteroid (never a navigation answer over the sweep's own fix).
  const picked = pickClickTarget([rock, ping], ping.sx + 4, ping.sy);
  assert.equal(picked.targetEntityId, 'signal:4242-a', 'the click resolves to the ping');
  assert.equal(picked.label, 'Unresolved contact', 'the course and toast name the answer');
  assert.equal(picked.kind, 'ping', "the waypoint carries the ping's own kind");

  // The station still outranks the ping where both circles overlap — permanent landmark first,
  // consistent with the map's documented tier order.
  assert.equal(pickClickTarget([ping, dock], ping.sx + 14, ping.sy).targetEntityId, 'dock-1');
});

test('degenerate state fails closed: no bucket, empty bucket, headless ping', () => {
  assert.deepEqual(pingOverlayMarks(null, wx, wz), []);
  assert.deepEqual(pingOverlayMarks({ world: { currentSectorId: 'helios' } }, wx, wz), []);
  assert.deepEqual(pingOverlayMarks({ world: { currentSectorId: 'helios', scanPings: { helios: [] } } }, wx, wz), []);
  assert.deepEqual(
    pingOverlayMarks({ world: { currentSectorId: 'helios', scanPings: { helios: [{ id: 'x' }, null] } } }, wx, wz),
    [],
    'a ping without a position draws and routes nothing',
  );
});
