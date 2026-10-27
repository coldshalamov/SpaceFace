// W-BLOOM-LOW remains visuals — the six latchable remain kinds carry family-authored
// silhouettes so the throw-selection reads at glance range: the field shows what the
// sac/leech/eel will DO before the tooltip says it. The seam is buildPayload's remain
// dispatch; the contract underneath (payload kind, ordnance tumble, per-entity teardown)
// is unchanged.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createVisualFactory, invalidateVisualFactoryCaches } from '../src/render/visualFactory.js';
import { resolveOrdnanceKindConfig } from '../src/render/ordnanceMotionPresentation.js';
import { SWARM_BROOD_FAMILIES } from '../src/data/swarmBrood.js';

const KIND_BY_FAMILY = Object.freeze({
  mite: 'husk_shards', spitter: 'acid_sac', charger: 'horn_plate',
  leecher: 'leech_glue', glassback: 'glass_shards', wake_eel: 'eel_body',
});
const REMAIN_KINDS = Object.freeze(Object.values(KIND_BY_FAMILY));
const FAMILY_BY_KIND = new Map(REMAIN_KINDS.map((kind) => [
  kind, SWARM_BROOD_FAMILIES.find((f) => f.remains && f.remains.kind === kind),
]));

function remainEntity(kind, radius = 4) {
  const family = FAMILY_BY_KIND.get(kind);
  return {
    id: `remain-${kind}`, alive: true, type: 'payload',
    radius, mass: family ? family.remains.mass : 10,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    data: {
      kind: 'payload', payloadType: 'brood_remains', name: 'Brood remains',
      masslineTetherable: true, physicalCustodyOnly: true, salvagePool: {},
      transientSector: true, despawnAt: 60,
      broodRemain: { familyId: family ? family.id : 'unknown_family', kind, createdTick: 0 },
    },
  };
}

function meshes(root) {
  const out = [];
  root.traverse((o) => { if (o.isMesh) out.push(o); });
  return out;
}

// Geometry shape + local pose per child. Children share cached primitives across kinds, so
// the signature folds in the mesh transform — two kinds using the same raw sphere still
// differ when the recipe poses it differently.
function silhouetteSignature(root) {
  const parts = [];
  for (const m of meshes(root)) {
    const pos = m.geometry.getAttribute('position');
    let h = 0x811c9dc5;
    for (let i = 0; i < pos.count * 3; i++) {
      h = Math.imul(h ^ Math.round(pos.array[i] * 1024), 0x01000193) >>> 0;
    }
    const p = m.position, q = m.quaternion, s = m.scale;
    parts.push(`${pos.count}:${h.toString(16)}@${p.x},${p.y},${p.z}|${q.x},${q.y},${q.z},${q.w}|${s.x},${s.y},${s.z}`);
  }
  return parts.sort().join('||');
}

function hexOf(color) { return color && color.isColor ? color.getHex() : null; }

test.afterEach(() => invalidateVisualFactoryCaches());

test('every authored remain kind resolves its own distinct silhouette recipe', () => {
  const factory = createVisualFactory();
  const signatures = new Map();
  for (const kind of REMAIN_KINDS) {
    const family = FAMILY_BY_KIND.get(kind);
    assert.ok(family, `test roster covers ${kind}`);
    const root = factory.build(remainEntity(kind, family.remains.radius));
    assert.ok(root, `${kind} builds a visual`);
    assert.equal(root.name, `SF_BroodRemain_${kind}`);
    assert.equal(root.userData.broodRemainKind, kind);
    assert.equal(root.userData.visualLanguage, `brood-remain-${kind}`);
    assert.ok(meshes(root).length >= 2, `${kind} is a composed body, not a recolored primitive`);
    // The remain is painted in the dying family's own colors: every kind carries at least
    // one material whose color is the authored bodyColor or whose emissive is bodyEmissive.
    const bodyHex = new THREE.Color(...family.bodyColor).getHex();
    const emisHex = new THREE.Color(...family.bodyEmissive).getHex();
    const painted = meshes(root).some((m) => hexOf(m.material.color) === bodyHex
      || hexOf(m.material.emissive) === emisHex);
    assert.ok(painted, `${kind} must wear its family's authored paint`);
    // Same radius for the comparison so the signature isolates the recipe, not the size.
    const sig = silhouetteSignature(factory.build(remainEntity(kind, 4)));
    assert.ok(!signatures.has(sig), `${kind} silhouette collides with ${signatures.get(sig)}`);
    signatures.set(sig, kind);
  }
  assert.equal(signatures.size, REMAIN_KINDS.length, 'six kinds, six silhouettes');
  const canister = factory.build({ id: 'plain-pod', type: 'payload', radius: 4, data: {} });
  for (const sig of signatures.keys()) {
    assert.notEqual(sig, silhouetteSignature(canister), 'a remain never reads as the cargo canister');
  }
});

test('the authored consequence reads off the silhouette — sac glows, glass transmits, eel is long', () => {
  const factory = createVisualFactory();
  const sac = factory.build(remainEntity('acid_sac'));
  assert.ok(meshes(sac).some((m) => m.material.emissiveIntensity >= 2),
    'the sac carries the hot bead that telegraphs the splash');
  const glass = factory.build(remainEntity('glass_shards'));
  assert.ok(meshes(glass).some((m) => m.material.transparent === true && m.material.opacity < 1),
    'the shards are silicate — translucent, not just pale');
  const eel = factory.build(remainEntity('eel_body'));
  const box = new THREE.Box3().setFromObject(eel);
  const size = new THREE.Vector3(); box.getSize(size);
  assert.ok(size.x > size.y * 2 && size.x > size.z * 1.5,
    `the eel body is the long silhouette — a held whip (x ${size.x.toFixed(2)} vs y ${size.y.toFixed(2)}, z ${size.z.toFixed(2)})`);
});

test('the authored look keeps the latchable payload contract and never touches the entity', () => {
  const factory = createVisualFactory();
  for (const kind of REMAIN_KINDS) {
    const entity = remainEntity(kind);
    const before = structuredClone(entity.data);
    const root = factory.build(entity);
    // The latch, custody and tumble machinery keys on entity type/data and the payload
    // userData stamps — all unchanged by the authored silhouette.
    assert.equal(root.userData.kind, 'payload', `${kind} still answers as a payload`);
    assert.equal(root.userData.interactionKind, 'payload');
    assert.equal(root.userData.pickupRole, 'pod', `${kind} keeps the physical-custody role`);
    assert.equal(root.userData.animated, true, `${kind} still rides the ordnance tumble`);
    assert.equal(root.userData.generatedVisualProducer, 'visual-factory-procedural');
    assert.ok(resolveOrdnanceKindConfig(entity.type), 'the ordnance tumble still owns payloads');
    assert.deepEqual(entity.data, before, `building ${kind} never mutates sim data`);
    assert.equal(entity.data.masslineTetherable, true, `${kind} stays latchable`);
  }
});

test('remain recipes are shared-cache: the entity owns the group, teardown frees no recipe', () => {
  const factory = createVisualFactory();
  const a = factory.build(remainEntity('eel_body'));
  const b = factory.build(remainEntity('eel_body'));
  assert.notEqual(a, b, 'each body owns a fresh group — release-with-entity holds');
  const aMeshes = meshes(a), bMeshes = meshes(b);
  assert.equal(aMeshes.length, bMeshes.length);
  for (let i = 0; i < aMeshes.length; i++) {
    assert.equal(aMeshes[i].geometry, bMeshes[i].geometry, 'siblings share the cached geometry');
    assert.equal(aMeshes[i].material, bMeshes[i].material, 'siblings share the cached material');
    assert.notEqual(aMeshes[i], bMeshes[i], 'the mesh node itself is per-entity');
  }
  // Simulate the renderer's entity:destroyed teardown on one body — shared recipes must
  // survive (they are the noDispose cache tier), and the next same-kind body builds whole.
  for (const m of aMeshes) { m.geometry.dispose(); if (m.material.dispose) m.material.dispose(); }
  const c = factory.build(remainEntity('eel_body'));
  const cMeshes = meshes(c);
  assert.equal(cMeshes.length, aMeshes.length, 'a spent remain retires only its own group');
  assert.equal(cMeshes[0].geometry, aMeshes[0].geometry, 'the shared recipe survives teardown');
  assert.ok(cMeshes[0].geometry.getAttribute('position').count > 0, 'the recipe still draws');
});

test('non-remain payloads and unknown remain kinds keep the sealed canister', () => {
  const factory = createVisualFactory();
  const plain = factory.build({ id: 'p1', type: 'payload', radius: 8, data: {} });
  assert.equal(plain.userData.visualLanguage, 'sealed-cargo-canister');
  const cell = factory.build({ id: 'p2', type: 'payload', radius: 3, data: {
    kind: 'payload', payloadType: 'charge_cell', chargeCell: { version: 1, charge: 5 },
  } });
  assert.equal(cell.userData.visualLanguage, 'sealed-cargo-canister', 'charge cells are unchanged');
  const stamped = factory.build({ id: 'p3', type: 'payload', radius: 4, data: {
    kind: 'payload', payloadType: 'brood_remains', broodRemain: { familyId: 'mite', kind: 'future_kind' },
  } });
  assert.equal(stamped.userData.visualLanguage, 'sealed-cargo-canister',
    'a kind with no authored recipe falls through, still latchable');
  const unstamped = factory.build({ id: 'p4', type: 'payload', radius: 4, data: {
    kind: 'payload', payloadType: 'brood_remains',
  } });
  assert.equal(unstamped.userData.visualLanguage, 'sealed-cargo-canister');
  const volatile = factory.build({ id: 'p5', type: 'payload', radius: 3, data: { volatileClass: 'explosive' } });
  assert.equal(volatile.userData.visualLanguage, 'volatile-pressure-bottle',
    'the hazard bottle dispatch still wins first');
});
