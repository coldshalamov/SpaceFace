// LW-06: specialist recovery art. This unwrapped factory exercises procedural fallback dispatch;
// production's ordinary authored admission selects the existing packaged whole ships instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { createVisualFactory } from '../src/render/visualFactory.js';
import { ENEMY_ROLE_VARIANT_BUILDERS } from '../src/render/enemyRoleVariants.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';

// Procedural ship materials paint canvas textures (hull panel maps, grime). The factory needs a
// 2D context; this is the same stub shape arcade-core-kill-economy uses for headless ship builds.
function stubCanvas() {
  const context = {
    createImageData(width, height) {
      return { data: new Uint8ClampedArray(width * height * 4), width, height };
    },
    putImageData() {}, fillRect() {}, strokeRect() {}, clearRect() {}, drawImage() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {}, fill() {}, stroke() {},
    quadraticCurveTo() {}, bezierCurveTo() {}, fillText() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  return { width: 256, height: 256, getContext: () => context };
}

globalThis.document ||= { createElement: () => stubCanvas() };

const TARGETS = [
  { enemyId: 'warden_escort', silhouette: 'warden_screen', minSignatureMeshes: 6 },
  { enemyId: 'field_anchor_controller', silhouette: 'anchor_dish', minSignatureMeshes: 4 },
  { enemyId: 'mine_layer_jackal', silhouette: 'jackal_rack', minSignatureMeshes: 8 },
  { enemyId: 'customs_cutter', silhouette: 'customs_prow', minSignatureMeshes: 4 },
];

function enemyRow(id) {
  const row = ENEMY_TYPES.find((e) => e.id === id);
  assert.ok(row, `ENEMY_TYPES contains ${id}`);
  return row;
}

// Mimic the live spawn shape: enemySpawnSpec puts defId/silhouette/visualTier/lootTableId on
// data and factionId/team/radius on the entity.
function fakeEnemyEntity(row) {
  return {
    type: 'ship',
    team: 1,
    factionId: row.factionId,
    radius: row.collisionRadius || 18,
    data: { defId: row.shipId, silhouette: row.silhouette, visualTier: 5, lootTableId: row.id },
  };
}

function fingerprint(root) {
  let meshes = 0, tris = 0;
  const box = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    meshes++;
    const g = o.geometry;
    tris += Math.round((g.index ? g.index.count : g.getAttribute('position').count) / 3);
    if (g.boundingSphere == null) g.computeBoundingSphere();
    const c = g.boundingSphere.center.clone().applyMatrix4(o.matrixWorld);
    const r = g.boundingSphere.radius * Math.max(o.matrixWorld.elements[0], 0.0001);
    box.expandByPoint(new THREE.Vector3(c.x - r, c.y - r, c.z - r));
    box.expandByPoint(new THREE.Vector3(c.x + r, c.y + r, c.z + r));
  });
  const size = new THREE.Vector3(); box.getSize(size);
  return { meshes, tris, size };
}

function signatureNode(root, key) {
  let found = null;
  root.traverse((o) => {
    if (o.userData && o.userData.roleVariant === key) found = o;
  });
  return found;
}

function countMeshes(node) {
  let n = 0;
  node.traverse((o) => { if (o.isMesh) n++; });
  return n;
}

test('enemy rows carry the new role-variant silhouette keys', () => {
  for (const t of TARGETS) {
    assert.equal(enemyRow(t.enemyId).silhouette, t.silhouette, `${t.enemyId} silhouette`);
  }
  // The roles that keep the bruiser read are unchanged.
  for (const id of ['bruiser_brawler', 'pd_screen_escort', 'mirrorjaw_foreman', 'forge_regent']) {
    assert.equal(enemyRow(id).silhouette, 'bruiser_armor', `${id} keeps bruiser_armor`);
  }
});

test('every variant key resolves a registered builder through procedural fallback dispatch', () => {
  globalThis.__SF_VISUAL_FACTORY_THROW__ = true;
  try {
    const vf = createVisualFactory();
    for (const t of TARGETS) {
      const root = vf.build(fakeEnemyEntity(enemyRow(t.enemyId)));
      assert.ok(root, `${t.enemyId} produced a visual root`);
      assert.notEqual(root.userData.visualBuildFailed, true, `${t.enemyId} build must not fail closed`);
      // The signature group is tagged before batching and survives optimizeStaticBatches —
      // its presence proves data.silhouette resolved the variant builder, not the def-family builder.
      const sig = signatureNode(root, t.silhouette);
      assert.ok(sig, `${t.enemyId} resolved builder for silhouette '${t.silhouette}' (tagged signature group missing)`);
      assert.ok(countMeshes(sig) >= 2, `${t.silhouette} signature group kept renderable parts after batching`);
      assert.ok(fingerprint(root).meshes > 0, `${t.enemyId} produced renderable meshes`);
    }
  } finally {
    delete globalThis.__SF_VISUAL_FACTORY_THROW__;
  }
});

test('fallback variants produce distinct geometry from the bruiser builder and each other', () => {
  globalThis.__SF_VISUAL_FACTORY_THROW__ = true;
  try {
    const vf = createVisualFactory();
    const prints = {};
    for (const t of TARGETS) {
      const row = enemyRow(t.enemyId);
      prints[t.silhouette] = fingerprint(vf.build(fakeEnemyEntity(row)));
      // Same hull def under the old shared read.
      const baseline = fingerprint(vf.build({
        type: 'ship', team: 1, factionId: row.factionId, radius: row.collisionRadius || 18,
        data: { defId: row.shipId, silhouette: 'bruiser_armor', visualTier: 5, lootTableId: row.id },
      }));
      assert.notEqual(prints[t.silhouette].tris, baseline.tris,
        `${t.silhouette} must not collapse to the bruiser_armor geometry on ${row.shipId}`);
    }
    const triSet = new Set(Object.values(prints).map((p) => p.tris));
    assert.equal(triSet.size, TARGETS.length, 'the four fallback meshes have distinct triangle counts');
  } finally {
    delete globalThis.__SF_VISUAL_FACTORY_THROW__;
  }
});

test('an unknown silhouette still falls back to the ship-def family unchanged', () => {
  globalThis.__SF_VISUAL_FACTORY_THROW__ = true;
  try {
    const vf = createVisualFactory();
    const base = { type: 'ship', team: 1, factionId: 'faction_reach', radius: 20, data: { defId: 'ship_bastion', visualTier: 5 } };
    const plain = fingerprint(vf.build(base));
    const unknown = fingerprint(vf.build({
      ...base, data: { ...base.data, silhouette: 'no_such_silhouette_lw06' },
    }));
    assert.equal(unknown.meshes, plain.meshes, 'unknown silhouette takes the def-family path');
    assert.equal(unknown.tris, plain.tris, 'unknown silhouette draws the identical def-family hull');
    assert.equal(signatureNode(vf.build({
      ...base, data: { ...base.data, silhouette: 'no_such_silhouette_lw06' },
    }), 'no_such_silhouette_lw06'), null);
  } finally {
    delete globalThis.__SF_VISUAL_FACTORY_THROW__;
  }
});

// --- Direct builder contract: the registry map and each builder's part accounting ----------

function fakeCtx(seed = 4242, vis = { length: 1.72, halfWidth: 0.35, height: 0.41 }) {
  const hm = new THREE.MeshStandardMaterial({ color: 0x5a3038, roughness: 0.6, metalness: 0.4 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x201012, emissive: new THREE.Color(0xff3b30), emissiveIntensity: 1.7 });
  return { g: new THREE.Group(), R: 10, pal: {}, hm, accent, cockpit: hm, vis, tier: {}, hints: {}, seed, blinkers: [] };
}

test('registry exposes exactly the four role-variant builders', () => {
  assert.deepEqual(Object.keys(ENEMY_ROLE_VARIANT_BUILDERS).sort(),
    ['anchor_dish', 'customs_prow', 'jackal_rack', 'warden_screen']);
  for (const key of Object.keys(ENEMY_ROLE_VARIANT_BUILDERS)) {
    assert.equal(typeof ENEMY_ROLE_VARIANT_BUILDERS[key], 'function', `${key} is a builder`);
  }
});

test('each builder adds its hull plus a tagged signature group of the expected size', () => {
  const expected = { warden_screen: 6, anchor_dish: 4, jackal_rack: 8, customs_prow: 4 };
  for (const t of TARGETS) {
    const ctx = fakeCtx();
    ENEMY_ROLE_VARIANT_BUILDERS[t.silhouette](ctx);
    const sig = signatureNode(ctx.g, t.silhouette);
    assert.ok(sig, `${t.silhouette} tags its signature group`);
    assert.equal(countMeshes(sig), expected[t.silhouette], `${t.silhouette} signature part count`);
    // Hull + signature: the variant is always meatier than a bare armored slab.
    assert.ok(countMeshes(ctx.g) > countMeshes(sig), `${t.silhouette} builds a hull under the signature`);
  }
});

test('anchor_dish registers a dim pulsing core on ctx.blinkers', () => {
  const ctx = fakeCtx();
  ENEMY_ROLE_VARIANT_BUILDERS.anchor_dish(ctx);
  assert.equal(ctx.blinkers.length, 1, 'anchor_dish pushes exactly one blinker');
  const blink = ctx.blinkers[0].userData.blink;
  assert.ok(blink, 'blinker carries the driver contract');
  assert.ok(blink.hz > 0 && blink.hz < 1, `dim pulse is slow (hz=${blink.hz})`);
  assert.ok(blink.base > 0 && blink.base < 2, `dim pulse stays below nav-light brightness (base=${blink.base})`);
  assert.ok(ctx.blinkers[0].material !== ctx.accent, 'core clones the accent material before pulsing it');
});

test('builders are deterministic: same seed, same pose; no ambient randomness', () => {
  for (const key of Object.keys(ENEMY_ROLE_VARIANT_BUILDERS)) {
    const pose = (seed) => {
      const ctx = fakeCtx(seed);
      ENEMY_ROLE_VARIANT_BUILDERS[key](ctx);
      const out = [];
      ctx.g.traverse((o) => { if (o.isMesh) out.push([o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z]); });
      return out;
    };
    assert.deepEqual(pose(777), pose(777), `${key} is seed-deterministic`);
  }
});

test('seeded role variation is stable and responds to a different seed', () => {
  for (const key of ['warden_screen', 'jackal_rack']) {
    const pose = (seed) => {
      const ctx = fakeCtx(seed);
      ENEMY_ROLE_VARIANT_BUILDERS[key](ctx);
      const poses = [];
      signatureNode(ctx.g, key).traverse((o) => {
        if (o.isMesh) poses.push([o.position.x, o.position.y, o.position.z, o.rotation.x]);
      });
      return poses;
    };
    assert.deepEqual(pose(777), pose(777));
    assert.notDeepEqual(pose(777), pose(778), `${key} uses its seed`);
  }
});
