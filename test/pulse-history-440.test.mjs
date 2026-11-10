// PULSE-HISTORY (build_map row 440) — the ship and world wear the player's history:
// keepsakes from real deeds, an earned hull decal, memorial arrays of the actually-dead, and
// graffiti about the player's deeds in sectors where the player is known.
//
// These tests pin the event contract between historyWear (reader/emitter) and the durable
// receipts it projects — deedRecord's ledger, lossLedger:recorded, livingHull's trinket shelf.

import test from 'node:test';
import assert from 'node:assert/strict';

import { historyWear, ensureHistoryWear, historyWearDead } from '../src/systems/historyWear.js';
import { recordDeed, peekDeedRecord } from '../src/systems/deedRecord.js';
import {
  livingHullWithTrinket,
  livingHullTrinkets,
  normalizeLivingHull,
} from '../src/core/livingHull.js';
import { memorialEntryForLoss, historyDecalFor, historyGraffitiFor } from '../src/data/historyWear.js';

function makeBus() {
  const emitted = [];
  const handlers = new Map();
  return {
    emitted,
    emit(evt, p) { emitted.push({ evt, p }); (handlers.get(evt) || []).forEach((fn) => fn(p)); },
    on(evt, fn) { const l = handlers.get(evt) || []; l.push(fn); handlers.set(evt, l); return () => {}; },
  };
}

function makeState() {
  return {
    simTime: 100,
    tick: 6000,
    playerId: 'player',
    meta: { seed: 42 },
    world: { currentSectorId: 's1' },
    entities: new Map(),
  };
}

function wire(state) {
  const bus = makeBus();
  const sys = Object.create(historyWear);
  sys.init({ state, bus });
  return { bus, sys };
}

test('a filed loss with a real victim name lands on the memorial array; the player-kill flag rides', () => {
  const state = makeState();
  const { bus } = wire(state);
  bus.emit('lossLedger:recorded', {
    lossId: 'L1', kind: 'ship', victimName: 'Vessa Rook', sectorId: 's1', killedByPlayer: true, t: 90,
  });
  bus.emit('lossLedger:recorded', {
    lossId: 'L2', kind: 'ship', victimName: 'Hollow June', sectorId: 's2', killedByPlayer: false, t: 95,
  });
  bus.emit('lossLedger:recorded', { lossId: 'L3', kind: 'cargo', t: 96 }); // no name → no row
  bus.emit('lossLedger:recorded', {
    lossId: 'L1', kind: 'ship', victimName: 'Vessa Rook', sectorId: 's1', killedByPlayer: true, t: 90,
  }); // replay → dedupe
  const dead = historyWearDead(state);
  assert.equal(dead.length, 2);
  assert.equal(dead[0].name, 'Vessa Rook');
  assert.equal(dead[0].byPlayer, true);
  assert.equal(dead[1].name, 'Hollow June');
  const noted = bus.emitted.filter((e) => e.evt === 'history:deadNoted');
  assert.equal(noted.length, 2);
});

test('first deed of a keepsake kind emits a trinket intent on dock; the shelf dedupes on grant', () => {
  const state = makeState();
  const { bus } = wire(state);
  recordDeed(state, { kind: 'pod_rescued', sectorId: 's1', subject: 'Pod 9' });
  recordDeed(state, { kind: 'ace_defeated', sectorId: 's2', subject: 'The Pale Count' });
  bus.emit('dock:docked', { stationId: 'st1', sectorId: 's1' });
  const trinkets = bus.emitted.filter((e) => e.evt === 'history:trinket').map((e) => e.p.id);
  assert.deepEqual(trinkets.sort(), ['ace_sigil', 'medic_tag']);
  // The hull shelf itself: grant once, replay silently.
  let hull = normalizeLivingHull(null, 0);
  hull = livingHullWithTrinket(hull, { id: 'medic_tag', label: "a medic's tag", deedId: 'd1' }, 100);
  const again = livingHullWithTrinket(hull, { id: 'medic_tag', label: "a medic's tag", deedId: 'd1' }, 200);
  assert.equal(livingHullTrinkets(again).length, 1); // replay grants nothing twice
  assert.equal(livingHullTrinkets(hull).length, 1);
  assert.equal(livingHullTrinkets(hull)[0].label, "a medic's tag");
});

test('the earned decal follows the record: outlaw deeds tag frontier, an ace kill borrows time', () => {
  const state = makeState();
  assert.equal(historyDecalFor(state), null); // empty record → no repaint
  recordDeed(state, { kind: 'kill_lawful', sectorId: 's1' });
  recordDeed(state, { kind: 'hauler_dragged', sectorId: 's1' });
  assert.equal(historyDecalFor(state), 'frontier'); // street outweighs
  const state2 = makeState();
  recordDeed(state2, { kind: 'kill_lawful', sectorId: 's1' });
  recordDeed(state2, { kind: 'ace_defeated', sectorId: 's1', subject: 'X' });
  assert.equal(historyDecalFor(state2), 'borrowed_time'); // ace kill overrides axis math
  const { bus } = wire(state2);
  bus.emit('dock:docked', { stationId: 'st1', sectorId: 's1' });
  const decal = bus.emitted.find((e) => e.evt === 'history:decal');
  assert.equal(decal.p.decalId, 'borrowed_time');
});

test('graffiti appears where the player is known — once per story, re-armed by a new loudest deed', () => {
  const state = makeState();
  const { bus } = wire(state);
  // An unknown sector says nothing.
  bus.emit('dock:docked', { stationId: 'stX', sectorId: 'quiet' });
  assert.equal(bus.emitted.filter((e) => e.evt === 'graffiti:show').length, 0);
  // A crime worth 3 (kill_lawful law −1 × weight 3 = notoriety 3 ≥ threshold) makes s1 loud.
  recordDeed(state, { kind: 'kill_lawful', sectorId: 's1', subject: 'Marshal Doe' });
  assert.ok(historyGraffitiFor(state, 's1'), 'known sector yields a line');
  bus.emit('dock:docked', { stationId: 'st1', sectorId: 's1' });
  const wall = bus.emitted.filter((e) => e.evt === 'graffiti:show');
  assert.equal(wall.length, 1);
  assert.equal(wall[0].p.where, 'airlock');
  assert.match(wall[0].p.line, /Marshal Doe/);
  // Same story, same wall — no repeat.
  bus.emit('dock:docked', { stationId: 'st1', sectorId: 's1' });
  assert.equal(bus.emitted.filter((e) => e.evt === 'graffiti:show').length, 1);
});

test('the memorial array is a shelf, not a census — bounded at HISTORY_DEAD_CAP', () => {
  const state = makeState();
  const { bus } = wire(state);
  for (let i = 0; i < 40; i++) {
    bus.emit('lossLedger:recorded', { lossId: `L${i}`, kind: 'ship', victimName: `Name ${i}`, t: i });
  }
  const dead = historyWearDead(state);
  assert.equal(dead.length, 24);
  assert.equal(dead[0].name, 'Name 16'); // oldest fell off
  assert.equal(dead[23].name, 'Name 39');
});

test('the record normalizes a dirty save without inventing dead', () => {
  const state = { story: { historyWear: { dead: 'junk', graffitiShown: null } } };
  const rec = ensureHistoryWear(state);
  assert.deepEqual(rec.dead, []);
  assert.deepEqual(rec.graffitiShown, {});
  const empty = historyWearDead({});
  assert.deepEqual(empty, []);
  assert.equal(memorialEntryForLoss({ kind: 'ship' }), null);
});
