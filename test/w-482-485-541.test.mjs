// W-482/483/484/485/541 — the rock is the gun: Line rating, flail, arena ladder
// (build_map §33/§34 rows 482–485, 541)
//
// 482: waves 1–10 player kills file into impact/gun/other buckets — ≥60 % impact.
// 483: the Line rating is tonnes riding the line; thresholds light the new class.
// 484: chained wrecks ride the Line as a bounded 5-link flail.
// 485: arena scale and camera open grow with the rating, read-only for consumers.
// 541: the ten-arena Cull ladder is ordered by scale step against rating bands.

import test from 'node:test';
import assert from 'node:assert/strict';

import { rockCore, ROCK_CORE_EVENTS } from '../src/systems/rockCore.js';
import {
  LINE_RATING_THRESHOLDS_T, lineTierForRating, lineThrowTierForBody,
  LINE_FLAIL_MAX_LINKS, LINE_FLAIL_MIN_TIER,
} from '../src/data/lineRating.js';
import {
  rockGunKillBucket, rockGunImpactShare, ROCK_GUN_SHARE_TARGET, ROCK_GUN_WAVE_MAX,
} from '../src/data/rockGunTape.js';
import { CULL_ARENA_LADDER } from '../src/data/survivalArenas.js';

function makeBus() {
  const emitted = [];
  return {
    emitted,
    emit(event, payload) { emitted.push({ event, payload }); },
    on(name, fn) { (this._handlers ||= {})[name] = fn; return () => { delete this._handlers[name]; }; },
    off() {},
    fire(name, payload) { const f = this._handlers && this._handlers[name]; if (f) f(payload); },
  };
}

function body(id, mass, x = 0, z = 0, radius = 8) {
  return { id, mass, radius, pos: { x, z }, vel: { x: 0, z: 0 }, alive: true, data: {} };
}

function makeState() {
  const entities = new Map();
  const player = body('player_1', 50);
  entities.set(player.id, player);
  return {
    simTime: 0,
    playerId: player.id,
    entities,
    combat: { attachments: { byId: {} } },
    run: { kind: 'survival', wave: 3 },
    rockCore: null,
  };
}

function makeSystem(state, bus = makeBus()) {
  const sys = Object.create(rockCore);
  sys.init({ state, bus, helpers: {} });
  return sys;
}

function attach(state, attachId, targetId, defId = 'attachment_massline') {
  state.combat.attachments.byId[attachId] = {
    defId, state: 'active', ownerId: state.playerId, targetId,
  };
}

test('w-482: player kills in waves 1–10 file into the rock-gun ledger', () => {
  const state = makeState();
  const bus = makeBus();
  makeSystem(state, bus);
  const kill = (tag, killerId = 'player_1') => bus.fire('entity:killed', {
    id: 'e' + Math.random(), killerId,
    presentation: { tag, playerCaused: killerId === 'player_1' },
  });
  for (let i = 0; i < 7; i++) kill('massline_throw');
  for (let i = 0; i < 3; i++) kill('projectile');
  kill('massline_throw', 'npc_raider');       // not player-caused — ignored
  const l = state.rockCore.killLedger;
  assert.equal(l.impact, 7);
  assert.equal(l.gun, 3);
  assert.ok(rockGunImpactShare(l) >= ROCK_GUN_SHARE_TARGET,
    `impact share ${rockGunImpactShare(l)} ≥ ${ROCK_GUN_SHARE_TARGET}`);
});

test('w-482: kills outside the waves or outside a survival run do not count', () => {
  const state = makeState();
  const bus = makeBus();
  makeSystem(state, bus);
  state.run.wave = ROCK_GUN_WAVE_MAX + 1;
  bus.fire('entity:killed', { id: 'a', killerId: 'player_1', presentation: { tag: 'massline_throw' } });
  state.run.wave = 4;
  state.run.kind = 'adventure';
  bus.fire('entity:killed', { id: 'b', killerId: 'player_1', presentation: { tag: 'massline_throw' } });
  assert.equal(state.rockCore.killLedger.impact, 0);
  // And the bucketer itself is honest about unknown tags.
  assert.equal(rockGunKillBucket({ presentation: { tag: 'mystery_heart_attack' } }), 'other');
  assert.equal(rockGunKillBucket({ cause: 'terrain_collision' }), 'impact');
});

test('w-483: the Line rating is the tonnes riding the line, and a threshold lights the class', () => {
  const state = makeState();
  const bus = makeBus();
  const sys = makeSystem(state, bus);
  // A light rock on the line: under the first threshold, tier 0.
  state.entities.set('rock1', body('rock1', 12, 40, 0));
  attach(state, 'a1', 'rock1');
  sys.update(1 / 60, state);
  assert.equal(state.rockCore.ratingT, 12);
  assert.equal(state.rockCore.tier, 0);
  // Add a boulder: past the 25 t threshold — the new class lights in Line colour.
  state.entities.set('rock2', body('rock2', 80, -40, 0));
  attach(state, 'a2', 'rock2');
  sys.update(1 / 60, state);
  assert.equal(state.rockCore.ratingT, 92);
  assert.ok(state.rockCore.tier >= 2, `92t lands tier ${state.rockCore.tier}`);
  const unlock = bus.emitted.find((e) => e.event === ROCK_CORE_EVENTS.unlocked);
  assert.ok(unlock, 'the newly-movable class lit');
  assert.equal(unlock.payload.tier, state.rockCore.tier);
  assert.equal(lineTierForRating(25), 1);
  assert.equal(lineTierForRating(LINE_RATING_THRESHOLDS_T[5]), 5);
});

test('w-483: the rating gate makes over-class bodies score immovable', () => {
  // A hulk-class body reads tier ≥4 against a T1 line — the massline scoring
  // gate (masslineTargetScoring opts.lineTier/throwTierOf) is wired in tetherGameplay.
  const heavy = { mass: 900, radius: 80, pos: { x: 0, z: 0 } };
  assert.ok(lineThrowTierForBody(heavy) >= 4, `an 80wu body needs tier ${lineThrowTierForBody(heavy)}`);
  const pebble = { mass: 5, radius: 4, pos: { x: 0, z: 0 } };
  assert.equal(lineThrowTierForBody(pebble), 0);
});

test('w-484: the flail chains wrecks behind the line, bounded at five, solved to the gap', () => {
  const state = makeState();
  const bus = makeBus();
  const sys = makeSystem(state, bus);
  // Lift the rating to chaining tier: two mid rocks on the line.
  state.entities.set('r1', body('r1', 60, 30, 0));
  state.entities.set('r2', body('r2', 60, -30, 0));
  attach(state, 'a1', 'r1');
  attach(state, 'a2', 'r2');
  sys.update(1 / 60, state);
  assert.ok(state.rockCore.tier >= LINE_FLAIL_MIN_TIER, 'tier high enough to chain');
  // Offer five wrecks plus a sixth — the chain caps at five.
  const offers = [];
  for (let i = 0; i < 6; i++) {
    const w = body(`w${i}`, 30, 200 + i * 200, 0, 12); // boulder-class radius chains
    state.entities.set(w.id, w);
    const offer = { targetId: w.id, ownerId: state.playerId, accepted: false };
    bus.fire('massline:flailOffer', offer);
    offers.push(offer);
  }
  assert.equal(state.rockCore.flail.links.length, LINE_FLAIL_MAX_LINKS);
  assert.equal(offers[5].accepted, false, 'the sixth offer declines');
  // Solver: links drag back inside their gap over a few ticks.
  for (let i = 0; i < 30; i++) sys.update(1 / 60, state);
  const player = state.entities.get(state.playerId);
  let anchor = player;
  for (const link of state.rockCore.flail.links) {
    const b = state.entities.get(link.id);
    const d = Math.hypot(b.pos.x - anchor.pos.x, b.pos.z - anchor.pos.z);
    assert.ok(d <= link.gapWu + 0.01, `link ${link.id} at ${d.toFixed(1)}wu within gap ${link.gapWu}`);
    anchor = b;
  }
  // A released catch leaves the chain.
  const firstId = state.rockCore.flail.links[0].id;
  bus.fire('tether:released', { targetId: firstId });
  assert.ok(!state.rockCore.flail.links.some((l) => l.id === firstId), 'released link drops');
});

test('w-484: below chaining tier the chain sheds rather than holding lies', () => {
  const state = makeState();
  const bus = makeBus();
  const sys = makeSystem(state, bus);
  state.entities.set('r1', body('r1', 60, 30, 0));
  state.entities.set('r2', body('r2', 60, -30, 0));
  attach(state, 'a1', 'r1');
  attach(state, 'a2', 'r2');
  sys.update(1 / 60, state);
  const w = body('w0', 30, 100, 0, 12);
  state.entities.set('w0', w);
  assert.equal(sys.chainFlailLink('w0'), true);
  // Lose the tonnage: both rocks detach — the chain must shed, not persist a phantom flail.
  delete state.combat.attachments.byId['a1'];
  delete state.combat.attachments.byId['a2'];
  sys.update(1 / 60, state);
  assert.equal(state.rockCore.flail.links.length, 0, 'links shed below chaining tier');
});

test('w-485: arena scale and camera open ride the rating, inert at tier zero', () => {
  const state = makeState();
  const sys = makeSystem(state, makeBus());
  sys.update(1 / 60, state);
  assert.equal(state.rockCore.cameraZoomFloor, 0, 'tier 0 does not open the frame');
  assert.equal(state.rockCore.arenaRadiusScale, 1.0);
  state.entities.set('big', body('big', 400, 50, 0));
  attach(state, 'a1', 'big');
  sys.update(1 / 60, state);
  assert.ok(state.rockCore.tier >= 3, `400t lands tier ${state.rockCore.tier}`);
  assert.ok(state.rockCore.cameraZoomFloor > 0.25, 'the frame opens with the rating');
  assert.ok(state.rockCore.arenaRadiusScale > 1.3, 'the room widens');
  assert.ok(state.rockCore.winchDrumScale > 1.3, 'the winch head visibly thickens');
});

test('w-541: the ten-arena Cull ladder climbs by scale step against rating bands', () => {
  assert.equal(CULL_ARENA_LADDER.length, 10, 'ten arenas on the ladder');
  let prevStep = 0, prevMin = -1, prevOrder = 0;
  for (const arena of CULL_ARENA_LADDER) {
    assert.ok(arena.step > prevOrder, `${arena.id} is ordered on the ladder`);
    assert.ok(arena.scaleStep >= prevStep, `${arena.id} does not shrink (${arena.scaleStep})`);
    assert.ok(arena.lineRatingMinT >= prevMin, `${arena.id} rating band does not regress`);
    assert.ok(arena.id && arena.sector && arena.mechanic, `${arena.id} is a real authored room`);
    prevOrder = arena.step;
    prevStep = arena.scaleStep;
    prevMin = arena.lineRatingMinT;
  }
});
