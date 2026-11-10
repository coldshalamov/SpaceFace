// L-EAR (FINISH_LANES §11) — one moment, one voice.
//
// Three regressions the lane's done bar exposed, pinned at the audio layer they live in:
//
// 1. THE LATCH DOUBLED ITS OWN LOCK. The attachment service emits tether:attached first on the
//    latch tick; the Massline instrument answers with the layered signature `sfx.tetherLatch`,
//    whose layers already include `sfx_tether_latch_lock`. tetherGameplay then emits
//    tether:latched on the same tick, and the verb-table handler played `sfx_tether_latch_lock`
//    again — the rope's own transient stacked on itself (two clicks for one latch). The instrument
//    now stamps the tick its attach voice actually started, and the verb voice stands down for
//    that tick only.
//
// 2. THE KILL SIGNATURE WAS A DEAD RECIPE. `sfx.killConfirmed` (the authored layered reward:
//    blended sine+noise body + rising confirm) was named by the first-hour signature table and
//    bound to a sample, but nothing ever played it: `_onKilled` scheduled a mass-graded body plus
//    a bare `sfx_kill_confirm` layer instead. A mid-band player kill IS that composite — its body
//    is literally the composite's two layers — so the handler now schedules the authored bundle
//    once for the mid band, and the verb table names it. Light/heavy/capital keep the graded
//    split: the composite's fixed body would mis-voice their mass.
//
// 3. A CROWDED DOCK COULD MUTE THE ROOM. `_startLoopVoice` refuses at the voice cap with no
//    displacement, and the station hum only starts on the dock edge / boundary reconcile — so
//    docking while one-shot tails saturated the pool left the whole stay silent. The hum now
//    claims the worst disposable slot, the same admission a one-shot gets; the admitted hum is
//    itself non-disposable (an unpositioned loop), so later one-shots cannot evict it.
//
// Harnesses follow fb-kill-mass-ladder / l-ear-weak-point-cue: Object.create(audio) hosts with a
// recording play() stub; the latch path drives the real event-bus subscriptions through init().
// Deterministic: fixed ticks, no wall clock. Seed 4242 is the ear fixture seed.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { RECIPES } from '../src/data/audioRecipes.js';
import {
  audio,
  MAX_AUDIO_VOICES,
  voiceBudgetDisposable,
} from '../src/audio/audioSystem.js';
import { combatVerbRecipe } from '../src/audio/combatVerbCues.js';

const SEED = 4242;
const recipeById = new Map(RECIPES.map((r) => [r.id, r]));

// ── Harness A: real bus + real subscriptions, recording play stub ─────────────────────────────
// init() installs every audio bus handler; the stub replaces play() after init so the assertion
// reads exactly what the handlers scheduled.
function latchHost(tick = 42) {
  const played = [];
  const bus = createBus();
  const state = {
    tick,
    simTime: 10,
    playerId: 'player',
    player: { tether: { active: true, phase: 'loaded', load: 0.4, strain: 0.3 } },
    entities: new Map(),
    entityList: [],
    ui: {},
    world: {},
    settings: {},
    audioRuntime: {},
  };
  const host = Object.create(audio);
  host.init({ state, bus, helpers: {} });
  host.play = (id, opts = {}) => { played.push(id); return { id }; };
  return { host, bus, state, played };
}

test('L-EAR seed 4242: a real latch speaks the instrument once — no doubled lock layer', () => {
  assert.equal(SEED, 4242);
  const { bus, state, played } = latchHost(42);
  bus.emit('tether:attached', { attachmentId: 'a1', targetId: 'e1', pos: { x: 0, z: 0 } });
  bus.emit('tether:latched', { attachmentId: 'a1', targetId: 'e1', pos: { x: 0, z: 0 } });
  assert.deepEqual(played, ['sfx.tetherLatch'],
    `one latch, one layered voice — got ${played.join(', ')}`);
  assert.ok(!played.includes('sfx_tether_latch_lock'),
    'the lock recipe is already a layer inside sfx.tetherLatch');
});

test('L-EAR seed 4242: a bare tether:latched with no same-tick attach keeps the verb voice', () => {
  const { bus, state, played } = latchHost(42);
  bus.emit('tether:latched', { attachmentId: 'a2', targetId: 'e2', pos: { x: 0, z: 0 } });
  assert.deepEqual(played, ['sfx_tether_latch_lock'],
    `standalone latches (legacy/test routes) still resolve their verb — got ${played.join(', ')}`);

  // A new latch on a later tick speaks its own signature again; the stamp only guards its tick.
  played.length = 0;
  state.tick = 50;
  bus.emit('tether:attached', { attachmentId: 'a3', targetId: 'e3', pos: { x: 0, z: 0 } });
  bus.emit('tether:latched', { attachmentId: 'a3', targetId: 'e3', pos: { x: 0, z: 0 } });
  assert.deepEqual(played, ['sfx.tetherLatch']);
});

test('L-EAR seed 4242: a blocked attach play leaves no stamp, so the verb voice still speaks', () => {
  const { host, bus, played } = latchHost(42);
  const real = host.play;
  host.play = (id, opts) => (id === 'sfx.tetherLatch' ? null : real(id, opts));
  bus.emit('tether:attached', { attachmentId: 'a4', targetId: 'e4', pos: { x: 0, z: 0 } });
  bus.emit('tether:latched', { attachmentId: 'a4', targetId: 'e4', pos: { x: 0, z: 0 } });
  assert.deepEqual(played, ['sfx_tether_latch_lock'],
    'when the signature never sounded, the latch must not go silent');
});

// ── Harness B: kill handler host (fb-kill-mass-ladder shape) ──────────────────────────────────
function killedHost() {
  const played = [];
  const hushes = [];
  const host = Object.create(audio);
  host.rt = {};
  host.state = { playerId: 'player', simTime: 1, tick: 60, entities: new Map() };
  host.play = (id, opts = {}) => { played.push({ id, ...opts }); return { id }; };
  host._applyPriorityCue = () => {};
  host._duckMusic = () => {};
  host._triggerHush = (input) => { hushes.push(input); };
  return { host, played, hushes };
}

test('L-EAR seed 4242: the kill verb names the authored composite signature', () => {
  assert.equal(combatVerbRecipe('kill'), 'sfx.killConfirmed');
  const recipe = recipeById.get('sfx.killConfirmed');
  assert.ok(recipe, 'sfx.killConfirmed is authored');
  assert.equal(recipe.type, 'layered');
  assert.deepEqual(recipe.layers, ['sfx_kill_sine', 'sfx_kill_noise', 'sfx_kill_confirm'],
    'the composite IS the blended body plus the rising confirm');
});

test('L-EAR seed 4242: a mid-band player kill plays the signature once — no split doubling', () => {
  const { host, played } = killedHost();
  host._onKilled({ id: 'raider-1', killerId: 'player', mass: 64, type: 'ship', pos: { x: 0, z: 0 } });
  const ids = played.map((row) => row.id);
  assert.deepEqual(ids, ['sfx.killConfirmed'],
    `the dead signature now speaks once as one authored voice — got ${ids.join(', ')}`);
  assert.ok(!ids.includes('sfx.killSmall'), 'the composite owns the blended body');
  assert.ok(!ids.includes('sfx_kill_confirm'), 'the confirm is a layer inside, not a second play');

  // The graded split is still correct where the composite would mis-voice the mass.
  played.length = 0;
  host._onKilled({ id: 'wasp-9', killerId: 'player', mass: 16, type: 'ship', pos: { x: 0, z: 0 } });
  const light = played.map((row) => row.id);
  assert.ok(light.includes('sfx_kill_sine'), 'a light hull keeps its sine body');
  assert.ok(light.includes('sfx_kill_confirm'), 'a light hull still earns the confirm layer');

  played.length = 0;
  host._onKilled({ id: 'npc-duel', killerId: 'other', mass: 64, type: 'ship', pos: { x: 0, z: 0 } });
  const npc = played.map((row) => row.id);
  assert.ok(npc.includes('sfx.killSmall'), 'an NPC mid kill keeps the physical voice');
  assert.ok(!npc.includes('sfx.killConfirmed') && !npc.includes('sfx_kill_confirm'),
    'the reward signature never masquerades on a kill the player did not cause');
});

// ── Harness C: station hum admission under a saturated voice pool ─────────────────────────────
function param(v = 0) {
  return {
    value: v,
    setValueAtTime() {}, linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {}, setTargetAtTime() {},
    cancelScheduledValues() {},
  };
}

function mockCtx() {
  const node = (extra = {}) => ({ connect() {}, disconnect() {}, ...extra });
  return {
    currentTime: 5,
    sampleRate: 8000,
    state: 'running',
    createGain: () => node({ gain: param(1) }),
    createBiquadFilter: () => node({ type: '', frequency: param(0), Q: param(0) }),
    createStereoPanner: () => node({ pan: param(0) }),
    createOscillator: () => node({
      type: '', frequency: param(0), detune: param(0), start() {}, stop() {},
    }),
    createBufferSource: () => node({
      buffer: null, loop: false, playbackRate: param(1), start() {}, stop() {},
    }),
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
  };
}

function deadOneShot() {
  return {
    loop: false, startedAt: 0, _stopped: false,
    gain: { disconnect() {} }, sources: [], extra: [], nodes: [], subVoices: [],
    stopAt: 0, releaseDur: 0,
  };
}

test('L-EAR seed 4242: docking into a saturated mix still opens the room tone', () => {
  const host = Object.create(audio);
  const ctx = mockCtx();
  host.rt = {
    ctx,
    loops: {},
    voices: [],
    sfxBus: ctx.createGain(),
    ambientBus: ctx.createGain(),
    _caches: {},
    _samples: null,
    _nextVoiceId: 1,
    _lifecycleSuspended: false,
    _paused: false,
  };
  host.state = { playerId: 'player', entities: new Map(), world: {} };

  const keeper = { ...deadOneShot(), primary: true, tag: 'player-verb' };
  for (let i = 0; i < MAX_AUDIO_VOICES - 1; i++) host.rt.voices.push(deadOneShot());
  host.rt.voices.push(keeper);
  assert.equal(host.rt.voices.length, MAX_AUDIO_VOICES, 'the pool is saturated');

  host._startStationHum({ stationId: 'station_helios' });
  assert.ok(host.rt.loops.stationHum, 'the room tone must start even under a full pool');
  assert.equal(host.rt.voices.length, MAX_AUDIO_VOICES, 'the cap still holds');
  assert.ok(host.rt.voices.includes(keeper), 'a player-verb voice is never the casualty');
  assert.equal(voiceBudgetDisposable(host.rt.loops.stationHum), false,
    'the admitted hum cannot be evicted by the next one-shot');
});
