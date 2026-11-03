import test from 'node:test';
import assert from 'node:assert/strict';
import { audio } from '../src/audio/audioSystem.js';
import { readTetherLoad } from '../src/audio/elementaryVoices.js';
import { TETHER_TONE_SILENCE, resolveTetherTone } from '../src/audio/masslineInstrument.js';

function legacyHost(tether) {
  const writes = { rope: [], spool: [] };
  const param = (out) => ({ setTargetAtTime: (value, _now, time) => out.push({ value, time }) });
  const host = Object.create(audio);
  host.state = { player: { tether }, settings: { video: {} }, entities: new Map([[9, { id: 9, alive: true, mass: 400 }]]) };
  host.rt = {
    ctx: { currentTime: 1 }, sidechainDuck: 1,
    tetherOsc: { frequency: param([]) }, tetherHum: { gain: param(writes.rope) },
    tetherOverloadOsc: { frequency: param([]) }, tetherOverloadGain: { gain: param([]) },
    _tetherSpoolOsc: { frequency: param([]) }, _tetherSpoolGain: { gain: param(writes.spool) },
  };
  host._playAccessibilityCue = () => {};
  return { host, writes };
}

const line = { active: true, targetId: 9, phase: 'loaded', load: 0.55, strain: 0.2,
  lineControl: true, reeling: true, lineLengthRate: -0.4, reelStrength: 0.6 };

test('a slack attached heavy tow whispers, its winch works, and the line carries mass when taut', () => {
  const { host, writes } = legacyHost({ ...line });
  host._updateTetherHum();
  const loadedGain = writes.rope.at(-1).value;
  assert.ok(loadedGain > TETHER_TONE_SILENCE);
  assert.ok(writes.spool.at(-1).value > TETHER_TONE_SILENCE);

  const slack = { ...line, phase: 'slack', load: 0, strain: 0 };
  host.state.player.tether = slack;
  host._updateTetherHum();
  const unladen = resolveTetherTone({ tether: slack });
  assert.equal(writes.rope.at(-1).value, unladen.gain, 'the actual legacy owner hears no false mass');
  assert.ok(unladen.gain > TETHER_TONE_SILENCE && unladen.gain < loadedGain, 'the authored slack whisper remains');
  assert.ok(host.rt._tetherSpoolGain.gainValue > TETHER_TONE_SILENCE, 'a moving slack winch still works');
  assert.deepEqual(readTetherLoad(slack, 400), readTetherLoad(slack), 'Elementary receives the same unladen slack read');

  host.state.player.tether = { ...line, phase: 'capture' };
  host._updateTetherHum();
  assert.equal(writes.rope.at(-1).value, loadedGain, 'mass returns as the line catches');
  assert.equal(readTetherLoad(host.state.player.tether, 400).load, 1);
  host.state.player.tether = { ...line, active: false, phase: 'slack', load: 0, strain: 0, reeling: false };
  host._updateTetherHum();
  assert.equal(writes.rope.at(-1).value, TETHER_TONE_SILENCE);
  assert.equal(host.rt._tetherSpoolGain.gainValue, TETHER_TONE_SILENCE);
});

test('the mounted Elementary backend follows the same slack-to-capture transition', () => {
  const host = Object.create(audio);
  host.state = {
    mode: 'flight', playerId: 1,
    entities: new Map([[1, { id: 1, flags: {} }], [9, { id: 9, mass: 400 }]]),
    input: { moveZ: 0, moveX: 0 },
    player: { tether: { ...line, phase: 'slack', load: 0, strain: 0 } },
    settings: { video: {} },
  };
  host.rt = {
    ctx: { currentTime: 1, state: 'running' }, _paused: false,
    _elemNode: { disconnect() {} }, _elemCore: { render() {} },
    _elemVoice: { engineGain: 0, ropeGain: 0 }, sidechainDuck: 1, _priorityDuckEngine: 1,
  };
  host._pushElementaryVoices(0.25);
  const slack = { ...host.rt._elemVoice };
  host.state.player.tether = { ...line, phase: 'capture' };
  host._pushElementaryVoices(0.25);
  const capture = host.rt._elemVoice;
  assert.ok(capture.ropeHz > slack.ropeHz);
  assert.ok(capture.ropeGain > slack.ropeGain);
});
