import assert from 'node:assert/strict';
import test from 'node:test';

import * as partsLibrary from '../src/render/partsLibrary.js';
import { MODULES } from '../src/data/modules.js';

const MODULE_BY_ID = new Map(MODULES.map((m) => [m.id, m]));

function shipEntity(defId, fittings = []) {
  return {
    id: `test_${defId}`,
    type: 'ship',
    team: 0,
    factionId: 'faction_free',
    radius: 14,
    data: { defId, fittings: fittings.slice(), weapons: [] },
  };
}

// RC-37: a module that grants a verb always reads on the hull — the outfit-budget
// threshold filters passive hardware, not the thing the player does.

test('verb modules bypass the 15% outfit-budget floor', () => {
  const kestrel = partsLibrary.visibleFittingsForEntity(shipEntity('ship_kestrel', [
    'mod_veil_step', 'mod_tractor_beam_m', 'mod_triangulation_suite_s',
  ]));
  const ids = kestrel.modules.map((m) => m.id);
  assert.ok(ids.includes('mod_veil_step'), 'blink module mounts under the floor');
  assert.ok(ids.includes('mod_tractor_beam_m'), 'tow module mounts under the floor');
  assert.ok(!ids.includes('mod_triangulation_suite_s'), 'passive module still filtered');
  assert.equal(kestrel.modules.find((m) => m.id === 'mod_veil_step').verb, true);
});

test('a light verb module mounts even on a heavy hull', () => {
  const atlas = partsLibrary.visibleFittingsForEntity(shipEntity('ship_atlas', [
    'mod_tractor_beam_m', 'mod_shield_aegis_l',
  ]));
  const ids = atlas.modules.map((m) => m.id);
  assert.ok(ids.includes('mod_tractor_beam_m'), '4t tow head bolts onto a 19.5t-floor hull');
  assert.ok(!ids.includes('mod_shield_aegis_l'), '14t passive shield still under the floor');
});

test('mining hardware counts as a verb module', () => {
  assert.equal(partsLibrary.moduleGrantsVerb(MODULE_BY_ID.get('mod_mining_laser_s')), true);
  assert.equal(partsLibrary.moduleGrantsVerb(MODULE_BY_ID.get('mod_cargo_pod_m')), false);
});

test('a Forge whole-ship hull cooks its verb module part files', () => {
  const plan = partsLibrary.authoredPreloadPlanForEntity(shipEntity('ship_kestrel', [
    'mod_tractor_beam_m',
  ]));
  const cooked = [...(plan.pod || []), ...(plan.greeble || [])];
  assert.ok(cooked.length > 0, `expected verb part files in the plan, got ${JSON.stringify(plan)}`);
  assert.ok((plan.hull || [])[0]?.startsWith('wholeships/'), 'kestrel resolves a Forge body');

  const passive = partsLibrary.authoredPreloadPlanForEntity(shipEntity('ship_kestrel', [
    'mod_shield_aegis_l',
  ]));
  assert.deepEqual(Object.keys(passive), ['hull'], 'passive fit keeps the hull-only plan');
});
