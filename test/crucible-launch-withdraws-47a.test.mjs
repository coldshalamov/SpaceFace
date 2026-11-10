// A Crucible launch (Swarm / Gauntlet) boots the shared NEW_GAME world whose missions.newGame()
// installs and tracks the 47-A cold-start contract. On glass that painted "Recover the 47-A
// sample from the marked rock" and an "OBJECTIVE · HELIOS PRIME" marker over the arena.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { CONTRACT_47A_B0_TAG, missions as missionsProto } from '../src/systems/missions.js';

function boot() {
  const state = createGameState(47);
  state.mode = 'loading';
  state.playerId = 1;
  state.entities.set(1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } });
  const bus = createBus();
  const helpers = { voice: { say: () => true }, mulberry32: (v) => { let a = v >>> 0; return () => ((a = (a + 0x6D2B79F5) >>> 0) / 4294967296); } };
  const missions = Object.assign({}, missionsProto);
  missions.init({ state, bus, helpers, registry: { get: () => null } });
  missions.newGame();
  return { state, bus };
}
const b0 = (state) => state.missions.active.find((m) => m && m.storyTag === CONTRACT_47A_B0_TAG);

test('crucible launch: scenePrepared withdraws and untracks the 47-A cold-start contract', () => {
  const { state, bus } = boot();
  assert.ok(b0(state), 'newGame installs 47-A');
  bus.emit('game:scenePrepared', { crucibleLaunch: true });
  assert.equal(b0(state), undefined, '47-A withdrawn');
  assert.notEqual(state.ui.trackedMissionId, 'contract_47a_b0_recovery');
  assert.ok(!(state.nav && state.nav.waypoint && state.nav.waypoint.kind === 'mission'), 'no mission waypoint left');
});

test('adventure new game: scenePrepared keeps the 47-A contract tracked', () => {
  const { state, bus } = boot();
  bus.emit('game:scenePrepared', {});
  const m = b0(state);
  assert.ok(m, '47-A stays');
  assert.equal(state.ui.trackedMissionId, m.id);
});
