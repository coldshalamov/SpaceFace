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
  // Player boundary is empty until the real authored body commits; mid-flight player composition
  // must stay allowed so the real ship can finish loading (no junk stand-in).
  assert.equal(mayComposeAuthoredShipLive({ residencyRole: 'player' }, flight), true);
  assert.equal(mayComposeAuthoredShipLive({ deferBoundaryPublication: true }, flight), true);
  assert.equal(mayComposeAuthoredShipLive({ residencyRole: 'sector-prewarm' }, flight), true);
  assert.equal(mayComposeAuthoredShipLive({ residencyRole: 'sector-prepared-boundary' }, flight), true);
  assert.equal(mayComposeAuthoredShipLive({}, { mode: 'loading' }), true);
  assert.equal(mayComposeAuthoredShipLive({}, null), true);
});

test('empty direct-admission slots compose in flight the same way the player does', () => {
  const flight = { mode: 'flight' };
  // Live ships mount a zero-draw ownership slot. Treating that empty group as a finished
  // "procedural fallback" leaves targeting rings around blank space. The player exception
  // exists for this exact contract; NPC/enemy slots use the same substrate.
  assert.equal(mayComposeAuthoredShipLive({
    residencyRole: 'current-sector',
    emptyAdmissionSubstrate: true,
  }, flight), true);
  const emptyRoot = new THREE.Group();
  emptyRoot.userData.authoredAdmissionSubstrate = true;
  assert.equal(mayComposeAuthoredShipLive({
    residencyRole: 'current-sector',
    fallbackRoot: emptyRoot,
  }, flight), true);
});

test('settling a gated flight upgrade unhides the existing substrate only', () => {
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

test('settling an empty admission substrate does not pretend a hull exists', () => {
  const boundary = new THREE.Group();
  boundary.userData.renderContract = { gracefulFallback: false };
  const fallback = new THREE.Group();
  fallback.visible = false;
  fallback.userData.authoredAdmissionSubstrate = true;
  boundary.add(fallback);
  const entity = { id: 11, presentationAdmission: PRESENTATION_ADMISSION.pending };

  assert.equal(
    settleAuthoredShipToProceduralFallback(
      boundary,
      fallback,
      entity,
      () => {},
      'flight-compose-gated',
    ),
    false,
  );
  assert.equal(fallback.visible, false);
  assert.notEqual(boundary.userData.authoredAssetState, 'procedural-settled');
  assert.equal(entity.presentationAdmission, PRESENTATION_ADMISSION.pending);
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
