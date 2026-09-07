// Load screen (ARCHITECTURE §4.5, §5; design/specs/09).
// The sheet's line (design/frontend/direction/DIRECTION_SHEET.md, load, amended by Task B §1.2):
// saves as portraits — the focused save's hull on the stage as it is in that save, its name huge,
// the sector and date in fine print, the credits as a hero number; the saves as hairline rows down
// the left. Built on the frontend kit (styles/kit.css, src/ui/kit/); this file owns no CSS.
// UI emits game:save/game:load {slot}; the save system owns persistence. Slot index is read
// defensively from the save system's public API if present, else from localStorage (manifest:
// SaveLoadScreen reads sf.save.index).

import { confirm } from '../confirm.js';
import { NEW_GAME } from '../../data/newGameDefaults.js';
import { SAVE_IMPORT_MAX_BYTES, saveImportByteLength } from '../../save/saveSystem.js';
import { el, rows, words, hero, settle, cue } from '../kit/index.js';
import { createStageHull } from './stageHull.js';

const SLOT_COUNT = 5;        // quick + 4 manual slots shown
const LS_PREFIX = 'sf.save.';
const COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];

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
function slotShipId(meta) {
  const id = meta && typeof meta.shipName === 'string' && /^ship_/.test(meta.shipName) ? meta.shipName : null;
  return id || NEW_GAME.shipId;
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

    // Title: "Load" and the count.
    const title = el('header', 'k-title');
    title.appendChild(el('h1', 'k-display k-t-title', 'Load'));
    const sub = el('p', 'k-t-emph k-62', '');
    title.appendChild(sub);
    rootEl.appendChild(title);

    // The saves as hairline rows down the left; rebuilt by _render.
    const hang = el('div', 'k-hang');
    rootEl.appendChild(hang);

    // The stage: the focused save's hull, its name huge, the objective, the credits as a hero
    // number, sector · saved-at · playtime in fine print, then the save's words.
    const stage = el('div', 'k-stage');
    const caption = el('div', 'k-stage__foot');
    const shipName = el('h2', 'k-display k-t-title', '');
    const objective = el('p', 'k-sentence k-sentence--emph sf-slot-detail', '');
    const credits = hero('', 'credits', { size: 'hero' });
    const fine = el('p', 'k-t-fine k-38 sf-slot-context', '');
    const actions = el('div');
    caption.appendChild(shipName);
    caption.appendChild(objective);
    caption.appendChild(credits);
    caption.appendChild(fine);
    caption.appendChild(actions);
    stage.appendChild(caption);
    rootEl.appendChild(stage);
    this.hull = createStageHull(stage, { rootEl });

    // Foot: Export, Import (the hidden file input stays), Back.
    const foot = el('footer', 'k-foot');
    const footWord = (label) => {
      const b = el('button', 'k-word k-word--emph', label);
      b.type = 'button'; b.dataset.action = label.toLowerCase();
      foot.appendChild(b);
      return b;
    };
    const bExport = footWord('Export');
    const bImport = footWord('Import');
    const fileIn = el('input'); fileIn.type = 'file'; fileIn.accept = '.json,application/json'; fileIn.hidden = true;
    foot.appendChild(fileIn);
    const back = footWord('Back');
    rootEl.appendChild(foot);

    bExport.addEventListener('click', () => { cue('confirm'); this._export(ctx); });
    bImport.addEventListener('click', () => { cue('confirm'); fileIn.click(); });
    fileIn.addEventListener('change', () => this._import(ctx, fileIn));
    back.addEventListener('click', () => { cue('confirm'); nav(ctx, 'popScreen'); });

    refs = {
      root: rootEl, title, sub, hang, stage, foot, list: null,
      caption, shipName, objective, credits, fine, actions,
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
      for (const row of refs.list.querySelectorAll('.k-row')) row.setAttribute('aria-selected', String(row.dataset.id === id));
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
    const defId = occupied ? slotShipId(meta) : NEW_GAME.shipId;

    refs.shipName.textContent = occupied ? shipDisplayName(ctx, defId) : slotLabel(id);
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

    // The hull as it is in that save (the index carries the def id; the fittings stay the hull's own).
    if (this.hull && this.hull.hasMount() && refs.shownShipId !== defId) {
      refs.shownShipId = defId;
      this.hull.show(defId, { fittings: defId === NEW_GAME.shipId ? NEW_GAME.fittedModules : null });
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
