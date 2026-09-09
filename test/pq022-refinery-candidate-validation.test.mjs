import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PQ022_REFINERY_CANDIDATE_CONTRACT,
  assessFoundryTextureReport,
  assessKhronosImageResources,
  assessRefineryBudget,
  assessRefineryBuildReport,
  assessRefineryCandidateGlb,
  assessValidatorCandidateBinding,
  assessValidatorReportCandidateIdentity,
  readGlb,
  validateRefineryBaselineIdentity,
  validateRefineryCandidate,
} from '../scripts/lib/pq022RefineryCandidateValidation.mjs';

const contract = PQ022_REFINERY_CANDIDATE_CONTRACT;
const baselineGlb = readGlb(contract.paths.liveSource);

function cloneGlbJson(glb) {
  return { ...glb, json: structuredClone(glb.json) };
}

function stampAsCandidate(glb) {
  const stamp = glb.json.asset.extras.spacefaceAsset;
  Object.assign(stamp, {
    contractVersion: 1,
    candidateId: contract.candidateId,
    packet: contract.packet,
    dispatchUnit: contract.dispatchUnit,
    state: contract.candidateState,
    assetId: contract.assetId,
    partId: contract.partId,
    liveId: contract.partId,
    slot: 'place',
    forward: '+X',
    up: '+Y',
    starboard: '+Z',
    unit: contract.unit,
    normalConvention: 'OpenGL',
    ormChannels: 'R=AO,G=Roughness,B=Metallic',
    textureCompression: 'PNG-source',
    role: contract.role,
    kind: 'station_landmark',
    deliverableRole: 'production_multi_lod',
    sourceGenerator: contract.paths.sourceGenerator,
    sourceGeneratorSha256: 'a'.repeat(64),
    sourceGeneratorBytes: 1234,
    processChain: [...contract.processChain],
    wiring: structuredClone(contract.wiring),
    wiringStatus: 'isolated_candidate',
    claims: structuredClone(contract.claims),
  });
  glb.json.scenes[glb.json.scene ?? 0].extras = {
    ...(glb.json.scenes[glb.json.scene ?? 0].extras || {}),
    spacefaceAsset: structuredClone(stamp),
  };
  glb.json.nodes.find((node) => node.name === contract.rootNode).extras = {
    ...(glb.json.nodes.find((node) => node.name === contract.rootNode).extras || {}),
    spacefaceAsset: structuredClone(stamp),
  };
  return glb;
}

function identity(path, fill, bytes) {
  return { path, sha256: fill.repeat(64), bytes };
}

function validBuildReport(glbFacts) {
  const candidate = identity(contract.paths.candidate, 'a', 1000);
  const releaseMirror = identity(contract.paths.releaseMirror, 'a', 1000);
  const blender = identity(contract.paths.blender, 'b', 2000);
  const generator = identity(contract.paths.sourceGenerator, 'c', 3000);
  return {
    candidate,
    releaseMirror,
    blender,
    generator,
    glbFacts,
    report: {
      schema: contract.buildReportSchema,
      packet: contract.packet,
      dispatchUnit: contract.dispatchUnit,
      candidateId: contract.candidateId,
      assetId: contract.partId,
      spacefaceAssetId: contract.assetId,
      unit: contract.unit,
      state: contract.candidateState,
      claims: structuredClone(contract.claims),
      candidate,
      releaseMirror,
      blender,
      generator,
      producer: {
        sourceGenerator: generator,
        processChain: [...contract.processChain],
      },
      frozenContract: {
        rootNode: contract.rootNode,
        sockets: structuredClone(contract.sockets),
        materials: [...contract.materials],
        envelope: {
          min: [...contract.envelope.min],
          max: [...contract.envelope.max],
          size: [...contract.envelope.size],
        },
        collision: {
          node: contract.collision.node,
          triangles: contract.budgets.collisionTriangles,
          geometrySha256: contract.collision.geometrySha256,
        },
        lodTriangles: structuredClone(glbFacts.lodTriangles),
        visibleGroups: glbFacts.visibleGroups.length,
        visibleGeometrySha256: glbFacts.visibleGeometrySha256,
        textureRoleBindings: glbFacts.textureBindings.length,
        embeddedPngImages: 15,
      },
    },
  };
}

test('refinery candidate convention is isolated from canonical source and release paths', () => {
  assert.equal(contract.paths.candidate,
    'assets/ships/m5_station_refinery/source_candidates/material_truth_v2/places/place_station_refinery.glb');
  assert.equal(contract.paths.releaseMirror,
    'assets/ships/m5_station_refinery/release_candidates/material_truth_v2/places/place_station_refinery.glb');
  assert.equal(contract.paths.blender,
    'assets/ships/m5_station_refinery/blender/source/material_truth_v2/place_station_refinery.blend');
  assert.equal(contract.paths.sourceGenerator, 'tools/blender/build_station_refinery_material_truth_v2.py');
  assert.notEqual(contract.paths.candidate, contract.paths.liveSource);
  assert.notEqual(contract.paths.releaseMirror, contract.paths.liveRelease);
});

test('the rejected live refinery remains the frozen identity and cost reference only', () => {
  const identityAssessment = validateRefineryBaselineIdentity();
  assert.deepEqual(identityAssessment.failures, []);
  const assessment = assessRefineryCandidateGlb(baselineGlb);
  const codes = assessment.failures.map((failure) => failure.code);
  assert.ok(codes.includes('asset-stamp'));
  assert.ok(codes.includes('candidate-process-chain'));
  assert.ok(codes.includes('candidate-wiring'));
  assert.ok(codes.includes('visible-geometry-novelty'));
  assert.deepEqual(assessment.facts.lodTriangles, contract.budgets.lodTriangles);
  assert.equal(assessment.facts.visibleGroups.length, 15);
  assert.ok(assessment.facts.visibleGroups.every((group) => (
    group.degenerateTriangles === 0 && group.nonManifoldEdges === 0
  )));
});

test('candidate metadata alone cannot disguise the rejected live visible geometry', () => {
  const assessment = assessRefineryCandidateGlb(stampAsCandidate(cloneGlbJson(baselineGlb)));
  assert.deepEqual(assessment.failures.map((failure) => failure.code), ['visible-geometry-novelty']);
});

test('the structural validator rejects root, socket, and frozen collision drift', () => {
  const mutated = cloneGlbJson(baselineGlb);
  const root = mutated.json.nodes.find((node) => node.name === contract.rootNode);
  root.translation = [1, 0, 0];
  const socket = mutated.json.nodes.find((node) => node.name === 'SOCKET_Dock_Approach');
  socket.translation = [0, 0, 0];
  const collision = mutated.json.nodes.find((node) => node.name === contract.collision.node);
  collision.scale = [1.01, 1, 1];
  const failures = assessRefineryCandidateGlb(mutated).failures.map((failure) => failure.code);
  assert.ok(failures.includes('root-transform'));
  assert.ok(failures.includes('socket-transform'));
  assert.ok(failures.includes('collision-geometry'));
});

test('every frozen candidate node must be reachable exactly once without cycles', () => {
  const unreachable = cloneGlbJson(baselineGlb);
  const rootIndex = unreachable.json.nodes.findIndex((node) => node.name === contract.rootNode);
  const socketIndex = unreachable.json.nodes.findIndex((node) => node.name === 'SOCKET_Dock_Approach');
  unreachable.json.nodes[rootIndex].children = unreachable.json.nodes[rootIndex].children
    .filter((index) => index !== socketIndex);
  assert.ok(assessRefineryCandidateGlb(unreachable).failures
    .some((failure) => failure.code === 'scene-reachability'));

  const cyclic = cloneGlbJson(baselineGlb);
  const cyclicRootIndex = cyclic.json.nodes.findIndex((node) => node.name === contract.rootNode);
  const visible = cyclic.json.nodes.find((node) => node.name === 'LOD0_Station_Material_Hull');
  visible.children = [cyclicRootIndex];
  const cycleCodes = assessRefineryCandidateGlb(cyclic).failures.map((failure) => failure.code);
  assert.ok(cycleCodes.includes('scene-cycle'));
  assert.ok(cycleCodes.includes('scene-reachability'));
});

test('the structural validator rejects missing semantic material and PBR roles', () => {
  const mutated = cloneGlbJson(baselineGlb);
  mutated.json.materials.find((material) => material.name === 'Material_Warm').normalTexture = undefined;
  mutated.json.materials.find((material) => material.name === 'Material_Glass').name = 'Material_Generic';
  const failures = assessRefineryCandidateGlb(mutated).failures.map((failure) => failure.code);
  assert.ok(failures.includes('materials'));
  assert.ok(failures.includes('pbr-texture-roles'));
  assert.ok(failures.includes('material-slot'));
  assert.ok(failures.includes('lod-material-coverage'));
});

test('all 15 PBR roles require unique embedded PNG image resources', () => {
  const mutated = cloneGlbJson(baselineGlb);
  const firstBaseTexture = mutated.json.materials[0].pbrMetallicRoughness.baseColorTexture.index;
  const secondBaseTexture = mutated.json.materials[1].pbrMetallicRoughness.baseColorTexture.index;
  const firstImage = mutated.json.textures[firstBaseTexture].source;
  mutated.json.textures[firstBaseTexture].source = mutated.json.textures[secondBaseTexture].source;
  mutated.json.images[firstImage].uri = 'external.png';
  mutated.json.images[firstImage].mimeType = 'image/jpeg';
  delete mutated.json.images[firstImage].bufferView;
  const codes = assessRefineryCandidateGlb(mutated).failures.map((failure) => failure.code);
  assert.ok(codes.includes('pbr-role-coverage'));
  assert.ok(codes.includes('embedded-png'));
});

test('candidate lifecycle and PNG dimensions are identical, explicit, and fail closed', () => {
  const lifecycleDrift = stampAsCandidate(cloneGlbJson(baselineGlb));
  lifecycleDrift.json.scenes[lifecycleDrift.json.scene ?? 0]
    .extras.spacefaceAsset.claims.promoted = true;
  assert.ok(assessRefineryCandidateGlb(lifecycleDrift).failures
    .some((failure) => failure.code === 'candidate-lifecycle-copies'));

  const dimensionDrift = stampAsCandidate(cloneGlbJson(baselineGlb));
  dimensionDrift.binary = Buffer.from(baselineGlb.binary);
  const firstImage = dimensionDrift.json.images[0];
  const firstView = dimensionDrift.json.bufferViews[firstImage.bufferView];
  dimensionDrift.binary.writeUInt32BE(513, Number(firstView.byteOffset ?? 0) + 16);
  const dimensionAssessment = assessRefineryCandidateGlb(dimensionDrift);
  assert.ok(dimensionAssessment.failures
    .some((failure) => failure.code === 'embedded-png-dimensions'));
  assert.equal(dimensionAssessment.facts.textureSize, null);
});

test('validator reports must preserve exact texture roles and buffer-view storage', () => {
  const foundry = {
    textures: contract.materials.flatMap((material) => [
      {
        name: `${material}_baseColor`,
        slots: ['baseColorTexture'],
        colorSpaceRole: 'sRGB',
        mimeType: 'image/png',
      },
      {
        name: `${material}_normal`,
        slots: ['normalTexture'],
        colorSpaceRole: 'linear',
        mimeType: 'image/png',
      },
      {
        name: `${material}_orm`,
        slots: ['occlusionTexture', 'metallicRoughnessTexture'],
        colorSpaceRole: 'linear',
        mimeType: 'image/png',
      },
    ]),
  };
  assert.deepEqual(assessFoundryTextureReport(foundry).failures, []);
  foundry.textures[0].slots = ['normalTexture'];
  assert.deepEqual(
    assessFoundryTextureReport(foundry).failures.map((failure) => failure.code),
    ['foundry-texture-facts'],
  );

  const khronos = {
    info: {
      resources: baselineGlb.json.images.map((_image, index) => ({
        pointer: `/images/${index}`,
        storage: 'buffer-view',
        mimeType: 'image/png',
      })),
    },
  };
  assert.deepEqual(assessKhronosImageResources({ report: khronos, candidateGlb: baselineGlb }).failures, []);
  khronos.info.resources[0].storage = 'uri';
  assert.deepEqual(
    assessKhronosImageResources({ report: khronos, candidateGlb: baselineGlb })
      .failures.map((failure) => failure.code),
    ['khronos-image-resources'],
  );
});

test('triangle and byte budgets reject cost growth and copied LODs', () => {
  const over = assessRefineryBudget({
    bytes: contract.budgets.candidateBytes + 1,
    lodTriangles: {
      LOD0: contract.budgets.lodTriangles.LOD0 + 1,
      LOD1: 5000,
      LOD2: 5000,
    },
  });
  assert.equal(over.pass, false);
  assert.equal(over.failures.length, 3);
  assert.match(over.failures.join('\n'), /candidate bytes/);
  assert.match(over.failures.join('\n'), /LOD0 triangles/);
  assert.match(over.failures.join('\n'), /reduce strictly/);
});

test('build-report identities, claims, producer, and measured contract fail closed', () => {
  const glbFacts = assessRefineryCandidateGlb(stampAsCandidate(cloneGlbJson(baselineGlb))).facts;
  const valid = validBuildReport(glbFacts);
  assert.deepEqual(assessRefineryBuildReport(valid).failures, []);

  const report = structuredClone(valid.report);
  report.blender.sha256 = 'd'.repeat(64);
  report.claims.promoted = true;
  report.producer.sourceGenerator.sha256 = 'e'.repeat(64);
  report.frozenContract.visibleGeometrySha256 = 'f'.repeat(64);
  const codes = assessRefineryBuildReport({ ...valid, report }).failures.map((failure) => failure.code);
  assert.ok(codes.includes('build-report-identity'));
  assert.ok(codes.includes('build-report-claims'));
  assert.ok(codes.includes('build-report-producer'));
  assert.ok(codes.includes('build-report-contract'));
});

test('stale validator binding hashes are rejected before report facts can be reused', () => {
  const candidate = { sha256: 'a'.repeat(64), bytes: 1234 };
  for (const kind of ['foundry', 'khronos']) {
    const assessment = assessValidatorCandidateBinding({
      kind,
      candidate,
      record: {
        candidateSha256: 'b'.repeat(64),
        candidateBytes: candidate.bytes,
      },
    });
    assert.equal(assessment.pass, false);
    assert.deepEqual(assessment.failures.map((failure) => failure.code), ['validator-candidate-hash']);
  }
});

test('each validator report must internally identify the exact admitted candidate', () => {
  const candidate = { sha256: 'a'.repeat(64), bytes: 1234 };
  const report = {
    spacefaceCandidate: {
      path: contract.paths.candidate,
      sha256: candidate.sha256,
      bytes: candidate.bytes,
    },
  };
  assert.deepEqual(assessValidatorReportCandidateIdentity({ kind: 'foundry', report, candidate }).failures, []);
  report.spacefaceCandidate.sha256 = 'b'.repeat(64);
  assert.deepEqual(
    assessValidatorReportCandidateIdentity({ kind: 'foundry', report, candidate })
      .failures.map((failure) => failure.code),
    ['validator-report-candidate-identity'],
  );
});

test('an absent producer bundle fails closed independently of the positive admission', () => {
  const result = validateRefineryCandidate({
    bindingPath: 'assets/ships/m5_station_refinery/reports/material_truth_v2/definitely_missing_binding.json',
  });
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((failure) => failure.code === 'binding-read'));
  assert.equal(result.facts, null);
});

test('the complete producer bundle forms one mandatory hash-bound refinery admission', () => {
  const result = validateRefineryCandidate();
  assert.deepEqual(result.failures, [], JSON.stringify(result, null, 2));
  assert.equal(result.pass, true);
  assert.equal(result.facts.candidate.sha256, result.facts.releaseMirror.sha256);
  assert.equal(result.facts.candidate.bytes, result.facts.releaseMirror.bytes);
  assert.notEqual(result.facts.candidate.sha256, contract.baseline.sourceSha256);
  assert.notEqual(result.facts.blender.sha256, contract.baseline.blendSha256);
  assert.equal(result.facts.buildReportPass, true);
  assert.equal(result.facts.foundryPass, true);
  assert.ok(Number.isInteger(result.facts.glb.textureSize));
  assert.ok(result.facts.glb.textureSize > 0);
  for (const key of [
    'binding', 'buildReport', 'foundryReport', 'khronosReport', 'blenderGate', 'renderManifest',
  ]) {
    assert.match(result.facts[key].sha256, /^[0-9a-f]{64}$/);
  }
  assert.equal(result.facts.renderFiles.length, 5);
  assert.deepEqual({
    errors: result.facts.khronosIssues.numErrors,
    warnings: result.facts.khronosIssues.numWarnings,
    infos: result.facts.khronosIssues.numInfos,
    hints: result.facts.khronosIssues.numHints,
    truncated: result.facts.khronosIssues.truncated,
  }, { errors: 0, warnings: 0, infos: 0, hints: 0, truncated: false });
});
