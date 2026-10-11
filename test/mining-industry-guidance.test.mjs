import test from 'node:test';
import assert from 'node:assert/strict';
import { planSiteVisit } from '../src/systems/siteIndustryPlanner.js';
import { ghostLensModel, machineLensModel, tileLensModel, placementReason } from '../src/ui/asteroid/inspector.js';
import { contactProfile } from '../src/systems/siteProduction.js';

test('a returning builder imports only missing machines and goods absent from the hold', () => {
  const cargo = { cmdty_regocrete: 1, cmdty_control_unit: 1 };
  const machines = [{ defId: 'sm_massline_core' }];
  const before = JSON.stringify({ machines, cargo });
  const plan = planSiteVisit('first_claim', { machines, cargo });
  assert.deepEqual(plan.missingMachines, { sm_extractor: 1 });
  assert.deepEqual(plan.missing, { cmdty_regocrete: 1 });
  assert.deepEqual(plan.packed, { cmdty_control_unit: 1, cmdty_regocrete: 1 });
  assert.equal(plan.ready, false);
  assert.equal(JSON.stringify({ machines, cargo }), before);
  assert.equal(planSiteVisit('first_claim', { machines: [...machines, { defId: 'sm_extractor' }] }).ready, true);
});

test('a first Core names its missing materials even before the build palette exists', () => {
  const lens = ghostLensModel('sm_massline_core', { ok: false, reason: 'materials',
    missing: { cmdty_control_unit: 1, cmdty_regocrete: 4 } });
  assert.match(lens.body, /1 Machine control unit/);
  assert.match(lens.body, /4 Regocrete/);
});

test('placement preview shows permanent output and power from actual neighboring faces', () => {
  const field = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ type: 'empty' })));
  field[0][0] = { type: 'vein', ore: 'cmdty_ore_iron' };
  field[2][0] = { type: 'gas' };
  const profile = contactProfile(field, 1, 1, 3, 3);
  const extractor = ghostLensModel('sm_extractor', { ok: true, profile });
  assert.match(extractor.body, /Iron.*\/min/);
  assert.match(extractor.numerals, /−6 MW/);
  const gas = ghostLensModel('sm_gas_tap', { ok: true, profile });
  assert.match(gas.numerals, /\+8 MW/);
  assert.match(placementReason({ reason: 'no-access-route' }), /connected tunnel/);
});

test('blocked production never displays the theoretical extractor yield as live output', () => {
  const model = machineLensModel({ defId: 'sm_extractor', powerRatio: 1,
    capability: { outputsPerMin: { cmdty_ore_iron: 8 }, powerDraw: 6 },
    status: { state: 'backlogged', ratePerMin: {} } });
  assert.equal(model.numerals, '0u/min');
  const running = machineLensModel({ defId: 'sm_refinery',
    status: { state: 'running', ratePerMin: { cmdty_refined_metals: 0.7 } } });
  assert.match(running.numerals, /0.7u\/min/);
});

test('gas and veins explain preservation before the player destroys a face', () => {
  assert.match(tileLensModel({ tile: { type: 'gas' } }).body, /power or fuel/);
  assert.match(tileLensModel({ tile: { type: 'vein', ore: 'cmdty_ore_iron' } }).body, /Preserve:.*per extractor/);
});
