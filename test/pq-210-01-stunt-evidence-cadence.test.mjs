// PQ-210.01 — the per-tick observation sweep's `lives` pass runs on a 30-tick cadence.
// The Crucible CPU profile named pruneEvidence's unbounded lives scan; the cadence must change
// nothing observable: roots/bodies/contacts/constraints still prune every call, live entities'
// records are always retained, and cadence 1 (the serialize path's call) sweeps on every tick.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bindStuntEvidence, unbindStuntEvidence, bodyLife, pruneEvidence,
} from '../src/combat/stuntEvidence.js';

function body(id) {
  return {
    id, type: 'asteroid', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 4, mass: 10, hull: 10, hullMax: 10,
  };
}

function freshState() {
  const state = { playerId: 0, entities: new Map(), entityList: [], mode: 'flight', tick: 0, simTime: 0 };
  return { state, journal: bindStuntEvidence(state) };
}

const keyOf = (id) => `${typeof id}:${String(id)}`;

test('cadenced prune keeps roots/contacts per-tick and sweeps stale lives only on the cadence tick', () => {
  const { state, journal } = freshState();
  try {
    const gone = body(7);
    const kept = body(8);
    state.entities.set(7, gone);
    state.entities.set(8, kept);
    const goneLife = bodyLife(gone, state);
    bodyLife(kept, state);
    journal.roots.set('root:stale', { id: 'root:stale', tick: 1 });
    journal.contacts.set('c:stale', { id: 'c:stale', tick: 1 });
    state.entities.delete(7);

    // tick 482 is NOT on the 30-tick cadence: the horizon sweeps still run…
    pruneEvidence(state, 482, 30);
    assert.ok(!journal.roots.has('root:stale'), 'roots prune every call regardless of the lives cadence');
    assert.ok(!journal.contacts.has('c:stale'), 'contacts prune every call regardless of the lives cadence');
    assert.ok(journal.lives.has(keyOf(7)), 'the stale life survives an off-cadence tick');
    assert.ok(journal.lives.has(keyOf(8)), 'a live entity\'s record is always retained');

    // …tick 510 (510 % 30 === 0) sweeps it.
    pruneEvidence(state, 510, 30);
    assert.ok(!journal.lives.has(keyOf(7)), 'the stale life is swept on the cadence tick');
    assert.ok(journal.lives.has(keyOf(8)), 'the live entity\'s record survives the sweep');
    assert.equal(journal.lives.get(keyOf(8)), bodyLife(kept, state), 'the retained record still binds its body');
    assert.ok(goneLife.id.startsWith('life:number:7:'), 'sanity: the swept record was the gone body\'s life');
  } finally {
    unbindStuntEvidence(state);
  }
});

test('cadence 1 (the default, and the serialize path) sweeps lives on every tick', () => {
  const { state, journal } = freshState();
  try {
    const gone = body(9);
    state.entities.set(9, gone);
    bodyLife(gone, state);
    state.entities.delete(9);
    pruneEvidence(state, 33);
    assert.ok(!journal.lives.has(keyOf(9)), 'the default cadence prunes stale lives every call');
  } finally {
    unbindStuntEvidence(state);
  }
});
