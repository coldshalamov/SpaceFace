/**
 * Restore-path hardening — crafted/corrupted envelopes must not poison live state:
 *
 *  - entities.nextEntityId / freeIds / nextOccupantGeneration at MAX_SAFE_INTEGER are refused:
 *    allocation publishes `id + 1`, which must stay a safe integer or every later spawn throws.
 *  - allocateEntityId fails closed at the last safe id instead of leaving nextEntityId unsafe.
 *  - wrong-typed numerics in persistent specs (hull:"junk") are dropped before makeEntity —
 *    an immortal body is not a loadable outcome.
 *  - ironmanChoiceLocked is run-scoped: resetRunState clears it from session settings.
 *  - slot-card thumbnails are re-validated at read time (beside-checksum field).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { allocateEntityId, scrubRestoredNumericFields, makeEntity } from '../src/core/entity.js';
import { save } from '../src/save/saveSystem.js';
import { isSafeSlotThumbnail } from '../src/save/slotStill.js';
import { resetRunState } from '../src/core/newGameBoot.js';
import { createGameState } from '../src/core/gameState.js';

const MAX = Number.MAX_SAFE_INTEGER;

function idState() {
  return {
    entities: new Map(),
    entityList: [],
    freeIds: [],
    world: {},
    nextEntityId: 42,
    nextOccupantGeneration: 7,
  };
}

test('restore refuses a ceiling nextEntityId instead of poisoning allocation', () => {
  const state = idState();
  save._restoreEntityIdAllocator.call({ state }, { nextEntityId: MAX });
  assert.equal(state.nextEntityId, 42, 'untouched');
  // Legit values still land.
  save._restoreEntityIdAllocator.call({ state }, { nextEntityId: MAX - 1 });
  assert.equal(state.nextEntityId, MAX - 1);
});

test('restore drops ceiling freeIds entries; a near-ceiling entry still recycles', () => {
  const state = idState();
  save._restoreEntityIdAllocator.call({ state }, { freeIds: [MAX, 5, MAX - 1, 'junk', 0] });
  assert.deepEqual([...state.freeIds].sort((a, b) => a - b), [5, MAX - 1]);
});

test('restore refuses a ceiling occupant-generation fence instead of rewinding it later', () => {
  const state = idState();
  save._restoreEntityIdAllocator.call({ state }, { nextOccupantGeneration: MAX });
  assert.equal(state.nextOccupantGeneration, 7, 'untouched');
  save._restoreEntityIdAllocator.call({ state }, { nextOccupantGeneration: 99 });
  assert.equal(state.nextOccupantGeneration, 99);
});

test('the maximum safe id is the final valid allocation; the next call fails closed', () => {
  const state = idState();
  state.nextEntityId = MAX;
  assert.equal(allocateEntityId(state), MAX, 'the last safe id still allocates');
  assert.throws(() => allocateEntityId(state), TypeError, 'then the exhausted range fails closed');
});

test('wrong-typed numerics in a restored spec are dropped; valid values survive', () => {
  const spec = {
    type: 'asteroid', hull: 'junk', rot: 'junk', mass: {}, ttl: 'x', team: [],
    shield: 50, shieldMax: 50, radius: 12, maxSpeed: 0,
  };
  scrubRestoredNumericFields(spec);
  for (const k of ['hull', 'rot', 'mass', 'ttl', 'team']) assert.equal(spec[k], undefined, k);
  assert.equal(spec.shield, 50);
  assert.equal(spec.radius, 12);
  const e = makeEntity(spec);
  assert.ok(Number.isFinite(e.hull) && e.hull > 0, 'defaulted hull, not immortal-by-string');
  assert.ok(Number.isFinite(e.rot));
});

test('resetRunState clears the run-scoped ironman latch from session settings', () => {
  const state = createGameState(1);
  state.settings.gameplay.ironmanChoiceLocked = true;
  resetRunState(state, { seed: 1 });
  assert.equal(state.settings.gameplay.ironmanChoiceLocked, undefined);
});

test('slot-card thumbnail read-side bound', () => {
  assert.equal(isSafeSlotThumbnail('https://evil.example/x.png'), false);
  assert.equal(isSafeSlotThumbnail('javascript:alert(1)'), false);
  assert.equal(isSafeSlotThumbnail(42), false);
  assert.equal(isSafeSlotThumbnail('data:text/html;base64,PHI+'), false);
  assert.equal(isSafeSlotThumbnail('data:image/png;base64,iVBORw0KGgo='), true);
  // Over the 24 KB still budget: a ~33k-char base64 payload decodes past it.
  assert.equal(isSafeSlotThumbnail('data:image/png;base64,' + 'A'.repeat(40000)), false);
});
