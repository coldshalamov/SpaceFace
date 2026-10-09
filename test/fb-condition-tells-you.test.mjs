// FB-065 — a physics contract condition says when it is pending, progressing or broken, in
// flight. The HUD objective slot consumes the three states missions.js already emits:
// pending shows the term, progress shows the fraction, broken swaps the word for four
// seconds and speaks once through the voice arbiter at mission priority. Progress is
// never voiced.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  announceTermBreak,
  flightDestinationSurface,
  MISSION_TERM_BROKEN_HOLD_S,
  missionTermWord,
  noteMissionTermEvent,
} from '../src/ui/hud.js';

const MISSION_ID = 'mi_slackline_4242';

function harnessState() {
  return {
    simTime: 100,
    meta: { seed: 4242 },
    ui: { trackedMissionId: MISSION_ID },
    missions: {
      active: [{
        id: MISSION_ID,
        type: 'tow_recovery',
        status: 'active',
        title: 'Tow the slag core',
        deadline_s: null,
        clauses: [{ conditionId: 'no_slack', kind: 'forbid' }],
      }],
    },
    entities: new Map(),
    nav: { waypoint: null },
    world: { currentSectorId: 'sector_ceres_belt' },
  };
}

test('FB-065 pending → progress → broken: the objective line carries the term', () => {
  const state = harnessState();

  // PENDING — a turn-in refusal names the term. The objective shows the term, no fraction.
  noteMissionTermEvent(state, {
    missionId: MISSION_ID, conditionId: 'no_slack', label: 'Line under tension', remaining: 1,
  }, 'pending');
  let word = missionTermWord(state, MISSION_ID);
  assert.equal(word.word, 'PENDING');
  assert.match(word.text, /Line under tension/);

  // PROGRESS — the per-tick scorer counts; the objective shows the fraction.
  noteMissionTermEvent(state, {
    missionId: MISSION_ID, conditionId: 'no_slack', kind: 'forbid',
    label: 'Line under tension', count: 0, target: 1,
  }, 'progress');
  // A 0/1 count is still a progress read — the fraction is what the player watches.
  noteMissionTermEvent(state, {
    missionId: MISSION_ID, conditionId: 'vent_rhythm', kind: 'require',
    label: 'Three clean vents', count: 2, target: 3,
  }, 'progress');
  word = missionTermWord(state, MISSION_ID);
  assert.equal(word.word, '2/3');
  assert.match(word.text, /2\/3/);

  // BROKEN — the scripted slack-line break on seed 4242: the word swaps and holds 4 s.
  state.simTime = 140;
  noteMissionTermEvent(state, {
    missionId: MISSION_ID, conditionId: 'no_slack', event: null,
    label: 'Line under tension', onBreach: 'forfeit',
  }, 'broken');
  word = missionTermWord(state, MISSION_ID);
  assert.equal(word.word, 'BROKEN');
  assert.match(word.text, /^TERM BROKEN — Line under tension$/);

  // The whole surface paints it on the tracked mission's single objective line.
  const surface = flightDestinationSurface(state, {
    owner: 'tracked-mission', mission: state.missions.active[0], waypoint: null,
  });
  assert.ok(surface.show);
  assert.match(surface.line, /TERM BROKEN — Line under tension/);
  assert.equal(surface.urgent, true, 'a broken term takes the urgent tone while it holds');

  // Exactly four seconds, then the word falls silent — the consequence is the mission's,
  // not the slot's. At +3.9 it still speaks; at +4.1 it is gone.
  state.simTime = 140 + MISSION_TERM_BROKEN_HOLD_S - 0.1;
  assert.equal(missionTermWord(state, MISSION_ID).word, 'BROKEN');
  state.simTime = 140 + MISSION_TERM_BROKEN_HOLD_S + 0.1;
  assert.equal(missionTermWord(state, MISSION_ID), null);
});

test('FB-065: a satisfied term reads MET, and a settled mission stops speaking', () => {
  const state = harnessState();
  noteMissionTermEvent(state, {
    missionId: MISSION_ID, conditionId: 'clean_release', label: 'One clean release',
  }, 'satisfied');
  const word = missionTermWord(state, MISSION_ID);
  assert.equal(word.word, 'MET');
  const surface = flightDestinationSurface(state, {
    owner: 'tracked-mission', mission: state.missions.active[0], waypoint: null,
  });
  assert.match(surface.line, /TERM One clean release — MET/);
});

test('FB-065: the break voices once at mission priority; forfeit stays silent (already voiced)', () => {
  const said = [];
  const bus = { emit: (name, payload) => said.push({ name, payload }) };

  // 'fail' path — the breach otherwise only toasts, so the HUD speaks it once.
  const ok = announceTermBreak(bus, {
    missionId: MISSION_ID, conditionId: 'weapons_cold', onBreach: 'fail',
    label: 'Weapons cold',
  });
  assert.equal(ok, true);
  assert.equal(said.length, 1);
  assert.equal(said[0].name, 'voice:say');
  assert.equal(said[0].payload.channel, 'objective', 'mission priority is the objective channel');
  assert.match(said[0].payload.id, /^mission-term-broken:/);
  assert.match(said[0].payload.text, /Weapons cold/);

  // 'forfeit' path — missions already voices the same break through comms; a second line
  // would double-speak one event.
  const ok2 = announceTermBreak(bus, {
    missionId: MISSION_ID, conditionId: 'no_slack', onBreach: 'forfeit',
    label: 'Line under tension',
  });
  assert.equal(ok2, false);
  assert.equal(said.length, 1, 'the forfeit break is voiced once total, by its owner');

  // Progress is never voiced — announceTermBreak is the only voice path and it never runs
  // for a progress event by construction (the mount wires it to conditionBroken only).
  const progressPayload = {
    missionId: MISSION_ID, conditionId: 'vent_rhythm', kind: 'require',
    label: 'Three clean vents', count: 2, target: 3,
  };
  const state = harnessState();
  noteMissionTermEvent(state, progressPayload, 'progress');
  assert.equal(said.length, 1, 'noting progress emits no voice traffic');
});
