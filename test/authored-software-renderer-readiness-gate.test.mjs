import assert from 'node:assert/strict';
import test from 'node:test';

// Regression for the startup readiness gate failing closed on software-rendered (SwiftShader/
// llvmpipe) WebGL. authoredCriticalVisualReadiness previously gated flight on the FULL opening
// composition (every nearby NPC ship + station FX within the immediate radius), which a software
// renderer pushes through a serial admission queue with no KHR_parallel_shader_compile and cannot
// finish inside the 90s startup deadline. The player and the critical starting hub are admitted
// first and compose quickly; on a positively-detected software renderer the gate now narrows to
// player + hub only, while real hardware (and unknown/missing tier) keep the strict full-opening-set
// contract so fail-closed still holds. Default visual quality is unchanged: the relaxed actors still
// upgrade to authored after the first flight frame.
import * as partsLibrary from '../src/render/partsLibrary.js';

function makeEntity({ id, type = 'ship', status = 'missing', isPlayer = false, pos = null, data = {} }) {
  return {
    id,
    type,
    isPlayer,
    alive: true,
    pos,
    data,
    mesh: { userData: { authoredAssetState: status } },
  };
}

function buildState({ tier, playerStatus = 'authored', hubStatus = 'authored', npcStatuses = ['loading', 'loading'] }) {
  const player = makeEntity({ id: 'player', type: 'ship', status: playerStatus, isPlayer: true, pos: { x: 0, z: 0 } });
  // Critical starting hub: no pos so isInitialAuthoredCompositionEntity resolves via the criticalHub
  // path, matching how the live Helios hub enters the opening composition.
  const hub = makeEntity({ id: 'station_helios', type: 'station', status: hubStatus });
  const npcs = npcStatuses.map((status, index) => makeEntity({
    id: `npc-${index}`,
    type: 'ship',
    status,
    pos: { x: 100 + index * 10, z: 0 },
  }));
  const entityList = [player, hub, ...npcs];
  const state = {
    playerId: 'player',
    entityList,
    entities: new Map(entityList.map((entity) => [entity.id, entity])),
    world: { currentSectorId: 'sector_helios_prime' },
  };
  if (tier !== undefined) state.render = { gpu: { tier } };
  return state;
}

test('software renderer: gate clears once only the player + hub are ready, with traffic still loading', () => {
  const state = buildState({ tier: 'software' });
  const readiness = partsLibrary.authoredCriticalVisualReadiness(state);

  assert.equal(readiness.softwareRenderer, true, 'software tier must be reported');
  assert.equal(readiness.pipelineReady, true,
    'software gate must not wait for nearby traffic still in the admission queue');
  assert.equal(readiness.ready, true,
    'software gate must enter flight once the player and hub are authored');
  // Diagnostics still describe reality: the two NPCs have not yet staged.
  assert.equal(readiness.openingPipelinePending.length, 2,
    'pending opening actors remain visible for diagnostics even when the gate is relaxed');
});

test('software renderer: fail-closed still holds while the player is not ready', () => {
  const state = buildState({ tier: 'software', playerStatus: 'loading' });
  const readiness = partsLibrary.authoredCriticalVisualReadiness(state);

  assert.equal(readiness.pipelineReady, false, 'an unready player must always block flight');
  assert.equal(readiness.ready, false, 'an unready player must always block flight');
});

test('software renderer: the critical starting hub is still required', () => {
  const state = buildState({ tier: 'software', hubStatus: 'loading' });
  const readiness = partsLibrary.authoredCriticalVisualReadiness(state);

  assert.equal(readiness.startingHubRequired, true);
  assert.equal(readiness.pipelineReady, false, 'the critical hub must still stage before flight');
  assert.equal(readiness.ready, false, 'the critical hub must still be authored before flight');
});

test('hardware renderer: the full opening set still gates flight (no weakening on real hardware)', () => {
  const state = buildState({ tier: 'discrete' });
  const readiness = partsLibrary.authoredCriticalVisualReadiness(state);

  assert.equal(readiness.softwareRenderer, false);
  assert.equal(readiness.pipelineReady, false,
    'hardware gate must keep waiting for the whole opening composition to stage');
  assert.equal(readiness.ready, false,
    'hardware gate must keep waiting for the whole opening composition to be authored');
});

test('unknown or missing GPU tier keeps the strict contract (fail-closed default)', () => {
  // No state.render at all — the path a state object takes before the renderer publishes gpu, and any
  // privacy-hardened context where detection returns 'unknown'.
  const state = buildState({});
  const readiness = partsLibrary.authoredCriticalVisualReadiness(state);

  assert.equal(readiness.softwareRenderer, false);
  assert.equal(readiness.pipelineReady, false,
    'unknown tier must keep the strict full-opening-set gate');
  assert.equal(readiness.ready, false);
});

test('hardware gate clears once the full opening set stages, proving the relaxation is software-only', () => {
  const state = buildState({ tier: 'discrete', npcStatuses: ['compiling-pipelines', 'authored'] });
  const readiness = partsLibrary.authoredCriticalVisualReadiness(state);

  // compiling-pipelines + authored both satisfy authoredPipelineStaged; authored is the only one
  // that satisfies the committed `ready` gate, so the second NPC pins ready true and the first
  // (compiling-pipelines) leaves ready false until it resolves.
  assert.equal(readiness.pipelineReady, true, 'all opening actors staged must clear the hardware gate');
  assert.equal(readiness.ready, false, 'a compiling-pipelines actor is not yet committed authored');
});
