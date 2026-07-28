import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const ROOT = process.cwd();
const FAMILY = resolve(ROOT, 'assets/ships/kestrel_borrowed_time_v4');
const BUILD_REPORT = resolve(FAMILY, 'evidence/material_truth_v6_build_report.json');
const FINALIZE_REPORT = resolve(FAMILY, 'evidence/material_truth_v6_finalize_report.json');
const TRIANGLE_RANGES = [
  [20_900, 21_300],
  [12_550, 12_950],
  [9_350, 9_700],
];

const sha256 = (path) => createHash('sha256')
  .update(readFileSync(path))
  .digest('hex')
  .toUpperCase();

function report(path) {
  assert.ok(existsSync(path), `${path} must exist`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function countTriangles(document) {
  return document.getRoot().listMeshes().reduce(
    (total, mesh) => total + mesh.listPrimitives().reduce((meshTotal, primitive) => {
      const indices = primitive.getIndices();
      const position = primitive.getAttribute('POSITION');
      return meshTotal + Math.floor((indices?.getCount() ?? position?.getCount() ?? 0) / 3);
    }, 0),
    0,
  );
}

function countMaterialTriangles(document, materialName) {
  return document.getRoot().listMeshes().reduce(
    (total, mesh) => total + mesh.listPrimitives().reduce((meshTotal, primitive) => {
      if (primitive.getMaterial()?.getName() !== materialName) return meshTotal;
      const indices = primitive.getIndices();
      const position = primitive.getAttribute('POSITION');
      return meshTotal + Math.floor((indices?.getCount() ?? position?.getCount() ?? 0) / 3);
    }, 0),
    0,
  );
}

function mappedUvDefects(document) {
  const defects = [];
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const material = primitive.getMaterial();
      const mapped = material && (
        material.getBaseColorTexture()
        || material.getNormalTexture()
        || material.getMetallicRoughnessTexture()
        || material.getOcclusionTexture()
      );
      if (!mapped) continue;
      const uvAccessor = primitive.getAttribute('TEXCOORD_0');
      const normal = primitive.getAttribute('NORMAL');
      const tangent = primitive.getAttribute('TANGENT');
      if (!uvAccessor || !normal || !tangent) {
        defects.push(`${mesh.getName()}/${material.getName()}:missing-vertex-role`);
        continue;
      }
      const uv = uvAccessor.getArray();
      const indicesAccessor = primitive.getIndices();
      const indices = indicesAccessor?.getArray();
      const count = indicesAccessor?.getCount() ?? uvAccessor.getCount();
      for (let offset = 0; offset < count; offset += 3) {
        const ia = indices ? indices[offset] : offset;
        const ib = indices ? indices[offset + 1] : offset + 1;
        const ic = indices ? indices[offset + 2] : offset + 2;
        const ax = uv[ia * 2];
        const ay = uv[ia * 2 + 1];
        const bx = uv[ib * 2];
        const by = uv[ib * 2 + 1];
        const cx = uv[ic * 2];
        const cy = uv[ic * 2 + 1];
        const determinant = Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
        const uvArea = determinant * 0.5;
        if (!(uvArea > 1e-10)) {
          defects.push(
            `${mesh.getName()}/${material.getName()}:triangle-${offset / 3}:${uvArea}`,
          );
        }
      }
    }
  }
  return defects;
}

test('Kestrel V6 build is one hash-coherent isolated generation', () => {
  const build = report(BUILD_REPORT);
  assert.equal(build.status, 'complete');
  assert.equal(build.candidateOnly, true);
  assert.equal(build.livePromotion, false);
  assert.equal(build.materialTruthPassId, 'kestrel-material-truth-v6');
  assert.equal(build.surfaceRemasterId, 'kestrel-role-surface-v6-material-truth');
  assert.equal(build.materialTruth.heroMarking, 'DIE LAUGHING');
  assert.equal(build.materialTruth.objectsAdded, 554);
  assert.equal(build.materialTruth.visibleObjectCount, 734);
  const {
    minMeasuredSurfaceOffsetMeters,
    maxMeasuredSurfaceOffsetMeters,
    ...markingContract
  } = build.materialTruth.heroMarkingContract;
  assert.deepEqual(markingContract, {
    mainObject: 'V6_HeroMark_DieLaughing',
    wearObject: 'V6_HeroMark_DieLaughing_Wear',
    method: 'conventionally-authored-vector-stencil-v2',
    style: 'original-protest-punk-hand-cut-stencil',
    targetSurface: 'V6_ShoulderArmor_Port_Aft',
    generatedPixelsShipped: false,
    mainDetailLevel: 0,
    wearDetailLevel: 2,
    wearLodPolicy: 'LOD0_only_detail2',
    surfaceOffsetMeters: 0.0003,
    missingPaintBreaks: 7,
    oversprayFragments: 34,
    referenceSha256: 'EB4CA35AE6B22817037FA7717C7C9CACEEEAB65965730F7F388A7FE5E5036ECF',
  });
  assert.ok(minMeasuredSurfaceOffsetMeters >= 0.000299);
  assert.ok(maxMeasuredSurfaceOffsetMeters <= 0.000301);
  assert.equal(build.materialTruth.existingMaterialBillCoverage.missing, 0);
  assert.equal(build.generationFingerprint, build.generation.generationFingerprint);

  for (const [relativePath, expected] of Object.entries(build.generation.scriptSha256)) {
    assert.equal(sha256(resolve(FAMILY, relativePath)), expected, relativePath);
  }
  const productionBlend = resolve(FAMILY, build.productionBlend);
  assert.equal(sha256(productionBlend), build.productionBlendSha256);
  assert.equal(statSync(productionBlend).size, build.productionBlendBytes);
  assert.equal(
    build.productionBlendCollectionVisibility.KESTREL_V4_PRODUCTION_SOURCE,
    true,
  );
  assert.equal(build.productionBlendCollectionVisibility.KESTREL_V5_GOLDEN_DETAIL, true);
  assert.equal(build.productionBlendCollectionVisibility.KESTREL_V6_MATERIAL_TRUTH, true);
  assert.equal(build.productionBlendCollectionVisibility.RIG_AND_SOCKETS, true);
  for (const row of build.lods) {
    const path = resolve(FAMILY, row.path);
    assert.equal(sha256(path), row.sha256, row.path);
    assert.equal(statSync(path).size, row.bytes, row.path);
    assert.equal(row.generationFingerprint, build.generationFingerprint);
    assert.equal(row.tangentRepairs.every((repair) => repair.badAfter === 0), true);
  }
});

test('Kestrel V6 source LODs preserve mapped vertex roles and noncollapsed UVs', async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const build = report(BUILD_REPORT);
  for (let lod = 0; lod < 3; lod += 1) {
    const document = await io.read(resolve(FAMILY, build.lods[lod].path));
    const visibleTriangles = countTriangles(document) - 22;
    const [minimum, maximum] = TRIANGLE_RANGES[lod];
    assert.ok(
      visibleTriangles >= minimum && visibleTriangles <= maximum,
      `LOD${lod} ${visibleTriangles} outside ${minimum}-${maximum}`,
    );
    assert.deepEqual(mappedUvDefects(document), [], `LOD${lod} mapped UV contract`);
    const materials = new Map(
      document.getRoot().listMaterials().map((material) => [material.getName(), material]),
    );
    assert.equal(materials.has('Material_Decal_BorrowedTime'), false);
    assert.equal(materials.has('Material_V6_MarkingIvory'), true);
    assert.equal(
      countMaterialTriangles(document, 'Material_V6_MarkingIvory'),
      [182, 114, 114][lod],
      `LOD${lod} marking triangles keep overspray in LOD0 only`,
    );
    if (lod === 0) {
      for (const name of ['Material_Decal_Hazard', 'Material_Decal_Stencils']) {
        const material = materials.get(name);
        assert.ok(material, `${name} missing`);
        assert.ok(material.getBaseColorTexture(), `${name} base color`);
        assert.ok(material.getNormalTexture(), `${name} normal`);
        assert.ok(material.getMetallicRoughnessTexture(), `${name} ORM`);
        assert.ok(material.getOcclusionTexture(), `${name} AO`);
        assert.equal(material.getEmissiveTexture(), null, `${name} must not glow`);
      }
    }
  }
});

test('Kestrel V6 release receipt preserves structure without claiming headed acceptance', () => {
  const build = report(BUILD_REPORT);
  const finalized = report(FINALIZE_REPORT);
  assert.equal(finalized.status, 'complete');
  assert.equal(finalized.candidateOnly, true);
  assert.equal(finalized.livePromotion, false);
  assert.equal(finalized.generationFingerprint, build.generationFingerprint);
  assert.equal(
    sha256(resolve(ROOT, finalized.finalizer.path)),
    finalized.finalizer.sha256,
    'finalizer script provenance',
  );
  assert.equal(finalized.sources.length, 3);
  assert.equal(finalized.releases.length, 3);
  for (let lod = 0; lod < 3; lod += 1) {
    const source = finalized.sources[lod];
    const release = finalized.releases[lod];
    assert.equal(source.collisionFingerprint, source.canonicalCollisionFingerprint);
    assert.equal(source.textureAudit.summary.errors, 0);
    assert.deepEqual(source.vertexContract, { degenerateMappedUvTriangles: 0 });
    assert.equal(release.triangles, source.triangles);
    assert.equal(release.draws, source.draws);
    assert.equal(release.allImagesKtx2, true);
    assert.equal(release.ktx2MaterialRoles.textureCount, release.imageCount);
    for (const texture of release.ktx2MaterialRoles.textures) {
      const profiles = texture.roles.map((role) => {
        if (role === 'baseColorTexture' || role === 'emissiveTexture') return 'ETC1S-sRGB';
        if (role === 'normalTexture') return 'UASTC-linear';
        return 'ETC1S-linear';
      });
      assert.deepEqual(
        [...new Set(profiles)],
        [texture.profile],
        `LOD${lod} texture ${texture.textureIndex} role profile`,
      );
      assert.ok(texture.levels > 1, `LOD${lod} texture ${texture.textureIndex} mip chain`);
    }
    assert.deepEqual(release.vertexContract, { degenerateMappedUvTriangles: 0 });
    assert.ok(release.meshoptViews > 0);
    assert.equal(sha256(resolve(ROOT, release.path)), release.sha256);
  }
  assert.deepEqual(finalized.browserCapture, { value: null, requiresHeaded: true });
  assert.deepEqual(finalized.electronCapture, { value: null, requiresHeaded: true });
  assert.deepEqual(finalized.runtimePerformance, { value: null, requiresHeaded: true });
  assert.deepEqual(finalized.independentG7, { value: null, requiresHuman: true });
});
