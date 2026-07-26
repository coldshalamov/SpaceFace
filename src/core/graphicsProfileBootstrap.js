// Graphics/profile settings must be visible before createRegistry() selects and initializes
// renderer/VFX systems. This boundary is deliberately read-only: boot must never rewrite the raw
// localStorage profile merely because it consumed it.

export const PROFILE_SETTINGS_KEY = 'sf.settings.profile.v1';
export const MASSLINE_BINDING_PROFILE_SPACE = 'space-v1';
export const MASSLINE_BINDING_PROFILE_LEGACY = 'legacy-f-v1';

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
  const profile = migrateLegacyMasslineBindingProfile(readProfileSettings(storage));
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
