import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUDIO_RECIPE_BY_ID,
  DOCTRINE_AUDIO_SIGNATURES,
  ENGINE_FAMILY_AUDIO,
  audio,
  resolveAudioThreatContext,
  resolveAudioCueRecipeId,
  resolveEngineAudioIdentity,
  resolvePlayerDamageAudioSignature,
  resolveWeaponAudioSignature,
} from '../src/audio/audioSystem.js';
import { DRIVE_FAMILIES } from '../src/core/flight/propulsionCatalog.js';
import { CombatDoctrineId } from '../src/ai/combatDoctrine.js';

function ship({ id = 'player', team = 0, x = 0, z = 0, rot = 0, driveId = 'drive_reaction_m', mass = 60, doctrineId = null } = {}) {
  return {
    id, type: 'ship', team, alive: true, pos: { x, z }, rot, mass,
    hull: 100, hullMax: 100, shield: 100, shieldMax: 100,
    flags: { docked: false },
    data: {
      driveId,
      derived: { driveId, mass },
      ai: doctrineId ? { combatDoctrineId: doctrineId } : null,
    },
  };
}

test('five authored propulsion families and three mass classes have stable audible identities', () => {
  const rows = [
    ['drive_reaction_m', DRIVE_FAMILIES.REACTION, 60, 'medium'],
    ['drive_gravimetric_s', DRIVE_FAMILIES.GRAVIMETRIC, 20, 'light'],
    ['drive_pulse_plate_m', DRIVE_FAMILIES.PULSE_PLATE, 100, 'medium'],
    ['drive_torch_l', DRIVE_FAMILIES.TORCH, 180, 'heavy'],
    ['drive_field_sail_m', DRIVE_FAMILIES.SAIL, 70, 'medium'],
  ];
  const signatures = new Set();
  for (const [driveId, family, mass, massClass] of rows) {
    const identity = resolveEngineAudioIdentity(ship({ driveId, mass }));
    assert.equal(identity.family, family);
    assert.equal(identity.massClass, massClass);
    assert.equal(identity.driveId, driveId);
    assert.equal(identity.voice, ENGINE_FAMILY_AUDIO[family]);
    signatures.add([
      identity.voice.osc1, identity.voice.osc2, identity.voice.harmonic,
      identity.voice.noiseMult, identity.voice.subMult,
    ].join(':'));
  }
  assert.equal(signatures.size, 5, 'each propulsion family needs a distinct harmonic/noise signature');

  const cacheHarness = { rt: {} };
  const kestrel = ship({ driveId: 'drive_reaction_m', mass: 60 });
  const first = audio._cachedEngineAudioIdentity.call(cacheHarness, kestrel);
  const second = audio._cachedEngineAudioIdentity.call(cacheHarness, kestrel);
  assert.equal(first, second, 'unchanged engine identity must not allocate in the frame loop');
});

test('doctrine identities alter the same weapon without changing combat state', () => {
  const doctrines = Object.values(CombatDoctrineId);
  assert.equal(Object.keys(DOCTRINE_AUDIO_SIGNATURES).length, doctrines.length);
  const signatures = new Set();
  for (const [i, doctrineId] of doctrines.entries()) {
    const owner = ship({ id: `hostile-${i}`, team: 1, doctrineId });
    const state = { entities: new Map([[owner.id, owner]]) };
    const signature = resolveWeaponAudioSignature({ ownerId: owner.id, weaponId: 'wpn_pulse_s' }, state);
    assert.equal(signature.recipeId, 'sfx_wpn_pulse_laser');
    assert.equal(signature.doctrineId, doctrineId);
    assert(AUDIO_RECIPE_BY_ID[DOCTRINE_AUDIO_SIGNATURES[doctrineId].recipeId]);
    signatures.add(`${signature.rate}:${signature.gain}:${signature.detune}`);
  }
  assert.equal(signatures.size, doctrines.length);
});

test('player damage direction is ship-local and hull urgency is one-shot-scaled', () => {
  const player = ship({ id: 'player', rot: 0 }); // nose +X, right +Z
  const right = ship({ id: 'right', team: 1, x: 0, z: 100 });
  const left = ship({ id: 'left', team: 1, x: 0, z: -100 });
  const front = ship({ id: 'front', team: 1, x: 100, z: 0 });
  const rear = ship({ id: 'rear', team: 1, x: -100, z: 0 });
  const state = { playerId: player.id, entities: new Map([[player.id, player], [right.id, right], [left.id, left], [front.id, front], [rear.id, rear]]) };
  const hit = (attackerId, hull) => resolvePlayerDamageAudioSignature({
    isPlayer: true, attackerId, dominantLayer: 'hull', hullDamage: 12,
    after: { hull },
  }, state);
  assert(hit(right.id, 90).pan > 0.8);
  assert(hit(left.id, 90).pan < -0.8);
  assert.equal(hit(front.id, 90).bearing, 'front');
  assert.equal(hit(rear.id, 90).bearing, 'rear');
  assert(hit(front.id, 90).rate > hit(rear.id, 90).rate);
  assert(hit(front.id, 15).gain > hit(front.id, 90).gain, 'critical hull state should strengthen only the hit receipt');
});

test('safe-zone contacts stay calm until authored engagement supplies causal pressure', () => {
  const player = ship({ id: 'player', team: 0 });
  const strayDifferentTeam = ship({ id: 'contact', team: 1, x: 200, z: 0 });
  const sector = { id: 'sector_helios_prime', tier: 0, security: 0.98, enemyDensity: 0 };
  const state = {
    playerId: player.id,
    simTime: 100,
    entities: new Map([[player.id, player], [strayDifferentTeam.id, strayDifferentTeam]]),
    entityList: [player, strayDifferentTeam],
    ui: { docked: false },
    world: {
      currentSectorId: sector.id,
      sectors: { [sector.id]: sector },
      activeSector: { stations: [{ id: 10, stationId: 'station_helios', pos: { x: 0, z: 0 } }] },
    },
  };
  const rt = { _lastDamageT: -1e9, _doctrineThreatUntil: -1e9, _activeCombatEncounters: new Set(), _musicThreatScratch: [] };
  const calm = resolveAudioThreatContext(state, player, rt);
  assert.equal(calm.calmZone, true);
  assert.equal(calm.engaged, false);
  assert.equal(calm.nearbyHostiles, 0);
  assert.equal(calm.threat, 0);

  rt._activeCombatEncounters.add('encounter-authored');
  const engaged = resolveAudioThreatContext(state, player, rt);
  assert.equal(engaged.engaged, true);
  assert(engaged.threat >= 0.45);
});

test('professional identity recipes are finite one-shots on the existing combat bus', () => {
  const ids = [
    'sfx_doctrine_flyby',
    'sfx_doctrine_tether_spool',
    'sfx_doctrine_ranged_charge',
    'sfx_encounter_escalation',
    'sfx_tether_strain_creak',
  ];
  for (const id of ids) {
    const recipe = AUDIO_RECIPE_BY_ID[id];
    assert(recipe, `${id} must resolve`);
    assert.equal(recipe.category, 'weapon');
    assert(!String(recipe.type).startsWith('continuous'), `${id} must not create an exhausting loop`);
    assert(Number(recipe.gainEnvelope && recipe.gainEnvelope.release) <= 0.32);
  }
  assert.equal(resolveAudioCueRecipeId('presentation.tether.near_break'), 'sfx_tether_strain_creak');
});

test('live combat receipts route armor separately and pan player urgency', () => {
  const player = ship({ id: 'player' });
  const attacker = ship({ id: 'attacker', team: 1, x: 0, z: 100 });
  const calls = [];
  const harness = {
    ...audio,
    state: { playerId: player.id, simTime: 5, entities: new Map([[player.id, player], [attacker.id, attacker]]) },
    rt: { _lastDamageT: -1e9 },
    play(recipeId, opts) { calls.push({ recipeId, opts }); },
  };
  harness._onDamage({
    targetId: player.id,
    attackerId: attacker.id,
    isPlayer: true,
    dominantLayer: 'armor',
    armorDamage: 8,
    shieldDamage: 0,
    hullDamage: 0,
    after: { hull: 100 },
  });
  assert.equal(calls[0].recipeId, 'sfx.armorHit');
  assert.equal(calls[1].recipeId, 'sfx.playerDamage');
  assert(calls[1].opts.pan > 0.8);
  assert.equal(calls.some((call) => call.recipeId === 'sfx.hullHit'), false);
});

function param(value = 0) {
  return {
    value,
    cancelScheduledValues() {},
    setValueAtTime(next) { this.value = next; },
    linearRampToValueAtTime(next) { this.value = next; },
    exponentialRampToValueAtTime(next) { this.value = next; },
    setTargetAtTime(next) { this.value = next; },
  };
}

function fakeAudioContext() {
  const node = () => ({ connect() {}, disconnect() {} });
  const source = () => ({
    ...node(),
    loop: false,
    playbackRate: param(1),
    start() {},
    stop() {},
    onended: null,
  });
  return {
    currentTime: 0.25,
    sampleRate: 48000,
    state: 'running',
    destination: node(),
    resume() { this.state = 'running'; return Promise.resolve(); },
    createOscillator() {
      return { ...source(), type: 'sine', frequency: param(440), detune: param(0) };
    },
    createGain() { return { ...node(), gain: param(1) }; },
    createBiquadFilter() {
      return { ...node(), type: 'lowpass', frequency: param(1000), Q: param(0.7) };
    },
    createStereoPanner() { return { ...node(), pan: param(0) }; },
    createBufferSource() { return { ...source(), buffer: null }; },
    createDynamicsCompressor() {
      return {
        ...node(),
        threshold: param(-6), knee: param(6), ratio: param(12),
        attack: param(0.003), release: param(0.25),
      };
    },
    createDelay() { return { ...node(), delayTime: param(0.25) }; },
    createBuffer(_channels, length) {
      const channel = new Float32Array(length);
      return { sampleRate: 48000, getChannelData() { return channel; } };
    },
  };
}

test('first AudioContext unlock on paused menu does not start flight beds or free boops', () => {
  // audioSystem looks at window.AudioContext (browser autoplay path), not globalThis alone.
  const previousWindow = globalThis.window;
  const previousRaf = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  const timers = [];
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  globalThis.window = {
    AudioContext: function AudioContext() { return fakeAudioContext(); },
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  // Music stems schedule setTimeout loops; capture and clear them so the test process can exit.
  globalThis.setTimeout = (fn, ms, ...args) => {
    const id = realSetTimeout(fn, ms, ...args);
    timers.push(id);
    return id;
  };

  const harness = Object.create(audio);
  try {
    const bus = {
      on() { return () => {}; },
      emit() {},
    };
    const state = {
      mode: 'menu',
      playerId: 0,
      entities: new Map(),
      entityList: [],
      settings: { audio: { master: 0.55, sfx: 0.7, music: 0.32, muted: false }, video: {} },
      ui: { docked: false },
      world: {},
      input: { actions: {} },
    };
    harness.init({ state, bus, helpers: {} });
    harness.rt._paused = true; // main menu already emitted sim:pause before first gesture

    const ctx = harness._ensureContext();
    assert.ok(ctx, 'gesture unlock creates the audio graph');
    assert.equal(!!harness.rt.engineOsc1, false, 'paused menu unlock must not hard-start the engine bed');
    assert.equal(!!harness.rt.brakeGain, false, 'paused menu unlock must not start brake hiss');
    assert.ok(harness.rt.musicBus.gain.value <= 0.0001 + 1e-9, 'music bus stays silent while paused');

    // Mute hard-gates one-shots even if a recipe is requested during unlock.
    state.settings.audio.muted = true;
    assert.equal(harness.play('sfx_ui_click', { gain: 1 }), null);

    // Entering flight (resume) may build continuous beds, but they soft-start near silence.
    state.settings.audio.muted = false;
    harness._onPause(false);
    assert.ok(harness.rt.engineOsc1, 'resume builds the engine bed for flight');
    assert.ok(harness.rt.engineHumGain.gain.value <= 0.0001 + 1e-9, 'engine bed soft-starts silent');
  } finally {
    try {
      if (harness.rt && harness.rt.stems) {
        for (const key of ['A', 'B', 'C', 'D']) {
          const stem = harness.rt.stems[key];
          if (stem && typeof stem.stop === 'function') stem.stop();
        }
      }
      if (harness.rt && harness.rt._rafId && typeof globalThis.cancelAnimationFrame === 'function') {
        globalThis.cancelAnimationFrame(harness.rt._rafId);
        harness.rt._rafId = 0;
      }
    } catch (_) {}
    for (const id of timers) realClearTimeout(id);
    globalThis.setTimeout = realSetTimeout;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousRaf;
    if (previousCancel === undefined) delete globalThis.cancelAnimationFrame;
    else globalThis.cancelAnimationFrame = previousCancel;
  }
});
