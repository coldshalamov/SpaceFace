// PB-PIC-C — board row 137: SF-215 (a quiet machine with visible residual life) +
// SF-217 (a material hierarchy that preserves industrial function) + SF-221 (a convoy
// readable as a working group), pinned at the tabletop-policy seam with fixed fields —
// sim-side readability contracts, not screenshots.
//
//   SF-215 — the machine's on-screen motion derives only from its real operating state
//   (the site projection row's status/powerRatio). Working states cycle at the real
//   rate; blocked states coast home; starved and unpowered machines settle. The same
//   fields always yield the same motion, so pause/revisit restores the phase instead of
//   a fresh random loop, and a machine the sim does not report as working never reads
//   as working. (The live motion bus keyed to the same production events already ships
//   in src/render/authoredMotion.js; the recipe is the readout contract it and any
//   presenter share.)
//
//   SF-217 — already satisfied on master by src/render/industrialMaterialFamilies.js
//   (its own 26-test suite pins the response pass). The pins here are the packet's
//   hierarchy contract at the public API: load-bearing metal, working machinery,
//   fragile surfaces and energy elements resolve to distinct responses, the emission
//   lanes are allocated by state rather than permanent glow, and a re-application is
//   idempotent (no per-panel material proliferation).
//
//   SF-221 — a real freight group reads as ONE working group through the policy query:
//   membership joins on the real itinerary convoyId, roles read from the real traffic
//   role (carrier vs protector), the load is the real custody manifest, and the
//   formation verdict tracks the actual spread. No labels required, no decorative
//   cargo, every member still an independently physical body.

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  CONVOY_FORMATION,
  convoyWorkingGroups,
  machineWorkRecipe,
} from '../src/data/tabletopPictureRecipes.js';
import {
  INDUSTRIAL_MATERIAL_FAMILY_STAMP,
  MATERIAL_FAMILIES,
  applyIllustratedMaterialResponse,
} from '../src/render/industrialMaterialFamilies.js';

// ---------------------------------------------------------------------------
// SF-215 — machine residual life is a real field driving the readout
// ---------------------------------------------------------------------------

test('SF-215: a producing machine cycles at its real power ratio', () => {
  const recipe = machineWorkRecipe({
    id: 'm1',
    status: { state: 'running', limit: null, ratePerMin: { iron_ore: 12 }, powerRatio: 1 },
    powerRatio: 1,
  });
  assert.equal(recipe.motion, 'cycle');
  assert.equal(recipe.rateScale, 1);
  assert.equal(recipe.reason, null);
});

test('SF-215: a throttled machine cycles slower — the brownout is visible', () => {
  const recipe = machineWorkRecipe({
    id: 'm2',
    status: { state: 'throttled', limit: 'power', ratePerMin: { iron_ore: 5 }, powerRatio: 0.4 },
    powerRatio: 0.4,
  });
  assert.equal(recipe.motion, 'cycle');
  assert.equal(recipe.rateScale, 0.4);
});

test('SF-215: a jammed machine coasts home and starts no new cycle', () => {
  for (const state of ['backlogged', 'starved', 'stalled']) {
    const recipe = machineWorkRecipe({
      id: 'm3',
      status: { state, limit: state === 'backlogged' ? 'export' : 'input:iron_ore', ratePerMin: {} },
      powerRatio: 1,
    });
    assert.equal(recipe.motion, 'coast', state);
    assert.equal(recipe.rateScale, 0);
    assert.ok(recipe.reason, `${state} names its limiter`);
  }
});

test('SF-215: an unpowered, unnetworked or idle machine settles — no invented life', () => {
  for (const state of ['idle', 'no-power', 'no-network', 'no-geology']) {
    const recipe = machineWorkRecipe({
      id: 'm4',
      status: { state, limit: null, ratePerMin: {} },
      powerRatio: 0,
    });
    assert.equal(recipe.motion, 'settled', state);
    assert.equal(recipe.rateScale, 0);
  }
});

test('SF-215: a machine with no report at all settles (fail quiet, never decorative)', () => {
  assert.equal(machineWorkRecipe({ id: 'm5' }).motion, 'settled');
  assert.equal(machineWorkRecipe(null).motion, 'settled');
});

test('SF-215: pause/revisit restores the same phase — the recipe is a pure read', () => {
  const row = {
    id: 'm6',
    status: { state: 'throttled', limit: 'power', ratePerMin: { water: 3 }, powerRatio: 0.7 },
    powerRatio: 0.7,
  };
  assert.deepEqual(machineWorkRecipe(row), machineWorkRecipe(row));
});

// ---------------------------------------------------------------------------
// SF-217 — the material hierarchy preserves industrial function
// ---------------------------------------------------------------------------

test('SF-217: load-bearing metal, machinery, fragile and energy surfaces read apart', () => {
  const loadBearing = MATERIAL_FAMILIES.bare_structure;
  const machinery = MATERIAL_FAMILIES.worn_tool_metal;
  const fragile = MATERIAL_FAMILIES.thermal_ceramic;
  const seal = MATERIAL_FAMILIES.matte_seal;
  const glass = MATERIAL_FAMILIES.controlled_glass;
  // Structural mass is never glossy; the controlled highlight lives on machined steel.
  assert.ok(machinery.env > loadBearing.env, 'machinery catches more light than plate');
  assert.ok(loadBearing.metalness >= machinery.metalness, 'both read as metal');
  // Fragile surfaces stay dry and distinct from each other.
  assert.ok(fragile.env < loadBearing.env, 'ceramic never picks up an environment sheen');
  assert.notEqual(seal.roughness, fragile.roughness, 'seals and ceramics are separate bands');
  assert.ok(glass.roughness >= 1, 'glass keeps its authored smoothness response');
});

test('SF-217: emission is state-allocated — attention levels, not permanent equal glow', () => {
  const drive = MATERIAL_FAMILIES.state_emission_drive;
  const trim = MATERIAL_FAMILIES.state_emission_trim;
  const warm = MATERIAL_FAMILIES.state_emission_warm;
  assert.ok(drive && trim && warm, 'the attention lanes exist');
  assert.ok(drive.emissiveIntensity > warm.emissiveIntensity
    && warm.emissiveIntensity > trim.emissiveIntensity,
    'the drive making force outranks a state surface outranks the always-on trim');
});

test('SF-217: the role response applies once over the authored baseline — never compounds', () => {
  const material = new THREE.MeshStandardMaterial({
    name: 'Material_Mechanical', roughness: 0.5, metalness: 0.5, envMapIntensity: 1,
  });
  assert.equal(applyIllustratedMaterialResponse(material, 'mechanical'), true);
  const once = { roughness: material.roughness, metalness: material.metalness, env: material.envMapIntensity };
  assert.equal(once.env, MATERIAL_FAMILIES.worn_tool_metal.env, 'machinery carries the controlled highlight');
  applyIllustratedMaterialResponse(material, 'mechanical');
  assert.equal(material.roughness, once.roughness, 'roughness recomputes from the stamped baseline');
  assert.equal(material.metalness, once.metalness, 'metalness recomputes from the stamped baseline');
  assert.equal(material.envMapIntensity, once.env, 'reflection recomputes from the stamped baseline');
});

test('SF-217: a batched shader-family panel still lands in its role family', () => {
  const batched = new THREE.MeshStandardMaterial({
    name: 'sfBatchedFamily_7', roughness: 0.5, metalness: 0.5, envMapIntensity: 1,
  });
  assert.equal(applyIllustratedMaterialResponse(batched, 'docking'), true);
  assert.equal(batched.envMapIntensity, MATERIAL_FAMILIES.bare_structure.env,
    'the rename to a batch key must not lose the structural family response');
  assert.equal(batched.userData[INDUSTRIAL_MATERIAL_FAMILY_STAMP], 'bare_structure');
});

// ---------------------------------------------------------------------------
// SF-221 — a convoy readable as a working group
// ---------------------------------------------------------------------------

/** One leg of the claim relay: a loaded mule and its paired escort, near formation. */
function legFixture({ separation = 60, muleQty = 40 } = {}) {
  return [
    {
      id: 'body_mule',
      x: 0, z: 0,
      data: {
        trafficRole: 'hauler',
        itinerary: { kind: 'claim_convoy', convoyId: 'convoy_77', bodyId: 'body_mule' },
        cargoManifest: { lines: [{ commodityId: 'quartz', qty: muleQty }] },
      },
    },
    {
      id: 'body_escort',
      x: separation, z: separation / 2,
      data: {
        trafficRole: 'escort',
        itinerary: { kind: 'claim_convoy', convoyId: 'convoy_77', bodyId: 'body_escort' },
      },
    },
  ];
}

test('SF-221: members sharing a real convoy itinerary read as one working group', () => {
  const { groups, unassigned } = convoyWorkingGroups(legFixture());
  assert.equal(groups.length, 1);
  assert.equal(groups[0].groupId, 'claim-convoy:convoy_77');
  assert.deepEqual(groups[0].members.map((m) => m.id), ['body_escort', 'body_mule'],
    'members sort by stable id, never by spawn order');
  assert.equal(unassigned, 0);
});

test('SF-221: the group explains its work without labels', () => {
  const { groups } = convoyWorkingGroups(legFixture());
  assert.match(groups[0].readout, /one loaded carrier/);
  assert.match(groups[0].readout, /under escort/);
});

test('SF-221: roles read from the real traffic role — the escort is not a second mule', () => {
  const { groups } = convoyWorkingGroups(legFixture());
  const byId = new Map(groups[0].members.map((m) => [m.id, m]));
  assert.equal(byId.get('body_mule').roleKind, 'carrier');
  assert.equal(byId.get('body_escort').roleKind, 'protector');
});

test('SF-221: the load is the real custody manifest, and the empty return reads empty', () => {
  const loaded = convoyWorkingGroups(legFixture()).groups[0].members
    .find((m) => m.id === 'body_mule');
  assert.equal(loaded.loaded, true);
  assert.equal(loaded.qty, 40);

  const delivered = convoyWorkingGroups(legFixture({ muleQty: 0 })).groups[0];
  assert.equal(delivered.members.find((m) => m.id === 'body_mule').loaded, false);
  assert.match(delivered.readout, /one empty carrier/,
    'after delivery no visual cargo remains — the read follows the hold');
});

test('SF-221: formation spacing tracks the real spread — a stretched group reads strung', () => {
  assert.equal(convoyWorkingGroups(legFixture({ separation: 60 })).groups[0].formation,
    CONVOY_FORMATION.FORMED);
  assert.equal(convoyWorkingGroups(legFixture({ separation: 180 })).groups[0].formation,
    CONVOY_FORMATION.STRUNG);
  assert.equal(convoyWorkingGroups(legFixture({ separation: 400 })).groups[0].formation,
    CONVOY_FORMATION.SCATTERED);
});

test('SF-221: bodies outside the freight leg never join the group read', () => {
  const entities = [...legFixture(), {
    id: 'lone_courier', x: 5, z: 5,
    data: { trafficRole: 'courier', itinerary: { kind: 'courier_run' } },
  }];
  const { groups, unassigned } = convoyWorkingGroups(entities);
  assert.equal(groups.length, 1);
  assert.equal(unassigned, 1);
  assert.equal(groups[0].members.length, 2);
});

test('SF-221: two concurrent legs stay two groups, and the query is deterministic', () => {
  const secondLeg = legFixture().map((e, i) => ({
    ...e,
    id: `${e.id}_b`,
    x: e.x + 900, z: e.z + 900,
    data: {
      ...e.data,
      itinerary: { ...e.data.itinerary, convoyId: 'convoy_88' },
    },
  }));
  const entities = [...legFixture(), ...secondLeg];
  const first = convoyWorkingGroups(entities);
  const second = convoyWorkingGroups(entities);
  assert.deepEqual(first, second);
  assert.equal(first.groups.length, 2);
  assert.equal(first.groups[0].groupId, 'claim-convoy:convoy_77');
  assert.equal(first.groups[1].groupId, 'claim-convoy:convoy_88');
});
