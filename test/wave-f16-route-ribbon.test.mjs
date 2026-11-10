// §22 F16 — a destination draws a world ribbon dimmer than the engine, and clearing it removes the ribbon.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ENGINE_PLUME_CORE_INTENSITY,
  ROUTE_RIBBON_BRIGHTNESS,
  routeRibbon,
} from '../src/presentation/routeRibbon.js';

function flight(dest) {
  const player = { id: 1, pos: { x: 10, z: 20 }, vel: { x: 4, z: 0 } };
  return {
    playerId: 1,
    entities: new Map([[1, player]]),
    player: {
      nav: {
        waypoint: dest.waypoint || null,
        autopilot: {
          active: dest.active === true,
          target: dest.target || null,
          targetEntityId: null,
          label: 'test',
          arrivalRadius: 36,
          status: 'idle',
        },
      },
    },
    body: player,
  };
}

test('an autopilot destination is a ribbon toward that point and applies no force', () => {
  const state = flight({ active: true, target: { x: 200, z: 80 } });
  const vx = state.body.vel.x;
  const ribbon = routeRibbon(state);
  assert.ok(ribbon && ribbon.active);
  assert.equal(ribbon.force, 0);
  assert.equal(ribbon.points[0].x, 10);
  assert.equal(ribbon.points[1].x, 200);
  assert.equal(ribbon.points[1].z, 80);
  assert.ok(ribbon.brightness < ENGINE_PLUME_CORE_INTENSITY);
  assert.equal(ribbon.brightness, ROUTE_RIBBON_BRIGHTNESS);
  assert.equal(state.body.vel.x, vx);
});

test('clearing the destination removes the ribbon', () => {
  const state = flight({ active: true, target: { x: 40, z: 40 } });
  assert.ok(routeRibbon(state));
  state.player.nav.autopilot.active = false;
  state.player.nav.autopilot.target = null;
  state.player.nav.waypoint = null;
  assert.equal(routeRibbon(state), null);
});
