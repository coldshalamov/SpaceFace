// PB-IND-C — SF-102 power priority, SF-103 repair-parts offer without a spawned hull.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mulberry32 } from '../src/core/rng.js';
import { aperturePoint } from '../src/data/environmentalMachinery.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import {
  choosePowerPriority,
  createPowerBoard,
  deliverRepairParts,
  reserveRepairOrder,
  setPowerParticipants,
  stepPowerPriority,
} from '../src/systems/worldSiteRuntime.js';

const SEED = 4242;

function withInput(board, qty) {
  return {
    ...board,
    ops: board.ops.map((op) => ({ ...op, inputQty: op.demand > 0 ? qty : 0 })),
  };
}

test('two draws together refuse until a priority is chosen, and a switch keeps partial progress', () => {
  const simTime = mulberry32(SEED)() * 30;
  const both = withInput(setPowerParticipants(createPowerBoard({ simTime }), ['refine', 'sort']), 5);
  const refused = stepPowerPriority(both, 1);
  assert.equal(refused.refused, true);
  assert.equal(refused.reason, 'over-budget');
  assert.equal(refused.ops.every((op) => op.outputQty === 0), true);
  assert.equal(refused.ops.every((op) => op.inputQty === 5), true);
  assert.ok(refused.heat > both.heat);
  const refineOnly = withInput(setPowerParticipants(createPowerBoard({ simTime }), ['refine']), 4);
  const alone = stepPowerPriority(refineOnly, 2);
  assert.equal(alone.refused, false);
  assert.equal(alone.ops.find((op) => op.id === 'refine').outputQty, 2);
  assert.equal(alone.ops.find((op) => op.id === 'sort').outputQty, 0);
  const cooled = stepPowerPriority({ ...alone, heat: 0.4 }, 1);
  assert.ok(cooled.heat < 0.4);
  const prioritized = withInput(choosePowerPriority(setPowerParticipants(createPowerBoard({ simTime }), ['refine', 'sort']), 'refine'), 5);
  prioritized.ops.find((op) => op.id === 'refine').progress = 1.25;
  const stepped = stepPowerPriority(prioritized, 1);
  const refine = stepped.ops.find((op) => op.id === 'refine');
  const sort = stepped.ops.find((op) => op.id === 'sort');
  assert.equal(stepped.refused, false);
  assert.equal(refine.outputQty, 1);
  assert.ok(sort.outputQty > 0 && sort.outputQty < refine.outputQty);
  assert.ok(refine.progress > 1.25);
  const flipped = choosePowerPriority(stepped, 'sort');
  assert.equal(flipped.priorityId, 'sort');
  assert.equal(flipped.ops.find((op) => op.id === 'refine').progress, refine.progress);
  const unknown = choosePowerPriority(flipped, 'not-a-draw');
  assert.equal(unknown.priorityId, null);
});

test('repair parts are reserved once, substituted by the player, and not replaced when the carrier is lost', () => {
  const simTime = mulberry32(SEED)() * 80;
  let ledger = { repair: null, shortage: { status: 'open', closed: false, cause: 'halted' } };
  const reserved = reserveRepairOrder(ledger, {
    orderId: 'aperture-repair',
    commodityId: 'cmdty_scrap_metal',
    qty: 4,
    sourceId: 'station_ceres',
    destId: 'ceres_refinery_hangar_aperture',
    simTime,
  });
  ledger = reserved.ledger;
  const again = reserveRepairOrder(ledger, {
    orderId: 'aperture-repair',
    commodityId: 'cmdty_scrap_metal',
    qty: 4,
    sourceId: 'station_ceres',
    simTime,
  });
  assert.equal(again.duplicate, true);
  assert.equal(again.ledger, ledger);
  assert.equal(ledger.repair.qty, 4);
  assert.equal(ledger.repair.spawned, false);
  assert.equal(ledger.repair.trafficIntent.ownerNotCalled, 'src/systems/traffic.js');
  const player = deliverRepairParts(ledger, {
    orderId: 'aperture-repair',
    receiptId: 'player-sub',
    commodityId: 'cmdty_scrap_metal',
    qty: 3,
    carrier: 'player',
  });
  assert.equal(player.consumed, 3);
  assert.equal(player.order.received, 3);
  assert.equal(player.order.status, 'partial');
  const saved = JSON.parse(JSON.stringify(player.ledger));
  const convoy = deliverRepairParts(saved, {
    orderId: 'aperture-repair',
    receiptId: 'convoy-1',
    commodityId: 'cmdty_scrap_metal',
    qty: 4,
    carrier: 'station_ceres',
  });
  assert.equal(convoy.consumed, 1);
  assert.equal(convoy.surplus, 3);
  assert.equal(convoy.order.received, 4);
  assert.equal(convoy.order.status, 'repaired');
  assert.equal(convoy.spawned, false);
  assert.equal(convoy.ledger.shortage.closed, true);
  const replay = deliverRepairParts(convoy.ledger, {
    orderId: 'aperture-repair',
    receiptId: 'convoy-1',
    commodityId: 'cmdty_scrap_metal',
    qty: 4,
    carrier: 'station_ceres',
  });
  assert.equal(replay.duplicate, true);
  assert.equal(replay.consumed, 0);
  assert.equal(replay.ledger.repair.received, 4);
  let lostLedger = reserveRepairOrder({ repair: null }, {
    orderId: 'other-repair',
    commodityId: 'cmdty_scrap_metal',
    qty: 4,
    sourceId: 'station_ceres',
    simTime,
  }).ledger;
  const partial = deliverRepairParts(lostLedger, {
    orderId: 'other-repair',
    receiptId: 'partial',
    commodityId: 'cmdty_scrap_metal',
    qty: 1,
    carrier: 'player',
  });
  const lost = deliverRepairParts(partial.ledger, {
    orderId: 'other-repair',
    receiptId: 'wrecked',
    commodityId: 'cmdty_scrap_metal',
    qty: 3,
    carrier: 'hauler-9',
    lost: true,
  });
  assert.equal(lost.reason, 'convoy-lost');
  assert.equal(lost.order.received, 1);
  assert.equal(lost.order.status, 'incomplete');
  assert.equal(lost.recoverable, true);
  assert.equal(lost.spawned, false);
  const wrong = deliverRepairParts(partial.ledger, {
    orderId: 'other-repair',
    receiptId: 'wrong-goods',
    commodityId: 'cmdty_ore_iron',
    qty: 4,
    carrier: 'player',
  });
  assert.equal(wrong.reason, 'incompatible');
  assert.equal(wrong.consumed, 0);
  assert.equal(wrong.order.received, 1);
});

test('a jammed hangar records the repair offer and sorting job on the site result', () => {
  const priorLedger = environmentalMachinery._industryLedger;
  const priorResult = environmentalMachinery._industrySiteResult;
  const priorOccupant = environmentalMachinery._apertureLastOccupant;
  const priorDelivery = environmentalMachinery._apertureDeliveryCandidate;
  try {
    environmentalMachinery._industryLedger = null;
    environmentalMachinery._industrySiteResult = null;
    environmentalMachinery._apertureDeliveryCandidate = null;
    environmentalMachinery._apertureLastOccupant = {
      id: 'jam-body',
      alive: true,
      pos: aperturePoint(0, 0),
      vel: { x: 0, z: 0 },
      radius: 12,
      data: { amount: 2, commodityId: 'cmdty_scrap', cargoClass: 'scrap' },
    };
    environmentalMachinery._publishApertureIndustry({ simTime: mulberry32(SEED)() * 50 }, { phase: 'jam', occupied: true });
    const site = environmentalMachinery._industrySiteResult;
    assert.equal(site.repairOffer.spawned, false);
    assert.equal(site.repairOffer.ownerNotCalled, 'src/systems/traffic.js');
    assert.equal(site.repairOffer.qty, 4);
    assert.equal(site.sortingJob.status, 'open');
    assert.equal(site.shortage.cause, 'receiver-jam');
    assert.equal(site.shortage.marketOwnerNotCalled, 'src/systems/economy.js');
    assert.equal(environmentalMachinery._industryLedger.stored, 0);
    assert.equal(environmentalMachinery.chooseAperturePower('refine'), 'refine');
    assert.equal(environmentalMachinery._industryLedger.power.priorityId, 'refine');
    environmentalMachinery._publishApertureIndustry({ simTime: 4 }, { phase: 'jam', occupied: true });
    assert.equal(environmentalMachinery._industryLedger.repair.qty, 4);
  } finally {
    environmentalMachinery._industryLedger = priorLedger;
    environmentalMachinery._industrySiteResult = priorResult;
    environmentalMachinery._apertureLastOccupant = priorOccupant;
    environmentalMachinery._apertureDeliveryCandidate = priorDelivery;
  }
});
