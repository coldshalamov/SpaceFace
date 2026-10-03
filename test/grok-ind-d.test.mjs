// PB-IND-D — SF-095 lot lineage and SF-111 custody after a split. Scan text is site data.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mulberry32 } from '../src/core/rng.js';
import {
  deliverLot,
  evaluateReceiverAcceptance,
  loseLot,
  lotScanSentence,
  recoverLot,
  splitLot,
  stampLot,
} from '../src/systems/worldSiteRuntime.js';

const SEED = 4242;

function accounted(lot) {
  return lot.qty + lot.delivered + lot.lost;
}

test('a lot stays legible through a split, a loss, and a scan that does not mint goods', () => {
  const simTime = mulberry32(SEED)();
  const source = stampLot({
    lotId: `lot-${SEED}`,
    originSiteId: 'world_site_ceres_cinder_sluice',
    commodityId: 'cmdty_ore_iron',
    qty: 10,
    owner: 'player',
    simTime,
  });
  const split = splitLot(source, { takenQty: 4, disputed: true, newOwner: 'raider', childLotId: `lot-${SEED}#stolen` });
  assert.equal(accounted(split.parent) + accounted(split.child), 10);
  const damaged = loseLot(split.parent, 2);
  const delivery = deliverLot(damaged, 6);
  assert.equal(delivery.sold, 4);
  assert.equal(accounted(delivery.lot) + accounted(split.child), 10);
  const sentence = lotScanSentence(delivery.lot);
  assert.equal(lotScanSentence(delivery.lot), sentence);
  assert.equal(delivery.lot.qty, 0);
  assert.match(sentence, /cmdty_ore_iron/);
  assert.match(sentence, /world_site_ceres_cinder_sluice/);
  assert.match(sentence, /owned/);
  const stolenTry = deliverLot(split.child, 4);
  assert.equal(stolenTry.sold, 0);
  const recovered = deliverLot(recoverLot(split.child), 4);
  assert.equal(recovered.sold, 4);
  const other = stampLot({
    lotId: `lot-${SEED}-other`,
    originSiteId: 'player-hold',
    commodityId: 'cmdty_ore_iron',
    qty: 3,
    owner: 'player',
  });
  const unrelated = deliverLot(other, 3);
  assert.equal(unrelated.sold, 3);
  assert.equal(accounted(delivery.lot) + accounted(split.child), 10);
  let child = source;
  for (let i = 0; i < 6; i += 1) {
    const next = splitLot(child, { takenQty: 1, childLotId: `${source.lotId}#${i}` });
    child = next.child;
  }
  assert.ok(child.lineage.length <= 4);
  const contact = evaluateReceiverAcceptance({
    phase: 'open',
    entered: true,
    relativeSpeed: 4,
    quantity: delivery.lot.delivered,
    capacity: 8,
    stored: 0,
    mouthHalfWidth: 34,
    bodyRadius: 4,
    commodityId: source.commodityId,
    lot: source,
    payloadPos: { x: 1, z: 2 },
  });
  assert.equal(contact.successCredit, true);
  assert.match(contact.scanSentence, /lot-4242/);
  assert.match(contact.scanSentence, /10 owned/);
});
