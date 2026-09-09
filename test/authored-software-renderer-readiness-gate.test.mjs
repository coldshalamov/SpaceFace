import assert from 'node:assert/strict';
import test from 'node:test';

// Regression for the startup readiness gate failing closed on software-rendered (SwiftShader/
// llvmpipe) WebGL. authoredCriticalVisualReadiness previously gated flight on the FULL opening
// composition (every nearby NPC ship + station FX within the immediate radius), which a software
// renderer pushes through a serial admission queue with no KHR_parallel_shader_compile and cannot
// finish inside the 90s startup deadline. The player and the critical starting hub are admitted
// first and compose quickly. Every GPU tier now consumes the same explicit player + shell set;
// optional actors remain diagnostics and stream after the first flight frame.
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

test('the current R0 glass actor is an explicit startup blocker', () => {
  const state = buildState({ tier: 'discrete' });
  const actor = state.entityList.find((entity) => entity.id === 'npc-0');
  actor.activity = { presentationTier: 'R0_GLASS' };
  const blocked = partsLibrary.authoredCriticalVisualReadiness(state);
  assert.equal(blocked.ready, false);
  assert.ok(blocked.flightReadyBlockers.some((entry) => entry.role === 'glassActors'));
  actor.mesh.userData.authoredAssetState = 'authored';
  assert.equal(partsLibrary.authoredCriticalVisualReadiness(state).ready, true);
});

test('each current R0 glass actor remains independently required', () => {
  const state = buildState({ tier: 'discrete' });
  for (const actor of state.entityList.filter((entity) => entity.id.startsWith('npc-'))) {
    actor.activity = { presentationTier: 'R0_GLASS' };
  }
  const blocked = partsLibrary.authoredCriticalVisualReadiness(state);
  assert.equal(blocked.flightReadyBlockers.filter((entry) => entry.role === 'glassActors').length, 2);
  state.entityList.find((entity) => entity.id === 'npc-0').mesh.userData.authoredAssetState = 'authored';
  assert.equal(partsLibrary.authoredCriticalVisualReadiness(state).ready, false);
  state.entityList.find((entity) => entity.id === 'npc-1').mesh.userData.authoredAssetState = 'authored';
  assert.equal(partsLibrary.authoredCriticalVisualReadiness(state).ready, true);
});

test('loading ignores a prior flight activity frame whose entity ids are being reused', () => {
  const state = buildState({ tier: 'integrated' });
  state.mode = 'loading';
  state.render.activityFrame = {
    complete: true,
    renderGlassIds: [state.entityList.find((entity) => entity.id === 'npc-0').id],
    renderRunwayIds: [],
  };
  state.entityList.find((entity) => entity.id === 'npc-0').activity = {
    presentationTier: 'R0_GLASS',
  };
  assert.equal(partsLibrary.authoredCriticalVisualReadiness(state).ready, true,
    'restored id reuse must not widen the explicit loading FlightReadySet');
});

test('hardware renderer: optional opening traffic does not widen the FlightReadySet', () => {
  const state = buildState({ tier: 'discrete' });
  const readiness = partsLibrary.authoredCriticalVisualReadiness(state);

  assert.equal(readiness.softwareRenderer, false);
  assert.equal(readiness.pipelineReady, true,
    'hardware gate must use the explicit player + shell package set');
  assert.equal(readiness.ready, true,
    'hardware gate must not wait for optional traffic');
});

test('unknown or missing GPU tier still uses the explicit fail-closed core set', () => {
  // No state.render at all — the path a state object takes before the renderer publishes gpu, and any
  // privacy-hardened context where detection returns 'unknown'.
  const state = buildState({});
  const readiness = partsLibrary.authoredCriticalVisualReadiness(state);

  assert.equal(readiness.softwareRenderer, false);
  assert.equal(readiness.pipelineReady, true,
    'unknown tier must still admit the core player + shell package');
  assert.equal(readiness.ready, true);
});

test('hardware gate diagnostics still expose optional traffic while core set is ready', () => {
  const state = buildState({ tier: 'discrete', npcStatuses: ['compiling-pipelines', 'authored'] });
  const readiness = partsLibrary.authoredCriticalVisualReadiness(state);

  assert.equal(readiness.pipelineReady, true, 'all opening actors staged must clear the hardware gate');
  assert.equal(readiness.ready, true, 'a compiling-pipelines optional actor does not block startup');
  assert.equal(readiness.openingPending.length, 1, 'optional pending actor remains diagnostic');
});

test('hardware gate does not wait forever on nearby ships that already failed admission', () => {
  const state = buildState({
    tier: 'integrated',
    npcStatuses: ['unavailable', 'unavailable', 'compiling-pipelines'],
  });
  const readiness = partsLibrary.authoredCriticalVisualReadiness(state);

  assert.equal(readiness.softwareRenderer, false);
  assert.equal(readiness.pipelineReady, true,
    'failed nearby traffic must not keep New Game/Continue in loading after the player has staged');
  assert.equal(readiness.ready, true,
    'a still-compiling neighbour remains outside the committed authored gate');

  state.entityList.find((entity) => entity.id === 'npc-2').mesh.userData.authoredAssetState = 'authored';
  const committed = partsLibrary.authoredCriticalVisualReadiness(state);
  assert.equal(committed.pipelineReady, true);
  assert.equal(committed.ready, true,
    'unavailable neighbours must not refuse flight once the rest of the opening set is authored');
});
