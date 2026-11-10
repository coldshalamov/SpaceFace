// SEED-SE-15 — the timeline's damage ticks paint. `replayTapeEvents` always knew how to render
// 'damage' marks (the threat channel shares red with kills) but `addTapeMark` was only ever called
// for 'kill' and 'stunt'. Now a settled hull hit on the player marks 'damage' on the adventure
// tape at the hit's tick — band-limited so a grind paints a bounded row of ticks, never a smear,
// and the recorder still writes nothing back into gameplay state.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { canonicalStringify, snapshotSimState } from '../src/core/simSnapshot.js';
import { killReplay } from '../src/systems/killReplay.js';
import { replayTapeEvents } from '../src/ui/screens/replay.js';

const SEED = 4242;
// Mirrors TAPE_DAMAGE_MARK_GAP_TICKS in killReplay.js (1.5 s of tape).
const DAMAGE_GAP = 90;

function boot() {
  const sim = createSimulation({ seed: SEED, systems: [killReplay] });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = 'sector_ceres_belt';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8 });
  const foe = sim.spawn({ type: 'ship', team: 2, pos: { x: 60, z: 0 }, vel: { x: 0, z: 0 }, radius: 8 });
  foe.data = { callsign: 'Reaver Corsair' };
  sim.state.playerId = player.id;
  player.data = { intent: { boost: false } };
  return { sim, state: sim.state, bus: sim.bus, player, foe };
}

function stepTicks(t, n) {
  for (let i = 0; i < n; i += 1) t.sim.step();
}

function hullHit(t, extra = {}) {
  t.bus.emit('combat:damage', {
    targetId: t.player.id, attackerId: t.foe.id, isPlayer: true,
    hullHit: true, hullDamage: 12, shieldHit: false, armorHit: false,
    ...extra,
  });
}

test('a hull hit the player takes paints one damage tick at the hit tick', () => {
  const t = boot();
  stepTicks(t, 30);
  hullHit(t);
  stepTicks(t, 5);

  const recording = t.state.replay.recording;
  const marks = recording.events.filter((e) => e.type === 'damage');
  assert.equal(marks.length, 1, 'one hull hit is one mark');
  assert.equal(marks[0].tick, 29, 'the mark sits at the tape tick the hit landed on');
  assert.equal(marks[0].label, 'Reaver Corsair', 'the tick names who hit you');
  assert.equal(marks[0].actors[0].role, 'subject');
  assert.equal(marks[0].actors[0].id, String(t.player.id), 'the subject is the pilot, not the shooter');

  const painted = replayTapeEvents(recording, null).filter((e) => e.type === 'damage');
  assert.equal(painted.length, 1, 'the surface renders the mark through its own reader');
  assert.equal(painted[0].tick, 29);
});

test('shield-only chips, foreign hits, and non-player targets stay off the tape', () => {
  const t = boot();
  stepTicks(t, 30);
  // Shield-only: loud, but never touched the hull.
  t.bus.emit('combat:damage', {
    targetId: t.player.id, attackerId: t.foe.id, isPlayer: true,
    hullHit: false, shieldHit: true, shieldDamage: 40,
  });
  // A hull hit on someone else: real damage, wrong pilot.
  t.bus.emit('combat:damage', {
    targetId: t.foe.id, attackerId: t.player.id, isPlayer: false,
    hullHit: true, hullDamage: 25,
  });
  stepTicks(t, 5);
  assert.equal(t.state.replay.recording.events.length, 0, 'only settled player hull hits mark');

  // The quiet hits above must not have spent the band: a real hull hit right behind them paints.
  hullHit(t);
  stepTicks(t, 2);
  const marks = t.state.replay.recording.events.filter((e) => e.type === 'damage');
  assert.equal(marks.length, 1);
  assert.equal(marks[0].tick, 34);
});

test('a burst is one tick and a grind paints a bounded row, never a smear', () => {
  const t = boot();
  stepTicks(t, 30);
  for (let i = 0; i < 5; i += 1) hullHit(t); // five packets inside one tick of fire
  stepTicks(t, DAMAGE_GAP);
  hullHit(t);
  stepTicks(t, DAMAGE_GAP);
  hullHit(t);
  stepTicks(t, 5);

  const marks = t.state.replay.recording.events.filter((e) => e.type === 'damage');
  assert.equal(marks.length, 3, 'one tick per band gap, not one per packet');
  assert.deepEqual(marks.map((e) => e.tick), [29, 29 + DAMAGE_GAP, 29 + DAMAGE_GAP * 2]);
});

test('marking consumes the receipt and leaves the authoritative sim snapshot unchanged', () => {
  const t = boot();
  stepTicks(t, 30);
  const before = canonicalStringify(snapshotSimState(t.state));
  hullHit(t);
  assert.equal(canonicalStringify(snapshotSimState(t.state)), before,
    'the recorder reads combat:damage, it never writes back');

  t.bus.emit('game:new', {});
  stepTicks(t, 10);
  assert.equal(t.state.replay.recording.events.length, 0, 'a fresh tape clears the band too');
  hullHit(t);
  stepTicks(t, 2);
  assert.equal(t.state.replay.recording.events.filter((e) => e.type === 'damage').length, 1);
});
