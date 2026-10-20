import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import test from 'node:test';
import * as THREE from 'three';
import { isRigidOpaqueBatchableSurface, rigidOpaqueMaterialProgramKey } from '../src/render/rigidOpaqueBatchPolicy.js';
import { instancePoolIdentity } from '../src/render/materialBatchKey.js';
import {
  assessAuthoredPackagePoolApplicability,
  assessRepeatedAuthoredPackagePoolProof,
  assertAuthoredAdmissionSlotBound,
  collectAuthoredReport,
  createAuthoredPresentationReader,
  createAuthoredGateEvidence,
  waitForAuthoredShips,
  establishAuthoredShipCoverageView,
  inspectLegacyPackagePoolEligibility,
} from '../scripts/probe-authored-assets-live.mjs';

const source = readFileSync(new URL('../scripts/probe-authored-assets-live.mjs', import.meta.url), 'utf8');
const electronSource = readFileSync(new URL('../scripts/check-electron-new-game-launch.mjs', import.meta.url), 'utf8');

function translatedMatrix(x) {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, 0, 0, 1,
  ];
}

function repeatedPoolReport() {
  const firstMatrix = translatedMatrix(12);
  const secondMatrix = translatedMatrix(36);
  const submission = (index, matrix) => ({
    key: 'package:wasp:opaque',
    chunk: 0,
    index,
    token: `package:wasp:opaque|0|${index}`,
    submitted: true,
    proxyMatrix: matrix,
    proxyIsInstanceProxy: true,
    proxyIsRenderPackagePooled: true,
    proxyIsMesh: false,
    visibleThroughRoot: true,
    directDrawSuppressed: true,
  });
  return {
    instancePools: [{
      key: 'package:wasp:opaque',
      chunk: 0,
      visible: true,
      sceneParented: true,
      submittedSlotMatrices: [
        { index: 0, determinant: 1, matrix: firstMatrix },
        { index: 1, determinant: 1, matrix: secondMatrix },
      ],
    }],
    ships: [
      {
        id: 101,
        defId: 'ship_wasp',
        trafficRole: 'escort',
        wholeShipBodyUrls: ['assets/ships/release/parts/wholeships/wasp_production_v1.glb'],
        presented: true,
        state: 'authored',
        packagePoolSubmissions: [submission(0, firstMatrix)],
      },
      {
        id: 102,
        defId: 'ship_wasp',
        trafficRole: 'escort',
        wholeShipBodyUrls: ['assets/ships/release/parts/wholeships/wasp_production_v1.glb'],
        presented: true,
        state: 'authored',
        packagePoolSubmissions: [submission(1, secondMatrix)],
      },
    ],
  };
}

test('live asset proof respects spatial streaming while forbidding visible substitutes', () => {
  assert.doesNotMatch(source, /requestAuthoredUpgrade/,
    'normal-route proof must not defeat the production residency policy by demanding every offscreen body');
  assert.match(source, /report\.ships\.filter\(\(ship\) => ship\.presented && ship\.state !== 'authored'/,
    'every presented ship remains required to use its authored identity');
  assert.match(source, /!ship\.presented[\s\S]*?'cancelled-before-load'/,
    'off-camera admission cancellation remains distinct from a visible substituted body');
  assert.doesNotMatch(source, /frustumCulled\s*=/,
    'the observer may not make off-camera ships render to manufacture presentation demand');
  assert.match(source, /maxConcurrentDecode <= 1/,
    'production decode admission remains serial and bounded');
  assert.match(source, /repeatedPackageShipPoolKeys\.length > 0/,
    'eligible repeated roots still require a real shared package pool');
  assert.match(source, /packagePoolApplicability\.status === 'required'/,
    'the legacy pool assertion must follow actual primitive eligibility');
  assert.match(source, /entry\.roots\.filter\(isFrequentShipRoot\)\.length >= 2/,
    'both roots counted by repeated package proof must be members of the frequent Wasp/freighter population');
  assert.match(source, /spacefaceRenderPackagePooled === true/,
    'surface and bounds proof must recognize package pool proxies without pretending they are direct meshes');
  assert.match(source, /packagePoolTextureResidency\.allResident/,
    'pool proxies retain final materials so the live proof can verify their textures are resident');
  assert.match(source, /packageSubmittedPoolKeys/,
    'repeated-root proof must use package slots submitted by the production pool sync');
  assert.match(source, /submittedInstancePoolSlots/,
    'the live probe must reject zero-matrix and hidden pool membership as route proof');
  assert.match(source, /submittedSlotCount/,
    'the report exposes currently submitted slots per exact scene pool chunk');
  assert.match(source, /await render\.warmPostProcess\(\)/,
    'forced presentation must use the production-owned renderer epoch so dynamic buffers publish before upload');
  assert.doesNotMatch(source, /render\.renderer\.render\(render\.scene, render\.camera\)/,
    'the live probe must not bypass dynamic-buffer publication through the exposed raw renderer');
});

test('the probe bounds actual admission slots while retaining whole GPU-tail lifetime counts', () => {
  const diagnostic = { maxConcurrentJobs: 14, activeJobs: 0,
    maxConcurrentAdmissionSlots: 2, activeAdmissionSlots: 0 };
  assert.doesNotThrow(() => assertAuthoredAdmissionSlotBound(diagnostic));
  assert.equal(diagnostic.maxConcurrentJobs, 14);
  assert.throws(() => assertAuthoredAdmissionSlotBound({ ...diagnostic, maxConcurrentAdmissionSlots: 5 }),
    /admission slots must stay bounded/, 'a real semaphore peak above the unchanged four-slot bar fails');
  assert.throws(() => assertAuthoredAdmissionSlotBound({ maxConcurrentJobs: 2 }),
    /admission slots must stay bounded/, 'whole-lifetime concurrency cannot substitute for missing phase evidence');
  assert.throws(() => assertAuthoredAdmissionSlotBound({ ...diagnostic, activeAdmissionSlots: -1 }),
    /admission slots must stay bounded/);
  assert.throws(() => assertAuthoredAdmissionSlotBound({ ...diagnostic, activeAdmissionSlots: 5 }),
    /admission slots must stay bounded/);
  assert.match(source, /maxConcurrentAdmissionSlots <= 4/);
  assert.doesNotMatch(source, /maxConcurrentJobs <= 4/);
});

function presentationFixture() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.z = 40;
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), new THREE.MeshStandardMaterial());
  mesh.geometry.computeBoundingSphere(); // The render owner, not the observer, prepares its cache.
  root.add(mesh);
  scene.add(root);
  const reader = () => {
    scene.updateMatrixWorld(true);
    return createAuthoredPresentationReader(THREE, camera, scene);
  };
  return { scene, camera, root, mesh, reader };
}

test('live presentation uses the real frustum, layers, visibility and draw ranges without changing culling', () => {
  const f = presentationFixture();
  assert.equal(f.reader().hasPresentedSurface(f.root), true);
  f.root.position.x = 1000;
  assert.equal(f.reader().hasPresentedSurface(f.root), false, 'an off-camera visible root is not on the glass');
  assert.equal(f.mesh.frustumCulled, true);
  f.root.position.x = 0;
  f.mesh.layers.set(2);
  assert.equal(f.reader().hasPresentedSurface(f.root), false);
  f.mesh.layers.set(0);
  f.root.visible = false;
  assert.equal(f.reader().hasPresentedSurface(f.root), false);
  f.root.visible = true;
  f.mesh.geometry.setDrawRange(0, 0);
  assert.equal(f.reader().hasPresentedSurface(f.root), false);
  f.mesh.geometry.setDrawRange(0, Infinity);
  const hidden = new THREE.MeshStandardMaterial({ visible: false });
  f.mesh.material = [hidden, new THREE.MeshStandardMaterial()];
  f.mesh.geometry.clearGroups();
  f.mesh.geometry.addGroup(0, 3, 0);
  assert.equal(f.reader().hasPresentedSurface(f.root), false, 'an unreferenced visible material cannot prove a draw');
  f.mesh.geometry.addGroup(3, 3, 1);
  assert.equal(f.reader().hasPresentedSurface(f.root), true);
  f.mesh.geometry.setDrawRange(0, 3);
  assert.equal(f.reader().hasPresentedSurface(f.root), false, 'groups outside the draw range do not render');
});

test('on-camera unresolved markers stay owed and unknown core geometry cannot silently pass', () => {
  const f = presentationFixture();
  f.root.userData.authoredAssetState = 'awaiting-authored-admission';
  f.mesh.userData.authoredResolvingMarker = true;
  assert.equal(f.reader().hasPresentedSurface(f.root), true,
    'a marker on the glass still enters the unchanged authored-state/body failure checks');
  f.mesh.geometry.computeBoundingSphere();
  f.mesh.geometry.boundingSphere.radius = NaN;
  const unreadable = f.reader();
  assert.equal(unreadable.hasPresentedSurface(f.root), true);
  assert.deepEqual(unreadable.unknownReasons().map(row => row.reason), ['unreadable-draw-bound']);
  const noCamera = createAuthoredPresentationReader(THREE, null, f.scene);
  assert.equal(noCamera.hasPresentedSurface(f.root), true);
  assert.equal(noCamera.unknownCount(), 1);
  f.camera.projectionMatrix.elements[0] = NaN;
  const invalidCamera = f.reader();
  assert.equal(invalidCamera.hasPresentedSurface(f.root), true);
  assert.equal(invalidCamera.unknownReasons()[0].reason, 'unreadable-live-camera');
});

test('presentation reads cached aggregate bounds without populating geometry or instance caches', () => {
  const f = presentationFixture();
  const cached = f.mesh.geometry.boundingSphere;
  const saved = cached.clone();
  assert.equal(f.reader().hasPresentedSurface(f.root), true);
  assert.strictEqual(f.mesh.geometry.boundingSphere, cached);
  assert.deepEqual(cached, saved);
  f.mesh.geometry.boundingSphere = null;
  f.mesh.geometry.computeBoundingSphere = () => assert.fail('observer may not fill a live geometry cache');
  const unknown = f.reader();
  assert.equal(unknown.hasPresentedSurface(f.root), true);
  assert.equal(unknown.unknownCount(), 1);
  assert.equal(f.mesh.geometry.boundingSphere, null);

  f.root.remove(f.mesh);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const instanced = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial(), 1);
  instanced.setMatrixAt(0, new THREE.Matrix4().makeTranslation(1000, 0, 0));
  instanced.computeBoundingSphere();
  f.root.add(instanced);
  const aggregate = instanced.boundingSphere;
  const aggregateSaved = aggregate.clone();
  assert.equal(f.reader().hasPresentedSurface(f.root), false,
    'the aggregate is outside camera even though the untransformed primitive sphere is centered on camera');
  assert.strictEqual(instanced.boundingSphere, aggregate);
  assert.deepEqual(aggregate, aggregateSaved);
  instanced.boundingSphere = null;
  instanced.computeBoundingSphere = () => assert.fail('observer may not fill the aggregate cache');
  const missingAggregate = f.reader();
  assert.equal(missingAggregate.hasPresentedSurface(f.root), true);
  assert.equal(missingAggregate.unknownCount(), 1, 'missing aggregate bounds cannot use primitive bounds to claim off-camera');
  assert.equal(instanced.boundingSphere, null);
});

test('the actual page collector excludes off-camera pending roots and rejects an empty authored body draw', async () => {
  const f = presentationFixture();
  const hullUrl = 'assets/ships/release/parts/wholeships/wasp_production_v1.glb';
  f.root.userData = { authoredAssetState: 'authored', authoredAssetMode: 'release', authoredSlots: { hull: [hullUrl] } };
  f.mesh.userData.spacefacePartUrl = hullUrl;
  const markerRoot = new THREE.Group();
  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), new THREE.MeshBasicMaterial());
  marker.geometry.computeBoundingSphere();
  markerRoot.userData.authoredAssetState = 'cancelled-before-load';
  markerRoot.add(marker);
  markerRoot.position.x = 1000;
  f.scene.add(markerRoot);
  const entities = [
    { id: 1, type: 'ship', alive: true, radius: 2, mesh: f.root, data: { defId: 'ship_wasp' } },
    { id: 361, type: 'ship', alive: true, radius: 2, mesh: markerRoot, data: { defId: 'ship_ironback' } },
  ];
  const window = { SF: { state: { mode: 'flight', playerId: 1, entityList: entities,
    entities: new Map(entities.map(entity => [entity.id, entity])), render: { scene: f.scene, camera: f.camera } } } };
  const cdp = { async send(_method, { expression }) {
    const evaluate = new Function('window', 'loadProbeModule', `return ${expression.replaceAll('import(', 'loadProbeModule(')}`);
    const value = await evaluate(window, async name => name === 'three'
      ? THREE : name.includes('materialBatchKey') ? { instancePoolIdentity }
        : { isRigidOpaqueBatchableSurface, rigidOpaqueMaterialProgramKey });
    return { result: { value } };
  } };
  f.reader();
  const report = await collectAuthoredReport(cdp);
  assert.equal(report.presentedShipCount, 1);
  assert.equal(report.ships.find(ship => ship.id === 361).presented, false);
  assert.equal(report.player.authoredBodyProof.ok, true);
  assert.equal(f.mesh.geometry.boundingBox, null, 'body extent observation uses a temporary box');
  f.mesh.geometry.setDrawRange(0, 0);
  f.root.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.5), new THREE.MeshBasicMaterial()));
  const emptyBody = await collectAuthoredReport(cdp);
  assert.equal(emptyBody.player.presented, true, 'the unresolved visible marker keeps the root owed');
  assert.equal(emptyBody.player.authoredBodyProof.ok, false);
  assert.ok(emptyBody.player.authoredBodyProof.failures.some(row => row.reason === 'missing-visible-authored-body-surface'));
});

test('actual shipped motion tags exclude legacy pooling with measured primitive reasons', () => {
  for (const name of ['ashline-dart', 'helios-span']) {
    const metadata = JSON.parse(readFileSync(new URL(
      `../assets/ships/release/render-packages/${name}/render-package.json`, import.meta.url), 'utf8'));
    const root = new THREE.Group();
    const planEntries = metadata.runtime.primitives.map(primitive => {
      const source = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
      source.userData.spacefaceTags = primitive.tags;
      return { source };
    });
    root.userData.renderPackageInstance = { planEntries };
    const census = inspectLegacyPackagePoolEligibility(root, isRigidOpaqueBatchableSurface, THREE.Object3D.prototype);
    assert.equal(census.primitiveCount, metadata.runtime.primitives.length);
    assert.equal(census.eligiblePrimitiveCount, 0);
    assert.equal(census.unknownPrimitiveCount, 0);
    assert.equal(census.exclusions['authored-motion'], census.primitiveCount);
    const report = { ships: [101, 102].map(id => ({ id, defId: 'ship_wasp', presented: true,
      state: 'authored', legacyPackagePoolEligibility: census })) };
    const applicability = assessAuthoredPackagePoolApplicability(report);
    assert.equal(applicability.status, 'not-applicable');
    assert.equal(applicability.presentedFrequentRootCount, 2);
    assert.equal(applicability.eligibleRootCount, 0);
    assert.equal(applicability.pass, true);
  }
});

test('two eligible actual package roots require the original exact two-root two-slot proof', () => {
  const root = new THREE.Group();
  const source = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  const live = source.clone();
  live.userData.spacefaceInstancePoolKey = instancePoolIdentity(live.geometry, live.material);
  root.userData.renderPackageInstance = { planEntries: [{ source }], planNodes: [live] };
  const contracts = { instancePoolIdentity, rigidOpaqueMaterialProgramKey };
  const census = inspectLegacyPackagePoolEligibility(root, isRigidOpaqueBatchableSurface, THREE.Object3D.prototype, contracts);
  assert.equal(census.eligiblePrimitiveCount, 1);
  assert.equal(census.unknownPrimitiveCount, 0);
  const report = repeatedPoolReport();
  const poolKey = census.candidates[0].poolKey;
  report.instancePools[0].key = poolKey;
  for (const ship of report.ships) {
    ship.legacyPackagePoolEligibility = census;
    for (const submission of ship.packagePoolSubmissions) {
      submission.key = poolKey;
      submission.token = `${poolKey}|${submission.chunk}|${submission.index}`;
    }
  }
  const applicability = assessAuthoredPackagePoolApplicability(report);
  assert.equal(applicability.status, 'required');
  assert.equal(assessRepeatedAuthoredPackagePoolProof(report,
    { compatibleCandidates: applicability.compatibleCandidates }).pass, true);
  report.instancePools = [];
  assert.equal(assessRepeatedAuthoredPackagePoolProof(report).pass, false,
    'eligible pairs cannot take the not-applicable route when their actual slots are missing');
  delete report.ships[0].legacyPackagePoolEligibility;
  assert.equal(assessAuthoredPackagePoolApplicability(report).pass, false, 'missing eligibility is UNKNOWN');
  root.userData.renderPackageInstance = {};
  const unknown = inspectLegacyPackagePoolEligibility(root, isRigidOpaqueBatchableSurface, THREE.Object3D.prototype);
  assert.equal(unknown.unknownPrimitiveCount, 1);
  root.userData.renderPackageInstance = { planEntries: [{ source }], planNodes: [source.clone()] };
  assert.equal(inspectLegacyPackagePoolEligibility(root, isRigidOpaqueBatchableSurface,
    THREE.Object3D.prototype, contracts).unknownPrimitiveCount, 1, 'missing actual candidate key is UNKNOWN');
});

test('unrelated eligible package primitives or render lanes do not demand a shared pool', () => {
  const inspect = (geometry, material, renderOrder = 0) => {
    const root = new THREE.Group();
    const source = new THREE.Mesh(geometry, material);
    const live = source.clone();
    live.renderOrder = renderOrder;
    live.userData.spacefaceInstancePoolKey = instancePoolIdentity(geometry, material);
    root.userData.renderPackageInstance = { planEntries: [{ source }], planNodes: [live] };
    return inspectLegacyPackagePoolEligibility(root, isRigidOpaqueBatchableSurface, THREE.Object3D.prototype,
      { instancePoolIdentity, rigidOpaqueMaterialProgramKey });
  };
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  const first = inspect(geometry, material);
  for (const unrelated of [inspect(new THREE.BoxGeometry(), material),
    inspect(geometry, new THREE.MeshStandardMaterial({ color: 0xff0000 })), inspect(geometry, material, 2)]) {
    const report = { ships: [first, unrelated].map((census, index) => ({ id: index + 1,
      defId: 'ship_wasp', presented: true, state: 'authored', legacyPackagePoolEligibility: census })) };
    const applicability = assessAuthoredPackagePoolApplicability(report);
    assert.equal(applicability.eligibleRootCount, 2);
    assert.equal(applicability.pass, true);
    assert.equal(applicability.status, 'not-applicable');
    assert.deepEqual(applicability.compatibleCandidates, []);
  }
});

test('repeated package proof binds two authored roots to two exact submitted matrices', async () => {
  assert.match(source, /export function assessRepeatedAuthoredPackagePoolProof/,
    'the live route must use an import-safe causal proof instead of counting root labels');
  const { assessRepeatedAuthoredPackagePoolProof } = await import('../scripts/probe-authored-assets-live.mjs');

  const valid = repeatedPoolReport();
  const proof = assessRepeatedAuthoredPackagePoolProof(valid);
  assert.equal(proof.pass, true, JSON.stringify(proof.failures));
  assert.equal(proof.proofs.length, 1);
  assert.equal(proof.proofs[0].distinctRootCount, 2);
  assert.equal(proof.proofs[0].distinctSlotCount, 2);

  const aliased = structuredClone(valid);
  aliased.ships[1].packagePoolSubmissions[0] = structuredClone(
    aliased.ships[0].packagePoolSubmissions[0],
  );
  assert.equal(assessRepeatedAuthoredPackagePoolProof(aliased).pass, false,
    'two root labels must not pass by pointing at the same submitted slot token');

  const staleMatrix = structuredClone(valid);
  staleMatrix.ships[1].packagePoolSubmissions[0].proxyMatrix = translatedMatrix(99);
  assert.equal(assessRepeatedAuthoredPackagePoolProof(staleMatrix).pass, false,
    'the submitted slot must contain the exact live proxy matrix');

  const directDuplicate = structuredClone(valid);
  directDuplicate.ships[1].packagePoolSubmissions[0].directDrawSuppressed = false;
  assert.equal(assessRepeatedAuthoredPackagePoolProof(directDuplicate).pass, false,
    'a visible direct package draw may not coexist with the claimed pooled draw');
});

test('owned runtime proof fails closed when any teardown category is absent', async () => {
  assert.match(source, /export function assertAuthoredProbeCleanup/);
  const { assertAuthoredProbeCleanup, finalizeAuthoredProbeEvidence } = await import('../scripts/probe-authored-assets-live.mjs');
  assert.throws(() => assertAuthoredProbeCleanup({}), /Chrome process proof/);
  assert.throws(() => finalizeAuthoredProbeEvidence({ route: 'fixture' }, {}), /Chrome process proof/,
    'missing process, port, and profile evidence must never serialize as PASS');
});

test('port teardown proof distinguishes a live listener from exact refusal', async () => {
  assert.match(source, /export function probePortRefusalOnce/);
  const { probePortRefusalOnce } = await import('../scripts/probe-authored-assets-live.mjs');
  const server = createServer((socket) => socket.end());
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const port = server.address().port;
  assert.equal(await probePortRefusalOnce(port, { timeoutMs: 200 }), false,
    'an accepting listener is not teardown proof');
  await new Promise((resolveClose, reject) => {
    server.close((error) => error ? reject(error) : resolveClose());
  });
  assert.equal(await probePortRefusalOnce(port, { timeoutMs: 200 }), true,
    'only exact ECONNREFUSED proves the listener is closed');
});

test('server ownership is published before a live readiness failure', async () => {
  assert.match(source, /export async function startFreshServer/);
  const { startFreshServer } = await import('../scripts/probe-authored-assets-live.mjs');
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  try {
    const server = await startFreshServer({
      findFreePort: async () => 18521,
      spawnServer: () => child,
      waitForReachable: async () => { throw new Error('live server stayed unreachable'); },
    });
    assert.equal(server.child, child,
      'the caller must retain the live child before readiness can reject');
    assert.equal(server.port, 18521);
    assert.equal(child.exitCode, null, 'the causal fixture remains alive at the failure boundary');
    await assert.rejects(server.ready, /stayed unreachable/);
  } finally {
    if (child.exitCode == null && child.signalCode == null) {
      await new Promise((resolveExit) => {
        child.once('exit', resolveExit);
        child.kill();
      });
    }
  }
});

test('Electron normal route proves authored release identities without an artificial drain', () => {
  assert.doesNotMatch(electronSource, /requestAuthoredUpgrade/,
    'Electron acceptance must exercise production demand rather than forcing distant assets resident');
  assert.match(electronSource, /ship\.authoredAssetState === 'authored'/);
  assert.match(electronSource,
    /function hasAcceptableAuthoredPresentation\(ship\)[\s\S]*?ship\.authoredAssetMode !== 'release'\) return false;/,
    'the shared acceptance predicate must fail closed for every non-release ship');
  assert.match(electronSource, /hasMesh: !!mesh/,
    'the report must distinguish an intentionally absent mesh from a released mesh');
  assert.match(electronSource, /required,/,
    'the report must publish the finite first-picture/current-sector requirement');
  assert.match(electronSource, /renderRelevance: required \|\| !!mesh/,
    'meshless pending entities must carry the renderer-owned relevance decision');
  assert.match(electronSource, /import\('\/src\/render\/partsLibrary\.js'\)/,
    'the report must reuse the renderer-owned startup composition predicate');
  assert.match(electronSource, /isInitialAuthoredCompositionEntity\(entity, state\)/,
    'required membership must use the live startup owner predicate');
  assert.match(electronSource, /ship\.hasMesh === false[\s\S]*?ship\.required !== true[\s\S]*?ship\.renderRelevance === false/,
    'meshless pending admission must stay outside the required cohort');
  assert.match(electronSource, /report\.ships\.every\(hasAcceptableAuthoredPresentation\)/,
    'the written acceptance receipt must apply the shared release predicate to every live ship');
  assert.match(electronSource,
    /report\.ships\.filter\(\(ship\) => !hasAcceptableAuthoredPresentation\(ship\)\)/,
    'the terminal assertion must reject every ship that fails the shared release predicate');
  assert.match(electronSource, /report\.mode === 'flight'/,
    'the proof remains a real playable-route handoff, not an isolated asset viewer');
  assert.match(electronSource, /getByRole\('button', \{ name: 'New Game', exact: true \}\)/,
    'the diagnostic must click the New Game control rather than the identically named heading');
  assert.match(electronSource, /getByRole\('button', \{ name: 'Launch', exact: true \}\)/,
    'the diagnostic must bind Launch to its exact button role');
});

test('Electron presentation acceptance permits only the observed off-camera pending boundary', async () => {
  assert.match(electronSource, /export function hasAcceptableAuthoredPresentation/,
    'the acceptance seam must be import-safe for focused behavior coverage');
  const { hasAcceptableAuthoredPresentation } = await import('../scripts/check-electron-new-game-launch.mjs');
  const authored = {
    id: 1,
    alive: true,
    isPlayer: true,
    hasMesh: true,
    required: true,
    renderRelevance: true,
    presentationAdmission: 'ready',
    authoredAssetState: 'authored',
    authoredAssetMode: 'release',
  };
  assert.equal(hasAcceptableAuthoredPresentation(authored), true,
    'the player with a released authored mesh remains accepted');
  assert.equal(hasAcceptableAuthoredPresentation({
    ...authored,
    presentationAdmission: 'pending',
    authoredAssetState: 'authored',
  }), false,
  'the player must also be ready once its authored mesh exists');

  assert.equal(hasAcceptableAuthoredPresentation({
    id: 333,
    alive: true,
    isPlayer: false,
    hasMesh: false,
    required: false,
    renderRelevance: false,
    presentationAdmission: 'pending',
    authoredAssetState: null,
    authoredAssetMode: null,
  }), true,
  'the native observed off-camera pending ship may remain meshless');

  const requiredMeshlessPending = {
    id: 334,
    alive: true,
    isPlayer: false,
    hasMesh: false,
    required: true,
    renderRelevance: true,
    presentationAdmission: 'pending',
    authoredAssetState: null,
    authoredAssetMode: null,
  };
  assert.equal(hasAcceptableAuthoredPresentation(requiredMeshlessPending), false,
    'a required first-picture ship may not disappear behind the pending boundary');
  assert.equal(hasAcceptableAuthoredPresentation({
    ...requiredMeshlessPending,
    isPlayer: true,
    required: true,
  }), false,
  'the player may not pass while meshless and pending');

  assert.equal(hasAcceptableAuthoredPresentation({
    id: 335,
    alive: true,
    isPlayer: false,
    hasMesh: true,
    required: false,
    renderRelevance: true,
    presentationAdmission: 'pending',
    authoredAssetState: 'loading',
    authoredAssetMode: 'release',
  }), true,
  'an existing off-camera mesh may remain in an explicit release pending state');
  assert.equal(hasAcceptableAuthoredPresentation({
    id: 336,
    alive: true,
    isPlayer: false,
    hasMesh: true,
    required: false,
    renderRelevance: true,
    presentationAdmission: 'ready',
    authoredAssetState: 'fallback-after-error',
    authoredAssetMode: 'fallback',
    presentationFallbackVisible: true,
  }), false,
  'fallback presentation must remain a hard failure');
  assert.equal(hasAcceptableAuthoredPresentation({
    id: 337,
    alive: true,
    isPlayer: false,
    hasMesh: true,
    required: false,
    renderRelevance: true,
    presentationAdmission: 'ready',
    authoredAssetState: null,
    authoredAssetMode: 'release',
  }), false,
  'a ready mesh without authored state must fail closed');
  assert.equal(hasAcceptableAuthoredPresentation({
    id: 338,
    alive: false,
    isPlayer: false,
    hasMesh: true,
    required: false,
    renderRelevance: true,
    presentationAdmission: 'ready',
    authoredAssetState: 'authored',
    authoredAssetMode: 'release',
  }), false,
  'dead proxy records must not satisfy the live launch gate');
});


async function rejectedTwoShipGate({ pending = false } = {}) {
  const f = presentationFixture();
  f.scene.remove(f.root);
  const ships = Array.from({ length: 25 }, (_, index) => {
    const root = new THREE.Group();
    root.userData.authoredAssetState = pending && index >= 2 ? 'loading' : 'authored';
    root.userData.authoredPreparePhase = pending && index >= 2 ? 'compiling-pipelines' : null;
    root.position.x = index < 2 ? index * 2 : 1000 + index;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.geometry.computeBoundingSphere();
    root.add(mesh); f.scene.add(root);
    return { id: index + 1, type: 'ship', alive: true, mesh: root,
      pos: { x: root.position.x, z: 0 }, activity: { presentationTier: 'R1_RUNWAY' } };
  });
  f.scene.updateMatrixWorld(true);
  if (pending) f.scene.userData.authoredUpgradeDiagnostics = {
    activeJobs: 1, activeAdmissionSlots: 1,
    jobs: [{ entityId: 3, key: 'ship:3', status: 'running', startedAtMs: 10, endedAtMs: null }],
  };
  const window = { SF: { state: { mode: 'flight', tick: 410, playerId: 1, entityList: ships,
    render: { scene: f.scene, camera: f.camera, renderer: {}, warmPostProcess() {} } } } };
  let now = 0, calls = 0;
  const terminal = new Error('fixture final CDP reply missing');
  const cdp = { setStage() {}, async send(_method, { expression }) {
    calls++;
    if (now >= 100) throw terminal;
    const evaluate = new Function('window', 'loadProbeModule',
      `return ${expression.replaceAll('import(', 'loadProbeModule(')}`);
    return { result: { value: await evaluate(window, async name => {
      assert.equal(name, 'three', 'observer adds no module loading'); return THREE;
    }) } };
  } };
  await assert.rejects(waitForAuthoredShips(cdp, { now: () => now,
    sleep: ms => { now += ms; }, admissionTimeoutMs: 100 }), error => error === terminal);
  assert.equal(calls, 5, 'two original render/snapshot polls and terminal snapshot only');
  const evidence = JSON.parse(JSON.stringify(terminal.authoredShipDiagnostics));
  assert.equal(evidence.operation, 'admission-snapshot');
  assert.equal(evidence.lastReport, null);
  const snapshot = evidence.lastGateReply.snapshot;
  assert.equal(snapshot.shipCount, 25);
  assert.equal(snapshot.presentedShipCount, 2);
  assert.equal(snapshot.authoredShipCount, 2);
  assert.equal(snapshot.presentationUnknownCount, 0);
  assert.equal(snapshot.playerState, 'authored');
  return snapshot;
}

test('actual admission gate retains fully authored offscreen evidence without relaxing three-presented gate', async () => {
  const snapshot = await rejectedTwoShipGate();
  assert.deepEqual(snapshot.evidence.assetStates, { authored: 25 });
  assert.equal(snapshot.evidence.ships[2].presented, false);
  assert.equal(snapshot.evidence.ships[2].exclusion, 'no-presented-surface');
  assert.equal(snapshot.evidence.ships[2].rootPose.x, 1002);
  assert.equal(snapshot.evidence.queue, null);
});

test('same two-presented signature retains distinct real pending states and cached running-job evidence', async () => {
  const snapshot = await rejectedTwoShipGate({ pending: true });
  assert.deepEqual(snapshot.evidence.assetStates, { authored: 2, loading: 23 });
  assert.equal(snapshot.evidence.ships[2].preparePhase, 'compiling-pipelines');
  assert.equal(snapshot.evidence.queue.activeAdmissionSlots, 1);
  assert.equal(snapshot.evidence.queue.recentJobs[0].entityId, '3');
  assert.equal(snapshot.evidence.queue.pendingAndHoldStateAvailable, false);
});

test('gate evidence caps ship/state/job/text records and labels missing roots without mutating cached diagnostics', () => {
  const scene = { userData: { authoredUpgradeDiagnostics: { activeJobs: 99,
    jobs: Array.from({ length: 99 }, (_, i) => ({ key: 'x'.repeat(200), entityId: i, status: 'running' })) } } };
  const before = JSON.stringify(scene);
  const evidence = createAuthoredGateEvidence(scene);
  for (let i = 0; i < 40; i++) evidence.add({ id: 'y'.repeat(200), pos: { x: NaN } }, null, `state-${i}`, false);
  const result = evidence.snapshot();
  assert.equal(result.ships.length, 32);
  assert.equal(Object.keys(result.assetStates).length, 32);
  assert.equal(result.otherStateCount, 8);
  assert.equal(result.shipRowsTruncated, true);
  assert.equal(result.textTruncated, true);
  assert.equal(result.queue.recentJobs.length, 8);
  assert.equal(result.queue.jobRowsTruncated, true);
  assert.equal(result.queue.recentJobs[0].key.length, 160);
  assert.equal(result.ships[0].id.length, 160);
  assert.equal(result.ships[0].exclusion, 'missing-root');
  assert.equal(result.ships[0].entityPose.x, null);
  assert.equal(JSON.stringify(scene), before);
});


function coverageInputFixture({ blocked = false, unsafe = false } = {}) {
  const f = presentationFixture();
  f.root.userData.authoredAssetState = unsafe ? 'loading' : 'authored';
  f.scene.updateMatrixWorld(true);
  const state = { mode: 'flight', tick: 424, playerId: 1, camera: { zoom: 144 },
    entityList: [{ id: 1, type: 'ship', alive: true, mesh: f.root }],
    render: { scene: f.scene, camera: f.camera } };
  const events = [];
  const cdp = { async send(method, parameters) {
    events.push(method);
    if (method === 'Input.dispatchMouseEvent') {
      assert.deepEqual(parameters, { type: 'mouseWheel', x: 720, y: 450, deltaX: 0, deltaY: 120 });
      if (!blocked) state.camera.zoom += Math.max(16, Math.round(state.camera.zoom * 0.08));
      return {};
    }
    assert.equal(method, 'Runtime.evaluate');
    const evaluate = new Function('window', 'loadProbeModule',
      `return ${parameters.expression.replaceAll('import(', 'loadProbeModule(')}`);
    return { result: { value: await evaluate({ SF: { state } }, async name => {
      assert.equal(name, 'three'); return THREE;
    }) } };
  } };
  return { state, events, cdp, captureDefaultView: async () => events.push('default-screenshot') };
}

test('coverage actor retains untouched default safety and screenshot before five public wheel inputs', async () => {
  const f = coverageInputFixture();
  const result = await establishAuthoredShipCoverageView(f.cdp, f);
  assert.equal(result.defaultView.view.requestedZoom, 144);
  assert.equal(result.requestedCoverageView.view.requestedZoom, 225);
  assert.equal(result.acknowledgedWheelInputs, 5);
  assert.equal(result.defaultViewIsThreeShipAcceptance, false);
  assert.equal(result.coverage, 'expanded-public-wheel-ship-coverage');
  assert.deepEqual(f.events, ['Runtime.evaluate', 'default-screenshot',
    ...Array(5).fill('Input.dispatchMouseEvent'), 'Runtime.evaluate']);
  f.state.render.camera.projectionMatrix.elements[0] = 999;
  assert.notEqual(result.defaultView.view.projectionMatrix[0], 999, 'original camera observation is detached');
  assert.equal(f.state.entityList.length, 1, 'actor never injects a population');
});

test('blocked wheel input fails setup while retaining original view, rather than assuming coverage zoom', async () => {
  const f = coverageInputFixture({ blocked: true });
  await assert.rejects(establishAuthoredShipCoverageView(f.cdp, f), error => {
    assert.match(error.message, /actually establish/);
    assert.equal(error.authoredShipCoverageView.defaultView.view.requestedZoom, 144);
    assert.equal(error.authoredShipCoverageView.requestedCoverageView.view.requestedZoom, 144);
    return true;
  });
});

test('unsafe default view fails before screenshot or wheel input', async () => {
  const f = coverageInputFixture({ unsafe: true });
  await assert.rejects(establishAuthoredShipCoverageView(f.cdp, f), /must not present unauthored/);
  assert.deepEqual(f.events, ['Runtime.evaluate']);
});

test('coverage setup consumes the original admission allowance without resetting the CDP deadline', async () => {
  let now = 0;
  const stages = [];
  const cdp = { setStage: (...args) => stages.push(args), send() { assert.fail('no post-deadline page calls'); } };
  await assert.rejects(waitForAuthoredShips(cdp, { now: () => now, admissionTimeoutMs: 100,
    prepareCoverageView: async () => { now = 100; } }), error => {
    assert.match(error.message, /original admission deadline/);
    assert.equal(error.authoredShipDiagnostics.elapsedMs, 100);
    assert.equal(error.authoredShipDiagnostics.operation, 'coverage-view-setup');
    return true;
  });
  assert.deepEqual(stages, [['authored ship admission', 100]]);
});

test('coverage setup preserves original errors and reports explicitly different screenshot views', async () => {
  const original = new Error('public input failed');
  await assert.rejects(waitForAuthoredShips({ setStage() {} }, {
    prepareCoverageView: async () => { throw original; },
  }), error => error === original);
  assert.match(source, /defaultViewScreenshot: artifactFileEvidence\(DEFAULT_SHOT\)/);
  assert.match(source, /screenshotView: 'expanded-public-wheel-ship-coverage'/);
  assert.match(source, /injectedState: true/);
});


test('hidden pending player retains first default snapshot and becomes ready before wheel input', async () => {
  const f = coverageInputFixture({ unsafe: true });
  const root = f.state.entityList[0].mesh;
  root.visible = false;
  let now = 0;
  const result = await establishAuthoredShipCoverageView(f.cdp, { ...f, now: () => now,
    deadlineMs: 100, sleep: async ms => {
      assert.ok(!f.events.includes('Input.dispatchMouseEvent'));
      now += ms; root.userData.authoredAssetState = 'authored'; root.visible = true;
    } });
  assert.equal(result.firstDefaultView.playerState, 'loading');
  assert.equal(result.firstDefaultView.presentedShipCount, 0);
  assert.equal(result.defaultView.playerState, 'authored');
  assert.equal(result.acknowledgedWheelInputs, 5);
  assert.equal(result.cameraConvergenceUnmeasured, true);
});

test('hidden pending player timeout preserves default evidence and never wheels', async () => {
  const f = coverageInputFixture({ unsafe: true });
  f.state.entityList[0].mesh.visible = false;
  let now = 0;
  await assert.rejects(establishAuthoredShipCoverageView(f.cdp, { ...f, now: () => now,
    deadlineMs: 100, sleep: async ms => { now += ms; } }), error => {
    assert.match(error.message, /original admission deadline/);
    assert.equal(error.authoredShipCoverageView.firstDefaultView.playerState, 'loading');
    return true;
  });
  assert.equal(now, 100);
  assert.ok(!f.events.includes('Input.dispatchMouseEvent'));
  assert.ok(!f.events.includes('default-screenshot'));
});
