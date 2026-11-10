// INST-13 — docked, the station has the room tone that already exists.
// Done check: dock starts `station_hum_loop`; undock stops it.
//
// The live owner is `audio._startStationHum` / `audio._stopStationHum`. They now route the
// authored `sfx_station_hum` hybrid loop (resident `station_hum_loop` sample body + the recipe's
// synth layer) onto the ambient bus instead of building a bespoke oscillator bed.
import assert from 'node:assert/strict';
import test from 'node:test';

import { audio } from '../src/audio/audioSystem.js';
import { resolveSampleBinding } from '../src/audio/sampleLibrary.js';

function dockHost(sectorId = 'sector_helios_prime') {
  const started = [];
  const ended = [];
  const host = Object.create(audio);
  host.rt = {
    ctx: { state: 'running', currentTime: 0 },
    loops: {},
    _nextVoiceId: 1,
  };
  host.state = { world: { currentSectorId: sectorId } };
  host._startLoopVoice = (recipeId, position, gain, options) => {
    const voice = {
      recipeId, position, gain, options, loop: true,
      busName: options && options.busName, id: host.rt._nextVoiceId++,
    };
    started.push(voice);
    return voice;
  };
  host._endLoopVoice = (voice) => { voice.stopped = true; ended.push(voice); };
  return { host, started, ended };
}

test('INST-13: sfx_station_hum resolves to the authored station_hum_loop sample', () => {
  const binding = resolveSampleBinding('sfx_station_hum');
  assert.ok(binding, 'the station hum recipe must be sample-backed');
  assert.equal(binding.sampleId, 'station_hum_loop');
  assert.equal(binding.loop, true, 'the authored room tone is a loop, not a one-shot');
});

test('INST-13: dock starts station_hum_loop on the ambient bus; undock stops it', () => {
  const { host, started, ended } = dockHost();

  host._startStationHum({ stationId: 'station_helios' });

  assert.equal(started.length, 1, 'dock starts exactly one station bed');
  assert.equal(started[0].recipeId, 'sfx_station_hum');
  assert.equal(started[0].options.busName, 'ambient', 'the station bed is room ambience, not engine');
  assert.ok(host.rt.loops.stationHum, 'the live loop is tracked under the stationHum key');
  assert.equal(host.rt.loops.stationHum, started[0]);

  // Idempotent: a second dock edge must not stack a second bed.
  host._startStationHum({ stationId: 'station_helios' });
  assert.equal(started.length, 1, 'a re-dock does not stack a second hum');

  host._stopStationHum();
  assert.equal(host.rt.loops.stationHum, undefined, 'undock clears the tracked bed');
  assert.equal(ended.length, 1, 'undock releases the live voice');
  assert.equal(ended[0], started[0]);

  // Stops are idempotent too.
  host._stopStationHum();
  assert.equal(ended.length, 1, 'a second undock does not release twice');
});
