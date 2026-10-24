// MOP / CL-5 (row 506 member 4) — the clean-up drone erasing evidence at Nyx March.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOP } from '../src/data/mop.js';
import {
  mopEligible, mopSweepTarget, mopSteerVelocity, mopSteerDeltaV, mopCanConsume, mopNoticed,
} from '../src/characters/mopRules.js';
import { createMop, mopSpec } from '../src/systems/mop.js';
import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';

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
const wreck = (id, pos, extra = {}, flags = undefined) => ({ id, alive: true, type: 'wreck', pos, vel: { x: 0, z: 0 }, mass: 40, data: { persistenceOwner: 'aftermathWrecks', ...extra }, ...(flags ? { flags } : {}) });
const drone = (state) => state.entityList.find((e) => e.data?.mop);
// The patrol steers through the impulse membrane — drain the queued commands like the
// physics owner would (a live Rapier body owns linvel; a vel write is dead).
const impulses = (entity) => {
  const cmds = consumePhysicsCommand(entity);
  return cmds && cmds.impulses ? cmds.impulses.splice(0) : [];
};

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
  const go = impulses(d);
  assert.equal(go.length, 1, 'the sweep is a queued impulse, not a vel write (a live Rapier body owns linvel)');
  assert.ok(go[0].x > 0 && go[0].z > 0, 'the impulse points at the nearer hull');
  // teleport it onto the target — next pass tidies, then brakes over the site
  d.pos = { ...w2.pos };
  d.vel = { x: 5, z: 0 };
  sys.update();
  assert.equal(w2.alive, false);
  assert.equal(state.story.flags.mop_tidied, 1);
  assert.equal(w1.alive, true); // the farther hull waits its turn
  const brake = impulses(d);
  assert.equal(brake.length, 1, 'a tidy ends with the drone parked, not coasting past');
  assert.ok(brake[0].x < 0, 'the brake impulse cancels its carry');
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
  d.pos = { x: 0, z: 0 }; // off post so the drift-home pass is visible
  sys.update();
  // no eligible target → drifts home instead of eating somebody's property
  for (const w of protected_) assert.equal(w.alive, true);
  const home = impulses(d);
  assert.equal(home.length, 1);
  assert.ok(home[0].x < 0 && home[0].z > 0, 'with nothing to tidy it walks back to the post');
});

test('mid-hand hulls are not evidence — the client\'s latch, beam lock, and NPC tows refuse', () => {
  // On the client's massline: eating it off the line is theft, not erasure.
  const towed = wreck(70, { x: -780, z: 520 });
  const f1 = fixture({ wrecks: [towed] });
  f1.player.tether = { active: true, targetId: towed.id, phase: 'taut' };
  const d1 = drone(f1.state);
  d1.pos = { ...towed.pos }; // parked on the hull and it still cannot take it
  f1.sys.update();
  assert.equal(towed.alive, true, 'a wreck on the client\'s line is mid-hand, not evidence');
  assert.equal(f1.state.story.flags.mop_tidied, undefined);
  assert.equal(f1.popups.length, 0);
  // Under the client's salvage beam: the drain in progress is the client's claim.
  const drained = wreck(71, { x: -780, z: 520 });
  const f2 = fixture({ wrecks: [drained] });
  f2.player.miningTargetId = drained.id;
  const d2 = drone(f2.state);
  d2.pos = { ...drained.pos };
  f2.sys.update();
  assert.equal(drained.alive, true, 'a wreck under the beam is being worked, not abandoned');
  // NPC tows: another job's line is another lane's hull.
  const npcTowed = wreck(72, { x: 0, z: 0 }, { npcTowedByJobId: 'job:wr_1' });
  const latched = wreck(73, { x: 0, z: 0 }, { npcMasslineLatch: true }, { tethered: true });
  const marked = wreck(74, { x: 0, z: 0 }, { tethered: true });
  assert.equal(mopEligible(npcTowed), false);
  assert.equal(mopEligible(latched), false);
  assert.equal(mopEligible(marked), false);
  // And a hull the client is merely racing — adjacent, no latch, no beam — stays fair game.
  const race = wreck(75, { x: -780, z: 520 });
  const f3 = fixture({ wrecks: [race] });
  const d3 = drone(f3.state);
  d3.pos = { ...race.pos };
  f3.sys.update();
  assert.equal(race.alive, false, 'the race is still the race');
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
  const home = impulses(d);
  assert.equal(home.length, 1, 'the walk home is a queued impulse');
  assert.ok(home[0].x < 0 && home[0].z > 0); // back toward the post at (-820, 480)
  // On the post with carry left: it brakes to rest.
  d.pos = { ...MOP.post };
  d.vel = { x: 4, z: 0 };
  sys.update();
  const stop = impulses(d);
  assert.equal(stop.length, 1);
  assert.ok(stop[0].x < 0);
  // On the post at rest: no impulse — it stands.
  d.vel = { x: 0, z: 0 };
  sys.update();
  assert.equal(impulses(d).length, 0);
});

test('pure rules: eligibility, sweep target, steering, consume, notice', () => {
  assert.equal(mopEligible(wreck(1, { x: 0, z: 0 })), true);
  assert.equal(mopEligible(wreck(2, { x: 0, z: 0 }, { poiId: 'poi_x' })), false);
  assert.equal(mopEligible(wreck(3, { x: 0, z: 0 }, { npcTowedByJobId: 'job:x' })), false);
  assert.equal(mopEligible(wreck(4, { x: 0, z: 0 }, {}, { tethered: true })), false);
  assert.equal(mopEligible({ type: 'ship', alive: true }), false);
  const near = mopSweepTarget({ x: 0, z: 0 }, [wreck(1, { x: 5, z: 0 }), wreck(2, { x: 50, z: 0 })]);
  assert.equal(near.id, 1);
  assert.equal(mopSweepTarget({ x: 0, z: 0 }, []), null);
  assert.deepEqual(mopSteerVelocity({ x: 0, z: 0 }, { x: 0, z: 0 }), { x: 0, z: 0 });
  // The membrane delta: wanted velocity minus carried velocity; null when already there.
  assert.deepEqual(mopSteerDeltaV({ pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } }, { x: 100, z: 0 }, 50), { x: 50, z: 0 });
  assert.deepEqual(mopSteerDeltaV({ pos: { x: 0, z: 0 }, vel: { x: 50, z: 0 } }, { x: 100, z: 0 }, 50), null);
  assert.deepEqual(mopSteerDeltaV({ pos: { x: 0, z: 0 }, vel: { x: 3, z: 0 } }, { x: 0, z: 0 }), { x: -3, z: 0 });
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
