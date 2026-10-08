// The Outer Measure — pure score contract. No AudioContext.
import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTOR_BEDS, TRAVEL_MOTIF, COMBAT_MOTIF, STATION_MOTIF, WANTED_MOTIF } from '../src/audio/themeMatrix.js';
import {
  PHRASE_STEPS,
  STEPS_PER_BAR,
  eventsAt,
  chordAt,
  swingOffsetS,
  advanceCursor,
  registerFor,
  phraseMark,
  SIXTEENTH_S,
} from '../src/audio/scoreTransport.js';

const STEMS = ['A', 'B', 'C', 'D'];

test('every stem names A at every step of the phrase', () => {
  for (let step = 0; step < PHRASE_STEPS; step++) {
    assert.equal(chordAt(step).root, 'A');
    for (const stem of STEMS) {
      const row = eventsAt(step, stem, 'sector_helios_prime');
      assert.equal(row.root, 'A', `${stem} step ${step}`);
      assert.deepEqual(row.events.find((e) => e.kind === 'pad')?.tones?.map((t) => t.note) || ['A', 'C', 'E'], ['A', 'C', 'E']);
    }
  }
  const wrapped = eventsAt(PHRASE_STEPS + 4, 'A', 'sector_ceres_belt');
  assert.equal(wrapped.root, 'A');
  assert.equal(wrapped.bar, 0);
  assert.equal(wrapped.beat, 4);
});

test('travel motif is still A C E A on the contract sixteenths, and only then', () => {
  const heard = [];
  for (let step = 0; step < STEPS_PER_BAR * 4; step++) {
    const motif = eventsAt(step, 'A', 'sector_helios_prime').events.filter((e) => e.kind === 'motif');
    if (motif.length) heard.push({ step, note: motif[0].note, oct: motif[0].oct });
  }
  assert.deepEqual(heard, [
    { step: 0, note: 'A', oct: 4 },
    { step: 4, note: 'C', oct: 5 },
    { step: 8, note: 'E', oct: 5 },
    { step: 12, note: 'A', oct: 5 },
  ]);
  assert.equal(phraseMark(0), 'Outbound');
  assert.deepEqual([...TRAVEL_MOTIF.notes], ['A', 'C', 'E', 'A']);
});

test('each stem reports its own contract motif and not the others', () => {
  const expect = {
    A: [...TRAVEL_MOTIF.notes],
    B: [...WANTED_MOTIF.notes],
    C: [...COMBAT_MOTIF.notes],
    D: [...STATION_MOTIF.notes],
  };
  for (const stem of STEMS) {
    const notes = [];
    for (let beat = 0; beat < 16; beat++) {
      const motif = eventsAt(beat, stem, 'sector_helios_prime').events.find((e) => e.kind === 'motif');
      if (motif) notes.push(motif.note);
    }
    assert.deepEqual(notes, expect[stem], stem);
  }
  assert.equal(eventsAt(16, 'A', 'sector_helios_prime').events.some((e) => e.kind === 'motif'), false);
});

test('the scar is one G# then one Bb, and they do not overlap', () => {
  const scars = [];
  for (let step = 0; step < PHRASE_STEPS; step++) {
    for (const stem of STEMS) {
      for (const ev of eventsAt(step, stem, 'sector_sker_haven').events) {
        if (ev.kind === 'scar') scars.push({ step, stem, note: ev.note, dur: ev.dur });
      }
    }
  }
  assert.equal(scars.length, 2);
  assert.equal(scars[0].stem, 'A');
  assert.equal(scars[1].stem, 'A');
  assert.equal(scars[0].note, 'G#');
  assert.equal(scars[1].note, 'Bb');
  const gEnd = scars[0].step + scars[0].dur;
  assert.ok(gEnd <= scars[1].step, `G# still sounding at ${gEnd} when Bb starts ${scars[1].step}`);
  const bbEnd = scars[1].step + scars[1].dur;
  const nextA = PHRASE_STEPS;
  assert.ok(nextA - bbEnd >= 8, `only ${nextA - bbEnd} sixteenths of hole after Bb`);
  assert.equal(phraseMark(scars[0].step), 'The leading tone refuses');
  assert.equal(phraseMark(scars[1].step), 'Flat nine, unresolved');
  const padTones = new Set();
  for (let step = 0; step < PHRASE_STEPS; step += 16) {
    const pad = eventsAt(step, 'A', 'sector_helios_prime').events.find((e) => e.kind === 'pad');
    if (!pad) continue;
    for (const t of pad.tones) padTones.add(t.note);
  }
  assert.deepEqual([...padTones], ['A', 'C', 'E']);
});

test('station answers once, in the hole, a fifth below', () => {
  const bells = [];
  for (let step = 0; step < PHRASE_STEPS; step++) {
    for (const stem of STEMS) {
      for (const ev of eventsAt(step, stem, 'sector_helios_prime').events) {
        if (ev.kind === 'bell') bells.push({ step, stem, note: ev.note, oct: ev.oct });
      }
    }
  }
  assert.deepEqual(bells, [{ step: 2 * 16 + 6, stem: 'D', note: 'D', oct: 4 }]);
});

test('sector air changes brightness, not pitch, and does not touch bed signatures', () => {
  const helios = registerFor('sector_helios_prime');
  const ceres = registerFor('sector_ceres_belt');
  const sker = registerFor('sector_sker_haven');
  assert.ok(helios.cutoffMul > ceres.cutoffMul);
  assert.ok(ceres.cutoffMul > sker.cutoffMul);
  assert.equal(helios.tick, true);
  assert.equal(ceres.tick, false);
  assert.equal(sker.tick, false);
  assert.ok(sker.delaySend > helios.delaySend);
  const a = eventsAt(0, 'A', 'sector_helios_prime');
  const b = eventsAt(0, 'A', 'sector_sker_haven');
  assert.deepEqual(
    a.events.filter((e) => e.kind === 'motif').map((e) => e.note),
    b.events.filter((e) => e.kind === 'motif').map((e) => e.note),
  );
  assert.equal(SECTOR_BEDS.sector_helios_prime.signature, 'sine:82.4:triangle:164.8:0.06:1480');
  assert.equal(SECTOR_BEDS.sector_sker_haven.signature, 'sawtooth:72:square:145:0.48:720');
  const frontier = registerFor('sector_no_such_place');
  assert.notEqual(frontier.label, helios.label);
  assert.equal(eventsAt(8, 'A', 'sector_no_such_place').root, 'A');
});

test('swing leaves the motif attacks on the grid; a stalled clock does not burst', () => {
  for (const beat of [0, 4, 8, 12]) assert.equal(swingOffsetS(beat), 0);
  assert.equal(swingOffsetS(2), 0.018);
  assert.ok(swingOffsetS(1) > 0 && swingOffsetS(1) < swingOffsetS(2));
  const stalled = advanceCursor({ step: 3, nextNoteTime: 10 }, 12.5, SIXTEENTH_S, 0.1);
  assert.equal(stalled.due.length, 0);
  assert.ok(stalled.cursor.step !== 3);
  assert.ok(stalled.cursor.nextNoteTime >= 12.5);
  const steady = advanceCursor({ step: 0, nextNoteTime: 1 }, 1.05, SIXTEENTH_S, 0.1);
  assert.ok(steady.due.length >= 1 && steady.due.length <= 6);
  assert.equal(steady.due[0].step, 0);
  assert.equal(steady.due[0].when, 1);
});
