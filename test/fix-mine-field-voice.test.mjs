// fix-mine-field-voice — the specialist mine layer says when it thins.
//
// The Swarm specialist mines were loud going in (`mines:placed` has consumers) and loud going off
// (`mines:detonated`, `mines:triggered`), but a mine that simply reached its lifetime, and the
// whole layer's release between rounds, vanished into silence (`mines:expired` and
// `mines:released` had zero consumers anywhere). The player could not point at the state of a
// field they were fighting through. The arena announcer now reads mines' own receipts: one line
// per thinning episode, one line per specialist release, the sector-exit cleanup silent. Each
// episode speaks at most once per cooldown so a twelve-mine field expiring over a minute is one
// line, not twelve; a fixed dedupe id keeps the comms layer honest; a line still costs the
// announcer's per-wave budget, so a crowded round can swallow it (the same law as every hint).
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createRunState } from '../src/core/runState.js';
import { survivalAnnounce } from '../src/systems/survivalAnnounce.js';
import { MINE_FIELD_VOICE_GAP_S } from '../src/systems/survivalAnnounce.js';

function harness({ wave = 3 } = {}) {
  const said = [];
  const state = {
    mode: 'flight',
    simTime: 1000,
  };
  state.run = createRunState({ kind: 'survival', seed: 4242 });
  state.run.phase = 'active';
  state.run.wave = wave;
  const bus = createBus();
  const sys = Object.create(survivalAnnounce);
  sys.state = state;
  sys.bus = bus;
  sys._unsubs = [];
  sys._muted = false;
  sys._linesThisWave = 0;
  sys._resetWave(wave);
  bus.on('voice:say', (p) => said.push(p));
  return { sys, said, state, bus };
}

test('a specialist mine expiring says so once, and the episode stays one line', () => {
  const { sys, said, state } = harness();
  sys._onMineFieldThinning();
  assert.equal(said.length, 1, 'the thinning names itself');
  assert.equal(said[0].text, 'A specialist mine field is thinning.');
  assert.equal(said[0].id, 'survival:mines:thin');
  for (let i = 0; i < 12; i++) {
    state.simTime += 2; // twelve mines expiring over the next 24 s
    sys._onMineFieldThinning();
  }
  assert.equal(said.length, 1, 'one episode, one line, not twelve');
  state.simTime += MINE_FIELD_VOICE_GAP_S + 1;
  sys._onMineFieldThinning();
  assert.equal(said.length, 2, 'a later episode can speak again');
});

test('a specialist release says the mines are gone; a sector-exit cleanup stays silent', () => {
  const { sys, said, state } = harness();
  sys._onMineFieldReleased({ count: 6, reason: 'release', swarmSpecialist: true });
  assert.equal(said.length, 1);
  assert.equal(said[0].text, 'The specialist mines are gone from the room.');
  sys._onMineFieldReleased({ count: 4, reason: 'sector', /* no swarmSpecialist mark */ });
  assert.equal(said.length, 1, 'leaving the sector is not news');
  state.simTime += MINE_FIELD_VOICE_GAP_S + 1;
  sys._onMineFieldReleased({ count: 6, reason: 'release', swarmSpecialist: true });
  assert.equal(said.length, 2, 'a later release can speak again');
});

test('the voice obeys the announcer budget and the run gates', () => {
  const { sys, said, state } = harness();
  sys._linesThisWave = 5; // MAX_LINES_PER_WAVE: a crowded round swallows the line
  sys._onMineFieldThinning();
  assert.equal(said.length, 0, 'the per-wave budget still applies');
  sys._linesThisWave = 0;
  state.run = null; // no live run
  sys._onMineFieldThinning();
  sys._onMineFieldReleased({ swarmSpecialist: true });
  assert.equal(said.length, 0, 'no run, no voice');
});
