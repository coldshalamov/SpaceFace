import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { shouldFreezeFlightSubmit } from '../src/core/presentationFreeze.js';
import {
  holdFirstFlightStreaming,
  isEntityRenderRelevant,
  reattachResidentGpuMeshes,
  serviceRenderMeshResidency,
} from '../src/render/renderer.js';

test('dock, screen stack, and sector-shell cook freeze 3D submit', () => {
  assert.equal(shouldFreezeFlightSubmit({ ui: { docked: true, screenStack: [] } }), true);
  assert.equal(shouldFreezeFlightSubmit({ ui: { docked: false, screenStack: ['map'] } }), true);
  assert.equal(shouldFreezeFlightSubmit({
    ui: { docked: false, screenStack: [] },
    render: { sectorShellAdmission: true },
  }), true);
  assert.equal(shouldFreezeFlightSubmit({
    ui: { docked: false, screenStack: [] },
    jump: { state: 'JUMPING' },
    render: {},
  }), false);
  assert.equal(shouldFreezeFlightSubmit({
    ui: { docked: false, screenStack: [] },
    render: {},
  }), false);
});

test('first-flight streaming hold keeps the cooked GPU set until the latch', () => {
  assert.equal(holdFirstFlightStreaming({ mode: 'flight', simTime: 10 }), true);
  assert.equal(holdFirstFlightStreaming({
    mode: 'flight',
    simTime: 12,
    render: { firstFlightResidencyHoldUntil: 20 },
  }), true);
  assert.equal(holdFirstFlightStreaming({
    mode: 'flight',
    simTime: 21,
    render: { firstFlightResidencyHoldUntil: 20 },
  }), false);
  assert.equal(holdFirstFlightStreaming({
    mode: 'flight',
    simTime: 2,
    render: { sectorShellAdmission: true },
  }), false);
  assert.equal(holdFirstFlightStreaming({ mode: 'loading', simTime: 0 }), false);
});

test('sector-shell admission only keeps the first-flight cook set relevant', () => {
  const player = { id: 1, type: 'ship', alive: true, isPlayer: true, pos: { x: 0, z: 0 } };
  const extra = { id: 9, type: 'wreck', alive: true, pos: { x: 40, z: 0 } };
  const state = {
    mode: 'flight',
    playerId: 1,
    simTime: 6,
    entities: new Map([[1, player], [9, extra]]),
    camera: { zoom: 144 },
    render: { sectorShellAdmission: true, liveSectorFirstFlightIds: new Set([1]) },
  };
  assert.equal(isEntityRenderRelevant(player, state), true);
  assert.equal(isEntityRenderRelevant(extra, state), false);
});

test('residency service reports the first-flight hold and clears a banked full scan', () => {
  const owner = {
    state: { mode: 'flight', simTime: 8, render: { firstFlightResidencyHoldUntil: 20 } },
    _deferNoncriticalMeshStreaming: false,
    _sectorHandoffStreamHoldS: 0,
    _meshReconcileDirty: true,
    _renderResidencyPollS: 0,
  };
  assert.equal(serviceRenderMeshResidency(owner, 0.5), 'held-first-flight');
  assert.equal(owner._meshReconcileDirty, false);
});

test('same-sector F9 recook keeps resident GPU meshes', () => {
  const owner = {
    _sessionRecookKeepGpu: true,
    _deferNoncriticalMeshStreaming: true,
    _meshReconcileDirty: true,
    state: { mode: 'loading' },
  };
  assert.equal(serviceRenderMeshResidency(owner, 0.5), 'session-recook-keep-gpu');
  assert.equal(owner._meshReconcileDirty, false);
});

test('same-sector F9 recook reattaches GPU meshes onto restored entities', () => {
  const mesh = { userData: { authoredAssetState: 'authored' } };
  const entity = { id: 1, type: 'ship', alive: true };
  const owner = {
    _meshes: new Map([[1, mesh]]),
    state: { entities: new Map([[1, entity]]) },
    bound: 0,
    _bindPresentationMesh() { this.bound += 1; },
  };
  assert.equal(reattachResidentGpuMeshes(owner), 1);
  assert.equal(entity.mesh, mesh);
  assert.equal(entity.view.root, mesh);
  assert.equal(owner.bound, 1);
});

test('intentional sector enter cooks the live next scene behind the jump shell', async () => {
  const renderer = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const freeze = await readFile(new URL('../src/core/presentationFreeze.js', import.meta.url), 'utf8');
  assert.match(renderer, /holdAuthoredUpgradeQueueForFirstFlight/);
  assert.match(renderer, /prepareLiveSectorAfterJump/);
  assert.match(renderer, /jump-hold-leftover-fx/);
  assert.match(renderer, /headed sector-entry run70/);
  assert.match(renderer, /holdLeftoverFx/);
  assert.match(renderer, /sectorShellAdmission = true/);
  assert.match(renderer, /live-scene-cook-owns-next-sector/);
  assert.match(renderer, /collectFirstFlightLayerDrawables/);
  assert.match(renderer, /restLiveFlightEffectsAfterCook/);
  assert.match(renderer, /Nearby opening ships first-drew mule\/wasp LOD0/);
  assert.match(renderer, /entity.type === 'wreck'/);
  assert.match(renderer, /Leftover FX compiles \(entity:fx:77\/80\/81\) must finish behind the shell/);
  assert.match(renderer, /timeoutMs: Math.min\(8000, remainingMs\(\)\)/);
  assert.match(renderer, /F9 rematerializes the sector while the previous flight's meshes still/);
  assert.match(renderer, /webgl-context-lost-during-live-sector-cook/);
  assert.match(renderer, /session-recook-hold-leftover-fx/);
  assert.match(renderer, /session-recook-keep-gpu/);
  assert.match(renderer, /next present an opening first-draw that compiled 37 extra programs/);
  assert.match(renderer, /restored hulls showed status missing/);
  assert.match(renderer, /yieldAfterPresent/);
  assert.match(renderer, /meshNeedsAuthoredDecode/);
  assert.match(renderer, /reattachResidentGpuMeshes/);
  assert.match(renderer, /headed reattach run68 TDR/);
  assert.match(renderer, /loading-sector-prewarm-reset/);
  assert.doesNotMatch(renderer, /session-recook-opening-buffers/);
  assert.match(renderer, /session-recook-visuals-already-ready/);
  assert.match(renderer, /hulls-only-hold-leftover-fx/);
  assert.match(renderer, /1x1 of firstFlightRoots on F9 TDR'd Intel/);
  assert.match(renderer, /session-recook-skip-bloom-touch/);
  assert.match(renderer, /holdLoadingGpu/);
  assert.match(renderer, /Re-uploading rocks, 47-A, and instance pools TDR'd Intel/);
  assert.match(renderer, /resumeAuthoredUpgradeQueueForLoadingHulls/);
  assert.match(renderer, /hullsOnly: true/);
  const parts = await readFile(new URL('../src/render/partsLibrary.js', import.meta.url), 'utf8');
  assert.match(parts, /resumeAuthoredUpgradeQueueForLoadingHulls/);
  assert.match(parts, /loadingHullsOnly/);
  assert.match(parts, /keep leftover entity:fx compiles held/);
  const vfx = await readFile(new URL('../src/render/vfx.js', import.meta.url), 'utf8');
  assert.match(vfx, /warmupLiveFlightEffectsForLoading/);
  assert.match(vfx, /Walk the nozzle so the snake has real buffers/);
  assert.match(vfx, /particleQuality === 'med' \? 'medium' : particleQuality/);
  assert.match(vfx, /createRibbonTrail\(this\._scene/);
  assert.match(vfx, /restLiveFlightEffectsAfterCook/);
  assert.doesNotMatch(renderer, /includeGlobalPipelines:\s*true/);
  assert.doesNotMatch(renderer, /precompilePipelines\(/);
  assert.doesNotMatch(renderer, /precompileGlobalPipelines\(/);
  assert.match(renderer, /method: 'live-scene-restore'/);
  assert.match(renderer, /restored hulls at loading:promise/);
  assert.match(freeze, /sectorShellAdmission/);
});
