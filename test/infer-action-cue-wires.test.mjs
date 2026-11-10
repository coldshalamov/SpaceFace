import test from 'node:test';
import assert from 'node:assert/strict';
import { ADDITIONAL_ACTION_VFX_RECIPES, resolveAdditionalActionVfxReceipt } from '../src/render/vfx/actionEventRecipes.js';

// Five sim events that were emitted with no presentation consumer. Each now has
// one recipe row (auto-subscribed through ACTION_VFX_EVENTS) and one resolver
// branch that anchors the record on the body the receipt actually names.
// A missing body fabricates nothing.

function fixture() {
  return {
    playerId: 1,
    entities: new Map([
      [1, { id: 1, alive: true, type: 'ship', pos: { x: 10, z: 20 }, radius: 6, rot: 0.5 }],
      [7, { id: 7, alive: true, type: 'ship', pos: { x: 100, z: -40 }, radius: 7, rot: 1.2 }],
      [8, { id: 8, alive: true, type: 'ship', pos: { x: 200, z: 60 }, radius: 8, rot: 0 }],
      [9, { id: 9, alive: true, type: 'ship', pos: { x: 260, z: 60 }, radius: 9, rot: 0 }],
      [10, { id: 10, alive: true, type: 'ship', pos: { x: -80, z: 120 }, radius: 6, rot: 2.1 }],
    ]),
  };
}

test('five previously silent events each have one authored recipe row', () => {
  for (const name of ['fields:thermalHit', 'survivorPod:huntEnded', 'traffic:anvilTransfer',
    'formation:discovered', 'cargo:parkedTransfer']) {
    const row = ADDITIONAL_ACTION_VFX_RECIPES[name];
    assert.ok(row, name);
    assert.ok(row.life > 0 && row.life < 1.2, name);
    assert.equal(row.continuous, false, name);
  }
});

test('a kilnback field burn marks the hull it is cooking, and nothing else', () => {
  const state = fixture();
  const receipt = resolveAdditionalActionVfxReceipt('fields:thermalHit',
    { fieldId: 'f1', attackId: 'a1', targetId: 10, selfBurn: false }, state);
  assert.equal(receipt.targetId, 10);
  assert.equal(receipt.attachToTarget, true);
  state.entities.delete(10);
  assert.equal(resolveAdditionalActionVfxReceipt('fields:thermalHit',
    { fieldId: 'f1', attackId: 'a1', targetId: 10 }, state), null, 'gone hull gets no fabricated burn');
});

test('a pod hunter standing down reads on the hunter, in its end reason', () => {
  const state = fixture();
  const receipt = resolveAdditionalActionVfxReceipt('survivorPod:huntEnded',
    { entityId: 42, hunterId: 7, reason: 'deadline' }, state);
  assert.equal(receipt.targetId, 7);
  assert.equal(receipt.kind, 'deadline');
  state.entities.delete(7);
  assert.equal(resolveAdditionalActionVfxReceipt('survivorPod:huntEnded',
    { entityId: 42, hunterId: 7, reason: 'deadline' }, state), null);
});

test('an anvil custody transfer runs from the source hull to the receiver', () => {
  const state = fixture();
  const receipt = resolveAdditionalActionVfxReceipt('traffic:anvilTransfer',
    { sourceId: 8, receiverId: 9, commodityId: 'cmdty_ore_shallow', qty: 5 }, state);
  assert.equal(receipt.targetId, 9);
  assert.equal(receipt.sourceId, 8);
  assert.deepEqual(receipt.direction, { x: 60, z: 0 });
  state.entities.delete(9);
  assert.equal(resolveAdditionalActionVfxReceipt('traffic:anvilTransfer',
    { sourceId: 8, receiverId: 9, qty: 5 }, state), null, 'no receiver, no transfer bead');
});

test('a formation discovery ticks at the player instrument, never at an invented place', () => {
  const state = fixture();
  const receipt = resolveAdditionalActionVfxReceipt('formation:discovered',
    { formationId: 'form_1', designation: 'The Choir Loft', count: 14 }, state);
  assert.equal(receipt.targetId, 1);
  assert.equal(receipt.sourceId, 1);
  state.entities.delete(1);
  assert.equal(resolveAdditionalActionVfxReceipt('formation:discovered',
    { formationId: 'form_1', count: 14 }, state), null);
});

test('a parked-hold transfer answers on the player hull with its units intact', () => {
  const state = fixture();
  const receipt = resolveAdditionalActionVfxReceipt('cargo:parkedTransfer',
    { shipIndex: 2, direction: 'toActive', movedUnits: 7 }, state);
  assert.equal(receipt.targetId, 1);
  assert.equal(receipt.movedUnits, 7);
  state.entities.get(1).alive = false;
  assert.equal(resolveAdditionalActionVfxReceipt('cargo:parkedTransfer',
    { shipIndex: 2, direction: 'toActive', movedUnits: 7 }, state), null, 'a dead hull shows no transfer');
});
