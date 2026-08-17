import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import { MODULES } from '../src/data/modules.js';
import { WEAPONS } from '../src/data/weapons.js';
import { createLivingHullPresentation } from '../src/render/livingHullPresentation.js';
import {
  createShipHardwarePresentation,
  SHIP_HARDWARE_PRESENTATIONS,
} from '../src/render/shipHardwarePresentation.js';

const UNIQUE_WEAPON_IDS = Object.freeze([
  'unique_ironsong_ac',
  'unique_veil_cutter',
  'unique_nestbreaker_rack',
  'unique_lighthouse_heavy_beam',
]);
const FORBIDDEN_CACHE_IDS = Object.freeze([
  'mod_overcharge_coil_forbidden',
  'mod_mass_faker_forbidden',
  'mod_deadman_reactor_forbidden',
]);
const ALL_IDS = Object.freeze([...UNIQUE_WEAPON_IDS, ...FORBIDDEN_CACHE_IDS]);

test('all salvage-only weapons and exact forbidden cache fittings declare distinct hull signatures', () => {
  const salvageWeapons = WEAPONS.filter((definition) => definition.unique && definition.salvageOnly);
  assert.deepEqual(salvageWeapons.map((definition) => definition.id).sort(), [...UNIQUE_WEAPON_IDS].sort());
  for (const definition of salvageWeapons) {
    assert.ok(definition.hullPresentation?.signature, `${definition.id} needs a physical recognition signature`);
    assert.ok(definition.hullPresentation?.recognition, `${definition.id} needs authored recognition language`);
  }

  for (const id of FORBIDDEN_CACHE_IDS) {
    const definition = MODULES.find((candidate) => candidate.id === id);
    assert.ok(definition, `${id} remains in the canonical cache-tech catalog`);
    assert.equal(definition.salvageOnly, true);
    assert.equal(definition.purchasable, false);
    assert.ok(definition.hullPresentation?.signature);
    assert.ok(definition.hullPresentation?.recognition);
  }

  assert.deepEqual(SHIP_HARDWARE_PRESENTATIONS.map(({ id }) => id).sort(), [...ALL_IDS].sort());
  assert.equal(new Set(SHIP_HARDWARE_PRESENTATIONS.map(({ signature }) => signature)).size, ALL_IDS.length,
    'the seven recovered fittings cannot collapse to a shared visual variant');
});

test('fitted hardware toggles retained hard geometry without steady-flight resource churn', () => {
  const controller = createShipHardwarePresentation();
  const initial = controller.diagnostics();
  assert.equal(initial.visible, false);
  assert.equal(initial.activeCount, 0);
  assert.equal(initial.signatures.length, 7);
  assert.ok(initial.meshCount >= 35, 'the seven identities use designed multi-surface hard geometry');
  assert.equal(initial.spriteCount, 0);
  assert.equal(initial.pointsCount, 0);

  assert.equal(controller.sync(['wpn_autocannon_m', 'unique_ironsong_ac']), true);
  const ironsong = controller.diagnostics();
  assert.deepEqual(ironsong.activeIds, ['unique_ironsong_ac']);
  assert.equal(ironsong.visible, true);
  for (let index = 0; index < 1000; index += 1) {
    assert.equal(controller.sync(['wpn_autocannon_m', 'unique_ironsong_ac']), false);
  }
  assert.deepEqual(controller.diagnostics().resourceIds, ironsong.resourceIds);

  assert.equal(controller.sync(['mod_overcharge_coil_forbidden', 'mod_deadman_reactor_forbidden']), true);
  const cache = controller.diagnostics();
  assert.deepEqual(cache.activeIds, ['mod_overcharge_coil_forbidden', 'mod_deadman_reactor_forbidden']);
  assert.deepEqual(cache.resourceIds, ironsong.resourceIds);

  const restore = controller.beginGpuWarmup();
  assert.equal(controller.diagnostics().activeIds.length, 7);
  restore();
  assert.deepEqual(controller.diagnostics().activeIds, cache.activeIds);

  controller.dispose();
  assert.equal(controller.diagnostics().disposed, true);
});

test('the retained authored-player overlay reads real fittings even without scar or decal state', () => {
  const controller = createLivingHullPresentation();
  const authoredRoot = new THREE.Group();
  authoredRoot.userData.authoredAssetState = 'authored';
  controller.attach(authoredRoot);

  const entity = {
    id: 1,
    radius: 12,
    bank: 0,
    pitch: 0,
    data: { appearance: { decalId: 'none', decalKillMarks: 0 }, fittings: ['unique_veil_cutter'] },
  };
  controller.sync(null, 0, entity);
  let diagnostics = controller.diagnostics();
  assert.equal(diagnostics.visible, true);
  assert.deepEqual(diagnostics.fittedHardware.activeIds, ['unique_veil_cutter']);

  entity.data.fittings = ['wpn_beam_laser_m'];
  controller.sync(null, 0, entity);
  diagnostics = controller.diagnostics();
  assert.equal(diagnostics.visible, false, 'ordinary base hardware does not create an identity overlay');
  assert.equal(diagnostics.fittedHardware.activeCount, 0);

  controller.dispose();
});

test('Shipworks preview forwards the exact fitted IDs to the same retained presentation owner', () => {
  const source = readFileSync(new URL('../src/ui/shipPreviewMount.js', import.meta.url), 'utf8');
  assert.match(source, /currentPresentationFittings/);
  assert.match(source, /data: \{ appearance, fittings:/);
  assert.match(source, /applyPreviewAppearance\(mesh, o\.appearance, defId, currentPresentationFittings\)/);
});
