// NXI-020 — after an accepted split, the remainder is still the same named
// recovered shipment, not an anonymous generic pickup.
//
// The named owner seam is src/systems/cargo.js: its pickup:collected subscription
// accepts only what the hold can take and writes the accepted provenance receipt;
// the physical collection owner (src/core/physics.js _applyPickupCollection) then
// writes the rejected remainder onto the SAME body. This drives that real path on
// the real bus: a named recovered-shipment pod whose 12-unit lot a hold can only
// take 5 of keeps its name, world record, custody identity and rich-lot provenance
// on the remaining 7. The accepted side is identifiable in the hold too
// (cargo.richLots carries the parent lot id + provenance).
// Neighboring success: once the hold has room, the same body collects in full.
// Seed 4242, deterministic — no wall-clock reads anywhere on this path.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { physics } from '../src/core/physics.js';
import { cargo } from '../src/systems/cargo.js';

const SEED = 4242;
const CMDTY = 'cmdty_scrap_metal'; // volPerU 1.0 — capVolume maps 1:1 onto units

function harness({ capVolume = 5 } = {}) {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.simTime = 42;
  const player = {
    id: 1, type: 'ship', alive: true, collides: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 12, mass: 40,
  };
  state.playerId = player.id;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume, capMass: 999 };
  // The recovered shipment: one physical body with a name, a world record, a
  // custody stamp and a provenance lot — the fields a "same shipment" is told by.
  // Shape note: production physics contact-collects only type 'pickup' bodies
  // (isLivePickup, physics.js) — manifest 'payload' bodies collect through the
  // mining._collectPayload scoop path instead, so the pod wears the honest type.
  const pod = {
    id: 2, type: 'pickup', alive: true, collides: true,
    pos: { x: 4, z: 0 }, vel: { x: 0, z: 0 }, radius: 3, mass: 8,
    data: {
      kind: 'cargo',
      commodityId: CMDTY,
      amount: 12,
      name: 'Raid Spill Crate',
      worldRecordId: 'spill:4242:1',
      cargoIdentity: {
        ownerId: 'lane_mira_bluepack',
        ownerName: 'Mira Bluepack',
        originId: 'station_ceres',
        destinationId: 'station_helios_prime',
      },
      richLotSource: {
        lotId: 'spill-lot:4242',
        provenanceId: 'prov:raid-spill',
        richQty: 12,
        sourceKind: 'recovered',
        sourcePoiId: 'poi_raid_1',
      },
    },
  };
  state.entities.set(player.id, player);
  state.entities.set(pod.id, pod);
  state.entityList = [player, pod];
  const bus = createBus();
  const receipts = [];
  bus.on('pickup:collected', (payload) => receipts.push(payload));
  const hold = Object.create(cargo);
  hold.init({ state, bus, helpers: {} });
  const phys = Object.create(physics);
  phys._diag = { pickupCollections: 0 };
  return { state, bus, hold, phys, player, pod, receipts };
}

test('NXI-020: a partially-delivered recovered shipment keeps its name on the remainder', () => {
  const h = harness({ capVolume: 5 });
  const collected = h.phys._applyPickupCollection(h.pod, h.player, h.bus, h.state);
  assert.equal(collected, true, 'the first delivery accepted contact');

  // The split: 5 delivered into the hold, 7 still in the world.
  assert.equal(h.receipts.length, 1);
  const receipt = h.receipts[0];
  assert.equal(receipt.acceptedAmount, 5);
  assert.equal(receipt.rejectedAmount, 7);
  assert.equal(h.state.player.cargo.items[CMDTY], 5, 'the accepted units are aboard');
  assert.equal(h.pod.data.amount, 7, 'the remainder reconciles: 5 delivered + 7 left = 12');

  // The check: the remainder is the SAME recovered shipment, not a renamed generic.
  assert.equal(h.pod.alive, true, 'the remainder stays a physical load');
  assert.equal(h.pod.data.name, 'Raid Spill Crate',
    'the residual load keeps the recovered shipment name');
  assert.equal(h.pod.data.worldRecordId, 'spill:4242:1', 'the world-record identity survived');
  assert.equal(h.pod.data.cargoIdentity.ownerName, 'Mira Bluepack', 'the custody stamp survived');
  assert.equal(h.pod.data.richLotSource.lotId, 'spill-lot:4242', 'the parent lot id survived');
  assert.equal(h.pod.data.richLotSource.provenanceId, 'prov:raid-spill',
    'the provenance id survived the split');
  assert.equal(h.pod.data.richLotSource.richQty, 7,
    'the rich mirror holds only the units still physically present: 12 offered − 5 accepted');

  // The accepted side is identifiable as the same shipment too, not a generic lot.
  const lot = (h.state.player.cargo.richLots || []).find((row) => row.lotId === 'spill-lot:4242');
  assert.ok(lot, 'the held units carry the parent lot id');
  assert.equal(lot.provenanceId, 'prov:raid-spill');
  assert.equal(lot.qty, 5, 'the held rich lot records the accepted fraction');
  assert.equal(receipt.lotSource.provenanceId, 'prov:raid-spill',
    'the acceptance receipt names the same provenance');
  assert.equal(receipt.lotSource.lotQty, 5);
});

test('NXI-020: a hold with no room delivers nothing and the shipment keeps every identity field', () => {
  const h = harness({ capVolume: 0 });
  const collected = h.phys._applyPickupCollection(h.pod, h.player, h.bus, h.state);
  assert.equal(collected, false, 'zero accepted units is not a collection');
  const receipt = h.receipts[0];
  assert.equal(receipt.acceptedAmount, 0);
  assert.equal(receipt.rejectedAmount, 12);
  assert.equal(h.state.player.cargo.items[CMDTY] || 0, 0, 'nothing forced its way aboard');
  assert.equal(h.pod.alive, true);
  assert.equal(h.pod.data.amount, 12, 'the whole shipment is still in the world');
  assert.equal(h.pod.data.name, 'Raid Spill Crate', 'still the same named shipment');
  assert.equal(h.pod.data.richLotSource.lotId, 'spill-lot:4242');
});

test('NXI-020: once the hold has room the same remainder collects in full', () => {
  const h = harness({ capVolume: 5 });
  h.phys._applyPickupCollection(h.pod, h.player, h.bus, h.state);
  assert.equal(h.pod.data.amount, 7);

  // Same body, hold now has room: the neighboring success collects the remainder
  // once — the body dies only because it is empty.
  h.state.player.cargo.capVolume = 20;
  h.state.simTime += 1; // past the retry embargo the honest refusal stamped
  const collected = h.phys._applyPickupCollection(h.pod, h.player, h.bus, h.state);
  assert.equal(collected, true, 'the remainder is still a valid shipment');
  const last = h.receipts[h.receipts.length - 1];
  assert.equal(last.acceptedAmount, 7, 'the named remainder delivered, not a generic quantity');
  assert.equal(h.pod.alive, false, 'an emptied shipment leaves the world');
  assert.equal(h.state.player.cargo.items[CMDTY], 12, '5 + 7 reconciles to the starting lot');
});
