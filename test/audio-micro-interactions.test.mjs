import assert from 'node:assert/strict';
import test from 'node:test';

import {
  audio,
  resolveNearMissCrack,
  resolveHushEnvelope,
  hushGainAt,
  resolveBreachState,
  isChargeWeapon,
  resolveChargeWhine,
  resolveDryFireReadiness,
  NEAR_MISS_CRACK,
  HULL_BREACH_MIX,
  CHARGE_WHINE,
  BARK_PUNCT,
} from '../src/audio/audioSystem.js';
import { createBus } from '../src/core/eventBus.js';
import { RECIPES } from '../src/data/audioRecipes.js';

// ---------------------------------------------------------------------------
// fakes — Web Audio surface used by the drama layer (no real AudioContext)
// ---------------------------------------------------------------------------
function fakeParam() {
  return {
    value: 0,
    calls: [],
    setValueAtTime(v, t) { this.calls.push(['set', v, t]); this.value = v; },
    setTargetAtTime(v, t, tau) { this.calls.push(['target', v, t, tau]); this.value = v; },
    linearRampToValueAtTime(v, t) { this.calls.push(['linear', v, t]); this.value = v; },
    exponentialRampToValueAtTime(v, t) { this.calls.push(['exp', v, t]); this.value = v; },
    cancelScheduledValues(t) { this.calls.push(['cancel', t]); },
  };
}

function fakeNode() {
  return {
    gain: fakeParam(),
    frequency: fakeParam(),
    Q: fakeParam(),
    detune: fakeParam(),
    playbackRate: fakeParam(),
    type: '',
    loop: false,
    buffer: null,
    connect() {},
    disconnect() {},
    start() {},
    stop() {},
  };
}

function fakeCtx(now = 1) {
  return {
    currentTime: now,
    state: 'running',
    sampleRate: 48000,
    destination: {},
    createGain: fakeNode,
    createOscillator: fakeNode,
    createBiquadFilter: fakeNode,
    createBufferSource: fakeNode,
    createDynamicsCompressor: fakeNode,
    createBuffer: (channels, len, rate) => ({
      getChannelData: () => new Float32Array(len),
      sampleRate: rate,
    }),
    addEventListener() {},
    removeEventListener() {},
  };
}

/**
 * Boot the audio system against a minimal state and a real event bus, with play() spied so no
 * Web Audio work is required. `overrides.player` replaces the player entity record.
 */
function makeHost(overrides = {}) {
  const bus = createBus();
  const player = overrides.player || {
    id: 'player',
    alive: true,
    pos: { x: 0, z: 0 },
    hull: 100,
    hullMax: 100,
    cap: 50,
    flags: {},
    data: { weapons: [], combat: {} },
  };
  const state = {
    playerId: 'player',
    simTime: 10,
    tick: 5,
    entities: new Map([['player', player]]),
    input: { fire: false },
    settings: { audio: { muted: false, master: 1, sfx: 1, music: 0.5 } },
    ui: {},
    audioRuntime: {},
    ...(overrides.state || {}),
  };
  const plays = [];
  const host = Object.create(audio);
  host.play = function playSpy(recipeId, opts) {
    plays.push({ recipeId, opts: opts || {} });
    return { recipeId };
  };
  host.init({ state, bus, helpers: {} });
  host.rt.ctx = overrides.ctx === undefined ? fakeCtx(10) : overrides.ctx;
  return { host, bus, state, player, plays };
}

// ---------------------------------------------------------------------------
// near-miss whip crack
// ---------------------------------------------------------------------------
test('near-miss crack: point-blank is loudest and sharpest, far edge fades', () => {
  const pointBlank = resolveNearMissCrack({ distance: 6 });
  const far = resolveNearMissCrack({ distance: NEAR_MISS_CRACK.maxDistanceWu });
  const beyond = resolveNearMissCrack({ distance: NEAR_MISS_CRACK.maxDistanceWu * 3 });
  assert.ok(pointBlank.gain > far.gain);
  assert.ok(pointBlank.rate > far.rate);
  assert.equal(far.gain, NEAR_MISS_CRACK.minGain);
  assert.equal(beyond.closeness, 0);
  // Missing distance must not NaN — a degraded receipt still cracks.
  const noDistance = resolveNearMissCrack({});
  assert.ok(Number.isFinite(noDistance.gain));
});

test('nearMiss event plays a positioned whip crack once per burst', () => {
  const { host, bus, plays } = makeHost();
  bus.emit('projectile:nearMiss', { targetId: 'player', distance: 8, pos: { x: 5, z: 0 } });
  assert.equal(plays.length, 1);
  assert.equal(plays[0].recipeId, 'sfx_wpn_whip_crack');
  assert.deepEqual(plays[0].opts.position, { x: 5, z: 0 });
  assert.ok(plays[0].opts.gain > 0.8, 'a close miss cracks hard');

  // A second receipt inside the collapse window does not stack.
  bus.emit('projectile:nearMiss', { targetId: 'player', distance: 8, pos: { x: -5, z: 0 } });
  assert.equal(plays.length, 1);

  // Foreign-target receipts never reach the player.
  bus.emit('projectile:nearMiss', { targetId: 'npc-7', distance: 8, pos: { x: 0, z: 0 } });
  assert.equal(plays.length, 1);

  // After the gap a new crossing cracks again.
  const pastGap = (host.rt._lastWhipMs || 0) + NEAR_MISS_CRACK.minGapMs + 400;
  host._wallClockMs = () => pastGap;
  bus.emit('projectile:nearMiss', { targetId: 'player', distance: 30, pos: { x: 0, z: 8 } });
  assert.equal(plays.length, 2);
  assert.ok(plays[1].opts.gain < plays[0].opts.gain, 'a wider miss cracks softer');
});

// ---------------------------------------------------------------------------
// breathless-moment hush
// ---------------------------------------------------------------------------
test('hush envelope: dips to depth, holds, then rushes back', () => {
  const env = resolveHushEnvelope({ kind: 'capital', distance: 50 }, 1000);
  assert.ok(env);
  assert.ok(env.depth < 0.15, `capital hush should nearly silence the world, got ${env.depth}`);
  assert.equal(hushGainAt(env, 999).gain, 1, 'before start the world is open');
  const held = hushGainAt(env, env.startMs + env.attackMs + env.holdMs * 0.5);
  assert.ok(Math.abs(held.gain - env.depth) < 0.01, 'hold sits on the depth floor');
  const midRelease = hushGainAt(env, env.startMs + env.attackMs + env.holdMs + env.releaseMs * 0.5);
  assert.ok(midRelease.gain > env.depth && midRelease.gain < 1, 'release is between floor and open');
  const done = hushGainAt(env, env.endMs + 1);
  assert.equal(done.gain, 1);
  assert.equal(done.done, true);
});

test('hush envelope: distance shallows and a far kill does not hush', () => {
  // D_FAR ≈ 613 wu — a kill beyond world hearing doesn't deserve the silence.
  const near = resolveHushEnvelope({ kind: 'capital', distance: 100 }, 0);
  const mid = resolveHushEnvelope({ kind: 'capital', distance: 560 }, 0);
  const far = resolveHushEnvelope({ kind: 'capital', distance: 60000 }, 0);
  assert.ok(near.depth < mid.depth, 'a nearer kill hushes deeper');
  assert.equal(far, null, 'a kill beyond hearing range leaves the mix alone');
  const fallback = resolveHushEnvelope({ kind: 'unknown-kind' }, 0);
  assert.ok(Math.abs(fallback.depth - 0.16) < 0.02,
    'unknown kinds resolve to the structure spec');
});

test('capital kill triggers the hush and still schedules the delayed explosion', () => {
  const { host, bus, plays } = makeHost();
  bus.emit('entity:killed', {
    id: 'cap-1', killerId: 'player', type: 'ship', victimClass: 'capital',
    pos: { x: 120, z: 0 },
  });
  assert.ok(host.rt._hush, 'capital kill leaves a hush envelope');
  assert.equal(host.rt._hush.kind, 'capital');
  const boom = plays.find((p) => p.recipeId === 'sfx.killCapital');
  assert.ok(boom, 'the capital explosion still plays');
  assert.ok(boom.opts.startTime > host.rt.ctx.currentTime, 'the explosion is delayed into the hush');
  assert.equal(boom.opts.critical, true, 'player kill rides the critical lane');

  // A distant capital kill does not steal the room.
  const { host: host2, bus: bus2 } = makeHost();
  bus2.emit('entity:killed', {
    id: 'cap-2', killerId: 'player', type: 'ship', victimClass: 'capital',
    pos: { x: 90000, z: 0 },
  });
  assert.equal(host2.rt._hush, null);
});

test('a deeper event replaces an active hush, a shallower one does not', () => {
  const { host } = makeHost();
  host._triggerHush({ kind: 'structure', pos: { x: 10, z: 0 } });
  const first = host.rt._hush;
  assert.ok(first);
  // Shallower event mid-hush keeps the original floor.
  host._triggerHush({ kind: 'structure', pos: { x: 900, z: 0 } });
  assert.equal(host.rt._hush, first);
  // A capital kill right next to the cockpit digs deeper and takes over.
  host._triggerHush({ kind: 'capital', pos: { x: 10, z: 0 } });
  assert.notEqual(host.rt._hush, first);
  assert.equal(host.rt._hush.kind, 'capital');
});

test('player death drains the world through the death hush', () => {
  const { host, bus } = makeHost();
  bus.emit('player:death', {});
  assert.ok(host.rt._hush);
  assert.equal(host.rt._hush.kind, 'death');
  assert.ok(host.rt._hush.depth <= 0.06);
});

// ---------------------------------------------------------------------------
// hull breach — depressurization muffle
// ---------------------------------------------------------------------------
test('breach resolver: hysteresis enter, hold, exit, silent death', () => {
  let st = resolveBreachState({ hullPct: 0.5, alive: true, docked: false, active: false });
  assert.equal(st.active, false);
  st = resolveBreachState({ hullPct: 0.3, alive: true, docked: false, active: false });
  assert.equal(st.edge, 'enter');
  assert.equal(st.active, true);
  // Between thresholds the latch holds — no chatter on the boundary.
  st = resolveBreachState({ hullPct: 0.4, alive: true, docked: false, active: true });
  assert.equal(st.active, true);
  assert.equal(st.edge, null);
  st = resolveBreachState({ hullPct: 0.5, alive: true, docked: false, active: true });
  assert.equal(st.edge, 'exit');
  assert.equal(st.exitSilent, false);
  // Dying mid-breach exits without a repressurize hiss.
  st = resolveBreachState({ hullPct: 0.1, alive: false, docked: false, active: true });
  assert.equal(st.edge, 'exit');
  assert.equal(st.exitSilent, true);
  // Docked ships are pressurized — no breach while parked.
  st = resolveBreachState({ hullPct: 0.1, alive: true, docked: true, active: false });
  assert.equal(st.active, false);
});

test('breach wiring: critical hull low-passes the world and opens the conduction bed', () => {
  const player = {
    id: 'player', alive: true, pos: { x: 0, z: 0 },
    hull: 8, hullMax: 100, cap: 50, flags: {},
    data: { weapons: [], combat: {} },
  };
  const { host, plays } = makeHost({ player });
  host.rt._breachFilters = [fakeNode(), fakeNode(), fakeNode(), fakeNode()];
  host.rt.sfxBus = fakeNode();

  host._updateHullBreach(10, 0.016);
  assert.equal(host.rt._breachActive, true);
  assert.ok(plays.some((p) => p.recipeId === 'sfx_hull_decompress'), 'decompression hiss on entry');
  assert.ok(host.rt._breachBed, 'the conduction bed is built on first breach');

  // Drive a few frames so the smoothed intensity deepens.
  for (let i = 0; i < 40; i++) host._updateHullBreach(10 + i * 0.016, 0.016);
  assert.ok(host.rt._breachIntensity > 0.5, 'deep breach reaches a deep muffle');

  // Every world bus filter has been pulled far below open.
  for (const f of host.rt._breachFilters) {
    const targets = f.frequency.calls.filter((c) => c[0] === 'target');
    assert.ok(targets.length > 0, 'filter received a setTargetAtTime write');
    const last = targets[targets.length - 1][1];
    assert.ok(last < 3000, `breach cutoff should be hollow (${last} Hz)`);
  }

  // The conducted rumble is actually audible.
  const bedTargets = host.rt._breachBed.noiseGain.gain.calls.filter((c) => c[0] === 'target');
  assert.ok(bedTargets.some((c) => c[1] > 0.01), 'conduction bed gain rises with intensity');
});

test('breach recovery: repaired hull repressurizes and reopens the world filters', () => {
  const player = {
    id: 'player', alive: true, pos: { x: 0, z: 0 },
    hull: 20, hullMax: 100, cap: 50, flags: {},
    data: { weapons: [], combat: {} },
  };
  const { host, plays } = makeHost({ player });
  host.rt._breachFilters = [fakeNode(), fakeNode()];
  host._updateHullBreach(10, 0.016);
  assert.equal(host.rt._breachActive, true);

  player.hull = 90; // patched above the release threshold
  host._updateHullBreach(11, 0.016);
  assert.equal(host.rt._breachActive, false);
  assert.ok(plays.some((p) => p.recipeId === 'sfx_hull_repressurize'), 'repressurize hiss on seal');

  for (let i = 0; i < 120; i++) host._updateHullBreach(11 + i * 0.016, 0.016);
  const lastCut = host.rt._breachCutHz;
  assert.ok(lastCut > HULL_BREACH_MIX.openHz * 0.9, `filters reopen toward ${HULL_BREACH_MIX.openHz}`);
});

// ---------------------------------------------------------------------------
// heavy-mount capacitor whine
// ---------------------------------------------------------------------------
test('charge whine resolver gates on heavy mounts and cooldown', () => {
  assert.equal(isChargeWeapon('wpn_railgun', 'standard'), true);
  assert.equal(isChargeWeapon('wpn_pulse_laser', 'spinal'), true, 'mount class alone qualifies');
  assert.equal(isChargeWeapon('wpn_pulse_laser', 'standard'), false);
  const plan = resolveChargeWhine({ weaponId: 'wpn_railgun', mountClass: 'spinal', cooldownS: 1.25, nowS: 10 });
  assert.ok(plan);
  assert.ok(plan.whineAtS < plan.readyAtS, 'the whine crests before ready');
  assert.ok(Math.abs(plan.readyAtS - 11.25) < 1e-9);
  assert.equal(resolveChargeWhine({ weaponId: 'wpn_pulse_laser', cooldownS: 0.18, nowS: 10 }), null,
    'a snappy gun never whines');
  assert.equal(resolveChargeWhine({ weaponId: 'wpn_torpedo', mountClass: 'launcher', cooldownS: 4, nowS: 10 }), null,
    'a torpedo tube is not a capacitor');
});

test('player railgun fire schedules the spool + ready tick exactly once', () => {
  const player = {
    id: 'player', alive: true, pos: { x: 0, z: 0 }, hull: 100, hullMax: 100, cap: 50, flags: {},
    data: {
      weapons: [{ slotIndex: 0, defId: 'wpn_railgun', mountClass: 'spinal', _cooldown: 1.25, energyCost: 8, heat: 0, heatMax: 100 }],
      combat: {},
    },
  };
  const { host, bus, plays } = makeHost({ player });
  bus.emit('combat:fire', { ownerId: 'player', weaponId: 'wpn_railgun', hardpointIdx: 0, origin: { x: 0, z: 0 } });

  const whine = plays.find((p) => p.recipeId === 'sfx_wpn_capacitor_charge');
  const ready = plays.find((p) => p.recipeId === 'sfx_wpn_capacitor_ready');
  assert.ok(whine, 'heavy mount spools after the shot');
  assert.ok(ready, 'a topped-off tick marks ready');
  assert.ok(whine.opts.startTime > host.rt.ctx.currentTime, 'the whine is scheduled ahead');
  assert.ok(ready.opts.startTime > whine.opts.startTime, 'ready lands after the whine crest');
  assert.equal(whine.opts.position, undefined, 'player spool is ship-local, not positional');

  // A second shot while the spool is pending does not stack a second whine.
  bus.emit('combat:fire', { ownerId: 'player', weaponId: 'wpn_railgun', hardpointIdx: 0, origin: { x: 0, z: 0 } });
  assert.equal(plays.filter((p) => p.recipeId === 'sfx_wpn_capacitor_charge').length, 1);
});

test('NPC heavy fire gets a positional whine; a light NPC gun stays silent', () => {
  const npcHeavy = {
    id: 'npc-1', alive: true, pos: { x: 300, z: 0 },
    data: { weapons: [{ slotIndex: 2, defId: 'wpn_railgun', mountClass: 'spinal', _cooldown: 1.25 }] },
  };
  const player = {
    id: 'player', alive: true, pos: { x: 0, z: 0 }, hull: 100, hullMax: 100, cap: 50, flags: {},
    data: { weapons: [], combat: {} },
  };
  const { host, bus, plays } = makeHost({ player });
  host.state.entities.set('npc-1', npcHeavy);
  bus.emit('combat:fire', { ownerId: 'npc-1', weaponId: 'wpn_railgun', hardpointIdx: 2, origin: { x: 300, z: 0 } });
  const whine = plays.find((p) => p.recipeId === 'sfx_wpn_capacitor_charge');
  assert.ok(whine, 'a hostile spinal mount spools audibly');
  assert.deepEqual(whine.opts.position, { x: 300, z: 0 }, 'the whine sits at the firing ship');

  npcHeavy.data.weapons[0].defId = 'wpn_pulse_laser';
  npcHeavy.data.weapons[0].mountClass = 'standard';
  npcHeavy.data.weapons[0]._cooldown = 0.2;
  const before = plays.length;
  host.rt._chargeWhineUntilS = 0; // expire the spool gate
  bus.emit('combat:fire', { ownerId: 'npc-1', weaponId: 'wpn_pulse_laser', hardpointIdx: 2, origin: { x: 300, z: 0 } });
  assert.equal(plays.filter((p) => p.recipeId === 'sfx_wpn_capacitor_charge').length, 1);
});

// ---------------------------------------------------------------------------
// dead trigger — solenoid clack
// ---------------------------------------------------------------------------
test('dry-fire resolver: unarmed, blocked, cycling, armed', () => {
  const base = { data: { weapons: [], combat: {} }, cap: 50 };
  assert.deepEqual(resolveDryFireReadiness(base, { simTime: 0 }).reason, 'unarmed');

  const armed = {
    ...base,
    data: { weapons: [{ defId: 'wpn_pulse', energyCost: 1, _cooldown: 0, heat: 0, heatMax: 100 }], combat: {} },
  };
  assert.equal(resolveDryFireReadiness(armed, { simTime: 0 }).clack, false, 'a ready gun is not a dead trigger');

  const cycling = {
    ...base,
    data: { weapons: [{ defId: 'wpn_pulse', energyCost: 1, _cooldown: 0.9, heat: 0, heatMax: 100 }], combat: {} },
  };
  assert.equal(resolveDryFireReadiness(cycling, { simTime: 0 }).reason, 'cycling');

  const dry = {
    ...base, cap: 0.1,
    data: { weapons: [{ defId: 'wpn_pulse', energyCost: 5, _cooldown: 0, heat: 0, heatMax: 100 }], combat: {} },
  };
  assert.equal(resolveDryFireReadiness(dry, { simTime: 0 }).reason, 'blocked');

  const venting = {
    ...armed,
    data: { ...armed.data, weaponVentUntil: 100 },
  };
  assert.equal(resolveDryFireReadiness(venting, { simTime: 50 }).clack, true, 'a venting trigger is dead');
});

test('a dead trigger clacks on the press edge and not while held', () => {
  const { host, state, plays } = makeHost(); // unarmed player
  host._updateDryFire();
  assert.equal(plays.length, 0, 'no clack with the trigger at rest');

  state.input.fire = true;
  host._updateDryFire();
  assert.equal(plays.length, 1);
  assert.equal(plays[0].recipeId, 'sfx_wpn_dry_fire');

  host._updateDryFire();
  host._updateDryFire();
  assert.equal(plays.length, 1, 'holding a dead trigger does not rattle');

  state.input.fire = false;
  host._updateDryFire();
  state.input.fire = true;
  host._updateDryFire();
  assert.equal(plays.length, 2, 'a fresh squeeze clacks again');
});

test('a live gun never clacks', () => {
  const player = {
    id: 'player', alive: true, pos: { x: 0, z: 0 }, hull: 100, hullMax: 100, cap: 50, flags: {},
    data: { weapons: [{ defId: 'wpn_pulse', energyCost: 1, _cooldown: 0, heat: 0, heatMax: 100 }], combat: {} },
  };
  const { host, state, plays } = makeHost({ player });
  state.input.fire = true;
  host._updateDryFire();
  assert.equal(plays.length, 0);
});

// ---------------------------------------------------------------------------
// radio punctuation
// ---------------------------------------------------------------------------
test('bark voice: key click leads the voice, squelch tail follows it', () => {
  const { host, plays } = makeHost({ ctx: fakeCtx(50) });
  host._onBarkVoice({ factionId: 'faction_free', situation: 'scan', line: 'Hold still.' });
  assert.equal(plays[0].recipeId, 'sfx_comms_key_click');
  assert.ok(Math.abs(plays[0].opts.startTime - 50) < 1e-9);
  const voice = plays.find((p) => p.recipeId === 'sfx_bark_radio');
  assert.ok(voice, 'the bark itself still plays');
  assert.ok(voice.opts.startTime > plays[0].opts.startTime, 'the voice rides after key-in');
  assert.ok(Math.abs(voice.opts.startTime - 50 - BARK_PUNCT.keyLeadS) < 1e-9);
  const tail = plays.find((p) => p.recipeId === 'sfx_comms_squelch_tail');
  assert.ok(tail, 'the carrier collapses after the line');
  assert.ok(tail.opts.startTime > voice.opts.startTime, 'the tail follows the utterance');
});

test('comms popup squelch gains a key-off tail', () => {
  const { host, plays } = makeHost({ ctx: fakeCtx(20) });
  host._onCommsPopup({ category: 'ambient' });
  const squelch = plays.find((p) => p.recipeId === 'sfx_squelch_ambient');
  const tail = plays.find((p) => p.recipeId === 'sfx_comms_squelch_tail');
  assert.ok(squelch && tail, 'squelch open + tail close');
  assert.ok(tail.opts.startTime > squelch.opts.startTime);
  assert.ok(Math.abs(tail.opts.startTime - squelch.opts.startTime - BARK_PUNCT.popupTailDelayS) < 1e-9);
});

// ---------------------------------------------------------------------------
// recipes
// ---------------------------------------------------------------------------
test('all drama-layer recipes are registered', () => {
  const ids = new Set(RECIPES.map((r) => r.id));
  for (const id of [
    'sfx_wpn_whip_crack', 'sfx_whip_snap', 'sfx_whip_body',
    'sfx_wpn_capacitor_charge', 'sfx_wpn_capacitor_ready',
    'sfx_wpn_dry_fire',
    'sfx_comms_key_click', 'sfx_comms_squelch_tail',
    'sfx_hull_decompress', 'sfx_hull_repressurize', 'sfx_hull_stress_groan',
  ]) {
    assert.ok(ids.has(id), `missing recipe ${id}`);
  }
});
