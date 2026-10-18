// SFQ-I072 — hoop prop proxies must leave the visibly passable middle open.
//
// The aft dock collar, the freighter ring span, and the transponder gate are drawn
// as open hoops: the flight-plane outline holds solid arcs on opposite sides with
// wide empty wedges between them. Their measured skins were radial arms grown from
// the origin, so every arm covered the middle and a flight pass straight through
// the visible opening registered a hit. Seed 4242.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  modelTruthContains,
  modelTruthProxyManifest,
  modelTruthRow,
  modelTruthSkinPrimitives,
} from '../src/data/modelTruth.js';
import { resolveCollisionProxyManifest, proxyWorldPrimitives } from '../src/data/collisionProxyManifests.js';
import { primitiveContains } from '../src/data/modelTruthMath.js';

const HOOPS = Object.freeze([
  { id: 'place_aftermath_aft_dock_collar', label: 'Severed Dock Collar' },
  { id: 'place_aftermath_deb_ore_freighter_ring_span', label: 'Freighter Ring Span' },
  { id: 'place_transponder_gate', label: 'Transponder Gate' },
]);

function hoopEntity(id) {
  const row = modelTruthRow(id);
  const ref = (row.gameplay && row.gameplay.entityRadius) || 8;
  return {
    id: `sfq-i072:${id}`,
    type: 'station',
    alive: true,
    collides: true,
    rot: 0,
    pos: { x: 0, z: 0 },
    radius: ref,
    data: { placeId: id, collisionProxy: `skin:${id}` },
  };
}

// The pass axis is the bisector of the empty wedges: for these hoops the solid
// arcs sit across +Z/-Z, so the visibly passable flight pass runs along X.
function passHits(entity, probeR) {
  const row = modelTruthRow(entity.data.placeId);
  const ref = (row.gameplay && row.gameplay.entityRadius) || 8;
  const hits = [];
  for (let d = -ref; d <= ref + 1e-9; d += ref / 20) {
    const blocked = [-probeR, 0, probeR].some(
      (off) => modelTruthContains(entity, d, off),
    );
    if (blocked) hits.push(Math.round(d * 100) / 100);
  }
  return hits;
}

for (const hoop of HOOPS) {
  test(`${hoop.label}: a probe sphere flies the visible opening without a hit`, () => {
    const entity = hoopEntity(hoop.id);
    const hits = passHits(entity, 2);
    assert.deepEqual(hits, [], `${hoop.id}: pass blocked at ${hits.join(',')}`);
  });

  test(`${hoop.label}: the solid arcs still collide`, () => {
    const entity = hoopEntity(hoop.id);
    const row = modelTruthRow(hoop.id);
    const outline = row.collider.outline;
    const bins = outline.length;
    let checked = 0;
    for (let i = 0; i < bins; i += 1) {
      const visual = outline[i] || 0;
      if (visual <= 2) continue;
      const angle = -Math.PI + ((i + 0.5) / bins) * Math.PI * 2;
      const hit = modelTruthContains(
        entity,
        Math.cos(angle) * visual * 0.85,
        Math.sin(angle) * visual * 0.85,
      );
      assert.equal(hit, true, `${hoop.id} arc bin ${i} stays solid`);
      checked += 1;
    }
    assert.ok(checked >= 2, `${hoop.id}: arcs sampled`);
  });

  test(`${hoop.label}: the live physics proxy leaves the same opening`, () => {
    const entity = hoopEntity(hoop.id);
    const manifest = resolveCollisionProxyManifest(entity);
    assert.ok(manifest && manifest.id === `skin:${hoop.id}`, `${hoop.id} resolves its skin`);
    const world = proxyWorldPrimitives(entity, manifest);
    assert.ok(world.length > 0 && world.length <= 32, `${hoop.id} bounded compound`);
    const row = modelTruthRow(hoop.id);
    const ref = (row.gameplay && row.gameplay.entityRadius) || 8;
    const hits = [];
    for (let d = -ref; d <= ref + 1e-9; d += ref / 20) {
      const blocked = [-2, 0, 2].some((off) => world.some((p) => primitiveContains(d, off, p)));
      if (blocked) hits.push(Math.round(d * 100) / 100);
    }
    assert.deepEqual(hits, [], `${hoop.id}: live proxy blocks the pass at ${hits.join(',')}`);
  });

  test(`${hoop.label}: the manifest stays a bounded primitive compound`, () => {
    const entity = hoopEntity(hoop.id);
    const manifest = modelTruthProxyManifest(entity);
    assert.ok(manifest, `${hoop.id} has a manifest`);
    for (const primitive of manifest.primitives) {
      assert.ok(['circle', 'capsule', 'obb'].includes(primitive.kind), `${hoop.id} no mesh collider`);
    }
    assert.ok(manifest.primitives.length <= 32, `${hoop.id} bounded`);
  });
}
