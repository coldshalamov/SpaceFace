// Graphics/profile settings must be visible before createRegistry() selects and initializes
// renderer/VFX systems. This boundary is deliberately read-only: boot must never rewrite the raw
// localStorage profile merely because it consumed it.

export const PROFILE_SETTINGS_KEY = 'sf.settings.profile.v1';
export const MASSLINE_BINDING_PROFILE_SPACE = 'space-v1';
export const MASSLINE_BINDING_PROFILE_LEGACY = 'legacy-f-v1';
export const AUDIO_DEFAULT_MUTE_VERSION = 2;
export const GAME_MOTION_DEFAULT_VERSION = 1;
export const SHADOWS_DEFAULT_VERSION = 1;

const LOCKED_GAMEPLAY_KEYS = Object.freeze([
  'physicsBackend',
  'aiBackend',
  'flightBackend',
]);

export function readProfileSettings(storage = globalThis.localStorage) {
  if (!storage || typeof storage.getItem !== 'function') return null;
  try {
    const raw = storage.getItem(PROFILE_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !isPlainObject(parsed.settings)) return null;
    return clonePlain(parsed.settings);
  } catch {
    return null;
  }
}

/** Keep the shipped Massline command stable across fresh and already-migrated profiles. */
export function migrateLegacyMasslineBindingProfile(settings) {
  if (!isPlainObject(settings)) return settings;
  if (!isPlainObject(settings.controls)) settings.controls = {};
  const controls = settings.controls;
  if (controls.masslineBindingProfile === MASSLINE_BINDING_PROFILE_SPACE) {
    return settings;
  }

  const bindings = isPlainObject(controls.bindings) ? controls.bindings : {};
  bindings.tether = ['Space', 'KeyF'];
  for (const action of Object.keys(bindings)) {
    if (action === 'tether' || !Array.isArray(bindings[action])) continue;
    bindings[action] = bindings[action].filter((code) => code !== 'Space');
  }
  controls.bindings = bindings;
  controls.masslineBindingProfile = MASSLINE_BINDING_PROFILE_SPACE;
  return settings;
}

/**
 * Action audio is on by default (PQ-158.06 landed the minimal combat sound pass; PQ-210.04 makes
 * the demo audible). Version 1 of this policy force-muted every older profile once because the
 * procedural-only stack was opt-in; v2 reverses that default for the same reason — a profile that
 * predates the policy cannot distinguish an intentional mute from the old audible default. The
 * one-time stamp still protects every choice made under the current version: a player who mutes
 * after this migration keeps the current version on their profile and is never touched again.
 * A stamp from a NEWER policy version is left alone — its semantics belong to that version.
 */
export function migrateDefaultMutedAudioProfile(settings) {
  if (!isPlainObject(settings)) return settings;
  if (!isPlainObject(settings.audio)) settings.audio = {};
  const stamp = settings.audio.defaultMuteVersion;
  if (typeof stamp !== 'number' || stamp < AUDIO_DEFAULT_MUTE_VERSION) {
    settings.audio.muted = false;
    settings.audio.defaultMuteVersion = AUDIO_DEFAULT_MUTE_VERSION;
  }
  return settings;
}

/**
 * Motion effects default to FULL; the operating-system hint is an explicit opt-in.
 *
 * 'system' used to be the silent default, and Chromium reports prefers-reduced-motion whenever
 * Windows "Animation effects" is off — a tweak many players make so their desktop feels snappier,
 * with no vestibular need at all. On those machines the game stripped hit-stop, camera trauma, FOV
 * punch, muzzle and impact lights, heat haze, projectile shimmer and the turning of force fields
 * without the player ever touching a setting: combat read as limp, and a Well was a frozen swirl
 * sliding across the screen. No profile written before this version could have chosen 'system'
 * knowingly, so those receive one migration to 'full'. An explicit Reduce is always kept, and a
 * later explicit pick of System carries the current version and remains the player's choice.
 */
export function migrateGameMotionDefault(settings) {
  if (!isPlainObject(settings)) return settings;
  if (!isPlainObject(settings.accessibility)) settings.accessibility = {};
  const access = settings.accessibility;
  if (access.motionDefaultVersion === GAME_MOTION_DEFAULT_VERSION) return settings;
  const video = isPlainObject(settings.video) ? settings.video : null;
  // Profiles older than motionPreference carried only the effective boolean, and there a true was
  // an explicit player choice. Alongside 'system' the same boolean is only the mirrored OS hint.
  const explicitReduce = access.motionPreference === 'reduce'
    || (access.motionPreference == null && !!(video && video.motionReduce === true));
  access.motionPreference = explicitReduce ? 'reduce' : 'full';
  if (video) video.motionReduce = explicitReduce;
  access.motionDefaultVersion = GAME_MOTION_DEFAULT_VERSION;
  return settings;
}

/**
 * Sun shadow-maps default OFF. The live shadow pass renders a single low-res directional map
 * over the local table neighbourhood; at that texel density it read as crawling miscolored
 * clumps on hulls rather than depth (owner report, 2026-09-21). Grounding is carried by the
 * pooled contact shadow and the four-light rig, so the default picture drops the depth pass.
 * Profiles written before this policy cannot distinguish a deliberate shadows:true from the old
 * default, so they all receive one migration to off — the Settings toggle (and the Quality
 * preset) remains live-applied for anyone who wants the extra pass, and a stamp from a NEWER
 * policy version is left alone.
 */
export function migrateDefaultShadowsProfile(settings) {
  if (!isPlainObject(settings)) return settings;
  if (!isPlainObject(settings.video)) settings.video = {};
  const video = settings.video;
  const stamp = video.shadowsDefaultVersion;
  if (typeof stamp !== 'number' || stamp < SHADOWS_DEFAULT_VERSION) {
    video.shadows = false;
    video.shadowsDefaultVersion = SHADOWS_DEFAULT_VERSION;
  }
  return settings;
}

export function mergeProfileSettings(baseSettings, profileSettings) {
  const base = isPlainObject(baseSettings) ? baseSettings : {};
  const merged = mergePlain(base, isPlainObject(profileSettings) ? profileSettings : {});

  // Runtime backend selection is a build contract, not a player-profile choice. Preserve the
  // createGameState defaults even if a hand-edited/legacy profile contains these keys.
  if (!isPlainObject(merged.gameplay)) merged.gameplay = {};
  const baseGameplay = isPlainObject(base.gameplay) ? base.gameplay : {};
  for (const key of LOCKED_GAMEPLAY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(baseGameplay, key)) merged.gameplay[key] = baseGameplay[key];
  }
  return merged;
}

export function bootstrapProfileSettingsBeforeRegistry(state, storage = globalThis.localStorage) {
  if (!state || !isPlainObject(state.settings)) return false;
  const profile = migrateDefaultShadowsProfile(migrateGameMotionDefault(migrateDefaultMutedAudioProfile(
    migrateLegacyMasslineBindingProfile(readProfileSettings(storage)),
  )));
  if (!profile) return false;
  state.settings = mergeProfileSettings(state.settings, profile);
  return true;
}

function mergePlain(base, patch) {
  const out = clonePlain(base);
  for (const key of Object.keys(patch)) {
    if (isUnsafeKey(key)) continue;
    const value = patch[key];
    if (isPlainObject(value)) {
      out[key] = mergePlain(isPlainObject(out[key]) ? out[key] : {}, value);
    } else {
      out[key] = clonePlain(value);
    }
  }
  return out;
}

function clonePlain(value) {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (Array.isArray(value)) return value.map(clonePlain);
  if (!isPlainObject(value)) return undefined;
  const out = {};
  for (const key of Object.keys(value)) {
    if (isUnsafeKey(key)) continue;
    const cloned = clonePlain(value[key]);
    if (cloned !== undefined) out[key] = cloned;
  }
  return out;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isUnsafeKey(key) {
  return key === '__proto__' || key === 'constructor' || key === 'prototype';
}
