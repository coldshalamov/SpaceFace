import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMorrowVisual } from '../src/render/characters/morrowModel.js';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { authoredCriticalVisualReadiness, isInitialAuthoredCompositionEntity } from '../src/render/partsLibrary.js';
import { morrowEntitySpec } from '../src/systems/morrow.js';

function openingState(contacts) {
  const player = {
    id: 1, type: 'ship', alive: true, isPlayer: true, maxSpeed: 174,
    pos: { x: 0, z: 0 },
    mesh: { userData: { authoredAssetState: 'authored' } },
  };
  const entityList = [player, ...contacts];
  return {
    mode: 'loading', playerId: player.id, simTime: 0,
    entityList, entities: new Map(entityList.map((entity) => [entity.id, entity])),
    camera: { zoom: 144 }, render: {},
    world: { currentSectorId: 'sector_helios_prime' },
  };
}

function morrowContact() {
  const entity = { ...morrowEntitySpec(), id: 348, alive: true };
  entity.mesh = buildMorrowVisual(entity);
  return entity;
}

// The ordinary drone's diagnostic substrate paints hull panels to canvas even in a
// CPU-only factory test. Keep real packaged-boundary construction, with no silent fallback.
function canvasDocument() {
  const context = {
    fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {},
    bezierCurveTo() {}, quadraticCurveTo() {}, fill() {}, stroke() {}, drawImage() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
    getImageData(_x, _y, width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
    putImageData() {}, measureText() { return { width: 10 }; },
  };
  return { createElement() {
    const canvas = { width: 256, height: 256, getContext: () => context, style: {} };
    context.canvas = canvas;
    return canvas;
  } };
}

test('the completed synchronous authored Morrow body releases its real startup role', () => {
  const morrow = morrowContact();
  try {
    const state = openingState([morrow]);
    assert.equal(isInitialAuthoredCompositionEntity(morrow, state), true);
    assert.equal(morrow.mesh.userData.morrow, true);
    assert.equal(morrow.mesh.userData.requestAuthoredUpgrade, undefined,
      'the character is already built and has no asynchronous replacement');
    const readiness = authoredCriticalVisualReadiness(state);
    assert.equal(readiness.pipelineReady, true,
      'completed character geometry must not wait forever on an absent asset load');
    assert.equal(readiness.ready, true);
    assert.equal(readiness.openingPending.length, 0);
    assert.equal(readiness.flightReady.roles.find((entry) => entry.metadata?.id === morrow.id)?.status,
      'authored', 'the character stays required and satisfies its role with the completed body');
  } finally {
    morrow.mesh.userData.disposeMorrow();
  }
});

test('a genuinely pending packaged drone still blocks alongside completed Morrow', () => {
  const morrow = morrowContact();
  const drone = {
    id: 359, type: 'drone', alive: true, team: 2, radius: 4,
    pos: { x: 100, z: 0 }, data: {},
  };
  const previousDocument = globalThis.document;
  const previousThrow = globalThis.__SF_VISUAL_FACTORY_THROW__;
  try {
    globalThis.document = canvasDocument();
    globalThis.__SF_VISUAL_FACTORY_THROW__ = true;
    drone.mesh = createVisualFactory().build(drone);
    assert.equal(typeof drone.mesh.userData.requestAuthoredUpgrade, 'function');
    const state = openingState([morrow, drone]);
    const pending = authoredCriticalVisualReadiness(state);
    assert.equal(pending.pipelineReady, false);
    assert.equal(pending.ready, false);
    assert.deepEqual(pending.flightReadyBlockers.map((entry) => entry.metadata?.id), [drone.id]);

    drone.mesh.userData.authoredAssetState = 'compiling-pipelines';
    const staged = authoredCriticalVisualReadiness(state);
    assert.equal(staged.pipelineReady, true);
    assert.equal(staged.ready, false, 'GPU preparation still owns the packaged body');

    drone.mesh.userData.authoredAssetState = 'authored';
    assert.equal(authoredCriticalVisualReadiness(state).ready, true);
  } finally {
    morrow.mesh.userData.disposeMorrow();
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousThrow === undefined) delete globalThis.__SF_VISUAL_FACTORY_THROW__;
    else globalThis.__SF_VISUAL_FACTORY_THROW__ = previousThrow;
  }
});
