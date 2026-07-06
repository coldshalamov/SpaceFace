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
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';

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

export const MAX_AUDIO_VOICES = 12;

function linearGain(v) { const c = v < 0 ? 0 : v > 1 ? 1 : v; return c * c; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// Build a fast id->recipe lookup over the data array.
const recipeById = {};
for (const r of RECIPES) recipeById[r.id] = r;
export const AUDIO_RECIPE_BY_ID = Object.freeze(recipeById);

export function audioNearbyHostileCount(state, player, range = 1200, scratch = [], maxCount = Infinity) {
  if (!state || !player || !player.pos) return 0;
  const fallback = (state.entityIndex && state.entityIndex.__spacefaceEntityIndexV1 && state.entityIndex.ships) || state.entityList || [];
  const candidates = queryNearbyEntities(state, player.pos, range, scratch, fallback);
  const myTeam = player.team;
  const px = player.pos.x;
  const pz = player.pos.z;
  const r2 = range * range;
  let count = 0;
  for (const e of candidates) {
    if (!e || !e.alive || e.type !== 'ship' || e.id === player.id) continue;
    if (e.team === myTeam) continue;
    const dx = e.pos.x - px;
    const dz = e.pos.z - pz;
    if (dx * dx + dz * dz <= r2) {
      count++;
      if (count >= maxCount) break;
    }
  }
  return count;
}

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
export const AUDIO_CUE_TO_RECIPE = Object.freeze({
  click: 'sfx_ui_click', ui_click: 'sfx_ui_click', uiClick: 'sfx_ui_click',
  hover: 'sfx_ui_hover', ui_hover: 'sfx_ui_hover', uiHover: 'sfx_ui_hover',
  confirm: 'sfx_ui_confirm', ui_confirm: 'sfx_ui_confirm', buy: 'sfx_ui_confirm', sell: 'sfx_ui_confirm',
  deny: 'sfx_ui_error', error: 'sfx_ui_error', alert: 'sfx_ui_alert', warning: 'sfx_ui_alert',
  pickup: 'sfx_mining_impact', cash: 'sfx_ui_confirm',
  lock_acquired: 'sfx_lock_acquired', lock: 'sfx_lock_acquired',
  // UI navigation + feedback cues emitted with the ui_* prefix (hud.js, input.js, stationHub.js).
  // Without these they collapse to the generic sfx_ui_click; each now maps to its own SPEC2/07 recipe.
  ui_open: 'sfx_ui_open', ui_back: 'sfx_ui_back', ui_tab: 'sfx_ui_tab', ui_tick: 'sfx_ui_tab',
  ui_deny: 'sfx_ui_error', ui_alert: 'sfx_ui_alert', ui_dock: 'sfx_dock_clunk',
  // Gameplay cues with dedicated recipes (drill.js loot/hazard, countermeasures.js, combat shield break).
  loot_collect: 'sfx_loot_collect', mining_core_fizzle: 'sfx_mining_core_fizzle',
  shield_break: 'sfx.shieldBreak', cm_chaff: 'sfx_cm_chaff', cm_ecm: 'sfx_cm_ecm',
  'presentation.tether.attach': 'sfx.tetherLatch',
  'presentation.tether.near_break': 'sfx_ui_alert',
  'presentation.tether.break': 'sfx.tetherSnap',
  'presentation.tether.whip_impact': 'sfx.tetherSnap',
  'presentation.shield.collapse': 'sfx.shieldBreak',
  'presentation.subsystem.disabled': 'sfx_ui_alert',
  'presentation.scenario.signal': 'sfx_ui_alert',
  'presentation.comms.priority': 'sfx_ui_alert',
  'presentation.objective.split': 'sfx_ui_alert',
  'presentation.branch.resolved': 'sfx_ui_confirm',
});

export function resolveAudioCueRecipeId(cueId) {
  return AUDIO_CUE_TO_RECIPE[cueId] || (AUDIO_RECIPE_BY_ID[cueId] ? cueId : 'sfx_ui_click');
}

export function getBusForRecipe(recipe, recipeId) {
  const id = recipeId || (recipe ? recipe.id : '');
  if (id.startsWith('sfx_ui_') || id.startsWith('sfx.ui') || (recipe && recipe.category === 'ui')) {
    if (id.includes('comms') || id.includes('squelch')) {
      return 'comms';
    }
    return 'ui';
  }
  if (id.includes('comms') || id.includes('squelch')) {
    return 'comms';
  }
  if ((recipe && recipe.category === 'engine') || id.includes('engine') || id.includes('boost') || id.includes('dash') || id.includes('cruise') || id.includes('brake')) {
    return 'engine';
  }
  if ((recipe && recipe.category === 'mining') || id.includes('mining') || id.includes('ambient') || id.includes('station_hum') || id.includes('room_tone')) {
    return 'ambient';
  }
  if ((recipe && recipe.category === 'weapon') || (recipe && recipe.category === 'explosion') || id.includes('wpn') || id.includes('explosion') || id.includes('shield') || id.includes('armor') || id.includes('hull') || id.includes('kill') || id.includes('tether') || id.includes('detonate') || id.includes('hit')) {
    return 'combat';
  }
  return 'combat';
}

export function getPaletteClassName(sector) {
  if (!sector) return 'core';
  if (sector.palette) {
    if (sector.palette === SECTOR_PALETTE_CLASSES.belt) return 'belt';
    if (sector.palette === SECTOR_PALETTE_CLASSES.fringe) return 'fringe';
    if (sector.palette === SECTOR_PALETTE_CLASSES.anomaly) return 'anomaly';
  }
  const id = sector.id || '';
  if (id.includes('belt') || id.includes('forge') || id.includes('drift')) return 'belt';
  if (id.includes('fringe') || id.includes('reach') || id.includes('expanse')) return 'fringe';
  if (id.includes('anomaly') || id.includes('choir') || id.includes('vael')) return 'anomaly';
  return 'core';
}

export function audioRecipeBasePeak(recipe) {
  switch (recipe && recipe.category) {
    case 'explosion': return 0.85;
    case 'weapon': return 0.3;
    case 'mining': return 0.3;
    case 'ui': return 0.16;
    case 'engine': return 0.25;
    default: return 0.4;
  }
}

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
    rt.voices = [];               // active SFX voices (pooled, cap MAX_AUDIO_VOICES)
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
    rt._musicThreatScratch = [];
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
    // Mission accept/complete: previously TOTAL silence on the core progression loop. Accept gets a
    // bright rising stinger; complete gets a triumphant two-note chord + a brief music duck so the
    // payoff lands above the bed.
    bus.on('mission:accepted', () => { this.play('sfx_mission_accept', { gain: 0.7 }); });
    bus.on('mission:completed', () => { this._duckMusic(); this.play('sfx_mission_complete', { gain: 0.8 }); });
    // Mission failure/expiry: previously silent on the negative outcome (only accept/complete had
    // sound). A short low deny cue signals the setback without celebration.
    bus.on('mission:failed', () => this._onCue('deny'));
    bus.on('mission:expired', () => this._onCue('deny'));
    bus.on('dock:docked', (p) => this._onDocked(p));
    bus.on('dock:undocked', () => this._onUndocked());
    bus.on('jump:chargeStart', () => {
      this._duckMusic();
      this.play('sfx_jump_charge', { gain: 0.5, rate: 0.6 }); // early charge buildup
    });
    bus.on('jump:start', (p) => this._onJump(p));
    // Jump arrival: play the decompression whoosh when the player ACTUALLY materializes at the
    // destination (the jump:arrive event from world.js after the 1.2s tunnel). Previously arrival
    // was silent — _onJump used a fixed 400ms setTimeout that raced the real arrival time and never
    // fired on aborted jumps. Subscribing to the real event syncs the sound to the visual exactly.
    bus.on('jump:arrive', () => this.play('sfx_jump_arrive', { gain: 0.7 }));
    // Mining yield: each ore chunk gained was silent (only the per-tick beam impact had sound).
    // A soft impact ping makes the reward loop read — throttled so a burst of yields isn't noise.
    bus.on('mining:yield', (p) => this._onMiningYield(p));
    // Low-fuel alarm: fuel:empty fired with no sound (no warning before you're stranded). A short
    // alert cue surfaces the emergency. (The continuous low-health alarm is a separate poller.)
    bus.on('fuel:empty', () => this._onCue('alert'));
    // Tech research + ship purchase: the two biggest credit sinks were silent. A confirm chime
    // makes the payoff of a major purchase/upgrade land.
    bus.on('tech:researched', () => this.play('sfx_mission_complete', { gain: 0.6 }));
    bus.on('ship:purchased', () => this.play('sfx_mission_complete', { gain: 0.7 }));
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
    const engineBus = ctx.createGain();
    const ambientBus = ctx.createGain();
    const combatBus = ctx.createGain();
    const uiBus = ctx.createGain();
    const commsBus = ctx.createGain();
    engineBus.connect(sfxBus);
    ambientBus.connect(sfxBus);
    combatBus.connect(sfxBus);
    uiBus.connect(sfxBus);
    commsBus.connect(sfxBus);
    sfxBus.connect(master);
    musicBus.connect(master);
    master.connect(limiter);
    limiter.connect(ctx.destination);
    rt.masterGain = master; rt.limiter = limiter; rt.sfxBus = sfxBus; rt.musicBus = musicBus;
    rt.engineBus = engineBus; rt.ambientBus = ambientBus; rt.combatBus = combatBus;
    rt.uiBus = uiBus; rt.commsBus = commsBus;

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

    const masterVal = a.master == null ? 0.55 : a.master;
    const masterTarget = muted ? 0.0001 : linearGain(masterVal) * 0.501187;
    ramp(rt.masterGain.gain, masterTarget);

    const sfxVal = a.sfx == null ? 0.7 : a.sfx;

    const engineVal = a.engine == null ? 0.7 : a.engine;
    const engineTarget = linearGain(sfxVal) * linearGain(engineVal) * 0.12589;
    ramp(rt.engineBus.gain, engineTarget);

    const sidechain = rt.sidechainDuck || 1.0;
    const ambientVal = a.ambient == null ? 0.7 : a.ambient;
    const ambientTarget = linearGain(sfxVal) * linearGain(ambientVal) * 0.06309 * sidechain;
    ramp(rt.ambientBus.gain, ambientTarget);

    const combatVal = a.combat == null ? 0.7 : a.combat;
    const combatTarget = linearGain(sfxVal) * linearGain(combatVal) * 0.25119;
    ramp(rt.combatBus.gain, combatTarget);

    const uiVal = a.ui == null ? 0.7 : a.ui;
    const uiTarget = linearGain(sfxVal) * linearGain(uiVal) * 0.1;
    ramp(rt.uiBus.gain, uiTarget);

    const commsVal = a.comms == null ? 0.7 : a.comms;
    const commsTarget = linearGain(sfxVal) * linearGain(commsVal) * 0.15849;
    ramp(rt.commsBus.gain, commsTarget);

    const musicVal = a.music == null ? 0.32 : a.music;
    rt._musicBase = linearGain(musicVal) * 0.05012 * sidechain;
    ramp(rt.musicBus.gain, rt._musicBase);
  },

  // ---- one-shot SFX API ----
  play(recipeId, opts) {
    const rt = this.rt;
    const ctx = rt.ctx;
    if (!ctx || ctx.state !== 'running') return null; // graceful skip when suspended
    const recipe = AUDIO_RECIPE_BY_ID[recipeId];
    if (!recipe) return null;
    opts = opts || {};

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

    const busName = getBusForRecipe(recipe, recipeId);
    let targetBus = rt.sfxBus;
    if (busName === 'engine') targetBus = rt.engineBus;
    else if (busName === 'ambient') targetBus = rt.ambientBus;
    else if (busName === 'combat') targetBus = rt.combatBus;
    else if (busName === 'ui') targetBus = rt.uiBus;
    else if (busName === 'comms') targetBus = rt.commsBus;

    let dest = targetBus;
    let panner = null;
    if (pan !== 0 && ctx.createStereoPanner) {
      panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      panner.connect(targetBus);
      dest = panner;
    }

    this._evictIfFull();
    const voice = playRecipe(ctx, recipe, dest, {
      peakGain: peak, detune: opts.detune || 0, rate, id: rt._nextVoiceId++, trackId: opts.trackId || null,
      startTime: opts.startTime,
    }, rt._caches);
    voice.busName = busName;
    voice._panner = panner;
    rt.voices.push(voice);
    return voice;
  },

  _ampFor(recipe) {
    return audioRecipeBasePeak(recipe);
  },

  _evictIfFull() {
    const rt = this.rt;
    if (rt.voices.length < MAX_AUDIO_VOICES) return;
    const now = rt.ctx ? rt.ctx.currentTime : 0;
    let worstIdx = -1;
    let maxPriority = -Infinity;
    for (let i = 0; i < rt.voices.length; i++) {
      const v = rt.voices[i];
      if (v.loop) continue;
      const age = now - v.startedAt;
      const quietness = 1.0 - Math.min(1.0, Math.max(0.0, v.callGain || 1.0));
      const priority = age * (quietness + 0.1); 
      if (priority > maxPriority) {
        maxPriority = priority;
        worstIdx = i;
      }
    }
    if (worstIdx >= 0) {
      const v = rt.voices[worstIdx];
      try { releaseVoice(rt.ctx, v); } catch (_) {}
      disposeVoice(v);
      if (v._panner) { try { v._panner.disconnect(); } catch (_) {} }
      rt.voices.splice(worstIdx, 1);
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
    const rt = this.rt, ctx = rt.ctx;
    if (p.isPlayer) { rt._lastDamageT = this.state.simTime; this._markMusicDirty(); }

    const onShield = !!p.shieldAbsorbed;
    if (onShield) {
      const now = ctx ? ctx.currentTime : 0;
      if (now - (rt._lastShieldHitTime || 0) < 2.0) {
        rt._shieldHitStack = Math.min(4, (rt._shieldHitStack || 0) + 1);
      } else {
        rt._shieldHitStack = 0;
      }
      rt._lastShieldHitTime = now;
      const pitchOffset = rt._shieldHitStack;
      const rate = Math.pow(2, pitchOffset / 12.0);
      this.play('sfx.shieldHit', { position: p.pos || p.hitPoint, gain: 0.7, rate });
    } else {
      if (p.kind === 'armor') {
        this.play('sfx.armorHit', { position: p.pos || p.hitPoint, gain: 0.8 });
      } else {
        this.play('sfx.hullHit', { position: p.pos || p.hitPoint, gain: 0.9 });
      }
    }

    if (p.isPlayer) {
      this.play('sfx.playerDamage', { gain: 0.8 });
    }
  },

  _onCollision(p) {
    if (!p) return;
    this.play('sfx_explosion_small', { position: p.pos, gain: clamp((p.impulse || 1) * 0.3, 0.15, 0.7), rate: 0.8 });
  },

  _onKilled(p) {
    if (!p) return;
    const rt = this.rt, ctx = rt.ctx;
    const isCapital = p.victimClass === 'capital' || p.victimClass === 'large' || p.type === 'station';
    
    if (isCapital && ctx) {
      this._duckMusic();
      const radius = p.victimRadius || p.radius || 120;
      const pos1 = {
        x: p.pos.x + (Math.random() - 0.5) * radius * 0.7,
        z: p.pos.z + (Math.random() - 0.5) * radius * 0.7
      };
      const pos2 = {
        x: p.pos.x + (Math.random() - 0.5) * radius * 0.7,
        z: p.pos.z + (Math.random() - 0.5) * radius * 0.7
      };
      // Play two 30ms pre-detonation clicks
      this.play('sfx_ui_hover', { position: pos1, startTime: ctx.currentTime + 0.05, gain: 0.9, rate: 0.5 });
      this.play('sfx_ui_hover', { position: pos2, startTime: ctx.currentTime + 0.20, gain: 0.9, rate: 0.5 });
      // Play the main capital explosion in 400ms
      this.play('sfx.killCapital', { position: p.pos, startTime: ctx.currentTime + 0.40, gain: 1.0 });
    } else {
      this.play('sfx.killSmall', { position: p.pos, gain: 1.0 });
    }
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
    const recipe = AUDIO_RECIPE_BY_ID[recipeId];
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
    // Warp charge sound (rising energy) + duck music. The arrival decompression whoosh is now
    // triggered by the jump:arrive event (synced to the actual materialization after the 1.2s
    // tunnel), not a fixed timer — see the jump:arrive subscriber in init().
    this._duckMusic(1.8);
    this.play('sfx_jump_charge', { gain: 0.8 });
  },

  // Mining yield: a burst of ore chunks (e.g. a big asteroid breaking up) would spam the impact
  // sound. Throttle to at most one yield ping per ~120ms so a rich strike reads as a pleasant
  // trickle, not machine-gun noise. Position follows the player's mining target when available.
  _onMiningYield(p) {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (now - (this._lastMiningYieldAt || 0) < 120) return;
    this._lastMiningYieldAt = now;
    const pos = p && p.pos;
    this.play('sfx_mining_impact', { position: pos, gain: 0.5, rate: 1.1 });
  },

  _onCue(cue) {
    const id = typeof cue === 'string' ? cue : cue && cue.id;
    if (!id) { this.play('sfx_ui_click', { gain: 0.7 }); return; }
    const rid = resolveAudioCueRecipeId(id);
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
      nearbyHostiles = audioNearbyHostileCount(state, player, 1200, rt._musicThreatScratch, 3);
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

    const dt = rt._lastWallTime !== undefined ? (nowWall - rt._lastWallTime) : 0.016;
    rt._lastWallTime = nowWall;

    // (re)start any desired loop voices that were requested while suspended
    if (ctx.state === 'running') {
      for (const ownerId in rt._wantBeam) {
        if (!rt.loops['beam_' + ownerId]) this._startBeam(Number(ownerId));
      }
      if (rt._wantMining && !rt.loops.mining) this._onMiningStart({ minerId: rt._wantMining.minerId, targetId: rt._wantMining.targetId });
    }

    // Sidechaining logic (spec §1): combat ducks ambient & music buses by 6 dB (120ms attack / 900ms release)
    let hasCombat = false;
    for (const v of rt.voices) {
      if (v.busName === 'combat' && !v._stopped) {
        hasCombat = true;
        break;
      }
    }
    const targetDuck = hasCombat ? 0.501187 : 1.0;
    const tc = targetDuck < rt.sidechainDuck ? 0.12 : 0.90;
    const factor = Math.exp(-dt / tc);
    rt.sidechainDuck = targetDuck + (rt.sidechainDuck - targetDuck) * factor;

    // Apply setting gains with current sidechain factor
    this._applySettings();

    // Update continuous procedural sources
    this._updateEngineHum();
    this._updateBrakeHiss(dt);
    this._updateTetherHum();
    this._updatePads(now);
    this._updateStationMurmur(now);

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

  _onVentBonus(p) {
    this.play('sfx_vent_chime', { gain: 0.7, rate: 1.0 });
    setTimeout(() => {
      this.play('sfx_vent_chime', { gain: 0.65, rate: 1.25 });
    }, 90);
  },

  _onSeamHit(p) {
    const now = this.rt.ctx ? this.rt.ctx.currentTime : 0;
    if (now - (this.rt._lastSeamHitAt || 0) < 0.5) return;
    this.rt._lastSeamHitAt = now;
    this.play('sfx_mining_impact', { position: p && p.pos, gain: 0.6, rate: 1.8 });
  },

  _onCommsPopup(p) {
    if (!p) return;
    const category = p.category || 'ambient';
    const rt = this.rt, ctx = rt.ctx;
    if (!ctx) return;

    const now = ctx.currentTime;
    const startTime = Math.max(now, rt._lastSquelchEndTime || 0);
    rt._lastSquelchEndTime = startTime + 0.12;

    this._playSquelch(category, startTime);
  },

  _playSquelch(category, startTime) {
    const rt = this.rt, ctx = rt.ctx;
    if (!ctx) return;

    let recipeId = 'sfx_squelch_ambient';
    if (category === 'story' || category === 'priority') {
      recipeId = 'sfx_squelch_story';
    } else if (category === 'danger' || category === 'warning' || category === 'alert') {
      recipeId = 'sfx_squelch_danger';
    }

    this.play(recipeId, { gain: 0.8, startTime });
  },

  _ensureEngineHum() {
    const rt = this.rt, ctx = rt.ctx;
    if (!ctx || rt.engineOsc1) return;

    const humGain = ctx.createGain();
    humGain.gain.value = 0.8;

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 55;

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 55;
    osc2.detune.value = 6;

    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx, rt._caches);
    noise.loop = true;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 300;
    noiseFilter.Q.value = 1.0;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.0001;

    osc1.connect(humGain);
    osc2.connect(humGain);
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(humGain);

    humGain.connect(rt.engineBus);

    try {
      osc1.start(ctx.currentTime);
      osc2.start(ctx.currentTime);
      noise.start(ctx.currentTime);
    } catch (_) {}

    rt.engineHumGain = humGain;
    rt.engineOsc1 = osc1;
    rt.engineOsc2 = osc2;
    rt.engineNoise = noise;
    rt.engineNoiseGain = noiseGain;
  },

  _updateEngineHum() {
    const rt = this.rt, ctx = rt.ctx;
    if (!ctx || !rt.engineOsc1 || rt._paused) return;

    const player = this.state.entities.get(this.state.playerId);
    const boosting = !!(player && player.flags && player.flags.boosting);
    const cruise = this.state.player && this.state.player.cruise;
    const cruising = cruise && cruise.phase === 'cruising';
    
    const thrusting = !!(this.state.input && (
      Math.abs(Number(this.state.input.moveZ) || 0) > 0.02 ||
      Math.abs(Number(this.state.input.moveX) || 0) > 0.02
    ));

    let f1 = 55, f2 = 55, d2 = 6, noiseG = 0.0001;
    if (cruising) {
      f1 = 65;
      f2 = 65 * 1.5;
      d2 = 0;
    } else if (boosting) {
      f1 = 110;
      f2 = 110;
      noiseG = 0.06;
    } else if (thrusting) {
      f1 = 78;
      f2 = 78;
    }

    rt.engineOsc1.frequency.setTargetAtTime(f1, ctx.currentTime, 0.1);
    rt.engineOsc2.frequency.setTargetAtTime(f2, ctx.currentTime, 0.1);
    rt.engineOsc2.detune.setTargetAtTime(d2, ctx.currentTime, 0.1);
    rt.engineNoiseGain.gain.setTargetAtTime(noiseG, ctx.currentTime, 0.15);
  },

  _ensureBrakeHiss() {
    const rt = this.rt, ctx = rt.ctx;
    if (!ctx || rt.brakeGain) return;

    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx, rt._caches);
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1600;
    filter.Q.value = 0.8;

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(rt.engineBus);

    try { noise.start(ctx.currentTime); } catch (_) {}

    rt.brakeGain = gain;
    rt.brakeNoise = noise;
  },

  _updateBrakeHiss(dt) {
    const rt = this.rt, ctx = rt.ctx;
    if (!ctx || !rt.brakeGain || rt._paused) return;

    const player = this.state.entities.get(this.state.playerId);
    const speed = player ? Math.hypot(player.vel.x, player.vel.z) : 0;
    const braking = !!(this.state.input && this.state.input.actions.brake);

    let decel = 0;
    if (rt._prevSpeed !== undefined) {
      decel = Math.max(0, rt._prevSpeed - speed) / Math.max(0.001, dt);
    }
    rt._prevSpeed = speed;

    let targetGain = 0.0001;
    if (braking && speed > 20) {
      targetGain = Math.min(0.25, decel * 0.04);
    }

    rt.brakeGain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.05);
  },

  _ensureTetherHum() {
    const rt = this.rt, ctx = rt.ctx;
    if (!ctx || rt.tetherOsc) return;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 90;

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.gainValue = 0.0001;

    osc.connect(gain);
    gain.connect(rt.ambientBus);

    try { osc.start(ctx.currentTime); } catch (_) {}

    rt.tetherOsc = osc;
    rt.tetherHum = gain;
  },

  _updateTetherHum() {
    const rt = this.rt, ctx = rt.ctx;
    if (!ctx || !rt.tetherOsc || rt._paused) return;

    const tether = this.state.player && this.state.player.tether;
    const active = !!(tether && tether.active);
    const strain = active ? (tether.strain || 0) : 0;

    let targetFreq = 90;
    let targetGain = 0.0001;

    if (active) {
      targetFreq = 90 + strain * 220;
      targetGain = strain * 0.15;
    }

    rt.tetherOsc.frequency.setTargetAtTime(targetFreq, ctx.currentTime, 0.05);
    rt.tetherHum.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.05);
    rt.tetherHum.gainValue = targetGain;
  },

  _startPad(className, startTime) {
    const rt = this.rt, ctx = rt.ctx;
    if (!ctx) return null;
    if (rt.pads[className]) return rt.pads[className];

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.connect(rt.musicBus);

    const nodes = [];
    const LFO_FREQ = 0.05;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = LFO_FREQ;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.15;
    lfo.connect(lfoGain);
    try { lfo.start(startTime); } catch (_) {}
    nodes.push(lfo, lfoGain);

    if (className === 'core') {
      const freqs = [110, 164.81, 220, 329.63];
      for (let i = 0; i < 4; i++) {
        const osc = ctx.createOscillator();
        osc.type = i < 2 ? 'sine' : 'triangle';
        osc.frequency.value = freqs[i];
        
        const g = ctx.createGain();
        g.gain.value = i < 2 ? 0.15 : 0.08;
        lfoGain.connect(g.gain);

        osc.connect(g);
        g.connect(gainNode);
        try { osc.start(startTime); } catch (_) {}
        nodes.push(osc, g);
      }
    } else if (className === 'belt') {
      const freqs = [87.3, 87.3, 130.81, 174.61];
      const detunes = [-15, 15, -10, 10];
      for (let i = 0; i < 4; i++) {
        const osc = ctx.createOscillator();
        osc.type = i < 2 ? 'sawtooth' : 'triangle';
        osc.frequency.value = freqs[i];
        osc.detune.value = detunes[i];

        const g = ctx.createGain();
        g.gain.value = 0.08;
        lfoGain.connect(g.gain);

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 180;

        osc.connect(lp);
        lp.connect(g);
        g.connect(gainNode);
        try { osc.start(startTime); } catch (_) {}
        nodes.push(osc, g, lp);
      }

      const noise = ctx.createBufferSource();
      noise.buffer = getNoiseBuffer(ctx, rt._caches);
      noise.loop = true;

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 120;
      lp.Q.value = 1.0;

      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.12;

      noise.connect(lp);
      lp.connect(noiseGain);
      noiseGain.connect(gainNode);
      try { noise.start(startTime); } catch (_) {}
      nodes.push(noise, lp, noiseGain);

    } else if (className === 'fringe') {
      const freqs = [123.47, 130.81, 185.0, 196.00];
      for (let i = 0; i < 4; i++) {
        const osc = ctx.createOscillator();
        osc.type = i < 2 ? 'sine' : 'triangle';
        osc.frequency.value = freqs[i];

        const g = ctx.createGain();
        g.gain.value = 0.08;
        lfoGain.connect(g.gain);

        osc.connect(g);
        g.connect(gainNode);
        try { osc.start(startTime); } catch (_) {}
        nodes.push(osc, g);
      }
    } else if (className === 'anomaly') {
      const freqs = [87.3, 87.3 * 2.76, 87.3 * 2.76 * 1.5, 87.3 * 5.52];
      for (let i = 0; i < 4; i++) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freqs[i];

        const g = ctx.createGain();
        g.gain.value = 0.1;
        lfoGain.connect(g.gain);

        osc.connect(g);
        g.connect(gainNode);
        try { osc.start(startTime); } catch (_) {}
        nodes.push(osc, g);
      }
    }

    const pad = {
      className,
      gainNode,
      nodes,
      startedAt: startTime,
      volume: 0.0,
      targetVolume: 0.0,
      stopped: false,
    };
    
    rt.pads[className] = pad;
    return pad;
  },

  _stopPadObj(pad) {
    if (pad.stopped) return;
    pad.stopped = true;
    for (const n of pad.nodes) {
      try { n.stop(); } catch (_) {}
      try { n.disconnect(); } catch (_) {}
    }
    try { pad.gainNode.disconnect(); } catch (_) {}
    delete this.rt.pads[pad.className];
  },

  _updatePads(now) {
    const rt = this.rt, ctx = rt.ctx;
    if (!ctx) return;

    if (!rt.pads) rt.pads = {};

    const currentSectorId = this.state.world && this.state.world.currentSectorId;
    const sector = this.state.world && this.state.world.sectors && this.state.world.sectors[currentSectorId];
    const targetClass = getPaletteClassName(sector);
    
    const docked = !!(rt._docked || (this.state.ui && this.state.ui.docked));

    if (targetClass !== rt.activePadClass) {
      const prevClass = rt.activePadClass;
      rt.activePadClass = targetClass;
      
      const newPad = this._startPad(targetClass, ctx.currentTime);
      if (newPad) {
        newPad.targetVolume = 1.0;
        newPad.gainNode.gain.cancelScheduledValues(ctx.currentTime);
        newPad.gainNode.gain.setValueAtTime(Math.max(0.0001, newPad.gainNode.gain.value), ctx.currentTime);
        newPad.gainNode.gain.linearRampToValueAtTime(1.0, ctx.currentTime + 4.0);
      }

      if (prevClass) {
        const oldPad = rt.pads[prevClass];
        if (oldPad) {
          oldPad.targetVolume = 0.0;
          oldPad.gainNode.gain.cancelScheduledValues(ctx.currentTime);
          oldPad.gainNode.gain.setValueAtTime(Math.max(0.0001, oldPad.gainNode.gain.value), ctx.currentTime);
          oldPad.gainNode.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 4.0);
          
          setTimeout(() => {
            this._stopPadObj(oldPad);
          }, 4200);
        }
      }
    }

    const activePad = rt.pads[targetClass];
    if (activePad) {
      if (docked && activePad.gainNode.gain.value > 0.01) {
        activePad.gainNode.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.5);
      } else if (!docked && activePad.gainNode.gain.value < 0.99 && activePad.targetVolume === 1.0) {
        activePad.gainNode.gain.setTargetAtTime(1.0, ctx.currentTime, 0.5);
      }
    }

    const activePadObj = rt.pads[targetClass];
    if (activePadObj && !docked && !rt._paused) {
      if (targetClass === 'core') {
        if (ctx.currentTime - (rt._lastBellTime || 0) >= 45) {
          rt._lastBellTime = ctx.currentTime;
          this.play('sfx_core_bell', { gain: 0.25 });
        }
      } else if (targetClass === 'fringe') {
        const nextTickDelay = rt._nextRadioTickTime || 0;
        if (ctx.currentTime >= nextTickDelay) {
          rt._nextRadioTickTime = ctx.currentTime + 2.0 + Math.random() * 4.0;
          this.play('sfx_fringe_tick', { gain: 0.15 });
        }
      } else if (targetClass === 'anomaly') {
        if (ctx.currentTime - (rt._lastAnomalySwellTime || 0) >= 8 + Math.random() * 7) {
          rt._lastAnomalySwellTime = ctx.currentTime;
          this.play('sfx_anomaly_swell', { gain: 0.2 });
        }
      }
    }
  },

  _updateStationMurmur(now) {
    const rt = this.rt, ctx = rt.ctx;
    if (!ctx || !rt._docked || rt._paused) return;

    if (now - (rt._lastMurmurTime || 0) >= 8 + Math.random() * 10) {
      rt._lastMurmurTime = now;
      this._playPAMurmur();
    }
  },

  _playPAMurmur() {
    const rt = this.rt, ctx = rt.ctx;
    if (!ctx) return;

    const syllables = 4 + Math.floor(Math.random() * 5);
    let time = ctx.currentTime;

    for (let i = 0; i < syllables; i++) {
      const freq = 350 + Math.random() * 250;
      const dur = 0.08 + Math.random() * 0.12;
      
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 600;
      filter.Q.value = 2.0;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(0.015, time + 0.01);
      g.gain.setValueAtTime(0.015, time + dur - 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

      o.connect(filter);
      filter.connect(g);
      g.connect(rt.ambientBus);

      try {
        o.start(time);
        o.stop(time + dur + 0.02);
      } catch (_) {}

      o.onended = () => {
        try {
          o.disconnect();
          filter.disconnect();
          g.disconnect();
        } catch (_) {}
      };

      time += dur + 0.03;
    }
  },
};
