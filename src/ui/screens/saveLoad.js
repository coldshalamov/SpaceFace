import { createSaveStage } from '../views/saveFrame.js';
// Load screen (ARCHITECTURE §4.5, §5; design/specs/09).
// BENCH register: saves as engraved rows on a plate; the focused save's hull on the stage; kit
// keys for Load / Save here / Delete / Export / Import / Back. Every slot and confirm stays
// reachable. UI emits game:save/game:load {slot}; the save system owns persistence. Slot index
// is read defensively from the save system's public API if present, else from localStorage
// (manifest: SaveLoadScreen reads sf.save.index).

import { livingHullScars } from '../../core/livingHull.js';
import { NEW_GAME } from '../../data/newGameDefaults.js';
import { THUNDERCHILD, THUNDERCHILD_TITLE_ID, TITLES } from '../../data/titles.js';
import { SAVE_IMPORT_MAX_BYTES, saveImportByteLength } from '../../save/saveSystem.js';
import { WANTED_TIER, wantedTierInfo } from '../../systems/heat.js';
import { confirm } from '../confirm.js';
import { el, rows, words, hero, settle, cue } from '../kit/index.js';
import { createStageHull } from './stageHull.js';

const SLOT_COUNT = 5;        // quick + 4 manual slots shown
const LS_PREFIX = 'sf.save.';
const COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
const ACE_MEMORY_META = new Set([
  'schemaVersion', 'news', 'activeReturns', 'cultureIntros', 'planetChallenges', 'playerStyle', 'aces',
]);
const TITLE_BY_ID = new Map(TITLES.map((title) => [title.id, title]));
const PORTRAIT_SCAR_MAX = 3;

const FH_KEY = {
  primary: { file: 'key.primary', width: '18px', minW: '132px', minH: '44px', pad: '0 16px', font: '16px' },
  hazard: { file: 'key.hazard', width: '18px', minW: '96px', minH: '32px', pad: '0 12px', font: '12px' },
  legend: { file: 'key.legend', width: '14px', minW: '72px', minH: '32px', pad: '0 10px', font: '12px' },
  small: { file: 'key.small', width: '12px', minW: '72px', minH: '28px', pad: '0 8px', font: '12px' },
};
const FH_PLATE = {
  sunk: { file: 'plate.bench.sunk.png', width: '24px', slice: '24 fill' },
  edge: { file: 'plate.edge.small.png', width: '16px', slice: '16 fill' },
};

function fhUrl(rel) {
  return new URL(`../../../assets/ui/kit/assets/${rel}`, import.meta.url).href;
}
function forcedColorsActive() {
  return typeof matchMedia === 'function' && matchMedia('(forced-colors: active)').matches;
}
function pin(node, props) {
  if (!node || !node.style || typeof node.style.setProperty !== 'function') return node;
  for (const name of Object.keys(props)) node.style.setProperty(name, props[name], 'important');
  return node;
}
function installShell(root) {
  root.classList.add('fh-shell');
  pin(root, { background: 'transparent', 'border-width': '0', 'box-shadow': 'none' });
}
function paintMarking(node) {
  if (!node) return node;
  node.classList.add('fh-title');
  return pin(node, {
    'font-family': 'var(--fh-face-display)',
    'font-variation-settings': "'wght' 900, 'wdth' 125",
    'letter-spacing': 'var(--fh-track-display)',
    'text-transform': 'uppercase',
    'line-height': '0.9',
    color: 'var(--fh-text)',
  });
}
function paintLegend(node, lit = false) {
  if (!node) return node;
  node.classList.add('fh-legend');
  return pin(node, {
    'font-family': 'var(--fh-face-display)',
    'font-variation-settings': "'wght' 600, 'wdth' 62",
    'letter-spacing': 'var(--fh-track-legend)',
    'text-transform': 'uppercase',
    'font-size': 'var(--fh-size-fine)',
    color: lit ? 'var(--fh-legend-lit)' : 'var(--fh-legend-rest)',
    margin: '0',
  });
}
function paintPlate(node, variant = 'sunk', extra = {}) {
  if (!node) return node;
  const spec = FH_PLATE[variant] || FH_PLATE.sunk;
  node.classList.add('fh-plate', variant === 'edge' ? 'fh-plate--edge' : 'fh-plate--sunk');
  if (forcedColorsActive()) {
    return pin(node, {
      'border-image-source': 'none', 'border-width': '1px', 'border-style': 'solid',
      background: 'transparent', ...extra,
    });
  }
  return pin(node, {
    'border-style': 'solid',
    'border-width': spec.width,
    'border-image-source': 'url("' + fhUrl('plates/' + spec.file) + '")',
    'border-image-slice': spec.slice,
    'border-image-repeat': 'stretch',
    'border-image-width': spec.width,
    background: 'transparent',
    'box-sizing': 'border-box',
    padding: '8px 12px',
    ...extra,
  });
}
function paintKey(button, kind = 'legend') {
  if (!button) return button;
  const spec = FH_KEY[kind] || FH_KEY.legend;
  button.classList.add('k-word', 'fh-key', 'fh-key--' + kind);
  const apply = (state) => {
    if (forcedColorsActive()) {
      pin(button, {
        'border-image-source': 'none', 'border-width': '1px', 'border-style': 'solid',
        background: 'transparent', color: 'CanvasText',
      });
      return;
    }
    pin(button, {
      display: 'inline-flex',
      width: 'max-content',
      'max-width': '100%',
      'min-width': spec.minW,
      'min-height': spec.minH,
      padding: spec.pad,
      'font-size': spec.font,
      'font-family': 'var(--fh-face-display)',
      'font-variation-settings': "'wght' 600, 'wdth' 62",
      'letter-spacing': 'var(--fh-track-legend)',
      'text-transform': 'uppercase',
      'justify-content': 'center',
      'align-items': 'center',
      'box-sizing': 'border-box',
      background: 'transparent',
      color: 'var(--fh-text)',
      'border-style': 'solid',
      'border-width': spec.width,
      'border-image-source': 'url("' + fhUrl('keys/' + spec.file + '.' + state + '.png') + '")',
      'border-image-slice': parseInt(spec.width, 10) + ' fill',
      'border-image-repeat': 'stretch',
      'border-image-width': spec.width,
    });
  };
  const sync = () => {
    const disabled = button.getAttribute('aria-disabled') === 'true' || button.disabled;
    const lit = button.getAttribute('aria-pressed') === 'true' || button.getAttribute('aria-selected') === 'true';
    apply(disabled ? 'disabled' : (kind === 'legend' && lit ? 'lit' : 'rest'));
  };
  button._fhSync = sync;
  if (button.dataset.fhBound !== '1') {
    button.dataset.fhBound = '1';
    button.addEventListener('pointerenter', () => {
      if (button.getAttribute('aria-disabled') === 'true' || button.disabled) return;
      apply(kind === 'legend' && button.getAttribute('aria-pressed') === 'true' ? 'lit' : 'hover');
    });
    button.addEventListener('pointerleave', sync);
    button.addEventListener('pointerdown', () => {
      if (button.getAttribute('aria-disabled') === 'true' || button.disabled) return;
      apply(kind === 'legend' ? 'hover' : 'pressed');
    });
    button.addEventListener('pointerup', sync);
    button.addEventListener('focus', () => {
      if (button.getAttribute('aria-disabled') === 'true' || button.disabled) return;
      apply('hover');
    });
    button.addEventListener('blur', sync);
  }
  sync();
  return button;
}
function paintSlotRow(row, selected) {
  if (!row) return row;
  row.classList.add('fh-row');
  row.classList.toggle('is-selected', !!selected);
  if (selected && !forcedColorsActive()) {
    return pin(row, {
      'border-style': 'solid',
      'border-width': '8px 16px',
      'border-image-source': 'url("' + fhUrl('plates/plate.row.selected.png') + '")',
      'border-image-slice': '8 16 8 16 fill',
      'border-image-repeat': 'stretch',
      'border-image-width': '8px 16px',
      'box-shadow': 'none',
      background: 'transparent',
      color: 'var(--fh-text)',
    });
  }
  return pin(row, {
    'border-image-source': 'none',
    'border-width': '1px 0 0 0',
    'border-style': 'solid',
    'border-color': 'var(--k-hair)',
    'box-shadow': 'none',
    background: 'transparent',
  });
}

export const SAVE_PORTRAIT_SEED = 15610;
export const SAVE_PORTRAIT_FIELDS = Object.freeze(['hull', 'scars', 'titles', 'rapSheet', 'grudge']);

function getManager(ctx) {
  if (ctx && ctx.screenManager) return ctx.screenManager;
  if (ctx && ctx.screens && ctx.screens.pushScreen) return ctx.screens;
  const ui = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui');
  if (ui && ui.screenManager) return ui.screenManager;
  if (ui && ui.manager) return ui.manager;
  return null;
}

function nav(ctx, method, arg) {
  const mgr = getManager(ctx);
  if (mgr && typeof mgr[method] === 'function') { mgr[method](arg); return; }
  ctx.bus.emit('ui:' + method, { id: arg });
}

/** Read the save index. Prefer the save system's API; fall back to localStorage scan. */
function readSlots(ctx) {
  const sys = ctx.registry && ctx.registry.get && ctx.registry.get('save');
  // Preferred: save system exposes a slot index.
  if (sys) {
    if (typeof sys.listSlots === 'function') { try { return normalize(sys.listSlots()); } catch (e) {} }
    if (sys.index && typeof sys.index === 'object') { try { return normalize(sys.index); } catch (e) {} }
  }
  // Fallback: scan localStorage for sf.save.* entries.
  const out = {};
  try {
    if (typeof localStorage !== 'undefined') {
      // explicit index blob, if the save system wrote one
      const idxRaw = localStorage.getItem(LS_PREFIX + 'index');
      if (idxRaw) { try { return normalize(JSON.parse(idxRaw)); } catch (e) {} }
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(LS_PREFIX)) continue;
        const slot = k.slice(LS_PREFIX.length);
        if (slot === 'index') continue;
        let meta = null;
        try { const env = JSON.parse(localStorage.getItem(k)); meta = env && (env.meta || { savedAt: env.savedAt, playtimeS: env.playtimeS }); } catch (e) {}
        out[slot] = meta || {};
      }
    }
  } catch (e) {}
  return out;
}

function normalize(idx) {
  // idx may be {slot:meta} or [{slot,...}]
  if (Array.isArray(idx)) {
    const o = {}; idx.forEach((e) => { if (e && e.slot != null) o[String(e.slot)] = e; }); return o;
  }
  return idx || {};
}

function slotLabel(id) {
  if (id === 'quick' || id === 'autosave' || id === 'auto') return id[0].toUpperCase() + id.slice(1);
  return 'Slot ' + id;
}

export function fmtPlaytime(playtimeS) {
  const s = Number(playtimeS);
  if (!Number.isFinite(s) || s < 0) return '';
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? (h + 'h ' + (m % 60) + 'm played') : (m + 'm played');
}

export function fmtCredits(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return Math.round(n).toLocaleString('en-US') + ' CR';
}

function titleCaseWords(s) {
  return String(s).split(/[\s_]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function shipLabel(id) {
  if (!id) return '';
  return titleCaseWords(String(id).replace(/^ship_/, ''));
}

function fmtSavedAt(meta) {
  const when = meta.savedAt || meta.lastSavedAt;
  if (!when) return '';
  const d = new Date(when);
  if (!Number.isFinite(d.getTime())) return '';
  return 'saved ' + d.toLocaleString();
}

/** "today", "yesterday", "3 days ago", else the date — the title's "last flown" phrase. */
export function fmtLastFlown(savedAt, now = Date.now()) {
  const t = Date.parse(savedAt || '');
  if (!t) return '';
  const days = Math.floor((now - t) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return days + ' days ago';
  return new Date(t).toLocaleDateString();
}

/** The title's sub: "Four saves · last flown yesterday", "One save · last flown today", "No saves yet". */
export function saveCountLine(slots, now = Date.now()) {
  const occupied = Object.keys(slots || {}).filter((slot) => isOccupied(slots[slot]));
  if (!occupied.length) return 'No saves yet';
  const n = occupied.length;
  const count = n < COUNT_WORDS.length ? COUNT_WORDS[n] : String(n);
  const latest = latestOccupiedSlot(slots);
  const meta = latest ? slots[latest] : null;
  const flown = fmtLastFlown(meta && (meta.savedAt || meta.lastSavedAt), now);
  return count + (n === 1 ? ' save' : ' saves') + (flown ? ' · last flown ' + flown : '');
}

export function slotSummaryLines(meta) {
  if (!isOccupied(meta)) return { context: 'Empty slot', detail: 'No save data yet' };
  const context = [
    meta && meta.sectorName,
    shipLabel(meta && meta.shipName),
  ].filter(Boolean).join(' - ') || 'Saved game';
  const detail = [
    slotObjectiveSummary(meta),
    fmtPlaytime(meta && meta.playtimeS),
    fmtCredits(meta && meta.credits),
    fmtSavedAt(meta),
  ].filter(Boolean).join(' - ') || 'Saved';
  return { context, detail };
}

export function slotConfirmSummary(meta) {
  if (!isOccupied(meta)) return 'Empty slot';
  const summary = slotSummaryLines(meta);
  return [summary.context, summary.detail]
    .filter((text) => text && text !== 'Empty slot' && text !== 'No save data yet' && text !== 'Saved')
    .join(' - ') || 'Saved game';
}

function loadConfirmBody(id, meta) {
  return 'Loading will replace your current game with ' + slotLabel(id) + ': ' + slotConfirmSummary(meta) + '. Unsaved progress is lost.';
}

function overwriteConfirmBody(id, meta) {
  return 'This will replace the existing save in ' + slotLabel(id) + ': ' + slotConfirmSummary(meta) + '. This cannot be undone.';
}

function deleteConfirmBody(id, meta) {
  return 'This will delete ' + slotLabel(id) + ': ' + slotConfirmSummary(meta) + '. This cannot be undone.';
}

export function importConfirmBody(file) {
  const name = (typeof file === 'string' ? file : (file && file.name)) || 'selected save file';
  return 'Importing ' + name + ' will validate and load that save immediately. Unsaved progress is lost.';
}

export function slotObjectiveSummary(meta) {
  if (!meta) return '';
  return meta.objectiveSummary || meta.navObjectiveSummary || meta.missionSummary || meta.storySummary || '';
}

export function slotBadges(id, meta, currentSlot, latestSlot) {
  if (!isOccupied(meta)) return [];
  const badges = [];
  if (meta && meta.recoveryAvailable) badges.push('Recovery');
  if (currentSlot && id === currentSlot) badges.push('Current');
  if (latestSlot && id === latestSlot && id !== currentSlot) badges.push('Latest');
  if (meta && meta.version != null) badges.push('v' + meta.version);
  return badges;
}

export function slotBadgeRole(badge) {
  if (badge === 'Recovery') return 'foe';
  if (badge === 'Current') return 'you';
  if (badge === 'Latest') return 'goal';
  return 'calm';
}

function isOccupied(meta) {
  return !!meta && (meta.savedAt || meta.lastSavedAt || meta.playtimeS != null);
}

function slotMetaScore(meta) {
  const savedAtScore = Date.parse((meta && (meta.savedAt || meta.lastSavedAt)) || '') || 0;
  if (savedAtScore) return savedAtScore;
  const playtimeS = Number(meta && meta.playtimeS);
  return Number.isFinite(playtimeS) ? playtimeS : 0;
}

export function latestOccupiedSlot(slots) {
  let best = null;
  let bestT = -1;
  Object.keys(slots || {}).forEach((slot) => {
    const meta = slots[slot];
    if (!isOccupied(meta)) return;
    const t = slotMetaScore(meta);
    if (t >= bestT) { bestT = t; best = slot; }
  });
  return best;
}

function exportSlotChoice(ctx, slots) {
  const selected = refs && refs.selected;
  if (selected && isOccupied(slots[selected])) return selected;
  const current = ctx && ctx.state && ctx.state.save && ctx.state.save.currentSlot;
  if (current && isOccupied(slots[current])) return current;
  if (isOccupied(slots.quick)) return 'quick';
  return latestOccupiedSlot(slots);
}

function canSave(ctx) {
  const state = ctx && ctx.state;
  return !!(state && state.playerId && state.entities && state.entities.get(state.playerId));
}

export function shouldOfferNewGameShortcut(meta, saveAllowed) {
  // Empty-slot New Game is a title/no-active-run convenience. During a live run, Save/Load is a
  // preservation surface; do not offer a shortcut that routes toward replacing current progress.
  return !isOccupied(meta) && !saveAllowed;
}

/** The save's hull id (the index stores the def id under shipName); the starter when a save has none. */
function slotShipId(meta, player) {
  const fromPlayer = activeOwnedShip(player) && activeOwnedShip(player).defId;
  if (typeof fromPlayer === 'string' && /^ship_/.test(fromPlayer)) return fromPlayer;
  const id = meta && typeof meta.shipName === 'string' && /^ship_/.test(meta.shipName) ? meta.shipName : null;
  return id || NEW_GAME.shipId;
}

function unwrapSaveData(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (input.data && typeof input.data === 'object' && !Array.isArray(input.data)) return input.data;
  if (input.player || input.missions || input.story || input.aceMemory) return input;
  return null;
}

function storyFromPortraitSource(data, state) {
  if (state && state.story && typeof state.story === 'object' && !Array.isArray(state.story)) return state.story;
  if (data && data.story && typeof data.story === 'object' && !Array.isArray(data.story)) return data.story;
  const missions = data && data.missions;
  if (missions && missions.story && typeof missions.story === 'object' && !Array.isArray(missions.story)) {
    return missions.story;
  }
  if (missions && missions.missions && missions.missions.story
      && typeof missions.missions.story === 'object' && !Array.isArray(missions.missions.story)) {
    return missions.missions.story;
  }
  return null;
}

function activeOwnedShip(player) {
  if (!player || !Array.isArray(player.ownedShips) || !player.ownedShips.length) return null;
  const index = Number.isInteger(player.activeShipIndex) ? player.activeShipIndex : 0;
  return player.ownedShips[index] || player.ownedShips[0] || null;
}

function portraitLine(value, fallback) {
  if (typeof value === 'string') {
    const text = value.replace(/\s+/g, ' ').trim();
    return text || fallback;
  }
  if (value && typeof value === 'object' && typeof value.line === 'string') {
    const text = value.line.replace(/\s+/g, ' ').trim();
    return text || fallback;
  }
  return fallback;
}

function isPlayerHeldTitle(record) {
  if (!record || typeof record !== 'object' || record.status !== 'held') return false;
  const key = String(record.holderKey || '');
  if (key === 'player' || key === 'player_ship' || key.startsWith('player')) return true;
  if (record.trickId) return true;
  return false;
}

function titleDisplayName(record, titleId) {
  const authored = TITLE_BY_ID.get(titleId);
  if (authored && authored.title) return authored.title;
  if (titleId === THUNDERCHILD_TITLE_ID) return THUNDERCHILD.title;
  if (record && typeof record.title === 'string' && record.title.trim()) return record.title.trim();
  return titleCaseWords(String(titleId || '').replace(/^title_/, '')) || 'Title';
}

function collectPlayerTitles(story) {
  const names = [];
  const seen = new Set();
  const byId = story && story.titles && story.titles.byId && typeof story.titles.byId === 'object'
    ? story.titles.byId
    : {};
  for (const titleId of Object.keys(byId)) {
    const record = byId[titleId];
    if (!isPlayerHeldTitle(record)) continue;
    const name = titleDisplayName(record, record.titleId || titleId);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

function aceRecords(memory) {
  if (!memory || typeof memory !== 'object' || Array.isArray(memory)) return [];
  const bag = memory.aces && typeof memory.aces === 'object' && !Array.isArray(memory.aces)
    ? memory.aces
    : memory;
  const out = [];
  for (const aceId of Object.keys(bag)) {
    if (ACE_MEMORY_META.has(aceId)) continue;
    const rec = bag[aceId];
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) continue;
    out.push([aceId, rec]);
  }
  return out;
}

function pickGrudge(memory) {
  let best = null;
  for (const [aceId, rec] of aceRecords(memory)) {
    if (rec.fled !== true || rec.defeated === true) continue;
    const name = (typeof rec.name === 'string' && rec.name.trim())
      ? rec.name.trim()
      : titleCaseWords(String(rec.id || aceId).replace(/^ace_/, ''));
    if (!name) continue;
    const returnTier = Math.max(0, Math.floor(Number(rec.returnTier) || 0));
    const fleeCount = Math.max(0, Math.floor(Number(rec.fleeCount) || 0));
    const score = returnTier * 1000 + fleeCount;
    if (best && score < best.score) continue;
    best = {
      aceId: rec.id || aceId,
      name,
      returnTier,
      fleeCount,
      returnsBigger: rec.returnsBigger === true,
      score,
    };
  }
  return best;
}

function formatScarLine(scar) {
  const facing = scar && scar.facing ? scar.facing : 'hull';
  const band = scar && scar.band ? scar.band : 'marked';
  const patched = scar && scar.patchedAtT != null;
  return facing + ', ' + band + (patched ? ' (patched)' : '');
}

function buildScarsField(livingHull, meta) {
  const scars = livingHullScars(livingHull);
  if (scars.length) {
    const newest = scars.slice(-PORTRAIT_SCAR_MAX);
    const extra = scars.length - newest.length;
    const line = newest.map(formatScarLine).join(' · ')
      + (extra > 0 ? ' · and ' + extra + ' more' : '');
    return {
      count: scars.length,
      open: scars.filter((scar) => scar.patchedAtT == null).length,
      patched: scars.filter((scar) => scar.patchedAtT != null).length,
      line,
    };
  }
  return { count: 0, open: 0, patched: 0, line: portraitLine(meta && meta.scars, 'Clean plates') };
}

function buildTitlesField(story, meta) {
  const names = collectPlayerTitles(story);
  if (names.length) return { names, line: names.join(' · ') };
  const fromMeta = portraitLine(meta && meta.titles, '');
  if (fromMeta && fromMeta !== 'No titles') return { names: [fromMeta], line: fromMeta };
  return { names: [], line: 'No titles' };
}

function buildRapSheetField(player, meta) {
  const heat = Number(player && player.heat);
  const bounty = Number(player && player.bounty);
  const info = wantedTierInfo(Number.isFinite(heat) ? heat : 0);
  const parts = [];
  if (info && info.id && info.id !== WANTED_TIER.NONE) parts.push(info.label);
  if (Number.isFinite(bounty) && bounty > 0) parts.push(fmtCredits(bounty) + ' bounty');
  if (parts.length) return { tier: info.id, heat: Number.isFinite(heat) ? heat : 0, bounty: bounty || 0, line: parts.join(' · ') };
  return {
    tier: WANTED_TIER.NONE,
    heat: Number.isFinite(heat) ? heat : 0,
    bounty: 0,
    line: portraitLine(meta && meta.rapSheet, 'Clean'),
  };
}

function buildGrudgeField(memory, meta) {
  const grudge = pickGrudge(memory);
  if (grudge) {
    return {
      aceId: grudge.aceId,
      name: grudge.name,
      returnTier: grudge.returnTier,
      line: grudge.name + ' hates you' + (grudge.returnsBigger ? ' · comes back harder' : ''),
    };
  }
  return { aceId: null, name: '', returnTier: 0, line: portraitLine(meta && meta.grudge, 'No one hunts you') };
}

/** Headless model of the load-stage portrait: hull + scars + titles + rap sheet + grudge. */
export function buildSavePortrait(source = {}) {
  const data = unwrapSaveData(source.data || source.envelope || source.save);
  const state = source.state && typeof source.state === 'object' && !Array.isArray(source.state)
    ? source.state
    : null;
  const meta = source.meta && typeof source.meta === 'object' && !Array.isArray(source.meta)
    ? source.meta
    : {};
  const useState = !data && !!state;
  const player = (data && data.player) || (useState && state.player) || {};
  const story = storyFromPortraitSource(data, useState ? state : null);
  const aceMemory = (data && data.aceMemory) || (useState && state.aceMemory) || {};
  const ship = activeOwnedShip(player);
  const defId = slotShipId(meta, player);
  const hullName = (typeof source.shipName === 'string' && source.shipName.trim())
    || (typeof meta.shipDisplayName === 'string' && meta.shipDisplayName.trim())
    || shipLabel(defId)
    || 'Hull';
  const fittings = Array.isArray(ship && ship.fittings)
    ? ship.fittings
    : (defId === NEW_GAME.shipId ? NEW_GAME.fittedModules : []);
  return {
    hull: { id: defId, name: hullName, fittings, line: hullName },
    scars: buildScarsField(ship && ship.livingHull, meta),
    titles: buildTitlesField(story, meta),
    rapSheet: buildRapSheetField(player, meta),
    grudge: buildGrudgeField(aceMemory, meta),
  };
}

export function savePortraitFieldsPresent(portrait) {
  if (!portrait || typeof portrait !== 'object') return false;
  return SAVE_PORTRAIT_FIELDS.every((field) => {
    const part = portrait[field];
    return !!(part && typeof part.line === 'string' && part.line.trim());
  });
}

export function paintSavePortrait(nodes, portrait) {
  if (!nodes || !portrait) return portrait;
  if (nodes.hull) nodes.hull.textContent = portrait.hull.line;
  if (nodes.scars) nodes.scars.textContent = portrait.scars.line;
  if (nodes.titles) nodes.titles.textContent = portrait.titles.line;
  if (nodes.rapSheet) nodes.rapSheet.textContent = portrait.rapSheet.line;
  if (nodes.grudge) nodes.grudge.textContent = portrait.grudge.line;
  return portrait;
}

export function roundTripSavePortrait(source) {
  const first = buildSavePortrait(source);
  const raw = source && (source.data || source.envelope || source.save);
  const cloned = raw ? JSON.parse(JSON.stringify(raw)) : JSON.parse(JSON.stringify({
    player: source && source.state && source.state.player,
    story: source && source.state && source.state.story,
    aceMemory: source && source.state && source.state.aceMemory,
    meta: source && source.meta,
  }));
  const second = buildSavePortrait({ data: cloned, meta: source && source.meta, shipName: source && source.shipName });
  return { first, second, ok: JSON.stringify(first) === JSON.stringify(second) };
}

function readSlotSaveData(ctx, slot) {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LS_PREFIX + slot);
      const data = unwrapSaveData(raw ? JSON.parse(raw) : null);
      if (data) return data;
    }
  } catch (e) {}
  const sys = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('save');
  if (sys && typeof sys.peekSlot === 'function') {
    try {
      const peeked = unwrapSaveData(sys.peekSlot(slot));
      if (peeked) return peeked;
    } catch (e) {}
  }
  return null;
}

function shipDisplayName(ctx, defId) {
  const ships = ctx && ctx.state && ctx.state.content && ctx.state.content.ships;
  let def = null;
  if (Array.isArray(ships)) def = ships.find((s) => s && s.id === defId) || null;
  else if (ships && typeof ships === 'object') def = ships[defId] || null;
  return (def && def.name) || shipLabel(defId);
}

let refs = null;

export const saveLoadScreen = {
  id: 'saveLoad',

  mount(rootEl, ctx) {
    rootEl.innerHTML = '';
    rootEl.classList.add('k-screen');
    rootEl.dataset.kReady = '0';
    rootEl.setAttribute('aria-label', 'Load');
    installShell(rootEl);

    // Title: "Load" and the count.
    const title = el('header', 'k-title');
    pin(title, { 'border-bottom': '0' });
    const heading = el('h1', 'k-display k-t-title fh-title', 'Load');
    paintMarking(heading);
    title.appendChild(heading);
    const sub = el('p', 'k-t-emph k-62', '');
    paintLegend(sub);
    title.appendChild(sub);
    rootEl.appendChild(title);

    // The saves as engraved rows on a plate down the left; rebuilt by _render.
    const hang = el('div', 'k-hang');
    paintPlate(hang, 'sunk', { padding: '4px', overflow: 'hidden auto' });
    rootEl.appendChild(hang);

    const { stage, caption, shipName, portrait, scars, titles, rapSheet, grudge, objective, credits, fine, actions } = createSaveStage();
    pin(stage, { background: 'transparent', 'border-width': '0' });
    paintPlate(caption, 'edge', { 'max-width': '100%', background: 'transparent' });
    paintMarking(shipName);
    shipName.classList.add('fh-title');
    if (portrait) pin(portrait, { 'border-left': '0' });
    if (objective) objective.classList.add('sf-slot-detail');
    if (fine) fine.classList.add('sf-slot-context');
    if (credits && credits.querySelector) {
      const heroN = credits.querySelector('.k-hero__n');
      if (heroN) heroN.classList.add('fh-heronum');
    }
    rootEl.appendChild(stage);
    this.hull = createStageHull(stage, { rootEl });

    // Foot: Export, Import (the hidden file input stays), Back.
    const foot = el('footer', 'k-foot of-pause');
    pin(foot, { 'border-top': '0' });
    const footWord = (label) => {
      const b = el('button', 'k-word k-word--emph', label);
      b.type = 'button'; b.dataset.action = label.toLowerCase();
      foot.appendChild(b);
      return b;
    };
    const bExport = footWord('Export');
    paintKey(bExport, 'small');
    const bImport = footWord('Import');
    paintKey(bImport, 'small');
    const fileIn = el('input'); fileIn.type = 'file'; fileIn.accept = '.json,application/json'; fileIn.hidden = true;
    foot.appendChild(fileIn);
    const back = footWord('Back');
    paintKey(back, 'legend');
    rootEl.appendChild(foot);

    bExport.addEventListener('click', () => { cue('confirm'); this._export(ctx); });
    bImport.addEventListener('click', () => { cue('confirm'); fileIn.click(); });
    fileIn.addEventListener('change', () => this._import(ctx, fileIn));
    back.addEventListener('click', () => { cue('confirm'); nav(ctx, 'popScreen'); });

    refs = {
      root: rootEl, title, sub, hang, stage, foot, list: null,
      caption, shipName, portrait, scars, titles, rapSheet, grudge,
      objective, credits, fine, actions,
      selected: null, shownShipId: null, ids: [], slots: {},
    };
    this._render(ctx);
  },

  _render(ctx) {
    if (!refs) return;
    const slots = readSlots(ctx);
    const saveAllowed = canSave(ctx);
    const ids = ['quick'];
    if (slots.autosave || slots.auto) ids.push(slots.autosave ? 'autosave' : 'auto');
    for (let i = 1; i <= SLOT_COUNT - 1; i++) ids.push(String(i));
    // Include only standard player-facing extras from the index. Anything else in the store
    // (dev harness worlds like "m2-seamless-world", import scratch slots) is internal: it has
    // no save/load actions of its own and rendered as an incomplete row, so it is filtered.
    Object.keys(slots).forEach((k) => {
      if (!ids.includes(k) && /^(quick|autosave|auto|\d+)$/.test(k)) ids.push(k);
    });
    if (!refs.selected || !ids.includes(refs.selected)) {
      refs.selected = (ctx.state.save && ctx.state.save.currentSlot && ids.includes(ctx.state.save.currentSlot))
        ? ctx.state.save.currentSlot
        : (latestOccupiedSlot(slots) || 'quick');
    }
    refs.ids = ids;
    refs.slots = slots;
    refs.saveAllowed = saveAllowed;
    refs.sub.textContent = saveCountLine(slots);

    const currentSlot = ctx.state.save && ctx.state.save.currentSlot;
    const latestSlot = latestOccupiedSlot(slots);

    const items = ids.map((id) => {
      const meta = slots[id];
      const occupied = isOccupied(meta);
      const summary = slotSummaryLines(meta);
      return {
        id,
        name: slotLabel(id),
        sub: occupied
          ? [meta.sectorName, shipLabel(meta.shipName), fmtPlaytime(meta.playtimeS)].filter(Boolean).join(' · ') || 'Saved game'
          : summary.context,
        num: occupied ? fmtCredits(meta.credits) : '',
        selected: refs.selected === id,
        occupied,
        badges: slotBadges(id, meta, currentSlot, latestSlot),
      };
    });
    const list = rows(items, {
      cols: 'minmax(0, 1fr) auto',
      ariaLabel: 'Saves',
      onPick: (id) => this._select(ctx, id, { quiet: true }), // rows() already cued the pick
    });
    // Hooks the checks and the localization probe read (`.sf-slot`, `.sf-slot-name`, `.sf-slot-sub`,
    // `.sf-slot-badge`); an empty slot's name reads at 38 %; the badges ride the sub line.
    for (const row of list.querySelectorAll('.k-row')) {
      const item = items.find((entry) => entry.id === row.dataset.id);
      row.classList.add('sf-slot');
      if (!item.occupied) row.classList.add('empty');
      paintSlotRow(row, item.selected);
      const name = row.querySelector('.k-row__name');
      if (name) { name.classList.add('sf-slot-name'); if (!item.occupied) name.classList.add('k-38'); }
      const subLine = row.querySelector('.k-row__sub');
      if (subLine) {
        subLine.classList.add('sf-slot-sub');
        for (const badge of item.badges) {
          subLine.appendChild(document.createTextNode(' · '));
          subLine.appendChild(el('span', 'sf-slot-badge sf-slot-badge--' + slotBadgeRole(badge), badge));
        }
      }
    }
    // The stage follows focus, not only a click: arrowing down the rows turns the portraits.
    list.addEventListener('focusin', (event) => {
      const row = event.target && event.target.closest ? event.target.closest('.k-row') : null;
      if (row && row.dataset.id && row.dataset.id !== refs.selected) this._select(ctx, row.dataset.id, { quiet: true });
    });
    refs.hang.innerHTML = '';
    refs.hang.appendChild(list);
    refs.list = list;
    this._renderStage(ctx);
  },

  _select(ctx, id, { quiet = false } = {}) {
    if (!refs || !refs.ids.includes(id)) return;
    refs.selected = id;
    if (refs.list) {
      for (const row of refs.list.querySelectorAll('.k-row')) {
        const live = row.dataset.id === id;
        row.setAttribute('aria-selected', String(live));
        paintSlotRow(row, live);
      }
    }
    if (!quiet) cue('move');
    this._renderStage(ctx);
  },

  _renderStage(ctx) {
    if (!refs) return;
    const id = refs.selected;
    const meta = refs.slots[id];
    const occupied = isOccupied(meta);
    const saveAllowed = refs.saveAllowed;
    const saveData = occupied ? readSlotSaveData(ctx, id) : null;
    const currentSlot = ctx && ctx.state && ctx.state.save && ctx.state.save.currentSlot;
    const portrait = occupied
      ? buildSavePortrait({
        data: saveData,
        state: (!saveData && currentSlot === id) ? ctx.state : null,
        meta,
        shipName: shipDisplayName(ctx, slotShipId(meta, saveData && saveData.player)),
      })
      : null;
    const defId = occupied
      ? (portrait && portrait.hull && portrait.hull.id) || slotShipId(meta, saveData && saveData.player)
      : NEW_GAME.shipId;
    const fittings = occupied
      ? (portrait && portrait.hull && portrait.hull.fittings) || (defId === NEW_GAME.shipId ? NEW_GAME.fittedModules : null)
      : NEW_GAME.fittedModules;

    refs.shipName.textContent = occupied ? ((portrait && portrait.hull.line) || shipDisplayName(ctx, defId)) : slotLabel(id);
    if (occupied && portrait) {
      paintSavePortrait({
        scars: refs.scars, titles: refs.titles, rapSheet: refs.rapSheet, grudge: refs.grudge,
      }, portrait);
      if (!refs.portrait.parentNode) refs.caption.insertBefore(refs.portrait, refs.objective);
    } else if (refs.portrait.parentNode) {
      refs.portrait.remove();
    }
    const objective = occupied ? slotObjectiveSummary(meta) : '';
    refs.objective.textContent = occupied ? (objective || 'Saved game') : 'Empty slot';
    const creditsText = occupied ? fmtCredits(meta.credits) : '';
    // The hero block leaves the caption on an empty slot (the kit's display:flex outranks [hidden]).
    if (creditsText) {
      refs.credits.querySelector('.k-hero__n').textContent = creditsText.replace(/ CR$/, '');
      if (!refs.credits.parentNode) refs.caption.insertBefore(refs.credits, refs.fine);
    } else if (refs.credits.parentNode) {
      refs.credits.remove();
    }
    refs.fine.textContent = occupied
      ? [meta.sectorName, fmtSavedAt(meta), fmtPlaytime(meta.playtimeS)].filter(Boolean).join(' · ')
      : 'No save data yet';

    // The hull as it is in that save (def id + fittings from the envelope when the index has them).
    const showKey = defId + ':' + (Array.isArray(fittings) ? fittings.join(',') : '');
    if (this.hull && this.hull.hasMount() && refs.shownShipId !== showKey) {
      refs.shownShipId = showKey;
      this.hull.show(defId, { fittings: Array.isArray(fittings) ? fittings : null });
    }

    // The save's words: Load, Save here, Delete — or New game on an empty slot at the title.
    const items = [];
    if (occupied) {
      items.push({ action: 'load', label: 'Load', primary: true });
      if (saveAllowed) items.push({ action: 'save', label: 'Save here' });
      items.push({ action: 'delete', label: 'Delete', danger: true });
    } else if (saveAllowed) {
      items.push({ action: 'save', label: 'Save here', primary: true });
    } else if (shouldOfferNewGameShortcut(meta, saveAllowed)) {
      items.push({ action: 'newGame', label: 'New game', primary: true });
    }
    refs.actions.innerHTML = '';
    if (!items.length) return;
    const list = words(items, {
      row: true, size: 'emph', ariaLabel: slotLabel(id) + ' actions',
      onPick: (action) => this._act(ctx, action, id, meta, occupied),
    });
    list.classList.add('of-pause');
    for (const button of list.querySelectorAll('.k-word')) {
      const action = button.dataset.action;
      const kind = action === 'delete' ? 'hazard'
        : button.classList.contains('k-word--primary') ? 'primary'
        : 'legend';
      paintKey(button, kind);
    }
    refs.actions.appendChild(list);
  },

  async _act(ctx, action, id, meta, occupied) {
    if (action === 'newGame') { nav(ctx, 'pushScreen', 'newGame'); return; }
    if (action === 'load') {
      const ok = await confirm({
        title: 'Load this save?',
        body: loadConfirmBody(id, meta),
        confirmLabel: 'Load', danger: true,
      });
      if (!ok) return;
      refs.selected = id;
      ctx.bus.emit('game:load', { slot: id });
      return;
    }
    if (action === 'save') {
      if (!canSave(ctx)) {
        ctx.bus.emit('toast', { text: 'Start or load a game before saving', kind: 'warn', ttl: 2500 });
        this._render(ctx);
        return;
      }
      // Overwrite confirmation if the slot is already occupied (UX-2) — saving clobbers the
      // previous save irreversibly. Empty slots save without a prompt.
      if (occupied) {
        const ok = await confirm({
          title: 'Overwrite save?',
          body: overwriteConfirmBody(id, meta),
          confirmLabel: 'Overwrite', danger: true,
        });
        if (!ok) return;
      }
      refs.selected = id;
      ctx.bus.emit('game:save', { slot: id });
      setTimeout(() => this._render(ctx), 120);
      return;
    }
    if (action === 'delete') {
      const ok = await confirm({
        title: 'Delete this save?',
        body: deleteConfirmBody(id, meta),
        confirmLabel: 'Delete', danger: true,
      });
      if (!ok) return;
      const sys = ctx.registry && ctx.registry.get && ctx.registry.get('save');
      let deleted = false;
      if (sys && typeof sys.deleteSlot === 'function') { try { sys.deleteSlot(id); deleted = true; } catch (e) {} }
      if (!deleted) {
        try { if (typeof localStorage !== 'undefined') { localStorage.removeItem(LS_PREFIX + id); deleted = true; } } catch (e) {}
      }
      ctx.bus.emit('toast', { text: deleted ? slotLabel(id) + ' deleted' : 'Delete failed', kind: deleted ? 'info' : 'warn', ttl: 2500 });
      this._render(ctx);
    }
  },

  _export(ctx) {
    const sys = ctx.registry && ctx.registry.get && ctx.registry.get('save');
    const slots = readSlots(ctx);
    const slot = exportSlotChoice(ctx, slots);
    let blobText = null;
    if (!slot) { ctx.bus.emit('toast', { text: 'Nothing to export', kind: 'warn', ttl: 2500 }); return; }
    if (refs) refs.selected = slot;
    if (sys && typeof sys.exportSlot === 'function') {
      try { blobText = sys.exportSlot(slot); } catch (e) { blobText = null; }
      if (blobText) { this._render(ctx); return; }
    }
    if (sys && typeof sys.exportSave === 'function') { try { blobText = sys.exportSave(slot); } catch (e) {} }
    if (blobText == null) {
      // fallback: export the chosen slot raw from localStorage
      try { blobText = (typeof localStorage !== 'undefined' && localStorage.getItem(LS_PREFIX + slot)) || null; } catch (e) {}
    }
    if (!blobText) { ctx.bus.emit('toast', { text: 'Nothing to export', kind: 'warn', ttl: 2500 }); return; }
    try {
      const blob = new Blob([blobText], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'spaceface_' + slot + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) { ctx.bus.emit('toast', { text: 'Export failed', kind: 'warn', ttl: 2500 }); }
  },

  async _import(ctx, fileIn) {
    const f = fileIn.files && fileIn.files[0];
    if (!f) return;
    const rejectOversize = (actual) => {
      ctx.bus.emit('save:error', {
        slot: 'import', reason: 'import_too_large', limit: SAVE_IMPORT_MAX_BYTES, actual,
      });
      ctx.bus.emit('toast', { text: 'Import failed: file is too large', kind: 'warn', ttl: 3000 });
      fileIn.value = '';
      this._render(ctx);
    };
    const fileBytes = Number(f.size);
    // File.size is available before FileReader starts; reject here so the fallback path never
    // allocates a reader for a known-over-limit import.
    if (Number.isFinite(fileBytes) && fileBytes > SAVE_IMPORT_MAX_BYTES) {
      rejectOversize(fileBytes);
      return;
    }
    const confirmed = await confirm({
      title: 'Import save file?',
      body: importConfirmBody(f),
      confirmLabel: 'Import & Load', danger: true,
    });
    if (!confirmed) { fileIn.value = ''; return; }
    const finish = (ok) => {
      ctx.bus.emit('toast', { text: ok ? 'Save imported' : 'Import failed', kind: ok ? 'good' : 'warn', ttl: 2800 });
      fileIn.value = '';
      this._render(ctx);
    };
    const sys = ctx.registry && ctx.registry.get && ctx.registry.get('save');
    if (sys && typeof sys.importFile === 'function') {
      try { sys.importFile(f, finish); return; } catch (e) {}
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      // A synthetic/legacy File may not expose a trustworthy size. Keep the raw-text check before
      // any fallback JSON.parse or save-system import call in that case.
      const textBytes = saveImportByteLength(text);
      if (textBytes > SAVE_IMPORT_MAX_BYTES) {
        rejectOversize(textBytes);
        return;
      }
      let ok = false;
      if (sys && typeof sys.importString === 'function') { try { ok = !!sys.importString(text, 'quick'); } catch (e) {} }
      else if (sys && typeof sys.importSave === 'function') { try { ok = !!sys.importSave(text); } catch (e) {} }
      if (!ok) {
        try {
          JSON.parse(text);
          if (typeof localStorage !== 'undefined') { localStorage.setItem(LS_PREFIX + 'import', text); ok = true; }
        } catch (e) {
          ctx.bus.emit('toast', { text: 'Import failed: file is not valid JSON', kind: 'warn', ttl: 3000 });
          ok = false;
        }
      }
      finish(ok);
    };
    reader.onerror = () => finish(false);
    reader.readAsText(f);
  },

  onShow(ctx) {
    if (!refs) return;
    cue('open');
    this._render(ctx);
    try {
      settle(refs.title, { from: 'top', state: 'saveLoad:open' });
      settle(refs.hang, { from: 'left', state: 'saveLoad:open' });
      settle(refs.stage, { from: 'right', state: 'saveLoad:open' });
      settle(refs.foot, { from: 'bottom', state: 'saveLoad:open' });
    } catch (e) { /* motion is cosmetic */ }
    if (this.hull && this.hull.hasMount()) {
      this.hull.activate(ctx);
      // _render already showed the selected save's hull; activating starts its slow yaw.
    }
    try {
      const selectedRow = refs.list && refs.list.querySelector('.k-row[aria-selected="true"]');
      (selectedRow || refs.list.querySelector('.k-row')).focus();
    } catch (e) {}
  },
  onHide() {
    cue('close');
    if (this.hull) this.hull.deactivate();
  },
  refresh(ctx) { this._render(ctx); },
  dispose() {
    if (this.hull) { this.hull.dispose(); this.hull = null; }
    refs = null;
  },
};
