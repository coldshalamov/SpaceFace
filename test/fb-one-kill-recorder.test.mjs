// FB-086 — one tape records the fight: the two-body kill ring retires in favour of the
// killcam tape (src/sim/killcamTape.js, staged by src/render/killcamStage.js).
//
// Pins: the Crucible results sheet's replay IS the killcam tape — the screen no longer renders
// the killReplay ring's words — and the tape shows the ships that were present (three ships in
// the window decode as three tracks, with the player identified), the round boundary clears it,
// and reduced motion never requests the film. Seed 4242. The ring system's registry retirement
// is held on protected src/core/registry.js + src/runtime/** (see the row report); the ring's
// own unit suite (test/wave-b9-kill-replay.test.mjs) stays green until that lands.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';
import {
  clearKillcamTape,
  decodeKillcamTape,
  isKillcamTape,
  killcamRecorder,
  killcamStageRequestFor,
  killcamSessionCensus,
  skipKillcamPlayback,
  takeKillcamTape,
} from '../src/sim/killcamTape.js';

const SEED = 4242;
const CRUCIBLE_PATH = fileURLToPath(new URL('../src/ui/screens/crucible.js', import.meta.url));

/** A survival tick with `ships` live ships (the player first) and the given tick number. */
function tickState(tick, ships) {
  return {
    tick,
    playerId: 'player',
    run: { kind: 'survival', phase: 'wave', seed: SEED },
    entityList: [
      { id: 'player', type: 'ship', alive: true, team: 0, pos: { x: tick, z: 0 }, rot: 0, radius: 14, data: { defId: 'kestrel' } },
      ...ships.map((s, i) => ({
        id: s.id ?? `wasp-${i}`,
        type: 'ship',
        alive: s.alive !== false,
        team: 1,
        pos: { x: tick + 30 + i * 25, z: 40 + i * 10 },
        rot: 1.2,
        radius: 10,
        data: { defId: 'wasp' },
      })),
    ],
  };
}

function recordScene(shipCount, ticks = 40) {
  clearKillcamTape();
  const bus = createBus();
  const ctx = { state: null, bus };
  killcamRecorder.init(ctx);
  for (let t = 0; t <= ticks; t++) {
    killcamRecorder.update(1 / 60, tickState(t, Array.from({ length: shipCount }, (_, i) => ({ id: `wasp-${i}` }))));
  }
}

test('the results sheet replays the killcam tape, not the two-body ring', () => {
  const source = readFileSync(CRUCIBLE_PATH, 'utf8');
  // The ring's results words are gone from the screen: killReplayActions named and drove them.
  for (const symbol of ['killReplayActions', 'replaySampleAt', 'skipKillReplay']) {
    assert.ok(!source.includes(symbol), `crucible.js must not consult the ring via ${symbol}`);
  }
  assert.ok(source.includes('killcamStageRequestFor'), 'the killcam tape stages the results replay');
  // The one recorder note stands in the file: the ring import retired with the words.
  assert.ok(!source.includes("from '../../systems/killReplay.js'"), 'the ring import is retired');
});

test('the tape shows the ships that were present — three in the window decode as three', () => {
  recordScene(3);
  const tape = takeKillcamTape({ seed: SEED });
  assert.ok(isKillcamTape(tape), 'the session seals a real tape');
  assert.equal(tape.seed, SEED);
  assert.ok(tape.ships.length >= 3, `three ships present must be three on the tape (got ${tape.ships.length})`);
  const view = decodeKillcamTape(tape);
  assert.ok(view, 'the stage can decode the tape');
  assert.equal(view.ships.length, tape.ships.length);
  // The player is identified on its own track, so the stage knows whose fight it plays.
  assert.equal(tape.ships.filter((s) => s.player).length, 1);
  // The hostiles kept their authored visual identity (the stage loads hulls by it).
  assert.ok(tape.ships.filter((s) => !s.player).every((s) => s.visual === 'wasp'));

  // The playback spans the window at the tape's cadence.
  assert.equal(tape.sampleRate, 30);
  assert.ok(view.seconds > 0 && view.seconds <= 5 + 1);
  // The poses replay deterministically: the same t asks the same place.
  const a = view.ships[1].poseAt(10);
  const b = view.ships[1].poseAt(10);
  assert.equal(a.x, b.x);
  assert.equal(a.z, b.z);
});

test('the round boundary clears the tape and the census empties', () => {
  recordScene(2);
  assert.ok(killcamSessionCensus().ships >= 2);
  const bus = createBus();
  killcamRecorder.init({ state: null, bus });
  bus.emit('run:started', { seed: SEED });
  assert.equal(killcamSessionCensus().ships, 0, 'run:started wipes the recorder');
  // A fresh tape is not the old one: the seal is rebuilt from the emptied ring.
  const tape = takeKillcamTape({ seed: SEED });
  assert.equal(tape.ships.length, 0);
  assert.equal(tape.rounds.length, 0);
  assert.ok(!isKillcamTape(tape), 'an emptied window is not a tape the stage would play');
});

test('reduced motion never requests the results film; a skip holds once requested', () => {
  recordScene(3);
  assert.ok(killcamStageRequestFor({ settings: { video: {} } }), 'full motion requests the film');
  clearKillcamTape();
  recordScene(3);
  assert.equal(
    killcamStageRequestFor({ settings: { video: { motionReduce: true } } }),
    null,
    'the reduce setting never requests the film',
  );
  clearKillcamTape();
  recordScene(3);
  const state = { settings: { video: {} } };
  assert.ok(killcamStageRequestFor(state));
  skipKillcamPlayback();
  assert.equal(killcamStageRequestFor(state), null, 'the visible skip stays skipped');
});
