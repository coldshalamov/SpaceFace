// MOP / CL-5 (row 506 member 4) — the clean-up drone erasing evidence at Nyx March.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOP } from '../src/data/mop.js';
import {
  mopEligible, mopSweepTarget, mopSteerVelocity, mopCanConsume, mopNoticed,
} from '../src/characters/mopRules.js';
import { createMop, mopSpec } from '../src/systems/mop.js';
import { createBus } from '../src/core/eventBus.js';

function fixture({ sector = 'sector_nyx_march', runKind = 'adventure', wrecks = [] } = {}) {
  const bus = createBus();
  const popups = [];
  bus.on('comms:popup', (p) => popups.push(p));
  const player = { id: 7, alive: true, isPlayer: true, pos: { x: -800, z: 500 }, vel: { x: 0, z: 0 } };
  const state = {
    run: { kind: runKind },
    world: { currentSectorId: sector },
    story: { flags: {} },
    simTime: 100,
    playerId: player.id,
    player,
    entityList: [player, ...wrecks],
    entities: new Map([[player.id, player], ...wrecks.map((w) => [w.id, w])]),
  };
  const helpers = {
    spawnEntity(spec) { const e = { id: 900 + state.entityList.length, alive: true, ...spec }; state.entityList.push(e); state.entities.set(e.id, e); return e; },
    removeEntity(id) { const e = state.entities.get(id); if (e) e.alive = false; },
    sectorCookProviders: [],
  };
  const sys = createMop();
  sys.init({ state, bus, helpers });
  return { state, bus, helpers, popups, sys, player };
}
const wreck = (id, pos, extra = {}) => ({ id, alive: true, type: 'wreck', pos, vel: { x: 0, z: 0 }, mass: 40, data: { persistenceOwner: 'aftermathWrecks', ...extra } });
const drone = (state) => state.entityList.find((e) => e.data?.mop);

test('spec: marked drone, salvage signal, home sector — silent by canon', () => {
  const s = mopSpec();
  assert.equal(s.data.mop, true);
  assert.equal(s.data.authoredCharacter, 'mop');
  assert.equal(s.data.homeSectorId, 'sector_nyx_march');
  const { popups, state } = fixture();
  assert.equal(drone(state) !== undefined, true);
  assert.equal(popups.length, 0); // a Quiet drone does not announce
});

test('no drone in survival or wrong sector', () => {
  for (const f of [fixture({ runKind: 'survival' }), fixture({ sector: 'sector_io_reach' })]) {
    assert.equal(f.state.entityList.filter((e) => e.data?.mop).length, 0);
  }
});

test('patrol: steers at the nearest unmarked wreck, tidies it on contact', () => {
  const w1 = wreck(50, { x: 0, z: 0 });        // nearer to post (-820,480)? no — w2 closer
  const w2 = wreck(51, { x: -780, z: 520 });
  const { state, sys } = fixture({ wrecks: [w1, w2] });
  const d = drone(state);
  sys.update();
  assert.ok(Math.hypot(d.vel.x, d.vel.z) > 0); // moving toward the near wreck
  // teleport it onto the target — next pass tidies
  d.pos = { ...w2.pos };
  sys.update();
  assert.equal(w2.alive, false);
  assert.equal(state.story.flags.mop_tidied, 1);
  assert.equal(w1.alive, true); // the farther hull waits its turn
});

test('protected hulls are never evidence — authored/mission/durable refused', () => {
  const protected_ = [
    wreck(60, { x: -780, z: 520 }, { authoredWreckId: 'aw1' }),
    wreck(61, { x: -780, z: 520 }, { missionPinned: true }),
    wreck(62, { x: -780, z: 520 }, { durable: true }),
    wreck(63, { x: -780, z: 520 }, { persistenceOwner: 'uniqueWrecks' }),
  ];
  const { state, sys } = fixture({ wrecks: protected_ });
  const d = drone(state);
  sys.update();
  // no eligible target → drifts home instead of eating somebody's property
  for (const w of protected_) assert.equal(w.alive, true);
});

test('the one remark: tidying near the client gets a line; far away is silent', () => {
  const near = wreck(50, { x: -780, z: 520 }); // ~within notice of player at (-800,500)
  const { state, sys, popups } = fixture({ wrecks: [near] });
  const d = drone(state);
  d.pos = { ...near.pos };
  sys.update();
  assert.equal(popups.filter((p) => String(p.id).startsWith('mop_tidy')).length, 1);
  assert.match(popups[0].text, /Nothing happened here/);
  // far tidy is silent
  const far = fixture({ wrecks: [wreck(70, { x: 3000, z: 3000 })] });
  const d2 = drone(far.state);
  d2.pos = { x: 3000, z: 3000 };
  far.sys.update();
  assert.equal(far.popups.length, 0);
});

test('clean sector: drone drifts home and parks inside the leash', () => {
  const { state, sys } = fixture();
  const d = drone(state);
  d.pos = { x: 0, z: 0 }; // pushed off post
  sys.update();
  assert.ok(Math.hypot(d.vel.x, d.vel.z) > 0); // heading home
  d.pos = { ...MOP.post };
  sys.update();
  assert.deepEqual(d.vel, { x: 0, z: 0 });
});

test('pure rules: eligibility, sweep target, steering, consume, notice', () => {
  assert.equal(mopEligible(wreck(1, { x: 0, z: 0 })), true);
  assert.equal(mopEligible(wreck(2, { x: 0, z: 0 }, { poiId: 'poi_x' })), false);
  assert.equal(mopEligible({ type: 'ship', alive: true }), false);
  const near = mopSweepTarget({ x: 0, z: 0 }, [wreck(1, { x: 5, z: 0 }), wreck(2, { x: 50, z: 0 })]);
  assert.equal(near.id, 1);
  assert.equal(mopSweepTarget({ x: 0, z: 0 }, []), null);
  assert.deepEqual(mopSteerVelocity({ x: 0, z: 0 }, { x: 0, z: 0 }), { x: 0, z: 0 });
  assert.equal(mopCanConsume({ x: 0, z: 0 }, { x: 30, z: 0 }), true);
  assert.equal(mopCanConsume({ x: 0, z: 0 }, { x: 40, z: 0 }), false);
  assert.equal(mopNoticed({ x: 0, z: 0 }, { x: 399, z: 0 }), true);
  assert.equal(mopNoticed({ x: 0, z: 0 }, { x: 401, z: 0 }), false);
});

test('destroy + re-init: provider and owned hull clean, no double-spawn', () => {
  const { state, helpers, sys } = fixture();
  const before = helpers.sectorCookProviders.length;
  sys.destroy();
  assert.equal(helpers.sectorCookProviders.length, before - 1);
  assert.equal(state.entityList.filter((e) => e.alive && e.data?.mop).length, 0);
  sys.init({ state, bus: createBus(), helpers });
  assert.equal(state.entityList.filter((e) => e.alive && e.data?.mop).length, 1);
});
