// inf-scar-seats — a hull you keep hitting in the same place grows a real wound there.
//
// Sustained fire kept its last marks on a hull (scar-history), but every strike still spawned
// its own sibling: a hull chewed on one spot read as a scatter of identical round pocks, never
// as a wound growing where the fire was working. Now a strike landing inside an existing kept
// seat is absorbed by it: the wound widens a step, reheats under the fresh hit, and creeps
// along the fire path. Spread fire still scatters; a worked-over seat visibly deepens.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  SCAR_SEAT_CREEP,
  SCAR_SEAT_GROWTH,
  SCAR_SEAT_HEIGHT_CAP_WU,
  SCAR_SEAT_RADIUS_SCALE,
  SCAR_SEAT_REHEAT_FRACTION,
  SCAR_SEAT_WIDTH_CAP_WU,
  findScarSeat,
  reinforceScarSeat,
} from '../src/render/weapons/scarSeats.js';
import { HullScorchPool } from '../src/render/weapons/contactMarks.js';

function keptSeat(overrides = {}) {
  return {
    alive: 1,
    persistent: true,
    targetId: 'hull-1',
    boundKey: 'bk-1',
    localX: 10, localY: 0.08, localZ: -4,
    width: 1.8, height: 1.15,
    life: 75,
    age: 20,
    ...overrides,
  };
}

test('a strike inside a kept seat finds that seat; outside its reach spawns fresh', () => {
  const slots = [keptSeat()];
  assert.equal(findScarSeat(slots, 'hull-1', 'bk-1', 11, 0.08, -4.4), 0, 'a strike inside the wound is absorbed');
  assert.equal(findScarSeat(slots, 'hull-1', 'bk-1', 20, 0.08, -4), -1, 'a distant strike is its own mark');
});

test('only persistent, identity-matching marks count as seats', () => {
  const slots = [
    keptSeat({ alive: 0 }),                       // retired
    keptSeat({ persistent: false }),              // a still-transient splash
    keptSeat({ targetId: 'hull-2' }),             // another hull
    keptSeat({ boundKey: 'bk-2' }),               // a replacement hull reuses the id
    keptSeat(),                                   // the real seat
  ];
  assert.equal(findScarSeat(slots, 'hull-1', 'bk-1', 10, 0.08, -4), 4,
    'dead, transient, foreign and identity-stale marks are not seats');
  assert.equal(findScarSeat(null, 'hull-1', 'bk-1', 10, 0, -4), -1);
  assert.equal(findScarSeat(slots, null, 'bk-1', 10, 0, -4), -1);
});

test('the nearest seat wins when two overlap', () => {
  const slots = [
    keptSeat({ localX: 8, width: 1.8 }),
    keptSeat({ localX: 12, width: 2.6 }),
  ];
  const idx = findScarSeat(slots, 'hull-1', 'bk-1', 11.4, 0.08, -4);
  assert.equal(idx, 1, 'the closer, bigger wound absorbs the hit');
});

test('absorbed hits widen the wound, faster across than along', () => {
  const seat = keptSeat();
  const before = { w: seat.width, h: seat.height };
  reinforceScarSeat(seat, 11, 0.08, -4.4);
  assert.ok(seat.width > before.w, 'the wound widens');
  assert.ok(seat.height > before.h, 'the wound deepens');
  const dw = seat.width - before.w;
  const dh = seat.height - before.h;
  assert.ok(dw > dh, `widening outpaces lengthening (${dw.toFixed(3)} vs ${dh.toFixed(3)})`);
  assert.ok(Math.abs(dw - before.w * SCAR_SEAT_GROWTH) < 1e-9);
});

test('growth is bounded: a seat never swallows the panel it sits on', () => {
  const seat = keptSeat();
  for (let i = 0; i < 60; i++) reinforceScarSeat(seat, 10.2, 0.08, -4.1);
  assert.ok(Math.abs(seat.width - SCAR_SEAT_WIDTH_CAP_WU) < 1e-9, `width caps (${seat.width.toFixed(2)})`);
  assert.ok(Math.abs(seat.height - SCAR_SEAT_HEIGHT_CAP_WU) < 1e-9, `height caps (${seat.height.toFixed(2)})`);
});

test('continued fire reheats the wound', () => {
  const seat = keptSeat({ age: 40 }); // a cool, old scar
  const plan = reinforceScarSeat(seat, 10.1, 0.08, -4);
  assert.ok(plan.reheated, 'the hit pulls the scar back toward hot');
  assert.ok(Math.abs(seat.age - seat.life * SCAR_SEAT_REHEAT_FRACTION) < 1e-9,
    'the reheat lands on the young fraction of life');
  // A freshly-hot seat does not reheat further.
  const plan2 = reinforceScarSeat(seat, 10.1, 0.08, -4);
  assert.equal(plan2.reheated, false);
});

test('the wound creeps along the fire path, never teleporting', () => {
  const seat = keptSeat();
  const sx = seat.localX, sz = seat.localZ;
  for (let i = 0; i < 8; i++) reinforceScarSeat(seat, 16, 0.08, -4);
  assert.ok(seat.localX > sx, 'the wound drifts toward where the fire is landing');
  assert.ok(seat.localX < 16, `it never jumps to the strike point (${seat.localX.toFixed(2)})`);
  // One step moves exactly the creep fraction.
  const s2 = keptSeat();
  reinforceScarSeat(s2, 12, 0.08, -4);
  assert.ok(Math.abs(s2.localX - (sx * (1 - SCAR_SEAT_CREEP) + 12 * SCAR_SEAT_CREEP)) < 1e-9);
});

test('an absorbed strike never spawns: a one-seat beating keeps one pool slot', () => {
  const pool = new HullScorchPool(null);
  // Seat one persistent scar the way the fight does (history says persistent from strike 3).
  pool.spawn({ targetId: 'hull-1', boundKey: 'bk-1', localX: 10, localY: 0.08, localZ: -4,
    width: 1.8, height: 1.15, life: 75, persistent: true });
  // Nine more strikes land inside that seat.
  for (let i = 0; i < 9; i++) {
    const idx = findScarSeat(pool.slots, 'hull-1', 'bk-1', 10.3 + i * 0.05, 0.08, -4.1);
    if (idx >= 0) reinforceScarSeat(pool.slots[idx], 10.3 + i * 0.05, 0.08, -4.1);
    else pool.spawn({ targetId: 'hull-1', boundKey: 'bk-1', localX: 10.3 + i * 0.05, localY: 0.08,
      localZ: -4.1, width: 1.8, height: 1.15, life: 75, persistent: true });
  }
  assert.equal(pool.live, 1, 'the beating deepened one wound instead of scattering ten marks');
  assert.ok(pool.slots[0].width > 3.2, `the wound grew across the fight (${pool.slots[0].width.toFixed(2)})`);
  // Spread fire still opens new marks.
  const far = findScarSeat(pool.slots, 'hull-1', 'bk-1', 26, 0.08, 12);
  assert.equal(far, -1, 'a strike away from the wound is its own fresh mark');
  pool.dispose();
});

test('non-seats are rejected by the reinforcement law too', () => {
  const plan = reinforceScarSeat(keptSeat({ alive: 0 }), 10, 0, -4);
  assert.equal(plan.grew, false, 'a dead slot is not a wound');
  assert.equal(reinforceScarSeat(null, 10, 0, -4).grew, false);
});

test('the live owner is wired: absorption happens before the history book and never spawns', () => {
  const presenter = readFileSync(new URL('../src/render/weapons/presenter.js', import.meta.url), 'utf8');
  assert.match(presenter, /import \{ findScarSeat, reinforceScarSeat \} from '\.\/scarSeats\.js';/);
  const seat = presenter.indexOf('const seatIndex = findScarSeat(');
  const book = presenter.indexOf('noteHullScorchStrike(');
  assert.ok(seat >= 0 && book > seat, 'the seat check runs before the kept-mark book');
  assert.match(presenter, /if \(seatIndex >= 0\) \{\s*reinforceScarSeat\(this\.scorches\.slots\[seatIndex\]/s,
    'an absorbed strike reinforces the wound and skips the spawn');
});
