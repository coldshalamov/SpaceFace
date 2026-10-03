// Row 145 — SF-232 work cycle, SF-233 anomaly evidence, SF-240 family acceptance.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  acceptAudioFamily,
  audio,
  getBusForRecipe,
  resolveAnomalyEvidenceCue,
  resolveMachineWorkCycle,
  AUDIO_RECIPE_BY_ID,
} from '../src/audio/audioSystem.js';
import { resolveBombPhaseVoice } from '../src/audio/bombAudio.js';

test('SF-232 a live machine has a rhythm and a jam does not pretend to transfer', () => {
  const running = resolveMachineWorkCycle('running');
  const building = resolveMachineWorkCycle('building');
  const jam = resolveMachineWorkCycle('starved');
  const dark = resolveMachineWorkCycle('no-power');
  const idle = resolveMachineWorkCycle('idle');
  assert.equal(running.play, true);
  assert.equal(running.transfer, true);
  assert.equal(running.recipeId, 'sfx_work_motor');
  assert.equal(building.recipeId, running.recipeId);
  assert.equal(jam.play, true);
  assert.equal(jam.transfer, false);
  assert.equal(jam.recipeId, 'sfx_work_jam');
  assert.notEqual(jam.recipeId, running.recipeId);
  assert.equal(dark.recipeId, jam.recipeId);
  assert.equal(idle.play, false);
  assert.equal(getBusForRecipe(AUDIO_RECIPE_BY_ID.sfx_work_motor, 'sfx_work_motor'), 'ambient');
  assert.equal(AUDIO_RECIPE_BY_ID.sfx_work_motor.type, 'continuous_noise');
  assert.equal(AUDIO_RECIPE_BY_ID.sfx_work_jam.type, 'continuous_oscillator');

  const started = [];
  const host = Object.create(audio);
  host._startLoopVoice = (id) => {
    started.push(id);
    return { recipeId: id, gain: { gain: {} } };
  };
  host._endLoopVoice = () => {};
  host.rt = { loops: {} };
  host._syncMachineWork({ machineId: 'press-1', state: 'running' });
  assert.equal(host.rt.loops['work:press-1'].recipeId, 'sfx_work_motor');
  host._syncMachineWork({ machineId: 'press-1', state: 'idle' });
  assert.equal(host.rt.loops['work:press-1'], undefined);
  assert.deepEqual(started, ['sfx_work_motor']);
});

test('SF-233 anomaly swell is evidence, not a palette timer', () => {
  assert.equal(resolveAnomalyEvidenceCue({ palette: 'anomaly' }).play, false);
  assert.equal(resolveAnomalyEvidenceCue({ type: 'anomaly', scanned: false }).play, false);
  assert.equal(resolveAnomalyEvidenceCue({ type: 'ship', hostile: true }).play, false);
  const heard = resolveAnomalyEvidenceCue({ type: 'anomaly', scanned: true });
  assert.equal(heard.play, true);
  assert.equal(heard.recipeId, 'sfx_anomaly_swell');
  assert.equal(resolveAnomalyEvidenceCue({ poiType: 'anomaly', perceived: true }).play, true);

  const played = [];
  const host = Object.create(audio);
  host.play = (id) => { played.push(id); return { id }; };
  host._emitPresentationCaption = () => {};
  host.rt = {};
  host.state = {
    simTime: 20,
    entities: new Map([
      [1, { id: 1, type: 'ship', data: { ai: { combatant: true } }, pos: { x: 0, z: 0 } }],
      [2, { id: 2, type: 'anomaly', data: { scanned: false }, pos: { x: 4, z: 4 } }],
    ]),
  };
  host._noteAnomalyCandidate({ entityId: 1 });
  host._noteAnomalyCandidate({ entityId: 2 });
  host._updateAnomalyEvidence();
  assert.equal(played.length, 0, 'a hostile and a hidden anomaly stay quiet');
  host.state.entities.get(2).data.scanned = true;
  host._updateAnomalyEvidence();
  host._updateAnomalyEvidence();
  assert.deepEqual(played, ['sfx_anomaly_swell'], 'one swell per evidence window');
});

test('SF-240 a work-and-bomb family is audible, bounded, and silent when the work stops', () => {
  const motor = resolveMachineWorkCycle('running');
  const arm = resolveBombPhaseVoice('bomb_frag', 'arm');
  const live = acceptAudioFamily({
    voices: [
      { play: motor.play, gain: motor.gain, critical: false },
      { play: arm.play, gain: arm.gain, critical: false },
    ],
  });
  assert.equal(live.ok, true);
  assert.equal(live.audible, true);
  assert.equal(live.bounded, true);
  assert.equal(live.maskingCritical, false);

  const quiet = acceptAudioFamily({
    quiet: true,
    voices: [{ play: true, gain: motor.gain }],
  });
  assert.equal(quiet.ok, false, 'a muted room must not keep the family up');

  const stopped = acceptAudioFamily({
    operationStopped: true,
    voices: [{ play: false, gain: 0 }],
  });
  assert.equal(stopped.ok, true);
  assert.equal(stopped.audible, false);

  const masking = acceptAudioFamily({
    voices: [
      { play: true, gain: 0.92, critical: false },
      { play: true, gain: 0.7, critical: true },
    ],
  });
  assert.equal(masking.maskingCritical, true);
  assert.equal(masking.ok, false);
});
