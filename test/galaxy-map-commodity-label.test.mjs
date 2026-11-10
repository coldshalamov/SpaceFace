import test from 'node:test';
import assert from 'node:assert/strict';
import { commodityMapLabel } from '../src/ui/galaxyMap.js';

test('the map names a commodity by its catalog name, never a half-replaced id', () => {
  assert.equal(commodityMapLabel('cmdty_dmc_black_box'), 'DMC FLIGHT RECORDER');
  assert.equal(commodityMapLabel('cmdty_glass_back_scale'), 'GLASSBACK SCALE PLATE');
  assert.equal(commodityMapLabel('cmdty_not_in_catalog_yet'), 'NOT IN CATALOG YET');
  assert.equal(commodityMapLabel(null), '');
});
