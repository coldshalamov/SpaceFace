// PQ-164.02 — Deck 1280×800 Settings capture without a 3D window.SF boot.
// Mounts the shipped settings sheet, opens Controls, scrolls the Deck note into view,
// and measures native Deck size + default UI scale through shipped touch.js helpers.
import { createBus } from '../../src/core/eventBus.js';
import { createTimeEffects } from '../../src/core/timeEffects.js';
import { createScreenManager } from '../../src/ui/screenManager.js';
import {
  settingsScreen,
  STEAM_DECK_HEADER,
  STEAM_DECK_NOTE,
} from '../../src/ui/screens/settings.js';
import {
  DECK_CAPTURE_SEED,
  DECK_UI_SCALE,
  DECK_VIEWPORT,
  applyDeckUiScale,
  measureDeckCapture,
} from '../../src/systems/touch.js';
import { ensurePadWalkDocument, makePadWalkState } from './pq16400-gamepad-screens.mjs';

export const SEED = DECK_CAPTURE_SEED;
export { DECK_VIEWPORT, DECK_UI_SCALE, STEAM_DECK_HEADER, STEAM_DECK_NOTE };

function ensureNode(id, parent) {
  let el = document.getElementById(id);
  if (el) return el;
  el = document.createElement('div');
  el.id = id;
  (parent || document.body || document.documentElement).appendChild(el);
  return el;
}

function fillDeckSettings(state) {
  const s = state.settings || (state.settings = {});
  if (s.uiScale == null) s.uiScale = DECK_UI_SCALE;
  s.audio = {
    muted: false, master: 1, sfx: 1, music: 0.4, engine: 0.7, ambient: 0.7, combat: 0.7, ui: 1, comms: 0.7,
    ...(s.audio || {}),
  };
  s.video = {
    renderScale: 1, bloom: true, bloomStrength: 0.52, vsync: true, fov: 50,
    particleQuality: 'medium', engineTrails: true, motionReduce: false, shadows: true,
    energyMaterials: true, renderGraph: false, dynamicResolution: false, qualityPreset: 'medium',
    frameCap: 0, ...(s.video || {}),
  };
  s.gameplay = {
    autosaveIntervalS: 120, tutorialHints: true, difficulty: 'standard',
    physicsBackend: 'rapier-dynamic', aiBackend: 'sg06-tactical', flightBackend: 'v3',
    controlScheme: 'pilot', controlSchemeV2: true, orbitAssistStrength: 'standard',
    masslineReleaseAssist: 'arm', damageNumbers: true, ...(s.gameplay || {}),
  };
  s.controls = {
    bindings: null, flightMode: 'assisted',
    gamepad: { enabled: true, deadzone: 0.12, invertY: false },
    touch: { enabled: null },
    ...(s.controls || {}),
  };
  if (!s.controls.gamepad) s.controls.gamepad = { enabled: true, deadzone: 0.12, invertY: false };
  if (!s.controls.touch) s.controls.touch = { enabled: null };
  s.accessibility = {
    colorblindMode: 'none', highContrast: false, flashReduce: false, dyslexiaFont: false,
    motionPreference: 'system', captions: true, audioCues: true, captionSize: 'medium',
    captionBackground: true, ...(s.accessibility || {}),
  };
  return s;
}

function layoutBox(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return null;
  try { return el.getBoundingClientRect(); } catch { return null; }
}

function hasLayout(box) {
  if (!box) return false;
  return Number(box.width) > 0 || Number(box.height) > 0 || Number(box.top) !== 0 || Number(box.bottom) !== 0;
}

function noteInViewport(el, height) {
  const box = layoutBox(el);
  if (!hasLayout(box)) return !!el;
  const viewH = Number(height) || DECK_VIEWPORT.height;
  return box.bottom > 0 && box.top < viewH && Number(box.width) > 0;
}

function readUiScale(root) {
  if (root && root.style && typeof root.style.getPropertyValue === 'function') {
    const raw = root.style.getPropertyValue('--ui-scale');
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DECK_UI_SCALE;
}

function measureOverflow(width) {
  const doc = document.documentElement;
  const body = document.body;
  const client = Number(doc && doc.clientWidth) || 0;
  const scroll = Math.max(
    Number(doc && doc.scrollWidth) || 0,
    Number(body && body.scrollWidth) || 0,
  );
  if (client <= 0 && scroll <= 0) return 0;
  const basis = client > 0 ? client : Number(width) || DECK_VIEWPORT.width;
  return Math.max(0, scroll - basis);
}

export function runDeckSettingsCapture({
  seed = SEED,
  width = DECK_VIEWPORT.width,
  height = DECK_VIEWPORT.height,
  uiScale = DECK_UI_SCALE,
} = {}) {
  ensurePadWalkDocument();
  const uiRoot = ensureNode('ui-root');
  ensureNode('screens', uiRoot);
  ensureNode('modal-backdrop', uiRoot);
  ensureNode('hud', uiRoot);
  ensureNode('sf-confirm-root');
  applyDeckUiScale(uiRoot, uiScale);

  const bus = createBus();
  const state = makePadWalkState(seed);
  fillDeckSettings(state);
  state.settings.uiScale = uiScale;
  const timeEffects = createTimeEffects(state);
  const ctx = { state, bus, timeEffects, registry: null, helpers: {}, seed };
  const screenManager = createScreenManager(ctx);
  ctx.screenManager = screenManager;
  screenManager.register(settingsScreen);
  while (screenManager.isOpen && screenManager.isOpen()) {
    try { screenManager.popScreen(); } catch { break; }
  }
  screenManager.pushScreen('settings');
  if (typeof settingsScreen._select === 'function') settingsScreen._select(ctx, 'Controls');

  const root = document.querySelector('[data-screen="settings"]');
  const header = root && root.querySelector('[data-sf-deck="header"]');
  const note = root && root.querySelector('[data-sf-deck="note"]');
  const pane = root && (root.querySelector('#sf-settings-pane') || root.querySelector('.sf-settings-pane'));
  if (header && typeof header.scrollIntoView === 'function') {
    try { header.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch { /* mini-dom */ }
  }
  if (note && typeof note.scrollIntoView === 'function') {
    try { note.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch { /* mini-dom */ }
  }
  if (pane && note && Number.isFinite(note.offsetTop)) {
    try { pane.scrollTop = Math.max(0, note.offsetTop - 24); } catch { /* mini-dom */ }
  }

  const text = `${(header && header.textContent) || ''} ${(note && note.textContent) || ''}`;
  const noteVisible = !!(note && (note.textContent || '').includes('1280'))
    && text.includes(STEAM_DECK_HEADER);
  const report = measureDeckCapture({
    width,
    height,
    uiScale: readUiScale(uiRoot),
    overflowX: measureOverflow(width),
    overflowY: 0,
    noteVisible,
    noteInView: noteVisible && noteInViewport(note, height),
  });
  report.header = STEAM_DECK_HEADER;
  report.note = STEAM_DECK_NOTE;
  report.screen = !!(root && (!root.style || root.style.display !== 'none'));
  report.tab = 'Controls';
  return report;
}
