// The browser tab names the flight you are in. It changes when the mode or the
// sector changes. It does not follow the sim tick, and it never prints a seed,
// a frame rate, an entity id, or any other debug field.

import { SECTORS } from '../data/sectors.js';
import { activeAuthoredRace } from '../systems/racingSteer.js';

export const MENU_TITLE = 'SpaceFace';

// Player words only. An unknown ruleset or kind is not a label — printing it
// would put a raw id in the window title.
const RULESET_LABEL = Object.freeze({
  swarm: 'Swarm',
  scored: 'Gauntlet',
  boss_circuit: 'Boss circuit',
  block: 'Foundry Block',
});

const KIND_LABEL = Object.freeze({
  adventure: 'Adventure',
  campaign: 'Adventure',
  survival: 'Crucible',
});

const ALLOWED_LABELS = new Set([
  'Adventure', 'Swarm', 'Gauntlet', 'Boss circuit', 'Foundry Block',
  'Racing', 'Crucible', 'Flight',
]);

// Mode and sector changes. Never a per-tick event.
const TITLE_EVENTS = Object.freeze([
  'mode:changed',
  'sector:enter',
  'game:exitToMenu',
  'game:started',
  'run:started',
  'run:ended',
  'mission:accepted',
  'mission:updated',
  'save:loaded',
]);

function cleanMenuTitle(value) {
  if (typeof value !== 'string') return MENU_TITLE;
  const text = value.trim();
  if (!text || text.length > 48 || text.includes('_') || text.includes('—')) return MENU_TITLE;
  return text;
}

// A place name the player already sees. Ids, placeholders, and bare tokens stay off the title.
export function displaySector(value) {
  if (typeof value !== 'string') return '';
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || text === '—' || text === '-' || text === '–') return '';
  if (text.length > 64 || text.includes('_') || /^sector\b/i.test(text)) return '';
  if (!/[A-Za-z]/.test(text)) return '';
  if (text === text.toLowerCase() && !text.includes(' ')) return '';
  return text;
}

function resolveLabel(view) {
  if (!view || typeof view !== 'object') return null;
  if (typeof view.modeLabel === 'string' && ALLOWED_LABELS.has(view.modeLabel)) return view.modeLabel;
  if (view.racing === true) return 'Racing';
  const ruleset = typeof view.ruleset === 'string' ? RULESET_LABEL[view.ruleset] : null;
  if (ruleset) return ruleset;
  const kind = typeof view.runKind === 'string' ? KIND_LABEL[view.runKind] : null;
  if (kind) return kind;
  if (view.mode === 'flight' || view.mode === 'paused') return 'Flight';
  return null;
}

export function composeWindowTitle(view, menuTitle = MENU_TITLE) {
  const menu = cleanMenuTitle(menuTitle);
  if (!view || view.shell === true) return menu;
  const mode = typeof view.mode === 'string' ? view.mode : '';
  if (mode !== 'flight' && mode !== 'paused') return menu;
  const label = resolveLabel(view);
  const sector = displaySector(view.sectorName);
  if (!label || !sector) return menu;
  return `${label} — ${sector}`;
}

export function syncWindowTitle(doc, view, menuTitle = MENU_TITLE) {
  const next = composeWindowTitle(view, menuTitle);
  if (doc && doc.title !== next) doc.title = next;
  return next;
}

// Resolve authored names from the game even when the command bar is not mounted.
export function readWindowTitleView(state) {
  const id = state?.world?.currentSectorId;
  const sector = id ? SECTORS.find(item => item.id === id) : null;
  return {
    mode: state?.mode,
    sectorName: sector?.name || '',
    runKind: state?.run?.kind,
    ruleset: state?.run?.ruleset,
    racing: state?.run?.kind !== 'survival' && !!activeAuthoredRace(state),
  };
}

export function installWindowTitle(doc, options = {}) {
  const menuTitle = cleanMenuTitle(options.menuTitle != null ? options.menuTitle : doc?.title);
  const read = typeof options.read === 'function' ? options.read : () => null;
  // Worker mode edges can precede the state mirror, just as in screenManager.
  let publishedMode = null;
  const apply = () => {
    const view = read();
    return syncWindowTitle(doc, publishedMode ? { ...view, mode: publishedMode } : view, menuTitle);
  };
  const offs = [];
  const bus = options.bus;
  if (bus && typeof bus.on === 'function') {
    for (const name of TITLE_EVENTS) {
      const off = bus.on(name, (payload) => {
        if (name === 'mode:changed' && typeof payload?.mode === 'string') publishedMode = payload.mode;
        if (name === 'game:exitToMenu') publishedMode = 'menu';
        apply();
      });
      if (typeof off === 'function') offs.push(off);
    }
  }
  apply();
  return {
    refresh: apply,
    stop() {
      for (const off of offs.splice(0)) off();
    },
  };
}
