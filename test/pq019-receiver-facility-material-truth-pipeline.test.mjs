import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  link as fsLink,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';

import { publishFileSetTransaction } from '../tools/art/lib/multiFileTransaction.mjs';
import {
  RECEIVER_FACILITY_PROMOTION_CONTRACT as CONTRACT,
  buildReceiverFacilityPromotionPlan,
  parseGlbDocument,
  sha256,
  validateReceiverFacilityBaselineManifest,
} from '../tools/art/promote_claim_outpost_receiver_facility_material_truth_v1.mjs';

const REPO = resolve(import.meta.dirname, '..');
const JSON_CHUNK = 0x4e4f534a;
const LIVE_BASELINE = JSON.parse(await readFile(
  resolve(REPO, CONTRACT.baselineManifest),
  'utf8',
));

function identity(path, contents) {
  const bytes = Buffer.from(contents);
  return { path, sha256: sha256(bytes), bytes: bytes.length };
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeRepoFile(root, path, contents) {
  const target = resolve(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents);
  return identity(path, contents);
}

function rewriteCandidateMetadata(bytes, asset) {
  const parsed = parseGlbDocument(bytes, `${asset.id} fixture source`);
  const chunks = parsed.chunks.map((chunk) => {
    if (chunk.type !== JSON_CHUNK) return chunk;
    const json = structuredClone(parsed.json);
    const scene = json.scenes[json.scene ?? 0];
    const root = json.nodes.find((node) => node.name === asset.rootNode);
    const inherited = json.asset?.extras?.spacefaceAsset
      || scene.extras?.spacefaceAsset
      || JSON.parse(root.extras.spacefaceAssetJson);
    const candidate = {
      ...inherited,
      assetId: asset.liveAssetId,
      partId: asset.id,
      candidateId: CONTRACT.candidateId,
      dispatchUnit: CONTRACT.dispatchUnit,
      state: 'integration_candidate',
      wiringStatus: 'isolated_candidate',
      claims: { candidateOnly: true, promoted: false, routeEvidence: false, performanceEvidence: false },
    };
    json.asset ??= { version: '2.0' };
    json.asset.extras = { ...(json.asset.extras || {}), spacefaceAsset: candidate };
    scene.extras = {
      ...(scene.extras || {}),
      spacefaceAsset: candidate,
      spacefaceAssetJson: JSON.stringify(candidate),
    };
    root.extras = {
      ...(root.extras || {}),
      spacefaceAsset: candidate,
      spacefaceAssetJson: JSON.stringify(candidate),
      'spaceface.candidateId': CONTRACT.candidateId,
    };
    const encoded = Buffer.from(JSON.stringify(json), 'utf8');
    const padding = (4 - (encoded.length % 4)) % 4;
    return { type: JSON_CHUNK, data: Buffer.concat([encoded, Buffer.alloc(padding, 0x20)]) };
  });
  const total = 12 + chunks.reduce((sum, chunk) => sum + 8 + chunk.data.length, 0);
  const output = Buffer.allocUnsafe(total);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(total, 8);
  let offset = 12;
  for (const chunk of chunks) {
    output.writeUInt32LE(chunk.data.length, offset);
    output.writeUInt32LE(chunk.type, offset + 4);
    chunk.data.copy(output, offset + 8);
    offset += 8 + chunk.data.length;
  }
  return output;
}

function targetRowsOnly(manifest) {
  const ids = new Set(CONTRACT.assets.map(({ id }) => id));
  return manifest.parts.filter(({ id }) => ids.has(id));
}

function fixtureImageContract(filename) {
  const name = filename.slice(0, -4);
  if (name.startsWith('surface_')) return { name, look: 'surface', view: name.slice(8), lod: 0, runtimeZoom: null };
  if (name.startsWith('clay_')) return { name, look: 'clay', view: name.slice(5), lod: 0, runtimeZoom: null };
  if (name === 'hard_grazing') return { name, look: name, view: 'service_side', lod: 0, runtimeZoom: null };
  if (name === 'material_id') return { name, look: name, view: 'front_three_quarter', lod: 0, runtimeZoom: null };
  if (name === 'emissive_off') return { name, look: name, view: 'role_close', lod: 0, runtimeZoom: null };
  if (name.startsWith('lod1_')) return { name, look: 'surface', view: 'front_three_quarter', lod: 1, runtimeZoom: null };
  if (name.startsWith('lod2_')) return { name, look: 'surface', view: 'front_three_quarter', lod: 2, runtimeZoom: null };
  return {
    name,
    look: 'surface',
    view: 'runtime_equivalent',
    lod: 0,
    runtimeZoom: { runtime_close: 72, runtime_default: 132, runtime_far: 264 }[name],
  };
}

async function createFixture({ khronosWarnings = 0, verdict = 'KEEP' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-pq019-receiver-promotion-'));
  const baseline = structuredClone(LIVE_BASELINE);
  const partsManifest = JSON.parse(await readFile(
    resolve(REPO, CONTRACT.partsManifest),
    'utf8',
  ));
  const partsBytes = jsonBytes(partsManifest);
  baseline.sharedFiles.partsManifest = await writeRepoFile(root, CONTRACT.partsManifest, partsBytes);

  const protectedPaths = [];
  for (const [key, path] of Object.entries({
    releaseManifest: 'assets/ships/release/release_manifest.json',
    worldSiteAssetBindings: 'src/data/worldSiteAssetBindings.js',
    pilots: 'assets/ships/render-packages/pilots.json',
    renderPackageManifest: 'src/render/renderPackageManifest.js',
    familySummary: 'assets/ships/m5_claim_outposts/evidence/family_summary.json',
  })) {
    const record = await writeRepoFile(root, path, Buffer.from(`protected:${key}`));
    baseline.sharedFiles[key] = record;
    protectedPaths.push(path);
  }
  for (const [sibling, records] of Object.entries(baseline.protectedSiblings)) {
    for (const [leaf, record] of Object.entries(records)) {
      baseline.protectedSiblings[sibling][leaf] = await writeRepoFile(
        root,
        record.path,
        Buffer.from(`protected:${sibling}:${leaf}`),
      );
      protectedPaths.push(record.path);
    }
  }
  for (const [key, record] of Object.entries(baseline.genericFamilyTools.identities)) {
    baseline.genericFamilyTools.identities[key] = await writeRepoFile(
      root,
      record.path,
      Buffer.from(`protected:generic:${key}`),
    );
    protectedPaths.push(record.path);
  }
  const stationVisualFamily = await writeRepoFile(
    root,
    baseline.candidateToolchain.stationVisualFamily.path,
    Buffer.from('protected:candidate:station-visual-family'),
  );
  baseline.candidateToolchain.stationVisualFamily = stationVisualFamily;
  protectedPaths.push(stationVisualFamily.path);
  baseline.runtimeContract.source = await writeRepoFile(
    root,
    baseline.runtimeContract.source.path,
    Buffer.from('protected:heist-facilities'),
  );
  protectedPaths.push(baseline.runtimeContract.source.path);
  const packagePaths = [
    ...CONTRACT.assets.map((asset) => baseline.targets[asset.id].renderPackage.path),
    ...Object.values(baseline.protectedSiblings).map(({ renderPackage }) => renderPackage.path),
  ];
  for (let index = 0; index < 77; index++) {
    const path = `assets/ships/release/render-packages/fixture-${String(index).padStart(2, '0')}/render-package.json`;
    await writeRepoFile(
      root,
      path,
      Buffer.from(`{"index":${index}}\n`),
    );
    packagePaths.push(path);
  }
  baseline.renderPackageClosure.trackedPackageJsonPathListSha256 = sha256(
    Buffer.from(packagePaths.sort().join('\n'), 'utf8'),
  );
  const builderIdentity = await writeRepoFile(root, CONTRACT.builder, Buffer.from('fixture-builder-v1'));
  const rendererIdentity = await writeRepoFile(root, CONTRACT.renderer, Buffer.from('fixture-renderer-v1'));
  const preflightIdentity = await writeRepoFile(root, CONTRACT.preflight, Buffer.from('fixture-preflight-v1'));

  const liveSourceById = {};
  for (const asset of CONTRACT.assets) {
    const liveTarget = LIVE_BASELINE.targets[asset.id];
    const sourceBytes = await readFile(resolve(REPO, liveTarget.canonicalSource.path));
    liveSourceById[asset.id] = sourceBytes;
    const blendBytes = Buffer.from(`baseline-blend:${asset.id}`);
    const evidenceBytes = await readFile(resolve(REPO, liveTarget.evidence.path));
    baseline.targets[asset.id].blend = await writeRepoFile(root, asset.paths.canonicalBlend, blendBytes);
    baseline.targets[asset.id].packetSource = await writeRepoFile(root, asset.paths.packetSource, sourceBytes);
    baseline.targets[asset.id].canonicalSource = await writeRepoFile(root, asset.paths.canonicalSource, sourceBytes);
    baseline.targets[asset.id].evidence = await writeRepoFile(root, asset.paths.legacyEvidence, evidenceBytes);
    baseline.targets[asset.id].release = await writeRepoFile(
      root,
      liveTarget.release.path,
      Buffer.from(`protected-release:${asset.id}`),
    );
    baseline.targets[asset.id].renderGlb = await writeRepoFile(
      root,
      liveTarget.renderGlb.path,
      Buffer.from(`protected-render:${asset.id}`),
    );
    baseline.targets[asset.id].renderPackage = await writeRepoFile(
      root,
      liveTarget.renderPackage.path,
      Buffer.from(`protected-package:${asset.id}`),
    );
    protectedPaths.push(liveTarget.release.path, liveTarget.renderGlb.path, liveTarget.renderPackage.path);
  }
  const baselineBytes = jsonBytes(baseline);
  const baselineIdentity = await writeRepoFile(root, CONTRACT.baselineManifest, baselineBytes);

  const fixtureById = {};
  const buildTargets = {};
  const renderTargets = {};
  const runtimeFramings = [
    { name: 'close', zoom: 72, zoomRadii: 3, projectedRadiusFraction: 0.33 },
    { name: 'default', zoom: 132, zoomRadii: 5.5, projectedRadiusFraction: 0.18 },
    { name: 'far', zoom: 264, zoomRadii: 11, projectedRadiusFraction: 0.09 },
  ];
  for (const asset of CONTRACT.assets) {
    const target = baseline.targets[asset.id];
    const candidateBytes = rewriteCandidateMetadata(liveSourceById[asset.id], asset);
    const candidateBlendBytes = Buffer.from(`candidate-blend:${asset.id}`);
    const candidateBlend = await writeRepoFile(root, asset.paths.candidateBlend, candidateBlendBytes);
    const sourceCandidate = await writeRepoFile(root, asset.paths.sourceCandidate, candidateBytes);
    const releaseCandidate = await writeRepoFile(root, asset.paths.releaseCandidate, candidateBytes);
    const foundryBytes = jsonBytes({ verdict: { pass: true, failures: [], warnings: [] } });
    const khronosBytes = jsonBytes({
      issues: { numErrors: 0, numWarnings: khronosWarnings, numInfos: 0, numHints: 0 },
    });
    const foundry = await writeRepoFile(root, asset.paths.foundryReport, foundryBytes);
    const khronos = await writeRepoFile(root, asset.paths.khronosReport, khronosBytes);
    const lod = Object.fromEntries(['lod0', 'lod1', 'lod2'].map((level, index) => [level, {
      triangles: target.lodTriangles[index],
      drawGroups: 5,
      materials: [...CONTRACT.materials],
    }]));
    buildTargets[asset.id] = {
      assetId: asset.id,
      runtimeAssetId: asset.liveAssetId,
      title: asset.key === 'base' ? 'Lawful Catcher Claim' : 'Covert Fence Refinery',
      builtAt: '2026-08-08T00:00:00Z',
      canonicalBlend: asset.paths.canonicalBlend,
      canonicalBlendSha256: target.blend.sha256,
      candidateBlend: asset.paths.candidateBlend,
      candidateBlendSha256: candidateBlend.sha256,
      sourceCandidate: asset.paths.sourceCandidate,
      sourceCandidateSha256: sourceCandidate.sha256,
      releaseCandidate: asset.paths.releaseCandidate,
      releaseCandidateSha256: releaseCandidate.sha256,
      bytes: { candidateBlend: candidateBlend.bytes, source: sourceCandidate.bytes, release: releaseCandidate.bytes },
      bounds: structuredClone(target.aabb),
      lod,
      materials: [...CONTRACT.materials],
      frozenContract: {
        root: asset.rootNode,
        collision: 'COLLISION_HULL',
        sockets: Object.keys(asset.sockets),
        verifiedUnchanged: true,
      },
      validation: {
        status: 'pending',
        binding: null,
        candidateSha256: sourceCandidate.sha256,
        foundryReportSha256: null,
        khronosReportSha256: null,
      },
    };
    const epochs = {};
    for (const band of ['baseline', 'candidate']) {
      const images = [];
      for (const view of CONTRACT.views) {
        const path = `${asset.paths.evidenceRoot}/${band}/${view}`;
        const record = await writeRepoFile(root, path, Buffer.from(`${asset.id}:${band}:${view}`));
        images.push({
          ...record,
          ...fixtureImageContract(view),
          width: 1920,
          height: 1080,
          camera: { position: [10, 20, 30], target: [0, 0, 0], lensMm: 58, up: 'Y' },
        });
      }
      epochs[band] = {
        source: band === 'baseline' ? target.packetSource : sourceCandidate,
        bounds: structuredClone(target.aabb),
        images,
        runtimeCameras: runtimeFramings.map((framing) => ({
          name: framing.name,
          zoom: framing.zoom,
          position: [10, 20, 30],
          target: [0, 0, 0],
          fovDeg: 50,
          sourceDistance: framing.zoom * 4,
          runtimeScale: asset.key === 'base' ? 0.16 : 0.2,
          runtimeHalfVerticalWu: framing.zoom * 0.3,
          projectedRadiusFraction: framing.projectedRadiusFraction,
        })),
      };
    }
    const runtimeRecord = asset.key === 'base'
      ? baseline.runtimeContract.lawfulCatcher
      : baseline.runtimeContract.fenceReceiver;
    renderTargets[asset.id] = {
      runtimeScale: runtimeRecord.visualScale,
      expectedBounds: structuredClone(target.aabb),
      epochs,
    };
    fixtureById[asset.id] = {
      candidateBlend,
      sourceCandidate,
      releaseCandidate,
      foundry,
      khronos,
      evidence: Object.values(epochs).flatMap(({ images }) => images),
    };
  }
  const buildReportBytes = jsonBytes({
    schema: CONTRACT.buildSchema,
    dispatchUnit: CONTRACT.dispatchUnit,
    candidateId: CONTRACT.candidateId,
    builder: CONTRACT.builder,
    toolchain: { builder: builderIdentity, stationVisualFamily },
    attributeStabilization: CONTRACT.attributeStabilization,
    releaseCandidateSemantics: CONTRACT.releaseCandidateSemantics,
    sourceCommit: baseline.sourceCommit,
    evidenceBinding: { preflight: preflightIdentity, baselineManifest: baselineIdentity },
    targets: buildTargets,
    targetOrder: CONTRACT.assets.map(({ id }) => id),
    exactTwoTargetPipeline: true,
    canonicalAssetsModified: false,
    liveManifestsModified: false,
    protectedSiblingEnumeration: false,
  });
  const buildReport = await writeRepoFile(root, CONTRACT.buildReport, buildReportBytes);
  const renderReportBytes = jsonBytes({
    schema: CONTRACT.renderSchema,
    dispatchUnit: CONTRACT.dispatchUnit,
    candidateId: CONTRACT.candidateId,
    renderer: CONTRACT.renderer,
    rendererSha256: rendererIdentity.sha256,
    buildReport,
    baselineManifest: baselineIdentity,
    resolution: { width: 1920, height: 1080 },
    runtimeEquivalentAuthority: {
      viewport: { width: 1440, height: 900 },
      subjectRadius: 24,
      fovDeg: 50,
      distanceScale: 0.72,
      outputResolution: { width: 1920, height: 1080 },
      framings: runtimeFramings,
    },
    targetOrder: CONTRACT.assets.map(({ id }) => id),
    targets: renderTargets,
    renderEngine: 'BLENDER_EEVEE',
    imageCount: 80,
    exactAllowlistComplete: true,
  });
  const renderReport = await writeRepoFile(root, CONTRACT.renderReport, renderReportBytes);
  for (const asset of CONTRACT.assets) {
    const candidate = fixtureById[asset.id];
    const bindingBytes = jsonBytes({
      schema: CONTRACT.validationBindingSchema,
      dispatchUnit: CONTRACT.dispatchUnit,
      assetId: asset.id,
      candidateId: CONTRACT.candidateId,
      status: 'pass',
      buildReport,
      candidate: candidate.sourceCandidate,
      validators: { foundry: candidate.foundry, khronos: candidate.khronos },
    });
    const validationBinding = await writeRepoFile(root, asset.paths.validationBinding, bindingBytes);
    const reviewed = {
      blend: candidate.candidateBlend,
      source: candidate.sourceCandidate,
      releaseCandidate: candidate.releaseCandidate,
    };
    const visualBytes = jsonBytes({
      schema: CONTRACT.visualReviewSchema,
      dispatchUnit: CONTRACT.dispatchUnit,
      assetId: asset.id,
      candidateId: CONTRACT.candidateId,
      scope: 'whole_asset',
      exactFinalVisualBinding: true,
      reviewedCandidateEvidenceSufficient: true,
      implementationDisposition: 'integration_candidate',
      openP0P1Defects: [],
      verdict: { G1: verdict, G2: verdict, G4: verdict },
      buildReport,
      renderReport,
      validationBinding,
      renderProvenance: rendererIdentity,
      reviewedCandidate: structuredClone(reviewed),
      technicalCandidate: structuredClone(reviewed),
      evidence: candidate.evidence,
    });
    await writeRepoFile(root, asset.paths.visualReview, visualBytes);
  }
  return { root, baseline, baselineIdentity, protectedPaths, partsManifest };
}

async function bytesByPath(root, paths) {
  return new Map(await Promise.all(paths.map(async (path) => [path, await readFile(resolve(root, path))])));
}

async function assertBytesUnchanged(root, snapshot) {
  for (const [path, expected] of snapshot) {
    assert.ok((await readFile(resolve(root, path))).equals(expected), `${path} changed`);
  }
}

test('baseline and promoter contracts keep the exact two-ID source-only boundary', () => {
  assert.doesNotThrow(() => validateReceiverFacilityBaselineManifest(LIVE_BASELINE));
  assert.deepEqual(CONTRACT.assets.map(({ id }) => id), [
    'place_claim_outpost_base',
    'place_claim_outpost_refinery',
  ]);
  assert.equal(CONTRACT.externalNextSteps.length, 3);
  assert.match(CONTRACT.externalNextSteps[0], /build-place-release-assets.*base,place_claim_outpost_refinery/);
  assert.match(CONTRACT.externalNextSteps[2], /81-package/);
  assert.equal(LIVE_BASELINE.genericFamilyTools.mustNotRun, true);
  assert.deepEqual(LIVE_BASELINE.candidateToolchain.stationVisualFamily, {
    path: 'tools/blender/build_station_visual_family.py',
    bytes: 31280,
    sha256: '381c6f03b7766e8b6baec08854a9cb99f0ff2619fa54b346ff3968a0d000dd6d',
  });
  assert.equal(CONTRACT.releaseCandidateSemantics, 'isolated_source_mirror_not_release_proof');
  assert.deepEqual(CONTRACT.attributeStabilization, {
    texcoordGridDenominator: 32768,
    maxTexelDisplacementAt1024: 0.015625,
    timing: 'post_triangulation_pre_save_fresh_process_export',
    derivedTangents: 'exporter_recomputed_from_stabilized_texcoords',
    sceneNormalization: 'save_then_fresh_blender_process_export',
  });
  assert.equal(LIVE_BASELINE.renderPackageClosure.trackedPackageJsonCount, 81);
  assert.equal(
    LIVE_BASELINE.renderPackageClosure.trackedPackageJsonPathListSha256,
    '716b38d1a0d9877e74357a1987d585cd9548c4bde1f3782b8c14ae5b3529cb1d',
  );
});

test('candidate helper provenance fails closed before promotion planning', async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const helperPath = resolve(fixture.root, fixture.baseline.candidateToolchain.stationVisualFamily.path);
  await writeFile(helperPath, Buffer.from('foreign station visual-family helper'));
  assert.throws(
    () => buildReceiverFacilityPromotionPlan({ rootDir: fixture.root }),
    /candidate station visual-family helper changed/,
  );
});

test('plan admits exact build, validator, visual, geometry, and lifecycle bindings', async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const plan = buildReceiverFacilityPromotionPlan({ rootDir: fixture.root });
  assert.equal(plan.applied, false);
  assert.equal(plan.transaction.files.length, 9);
  assert.deepEqual(plan.targetIds, CONTRACT.assets.map(({ id }) => id));
  assert.equal(plan.releasePending, true);
  assert.equal(plan.renderPackageRebuildPending, true);
  assert.equal(plan.renderPackageClosure.trackedPackageJsonCount, 81);
  const expected = CONTRACT.assets.flatMap((asset) => [
    asset.paths.canonicalBlend,
    asset.paths.packetSource,
    asset.paths.canonicalSource,
    asset.paths.legacyEvidence,
  ]).concat(CONTRACT.partsManifest);
  assert.deepEqual(plan.publicationPaths, expected);
  assert.ok(plan.transaction.files.every(({ path }) => !/(?:release_manifest|pilots\.json|worldSiteAssetBindings|render-packages|family_summary|place_claim_outpost_(?:relay|bastion)|build_claim_outpost_family|finalize_claim_outpost_family)/.test(path)));

  for (const asset of CONTRACT.assets) {
    const descriptor = plan.transaction.files.find(({ path }) => (
      path === resolve(fixture.root, asset.paths.canonicalSource)
    ));
    const parsed = parseGlbDocument(descriptor.bytes, `${asset.id} promoted fixture`);
    const stamp = parsed.json.asset.extras.spacefaceAsset;
    assert.equal(stamp.wiringStatus, 'production_source');
    assert.equal(stamp.acceptedCandidateId, CONTRACT.candidateId);
    assert.deepEqual(stamp.claims, {
      candidateOnly: false,
      promoted: true,
      routeEvidence: false,
      performanceEvidence: false,
    });
  }
});

test('admission rejects validator warnings and a non-KEEP whole-asset verdict', async (t) => {
  const warningFixture = await createFixture({ khronosWarnings: 1 });
  const reviseFixture = await createFixture({ verdict: 'REVISE' });
  t.after(() => Promise.all([
    rm(warningFixture.root, { recursive: true, force: true }),
    rm(reviseFixture.root, { recursive: true, force: true }),
  ]));
  assert.throws(
    () => buildReceiverFacilityPromotionPlan({ rootDir: warningFixture.root }),
    /Khronos validator numWarnings is not zero/,
  );
  assert.throws(
    () => buildReceiverFacilityPromotionPlan({ rootDir: reviseFixture.root }),
    /exact-final whole-asset visual KEEP is incomplete/,
  );
});

test('admission rejects a render report that omits one required diagnostic', async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const renderPath = resolve(fixture.root, CONTRACT.renderReport);
  const report = JSON.parse(await readFile(renderPath, 'utf8'));
  report.targets[CONTRACT.assets[0].id].epochs.candidate.images.pop();
  await writeFile(renderPath, jsonBytes(report));
  assert.throws(
    () => buildReceiverFacilityPromotionPlan({ rootDir: fixture.root }),
    /render report evidence must bind the exact 40-file evidence allowlist/,
  );
});

test('parts-manifest planning preserves relay, bastion, unrelated rows, order, and shell', async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const plan = buildReceiverFacilityPromotionPlan({ rootDir: fixture.root });
  const manifestDescriptor = plan.transaction.files.at(-1);
  const next = JSON.parse(manifestDescriptor.bytes.toString('utf8'));
  assert.deepEqual(next.parts.map(({ id }) => id), fixture.partsManifest.parts.map(({ id }) => id));
  const targetIds = new Set(CONTRACT.assets.map(({ id }) => id));
  assert.deepEqual(
    next.parts.filter(({ id }) => !targetIds.has(id)),
    fixture.partsManifest.parts.filter(({ id }) => !targetIds.has(id)),
  );
  assert.deepEqual(next.runtimeSlots, fixture.partsManifest.runtimeSlots);
  for (const sibling of ['place_claim_outpost_relay', 'place_claim_outpost_bastion']) {
    assert.deepEqual(
      next.parts.find(({ id }) => id === sibling),
      fixture.partsManifest.parts.find(({ id }) => id === sibling),
    );
  }
  assert.ok(targetRowsOnly(next).every((row) => row.note.includes('release, render-package')
    || row.note.includes('Release, render-package')));
});

test('late publication failure rolls all nine destinations back and never touches downstream/siblings', async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const plan = buildReceiverFacilityPromotionPlan({ rootDir: fixture.root });
  const destinations = plan.transaction.files.map(({ path }) => relative(fixture.root, path));
  const beforeDestinations = await bytesByPath(fixture.root, destinations);
  const protectedBefore = await bytesByPath(fixture.root, fixture.protectedPaths);
  const failAt = plan.transaction.files[7].path;
  await assert.rejects(
    () => publishFileSetTransaction({
      ...plan.transaction,
      fileOps: {
        link: async (from, to) => {
          if (from.endsWith('.tmp') && to === failAt) throw new Error('injected ninth-file boundary failure');
          await fsLink(from, to);
        },
      },
    }),
    /injected ninth-file boundary failure.*original destinations restored/s,
  );
  await assertBytesUnchanged(fixture.root, beforeDestinations);
  await assertBytesUnchanged(fixture.root, protectedBefore);

  await publishFileSetTransaction(plan.transaction);
  for (const descriptor of plan.transaction.files) {
    assert.equal(sha256(await readFile(descriptor.path)), sha256(descriptor.bytes));
  }
  await assertBytesUnchanged(fixture.root, protectedBefore);
  const residue = (await readdir(fixture.root, { recursive: true })).filter(
    (name) => String(name).includes('.sf-file-set-'),
  );
  assert.deepEqual(residue, []);
});

test('baseline drift rejects the plan before any destination descriptor can publish', async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const sourcePath = resolve(fixture.root, CONTRACT.assets[0].paths.canonicalSource);
  const original = await readFile(sourcePath);
  await writeFile(sourcePath, Buffer.from('foreign canonical edit'));
  assert.throws(
    () => buildReceiverFacilityPromotionPlan({ rootDir: fixture.root }),
    /canonical-source baseline changed/,
  );
  await writeFile(sourcePath, original);
  const sibling = fixture.baseline.protectedSiblings.place_claim_outpost_relay.packetSource.path;
  await writeFile(resolve(fixture.root, sibling), Buffer.from('foreign sibling edit'));
  assert.throws(
    () => buildReceiverFacilityPromotionPlan({ rootDir: fixture.root }),
    /place_claim_outpost_relay packetSource changed/,
  );
});
