// Profile-level settings persistence. Save slots still carry settings for migration/back-compat, but
// player preferences must also survive before the first save and must not be overwritten by old slots.
// This module is intentionally browser/Electron neutral: both routes use the same localStorage origin.
const PROFILE_FMT = 'spaceface-settings-profile';
export const SETTINGS_PROFILE_KEY = 'sf.settings.profile.v1';
export const SETTINGS_PROFILE_VERSION = 1;

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function restoreSettingsProfile(state, storage = defaultStorage()) {
  if (!state || typeof state !== 'object') return false;
  const settings = readSettingsProfile(storage);
  if (!settings) return false;
  state.settings = mergePlain(state.settings || {}, settings);
  return true;
}

export function readSettingsProfile(storage = defaultStorage()) {
  if (!storage || typeof storage.getItem !== 'function') return null;
  let raw = null;
  try { raw = storage.getItem(SETTINGS_PROFILE_KEY); }
  catch (_) { return null; }
  if (!raw) return null;

  let env = null;
  try { env = JSON.parse(raw); }
  catch (_) { return null; }
  if (!env || env.fmt !== PROFILE_FMT || (env.version | 0) > SETTINGS_PROFILE_VERSION) return null;
  if (!env.settings || typeof env.settings !== 'object' || Array.isArray(env.settings)) return null;
  return clonePlain(env.settings);
}

export function persistSettingsProfile(settings, storage = defaultStorage()) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  const env = {
    fmt: PROFILE_FMT,
    version: SETTINGS_PROFILE_VERSION,
    savedAt: new Date().toISOString(),
    settings: clonePlain(settings || {}),
  };
  try {
    storage.setItem(SETTINGS_PROFILE_KEY, JSON.stringify(env));
    return true;
  } catch (_) {
    return false;
  }
}

export function applySettingsUiScale(settings, target) {
  let scale = Number(settings && settings.uiScale);
  if (!Number.isFinite(scale)) scale = 1;
  scale = Math.max(0.75, Math.min(2, scale));

  const root = target || (typeof document !== 'undefined' ? document.getElementById('ui-root') : null);
  if (root && root.style && typeof root.style.setProperty === 'function') {
    root.style.setProperty('--ui-scale', String(scale));
  }
  return scale;
}

function defaultStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch (_) { /* storage can throw in locked-down browser contexts */ }
  return null;
}

function clonePlain(value) {
  if (value == null) return value;
  const t = typeof value;
  if (t === 'string' || t === 'boolean') return value;
  if (t === 'number') return Number.isFinite(value) ? value : undefined;
  if (t === 'function' || t === 'symbol' || t === 'bigint') return undefined;
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) {
      const clean = clonePlain(item);
      if (clean !== undefined) out.push(clean);
    }
    return out;
  }
  if (t === 'object') {
    const out = {};
    for (const key in value) {
      if (UNSAFE_KEYS.has(key)) continue;
      const clean = clonePlain(value[key]);
      if (clean !== undefined) out[key] = clean;
    }
    return out;
  }
  return undefined;
}

function mergePlain(base, patch) {
  const out = clonePlain(base || {}) || {};
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return out;
  for (const key in patch) {
    if (UNSAFE_KEYS.has(key)) continue;
    const pv = patch[key];
    if (pv && typeof pv === 'object' && !Array.isArray(pv)) {
      out[key] = mergePlain(out[key] && typeof out[key] === 'object' && !Array.isArray(out[key]) ? out[key] : {}, pv);
    } else {
      const clean = clonePlain(pv);
      if (clean !== undefined) out[key] = clean;
    }
  }
  return out;
}
