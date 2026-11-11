// words-authored-names — two owners that always printed ids now print the authored names.
//
// Most name helpers try the catalog first and de-snake the id only when the lookup misses. Two
// never looked at all: claims' materialName turned every good into its lowercase id ("10u ore
// iron, 2u alloys" on the defense receipt, "Need 3 more ore iron for …" on the craft refusal),
// and the cause ledger's hauler-lane why-line named both berths as ids ("Your hauler lane
// ceres→helios …"). Both read the authored names now ("Iron Ore", "Ceres Refinery"); the id
// fallback survives only for something the catalog no longer carries.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { lanePressureLine } from '../src/ui/causeLedger.js';

test('the hauler-lane why-line names both berths as the chart does', () => {
  const state = {
    automation: {
      traders: [{ lastReceipt: { result: 'paid', good: 'cmdty_ore_iron', from: 'station_ceres', to: 'station_helios', n: 4 } }],
    },
  };
  const line = lanePressureLine(state, 'station_ceres', 'cmdty_ore_iron');
  assert.ok(line, 'the lane pressure is named');
  assert.ok(line.includes('Ceres Refinery→Helios Station'), line);
  assert.ok(!/\bceres\b→|→helios\b/.test(line), 'no lowercase id remnants');

  const uncatalogued = lanePressureLine({
    automation: { traders: [{ lastReceipt: { result: 'paid', good: 'g', from: 'station_lost_berth', to: 'station_ceres', n: 1 } }] },
  }, 'station_ceres', 'g');
  assert.ok(uncatalogued.includes('lost berth→Ceres Refinery'), 'an uncatalogued berth still reads as words');
});

test('claims name materials by their authored commodity names', async () => {
  // materialName is module-private; the receipt builder that uses it is exercised through the
  // owner's source contract here and the live catalog lookup below.
  const source = readFileSync(new URL('../src/systems/claims.js', import.meta.url), 'utf8');
  assert.match(source, /const CLAIM_MATERIAL_NAME = new Map\(\(COMMODITIES \|\| \[\]\)/,
    'the catalog map is built once from the live commodity catalog');
  const body = source.slice(source.indexOf('function materialName(id)'));
  assert.ok(body.indexOf('CLAIM_MATERIAL_NAME.get(id)') > -1
    && body.indexOf('CLAIM_MATERIAL_NAME.get(id)') < body.indexOf("replace(/^cmdty_/"),
    'the authored name is tried before the id fallback');
  const { COMMODITIES } = await import('../src/data/commodities.js');
  const iron = COMMODITIES.find((row) => row.id === 'cmdty_ore_iron');
  assert.equal(iron && iron.name, 'Iron Ore', 'the name the receipt now prints');
});
