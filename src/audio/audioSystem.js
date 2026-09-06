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
import { successfulPickupAmount } from '../core/pickupAcceptance.js';
import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
import { DRIVE_FAMILIES, resolvePropulsionProfile } from '../core/flight/propulsionCatalog.js';
import { CombatDoctrineId } from '../ai/combatDoctrine.js';
import { massline2Flag } from '../data/featureFlags.js';
import { createBandBedRuntime } from './bandBeds.js';
import {
  createCuePriorityBus,
  isPriorityCue,
  PRIORITY_DUCK_THRESHOLD,
} from './cuePriorityBus.js';
import { TABLE_HEARING_FAR_WU, TABLE_HEARING_PAN_WU } from '../render/tabletopPolicy.js';
import { entityNeedsExactAudio } from './audioActiveSet.js';
import { heatLevelFor } from '../systems/heat.js';

// --- positional model (ARCHITECTURE / spec) ---
const D_NEAR = 40;     // wu — full volume within this
const D_FAR = TABLE_HEARING_FAR_WU;     // wu — silent / culled beyond the table
const PAN_SPAN = TABLE_HEARING_PAN_WU;  // wu — half-pan distance

// --- music ---
const XFADE_S = 2.5;
const XFADE_COMBAT_S = 1.0;
const STATE_HOLD_S = 1.5;       // hysteresis
const IN_COMBAT_WINDOW = 6;     // s since last damage counts as "in combat"
const MUSIC_RECOMPUTE_S = 0.1;  // analysis cadence; state changes still have 1.5s hysteresis
const LOOP_POSITION_UPDATE_S = 0.05; // AudioParam smoothing already runs over this window
export const BULLET_TIME_AUDIO = Object.freeze({
  cutoffHz: 1100,
  openHz: 20000,
  enterS: 0.12,
  exitS: 0.15,
  loopRate: 0.85,
  musicMult: 0.630957, // -4 dB
});
// target stem weights per music state (A=calm sequence, B=tense pad, C=combat, D=docked warm)
const STEM_WEIGHTS = {
  calm:   { A: 1.0, B: 0.0, C: 0.0, D: 0.0 },
  tense:  { A: 0.7, B: 0.8, C: 0.0, D: 0.0 },
  combat: { A: 0.4, B: 0.5, C: 1.0, D: 0.0 },
  docked: { A: 0.2, B: 0.2, C: 0.0, D: 0.9 },
};

export const MAX_AUDIO_VOICES = 12;
const SILENT_LISTENER_POS = Object.freeze({ x: 0, z: 0 });

// Propulsion is a gameplay contract, but its *voice* is presentation-only. Each family keeps the
// spec's tier fundamentals (55/78/110/65 Hz) while changing harmonic weight, air and sub response.
// That makes a gravimetric interceptor, a pulse-plate barge and a torch capital identifiable even
// before their silhouette is read. The values stay inside the existing engine-bus budget.
export const ENGINE_FAMILY_AUDIO = Object.freeze({
  [DRIVE_FAMILIES.REACTION]: Object.freeze({
    family: DRIVE_FAMILIES.REACTION, osc1: 'sawtooth', osc2: 'sine', harmonic: 1,
    detune: 6, noiseMult: 1, noiseHzMult: 1, subMult: 1, humMult: 1,
  }),
  [DRIVE_FAMILIES.GRAVIMETRIC]: Object.freeze({
    family: DRIVE_FAMILIES.GRAVIMETRIC, osc1: 'triangle', osc2: 'sine', harmonic: 2,
    detune: -7, noiseMult: 0.18, noiseHzMult: 1.9, subMult: 0.55, humMult: 0.82,
  }),
  [DRIVE_FAMILIES.PULSE_PLATE]: Object.freeze({
    family: DRIVE_FAMILIES.PULSE_PLATE, osc1: 'square', osc2: 'triangle', harmonic: 0.5,
    detune: 3, noiseMult: 0.65, noiseHzMult: 0.72, subMult: 1.65, humMult: 0.74,
  }),
  [DRIVE_FAMILIES.TORCH]: Object.freeze({
    family: DRIVE_FAMILIES.TORCH, osc1: 'sawtooth', osc2: 'sawtooth', harmonic: 0.5,
    detune: 11, noiseMult: 1.8, noiseHzMult: 0.78, subMult: 1.9, humMult: 0.88,
  }),
  [DRIVE_FAMILIES.SAIL]: Object.freeze({
    family: DRIVE_FAMILIES.SAIL, osc1: 'triangle', osc2: 'sine', harmonic: 1.5,
    detune: 0, noiseMult: 0.1, noiseHzMult: 2.2, subMult: 0.35, humMult: 0.62,
  }),
});

export const DOCTRINE_AUDIO_SIGNATURES = Object.freeze({
  [CombatDoctrineId.INTERCEPTOR_FLYBY]: Object.freeze({
    recipeId: 'sfx_doctrine_flyby', fireRate: 1.16, fireGain: 0.78, fireDetune: 7,
  }),
  [CombatDoctrineId.BRAWLER_COMMIT]: Object.freeze({
    // Heavy hull pressure recipe (not a retuned flyby pass).
    recipeId: 'sfx_doctrine_brawler_commit', fireRate: 0.78, fireGain: 1.0, fireDetune: -18,
  }),
  [CombatDoctrineId.TETHER_CONTROL_RAIDER]: Object.freeze({
    recipeId: 'sfx_doctrine_tether_spool', fireRate: 0.86, fireGain: 0.92, fireDetune: -9,
  }),
  [CombatDoctrineId.RANGED_DISENGAGER]: Object.freeze({
    recipeId: 'sfx_doctrine_ranged_charge', fireRate: 0.94, fireGain: 0.84, fireDetune: -2,
  }),
  [CombatDoctrineId.FIELD_ANCHOR_CONTROLLER]: Object.freeze({
    // Hold-the-ring language: lower charge than ranged, distinct from brawler growl.
    recipeId: 'sfx_doctrine_ranged_charge', fireRate: 0.7, fireGain: 0.88, fireDetune: -22,
  }),
  [CombatDoctrineId.CAPITAL_BROADSIDE]: Object.freeze({
    recipeId: 'sfx_doctrine_capital_broadside', fireRate: 0.62, fireGain: 1.08, fireDetune: -30,
  }),
  [CombatDoctrineId.ESCORT_SCREEN]: Object.freeze({
    // Even, unhurried defensive fire — a guard's cadence, not a hunter's.
    recipeId: 'sfx_doctrine_escort_screen', fireRate: 0.88, fireGain: 0.86, fireDetune: -4,
  }),
});

// The first-hour ear-training contract. These five foreground receipts deliberately occupy
// different registers and priority levels. Continuous low-frequency ambience is intentionally not
// part of the contract: the procedural stack stays quiet until a player action earns a cue.
// The policy lives beside the live router so it cannot drift into an unwired design-only table.
export const FIRST_HOUR_AUDIO_SIGNATURES = Object.freeze({
  masslineLatch: Object.freeze({
    sourceEvent: 'tether:attached', semanticId: 'presentation.tether.attach',
    recipeId: 'sfx.tetherLatch', priority: 0.78, cooldownS: 0.08, register: 'mechanical-mid',
  }),
  masslineStrain: Object.freeze({
    sourceEvent: 'tether:nearBreak', semanticId: 'presentation.tether.near_break',
    recipeId: 'sfx_tether_strain_creak', priority: 0.88, cooldownS: 0.65,
    register: 'strained-mid', warning: true,
  }),
  masslineBreak: Object.freeze({
    sourceEvent: 'tether:broken', semanticId: 'presentation.tether.break',
    recipeId: 'sfx.tetherSnap', priority: 0.95, cooldownS: 0.12,
    register: 'mechanical-wide', warning: true,
  }),
  shieldBreak: Object.freeze({
    sourceEvent: 'shieldDown', semanticId: 'presentation.shield.collapse',
    recipeId: 'sfx.shieldBreak', priority: 0.94, cooldownS: 0,
    register: 'crystalline-high', warning: true,
  }),
  enemyKill: Object.freeze({
    sourceEvent: 'entity:killed[killerId=playerId]', semanticId: 'presentation.combat.player_kill',
    recipeId: 'sfx.killConfirmed', priority: 0.82, cooldownS: 0,
    register: 'sub-plus-rising-confirm',
  }),
});

const FIRST_HOUR_SIGNATURE_BY_SEMANTIC_ID = Object.freeze(Object.fromEntries(
  Object.values(FIRST_HOUR_AUDIO_SIGNATURES)
    .filter((signature) => signature.semanticId)
    .map((signature) => [signature.semanticId, signature]),
));
const FIRST_HOUR_SIGNATURE_BY_PRESENTATION_CUE_ID = Object.freeze({
  'tether.attach': FIRST_HOUR_AUDIO_SIGNATURES.masslineLatch,
  'tether.near_break': FIRST_HOUR_AUDIO_SIGNATURES.masslineStrain,
  'tether.break': FIRST_HOUR_AUDIO_SIGNATURES.masslineBreak,
  'shield.collapse': FIRST_HOUR_AUDIO_SIGNATURES.shieldBreak,
  'combat.player.kill': FIRST_HOUR_AUDIO_SIGNATURES.enemyKill,
});

export function resolveFirstHourAudioSignature(cueId) {
  return FIRST_HOUR_SIGNATURE_BY_SEMANTIC_ID[String(cueId || '')] || null;
}

function linearGain(v) { const c = v < 0 ? 0 : v > 1 ? 1 : v; return c * c; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function isPhysicalAudioBus(name) { return name === 'engine' || name === 'ambient' || name === 'combat'; }

/**
 * `_applySettings` owns master/engine/ambient/combat/ui/comms/music bus gain and used to rewrite
 * all seven every rendered frame. `rt._busGainCache` records the last tuple actually written per
 * bus so an unchanged frame can skip the write; see `_applySettings` for why that is signal-exact.
 *
 * `musicBus.gain` is the one settings-owned param with foreign writers (pause, bullet time, music
 * duck + duck recovery). Each of them drops the cache entry here so the next `_applySettings`
 * re-asserts the settings target exactly as it does today — including stomping the duck.
 */
function invalidateBusGainCache(rt, key) {
  const cache = rt && rt._busGainCache;
  if (cache) delete cache[key];
}

/** Event-driven slow-time mix over pooled graph nodes. UI/comms never enter `filters`. */
export function applyBulletTimeAudioTreatment(rt, requestedActive, muted = false) {
  if (!rt) return;
  rt._bulletTimeAudioActive = !!requestedActive;
  const active = !!requestedActive && !muted;
  rt._bulletTimePitch = active ? BULLET_TIME_AUDIO.loopRate : 1;
  rt._bulletTimeMusicMult = active ? BULLET_TIME_AUDIO.musicMult : 1;
  const ctx = rt.ctx;
  if (!ctx) return;
  const now = ctx.currentTime;
  const duration = active ? BULLET_TIME_AUDIO.enterS : BULLET_TIME_AUDIO.exitS;
  const cutoff = active ? BULLET_TIME_AUDIO.cutoffHz : BULLET_TIME_AUDIO.openHz;
  for (const filter of rt._bulletTimeFilters || []) {
    const param = filter && filter.frequency;
    if (!param) continue;
    try {
      param.cancelScheduledValues(now);
      param.setValueAtTime(Math.max(20, Number(param.value) || BULLET_TIME_AUDIO.openHz), now);
      param.linearRampToValueAtTime(cutoff, now + duration);
    } catch (_) { try { param.value = cutoff; } catch (__) {} }
  }
  const setRate = (source) => {
    const param = source && source.playbackRate;
    if (!param) return;
    try { param.setTargetAtTime(rt._bulletTimePitch, now, duration / 3); }
    catch (_) { try { param.value = rt._bulletTimePitch; } catch (__) {} }
  };
  setRate(rt.engineNoise);
  setRate(rt.brakeNoise);
  for (const key in rt.loops || {}) {
    const voice = rt.loops[key];
    if (!voice || !isPhysicalAudioBus(voice.busName)) continue;
    for (const source of voice && voice.sources || []) setRate(source);
  }
  if (rt.musicBus && rt.musicBus.gain) {
    const target = Math.max(0.0001, (rt._musicBase || 0.0001) * rt._bulletTimeMusicMult);
    try {
      rt.musicBus.gain.cancelScheduledValues(now);
      rt.musicBus.gain.setValueAtTime(Math.max(0.0001, rt.musicBus.gain.value), now);
      rt.musicBus.gain.linearRampToValueAtTime(target, now + duration);
    } catch (_) { try { rt.musicBus.gain.value = target; } catch (__) {} }
    invalidateBusGainCache(rt, 'music');
  }
}

export function resolveEngineAudioIdentity(entity) {
  let profile = null;
  try { profile = resolvePropulsionProfile(entity); } catch (_) { profile = null; }
  const family = profile && ENGINE_FAMILY_AUDIO[profile.family]
    ? profile.family
    : DRIVE_FAMILIES.REACTION;
  const voice = ENGINE_FAMILY_AUDIO[family];
  const derived = entity && entity.data && entity.data.derived;
  const mass = Math.max(1, Number(entity && entity.mass) || Number(derived && derived.mass) || 1);
  const massClass = mass >= 110 ? 'heavy' : mass <= 32 ? 'light' : 'medium';
  const massNorm = clamp(mass / 120, 0.55, 1.8);
  return { family, driveId: profile && profile.id || null, mass, massClass, massNorm, voice };
}

function doctrineIdForOwner(state, payload) {
  if (payload && DOCTRINE_AUDIO_SIGNATURES[payload.doctrineId]) return payload.doctrineId;
  const owner = state && state.entities && payload && payload.ownerId != null
    ? state.entities.get(payload.ownerId)
    : null;
  const ai = owner && owner.data && owner.data.ai;
  return ai && DOCTRINE_AUDIO_SIGNATURES[ai.combatDoctrineId] ? ai.combatDoctrineId : null;
}

export function resolveWeaponAudioSignature(payload, state) {
  const recipeId = recipeForWeapon(payload && payload.weaponId);
  const doctrineId = doctrineIdForOwner(state, payload);
  const doctrine = doctrineId && DOCTRINE_AUDIO_SIGNATURES[doctrineId];
  return {
    recipeId,
    doctrineId,
    rate: doctrine ? doctrine.fireRate : 1,
    gain: 0.85 * (doctrine ? doctrine.fireGain : 1),
    detune: doctrine ? doctrine.fireDetune : 0,
  };
}

/**
 * Resolve a player-hit receipt in ship-local coordinates. World-X panning made direction change as
 * the ship turned; this keeps left/right stable relative to the player's nose. Front/rear also get
 * a restrained pitch distinction, while urgency scales only the one-shot receipt (never an alarm).
 */
export function resolvePlayerDamageAudioSignature(payload, state) {
  const player = state && state.entities && state.entities.get(state.playerId);
  const attacker = state && state.entities && payload && payload.attackerId != null
    ? state.entities.get(payload.attackerId)
    : null;
  const origin = attacker && attacker.pos || payload && (payload.hitPoint || payload.pos) || null;
  let pan = 0, forward = 0;
  if (player && player.pos && origin) {
    const dx = origin.x - player.pos.x;
    const dz = origin.z - player.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const rot = Number(player.rot) || 0;
    forward = (dx * Math.cos(rot) + dz * Math.sin(rot)) / len;
    pan = clamp((dx * -Math.sin(rot) + dz * Math.cos(rot)) / len, -0.85, 0.85);
  }
  const after = payload && payload.after || {};
  const hullMax = Math.max(1, Number(player && player.hullMax) || Number(after.hullMax) || 1);
  const hullPct = clamp(Number(after.hull != null ? after.hull : player && player.hull) / hullMax, 0, 1);
  const layer = (payload && payload.dominantLayer)
    || (Number(payload && payload.shieldDamage) > 0 ? 'shield'
      : Number(payload && payload.armorDamage) > 0 ? 'armor' : 'hull');
  const urgency = hullPct < 0.2 ? 1 : hullPct < 0.45 ? 0.62 : 0.3;
  return {
    layer,
    pan,
    bearing: forward < -0.45 ? 'rear' : forward > 0.45 ? 'front' : pan < -0.2 ? 'left' : pan > 0.2 ? 'right' : 'center',
    rate: forward < -0.45 ? 0.88 : forward > 0.45 ? 1.08 : 0.98,
    detune: Math.round(pan * 9),
    gain: 0.56 + urgency * 0.24,
    position: origin,
    urgency,
  };
}

export function isPlayerInAudioCalmZone(state, player) {
  if (!state || !player) return false;
  if ((player.flags && player.flags.docked) || (state.ui && state.ui.docked)) return true;
  const sectorId = state.world && state.world.currentSectorId;
  const sector = sectorId && state.world && state.world.sectors && state.world.sectors[sectorId];
  if (sector && (sector.tier === 0 || (sector.security >= 0.9 && sector.enemyDensity === 0))) return true;
  const stations = state.world && state.world.activeSector && state.world.activeSector.stations || [];
  for (const station of stations) {
    if (!station || !station.pos) continue;
    const dx = station.pos.x - player.pos.x;
    const dz = station.pos.z - player.pos.z;
    if (dx * dx + dz * dz <= 1100 * 1100) return true;
  }
  return false;
}

export function resolveAudioThreatContext(state, player, rt) {
  const simTime = Number(state && state.simTime) || 0;
  const lastDamageT = rt && Number.isFinite(rt._lastDamageT) ? rt._lastDamageT : -1e9;
  const recentDamage = simTime - lastDamageT < IN_COMBAT_WINDOW;
  const activeEncounter = !!(rt && rt._activeCombatEncounters && rt._activeCombatEncounters.size);
  const doctrineThreat = simTime < Number(rt && rt._doctrineThreatUntil || -1e9);
  const engaged = recentDamage || activeEncounter || doctrineThreat;
  const calmZone = isPlayerInAudioCalmZone(state, player);
  const nearbyHostiles = calmZone && !engaged
    ? 0
    : audioNearbyHostileCount(state, player, 1200, rt && rt._musicThreatScratch || [], 3);
  const shieldPct = player && player.shieldMax > 0 ? clamp(player.shield / player.shieldMax, 0, 1) : 1;
  let threat = clamp(0.5 * Math.min(nearbyHostiles, 3) / 3 + 0.5 * (1 - shieldPct) * (recentDamage ? 1 : 0), 0, 1);
  if (engaged) threat = Math.max(threat, activeEncounter || doctrineThreat ? 0.45 : 0.3);
  return { threat, nearbyHostiles, shieldPct, calmZone, engaged };
}

// Build a fast id->recipe lookup over the data array.
const recipeById = {};
for (const r of RECIPES) recipeById[r.id] = r;
export const AUDIO_RECIPE_BY_ID = Object.freeze(recipeById);

// --- collision cues: sound tells weight ---
// A scout kissing a rock and a freighter broadsiding a station are not the same event. Pitch is a
// decreasing function of the heavier participant's acoustic mass (immovable stations/asteroids map
// to nominal masses so they read as heavy, not weightless); loudness is an increasing function of
// the exchanged momentum (dp, falling back to impulse); the recipe ladder picks an existing recipe
// per tier. Pure and node-testable: no Math.random, no Date.now, no DOM, no `this`.
export const COLLISION_CUE = Object.freeze({
  ACOUSTIC_MASS_STATION: 400,
  ACOUSTIC_MASS_ASTEROID: 120,
  ACOUSTIC_MASS_UNKNOWN: 48,
  MASS_LIGHT: 16,
  MASS_HEAVY: 400,
  RATE_LIGHT: 1.6,
  RATE_HEAVY: 0.5,
  RATE_CURVE: 2.2,
  RATE_MIN: 0.45,
  RATE_MAX: 1.8,
  GAIN_MIN: 0.05,
  GAIN_MAX: 0.95,
  DP_FULL: 24000,
  TIER_KISS_DP: 400,
  TIER_SLAM_DP: 4000,
  TIER_HEAVY_MASS: 200,
});

const COLLISION_TIER_RECIPES = Object.freeze({
  kiss: 'sfx_dock_clunk',
  knock: 'sfx_mining_impact',
  slam: 'sfx_explosion_small',
  broadside: 'sfx_explosion_large',
});

function collisionAcousticMass(mass, type) {
  if (type === 'station') return COLLISION_CUE.ACOUSTIC_MASS_STATION;
  if (type === 'asteroid') return COLLISION_CUE.ACOUSTIC_MASS_ASTEROID;
  return Number.isFinite(mass) && mass > 0 ? mass : COLLISION_CUE.ACOUSTIC_MASS_UNKNOWN;
}

export function resolveCollisionCue(input) {
  const src = input || {};
  const acousticMass = Math.max(
    collisionAcousticMass(src.massA, src.typeA),
    collisionAcousticMass(src.massB, src.typeB),
  );
  const massNorm = clamp(
    Math.log(Math.max(acousticMass, COLLISION_CUE.MASS_LIGHT) / COLLISION_CUE.MASS_LIGHT)
      / Math.log(COLLISION_CUE.MASS_HEAVY / COLLISION_CUE.MASS_LIGHT),
    0,
    1,
  );
  const rate = clamp(
    COLLISION_CUE.RATE_LIGHT
      * Math.pow(
        COLLISION_CUE.RATE_HEAVY / COLLISION_CUE.RATE_LIGHT,
        Math.pow(massNorm, COLLISION_CUE.RATE_CURVE),
      ),
    COLLISION_CUE.RATE_MIN,
    COLLISION_CUE.RATE_MAX,
  );
  const dp = Number.isFinite(src.dp) ? src.dp : Number.isFinite(src.impulse) ? src.impulse : 0;
  const loudNorm = Math.sqrt(clamp(dp / COLLISION_CUE.DP_FULL, 0, 1));
  const gain = clamp(
    COLLISION_CUE.GAIN_MIN + (COLLISION_CUE.GAIN_MAX - COLLISION_CUE.GAIN_MIN) * loudNorm,
    COLLISION_CUE.GAIN_MIN,
    COLLISION_CUE.GAIN_MAX,
  );
  const heavy = acousticMass >= COLLISION_CUE.TIER_HEAVY_MASS;
  const slammed = dp >= COLLISION_CUE.TIER_SLAM_DP;
  // The kiss test comes FIRST and outranks mass. Touching a station is a clunk, not a whisper-quiet
  // explosion: how HARD it was picks the recipe, how HEAVY it was picks the pitch. Letting `heavy`
  // reach 'slam' at dp 40 gave a docking nudge an explosion sample played at gain 0.087.
  const tier = dp <= COLLISION_CUE.TIER_KISS_DP
    ? 'kiss'
    : slammed && heavy
      ? 'broadside'
      : slammed || heavy
        ? 'slam'
        : 'knock';
  return Object.freeze({
    recipeId: COLLISION_TIER_RECIPES[tier],
    rate,
    gain,
    acousticMass,
    tier,
  });
}

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
    if (entityNeedsExactAudio(e, { playerId: player.id }) !== true
      && !(e.data && e.data.ai && e.data.ai.combatant === true)) continue;
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
  // Station hub / mission-log navigation cues (must not collapse to generic click).
  ui_accept: 'sfx_ui_confirm', ui_undock: 'sfx_undock_release',
  ui_charge_start: 'sfx_jump_charge', ui_charge_abort: 'sfx_ui_back',
  // Salvage scan resolve — soft Focus-adjacent ping, distinct from lock_acquired.
  scan_resolve: 'sfx_scan_pulse',
  // Gameplay cues with dedicated recipes (drill.js loot/hazard, countermeasures.js, combat shield break).
  loot_collect: 'sfx_loot_collect', mining_core_fizzle: 'sfx_mining_core_fizzle',
  shield_break: 'sfx.shieldBreak', cm_chaff: 'sfx_cm_chaff', cm_ecm: 'sfx_cm_ecm',
  // WANTED heat escalation/clear — gameplay warning voices, not menu feedback. They ride the ui
  // bus like every established warning, and cut through squelch as priority voices ('alert'
  // substring) instead of relying on bus choice.
  wanted_escalate: 'sfx_wanted_alert', wanted_clear: 'sfx_wanted_clear',
  [FIRST_HOUR_AUDIO_SIGNATURES.masslineLatch.semanticId]: FIRST_HOUR_AUDIO_SIGNATURES.masslineLatch.recipeId,
  [FIRST_HOUR_AUDIO_SIGNATURES.masslineStrain.semanticId]: FIRST_HOUR_AUDIO_SIGNATURES.masslineStrain.recipeId,
  [FIRST_HOUR_AUDIO_SIGNATURES.masslineBreak.semanticId]: FIRST_HOUR_AUDIO_SIGNATURES.masslineBreak.recipeId,
  'presentation.tether.whip_impact': 'sfx.tetherSnap',
  // Massline Physics Identity (Wave M2): throw/sling/tumble/bullet-time/cloak semantic cues.
  'massline.throw': 'sfx_massline_throw',
  'massline.solutionLock': 'sfx_massline_solution',
  'massline.sling': 'sfx_massline_sling',
  'massline.tumble': 'sfx_massline_tumble',
  'massline.bulletTimeIn': 'sfx_massline_bt_in',
  'massline.bulletTimeOut': 'sfx_massline_bt_out',
  'massline.cloakOn': 'sfx_massline_cloak_on',
  'massline.cloakOff': 'sfx_massline_cloak_off',
  'massline.jettisonKick': 'sfx_massline_jettison',
  'massline.bombDrop': 'sfx_massline_bomb_drop',
  'presentation.travel.cruise_charge': 'sfx.cruiseCharging',
  'presentation.travel.lane_lock': 'sfx_travel_lane_lock',
  'presentation.travel.cancel': 'sfx_travel_cancel',
  'presentation.travel.fail': 'sfx_travel_fail',
  'presentation.travel.gate_approach': 'sfx_travel_gate_approach',
  'presentation.travel.gate_align': 'sfx_travel_gate_align',
  'presentation.travel.commit_window': 'sfx_travel_commit_window',
  'presentation.travel.commit': 'sfx_travel_commit',
  'presentation.travel.transit': 'sfx_travel_transit',
  'presentation.travel.arrival': 'sfx_travel_arrival',
  'presentation.travel.sector_identity': 'sfx_travel_sector_identity',
  'presentation.travel.discovery': 'sfx_scan_pulse',
  'presentation.travel.interdiction': 'sfx_travel_interdiction',
  'presentation.travel.recovery': 'sfx_travel_recovery',
  'presentation.travel.settle': 'sfx_travel_settle',
  'presentation.travel.contested': 'sfx_travel_interdiction',
  'presentation.mining.scan_pulse': 'sfx_mining_scan_pulse',
  'presentation.mining.scan_return': 'sfx_mining_scan_return',
  'presentation.mining.scan_classified': 'sfx_mining_scan_classified',
  'presentation.mining.scan_tracked': 'sfx_mining_scan_tracked',
  'presentation.mining.scan_investigated': 'sfx_mining_scan_investigated',
  'presentation.mining.cutter_lock': 'sfx_mining_cutter_lock',
  'presentation.mining.hardness': 'sfx_mining_hardness',
  'presentation.mining.seam_reward': 'sfx_mining_seam_reward',
  'presentation.mining.fracture_warning': 'sfx_mining_fracture_warning',
  'presentation.mining.fracture_break': 'sfx_mining_fracture_break',
  'presentation.mining.core_exposed': 'sfx_mining_core_exposed',
  'presentation.mining.core_charge': 'sfx_mining_core_charge',
  'presentation.mining.core_reward': 'sfx_mining_core_reward',
  'presentation.mining.core_fizzle': 'sfx_mining_core_fizzle',
  'presentation.mining.mass_required': 'sfx_mining_mass_required',
  'presentation.mining.mass_engaged': 'sfx_mining_mass_engaged',
  'presentation.mining.cargo_settle': 'sfx_mining_cargo_settle',
  'presentation.mining.cargo_full': 'sfx_ui_error',
  'presentation.mining.field_settle': 'sfx_mining_field_settle',
  'presentation.mining.heat_warning': 'sfx_mining_heat_warning',
  'presentation.mining.vent_ready': 'sfx_vent_chime',
  'presentation.mining.yield': 'sfx_mining_yield',
  'presentation.mining.seismic_pulse': 'sfx_mining_seismic_pulse',
  'presentation.mining.drill_contact': 'sfx_mining_drill_contact',
  'presentation.mining.drill_break': 'sfx_mining_drill_break',
  'presentation.mining.drill_yield': 'sfx_mining_drill_yield',
  'presentation.mining.gas_hazard': 'sfx_mining_gas_hazard',
  'presentation.mining.drill_abort': 'sfx_mining_drill_abort',
  'presentation.mining.drill_retry': 'sfx_mining_drill_retry',
  'presentation.combat.doctrine_setup': 'sfx_encounter_escalation',
  'presentation.combat.doctrine_telegraph': 'sfx_encounter_escalation',
  'presentation.combat.doctrine_commit': 'sfx_encounter_escalation',
  'presentation.combat.doctrine_aftermath': 'sfx_encounter_escalation',
  'presentation.combat.doctrine_break': 'sfx_doctrine_break',
  'presentation.combat.doctrine_withdraw': 'sfx_doctrine_withdraw',
  'presentation.combat.interceptor_flyby.setup': 'sfx_doctrine_flyby',
  'presentation.combat.interceptor_flyby.break': 'sfx_doctrine_flyby_break',
  'presentation.combat.interceptor_flyby.withdraw': 'sfx_doctrine_flyby_withdraw',
  'presentation.combat.brawler_commit.setup': 'sfx_doctrine_brawler_commit',
  'presentation.combat.brawler_commit.break': 'sfx_doctrine_brawler_break',
  'presentation.combat.brawler_commit.withdraw': 'sfx_doctrine_brawler_withdraw',
  'presentation.combat.tether_control_raider.setup': 'sfx_doctrine_tether_spool',
  'presentation.combat.tether_control_raider.break': 'sfx_doctrine_tether_break',
  'presentation.combat.tether_control_raider.withdraw': 'sfx_doctrine_tether_withdraw',
  'presentation.combat.ranged_disengager.setup': 'sfx_doctrine_ranged_charge',
  'presentation.combat.ranged_disengager.break': 'sfx_doctrine_ranged_break',
  'presentation.combat.ranged_disengager.withdraw': 'sfx_doctrine_ranged_withdraw',
  // The warden shares the house break/withdraw voices; its own setup phrase is the guard cadence.
  'presentation.combat.escort_screen.setup': 'sfx_doctrine_escort_screen',
  'presentation.combat.escort_screen.break': 'sfx_doctrine_break',
  'presentation.combat.escort_screen.withdraw': 'sfx_doctrine_withdraw',
  'presentation.combat.damage_applied': 'sfx.hullHit',
  'presentation.combat.near_miss': 'sfx_combat_near_miss',
  'presentation.combat.player_hit': 'sfx.playerDamage',
  [FIRST_HOUR_AUDIO_SIGNATURES.enemyKill.semanticId]: FIRST_HOUR_AUDIO_SIGNATURES.enemyKill.recipeId,
  [FIRST_HOUR_AUDIO_SIGNATURES.shieldBreak.semanticId]: FIRST_HOUR_AUDIO_SIGNATURES.shieldBreak.recipeId,
  'presentation.subsystem.disabled': 'sfx_subsystem_disabled',
  'presentation.subsystem.drive_disabled': 'sfx_subsystem_drive_disabled',
  'presentation.subsystem.sensor_disabled': 'sfx_subsystem_sensor_disabled',
  'presentation.subsystem.weapon_disabled': 'sfx_subsystem_weapon_disabled',
  'presentation.scenario.signal': 'sfx_scenario_signal',
  'presentation.comms.kessler': 'sfx_comms_kessler',
  'presentation.comms.denial': 'sfx_comms_denial',
  'presentation.comms.priority': 'sfx_ui_alert',
  'presentation.objective.split': 'sfx_objective_priority_split',
  'presentation.branch.resolved': 'sfx_branch_resolved',
});

export function resolveAudioCueRecipeId(cueId) {
  return AUDIO_CUE_TO_RECIPE[cueId] || (AUDIO_RECIPE_BY_ID[cueId] ? cueId : 'sfx_ui_click');
}

export function alertCueOwnsAudio(payload) {
  if (payload && payload.audioOwnedByPresentation) return false;
  // Presentation emits both a semantic audio lane and a visual `alert` for these receipts. The
  // alert remains visible, but its generic beep must not double or blur the authored signature.
  return !(payload && FIRST_HOUR_SIGNATURE_BY_PRESENTATION_CUE_ID[payload.cueId]);
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
  if ((recipe && recipe.category === 'mining') || id.includes('mining') || id.includes('ambient') || id.includes('station_hum') || id.includes('room_tone') || id.includes('fringe') || id.includes('anomaly') || id.includes('traffic') || id.includes('machinery') || id.includes('pad')) {
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

export const DRILL_GRIND_LOOP_ID = 'sfx_mining_drill_grind';

// Pure mix target for the drill bed. Heat raises RPM/brightness while a depleted capacitor sags;
// hardness adds load without spawning another voice. This remains presentation-only.
export function drillGrindMix(drillState, out = {}) {
  const active = !!(drillState && drillState.active && drillState.avatar && drillState.avatar.isDrilling);
  const heat = clamp((Number(drillState && drillState.drillTemp) || 0) / 100, 0, 1);
  const energy = clamp((Number(drillState && drillState.drillEnergy) || 0) / 100, 0, 1);
  const target = drillState && drillState.avatar && drillState.avatar.drillTarget;
  const tile = target && drillState.field && drillState.field[target.col] && drillState.field[target.col][target.row];
  const hardness = clamp((Number(tile && tile.hardness) || 1) / 2.4, 0, 1);
  const energyStrain = 1 - energy;
  out.active = active;
  out.gain = 0.58 + hardness * 0.18 + heat * 0.08;
  out.rate = clamp(0.92 + heat * 0.28 + hardness * 0.06 - energyStrain * 0.12, 0.78, 1.26);
  out.filterHz = clamp(480 + heat * 420 + hardness * 220 - energyStrain * 100, 360, 1120);
  return out;
}

// ---------------------------------------------------------------------------
// The mine's voice — PQ-130.08 / ASTEROID_WORKS_DESIGN_LAW.md §5, §8, §11.9
// ---------------------------------------------------------------------------
// What was actually wrong (measured 2026-08-21, not inherited from the 2026-08-07 note):
//   • `_onPause(true)` zeroes ONLY the music bus. `ambientBus`, `sfxBus`, `uiBus` and `combatBus`
//     stay live, `_onCue` is not pause-gated, and `_updateDrillGrind()` runs outside the
//     `if (!rt._paused)` block in `_frame()`. So one-shots and the grind loop were never muted.
//   • A silent music bus inside the rock is not the bug — it is the law: §8 says "the flight score
//     does not continue inside". Nothing below un-zeroes it.
//   • The real hole is that nothing was ever authored to take the score's place, and several §5
//     rows had no reachable cue at all. §11.9's live invariant ("the music/AMBIENCE bus gain is
//     > 0 while screen `drill` is active") is satisfied by the bed below, on the ambient bus.
export const MINE_SCREEN_ID = 'drill';

/** 'front' = the mine owns the glass; 'behind' = a pause/settings screen sits on top of it. */
export function mineScreenPresence(screenStack) {
  if (!Array.isArray(screenStack) || screenStack.length === 0) return 'none';
  if (screenStack[screenStack.length - 1] === MINE_SCREEN_ID) return 'front';
  return screenStack.includes(MINE_SCREEN_ID) ? 'behind' : 'none';
}

// A pause menu opened over the mine ducks the bed rather than killing it: you are still in the
// rock, the room tone just steps back so the menu reads.
export const MINE_BED_DUCK_BEHIND = 0.3;

// Law §8/§9 envelope: fade in on enter (<= 600 ms), fade out on retract.
export const MINE_BED_FADE_IN_S = 0.55;
export const MINE_BED_FADE_OUT_S = 0.45;
export const MINE_BUS_PEAK = 1;
// Sub-fader peaks under the mine bus, referred to the AMBIENT bus input so they can be compared
// against what already ships there: the station hum enters at 0.038–0.045 and a `sfx_mining_*`
// one-shot at audioRecipeBasePeak('mining') 0.3 x the 0.8 cue gain = 0.24.
//   • bed: two unity room oscillators x roomGain 0.5, plus air at 0.20 => 1.2 into this fader, so
//     0.10 lands the room tone at ~0.12 — about 3x the station hum. Present, not a hangar.
//   • grind: a unity noise layer plus its oscillator bed (<= 1.42) x the mix gain (<= 0.76), so
//     0.22 lands the loudest possible bore at ~0.24 — level with a foreground mining one-shot,
//     which is right for the primary action sound of the screen and no hotter.
// test/asteroid-sound-routing.test.mjs §7 MEASURES both off the live graph rather than trusting
// this arithmetic, and pins them against those two shipped references.
export const MINE_BED_PEAK = 0.10;
export const MINE_GRIND_PEAK = 0.22;

/**
 * The whole pause-path decision for the mine, as one pure function of (screen stack, paused,
 * muted). `_onPause` and `_applySettings` both call it so the rule cannot drift between them,
 * and test/asteroid-sound-routing.test.mjs enumerates the real PAUSING_SCREENS set against it.
 *
 * For every pausing screen that is NOT `drill` this returns exactly the legacy behaviour:
 * bed off, and `musicSilenced === paused`.
 */
export function resolveMineAudioIntent(input = {}, out = {}) {
  const presence = mineScreenPresence(input.screenStack);
  const paused = !!input.paused;
  const muted = !!input.muted;
  const mineActive = presence !== 'none' && !muted;
  out.presence = presence;
  out.mineActive = mineActive;
  out.bedActive = mineActive;
  out.bedDuck = mineActive ? (presence === 'front' ? 1 : MINE_BED_DUCK_BEHIND) : 0;
  // Legacy rule (`muted || paused`) plus the §8 clause: the score never plays inside the rock.
  out.musicSilenced = muted || paused || mineActive;
  // While the mine owns the ear it also owns the drill cue voices, so the flight-mix recipes
  // routed through presentation do not double the synthesized mine cue.
  out.cuesOwnedByMine = mineActive;
  return out;
}

// ---- grind: three hardness layers, crossfaded by the target cell's material ----
export const MINE_GRIND_LAYERS = Object.freeze(['matrix', 'basalt', 'locked']);

// Centres in `materialHardness()` units (src/systems/drill.js): regolith/dirt sits at 0.75, plain
// and deep rock climb 1.15 -> 2.0 (the generator's hardest plain rock is 1.15 + 0.85), and the
// locked centre is deliberately parked ABOVE that ceiling so no ungated cell is ever mistaken for
// a locked one — the tier gate, not the hardness, is what selects the metallic skate. The test
// pins these against the live materialHardness() so the two tables cannot drift apart.
export const MINE_GRIND_CENTRES = Object.freeze({ matrix: 0.75, basalt: 1.5, locked: 2.6 });

/** Local mirror of drill.js `materialHardness` — audio must not import the sim. */
export function mineTileHardness(tile) {
  if (!tile || tile.type === 'empty') return 0;
  if (Number.isFinite(tile.hardness)) return Math.max(0.35, tile.hardness);
  if (tile.type === 'gas') return 0.5;
  if (tile.type === 'dirt') return 0.75;
  if (tile.type === 'vein') return 1.15;
  return 1.45;
}

/**
 * Pure mix target for the three-layer grind. Selection is a function of the TARGET CELL only
 * (type, hardness, tier gate); bore progress and heat drive intensity, never layer choice.
 * `boring: false` returns a silent, layer-less result — the law's "silent when not boring".
 */
export function mineGrindLayers(tile, opts = {}, out = null) {
  const c = MINE_GRIND_CENTRES;
  const hardness = mineTileHardness(tile);
  const gated = Math.max(1, Math.trunc(Number(tile && tile.tierReq) || 1)) > 1
    || String((tile && tile.type) || '') === 'exotic';
  const bore = clamp(Number(opts.bore) || 0, 0, 1);
  const heat = clamp(Number(opts.heat) || 0, 0, 1);
  const energy = clamp(opts.energy == null ? 1 : Number(opts.energy), 0, 1);
  const weights = (out && out.weights) || { matrix: 0, basalt: 0, locked: 0 };
  weights.matrix = 0; weights.basalt = 0; weights.locked = 0;
  if (gated) {
    // A cell the bit is not rated for reads as the locked layer no matter how soft the stone is:
    // that metallic skate IS the information.
    weights.locked = 1;
    weights.basalt = clamp((hardness - c.matrix) / (c.locked - c.matrix), 0, 1) * 0.35;
  } else if (hardness <= c.matrix) {
    weights.matrix = 1;
  } else if (hardness >= c.locked) {
    weights.locked = 1;
  } else if (hardness <= c.basalt) {
    const t = (hardness - c.matrix) / (c.basalt - c.matrix);
    weights.matrix = 1 - t; weights.basalt = t;
  } else {
    const t = (hardness - c.basalt) / (c.locked - c.basalt);
    weights.basalt = 1 - t; weights.locked = t;
  }
  const sum = weights.matrix + weights.basalt + weights.locked || 1;
  weights.matrix /= sum; weights.basalt /= sum; weights.locked /= sum;
  let layer = 'matrix';
  if (weights.basalt > weights[layer]) layer = 'basalt';
  if (weights.locked > weights[layer]) layer = 'locked';
  const active = !!opts.boring && hardness > 0;
  const res = out || {};
  res.active = active;
  res.layer = active ? layer : null;
  res.hardness = hardness;
  res.gated = gated;
  res.bore = bore;
  res.weights = weights;
  // Rises with bore progress (law §5 "Bore progress"), sags on a flat capacitor.
  res.gain = active ? clamp(0.34 + bore * 0.34 + heat * 0.08 - (1 - energy) * 0.10, 0, 1) : 0;
  res.rate = clamp(0.92 + heat * 0.24 - (1 - energy) * 0.12, 0.78, 1.24);
  res.filterHz = clamp(1180 - hardness * 300 + bore * 220 + heat * 180, 240, 1500);
  return res;
}

// ---- cue table: one row per law §5 "what you hear" column ----
// Mix priority is a rank, not a volume: hazard > payoff > machine state > ambience.
export const MINE_CUE_CLASS_RANK = Object.freeze({ ambience: 0, machine: 1, payoff: 2, hazard: 3 });
export const MINE_PRIORITY_DUCK = 0.45;       // a lower-rank voice under a live alert
export const MINE_BED_ALERT_DUCK = 0.35;      // the room tone under a live alert
export const MINE_GRIND_ALERT_DUCK = 0.5;     // the grind under a live alert
export const MINE_REFUSAL_SUPPRESS_MS = 5000; // law §5: identical refusals within 5s do not replay

function mineCue(klass, priority, extra = {}) {
  return Object.freeze({
    klass,
    priority,
    minGapMs: extra.minGapMs || 0,
    repeatSuppressMs: extra.repeatSuppressMs || 0,
    peak: extra.peak == null ? 0.3 : extra.peak,
    alert: !!extra.alert,
    holdMs: extra.holdMs || 0,
  });
}

// Peaks are referred to the AMBIENT bus input, where a shipped `sfx_mining_*` one-shot enters at
// 0.24. Each branch in `_synthMineCue` layers 1-3 partials, so the SUM is the voice, not the row —
// the routing test measures those sums off the live graph and holds them in that window, with the
// gas breach the one cue allowed to dominate the room.
export const MINE_CUES = Object.freeze({
  // payoff
  oreTick: mineCue('payoff', 0.62, { minGapMs: 55, peak: 0.20 }),
  courierLaunch: mineCue('payoff', 0.60, { minGapMs: 250, peak: 0.26 }),
  // hazard (alert class — one voice at a time)
  gasBreach: mineCue('hazard', 0.98, { minGapMs: 260, peak: 0.38, alert: true, holdMs: 900 }),
  heatCritical: mineCue('hazard', 0.88, { repeatSuppressMs: MINE_REFUSAL_SUPPRESS_MS, peak: 0.30, alert: true, holdMs: 700 }),
  // machine state
  boreBite: mineCue('machine', 0.38, { minGapMs: 70, peak: 0.18 }),
  rockBreak: mineCue('machine', 0.46, { minGapMs: 60, peak: 0.20 }),
  lockRefusal: mineCue('machine', 0.55, { repeatSuppressMs: MINE_REFUSAL_SUPPRESS_MS, peak: 0.24 }),
  hopperFull: mineCue('machine', 0.60, { repeatSuppressMs: MINE_REFUSAL_SUPPRESS_MS, peak: 0.24 }),
  rockDepleted: mineCue('machine', 0.52, { repeatSuppressMs: MINE_REFUSAL_SUPPRESS_MS, peak: 0.20 }),
  ventRelief: mineCue('machine', 0.58, { minGapMs: 400, peak: 0.22 }),
  machinePlaced: mineCue('machine', 0.55, { minGapMs: 120, peak: 0.26 }),
  machineStarved: mineCue('machine', 0.50, { repeatSuppressMs: MINE_REFUSAL_SUPPRESS_MS, peak: 0.18 }),
  // ambience
  assayPing: mineCue('ambience', 0.30, { minGapMs: 500, peak: 0.15 }),
});

// Sim event (or derived edge) -> cue key. `drill:warn` splits on its `reason` field, because the
// text-matching classifier in presentation/miningChoreography.js never matches the deep drill's
// live strings (verified: 'DRILL OVERHEATED!', 'Drill system cooled.' and 'Cargo holds are full!'
// appear nowhere in src/).
export const MINE_EVENT_CUE_MAP = Object.freeze({
  'drill:yield': 'oreTick',
  'drill:spark': 'boreBite',
  'drill:break': 'rockBreak',
  'drill:gasHit': 'gasBreach',
  'drill:cargoFull': 'hopperFull',
  'drill:rockDepleted': 'rockDepleted',
  'drill:scanPulse': 'assayPing',
  'drill:warn/tier': 'lockRefusal',
  'drill:warn/structure': 'lockRefusal',
  'drill:warn/cargoFull': 'hopperFull',
  'drill:warn/depleted': 'rockDepleted',
  'heat:critical': 'heatCritical',
  'heat:vented': 'ventRelief',
  'site:machineInstalled': 'machinePlaced',
  'site:machineStatus': 'machineStarved',
  'site:courierLaunched': 'courierLaunch',
});

// The law §5 table, transcribed, so the test can assert coverage row by row instead of trusting
// that the map above happens to be complete.
export const MINE_LAW_EVENT_ROWS = Object.freeze([
  Object.freeze({ row: 'Ore extracted', heard: 'soft mineral tick, pitch up with value', cue: 'oreTick', source: 'drill:yield' }),
  Object.freeze({ row: 'Bore progress (bite)', heard: 'a bite is a heavier strike', cue: 'boreBite', source: 'drill:spark' }),
  Object.freeze({ row: 'Bore progress (grind)', heard: 'grind loop, 3 layers crossfaded by hardness', cue: null, source: 'state.drill (continuous bed)' }),
  Object.freeze({ row: 'Gas pocket breached', heard: 'sharp hiss-boom, then fading hiss', cue: 'gasBreach', source: 'drill:gasHit' }),
  Object.freeze({ row: 'Locked material (MK gate)', heard: 'dull clank', cue: 'lockRefusal', source: 'drill:warn/tier' }),
  Object.freeze({ row: 'Hopper full', heard: 'wooden thock', cue: 'hopperFull', source: 'drill:cargoFull' }),
  Object.freeze({ row: 'Heat critical', heard: 'rising whine', cue: 'heatCritical', source: 'state.drill.drillTemp' }),
  Object.freeze({ row: 'Heat relief on vent', heard: 'relief hiss', cue: 'ventRelief', source: 'state.drill.drillTemp' }),
  Object.freeze({ row: 'Machine placed', heard: 'firm mechanical seat', cue: 'machinePlaced', source: 'site:machineInstalled' }),
  Object.freeze({ row: 'Machine starved/unpowered', heard: 'single soft chime, once', cue: 'machineStarved', source: 'site:machineStatus' }),
  Object.freeze({ row: 'Courier launch', heard: 'soft launch thump', cue: 'courierLaunch', source: 'site:courierLaunched' }),
  Object.freeze({ row: 'Survey / assay ping', heard: 'quiet sonar blip', cue: 'assayPing', source: 'drill:scanPulse' }),
]);

// Presentation cue ids whose physical voice the mine takes over while screen `drill` is up. The
// semantic bus keeps emitting them (captions, floaters, `.07`'s board expressions); only the
// flight-mix recipe playback is skipped, so nothing double-hits.
export const MINE_OWNED_PRESENTATION_CUES = Object.freeze(new Set([
  'mining.drill.contact',
  'mining.drill.break',
  'mining.drill.yield',
  'mining.drill.gas_hazard',
  'mining.drill.seismic_pulse',
  'mining.cargo.full',
  'mining.heat.overheated',
  'mining.vent.ready',
  'mining.field.aftermath',
  // Deliberately NOT here: `mining.drill.aborted` and `mining.drill.retry`. Those two bracket the
  // session rather than happen inside it — an abort fires as you leave and a retry as you come
  // back — so they keep the shipped flight-mix recipe that the rest of the game answers with. Add
  // them only if the mine ever grows its own enter/leave stingers.
]));

/**
 * One-voice arbiter for the mine, modelled on the flight HUD's voiceArbiter idea but local and
 * pure so the test can drive it without Web Audio. Rules:
 *   • repeat suppression (5 s for refusals) and per-cue minimum gap;
 *   • ALERT-class cues hold the ear: while one is holding, another alert of equal or lower rank
 *     is refused outright (law §8 "one voice at a time for alert-class sounds");
 *   • non-alert cues are never refused by a hold, they duck under it.
 */
export function createMineVoiceArbiter(table = MINE_CUES) {
  const lastAt = Object.create(null);
  let hold = null;
  const duckOut = { bed: 1, grind: 1, heldBy: null };
  const liveHold = (t) => (hold && t < hold.untilMs ? hold : null);
  return {
    admit(key, nowMs) {
      const spec = table[key];
      if (!spec) return { ok: false, reason: 'unknown_cue', key };
      const t = Number(nowMs) || 0;
      const prev = lastAt[key];
      if (Number.isFinite(prev)) {
        if (spec.repeatSuppressMs > 0 && t - prev < spec.repeatSuppressMs) {
          return { ok: false, reason: 'repeat_suppressed', key, retryInMs: spec.repeatSuppressMs - (t - prev) };
        }
        if (spec.minGapMs > 0 && t - prev < spec.minGapMs) {
          return { ok: false, reason: 'rate_limited', key };
        }
      }
      const rank = MINE_CUE_CLASS_RANK[spec.klass];
      const held = liveHold(t);
      // Class rank first, then the cue's own priority as the intra-class tie-break: a gas breach
      // (0.98) cuts through a heat whine (0.88), never the other way round.
      const outranks = rank > held?.rank || (rank === held?.rank && spec.priority > held?.priority);
      if (held && held.key !== key && spec.alert && !outranks) {
        return { ok: false, reason: 'alert_voice_busy', key, heldBy: held.key };
      }
      lastAt[key] = t;
      const duck = held && held.key !== key && !outranks && rank < held.rank ? MINE_PRIORITY_DUCK : 1;
      if (spec.alert) hold = { key, rank, priority: spec.priority, untilMs: t + spec.holdMs };
      return { ok: true, key, klass: spec.klass, rank, spec, duck, gain: spec.peak * duck };
    },
    /** Bed/grind duck while an alert owns the ear. Reuses one record — read it, do not keep it. */
    ambienceDuck(nowMs) {
      const held = liveHold(Number(nowMs) || 0);
      duckOut.bed = held ? MINE_BED_ALERT_DUCK : 1;
      duckOut.grind = held ? MINE_GRIND_ALERT_DUCK : 1;
      duckOut.heldBy = held ? held.key : null;
      return duckOut;
    },
    heldBy(nowMs) { const h = liveHold(Number(nowMs) || 0); return h ? h.key : null; },
    reset() { hold = null; for (const k of Object.keys(lastAt)) delete lastAt[k]; },
  };
}

// Heat thresholds for the derived critical/vent edges (drill.js clamps drillTemp to 0..100 and
// latches `overheated` at 100).
export const MINE_HEAT_CRITICAL = 78;
export const MINE_HEAT_RELIEF = 46;

/** Value -> pitch for the ore tick: richer units read higher. Pure so the test can pin it. */
export function mineOreTickRate(qty, commodityId) {
  const q = Math.max(1, Math.trunc(Number(qty) || 1));
  const id = String(commodityId || '');
  let tier = 0;
  if (id.includes('gem_') || id.includes('exotic')) tier = 3;
  else if (id.includes('einsteinium') || id.includes('platinium') || id.includes('goldium')) tier = 2;
  else if (id.includes('silverium') || id.includes('copper') || id.includes('bronzium')) tier = 1;
  return clamp(1 + tier * 0.16 + Math.min(6, q - 1) * 0.045, 0.85, 1.9);
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
    rt._lifecycleSuspended = false;
    rt._lifecycleReason = null;
    rt._resumeAfterLifecycle = false;
    rt._lifecycleSuspendPromise = null;
    rt._resumePromise = null;
    rt._contextEverRan = false;
    rt._contextStateChangeHandler = null;
    rt._lastWallTime = undefined;
    rt._wantBeam = {};            // owners desiring a beam loop (started on resume)
    rt._wantMining = null;        // { minerId, targetId } desired mining loop
    rt._wantDrillGrind = false;   // state-derived deep-drill bed (survives AudioContext resume)
    rt._drillGrindMix = { active: false, gain: 0, rate: 1, filterHz: 560 };
    // --- the mine's voice (PQ-130.08) — desired state survives an AudioContext resume ---
    rt._mineIntent = resolveMineAudioIntent({ screenStack: null, paused: false, muted: true });
    rt._mineIntentInput = null;   // reusable input record for the per-frame intent recompute
    rt._mineGrindOpts = null;     // reusable opts record for the per-frame grind mix
    rt._wantMineBed = false;      // room tone + settling creaks while screen `drill` is up
    rt._mineBus = null; rt._mineBedGain = null; rt._mineGrindGain = null; rt._mineCueGain = null;
    rt._mineBed = null;           // { nodes, gain, sources, creakAt, rngState }
    rt._mineGrind = null;         // { layers: { matrix, basalt, locked }, nodes, ... }
    rt._mineGrindMix = { active: false, layer: null, weights: { matrix: 0, basalt: 0, locked: 0 }, gain: 0, rate: 1, filterHz: 700 };
    rt._mineArbiter = createMineVoiceArbiter();
    rt._mineHeatCritical = false; // latched so the whine/relief fire once per transition
    rt._mineMachineState = Object.create(null); // machineId -> last starved-ness (once per transition)
    rt._mineVoices = [];          // synthesized mine one-shots awaiting GC
    rt._musicDirty = true;
    rt._nextMusicScan = 0;
    rt._loopPositionDirty = true;
    rt._nextLoopPositionUpdate = 0;
    rt._musicThreatScratch = [];
    // First-hour identity + mix hierarchy (cosmetic audio only — never mutates gameplay).
    rt._priorityBus = createCuePriorityBus();
    rt._priorityEngineProbe = { role: 'engineLoop', loop: true };
    rt._priorityWeaponProbe = { role: 'weaponLoop', loop: true };
    rt._priorityDuckEngine = 1;
    rt._priorityDuckWeapon = 1;
    rt._criticalSquelchUntilMs = 0;
    rt._engineTier = 'idle';
    rt._engineTierSince = 0;
    rt._engineIdentityEntity = null;
    rt._engineIdentityDriveId = null;
    rt._engineIdentityMass = NaN;
    rt._engineIdentityFlightClass = null;
    rt._engineIdentity = null;
    rt._engineTelemetry = {
      tier: 'idle',
      f1: 55,
      f2: 55,
      noiseG: 0.0001,
      humG: 0.48,
      massNorm: 1,
      family: DRIVE_FAMILIES.REACTION,
      massClass: 'medium',
      duck: 1,
    };
    rt._activeCombatEncounters = new Set();
    rt._doctrineThreatUntil = -1e9;
    rt._lastDoctrineCueAt = -1e9;
    rt._lastAccelTransitionMs = 0;
    rt._lastTrafficBlipAt = 0;
    rt._lastMachineryAt = 0;
    rt._signatureLastAt = Object.create(null);
    rt._lastSquelchEndTime = 0;
    rt.sidechainDuck = 1;
    rt._busGainCache = null;      // last settings-derived bus gain written per bus
    rt._bedTargetCache = null;    // last brake/tether bed target written per param
    rt._bulletTimeAudioActive = false;
    rt._bulletTimePitch = 1;
    rt._bulletTimeMusicMult = 1;
    rt._bulletTimeFilters = [];
    if (rt.bandBed && typeof rt.bandBed.destroy === 'function') rt.bandBed.destroy();
    rt.bandBed = null;
    rt._bandBedIntent = { active: false, reason: 'not-tuned' };
    this.rt = rt;

    const bus = this.bus;

    // --- lazy AudioContext on first user gesture (autoplay policy) ---
    this._gestureHandler = () => {
      if (!this._isMuted()) this._ensureContext();
    };
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('pointerdown', this._gestureHandler, { once: false });
      window.addEventListener('keydown', this._gestureHandler, { once: false });
    }

    // --- event subscriptions (ARCHITECTURE §4.4 names + payloads) ---
    bus.on('combat:fire', (p) => this._onFire(p));
    bus.on('combat:beamStop', (p) => {
      if (!p || p.ownerStillFiring !== true) this._stopBeam(p && p.ownerId);
    });
    bus.on('projectile:hit', (p) => this._onHit(p, false));
    bus.on('combat:damage', (p) => this._onDamage(p));
    bus.on('collision', (p) => this._onCollision(p));
    bus.on('shieldDown', (p) => {
      // Shield break: a sharp energy crackle at the target's position. Use the explosion-small recipe
      // with a high pitch shift so it reads as an energy discharge, not a kinetic blast.
      const pos = p && p.pos;
      const target = p && p.combatantId ? this.state.entities.get(p.combatantId) : null;
      const position = pos || (target ? { x: target.pos.x, z: target.pos.z } : null);
      const signature = FIRST_HOUR_AUDIO_SIGNATURES.shieldBreak;
      this._applyPriorityCue({ id: 'shield.collapse', importance: signature.priority, playerRelevance: 1 });
      this.play(signature.recipeId, { position, gain: 0.64, critical: true });
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
    // Ceres living-work stamps already carry the calving on lamp/text channels; audio joins for
    // the rock's two own beats only (groan before the split, the split itself). The receipt has no
    // position — the bound actor is resolved read-only from the live cast, and play() culls
    // anything past world-hearing range, so a pocket the player left stays silent.
    bus.on('traffic:ceresCausalChain', (p) => this._onCeresCausalChain(p));
    bus.on('pickup:collected', (p) => this._onPickupCollected(p));
    bus.on('credits:changed', (p) => { if (p && p.delta > 0) this.play('sfx_ui_confirm', { gain: 0.7 }); });
    bus.on('economy:tradeCompleted', () => this.play('sfx_ui_confirm', { gain: 0.6 }));
    // Cargo jettison (HUD cargo panel "JETTISON" → cargo.js dump): previously TOTAL silence for an
    // audible world act — pods shoved out an airlock. Reuses the authored massline jettison kick
    // (jettisonImpulse is flag-gated OFF on the default route, so no doubling). The event has no
    // position; play() resolves the player ship locally and the dump always happens at the hull.
    bus.on('cargo:jettisoned', (p) => this._onCargoJettisoned(p));
    // Mission accept/complete: previously TOTAL silence on the core progression loop. Accept gets a
    // bright rising stinger; complete gets a triumphant two-note chord + a brief music duck so the
    // payoff lands above the bed.
    bus.on('mission:accepted', () => { this.play('sfx_mission_accept', { gain: 0.7 }); });
    bus.on('mission:completed', () => { this._duckMusic(); this.play('sfx_mission_complete', { gain: 0.8 }); });
    // Mission failure/expiry: previously silent on the negative outcome (only accept/complete had
    // sound). A short low deny cue signals the setback without celebration.
    bus.on('mission:failed', () => this._onCue('deny'));
    bus.on('mission:expired', () => this._onCue('deny'));
    bus.on('discovery:plateUnlocked', (p) => this._onDiscoveryUnlocked(p));
    bus.on('dock:docked', (p) => this._onDocked(p));
    bus.on('dock:undocked', () => this._onUndocked());
    // Existing encounter/doctrine seams drive presentation pressure only; audio never writes AI.
    bus.on('ai:telegraph', (p) => this._onDoctrineTelegraphAudio(p));
    bus.on('encounter:telegraph', (p) => this._onEncounterTelegraphAudio(p));
    bus.on('encounter:resolved', (p) => this._onEncounterResolvedAudio(p));
    // Jump/cruise one-shots are owned by the normalized presentation lane below. Do not subscribe
    // to their raw events here: doing so stacks a direct voice with the semantic journey voice.
    // Mining rewards and seam reads are normalized by presentation. The beam loop remains here,
    // but raw one-shot subscriptions would double the semantic reward floor.
    bus.on('weapons:vent', (p) => {
      if (p && p.ownerId === this.state.playerId && p.phase === 'end') this._onVentBonus(p);
    });
    bus.on('charge:detonated', (p) => {
      const hits = p && Array.isArray(p.hits) ? p.hits.length : 0;
      this.play('sfx.chargeDetonate', {
        position: p && p.pos,
        gain: clamp(0.55 + hits * 0.08, 0.55, 1),
      });
    });
    // Low-fuel alarm: fuel:empty fired with no sound (no warning before you're stranded). A short
    // alert cue surfaces the emergency. (The continuous low-health alarm is a separate poller.)
    bus.on('fuel:empty', () => this._onCue({ id: 'alert', importance: 0.9, duck: true }));
    // WANTED heat escalation: heat:changed drove VFX/telemetry but was silent — the player could
    // become hunted with no sound. The authoritative packet keys the whole family (see handler).
    bus.on('heat:changed', (p) => this._onHeatChanged(p));
    // Tech research + ship purchase: the two biggest credit sinks were silent. A confirm chime
    // makes the payoff of a major purchase/upgrade land.
    bus.on('tech:researched', () => this.play('sfx_mission_complete', { gain: 0.6 }));
    bus.on('ship:purchased', () => this.play('sfx_mission_complete', { gain: 0.7 }));
    bus.on('sector:enter', () => {
      rt._activeCombatEncounters.clear();
      rt._doctrineThreatUntil = -1e9;
      this._markMusicDirty();
    });
    bus.on('ship:boostStart', (p) => {
      // Boost activation: a dedicated breathy whoosh, distinct from explosions.
      // Player-only (NPCs spam this).
      if (p && p.shipId === this.state.playerId) this.play('sfx_boost_whoosh', { gain: 0.35 });
    });
    bus.on('ship:boostStop', (p) => {});
    bus.on('ship:dash', (p) => {
      // Dash: layered whoosh+thump (juice recipe), player-only.
      if (p && p.shipId === this.state.playerId) this.play('sfx.shipDash', { gain: 0.7 });
    });
    // Sustained cruise is still the engine-hum 'cruise' tier (65 Hz fifth). Presentation owns
    // finite charge/lock accents so a second continuous oscillator can never leak into the pool.
    bus.on('cruise:snared', () => {
      this._applyPriorityCue({ id: 'cruise.snared', importance: 0.88, playerRelevance: 1 });
      this.play('sfx.cruiseSnared', { gain: 0.75, critical: true });
    });
    // Scanner one-shots are presentation-owned so pulse, return and classification form one family.
    // One-voice comms squelch (never overlaps; queue by gate).
    bus.on('comms:popup', (p) => this._onCommsPopup(p));
    // Live priority duck from presentation importance (Destiny hierarchy).
    bus.on('presentation:cue', (p) => {
      if (p && isPriorityCue(p)) this._applyPriorityCue(p);
    });
    bus.on('toast', (p) => this._onCue((p && (p.kind === 'error' ? 'error' : 'click'))));
    bus.on('alert', (p) => {
      if (!alertCueOwnsAudio(p)) return;
      this._onCue({
        id: 'alert',
        importance: (p && (p.sev === 'danger' || p.sev === 'warn')) ? 0.9 : 0.75,
        duck: !!(p && (p.sev === 'danger' || p.sev === 'warn')),
      });
    });
    bus.on('audio:cue', (p) => this._onCue(p));
    bus.on('bulletTime:start', () => {
      if (massline2Flag('bulletTime')) this._setBulletTimeAudio(true);
    });
    bus.on('bulletTime:end', () => this._setBulletTimeAudio(false));
    bus.on('band:bed', (intent = {}) => {
      rt._bandBedIntent = { ...intent };
      if (rt.bandBed) rt.bandBed.setIntent(rt._paused ? { active: false, reason: 'pause' } : rt._bandBedIntent);
    });
    bus.on('settings:changed', (p) => {
      if (!p || p.section === 'audio' || p.section == null) {
        if (!this._isMuted() && !rt.ctx) {
          this._ensureContext();
          return;
        }
        this._applySettings();
        this._setBulletTimeAudio(!!rt._bulletTimeAudioActive);
      }
    });

    // Pause respect (V2 §17 anti-pattern: "audio playing behind the pause menu"). When the sim
    // freezes (pause menu, save-load swap, main menu), duck music + continuous flight beds, stop
    // alarm scheduling, and skip threat/music recomputation. On resume restore music and re-seed
    // alarms. UI cues still play so menus feel responsive — but AudioContext unlock itself must
    // not emit a free "boop" just because the player clicked New Game.
    bus.on('sim:pause', () => this._onPause(true));
    bus.on('sim:resume', () => this._onPause(false));

    // ---- the mine's voice (PQ-130.08, law §5/§8) ----
    // Every row of the law's §5 table, wired to the sim event that actually fires. All of these
    // are gated on the mine owning the ear (`_mineOwnsEar()`), so nothing leaks into flight.
    bus.on('drill:yield', (p) => this._onMineCue('oreTick', p, {
      rate: mineOreTickRate(p && p.qty, p && p.commodityId),
    }));
    bus.on('drill:spark', (p) => { if (p && p.bite) this._onMineCue('boreBite', p); });
    bus.on('drill:break', (p) => this._onMineCue('rockBreak', p));
    bus.on('drill:gasHit', (p) => this._onMineCue('gasBreach', p));
    bus.on('drill:cargoFull', (p) => this._onMineCue('hopperFull', p));
    bus.on('drill:rockDepleted', (p) => this._onMineCue('rockDepleted', p));
    bus.on('drill:scanPulse', (p) => this._onMineCue('assayPing', p));
    bus.on('drill:warn', (p) => {
      const key = MINE_EVENT_CUE_MAP[`drill:warn/${(p && p.reason) || ''}`];
      if (key) this._onMineCue(key, p);
    });
    bus.on('drill:start', () => { this._resetMineRuntime(); });
    bus.on('drill:end', () => { this._resetMineRuntime(); });
    bus.on('site:machineInstalled', (p) => this._onMineCue('machinePlaced', p));
    bus.on('site:courierLaunched', (p) => this._onMineCue('courierLaunch', p));
    // GAP (documented in the .08 report): no sim owner emits a per-machine status transition.
    // asteroidSites.js keeps `status.state` in a private `_rt` Map and publishes it only through
    // `projection()`. The contract below is wired and tested; the emit belongs to `.10`'s owner.
    bus.on('site:machineStatus', (p) => {
      if (!p || !p.machineId) return;
      const starved = p.state === 'no-power' || p.state === 'no-geology'
        || p.state === 'no-network' || p.state === 'starved';
      const prev = rt._mineMachineState[p.machineId];
      rt._mineMachineState[p.machineId] = starved;
      if (starved && prev !== true) this._onMineCue('machineStarved', p); // once per transition
    });

    // UI namespaced cue events (DOM UI may emit these directly).
    bus.on('ui:click', () => this._onCue('click'));
    bus.on('ui:hover', () => this._onCue('hover'));
    bus.on('ui:confirm', () => this._onCue('confirm'));
    bus.on('ui:deny', () => this._onCue('deny'));

    // Rebuild graph on load (transient runtime is wiped on load).
    bus.on('save:loaded', () => {
      rt._activeCombatEncounters.clear();
      rt._doctrineThreatUntil = -1e9;
      this._applySettings();
      this._markMusicDirty();
    });
    bus.on('game:started', () => { /* context already (or soon) created on gesture */ });

    // If a context already exists (hot reload), wire immediately.
    if (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
      // do not auto-create — wait for gesture; but be ready.
    }
  },

  // Implemented for completeness; the rAF loop is the real per-frame driver since the
  // registry does not call audio.update().
  update(dt, state) { /* no-op: driven by _frame() */ },

  destroy() {
    const rt = this.rt;
    if (!rt) return;
    rt._lifecycleSuspended = true;
    this._stopFrameLoop();
    this._stopMusicSchedulers();
    this._unbindContextState();
    if (typeof window !== 'undefined' && window.removeEventListener && this._gestureHandler) {
      window.removeEventListener('pointerdown', this._gestureHandler);
      window.removeEventListener('keydown', this._gestureHandler);
    }
    this._gestureHandler = null;
    this._teardownMine();
    if (rt.bandBed && typeof rt.bandBed.destroy === 'function') rt.bandBed.destroy();
    rt.bandBed = null;
    if (rt.ctx && rt.ctx.state !== 'closed' && typeof rt.ctx.close === 'function') {
      try {
        const closing = rt.ctx.close();
        if (closing && typeof closing.catch === 'function') closing.catch(() => {});
      } catch (_) {}
    }
  },

  _markMusicDirty() {
    if (this.rt) this.rt._musicDirty = true;
  },

  _markLoopPositionDirty() {
    if (this.rt) this.rt._loopPositionDirty = true;
  },

  _setBulletTimeAudio(active) {
    applyBulletTimeAudioTreatment(this.rt, active, this._isMuted());
  },

  // ---- context lifecycle ----
  suspendForLifecycle(reason = 'lifecycle') {
    const rt = this.rt;
    if (!rt) return;
    rt._lifecycleSuspended = true;
    rt._lifecycleReason = reason;
    rt._lastWallTime = undefined;
    this._stopFrameLoop();
    this._pauseMusicSchedulers();
    this._suspendRunningContext();
  },

  resumeFromLifecycle(reason = 'lifecycle') {
    const rt = this.rt;
    if (!rt) return;
    rt._lifecycleSuspended = false;
    rt._lifecycleReason = reason;
    rt._lastWallTime = undefined;
    if (rt._lifecycleSuspendPromise) {
      rt._lifecycleSuspendPromise.then(() => {
        if (!rt._lifecycleSuspended) this._resumeAudioContext(false);
      });
      return;
    }
    this._resumeAudioContext(false);
  },

  _pauseMusicSchedulers() {
    const stems = this.rt && this.rt.stems;
    if (!stems) return;
    for (const key of ['A', 'B', 'C', 'D']) {
      const stem = stems[key];
      if (stem && typeof stem.pauseScheduler === 'function') stem.pauseScheduler();
    }
  },

  _resumeMusicSchedulers() {
    const stems = this.rt && this.rt.stems;
    if (!stems) return;
    for (const key of ['A', 'B', 'C', 'D']) {
      const stem = stems[key];
      if (stem && typeof stem.resumeScheduler === 'function') stem.resumeScheduler();
    }
  },

  _stopMusicSchedulers() {
    const rt = this.rt;
    const stems = rt && rt.stems;
    if (!stems) return;
    for (const key of ['A', 'B', 'C', 'D']) {
      const stem = stems[key];
      if (stem && typeof stem.stop === 'function') stem.stop();
      stems[key] = null;
    }
  },

  _bindContextState(ctx) {
    const rt = this.rt;
    if (!rt || !ctx || typeof ctx.addEventListener !== 'function') return;
    this._unbindContextState();
    const onStateChange = () => {
      if (!this.rt || this.rt.ctx !== ctx) return;
      if (ctx.state === 'running') {
        rt._contextEverRan = true;
        if (rt._lifecycleSuspended) {
          rt._resumeAfterLifecycle = true;
          this._stopFrameLoop();
          this._pauseMusicSchedulers();
          this._suspendRunningContext();
          return;
        }
        // Promise fulfillment owns the first post-resume transfer. A statechange can arrive before
        // device acquisition has actually settled, especially on interrupted mobile contexts.
        if (rt._resumePromise) return;
        rt._resumeAfterLifecycle = false;
        rt._lastWallTime = undefined;
        this._resumeMusicSchedulers();
        this._startFrameLoop();
        return;
      }
      this._stopFrameLoop();
      this._pauseMusicSchedulers();
    };
    rt._contextStateChangeHandler = onStateChange;
    ctx.addEventListener('statechange', onStateChange);
    if (ctx.state === 'running') rt._contextEverRan = true;
  },

  _unbindContextState() {
    const rt = this.rt;
    const ctx = rt && rt.ctx;
    const handler = rt && rt._contextStateChangeHandler;
    if (ctx && handler && typeof ctx.removeEventListener === 'function') {
      try { ctx.removeEventListener('statechange', handler); } catch (_) {}
    }
    if (rt) rt._contextStateChangeHandler = null;
  },

  _suspendRunningContext() {
    const rt = this.rt, ctx = rt && rt.ctx;
    if (!ctx || ctx.state === 'closed') return;
    if (ctx.state === 'running') rt._contextEverRan = true;
    if (rt._contextEverRan) rt._resumeAfterLifecycle = true;
    if (ctx.state !== 'running' || typeof ctx.suspend !== 'function') return;
    if (rt._lifecycleSuspendPromise) return;
    let result;
    try { result = ctx.suspend(); } catch (_) { return; }
    const pending = Promise.resolve(result)
      .catch(() => {})
      .then(() => {
        if (!rt._lifecycleSuspended && rt._resumeAfterLifecycle) {
          this._resumeAudioContext(false);
        }
      })
      .finally(() => {
        if (rt._lifecycleSuspendPromise === pending) rt._lifecycleSuspendPromise = null;
      });
    rt._lifecycleSuspendPromise = pending;
  },

  _resumeAudioContext(allowAutoplayResume) {
    const rt = this.rt, ctx = rt && rt.ctx;
    if (!ctx || rt._lifecycleSuspended || ctx.state === 'closed') return null;
    if (rt._resumePromise) return rt._resumePromise;
    if (ctx.state === 'running') {
      rt._contextEverRan = true;
      rt._resumeAfterLifecycle = false;
      rt._lastWallTime = undefined;
      this._resumeMusicSchedulers();
      this._startFrameLoop();
      return null;
    }
    const resumable = ctx.state === 'suspended' || ctx.state === 'interrupted';
    if (!resumable || (!allowAutoplayResume && !rt._resumeAfterLifecycle)
      || typeof ctx.resume !== 'function') return null;

    // Install a guard before invoking resume(): some implementations expose `running` or dispatch
    // statechange synchronously while device acquisition is still pending.
    const placeholder = Promise.resolve();
    rt._resumePromise = placeholder;
    let result;
    try {
      result = ctx.resume();
    } catch (_) {
      if (rt._resumePromise === placeholder) rt._resumePromise = null;
      return null;
    }
    const pending = Promise.resolve(result)
      .then(() => {
        if (rt._lifecycleSuspended) {
          this._suspendRunningContext();
          return;
        }
        if (ctx.state === 'running') {
          rt._contextEverRan = true;
          rt._resumeAfterLifecycle = false;
          rt._lastWallTime = undefined;
          this._resumeMusicSchedulers();
          this._startFrameLoop();
        }
      }, () => {
        // Preserve lifecycle-owned resume intent. A later gesture or context statechange can retry
        // without mistaking a failed device acquisition for a completed resume.
      })
      .finally(() => {
        if (rt._resumePromise === pending) rt._resumePromise = null;
      });
    rt._resumePromise = pending;
    return pending;
  },

  _ensureContext() {
    const rt = this.rt;
    if (!rt || rt._lifecycleSuspended || this._isMuted()) return null;
    if (rt.ctx) {
      if (!rt._contextStateChangeHandler) this._bindContextState(rt.ctx);
      this._resumeAudioContext(true);
      return rt.ctx;
    }
    const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    let ctx;
    try { ctx = new AC(); } catch (_) { return null; }
    rt.ctx = ctx;

    // master -> limiter -> destination
    // Start the graph silent: createGain() defaults to 1.0, and the first gesture often lands on
    // the main menu. Ramping down from full volume after oscillators start is the classic "boop".
    const master = ctx.createGain();
    master.gain.value = 0.0001;
    const limiter = ctx.createDynamicsCompressor();
    try {
      limiter.threshold.value = -6; limiter.knee.value = 6; limiter.ratio.value = 12;
      limiter.attack.value = 0.003; limiter.release.value = 0.25;
    } catch (_) {}
    const sfxBus = ctx.createGain();
    const musicBus = ctx.createGain();
    musicBus.gain.value = 0.0001;
    const engineBus = ctx.createGain();
    const ambientBus = ctx.createGain();
    const combatBus = ctx.createGain();
    const uiBus = ctx.createGain();
    const commsBus = ctx.createGain();
    // Slow-time treatment lives on pooled filters for physical buses only. UI/comms remain crisp.
    const engineSlowFilter = ctx.createBiquadFilter();
    const ambientSlowFilter = ctx.createBiquadFilter();
    const combatSlowFilter = ctx.createBiquadFilter();
    for (const filter of [engineSlowFilter, ambientSlowFilter, combatSlowFilter]) {
      filter.type = 'lowpass';
      filter.frequency.value = BULLET_TIME_AUDIO.openHz;
      filter.Q.value = 0.55;
      filter.connect(sfxBus);
    }
    engineBus.connect(engineSlowFilter);
    ambientBus.connect(ambientSlowFilter);
    combatBus.connect(combatSlowFilter);
    uiBus.connect(sfxBus);
    commsBus.connect(sfxBus);
    sfxBus.connect(master);
    musicBus.connect(master);
    master.connect(limiter);
    limiter.connect(ctx.destination);
    rt.masterGain = master; rt.limiter = limiter; rt.sfxBus = sfxBus; rt.musicBus = musicBus;
    rt.engineBus = engineBus; rt.ambientBus = ambientBus; rt.combatBus = combatBus;
    rt.uiBus = uiBus; rt.commsBus = commsBus;
    // The mine hangs off the AMBIENT bus on purpose: ambient is the one bus the pause path never
    // touches (see `_onPause` / `_silenceContinuousSources`), it already carries the sfx+ambient
    // sliders and the sidechain, and `getBusForRecipe` already routes every mining recipe there.
    // One `mineBus` fader lets the whole soundscape fade in on enter and out on retract (§9).
    const mineBus = ctx.createGain();
    mineBus.gain.value = 0.0001;
    const mineBedGain = ctx.createGain();
    const mineGrindGain = ctx.createGain();
    const mineCueGain = ctx.createGain();
    mineBedGain.gain.value = 0.0001;
    mineGrindGain.gain.value = 0.0001;
    mineCueGain.gain.value = 1;
    mineBedGain.connect(mineBus);
    mineGrindGain.connect(mineBus);
    mineCueGain.connect(mineBus);
    mineBus.connect(ambientBus);
    rt._mineBus = mineBus; rt._mineBedGain = mineBedGain;
    rt._mineGrindGain = mineGrindGain; rt._mineCueGain = mineCueGain;
    rt._mineBed = null; rt._mineGrind = null; rt._mineVoices = [];
    // Fresh graph: every cached "already written" target belongs to nodes that no longer exist.
    rt._busGainCache = null;
    rt._bedTargetCache = null;
    rt._bulletTimeFilters = [engineSlowFilter, ambientSlowFilter, combatSlowFilter];
    if (rt.bandBed) rt.bandBed.destroy();
    rt.bandBed = createBandBedRuntime(ctx, ambientBus);
    rt.bandBed.setIntent(rt._paused ? { active: false, reason: 'pause' } : rt._bandBedIntent);

    getNoiseBuffer(ctx, rt._caches); // pre-build the shared noise buffer

    this._applySettings();
    this._setBulletTimeAudio(!!rt._bulletTimeAudioActive);

    // Continuous flight layers belong in flight. Starting them on the first menu click hard-starts
    // oscillators into a live graph and produces a one-shot "boop" with no gameplay reason.
    // Build the music graph so pause/resume can own it, but re-apply pause silence afterward —
    // sim:pause may have fired before AudioContext existed (main menu at boot).
    if (!rt._paused) this._ensureContinuousSources();
    this._buildMusic();
    this._bindContextState(ctx);
    if (ctx.state !== 'running') this._pauseMusicSchedulers();
    if (rt._paused) this._onPause(true);
    this._resumeAudioContext(true);
    return ctx;
  },

  /** Start continuous engine / brake / tether graphs once AudioContext is live. */
  _ensureContinuousSources() {
    this._ensureEngineHum();
    this._ensureBrakeHiss();
    this._ensureTetherHum();
  },

  _wallClockMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  },

  _motionReduced() {
    const s = this.state && this.state.settings;
    return !!(s && s.video && s.video.motionReduce);
  },

  /**
   * Apply cue-priority duck envelope to weaponLoop / engineLoop targets.
   * Critical speech / objective / warning also opens a short squelch window so UI & weapon
   * one-shots do not stack over the important cue (Destiny mix hierarchy).
   */
  _applyPriorityCue(cue) {
    const rt = this.rt;
    if (!rt || !rt._priorityBus) return null;
    const nowMs = this._wallClockMs();
    const envelope = rt._priorityBus.applyCue(cue, nowMs);
    if (!envelope) return null;
    rt._criticalSquelchUntilMs = Math.max(rt._criticalSquelchUntilMs || 0, envelope.endMs);
    return envelope;
  },

  _isCriticalSquelchActive() {
    const rt = this.rt;
    if (!rt) return false;
    return this._wallClockMs() < (rt._criticalSquelchUntilMs || 0);
  },

  /** True when a recipe/id should cut through the squelch window (speech/objective/critical). */
  _isPriorityVoice(recipeId, opts) {
    if (opts && (opts.critical || opts.priorityCue)) return true;
    const id = String(recipeId || '');
    if (id.includes('squelch') || id.includes('alert') || id.includes('mission') || id.includes('lock_acquired')) return true;
    if (id.includes('shieldBreak') || id.includes('cruiseSnared') || id.includes('player_death')) return true;
    if (id.startsWith('presentation.') || id.includes('objective') || id.includes('comms')) return true;
    const cat = (AUDIO_RECIPE_BY_ID[recipeId] && AUDIO_RECIPE_BY_ID[recipeId].category) || '';
    return cat === 'comms';
  },

  // Pause/resume handler. Ducks music + continuous flight beds so the pause/main menu is quiet;
  // SFX one-shots and UI cues keep working (menus need feedback). Idempotent.
  _onPause(paused) {
    const rt = this.rt;
    rt._paused = !!paused;
    if (rt.bandBed) {
      rt.bandBed.setIntent(paused ? { active: false, reason: 'pause' } : rt._bandBedIntent);
    }
    // Screen `drill` reaches here as an ordinary pausing screen. Nothing below changes for it —
    // the music bus SHOULD go to zero inside the rock (law §8) — but the mine's own bed lives on
    // `ambientBus`, which neither branch touches, so it plays straight through the pause.
    const mine = this._refreshMineIntent();
    const ctx = rt.ctx;
    if (!ctx) return;
    if (paused) {
      // Instant silence on pause/menu — no audible ramp-out blip when the first gesture unlocks audio.
      try {
        const t = ctx.currentTime;
        if (rt.musicBus) {
          invalidateBusGainCache(rt, 'music');
          rt.musicBus.gain.cancelScheduledValues(t);
          rt.musicBus.gain.setValueAtTime(0, t);
        }
      } catch (_) {}
      this._silenceContinuousSources();
    } else {
      // restore to the configured music base — unless the mine still owns the ear, in which case
      // the score stays out of the rock (law §8) and `_applySettings` keeps the bus at zero.
      try {
        const t = ctx.currentTime;
        invalidateBusGainCache(rt, 'music');
        rt.musicBus.gain.cancelScheduledValues(t);
        rt.musicBus.gain.setValueAtTime(Math.max(0.0001, rt.musicBus.gain.value), t);
        rt.musicBus.gain.linearRampToValueAtTime(
          mine.musicSilenced ? 0.0001 : Math.max(0.0001, (rt._musicBase || 0.5) * (rt._bulletTimeMusicMult || 1)),
          t + 0.4);
      } catch (_) {}
      // Flight beds may not exist yet if the first unlock was on the main menu.
      this._ensureContinuousSources();
      // re-seed alarm timers so they don't dump a backlog burst on resume
      rt._alarmNext.lowShield = ctx.currentTime;
      rt._alarmNext.lowHull = ctx.currentTime;
      this._markMusicDirty();
      this._markLoopPositionDirty();
    }
  },

  /** Hard-silence continuous flight beds (engine/brake/tether). Used on pause and graph boot. */
  _silenceContinuousSources() {
    const rt = this.rt, ctx = rt && rt.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const silence = (gainNode) => {
      if (!gainNode || !gainNode.gain) return;
      try {
        gainNode.gain.cancelScheduledValues(t);
        gainNode.gain.setValueAtTime(0.0001, t);
      } catch (_) { try { gainNode.gain.value = 0.0001; } catch (__) {} }
    };
    silence(rt.engineHumGain);
    silence(rt.engineNoiseGain);
    silence(rt.engineSubGain);
    silence(rt.brakeGain);
    silence(rt.tetherHum);
    silence(rt.tetherOverloadGain);
    // These params were just hard-written behind the bed updaters' backs. Drop their cached
    // targets so resume re-asserts the live value even when it happens to equal the cached one
    // (e.g. still braking across a pause, where a skip would leave the hiss silenced forever).
    rt._bedTargetCache = null;
  },

  _isMuted() {
    // Playwright exposes this standard browser signal even in older probes that bypass the shared
    // launcher wrapper. Automation never owns the host audio device, regardless of saved settings.
    if (typeof window !== 'undefined'
      && window.navigator
      && window.navigator.webdriver === true) return true;
    const a = this.state && this.state.settings && this.state.settings.audio;
    return !a || a.muted !== false;
  },

  _applySettings() {
    const rt = this.rt; if (!rt.ctx) return;
    const a = (this.state.settings && this.state.settings.audio) || {};
    const muted = this._isMuted();
    const t = rt.ctx.currentTime;
    const cache = rt._busGainCache || (rt._busGainCache = Object.create(null));
    // Unlike setTargetAtTime, the 50 ms linear glide below is NOT memoryless: it re-reads
    // `param.value` and re-anchors, so skipping it mid-glide would change the trajectory. The gate
    // therefore only stands down once the glide window opened by the last genuine change has
    // elapsed — at that point the param is sitting on `safe`, and cancel + setValueAtTime(safe) +
    // linearRamp(safe -> safe) is provably a no-op on the audible signal. Inside the window every
    // frame still re-applies, so the transient shape is bit-for-bit what it was before.
    // The cache key is (param identity, target, snap) — `snap` matters on its own because muting
    // leaves engine/ambient/combat/ui/comms targets untouched and only flips the ramp to a snap.
    const ramp = (key, param, target, instant) => {
      const safe = target <= 0 ? 0 : Math.max(0.0001, target);
      // Mute / silence targets snap immediately so unlock + mute never leak a 50ms ramp blip.
      const snap = !!(instant || muted || safe <= 0.0001);
      const prev = cache[key];
      const unchanged = !!prev && prev.param === param && prev.target === safe && prev.snap === snap;
      if (unchanged && t >= prev.settleAt) return;
      try {
        param.cancelScheduledValues(t);
        if (snap) {
          param.setValueAtTime(safe, t);
        } else {
          param.setValueAtTime(Math.max(0.0001, param.value), t);
          param.linearRampToValueAtTime(safe, t + 0.05);
        }
      } catch (_) { try { param.value = safe; } catch (__) {} }
      // Anchor the settle deadline to the frame the target changed, never to the re-applications
      // inside the window, or the window would be pushed forward forever and never close.
      if (!unchanged) cache[key] = { param, target: safe, snap, settleAt: snap ? t : t + 0.05 };
    };

    const masterVal = a.master == null ? 0.55 : a.master;
    const masterTarget = muted ? 0 : linearGain(masterVal) * 0.501187;
    ramp('master', rt.masterGain.gain, masterTarget, true);

    const sfxVal = a.sfx == null ? 0.7 : a.sfx;

    const engineVal = a.engine == null ? 0.7 : a.engine;
    const engineTarget = linearGain(sfxVal) * linearGain(engineVal) * 0.12589;
    ramp('engine', rt.engineBus.gain, engineTarget);

    const sidechain = rt.sidechainDuck || 1.0;
    const ambientVal = a.ambient == null ? 0.7 : a.ambient;
    const ambientTarget = linearGain(sfxVal) * linearGain(ambientVal) * 0.06309 * sidechain;
    ramp('ambient', rt.ambientBus.gain, ambientTarget);

    const combatVal = a.combat == null ? 0.7 : a.combat;
    const combatTarget = linearGain(sfxVal) * linearGain(combatVal) * 0.25119;
    ramp('combat', rt.combatBus.gain, combatTarget);

    const uiVal = a.ui == null ? 0.7 : a.ui;
    const uiTarget = linearGain(sfxVal) * linearGain(uiVal) * 0.1;
    ramp('ui', rt.uiBus.gain, uiTarget);

    const commsVal = a.comms == null ? 0.7 : a.comms;
    const commsTarget = linearGain(sfxVal) * linearGain(commsVal) * 0.15849;
    ramp('comms', rt.commsBus.gain, commsTarget);

    const musicVal = a.music == null ? 0.32 : a.music;
    rt._musicBase = linearGain(musicVal) * 0.05012 * sidechain;
    // Pause/main-menu must keep music bus silent even though _frame re-applies settings every tick.
    // The mine adds one clause on top of that legacy rule (law §8: the flight score does not
    // continue inside the rock) — `resolveMineAudioIntent` owns both so they cannot drift.
    const mine = this._refreshMineIntent();
    const musicSilenced = mine.musicSilenced;
    const musicTarget = musicSilenced ? 0 : rt._musicBase * (rt._bulletTimeMusicMult || 1);
    ramp('music', rt.musicBus.gain, musicTarget, musicSilenced);
    // The mine bus is NOT ramped here: its envelope is the law's enter/retract fade (§9, ≤600 ms
    // in), owned by `_updateMine`. It still inherits master + sfx/ambient sliders through
    // `ambientBus`, so a muted or slider-zeroed game silences it exactly like everything else.
  },

  // ---- one-shot SFX API ----
  play(recipeId, opts) {
    const rt = this.rt;
    const ctx = rt.ctx;
    if (rt._lifecycleSuspended || !ctx || ctx.state !== 'running') return null;
    if (this._isMuted()) return null; // mute is hard silence — no unlock-ramp leak
    const recipe = AUDIO_RECIPE_BY_ID[recipeId];
    if (!recipe) return null;
    opts = opts || {};

    const busName = getBusForRecipe(recipe, recipeId);
    if (opts.entity && busName !== 'ui' && busName !== 'combat'
      && entityNeedsExactAudio(opts.entity, { playerId: this.state && this.state.playerId }) !== true) {
      return null;
    }
    // Strict hierarchy: while speech / objective / critical warning owns the ear,
    // do not stack weapon fire or routine UI noise on top of it.
    if (this._isCriticalSquelchActive() && !this._isPriorityVoice(recipeId, opts)) {
      if (busName === 'ui' || busName === 'combat') return null;
    }

    let att = 1, pan = 0, rate = opts.rate || 1;
    if (opts.position) {
      if (!Number.isFinite(opts.position.x) || !Number.isFinite(opts.position.z)) return null;
      const p = this._playerPos();
      const d = Math.hypot(opts.position.x - p.x, opts.position.z - p.z);
      if (d > D_FAR) return null; // cull distant sounds
      att = clamp(1 - (d - D_NEAR) / (D_FAR - D_NEAR), 0, 1); att *= att;
      pan = clamp((opts.position.x - p.x) / PAN_SPAN, -1, 1);
    }
    // Player damage supplies ship-local panning. Explicit pan intentionally overrides the
    // world-X positional fallback; all other positional sounds keep the established behavior.
    if (Number.isFinite(opts.pan)) pan = clamp(opts.pan, -1, 1);
    let callGain = (opts.gain == null ? 1 : opts.gain);
    if (this._motionReduced() && (busName === 'ambient' || recipeId.includes('traffic') || recipeId.includes('machinery'))) {
      callGain *= 0.35;
    }
    const recipeAmp = (recipe.gainEnvelope && recipe.gainEnvelope.peak) || this._ampFor(recipe);
    const peak = Math.min(1, recipeAmp * callGain * att);
    if (peak < 0.0008) return null;

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
    voice.loop = !!recipe.loop || (recipe.type && String(recipe.type).startsWith('continuous'));
    voice.role = busName === 'engine' ? 'engineLoop' : (recipe.category === 'weapon' && voice.loop ? 'weaponLoop' : busName);
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
    const st = this.state;
    const entities = st && st.entities;
    const e = entities && typeof entities.get === 'function' && st.playerId != null
      ? entities.get(st.playerId)
      : null;
    const pos = e && e.pos;
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)) return pos;
    return SILENT_LISTENER_POS;
  },

  // ---- event handlers ----
  _onFire(p) {
    if (!p) return;
    const signature = resolveWeaponAudioSignature(p, this.state);
    const owner = p.ownerId != null && this.state.entities && typeof this.state.entities.get === 'function'
      ? this.state.entities.get(p.ownerId)
      : null;
    if (signature.recipeId === 'sfx_wpn_beam_laser') {
      // sustained beam: start a loop keyed by owner; stopped on combat:beamStop
      this._startBeam(p.ownerId, p.origin, owner);
      return;
    }
    this.play(signature.recipeId, {
      position: p.origin,
      gain: signature.gain,
      rate: signature.rate,
      detune: signature.detune,
      entity: owner,
    });
  },

  _startBeam(ownerId, pos, owner = null) {
    const rt = this.rt;
    if (ownerId == null) return;
    rt._wantBeam[ownerId] = true;
    const ctx = rt.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (rt.loops['beam_' + ownerId]) return;
    const entity = owner || (this.state.entities && typeof this.state.entities.get === 'function'
      ? this.state.entities.get(ownerId) : null);
    const position = pos || (entity && entity.pos) || null;
    const v = this._startLoopVoice('sfx_wpn_beam_laser', position, 0.85, { entity });
    if (v) {
      v.trackId = ownerId;
      v.role = 'weaponLoop';
      v.loop = true;
      v.busName = 'combat';
      v._baseGain = v.callGain != null ? v.callGain : 0.85;
      rt.loops['beam_' + ownerId] = v;
      this._markLoopPositionDirty();
    }
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
    const entity = p.attackerId != null && this.state.entities && typeof this.state.entities.get === 'function'
      ? this.state.entities.get(p.attackerId) : null;
    this.play('sfx_mining_impact', { position: p.pos, gain: 0.5, rate: 1.4, entity });
  },

  _onDamage(p) {
    if (!p) return;
    const rt = this.rt, ctx = rt.ctx;
    if (p.isPlayer) { rt._lastDamageT = this.state.simTime; this._markMusicDirty(); }

    const onShield = !!p.shieldAbsorbed || Number(p.shieldDamage) > 0 || p.dominantLayer === 'shield';
    const playerSignature = p.isPlayer ? resolvePlayerDamageAudioSignature(p, this.state) : null;
    const hitPosition = playerSignature && playerSignature.position || p.pos || p.hitPoint;
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
      this.play('sfx.shieldHit', { position: hitPosition, gain: 0.7, rate });
    } else {
      // combat:damage names this field dominantLayer (not kind). Preserve legacy kind payloads,
      // but route real armor damage to its hard metallic receipt instead of the hull thump.
      if (p.dominantLayer === 'armor' || Number(p.armorDamage) > 0 || p.kind === 'armor') {
        this.play('sfx.armorHit', { position: hitPosition, gain: 0.8 });
      } else {
        this.play('sfx.hullHit', { position: hitPosition, gain: 0.9 });
      }
    }

    if (playerSignature) {
      this.play('sfx.playerDamage', {
        gain: playerSignature.gain,
        rate: playerSignature.rate,
        detune: playerSignature.detune,
        pan: playerSignature.pan,
      });
    }
  },

  _onDoctrineTelegraphAudio(p) {
    if (!p || !DOCTRINE_AUDIO_SIGNATURES[p.doctrineId]) return;
    if (p.targetId != null && p.targetId !== this.state.playerId) return;
    const now = Number(this.state.simTime) || 0;
    this.rt._doctrineThreatUntil = Math.max(this.rt._doctrineThreatUntil || -1e9, now + 6);
    this._markMusicDirty();
    // Presentation owns the audible setup/phase family. This raw seam only keeps adaptive music
    // pressure truthful; playing here would stack a second doctrine voice under the semantic cue.
  },

  _onEncounterTelegraphAudio(p) {
    if (!p || !p.encounterId || p.deck !== 'combat') return;
    this.rt._activeCombatEncounters.add(p.encounterId);
    this._markMusicDirty();
    // A single restrained escalation cue marks an authored encounter. Routine nearby contacts do
    // not trigger it, which keeps safe stations calm and makes intentional danger legible.
    this.play('sfx_encounter_escalation', { position: p.pos, gain: 0.5 });
  },

  _onEncounterResolvedAudio(p) {
    if (!p || !p.encounterId) return;
    this.rt._activeCombatEncounters.delete(p.encounterId);
    this._markMusicDirty();
  },

  _onDiscoveryUnlocked(p) {
    if (!p || !p.sectorId || !p.poiId) return;
    this._duckMusic(1.1);
    this.play('sfx_discovery_reveal', { gain: 0.72, critical: true });
  },

  _onCollision(p) {
    if (!p) return;
    const entities = this.state && this.state.entities;
    const pick = (id) => {
      if (!entities) return null;
      const e = typeof entities.get === 'function' ? entities.get(id) : entities[id];
      return e || null;
    };
    const a = pick(p.aId);
    const b = pick(p.bId);
    const cue = resolveCollisionCue({
      dp: p.dp,
      impulse: p.impulse,
      massA: a && Number.isFinite(a.mass) ? a.mass : null,
      massB: b && Number.isFinite(b.mass) ? b.mass : null,
      typeA: a ? a.type : undefined,
      typeB: b ? b.type : undefined,
    });
    this.play(cue.recipeId, { position: p.pos, gain: cue.gain, rate: cue.rate });
  },

  _onKilled(p) {
    if (!p) return;
    const rt = this.rt, ctx = rt.ctx;
    // player:death owns the player's defeat sound. entity:killed is also emitted for NPC-vs-NPC
    // combat, which should remain physically audible but must never masquerade as player reward.
    if (p.id === this.state.playerId) return;
    const killedByPlayer = p.killerId === this.state.playerId;
    const signature = FIRST_HOUR_AUDIO_SIGNATURES.enemyKill;
    if (killedByPlayer) {
      this._applyPriorityCue({
        id: 'combat.player.kill',
        audioId: signature.recipeId,
        importance: signature.priority,
        playerRelevance: 1,
      });
    }
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
      this.play('sfx_ui_hover', { position: pos1, startTime: ctx.currentTime + 0.05, gain: 0.9, rate: 0.5, critical: killedByPlayer });
      this.play('sfx_ui_hover', { position: pos2, startTime: ctx.currentTime + 0.20, gain: 0.9, rate: 0.5, critical: killedByPlayer });
      // Play the main capital explosion in 400ms
      this.play('sfx.killCapital', { position: p.pos, startTime: ctx.currentTime + 0.40, gain: 1.0, critical: killedByPlayer });
      if (killedByPlayer) {
        this.play('sfx_kill_confirm', {
          position: p.pos, startTime: ctx.currentTime + 0.42, gain: 0.72, critical: true,
        });
      }
    } else {
      this.play(killedByPlayer ? signature.recipeId : 'sfx.killSmall', {
        position: p.pos,
        gain: killedByPlayer ? 0.9 : 0.72,
        // The presentation priority receipt arrives before this raw physical handler. Marking the
        // reward voice critical prevents the cue's own squelch window from suppressing it.
        critical: killedByPlayer,
      });
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

  _onPickupCollected(p) {
    if (successfulPickupAmount(p) <= 0) return;
    this.play('sfx_mining_impact', { position: p && p.pos, gain: 0.8 });
  },

  // Cargo jettison (HUD cargo panel → cargo.dumpCargo): an audible world act that was total
  // silence. Reuses the authored massline jettison kick; jettisonImpulse's own massline.jettisonKick
  // cue is flag-gated OFF on the default route, so the two cannot double. The receipt carries no
  // position — a dump always happens at the dumping ship's hull, and non-positional play() already
  // reads as ship-local.
  _onCargoJettisoned(p) {
    if (!p || !(p.amount > 0)) return;
    this.play('sfx_massline_jettison', { gain: 0.7 });
  },

  // The rock calving's two audible beats, keyed off the chain's own receipts. One family: groan
  // (the seam flexing before the split) and calve (the split). The chain announces phase 0 through
  // the event_start receipt and later phases through phase transitions, so both kinds map here.
  // Everything else the chain emits stays on the lamp/text channels.
  _onCeresCausalChain(p) {
    if (!p || p.schema !== 'spaceface.ceresCausalChain.v1') return;
    if (p.kind !== 'event_start' && p.kind !== 'phase') return;
    if (p.eventId !== 'ev_rock_calving') return;
    const recipeId = p.phase === 'groan' ? 'sfx_ambient_rock_groan'
      : p.phase === 'calve' ? 'sfx_ambient_rock_calve'
        : null;
    if (!recipeId) return;
    const position = this._ceresCausalActorPosition(p.actorSlotIds);
    if (!position) return;
    this.play(recipeId, { position, gain: p.phase === 'calve' ? 1 : 0.8 });
  },

  _ceresCausalActorPosition(actorSlotIds) {
    const slotId = Array.isArray(actorSlotIds) ? actorSlotIds[0] : null;
    if (typeof slotId !== 'string' || !slotId) return null;
    const entityList = this.state && this.state.entityList;
    if (Array.isArray(entityList)) {
      for (let i = 0; i < entityList.length; i++) {
        const candidate = entityList[i];
        if (candidate && candidate.alive !== false && candidate.data
          && candidate.data.activityActorSlotId === slotId && candidate.pos) {
          return { x: candidate.pos.x, z: candidate.pos.z };
        }
      }
    }
    return null;
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

  // =========================================================================
  // The mine's voice — runtime (PQ-130.08, law §5/§8/§9/§11.9)
  // =========================================================================

  /** Recompute + cache the pause/bed decision. One call site for the whole rule. */
  _refreshMineIntent() {
    const rt = this.rt;
    const ui = this.state && this.state.ui;
    const scratch = rt && (rt._mineIntentInput || (rt._mineIntentInput = {}));
    const input = scratch || {};
    input.screenStack = ui && ui.screenStack;
    input.paused = !!(rt && rt._paused);
    input.muted = this._isMuted();
    const intent = resolveMineAudioIntent(input, rt ? rt._mineIntent : undefined);
    if (rt) { rt._mineIntent = intent; rt._wantMineBed = intent.bedActive; }
    return intent;
  },

  /** True while screen `drill` owns the soundscape (front or behind a menu). */
  _mineOwnsEar() {
    const rt = this.rt;
    if (!rt) return false;
    return this._refreshMineIntent().mineActive;
  },

  _resetMineRuntime() {
    const rt = this.rt;
    if (!rt) return;
    if (rt._mineArbiter) rt._mineArbiter.reset();
    rt._mineHeatCritical = false;
    rt._mineMachineState = Object.create(null);
  },

  /**
   * Per-frame driver. Runs OUTSIDE the paused gate in `_frame` because the mine screen pauses the
   * world sim and its soundscape is precisely what must survive that pause.
   */
  _updateMine(dt, now) {
    const rt = this.rt;
    if (!rt) return;
    const intent = this._refreshMineIntent();
    const ctx = rt.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = now == null ? ctx.currentTime : now;

    if (!intent.bedActive) {
      if (rt._mineBed || rt._mineGrind) this._stopMine(t);
      this._gcMineVoices(t);
      return;
    }

    this._ensureMineBed(t);
    this._ensureMineGrind();

    const duck = rt._mineArbiter ? rt._mineArbiter.ambienceDuck(this._wallClockMs()) : { bed: 1, grind: 1 };

    // --- mine bus envelope: the enter fade (<= 600 ms) and the live duck ---
    const busTarget = MINE_BUS_PEAK * intent.bedDuck;
    const bed = rt._mineBed;
    if (bed && !bed.faded) {
      bed.faded = true;
      try {
        rt._mineBus.gain.cancelScheduledValues(t);
        rt._mineBus.gain.setValueAtTime(0.0001, t);
        rt._mineBus.gain.linearRampToValueAtTime(Math.max(0.0001, busTarget), t + MINE_BED_FADE_IN_S);
        rt._mineBus.gain._mineLast = Math.max(0.0001, busTarget);
      } catch (_) {}
    } else if (rt._mineBus) {
      this._mineParam(rt._mineBus.gain, Math.max(0.0001, busTarget), t, 0.12);
    }
    if (rt._mineBedGain) {
      this._mineParam(rt._mineBedGain.gain, Math.max(0.0001, MINE_BED_PEAK * duck.bed), t, 0.09);
    }

    // --- distant settling creaks ---
    if (bed && t >= bed.creakAt) {
      this._mineCreak(t);
      bed.creakAt = t + 5.5 + this._mineRand() * 8.5;
    }

    // --- three-layer grind, crossfaded by the target cell's material ---
    const d = this.state && this.state.drill;
    const avatar = d && d.avatar;
    const target = avatar && avatar.drillTarget;
    const tile = target && d.field && d.field[target.col] && d.field[target.col][target.row];
    const gopts = rt._mineGrindOpts || (rt._mineGrindOpts = {});
    gopts.boring = !!(d && d.active && avatar && avatar.isDrilling && !avatar.drillBlocked);
    gopts.bore = tile && tile.maxHp > 0 ? 1 - (Number(tile.hp) || 0) / tile.maxHp : 0;
    gopts.heat = clamp((Number(d && d.drillTemp) || 0) / 100, 0, 1);
    gopts.energy = clamp((Number(d && d.drillEnergy) || 0) / 100, 0, 1);
    const mix = mineGrindLayers(tile, gopts, rt._mineGrindMix);
    rt._mineGrindMix = mix;
    this._applyMineGrind(mix, duck.grind, t);

    // --- derived heat edges: the whine on the way up, the relief hiss on the vent ---
    this._updateMineHeat(d);
    this._gcMineVoices(t);
  },

  /**
   * Write a mine AudioParam only when its target actually moved. `setTargetAtTime` is memoryless —
   * it is an exponential approach to a target, not a re-anchored ramp — so skipping an identical
   * re-issue is provably a no-op on the audible signal (unlike the linear glide in `_applySettings`,
   * which has to re-apply inside its window). Without this the bed + grind would insert nine
   * automation events per frame for the whole time the player is in the rock.
   */
  _mineParam(param, target, t, tc) {
    if (!param) return;
    const last = param._mineLast;
    if (last !== undefined && Math.abs(last - target) < 1e-4) return;
    param._mineLast = target;
    try { param.setTargetAtTime(target, t, tc); } catch (_) {}
  },

  /** Deterministic-enough presentation RNG (LCG). Never touches sim state. */
  _mineRand() {
    const rt = this.rt;
    const bed = rt && rt._mineBed;
    if (!bed) return 0.5;
    bed.rngState = (bed.rngState * 1664525 + 1013904223) >>> 0;
    return bed.rngState / 4294967296;
  },

  _ensureMineBed(t) {
    const rt = this.rt, ctx = rt.ctx;
    if (rt._mineBed || !ctx || !rt._mineBedGain) return;
    // Low interior room tone: two detuned sub voices through a heavy lowpass, plus a slow band of
    // moving air. Muffled and close — you are inside a rock, not in a hangar.
    const roomA = ctx.createOscillator();
    roomA.type = 'triangle';
    roomA.frequency.value = 41;
    const roomB = ctx.createOscillator();
    roomB.type = 'sine';
    roomB.frequency.value = 61.5;
    const roomLp = ctx.createBiquadFilter();
    roomLp.type = 'lowpass';
    roomLp.frequency.value = 168;
    roomLp.Q.value = 0.8;
    const roomGain = ctx.createGain();
    roomGain.gain.value = 0.5;
    roomA.connect(roomLp); roomB.connect(roomLp);
    roomLp.connect(roomGain); roomGain.connect(rt._mineBedGain);

    const airSrc = ctx.createBufferSource();
    airSrc.buffer = getNoiseBuffer(ctx, rt._caches);
    airSrc.loop = true;
    airSrc.playbackRate.value = 0.62;
    const airLp = ctx.createBiquadFilter();
    airLp.type = 'lowpass';
    airLp.frequency.value = 296;
    airLp.Q.value = 0.4;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.20;
    airSrc.connect(airLp); airLp.connect(airGain); airGain.connect(rt._mineBedGain);

    try { roomA.start(t); roomB.start(t); airSrc.start(t); } catch (_) {}
    let seed = 0x9e3779b9;
    const rockId = String((this.state && this.state.drill && this.state.drill.asteroidId) || 'rock');
    for (let i = 0; i < rockId.length; i++) seed = ((seed * 31) + rockId.charCodeAt(i)) >>> 0;
    rt._mineBed = {
      nodes: [roomA, roomB, airSrc, roomLp, roomGain, airLp, airGain],
      sources: [roomA, roomB, airSrc],
      creakAt: t + 2.4,
      rngState: seed || 1,
      faded: false,
    };
    try {
      rt._mineBedGain.gain.cancelScheduledValues(t);
      rt._mineBedGain.gain.setValueAtTime(0.0001, t);
      rt._mineBedGain.gain.linearRampToValueAtTime(MINE_BED_PEAK, t + MINE_BED_FADE_IN_S);
    } catch (_) {}
  },

  /** One distant settling creak: a resonant band swept downward through the rock. */
  _mineCreak(t) {
    const rt = this.rt, ctx = rt.ctx;
    if (!ctx || !rt._mineBedGain) return;
    const dur = 0.7 + this._mineRand() * 0.8;
    const top = 190 + this._mineRand() * 90;
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer(ctx, rt._caches);
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 7.5;
    const g = ctx.createGain();
    try {
      bp.frequency.setValueAtTime(top, t);
      bp.frequency.exponentialRampToValueAtTime(Math.max(60, top * 0.62), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.09, t + dur * 0.28);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    } catch (_) {}
    src.connect(bp); bp.connect(g); g.connect(rt._mineBedGain);
    try { src.start(t); src.stop(t + dur + 0.05); } catch (_) {}
    rt._mineVoices.push({ nodes: [src, bp, g], stopAt: t + dur + 0.15 });
  },

  _ensureMineGrind() {
    const rt = this.rt, ctx = rt.ctx;
    if (rt._mineGrind || !ctx || !rt._mineGrindGain) return;
    const layer = (build) => {
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      g.connect(rt._mineGrindGain);
      return build(g);
    };
    const noiseSrc = (rate) => {
      const s = ctx.createBufferSource();
      s.buffer = getNoiseBuffer(ctx, rt._caches);
      s.loop = true;
      s.playbackRate.value = rate;
      return s;
    };
    // matrix — soft regolith: granular mid noise over a light rumble.
    const matrix = layer((g) => {
      const n = noiseSrc(1);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 760; bp.Q.value = 0.75;
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 72;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 190;
      const og = ctx.createGain(); og.gain.value = 0.35;
      n.connect(bp); bp.connect(g); o.connect(lp); lp.connect(og); og.connect(g);
      return { gain: g, sources: [n, o], rateNodes: [n], filter: bp, nodes: [n, bp, o, lp, og, g] };
    });
    // basalt — dense stone: heavy low churn, the mid scooped out.
    const basalt = layer((g) => {
      const n = noiseSrc(0.72);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 360; lp.Q.value = 1.1;
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 46;
      const olp = ctx.createBiquadFilter(); olp.type = 'lowpass'; olp.frequency.value = 130;
      const og = ctx.createGain(); og.gain.value = 0.42;
      n.connect(lp); lp.connect(g); o.connect(olp); olp.connect(og); og.connect(g);
      return { gain: g, sources: [n, o], rateNodes: [n], filter: lp, nodes: [n, lp, o, olp, og, g] };
    });
    // locked / exotic — the bit skating: bright metallic ring, no bite.
    const locked = layer((g) => {
      const n = noiseSrc(1.35);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1750; hp.Q.value = 0.7;
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 322;
      const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 478;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2100; bp.Q.value = 5.5;
      const og = ctx.createGain(); og.gain.value = 0.22;
      n.connect(hp); hp.connect(g);
      o1.connect(bp); o2.connect(bp); bp.connect(og); og.connect(g);
      return { gain: g, sources: [n, o1, o2], rateNodes: [n], filter: hp, nodes: [n, hp, o1, o2, bp, og, g] };
    });
    const t = ctx.currentTime;
    for (const l of [matrix, basalt, locked]) for (const s of l.sources) { try { s.start(t); } catch (_) {} }
    rt._mineGrind = { matrix, basalt, locked };
    try {
      rt._mineGrindGain.gain.cancelScheduledValues(t);
      rt._mineGrindGain.gain.setValueAtTime(MINE_GRIND_PEAK, t);
    } catch (_) {}
  },

  _applyMineGrind(mix, grindDuck, t) {
    const rt = this.rt;
    const grind = rt._mineGrind;
    if (!grind) return;
    const duck = grindDuck == null ? 1 : grindDuck;
    for (const name of MINE_GRIND_LAYERS) {
      const l = grind[name];
      if (!l) continue;
      const target = mix.active ? Math.max(0.0001, mix.gain * mix.weights[name] * duck) : 0.0001;
      this._mineParam(l.gain.gain, target, t, 0.055);
      if (l.filter) this._mineParam(l.filter.frequency, mix.filterHz, t, 0.05);
      for (const s of l.rateNodes || []) {
        if (!s.playbackRate) continue;
        this._mineParam(s.playbackRate, mix.rate, t, 0.06);
      }
    }
  },

  /**
   * Heat is continuous, not an event: drill.js emits no "critical" receipt and the text-matching
   * warn classifier never matches its live strings. Derive the two edges the law names.
   */
  _updateMineHeat(d) {
    const rt = this.rt;
    if (!d) { rt._mineHeatCritical = false; return; }
    const temp = Number(d.drillTemp) || 0;
    if (!rt._mineHeatCritical && (temp >= MINE_HEAT_CRITICAL || d.overheated)) {
      rt._mineHeatCritical = true;
      this._onMineCue('heatCritical', { temp });
    } else if (rt._mineHeatCritical && !d.overheated && temp <= MINE_HEAT_RELIEF) {
      rt._mineHeatCritical = false;
      this._onMineCue('ventRelief', { temp });
    }
  },

  /** Cue entry point: arbitration first, then one synthesized voice. */
  _onMineCue(key, payload, opts) {
    const rt = this.rt;
    if (!rt || !rt._mineArbiter) return null;
    if (!this._mineOwnsEar()) return null;
    // Arbitrate only once the graph can actually speak, or a refusal raised while audio is still
    // locked would burn its 5 s window and silence the first one the player could have heard.
    const ctx = rt.ctx;
    if (!ctx || ctx.state !== 'running' || !rt._mineCueGain) return null;
    const verdict = rt._mineArbiter.admit(key, this._wallClockMs());
    if (!verdict.ok) return verdict;
    const t = ctx.currentTime;
    this._synthMineCue(key, t, verdict.gain, { ...(opts || {}), payload: payload || {} });
    return verdict;
  },

  // --- synthesis helpers (all voices land on rt._mineCueGain -> mineBus -> ambientBus) ---
  _mineTone(t0, spec) {
    const rt = this.rt, ctx = rt.ctx;
    const o = ctx.createOscillator();
    o.type = spec.type || 'sine';
    const g = ctx.createGain();
    const dur = spec.dur || 0.2;
    const attack = spec.attack == null ? 0.006 : spec.attack;
    const dest = rt._mineCueGain;
    const nodes = [o, g];
    if (spec.filter) {
      const f = ctx.createBiquadFilter();
      f.type = spec.filter;
      f.frequency.value = spec.filterHz || 800;
      f.Q.value = spec.filterQ == null ? 1 : spec.filterQ;
      g.connect(f); f.connect(dest); nodes.push(f);
    } else {
      g.connect(rt._mineCueGain);
    }
    o.connect(g);
    try {
      o.frequency.setValueAtTime(spec.f0, t0);
      if (spec.f1 && spec.f1 !== spec.f0) o.frequency.exponentialRampToValueAtTime(Math.max(12, spec.f1), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(Math.max(0.0002, spec.peak), t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    } catch (_) {}
    try { o.start(t0); o.stop(t0 + dur + 0.02); } catch (_) {}
    rt._mineVoices.push({ nodes, stopAt: t0 + dur + 0.08 });
  },

  _mineNoise(t0, spec) {
    const rt = this.rt, ctx = rt.ctx;
    const s = ctx.createBufferSource();
    s.buffer = getNoiseBuffer(ctx, rt._caches);
    s.loop = true;
    if (spec.rate) s.playbackRate.value = spec.rate;
    const f = ctx.createBiquadFilter();
    f.type = spec.filter || 'bandpass';
    f.Q.value = spec.Q == null ? 1 : spec.Q;
    const g = ctx.createGain();
    const dur = spec.dur || 0.2;
    const attack = spec.attack == null ? 0.005 : spec.attack;
    s.connect(f); f.connect(g); g.connect(rt._mineCueGain);
    try {
      f.frequency.setValueAtTime(spec.f0, t0);
      if (spec.f1 && spec.f1 !== spec.f0) f.frequency.exponentialRampToValueAtTime(Math.max(40, spec.f1), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(Math.max(0.0002, spec.peak), t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    } catch (_) {}
    try { s.start(t0); s.stop(t0 + dur + 0.02); } catch (_) {}
    rt._mineVoices.push({ nodes: [s, f, g], stopAt: t0 + dur + 0.08 });
  },

  /**
   * One branch per law §5 "what you hear" phrase. Everything is procedural: no sample files, no
   * manifest entry, no licensing. Peaks are the cue table's, already ducked by the arbiter, and
   * they land on the ambient bus, so they sit in the same window as the shipped mining recipes.
   */
  _synthMineCue(key, t, gain, opts) {
    const p = (opts && opts.payload) || {};
    const rate = Number(opts && opts.rate) || 1;
    switch (key) {
      case 'oreTick': // soft mineral tick, pitch up with value
        this._mineTone(t, { type: 'sine', f0: 1180 * rate, dur: 0.10, peak: gain, attack: 0.004 });
        this._mineTone(t + 0.004, { type: 'sine', f0: 1772 * rate, dur: 0.07, peak: gain * 0.42, attack: 0.003 });
        this._mineNoise(t, { filter: 'bandpass', f0: 2700 * rate, Q: 4, dur: 0.045, peak: gain * 0.3 });
        break;
      case 'boreBite': // a bite is a heavier strike than the grind
        this._mineTone(t, { type: 'triangle', f0: 118, f1: 58, dur: 0.16, peak: gain, attack: 0.003 });
        this._mineNoise(t, { filter: 'bandpass', f0: 940, f1: 380, Q: 1.2, dur: 0.085, peak: gain * 0.7 });
        break;
      case 'rockBreak': // the cell gives way
        this._mineNoise(t, { filter: 'lowpass', f0: 900, f1: 220, Q: 0.8, dur: 0.34, peak: gain });
        this._mineTone(t, { type: 'sine', f0: 74, f1: 44, dur: 0.28, peak: gain * 0.8, attack: 0.004 });
        break;
      case 'gasBreach': // sharp hiss-boom, then fading hiss
        this._mineNoise(t, { filter: 'highpass', f0: 1250, Q: 0.7, dur: 0.19, peak: gain, attack: 0.004 });
        this._mineTone(t + 0.02, { type: 'sine', f0: 62, f1: 33, dur: 0.46, peak: gain * 0.95, attack: 0.006 });
        this._mineNoise(t + 0.14, { filter: 'bandpass', f0: 2300, f1: 900, Q: 1.4, dur: 1.7, peak: gain * 0.42, attack: 0.05 });
        break;
      case 'lockRefusal': // dull clank — damped, no ring
        this._mineTone(t, { type: 'square', f0: 188, f1: 168, dur: 0.24, peak: gain, attack: 0.004, filter: 'lowpass', filterHz: 520, filterQ: 0.9 });
        this._mineNoise(t, { filter: 'bandpass', f0: 620, Q: 2.2, dur: 0.07, peak: gain * 0.55 });
        break;
      case 'hopperFull': // wooden thock
        this._mineTone(t, { type: 'triangle', f0: 226, f1: 196, dur: 0.17, peak: gain, attack: 0.002, filter: 'bandpass', filterHz: 400, filterQ: 3 });
        this._mineNoise(t, { filter: 'bandpass', f0: 1150, Q: 3, dur: 0.035, peak: gain * 0.45 });
        break;
      case 'heatCritical': // rising whine
        this._mineTone(t, { type: 'sawtooth', f0: 610, f1: 1460, dur: 0.95, peak: gain, attack: 0.16, filter: 'bandpass', filterHz: 1500, filterQ: 4.5 });
        break;
      case 'ventRelief': // relief hiss
        this._mineNoise(t, { filter: 'bandpass', f0: 3000, f1: 720, Q: 1.1, dur: 0.95, peak: gain, attack: 0.02 });
        break;
      case 'machinePlaced': // firm mechanical seat
        this._mineTone(t, { type: 'triangle', f0: 132, f1: 96, dur: 0.16, peak: gain, attack: 0.003 });
        this._mineNoise(t + 0.075, { filter: 'bandpass', f0: 1650, Q: 4.5, dur: 0.075, peak: gain * 0.6 });
        break;
      case 'machineStarved': // single soft chime, once per transition
        this._mineTone(t, { type: 'sine', f0: 662, dur: 0.72, peak: gain, attack: 0.022 });
        this._mineTone(t + 0.012, { type: 'sine', f0: 992, dur: 0.5, peak: gain * 0.36, attack: 0.02 });
        break;
      case 'courierLaunch': // soft launch thump
        this._mineTone(t, { type: 'sine', f0: 46, f1: 92, dur: 0.3, peak: gain, attack: 0.012 });
        this._mineNoise(t + 0.03, { filter: 'bandpass', f0: 320, f1: 1450, Q: 0.9, dur: 0.55, peak: gain * 0.45, attack: 0.06 });
        break;
      case 'assayPing': // quiet sonar blip
        this._mineTone(t, { type: 'sine', f0: 1324, dur: 0.28, peak: gain, attack: 0.005 });
        this._mineTone(t + 0.006, { type: 'sine', f0: 1986, dur: 0.16, peak: gain * 0.36, attack: 0.004 });
        break;
      case 'rockDepleted': // two dull descending thuds — this rock is done paying
        this._mineTone(t, { type: 'sine', f0: 152, f1: 128, dur: 0.2, peak: gain, attack: 0.005, filter: 'lowpass', filterHz: 400 });
        this._mineTone(t + 0.16, { type: 'sine', f0: 112, f1: 92, dur: 0.26, peak: gain * 0.7, attack: 0.005, filter: 'lowpass', filterHz: 340 });
        break;
      default:
        // Unknown key: stay silent rather than guess. The routing test enumerates every law row
        // against this switch, so a missing branch is a red check, never a mystery beep.
        return false;
    }
    if (p && p.critical) this._applyPriorityCue({ id: `mine.${key}`, importance: 0.9, playerRelevance: 1 });
    return true;
  },

  _gcMineVoices(now) {
    const rt = this.rt;
    const list = rt._mineVoices;
    if (!list || list.length === 0) return;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (v.stopAt > now) { list[w++] = v; continue; }
      for (const n of v.nodes) { try { n.disconnect(); } catch (_) {} }
    }
    list.length = w;
  },

  /** Retract: fade the whole soundscape out (law §9) and drop the graph. */
  _stopMine(t) {
    const rt = this.rt, ctx = rt.ctx;
    if (!ctx) { this._teardownMine(); return; }
    const at = t == null ? ctx.currentTime : t;
    if (rt._mineBus) {
      try {
        rt._mineBus.gain.cancelScheduledValues(at);
        rt._mineBus.gain.setValueAtTime(Math.max(0.0001, rt._mineBus.gain.value), at);
        rt._mineBus.gain.exponentialRampToValueAtTime(0.0001, at + MINE_BED_FADE_OUT_S);
      } catch (_) {}
    }
    const bed = rt._mineBed;
    const grind = rt._mineGrind;
    // Forget the cached param targets while the layer nodes are still reachable, so a re-entered
    // mine re-asserts its whole mix instead of skipping writes that "already match".
    this._forgetMineParamCache();
    rt._mineBed = null;
    rt._mineGrind = null;
    const stopAt = at + MINE_BED_FADE_OUT_S + 0.05;
    const collect = [];
    if (bed) { for (const s of bed.sources) { try { s.stop(stopAt); } catch (_) {} } collect.push(...bed.nodes); }
    if (grind) {
      for (const name of MINE_GRIND_LAYERS) {
        const l = grind[name];
        if (!l) continue;
        for (const s of l.sources) { try { s.stop(stopAt); } catch (_) {} }
        collect.push(...l.nodes);
      }
    }
    if (collect.length) rt._mineVoices.push({ nodes: collect, stopAt: stopAt + 0.1 });
    this._resetMineRuntime();
  },

  /** Forget every cached param target so a re-entered mine re-asserts its whole mix. */
  _forgetMineParamCache() {
    const rt = this.rt;
    if (!rt) return;
    const forget = (n) => { if (n && n.gain) delete n.gain._mineLast; };
    forget(rt._mineBus); forget(rt._mineBedGain); forget(rt._mineGrindGain); forget(rt._mineCueGain);
    if (rt._mineGrind) {
      for (const name of MINE_GRIND_LAYERS) {
        const l = rt._mineGrind[name];
        if (!l) continue;
        forget(l.gain);
        if (l.filter && l.filter.frequency) delete l.filter.frequency._mineLast;
        for (const s of l.rateNodes || []) { if (s.playbackRate) delete s.playbackRate._mineLast; }
      }
    }
  },

  _teardownMine() {
    const rt = this.rt;
    if (!rt) return;
    const drop = (nodes) => { for (const n of nodes || []) { try { n.stop(); } catch (_) {} try { n.disconnect(); } catch (_) {} } };
    if (rt._mineBed) drop(rt._mineBed.nodes);
    if (rt._mineGrind) for (const name of MINE_GRIND_LAYERS) drop(rt._mineGrind[name] && rt._mineGrind[name].nodes);
    for (const v of rt._mineVoices || []) drop(v.nodes);
    rt._mineBed = null; rt._mineGrind = null; rt._mineVoices = [];
    rt._wantMineBed = false;
    this._resetMineRuntime();
  },

  _onMiningStart(p) {
    const rt = this.rt;
    if (!p) return;
    rt._wantMining = { minerId: p.minerId, targetId: p.targetId };
    const ctx = rt.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (rt.loops.mining) return;
    const entity = p.targetId != null && this.state.entities && typeof this.state.entities.get === 'function'
      ? this.state.entities.get(p.targetId) : null;
    const v = this._startLoopVoice('sfx_mining_beam', p.position, 0.6, { entity });
    if (v) { v.trackId = p.targetId; rt.loops.mining = v; this._markLoopPositionDirty(); }
  },

  _onMiningStop(p) {
    const rt = this.rt;
    rt._wantMining = null;
    if (rt.loops.mining) { this._endLoopVoice(rt.loops.mining); delete rt.loops.mining; }
    this._markLoopPositionDirty();
  },

  _onMiningTick(p) {
    // Keep hardness/contact inside the existing continuous cutter voice. Spawning a one-shot every
    // 80 ms masked seam rewards and inflated the voice floor; the semantic lane owns transitions.
    const rt = this.rt;
    const voice = rt.loops.mining;
    const filter = voice && voice.filter;
    const ctx = rt.ctx;
    if (!filter || !ctx) return;
    const targetHz = p && p.seamHit ? 1520 : 940;
    try { filter.frequency.setTargetAtTime(targetHz, ctx.currentTime, 0.045); } catch (_) {}
  },

  _updateDrillGrind() {
    const rt = this.rt;
    const mix = drillGrindMix(this.state && this.state.drill, rt._drillGrindMix);
    // PQ-130.08: inside the mine the three-layer grind bed (`_updateMine`) owns this voice. This
    // single-recipe loop stands down there so the two can never stack. It stays the grind for any
    // future non-mine deep-drill session.
    if (mix.active && this._mineOwnsEar()) mix.active = false;
    rt._wantDrillGrind = mix.active;

    if (!mix.active) {
      const current = rt.loops.drillGrind;
      if (current) {
        this._endLoopVoice(current);
        delete rt.loops.drillGrind;
      }
      return;
    }

    const ctx = rt.ctx;
    if (!ctx || ctx.state !== 'running') return;
    let voice = rt.loops.drillGrind;
    if (!voice) {
      voice = this._startLoopVoice(DRILL_GRIND_LOOP_ID, null, 0.4);
      if (!voice) return;
      voice.role = 'ambient';
      voice.busName = 'ambient';
      rt.loops.drillGrind = voice;
    }

    const now = ctx.currentTime;
    try { voice.gain.gain.setTargetAtTime(mix.gain, now, 0.045); } catch (_) {}
    if (voice.filter) {
      try { voice.filter.frequency.setTargetAtTime(mix.filterHz, now, 0.04); } catch (_) {}
    }
    for (const source of voice.sources || []) {
      if (!source.playbackRate) continue;
      try { source.playbackRate.setTargetAtTime(mix.rate, now, 0.05); } catch (_) {}
    }
  },

  _startLoopVoice(recipeId, position, gain, options = {}) {
    const rt = this.rt, ctx = rt.ctx;
    if (rt._lifecycleSuspended || !ctx || ctx.state !== 'running') return null;
    const recipe = AUDIO_RECIPE_BY_ID[recipeId];
    if (!recipe) return null;
    const entity = options.entity || null;
    const busName = getBusForRecipe(recipe, recipeId);
    // UI/combat voices are intentionally not hidden by residency: a player-facing warning or a
    // nearby combat receipt must remain audible. Continuous remote engine/ambient loops, however,
    // must not keep scheduling AudioParam work once their owner leaves the active audio set.
    if (entity && busName !== 'ui' && busName !== 'combat'
      && entityNeedsExactAudio(entity, { playerId: this.state && this.state.playerId }) !== true) {
      return null;
    }
    let att = 1, pan = 0;
    if (position) {
      if (!Number.isFinite(position.x) || !Number.isFinite(position.z)) return null;
      const pp = this._playerPos();
      const d = Math.hypot(position.x - pp.x, position.z - pp.z);
      if (d > D_FAR && busName !== 'ui' && busName !== 'combat') return null;
      att = clamp(1 - (d - D_NEAR) / (D_FAR - D_NEAR), 0, 1); att *= att;
      pan = clamp((position.x - pp.x) / PAN_SPAN, -1, 1);
    }
    // Shared-bus reconciliation: loops must hit the same per-bus gains as one-shots
    // (combat slider, ambient sidechain duck, engine bus, etc.). Never bypass onto sfxBus.
    let targetBus = rt.sfxBus;
    if (busName === 'engine') targetBus = rt.engineBus || rt.sfxBus;
    else if (busName === 'ambient') targetBus = rt.ambientBus || rt.sfxBus;
    else if (busName === 'combat') targetBus = rt.combatBus || rt.sfxBus;
    else if (busName === 'ui') targetBus = rt.uiBus || rt.sfxBus;
    else if (busName === 'comms') targetBus = rt.commsBus || rt.sfxBus;

    let dest = targetBus;
    let panner = null;
    if (pan !== 0 && ctx.createStereoPanner) {
      panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      panner.connect(targetBus);
      dest = panner;
    }
    const peak = Math.min(1, this._ampFor(recipe) * (gain == null ? 1 : gain) * att);
    const v = playRecipe(ctx, recipe, dest, {
      peakGain: Math.max(0.02, peak),
      rate: isPhysicalAudioBus(busName) ? (rt._bulletTimePitch || 1) : 1,
      id: rt._nextVoiceId++,
    }, rt._caches);
    v._panner = panner;
    v._baseGain = this._ampFor(recipe) * (gain == null ? 1 : gain);
    v.busName = busName;
    v.loop = true;
    v.role = busName === 'engine'
      ? 'engineLoop'
      : ((recipe.category === 'weapon' || String(recipeId).includes('wpn')) ? 'weaponLoop' : busName);
    rt.voices.push(v);
    return v;
  },

  _endLoopVoice(v) {
    const rt = this.rt;
    try { releaseVoice(rt.ctx, v); } catch (_) {}
    // GC happens in _frame() once stopAt passes; mark panner for cleanup there
  },

  _onDocked(p) {
    // Docking sequence: metallic clunk impact + confirmation chime + place mood
    this.play('sfx_dock_clunk', { gain: 0.9 });
    // Slight delay on the confirmation chime so it feels like clunk-then-lock
    setTimeout(() => this.play('sfx_ui_confirm', { gain: 0.6, rate: 0.7 }), 180);
    this.rt._docked = true;
    this.rt._dockStationId = p && p.stationId ? p.stationId : null;
    this._markMusicDirty();
    // Start ambient station hum loop (faction-tinted when possible)
    this._startStationHum(p);
  },

  _onUndocked() {
    this.rt._docked = false;
    this.rt._dockStationId = null;
    this._markMusicDirty();
    // Soft release whoosh then stop station hum — undock is decompress, not another clunk.
    this.play('sfx_undock_release', { gain: 0.55 });
    this._stopStationHum();
  },

  // WANTED heat family, keyed on the authoritative heat:changed packet (heat.js is the single
  // writer). Fully packet-driven: every emit carries previousValue, so each verdict derives from
  // the packet itself and no cross-run or post-load transient can stale it. Only edges speak:
  // the WANTED flip and band climbs play the rising alarm (pitched up per band); dropping clean
  // plays the clear sting; chips inside a band and decay-without-clear stay silent.
  _onHeatChanged(p) {
    if (!p) return;
    const level = Number.isFinite(p.level) ? p.level : 0;
    if (p.wantedCrossed && !p.wanted) {
      // importance 0.8 = critical voice: the relief sting survives a combat squelch window,
      // mirroring the escalation alarm's immunity.
      this._onCue({ id: 'wanted_clear', gain: 0.7, importance: 0.8 });
      return;
    }
    const prevLevel = Number.isFinite(p.previousValue) ? heatLevelFor(p.previousValue) : null;
    const escalated = level > 0
      && ((p.wantedCrossed && p.wanted) || (prevLevel != null && level > prevLevel));
    if (!escalated) return;
    // Band scale mirrors HEAT_LEVEL_COUNT in src/systems/heat.js; bands 1..5. The per-band rate
    // step (0.12 ≈ 2 semitones) keeps the escalation ladder audible; gain steps add on top.
    const band = Math.max(1, Math.min(5, level));
    this._onCue({
      id: 'wanted_escalate',
      gain: clamp(0.55 + band * 0.06, 0.55, 0.9),
      rate: clamp(1 + (band - 1) * 0.12, 1, 1.6),
      // The flip owns the ear (duck, like fuel:empty). Climbs speak at 0.75 — and either way the
      // recipe's 'alert' id already grants squelch immunity (see _isPriorityVoice).
      importance: p.wantedCrossed ? 0.9 : 0.75,
      duck: !!p.wantedCrossed,
    });
  },

  _startStationHum(p) {
    const rt = this.rt, ctx = rt.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (rt.loops.stationHum) return;
    // Place identity: Helios / SCN trade hubs sit slightly brighter; others cooler/darker.
    // Read-only station/sector ids — never mutates gameplay state.
    const stationId = (p && p.stationId) || rt._dockStationId || '';
    const sectorId = (this.state.world && this.state.world.currentSectorId) || '';
    const isHelios = String(stationId).includes('helios') || String(sectorId).includes('helios');
    const baseFreq = isHelios ? 66 : 58;
    const ventCenter = isHelios ? 340 : 280;
    const humPeak = isHelios ? 0.045 : 0.038;
    // Build a layered station hum: low drone + ventilation noise
    const humOsc = ctx.createOscillator();
    humOsc.type = 'triangle';
    humOsc.frequency.value = baseFreq;
    const humOsc2 = ctx.createOscillator();
    humOsc2.type = 'sine';
    humOsc2.frequency.value = baseFreq * 2 + (isHelios ? 0.4 : 0.2); // slight detune for chorus
    const humGain = ctx.createGain();
    humGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    humGain.gain.linearRampToValueAtTime(humPeak, ctx.currentTime + 2.0); // slow fade in
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = isHelios ? 230 : 190;
    humFilter.Q.value = 1.0;
    // Ventilation layer: filtered noise
    const ventBuf = getNoiseBuffer(ctx, rt._caches);
    const ventSrc = ctx.createBufferSource();
    ventSrc.buffer = ventBuf;
    ventSrc.loop = true;
    const ventGain = ctx.createGain();
    ventGain.gain.value = isHelios ? 0.012 : 0.015;
    const ventFilter = ctx.createBiquadFilter();
    ventFilter.type = 'bandpass';
    ventFilter.frequency.value = ventCenter;
    ventFilter.Q.value = 0.5;
    humOsc.connect(humFilter);
    humOsc2.connect(humFilter);
    humFilter.connect(humGain);
    ventSrc.connect(ventFilter);
    ventFilter.connect(ventGain);
    ventGain.connect(humGain);
    humGain.connect(rt.ambientBus);
    try { humOsc.start(ctx.currentTime); humOsc2.start(ctx.currentTime); ventSrc.start(ctx.currentTime); } catch (_) {}
    rt.loops.stationHum = {
      nodes: [humOsc, humOsc2, ventSrc, humGain, humFilter, ventFilter, ventGain],
      gain: humGain, sources: [humOsc, humOsc2, ventSrc], extra: [],
      startedAt: ctx.currentTime, loop: true, stopAt: Infinity, _stopped: false,
      releaseDur: 1.5, callGain: humPeak, id: rt._nextVoiceId++,
      role: 'ambient', busName: 'ambient',
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

  _onCue(cue) {
    const id = typeof cue === 'string' ? cue : cue && cue.id;
    if (!id) { this.play('sfx_ui_click', { gain: 0.7 }); return; }
    const rid = resolveAudioCueRecipeId(id);
    const opts = (cue && typeof cue === 'object') ? cue : {};
    // While the mine owns the ear its own synthesized voice replaces the flight-mix recipe for
    // these receipts. The semantic cue still travels the bus (captions, `.07` board expressions);
    // only the second, wrong-room playback is dropped.
    if (opts.cueId && MINE_OWNED_PRESENTATION_CUES.has(opts.cueId) && this._mineOwnsEar()) return null;
    const signature = resolveFirstHourAudioSignature(id);
    const nowS = this.rt && this.rt.ctx
      ? this.rt.ctx.currentTime
      : Math.max(0, Number(this.state && this.state.simTime) || 0);
    if (signature && signature.cooldownS > 0) {
      const lastAt = this.rt._signatureLastAt && this.rt._signatureLastAt[id];
      if (Number.isFinite(lastAt) && nowS - lastAt < signature.cooldownS) return null;
    }
    // Some presentation receipts must remain visible on the semantic bus even though an earlier
    // raw event owns their physical sound. Do not turn that observability contract into a double hit.
    if (opts.playbackOwnedByRaw) return;
    const suppliedImportance = Number.isFinite(opts.importance)
      ? opts.importance
      : (opts.duck ? Math.max(PRIORITY_DUCK_THRESHOLD, 0.85) : 0);
    const importance = Math.max(suppliedImportance, signature ? signature.priority : 0);
    // Priority duck for high-importance presentation / objective / warning cues.
    if (opts.duck || importance >= PRIORITY_DUCK_THRESHOLD) {
      this._applyPriorityCue({
        id: opts.cueId || id,
        audioId: id,
        importance: Math.max(importance, PRIORITY_DUCK_THRESHOLD),
        playerRelevance: Number.isFinite(opts.playerRelevance) ? opts.playerRelevance : 1,
      });
    }
    if (opts.duck) this._duckMusic(opts.duckSeconds || 0.8);
    const isCritical = importance >= PRIORITY_DUCK_THRESHOLD || !!opts.duck || !!(signature && signature.warning);
    const voice = this.play(rid, {
      gain: opts.gain == null ? 0.8 : opts.gain,
      position: opts.position || null,
      rate: opts.rate || 1,
      critical: isCritical,
    });
    if (voice && signature && signature.cooldownS > 0) {
      this.rt._signatureLastAt[id] = nowS;
    }
    return voice;
  },

  _duckMusic(seconds) {
    const rt = this.rt; if (!rt.ctx) return;
    rt._duckUntil = rt.ctx.currentTime + (seconds || 0.8);
    const t = rt.ctx.currentTime;
    invalidateBusGainCache(rt, 'music');
    try {
      rt.musicBus.gain.cancelScheduledValues(t);
      rt.musicBus.gain.setValueAtTime(Math.max(0.0001, rt.musicBus.gain.value), t);
      rt.musicBus.gain.linearRampToValueAtTime(
        Math.max(0.0001, (rt._musicBase || 0.5) * (rt._bulletTimeMusicMult || 1) * 0.5), t + 0.08);
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
      active: true,
      destroyed: false,
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
      seq.timerId = 0;
      if (!seq.active || seq.destroyed) return;
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
      pauseScheduler() {
        if (seq.destroyed || !seq.active) return;
        seq.active = false;
        if (seq.timerId) clearTimeout(seq.timerId);
        seq.timerId = 0;
      },
      resumeScheduler() {
        if (seq.destroyed || seq.active) return;
        seq.active = true;
        seq.nextNoteTime = Math.max(seq.nextNoteTime, ctx.currentTime + 0.1);
        scheduleNotes();
      },
      stop() {
        if (seq.destroyed) return;
        seq.destroyed = true;
        seq.active = false;
        if (seq.timerId) clearTimeout(seq.timerId);
        seq.timerId = 0;
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
    let docked = !!(rt._docked || (player && player.flags && player.flags.docked) || state.ui.docked);
    const context = resolveAudioThreatContext(state, player, rt);
    const threat = context.threat;
    rt.threat = threat;
    rt.threatContext = context;

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
    if (!rt || rt._rafId || rt._lifecycleSuspended || !rt.ctx
      || rt.ctx.state !== 'running' || typeof requestAnimationFrame === 'undefined') return;
    const tick = () => {
      rt._rafId = 0;
      if (rt._lifecycleSuspended || !rt.ctx || rt.ctx.state !== 'running') return;
      this._frame();
      if (!rt._lifecycleSuspended && rt.ctx && rt.ctx.state === 'running') {
        rt._rafId = requestAnimationFrame(tick);
      }
    };
    rt._rafId = requestAnimationFrame(tick);
  },

  _stopFrameLoop() {
    const rt = this.rt;
    if (!rt || !rt._rafId) return;
    const frameId = rt._rafId;
    rt._rafId = 0;
    if (typeof cancelAnimationFrame !== 'undefined') {
      try { cancelAnimationFrame(frameId); } catch (_) {}
    }
  },

  _frame() {
    const rt = this.rt, ctx = rt && rt.ctx;
    if (!ctx || rt._lifecycleSuspended || ctx.state !== 'running') return;
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

    // Priority duck continuous loops before engine/weapon gain writes
    this._updatePriorityDuckGains();

    // Ensure continuous graphs once context is running in an unpaused flight session.
    // Do not start engine/brake/tether beds on the main-menu gesture unlock — that is the boop.
    if (ctx.state === 'running' && !rt._paused && !rt.engineOsc1) this._ensureContinuousSources();

    // Update continuous procedural sources
    this._updateEngineHum();
    this._updateBrakeHiss(dt);
    this._updateTetherHum();
    this._updateDrillGrind();
    // Outside the `if (!rt._paused)` block below on purpose: the mine screen pauses the world sim,
    // and its soundscape is exactly what must keep running through that pause (law §8).
    this._updateMine(dt, now);
    this._updateSectorCues(now);
    this._updateStationMurmur(now);
    this._updatePlaceContext(now);

    // recover music gain after a duck (skip while paused — _onPause manages the bus)
    if (!rt._paused && rt._duckUntil && now >= rt._duckUntil && rt.musicBus) {
      rt._duckUntil = 0;
      invalidateBusGainCache(rt, 'music');
      try {
        rt.musicBus.gain.cancelScheduledValues(now);
        rt.musicBus.gain.setValueAtTime(Math.max(0.0001, rt.musicBus.gain.value), now);
        rt.musicBus.gain.linearRampToValueAtTime(
          Math.max(0.0001, (rt._musicBase || 0.5) * (rt._bulletTimeMusicMult || 1)), now + 0.8);
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
    const entities = this.state && this.state.entities;
    if (!entities || typeof entities.get !== 'function') return;
    const pp = this._playerPos();
    const apply = (v) => {
      if (!v || v.trackId == null) return;
      const e = entities.get(v.trackId);
      if (!e || !e.pos || !Number.isFinite(e.pos.x) || !Number.isFinite(e.pos.z)) return;
      const d = Math.hypot(e.pos.x - pp.x, e.pos.z - pp.z);
      const exact = entityNeedsExactAudio(e, { playerId: this.state && this.state.playerId });
      const preserveRemote = v.busName === 'ui' || v.busName === 'combat';
      if (!preserveRemote && exact !== true) {
        if (v._audioResidencyActive !== false) {
          try { v.gain.gain.setTargetAtTime(0.0001, now, 0.05); } catch (_) {}
          v._audioResidencyActive = false;
          v._audioGainTarget = 0.0001;
        }
        return;
      }
      if (!preserveRemote && d > D_FAR) {
        if (v._audioResidencyActive !== false) {
          try { v.gain.gain.setTargetAtTime(0.0001, now, 0.05); } catch (_) {}
          v._audioResidencyActive = false;
          v._audioGainTarget = 0.0001;
        }
        return;
      }
      v._audioResidencyActive = true;
      let att = clamp(1 - (d - D_NEAR) / (D_FAR - D_NEAR), 0, 1); att *= att;
      const pan = clamp((e.pos.x - pp.x) / PAN_SPAN, -1, 1);
      const t = now == null ? rt.ctx.currentTime : now;
      const isWeaponLoop = v.role === 'weaponLoop'
        || (v.busName === 'combat' && v.loop);
      const priorityDuck = isWeaponLoop
        ? (rt._priorityDuckWeapon == null ? 1 : rt._priorityDuckWeapon)
        : 1;
      const gainTarget = Math.max(0.0001, (v._baseGain || 0.3) * att * priorityDuck);
      if (!Number.isFinite(v._audioGainTarget) || Math.abs(v._audioGainTarget - gainTarget) > 1e-5) {
        try { v.gain.gain.setTargetAtTime(gainTarget, t, 0.05); } catch (_) {}
        v._audioGainTarget = gainTarget;
      }
      if (v._panner && (!Number.isFinite(v._audioPanTarget) || Math.abs(v._audioPanTarget - pan) > 1e-5)) {
        try { v._panner.pan.setTargetAtTime(pan, t, 0.05); } catch (_) {}
        v._audioPanTarget = pan;
      }
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
    let critical = false;
    if (category === 'story' || category === 'priority') {
      recipeId = 'sfx_squelch_story';
      critical = true;
      this._applyPriorityCue({
        id: `comms.${category}`,
        importance: 0.9,
        playerRelevance: 1,
      });
    } else if (category === 'danger' || category === 'warning' || category === 'alert') {
      recipeId = 'sfx_squelch_danger';
      critical = true;
      // Danger/story comms own the ear briefly so weapon/UI one-shots cannot stack.
      this._applyPriorityCue({
        id: `comms.${category}`,
        importance: 0.9,
        playerRelevance: 1,
      });
    }

    this.play(recipeId, { gain: 0.8, startTime, critical });
  },

  _ensureEngineHum() {
    const rt = this.rt, ctx = rt.ctx;
    if (!ctx || rt.engineOsc1) return;

    // Layered propulsion bus: osc1 saw + osc2 sine (detune 6 ct) + sub sine + noise air.
    // Gain master for priority duck; voice peak lives on engineBus budgets.
    // Soft-start at near-silence — _updateEngineHum ramps to the live idle/thrust target.
    // Starting at 0.8 produced a hard one-shot click on first unlock.
    const humGain = ctx.createGain();
    humGain.gain.value = 0;

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 55;

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 55;
    osc2.detune.value = 6;

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 27.5;
    const subGain = ctx.createGain();
    subGain.gain.value = 0;

    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx, rt._caches);
    noise.loop = true;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 300;
    noiseFilter.Q.value = 1.0;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;

    osc1.connect(humGain);
    osc2.connect(humGain);
    sub.connect(subGain);
    subGain.connect(humGain);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(humGain);

    humGain.connect(rt.engineBus);

    try {
      osc1.start(ctx.currentTime);
      osc2.start(ctx.currentTime);
      sub.start(ctx.currentTime);
      noise.start(ctx.currentTime);
    } catch (_) {}

    rt.engineHumGain = humGain;
    rt.engineOsc1 = osc1;
    rt.engineOsc2 = osc2;
    rt.engineSub = sub;
    rt.engineSubGain = subGain;
    rt.engineNoise = noise;
    rt.engineNoiseGain = noiseGain;
    rt.engineNoiseFilter = noiseFilter;
    rt._engineTier = 'idle';
  },

  /**
   * Resolve thrust tier from live flight state (read-only).
   * Spec2/07: idle 55 / thrust 78 / boost 110+noise / cruise 65 clean fifth.
   */
  _resolveEngineTier(player) {
    const cruise = this.state.player && this.state.player.cruise;
    if (cruise && cruise.phase === 'cruising') return 'cruise';
    if (player && player.flags && player.flags.boosting) return 'boost';
    const input = this.state.input;
    const thrusting = !!(input && (
      Math.abs(Number(input.moveZ) || 0) > 0.02 ||
      Math.abs(Number(input.moveX) || 0) > 0.02
    ));
    return thrusting ? 'thrust' : 'idle';
  },

  _engineTierRank(tier) {
    if (tier === 'idle') return 0;
    if (tier === 'thrust') return 1;
    if (tier === 'boost') return 2;
    if (tier === 'cruise') return 3;
    return 0;
  },

  _cachedEngineAudioIdentity(player) {
    const rt = this.rt;
    const data = player && player.data;
    const derived = data && data.derived;
    const driveId = player && player.driveId || derived && derived.driveId || data && data.driveId || null;
    const mass = Math.max(1, Number(player && player.mass) || Number(derived && derived.mass) || 1);
    const flightClass = player && player.flightClass || derived && derived.flightClass || null;
    if (rt._engineIdentity && rt._engineIdentityEntity === player
      && rt._engineIdentityDriveId === driveId && rt._engineIdentityMass === mass
      && rt._engineIdentityFlightClass === flightClass) {
      return rt._engineIdentity;
    }
    rt._engineIdentityEntity = player;
    rt._engineIdentityDriveId = driveId;
    rt._engineIdentityMass = mass;
    rt._engineIdentityFlightClass = flightClass;
    rt._engineIdentity = resolveEngineAudioIdentity(player);
    return rt._engineIdentity;
  },

  _updateEngineHum() {
    const rt = this.rt, ctx = rt.ctx;
    if (!ctx || !rt.engineOsc1 || rt._paused) return;

    // Ensure continuous graph if context was rebuilt mid-session.
    if (!rt.engineHumGain) this._ensureEngineHum();

    const player = this.state.entities.get(this.state.playerId);
    const tier = this._resolveEngineTier(player);
    const prev = rt._engineTier || 'idle';
    const nowMs = this._wallClockMs();

    // Acceleration transition motif when stepping energy UP (idle→thrust, thrust→boost).
    // Throttled; skipped under motion-reduce (accessibility).
    if (tier !== prev) {
      const steppedUp = this._engineTierRank(tier) > this._engineTierRank(prev)
        && (prev === 'idle' || prev === 'thrust')
        && (tier === 'thrust' || tier === 'boost');
      if (steppedUp && !this._motionReduced() && (nowMs - (rt._lastAccelTransitionMs || 0)) > 280) {
        rt._lastAccelTransitionMs = nowMs;
        this.play('sfx_accel_transition', { gain: tier === 'boost' ? 0.4 : 0.28 });
      }
      rt._engineTier = tier;
      rt._engineTierSince = nowMs;
    }

    // Read-only identity: ships/flight still own mass and propulsion. Audio maps those authored
    // facts to a stable family timbre and never feeds values back into the simulation.
    const identity = this._cachedEngineAudioIdentity(player);
    const massNorm = identity.massNorm;
    const familyVoice = identity.voice;

    // Spec frequencies are exact; place identity lives in the station/palette layers.
    let f1 = 55, f2 = 55, d2 = 6, noiseG = 0.0001, noiseHz = 300, subG = 0.08 * massNorm, humG = 0.55;
    if (tier === 'cruise') {
      f1 = 65;
      f2 = 65 * 1.5; // clean fifth
      d2 = 0;
      noiseG = 0.008;
      noiseHz = 220;
      subG = 0.1 * massNorm;
      humG = 0.62;
    } else if (tier === 'boost') {
      f1 = 110;
      f2 = 110;
      d2 = 4;
      noiseG = 0.06;
      noiseHz = 480;
      subG = 0.16 * massNorm;
      humG = 0.85;
    } else if (tier === 'thrust') {
      f1 = 78;
      f2 = 78;
      d2 = 6;
      noiseG = 0.02;
      noiseHz = 340;
      subG = 0.12 * massNorm;
      humG = 0.72;
    } else {
      // Idle has no physical event to voice. The old 55 Hz saw/sine stack was the startup buzz;
      // thrust, boost, and cruise still retain their authored propulsion identities.
      humG = 0;
      subG = 0;
      noiseG = 0;
    }

    // Preserve the tier fundamental while giving each drive a different overtone/noise/sub shape.
    // Cruise keeps its universal clean fifth: travel grammar should remain recognizable across hulls.
    if (tier !== 'cruise') f2 = f1 * familyVoice.harmonic;
    d2 = tier === 'cruise' ? 0 : familyVoice.detune;
    noiseG *= familyVoice.noiseMult;
    noiseHz *= familyVoice.noiseHzMult;
    subG *= familyVoice.subMult;
    humG *= familyVoice.humMult;

    // Priority duck mult on continuous engine loop (weapon loops handled separately).
    const duck = rt._priorityDuckEngine == null ? 1 : rt._priorityDuckEngine;
    humG *= duck;

    // Portamento ~300 ms (setTarget timeConstant ≈ 0.1).
    const tc = 0.1;
    const t = ctx.currentTime;
    const slowPitch = rt._bulletTimePitch || 1;
    try {
      rt.engineOsc1.type = familyVoice.osc1;
      rt.engineOsc2.type = familyVoice.osc2;
      rt.engineOsc1.frequency.setTargetAtTime(f1 * slowPitch, t, tc);
      rt.engineOsc2.frequency.setTargetAtTime(f2 * slowPitch, t, tc);
      rt.engineOsc2.detune.setTargetAtTime(d2, t, tc);
      if (rt.engineSub) rt.engineSub.frequency.setTargetAtTime(f1 * 0.5 * slowPitch, t, tc);
      if (rt.engineSubGain) rt.engineSubGain.gain.setTargetAtTime(subG, t, 0.12);
      rt.engineNoiseGain.gain.setTargetAtTime(noiseG * duck, t, 0.15);
      if (rt.engineNoiseFilter) rt.engineNoiseFilter.frequency.setTargetAtTime(noiseHz, t, 0.12);
      if (rt.engineHumGain) rt.engineHumGain.gain.setTargetAtTime(Math.max(0, humG), t, 0.08);
    } catch (_) {}

    // Mutate a stable telemetry object for harness/evidence traces (no per-frame allocation).
    const telemetry = rt._engineTelemetry;
    telemetry.tier = tier;
    telemetry.f1 = f1;
    telemetry.f2 = f2;
    telemetry.noiseG = noiseG;
    telemetry.humG = humG;
    telemetry.massNorm = massNorm;
    telemetry.family = identity.family;
    telemetry.massClass = identity.massClass;
    telemetry.driveId = identity.driveId;
    telemetry.duck = duck;
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
    if (!ctx || rt._paused) return;
    if (!rt.brakeGain) this._ensureBrakeHiss();
    if (!rt.brakeGain) return;

    const player = this.state.entities.get(this.state.playerId);
    const speed = player && player.vel ? Math.hypot(player.vel.x, player.vel.z) : 0;
    const actions = this.state.input && this.state.input.actions;
    const braking = !!(actions && actions.brake) || !!(this.state.input && this.state.input.brake);

    let decel = 0;
    if (rt._prevSpeed !== undefined) {
      decel = Math.max(0, rt._prevSpeed - speed) / Math.max(0.001, dt);
    }
    rt._prevSpeed = speed;

    let targetGain = 0.0001;
    if (braking && speed > 20) {
      targetGain = Math.min(0.25, Math.max(0.04, decel * 0.04));
    }

    // setTargetAtTime is memoryless: re-issuing the same (target, timeConstant) from the curve's
    // own current value reproduces the identical exponential, so a frame whose targets are
    // unchanged may skip the write with no effect at all on the audible signal. Everything above
    // — including `rt._prevSpeed` — still runs every frame, and a changed target is written on the
    // very frame it appears, so a brake onset is never delayed, dropped or re-levelled.
    const now = ctx.currentTime;
    const rate = rt._bulletTimePitch || 1;
    const cache = rt._bedTargetCache || (rt._bedTargetCache = Object.create(null));
    if (rt.brakeNoise && rt.brakeNoise.playbackRate
      && (cache.brakeNoiseNode !== rt.brakeNoise || cache.brakeRate !== rate)) {
      cache.brakeNoiseNode = rt.brakeNoise;
      cache.brakeRate = rate;
      rt.brakeNoise.playbackRate.setTargetAtTime(rate, now, 0.05);
    }
    if (cache.brakeGainNode !== rt.brakeGain || cache.brakeGain !== targetGain) {
      cache.brakeGainNode = rt.brakeGain;
      cache.brakeGain = targetGain;
      rt.brakeGain.gain.setTargetAtTime(targetGain, now, 0.05);
    }
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

    // A second, initially silent strand introduces a slow beat only above overload. This is a
    // continuous physical read of the line, not another repeating alarm.
    const overloadOsc = ctx.createOscillator();
    overloadOsc.type = 'triangle';
    overloadOsc.frequency.value = 97;
    const overloadGain = ctx.createGain();
    overloadGain.gain.value = 0.0001;

    osc.connect(gain);
    overloadOsc.connect(overloadGain);
    gain.connect(rt.combatBus);
    overloadGain.connect(rt.combatBus);

    try { osc.start(ctx.currentTime); overloadOsc.start(ctx.currentTime); } catch (_) {}

    rt.tetherOsc = osc;
    rt.tetherHum = gain;
    rt.tetherOverloadOsc = overloadOsc;
    rt.tetherOverloadGain = overloadGain;
  },

  _updateTetherHum() {
    const rt = this.rt, ctx = rt.ctx;
    if (!ctx || rt._paused) return;
    if (!rt.tetherOsc) this._ensureTetherHum();
    if (!rt.tetherOsc) return;

    const tether = this.state.player && this.state.player.tether;
    const active = !!(tether && (tether.active || tether.phase === 'loaded' || tether.phase === 'overload'));
    const strain = active ? clamp(Number(tether.strain) || 0, 0, 1.25) : 0;

    let targetFreq = 90;
    let targetGain = 0.0001;

    if (active) {
      targetFreq = 90 + strain * 220;
      targetGain = 0.006 + Math.pow(strain, 1.25) * 0.13;
    }

    const slowPitch = rt._bulletTimePitch || 1;
    const now = ctx.currentTime;
    const humFreq = targetFreq * slowPitch;
    // Same memoryless-setTargetAtTime argument as _updateBrakeHiss: an idle tether re-asserts the
    // exact curve it is already on, so skipping it is inaudible, while the frame a line engages
    // changes the targets and writes immediately. The `gainValue` mirrors stay unconditional.
    const cache = rt._bedTargetCache || (rt._bedTargetCache = Object.create(null));
    if (cache.tetherOscNode !== rt.tetherOsc || cache.tetherFreq !== humFreq) {
      cache.tetherOscNode = rt.tetherOsc;
      cache.tetherFreq = humFreq;
      rt.tetherOsc.frequency.setTargetAtTime(humFreq, now, 0.05);
    }
    if (cache.tetherHumNode !== rt.tetherHum || cache.tetherGain !== targetGain) {
      cache.tetherHumNode = rt.tetherHum;
      cache.tetherGain = targetGain;
      rt.tetherHum.gain.setTargetAtTime(targetGain, now, 0.05);
    }
    rt.tetherHum.gainValue = targetGain;
    if (rt.tetherOverloadOsc && rt.tetherOverloadGain) {
      const overload = clamp((strain - 0.72) / 0.28, 0, 1);
      const overloadFreq = (targetFreq + 7 + overload * 9) * slowPitch;
      const overloadGain = Math.max(0.0001, overload * 0.055);
      if (cache.tetherOverloadOscNode !== rt.tetherOverloadOsc || cache.tetherOverloadFreq !== overloadFreq) {
        cache.tetherOverloadOscNode = rt.tetherOverloadOsc;
        cache.tetherOverloadFreq = overloadFreq;
        rt.tetherOverloadOsc.frequency.setTargetAtTime(overloadFreq, now, 0.05);
      }
      if (cache.tetherOverloadGainNode !== rt.tetherOverloadGain || cache.tetherOverloadGain !== overloadGain) {
        cache.tetherOverloadGainNode = rt.tetherOverloadGain;
        cache.tetherOverloadGain = overloadGain;
        rt.tetherOverloadGain.gain.setTargetAtTime(overloadGain, now, 0.05);
      }
      rt.tetherOverloadGain.gainValue = overloadGain;
    }
  },

  /** Apply cue-priority envelope gains to continuous engine + weapon loops each frame. */
  _updatePriorityDuckGains() {
    const rt = this.rt;
    if (!rt || !rt._priorityBus) return;
    const nowMs = this._wallClockMs();
    rt._priorityDuckEngine = rt._priorityBus.gainFor(rt._priorityEngineProbe, nowMs);
    rt._priorityDuckWeapon = rt._priorityBus.gainFor(rt._priorityWeaponProbe, nowMs);

    // Scale active beam/weapon loops without touching music/critical one-shots.
    const wDuck = rt._priorityDuckWeapon;
    if (rt.loops) {
      for (const key in rt.loops) {
        const v = rt.loops[key];
        if (!v || !v.gain || !v.gain.gain) continue;
        const isWeaponLoop = key.startsWith('beam_') || v.role === 'weaponLoop'
          || (v.busName === 'combat' && v.loop);
        if (!isWeaponLoop) continue;
        const base = v._baseGain != null ? v._baseGain : (v.callGain != null ? v.callGain : 0.5);
        try {
          v.gain.gain.setTargetAtTime(Math.max(0.0001, base * wDuck), rt.ctx.currentTime, 0.04);
        } catch (_) {}
      }
    }
  },

  _updateSectorCues(now) {
    const rt = this.rt, ctx = rt.ctx;
    if (!ctx || this._isMuted()) return;

    const currentSectorId = this.state.world && this.state.world.currentSectorId;
    const sector = this.state.world && this.state.world.sectors && this.state.world.sectors[currentSectorId];
    const targetClass = getPaletteClassName(sector);
    
    const docked = !!(rt._docked || (this.state.ui && this.state.ui.docked));

    // Sector identity keeps its sparse bells/ticks/swells. The old always-on four-oscillator pad
    // duplicated the adaptive music graph and was the audible startup drone, so it has no runtime
    // route here.
    if (!docked && !rt._paused) {
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
    if (this._motionReduced()) return;

    if (now - (rt._lastMurmurTime || 0) >= 8 + Math.random() * 10) {
      rt._lastMurmurTime = now;
      this._playPAMurmur();
    }
  },

  /**
   * Restrained place accents: sparse station machinery when docked and quiet Helios traffic blips
   * in calm undocked flight. Silence discipline keeps both accents rare and finite.
   */
  _updatePlaceContext(now) {
    const rt = this.rt, ctx = rt.ctx;
    if (!ctx || rt._paused || this._motionReduced()) return;
    if (rt.threat != null && rt.threat >= 0.35) return; // combat owns the mix

    if (rt._docked) {
      if (now - (rt._lastMachineryAt || 0) >= 6 + Math.random() * 8) {
        rt._lastMachineryAt = now;
        this.play('sfx_station_machinery', { gain: 0.12 });
      }
      return;
    }

    const sectorId = this.state.world && this.state.world.currentSectorId;
    const isHelios = sectorId && String(sectorId).includes('helios');
    if (!isHelios) return;
    if (rt.musicState === 'combat' || rt.musicState === 'tense') return;

    if (now - (rt._lastTrafficBlipAt || 0) >= 14 + Math.random() * 18) {
      rt._lastTrafficBlipAt = now;
      this.play('sfx_traffic_blip', { gain: 0.08, rate: 0.9 + Math.random() * 0.25 });
    }
  },

  _playPAMurmur() {
    const rt = this.rt, ctx = rt.ctx;
    if (!ctx) return;

    const syllables = 4 + Math.floor(Math.random() * 5);
    let time = ctx.currentTime;
    // Helios PA sits slightly brighter (still unintelligible).
    const sectorId = this.state.world && this.state.world.currentSectorId;
    const isHelios = sectorId && String(sectorId).includes('helios');
    const base = isHelios ? 390 : 350;
    const peak = isHelios ? 0.012 : 0.015;

    for (let i = 0; i < syllables; i++) {
      const freq = base + Math.random() * 250;
      const dur = 0.08 + Math.random() * 0.12;
      
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = isHelios ? 700 : 600;
      filter.Q.value = 2.0;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(peak, time + 0.01);
      g.gain.setValueAtTime(peak, time + dur - 0.01);
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
