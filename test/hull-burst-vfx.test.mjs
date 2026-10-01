// Hull-burst overhaul, slice C: the wedge is SEEN (design doc section 4; the review's "the wedge is invisible").
//
// While the boost upgrade's burst is live the player carries a wedge, and what is drawn is what hits: the field
// presentation draws it with the Clearing Cone's designed recipe (source-to-tip banks, a working membrane, a
// truth boundary at the strike edge) in a per-type tint. The wedge is live exactly while the boost gesture pays
// (phase 'active'), and retires the moment it ends. This tests the record that feeds the presentation and the
// presentation that draws it, headless.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { resolveHullBurst } from '../src/data/hullBurst.js';
import { BURST_STYLE, hullBurstFieldRecord, shapeOfFieldKind } from '../src/render/forceLanguage/hullBurstField.js';
import { FieldForcePresentation } from '../src/render/forceLanguage/fieldForcePresentation.js';
import { FIELD_LIFECYCLES } from '../src/render/forceLanguage/effectLifecycle.js';

function stateWith({ kind = 'gravity', rank = 1, phase = 'active', rot = 0, hits = 0, grip = null, fields = [] } = {}) {
  const player = {
    id: 1, alive: true, pos: { x: 100, z: 50 }, rot, radius: 12,
    data: { derived: kind ? { hullBurstKind: kind, hullBurstRank: rank } : {} },
  };
  return {
    playerId: 1,
    entities: new Map([[1, player]]),
    hullBurst: { phase, hits, grip },
    fields: { active: fields },
    simTime: 0,
    massSeed: { seedId: null, phase: 'active' },
    settings: { video: {} },
    // No camera: the presentation only frustum-culls when it has one, and these tests are about what is submitted.
  };
}

test('no wedge unless a burst is live and fitted', () => {
  assert.equal(hullBurstFieldRecord(stateWith({ phase: 'ready' })), null);
  assert.equal(hullBurstFieldRecord(stateWith({ kind: null })), null);
  assert.equal(hullBurstFieldRecord({}), null);
  const dead = stateWith();
  dead.entities.get(1).alive = false;
  assert.equal(hullBurstFieldRecord(dead), null);
});

test('the wedge is the strike zone: apex at the nose, along the heading, reach and half angle from the data', () => {
  for (const kind of ['gravity', 'lance', 'grip']) {
    const def = resolveHullBurst(kind, 1);
    const rec = hullBurstFieldRecord(stateWith({ kind, rot: Math.PI / 2 }));
    assert.equal(rec.kind, `burst_${kind}`);
    assert.ok(Math.abs(rec.center.x - 100) < 1e-9 && Math.abs(rec.center.z - (50 + 12)) < 1e-9, `${kind}: apex one hull radius ahead along the heading`);
    assert.ok(Math.abs(rec.dir.z - 1) < 1e-9 && Math.abs(rec.dir.x) < 1e-9);
    assert.equal(rec.radius, def.reachWu, `${kind}: the drawn depth is the strike depth`);
    assert.equal(rec.halfAngleRad, def.halfAngleRad);
  }
  const rank2 = hullBurstFieldRecord(stateWith({ kind: 'gravity', rank: 2 }));
  assert.ok(rank2.radius > resolveHullBurst('gravity', 1).reachWu, 'a rank-2 module draws the longer wedge it actually has');
  assert.ok(hullBurstFieldRecord(stateWith({ kind: 'lance' })).halfAngleRad < hullBurstFieldRecord(stateWith({ kind: 'gravity' })).halfAngleRad, 'the lance is the narrow one');
});

test('a hit or a held hostage lights the wedge; the record is one reused object (no per-frame allocation)', () => {
  const a = hullBurstFieldRecord(stateWith());
  assert.equal(a.engaged, false);
  const b = hullBurstFieldRecord(stateWith({ hits: 2 }));
  assert.equal(b, a, 'the same object');
  assert.equal(b.engaged, true);
  assert.equal(hullBurstFieldRecord(stateWith({ kind: 'grip', grip: { targetId: 9 } })).engaged, true);
});

test('each burst type has its own tint, and every burst kind draws as a cone', () => {
  const colors = Object.values(BURST_STYLE).map((s) => s.color);
  assert.equal(new Set(colors).size, colors.length, 'three different bodies');
  for (const kind of Object.keys(BURST_STYLE)) assert.equal(shapeOfFieldKind(kind), 'cone');
  assert.equal(shapeOfFieldKind('well'), 'well', 'ordinary fields are untouched');
});

test('the presentation draws a live wedge, retires it when the burst ends, and knows nothing unknown', () => {
  for (const kind of ['gravity', 'lance', 'grip']) {
    const o = new FieldForcePresentation(new THREE.Scene());
    const s = stateWith({ kind });
    s.simTime = 0;
    o.update(0.016, s);
    s.simTime = 0.5;
    o.update(0.016, s);
    assert.equal(o.stats.unknown, 0, `${kind}: a known shape`);
    assert.equal(o.stats.active, 1, `${kind}: one live wedge`);
    assert.ok(o.batch.count > 0 && o.mesh.visible, `${kind}: actual surfaces are submitted`);
    assert.equal(o._quietEmpty, false, `${kind}: the quiet latch does not swallow a live burst`);
    s.hullBurst.phase = 'ready'; // the boost ended
    s.simTime = 0.6;
    o.update(0.016, s);
    assert.equal(o.stats.releasing, 1, `${kind}: it releases, it does not pop`);
    s.simTime = 0.6 + FIELD_LIFECYCLES.cone.release + 0.1;
    o.update(0.016, s);
    assert.equal(o.batch.count, 0, `${kind}: fully retired`);
    o.dispose();
  }
});

test('the wedge is never dropped by the six-field limit, and ordinary fields still draw beside it', () => {
  const field = (kind, id) => ({ id, kind, center: { x: 0, z: 0 }, dir: { x: 1, z: 0 }, radius: 100, halfAngleRad: 0.56, halfWidth: 52, engaged: false });
  const o = new FieldForcePresentation(new THREE.Scene());
  const fields = [field('well', 'a'), field('well', 'b'), field('repulsor', 'c'), field('repulsor', 'd'), field('cone', 'e'), field('sheet', 'f')];
  const s = stateWith({ fields });
  s.simTime = 0;
  o.update(0.016, s);
  s.simTime = 0.4;
  o.update(0.016, s);
  const kinds = o.slots.filter((slot) => slot.id !== null).map((slot) => slot.kind);
  assert.ok(kinds.includes('burst_gravity'), 'the wedge holds a slot');
  assert.ok(kinds.filter((k) => !k.startsWith('burst_')).length >= 5, 'and the ordinary fields still draw');
  o.dispose();
});
