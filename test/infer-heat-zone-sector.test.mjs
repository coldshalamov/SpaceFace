import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { readWantedSearchVolume } from '../src/presentation/wantedSearchVolume.js';
import { heat } from '../src/systems/heat.js';
import { heatReading } from '../src/ui/orrery/footprintDial.js';

test('a wanted search stays in the sector that opened it', () => {
  const state = createGameState(4242);
  const player = {
    id: 1, type: 'ship', alive: true, pos: { x: 100, z: 40 }, vel: { x: 0, z: 0 }, flags: {},
  };
  state.entities.set(1, player);
  state.entityList = [player];
  state.playerId = 1;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  heat.init({ state, bus: { on() {}, emit() {} } });
  state.player.heat = 0.4;

  heat.update(1 / 60, state);
  const home = readWantedSearchVolume(state);
  assert.ok(home, 'the search draws where the heat opened');
  assert.equal(home.x, 100);
  assert.equal(home.z, 40);
  assert.equal(state.player.heatZone.sectorId, 'sector_helios_prime');
  const heatBefore = state.player.heat;

  player.pos.x = 100 + home.radius + 500;
  heat.update(1, state);
  assert.ok(state.player.heatZone.outsideS >= 1, 'leaving the circle in its own sector still starts the escape clock');
  const clock = state.player.heatZone.outsideS;

  state.world.currentSectorId = 'sector_ceres';
  player.pos.x = 8000;
  player.pos.z = -4000;
  heat.update(30, state);
  assert.equal(readWantedSearchVolume(state), null, 'the circle does not draw on the new chart');
  assert.equal(state.player.heat, heatBefore, 'the jump does not clear the heat');
  assert.equal(state.player.heatZone.outsideS, clock, 'the jump does not spend or reset the escape clock');
  assert.equal(state.player.heatZone.center.x, 100);
  assert.equal(state.player.heatZone.active, false);
  const dial = heatReading(state);
  assert.equal(dial.held, 'inside', 'the footprint clock does not run against a circle in another sector');

  state.world.currentSectorId = 'sector_helios_prime';
  player.pos.x = 180;
  player.pos.z = 40;
  const back = readWantedSearchVolume(state);
  assert.equal(back, null, 'returning has not drawn yet');
  heat.update(1 / 60, state);
  const restored = readWantedSearchVolume(state);
  assert.ok(restored, 'coming back shows the same search');
  assert.equal(restored.x, 100, 'the circle stays where the heat opened');
  assert.equal(restored.z, 40);
  assert.equal(state.player.heatZone.outsideS, 0, 'standing back inside the circle resets the escape clock');
});
