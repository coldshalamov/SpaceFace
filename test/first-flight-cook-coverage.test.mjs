import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  isEntityAuthoredUpgradeRelevant,
  isEntityRenderRelevant,
} from '../src/render/renderer.js';

const RENDERER_SOURCE = readFileSync(
  new URL('../src/render/renderer.js', import.meta.url), 'utf8',
);

// PQ-210.02 — the first-flight residency hold parks ordinary mesh streaming for the
// first ~20 sim-seconds of flight, then releases the deferred tail inside presented
// frames. The live-sector cook must therefore cover the same presentation set the
// post-hold reconcile builds, or the burst survives as in-flight mesh builds, program
// links, and buffer uploads.

function makeLoadingState(extra = {}) {
  const player = { id: 1, type: 'ship', alive: true, isPlayer: true, pos: { x: 0, z: 0 } };
  return {
    mode: 'loading',
    playerId: 1,
    simTime: 0,
    entities: new Map([[1, player]]),
    camera: { zoom: 144 },
    render: {},
    world: { currentSectorId: 'sector_helios_prime' },
    ...extra,
  };
}

test('loading authored-upgrade relevance honours the widened first-flight set', () => {
  const wreck = { id: 42, type: 'wreck', alive: true, pos: { x: 60, z: 0 }, data: {} };
  // Not on the opening table and no widened set published: stays deferred.
  const closed = makeLoadingState();
  assert.equal(isEntityAuthoredUpgradeRelevant(wreck, closed), false);
  // Published into liveSectorFirstFlightIds by the widened cook: must request its
  // authored body while the upgrade queue is resumed behind the shell.
  const widened = makeLoadingState({
    render: { liveSectorFirstFlightIds: new Set([42]) },
  });
  assert.equal(isEntityAuthoredUpgradeRelevant(wreck, widened), true);
  // A far entity the widening did not publish still must not upgrade during loading.
  const far = { id: 77, type: 'wreck', alive: true, pos: { x: 9000, z: 9000 }, data: {} };
  assert.equal(isEntityAuthoredUpgradeRelevant(far, widened), false);
});

test('shell-gated relevance admits published widened ids and nothing else', () => {
  const player = { id: 1, type: 'ship', alive: true, isPlayer: true, pos: { x: 0, z: 0 } };
  const drone = { id: 5, type: 'drone', alive: true, pos: { x: 30, z: 0 }, data: {} };
  const outsider = { id: 6, type: 'wreck', alive: true, pos: { x: 30, z: 0 }, data: {} };
  const state = {
    mode: 'flight',
    playerId: 1,
    simTime: 4,
    entities: new Map([[1, player], [5, drone], [6, outsider]]),
    camera: { zoom: 144 },
    render: { sectorShellAdmission: true, liveSectorFirstFlightIds: new Set([1, 5]) },
  };
  assert.equal(isEntityRenderRelevant(drone, state), true);
  assert.equal(isEntityRenderRelevant(outsider, state), false);
});

test('the cook widens from the same presentation set the reconcile drains', () => {
  const prepareStart = RENDERER_SOURCE.indexOf('state.render.prepareLiveSectorBeforeFlight = async');
  const cookStart = RENDERER_SOURCE.indexOf('state.render.cookLiveSceneGpu = async');
  assert.ok(prepareStart > 0 && cookStart > prepareStart);
  const block = RENDERER_SOURCE.slice(prepareStart, cookStart);
  // The widening must run the reconcile's own collection + policy, not a second list.
  assert.match(block, /collectMeshPresentationEntities\(state, presentation\)/);
  assert.match(block, /bypassShellGates:\s*true/);
  // Field-rock records stay on their own coverage contract (variant cap + pool).
  assert.match(block, /entity\.type === 'asteroid'\) continue/);
  // Survival keeps its existing whole-arena path; the widening must not double-run.
  assert.match(block, /!recook && !survivalRunHoldsArena\(state\)/);
});
