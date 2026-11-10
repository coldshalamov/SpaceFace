import test from 'node:test';
import assert from 'node:assert/strict';

import {
  salvageTenderRequiresAuthoredHull,
  salvageTenderWholeShipVisual,
} from '../src/features/salvageTender/visualIdentity.js';
import {
  salvageTenderRequiresAuthoredHull as readModelRequiresAuthoredHull,
  salvageTenderWholeShipVisual as readModelWholeShipVisual,
} from '../src/features/salvageTender/readModel.js';
import {
  requiresProductionWholeShipForEntity,
  wholeShipVisualForEntity,
} from '../src/render/partsLibrary.js';

test('tender visual identity stays pure and keeps read-model compatibility bindings', () => {
  assert.strictEqual(readModelWholeShipVisual, salvageTenderWholeShipVisual);
  assert.strictEqual(readModelRequiresAuthoredHull, salvageTenderRequiresAuthoredHull);

  const tender = {
    type: 'ship',
    data: { persistenceOwner: 'salvageTender', salvageTenderBody: 'tender' },
  };
  const visual = salvageTenderWholeShipVisual(tender);
  assert.deepEqual(visual, {
    file: 'wholeships/repair_tender.glb',
    assetId: 'SF_WHOLESHIP_REPAIR_TENDER',
    roleId: 'personal_salvage_tender',
    required: true,
  });
  assert.strictEqual(salvageTenderWholeShipVisual(tender), visual);
  assert.strictEqual(wholeShipVisualForEntity(tender), visual);
  assert.equal(salvageTenderRequiresAuthoredHull(tender), true);
  assert.equal(requiresProductionWholeShipForEntity(tender), true);
  assert.equal(salvageTenderWholeShipVisual({
    ...tender,
    data: { ...tender.data, salvageTenderBody: 'rack' },
  }), null);
  assert.equal(salvageTenderRequiresAuthoredHull({ type: 'ship', data: { persistenceOwner: 'traffic' } }), false);
});
