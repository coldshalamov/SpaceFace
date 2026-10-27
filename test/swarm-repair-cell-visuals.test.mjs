// SWARM-40 — repair cell glance identity. A swarm_repair drop is the one pickup on the table
// that buys hull back, but it arrived as the fallback teal octahedron with an ore-amber wake —
// indistinguishable from a credit chip at glance range. It now builds its own silhouette (a
// squat upright patch-kit canister crowned by the heal-cross, painted in the repair verb's
// mint) and pulls that same mint thread through the loot trail. The pickup contract — kind,
// the gem pose target, the beacon ring, the shared noDispose caches — is unchanged, and every
// other drop keeps its own look.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { SWARM_BROOD_FAMILIES } from '../src/data/swarmBrood.js';
import { SWARM_BROOD_LATE_FAMILIES } from '../src/data/swarmBroodLate.js';
import { createVisualFactory, invalidateVisualFactoryCaches } from '../src/render/visualFactory.js';
import { lootTrailColorFor, vfx } from '../src/render/vfx.js';

globalThis.__SF_VISUAL_FACTORY_THROW__ = true;   // a wiring bug must fail the test, not fall back

test.afterEach(() => invalidateVisualFactoryCaches());

const REPAIR_MINT = '#84ffd2';

function cellEntity(over = {}) {
  return {
    id: 'repair-cell-1', alive: true, type: 'pickup', radius: 5,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    data: {
      kind: 'swarm_repair', amount: 1, swarmRepair: true,
      swarmDropIndex: 0, despawnAt: 16,
    },
    ...over,
  };
}

function meshes(root) {
  const out = [];
  root.traverse((o) => { if (o.isMesh) out.push(o); });
  return out;
}

// Geometry fingerprint + local pose per mesh — the same recipe as brood-remain-visuals, so a
// shared primitive in a different pose still reads as a different recipe. Scoped to the body
// the motion rig poses (userData.gem when the build stamps one); the beacon ring is pickup
// convention, not silhouette.
function silhouetteSignature(root) {
  const scope = (root.userData && root.userData.gem) || root;
  const parts = [];
  scope.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.getAttribute('position');
    let h = 0x811c9dc5;
    for (let i = 0; i < pos.count * 3; i++) {
      h = Math.imul(h ^ Math.round(pos.array[i] * 1024), 0x01000193) >>> 0;
    }
    const p = o.position, q = o.quaternion, s = o.scale;
    parts.push(`${pos.count}:${h.toString(16)}@${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`
      + `|${q.x.toFixed(4)},${q.y.toFixed(4)},${q.z.toFixed(4)},${q.w.toFixed(4)}`
      + `|${s.x.toFixed(4)},${s.y.toFixed(4)},${s.z.toFixed(4)}`);
  });
  return parts.sort().join('||');
}

// (a) The cell resolves its own authored visual — never the fallback octahedron.
test('a swarm repair cell builds the patch-kit canister, not the fallback octahedron', () => {
  const factory = createVisualFactory();
  const cell = factory.build(cellEntity());
  assert.ok(cell, 'the cell builds a visual');
  assert.equal(cell.name, 'SF_SwarmRepairCell');
  assert.equal(cell.userData.visualLanguage, 'swarm-repair-cell');
  assert.equal(cell.userData.pickupVisual, 'swarm_repair');
  assert.equal(cell.userData.pickupShape, 'repair_cell');
  // The pickup contract is intact: it still answers as a pickup and still carries the body
  // the tumble/strobe/intake poses plus the takeable beacon ring.
  assert.equal(cell.userData.kind, 'pickup');
  assert.equal(cell.userData.interactionKind, 'pickup');
  assert.ok(cell.userData.gem, 'userData.gem still names the pose target');
  assert.equal(cell.userData.gem.scale.x, 5, 'scale = radius — hit and magnet radii unchanged');
  assert.ok(cell.userData.pickupHalo && cell.userData.pickupHalo.isMesh, 'the takeable ring stays');
  assert.equal(cell.userData.pickupHalo.userData.baseScale, 5);
  // A composed body, not a recolored primitive — and no octahedron anywhere in it.
  const parts = meshes(cell.userData.gem);
  assert.ok(parts.length >= 6, `the patch kit is a composed body (got ${parts.length} parts)`);
  assert.ok(parts.every((m) => m.geometry.type !== 'OctahedronGeometry'), 'no fallback octahedron');
  // Kind-only reload paths (the flag missing) still resolve the cell.
  const kindOnly = factory.build(cellEntity({
    id: 'repair-cell-kindonly',
    data: { kind: 'swarm_repair', amount: 1 },
  }));
  assert.equal(kindOnly.userData.visualLanguage, 'swarm-repair-cell');
});

// The authored fiction: an upright banded canister crowned by the luminous heal-cross, painted
// in the repair verb's mint, with a white-hot weld seam under the lid.
test('the cell reads as medicine: crown cross in mint, weld seam hot, the ring mint', () => {
  const factory = createVisualFactory();
  const cell = factory.build(cellEntity());
  const parts = meshes(cell.userData.gem);
  const crossBars = parts.filter((m) => m.name.startsWith('SwarmRepairCrossBar'));
  assert.equal(crossBars.length, 2, 'the crown carries the two-bar cross');
  assert.equal(crossBars[0].geometry, crossBars[1].geometry, 'both arms share one cached geometry');
  for (const bar of crossBars) {
    assert.equal(bar.material.emissive.getHexString(), REPAIR_MINT.slice(1), 'the cross is mint');
    assert.ok(bar.material.emissiveIntensity >= 1.5, 'the cross is lit, not painted flat');
    assert.equal(typeof bar.onBeforeRender, 'function', 'the cross breathes on the glint beat');
  }
  // The two arms are perpendicular — a + from the top-down camera.
  const [a, b] = crossBars;
  assert.notEqual(a.quaternion.y, b.quaternion.y, 'the bars cross, not stack');
  const weld = parts.find((m) => m.name === 'SwarmRepairWeldSeam');
  assert.ok(weld, 'the lid-seat weld seam exists');
  assert.ok(weld.material.emissiveIntensity > 2, 'the weld seam reads white-hot');
  // The mint ring: same takeable halo, keyed to the cell's own color.
  const halo = cell.userData.pickupHalo;
  assert.equal(halo.material.color.getHexString(), REPAIR_MINT.slice(1), 'the ring is mint');
  // Upright stance: the body stands on Y — the only pickup silhouette that does.
  const box = new THREE.Box3().setFromObject(cell.userData.gem);
  const size = new THREE.Vector3(); box.getSize(size);
  assert.ok(size.y > size.x * 0.6 && size.y > size.z * 0.6,
    `the canister stands up (y ${size.y.toFixed(2)} vs x ${size.x.toFixed(2)}, z ${size.z.toFixed(2)})`);
});

// Per-cell pulse: the cross material is cloned per drop so one cell's breathe never paints
// a sibling, while the shell recipes stay shared-cache noDispose.
test('the cross pulse is per-cell but the recipe is shared-cache', () => {
  const factory = createVisualFactory();
  const a = factory.build(cellEntity({ id: 'cell-a' }));
  const b = factory.build(cellEntity({ id: 'cell-b' }));
  assert.notEqual(a, b, 'each drop owns a fresh group — release-with-entity holds');
  const aParts = meshes(a.userData.gem);
  const bParts = meshes(b.userData.gem);
  assert.equal(aParts.length, bParts.length);
  for (let i = 0; i < aParts.length; i++) {
    assert.equal(aParts[i].geometry, bParts[i].geometry, 'siblings share the cached geometry');
    assert.notEqual(aParts[i], bParts[i], 'the mesh node itself is per-entity');
  }
  const aCross = aParts.find((m) => m.name === 'SwarmRepairCrossBarA');
  const bCross = bParts.find((m) => m.name === 'SwarmRepairCrossBarA');
  assert.notEqual(aCross.material, bCross.material, 'the pulsing cross material is per-cell');
  const aShell = aParts.find((m) => m.name === 'SwarmRepairBarrel');
  const bShell = bParts.find((m) => m.name === 'SwarmRepairBarrel');
  assert.equal(aShell.material, bShell.material, 'the shell recipe stays shared');
  // Teardown on one body frees only its own group — the shared recipe still draws.
  for (const m of aParts) { m.geometry.dispose(); if (m.material.dispose) m.material.dispose(); }
  const c = factory.build(cellEntity({ id: 'cell-c' }));
  const cParts = meshes(c.userData.gem);
  assert.equal(cParts.length, aParts.length, 'a spent cell retires only its own group');
  assert.equal(cParts[0].geometry, aParts[0].geometry, 'the shared recipe survives teardown');
  assert.ok(cParts[0].geometry.getAttribute('position').count > 0, 'the recipe still draws');
});

// (b) The silhouette is unique on the field: charge-cell canister, every authored remain kind,
// one commodity per baked kit category, the credit chip, the hazard bottle, the octahedron.
test('the cell silhouette collides with no charge cell, remain, commodity pod, chip or bottle', () => {
  const factory = createVisualFactory();
  const cellSig = silhouetteSignature(factory.build(cellEntity({ id: 'sig-cell' })));
  const lookalikes = [];
  lookalikes.push(['charge-cell canister', factory.build({ id: 'cc', type: 'payload', radius: 5, data: {
    kind: 'payload', payloadType: 'charge_cell', chargeCell: { version: 1, charge: 5 },
  } })]);
  lookalikes.push(['generic canister', factory.build({ id: 'pod', type: 'payload', radius: 5, data: {} })]);
  for (const family of [...SWARM_BROOD_FAMILIES, ...SWARM_BROOD_LATE_FAMILIES]) {
    const kind = family && family.remains && family.remains.kind;
    if (!kind) continue;
    lookalikes.push([`remain:${kind}`, factory.build({
      id: `r-${kind}`, type: 'payload', radius: 5,
      data: {
        kind: 'payload', payloadType: 'brood_remains',
        broodRemain: { familyId: family.id, kind, createdTick: 0 },
      },
    })]);
  }
  const seenCategories = new Set();
  for (const c of COMMODITIES) {
    if (seenCategories.has(c.category)) continue;
    seenCategories.add(c.category);
    lookalikes.push([`commodity:${c.id}`, factory.build({
      id: `c-${c.id}`, type: 'pickup', radius: 5,
      data: { kind: 'commodity', commodityId: c.id },
    })]);
  }
  lookalikes.push(['impulse-charge commodity', factory.build({ id: 'chg', type: 'pickup', radius: 5, data: {
    kind: 'commodity', commodityId: 'cmdty_impulse_charge',
  } })]);
  lookalikes.push(['credit chip', factory.build({ id: 'chip', type: 'pickup', radius: 5, data: { kind: 'credit_chip' } })]);
  lookalikes.push(['volatile bottle', factory.build({ id: 'vol', type: 'pickup', radius: 5, data: { volatileClass: 'explosive' } })]);
  lookalikes.push(['custody canister', factory.build({ id: 'cust', type: 'pickup', radius: 5, data: { freightCustodyPod: true } })]);
  lookalikes.push(['module fallback', factory.build({ id: 'mod', type: 'pickup', radius: 5, data: { kind: 'module' } })]);
  for (const [label, other] of lookalikes) {
    assert.notEqual(silhouetteSignature(other), cellSig,
      `the repair cell must never read as ${label}`);
  }
});

// (c) The loot trail keys the cell to the repair mint — distinct from every other wake.
test('the loot trail keys the cell to mint, distinct from every other drop wake', () => {
  const mint = lootTrailColorFor(cellEntity());
  assert.equal(mint, REPAIR_MINT);
  // The flag alone (a data-only reload path) resolves the same mint.
  assert.equal(lootTrailColorFor({ type: 'pickup', data: { swarmRepair: true } }), REPAIR_MINT);
  assert.notEqual(mint, lootTrailColorFor({ type: 'payload', data: {} }), 'not pod green');
  assert.notEqual(mint, lootTrailColorFor({ type: 'payload', data: { payloadType: 'brood_remains' } }), 'not the remain wake');
  assert.notEqual(mint, lootTrailColorFor({ type: 'pickup', data: { kind: 'credit_chip' } }), 'not credit gold');
  assert.notEqual(mint, lootTrailColorFor({ type: 'pickup', data: { kind: 'module' } }), 'not the amber fallback');
  for (const c of COMMODITIES) {
    assert.notEqual(mint, lootTrailColorFor({ type: 'pickup', data: { kind: 'commodity', commodityId: c.id } }),
      `repair mint must not equal the ${c.id} wake`);
  }
});

// The live seam: a homed repair cell running the magnet lane trails mint end to end.
test('the live magnet lane trails mint for a homed repair cell', () => {
  const scene = new THREE.Scene();
  const player = {
    id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6,
  };
  const state = {
    playerId: 1, mode: 'flight',
    entities: new Map([[1, player]]), entityList: [player],
    entityIndex: { __spacefaceEntityIndexV1: true, ready: true, version: 1, pickups: [], payloads: [], ships: [player] },
    simTime: 0, tick: 0,
    camera: { focus: { x: 0, z: 0 } },
    world: { frameOrigin: { x: 0, z: 0 } },
    settings: { video: { particleQuality: 'low', motionReduce: false, engineTrails: false }, accessibility: { flashReduce: false } },
    render: { scene, camera: new THREE.PerspectiveCamera(), viewport: { height: 720 } },
  };
  const system = Object.create(vfx);
  system.init({ state, bus: createBus(), helpers: { player: () => player } });
  const cell = {
    id: 99, type: 'pickup', alive: true,
    pos: { x: 20, z: 0 }, vel: { x: -40, z: 0 },   // over LOOT_MAGNET_MIN_SPEED, inbound
    data: { kind: 'swarm_repair', swarmRepair: true },
  };
  state.entities.set(cell.id, cell);
  state.entityIndex.pickups = [cell];
  state.entityList.push(cell);
  const spriteColors = [];
  system._spawnSprite = (...args) => { spriteColors.push(args[9]); return null; };
  system._spawnParticle = () => null;
  assert.equal(system._updateLootMagnet(0.016), 1, 'the homed cell trails');
  assert.ok(spriteColors.includes(REPAIR_MINT),
    `the wake carries the mint (saw ${JSON.stringify(spriteColors)})`);
});

// (d) Every other drop keeps its own look — the new branch swallowed nothing.
test('other pickups keep their own look — the new dispatch swallowed nothing', () => {
  const factory = createVisualFactory();
  const ore = factory.build({ id: 'ore', type: 'pickup', radius: 2.2, pos: { x: 0, z: 0 }, data: { kind: 'commodity', commodityId: 'cmdty_ore_iron' } });
  assert.equal(ore.userData.pickupShape, 'raw_ore');
  assert.equal(ore.userData.gem.material.emissive.getHexString(), 'c89a6a');
  const mystery = factory.build({ id: 'mod', type: 'pickup', radius: 2.2, pos: { x: 0, z: 0 }, data: { kind: 'module' } });
  assert.equal(mystery.userData.gem.geometry.type, 'OctahedronGeometry', 'non-commodity kinds keep the octahedron');
  assert.equal(mystery.userData.gem.material.emissive.getHexString(), '9b6cff', 'module violet is unchanged');
  assert.equal(mystery.userData.pickupShape, 'octahedron');
  const unknown = factory.build({ id: 'unk', type: 'pickup', radius: 2.2, pos: { x: 0, z: 0 }, data: { kind: 'mystery_box' } });
  assert.equal(unknown.userData.gem.geometry.type, 'OctahedronGeometry');
  assert.equal(unknown.userData.gem.material.emissive.getHexString(), '7af7d0', 'fallback teal stays the fallback');
  const chip = factory.build({ id: 'chip', type: 'pickup', radius: 2.2, pos: { x: 0, z: 0 }, data: { kind: 'credit_chip' } });
  assert.equal(chip.userData.pickupVisual, 'credit_chip');
  assert.equal(chip.userData.pickupRole, 'chip');
  const crate = factory.build({ id: 'cust', type: 'pickup', radius: 2.2, pos: { x: 0, z: 0 }, data: { freightCustodyPod: true } });
  assert.equal(crate.userData.visualLanguage, 'sealed-cargo-canister');
  assert.ok(crate.userData.pickupHalo, 'custody canister keeps the collectible ring');
  const bottle = factory.build({ id: 'vol', type: 'pickup', radius: 2.2, pos: { x: 0, z: 0 }, data: { volatileClass: 'explosive' } });
  assert.equal(bottle.userData.visualLanguage, 'volatile-pressure-bottle');
  // A repair mark on a non-pickup body is not the pickup recipe — payloads stay canisters.
  const notAPickup = factory.build({ id: 'np', type: 'payload', radius: 3, pos: { x: 0, z: 0 }, data: { kind: 'swarm_repair', swarmRepair: true } });
  assert.equal(notAPickup.userData.visualLanguage, 'sealed-cargo-canister');
});
