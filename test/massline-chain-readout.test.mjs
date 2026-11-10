import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHAIN_NODE_AFTERMATH,
  CHAIN_NODE_CONTACT,
  CHAIN_NODE_RELEASE,
  CHAIN_READOUT_NODE_CAP,
  CHAIN_READOUT_RESOLVE_FADE_S,
  CHAIN_READOUT_WINDOW_S,
  createMasslineChainReadout,
  createMasslineChainReadoutGeometry,
  masslineChainBindMarker,
  masslineChainBindWreckEntity,
  masslineChainNoteAftermath,
  masslineChainNoteContact,
  masslineChainNoteRelease,
  resetMasslineChainReadout,
  resolveMasslineChainReadoutPlan,
  writeMasslineChainReadoutGeometry,
} from '../src/render/masslineChainReadout.js';

function planShell() {
  return {
    visible: false, phase: 'idle', fade: 0, markerWu: 0, segWidthWu: 0, y: 0,
    nodeCount: 0, resolved: false, hasAftermath: false,
    wreckEntityId: null, aftermathX: NaN, aftermathZ: NaN,
  };
}

function planInput(overrides = {}) {
  return {
    nowS: 10,
    selectedId: null,
    wreckPos: null,
    markerWu: 2,
    segWidthWu: 0.6,
    y: 1.32,
    fadeScale: 1,
    ...overrides,
  };
}

test('a thrown chain records release, real contacts, and the resolving kill as world-anchored nodes', () => {
  const record = createMasslineChainReadout();
  const scratch = createMasslineChainReadoutGeometry(record.capacity);
  const plan = planShell();

  assert.equal(masslineChainNoteRelease(record, {
    thrownId: 'debris-1', x: 10, z: -4, dirX: 1, dirZ: 0, nowS: 10,
  }), 0);
  assert.equal(record.active, true);
  assert.equal(record.phase, 'flying');

  // Two accepted contacts (whip record / physics:impact point) — never re-derived.
  assert.ok(masslineChainNoteContact(record, {
    victimId: 'pirate-2', x: 30, z: -4, dirX: 1, dirZ: 0, nowS: 10.4,
  }) >= 0);
  assert.ok(masslineChainNoteContact(record, {
    victimId: 'asteroid-9', x: 52, z: 2, dirX: 0.9, dirZ: 0.4, nowS: 10.9,
  }) >= 0);
  // The kill only counts for a victim this chain actually struck.
  assert.equal(masslineChainNoteAftermath(record, {
    victimId: 'unrelated-ship', x: 0, z: 0, nowS: 11,
  }), false);
  assert.equal(masslineChainNoteAftermath(record, {
    victimId: 'asteroid-9', x: 52, z: 2, nowS: 11.1,
  }), true);
  assert.equal(record.aftermathVictimId, 'asteroid-9');

  resolveMasslineChainReadoutPlan(record, planInput({ nowS: 11.2 }), plan);
  assert.equal(plan.visible, true);
  assert.equal(plan.nodeCount, 4);
  assert.equal(plan.hasAftermath, true);

  const geometry = writeMasslineChainReadoutGeometry(scratch, record, plan);
  // 4 node diamonds + 2 connective quads = 6 quads = 36 indices. The contact→aftermath
  // connective is degenerate: the kill landed exactly on the contact point.
  assert.equal(geometry.indexCount, 36);
  // First node's diamond centre sits exactly on the captured release point.
  // Diamond vertices are ordered -axis,+perp,+axis,-perp around the centre:
  // avg of verts 0 and 2 is the centre.
  const positions = geometry.positions;
  const firstDiamond = 2 * 4 * 3; // after the 2 connective quads
  const cx = (positions[firstDiamond] + positions[firstDiamond + 6]) / 2;
  const cz = (positions[firstDiamond + 2] + positions[firstDiamond + 8]) / 2;
  assert.ok(Math.abs(cx - 10) < 1e-5 && Math.abs(cz - (-4)) < 1e-5,
    'the release diamond centres on the captured world point, not a moved entity');
});

test('sustained contact on one victim does not spend the whole node cap', () => {
  const record = createMasslineChainReadout();
  masslineChainNoteRelease(record, { thrownId: 'm', x: 0, z: 0, nowS: 0 });
  for (let i = 0; i < CHAIN_READOUT_NODE_CAP + 4; i += 1) {
    masslineChainNoteContact(record, {
      victimId: 'wall', x: 5 + i * 0.5, z: 0, dirX: 1, dirZ: 0, nowS: i * 0.05,
    });
  }
  assert.ok(record.nodeCount < CHAIN_READOUT_NODE_CAP,
    'grinding along one surface collapses to one node per 8 wu stride');
});

test('the aftermath node rides the bound wreck entity, never a stale pin', () => {
  const record = createMasslineChainReadout();
  const plan = planShell();
  masslineChainNoteRelease(record, { thrownId: 'm', x: 0, z: 0, nowS: 0 });
  masslineChainNoteContact(record, {
    victimId: 'victim-7', x: 20, z: 5, dirX: 1, dirZ: 0, nowS: 0.5,
  });
  masslineChainNoteAftermath(record, { victimId: 'victim-7', x: 20, z: 5, nowS: 0.8 });

  // Marker binding requires the recorded kill's victim — a foreign marker is refused.
  assert.equal(masslineChainBindMarker(record, 'mk-1', 'other-victim'), false);
  assert.equal(record.aftermathMarkerId, null);
  assert.equal(masslineChainBindMarker(record, 'mk-1', 'victim-7'), true);

  // Wreck binding requires the entity carrying that marker.
  assert.equal(masslineChainBindWreckEntity(record, { id: 'w-1', data: { markerId: 'mk-9' } }), false);
  assert.equal(masslineChainBindWreckEntity(record, { id: 'wreck-7', data: { markerId: 'mk-1' } }), true);
  assert.equal(record.wreckEntityId, 'wreck-7');

  // With the wreck bound, the plan hands the adapter the live presented position.
  resolveMasslineChainReadoutPlan(record, planInput({
    nowS: 1, wreckPos: { x: 24, z: 9 },
  }), plan);
  assert.equal(plan.aftermathX, 24);
  assert.equal(plan.aftermathZ, 9);

  // Selecting that wreck ends the emphasis.
  resolveMasslineChainReadoutPlan(record, planInput({
    nowS: 1.1, selectedId: 'wreck-7', wreckPos: { x: 24, z: 9 },
  }), plan);
  assert.equal(plan.resolved, true);
});

test('the readout stays bounded and dissolves on quiet; reset reuses the same allocation', () => {
  const record = createMasslineChainReadout();
  const plan = planShell();
  const scratch = createMasslineChainReadoutGeometry(record.capacity);
  const positionsBefore = scratch.positions;

  masslineChainNoteRelease(record, { thrownId: 'm', x: 0, z: 0, nowS: 0 });
  resolveMasslineChainReadoutPlan(record, planInput({ nowS: 0.1 }), plan);
  assert.equal(plan.visible, true);

  // Past the quiet window with no new accepted event, the record resolves and fades.
  resolveMasslineChainReadoutPlan(record, planInput({ nowS: CHAIN_READOUT_WINDOW_S + 1 }), plan);
  assert.equal(record.phase, 'resolved');
  resolveMasslineChainReadoutPlan(record, planInput({
    nowS: CHAIN_READOUT_WINDOW_S + 1 + CHAIN_READOUT_RESOLVE_FADE_S + 0.1,
  }), plan);
  assert.equal(plan.visible, false, 'the dissolved readout goes quiet instead of lingering');
  assert.equal(record.active, false);

  masslineChainNoteRelease(record, { thrownId: 'n', x: 3, z: 3, nowS: 20 });
  assert.equal(record.nodeCount, 1, 'reset reused the record rather than leaking history');
  writeMasslineChainReadoutGeometry(scratch, record,
    resolveMasslineChainReadoutPlan(record, planInput({ nowS: 20.05 }), plan));
  assert.equal(scratch.positions, positionsBefore, 'geometry writes into the same typed arrays');
});

test('a contact node anchors at the supplied accepted point verbatim', () => {
  const record = createMasslineChainReadout();
  const plan = planShell();
  const scratch = createMasslineChainReadoutGeometry(record.capacity);
  masslineChainNoteRelease(record, { thrownId: 'm', x: -100, z: -100, nowS: 0 });
  // The accepted contact point (physics receipt pos) is far from the release point;
  // the connective must run to it, not to wherever a stale render position was.
  const accepted = { x: 87.25, z: -13.5 };
  masslineChainNoteContact(record, {
    victimId: 'v', x: accepted.x, z: accepted.z, dirX: 0, dirZ: 1, nowS: 0.4,
  });
  resolveMasslineChainReadoutPlan(record, planInput({ nowS: 0.5 }), plan);
  writeMasslineChainReadoutGeometry(scratch, record, plan);
  // The second node diamond must sit on the accepted point: quad order is connectives
  // first (1 quad here), then one diamond per node — quad 1 release, quad 2 contact.
  const positions = scratch.positions;
  const base = 2 * 4 * 3;
  const cx = (positions[base] + positions[base + 6]) / 2;
  const cz = (positions[base + 2] + positions[base + 8]) / 2;
  assert.ok(Math.abs(cx - accepted.x) < 1e-5 && Math.abs(cz - accepted.z) < 1e-5,
    'the second path visibly begins where the real hit occurred');
});

test('zoom-compensated marker size never moves a recorded impact origin (NXI-200)', () => {
  const record = createMasslineChainReadout();
  const plan = planShell();
  const near = createMasslineChainReadoutGeometry(record.capacity);
  const far = createMasslineChainReadoutGeometry(record.capacity);
  masslineChainNoteRelease(record, { thrownId: 'm', x: 12.5, z: -7.75, nowS: 0 });
  masslineChainNoteContact(record, {
    victimId: 'v', x: 41.25, z: 9.5, dirX: 1, dirZ: 0, nowS: 0.3,
  });

  const diamondCenters = (scratch, markerWu) => {
    resolveMasslineChainReadoutPlan(record, planInput({ nowS: 0.5, markerWu }), plan);
    writeMasslineChainReadoutGeometry(scratch, record, plan);
    const centers = [];
    const positions = scratch.positions;
    const quads = scratch.indexCount / 6;
    const nodeQuads = record.nodeCount;
    const firstNodeQuad = quads - nodeQuads; // connectives are emitted before node diamonds
    for (let quad = firstNodeQuad; quad < quads; quad += 1) {
      const base = quad * 4 * 3;
      centers.push([(positions[base] + positions[base + 6]) / 2,
        (positions[base + 2] + positions[base + 8]) / 2]);
    }
    return centers;
  };

  // The same chain drawn at a tight chase zoom and a pulled-back table zoom.
  const nearCenters = diamondCenters(near, 1.4);
  const farCenters = diamondCenters(far, 9);
  assert.equal(nearCenters.length, 2);
  assert.deepEqual(farCenters, nearCenters,
    'every node origin is the captured world point at any marker scale — camera scale changes readability only');
});

test('declines malformed input and never mutates caller payloads', () => {
  const record = createMasslineChainReadout();
  assert.equal(masslineChainNoteRelease(record, { x: NaN, z: 0 }), false);
  assert.equal(record.active, false);
  const release = { thrownId: 'm', x: 1, z: 2, dirX: 1, dirZ: 0, nowS: 0 };
  const before = structuredClone(release);
  masslineChainNoteRelease(record, release);
  assert.deepEqual(release, before);
  assert.equal(masslineChainNoteContact(record, { victimId: 'v', x: NaN, z: 0 }), -1);
  assert.equal(record.nodeCount, 1, 'a malformed contact writes no node');
});
