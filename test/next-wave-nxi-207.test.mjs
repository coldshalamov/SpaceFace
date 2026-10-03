// NXI-207 — a completed comms duck releases exactly once: an older overlapping phrase cannot
// unduck a newer critical cue, and the world is never left permanently ducked.
// Owner: src/audio/cuePriorityBus.js (priority envelope); consumer seam: audioSystem._commsDuck
// /_activeCommsDuck phrase ledger (exercised read-only through its public methods).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCuePriorityBus } from '../src/audio/cuePriorityBus.js';
import { audio, COMMS_DUCK } from '../src/audio/audioSystem.js';

test('NXI-207: the older overlapping phrase cannot unduck the newer critical cue', () => {
  const bus = createCuePriorityBus();
  // Older phrase ducks at t=1000 (ends 1250); a newer critical cue overlaps at t=1100 (ends 1350).
  const older = bus.applyCue({ id: 'phrase.old', importance: 0.9 }, 1000);
  const newer = bus.applyCue({ id: 'phrase.new', importance: 0.85 }, 1100);
  assert.ok(older && newer, 'both priority cues must admit envelopes');
  assert.equal(bus.activeEnvelope(1100), newer, 'the newer critical cue owns the bow');
  // The older phrase's own expiry (1250) passes while the newer is still live.
  assert.equal(bus.gainFor('weaponLoop', 1260), newer.duckGain,
    "the older phrase's release must not unduck the newer critical cue");
  assert.equal(bus.gainFor('engineLoop', 1260), newer.duckGain);
  // The newer phrase releases exactly once, at its own end — no permanent duck.
  assert.equal(bus.gainFor('weaponLoop', 1360), 1, 'the duck must release after the last phrase');
  assert.equal(bus.activeEnvelope(1360), null);
  // A neighboring legitimate cue still works: non-priority admits no duck and disturbs nothing;
  // unaffected lanes were never ducked even inside the overlap window.
  assert.equal(bus.applyCue({ id: 'chatter', importance: 0.5 }, 1400), null);
  assert.equal(bus.gainFor('weaponLoop', 1450), 1);
  assert.equal(bus.gainFor('music', 1200), 1, 'music is never ducked by the cue-priority envelope');
  assert.equal(bus.gainFor('comms', 1200), 1, 'the voice itself never bows');
  // A later phrase re-ducks cleanly — release was complete, not a stuck open state.
  const again = bus.applyCue({ id: 'phrase.next', importance: 0.9 }, 1500);
  assert.ok(again);
  assert.equal(bus.gainFor('weaponLoop', 1600), again.duckGain);
});

test('NXI-207: comms phrase ledger releases each phrase once and keeps the newer bow', () => {
  // One runtime; the audio clock and wall clock are stepped deterministically.
  const rt = { ctx: { currentTime: 10 }, _busGainCache: {} };
  let wall = 5000;
  const ctx = { rt, _wallClockMs: () => wall };
  // Two overlapping critical phrases through the live consumer seam.
  audio._commsDuck.call(ctx, 1.0, 0.5);            // phrase A: ends audio 11.0 / wall 6000
  rt.ctx.currentTime = 10.4; wall = 5400;
  audio._commsDuck.call(ctx, 1.0, 0.4);            // phrase B: ends audio 11.4 / wall 6400
  assert.equal(rt._commsPhrases.length, 2);
  // Inside the overlap both phrases live; the furthest-end phrase's gain owns the bow.
  wall = 5900;
  assert.equal(audio._activeCommsDuck.call(ctx, 10.9), 0.4);
  // The OLDER phrase completes (audio clock past 11.0, wall past 6000) while B still speaks —
  // the world must stay ducked for the newer phrase, not prematurely release to 1.
  rt.ctx.currentTime = 11.05; wall = 6050;
  assert.equal(audio._activeCommsDuck.call(ctx, 11.05), 0.4,
    "the older phrase's release must not unduck the newer critical phrase");
  assert.equal(rt._commsPhrases.length, 1, 'the finished phrase released exactly once');
  assert.equal(rt._commsDuckUntilS, 11.4);
  // When the newer phrase also completes, the duck releases — nothing stays permanently bowed.
  rt.ctx.currentTime = 11.5; wall = 6500;
  assert.equal(audio._activeCommsDuck.call(ctx, 11.5), 1);
  assert.equal(rt._commsPhrases.length, 0);
  assert.equal(rt._commsDuckUntilS, 0);
  // Neighboring success: a later phrase re-ducks at the authored level, then releases.
  rt.ctx.currentTime = 12; wall = 7000;
  audio._commsDuck.call(ctx, 0.5);
  assert.equal(audio._activeCommsDuck.call(ctx, 12.1), COMMS_DUCK.gain);
  rt.ctx.currentTime = 13; wall = 7600;
  assert.equal(audio._activeCommsDuck.call(ctx, 13), 1);
});
