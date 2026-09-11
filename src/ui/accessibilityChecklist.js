/**
 * PQ-165.02 — in-app accessibility statement + per-screen checklist.
 * Flags are read from live settings paths (same as applyAccessibility / Settings Access).
 * Missing keys are not ok. Per-screen rows measure document a11y classes plus whether
 * the screen is a registered kit surface that inherits those classes.
 */
import { applyAccessibility } from './accessibility.js';

export const CHECKLIST_SEED = 16502;
export const ACCESSIBILITY_STATEMENT_ID = 'accessibility-statement';
export const ACCESSIBILITY_STATEMENT_ROUTE = Object.freeze({
  from: 'settings',
  tab: 'Access',
  action: 'open-accessibility-statement',
  id: ACCESSIBILITY_STATEMENT_ID,
});

export const CHECKLIST_CAPABILITIES = Object.freeze([
  'contrast', 'motion', 'remap', 'textScale', 'assists', 'captions',
]);

export const CHECKLIST_ITEMS = Object.freeze([
  Object.freeze({ id: 'contrast', label: 'Contrast', settingsKey: 'accessibility.highContrast' }),
  Object.freeze({ id: 'motion', label: 'Reduced motion', settingsKey: 'accessibility.motionPreference' }),
  Object.freeze({ id: 'remap', label: 'Control remap', settingsKey: 'gameplay.controlScheme' }),
  Object.freeze({ id: 'textScale', label: 'Text scale', settingsKey: 'uiScale' }),
  Object.freeze({ id: 'assists', label: 'Assists', settingsKey: 'gameplay.orbitAssistStrength' }),
  Object.freeze({ id: 'captions', label: 'Captions', settingsKey: 'accessibility.captions' }),
]);

/** Registered player screens that inherit documentElement a11y classes via #screens / #hud. */
export const CHECKLIST_SCREENS = Object.freeze([
  'hud', 'settings', 'pause', 'mainMenu', 'help', 'station', 'galaxyMap',
  'crucible', 'codex', 'missionLog', 'saveLoad', 'gameOver', 'newGame', 'credits',
]);

function readPath(settings, dotted) {
  const parts = String(dotted).split('.');
  let cursor = settings;
  for (const part of parts) {
    if (!cursor || typeof cursor !== 'object') return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

/** Live flags from state.settings. Unset keys are false, never silently true. */
export function flagsFromSettings(settings = {}) {
  const ac = settings.accessibility && typeof settings.accessibility === 'object'
    ? settings.accessibility
    : {};
  const video = settings.video && typeof settings.video === 'object' ? settings.video : {};
  const gameplay = settings.gameplay && typeof settings.gameplay === 'object'
    ? settings.gameplay
    : {};
  const contrast = ac.highContrast === true;
  const motion = ac.motionPreference === 'reduce' || video.motionReduce === true;
  const remap = typeof gameplay.controlScheme === 'string' && gameplay.controlScheme.length > 0;
  const textScale = Number.isFinite(Number(settings.uiScale)) && Number(settings.uiScale) > 0;
  const assists = gameplay.orbitAssistStrength !== 'off' && gameplay.orbitAssistStrength != null;
  const captions = Object.prototype.hasOwnProperty.call(ac, 'captions')
    ? ac.captions === true
    : false;
  return { contrast, motion, remap, textScale, assists, captions };
}

export function evaluateChecklist(settingsOrFlags = {}) {
  const looksLikeSettings = !!(settingsOrFlags.accessibility || settingsOrFlags.gameplay
    || settingsOrFlags.video || Object.prototype.hasOwnProperty.call(settingsOrFlags, 'uiScale'));
  const flags = looksLikeSettings ? flagsFromSettings(settingsOrFlags) : settingsOrFlags;
  const rows = CHECKLIST_ITEMS.map((item) => ({
    id: item.id,
    label: item.label,
    ok: flags[item.id] === true,
    settingsKey: item.settingsKey,
    value: looksLikeSettings ? readPath(settingsOrFlags, item.settingsKey) : flags[item.id],
  }));
  const missing = rows.filter((row) => !row.ok).map((row) => row.id);
  return {
    green: missing.length === 0,
    rows,
    missing,
  };
}

export function statementReachableFromSettings(settingsScreen) {
  if (settingsScreen && typeof settingsScreen === 'string') {
    return settingsScreen.includes('Access')
      && (settingsScreen.includes(ACCESSIBILITY_STATEMENT_ID)
        || settingsScreen.includes('ACCESSIBILITY_STATEMENT_ID'));
  }
  const tabs = settingsScreen && Array.isArray(settingsScreen.tabs) ? settingsScreen.tabs : [];
  const items = settingsScreen && Array.isArray(settingsScreen.accessItems)
    ? settingsScreen.accessItems
    : [];
  const hasAccess = tabs.includes('Access') || tabs.includes('access');
  const hasStatement = items.some((row) => row === ACCESSIBILITY_STATEMENT_ID || row.id === ACCESSIBILITY_STATEMENT_ID);
  return !!(hasAccess && hasStatement);
}

/**
 * Per-screen support: a screen inherits documentElement classes from applyAccessibility
 * when it is a registered kit surface. The live flags still have to be on for the row
 * to be green — an all-true authored table is not a measurement.
 */
export function measureScreen(screenId, settings, applied = null) {
  const registered = CHECKLIST_SCREENS.includes(screenId);
  const flags = flagsFromSettings(settings);
  const live = applied || applyAccessibility(settings, null);
  return {
    screen: screenId,
    registered,
    contrast: registered && flags.contrast && live.highContrast === true,
    motion: registered && flags.motion && live.motionReduced === true,
    remap: registered && flags.remap,
    textScale: registered && flags.textScale,
    assists: registered && flags.assists,
    captions: registered && flags.captions && live.captions === true,
    statement: screenId === 'settings' && registered,
  };
}

export function screenCapabilityChecklist(settings = {}) {
  const applied = applyAccessibility(settings, null);
  const flags = evaluateChecklist(settings);
  const rows = CHECKLIST_SCREENS.map((id) => {
    const measured = measureScreen(id, settings, applied);
    const missing = CHECKLIST_CAPABILITIES.filter((cap) => measured[cap] !== true);
    return {
      ...measured,
      green: missing.length === 0,
      missing,
    };
  });
  return {
    green: flags.green && rows.every((row) => row.green),
    flags: flags.rows,
    rows,
    statementRoute: ACCESSIBILITY_STATEMENT_ROUTE,
  };
}
