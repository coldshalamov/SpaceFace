import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createLineClassMoment, lineClassMomentLines } from '../src/ui/lineClassMoment.js';
import { LINE_CLASS_NAMES } from '../src/data/lineProgression.js';

function fixture() {
  const bus = createBus();
  const shown = [];
  const cues = [];
  bus.on('audio:cue', (p) => cues.push(p));
  const plate = { show(rec) { shown.push(rec); return true; } };
  const moment = createLineClassMoment({ bus, plate });
  return { bus, shown, cues, plate, moment };
}

test('class III crossing puts exactly the three authored lines on the plate', () => {
  const f = fixture();
  try {
    f.bus.emit('line:classChanged', { classIndex: 3 });
    assert.equal(f.shown.length, 1);
    const rec = f.shown[0];
    assert.equal(rec.title, 'LINE CLASS III — CABLE');
    assert.deepEqual(rec.lines, [
      'You can now hold: loaded containers, Bruisers, a container string',
      'New move: Whip — snap the line to fling what is on it without a swing',
    ]);
  } finally { f.moment.destroy(); }
});

test('every class index has its authored name, hold and move', () => {
  assert.equal(Object.keys(LINE_CLASS_NAMES).length, 8);
  for (let i = 1; i <= 8; i++) {
    const row = LINE_CLASS_NAMES[i];
    assert.ok(row, `row ${i} exists`);
    assert.equal(typeof row.name, 'string'); assert.ok(row.name);
    assert.equal(typeof row.hold, 'string'); assert.ok(row.hold);
    assert.equal(typeof row.move, 'string'); assert.ok(row.move);
  }
});

test('class VIII plate is THE MASSLINE and the unlock cue sounds once', () => {
  const f = fixture();
  try {
    f.bus.emit('line:classChanged', { classIndex: 8 });
    assert.equal(f.shown[0].title, 'LINE CLASS VIII — THE MASSLINE');
    assert.deepEqual(f.cues.map((c) => c.id), ['sfx_achievement_fanfare']);
  } finally { f.moment.destroy(); }
});

test('unknown class indexes stay quiet and destroy drops the listener', () => {
  const f = fixture();
  f.bus.emit('line:classChanged', { classIndex: 0 });
  f.bus.emit('line:classChanged', { classIndex: 99 });
  f.bus.emit('line:classChanged', {});
  assert.equal(f.shown.length, 0);
  f.moment.destroy();
  f.bus.emit('line:classChanged', { classIndex: 3 });
  assert.equal(f.shown.length, 0);
});

test('lineClassMomentLines is pure: payload label never substitutes the authored name', () => {
  assert.deepEqual(lineClassMomentLines(1), [
    'LINE CLASS I — THREAD',
    'You can now hold: pods, crates, Wasps, small rocks',
    'New move: Swing — latch and arc',
  ]);
  assert.equal(lineClassMomentLines(null), null);
});
