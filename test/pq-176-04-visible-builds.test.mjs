import assert from 'node:assert/strict';
import test from 'node:test';

import * as partsLibrary from '../src/render/partsLibrary.js';
import { SHIPS } from '../src/data/ships.js';
import { MODULES } from '../src/data/modules.js';

const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));
const MODULE_BY_ID = new Map(MODULES.map((module) => [module.id, module]));

function shipEntity(defId, fittings = [], weapons = []) {
  return {
    id: `test_${defId}`,
    type: 'ship',
    team: 0,
    factionId: 'faction_free',
    radius: 14,
    data: { defId, fittings: fittings.slice(), weapons: weapons.slice() },
  };
}

test('a module worth at least 15% of the outfit budget mounts on the hull', () => {
  // Kestrel: outfitSpace 20 → threshold 3t. Aegis L (14t) and the boundary Shield Booster S
  // (3t, exactly 15%) both qualify; the 2t survey suite does not.
  const view = partsLibrary.visibleFittingsForEntity(shipEntity('ship_kestrel', [
    'wpn_pulse_laser_s', 'mod_shield_aegis_l', 'mod_engine_ion_m',
    'mod_cargo_pod_m', 'mod_mining_laser_s', 'mod_triangulation_suite_s', 'mod_thruster_stock_s',
  ]));
  const mounted = view.modules.map((module) => module.id);
  assert.ok(mounted.includes('mod_shield_aegis_l'), 'Aegis L should bolt onto the hull');
  assert.ok(mounted.includes('mod_cargo_pod_m'), 'Cargo Pod M (4t >= 3t) should show');
  assert.ok(!mounted.includes('mod_triangulation_suite_s'), '2t module stays below the floor');
  assert.ok(!mounted.includes('mod_engine_ion_m'), 'the drive reads through glow, not a pod');
  assert.ok(!mounted.includes('mod_thruster_stock_s'), 'massless stock RCS never qualifies');

  const aegis = view.modules.find((module) => module.id === 'mod_shield_aegis_l');
  assert.equal(aegis.file, 'greebles/greeble_antennas.glb');
  assert.deepEqual(aegis.sockets.map((socket) => socket.name), ['SOCKET_Utility_Dorsal']);
});

test('the budget floor is relative to the hull, not an absolute mass', () => {
  // Atlas hauler: outfitSpace 130 → threshold 19.5t; the same 14t shield stays invisible.
  const heavy = partsLibrary.visibleFittingsForEntity(shipEntity('ship_atlas', [
    'mod_shield_aegis_l', 'mod_cargo_expander_l',
  ]));
  assert.equal(heavy.modules.length, 0);

  // Boundary: exactly 15% counts as visible (>=, not >).
  const kestrel = SHIP_BY_ID.get('ship_kestrel');
  const boundary = partsLibrary.visibleFittingsForEntity(shipEntity('ship_kestrel', [
    'mod_shield_booster_s',
  ]));
  const booster = MODULE_BY_ID.get('mod_shield_booster_s');
  assert.ok(booster.mass / kestrel.outfitSpace >= 0.15 - 1e-9);
  assert.ok(boundary.modules.some((module) => module.id === 'mod_shield_booster_s'));
});

test('thrusters bristle as a mirrored RCS pair; cargo hangs ventral; mining rides the bow', () => {
  const view = partsLibrary.visibleFittingsForEntity(shipEntity('ship_kestrel', [
    'mod_thruster_vernier_m', 'mod_cargo_expander_l', 'mod_mining_pulverizer_l',
  ]));
  const thruster = view.modules.find((module) => module.id === 'mod_thruster_vernier_m');
  assert.deepEqual(
    thruster.sockets.map((socket) => socket.name),
    ['SOCKET_RCS_Port', 'SOCKET_RCS_Starboard'],
  );
  const cargo = view.modules.find((module) => module.id === 'mod_cargo_expander_l');
  assert.equal(cargo.sockets[0].name, 'SOCKET_Cargo_Ventral');
  assert.equal(cargo.file, 'pods/pod_cargo_container.glb');
  const mining = view.modules.find((module) => module.id === 'mod_mining_pulverizer_l');
  assert.equal(mining.sockets[0].name, 'SOCKET_Mining_Front');
});

test('fitted drives recolor the nacelle glow', () => {
  assert.equal(
    partsLibrary.visibleFittingsForEntity(shipEntity('ship_kestrel', ['mod_engine_warp_l'])).driveGlow,
    '#b48cff',
  );
  assert.equal(
    partsLibrary.visibleFittingsForEntity(shipEntity('ship_kestrel', ['mod_engine_fusion_m'])).driveGlow,
    '#ffb154',
  );
  assert.equal(
    partsLibrary.visibleFittingsForEntity(shipEntity('ship_kestrel', ['mod_engine_ion_m'])).driveGlow,
    '#8fd4ff',
  );
  assert.equal(
    partsLibrary.visibleFittingsForEntity(shipEntity('ship_kestrel', [])).driveGlow,
    null,
    'no fitted drive → the authored nacelle color stands',
  );
});

test('whole-ship bodies still cook the parts their fit will mount', () => {
  // ship_kestrel resolves to a packaged whole-ship body — the plan must still carry the fitted
  // gun and the budget-heavy cargo module so the live assembly can bolt them to its sockets.
  const fitted = shipEntity('ship_kestrel', [
    'wpn_railgun_m', 'mod_cargo_expander_l',
  ], [
    { slotIndex: 0, defId: 'wpn_railgun_m', facing: 'front', tracking: 'fixed', size: 'M' },
  ]);
  const plan = partsLibrary.authoredPreloadPlanForEntity(fitted);
  assert.deepEqual(plan.hull, ['wholeships/kestrel.glb']);
  assert.ok((plan.weapon || []).some((url) => url.endsWith('weapons/weapon_railgun.glb')),
    'fitted railgun cooks into the weapon slot');
  assert.ok((plan.pod || []).some((url) => url.endsWith('pods/pod_cargo_container.glb')),
    'budget-heavy cargo module cooks into the pod slot');

  const empty = partsLibrary.authoredPreloadPlanForEntity(shipEntity('ship_kestrel', []));
  assert.deepEqual(empty, { hull: ['wholeships/kestrel.glb'] },
    'an unfitted whole ship cooks nothing but its body — no ghost guns');
});

test('refits change the cooked plan and the composition fingerprint (parts hot-swap)', () => {
  const before = shipEntity('ship_kestrel', ['mod_cargo_pod_m']);
  const after = shipEntity('ship_kestrel', ['mod_cargo_expander_l', 'mod_thruster_vernier_m']);
  const planBefore = partsLibrary.authoredPreloadPlanForEntity(before);
  const planAfter = partsLibrary.authoredPreloadPlanForEntity(after);
  assert.notDeepEqual(planAfter, planBefore);
  assert.ok((planAfter.greeble || []).some((url) => url.endsWith('greebles/greeble_rcs.glb')));
  assert.notEqual(
    partsLibrary.authoredCompositionFingerprintForEntity(before),
    partsLibrary.authoredCompositionFingerprintForEntity(after),
  );
});

test('every visible-fit part file is a contracted authored asset (reachability stays green)', () => {
  const slots = partsLibrary.PART_LIBRARY_CONTRACT.slots;
  const contracted = new Set([...(slots.pod || []), ...(slots.greeble || []), ...(slots.weapon || [])]);
  // Sweep every module def through the largest-budget hull so nothing references an unreachable file.
  const allFitted = MODULES.filter((module) => module.slotType !== 'engine')
    .map((module) => module.id);
  const view = partsLibrary.visibleFittingsForEntity(shipEntity('ship_kestrel', allFitted));
  for (const module of view.modules) {
    assert.ok(contracted.has(module.file), `${module.id} mounts uncontracted part ${module.file}`);
  }
});
