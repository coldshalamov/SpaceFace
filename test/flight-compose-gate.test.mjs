import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  mayComposeAuthoredShipLive,
  settleAuthoredShipToProceduralFallback,
  shouldAutoTriggerAuthoredUpgrade,
} from '../src/render/partsLibrary.js';
import { PRESENTATION_ADMISSION } from '../src/core/presentationAdmission.js';

test('flight mode blocks live ship composition unless sector-prewarm/deferred', () => {
  const flight = { mode: 'flight' };
  assert.equal(mayComposeAuthoredShipLive({}, flight), false);
  assert.equal(mayComposeAuthoredShipLive({ residencyRole: 'current-sector' }, flight), false);
  assert.equal(mayComposeAuthoredShipLive({ residencyRole: 'player' }, flight), false);
  assert.equal(mayComposeAuthoredShipLive({ deferBoundaryPublication: true }, flight), true);
  assert.equal(mayComposeAuthoredShipLive({ residencyRole: 'sector-prewarm' }, flight), true);
  assert.equal(mayComposeAuthoredShipLive({ residencyRole: 'sector-prepared-boundary' }, flight), true);
  assert.equal(mayComposeAuthoredShipLive({}, { mode: 'loading' }), true);
  assert.equal(mayComposeAuthoredShipLive({}, null), true);
});

test('settling a gated flight upgrade unhides the procedural substrate', () => {
  const boundary = new THREE.Group();
  boundary.userData.renderContract = { gracefulFallback: false };
  const fallback = new THREE.Group();
  fallback.visible = false;
  boundary.add(fallback);
  const entity = { id: 9, presentationAdmission: PRESENTATION_ADMISSION.pending };
  let active = null;

  assert.equal(
    settleAuthoredShipToProceduralFallback(
      boundary,
      fallback,
      entity,
      (next) => { active = next; },
      'flight-compose-gated',
    ),
    true,
  );
  assert.equal(fallback.visible, true);
  assert.equal(active, fallback);
  assert.equal(boundary.userData.authoredAssetState, 'procedural-settled');
  assert.equal(boundary.userData.authoredComposeDeferredReason, 'flight-compose-gated');
  assert.equal(boundary.userData.renderContract.gracefulFallback, true);
  assert.equal(entity.presentationAdmission, PRESENTATION_ADMISSION.ready);
});

test('hostile team membership alone does not auto-compose in flight', () => {
  const scene = new THREE.Scene();
  const hostile = { id: 3, alive: true, team: 1, mesh: new THREE.Group() };
  hostile.mesh.visible = false;
  const liveState = {
    mode: 'flight',
    render: { scene, camera: null },
    player: { targetId: null },
  };
  assert.equal(shouldAutoTriggerAuthoredUpgrade(hostile, scene, liveState), false);

  liveState.player.targetId = 3;
  assert.equal(shouldAutoTriggerAuthoredUpgrade(hostile, scene, liveState), true);
});
