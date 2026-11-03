import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { audio } from '../src/audio/audioSystem.js';
import { resolveSampleBinding, SAMPLE_MANIFEST } from '../src/audio/sampleLibrary.js';
import { CERES_WORKFLEET_CONTRACT as C } from '../src/data/ceresWorkfleet.js';
import { CERES_SHIPBREAK_MANIFEST as manifest } from '../src/data/ceresShipbreak.js';
import { createWorldSiteRecord, applyWorldSiteOperation } from '../src/systems/worldSiteKernel.js';

const stream = 'ceres-second-measure-cutter';
function boot() {
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 } };
  const head = { id: 2, type: 'wreck', alive: true, hull: 100, pos: { x: 25, z: 9 },
    data: { worldRecordId: C.identities.cutterHead, ceresWorkfleetRole: 'cutterHead', placeId: C.assets.cutterHead.id } };
  const state = { tick: 100, simTime: 100 / 60, mode: 'flight', playerId: 1,
    player: {}, settings: { video: {}, accessibility: {} }, world: { currentSectorId: C.sectorId, sectors: {} },
    entities: new Map([[1, player], [2, head]]), entityList: [player, head] };
  const bus = createBus();
  const ear = Object.create(audio); const plays = [];
  ear.init({ state, bus, helpers: {} });
  ear.play = (id, opts) => { plays.push({ id, opts }); return { id }; };
  return { state, head, bus, ear, plays };
}
function realReceipt(tick = 100) {
  const initial = createWorldSiteRecord(manifest);
  const braced = applyWorldSiteOperation(manifest, initial, { operationId: 'brace_long_plate',
    amount: 24, requestStreamId: 'player-industrial-beam', requestSequence: 1, tick: 1 });
  assert.equal(braced.ok, true);
  const cut = applyWorldSiteOperation(manifest, braced.record, { operationId: 'cut_long_plate_seam',
    amount: 0.3, requestStreamId: stream, requestSequence: tick, tick });
  assert.equal(cut.ok, true);
  assert.ok(cut.receipt.amountApplied > 0);
  return { siteId: C.siteId, componentId: 'long_plate', operationId: 'cut_long_plate_seam', receipt: cut.receipt };
}
function atTick(payload, tick) {
  return { ...payload, receipt: { ...payload.receipt, tick, requestSequence: tick } };
}

test('real site progress drives a bounded spatial drill contact; interruption produces no new voice', () => {
  const { state, bus, ear, plays } = boot();
  try {
    const payload = realReceipt();
    bus.emit('worldSite:operationReceipt', payload);
    bus.emit('worldSite:operationReceipt', payload);
    assert.equal(plays.length, 1);
    assert.deepEqual(plays[0], { id: 'sfx_mining_drill_contact', opts: { position: { x: 25, z: 9 }, gain: 0.35, captionOwned: true } });
    for (let tick = 101; tick <= 160; tick++) {
      state.tick = tick; bus.emit('worldSite:operationReceipt', atTick(payload, tick));
    }
    assert.equal(plays.length, 2, 'continuous work does not play every tick');
    // The real owner emits no operation receipt on obstruction. No loop is started or scheduled.
    state.tick = 200;
    assert.equal(plays.length, 2);
    bus.emit('worldSite:operationReceipt', atTick(payload, 200));
    assert.equal(plays.length, 3, 'fresh physical progress after a gap reattacks');
    const binding = resolveSampleBinding(plays[0].id);
    assert.equal(binding.sampleId, 'mine_drill');
    assert.equal(SAMPLE_MANIFEST.get(binding.sampleId).loop, false);
  } finally { ear.destroy(); }
});

test('rapid intermittent progress cannot stack a voice on every restart', () => {
  const { state, bus, ear, plays } = boot();
  try {
    const payload = realReceipt();
    for (let tick = 100; tick < 160; tick += 2) {
      state.tick = tick;
      bus.emit('worldSite:operationReceipt', atTick(payload, tick));
    }
    assert.equal(plays.length, 2);
  } finally { ear.destroy(); }
});

test('only current, positive autonomous receipts at the real live cutter play', () => {
  const { state, head, bus, ear, plays } = boot();
  try {
    const p = realReceipt();
    for (const bad of [
      { ...p, siteId: 'other' }, { ...p, operationId: 'brace_long_plate' },
      { ...p, receipt: { ...p.receipt, requestStreamId: 'player-industrial-beam' } },
      { ...p, receipt: { ...p.receipt, amountApplied: 0 } },
      { ...p, receipt: { ...p.receipt, amountApplied: NaN } },
      { ...p, receipt: { ...p.receipt, tick: 99 } },
    ]) bus.emit('worldSite:operationReceipt', bad);
    assert.equal(plays.length, 0);
    ear.rt._paused = true; bus.emit('worldSite:operationReceipt', p); ear.rt._paused = false;
    head.alive = false; bus.emit('worldSite:operationReceipt', p);
    assert.equal(plays.length, 0);
    head.alive = true; state.tick++;
    bus.emit('worldSite:operationReceipt', atTick(p, state.tick));
    assert.equal(plays.length, 1);
    bus.emit('sim:pause'); bus.emit('sim:resume'); state.tick++;
    bus.emit('worldSite:operationReceipt', atTick(p, state.tick));
    assert.equal(plays.length, 2, 'resume does not inherit an old cadence');
  } finally { ear.destroy(); }
});

test('captured or disabled cutters and stale or reordered receipts stay silent', () => {
  const { state, head, bus, ear, plays } = boot();
  try {
    const p = realReceipt();
    head.data.playerOwned = true; bus.emit('worldSite:operationReceipt', p);
    head.data.playerOwned = false; state.tick++;
    head.data.controlLease = 'pilot'; bus.emit('worldSite:operationReceipt', atTick(p, state.tick));
    head.data.controlLease = null; state.tick++;
    head.data.disabled = true; bus.emit('worldSite:operationReceipt', atTick(p, state.tick));
    head.data.disabled = false; state.tick++;
    bus.emit('worldSite:operationReceipt', atTick(p, state.tick));
    assert.equal(plays.length, 1);
    bus.emit('worldSite:operationReceipt', atTick(p, state.tick - 1));
    bus.emit('worldSite:operationReceipt', atTick(p, state.tick));
    assert.equal(plays.length, 1, 'old and duplicate receipts cannot re-arm audio');
  } finally { ear.destroy(); }
});

test('production play admits the authored sample through the voice budget and honors mute', () => {
  const { state, bus, ear } = boot();
  const param = () => ({ value: 0, cancelScheduledValues() {}, setValueAtTime() {},
    linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
  const node = () => ({ gain: param(), frequency: param(), detune: param(), Q: param(), pan: param(),
    playbackRate: param(), connect() {}, disconnect() {}, start() {}, stop() {} });
  const ctx = { currentTime: 1, state: 'running', sampleRate: 1000,
    createGain: node, createBiquadFilter: node, createStereoPanner: node, createBufferSource: node,
    createBuffer(channels, length, sampleRate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { sampleRate, getChannelData(i) { return data[i]; } };
    }, close() { this.state = 'closed'; return Promise.resolve(); } };
  const acquired = [];
  Object.assign(ear.rt, { ctx, sfxBus: node(), combatBus: node(), ambientBus: node(),
    _samples: { acquire(id) { acquired.push(id); return { duration: 0.7 }; }, dispose() {} } });
  ear.play = audio.play;
  state.settings.audio = { muted: false };
  try {
    const p = realReceipt();
    bus.emit('worldSite:operationReceipt', p);
    assert.deepEqual(acquired, ['mine_drill']);
    assert.equal(ear.rt.voices.length, 1);
    assert.equal(ear.rt.voices[0].recipeId, 'sfx_mining_drill_contact');
    assert.ok(ear.rt.voices[0].subVoices.some((voice) => voice.sampleLayer));
    assert.ok(ear.rt.voices[0].stopAt < 1.61, 'the sample is finite, not a sustained loop');
    state.settings.audio.muted = true; state.tick += 40; ctx.currentTime = 2;
    bus.emit('worldSite:operationReceipt', atTick(p, state.tick));
    assert.equal(ear.rt.voices.length, 1, 'master mute rejects another voice');
  } finally { ear.destroy(); }
});
