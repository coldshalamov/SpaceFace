// Persist player-facing settings outside save slots so accessibility/audio/input trust survives
// browser refreshes, Electron restarts, New Game, and loading older saves. This system owns only a
// tiny localStorage mirror; state.settings remains the authoritative live settings tree.
const PREFS_KEY = 'sf.settings.prefs.v1';
const TOP_LEVEL_KEYS = new Set(['uiScale', 'showDamageNumbers', 'audio', 'video', 'gameplay', 'controls', 'accessibility']);

export const SETTINGS_PREFS_KEY = PREFS_KEY;

export const settingsPrefs = {
  name: 'settingsPrefs',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    restoreSettingsPrefs(this.state.settings);

    this.bus.on('settings:changed', () => {
      persistSettingsPrefs(this.state.settings);
    });

    // Loading a slot can carry stale per-save settings. Reapply the global preference mirror so
    // accessibility/audio/input choices made at the title screen do not silently regress on load.
    this.bus.on('save:loaded', () => {
      if (restoreSettingsPrefs(this.state.settings)) {
        this.bus.emit('settings:prefsRestored', { source: 'save:loaded' });
        this.bus.emit('settings:changed', { section: 'prefs', key: 'restored', value: true });
      }
    });
  },
};

export function persistSettingsPrefs(settings, storage = defaultStorage()) {
  if (!storage || !settings) return false;
  const snapshot = settingsPrefsSnapshot(settings);
  try {
    storage.setItem(PREFS_KEY, JSON.stringify(snapshot));
    return true;
  } catch (_) {
    return false;
  }
}

export function restoreSettingsPrefs(settings, storage = defaultStorage()) {
  if (!storage || !settings) return false;
  let raw = null;
  try { raw = storage.getItem(PREFS_KEY); } catch (_) { return false; }
  if (!raw) return false;
  let prefs;
  try { prefs = JSON.parse(raw); } catch (_) { return false; }
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) return false;
  mergePrefsIntoSettings(settings, prefs);
  return true;
}

export function settingsPrefsSnapshot(settings) {
  const out = {};
  if (!settings || typeof settings !== 'object') return out;
  for (const key of TOP_LEVEL_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(settings, key)) continue;
    const value = clonePrefsValue(settings[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function mergePrefsIntoSettings(settings, prefs) {
  for (const key of TOP_LEVEL_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(prefs, key)) continue;
    const value = clonePrefsValue(prefs[key]);
    if (value === undefined) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const base = settings[key] && typeof settings[key] === 'object' && !Array.isArray(settings[key])
        ? settings[key]
        : {};
      settings[key] = mergePlainPrefs(base, value);
    } else {
      settings[key] = value;
    }
  }
}

function mergePlainPrefs(base, patch) {
  const out = clonePrefsValue(base) || {};
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return out;
  for (const key in patch) {
    if (isUnsafeKey(key)) continue;
    const value = clonePrefsValue(patch[key]);
    if (value === undefined) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = mergePlainPrefs(out[key] && typeof out[key] === 'object' && !Array.isArray(out[key]) ? out[key] : {}, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function clonePrefsValue(value) {
  if (value == null) return value;
  const type = typeof value;
  if (type === 'number') return Number.isFinite(value) ? value : undefined;
  if (type === 'string' || type === 'boolean') return value;
  if (Array.isArray(value)) {
    const arr = [];
    for (const item of value) {
      const cloned = clonePrefsValue(item);
      if (cloned !== undefined) arr.push(cloned);
    }
    return arr;
  }
  if (type === 'object') {
    const out = {};
    for (const key in value) {
      if (isUnsafeKey(key)) continue;
      const cloned = clonePrefsValue(value[key]);
      if (cloned !== undefined) out[key] = cloned;
    }
    return out;
  }
  return undefined;
}

function isUnsafeKey(key) {
  return key === '__proto__' || key === 'constructor' || key === 'prototype';
}

function defaultStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch (_) {
    return null;
  }
}
