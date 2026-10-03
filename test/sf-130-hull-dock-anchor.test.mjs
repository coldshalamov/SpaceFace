// SF-130 — a hull upgrade changes route geometry through real collision truth.
//
// The berth pocket of every manifest station is bounded by the station's OWN resolved
// collision primitives (measured GLB skins). A hull whose planar envelope — the same measured
// bound the live collider uses — cannot clear the pocket by the authored margin may not take
// the deck berth: it moors at a standoff on the corridor axis, outside all structure, where
// the identical dock:range gate still fires the public dock prompt. The consequence and the
// return path are both pure geometry: bigger hulls lose tight berths; they never lose docking.
//
// This file pins the owning seams:
//   - manifest math: berthClearanceWu / berthFitsHull / resolveDockAnchor (data owner)
//   - the public dock prompt: physics.updateDockRange resolves the hull's own anchor
//   - the flight computer: resolveAutopilotTarget finishes at the mooring anchor
//   - the corridor tug: dockingCorridor withholds capture assist from a hull that cannot
//     take the berth it pulls toward

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COLLISION_PROXY_MANIFESTS,
  berthClearanceWu,
  berthFitsHull,
  hullEnvelopeWu,
  proxyOuterRadiusWu,
  resolveCollisionProxyManifest,
  resolveCorridorAxisWorld,
  resolveDockAnchor,
} from '../src/data/collisionProxyManifests.js';
import { dockingCorridor } from '../src/systems/dockingCorridor.js';
import { resolveAutopilotTarget } from '../src/systems/flightV3.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { physics } from '../src/core/physics.js';

const EPS = 1e-9;

/** Live-style station fixture: origin, rot 0, measured-skin archetype, R = dockRadius. */
function station(glb = 'place_station_mining', R = 90, id = 'st1') {
  return {
    id,
    type: 'station',
    alive: true,
    pos: { x: 0, z: 0 },
    rot: 0,
    radius: R === 90 ? 42 : R === 72 ? 34 : 26,
    data: {
      stationId: 'station_' + glb.replace('place_station_', ''),
      dockRadius: R,
      collisionProxy: 'station_ring_hub',
      archetypeGlb: glb,
    },
  };
}

/** Hull fixture: the measured defId resolves the same planar envelope the live collider uses. */
function hull(defId, radius, pos = { x: 0, z: 0 }) {
  return {
    id: 'player',
    type: 'ship',
    alive: true,
    radius,
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    physicsBody: { mass: 10 },
    data: { defId },
  };
}

const LEVIATHAN = { defId: 'ship_leviathan', radius: 45 };
const COLOSSUS = { defId: 'ship_colossus', radius: 32 };
const ATLAS = { defId: 'ship_atlas', radius: 30 };
const IRONBACK = { defId: 'ship_ironback', radius: 24 };
const MULE = { defId: 'ship_mule', radius: 18 };
const KESTREL = { defId: 'ship_kestrel', radius: 14 };

function manifestAt(glb, R = 90) {
  const st = station(glb, R);
  return { st, manifest: resolveCollisionProxyManifest(st) };
}

// ---------------------------------------------------------------------------------------------
// geometry: measured envelopes, pocket clearances, fit matrix
// ---------------------------------------------------------------------------------------------

test('hull envelope is the measured planar bound, with radius as the unmeasured fallback', () => {
  // Measured skins are tighter than the authored radius bound — the same skin the live
  // compound collider registers. These are real GLB measurements, not tuned numbers.
  assert.ok(Math.abs(hullEnvelopeWu(hull('ship_kestrel', 14)) - 12.52) < 0.1);
  assert.ok(Math.abs(hullEnvelopeWu(hull('ship_ironback', 24)) - 21.28) < 0.1);
  assert.ok(Math.abs(hullEnvelopeWu(hull('ship_colossus', 32)) - 28.71) < 0.1);
  assert.ok(Math.abs(hullEnvelopeWu(hull('ship_leviathan', 45)) - 39.38) < 0.1);
  // No measured row → the collider radius itself is the envelope.
  assert.equal(hullEnvelopeWu({ type: 'ship', radius: 50 }), 50);
  assert.equal(hullEnvelopeWu(null), 0);
});

test('berth pocket clearance is measured from the resolved skin primitives', () => {
  // The open trade hub leaves ~54 wu of deck room at L; dense working stations tighten to
  // ~32; a blackmarket hull sits between. Same normalized geometry scales with dockRadius.
  const cases = [
    ['place_station_trade_hub', 54.2],
    ['place_station_blackmarket', 39.3],
    ['place_station_military', 33.1],
    ['place_station_fab', 32.1],
    ['place_station_mining', 32.0],
    ['place_station_refinery', 31.9],
    ['place_station_research', 31.9],
  ];
  for (const [glb, expected] of cases) {
    const { st, manifest } = manifestAt(glb, 90);
    const clearance = berthClearanceWu(manifest, st);
    assert.ok(Math.abs(clearance - expected) < 0.75,
      `${glb}: clearance ${clearance.toFixed(2)} vs expected ~${expected}`);
    // Smaller stations shrink the same pocket: clearance scales with the reference radius.
    const small = manifestAt(glb, 60);
    assert.ok(Math.abs(berthClearanceWu(small.manifest, small.st) - expected * (60 / 90)) < 0.75,
      `${glb} at R60 should scale the pocket`);
  }
});

test('fit matrix: hulls larger than the pocket moor instead of berthing', () => {
  const fits = (glb, R, ship) => {
    const { st, manifest } = manifestAt(glb, R);
    return berthFitsHull(manifest, st, hull(ship.defId, ship.radius));
  };
  // The flagship loses the deck berth at every tight station, at every size — and at SMALL
  // trade hubs too. It keeps M/L open hubs.
  assert.equal(fits('place_station_trade_hub', 90, LEVIATHAN), true);
  assert.equal(fits('place_station_trade_hub', 72, LEVIATHAN), true);
  assert.equal(fits('place_station_trade_hub', 60, LEVIATHAN), false);
  for (const glb of ['place_station_blackmarket', 'place_station_military', 'place_station_mining',
    'place_station_fab', 'place_station_research', 'place_station_refinery']) {
    assert.equal(fits(glb, 90, LEVIATHAN), false, `leviathan must moor at ${glb}`);
    assert.equal(fits(glb, 72, LEVIATHAN), false, `leviathan must moor at ${glb} M`);
    assert.equal(fits(glb, 60, LEVIATHAN), false, `leviathan must moor at ${glb} S`);
  }
  // The Colossus fits every L pocket but loses the tightest stations at smaller sizes.
  assert.equal(fits('place_station_research', 90, COLOSSUS), true);
  assert.equal(fits('place_station_blackmarket', 90, COLOSSUS), true);
  assert.equal(fits('place_station_mining', 72, COLOSSUS), false);
  assert.equal(fits('place_station_blackmarket', 60, COLOSSUS), false);
  // Atlas loses S pockets; Ironback only the very tightest S stations.
  assert.equal(fits('place_station_military', 72, ATLAS), false);
  assert.equal(fits('place_station_military', 60, IRONBACK), false);
  assert.equal(fits('place_station_blackmarket', 60, IRONBACK), true);
  // Ordinary hulls berth anywhere; a null ship and a bare-radius ship follow the same law.
  for (const glb of ['place_station_mining', 'place_station_trade_hub']) {
    for (const R of [60, 72, 90]) {
      assert.equal(fits(glb, R, KESTREL), true);
      assert.equal(fits(glb, R, MULE), true);
    }
  }
  const { st, manifest } = manifestAt('place_station_mining', 90);
  assert.equal(berthFitsHull(manifest, st, null), true, 'no ship → legacy berth contract');
  assert.equal(berthFitsHull(manifest, st, { type: 'ship', radius: 39.38 }), false,
    'an unmeasured hull of the same envelope obeys the same geometry');
  // A manifest without a mooring block berths every hull — the authored gate manifest
  // and every legacy path are untouched.
  assert.equal(berthFitsHull(COLLISION_PROXY_MANIFESTS.gate_jump_ring, st, hull('ship_leviathan', 45)), true);
});

// ---------------------------------------------------------------------------------------------
// dock anchor resolution
// ---------------------------------------------------------------------------------------------

test('resolveDockAnchor: berth for fitting hulls, corridor-axis standoff for oversized ones', () => {
  const { st, manifest } = manifestAt('place_station_mining', 90);

  const berthAnchor = resolveDockAnchor(st, manifest, hull('ship_kestrel', 14));
  assert.equal(berthAnchor.kind, 'berth');
  assert.equal(berthAnchor.dockRadius, 20);
  assert.equal(berthAnchor.speedGate, 12);
  // The berth anchor is exactly the authored berth point.
  const expectedBerthR = manifest.docking.berth.radius * 90;
  assert.ok(Math.abs(Math.hypot(berthAnchor.x, berthAnchor.z) - expectedBerthR) < EPS);

  const moor = resolveDockAnchor(st, manifest, hull('ship_leviathan', 45));
  assert.equal(moor.kind, 'mooring');
  assert.equal(moor.dockRadius, 20, 'the public dock gate is unchanged');
  assert.equal(moor.speedGate, 12);
  // The standoff sits on the outbound corridor axis at outer structure + envelope + margin —
  // the whole hull is geometrically outside every proxy primitive.
  const axis = resolveCorridorAxisWorld(st, manifest);
  const along = hullEnvelopeWu(hull('ship_leviathan', 45)) + proxyOuterRadiusWu(manifest, st)
    + manifest.docking.mooring.standoffWu;
  assert.ok(Math.abs(moor.x - axis.x * along) < 1e-6);
  assert.ok(Math.abs(moor.z - axis.z * along) < 1e-6);
  // Clearance proof: the anchor minus the hull envelope still exceeds the outermost structure.
  assert.ok(along - hullEnvelopeWu(hull('ship_leviathan', 45)) > proxyOuterRadiusWu(manifest, st));

  // Same manifest, same station: the anchor follows the hull, not a station flag.
  assert.equal(resolveDockAnchor(st, manifest, hull('ship_colossus', 32)).kind, 'berth');
  // No docking berth at all → null (callers keep their fallback).
  assert.equal(resolveDockAnchor(st, { ...manifest, docking: {} }, hull('ship_leviathan', 45)), null);
  assert.equal(resolveDockAnchor(st, COLLISION_PROXY_MANIFESTS.gate_jump_ring, hull('ship_leviathan', 45)), null);
});

// ---------------------------------------------------------------------------------------------
// physics.updateDockRange — the public dock prompt resolves the hull's own anchor
// ---------------------------------------------------------------------------------------------

function dockRangeHost() {
  const events = [];
  return {
    events,
    host: {
      _dockStationId: null,
      _gateEntityId: null,
      bus: { emit: (name, payload) => events.push({ name, payload }) },
    },
  };
}

function dockState(player, st) {
  return {
    playerId: player.id,
    entities: new Map([[player.id, player], [st.id, st]]),
    entityIndex: { stations: [st] },
    entityList: [player, st],
  };
}

test('an oversized hull gets no dock prompt at the deck berth it cannot clear', () => {
  const { st, manifest } = manifestAt('place_station_mining', 90);
  const berthAnchor = resolveDockAnchor(st, manifest, hull('ship_kestrel', 14));
  const player = hull('ship_leviathan', 45, { x: berthAnchor.x, z: berthAnchor.z });
  const { host, events } = dockRangeHost();

  physics.updateDockRange.call(host, dockState(player, st));
  assert.equal(host._dockStationId, null,
    'the leviathan parked exactly on the deck berth is still outside its own dock anchor');
  assert.deepEqual(events, [], 'no dock:range event for an anchor the hull cannot use');
});

test('an oversized hull docks at the mooring standoff with the unchanged prompt contract', () => {
  const { st, manifest } = manifestAt('place_station_mining', 90);
  const moor = resolveDockAnchor(st, manifest, hull('ship_leviathan', 45));
  const player = hull('ship_leviathan', 45, { x: moor.x, z: moor.z });
  const { host, events } = dockRangeHost();

  physics.updateDockRange.call(host, dockState(player, st));
  assert.equal(host._dockStationId, st.data.stationId);
  assert.deepEqual(events, [{
    name: 'dock:range',
    payload: { stationId: st.data.stationId, shipId: 'player', inRange: true },
  }], 'the same dock:range event, fired at the mooring anchor');

  // The mooring gate still requires the speed gate — a fast flyby owes nothing.
  const fast = hull('ship_leviathan', 45, { x: moor.x, z: moor.z });
  fast.vel = { x: 30, z: 0 };
  const { host: host2, events: events2 } = dockRangeHost();
  physics.updateDockRange.call(host2, dockState(fast, st));
  assert.equal(host2._dockStationId, null);
  assert.deepEqual(events2, []);
});

test('a fitting hull keeps the deck berth unchanged on the same station', () => {
  const { st, manifest } = manifestAt('place_station_mining', 90);
  const berthAnchor = resolveDockAnchor(st, manifest, hull('ship_kestrel', 14));
  const player = hull('ship_kestrel', 14, { x: berthAnchor.x, z: berthAnchor.z });
  const { host, events } = dockRangeHost();

  physics.updateDockRange.call(host, dockState(player, st));
  assert.equal(host._dockStationId, st.data.stationId);
  assert.equal(events[0].payload.inRange, true);
});

test('legacy center-radius docking is untouched by the anchor law', () => {
  const legacy = {
    id: 'st-legacy', type: 'station', alive: true,
    pos: { x: 0, z: 0 }, rot: 0, radius: 80,
    data: { stationId: 'station_legacy', dockRadius: 80 },
  };
  // Leviathan parked at the station edge: (80 + 45) * 1.5 = 187.5 wu range.
  const player = hull('ship_leviathan', 45, { x: 150, z: 0 });
  const { host, events } = dockRangeHost();
  physics.updateDockRange.call(host, dockState(player, legacy));
  assert.equal(host._dockStationId, 'station_legacy');
  assert.equal(events[0].payload.inRange, true);
});

// ---------------------------------------------------------------------------------------------
// flightV3 autopilot — the terminal aim is the hull's own dock anchor
// ---------------------------------------------------------------------------------------------

test('autopilot terminal aim resolves the mooring anchor for an oversized hull', () => {
  const { st, manifest } = manifestAt('place_station_mining', 90);
  const moor = resolveDockAnchor(st, manifest, hull('ship_leviathan', 45));
  const axis = resolveCorridorAxisWorld(st, manifest);
  // Seat the hull on the corridor lane so the berth stage arms immediately.
  const player = hull('ship_leviathan', 45, { x: axis.x * 100, z: axis.z * 100 });
  const state = {
    playerId: player.id,
    entities: new Map([[player.id, player], [st.id, st]]),
  };
  const target = resolveAutopilotTarget(state, { targetEntityId: st.id, label: 'Mining berth' });
  assert.equal(target.dockingStage, 'berth');
  assert.equal(target.dockAnchorKind, 'mooring');
  assert.ok(Math.abs(target.x - moor.x) < 1e-6);
  assert.ok(Math.abs(target.z - moor.z) < 1e-6);
  assert.equal(target.arrivalRadius, 20);
  assert.equal(target.dockSpeedGate, 12);
});

test('autopilot terminal aim stays on the deck berth for a fitting hull', () => {
  const { st, manifest } = manifestAt('place_station_mining', 90);
  const axis = resolveCorridorAxisWorld(st, manifest);
  const player = hull('ship_kestrel', 14, { x: axis.x * 100, z: axis.z * 100 });
  const state = {
    playerId: player.id,
    entities: new Map([[player.id, player], [st.id, st]]),
  };
  const target = resolveAutopilotTarget(state, { targetEntityId: st.id });
  assert.equal(target.dockingStage, 'berth');
  assert.equal(target.dockAnchorKind, 'berth');
  const berthR = manifest.docking.berth.radius * 90;
  assert.ok(Math.abs(Math.hypot(target.x, target.z) - berthR) < EPS);
});

// ---------------------------------------------------------------------------------------------
// dockingCorridor — the capture tug is withheld from hulls that cannot take the berth
// ---------------------------------------------------------------------------------------------

function corridorState(player, st) {
  return {
    mode: 'flight',
    playerId: player.id,
    entities: new Map([[player.id, player], [st.id, st]]),
    entityIndex: { stations: [st] },
    entityList: [player, st],
    input: {},
    ui: {},
  };
}

test('capture assist is withheld from an oversized hull and still owed to a fitting one', () => {
  const { st, manifest } = manifestAt('place_station_mining', 90);
  const axis = resolveCorridorAxisWorld(st, manifest);
  const lanePos = { x: axis.x * 100, z: axis.z * 100 };
  const dt = 1 / 60;

  // Leviathan in the capture lane: classification still says capture — the lane is real —
  // but no tug impulse is queued, because the tug's target is a berth this hull cannot take.
  dockingCorridor.init({ bus: null });
  const big = hull('ship_leviathan', 45, lanePos);
  const bigState = corridorState(big, st);
  dockingCorridor.update(dt, bigState);
  assert.equal(bigState.dockingCorridor.inCapture, true);
  assert.equal(bigState.dockingCorridor.assist, null,
    'no capture tug toward a berth the hull cannot clear');
  assert.equal(consumePhysicsCommand(big), null, 'no impulse reached the physics membrane');

  // Same lane, same tick, a hull that fits: the tug still parks it.
  dockingCorridor.init({ bus: null });
  const small = hull('ship_kestrel', 14, lanePos);
  const smallState = corridorState(small, st);
  dockingCorridor.update(dt, smallState);
  assert.equal(smallState.dockingCorridor.inCapture, true);
  assert.ok(smallState.dockingCorridor.assist, 'the fitting hull still gets the tug');
  const command = consumePhysicsCommand(small);
  assert.ok(command && command.impulses.length >= 1, 'impulse queued for the fitting hull');
});
