// SFQ-B063 — a failed rescue beat restages the body. The recovery line is spoken
// once; a second miss of the same beat does not lecture again.
import test from 'node:test';
import assert from 'node:assert/strict';

import { onboarding } from '../src/systems/onboarding.js';
import { freshRescueState, rescueBeatLine } from '../src/onboarding/rescueOpening.js';

function harness() {
  const said = [];
  const tutorial = [];
  const bus = {
    on() {},
    emit(event, payload) {
      if (event === 'tutorial:say') tutorial.push(payload);
    },
  };
  const sys = Object.create(onboarding);
  const rescue = freshRescueState();
  rescue.current = 'swing';
  rescue.beats.swing.state = 'current';
  sys.state = {
    meta: { seed: 4242 },
    simTime: 40,
    onboarding: { rescue, finished: false, active: true, beatAction: null },
  };
  sys.bus = bus;
  sys.helpers = {
    voice: {
      say(packet) { said.push(packet); return true; },
    },
  };
  sys._respawnRescueSlot = () => {};
  sys._setRescueWaypoint = () => {};
  sys._refreshBeatPanel = () => {};
  return { sys, said, tutorial };
}

test('seed 4242: the first rescue miss speaks recovery; the next miss only restages', () => {
  const { sys, said, tutorial } = harness();
  const line = rescueBeatLine('swing');
  sys._rescueFail('swing', 'rock destroyed');
  assert.equal(said.length, 1);
  assert.equal(said[0].channel, 'tutorial');
  assert.equal(said[0].text, line);
  assert.equal(said[0].id, 'tutorial:beat');
  assert.equal(tutorial.length, 1);
  assert.equal(sys.state.onboarding.beatAction, line);
  assert.equal(sys.state.onboarding.rescue.beats.swing.fails, 1);

  sys._rescueFail('swing', 'rock drifted out of reach');
  assert.equal(said.length, 1, 'a later fail of the same beat does not re-lecture');
  assert.equal(tutorial.length, 1);
  assert.equal(sys.state.onboarding.beatAction, line);
  assert.equal(sys.state.onboarding.rescue.beats.swing.fails, 2);
  assert.equal(sys.state.onboarding.rescue.current, 'swing');
});
