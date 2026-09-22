// §22 F8 — WANTED search is the heat radius, and leaving it drops a tier.
import assert from 'node:assert/strict';
import test from 'node:test';

import { heat, heatLevelFor, heatRadiusForLevel } from '../src/systems/heat.js';
import { readWantedSearchVolume } from '../src/presentation/wantedSearchVolume.js';

function boot() {
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, flags: {} };
  const entities = new Map([[1, player]]);
  const state = {
    mode: 'flight',
    playerId: 1,
    simTime: 0,
    player: { heat: 0, flags: {} },
    entities,
    entityList: [...entities.values()],
  };
  const sys = Object.create(heat);
  sys.init({
    state,
    bus: { on() {}, emit() {} },
  });
  return { state, sys, player };
}

test('a wanted heat opens a search volume at the authored radius, and leaving it drops one tier', () => {
  const { state, sys, player } = boot();
  state.player.heat = 0.4;
  const before = heatLevelFor(state.player.heat);
  sys.update(0.1, state);
  const volume = readWantedSearchVolume(state);
  assert.ok(volume && volume.active);
  assert.equal(volume.radius, heatRadiusForLevel(before));
  assert.equal(volume.authoredRadius, volume.radius);
  player.pos.x = volume.radius + 80;
  sys.update(volume.clearAfterS, state);
  assert.equal(heatLevelFor(state.player.heat), before - 1);
});
