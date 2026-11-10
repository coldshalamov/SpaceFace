// BM-04 — one dock, one clunk. The live dock command (src/ui/input.js doDock) emits
// `dock:docked` and then `audio:cue { id: 'ui_dock' }` on the same synchronous dispatch —
// that pair is pinned by rep-gated-docking. `_onDocked` plays `sfx_dock_clunk` at 0.9 and
// the ui_dock cue maps to the same recipe, so every dock stacked two identical clunks on
// the same tick (~+5 dB, flam/chorus on the transient). `_onDocked` owns the dock sound
// (clunk now, confirm chime deferred 180 ms); the cue echo is dropped on its tick.
// Deterministic — seed 4242 is the ear fixture seed.
import assert from 'node:assert/strict';
import test from 'node:test';

import { audio } from '../src/audio/audioSystem.js';

const SEED = 4242;
const TICK = 100;

function dockHost() {
  const plays = [];
  const host = Object.create(audio);
  // Suspended ctx: the station hum (INST-13's room, not this unit's) stays out of the
  // picture while the one-shot clunk/chime path runs through the stubbed play().
  host.rt = { ctx: { state: 'suspended', currentTime: 0 }, loops: {} };
  host.state = { tick: TICK, simTime: 0 };
  host.play = (recipeId, opts) => {
    plays.push({ recipeId, gain: opts && opts.gain });
    return { recipeId };
  };
  // Run the deferred confirm chime synchronously: the dock sequence must stay intact.
  host._defer = (fn) => { fn(); return 1; };
  return { host, plays };
}

function clunks(plays) {
  return plays.filter((p) => p.recipeId === 'sfx_dock_clunk');
}

test('the live dock pair plays exactly one clunk, then the confirm chime', () => {
  assert.equal(SEED, 4242);
  const { host, plays } = dockHost();
  // Live order from input.js doDock: dock:docked first, the ui_dock echo right after.
  host._onDocked({ stationId: 'station_helios' });
  host._onCue({ id: 'ui_dock' });

  assert.equal(clunks(plays).length, 1, 'one dock owns one clunk — the cue echo must not stack');
  assert.equal(clunks(plays)[0].gain, 0.9, 'the surviving clunk is the docked handler\'s own');
  assert.ok(
    plays.some((p) => p.recipeId === 'sfx_ui_confirm'),
    'the deferred confirm chime still plays — the sequence is intact, not muted',
  );
});

test('a ui_dock cue with no dock on its tick still speaks', () => {
  assert.equal(SEED, 4242);
  const { host, plays } = dockHost();
  // No _onDocked on this tick: a lone cue is a real voice, not an echo.
  host._onCue({ id: 'ui_dock' });
  assert.equal(clunks(plays).length, 1, 'an unowned ui_dock cue still plays its clunk');

  // And a dock on an older tick does not swallow a later cue.
  const { host: host2, plays: plays2 } = dockHost();
  host2._onDocked({ stationId: 'station_helios' });
  host2.state = { tick: TICK + 60, simTime: 1 };
  host2._onCue({ id: 'ui_dock' });
  assert.equal(clunks(plays2).length, 2, 'only the same-tick echo is dropped');
});
