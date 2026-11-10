// Cruise is a power burn. An empty capacitor will not spool it and will not hold it. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { cruise } from '../src/systems/cruise.js';

function rig({ cap = 0, capMax = 40, phase = 'off', action = true } = {}) {
  const state = createGameState(4242);
  state.meta.seed = 4242;
  state.mode = 'flight';
  state.playerId = 1;
  state.simTime = 3;
  state.player.cruise = { phase, t: phase === 'cruising' ? 3 : 0, stumbleT: 0, stumbleCdT: 0 };
  state.input.actions = { cruise: action };
  const player = {
    id: 1,
    alive: true,
    cap,
    capMax,
    pos: { x: 0, y: 0, z: 0 },
    rot: 0,
    flags: {},
  };
  state.entities.set(1, player);
  const toasts = [];
  cruise.state = state;
  cruise.bus = { emit(type, payload) { if (type === 'toast' || type === 'cruise:charging' || type === 'cruise:dropped') toasts.push({ type, payload }); } };
  cruise._wasCruiseAction = false;
  return { state, toasts };
}

test('seed 4242 an empty capacitor will not spool cruise and drops a burn it cannot feed', () => {
  const dry = rig({ cap: 0, capMax: 40, phase: 'off', action: true });
  cruise.update(0.1, dry.state);
  assert.equal(dry.state.player.cruise.phase, 'off');
  assert.equal(dry.toasts.some((row) => row.payload && row.payload.text === 'Capacitor empty — cruise can\'t spool'), true);

  const held = rig({ cap: 0, capMax: 40, phase: 'cruising', action: false });
  cruise.update(0.1, held.state);
  assert.equal(held.state.player.cruise.phase, 'off');
  assert.equal(held.state.player.cruise.stumbleT, 0);
  assert.equal(held.toasts.some((row) => row.payload && row.payload.text === 'Capacitor empty — cruise dropped'), true);
});

test('seed 4242 a live capacitor spools, and a hull with no capacitor still spools', () => {
  const fed = rig({ cap: 12, capMax: 40, phase: 'off', action: true });
  cruise.update(0.1, fed.state);
  assert.equal(fed.state.player.cruise.phase, 'charging');
  assert.equal(fed.toasts.some((row) => row.type === 'cruise:charging'), true);
  assert.equal(fed.toasts.some((row) => row.type === 'toast'), false);

  const none = rig({ cap: 0, capMax: 0, phase: 'off', action: true });
  cruise.update(0.1, none.state);
  assert.equal(none.state.player.cruise.phase, 'charging');
});
