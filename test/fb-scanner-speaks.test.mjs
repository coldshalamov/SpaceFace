import assert from 'node:assert/strict';
import test from 'node:test';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';
import { resolveWorldCueReceipt } from '../src/render/vfx/worldCueRecipes.js';
import { getPresentationRecipe } from '../src/presentation/cueRecipes.js';
import { resolveAudioCueRecipeId, AUDIO_RECIPE_BY_ID } from '../src/audio/audioSystem.js';

// FB-131 — the scanner speaks. Five scanner-family events that used to emit into silence now
// each produce one cue in the existing survey family: escaped / bearing / revealed. The test
// pins the routes, the per-bearing pitch climb, dedupe of replayed events, and the contract
// that an unresolved anomaly's position never leaks through the bearing cue.

function makeHarness() {
  const listeners = new Map();
  const bus = {
    on(name, fn) {
      const set = listeners.get(name) || new Set();
      listeners.set(name, set); set.add(fn);
      return () => set.delete(fn);
    },
    emit(name, payload) { for (const fn of listeners.get(name) || []) fn(payload); },
  };
  const player = { id: 1, pos: { x: 0, z: 0 }, rot: 0.25 };
  const ghost = { id: 77, alive: false, pos: { x: 900, z: -640 }, data: { isGhost: true, ghostEscaped: true } };
  const wreck = { id: 88, pos: { x: -300, z: 420 }, data: {} };
  const state = { tick: 30, simTime: 0.5, playerId: 1,
    entities: new Map([[1, player], [77, ghost], [88, wreck]]) };
  const orchestrator = Object.create(presentationOrchestrator);
  const adapters = Object.create(presentationAdapters);
  orchestrator.init({ state, bus });
  adapters.init({ state, bus });
  const cues = [];
  const audioCues = [];
  bus.on('presentation:cue', (cue) => cues.push(cue));
  bus.on('audio:cue', (cue) => audioCues.push(cue));
  return { bus, state, player, ghost, wreck, cues, audioCues, orchestrator, adapters };
}

test('fb-131: the five scanner events each land a cue in the survey family', () => {
  const h = makeHarness();
  try {
    // Real play spreads these over many ticks; the audio lane's general pool is deliberately
    // small, so the test ticks the clock between events the way the sim would.
    h.bus.emit('scanner:ghostEscaped', { entityId: 77, reason: 'beyond_escape_range', distance: 1100 });
    h.state.tick += 1;
    h.bus.emit('anomaly:bearing', { poiId: 'poi-9', accepted: true, sampleCount: 1, requiredPings: 3, bearingDeg: 42 });
    h.state.tick += 1;
    h.bus.emit('band:bearingReceipt', { requestId: 'req-1', wreckId: 88, sourceRef: 'band-3', bearingLabel: '030', canonical: true });
    h.state.tick += 1;
    h.bus.emit('scan:wreckRevealed', { entityId: 88, kind: 'wreck', quality: 'surface' });
    h.state.tick += 1;
    h.bus.emit('scan:debrisCache', { entityId: 88, wreckId: 88, via: 'beam', kind: 'debris' });
    assert.deepEqual(h.cues.map((c) => c.id), [
      'mining.survey.escaped',
      'mining.survey.bearing',
      'mining.survey.bearing',
      'mining.survey.revealed',
      'mining.survey.revealed',
    ]);
    assert.deepEqual(h.cues.map((c) => c.sourceEvent), [
      'scanner:ghostEscaped', 'anomaly:bearing', 'band:bearingReceipt',
      'scan:wreckRevealed', 'scan:debrisCache',
    ]);
    // Every variant is an authored recipe, not a silent suppress-on-missing.
    for (const id of ['mining.survey.escaped', 'mining.survey.bearing', 'mining.survey.revealed']) {
      assert.ok(getPresentationRecipe(id), `${id} must be an authored recipe`);
    }
  } finally { h.orchestrator.dispose(); h.adapters.dispose(); }
});

test('fb-131: bearing pitch climbs one step per counted ping', () => {
  const h = makeHarness();
  try {
    for (const sampleCount of [1, 2, 3]) {
      h.bus.emit('anomaly:bearing', { poiId: 'poi-9', accepted: true, sampleCount, requiredPings: 3 });
    }
    const bearings = h.cues.filter((c) => c.id === 'mining.survey.bearing');
    assert.equal(bearings.length, 3, 'each accepted bearing is its own cue, not a dedupe casualty');
    assert.deepEqual(bearings.map((c) => c.magnitude), [1, 2, 3]);
    const rates = h.audioCues.filter((c) => c.cueId === 'mining.survey.bearing').map((c) => c.rate);
    assert.equal(rates.length, 3, 'the per-tick audio floor must not swallow the counted climb');
    assert.ok(rates[0] < rates[1] && rates[1] < rates[2], `pitch must rise with count: ${rates}`);
    // Reused scan voice, not a new channel.
    for (const cue of h.audioCues.filter((c) => c.cueId === 'mining.survey.bearing')) {
      assert.equal(cue.id, 'presentation.mining.scan_bearing');
    }
  } finally { h.orchestrator.dispose(); h.adapters.dispose(); }
});

test('fb-131: rejected samples are silent and replayed bearings dedupe', () => {
  const h = makeHarness();
  try {
    h.bus.emit('anomaly:bearing', { poiId: 'poi-9', accepted: false, reason: 'angle_too_shallow', sampleCount: 2 });
    assert.equal(h.cues.length, 0, 'a rejected sample is not a bearing and must not ping');
    h.bus.emit('anomaly:bearing', { poiId: 'poi-9', accepted: true, sampleCount: 2 });
    h.bus.emit('anomaly:bearing', { poiId: 'poi-9', accepted: true, sampleCount: 2 });
    assert.equal(h.cues.length, 1, 'a replayed identical bearing inside the window emits once');
  } finally { h.orchestrator.dispose(); h.adapters.dispose(); }
});

test('fb-131: escaped ghost marks its last-known spot even though the body is gone', () => {
  const h = makeHarness();
  try {
    h.bus.emit('scanner:ghostEscaped', { entityId: 77, reason: 'beyond_escape_range', distance: 1100 });
    const cue = h.cues.find((c) => c.id === 'mining.survey.escaped');
    assert.ok(cue, 'escape emits a cue');
    assert.equal(cue.targetId, 77);
    assert.deepEqual(cue.position, { x: 900, y: 0, z: -640 }, 'the cue carries last-known position');
    const receipt = resolveWorldCueReceipt(cue, h.state);
    assert.ok(receipt, 'the mark resolves even with the ghost entity dead');
    assert.deepEqual(receipt.pos, { x: 900, y: 0, z: -640 });
    assert.equal(receipt.attachToTarget, false, 'a memory mark does not track a corpse');
  } finally { h.orchestrator.dispose(); h.adapters.dispose(); }
});

test('fb-131: a bearing never anchors at the unrevealed anomaly', () => {
  const h = makeHarness();
  try {
    // Even if a sloppy emitter leaked anomaly coordinates into the payload, the cue itself
    // carries no position and the receipt anchors at the player's own instrument.
    h.bus.emit('anomaly:bearing', { poiId: 'poi-9', accepted: true, sampleCount: 1, requiredPings: 3 });
    const cue = h.cues.find((c) => c.id === 'mining.survey.bearing');
    assert.ok(cue);
    assert.equal(cue.targetId, null, 'the anomaly is never named as the cue target');
    const receipt = resolveWorldCueReceipt(cue, h.state);
    assert.ok(receipt);
    assert.deepEqual(receipt.pos, { x: 0, y: 0, z: 0 }, 'the ping marks the player hull, not the anomaly');
    assert.equal(receipt.targetId, h.state.playerId);
    const wreck = h.state.entities.get(88);
    assert.notDeepEqual(receipt.pos, wreck.pos, 'no reveal-path coordinate may surface early');
  } finally { h.orchestrator.dispose(); h.adapters.dispose(); }
});

test('fb-131: reveals mark the body that was found', () => {
  const h = makeHarness();
  try {
    h.bus.emit('scan:wreckRevealed', { entityId: 88, kind: 'wreck', quality: 'deep' });
    const cue = h.cues.find((c) => c.id === 'mining.survey.revealed');
    assert.ok(cue);
    assert.equal(cue.targetId, 88);
    const receipt = resolveWorldCueReceipt(cue, h.state);
    assert.ok(receipt);
    assert.deepEqual(receipt.pos, { x: -300, y: 0, z: 420 }, 'the reveal blooms where the wreck is');
    assert.equal(receipt.attachToTarget, true, 'a live reveal target carries its own mark');
  } finally { h.orchestrator.dispose(); h.adapters.dispose(); }
});

test('fb-131: mapped scan voices resolve to authored recipes', () => {
  assert.equal(resolveAudioCueRecipeId('presentation.mining.scan_escaped'), 'sfx_mining_scan_escaped');
  assert.equal(resolveAudioCueRecipeId('presentation.mining.scan_bearing'), 'sfx_mining_scan_tracked');
  assert.equal(resolveAudioCueRecipeId('presentation.mining.scan_revealed'), 'sfx_mining_scan_classified');
  assert.ok(AUDIO_RECIPE_BY_ID.sfx_mining_scan_escaped, 'the falling escape tone is authored');
});
