import assert from 'node:assert/strict';
import test from 'node:test';
import { audio, playRelayPulse } from '../src/audio/audioSystem.js';
import { createBus } from '../src/core/eventBus.js';
import { emitAdmittedRecipeCaption, localizedCaptionText } from '../src/audio/recipeCaptions.js';
import { gameLocalization } from '../src/localization/gameLocalization.js';
import { createTrailerStaging } from '../src/render/trailerStaging.js';
import { TRAILER_MOMENTS } from '../src/data/trailerMoments.js';

// Web Audio boundary only: audio.play, synthesis, recipe lookup, admission and caption
// dispatch remain production methods. No mocked play that could hide a second caption.
function param() {
  return { value: 0, cancelScheduledValues() {}, setValueAtTime() {},
    linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} };
}
function node() {
  return { gain: param(), frequency: param(), detune: param(), Q: param(), pan: param(),
    playbackRate: param(), connect() {}, disconnect() {}, start() {}, stop() {} };
}
function ear() {
  const state = { tick: 1, simTime: 1, playerId: 1, player: { heat: 0 },
    settings: { accessibility: { captions: true }, audio: { muted: false } },
    entities: new Map([[1, { id: 1, pos: { x: 0, z: 0 }, rot: 0 }]]), entityList: [] };
  const bus = createBus(), captions = [];
  bus.on('presentation:caption', p => captions.push(p));
  const host = Object.create(audio);
  host.init({ state, bus });
  const ctx = { currentTime: 1, state: 'running', sampleRate: 1000,
    createGain: node, createOscillator: node, createBiquadFilter: node,
    createStereoPanner: node, createWaveShaper: node, createBufferSource: node,
    createBuffer(channels, length, sampleRate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { sampleRate, getChannelData(i) { return data[i]; } };
    }, close() { this.state = 'closed'; return Promise.resolve(); } };
  Object.assign(host.rt, { ctx, sfxBus: node(), combatBus: node(), uiBus: node(),
    ambientBus: node(), engineBus: node(), commsBus: node(), _samples: null });
  return { host, bus, captions, state };
}

test('admitted real play emits one authored directional caption after adding the voice', () => {
  const h = ear();
  try {
    const voice = h.host.play('sfx_wanted_alert', { position: { x: -50, z: -86.60254 } });
    assert.ok(voice);
    assert.ok(h.host.rt.voices.includes(voice));
    h.bus.flush();
    assert.equal(h.captions.length, 1);
    assert.equal(h.captions[0].text, "You are wanted, 8 o'clock.");
    assert.equal(h.captions[0].assertive, true);
  } finally { h.host.destroy(); }
});

test('rejected real plays never generate a caption', () => {
  for (const reject of ['suspended', 'muted', 'unknown', 'distant', 'zero', 'budget']) {
    const h = ear();
    try {
      let id = 'sfx_wanted_alert', opts = {};
      if (reject === 'suspended') h.host.rt.ctx.state = 'suspended';
      if (reject === 'muted') h.state.settings.audio.muted = true;
      if (reject === 'unknown') id = 'not-a-recipe';
      if (reject === 'distant') opts.position = { x: 1e9, z: 0 };
      if (reject === 'zero') opts.gain = 0;
      if (reject === 'budget') h.host._reserveVoiceSlot = () => false;
      assert.equal(h.host.play(id, opts), null, reject);
      h.bus.flush();
      assert.equal(h.captions.length, 0, reject);
      assert.equal(h.host.rt.voices.length, 0, reject);
    } finally { h.host.destroy(); }
  }
});

test('real admitted named mission, payoff and sale voices do not stack generated captions', () => {
  const cases = [
    ['mission:accepted', {}, 'Mission accepted.'],
    ['mission:completed', {}, 'Mission complete.'],
    ['tech:researched', {}, 'Research complete.'],
    ['ship:purchased', { name: 'Hitch' }, 'Ship purchased: Hitch.'],
    ['achievement:unlocked', { name: 'First Blood' }, 'Achievement: First Blood.'],
    ['career:ladder:completed', {}, 'Rank attained.'],
    ['economy:tradeCompleted', { side: 'sell', profit: 40 }, 'Credits received.'],
  ];
  for (const [event, payload, expected] of cases) {
    const h = ear();
    try {
      h.bus.emit(event, payload); h.bus.flush();
      assert.equal(h.host.rt.voices.length, 1, event);
      assert.deepEqual(h.captions.map(p => p.text), [expected], event);
    } finally { h.host.destroy(); }
  }
});

test('caption ownership, UI blips and disabled captions suppress only the generated line', () => {
  const h = ear();
  try {
    assert.ok(h.host.play('sfx_wanted_alert', { captionOwned: true }));
    assert.ok(h.host.play('sfx_ui_confirm'));
    h.state.settings.accessibility.captions = false;
    assert.ok(h.host.play('sfx_wanted_alert'));
    h.bus.flush();
    assert.equal(h.captions.length, 0);
    assert.equal(h.host.rt.voices.length, 3);
  } finally { h.host.destroy(); }
});

test('helper retains canonical fallback and does not bake a second direction', () => {
  const got = [], owner = { state: {}, _emitPresentationCaption(text, opts) { got.push({ text, opts }); } };
  emitAdmittedRecipeCaption(owner, 'sfx_respawn_chime', { category: 'cue' }, { position: { x: 3, z: 4 } }, 'cue');
  assert.equal(got[0].text, 'Respawn chime.');
  assert.deepEqual(got[0].opts.position, { x: 3, z: 4 });
  emitAdmittedRecipeCaption(owner, 'sfx_player_death', {}, { captionOwned: true }, 'cue');
  assert.equal(got.length, 1);
});

test('caption formatting uses canonical localization and a bounded clock', () => {
  const previous = gameLocalization.locale;
  try {
    gameLocalization.setLocale('en-US');
    assert.equal(localizedCaptionText('Incoming telegraph.', 8), "Incoming telegraph, 8 o'clock.");
    assert.equal(localizedCaptionText('Ship lost.', null), 'Ship lost.');
    assert.equal(localizedCaptionText('Ship lost.', 13), 'Ship lost.');
    gameLocalization.setLocale('qps-ploc');
    const translated = localizedCaptionText('Ship lost.', 8);
    assert.ok(translated.includes('8'));
    assert.ok(translated.includes('⟦'));
    assert.equal(translated.includes('{caption}'), false);
    assert.equal(translated.includes('{clock}'), false);
  } finally { gameLocalization.setLocale(previous); }
});

test('existing trailer approach still reaches one real voice through audio:cue', () => {
  const h = ear(), row = TRAILER_MOMENTS.find(m => m.id === 'wreck_cathedral');
  try {
    h.state.mode = 'flight';
    h.state.world = { currentSectorId: row.sectorId };
    h.state.settings.video = { motionReduce: true };
    h.state.entityList = [h.state.entities.get(1), {
      id: 2, alive: true, pos: { x: 0, z: 0 }, data: { worldSiteId: row.source.siteId },
    }];
    const stage = createTrailerStaging(h.state, h.bus);
    const camera = { pushZoom() { assert.fail('reduced motion must not zoom'); } };
    stage.step(camera); stage.step(camera); h.bus.flush();
    assert.equal(h.host.rt.voices.length, 1);
    assert.equal(h.host.rt.voices[0].recipeId, row.music.cue);
    h.state.simTime += 20; stage.step(camera); h.bus.flush();
    assert.equal(h.host.rt.voices.length, 1, 'lingering must not replay the beat');
  } finally { h.host.destroy(); }
});


for (const kind of ['relay', 'fuel', 'mine', 'anomaly']) test(`caller-owned ${kind} caption remains single`, () => {
    const h = ear();
    try {
      if (kind === 'relay') playRelayPulse(h.host, { siteIds: ['relay'] });
      if (kind === 'fuel') h.host._onFuelEmpty();
      if (kind === 'mine') h.host._onMineCapReached({ cap: 6 });
      if (kind === 'anomaly') {
        h.state.simTime = 20;
        h.state.entities.set(2, { id: 2, type: 'anomaly', data: { scanned: true } });
        h.host.rt._anomalyCandidates = [2];
        h.host._updateAnomalyEvidence();
      }
      h.bus.flush();
      assert.equal(h.host.rt.voices.length, 1, kind);
      assert.equal(h.captions.length, 1, kind);
    } finally { h.host.destroy(); }
});

test('named event text survives rejected audio', () => {
  const h = ear();
  try {
    h.host.rt.ctx.state = 'suspended';
    h.bus.emit('mission:accepted', {}); h.bus.flush();
    assert.equal(h.host.rt.voices.length, 0);
    assert.deepEqual(h.captions.map(p => p.text), ['Mission accepted.']);
  } finally { h.host.destroy(); }
});

test('field deployment owns one caption without gating its voice', () => {
  for (const captions of [true, false]) {
    const h = ear();
    try {
      h.state.settings.accessibility.captions = captions;
      h.bus.emit('fields:deployed', { kind: 'well', center: { x: 30, z: 0 } }); h.bus.flush();
      assert.equal(h.host.rt.voices.length, 1);
      assert.equal(h.captions.length, captions ? 1 : 0);
      if (captions) assert.equal(h.captions[0].kind, 'well');
    } finally { h.host.destroy(); }
  }
});

test('visual owner preserves physical metadata and rejected-audio caption', () => {
  for (const running of [true, false]) {
    const h = ear();
    try {
      h.state.settings.video = { motionReduce: true };
      if (!running) h.host.rt.ctx.state = 'suspended';
      h.host._onVisualEventAudio({ id: 'vfx.shieldHit', position: { x: 30, z: 0 } }); h.bus.flush();
      assert.equal(h.host.rt.voices.length, running ? 1 : 0);
      assert.equal(h.captions.length, 1);
      assert.equal(h.captions[0].physical, true);
      assert.equal(h.captions[0].showVisible, true);
      assert.equal(h.captions[0].shape, 'flash');
      assert.equal(h.captions[0].text, "Shield hit, 12 o'clock.");
    } finally { h.host.destroy(); }
  }
});

test('cosmetic cadence voices stay caption-silent while anomaly evidence still speaks', () => {
  for (const kind of ['core', 'fringe', 'station', 'traffic']) {
    const h = ear();
    try {
      h.state.world = { currentSectorId: 'helios', sectors: { helios: { id: kind } } };
      h.host.rt.ctx.currentTime = 100;
      if (kind === 'core' || kind === 'fringe') h.host._updateSectorCues(100);
      else { h.host.rt._docked = kind === 'station'; h.host._updatePlaceContext(100); }
      h.bus.flush();
      assert.equal(h.host.rt.voices.length, 1, kind);
      assert.equal(h.captions.length, 0, kind);
    } finally { h.host.destroy(); }
  }
});

test('audio cue forwards an explicit existing caption owner', () => {
  const h = ear();
  try {
    h.bus.emit('audio:cue', { id: 'sfx_discovery_plate_note', captionOwned: true }); h.bus.flush();
    assert.equal(h.host.rt.voices.length, 1);
    assert.equal(h.captions.length, 0);
  } finally { h.host.destroy(); }
});
