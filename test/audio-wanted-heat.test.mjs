// WF-13 — the WANTED heat family's semantic audio: the authoritative heat:changed packet keys
// the whole family. Only edges speak: the WANTED flip and band climbs play the rising alarm
// (pitched up per band), dropping clean plays the clear sting; chips inside a band, decay
// without clear, and the first packet after a load without a real edge stay silent.
// Pure routing characterization: the AudioContext is never created here.
import assert from 'node:assert/strict';
import test from 'node:test';

import { RECIPES } from '../src/data/audioRecipes.js';
import { AUDIO_CUE_TO_RECIPE, audio } from '../src/audio/audioSystem.js';
import { heatLevelFor, THRESHOLD } from '../src/systems/heat.js';

// Level/threshold come from the producer's own math (heat.js) so a drift in the emit contract
// fails here instead of silently keeping the suite green.
function heatPacket(overrides = {}) {
  const value = overrides.value != null ? overrides.value : 0.3;
  const previousValue = overrides.previousValue != null ? overrides.previousValue : 0.2;
  return {
    value,
    previousValue,
    level: heatLevelFor(value),
    wanted: value >= THRESHOLD,
    wantedCrossed: (value >= THRESHOLD) !== (previousValue >= THRESHOLD),
    suspicion: value <= 0 ? 0 : Math.min(1, value / THRESHOLD),
    threshold: THRESHOLD,
    ...overrides,
  };
}

function hostWith(played = []) {
  const host = Object.create(audio);
  host._lastHeatLevel = null;
  host._onCue = (cue) => { played.push(cue); return null; };
  return host;
}

test('the heat family ships both recipes as ui-category data with envelopes', () => {
  const ids = RECIPES.map((recipe) => recipe.id);
  assert.equal(ids.filter((id) => id === 'sfx_wanted_alert').length, 1);
  assert.equal(ids.filter((id) => id === 'sfx_wanted_clear').length, 1);
  for (const id of ['sfx_wanted_alert', 'sfx_wanted_clear']) {
    const recipe = RECIPES.find((entry) => entry.id === id);
    assert.equal(recipe.category, 'ui', `${id} rides the ui bus`);
    assert.ok(recipe.gainEnvelope && Number.isFinite(recipe.gainEnvelope.release), `${id} has an envelope`);
  }
  assert.equal(AUDIO_CUE_TO_RECIPE.wanted_escalate, 'sfx_wanted_alert');
  assert.equal(AUDIO_CUE_TO_RECIPE.wanted_clear, 'sfx_wanted_clear');
});

test('the WANTED flip ducks and speaks louder than a band climb', () => {
  const played = [];
  const host = hostWith(played);
  host._onHeatChanged(heatPacket({ level: 1, wanted: true, wantedCrossed: true }));
  assert.equal(played.length, 1);
  assert.equal(played[0].id, 'wanted_escalate');
  assert.equal(played[0].duck, true, 'the flip owns the ear');

  const climbed = [];
  const climber = hostWith(climbed);
  climber._lastHeatLevel = 1;
  climber._onHeatChanged(heatPacket({ level: 2, wanted: true, wantedCrossed: false }));
  assert.equal(climbed.length, 1);
  assert.equal(climbed[0].id, 'wanted_escalate');
  assert.equal(climbed[0].duck, false, 'a climb inside WANTED never squelches combat audio');
  assert.ok(climbed[0].importance < 0.8, 'climbs stay below the priority-squelch threshold');
});

test('alarm pitch and gain rise with the heat band', () => {
  const played = [];
  const host = hostWith(played);
  host._lastHeatLevel = 1;
  host._onHeatChanged(heatPacket({ level: 2, wanted: true, wantedCrossed: false }));
  host._lastHeatLevel = 2;
  host._onHeatChanged(heatPacket({ level: 4, wanted: true, wantedCrossed: false }));
  assert.equal(played.length, 2);
  assert.ok(played[1].rate > played[0].rate, 'higher band is pitched up');
  assert.ok(played[1].gain > played[0].gain, 'higher band is louder');
});

test('chips inside a band, decay without clear, and level 0 are silent', () => {
  const played = [];
  const host = hostWith(played);
  host._lastHeatLevel = 3;
  host._onHeatChanged(heatPacket({ level: 3, wanted: true, wantedCrossed: false }));
  host._onHeatChanged(heatPacket({ level: 2, wanted: true, wantedCrossed: false }));
  host._onHeatChanged(heatPacket({ level: 1, wanted: false, wantedCrossed: false }));
  host._onHeatChanged(heatPacket({ level: 0, wanted: false, wantedCrossed: false }));
  assert.equal(played.length, 0, 'only edges may speak');
});

test('dropping clean plays the clear sting, not the alarm', () => {
  const played = [];
  const host = hostWith(played);
  host._lastHeatLevel = 2;
  host._onHeatChanged(heatPacket({ level: 0, wanted: false, wantedCrossed: true }));
  assert.equal(played.length, 1);
  assert.equal(played[0].id, 'wanted_clear');
});

test('the first packet after a load speaks only on a real WANTED edge', () => {
  const played = [];
  const host = hostWith(played);
  // Loaded mid-heat: a routine chip arrives with no crossing — no phantom alarm.
  host._onHeatChanged(heatPacket({ level: 3, wanted: true, wantedCrossed: false }));
  assert.equal(played.length, 0);
  // Then a genuine edge speaks.
  host._onHeatChanged(heatPacket({ level: 0, wanted: false, wantedCrossed: true }));
  assert.deepEqual(played.map((cue) => cue.id), ['wanted_clear']);
});

test('a stale cross-run level never gates the WANTED flip (in-process New Game)', () => {
  const played = [];
  const host = hostWith(played);
  // Prior run ended at heat band 4; game:started wiped state.player without a save:loaded.
  host._lastHeatLevel = 4;
  // The new run's first crime flips WANTED at band 1 — the packet edge must speak.
  host._onHeatChanged(heatPacket({ value: 0.2, previousValue: 0.1, wantedCrossed: true }));
  assert.equal(played.length, 1);
  assert.equal(played[0].id, 'wanted_escalate');
  assert.equal(played[0].duck, true);
});

test('null payloads never throw', () => {
  const played = [];
  const host = hostWith(played);
  host._onHeatChanged(null);
  host._onHeatChanged(undefined);
  assert.equal(played.length, 0);
});
