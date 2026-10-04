// pb-wire-selection.test.mjs — row 285 / SF-244 consumer half.
//
// The local map's click-target/inspector path resolves through the stable-identity model
// (src/ui/sim/stableSelection.js, orphaned since row 148): a destroyed hull whose entity id was
// recycled closes the selection instead of pointing the ring, inspector and course commit at the
// body that inherited the id, while a durable station follows its instance swap. The model itself
// is proven in pb-ui-b-sim-models.test.mjs; this file proves the map consumes it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGameState } from '../src/core/gameState.js';
import {
  buildLocalModel,
  reconcileMapSelection,
  resolveCourseEntityId,
  resolveCourseTarget,
} from '../src/ui/galaxyMap.js';

const SEED = 4242;
const ROOT = join(import.meta.dirname, '..');

function spawn(state, e) {
  state.entities.set(e.id, e);
  state.entityList.push(e);
  return e;
}

function despawn(state, e) {
  state.entities.delete(e.id);
  const i = state.entityList.indexOf(e);
  if (i >= 0) state.entityList.splice(i, 1);
}

function boot() {
  const state = createGameState(SEED);
  spawn(state, {
    id: 0, type: 'ship', alive: true,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    data: { role: 'player' }, team: 'player',
  });
  return state;
}

function hostileMule(id, over = {}) {
  return {
    id, type: 'ship', alive: true,
    pos: { x: 60, y: 0, z: 40 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    factionId: 'red_wake',
    data: { name: 'Kestrel raider', role: 'raider', kind: 'raider', hostile: true },
    ...over,
  };
}

function aurumDepot(id, pos = { x: 120, y: 0, z: -80 }) {
  return {
    id, type: 'station', alive: true,
    pos, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    data: { stationId: 'aurum_depot', name: 'Aurum Depot' },
  };
}

function contactFor(model, id) {
  return model.contacts.find((c) => c.id === id) || null;
}

test('PB-285: live contacts carry a stable-identity stamp; remembered marks do not', () => {
  const state = boot();
  spawn(state, hostileMule(7));
  spawn(state, aurumDepot(3));
  spawn(state, { id: 11, type: 'asteroid', alive: true, pos: { x: -40, y: 0, z: 90 }, vel: { x: 0, y: 0, z: 0 }, rot: 0, data: { typeId: 'rock' } });

  const model = buildLocalModel(state, () => false, {});
  const mule = contactFor(model, 7);
  const depot = contactFor(model, 3);
  const rock = contactFor(model, 11);
  assert.ok(mule && depot && rock, 'all three bodies chart');

  assert.equal(mule.stable.key, 'entity:7');
  assert.equal(mule.stable.durable, false);
  assert.equal(mule.stable.entityId, 7);
  assert.equal(rock.stable.key, 'entity:11', 'a rock is transient identity too');
  assert.equal(depot.stable.key, 'station:aurum_depot');
  assert.equal(depot.stable.durable, true);
});

test('PB-285: a destroyed hull whose id was recycled closes the selection and the course bind', () => {
  const state = boot();
  const mule = spawn(state, hostileMule(7));
  const model = buildLocalModel(state, () => false, {});
  // _selectedTarget holds the marker object captured at click time.
  const selected = { ...contactFor(model, 7) };
  assert.ok(selected.stable, 'the click target was stamped');

  // While the hull lives, the selection resolves unchanged.
  assert.equal(reconcileMapSelection(state, selected), selected);
  assert.equal(resolveCourseEntityId(state, selected), 7);

  // Kill it and recycle id 7 onto a different hull — the core's free-id pool does exactly this.
  despawn(state, mule);
  spawn(state, {
    id: 7, type: 'ship', alive: true,
    pos: { x: 900, y: 0, z: 900 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    factionId: 'concord',
    data: { name: 'Ore mule', role: 'hauler', kind: 'freighter' },
  });

  // The selection closes; it does not follow the id onto the ore mule.
  assert.equal(reconcileMapSelection(state, selected), null);
  assert.equal(resolveCourseEntityId(state, selected), null);

  // The course commit still stands on the mark's position — the fail-closed place the sim
  // contracts — but it must not arm a target bind at the recycler.
  const payload = resolveCourseTarget(selected);
  assert.ok(payload && payload.pos, 'the waypoint survives');
  const liveId = resolveCourseEntityId(state, selected);
  if (liveId == null) delete payload.targetEntityId; else payload.targetEntityId = liveId;
  assert.equal(payload.targetEntityId, undefined);
  assert.equal(payload.pos.x, 60);
  assert.equal(payload.pos.z, 40);
});

test('PB-285: a station selection survives an instance swap on seed 4242', () => {
  const state = boot();
  const first = spawn(state, aurumDepot(3));
  const model = buildLocalModel(state, () => false, {});
  const selected = { ...contactFor(model, 3) };
  assert.equal(selected.stable.key, 'station:aurum_depot');

  // Continuous residency materializes a fresh instance of the same station: old entity out,
  // new entity id in, same catalogue identity at a new anchor.
  despawn(state, first);
  spawn(state, aurumDepot(9, { x: 140, y: 0, z: -60 }));

  const rebound = reconcileMapSelection(state, selected);
  assert.ok(rebound, 'the durable identity still resolves');
  assert.equal(rebound.entityId, 9);
  assert.equal(rebound.id, 9, 'a marker whose id IS the entity id follows the new instance');
  assert.equal(rebound.stable.key, 'station:aurum_depot');
  assert.equal(rebound.stable.entityId, 9, 'the stamp rebinds to the live instance');
  assert.equal(rebound.x, 140);
  assert.equal(rebound.z, -60);
  assert.equal(resolveCourseEntityId(state, rebound), 9);
});

test('PB-285: unstamped marks keep bare-id behaviour and a dead durable closes', () => {
  const state = boot();
  const legacy = { id: 'zone-x', kind: 'zone', x: 10, z: 10, entityId: 44 };
  assert.equal(reconcileMapSelection(state, legacy), legacy, 'no stamp -> pass through');
  assert.equal(resolveCourseEntityId(state, legacy), 44, 'legacy entityId fallback preserved');
  const byTarget = { id: 'claim-y', kind: 'claim', x: 0, z: 0, targetEntityId: 55 };
  assert.equal(resolveCourseEntityId(state, byTarget), 55, 'targetEntityId fallback preserved');

  const depot = spawn(state, aurumDepot(3));
  const selected = { ...contactFor(buildLocalModel(state, () => false, {}), 3) };
  despawn(state, depot);
  // Nothing else claims aurum_depot: the durable identity is gone, the selection closes.
  assert.equal(reconcileMapSelection(state, selected), null);
  assert.equal(resolveCourseEntityId(state, selected), null);
});

test('PB-285: the live route consumes the model — draw reconciles, commit re-resolves', () => {
  const src = readFileSync(join(ROOT, 'src/ui/galaxyMap.js'), 'utf8');
  const draw = src.slice(src.indexOf('_draw() {'));
  assert.ok(draw.includes('reconcileMapSelection('),
    'the draw path re-resolves the held selection before painting the ring/inspector');
  const commit = src.slice(src.indexOf('_commitCourse(target'));
  assert.ok(commit.includes('resolveCourseEntityId('),
    'the ONE course commit path re-resolves stamped marks');
  assert.ok(commit.includes('delete payload.targetEntityId'),
    'a failed bind is dropped, never handed a recycled id');
  // Every live-entity click target carries the stamp the helpers resolve through.
  assert.ok(src.includes('stable: c.stable || null'), 'contact click targets carry the stamp');
  assert.ok(src.includes('stable: captureEntitySelection(e)'), 'markers stamp the live entity at build time');
  assert.ok(src.includes("from './sim/stableSelection.js'"), 'the screen consumes the sim model, not a reimplementation');
});
