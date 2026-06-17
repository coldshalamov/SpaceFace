// src/audio/audioSystem.js — the `audio` system. 100% Web Audio synthesis (no files, no three).
// Builds master -> limiter -> { sfxBus, musicBus }, synthesizes SFX from RECIPES on gameplay
// events with 2D distance attenuation + stereo pan relative to the player ship, runs low-shield /
// low-hull alarm loops, and an adaptive 4-state music bed (calm/tense/combat/docked) driven by a
// derived threat level. Honors settings.audio.{master,sfx,music,muted} and settings:changed.
//
// IMPORTANT: the registry never calls audio.update() (audio is init-only; it is not in
// UPDATE_ORDER and not invoked in renderUpdate). So all per-frame work — threat recompute,
// music crossfades, alarm scheduling, positional loop tracking, voice GC — is driven by a
// self-owned requestAnimationFrame loop that starts once the AudioContext exists. update(dt,state)
// is implemented too (harmless if ever wired in) but the rAF loop is the real driver.
//
// Robustness: nothing throws if there is no AudioContext yet (suspended/autoplay-blocked).
// Early events before the first user gesture are dropped (one-shots) or remembered as desired
// loop/alarm state and (re)started once audio resumes.

import { RECIPES, MUSIC_STEMS } from '../data/audioRecipes.js';
import { playRecipe, releaseVoice, disposeVoice, getNoiseBuffer } from './synth.js';

// --- positional model (ARCHITECTURE / spec) ---
const D_NEAR = 40;     // wu — full volume within this
const D_FAR = 900;     // wu — silent / culled beyond this
const PAN_SPAN = 600;  // wu — half-pan distance

// --- music ---
const XFADE_S = 2.5;
const XFADE_COMBAT_S = 1.0;
const STATE_HOLD_S = 1.5;       // hysteresis
const IN_COMBAT_WINDOW = 6;     // s since last damage counts as "in combat"
// target stem weights per music state (A=calm drone, B=tense pad, C=combat, D=docked warm)
const STEM_WEIGHTS = {
  calm:   { A: 1.0, B: 0.0, C: 0.0, D: 0.0 },
  tense:  { A: 0.7, B: 0.8, C: 0.0, D: 0.0 },
  combat: { A: 0.4, B: 0.5, C: 1.0, D: 0.0 },
  docked: { A: 0.2, B: 0.2, C: 0.0, D: 0.9 },
};

const MAX_VOICES = 24;

function linearGain(v) { const c = v < 0 ? 0 : v > 1 ? 1 : v; return c * c; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// Build a fast id->recipe lookup over the data array.
const RECIPE_BY_ID = {};
for (const r of RECIPES) RECIPE_BY_ID[r.id] = r;

// Weapon-id / kind -> SFX recipe id. Player & NPC weapon defIds are 'wpn_*'; the combat:fire
// payload carries weaponId. We classify by substring so any catalog id resolves.
function recipeForWeapon(weaponId) {
  const id = (weaponId || '').toLowerCase();
  if (id.includes('beam')) return 'sfx_wpn_beam_laser';
  if (id.includes('rail')) return 'sfx_wpn_railgun';
  if (id.includes('missile') || id.includes('rocket') || id.includes('torp')) return 'sfx_wpn_missile';
  if (id.includes('cannon') || id.includes('gatling') || id.includes('flak') || id.includes('auto')) return 'sfx_wpn_autocannon';
  // pulse / laser / blaster / default
  return 'sfx_wpn_pulse_laser';
}

// Semantic cue ids (audio:cue / toast / ui:*) -> recipe id.
const CUE_TO_RECIPE = {
  click: 'sfx_ui_click', ui_click: 'sfx_ui_click', uiClick: 'sfx_ui_click',
  confirm: 'sfx_ui_confirm', ui_confirm: 'sfx_ui_confirm', buy: 'sfx_ui_confirm', sell: 'sfx_ui_confirm',
  deny: 'sfx_ui_click', error: 'sfx_ui_alert', alert: 'sfx_ui_alert', warning: 'sfx_ui_alert',
  pickup: 'sfx_mining_impact', cash: 'sfx_ui_confirm',
};

export const audio = {
  name: 'audio',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;

    // Runtime container (transient, never serialized — ARCHITECTURE §3.14).
    const rt = this.state.audioRuntime = this.state.audioRuntime || {};
    rt.ctx = null;
    rt.masterGain = null; rt.limiter = null; rt.sfxBus = null; rt.musicBus = null;
    rt.voices = [];               // active SFX voices (pooled, cap MAX_VOICES)
    rt.loops = {};                // keyed sustained voices: beam/mining/per-owner weapon beams
    rt.stems = { A: null, B: null, C: null, D: null };
    rt.stemGains = { A: null, B: null, C: null, D: null };
    rt.musicState = 'calm';
    rt.threat = 0;
    rt.alarms = { lowShield: false, lowHull: false };
    rt._caches = {};              // noise buffer + distortion curves
    rt._nextVoiceId = 1;
    rt._lastDamageT = -1e9;       // sim-time of last player damage (for inCombatRecent)
    rt._stateSince = 0;          // wallclock when current music state started
    rt._pendingState = null; rt._pendingSince = 0;
    rt._musicStarted = false;
    rt._duckUntil = 0;            // wallclock until which musicBus is ducked
    rt._alarmNext = { lowShield: 0, lowHull: 0 }; // next scheduled beep time (ctx.currentTime)
    rt._alarmFlip = { lowShield: false };
    rt._rafId = 0;
    rt._wantBeam = {};            // owners desiring a beam loop (started on resume)
    rt._wantMining = null;        // { minerId, targetId } desired mining loop
    this.rt = rt;

    const bus = this.bus;

    // --- lazy AudioContext on first user gesture (autoplay policy) ---
    this._gestureHandler = () => this._ensureContext();
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('pointerdown', this._gestureHandler, { once: false });
      window.addEventListener('keydown', this._gestureHandler, { once: false });
    }

    // --- event subscriptions (ARCHITECTURE §4.4 names + payloads) ---
    bus.on('combat:fire', (p) => this._onFire(p));
    bus.on('combat:beamStop', (p) => this._stopBeam(p && p.ownerId));
    bus.on('projectile:hit', (p) => this._onHit(p, false));
    bus.on('combat:damage', (p) => this._onDamage(p));
    bus.on('collision', (p) => this._onCollision(p));
    bus.on('shieldDown', (p) => this.play('sfx_wpn_pulse_laser', { gain: 0.5 }));
    bus.on('shieldRestored', () => {});
    bus.on('entity:killed', (p) => this._onKilled(p));
    bus.on('entity:destroyed', (p) => this._onDestroyed(p));
    bus.on('mining:start', (p) => this._onMiningStart(p));
    bus.on('mining:stop', (p) => this._onMiningStop(p));
    bus.on('mining:tick', (p) => this._onMiningTick(p));
    bus.on('asteroid:destroyed', (p) => this.play('sfx_explosion_small', { position: p && p.pos, gain: 0.7 }));
    bus.on('pickup:collected', (p) => this.play('sfx_mining_impact', { position: p && p.pos, gain: 0.8 }));
    bus.on('credits:changed', (p) => { if (p && p.delta > 0) this.play('sfx_ui_confirm', { gain: 0.7 }); });
    bus.on('economy:tradeCompleted', () => this.play('sfx_ui_confirm', { gain: 0.6 }));
    bus.on('dock:docked', (p) => this._onDocked(p));
    bus.on('dock:undocked', () => this._onUndocked());
    bus.on('jump:chargeStart', () => this._duckMusic());
    bus.on('jump:start', (p) => this._onJump(p));
    bus.on('sector:enter', () => { /* music recomputes threat next frame */ });
    bus.on('ship:boostStart', (p) => {
      // Sustained boost: a low engine roar. Reuse the small-explosion tail as a whoosh onset, gain low
      // so it layers under combat without crowding. Only the player's boost is audible (NPCs spam this).
      if (p && p.shipId === this.state.playerId) this.play('sfx_explosion_small', { gain: 0.18, rate: 0.55 });
    });
    bus.on('ship:boostStop', (p) => {});
    bus.on('ship:dash', (p) => {
      // Dash: a distinct, punchy forward-whoosh. Higher pitch + louder than boost so it reads as the
      // signature ability firing. Player-only (a fleet of dashing NPCs would be noise).
      if (p && p.shipId === this.state.playerId) this.play('sfx_explosion_small', { gain: 0.5, rate: 1.25 });
    });
    bus.on('toast', (p) => this._onCue((p && (p.kind === 'error' ? 'error' : 'click'))));
    bus.on('alert', (p) => this._onCue('alert'));
    bus.on('audio:cue', (p) => this._onCue(p && p.id));
    bus.on('settings:changed', (p) => { if (!p || p.section === 'audio' || p.section == null) this._applySettings(); });

    // UI namespaced cue events (DOM UI may emit these directly).
    bus.on('ui:click', () => this._onCue('click'));
    bus.on('ui:confirm', () => this._onCue('confirm'));
    bus.on('ui:deny', () => this._onCue('deny'));

    // Rebuild graph on load (transient runtime is wiped on load).
    bus.on('save:loaded', () => { this._applySettings(); });
    bus.on('game:started', () => { /* context already (or soon) created on gesture */ });

    // If a context already exists (hot reload), wire immediately.
    if (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
      // do not auto-create — wait for gesture; but be ready.
    }
  },

  // Implemented for completeness; the rAF loop is the real per-frame driver since the
  // registry does not call audio.update().
  update(dt, state) { /* no-op: driven by _frame() */ },

  // ---- context lifecycle ----
  _ensureContext() {
    const rt = this.rt;
    if (rt.ctx) {
      if (rt.ctx.state === 'suspended') { try { rt.ctx.resume(); } catch (_) {} }
      return rt.ctx;
    }
    const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    let ctx;
    try { ctx = new AC(); } catch (_) { return null; }
    rt.ctx = ctx;

    // master -> limiter -> destination
    const master = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    try {
      limiter.threshold.value = -6; limiter.knee.value = 6; limiter.ratio.value = 12;
      limiter.attack.value = 0.003; limiter.release.value = 0.25;
    } catch (_) {}
    const sfxBus = ctx.createGain();
    const musicBus = ctx.createGain();
    sfxBus.connect(master);
    musicBus.connect(master);
    master.connect(limiter);
    limiter.connect(ctx.destination);
    rt.masterGain = master; rt.limiter = limiter; rt.sfxBus = sfxBus; rt.musicBus = musicBus;

    getNoiseBuffer(ctx, rt._caches); // pre-build the shared noise buffer

    this._applySettings();
    try { if (ctx.state === 'suspended') ctx.resume(); } catch (_) {}

    this._buildMusic();
    this._startFrameLoop();
    return ctx;
  },

  _applySettings() {
    const rt = this.rt; if (!rt.ctx) return;
    const a = (this.state.settings && this.state.settings.audio) || {};
    const muted = !!a.muted;
    const t = rt.ctx.currentTime;
    const ramp = (param, target) => {
      try {
        param.cancelScheduledValues(t);
        param.setValueAtTime(Math.max(0.0001, param.value), t);
        param.linearRampToValueAtTime(Math.max(0.0001, target), t + 0.05);
      } catch (_) { try { param.value = target; } catch (__) {} }
    };
    ramp(rt.masterGain.gain, muted ? 0.0001 : Math.max(0.0001, linearGain(a.master == null ? 0.55 : a.master)));
    ramp(rt.sfxBus.gain, Math.max(0.0001, linearGain(a.sfx == null ? 0.7 : a.sfx)));
    // musicBus base gain (ducking multiplies this transiently)
    rt._musicBase = Math.max(0.0001, linearGain(a.music == null ? 0.32 : a.music));
    ramp(rt.musicBus.gain, rt._musicBase);
  },

  // ---- one-shot SFX API ----
  // play(recipeId, { position?:{x,z}, gain?, detune?, rate?, trackId? })
  play(recipeId, opts) {
    const rt = this.rt;
    const ctx = rt.ctx;
    if (!ctx || ctx.state !== 'running') return null; // graceful skip when suspended
    const recipe = RECIPE_BY_ID[recipeId];
    if (!recipe) return null;
    opts = opts || {};

    // positional attenuation + pan relative to player ship
    let att = 1, pan = 0, rate = opts.rate || 1;
    if (opts.position) {
      const p = this._playerPos();
      const d = Math.hypot(opts.position.x - p.x, opts.position.z - p.z);
      if (d > D_FAR) return null; // cull distant sounds
      att = clamp(1 - (d - D_NEAR) / (D_FAR - D_NEAR), 0, 1); att *= att;
      pan = clamp((opts.position.x - p.x) / PAN_SPAN, -1, 1);
    }
    const callGain = (opts.gain == null ? 1 : opts.gain);
    const recipeAmp = (recipe.gainEnvelope && recipe.gainEnvelope.peak) || this._ampFor(recipe);
    const peak = Math.min(1, recipeAmp * callGain * att);
    if (peak < 0.0008) return null;

    // per-call gain -> optional panner -> sfx bus
    let dest = rt.sfxBus;
    let panner = null;
    if (pan !== 0 && ctx.createStereoPanner) {
      panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      panner.connect(rt.sfxBus);
      dest = panner;
    }

    this._evictIfFull();
    const voice = playRecipe(ctx, recipe, dest, {
      peakGain: peak, detune: opts.detune || 0, rate, id: rt._nextVoiceId++, trackId: opts.trackId || null,
    }, rt._caches);
    voice._panner = panner;
    rt.voices.push(voice);
    return voice;
  },

  _ampFor(recipe) {
    // recipes don't carry an explicit amp; derive a sane per-category peak.
    switch (recipe.category) {
      case 'explosion': return 0.85;
      case 'weapon': return 0.3;
      case 'mining': return 0.3;
      case 'ui': return 0.16;
      case 'engine': return 0.25;
      default: return 0.4;
    }
  },

  _evictIfFull() {
    const rt = this.rt;
    // count only non-loop voices toward the cap; steal oldest if at cap
    if (rt.voices.length < MAX_VOICES) return;
    let oldest = -1, oldestT = Infinity;
    for (let i = 0; i < rt.voices.length; i++) {
      const v = rt.voices[i];
      if (v.loop) continue;
      if (v.startedAt < oldestT) { oldestT = v.startedAt; oldest = i; }
    }
    if (oldest >= 0) {
      const v = rt.voices[oldest];
      try { releaseVoice(rt.ctx, v); } catch (_) {}
      disposeVoice(v);
      if (v._panner) { try { v._panner.disconnect(); } catch (_) {} }
      rt.voices.splice(oldest, 1);
    }
  },

  _playerPos() {
    const e = this.state.entities.get(this.state.playerId);
    return e ? e.pos : { x: 0, z: 0 };
  },

  // ---- event handlers ----
  _onFire(p) {
    if (!p) return;
    const rid = recipeForWeapon(p.weaponId);
    if (rid === 'sfx_wpn_beam_laser') {
      // sustained beam: start a loop keyed by owner; stopped on combat:beamStop
      this._startBeam(p.ownerId, p.origin);
      return;
    }
    this.play(rid, { position: p.origin, gain: 0.85 });
  },

  _startBeam(ownerId, pos) {
    const rt = this.rt;
    if (ownerId == null) return;
    rt._wantBeam[ownerId] = true;
    const ctx = rt.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (rt.loops['beam_' + ownerId]) return;
    const v = this._startLoopVoice('sfx_wpn_beam_laser', pos, 0.85);
    if (v) { v.trackId = ownerId; rt.loops['beam_' + ownerId] = v; }
  },

  _stopBeam(ownerId) {
    const rt = this.rt;
    if (ownerId == null) return;
    delete rt._wantBeam[ownerId];
    const key = 'beam_' + ownerId;
    const v = rt.loops[key];
    if (v) { this._endLoopVoice(v); delete rt.loops[key]; }
  },

  _onHit(p) {
    if (!p) return;
    // projectile:hit has no shield/hull split; play a generic hull tick unless combat:damage
    // (which carries brokeShield) also fires — keep this light to avoid double sounds.
    this.play('sfx_mining_impact', { position: p.pos, gain: 0.5, rate: 1.4 });
  },

  _onDamage(p) {
    if (!p) return;
    if (p.isPlayer) this.rt._lastDamageT = this.state.simTime;
    // shield hit vs hull hit (brokeShield true => shield just dropped, play harder)
    const rid = (p.brokeShield === false && p.kind !== 'hull') ? 'sfx_wpn_pulse_laser' : 'sfx_explosion_small';
    // Prefer a short metallic/energy tick; reuse mining impact for hull, pulse for shield.
    const onShield = p.brokeShield !== true && p.kind !== 'hull';
    this.play(onShield ? 'sfx_wpn_pulse_laser' : 'sfx_mining_impact', {
      position: p.pos || p.hitPoint, gain: onShield ? 0.35 : 0.6, rate: onShield ? 1.1 : 0.9,
    });
  },

  _onCollision(p) {
    if (!p) return;
    this.play('sfx_explosion_small', { position: p.pos, gain: clamp((p.impulse || 1) * 0.3, 0.15, 0.7), rate: 0.8 });
  },

  _onKilled(p) {
    if (!p) return;
    const big = p.victimClass === 'capital' || p.victimClass === 'large' || p.type === 'station';
    this.play(big ? 'sfx_explosion_large' : 'sfx_explosion_small', { position: p.pos, gain: 1 });
    if (big) this._duckMusic();
  },

  _onDestroyed(p) {
    if (!p) return;
    // Only ships/drones/wrecks get an explosion here; asteroids handled via asteroid:destroyed,
    // projectiles/pickups/fx are silent. entity:killed already covered combat kills, so keep this
    // to non-ship physical destructions to avoid doubling.
    if (p.type === 'drone' || p.type === 'wreck' || p.type === 'station') {
      this.play(p.type === 'station' ? 'sfx_explosion_large' : 'sfx_explosion_small', { position: p.pos, gain: 0.8 });
    }
  },

  _onMiningStart(p) {
    const rt = this.rt;
    if (!p) return;
    rt._wantMining = { minerId: p.minerId, targetId: p.targetId };
    const ctx = rt.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (rt.loops.mining) return;
    const v = this._startLoopVoice('sfx_mining_beam', p.position, 0.6);
    if (v) { v.trackId = p.targetId; rt.loops.mining = v; }
  },

  _onMiningStop(p) {
    const rt = this.rt;
    rt._wantMining = null;
    if (rt.loops.mining) { this._endLoopVoice(rt.loops.mining); delete rt.loops.mining; }
  },

  _onMiningTick(p) {
    // small impact tick on the contact point (gated by retrigger to avoid storms)
    const rt = this.rt;
    const now = rt.ctx ? rt.ctx.currentTime : 0;
    if (now - (rt._lastMiningTick || 0) < 0.08) return;
    rt._lastMiningTick = now;
    this.play('sfx_mining_impact', { position: p && p.contactPos, gain: 0.4, rate: 0.9 + Math.random() * 0.4 });
  },

  _startLoopVoice(recipeId, position, gain) {
    const rt = this.rt, ctx = rt.ctx;
    if (!ctx || ctx.state !== 'running') return null;
    const recipe = RECIPE_BY_ID[recipeId];
    if (!recipe) return null;
    let att = 1, pan = 0;
    if (position) {
      const pp = this._playerPos();
      const d = Math.hypot(position.x - pp.x, position.z - pp.z);
      att = clamp(1 - (d - D_NEAR) / (D_FAR - D_NEAR), 0, 1); att *= att;
      pan = clamp((position.x - pp.x) / PAN_SPAN, -1, 1);
    }
    let dest = rt.sfxBus, panner = null;
    if (ctx.createStereoPanner) { panner = ctx.createStereoPanner(); panner.pan.value = pan; panner.connect(rt.sfxBus); dest = panner; }
    const peak = Math.min(1, this._ampFor(recipe) * (gain == null ? 1 : gain) * att);
    const v = playRecipe(ctx, recipe, dest, { peakGain: Math.max(0.02, peak), id: rt._nextVoiceId++ }, rt._caches);
    v._panner = panner;
    v._baseGain = this._ampFor(recipe) * (gain == null ? 1 : gain);
    rt.voices.push(v);
    return v;
  },

  _endLoopVoice(v) {
    const rt = this.rt;
    try { releaseVoice(rt.ctx, v); } catch (_) {}
    // GC happens in _frame() once stopAt passes; mark panner for cleanup there
  },

  _onDocked(p) {
    this.play('sfx_ui_confirm', { gain: 0.9, rate: 0.6 });
    this.rt._docked = true;
  },

  _onUndocked() {
    this.rt._docked = false;
  },

  _onJump(p) {
    // warp sweep + duck music. Build a rising saw glide one-shot inline (no dedicated recipe).
    this._duckMusic(1.2);
    this.play('sfx_wpn_railgun', { gain: 0.9, rate: 0.7 });
  },

  _onCue(id) {
    if (!id) { this.play('sfx_ui_click', { gain: 0.7 }); return; }
    const rid = CUE_TO_RECIPE[id] || (RECIPE_BY_ID[id] ? id : 'sfx_ui_click');
    this.play(rid, { gain: 0.8 });
  },

  _duckMusic(seconds) {
    const rt = this.rt; if (!rt.ctx) return;
    rt._duckUntil = rt.ctx.currentTime + (seconds || 0.8);
    const t = rt.ctx.currentTime;
    try {
      rt.musicBus.gain.cancelScheduledValues(t);
      rt.musicBus.gain.setValueAtTime(Math.max(0.0001, rt.musicBus.gain.value), t);
      rt.musicBus.gain.linearRampToValueAtTime(Math.max(0.0001, (rt._musicBase || 0.5) * 0.5), t + 0.08);
    } catch (_) {}
  },

  // ---- adaptive music bed ----
  _buildMusic() {
    const rt = this.rt, ctx = rt.ctx;
    if (!ctx || rt._musicStarted) return;
    rt._musicStarted = true;
    // Map our 4 states to MUSIC_STEMS indices: A=calm, B=tense, C=combat, D=docked(reuse boss/warm).
    const stemKeys = ['A', 'B', 'C', 'D'];
    for (let i = 0; i < 4; i++) {
      const key = stemKeys[i];
      const def = MUSIC_STEMS[i] || MUSIC_STEMS[MUSIC_STEMS.length - 1];
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      g.connect(rt.musicBus);
      rt.stemGains[key] = g;
      rt.stems[key] = this._buildStemVoices(ctx, def, g, key);
    }
    rt._stateSince = ctx.currentTime;
    this._setMusicState('calm', true);
  },

  // Build a small continuous oscillator cluster for a stem; only the parent gain is automated.
  _buildStemVoices(ctx, def, parentGain, key) {
    const nodes = [];
    const t0 = ctx.currentTime;
    // root frequencies per state for an Am-ish bed
    const ROOTS = { A: 55, B: 110, C: 110, D: 130.81 };
    const root = ROOTS[key] || 110;
    const chord = key === 'D'
      ? [root, root * 1.25, root * 1.5, root * 2]               // docked: warm major triad + octave
      : key === 'B'
        ? [root, root * 1.2, root * 1.5, root * 1.8]            // tense: minor add the b7 tension
        : key === 'C'
          ? [root * 0.5, root, root * 1.5]                      // combat: bass + fifth (driving)
          : [root, root * 1.5, root * 2, root * 2.5];           // calm: open root-fifth-octave-tenth pad

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    // Softer, darker cutoffs so the bed is ambient, not buzzy.
    lp.frequency.value = key === 'C' ? 1100 : key === 'D' ? 900 : key === 'B' ? 850 : 480;
    lp.connect(parentGain);

    for (let i = 0; i < chord.length; i++) {
      const o = ctx.createOscillator();
      // Warm triangles for the ambient stems; combat keeps a little edge with a sawtooth (was a
      // harsh square). This removes most of the "screaming" overtones from the drone bed.
      o.type = key === 'C' ? 'sawtooth' : 'triangle';
      o.frequency.value = chord[i];
      o.detune.value = (i - chord.length / 2) * 4; // gentle chorus
      const og = ctx.createGain();
      og.gain.value = 1 / chord.length;
      o.connect(og); og.connect(lp);
      try { o.start(t0); } catch (_) {}
      nodes.push(o, og);
    }
    // slow swell LFO for docked/calm
    if (key === 'A' || key === 'D') {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = key === 'D' ? 0.2 : 0.07;
      lg.gain.value = key === 'D' ? 200 : 120;
      lfo.connect(lg); lg.connect(lp.frequency);
      try { lfo.start(t0); } catch (_) {}
      nodes.push(lfo, lg);
    }
    // combat percussion pulse: amplitude LFO on parent via a gated gain
    if (key === 'C') {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 130 / 60 * 2; // ~8th notes at 130 BPM
      lg.gain.value = 0.18;
      const bias = ctx.createConstantSource ? ctx.createConstantSource() : null;
      lfo.connect(lg); lg.connect(parentGain.gain);
      try { lfo.start(t0); } catch (_) {}
      nodes.push(lfo, lg);
      if (bias) nodes.push(bias);
    }
    return { nodes, lp };
  },

  _setMusicState(stateName, instant) {
    const rt = this.rt, ctx = rt.ctx;
    if (!ctx) return;
    rt.musicState = stateName;
    const w = STEM_WEIGHTS[stateName] || STEM_WEIGHTS.calm;
    const xf = stateName === 'combat' ? XFADE_COMBAT_S : XFADE_S;
    const t = ctx.currentTime;
    for (const key of ['A', 'B', 'C', 'D']) {
      const g = rt.stemGains[key]; if (!g) continue;
      const target = Math.max(0.0001, w[key]);
      try {
        if (instant) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(target, t); }
        else { g.gain.setTargetAtTime(target, t, xf / 3); }
      } catch (_) { try { g.gain.value = target; } catch (__) {} }
    }
  },

  // Derive nearby-hostile count + shield% -> threat -> music state with hysteresis.
  _recomputeMusic(nowWall) {
    const rt = this.rt, state = this.state;
    const player = state.entities.get(state.playerId);
    let shieldPct = 1, nearbyHostiles = 0;
    let docked = !!(rt._docked || (player && player.flags && player.flags.docked) || state.ui.docked);
    if (player) {
      shieldPct = player.shieldMax > 0 ? clamp(player.shield / player.shieldMax, 0, 1) : 1;
      // count nearby hostile ships (different team, alive, within range)
      const myTeam = player.team;
      const range = 1200, r2 = range * range;
      const px = player.pos.x, pz = player.pos.z;
      for (const e of state.entityList) {
        if (!e.alive || e.type !== 'ship' || e.id === player.id) continue;
        if (e.team === myTeam) continue;
        const dx = e.pos.x - px, dz = e.pos.z - pz;
        if (dx * dx + dz * dz <= r2) { nearbyHostiles++; if (nearbyHostiles >= 3) break; }
      }
    }
    const inCombatRecent = (state.simTime - rt._lastDamageT) < IN_COMBAT_WINDOW ? 1 : 0;
    const threat = clamp(0.5 * Math.min(nearbyHostiles, 3) / 3 + 0.5 * (1 - shieldPct) * inCombatRecent, 0, 1);
    rt.threat = threat;

    let desired = docked ? 'docked' : (threat >= 0.6 ? 'combat' : threat >= 0.2 ? 'tense' : 'calm');

    if (desired === rt.musicState) { rt._pendingState = null; return; }
    // hysteresis: hold the change for STATE_HOLD_S before switching (docked is immediate)
    if (desired === 'docked' || rt.musicState === 'docked') {
      this._setMusicState(desired);
      rt._stateSince = nowWall; rt._pendingState = null;
      return;
    }
    if (rt._pendingState !== desired) { rt._pendingState = desired; rt._pendingSince = nowWall; return; }
    if (nowWall - rt._pendingSince >= STATE_HOLD_S) {
      this._setMusicState(desired);
      rt._stateSince = nowWall; rt._pendingState = null;
    }
  },

  // ---- alarm scheduler (lookahead, ctx.currentTime based, no setInterval drift) ----
  _tickAlarms() {
    const rt = this.rt, ctx = rt.ctx;
    if (!ctx) return;
    const player = this.state.entities.get(this.state.playerId);
    let shieldPct = 1, hullPct = 1;
    if (player) {
      shieldPct = player.shieldMax > 0 ? clamp(player.shield / player.shieldMax, 0, 1) : 1;
      hullPct = player.hullMax > 0 ? clamp(player.hull / player.hullMax, 0, 1) : 1;
    }
    const alive = player && player.alive;
    rt.alarms.lowShield = !!(alive && shieldPct < 0.18);
    rt.alarms.lowHull = !!(alive && hullPct < 0.20);

    if (ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const horizon = now + 0.15;

    // low-shield: soft alternating 587/440 triangle chirp, brief, with a long gap so it informs
    // without screaming (was a near-continuous 880/660 square siren — the main "scream").
    if (rt.alarms.lowShield) {
      while (rt._alarmNext.lowShield < horizon) {
        const t = Math.max(rt._alarmNext.lowShield, now);
        this._beep(rt._alarmFlip.lowShield ? 440 : 587, t, 0.10, 0.05, 'triangle');
        rt._alarmFlip.lowShield = !rt._alarmFlip.lowShield;
        rt._alarmNext.lowShield = t + 0.10 + 0.42;
      }
    } else { rt._alarmNext.lowShield = now; }

    // low-hull: gentle 330 sine pulse 0.22s on / 0.6s off (was a louder 440 pulse)
    if (rt.alarms.lowHull) {
      while (rt._alarmNext.lowHull < horizon) {
        const t = Math.max(rt._alarmNext.lowHull, now);
        this._beep(330, t, 0.22, 0.085, 'sine');
        rt._alarmNext.lowHull = t + 0.22 + 0.6;
      }
    } else { rt._alarmNext.lowHull = now; }
  },

  _beep(freq, t0, dur, gain, wave) {
    const rt = this.rt, ctx = rt.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const o = ctx.createOscillator();
    o.type = wave || 'square';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.setValueAtTime(gain, t0 + dur - 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(rt.sfxBus);
    try { o.start(t0); o.stop(t0 + dur + 0.02); } catch (_) {}
    o.onended = () => { try { o.disconnect(); g.disconnect(); } catch (_) {} };
  },

  // ---- per-frame driver (self-owned rAF; registry does not call audio.update) ----
  _startFrameLoop() {
    const rt = this.rt;
    if (rt._rafId || typeof requestAnimationFrame === 'undefined') return;
    const tick = () => {
      rt._rafId = requestAnimationFrame(tick);
      this._frame();
    };
    rt._rafId = requestAnimationFrame(tick);
  },

  _frame() {
    const rt = this.rt, ctx = rt.ctx;
    if (!ctx) return;
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (_) {} }
    const nowWall = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    const now = ctx.currentTime;

    // (re)start any desired loop voices that were requested while suspended
    if (ctx.state === 'running') {
      for (const ownerId in rt._wantBeam) {
        if (!rt.loops['beam_' + ownerId]) this._startBeam(Number(ownerId));
      }
      if (rt._wantMining && !rt.loops.mining) this._onMiningStart({ minerId: rt._wantMining.minerId, targetId: rt._wantMining.targetId });
    }

    // recover music gain after a duck
    if (rt._duckUntil && now >= rt._duckUntil && rt.musicBus) {
      rt._duckUntil = 0;
      try {
        rt.musicBus.gain.cancelScheduledValues(now);
        rt.musicBus.gain.setValueAtTime(Math.max(0.0001, rt.musicBus.gain.value), now);
        rt.musicBus.gain.linearRampToValueAtTime(Math.max(0.0001, rt._musicBase || 0.5), now + 0.8);
      } catch (_) {}
    }

    this._recomputeMusic(nowWall);
    this._tickAlarms();
    this._updateLoopPositions();
    this._gcVoices(now);
  },

  // Track positional loop voices (beam/mining) toward their target's current position.
  _updateLoopPositions() {
    const rt = this.rt;
    const pp = this._playerPos();
    const apply = (v) => {
      if (!v || v.trackId == null) return;
      const e = this.state.entities.get(v.trackId);
      if (!e) return;
      const d = Math.hypot(e.pos.x - pp.x, e.pos.z - pp.z);
      let att = clamp(1 - (d - D_NEAR) / (D_FAR - D_NEAR), 0, 1); att *= att;
      const pan = clamp((e.pos.x - pp.x) / PAN_SPAN, -1, 1);
      const t = rt.ctx.currentTime;
      try { v.gain.gain.setTargetAtTime(Math.max(0.0001, (v._baseGain || 0.3) * att), t, 0.05); } catch (_) {}
      if (v._panner) { try { v._panner.pan.setTargetAtTime(pan, t, 0.05); } catch (_) {} }
    };
    for (const k in rt.loops) apply(rt.loops[k]);
  },

  _gcVoices(now) {
    const rt = this.rt;
    for (let i = rt.voices.length - 1; i >= 0; i--) {
      const v = rt.voices[i];
      if (v.loop && !v._stopped) continue; // sustaining
      if (v.stopAt !== Infinity && now >= v.stopAt) {
        disposeVoice(v);
        if (v._panner) { try { v._panner.disconnect(); } catch (_) {} }
        rt.voices.splice(i, 1);
        // also clear from loops map if present
        for (const k in rt.loops) if (rt.loops[k] === v) delete rt.loops[k];
      }
    }
  },
};
