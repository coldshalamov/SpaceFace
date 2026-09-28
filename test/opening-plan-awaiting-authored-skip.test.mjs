import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  collectOpeningSubmissionLeaves,
  createOpeningSubmissionPlan,
  createOpeningProducerCensus,
  combineOpeningProducerCensuses,
  stampOpeningSubmissionPackage,
} from '../src/render/openingSubmissionPlan.js';
import {
  collectOpeningEntityRootCandidates,
  collectOpeningShadowCasterRootCandidates,
} from '../src/render/renderer.js';

function stampedMesh(name) {
  const material = new THREE.MeshStandardMaterial({ name: `${name}-mat` });
  material.userData.openingProgramSubjectKey = `prog:${name}`;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.name = name;
  stampOpeningSubmissionPackage(mesh, {
    schema: 'spaceface.testProducer.v1',
    producer: 'test',
    name,
  }, { producer: 'test', assetId: name });
  return mesh;
}

test('resolving-marker meshes are not opening submission leaves', () => {
  const root = new THREE.Group();
  root.name = 'ship_wasp_DirectAuthoredAdmission';
  const marker = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ name: 'marker' }),
  );
  marker.name = 'AuthoredResolvingMarker';
  marker.userData.authoredResolvingMarker = true;
  root.add(marker);
  assert.equal(collectOpeningSubmissionLeaves(root).length, 0);
});

test('awaiting-authored entity roots do not enter the opening entity census', () => {
  const scene = new THREE.Group();
  const player = stampedMesh('player-root');
  scene.add(player);

  const ready = stampedMesh('ready-ship');
  scene.add(ready);

  const awaiting = new THREE.Group();
  awaiting.name = 'ship_wasp_DirectAuthoredAdmission_AuthoredAssetBoundary';
  awaiting.userData.authoredAssetState = 'awaiting-authored-admission';
  const marker = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.4, 1),
    new THREE.MeshBasicMaterial({ name: 'marker' }),
  );
  marker.userData.authoredResolvingMarker = true;
  marker.castShadow = true;
  awaiting.add(marker);
  scene.add(awaiting);

  const meshes = new Map([
    ['player', player],
    ['ready', ready],
    ['wasp', awaiting],
  ]);
  const entities = new Map([
    ['player', { type: 'ship', alive: true }],
    ['ready', { type: 'ship', alive: true }],
    ['wasp', { type: 'ship', alive: true }],
  ]);
  const camera = {
    frustum: { intersectsObject() { return true; } },
    layers: { test() { return true; } },
  };

  const candidates = collectOpeningEntityRootCandidates(meshes, entities, {
    playerId: 'player',
    scene,
    camera,
  });
  assert.deepEqual(candidates.map((c) => c.root.name), ['ready-ship']);

  const shadow = collectOpeningShadowCasterRootCandidates(meshes, entities, {
    playerId: 'player',
    scene,
    camera,
    alreadyIncluded: candidates.map((c) => c.root),
  });
  assert.equal(shadow.length, 0, 'awaiting authored markers must not enter shadow census');
});

test('opening plan completes when only stamped production roots remain after skipping awaiting authored', () => {
  const player = stampedMesh('player-root');
  const ready = stampedMesh('ready-ship');
  const route = { shadow: false, target: 'screen' };
  const candidates = [
    {
      root: player,
      role: 'player',
      startupRole: 'player-flight-package',
      blocking: true,
      reason: 'player-control-and-first-picture-identity',
      includeOffscreen: true,
    },
    {
      root: ready,
      role: 'opening-entity-root',
      startupRole: 'first-picture-entity-root',
      blocking: true,
      reason: 'currently-visible-first-picture-entity-root',
    },
  ];
  const producer = combineOpeningProducerCensuses(candidates.map((candidate) => (
    createOpeningProducerCensus(candidate.root, {
      includeOffscreen: candidate.includeOffscreen === true,
      route,
    })
  )));
  const plan = createOpeningSubmissionPlan({
    candidates,
    route: 'native',
    shadows: false,
    globalProgramKeys: producer.globalProgramKeys,
    openingProgramKeys: producer.openingProgramKeys,
    requiredContentHashes: producer.requiredContentHashes,
    contentHashVerified: producer.contentHashesVerified,
    producerCensus: producer,
    producerResourceIdentitySets: producer.resourceIdentitySets,
  });
  assert.equal(plan.complete, true, `plan incomplete: ${JSON.stringify(plan.blockingReasons)}`);
});
