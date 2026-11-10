// Boot (entering-flight) and Crucible fight-entry repeat work.
// Each opening read walks the graph, so a mesh revealed in that same turn is in the
// picture. The program-subject hash is reused only while the producer manifest is
// unchanged. A wave of the same wasp reuses one faction sample and one gun template.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  collectOpeningSubmissionLeaves,
  createOpeningProducerCensus,
  createOpeningSubmissionPlan,
  openingProgramSubjectKey,
  readOpeningSubmissionRepeatWork,
  resetOpeningSubmissionRepeatWork,
} from '../src/render/openingSubmissionPlan.js';
import { prefetchAuthoredAssetRequests } from '../src/render/partsLibrary.js';
import {
  makeEnemySpawnSpec,
  readEnemySpawnRepeatWork,
  resetEnemySpawnRepeatWork,
} from '../src/systems/combat.js';

function mesh(name) {
  const material = new THREE.MeshStandardMaterial({ name: `${name}-mat` });
  material.userData.openingProgramSubjectKey = `prog:${name}`;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  body.name = name;
  return body;
}

test('each opening read walks, and a reveal in that turn is in the picture', () => {
  resetOpeningSubmissionRepeatWork();
  const root = new THREE.Group();
  root.name = 'opening';
  const shown = mesh('shown');
  const hidden = new THREE.Group();
  hidden.visible = false;
  hidden.add(mesh('buried'));
  const nested = new THREE.Group();
  const inner = mesh('inner');
  nested.add(inner);
  root.add(shown, hidden, nested);

  const first = collectOpeningSubmissionLeaves(root, { includeOffscreen: true });
  const second = collectOpeningSubmissionLeaves(root, { includeOffscreen: true });
  const third = collectOpeningSubmissionLeaves(root, { includeOffscreen: true });
  assert.notEqual(second, first);
  assert.notEqual(third, first);
  assert.deepEqual(first.map((leaf) => leaf.name), ['shown', 'inner']);
  assert.deepEqual(second.map((leaf) => leaf.name), ['shown', 'inner']);
  assert.deepEqual(third.map((leaf) => leaf.name), ['shown', 'inner']);
  const afterRepeats = readOpeningSubmissionRepeatWork();
  assert.equal(afterRepeats.leafWalks, 3);
  assert.equal(afterRepeats.leafCacheHits, 0);

  const wide = {
    frustum: { intersectsObject: (object) => object.name !== 'inner' },
  };
  const culled = collectOpeningSubmissionLeaves(root, { camera: wide });
  assert.deepEqual(culled.map((leaf) => leaf.name), ['shown']);
  assert.equal(readOpeningSubmissionRepeatWork().leafWalks, 4);

  hidden.visible = true;
  const revealed = collectOpeningSubmissionLeaves(root, { includeOffscreen: true });
  assert.deepEqual(revealed.map((leaf) => leaf.name), ['shown', 'buried', 'inner']);
  assert.equal(readOpeningSubmissionRepeatWork().leafWalks, 5);
});

test('producer census and the opening plan hash each material once', () => {
  resetOpeningSubmissionRepeatWork();
  const root = new THREE.Group();
  const shared = new THREE.MeshStandardMaterial({ name: 'shared-hull' });
  shared.userData.openingProgramSubjectKey = 'prog:shared';
  for (let i = 0; i < 24; i += 1) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared);
    body.name = `leaf-${i}`;
    root.add(body);
  }
  const started = performance.now();
  collectOpeningSubmissionLeaves(root, { includeOffscreen: true });
  const census = createOpeningProducerCensus(root, { includeOffscreen: true });
  const plan = createOpeningSubmissionPlan({
    candidates: [{ root, includeOffscreen: true, blocking: true }],
    includeOffscreen: true,
  });
  const elapsedMs = performance.now() - started;
  const work = readOpeningSubmissionRepeatWork();
  assert.equal(work.leafWalks, 3, 'collect, census, and plan each walk so a same-turn reveal is seen');
  assert.equal(work.leafCacheHits, 0);
  assert.equal(work.subjectHashes, 1, '24 leaves share one material');
  assert.ok(work.subjectCacheHits >= 24, 'the plan must not rehash the census material');
  assert.equal(census.programKeys.length, 1);
  assert.equal(plan.drawLeaves.length, 24);
  assert.equal(openingProgramSubjectKey(shared), census.programKeys[0].key);
  assert.ok(elapsedMs < 2000, `opening plan of 24 leaves took ${elapsedMs} ms`);
});

test('a blend or driver-key change is a new opening program subject in the same turn', () => {
  resetOpeningSubmissionRepeatWork();
  const material = new THREE.MeshStandardMaterial({ name: 'stamp' });
  const before = openingProgramSubjectKey(material);
  material.blending = THREE.AdditiveBlending;
  const blended = openingProgramSubjectKey(material);
  assert.notEqual(blended, before);
  material.programCacheKey = 'driver-variant-a';
  const keyed = openingProgramSubjectKey(material);
  assert.notEqual(keyed, blended);
  material.fog = false;
  material.depthTest = false;
  material.vertexColors = true;
  material.lights = true;
  material.toneMapped = false;
  const surfaced = openingProgramSubjectKey(material);
  assert.notEqual(surfaced, keyed);
  assert.equal(openingProgramSubjectKey(material), surfaced);
  const work = readOpeningSubmissionRepeatWork();
  assert.equal(work.subjectHashes, 4);
  assert.equal(work.subjectCacheHits, 1);
});

test('a multi-file place prefetch keeps two loads in flight instead of summing them', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  let started = 0;
  const gates = [];
  const done = prefetchAuthoredAssetRequests(
    ['a', 'b', 'c', 'd'].map((url) => ({ url })),
    () => {
      started += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve) => {
        gates.push(() => {
          inFlight -= 1;
          resolve(true);
        });
      });
    },
  );
  assert.equal(started, 2);
  assert.equal(maxInFlight, 2);
  for (let guard = 0; guard < 8 && (started < 4 || inFlight > 0); guard += 1) {
    const release = gates.shift();
    assert.ok(release, 'a prefetch worker stalled');
    release();
    await Promise.resolve();
  }
  await done;
  assert.equal(started, 4);
  assert.equal(maxInFlight, 2);
  assert.equal(inFlight, 0);
});

test('a crucible wave reuses one faction sample and one gun template', () => {
  resetEnemySpawnRepeatWork();
  const count = 12;
  const specs = [];
  for (let i = 0; i < count; i += 1) {
    specs.push(makeEnemySpawnSpec('wasp_swarmer', 1, { x: i * 20, z: -260 }));
  }
  const work = readEnemySpawnRepeatWork();
  assert.equal(work.factionBehaviorBuilds, 1);
  assert.equal(work.factionBehaviorHits, count - 1);
  assert.equal(work.capabilityBuilds, 1);
  assert.equal(work.capabilityHits, count - 1);
  assert.equal(work.weaponTemplateBuilds, 1);
  assert.equal(work.weaponTemplateHits, count - 1);
  const firstGun = specs[0].data.weapons[0];
  const secondGun = specs[1].data.weapons[0];
  assert.notEqual(firstGun, secondGun);
  assert.equal(firstGun._cooldown, 0);
  assert.equal(secondGun._heat, 0);
  assert.equal(firstGun.dmg, secondGun.dmg);
  assert.notEqual(firstGun.muzzleOffset, secondGun.muzzleOffset);
  assert.equal(
    specs[0].data.ai.factionPresenceDoctrine,
    specs[11].data.ai.factionPresenceDoctrine,
  );
  assert.deepEqual(specs[0].data.ai.capabilities, specs[11].data.ai.capabilities);
  assert.notEqual(specs[0].pos, specs[1].pos);
});
