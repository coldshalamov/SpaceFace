import assert from 'node:assert/strict';

let applyPartProvenance = () => {
  throw new Error('applyPartProvenance is not implemented');
};
let generatorForAuthoringMethod = () => 'unimplemented';
let allowsFactorOnlySource = () => true;
try {
  ({
    applyPartProvenance,
    generatorForAuthoringMethod,
    allowsFactorOnlySource,
  } = await import('../tools/art/lib/partProvenance.mjs'));
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}

const gltf = {
  asset: {
    version: '2.0',
    generator: 'Blender 4.3 authored source',
    extras: {
      license: 'CC0-test',
      sourceProvenance: { artist: 'fixture-author', generator: 'custom-preflight' },
      spacefaceAsset: { originalAssetFlag: true },
    },
  },
  scene: 0,
  scenes: [{
    extras: {
      authoredLighting: 'fixture-rig',
      sourceProvenance: { sceneAuthor: 'fixture-scene-author' },
      spacefaceAsset: { originalSceneFlag: true },
    },
  }],
};

applyPartProvenance(gltf, {
  authoringMethod: 'blender_generic',
  authoringEntry: { blend_path: 'assets/ships/parts/blender/engine_plasma_ring_authored.blend' },
  sfAsset: { assetId: 'SF_ENGINE_PLASMA_RING', slot: 'engine' },
  assetExtras: { partId: 'engine_plasma_ring', triangleCount: 3300 },
  textureRoleContract: { version: 1, mode: 'bound-base-normal-orm' },
});

assert.equal(
  gltf.asset.generator,
  'SpaceFace tools/art/blender/export_sprint_part.py -> tools/blender/spaceface_export.py + tools/art/finalize_part.mjs - Blender-authored generic asset',
  'generic Blender authoring must not claim the place-archetype generator',
);
assert.equal(gltf.asset.extras.license, 'CC0-test', 'unrelated asset extras must survive');
assert.equal(gltf.asset.extras.sourceProvenance.artist, 'fixture-author', 'prior source provenance must merge');
assert.equal(gltf.asset.extras.sourceProvenance.generator, 'custom-preflight', 'prior provenance generator must survive');
assert.equal(gltf.asset.extras.sourceProvenance.priorGenerator, 'Blender 4.3 authored source');
assert.equal(gltf.asset.extras.sourceProvenance.authoringMethod, 'blender_generic');
assert.equal(
  gltf.asset.extras.sourceProvenance.blendPath,
  'assets/ships/parts/blender/engine_plasma_ring_authored.blend',
);
assert.equal(gltf.asset.extras.sourceProvenance.textureRoleContractVersion, 1);
assert.equal(gltf.asset.extras.sourceProvenance.textureRoleMode, 'bound-base-normal-orm');
assert.equal(gltf.asset.extras.spacefaceAsset.originalAssetFlag, true, 'prior spaceface asset extras must merge');
assert.equal(gltf.asset.extras.spacefaceAsset.assetId, 'SF_ENGINE_PLASMA_RING');
assert.equal(gltf.asset.extras.partId, 'engine_plasma_ring');
assert.equal(gltf.asset.extras.triangleCount, 3300);
assert.equal(gltf.scenes[0].extras.authoredLighting, 'fixture-rig', 'unrelated scene extras must survive');
assert.equal(
  gltf.scenes[0].extras.sourceProvenance.sceneAuthor,
  'fixture-scene-author',
  'prior scene provenance must survive',
);
assert.equal(gltf.scenes[0].extras.spacefaceAsset.originalSceneFlag, true);
assert.equal(gltf.scenes[0].extras.spacefaceAsset.assetId, 'SF_ENGINE_PLASMA_RING');

assert.throws(
  () => generatorForAuthoringMethod('mystery_blender_claim'),
  /unsupported authoring method.*mystery_blender_claim/i,
  'unknown methods must not silently receive procedural provenance',
);

assert.equal(allowsFactorOnlySource('blender_mcp', {}), true,
  'legacy place-authoring Blender assets retain the sanctioned factor-only source path');
assert.equal(
  allowsFactorOnlySource('blender_generic', { texture_role_owner: 'finalizer-v1' }),
  false,
  'generic finalizer-owned assets must synthesize runtime-required texture roles',
);
assert.equal(allowsFactorOnlySource('procedural_fallback', {}), false);

console.log('PASS part provenance: generic Blender path and extras merge');
