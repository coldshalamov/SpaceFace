// The place answers proximity (WF-13: "nothing sounds like the place you are flying through").
// Undocked, the nearest dockable station's hum swells in as the player closes — one ambient loop
// on the docked bed's own recipe, gain shaped by the same falloff family the positioned voices
// use, silent while docked (the docked hum owns the berth) and culled beyond its radius.
import test from 'node:test';
import assert from 'node:assert/strict';

import { audio } from '../src/audio/audioSystem.js';

function host({ docked = false, paused = false, station = null } = {}) {
  const started = [];
  const ended = [];
  const gains = [];
  const host = Object.create(audio);
  host.rt = {
    ctx: { currentTime: 10 },
    loops: {},
    voices: [],
    _docked: docked,
    _paused: paused,
    _lifecycleSuspended: false,
  };
  host.state = {
    playerId: 'player',
    entities: new Map([['player', { id: 'player', pos: { x: 0, z: 0 } }]]),
    entityIndex: { stations: station ? [station] : [] },
    world: {},
  };
  host._startLoopVoice = (recipeId, position, gain, opts = {}) => {
    const voice = { recipeId, busName: opts.busName, gain: { gain: { setTargetAtTime: (v) => gains.push(v) } } };
    started.push(voice);
    return voice;
  };
  host._endLoopVoice = (v) => ended.push(v);
  host._reserveVoiceSlot = () => true;
  return { host, started, ended, gains };
}

function station(x) {
  return { id: 'st', type: 'station', alive: true, pos: { x, z: 0 }, data: { stationId: 'station_helios' } };
}

test('the hum swells in as the player closes and stops outside its radius', () => {
  const near = host({ station: station(120) });
  near.host._updateApproachHum(5);
  assert.equal(near.started.length, 1, 'inside the radius the bed starts');
  assert.equal(near.started[0].recipeId, 'sfx_station_hum');
  assert.equal(near.started[0].busName, 'ambient');
  assert.ok(near.gains[0] > 0 && near.gains[0] <= 0.028, `gain lands in the authored band, got ${near.gains[0]}`);

  const far = host({ station: station(900) });
  far.host._updateApproachHum(5);
  assert.equal(far.started.length, 0, 'past the radius nothing starts');
});

test('the falloff rises monotonically as the player closes', () => {
  let prev = -1;
  for (const d of [500, 380, 240, 120, 60]) {
    const h = host({ station: station(d) });
    h.host._updateApproachHum(5);
    const g = h.gains[0];
    assert.ok(g > prev, `gain rises as the player closes (${d} wu): ${g} > ${prev}`);
    prev = g;
  }
});

test('docked, the approach bed stays silent — the docked hum owns the berth', () => {
  const h = host({ docked: true, station: station(60) });
  h.host._updateApproachHum(5);
  assert.equal(h.started.length, 0);
});

test('a dockless platform runs no hum, and a running bed stops when the player leaves', () => {
  const dockless = host({ station: { id: 'x', type: 'station', alive: true, pos: { x: 80, z: 0 }, data: { dockless: true } } });
  dockless.host._updateApproachHum(5);
  assert.equal(dockless.started.length, 0, 'dockless bodies are silent');

  const h = host({ station: station(100) });
  h.host._updateApproachHum(5);
  h.host.rt.loops.approachHum = h.started[0];
  h.host.state.entityIndex.stations[0].pos.x = 900;
  h.host._updateApproachHum(6);
  assert.deepEqual(h.ended, [h.started[0]], 'leaving the radius releases the loop');
});
