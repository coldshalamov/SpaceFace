import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  PQ022_NAVIGATION_INFRASTRUCTURE_CONTRACT as CONTRACT,
  assessNavigationInfrastructureAssetGlb,
  assessNavigationInfrastructureBindingShape,
  assessNavigationInfrastructureBuildReport,
  assessNavigationInfrastructureRenderManifest,
  assessNavigationInfrastructureValidatorReport,
} from '../scripts/lib/pq022NavigationInfrastructureCandidateValidation.mjs';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function syntheticPng(width = 256, height = 256) {
  const bytes = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function floatVec3Bytes(values) {
  const bytes = Buffer.alloc(values.length * 12);
  values.forEach((value, row) => value.forEach((component, axis) => {
    bytes.writeFloatLE(component, row * 12 + axis * 4);
  }));
  return bytes;
}

function trianglePositions(asset, level, group, triangleCount) {
  const center = asset.envelope.min.map((value, index) => (
    (value + asset.envelope.max[index]) / 2
  ));
  const points = [];
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const delta = (level + 1) * 0.01 + group * 0.001 + triangle * 0.0001;
    points.push(
      [center[0] - delta, center[1], center[2]],
      [center[0] + delta, center[1], center[2]],
      [center[0], center[1] + delta, center[2] + delta],
    );
  }
  if (level === 0 && group === 0) {
    points[0] = [...asset.envelope.min];
    points[1] = [asset.envelope.max[0], asset.envelope.min[1], asset.envelope.min[2]];
    points[2] = [asset.envelope.min[0], asset.envelope.max[1], asset.envelope.max[2]];
  }
  return points;
}

function candidateStamp(asset, triangleCount) {
  return {
    contractVersion: 1,
    candidateId: asset.candidateId,
    packet: CONTRACT.packet,
    dispatchUnit: CONTRACT.dispatchUnit,
    state: CONTRACT.candidateState,
    assetId: asset.assetId,
    partId: asset.partId,
    liveId: asset.partId,
    slot: 'place',
    forward: '+X',
    up: '+Y',
    starboard: '+Z',
    unit: 'metre',
    normalConvention: 'OpenGL',
    ormChannels: 'R=AO,G=Roughness,B=Metallic',
    textureCompression: 'PNG-source',
    textureSize: asset.textureSize,
    role: asset.role,
    title: asset.title,
    kind: asset.kind,
    deliverableRole: 'production_multi_lod',
    sourceGenerator: CONTRACT.paths.sourceGenerator,
    collisionTriangleCount: 0,
    triBudget: 3000,
    processChain: [...CONTRACT.processChain],
    wiring: structuredClone(asset.wiring),
    materials: [...asset.materials],
    materialRoles: Object.fromEntries(asset.materials.map((material) => [material, `${material}_role`])),
    lod0AabbSize: [...asset.envelope.size],
    collisionBounds: structuredClone(asset.collision.runtimeBounds),
    collisionCoverageRatio: structuredClone(asset.collision.coverage),
    collision: {
      representation: 'non_mesh_helper',
      triangles: 0,
      translation: [...asset.collision.translation],
      nodeBounds: structuredClone(asset.collision.localBounds),
      runtimeBounds: structuredClone(asset.collision.runtimeBounds),
      coverageRatio: structuredClone(asset.collision.coverage),
    },
    triangleCount,
    wiringStatus: 'isolated_candidate',
    claims: structuredClone(CONTRACT.claims),
  };
}

function syntheticCandidate(asset) {
  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  const addChunk = (bytes) => {
    const offset = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    chunks.push(bytes);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length });
    return bufferViews.length - 1;
  };
  const materials = asset.materials.map((name, materialIndex) => {
    const base = materialIndex * 3;
    return {
      name,
      pbrMetallicRoughness: {
        baseColorTexture: { index: base },
        metallicRoughnessTexture: { index: base + 2 },
      },
      normalTexture: { index: base + 1 },
      occlusionTexture: { index: base + 2 },
    };
  });
  const nodes = [];
  nodes.push({
    name: 'COLLISION_HULL',
    translation: [...asset.collision.translation],
    rotation: [...asset.collision.rotation],
    scale: [...asset.collision.scale],
    extras: {
      spaceface: {
        collision: true,
        helper: true,
        nonRender: true,
        role: 'collision',
        bounds: structuredClone(asset.collision.localBounds),
      },
      sf_collision: true,
      sf_non_render: true,
      bounds: structuredClone(asset.collision.localBounds),
      collision: true,
      nonRender: true,
    },
  });
  nodes.push({
    name: 'SOCKET_Structure_Core',
    translation: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
    extras: { spaceface: { socket: true, role: 'structure', forward: [1, 0, 0] } },
  });
  const meshes = [];
  const perGroupTriangles = [3, 2, 1];
  for (const [levelIndex, level] of ['LOD0', 'LOD1', 'LOD2'].entries()) {
    for (const [materialIndex, material] of asset.materials.entries()) {
      const positions = trianglePositions(asset, levelIndex, materialIndex, perGroupTriangles[levelIndex]);
      const view = addChunk(floatVec3Bytes(positions));
      const accessor = accessors.length;
      accessors.push({
        bufferView: view,
        componentType: 5126,
        count: positions.length,
        type: 'VEC3',
      });
      const mesh = meshes.length;
      meshes.push({
        primitives: [{
          attributes: {
            POSITION: accessor,
            NORMAL: accessor,
            TEXCOORD_0: accessor,
            TANGENT: accessor,
          },
          material: materialIndex,
          mode: 4,
        }],
      });
      nodes.push({ name: `${level}_${material}`, mesh });
    }
  }
  const images = [];
  const textures = [];
  for (let index = 0; index < asset.materials.length * 3; index += 1) {
    const view = addChunk(syntheticPng());
    images.push({ mimeType: 'image/png', bufferView: view });
    textures.push({ source: index });
  }
  const stamp = candidateStamp(asset, perGroupTriangles[0] * asset.materials.length);
  const rootIndex = nodes.length;
  nodes.push({
    name: asset.rootNode,
    translation: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
    children: Array.from({ length: rootIndex }, (_unused, index) => index),
    extras: { spacefaceAsset: structuredClone(stamp) },
  });
  const binary = Buffer.concat(chunks);
  const json = {
    asset: { version: '2.0', extras: { spacefaceAsset: structuredClone(stamp) } },
    scene: 0,
    scenes: [{ nodes: [rootIndex], extras: { spacefaceAsset: structuredClone(stamp) } }],
    nodes,
    meshes,
    materials,
    textures,
    images,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binary.length }],
  };
  return {
    path: asset.paths.candidate,
    sha256: sha256(binary),
    bytes: binary.length,
    json,
    binary,
  };
}

function identity(path, digit, bytes = 100) {
  return { path, sha256: digit.repeat(64), bytes };
}

test('navigation-infrastructure contract is an exact three-asset split with 27 review views', () => {
  assert.deepEqual(CONTRACT.assets.map((asset) => asset.partId), [
    'place_station_billboard',
    'place_memorial_array',
    'place_nav_buoy',
  ]);
  assert.equal(CONTRACT.assets.reduce((sum, asset) => sum + asset.renderViews.length, 0), 27);
  assert.equal(CONTRACT.assets.every((asset) => asset.materials.length === 5), true);
  assert.equal(CONTRACT.assets.every((asset) => asset.collision.triangleCount === 0), true);
  assert.equal(CONTRACT.assets.find((asset) => asset.partId === 'place_memorial_array').baseline.sourceSha256, null);
  assert.deepEqual(
    CONTRACT.assets.find((asset) => asset.partId === 'place_nav_buoy').renderViews.map((view) => (
      view.split('/').at(-1).replace(/\.png$/, '')
    )),
    [
      'full_three_quarter',
      'service_side',
      'top_head',
      'head_azimuth_contact_sheet',
      'stabilization_close',
      'full_three_quarter_emissive_off',
      'material_id',
      'grazing_light',
      'lod1_27_2m',
      'lod2_far',
    ],
  );
});

for (const asset of CONTRACT.assets) {
  test(`${asset.partId} synthetic candidate proves exact interface, materials, images, and real LODs`, () => {
    const result = assessNavigationInfrastructureAssetGlb(syntheticCandidate(asset), asset);
    assert.equal(result.pass, true, JSON.stringify(result.failures, null, 2));
    assert.deepEqual(result.facts.lodTriangles, { LOD0: 15, LOD1: 10, LOD2: 5 });
    assert.equal(result.facts.collision.triangleCount, 0);
    assert.equal(result.facts.textureSize, 256);
  });
}

test('candidate admission rejects an accidental collision mesh and divergent lifecycle copy', () => {
  const asset = CONTRACT.assets[0];
  const collisionMesh = syntheticCandidate(asset);
  collisionMesh.json.nodes.find((node) => node.name === 'COLLISION_HULL').mesh = 0;
  const collisionResult = assessNavigationInfrastructureAssetGlb(collisionMesh, asset);
  assert.equal(collisionResult.pass, false);
  assert.equal(collisionResult.failures.some((failure) => failure.code === 'collision-contract'), true);

  const lifecycle = syntheticCandidate(asset);
  lifecycle.json.scenes[0].extras.spacefaceAsset.title = 'stale copy';
  const lifecycleResult = assessNavigationInfrastructureAssetGlb(lifecycle, asset);
  assert.equal(lifecycleResult.pass, false);
  assert.equal(lifecycleResult.failures.some((failure) => failure.code === 'candidate-lifecycle-copies'), true);
});

test('candidate admission rejects aliased LOD geometry and external texture images', () => {
  const asset = CONTRACT.assets[2];
  const candidate = syntheticCandidate(asset);
  const lod1 = candidate.json.nodes.filter((node) => node.name.startsWith('LOD1_'));
  const lod2 = candidate.json.nodes.filter((node) => node.name.startsWith('LOD2_'));
  lod2.forEach((node, index) => { node.mesh = lod1[index].mesh; });
  candidate.json.images[0] = { uri: 'external.png' };
  const result = assessNavigationInfrastructureAssetGlb(candidate, asset);
  assert.equal(result.pass, false);
  assert.equal(result.failures.some((failure) => failure.code === 'lod-reduction'), true);
  assert.equal(result.failures.some((failure) => failure.code === 'embedded-png'), true);
});

test('candidate binding requires the producer ordered array and rejects reorder or duplicates', () => {
  const binding = {
    schema: CONTRACT.schema,
    packet: CONTRACT.packet,
    dispatchUnit: CONTRACT.dispatchUnit,
    candidateSetId: CONTRACT.candidateSetId,
    state: CONTRACT.candidateState,
    claims: structuredClone(CONTRACT.claims),
    assets: CONTRACT.assets.map((asset, index) => ({
      partId: asset.partId,
      candidateId: asset.candidateId,
      spacefaceAssetId: asset.assetId,
      visibleGeometrySha256: String(index + 1).repeat(64),
      collisionRepresentation: 'non_mesh_helper',
      collisionTriangles: 0,
      candidateMirrorByteIdentical: true,
    })),
    allCandidateMirrorsByteIdentical: true,
    gateBoundary: {
      candidateEvidenceBound: true,
      livePromotion: false,
      routeAcceptance: false,
      performanceAcceptance: false,
      independentVisualAcceptance: false,
    },
  };
  assert.equal(assessNavigationInfrastructureBindingShape({ binding }).pass, true);

  const reordered = structuredClone(binding);
  reordered.assets.reverse();
  assert.equal(assessNavigationInfrastructureBindingShape({ binding: reordered }).failures
    .some((failure) => failure.code === 'binding-asset-set'), true);

  const duplicated = structuredClone(binding);
  duplicated.assets = [duplicated.assets[0], duplicated.assets[0], duplicated.assets[2]];
  assert.equal(assessNavigationInfrastructureBindingShape({ binding: duplicated }).failures
    .some((failure) => failure.code === 'binding-asset-set'), true);
});

test('build report cannot omit the new memorial or reuse stale measured facts', () => {
  const generator = identity(CONTRACT.paths.sourceGenerator, 'a');
  const renderManifest = identity(CONTRACT.paths.renderManifest, 'b');
  const assets = Object.fromEntries(CONTRACT.assets.map((asset, index) => [asset.key, {
    candidate: identity(asset.paths.candidate, String(index + 1)),
    releaseMirror: identity(asset.paths.releaseMirror, String(index + 1)),
    blender: identity(asset.paths.blender, String(index + 4)),
    validatorReport: identity(asset.paths.validatorReport, String(index + 7)),
    glb: { lodTriangles: { LOD0: 15, LOD1: 10, LOD2: 5 }, textureSize: 256 },
  }]));
  const report = {
    schema: CONTRACT.buildReportSchema,
    packet: CONTRACT.packet,
    dispatchUnit: CONTRACT.dispatchUnit,
    candidateSetId: CONTRACT.candidateSetId,
    state: CONTRACT.candidateState,
    claims: structuredClone(CONTRACT.claims),
    builder: generator,
    generator,
    renderManifest,
    buildAttempts: 5,
    namedVisualCorrectionAttempts: 2,
    geometryBudgetCorrectionPasses: 3,
    candidateAssetCount: 3,
    canonicalAssetsModified: false,
    liveRuntimeWiringModified: false,
    browserOrElectronRun: false,
    performanceClaim: false,
    promotionAuthorized: false,
    pass: true,
    failures: [],
    assets: CONTRACT.assets.map((asset) => ({
      partId: asset.partId,
      candidateId: asset.candidateId,
      candidate: assets[asset.key].candidate,
      releaseMirror: assets[asset.key].releaseMirror,
      blender: assets[asset.key].blender,
      validatorReport: assets[asset.key].validatorReport,
      lodTriangles: { LOD0: 15, LOD1: 10, LOD2: 5 },
      textureSize: 256,
      collisionTriangleCount: 0,
      materials: [...asset.materials],
      pass: true,
    })),
    assetDetails: Object.fromEntries(CONTRACT.assets.map((asset) => [asset.partId, {
      assetId: asset.partId,
      spacefaceAssetId: asset.assetId,
      candidateId: asset.candidateId,
      candidate: assets[asset.key].candidate,
      releaseMirror: assets[asset.key].releaseMirror,
      blender: assets[asset.key].blender,
      sourceReport: assets[asset.key].validatorReport,
      materials: [...asset.materials],
      export: {
        lodTriangles: { lod0: 15, lod1: 10, lod2: 5 },
        collision: { representation: 'non_mesh_helper', triangles: 0, geometrySha256: null },
        materialCount: 5,
        imageCount: 15,
        textureCount: 15,
      },
      render: {
        source: assets[asset.key].candidate,
        sourceSha256: assets[asset.key].candidate.sha256,
        exactSourceReimport: true,
      },
    }])),
  };
  assert.equal(assessNavigationInfrastructureBuildReport({ report, assets, generator, renderManifest }).pass, true);
  report.assets = report.assets.filter((row) => row.partId !== 'place_memorial_array');
  const omitted = assessNavigationInfrastructureBuildReport({ report, assets, generator, renderManifest });
  assert.equal(omitted.pass, false);
  assert.equal(omitted.failures.some((failure) => failure.code === 'build-report-set'), true);

  report.assets = CONTRACT.assets.map((asset) => structuredClone({
    ...report.assetDetails[asset.partId],
    partId: asset.partId,
    validatorReport: report.assetDetails[asset.partId].sourceReport,
    lodTriangles: { LOD0: 15, LOD1: 10, LOD2: 5 },
    textureSize: 256,
    collisionTriangleCount: 0,
    pass: true,
  }));
  report.assets.reverse();
  assert.equal(assessNavigationInfrastructureBuildReport({ report, assets, generator, renderManifest }).failures
    .some((failure) => failure.code === 'build-report-set'), true);
  report.assets = [report.assets[2], report.assets[2], report.assets[0]];
  assert.equal(assessNavigationInfrastructureBuildReport({ report, assets, generator, renderManifest }).failures
    .some((failure) => failure.code === 'build-report-set'), true);
});

test('exact-source validator report is bound to producer and independently measured facts', () => {
  const asset = CONTRACT.assets[1];
  const candidate = identity(asset.paths.candidate, '1');
  const releaseMirror = identity(asset.paths.releaseMirror, '1');
  const blender = identity(asset.paths.blender, '2');
  const generator = identity(CONTRACT.paths.sourceGenerator, '3');
  const glbFacts = {
    lodTriangles: { LOD0: 15, LOD1: 10, LOD2: 5 },
    textureSize: 256,
    envelope: structuredClone(asset.envelope),
  };
  const report = {
    schema: CONTRACT.validatorReportSchema,
    packet: CONTRACT.packet,
    dispatchUnit: CONTRACT.dispatchUnit,
    candidateId: asset.candidateId,
    assetId: asset.partId,
    spacefaceAssetId: asset.assetId,
    state: CONTRACT.candidateState,
    claims: structuredClone(CONTRACT.claims),
    candidate: structuredClone(candidate),
    releaseMirror: structuredClone(releaseMirror),
    blender: structuredClone(blender),
    generator: structuredClone(generator),
    materials: [...asset.materials],
    textures: asset.materials.flatMap((material, materialIndex) => (
      ['basecolor', 'orm', 'normal'].map((map, mapIndex) => ({
        material,
        map,
        resolution: [256, 256],
        sha256: String((materialIndex + mapIndex) % 10).repeat(64),
        bytes: 10,
      }))
    )),
    export: {
      lodTriangles: { lod0: 15, lod1: 10, lod2: 5 },
      collision: {
        representation: 'non_mesh_helper',
        triangles: 0,
        geometrySha256: null,
        translation: [...asset.collision.translation],
        nodeBounds: structuredClone(asset.collision.localBounds),
        runtimeBounds: structuredClone(asset.collision.runtimeBounds),
        coverageRatio: structuredClone(asset.collision.coverage),
      },
      gltfEnvelope: structuredClone(asset.envelope),
    },
    renders: { exactSourceReimport: true },
    gateBoundary: {
      candidateSideG0: true,
      candidateSideG1G2G4Evidence: true,
      g3DeterministicMaterialSources: true,
      g6RouteOrBrowserEvidence: false,
      promotionAuthorized: false,
    },
  };
  const valid = assessNavigationInfrastructureValidatorReport({
    report, asset, candidate, releaseMirror, blender, generator, glbFacts,
  });
  assert.equal(valid.pass, true, JSON.stringify(valid.failures, null, 2));
  report.candidate.sha256 = 'f'.repeat(64);
  assert.equal(assessNavigationInfrastructureValidatorReport({
    report, asset, candidate, releaseMirror, blender, generator, glbFacts,
  }).pass, false);
});

test('render manifest requires the exact ordered three-asset, 27-image epoch', () => {
  const assets = Object.fromEntries(CONTRACT.assets.map((asset, index) => [asset.key, {
    candidate: identity(asset.paths.candidate, String(index + 1)),
  }]));
  const manifest = {
    schema: CONTRACT.renderManifestSchema,
    packet: CONTRACT.packet,
    dispatchUnit: CONTRACT.dispatchUnit,
    candidateSetId: CONTRACT.candidateSetId,
    oneBoundedBuildEpoch: true,
    exactSourceReimport: true,
    renderer: 'BLENDER_EEVEE',
    resolution: [1600, 900],
    claims: structuredClone(CONTRACT.claims),
    assets: CONTRACT.assets.map((asset) => ({
      assetId: asset.partId,
      partId: asset.partId,
      spacefaceAssetId: asset.assetId,
      candidateId: asset.candidateId,
      source: assets[asset.key].candidate,
      sourceSha256: assets[asset.key].candidate.sha256,
      exactSourceReimport: true,
      renderer: 'BLENDER_EEVEE',
      resolution: [1600, 900],
      images: asset.renderViews.map((path) => identity(path, 'a', 1000)),
      emissiveOffChangesEmissionStrengthOnly: true,
      materialIdOverrideIsDiagnosticOnly: true,
      grazingLightChangesLightingOnly: true,
    })),
  };
  assert.equal(assessNavigationInfrastructureRenderManifest({ manifest, assets }).pass, true);
  manifest.assets[2].images.pop();
  const incomplete = assessNavigationInfrastructureRenderManifest({ manifest, assets });
  assert.equal(incomplete.pass, false);
  assert.equal(incomplete.failures.some((failure) => failure.code === 'render-manifest-asset'), true);

  manifest.assets[2].images.push(identity(CONTRACT.assets[2].renderViews.at(-1), 'a', 1000));
  manifest.assets.reverse();
  assert.equal(assessNavigationInfrastructureRenderManifest({ manifest, assets }).failures
    .some((failure) => failure.code === 'render-manifest-set'), true);
  manifest.assets = [manifest.assets[2], manifest.assets[2], manifest.assets[0]];
  assert.equal(assessNavigationInfrastructureRenderManifest({ manifest, assets }).failures
    .some((failure) => failure.code === 'render-manifest-set'), true);
});
