// RC-04 — no more '+N Item'. A pickup that is not a cargo commodity resolves its REAL label —
// run credits for the pods whose `amount` is a credit figure, the def's own name for a module
// drop — or floats nothing at all. 'Item' and a leaked raw id are receipt bugs, not labels.
import test from 'node:test';
import assert from 'node:assert/strict';

import { pickupFloatingTextSpec } from '../src/ui/floatingText.js';
import { SWARM_EVENT_POD_KIND } from '../src/systems/swarmEvents.js';
import { MILL_ORE_KIND, MILL_ORE_CREDITS } from '../src/systems/asteroidMillArena.js';
import { SWARM_REPAIR_KIND } from '../src/systems/swarmSupply.js';

// The exact payload shape physics.emitPickupCollected publishes: kind/amount/commodityId
// mirrored off the body's data, nothing else.
function pod(kind, amount, extra = {}) {
  return { pickupId: 1, collectorId: 1, kind, amount, pos: { x: 0, z: 0 }, ...extra };
}

test('the swarm supply pod floats its run-credit worth — the "+10 Item" from the baseline', () => {
  const spec = pickupFloatingTextSpec(pod(SWARM_EVENT_POD_KIND, 10));
  assert.ok(spec);
  assert.equal(spec.text, '+10 cr', 'the pod pays run credits, so it reads like a credit chip');
  assert.equal(spec.cls, 'sf-ft--credits');
});

test('the mill arena\u2019s ore reads as the credits it awards', () => {
  const spec = pickupFloatingTextSpec(pod(MILL_ORE_KIND, MILL_ORE_CREDITS));
  assert.ok(spec);
  assert.equal(spec.text, `+${MILL_ORE_CREDITS} cr`);
  assert.equal(spec.cls, 'sf-ft--credits');
});

test('the repair cell floats nothing — its heal toast is already the receipt', () => {
  assert.equal(pickupFloatingTextSpec(pod(SWARM_REPAIR_KIND, 1)), null);
});

test('"Item" never renders: unlabelled and unrecognised payloads float nothing', () => {
  // No commodityId at all (the old 'Item' fallback).
  assert.equal(pickupFloatingTextSpec(pod('cargo', 2)), null);
  assert.equal(pickupFloatingTextSpec({ amount: 2 }), null);
  // An id that resolves in no catalogue never leaks raw.
  assert.equal(pickupFloatingTextSpec(pod('cargo', 2, { commodityId: 'cmdty_not_real' })), null);
  assert.equal(pickupFloatingTextSpec(pod('module', 1, { commodityId: 'module_fixture' })), null);
});

test('commodity pickups keep their catalogue names', () => {
  const ore = pickupFloatingTextSpec(pod('ore', 3, { commodityId: 'cmdty_ore_iron' }));
  assert.equal(ore.text, '+3 Iron Ore');
  assert.equal(ore.cls, 'sf-ft--ore');
  const scrap = pickupFloatingTextSpec(pod('cargo', 2, { commodityId: 'cmdty_scrap_metal' }));
  assert.equal(scrap.text, '+2 Scrap Metal');
});

test('a module drop names its real def, not its raw id', () => {
  const spec = pickupFloatingTextSpec(pod('module', 1, { commodityId: 'wpn_siege_lance_l' }));
  assert.ok(spec);
  assert.equal(spec.text, '+1 Siege Lance L');
  assert.equal(spec.cls, 'sf-ft--module');
});

test('credit chips and salvage rights are unchanged', () => {
  const chip = pickupFloatingTextSpec(pod('credit_chip', 40, { credits: 40 }));
  assert.equal(chip.text, '+40 cr');
  const rights = pickupFloatingTextSpec(pod('salvage_rights', 2, { salvageRights: 2 }));
  assert.equal(rights.text, '+2 SALVAGE RIGHTS');
});

test('nothing in the spec can produce the word Item', () => {
  for (const payload of [
    pod(SWARM_EVENT_POD_KIND, 10),
    pod(MILL_ORE_KIND, 9),
    pod(SWARM_REPAIR_KIND, 1),
    pod('cargo', 5),
    pod('module', 1, { commodityId: 'wpn_siege_lance_l' }),
    pod('ore', 3, { commodityId: 'cmdty_ore_iron' }),
  ]) {
    const spec = pickupFloatingTextSpec(payload);
    assert.equal(spec == null || !/Item/i.test(spec.text), true,
      `payload ${JSON.stringify(payload)} produced ${spec && spec.text}`);
  }
});
