// Cross-sector wayfinding: the gate that starts the trip, instead of "ROUTE PENDING".
//
// A tracked objective in ANOTHER sector has no world fix, so the HUD arrow vanished and every
// instrument answered "ROUTE PENDING" — the pilot knew WHERE they were going and not one surface
// said WHICH WAY to fly. resolveObjectiveGatePresentation resolves the physical answer: the live
// gate in this sector that starts the shortest trip to the destination. These pins hold the
// resolver to the contract its consumers (HUD arrow, radar cue, tracker readings) rely on.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveCrossSectorGateFix,
  resolveObjectiveGatePresentation,
} from '../src/ui/navigationWaypoint.js';
import { SECTORS } from '../src/data/sectors.js';

const HELIOS = 'sector_helios_prime';
const TETHYS = 'sector_tethys_junction';

function sector(id) { return SECTORS.find((s) => s.id === id); }

function gateEntity(gateTo, pos = { x: 500, z: -250 }) {
  return { id: 'gate1', type: 'gate', alive: true, pos, data: { isGate: true, gateTo } };
}

function makeState({ currentSectorId = HELIOS, gates = [], missions = [], trackedId = null, waypoint = null } = {}) {
  return {
    world: { currentSectorId },
    entityList: gates.slice(),
    missions: { active: missions },
    ui: { trackedMissionId: trackedId },
    nav: { waypoint },
  };
}

const HELIOS_NEIGHBOURS = new Set(sector(HELIOS).neighbors);

test('a neighbouring destination resolves to that hop, at the live gate entity', () => {
  assert.ok(HELIOS_NEIGHBOURS.has(TETHYS), 'fixture sanity: Tethys borders Helios in the authored graph');
  const fix = resolveObjectiveGatePresentation(makeState({
    missions: [{ id: 'm1', status: 'active', title: 'Deliver', destSectorId: TETHYS }],
    trackedId: 'm1',
    gates: [gateEntity(TETHYS)],
  }));
  assert.ok(fix, 'a cross-sector objective must resolve a fix');
  assert.equal(fix.sectorId, TETHYS);
  assert.equal(fix.destSectorId, TETHYS);
  assert.deepEqual(fix.pos, { x: 500, z: -250 }, 'the fix points at the physical gate entity');
  assert.equal(fix.label, 'Gate → Tethys Junction');
});

test('a destination two hops away resolves to the FIRST hop only', () => {
  // Pick any sector that borders Helios but is NOT the destination itself, and route to one of
  // ITS neighbours that Helios does not border — the fix must name the first gate, not the last.
  const far = SECTORS.find((s) => s.id !== HELIOS && !HELIOS_NEIGHBOURS.has(s.id)
    && (s.neighbors || []).some((nb) => HELIOS_NEIGHBOURS.has(nb)));
  assert.ok(far, 'fixture sanity: the graph has a two-hop sector from Helios');
  const through = (far.neighbors || []).find((nb) => HELIOS_NEIGHBOURS.has(nb));
  const fix = resolveObjectiveGatePresentation(makeState({
    missions: [{ id: 'm1', status: 'active', destSectorId: far.id }],
    trackedId: 'm1',
    gates: [gateEntity(through)],
  }));
  assert.equal(fix.sectorId, through, 'the fix is the first hop, not the destination');
  assert.equal(fix.destSectorId, far.id);
});

test('no live gate entity: the hop and label still resolve, with pos honestly null', () => {
  const fix = resolveObjectiveGatePresentation(makeState({
    missions: [{ id: 'm1', status: 'active', destSectorId: TETHYS }],
    trackedId: 'm1',
    gates: [],
  }));
  assert.ok(fix);
  assert.equal(fix.sectorId, TETHYS);
  assert.equal(fix.pos, null, 'no gate entity — the caller says so in words instead of pointing');
  assert.match(fix.label, /^Gate → /);
});

test('a dead or foreign gate entity binds nothing', () => {
  const fix = resolveObjectiveGatePresentation(makeState({
    missions: [{ id: 'm1', status: 'active', destSectorId: TETHYS }],
    trackedId: 'm1',
    gates: [
      { id: 'g1', alive: false, pos: { x: 1, z: 1 }, data: { isGate: true, gateTo: TETHYS } },
      { id: 'g2', alive: true, pos: { x: 2, z: 2 }, data: { isGate: true, gateTo: 'sector_ceres_belt' } },
    ],
  }));
  assert.ok(fix);
  assert.equal(fix.pos, null);
});

test('same-sector destination, untracked missions, and no missions all resolve to null', () => {
  const mission = { id: 'm1', status: 'active', destSectorId: HELIOS };
  assert.equal(resolveObjectiveGatePresentation(makeState({
    missions: [mission], trackedId: 'm1',
  })), null, 'a destination in this sector is not a gate trip');

  assert.equal(resolveObjectiveGatePresentation(makeState({})), null, 'nothing tracked, nothing to resolve');
});

test('a waypoint with a live fix wins — the ordinary instruments own that case', () => {
  const state = makeState({
    missions: [{ id: 'm1', status: 'active', destSectorId: TETHYS }],
    trackedId: 'm1',
    gates: [gateEntity(TETHYS)],
    waypoint: { kind: 'local', label: 'Rock', pos: { x: 10, z: 10 } },
  });
  assert.equal(resolveObjectiveGatePresentation(state), null);
});

test('a posless cross-sector waypoint still gets the gate fix (the old dead end)', () => {
  const state = makeState({
    missions: [{ id: 'm1', status: 'active', destSectorId: TETHYS }],
    trackedId: 'm1',
    gates: [gateEntity(TETHYS)],
    waypoint: { kind: 'mission', missionId: 'm1', label: 'Deliver', pos: null, sectorId: TETHYS },
  });
  const fix = resolveObjectiveGatePresentation(state);
  assert.ok(fix, 'the posless waypoint is exactly the case this fix exists for');
  assert.deepEqual(fix.pos, { x: 500, z: -250 });
});

test('the tracked mission outranks the first active mission when both have destinations', () => {
  const fix = resolveObjectiveGatePresentation(makeState({
    missions: [
      { id: 'm_other', status: 'active', destSectorId: 'sector_ceres_belt' },
      { id: 'm1', status: 'active', destSectorId: TETHYS },
    ],
    trackedId: 'm1',
    gates: [gateEntity(TETHYS), gateEntity('sector_ceres_belt', { x: -5, z: -5 })],
  }));
  assert.equal(fix.sectorId, TETHYS, 'tracking is the pilot statement of intent — it leads');
});

test('unreachable destinations resolve to null rather than pointing somewhere wrong', () => {
  const fix = resolveCrossSectorGateFix(
    makeState({ currentSectorId: HELIOS }), HELIOS,
  );
  assert.equal(fix, null);
});
