// INF-056 — a map destination means the same place in flight. The course owner
// (world._onSetCourse) used to store only the static click-time pos plus the gameplay-facing
// targetEntityId, so the autopilot chased the live hull while every instrument that resolves
// through resolveWaypointPresentationPosition (HUD arrow, radar, both maps, threat halo) stayed
// parked at the authored fix. The bind helper promotes the aimed-at live body to
// presentationEntityId; these tests pin the agreement between flight and presentation, the
// fail-closed boundaries, and the save boundary (the field is runtime-only).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { core } from '../src/core/coreSystem.js';
import { world as worldSystem } from '../src/systems/world.js';
import {
  presentationEntityIdForCourseTarget,
  resolveWaypointPresentationPosition,
} from '../src/ui/navigationWaypoint.js';

function boot(seed = 5606) {
  const state = createGameState(seed);
  state.mode = 'flight';
  const bus = createBus();
  const ctx = { state, bus, helpers: {}, registry: null };
  core.init(ctx);
  const player = ctx.helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, radius: 4, mass: 12, hull: 100, hullMax: 100,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  const world = Object.assign(Object.create(worldSystem), {});
  world.init(ctx);
  return { state, bus, world, player, ctx };
}

test('a course set on a moving contact tracks the hull: flight target and presentation position agree', () => {
  const { state, world, ctx } = boot();
  const raider = ctx.helpers.spawnEntity({
    type: 'ship', pos: { x: 500, z: -200 }, radius: 6, mass: 10, hull: 60, hullMax: 60,
  });
  const clickFix = { x: raider.pos.x, z: raider.pos.z };

  world._onSetCourse({
    pos: clickFix,
    targetEntityId: raider.id,
    label: 'Raider',
    waypointKind: 'local',
    autopilot: true,
  });

  const wp = state.nav.waypoint;
  assert.ok(wp, 'course armed a waypoint');
  assert.equal(wp.targetEntityId, raider.id, 'gameplay-facing id unchanged');
  assert.equal(wp.presentationEntityId, raider.id, 'presentation id bound to the aimed-at body');
  assert.deepEqual(wp.pos, clickFix, 'authored fix preserved as the fail-closed fallback');

  // The contact flies on. Flight re-resolves the entity every tick; presentation must resolve
  // the SAME live position, not the frozen click fix.
  raider.pos.x = 900;
  raider.pos.z = 400;
  const autopilotTarget = world.state.nav.autopilot;
  assert.equal(autopilotTarget.targetEntityId, raider.id);
  const resolved = resolveWaypointPresentationPosition(state, wp);
  assert.equal(resolved, raider.pos, 'presentation resolves to the live hull position');
  assert.notDeepEqual(resolved, wp.pos, 'the frozen click fix is no longer what instruments show');
});

test('a dead or unknown course target binds nothing and falls back to the authored pos', () => {
  const { state, world, ctx } = boot();
  const wreck = ctx.helpers.spawnEntity({
    type: 'ship', pos: { x: 100, z: 50 }, radius: 6, mass: 10, hull: 10, hullMax: 10,
  });
  wreck.alive = false;

  world._onSetCourse({ pos: { x: 100, z: 50 }, targetEntityId: wreck.id, label: 'Wreck fix' });
  assert.equal(state.nav.waypoint.presentationEntityId, undefined, 'dead target binds no presentation id');
  assert.deepEqual(
    resolveWaypointPresentationPosition(state, state.nav.waypoint),
    { x: 100, z: 50 },
    'resolver fails closed to the authored pos',
  );

  world._onSetCourse({ pos: { x: 7, z: 9 }, targetEntityId: 999999, label: 'Ghost fix' });
  assert.equal(state.nav.waypoint.presentationEntityId, undefined, 'unknown id binds nothing');

  world._onSetCourse({ pos: { x: 3, z: 4 }, label: 'Bare fix' });
  assert.equal(state.nav.waypoint.presentationEntityId, undefined, 'entity-less fix unaffected');
  assert.deepEqual(resolveWaypointPresentationPosition(state, state.nav.waypoint), { x: 3, z: 4 });
});

test('the bind helper is fail-closed against malformed inputs and string ids', () => {
  const entities = new Map();
  entities.set(12, { id: 12, alive: true, pos: { x: 1, z: 2 } });
  entities.set('str9', { id: 'str9', alive: true, pos: { x: 3, z: 4 } });
  entities.set(77, { id: 77, alive: true, pos: { x: NaN, z: 0 } });

  assert.equal(presentationEntityIdForCourseTarget(entities, 12), 12, 'numeric id resolves');
  assert.equal(presentationEntityIdForCourseTarget(entities, '12'), 12, 'numeric string falls back to numeric lookup');
  assert.equal(presentationEntityIdForCourseTarget(entities, 'str9'), 'str9', 'string id resolves directly');
  assert.equal(presentationEntityIdForCourseTarget(entities, 77), null, 'non-finite position binds nothing');
  assert.equal(presentationEntityIdForCourseTarget(entities, null), null);
  assert.equal(presentationEntityIdForCourseTarget(null, 12), null);
  assert.equal(presentationEntityIdForCourseTarget(new Map(), 12), null);
});

test('the presentation bind is runtime-only: the save sanitizer drops it', () => {
  // The whitelist in sanitizeNavWaypoint carries only durable fields; a restored waypoint
  // therefore fails closed to pos exactly like a dead entity. Read the sanitizer's field list
  // so a future whitelist edit that persists the runtime id must update this contract.
  const source = readFileSync(new URL('../src/save/saveSystem.js', import.meta.url), 'utf8');
  const fnStart = source.indexOf('function sanitizeNavWaypoint');
  assert.ok(fnStart > 0, 'sanitizeNavWaypoint exists');
  const fnBody = source.slice(fnStart, source.indexOf('\nfunction ', fnStart + 10));
  assert.ok(!fnBody.includes('presentationEntityId'), 'presentationEntityId must not be persisted');
});
