// PQ-134.01 — impact jets, structure, and debris go through the cue arbiter.
//
// An impact cue with room is drawn. A cue that cannot take a slot is refused whole, so gas jets
// and debris do not run as a second presenter. Presentation lane totals stay where they are.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  arbitrateStructuralImpactCue,
  CUE_BUDGET_DECLARATION,
  CUE_LANE_BUDGETS,
} from '../src/presentation/cueArbitration.js';
import { makeImpactRecord } from '../src/render/combat/impactEventRecord.js';
import {
  ArcadeStructuralFx,
  ARCADE_STRUCTURAL_FX_CAPACITY,
} from '../src/render/combat/arcadeStructuralFx.js';

function contact(overrides = {}) {
  return makeImpactRecord(undefined, {
    x: 4, y: 0.4, z: -2,
    nx: 0, ny: 0, nz: 1,
    axisSigned: true,
    severity: 0.45,
    materialId: 'hull',
    radiusWU: 6,
    simTime: 12,
    serial: 7,
    eventClass: 'pinprick',
    ...overrides,
  });
}

function placed(fx) {
  const stats = fx.stats();
  return stats.blades.spawned + stats.arcs.spawned + stats.shards.spawned + stats.plates.spawned;
}

function fillPools(fx, priority) {
  const spec = { x: 1, z: -1, y: 0.4, priority, life: 30 };
  for (let i = 0; i < ARCADE_STRUCTURAL_FX_CAPACITY.blades; i++) fx.spawnBlade(spec);
  for (let i = 0; i < ARCADE_STRUCTURAL_FX_CAPACITY.arcs; i++) fx.spawnArc(spec);
  for (let i = 0; i < ARCADE_STRUCTURAL_FX_CAPACITY.shards; i++) fx.spawnShard(spec);
  for (let i = 0; i < ARCADE_STRUCTURAL_FX_CAPACITY.plates; i++) fx.spawnPlate(spec);
}

test('structural impact arbiter admits a free slot and refuses an over-budget cue', () => {
  const free = { admission() { return 'free'; } };
  const full = { admission() { return 'refuse'; } };
  const admitted = arbitrateStructuralImpactCue([free], { priority: 0.4 });
  assert.equal(admitted.admitted, true);
  assert.equal(admitted.reason, null);
  const refused = arbitrateStructuralImpactCue([full, full], { priority: 0.4 });
  assert.equal(refused.admitted, false);
  assert.equal(refused.reason, 'over_budget');
  assert.equal(CUE_LANE_BUDGETS.vfx, 8);
  assert.equal(CUE_BUDGET_DECLARATION.structuralFx.laneBudgetsCharged, false);
});

test('one impact cue is drawn and one over-budget cue does not spray jets or debris', () => {
  const fx = new ArcadeStructuralFx(null);
  const jets = [];
  const debris = [];
  fx.attachSupportingLayers({
    gas: { emitFromImpact(rec) { jets.push(rec.serial); } },
    debris: { emitFromImpact(rec) { debris.push(rec.serial); } },
  });

  const drawn = fx.emitImpact(contact(), { x: 0, y: 0.4, z: 0, priority: 0.55 });
  assert.ok(drawn > 0, 'a cue with room must place structural primitives');
  assert.deepEqual(jets, [7]);
  assert.deepEqual(debris, [7]);
  assert.equal(fx.stats().cues.admitted, 1);
  assert.equal(fx.stats().cues.refused, 0);
  for (const mesh of fx.getMeshes()) {
    assert.equal(mesh.isInstancedMesh, true);
    assert.notEqual(mesh.isSprite, true);
    assert.notEqual(mesh.isPoints, true);
  }

  fillPools(fx, 0.9);
  const before = placed(fx);
  const rejectedBefore = fx.stats().blades.rejected + fx.stats().arcs.rejected
    + fx.stats().shards.rejected + fx.stats().plates.rejected;
  const refused = fx.emitImpact(contact({ serial: 8 }), { x: 0, y: 0.4, z: 0, priority: 0.35 });
  assert.equal(refused, 0);
  assert.equal(placed(fx), before, 'an over-budget cue must not take a slot');
  assert.deepEqual(jets, [7], 'jets must not run when the arbiter refuses the cue');
  assert.deepEqual(debris, [7], 'debris must not run when the arbiter refuses the cue');
  assert.equal(fx.stats().cues.refused, 1);
  const rejectedAfter = fx.stats().blades.rejected + fx.stats().arcs.rejected
    + fx.stats().shards.rejected + fx.stats().plates.rejected;
  assert.equal(rejectedAfter, rejectedBefore, 'a refused cue must not walk the pools');

  const hero = fx.emitImpact(contact({ serial: 9 }), {
    x: 0, y: 0.4, z: 0, priority: 0.35, hero: true,
  });
  assert.ok(hero > 0, 'a hero cue must still land by evicting flavor');
  assert.deepEqual(jets, [7, 9]);
  assert.deepEqual(debris, [7, 9]);
  assert.equal(fx.stats().cues.admitted, 2);
  assert.equal(fx.stats().cues.refused, 1);
  fx.dispose();
});

test('one full pool refuses the whole cue, including jets', () => {
  const fx = new ArcadeStructuralFx(null);
  const jets = [];
  fx.attachSupportingLayers({
    gas: { emitFromImpact(rec) { jets.push(rec.serial); } },
    debris: { emitFromImpact(rec) { jets.push(rec.serial); } },
  });
  const spec = { x: 1, z: -1, y: 0.4, priority: 0.9, life: 30 };
  for (let i = 0; i < ARCADE_STRUCTURAL_FX_CAPACITY.arcs; i++) fx.spawnArc(spec);
  const before = placed(fx);
  const refused = fx.emitImpact(contact(), { x: 0, y: 0.4, z: 0, priority: 0.35 });
  assert.equal(refused, 0);
  assert.equal(placed(fx), before);
  assert.deepEqual(jets, []);
  assert.equal(fx.stats().cues.refused, 1);
  fx.dispose();
});
