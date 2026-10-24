// TALLYHO / CN-2 (row 506 member 5) — the scoreboard rating kills at Rhea Cinder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TALLYHO } from '../src/data/tallyho.js';
import {
  tallyhoRateableKill, tallyhoStreak, tallyhoRateLine, tallyhoScoreFor, tallyhoSpectatorSeat, tallyhoInSight,
} from '../src/characters/tallyhoRules.js';
import { createTallyho, tallyhoSpec } from '../src/systems/tallyho.js';
import { createBus } from '../src/core/eventBus.js';

function fixture({ sector = 'sector_rhea_cinder', runKind = 'adventure' } = {}) {
  const bus = createBus();
  const popups = [];
  bus.on('comms:popup', (p) => popups.push(p));
  const player = { id: 7, alive: true, isPlayer: true, pos: { x: 350, z: -600 }, vel: { x: 0, z: 0 } };
  const state = {
    run: { kind: runKind },
    world: { currentSectorId: sector },
    story: { flags: {} },
    simTime: 100,
    playerId: player.id,
    player,
    entityList: [player],
    entities: new Map([[player.id, player]]),
  };
  const helpers = {
    spawnEntity(spec) { const e = { id: 900 + state.entityList.length, alive: true, ...spec }; state.entityList.push(e); state.entities.set(e.id, e); return e; },
    removeEntity(id) { const e = state.entities.get(id); if (e) e.alive = false; },
    sectorCookProviders: [],
  };
  const sys = createTallyho();
  sys.init({ state, bus, helpers });
  return { state, bus, helpers, popups, sys };
}
const kill = (id, pos, extra = {}) => ({ id, killerId: 7, type: 'ship', pos: pos || { x: 400, z: -620 }, ...extra });
const rates = (popups) => popups.filter((p) => String(p.id).startsWith('tallyho_rate_'));

test('spec + spawn: marked board in sector only, announce once', () => {
  const s = tallyhoSpec();
  assert.equal(s.data.tallyho, true);
  assert.equal(s.data.authoredCharacter, 'tallyho');
  const { state, popups } = fixture();
  assert.equal(state.entityList.filter((e) => e.data?.tallyho).length, 1);
  assert.equal(popups.filter((p) => p.id === 'tallyho_announce').length, 1);
  assert.equal(fixture({ runKind: 'survival' }).state.entityList.filter((e) => e.data?.tallyho).length, 0);
  assert.equal(fixture({ sector: 'sector_io_reach' }).state.entityList.filter((e) => e.data?.tallyho).length, 0);
});

test('kill in sight rates live; score accrues durably', () => {
  const { bus, popups, state } = fixture();
  bus.emit('entity:killed', kill(55));
  const r = rates(popups);
  assert.equal(r.length, 1);
  assert.equal(r[0].text, 'ONE.');
  assert.equal(state.story.flags.tallyho_score, 1);
  assert.equal(state.story.flags.tallyho_rated, 1);
});

test('streak window: second kill inside 8s doubles; expired window resets', () => {
  const { bus, popups, state } = fixture();
  bus.emit('entity:killed', kill(55));
  state.simTime = 104;
  bus.emit('entity:killed', kill(56));
  const r = rates(popups);
  assert.equal(r[1].text, 'THAT ONE COUNTS DOUBLE!');
  assert.equal(state.story.flags.tallyho_score, 3); // 1 + 2
  state.simTime = 200; // window expired
  bus.emit('entity:killed', kill(57));
  assert.equal(rates(popups)[2].text, 'ONE.');
});

test('out-of-sight and non-player kills are not rated', () => {
  const { bus, popups } = fixture();
  bus.emit('entity:killed', kill(55, { x: 5000, z: 5000 })); // outside the ring
  bus.emit('entity:killed', kill(56, undefined, { killerId: 99 }));
  assert.equal(rates(popups).length, 0);
});

test('spectators join the rail at rate, cap at three, seats deterministic', () => {
  const { bus, state } = fixture();
  for (let i = 0; i < 12; i++) {
    state.simTime = 100 + i * 10; // spaced kills, singles
    bus.emit('entity:killed', kill(100 + i));
  }
  const specs = state.entityList.filter((e) => e.data?.tallyhoSpectator);
  assert.equal(specs.length, TALLYHO.spectatorCap);
  const s0 = tallyhoSpectatorSeat(0), s1 = tallyhoSpectatorSeat(1);
  assert.notDeepEqual(s0, s1);
  const d0 = Math.hypot(s0.x - TALLYHO.post.x, s0.z - TALLYHO.post.z);
  assert.ok(Math.abs(d0 - (TALLYHO.crowdRadius + TALLYHO.spectatorRingOffset)) < 1e-6);
});

test('player killing the board or a spectator does not rate', () => {
  const { bus, popups, state } = fixture();
  const board = state.entityList.find((e) => e.data?.tallyho);
  bus.emit('entity:killed', kill(board.id, { x: 400, z: -620 }));
  assert.equal(rates(popups).length, 0);
});

test('a spectator corpse killed inside the ring still does not rate', () => {
  // Combat marks the victim dead BEFORE entity:killed emits — a live-only crowd
  // scan would miss the just-killed spectator and let shooting the audience score.
  const { bus, popups, state } = fixture();
  for (let i = 0; i < 3; i++) {
    state.simTime = 100 + i * 10;
    bus.emit('entity:killed', kill(200 + i));
  }
  const spec = state.entityList.find((e) => e.data?.tallyhoSpectator);
  assert.ok(spec, 'a spectator parked after three rated kills');
  spec.alive = false; // the corpse is still listed when the kill event fires
  bus.emit('entity:killed', kill(spec.id, { x: 360, z: -590 })); // pos inside the ring
  assert.equal(rates(popups).length, 3, 'the rail death itself never rates');
});

test('a replacement spectator takes an empty seat, never an occupied one', () => {
  const { bus, state } = fixture();
  for (let i = 0; i < 6; i++) {
    state.simTime = 100 + i * 10;
    bus.emit('entity:killed', kill(300 + i));
  }
  const parked = state.entityList.filter((e) => e.data?.tallyhoSpectator);
  assert.equal(parked.length, 2);
  assert.deepEqual(parked.map((e) => e.data.tallyhoSeat), [0, 1]);
  parked[0].alive = false; // seat 0's sitter dies — the chair stays empty
  for (let i = 0; i < 3; i++) {
    state.simTime = 300 + i * 10;
    bus.emit('entity:killed', kill(400 + i));
  }
  const live = state.entityList.filter((e) => e.alive && e.data?.tallyhoSpectator);
  assert.equal(live.length, 2, 'the rail refills toward the cap, not past it');
  const seats = live.map((e) => e.data.tallyhoSeat).sort();
  assert.deepEqual(seats, [1, 2], 'the new arrival takes seat 2 — seat 0 stays empty');
  const survivor = live.find((e) => e.data.tallyhoSeat === 1);
  const arrived = live.find((e) => e.data.tallyhoSeat === 2);
  assert.notDeepEqual(arrived.pos, survivor.pos, 'no two live spectators share a seat');
});

test('pure rules: sight, rateable gate, streak, lines, score, seat', () => {
  assert.equal(tallyhoInSight({ x: 350, z: -600 }), true);
  assert.equal(tallyhoInSight({ x: 350 + 901, z: -600 }), false);
  assert.equal(tallyhoRateableKill(kill(5), 7, new Set()), true);
  assert.equal(tallyhoRateableKill(kill(5, undefined, { killerId: 8 }), 7, new Set()), false);
  assert.equal(tallyhoRateableKill(kill(9), 7, new Set([9])), false);
  assert.deepEqual(tallyhoStreak(0, -Infinity, 10), { count: 1, fresh: true });
  assert.deepEqual(tallyhoStreak(2, 10, 15), { count: 3, fresh: false });
  assert.equal(tallyhoRateLine(1), 'ONE.');
  assert.equal(tallyhoRateLine(2), 'THAT ONE COUNTS DOUBLE!');
  assert.equal(tallyhoScoreFor(1), 1);
  assert.equal(tallyhoScoreFor(4), 2);
});

test('destroy + re-init: provider and owned hulls clean', () => {
  const { state, helpers, sys } = fixture();
  const before = helpers.sectorCookProviders.length;
  sys.destroy();
  assert.equal(helpers.sectorCookProviders.length, before - 1);
  assert.equal(state.entityList.filter((e) => e.alive && (e.data?.tallyho || e.data?.tallyhoSpectator)).length, 0);
  sys.init({ state, bus: createBus(), helpers });
  assert.equal(state.entityList.filter((e) => e.alive && e.data?.tallyho).length, 1);
});
