// PQ-033.03 Steamworks adapter for the Electron shell.
//
// steamworks.js is an OPTIONAL native binding. It is deliberately NOT a package.json dependency: a
// native addon changes packaging (the .node file must be unpacked from the asar and the Steam API
// redistributable must sit beside it), so it is added on purpose for the Steam build only — see
// build/steam/README.md. When the binding is absent, Steam is not running, the launch is an
// isolated evidence run, or the player disabled it, every call is a clean no-op that reports
// { available: false, reason }.
//
// Nothing here touches the binding at require time. It loads lazily on first use, so the unpackaged
// dev shell, the vm-sandboxed shell tests and packaged non-Steam builds never load a native module.
//
// The renderer can ask for exactly two things over the preload bridge: "unlock this achievement id"
// and "what is the Steam status". Ids are validated against electron/steamAchievements.json, which
// scripts/export-steam-achievements.mjs generates from src/data/achievements.js — no path, no free
// text and no API name ever crosses from the renderer.
'use strict';

const fs = require('fs');
const path = require('path');

const ACHIEVEMENT_UNLOCK_CHANNEL = 'spaceface:achievement-unlock';
const STEAM_STATUS_CHANNEL = 'spaceface:steam-status';
const STEAM_ACHIEVEMENT_TABLE_SCHEMA = 'spaceface.steamAchievements.v1';
const STEAM_ACHIEVEMENT_TABLE_FILE = path.join(__dirname, 'steamAchievements.json');
const ACHIEVEMENT_ID_RE = /^[a-z][a-z0-9_]{2,47}$/;
const STEAM_API_NAME_RE = /^SF_[A-Z0-9_]{2,60}$/;
const STEAM_APP_ID_RE = /^[1-9][0-9]{0,9}$/;
const DISTRIBUTION_STEAM = 'steam';
const DISTRIBUTION_DIRECT = 'direct';
/** Keeps the overlay switches off. Windows Steam launch options carry arguments, not environment variables. */
const STEAM_OVERLAY_OFF_ARGUMENT = '--no-steam-overlay';

function loadSteamAchievementTable({ file = STEAM_ACHIEVEMENT_TABLE_FILE, fsImpl = fs } = {}) {
  let parsed;
  try {
    parsed = JSON.parse(fsImpl.readFileSync(file, 'utf8'));
  } catch (_) {
    return new Map();
  }
  if (!parsed || parsed.schema !== STEAM_ACHIEVEMENT_TABLE_SCHEMA || !Array.isArray(parsed.achievements)) {
    return new Map();
  }
  const table = new Map();
  for (const row of parsed.achievements) {
    if (!row || typeof row.id !== 'string' || typeof row.apiName !== 'string') continue;
    if (!ACHIEVEMENT_ID_RE.test(row.id) || !STEAM_API_NAME_RE.test(row.apiName)) continue;
    table.set(row.id, row.apiName);
  }
  return table;
}

/** The renderer may send exactly `{ id }`. Anything else is refused before Steam is touched. */
function normalizeAchievementUnlockPayload(payload, table) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'payload must be an object { id }' };
  }
  const keys = Object.keys(payload);
  if (keys.length !== 1 || keys[0] !== 'id') {
    return { ok: false, error: 'payload may carry only id' };
  }
  const id = payload.id;
  if (typeof id !== 'string' || !ACHIEVEMENT_ID_RE.test(id)) {
    return { ok: false, error: 'id must be a known lowercase achievement id' };
  }
  const apiName = table instanceof Map ? table.get(id) : null;
  if (!apiName) return { ok: false, error: 'unknown achievement id' };
  return { ok: true, id, apiName };
}

/**
 * 'steam' when the packaged package.json was stamped by `npm run dist:steam`
 * (extraMetadata.spacefaceDistribution) or SPACEFACE_DISTRIBUTION=steam; otherwise 'direct'.
 */
function resolveDistribution({
  env = process.env,
  packageJsonPath = path.join(__dirname, '..', 'package.json'),
  fsImpl = fs,
} = {}) {
  const forced = String((env && env.SPACEFACE_DISTRIBUTION) || '').trim().toLowerCase();
  if (forced === DISTRIBUTION_STEAM || forced === DISTRIBUTION_DIRECT) return forced;
  try {
    const pkg = JSON.parse(fsImpl.readFileSync(packageJsonPath, 'utf8'));
    return pkg && pkg.spacefaceDistribution === DISTRIBUTION_STEAM ? DISTRIBUTION_STEAM : DISTRIBUTION_DIRECT;
  } catch (_) {
    return DISTRIBUTION_DIRECT;
  }
}

/** Dev launches outside the Steam client pin the app id here; Steam itself supplies it otherwise. */
function resolveSteamAppId(env = process.env) {
  const raw = String((env && env.SPACEFACE_STEAM_APP_ID) || '').trim();
  return STEAM_APP_ID_RE.test(raw) ? Number(raw) : null;
}

function loadSteamworksBinding(requireImpl = require) {
  try {
    return requireImpl('steamworks.js');
  } catch (_) {
    return null;
  }
}

function readCloudFlags(client) {
  const cloud = client && client.cloud;
  if (!cloud) return null;
  const flag = (name) => {
    try {
      return typeof cloud[name] === 'function' ? cloud[name]() === true : null;
    } catch (_) {
      return null;
    }
  };
  return { enabledForAccount: flag('isEnabledForAccount'), enabledForApp: flag('isEnabledForApp') };
}

function createSteamworksAdapter({
  env = process.env,
  argv = process.argv,
  distribution = DISTRIBUTION_DIRECT,
  disabledReason = null,
  loadBinding = loadSteamworksBinding,
  table = null,
  receipt = null,
} = {}) {
  const log = typeof receipt === 'function' ? receipt : () => {};
  const achievements = table instanceof Map ? table : loadSteamAchievementTable();
  let binding;
  let client = null;
  let initialized = false;
  let status = Object.freeze({ available: false, reason: 'not-initialized' });

  function bindingOnce() {
    if (binding === undefined) binding = loadBinding() || null;
    return binding;
  }

  function unavailable(reason) {
    status = Object.freeze({ available: false, reason });
    return status;
  }

  function init() {
    if (initialized) return status;
    initialized = true;
    if (disabledReason) return unavailable(disabledReason);
    if (String((env && env.SPACEFACE_STEAM) || '').trim() === '0') return unavailable('disabled-by-env');
    const sdk = bindingOnce();
    if (!sdk || typeof sdk.init !== 'function') return unavailable('sdk-absent');
    const appId = resolveSteamAppId(env);
    try {
      client = appId != null ? sdk.init(appId) : sdk.init();
    } catch (error) {
      // SteamAPI_Init fails when the Steam client is not running or the app id is unknown: that is a
      // player without Steam, not a shell fault.
      log('steam-unavailable', { reason: 'steam-not-running', message: String((error && error.message) || error).slice(0, 300) });
      return unavailable('steam-not-running');
    }
    if (!client || !client.achievement || typeof client.achievement.activate !== 'function') {
      return unavailable('sdk-incomplete');
    }
    status = Object.freeze({ available: true, reason: 'ok', cloud: readCloudFlags(client) });
    log('steam-ready', { achievements: achievements.size, distribution });
    return status;
  }

  function unlockAchievement(payload) {
    const normalized = normalizeAchievementUnlockPayload(payload, achievements);
    if (!normalized.ok) return { ok: false, error: normalized.error };
    const current = init();
    if (!current.available) return { ok: false, available: false, reason: current.reason, id: normalized.id };
    const api = client.achievement;
    try {
      if (typeof api.isActivated === 'function' && api.isActivated(normalized.apiName) === true) {
        return { ok: true, available: true, id: normalized.id, already: true };
      }
      if (api.activate(normalized.apiName) !== true) {
        return { ok: false, available: true, reason: 'activate-rejected', id: normalized.id };
      }
    } catch (error) {
      log('steam-achievement-failed', { id: normalized.id, message: String((error && error.message) || error).slice(0, 300) });
      return { ok: false, available: true, reason: 'activate-threw', id: normalized.id };
    }
    log('steam-achievement', { id: normalized.id, apiName: normalized.apiName });
    return { ok: true, available: true, id: normalized.id, already: false };
  }

  /** Public view only: availability, why not, which distribution, cloud flags. No paths, no ids. */
  function publicStatus() {
    const current = init();
    return {
      available: current.available,
      reason: current.reason,
      distribution,
      achievements: achievements.size,
      cloud: current.available ? current.cloud : null,
    };
  }

  /**
   * The Steam overlay needs Chromium switches before app 'ready': steamworks.js appends
   * in-process-gpu and disable-direct-composition and asks every window to repaint at 60 Hz so the
   * overlay keeps drawing over still screens. Steam builds only, so direct builds never pay for it.
   * `--no-steam-overlay` (a Steam launch option) or SPACEFACE_STEAM_OVERLAY=0 keeps it off; achievements
   * still unlock without it.
   */
  function enableOverlay() {
    if (disabledReason) return { enabled: false, reason: disabledReason };
    if (distribution !== DISTRIBUTION_STEAM) return { enabled: false, reason: 'not-steam-distribution' };
    if (String((env && env.SPACEFACE_STEAM_OVERLAY) || '').trim() === '0') return { enabled: false, reason: 'disabled-by-env' };
    if (Array.isArray(argv) && argv.includes(STEAM_OVERLAY_OFF_ARGUMENT)) return { enabled: false, reason: 'disabled-by-argument' };
    const sdk = bindingOnce();
    if (!sdk || typeof sdk.electronEnableSteamOverlay !== 'function') return { enabled: false, reason: 'sdk-absent' };
    try {
      sdk.electronEnableSteamOverlay();
    } catch (error) {
      log('steam-overlay-failed', { message: String((error && error.message) || error).slice(0, 300) });
      return { enabled: false, reason: 'overlay-threw' };
    }
    log('steam-overlay-enabled', {});
    return { enabled: true };
  }

  /**
   * PQ-172.01: the UGC namespace for the Workshop bridge. Returns null unless Steam is live and
   * the binding carries the workshop surface — callers treat null exactly like any other
   * unavailable reason. Never exposed to the renderer; only electron/workshopMods.cjs consumes it.
   */
  function workshop() {
    const current = init();
    if (!current.available || !client) return null;
    const api = client.workshop;
    if (!api
      || typeof api.createItem !== 'function'
      || typeof api.updateItem !== 'function'
      || typeof api.getSubscribedItems !== 'function'
      || typeof api.subscribe !== 'function') {
      return null;
    }
    return api;
  }

  return Object.freeze({ init, unlockAchievement, publicStatus, enableOverlay, workshop, distribution });
}

module.exports = {
  ACHIEVEMENT_UNLOCK_CHANNEL,
  DISTRIBUTION_DIRECT,
  DISTRIBUTION_STEAM,
  STEAM_ACHIEVEMENT_TABLE_FILE,
  STEAM_ACHIEVEMENT_TABLE_SCHEMA,
  STEAM_OVERLAY_OFF_ARGUMENT,
  STEAM_STATUS_CHANNEL,
  createSteamworksAdapter,
  loadSteamAchievementTable,
  loadSteamworksBinding,
  normalizeAchievementUnlockPayload,
  resolveDistribution,
  resolveSteamAppId,
};
