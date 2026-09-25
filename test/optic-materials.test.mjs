// optic-materials — the visual half of build_map §24 "the picture and the sound".
// The gallery test is a stranger test: three optic kinds must read as three physical
// things before firing, and a discharged prism must read dead. This file probes the
// material/presentation seam — stone/metal/diamond/spent produce measurably different
// bodies, a live->spent->live flip refreshes the built mesh, and ordinary asteroids
// are untouched.

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createVisualFactory } from '../src/render/visualFactory.js';
import { createAsteroidMotionTracker } from '../src/render/asteroidMotionPresentation.js';
import { preloadRockSurfaceLibrary } from '../src/render/rockSurfaceLibrary.js';
import {
  OPTIC_DETAILS_USERDATA_KEY,
  OPTIC_SKIN_USERDATA_KEY,
  opticCellBodyMaterial,
  opticCellDetailMaterial,
  opticCellKindOf,
  syncOpticCellSkin,
} from '../src/render/opticCellPresentation.js';

const OPTIC_TINTS = { stone: 0x6b6358, metal: 0xd5dee8, diamond: 0xe7fbff, spent: 0x3a4a58 };
const OPTIC_TYPE_IDS = {
  stone: 'ast_common_rock',
  metal: 'ast_metallic',
  diamond: 'ast_crystalline',
  spent: 'ast_crystalline',
};

function opticEntity(kind, id = `optic_cell_${kind}`) {
  return {
    id,
    type: 'asteroid',
    radius: kind === 'stone' ? 34 : kind === 'metal' ? 16 : 13,
    pos: { x: 0, y: 0, z: 0 },
    data: {
      typeId: OPTIC_TYPE_IDS[kind],
      tint: OPTIC_TINTS[kind],
      opticMaterial: kind,
      surfaceMaterial: kind === 'stone' ? 'rock' : kind === 'metal' ? 'mirror' : 'optic_diamond',
      size: 14,
    },
  };
}

function buildOpticCell(kind, id) {
  const entity = opticEntity(kind, id);
  const root = createVisualFactory().build(entity);
  assert(root && root.userData && root.userData.asteroidBody, `optic ${kind} built a body`);
  return { entity, root, body: root.userData.asteroidBody };
}

function luminance(material) {
  const c = material && material.color;
  return c ? 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b : 0;
}

// The stone skin answers the shared rock maps when the surface library is decoded;
// give the test process a decoded library so the mapped path is the one exercised.
await preloadRockSurfaceLibrary({ initTexture: () => {} }, {
  loadTexture: async () => new THREE.Texture(),
});

test('optic kind detection reads data.opticMaterial and nothing else', () => {
  assert.equal(opticCellKindOf(opticEntity('diamond')), 'diamond');
  assert.equal(opticCellKindOf(opticEntity('spent')), 'spent');
  assert.equal(opticCellKindOf({ id: 'plain', type: 'asteroid', data: {} }), null);
  assert.equal(opticCellKindOf({ id: 'tinted', type: 'asteroid', data: { tint: 0xff0000 } }), null);
  assert.equal(opticCellKindOf({ id: 'bogus', type: 'asteroid', data: { opticMaterial: 'vibranium' } }), null);
  assert.equal(opticCellKindOf(null), null);
});

test('the three live kinds produce measurably different body materials', () => {
  const stone = opticCellBodyMaterial('stone', 0);
  const metal = opticCellBodyMaterial('metal');
  const diamond = opticCellBodyMaterial('diamond');

  assert.ok(stone && metal && diamond, 'every live kind resolves a body material');
  assert.notEqual(stone, metal);
  assert.notEqual(stone, diamond);
  assert.notEqual(metal, diamond);

  // stone — matte absorber: opaque, high roughness, no transmission, never a mirror.
  assert.equal(stone.transmission || 0, 0, 'stone must not transmit');
  assert.ok(stone.roughness >= 0.9, `stone roughness ${stone.roughness} must read matte`);
  assert.ok(!stone.metalnessMap ? stone.metalness <= 0.05 : true, 'bare stone stays non-metallic');
  assert.ok(stone.envMapIntensity <= 1.0, 'stone must not chase the environment');

  // metal — the mirror: full metalness, tight roughness, strong environment response.
  assert.equal(metal.metalness, 1.0);
  assert.ok(metal.roughness <= 0.2, `metal roughness ${metal.roughness} must read polished`);
  assert.ok(metal.envMapIntensity >= 1.5, 'a mirror must ride the reflection environment');
  assert.equal(metal.transmission || 0, 0);

  // diamond — the prism: transmissive glass, the only kind that lets light through.
  assert.ok(diamond.transmission >= 0.6, `diamond transmission ${diamond.transmission} must read as glass`);
  assert.ok(diamond.isMeshPhysicalMaterial, 'the prism uses the physical material path');

  // Pairwise gaps a stranger can see without numbers: matte-vs-polished and clear-vs-solid.
  assert.ok(stone.roughness - metal.roughness >= 0.5, 'matte vs mirror must be unmissable');
  assert.ok((diamond.transmission || 0) - (stone.transmission || 0) >= 0.6, 'clear vs opaque must be unmissable');
  assert.ok((diamond.emissiveIntensity || 0) > (stone.emissiveIntensity || 0),
    'the charged prism carries a whisper of light the absorber does not');
});

test('spent prism is measurably dead beside the live diamond', () => {
  const live = opticCellBodyMaterial('diamond');
  const spent = opticCellBodyMaterial('spent');
  assert.notEqual(live, spent);
  assert.ok(live.transmission - spent.transmission >= 0.4,
    `spent must darken: live ${live.transmission} vs spent ${spent.transmission}`);
  assert.ok(luminance(spent) < luminance(live) * 0.6,
    `spent color must be visibly darker (${luminance(spent).toFixed(3)} vs ${luminance(live).toFixed(3)})`);
  assert.ok(spent.emissiveIntensity < live.emissiveIntensity * 0.5,
    'the dead prism loses its internal light');
  assert.ok((spent.iridescence || 0) < (live.iridescence || 0),
    'the dead prism loses the spectral film');
});

test('built cells carry the kind stamp; prism bodies dress internal facet inclusions', () => {
  const factory = createVisualFactory();
  for (const kind of ['stone', 'metal', 'diamond', 'spent']) {
    const root = factory.build(opticEntity(kind));
    assert.equal(root.userData[OPTIC_SKIN_USERDATA_KEY], kind, `${kind} stamps its skin`);
    assert.ok(root.userData.asteroidBody.isMesh, `${kind} body is the tumble target`);
    // Generic ore decorations are suppressed: the root only carries the body.
    assert.equal(root.children.length, 1, `${kind} must not inherit neon shards / ore veins`);
    const inclusions = root.userData[OPTIC_DETAILS_USERDATA_KEY] || [];
    if (kind === 'diamond' || kind === 'spent') {
      assert.ok(inclusions.length >= 3, `${kind} carries visible internal facets`);
      assert.ok(inclusions.every((m) => m.parent === root.userData.asteroidBody),
        'inclusions ride the body so they tumble inside the stone');
    } else {
      assert.equal(inclusions.length, 0, `${kind} has no prism inclusions`);
    }
  }
  // Shared caches: identical kinds share one material object — a lattice never mints per-cell.
  const a = createVisualFactory().build(opticEntity('diamond', 'optic_a'));
  const b = createVisualFactory().build(opticEntity('diamond', 'optic_b'));
  assert.equal(a.userData.asteroidBody.material, b.userData.asteroidBody.material,
    'two live prisms share the cached physical material');
});

test('a material flip refreshes the built mesh through the live presentation seam', () => {
  const factory = createVisualFactory();
  const entity = opticEntity('diamond', 'optic_flip');
  const root = factory.build(entity);
  const body = root.userData.asteroidBody;
  const liveMaterial = body.material;
  const liveFacetMaterial = opticCellDetailMaterial('diamond');

  // The sim spends the cell: opticMaterial and tint flip on the entity, mesh untouched.
  entity.data.opticMaterial = 'spent';
  entity.data.tint = 0x3a4a58;
  const tracker = createAsteroidMotionTracker();
  tracker.updateAsteroidMotion(entity, root, 0.1, 0.016);

  const spentMaterial = opticCellBodyMaterial('spent');
  assert.equal(body.material, spentMaterial, 'spent data re-skins the body through updateAsteroidMotion');
  assert.notEqual(body.material, liveMaterial);
  assert.equal(root.userData[OPTIC_SKIN_USERDATA_KEY], 'spent');
  const deadFacet = opticCellDetailMaterial('spent');
  for (const shard of root.userData[OPTIC_DETAILS_USERDATA_KEY]) {
    assert.equal(shard.material, deadFacet, 'internal facets go dark with the cell');
    assert.notEqual(shard.material, liveFacetMaterial);
  }

  // Rekindle: the quiet timer restores diamond — the same seam restores the look.
  entity.data.opticMaterial = 'diamond';
  entity.data.tint = 0xe7fbff;
  tracker.updateAsteroidMotion(entity, root, 0.2, 0.016);
  assert.equal(body.material, liveMaterial, 'rekindle restores the live prism skin');
  assert.equal(root.userData[OPTIC_SKIN_USERDATA_KEY], 'diamond');
  for (const shard of root.userData[OPTIC_DETAILS_USERDATA_KEY]) {
    assert.equal(shard.material, liveFacetMaterial, 'internal facets relight on rekindle');
  }
});

test('syncOpticCellSkin is idempotent and never touches non-optic asteroids', () => {
  const factory = createVisualFactory();
  // ast_common_rock keeps the plain-rock case on the shared surface path — ast_metallic
  // synthesizes a canvas noise map, which this node process cannot build.
  const plain = { id: 'belt_rock', type: 'asteroid', radius: 15, pos: { x: 0, y: 0, z: 0 }, data: { typeId: 'ast_common_rock' } };
  const plainRoot = factory.build(plain);
  const plainMaterial = plainRoot.userData.asteroidBody.material;

  assert.equal(syncOpticCellSkin(plain, plainRoot), false, 'non-optic rocks exit the sync untouched');
  assert.equal(plainRoot.userData[OPTIC_SKIN_USERDATA_KEY], undefined);
  assert.equal(plainRoot.userData.asteroidBody.material, plainMaterial);

  const tracker = createAsteroidMotionTracker();
  tracker.updateAsteroidMotion(plain, plainRoot, 1.0, 0.016);
  assert.equal(plainRoot.userData.asteroidBody.material, plainMaterial,
    'the per-frame seam leaves ordinary rocks alone');

  // Idempotent on the optic path: a matched stamp is a no-op, a foreign root is safe.
  const { entity, root } = buildOpticCell('metal', 'optic_idle');
  assert.equal(syncOpticCellSkin(entity, root), false, 'an unchanged kind does not re-dress');
  assert.equal(syncOpticCellSkin(entity, null), false);
  assert.equal(syncOpticCellSkin(null, root), false);
});
