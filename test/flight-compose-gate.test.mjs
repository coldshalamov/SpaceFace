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
  // Player uses a zero-draw direct-admission substrate; mid-flight player composition must stay
  // allowed so the pilot never settles to an empty hull with thrusters still firing.
  assert.equal(mayComposeAuthoredShipLive({ residencyRole: 'player' }, flight), true);
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
  // Non-empty NPC substrate: settlement only needs to unhide, not synthesize a body.
  fallback.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
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

test('settling an empty player substrate synthesizes a readable emergency hull', () => {
  const boundary = new THREE.Group();
  boundary.userData.renderContract = { gracefulFallback: false };
  const empty = new THREE.Group();
  empty.name = 'DirectAuthoredAdmission';
  empty.visible = false;
  empty.userData.authoredAdmissionSubstrate = true;
  boundary.add(empty);
  const entity = {
    id: 1,
    isPlayer: true,
    type: 'ship',
    radius: 14,
    data: { defId: 'ship_kestrel' },
    presentationAdmission: PRESENTATION_ADMISSION.pending,
  };
  let active = null;

  assert.equal(
    settleAuthoredShipToProceduralFallback(
      boundary,
      empty,
      entity,
      (next) => { active = next; },
      'authored-swap-failed',
    ),
    true,
  );
  assert.ok(active && active !== empty, 'player must leave the zero-draw substrate');
  assert.equal(active.visible, true);
  let drawables = 0;
  active.traverse((object) => {
    if (object.isMesh || object.isLine || object.isPoints || object.isSprite) drawables += 1;
  });
  assert.ok(drawables > 0, 'emergency player hull must have something to draw');
  assert.equal(boundary.userData.authoredAssetState, 'procedural-settled');
  assert.equal(boundary.userData.authoredVisualRoot, 'emergency-readable-fallback');
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
