import test from 'node:test';
import assert from 'node:assert/strict';
import { swarmArena, planSwarmDebris, planReefLayout, debrisLayoutForArena,
  REEF_LAYOUT_ID } from '../src/systems/swarmArena.js';
import { swarmArenaTierForRun, swarmArenaDebrisLayout, planOpeningThrowables
} from '../src/data/swarmArenaLadder.js';
import { CULL_ARENA_LADDER, cullArenaForRating } from '../src/data/survivalArenas.js';
import { LINE_RATING_THRESHOLDS_T, LINE_THROW_RADIUS_MAX, LINE_ARENA_SCALE_BY_TIER
} from '../src/data/lineRating.js';
import { mulberry32 } from '../src/core/rng.js';

const rung = (wave = 1, ratingT = 0) => swarmArenaTierForRun({ wave, ratingT });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function clear(spots, blockers = [], anchor = { x: 0, z: 0 }) {
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i];
    assert.ok([s.x, s.z, s.radiusWu].every(Number.isFinite));
    assert.ok(s.radiusWu > 0 && s.radiusWu <= LINE_THROW_RADIUS_MAX[0]);
    assert.ok(Math.hypot(s.x - anchor.x, s.z - anchor.z) >= 60 + s.radiusWu);
    for (const b of blockers.concat(spots.slice(0, i).map(p => ({ ...p, radius: p.radiusWu })))) {
      assert.ok(Math.hypot(s.x - b.x, s.z - b.z) >= s.radiusWu + b.radius + 24);
    }
  }
}

test('all ten rungs project canonical Cull identities, rating thresholds and scales exactly', () => {
  for (let i = 0; i < CULL_ARENA_LADDER.length; i++) {
    const t = rung(1 + 3 * i);
    const c = CULL_ARENA_LADDER[i];
    assert.equal(t.step, c.step);
    assert.equal(t.id, c.id);
    assert.equal(t.lineRatingMinT, c.lineRatingMinT);
    assert.equal(t.scaleStep, c.scaleStep);
    assert.equal(t.lineRatingMinT, LINE_RATING_THRESHOLDS_T[t.lineTier]);
    assert.equal(t.scaleStep, LINE_ARENA_SCALE_BY_TIER[t.lineTier]);
    const layout = swarmArenaDebrisLayout(t);
    assert.equal(layout.sizeMaxWu, LINE_THROW_RADIUS_MAX[t.lineTier]);
    assert.equal(layout.sizeMinWu, LINE_THROW_RADIUS_MAX[t.lineTier] * 0.5);
    assert.equal(layout.inner, 115 * t.scaleStep);
    assert.equal(layout.safeRadius, 120 * t.scaleStep);
    assert.ok(layout.outer <= 400 && layout.outer > layout.safeRadius + layout.sizeMaxWu);
    assert.ok(Object.isFrozen(t) && Object.isFrozen(layout));
  }
});

test('rating unlock selects deepest canonical equal-threshold rung, including exact boundaries', () => {
  for (const ratingT of [0, ...LINE_RATING_THRESHOLDS_T.flatMap(t => [t - 0.01, t, t + 0.01]), 1e9]) {
    assert.equal(rung(1, ratingT).id, cullArenaForRating(ratingT).id);
  }
});

test('wave and rating are monotonic and choose the deeper unlock without wrapping', () => {
  for (const ratingT of [0, 25, 80, 180, 360, 640]) {
    let previous = 0;
    for (let wave = 1; wave <= 35; wave++) {
      const t = rung(wave, ratingT);
      assert.equal(t.step, Math.max(Math.min(10, 1 + Math.floor((wave - 1) / 3)), cullArenaForRating(ratingT).step));
      assert.ok(t.step >= previous); previous = t.step;
    }
  }
  for (let wave = 1; wave <= 30; wave++) {
    let previous = 0;
    for (const ratingT of [0, 24, 25, 79, 80, 179, 180, 359, 360, 639, 640, 1e9]) {
      const step = rung(wave, ratingT).step;
      assert.ok(step >= previous); previous = step;
    }
  }
  assert.equal(rung(Number.MAX_VALUE).step, 10);
  for (const input of [undefined, null, {}, { wave: NaN, ratingT: Infinity }, { wave: -1, ratingT: -5 }]) {
    assert.equal(swarmArenaTierForRun(input).step, 1);
  }
});

test('unknown tiers retain authored fallback; Reef recipe remains independent', () => {
  for (const t of [undefined, null, 2, {}, { ...rung() }]) assert.equal(swarmArenaDebrisLayout(t), null);
  const fallback = swarmArenaDebrisLayout(null) || debrisLayoutForArena('helios_core');
  assert.equal(fallback.id, 'banks');
  const reef = planReefLayout({ anchor: { x: 0, z: 0 }, want: 3, rng: mulberry32(23) });
  assert.ok(reef.length > 0);
  assert.ok(reef.every(s => s.layoutId === REEF_LAYOUT_ID));
});

test('each new layout is accepted by actual public debris planner', () => {
  for (let i = 0; i < 10; i++) {
    const layout = swarmArenaDebrisLayout(rung(1 + i * 3));
    const spots = planSwarmDebris({ anchor: { x: 0, z: 0 }, want: layout.target, rng: mulberry32(485 + i), layout });
    assert.ok(spots.length > 0 && spots.length <= layout.target);
    for (const s of spots) {
      assert.equal(s.layoutId, layout.id);
      assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z));
      assert.ok(s.radius >= layout.sizeMinWu && s.radius <= layout.sizeMaxWu);
      assert.ok(Math.hypot(s.x, s.z) <= 400);
    }
  }
});

test('opening has three clear nearby pebbles at every rung and is deterministic', () => {
  for (let i = 0; i < 10; i++) {
    const options = { anchor: { x: 0, z: 0 }, headingRad: 0, tier: rung(1 + 3 * i), existing: [] };
    const spots = planOpeningThrowables(options);
    assert.equal(spots.length, 3); clear(spots);
    assert.ok(spots.every(s => Math.hypot(s.x, s.z) <= 120.00000001));
    assert.deepEqual(spots, planOpeningThrowables(options));
    assert.ok(spots.every(s => s.x > 0));
  }
});

test('opening follows +X heading and translates/rotates without mutating inputs', () => {
  const original = planOpeningThrowables();
  const anchor = Object.freeze({ x: 400, z: -300 });
  const existing = Object.freeze([Object.freeze({ x: 1000, z: 1000, radius: 15 })]);
  const options = Object.freeze({ anchor, existing, headingRad: Math.PI / 2, tier: rung() });
  const snapshot = JSON.stringify(options);
  const actual = planOpeningThrowables(options);
  assert.equal(actual.length, 3); clear(actual, existing, anchor);
  for (let i = 0; i < 3; i++) {
    near(actual[i].x, anchor.x - original[i].z);
    near(actual[i].z, anchor.z + original[i].x);
    assert.equal(actual[i].radiusWu, original[i].radiusWu);
  }
  assert.equal(JSON.stringify(options), snapshot);
});

test('occupied space is refused; partial obstruction searches alternate clear discs', () => {
  assert.deepEqual(planOpeningThrowables({ existing: [{ x: 0, z: 0, radius: 1000 }] }), []);
  const first = planOpeningThrowables()[0];
  const existing = [{ x: first.x, z: first.z, radius: 20 }];
  const spots = planOpeningThrowables({ existing });
  assert.equal(spots.length, 3); clear(spots, existing);
  assert.deepEqual(existing, [{ x: first.x, z: first.z, radius: 20 }]);
});

test('invalid and excessive blocker data fails closed, never emitting NaN/Infinity', () => {
  for (const options of [
    { anchor: null }, { anchor: { x: NaN, z: 1 } }, { headingRad: Infinity },
    { existing: null }, { existing: [null] }, { existing: [{ x: 0, z: 0 }] },
    { existing: [{ x: Infinity, z: 0, radius: 2 }] },
    { existing: [{ x: 0, z: 0, radius: -1 }] },
    { existing: Array.from({ length: 4097 }, () => ({ x: 0, z: 0, radius: 1 })) },
  ]) assert.deepEqual(planOpeningThrowables(options), []);
  clear(planOpeningThrowables(null));
  clear(planOpeningThrowables({ anchor: { x: Number.MAX_VALUE, z: Number.MAX_VALUE } }));
});

test('actual opening caller consumes finite placements and refuses an occupied pocket', () => {
  const player = { id: 1, type: 'ship', pos: { x: 50, z: 70 }, rot: 0 };
  const solid = { id: 2, type: 'station', pos: { x: 50, z: 70 }, radius: 1000 };
  const calls = [];
  const context = {
    state: { playerId: 1, entities: new Map([[1, player]]), entityList: [player], rockCore: { ratingT: 0 }, simTime: 0 },
    helpers: { spawnEntity() {} },
    _spawnDebrisRock(x, z, radiusWu, rng, now, data) { calls.push({ x, z, radiusWu, now, data }); },
  };
  swarmArena._installOpeningPocket.call(context, { seed: 10 });
  assert.equal(calls.length, 3); clear(calls, [], player.pos);
  assert.ok(calls.every(s => s.data.openingPocket === true));
  calls.length = 0;
  context.state.entityList.push(solid);
  swarmArena._installOpeningPocket.call(context, { seed: 10 });
  assert.equal(calls.length, 0);
});
