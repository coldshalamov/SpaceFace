import test from 'node:test';
import assert from 'node:assert/strict';
import { planSiteVisit, summarizeIndustryCargo } from '../src/systems/siteIndustryPlanner.js';
import { SITE_MACHINES } from '../src/data/sites.js';
import { COMMODITIES } from '../src/data/commodities.js';

test('a new pilot gets a complete priced shopping list and Core-first construction order', () => {
  const plan = planSiteVisit('first_claim');
  const expected = {};
  for (const id of ['sm_massline_core', 'sm_extractor']) {
    for (const [good, count] of Object.entries(SITE_MACHINES.find((machine) => machine.id === id).cost)) {
      expected[good] = (expected[good] || 0) + count;
    }
  }
  assert.deepEqual(plan.grossManifest, expected);
  assert.deepEqual(plan.missing, expected);
  assert.deepEqual(plan.buildOrder, [
    { machineId: 'sm_massline_core', count: 1 },
    { machineId: 'sm_extractor', count: 1 },
  ]);
  const estimate = summarizeIndustryCargo(plan.missing, COMMODITIES);
  assert.ok(estimate.complete && estimate.volume > 0 && estimate.nominalValue > 0);
  assert.equal(plan.ready, false);
});

test('returning with a Core and some cargo narrows the next purchase without losing the full kit reference', () => {
  const fullKit = planSiteVisit('first_claim').grossManifest;
  const plan = planSiteVisit('first_claim', {
    machines: [{ defId: 'sm_massline_core' }],
    cargo: { cmdty_control_unit: 1, cmdty_regocrete: 1, cmdty_refined_metals: 200 },
  });
  assert.deepEqual(plan.grossManifest, fullKit);
  assert.deepEqual(plan.buildOrder, [{ machineId: 'sm_extractor', count: 1 }]);
  assert.deepEqual(plan.missing, { cmdty_regocrete: 1 });
  assert.deepEqual(plan.packed, { cmdty_control_unit: 1, cmdty_regocrete: 1 });
});

test('a fully installed first claim asks for no more purchases or construction', () => {
  const plan = planSiteVisit('first_claim', {
    machines: [{ defId: 'sm_massline_core' }, { defId: 'sm_extractor' }],
  });
  assert.deepEqual(plan.missing, {});
  assert.deepEqual(plan.buildOrder, []);
  assert.ok(plan.ready);
  // Having built the kit must not masquerade as verified power, access or production.
  assert.equal(plan.placementValidated, false);
});

test('advancing to refining reuses installed equipment and supplied cargo', () => {
  const machines = [{ defId: 'sm_massline_core' }, { defId: 'sm_extractor' }];
  const manifest = planSiteVisit('refining', { machines }).manifest;
  const plan = planSiteVisit('refining', { machines, cargo: manifest });
  assert.deepEqual(plan.buildOrder, [
    { machineId: 'sm_extractor', count: 1 },
    { machineId: 'sm_gas_tap', count: 1 },
    { machineId: 'sm_refinery', count: 2 },
  ]);
  assert.deepEqual(plan.missing, {});
  assert.ok(plan.ready);
  assert.ok(plan.minimumGasContacts > 0);
});
