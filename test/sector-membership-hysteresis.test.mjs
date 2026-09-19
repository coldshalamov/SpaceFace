// Free-flight membership hysteresis. The Voronoi membership test is a knife edge; a player
// patrolling rocks on a border used to flip residency every oscillation (measured: 38 continuous
// enter/exits in one hour). The switch now requires a committed lead + a dwell. Real corridor
// geometry, stubbed enterSector, no materialization.

import assert from 'node:assert/strict';
import test from 'node:test';

import { world } from '../src/systems/world.js';
import {
  CORRIDOR_SECTOR_IDS,
  SECTOR_GLOBAL_ORIGINS,
  sectorGlobalOrigin,
  sectorMembershipAtGlobal,
} from '../src/data/sectorCoordinates.js';

const LEAD_WU = 150;
const DWELL_S = 8;

function originsPair() {
  // Two corridor sectors whose origins are nearest neighbors of each other.
  const ids = CORRIDOR_SECTOR_IDS.slice().sort();
  let best = null;
  for (const a of ids) {
    const oa = sectorGlobalOrigin(a);
    if (!oa) continue;
    for (const b of ids) {
      if (a >= b) continue;
      const ob = sectorGlobalOrigin(b);
      if (!ob) continue;
      const d = Math.hypot(ob.x - oa.x, ob.z - oa.z);
      if (!best || d < best.d) best = { a, b, oa, ob, d };
    }
  }
  assert.ok(best, 'corridor must contain at least two sector origins');
  return best;
}

function makeHarness({ current, probe }) {
  const pair = originsPair();
  const { a, b, oa, ob, d } = pair;
  const from = current === b ? b : a;
  const to = from === a ? b : a;
  const ofrom = from === a ? oa : ob;
  const oto = from === a ? ob : oa;
  const ux = (oto.x - ofrom.x) / d;
  const uz = (oto.z - ofrom.z) / d;
  // The bisector sits at distance d/2 from each origin; the lead commitment point is where
  // (d/2 - x)^2 + LEAD^2 <= (d/2 + x)^2, i.e. x >= LEAD^2 / (2d) past the midpoint.
  const commit = (LEAD_WU * LEAD_WU) / (2 * d);
  const posAt = (offset) => ({ x: ofrom.x + ux * (d / 2 + offset), z: ofrom.z + uz * (d / 2 + offset) });
  const state = {
    mode: 'flight',
    jump: null,
    playerId: 1,
    simTime: 0,
    entities: new Map([[1, { id: 1, alive: true, pos: posAt(probe), vel: { x: 0, z: 0 } }]]),
    world: { currentSectorId: from },
  };
  const calls = [];
  const w = Object.create(world);
  w._membershipCandidate = null;
  w.enterSector = (sectorId, opts) => {
    calls.push({ sectorId, opts });
    state.world.currentSectorId = sectorId;   // the real enterSector's membership contract
    return {};
  };
  function tickAt(simTime, offset) {
    const p = state.entities.get(1);
    const g = posAt(offset);
    p.pos.x = g.x;
    p.pos.z = g.z;
    state.simTime = simTime;
    w._tickResidency(state);
  }
  return { state, w, calls, from, to, commit, posAt, tickAt, pair };
}

test('membership holds deep inside the current cell', () => {
  const h = makeHarness({ probe: -800 });
  h.tickAt(0, -800);
  h.tickAt(60, -800);
  assert.equal(h.state.world.currentSectorId, h.from);
  assert.equal(h.calls.length, 0);
});

test('a graze across the bisector does not flip membership', () => {
  const h = makeHarness({ probe: 0 });
  // Oscillate ±40 WU around the edge (well inside the 150 WU lead) for a full patrol hour.
  for (let s = 0; s <= 3600; s += 2) h.tickAt(s, (s % 4 === 0) ? 40 : -40);
  assert.equal(h.state.world.currentSectorId, h.from, 'patrol on the border never flips');
  assert.equal(h.calls.length, 0, 'no residency plan re-runs on a border graze');
});

test('a committed crossing flips exactly once, after the dwell', () => {
  const h = makeHarness({ probe: 0 });
  const offset = h.commit + 60;
  h.tickAt(0, offset);
  assert.equal(h.state.world.currentSectorId, h.from, 'candidate armed, no flip yet');
  h.tickAt(4, offset);
  assert.equal(h.calls.length, 0, 'no flip before the dwell elapses');
  h.tickAt(8.5, offset);
  assert.equal(h.calls.length, 1, 'one flip after the dwell');
  assert.equal(h.calls[0].sectorId, h.to);
  assert.equal(h.calls[0].opts.continuous, true, 'free-flight handoff stays continuous');
  assert.equal(h.state.world.currentSectorId, h.to);
  h.tickAt(60, offset);
  assert.equal(h.calls.length, 1, 'no repeat flips while the pose holds');
});

test('a lead that lapses resets the dwell', () => {
  const h = makeHarness({ probe: 0 });
  const offset = h.commit + 60;
  h.tickAt(0, offset);
  h.tickAt(6, offset);
  h.tickAt(7, -offset);     // back across the bisector: the lead lapses
  h.tickAt(20, -offset);    // dwelling on the wrong side never flips
  assert.equal(h.calls.length, 0);
  h.tickAt(21, offset);     // fresh commitment restarts the dwell
  assert.equal(h.calls.length, 0, 'lapsed lead must not bank the old dwell');
  h.tickAt(29.5, offset);
  assert.equal(h.calls.length, 1, 'flip only after the restarted dwell');
});
