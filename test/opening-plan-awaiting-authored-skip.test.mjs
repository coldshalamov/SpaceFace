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
import { collectOpeningEntityRootCandidates, collectOpeningShadowCasterRootCandidates } from '../src/render/runtime/openingAdmissionPlanning.js';
import { buildAuthoredPlaceProp } from '../src/render/partsLibrary.js';

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

test('a collidable geology fallback enters the opening census while its authored replacement waits', () => {
  const scene = new THREE.Group();
  const rock = {
    id: 'cover', type: 'asteroid', radius: 25, collides: true, alive: true,
    data: {
      typeId: 'ast_common_rock', authoredGeologySkin: true,
      placeId: 'place_rock_silicate_monolith', placeTargetRadius: 25,
    },
  };
  const fallback = new THREE.Group();
  const body = stampedMesh('geology-body');
  body.castShadow = true;
  fallback.add(body);
  const boundary = buildAuthoredPlaceProp(rock, { releaseMode: true, fallbackRoot: fallback });
  scene.add(boundary);
  const meshes = new Map([[rock.id, boundary]]);
  const entities = new Map([[rock.id, rock]]);
  const camera = { frustum: { intersectsObject() { return true; } } };
  const options = { scene, camera };

  assert.equal(boundary.userData.authoredAssetState, 'awaiting-authored-admission');
  assert.deepEqual(collectOpeningSubmissionLeaves(boundary, { camera }), [body]);
  assert.deepEqual(collectOpeningEntityRootCandidates(meshes, entities, options)
    .map((candidate) => candidate.root.uuid), [boundary.uuid]);
  assert.deepEqual(collectOpeningShadowCasterRootCandidates(meshes, entities, options)
    .map((candidate) => candidate.root.uuid), [boundary.uuid]);

  // The worker's presentation mirror omits the simulation-only collision boolean.
  delete rock.collides;
  assert.deepEqual(collectOpeningEntityRootCandidates(meshes, entities, options)
    .map((candidate) => candidate.root.uuid), [boundary.uuid]);

  rock.collides = false;
  assert.deepEqual(collectOpeningEntityRootCandidates(meshes, entities, options), []);

  delete rock.collides;
  fallback.visible = false;
  assert.deepEqual(collectOpeningEntityRootCandidates(meshes, entities, options), []);
  assert.deepEqual(collectOpeningShadowCasterRootCandidates(meshes, entities, options), []);
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
