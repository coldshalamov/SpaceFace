// Save / Load screen (ARCHITECTURE §4.5, §5; design/specs/09).
// Lists save slots, Save/Load/Export/Import. UI emits game:save/game:load {slot}; the
// save system owns persistence. Slot index is read defensively from the save system's
// public API if present, else from localStorage (manifest: SaveLoadScreen reads sf.save.index).

import { confirm } from '../confirm.js';
import { SAVE_IMPORT_MAX_BYTES, saveImportByteLength } from '../../save/saveSystem.js';

const STYLE_ID = 'sf-save-load-style';
const SLOT_COUNT = 5;        // quick + 4 manual slots shown
const LS_PREFIX = 'sf.save.';

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

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
  .sf-saveload { color: var(--sf-paper); font-family: var(--sf-body-face); }
  .sf-saveload.sf-menu h1 {
    font-family: var(--sf-subhead-face); font-weight: 600; font-size: 12px;
    letter-spacing: var(--sf-track-micro); text-transform: uppercase; color: var(--sf-calm);
  }
  .sf-saveload.sf-menu h1::before { background: var(--sf-calm); box-shadow: none; }
  .sf-slot-list { display: flex; flex-direction: column; gap: var(--sp-2); }
  .screen.sf-menu .sf-slot {
    display: flex; align-items: center; justify-content: space-between;
    gap: var(--sp-4); padding: var(--sp-3) var(--sp-4);
    background: color-mix(in srgb, var(--sf-surface) 88%, transparent);
    border: 1px solid var(--sf-edge); border-radius: 2px;
    box-sizing: border-box; width: 100%; min-height: 56px;
    transition: background-color var(--sf-t-latch) var(--sf-ease), border-color var(--sf-t-latch) var(--sf-ease);
  }
  .screen.sf-menu .sf-slot:hover {
    background: color-mix(in srgb, var(--sf-surface) 72%, transparent);
    border-color: var(--sf-calm);
  }
  .screen.sf-menu .sf-slot.empty {
    background: color-mix(in srgb, var(--sf-surface) 55%, transparent);
    border-style: dashed; border-color: var(--sf-edge);
  }
  .screen.sf-menu .sf-slot.empty:hover {
    background: color-mix(in srgb, var(--sf-surface) 72%, transparent);
    border-color: var(--sf-calm);
  }
  .screen.sf-menu .sf-slot.sel {
    border-color: var(--sf-goal-edge);
    background: color-mix(in srgb, var(--sf-goal) 8%, transparent);
    box-shadow: none;
    border-left: var(--sf-rail-w) solid var(--sf-goal);
  }
  .sf-slot .sf-slot-main { flex: 1 1 auto; min-width: 0; }
  .sf-slot .sf-slot-head { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-2); margin-bottom: var(--sp-1); }
  .sf-slot .sf-slot-name {
    font-family: var(--sf-subhead-face); font-weight: 600; font-size: 15px; color: var(--sf-paper);
  }
  /* The selected row's name is the screen's ONE display-size element (grammar test
     instrument-hierarchy-six-screens pins this selector); unselected rows stay at 15px,
     so no two rows ever render at competing large sizes. */
  .sf-slot.sel .sf-slot-name {
    font-family: var(--sf-display-face); font-weight: 700; font-size: 28px; line-height: 1.1;
    letter-spacing: 0; text-transform: none; color: var(--sf-paper);
  }
  .sf-slot.empty .sf-slot-name { font-weight: 400; color: var(--sf-calm); font-style: italic; }
  .sf-slot .sf-slot-badge {
    font-family: var(--sf-subhead-face); font-weight: 600; font-size: 12px;
    letter-spacing: var(--sf-track-micro); text-transform: uppercase;
    color: var(--sf-calm); border: 1px solid var(--sf-edge); border-radius: 2px;
    padding: 1px var(--sp-2); background: transparent;
  }
  .sf-slot-badge--you { color: var(--sf-you); border-color: color-mix(in srgb, var(--sf-you) 45%, transparent); }
  .sf-slot-badge--goal { color: var(--sf-goal); border-color: var(--sf-goal-edge); }
  .sf-slot-badge--foe { color: var(--sf-foe); border-color: color-mix(in srgb, var(--sf-foe) 45%, transparent); }
  .sf-slot .sf-slot-context { font-size: 13px; color: var(--sf-calm); margin-top: 2px; }
  .sf-slot.empty .sf-slot-context { color: var(--sf-calm); }
  /* Meta lines stay on fixed bounds so a wrapped timestamp can never spill across a
     row's border into the next row's title. Context is one clean ellipsized line;
     the detail line clamps at two with a real ellipsis — never a raw mid-word cut. */
  .sf-slot .sf-slot-context {
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .sf-slot .sf-slot-detail, .sf-slot .sf-fig {
    font-size: 13px; color: var(--sf-calm); font-family: var(--sf-data-face);
    font-weight: 500; font-variant-numeric: tabular-nums; margin-top: var(--sp-1);
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
    overflow: hidden; overflow-wrap: anywhere;
  }
  .sf-slot .sf-slot-actions { display: flex; align-items: center; gap: var(--sp-2); flex-shrink: 0; }
  .sf-slot .sf-slot-actions button.sf-tab { min-width: 68px; padding: var(--sp-1) var(--sp-3); cursor: pointer; }
  .sf-slot .sf-slot-actions button.sf-tab--primary {
    color: var(--sf-surface); background: var(--sf-you); border-color: var(--sf-you); font-weight: 600;
  }
  .sf-slot .sf-slot-actions button.sf-tab--primary:hover:not(:disabled) {
    background: var(--sf-you); border-color: var(--sf-you); color: var(--sf-surface);
  }
  @media (forced-colors: active) {
    .screen.sf-menu .sf-slot, .sf-slot .sf-slot-actions button.sf-tab--primary {
      background: Canvas; color: CanvasText; border-color: CanvasText; box-shadow: none;
    }
    .screen.sf-menu .sf-slot.sel { border-left-color: Highlight; }
  }
  @media (prefers-reduced-motion: reduce) {
    .sf-saveload, .sf-saveload * { animation: none !important; transition: none !important; }
  }
  `;
  document.head.appendChild(s);
}

function shell(rootEl, title, extraClass) {
  rootEl.innerHTML = '';
  rootEl.classList.add('panel', 'sf-menu', 'sf-saveload');
  if (extraClass) rootEl.classList.add(extraClass);
  // Diegetic fascia stamp (styles/menu.css .sf-menu::before reads it).
  rootEl.dataset.stamp = 'FLIGHT RECORDER / SAVE-LOAD';
  const crest = el('div', 'sf-crest');
  const h = document.createElement('h1'); h.textContent = title; crest.appendChild(h);
  rootEl.appendChild(crest);
  return rootEl;
}

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

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

let refs = null;

export const saveLoadScreen = {
  id: 'saveLoad',

  mount(rootEl, ctx) {
    injectStyle();
    shell(rootEl, 'Save / Load', 'sf-menu-wide');

    const list = el('div', 'sf-slot-list sf-stage');
    rootEl.appendChild(list);

    const ioRow = el('div', 'sf-foot sf-apron');
    ioRow.style.justifyContent = 'space-between';
    const left = el('div'); left.style.display = 'flex'; left.style.gap = '10px';
    const bExport = el('button', 'sf-btn'); bExport.textContent = 'Export'; bExport.style.width = 'auto';
    const bImport = el('button', 'sf-btn'); bImport.textContent = 'Import'; bImport.style.width = 'auto';
    const fileIn = el('input'); fileIn.type = 'file'; fileIn.accept = '.json,application/json'; fileIn.style.display = 'none';
    left.appendChild(bExport); left.appendChild(bImport); left.appendChild(fileIn);
    const back = el('button', 'sf-btn'); back.textContent = 'Back'; back.style.width = 'auto';
    back.addEventListener('click', () => nav(ctx, 'popScreen'));
    ioRow.appendChild(left); ioRow.appendChild(back);
    rootEl.appendChild(ioRow);

    bExport.addEventListener('click', () => this._export(ctx));
    bImport.addEventListener('click', () => fileIn.click());
    fileIn.addEventListener('change', () => this._import(ctx, fileIn));

    refs = { list, selected: null };
    this._render(ctx);
  },

  _render(ctx) {
    if (!refs) return;
    const slots = readSlots(ctx);
    const saveAllowed = canSave(ctx);
    refs.list.innerHTML = '';
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
    const currentSlot = ctx.state.save && ctx.state.save.currentSlot;
    const latestSlot = latestOccupiedSlot(slots);

    ids.forEach((id) => {
      const meta = slots[id];
      const occupied = isOccupied(meta);
      const summary = slotSummaryLines(meta);
      const row = el('div', 'sf-slot' + (occupied ? '' : ' empty') + (refs.selected === id ? ' sel' : ''));
      const main = el('div', 'sf-slot-main');
      const head = el('div', 'sf-slot-head');
      head.appendChild(el('div', 'sf-slot-name', slotLabel(id)));
      for (const badge of slotBadges(id, meta, currentSlot, latestSlot)) {
        head.appendChild(el('span', 'sf-slot-badge sf-slot-badge--' + slotBadgeRole(badge), badge));
      }
      main.appendChild(head);
      main.appendChild(el('div', 'sf-slot-context', summary.context));
      main.appendChild(el('div', 'sf-slot-detail sf-fig', summary.detail));
      row.appendChild(main);

      const actions = el('div', 'sf-slot-actions');

      if (occupied) {
        const bSave = el('button', 'sf-tab', 'Save');
        bSave.disabled = !saveAllowed;
        bSave.setAttribute('data-why', saveAllowed ? 'Save to ' + slotLabel(id) : 'Start or load a game before saving');
        bSave.addEventListener('click', async () => {
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
        });

        const bLoad = el('button', 'sf-tab sf-tab--primary', 'Load');
        bLoad.setAttribute('data-why', 'Load ' + slotLabel(id));
        bLoad.addEventListener('click', async () => {
          const ok = await confirm({
            title: 'Load this save?',
            body: loadConfirmBody(id, meta),
            confirmLabel: 'Load', danger: true,
          });
          if (!ok) return;
          refs.selected = id;
          ctx.bus.emit('game:load', { slot: id });
        });

        actions.appendChild(bSave);
        actions.appendChild(bLoad);
      } else {
        if (saveAllowed) {
          const bSave = el('button', 'sf-tab sf-tab--primary', 'Save');
          bSave.setAttribute('data-why', 'Save to ' + slotLabel(id));
          bSave.addEventListener('click', async () => {
            if (!canSave(ctx)) {
              ctx.bus.emit('toast', { text: 'Start or load a game before saving', kind: 'warn', ttl: 2500 });
              this._render(ctx);
              return;
            }
            refs.selected = id;
            ctx.bus.emit('game:save', { slot: id });
            setTimeout(() => this._render(ctx), 120);
          });
          actions.appendChild(bSave);
        } else if (shouldOfferNewGameShortcut(meta, saveAllowed)) {
          const bNew = el('button', 'sf-tab sf-tab--primary', 'New Game');
          bNew.style.minWidth = '90px';
          bNew.setAttribute('data-why', 'Start a new game in ' + slotLabel(id));
          bNew.addEventListener('click', () => { refs.selected = id; this._render(ctx); nav(ctx, 'pushScreen', 'newGame'); });
          actions.appendChild(bNew);
        }
      }

      row.appendChild(actions);
      refs.list.appendChild(row);
    });
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

  onShow(ctx) { this._render(ctx); },
  onHide() {},
  refresh(ctx) { this._render(ctx); },
};
