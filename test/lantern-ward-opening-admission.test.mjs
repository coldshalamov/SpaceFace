import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LANTERN_WARD_ANCHOR, LANTERN_WARD_BODY_CONTRACTS, LANTERN_WARD_SECTOR,
} from '../src/data/lanternWardLayout.js';
import { lanternWardHardwareSpec } from '../src/data/lanternWardHardware.js';
import { materializeLanternWardDressing } from '../src/world/lanternWardDressing.js';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { installVisualOverrides } from '../src/render/visualOverrides.js';
import { ensureOpeningGeneratedScenarioPropPackage } from '../src/render/precompile.js';
import {
  collectOpeningSubmissionLeaves, combineOpeningProducerCensuses,
  contentHashForProducerManifest, createOpeningProducerCensus,
  createOpeningSubmissionPlan, openingProgramSubjectKey,
} from '../src/render/openingSubmissionPlan.js';

function wardEntities() {
  const hardware = ['cradle', 'lamp', 'receiver', 'obstruction', 'service_face', 'maintenance_part']
    .map((role, index) => ({ ...lanternWardHardwareSpec(role), id: 800 + index, occupantGeneration: 3 }));
  const state = { entities: new Map(), world: {} };
  // Materialize the actual Ward-owned scenery recipes; unrelated packaged kit props are omitted.
  materializeLanternWardDressing({ state, _spawnPlaceProp: () => null }, { id: LANTERN_WARD_SECTOR }, {
    pois: [{ poiId: LANTERN_WARD_ANCHOR, pos: { x: 1792, z: -640 } }], dressing: [],
  });
  return [...hardware, ...state.world.dressing.rows];
}

function wrappedRoots(t, entities = wardEntities()) {
  const factory = installVisualOverrides(createVisualFactory(), {
    releaseMode: true, directAuthoredMount: true, authoredWholeShipsOnly: true,
  });
  return entities.map(entity => {
    const before = JSON.stringify(entity);
    const root = factory.build(entity);
    assert.ok(root, `${entity.data.worldRecordId} builds through the installed wrapper`);
    assert.equal(root.userData.requestAuthoredUpgrade, undefined);
    t.after(() => root.userData.disposeLanternWardVisual?.());
    return { entity, root, before };
  });
}

function admission(rows) {
  const censuses = rows.map(({ root }) => createOpeningProducerCensus(root, { includeOffscreen: true }));
  const combined = combineOpeningProducerCensuses(censuses);
  const plan = createOpeningSubmissionPlan({
    candidates: rows.map(({ entity, root }) => ({ root, role: entity.data.lanternWardRole, includeOffscreen: true })),
    requiredContentHashes: combined.requiredContentHashes,
    globalProgramKeys: combined.globalProgramKeys,
    openingProgramKeys: combined.openingProgramKeys,
    producerCensus: combined,
    producerResourceIdentitySets: combined.resourceIdentitySets,
  });
  return { censuses, combined, plan };
}

const uniqueSorted = values => [...new Set(values)].sort();

function assertActualSubjects(rows, { censuses, combined, plan }) {
  const allLeaves = rows.flatMap(({ root }, index) => {
    const leaves = collectOpeningSubmissionLeaves(root, { includeOffscreen: true });
    const census = censuses[index];
    assert.ok(leaves.length > 0, `${root.name} has actual submitted geometry`);
    assert.deepEqual(census.drawLeafIds, leaves.map(leaf => `uuid:${leaf.uuid}`));
    assert.deepEqual(census.geometryBufferIds, uniqueSorted(leaves.map(leaf => `uuid:${leaf.geometry.uuid}`)));
    const programs = uniqueSorted(leaves.flatMap(leaf => (
      Array.isArray(leaf.material) ? leaf.material : [leaf.material]
    )).map(openingProgramSubjectKey));
    assert.deepEqual(census.programKeys.map(entry => entry.key).sort(), programs);
    for (const program of census.programKeys) {
      assert.equal(program.source, 'producer-material-subject');
      assert.equal(program.contentHash, census.contentHash);
    }
    return leaves;
  });
  assert.equal(plan.compileSubjects.length, allLeaves.length);
  allLeaves.forEach((leaf, index) => assert.equal(plan.compileSubjects[index], leaf));
  assert.deepEqual(plan.resourceIdentitySets.geometryBufferIds,
    uniqueSorted(allLeaves.map(leaf => `uuid:${leaf.geometry.uuid}`)));
  assert.deepEqual(plan.resourceIdentitySets, combined.resourceIdentitySets);
  assert.equal(plan.resourceIdentityCensusMatches, true);
  assert.ok(plan.roots.every(root => root.drawLeafCount > 0));
  assert.deepEqual(uniqueSorted(plan.programCompileSubjects.map(subject => subject.programSubjectKey)),
    uniqueSorted(combined.globalProgramKeys.map(entry => entry.key)));
}

test('all wrapped Ward bodies and shore variants earn canonical recipe admission with exact live subjects', t => {
  const rows = wrappedRoots(t);
  assert.deepEqual(uniqueSorted(rows.map(({ entity }) => entity.data.lanternWardRole)),
    uniqueSorted([...Object.keys(LANTERN_WARD_BODY_CONTRACTS), 'maintenance_part']));
  const packages = new Map();
  for (const { entity, root } of rows) {
    const contract = LANTERN_WARD_BODY_CONTRACTS[entity.data.lanternWardRole];
    const packageInfo = ensureOpeningGeneratedScenarioPropPackage(root);
    assert.ok(packageInfo, `${root.name} publishes its real generated recipe`);
    assert.equal(packageInfo.producer, 'visual-factory-procedural');
    assert.equal(packageInfo.contentHashVerified, true);
    assert.match(packageInfo.contentHash, /^[0-9a-f]{64}$/);
    assert.equal(packageInfo.contentHash, contentHashForProducerManifest(packageInfo.manifest));
    assert.equal(packageInfo.manifest.schema, 'spaceface.generatedVisualProducerManifest.v1');
    assert.ok(packageInfo.manifest.leaves.length > 0);
    assert.ok(Object.isFrozen(packageInfo.manifest));
    if (contract) {
      assert.equal(packageInfo.assetId, contract.assetId);
      assert.equal(root.userData.lanternWardAssetId, contract.assetId);
      assert.equal(root.userData.lanternWardVisualProducer, 'lantern-ward-authored-civic-v1');
      assert.equal(packageInfo.manifest.renderContract.source, 'src/render/lanternWardVisuals.js');
      assert.equal(packageInfo.manifest.renderContract.collisionSource, 'src/data/lanternWardLayout.js');
    }
    packages.set(root, packageInfo);
  }
  const ordinaryShore = rows.find(({ entity }) => entity.data.lanternWardRole === 'shore_spine'
    && !entity.data.lanternWardWhiteSide);
  const whiteShore = rows.find(({ entity }) => entity.data.lanternWardWhiteSide);
  assert.ok(ordinaryShore && whiteShore, 'actual scenery includes both shore palettes');
  assert.notEqual(packages.get(ordinaryShore.root).contentHash, packages.get(whiteShore.root).contentHash,
    'the real White Side recipe has its own content identity');

  for (const lod of ['lod0', 'lod1', 'lod2']) {
    for (const { entity, root, before } of rows) {
      root.userData.updateLod?.(lod);
      assert.equal(ensureOpeningGeneratedScenarioPropPackage(root), packages.get(root), 'ensure preserves the producer boundary');
      assert.equal(JSON.stringify(entity), before, 'admission never changes simulation or custody');
    }
    const result = admission(rows);
    assertActualSubjects(rows, result);
    assert.equal(result.combined.contentHashesVerified, true);
    assert.equal(result.plan.firstPlayablePipelineSet.complete, true);
    assert.equal(result.plan.complete, true, `${lod}: ${JSON.stringify(result.plan.blockingReasons)}`);
    assert.ok(result.plan.programCompileSubjects.every(subject => subject.contentHashVerified));
  }
});

for (const marker of ['lantern-ward-authored-civic-v1', null]) {
  test(`${marker || 'unmarked'} Ward roots remain blocked despite nonempty geometry and a matching resource census`, t => {
    const entities = wardEntities();
    const shores = entities.filter(entity => entity.data.lanternWardRole === 'shore_spine').slice(0, 2);
    const cheeks = entities.filter(entity => entity.data.lanternWardRole === 'service_cheek');
    const cradle = entities.find(entity => entity.data.lanternWardRole === 'cradle');
    const lamp = entities.find(entity => entity.data.lanternWardRole === 'lamp');
    const rows = wrappedRoots(t, [...shores, ...cheeks, cradle, lamp]);
    const missing = rows.slice(0, -1);
    for (const { root } of missing) {
      if (marker) root.userData.generatedVisualProducer = marker;
      else delete root.userData.generatedVisualProducer;
      assert.equal(ensureOpeningGeneratedScenarioPropPackage(root), null);
      assert.equal(root.userData.openingSubmissionPackage, undefined);
    }
    assert.ok(ensureOpeningGeneratedScenarioPropPackage(rows.at(-1).root));
    const result = admission(rows);
    assertActualSubjects(rows, result);
    assert.equal(result.plan.firstPlayablePipelineSet.complete, true,
      'other verified producers can make the program set complete without admitting these roots');
    assert.equal(result.plan.complete, false);
    assert.equal(result.plan.roots.filter(root => !root.productionBoundary.contentHashVerified).length, missing.length);
    assert.ok(result.plan.blockingReasons.some(entry => entry.reason === 'missing-or-unverified-blocking-content-hash'));
    assert.ok(result.censuses.slice(0, -1).every(census => !census.contentHashVerified && !census.contentHash));
  });
}
