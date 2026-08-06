// A barge works the seam its refinery eats from — not a rock drawn uniformly from the whole sector.
//
// The defect this pins: `_buildJobSpec` used `_pickAsteroid`, which samples the sector asteroid index
// UNIFORMLY. That is correct for its original caller (an ambient stepper wandering to some rock) and
// wrong for commissioning a durable job across a 4200-unit sector — it routinely sent a barge past
// several hundred identical rocks to cut one across the map. Measured consequence in
// `sector_helios_prime`: live job hulls at 1083, 1694, 1841, 3815 and 13491 units from the player.
//
// It matters visually because the camera's visible ground-plane depth is 45-50 units
// (design/graphics-sprints/CAMERA_VISIBLE_BUBBLE.md). Work that happens 13 km from its own refinery
// shares a frame with nothing — not the player, not the haulers that carry its ore, not the other
// barges on the same shift.

import test from 'node:test';
import assert from 'node:assert/strict';

import { traffic } from '../src/systems/traffic.js';

/** A sector with a near seam beside the refinery and a much richer decoy field far away, so a
 *  uniform draw overwhelmingly lands on the far field and a locality-aware pick never does. */
function makeField({ nearCount = 5, farCount = 200 } = {}) {
  const entities = new Map();
  const asteroids = [];
  let nextId = 1;
  const add = (x, z) => {
    const e = { id: nextId++, type: 'asteroid', alive: true, pos: { x, z }, radius: 12 };
    entities.set(e.id, e);
    asteroids.push(e);
    return e;
  };
  const home = { id: 'station_home', pos: { x: 0, z: 0 } };
  for (let i = 0; i < nearCount; i++) {
    const a = (i / nearCount) * Math.PI * 2;
    add(Math.cos(a) * (140 + i * 18), Math.sin(a) * (140 + i * 18));
  }
  for (let i = 0; i < farCount; i++) {
    const a = (i / farCount) * Math.PI * 2;
    add(2600 + Math.cos(a) * 700, 2600 + Math.sin(a) * 700);
  }
  const state = {
    entities,
    entityList: asteroids,
    entityIndex: { __spacefaceEntityIndexV1: true, asteroids },
    npcJobs: { byId: {} },
  };
  return { state, home, entities };
}

function dist(entity, home) {
  return Math.hypot(entity.pos.x - home.pos.x, entity.pos.z - home.pos.z);
}

test('a barge is sent to a rock near its refinery, not across the sector', () => {
  const { state, home, entities } = makeField();
  const sys = Object.create(traffic);
  sys._rng = () => 0.5;

  const id = sys._pickWorkableAsteroidNear(state, home, 0);
  assert.ok(id != null, 'a populated field must always yield a workable rock');
  const rock = entities.get(id);
  assert.ok(dist(rock, home) < 400,
    `expected a rock near the refinery, got one ${Math.round(dist(rock, home))} units away`);
});

test('the near seam wins even though the far field has 40x more rocks', () => {
  // This is the shape of the original bug: a uniform draw is dominated by wherever the rocks happen
  // to be densest, which has nothing to do with where the work belongs.
  const { state, home, entities } = makeField({ nearCount: 5, farCount: 200 });
  const sys = Object.create(traffic);
  let seed = 0;
  sys._rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  for (let i = 0; i < 40; i++) {
    const rock = entities.get(sys._pickWorkableAsteroidNear(state, home, i % 4));
    assert.ok(dist(rock, home) < 400, `draw ${i} escaped to the far field`);
  }
});

test('spread walks neighbouring faces so one shift does not stack on one rock', () => {
  const { state, home } = makeField();
  const sys = Object.create(traffic);
  sys._rng = () => 0.5;
  const picked = new Set();
  for (let spread = 0; spread < 4; spread++) {
    picked.add(sys._pickWorkableAsteroidNear(state, home, spread));
  }
  assert.equal(picked.size, 4, 'four barges out of one refinery must work four different faces');
});

test('the pick is deterministic — same field, same spread, same rock', () => {
  const a = makeField();
  const b = makeField();
  const sysA = Object.create(traffic); sysA._rng = () => 0.1;
  const sysB = Object.create(traffic); sysB._rng = () => 0.9;
  for (let spread = 0; spread < 4; spread++) {
    assert.equal(
      sysA._pickWorkableAsteroidNear(a.state, a.home, spread),
      sysB._pickWorkableAsteroidNear(b.state, b.home, spread),
      `spread ${spread} must not depend on the RNG stream`,
    );
  }
});

test('a thin field falls back down the ranking instead of dropping the job', () => {
  // Fewer rocks than the requested rank must still commission a barge. Returning null here would
  // silently demote the hull to its ambient stepper and the job would never exist.
  const { state, home } = makeField({ nearCount: 2, farCount: 0 });
  const sys = Object.create(traffic);
  sys._rng = () => 0.5;
  for (let spread = 0; spread < 4; spread++) {
    assert.ok(sys._pickWorkableAsteroidNear(state, home, spread) != null,
      `spread ${spread} must still yield a rock in a two-rock field`);
  }
});

test('an empty field yields nothing rather than throwing into the spawn path', () => {
  const { state, home } = makeField({ nearCount: 0, farCount: 0 });
  const sys = Object.create(traffic);
  sys._rng = () => 0.5;
  assert.equal(sys._pickWorkableAsteroidNear(state, home, 0), null);
});

test('dead rocks are skipped', () => {
  const { state, home, entities } = makeField({ nearCount: 3, farCount: 3 });
  const sys = Object.create(traffic);
  sys._rng = () => 0.5;
  for (const e of entities.values()) if (dist(e, home) < 400) e.alive = false;
  const id = sys._pickWorkableAsteroidNear(state, home, 0);
  assert.ok(id != null, 'must still find a live rock');
  assert.equal(entities.get(id).alive, true);
});

test('no home station falls back to the original uniform pick', () => {
  // The locality rule needs an anchor. Without one, behave exactly as before rather than inventing
  // a position — a job with a fabricated origin is worse than a wandering one.
  const { state } = makeField();
  const sys = Object.create(traffic);
  sys._rng = () => 0.5;
  assert.ok(sys._pickWorkableAsteroidNear(state, null, 0) != null);
  assert.ok(sys._pickWorkableAsteroidNear(state, { id: 'x' }, 0) != null, 'a station with no pos');
});

test('works without the entity index, via the plain entity list', () => {
  const { state, home, entities } = makeField();
  delete state.entityIndex;
  const sys = Object.create(traffic);
  sys._rng = () => 0.5;
  const rock = entities.get(sys._pickWorkableAsteroidNear(state, home, 0));
  assert.ok(rock && dist(rock, home) < 400);
});
