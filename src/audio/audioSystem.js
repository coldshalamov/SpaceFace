// src/audio/audioSystem.js — the `audio` system. 100% Web Audio synthesis (no files, no three).
// Builds master -> limiter -> { sfxBus, musicBus }, synthesizes SFX from RECIPES on gameplay
// events with 2D distance attenuation + stereo pan relative to the player ship, runs low-shield /
// low-hull alarm loops, and an adaptive 4-state music bed (calm/tense/combat/docked) driven by a
// derived threat level. Honors settings.audio.{master,sfx,music,muted} and settings:changed.
//
// IMPORTANT: the registry never calls audio.update() (audio is init-only; it is not in
// UPDATE_ORDER and not invoked in renderUpdate). So runtime audio work is driven by a self-owned
// requestAnimationFrame loop that starts once the AudioContext exists. Audible scheduling and voice
// GC still run every frame; analysis-style music threat scans and loop-position automation are
// cadence-limited inside that loop. update(dt,state) is implemented too (harmless if ever wired in).
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
const MUSIC_RECOMPUTE_S = 0.1;  // analysis cadence; state changes still have 1.5s hysteresis
const LOOP_POSITION_UPDATE_S = 0.05; // AudioParam smoothing already runs over this window
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
  hover: 'sfx_ui_hover', ui_hover: 'sfx_ui_hover', uiHover: 'sfx_ui_hover',
  confirm: 'sfx_ui_confirm', ui_confirm: 'sfx_ui_confirm', buy: 'sfx_ui_confirm', sell: 'sfx_ui_confirm',
  deny: 'sfx_ui_click', error: 'sfx_ui_alert', alert: 'sfx_ui_alert', warning: 'sfx_ui_alert',
  pickup: 'sfx_mining_impact', cash: 'sfx_ui_confirm',
  'presentation.tether.attach': 'sfx_boost_whoosh',
  'presentation.tether.near_break': 'sfx_ui_alert',
  'presentation.tether.break': 'sfx_explosion_small',
  'presentation.shield.collapse': 'sfx_explosion_small',
  'presentation.subsystem.disabled': 'sfx_ui_alert',
  'presentation.scenario.signal': 'sfx_ui_alert',
  'presentation.comms.priority': 'sfx_ui_alert',
  'presentation.objective.split': 'sfx_ui_alert',
  'presentation.branch.resolved': 'sfx_ui_confirm',
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
    rt._paused = false;           // set by sim:pause, cleared by sim:resume (gate sim-driven audio)
    rt._alarmNext = { lowShield: 0, lowHull: 0 }; // next scheduled beep time (ctx.currentTime)
    rt._alarmFlip = { lowShield: false };
    rt._rafId = 0;
    rt._wantBeam = {};            // owners desiring a beam loop (started on resume)
    rt._wantMining = null;        // { minerId, targetId } desired mining loop
    rt._musicDirty = true;
    rt._nextMusicScan = 0;
    rt._loopPositionDirty = true;
    rt._nextLoopPositionUpdate = 0;
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
    bus.on('shieldDown', (p) => {
      // Shield break: a sharp energy crackle at the target's position. Use the explosion-small recipe
      // with a high pitch shift so it reads as an energy discharge, not a kinetic blast.
      const pos = p && p.pos;
      const target = p && p.combatantId ? this.state.entities.get(p.combatantId) : null;
      const position = pos || (target ? { x: target.pos.x, z: target.pos.z } : null);
      this.play('sfx_explosion_small', { position, gain: 0.7, rate: 1.6 });
    });
    bus.on('shieldRestored', () => {});
    bus.on('entity:killed', (p) => this._onKilled(p));
    bus.on('entity:destroyed', (p) => this._onDestroyed(p));
    bus.on('player:death', (p) => this._onPlayerDeath(p));
    bus.on('player:respawn', (p) => this._onPlayerRespawn(p));
    bus.on('mining:start', (p) => this._onMiningStart(p));
    bus.on('mining:stop', (p) => this._onMiningStop(p));
    bus.on('mining:tick', (p) => this._onMiningTick(p));
    bus.on('asteroid:destroyed', (p) => this.play('sfx_explosion_small', { position: p && p.pos, gain: 0.7 }));
    bus.on('pickup:collected', (p) => this.play('sfx_mining_impact', { position: p && p.pos, gain: 0.8 }));
    bus.on('credits:changed', (p) => { if (p && p.delta > 0) this.play('sfx_ui_confirm', { gain: 0.7 }); });
    bus.on('economy:tradeCompleted', () => this.play('sfx_ui_confirm', { gain: 0.6 }));
    bus.on('dock:docked', (p) => this._onDocked(p));
    bus.on('dock:undocked', () => this._onUndocked());
    bus.on('jump:chargeStart', () => {
      this._duckMusic();
      this.play('sfx_jump_charge', { gain: 0.5, rate: 0.6 }); // early charge buildup
    });
    bus.on('jump:start', (p) => this._onJump(p));
    bus.on('sector:enter', () => { this._markMusicDirty(); });
    bus.on('ship:boostStart', (p) => {
      // Boost activation: a dedicated breathy whoosh, distinct from explosions.
      // Player-only (NPCs spam this).
      if (p && p.shipId === this.state.playerId) this.play('sfx_boost_whoosh', { gain: 0.35 });
    });
    bus.on('ship:boostStop', (p) => {});
    bus.on('ship:dash', (p) => {
      // Dash: louder, higher-pitched whoosh for the signature ability.
      // Player-only (a fleet of dashing NPCs would be noise).
      if (p && p.shipId === this.state.playerId) this.play('sfx_boost_whoosh', { gain: 0.6, rate: 1.4 });
    });
    bus.on('toast', (p) => this._onCue((p && (p.kind === 'error' ? 'error' : 'click'))));
    bus.on('alert', (p) => this._onCue('alert'));
    bus.on('audio:cue', (p) => this._onCue(p));
    bus.on('settings:changed', (p) => { if (!p || p.section === 'audio' || p.section == null) this._applySettings(); });

    // Pause respect (V2 §17 anti-pattern: "audio playing behind the pause menu"). When the sim
    // freezes (pause menu, save-load swap, main menu), we duck music to silence, stop scheduling
    // alarm beeps, and skip threat/music recomputation so the bed doesn't churn. On resume we
    // restore the music bus and re-seed the alarm timers. UI cues (clicks) still play so menus
    // feel responsive.
    bus.on('sim:pause', () => this._onPause(true));
    bus.on('sim:resume', () => this._onPause(false));

    // UI namespaced cue events (DOM UI may emit these directly).
    bus.on('ui:click', () => this._onCue('click'));
    bus.on('ui:hover', () => this._onCue('hover'));
    bus.on('ui:confirm', () => this._onCue('confirm'));
    bus.on('ui:deny', () => this._onCue('deny'));

    // Rebuild graph on load (transient runtime is wiped on load).
    bus.on('save:loaded', () => { this._applySettings(); this._markMusicDirty(); });
    bus.on('game:started', () => { /* context already (or soon) created on gesture */ });

    // If a context already exists (hot reload), wire immediately.
    if (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
      // do not auto-create — wait for gesture; but be ready.
    }
  },

  // Implemented for completeness; the rAF loop is the real per-frame driver since the
  // registry does not call audio.update().
  update(dt, state) { /* no-op: driven by _frame() */ },

  _markMusicDirty() {
    if (this.rt) this.rt._musicDirty = true;
  },

  _markLoopPositionDirty() {
    if (this.rt) this.rt._loopPositionDirty = true;
  },

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

  // Pause/resume handler. Ducks music to silence and stops alarm scheduling so the pause menu is
  // quiet; SFX one-shots and UI cues keep working (menus need feedback). Idempotent.
  _onPause(paused) {
    const rt = this.rt;
    rt._paused = !!paused;
    const ctx = rt.ctx;
    if (!ctx) return;
    if (paused) {
      // duck music to ~0 over 80ms so the cutoff is smooth, not a hard cut
      try {
        const t = ctx.currentTime;
        rt.musicBus.gain.cancelScheduledValues(t);
        rt.musicBus.gain.setValueAtTime(Math.max(0.0001, rt.musicBus.gain.value), t);
        rt.musicBus.gain.linearRampToValueAtTime(0.0001, t + 0.08);
      } catch (_) {}
    } else {
      // restore to the configured music base
      try {
        const t = ctx.currentTime;
        rt.musicBus.gain.cancelScheduledValues(t);
        rt.musicBus.gain.setValueAtTime(Math.max(0.0001, rt.musicBus.gain.value), t);
        rt.musicBus.gain.linearRampToValueAtTime(Math.max(0.0001, rt._musicBase || 0.5), t + 0.4);
      } catch (_) {}
      // re-seed alarm timers so they don't dump a backlog burst on resume
      rt._alarmNext.lowShield = ctx.currentTime;
      rt._alarmNext.lowHull = ctx.currentTime;
      this._markMusicDirty();
      this._markLoopPositionDirty();
    }
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
    if (v) { v.trackId = ownerId; rt.loops['beam_' + ownerId] = v; this._markLoopPositionDirty(); }
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
    if (p.isPlayer) { this.rt._lastDamageT = this.state.simTime; this._markMusicDirty(); }
    // Shield-absorbed hits get a bright energy tick (pulse laser); hull hits get a heavier metallic
    // crunch (mining impact, pitch-shifted down). shieldAbsorbed is the authoritative flag from the
    // combat pipeline — brokeShield only indicates the shield BROKE this hit, not whether shields
    // were active. Without shieldAbsorbed, hull hits on a ship with depleted shields would
    // incorrectly play the shield-hit sound.
    const onShield = !!p.shieldAbsorbed;
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

  _onPlayerDeath(p) {
    // Big dramatic explosion at the player's location — use the dedicated heavy recipe, no position
    // (player is always at center, full volume). Duck the music so it hits hard.
    this._duckMusic(2.0);
    this.play('sfx_player_death', { gain: 1.0 });
  },

  _onPlayerRespawn(p) {
    // Ascending respawn chime — bright, hopeful, tells the player they're back in the fight.
    // Slight delay so the respawn visual has a beat before the audio lands.
    setTimeout(() => {
      this.play('sfx_respawn_chime', { gain: 0.7 });
      // Second chime a perfect fifth up for a triumphant feel
      setTimeout(() => this.play('sfx_respawn_chime', { gain: 0.5, rate: 1.5 }), 180);
    }, 250);
  },

  _onMiningStart(p) {
    const rt = this.rt;
    if (!p) return;
    rt._wantMining = { minerId: p.minerId, targetId: p.targetId };
    const ctx = rt.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (rt.loops.mining) return;
    const v = this._startLoopVoice('sfx_mining_beam', p.position, 0.6);
    if (v) { v.trackId = p.targetId; rt.loops.mining = v; this._markLoopPositionDirty(); }
  },

  _onMiningStop(p) {
    const rt = this.rt;
    rt._wantMining = null;
    if (rt.loops.mining) { this._endLoopVoice(rt.loops.mining); delete rt.loops.mining; }
    this._markLoopPositionDirty();
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
    // Docking sequence: metallic clunk impact + confirmation chime
    this.play('sfx_dock_clunk', { gain: 0.9 });
    // Slight delay on the confirmation chime so it feels like clunk-then-lock
    setTimeout(() => this.play('sfx_ui_confirm', { gain: 0.6, rate: 0.7 }), 180);
    this.rt._docked = true;
    this._markMusicDirty();
    // Start ambient station hum loop
    this._startStationHum();
  },

  _onUndocked() {
    this.rt._docked = false;
    this._markMusicDirty();
    // Stop station hum
    this._stopStationHum();
  },

  _startStationHum() {
    const rt = this.rt, ctx = rt.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (rt.loops.stationHum) return;
    // Build a layered station hum: low drone + ventilation noise
    const humOsc = ctx.createOscillator();
    humOsc.type = 'triangle';
    humOsc.frequency.value = 60;
    const humOsc2 = ctx.createOscillator();
    humOsc2.type = 'sine';
    humOsc2.frequency.value = 120.2; // slight detune for chorus
    const humGain = ctx.createGain();
    humGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    humGain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 2.0); // slow fade in
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 200;
    humFilter.Q.value = 1.0;
    // Ventilation layer: filtered noise
    const ventBuf = getNoiseBuffer(ctx, rt._caches);
    const ventSrc = ctx.createBufferSource();
    ventSrc.buffer = ventBuf;
    ventSrc.loop = true;
    const ventGain = ctx.createGain();
    ventGain.gain.value = 0.015;
    const ventFilter = ctx.createBiquadFilter();
    ventFilter.type = 'bandpass';
    ventFilter.frequency.value = 300;
    ventFilter.Q.value = 0.5;
    humOsc.connect(humFilter);
    humOsc2.connect(humFilter);
    humFilter.connect(humGain);
    ventSrc.connect(ventFilter);
    ventFilter.connect(humGain);
    humGain.connect(rt.sfxBus);
    try { humOsc.start(ctx.currentTime); humOsc2.start(ctx.currentTime); ventSrc.start(ctx.currentTime); } catch (_) {}
    rt.loops.stationHum = {
      nodes: [humOsc, humOsc2, ventSrc, humGain, humFilter, ventFilter, ventGain],
      gain: humGain, sources: [humOsc, humOsc2, ventSrc], extra: [],
      startedAt: ctx.currentTime, loop: true, stopAt: Infinity, _stopped: false,
      releaseDur: 1.5, callGain: 0.04, id: rt._nextVoiceId++,
    };
  },

  _stopStationHum() {
    const rt = this.rt, ctx = rt.ctx;
    if (!rt.loops.stationHum) return;
    const hum = rt.loops.stationHum;
    if (ctx) {
      // Fade out over 1.5s
      try {
        const t = ctx.currentTime;
        hum.gain.gain.cancelScheduledValues(t);
        hum.gain.gain.setValueAtTime(Math.max(0.0001, hum.gain.gain.value), t);
        hum.gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      } catch (_) {}
      // Schedule stop
      setTimeout(() => {
        for (const n of hum.nodes) { try { n.stop(); } catch (_) {} try { n.disconnect(); } catch (_) {} }
      }, 2000);
    }
    delete rt.loops.stationHum;
  },

  _onJump(p) {
    // Warp: charge sound (rising energy) + duck music + arrival whoosh after a beat
    this._duckMusic(1.8);
    this.play('sfx_jump_charge', { gain: 0.8 });
    // Arrival decompression after the charge completes
    setTimeout(() => {
      this.play('sfx_jump_arrive', { gain: 0.7 });
    }, 400);
  },

  _onCue(cue) {
    const id = typeof cue === 'string' ? cue : cue && cue.id;
    if (!id) { this.play('sfx_ui_click', { gain: 0.7 }); return; }
    const rid = CUE_TO_RECIPE[id] || (RECIPE_BY_ID[id] ? id : 'sfx_ui_click');
    const opts = (cue && typeof cue === 'object') ? cue : {};
    if (opts.duck) this._duckMusic(opts.duckSeconds || 0.8);
    this.play(rid, {
      gain: opts.gain == null ? 0.8 : opts.gain,
      position: opts.position || null,
      rate: opts.rate || 1,
    });
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

  // ---- Musical composition engine ----
  // Each stem is a self-scheduling sequencer that plays arpeggiated patterns, bass lines,
  // pad chords, and rhythmic elements using short-lived oscillator voices (< 6 simultaneous).
  // The old approach used always-on drone oscillators through a lowpass — musical but static.
  // This new system creates actual melodies, rhythms, and harmonic movement.

  // Note frequencies (A minor / C major family). Octave 3 = middle range.
  _noteFreq(note, octave) {
    const SEMITONES = { C:0, 'C#':1, Db:1, D:2, 'D#':3, Eb:3, E:4, F:5, 'F#':6, Gb:6, G:7, 'G#':8, Ab:8, A:9, 'A#':10, Bb:10, B:11 };
    const s = SEMITONES[note];
    if (s == null) return 440;
    // A4 = 440 Hz reference
    return 440 * Math.pow(2, (s - 9) / 12 + (octave - 4));
  },

  // Play a single musical note: creates an oscillator, applies a gain envelope, routes
  // through the provided filter and parent gain, and self-destructs after the note ends.
  // Returns the oscillator node. maxGain 0-1, durS in seconds.
  _playNote(ctx, freq, durS, maxGain, wave, filterNode, delayNode, t0) {
    const o = ctx.createOscillator();
    o.type = wave || 'triangle';
    o.frequency.value = freq;
    const g = ctx.createGain();
    const attack = Math.min(durS * 0.15, 0.04);
    const release = Math.min(durS * 0.4, 0.15);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(maxGain, t0 + attack);
    g.gain.setValueAtTime(maxGain, t0 + durS - release);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durS);
    o.connect(g);
    if (delayNode) { const dg = ctx.createGain(); dg.gain.value = 0.3; g.connect(dg); dg.connect(delayNode); }
    g.connect(filterNode);
    try { o.start(t0); o.stop(t0 + durS + 0.05); } catch (_) {}
    o.onended = () => { try { o.disconnect(); g.disconnect(); } catch (_) {} };
    return o;
  },

  // Build the audio graph infrastructure for a stem (filter, delay, reverb) and start
  // the scheduling loop. Returns { nodes, lp, stop() }.
  _buildStemVoices(ctx, def, parentGain, key) {
    const nodes = [];

    // Shared filter for all notes in this stem
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = key === 'C' ? 2200 : key === 'D' ? 1400 : key === 'B' ? 1200 : 800;
    lp.Q.value = key === 'C' ? 1.5 : 0.7;
    lp.connect(parentGain);

    // Delay line for spacey echoes (all stems except combat which is dry and punchy)
    let delay = null, delayFb = null;
    if (key !== 'C') {
      delay = ctx.createDelay(1.0);
      delayFb = ctx.createGain();
      delay.delayTime.value = key === 'A' ? 0.375 : key === 'D' ? 0.5 : 0.25; // synced to tempo feel
      delayFb.gain.value = key === 'A' ? 0.35 : key === 'D' ? 0.4 : 0.25;
      delay.connect(delayFb);
      delayFb.connect(delay);
      delay.connect(lp); // delay output mixes into filter
    }

    // Sub-bass pad: a quiet, always-on triangle oscillator for warmth (not a drone — very low)
    const padOsc = ctx.createOscillator();
    const padGain = ctx.createGain();
    padOsc.type = 'sine';
    padOsc.frequency.value = key === 'C' ? 55 : key === 'D' ? 65.41 : key === 'B' ? 55 : 55; // A1 or C2
    padGain.gain.value = key === 'C' ? 0.06 : 0.04;
    padOsc.connect(padGain);
    padGain.connect(parentGain); // bypass filter for clean sub
    try { padOsc.start(ctx.currentTime); } catch (_) {}
    nodes.push(padOsc, padGain);

    // Slow filter sweep LFO for movement (calm/docked breathe, tense/combat pulse)
    const filterLfo = ctx.createOscillator();
    const filterLfoGain = ctx.createGain();
    filterLfo.frequency.value = key === 'C' ? 0.5 : key === 'B' ? 0.15 : 0.08;
    filterLfoGain.gain.value = key === 'C' ? 600 : key === 'D' ? 300 : key === 'B' ? 250 : 200;
    filterLfo.connect(filterLfoGain);
    filterLfoGain.connect(lp.frequency);
    try { filterLfo.start(ctx.currentTime); } catch (_) {}
    nodes.push(filterLfo, filterLfoGain);

    // ---- Sequencer state ----
    const seq = {
      running: true,
      timerId: 0,
      step: 0,
      barBeat: 0,
      // Scheduling uses setTimeout with a lookahead window for sample-accurate timing
      nextNoteTime: ctx.currentTime + 0.1,
    };

    // BPM and timing
    const BPM = key === 'C' ? 130 : key === 'B' ? 95 : key === 'D' ? 72 : 80;
    const beatS = 60 / BPM;
    const sixteenthS = beatS / 4;

    // ---- Note patterns per stem ----
    // Each pattern is an array of { note, oct, dur (in 16ths), vel (0-1), wave }
    // null entries are rests. Patterns loop.

    const self = this;

    function scheduleNotes() {
      if (!seq.running) return;
      // Schedule notes up to 100ms ahead for glitch-free timing
      while (seq.nextNoteTime < ctx.currentTime + 0.1) {
        const t = seq.nextNoteTime;
        const step = seq.step;

        if (key === 'A') self._seqCalm(ctx, t, step, sixteenthS, lp, delay);
        else if (key === 'B') self._seqTense(ctx, t, step, sixteenthS, lp, delay);
        else if (key === 'C') self._seqCombat(ctx, t, step, sixteenthS, lp, null);
        else if (key === 'D') self._seqDocked(ctx, t, step, sixteenthS, lp, delay);

        seq.step = (seq.step + 1) % 64; // 4 bars of 16 sixteenths
        seq.nextNoteTime += sixteenthS;
      }
      seq.timerId = setTimeout(scheduleNotes, 50); // re-check every 50ms
    }

    // Slight startup delay so all stems begin roughly together
    seq.nextNoteTime = ctx.currentTime + 0.2;
    scheduleNotes();

    const stemObj = {
      nodes, lp, delay, delayFb,
      stop() {
        seq.running = false;
        clearTimeout(seq.timerId);
        for (const n of nodes) { try { n.stop(); } catch (_) {} try { n.disconnect(); } catch (_) {} }
        if (delay) { try { delay.disconnect(); } catch (_) {} }
        if (delayFb) { try { delayFb.disconnect(); } catch (_) {} }
      },
    };
    return stemObj;
  },

  // ---- Calm (exploration): ambient arpeggios in A minor, gentle and spacious ----
  // Slow arpeggiated pattern over Am7/Cmaj9 changes, with a soft rhythmic pulse.
  // Think Vangelis/Blade Runner: wide pads, echoed arpeggios, breathing filter.
  _seqCalm(ctx, t, step, sixteenth, filterNode, delayNode) {
    const N = (n, o) => this._noteFreq(n, o);
    const play = (f, dur, vel, wave) => this._playNote(ctx, f, dur * sixteenth, vel, wave, filterNode, delayNode, t);

    // Chord progression: Am -> Em -> F -> G (repeats every 64 steps = 4 bars)
    const bar = Math.floor(step / 16);
    const chords = [
      [N('A',3), N('C',4), N('E',4), N('G',4)],   // Am7
      [N('E',3), N('G',3), N('B',3), N('D',4)],   // Em7
      [N('F',3), N('A',3), N('C',4), N('E',4)],   // Fmaj7
      [N('G',3), N('B',3), N('D',4), N('F',4)],   // G7
    ];
    const chord = chords[bar % 4];
    const beat = step % 16;

    // Arpeggio: plays one chord tone every 4 sixteenths (quarter notes), cycling up
    if (beat % 4 === 0) {
      const noteIdx = (beat / 4) % chord.length;
      play(chord[noteIdx], 3.5, 0.09, 'triangle');
    }

    // High sparkle: octave-up arpeggio on offbeats (every 4 sixteenths, offset by 2)
    if (beat % 8 === 2) {
      const noteIdx = ((beat + 2) / 4) % chord.length;
      play(chord[noteIdx] * 2, 2, 0.04, 'sine');
    }

    // Pad chord: sustained chord tones refreshed every bar (beat 0)
    if (beat === 0) {
      // Two chord tones as a soft pad
      play(chord[0], 15, 0.05, 'triangle');
      play(chord[2], 15, 0.04, 'triangle');
    }

    // Subtle rhythmic pulse: a low filtered tick on every 4th sixteenth
    if (beat % 4 === 0) {
      const kickFreq = N('A', 1);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(kickFreq * 2, t);
      o.frequency.exponentialRampToValueAtTime(kickFreq, t + 0.08);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.03, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g); g.connect(filterNode);
      try { o.start(t); o.stop(t + 0.15); } catch (_) {}
      o.onended = () => { try { o.disconnect(); g.disconnect(); } catch (_) {} };
    }
  },

  // ---- Tense: minor key urgency, faster arpeggio, bass pulse ----
  // Builds on calm's harmonic language but adds a driving bass, faster patterns,
  // and chromatic tension. Should feel like something is approaching.
  _seqTense(ctx, t, step, sixteenth, filterNode, delayNode) {
    const N = (n, o) => this._noteFreq(n, o);
    const play = (f, dur, vel, wave) => this._playNote(ctx, f, dur * sixteenth, vel, wave, filterNode, delayNode, t);

    // Darker progression: Am -> Dm -> Bb -> E (phrygian tension on the E)
    const bar = Math.floor(step / 16);
    const chords = [
      [N('A',3), N('C',4), N('E',4)],         // Am
      [N('D',3), N('F',3), N('A',3)],         // Dm
      [N('Bb',3), N('D',4), N('F',4)],        // Bb
      [N('E',3), N('G#',3), N('B',3)],        // E (major, for tension)
    ];
    const chord = chords[bar % 4];
    const beat = step % 16;

    // Fast arpeggio: every 2 sixteenths (eighth notes)
    if (beat % 2 === 0) {
      const noteIdx = (beat / 2) % chord.length;
      play(chord[noteIdx], 1.8, 0.10, 'triangle');
    }

    // Syncopated high note (adds urgency)
    if (beat === 3 || beat === 11) {
      play(chord[0] * 2, 1.5, 0.06, 'sine');
    }

    // Driving bass pulse: octave-down root on beats 0 and 8 (half notes)
    if (beat === 0 || beat === 8) {
      play(chord[0] * 0.5, 7, 0.08, 'triangle');
    }

    // Pulsing sub-bass (eighth notes, filtered)
    if (beat % 4 === 0) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = chord[0] * 0.25;
      const g = ctx.createGain();
      const bpf = ctx.createBiquadFilter();
      bpf.type = 'lowpass'; bpf.frequency.value = 200; bpf.Q.value = 2;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.06, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + sixteenth * 3);
      o.connect(bpf); bpf.connect(g); g.connect(filterNode);
      try { o.start(t); o.stop(t + sixteenth * 3 + 0.05); } catch (_) {}
      o.onended = () => { try { o.disconnect(); g.disconnect(); bpf.disconnect(); } catch (_) {} };
    }

    // Tension pad: dissonant cluster refreshed each bar
    if (beat === 0) {
      play(chord[1], 14, 0.04, 'sawtooth');
      play(chord[2], 14, 0.03, 'sawtooth');
    }
  },

  // ---- Combat: driving rhythm, aggressive synth, urgent ----
  // Rhythmic bass, staccato hits, sharp synth lead. No delay (dry and punchy).
  // Feels like a Tron/Mass Effect combat encounter.
  _seqCombat(ctx, t, step, sixteenth, filterNode) {
    const N = (n, o) => this._noteFreq(n, o);
    const play = (f, dur, vel, wave) => this._playNote(ctx, f, dur * sixteenth, vel, wave, filterNode, null, t);

    // Aggressive progression: Am -> F -> Dm -> E
    const bar = Math.floor(step / 16);
    const chords = [
      [N('A',2), N('C',3), N('E',3)],
      [N('F',2), N('A',2), N('C',3)],
      [N('D',2), N('F',2), N('A',2)],
      [N('E',2), N('G#',2), N('B',2)],
    ];
    const chord = chords[bar % 4];
    const beat = step % 16;

    // Driving bass: eighth-note pattern with accents
    if (beat % 2 === 0) {
      const vel = (beat % 4 === 0) ? 0.12 : 0.07;
      play(chord[0], 1.5, vel, 'sawtooth');
    }

    // Staccato synth stabs on the offbeat (sixteenth note feel)
    if (beat % 4 === 2) {
      play(chord[1] * 2, 0.8, 0.09, 'square');
    }

    // Synth lead: short aggressive phrases
    const leadPattern = [0,null,2,null, 1,null,0,null, 2,1,null,null, 0,null,2,1];
    const lp = leadPattern[beat];
    if (lp != null) {
      play(chord[lp % chord.length] * 2, 1.2, 0.07, 'sawtooth');
    }

    // Kick drum: four-on-the-floor
    if (beat % 4 === 0) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.08);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.13, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(g); g.connect(filterNode);
      try { o.start(t); o.stop(t + 0.2); } catch (_) {}
      o.onended = () => { try { o.disconnect(); g.disconnect(); } catch (_) {} };
    }

    // Hi-hat (noise burst) on every other sixteenth
    if (beat % 2 === 1) {
      const rt = this.rt;
      const buf = getNoiseBuffer(ctx, rt._caches);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hg = ctx.createGain();
      const hf = ctx.createBiquadFilter();
      hf.type = 'highpass'; hf.frequency.value = 8000;
      hg.gain.setValueAtTime(0.0001, t);
      hg.gain.linearRampToValueAtTime(0.04, t + 0.002);
      hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      src.connect(hf); hf.connect(hg); hg.connect(filterNode);
      try { src.start(t); src.stop(t + 0.06); } catch (_) {}
      src.onended = () => { try { src.disconnect(); hf.disconnect(); hg.disconnect(); } catch (_) {} };
    }

    // Snare hit on beats 4 and 12 (backbeat)
    if (beat === 4 || beat === 12) {
      const rt = this.rt;
      const buf = getNoiseBuffer(ctx, rt._caches);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const sg = ctx.createGain();
      const sf = ctx.createBiquadFilter();
      sf.type = 'bandpass'; sf.frequency.value = 3000; sf.Q.value = 0.5;
      sg.gain.setValueAtTime(0.0001, t);
      sg.gain.linearRampToValueAtTime(0.10, t + 0.002);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      src.connect(sf); sf.connect(sg); sg.connect(filterNode);
      try { src.start(t); src.stop(t + 0.15); } catch (_) {}
      src.onended = () => { try { src.disconnect(); sf.disconnect(); sg.disconnect(); } catch (_) {} };
      // Snare body (tonal component)
      const so = ctx.createOscillator();
      so.type = 'triangle'; so.frequency.value = 180;
      const sog = ctx.createGain();
      sog.gain.setValueAtTime(0.0001, t);
      sog.gain.linearRampToValueAtTime(0.06, t + 0.002);
      sog.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      so.connect(sog); sog.connect(filterNode);
      try { so.start(t); so.stop(t + 0.1); } catch (_) {}
      so.onended = () => { try { so.disconnect(); sog.disconnect(); } catch (_) {} };
    }
  },

  // ---- Docked: warm, safe, melodic ----
  // Muted pads, gentle melody fragments, reverbed bell tones. Feels like a
  // safe harbor after the void of space. Think Mass Effect Citadel or
  // No Man's Sky space station interiors.
  _seqDocked(ctx, t, step, sixteenth, filterNode, delayNode) {
    const N = (n, o) => this._noteFreq(n, o);
    const play = (f, dur, vel, wave) => this._playNote(ctx, f, dur * sixteenth, vel, wave, filterNode, delayNode, t);

    // Warm, major-leaning progression: C -> Am -> F -> G
    const bar = Math.floor(step / 16);
    const chords = [
      [N('C',4), N('E',4), N('G',4), N('B',4)],  // Cmaj7
      [N('A',3), N('C',4), N('E',4), N('G',4)],  // Am7
      [N('F',3), N('A',3), N('C',4), N('E',4)],  // Fmaj7
      [N('G',3), N('B',3), N('D',4), N('F',4)],  // G7
    ];
    const chord = chords[bar % 4];
    const beat = step % 16;

    // Bell-like melody: sparse, high, with long sustain through delay
    const melodyPattern = [0,null,null,null, 2,null,null,3, null,null,1,null, null,null,null,null];
    const mp = melodyPattern[beat];
    if (mp != null) {
      // Bell tone: sine oscillator with bright attack
      const freq = chord[mp] * 2; // octave up for bell clarity
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + sixteenth * 6);
      o.connect(g);
      g.connect(filterNode);
      // Send to delay for spacey reverb-like tail
      if (delayNode) {
        const dg = ctx.createGain();
        dg.gain.value = 0.4;
        g.connect(dg);
        dg.connect(delayNode);
      }
      try { o.start(t); o.stop(t + sixteenth * 6 + 0.1); } catch (_) {}
      o.onended = () => { try { o.disconnect(); g.disconnect(); } catch (_) {} };
    }

    // Warm pad: two chord tones, very soft, refreshed each bar
    if (beat === 0) {
      play(chord[0] * 0.5, 15, 0.05, 'triangle');
      play(chord[2] * 0.5, 15, 0.04, 'sine');
    }

    // Gentle rhythmic pulse: soft tick on every half note
    if (beat === 0 || beat === 8) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = chord[0] * 0.25;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.025, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g); g.connect(filterNode);
      try { o.start(t); o.stop(t + 0.25); } catch (_) {}
      o.onended = () => { try { o.disconnect(); g.disconnect(); } catch (_) {} };
    }
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
    if (rt._paused) return; // pause menu must be quiet — no beeps
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

    // recover music gain after a duck (skip while paused — _onPause manages the bus)
    if (!rt._paused && rt._duckUntil && now >= rt._duckUntil && rt.musicBus) {
      rt._duckUntil = 0;
      try {
        rt.musicBus.gain.cancelScheduledValues(now);
        rt.musicBus.gain.setValueAtTime(Math.max(0.0001, rt.musicBus.gain.value), now);
        rt.musicBus.gain.linearRampToValueAtTime(Math.max(0.0001, rt._musicBase || 0.5), now + 0.8);
      } catch (_) {}
    }

    // Skip the sim-driven work (threat/music recompute, alarms) while paused — the pause menu must
    // be quiet. Voice GC still runs so one-shots finish cleanly; context-resume still runs above.
    if (!rt._paused) {
      if (rt._musicDirty || nowWall >= (rt._nextMusicScan || 0)) {
        this._recomputeMusic(nowWall);
        rt._nextMusicScan = nowWall + MUSIC_RECOMPUTE_S;
        rt._musicDirty = false;
      }
      this._tickAlarms();
    }
    if (rt._loopPositionDirty || now >= (rt._nextLoopPositionUpdate || 0)) {
      this._updateLoopPositions(now);
      rt._nextLoopPositionUpdate = now + LOOP_POSITION_UPDATE_S;
      rt._loopPositionDirty = false;
    }
    this._gcVoices(now);
  },

  // Track positional loop voices (beam/mining) toward their target's current position.
  _updateLoopPositions(now) {
    const rt = this.rt;
    const pp = this._playerPos();
    const apply = (v) => {
      if (!v || v.trackId == null) return;
      const e = this.state.entities.get(v.trackId);
      if (!e) return;
      const d = Math.hypot(e.pos.x - pp.x, e.pos.z - pp.z);
      let att = clamp(1 - (d - D_NEAR) / (D_FAR - D_NEAR), 0, 1); att *= att;
      const pan = clamp((e.pos.x - pp.x) / PAN_SPAN, -1, 1);
      const t = now == null ? rt.ctx.currentTime : now;
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
