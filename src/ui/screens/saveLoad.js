// Save / Load screen (ARCHITECTURE §4.5, §5; design/specs/09).
// Lists save slots, Save/Load/Export/Import. UI emits game:save/game:load {slot}; the
// save system owns persistence. Slot index is read defensively from the save system's
// public API if present, else from localStorage (manifest: SaveLoadScreen reads sf.save.index).

import { confirm } from '../confirm.js';

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
  .sf-menu { display:flex; flex-direction:column; gap:14px; padding:26px 30px; min-width:360px;
    max-width:min(92vw,920px); max-height:88vh; overflow:auto; pointer-events:auto; }
  .sf-menu-narrow { min-width:300px; width:340px; }
  .sf-menu-wide { width:min(92vw,820px); }
  .sf-menu h1 { margin:0 0 4px; font-family:var(--mono); letter-spacing:.32em; font-size:20px;
    color:var(--accent); text-shadow:0 0 18px rgba(57,208,255,.45); text-transform:uppercase; text-align:center; }
  .sf-menu h2 { margin:14px 0 4px; font-size:13px; letter-spacing:.12em; text-transform:uppercase; color:var(--ink-dim); }
  .sf-menu .sf-col { display:flex; flex-direction:column; gap:8px; }
  .sf-menu button.sf-btn { width:100%; text-align:center; padding:11px 14px; font-size:14px; letter-spacing:.06em; }
  .sf-menu .sf-row { display:flex; align-items:center; justify-content:space-between; gap:14px; }
  .sf-menu .sf-row > label { color:var(--ink-dim); font-size:13px; flex:0 0 38%; }
  .sf-menu .sf-row > .sf-ctl { flex:1; display:flex; align-items:center; gap:10px; justify-content:flex-end; }
  .sf-menu input[type=range] { flex:1; accent-color:var(--accent); }
  .sf-menu select, .sf-menu input[type=text], .sf-menu input[type=number] {
    font-family:inherit; font-size:13px; color:var(--ink); background:var(--panel); border:1px solid var(--panel-edge);
    border-radius:5px; padding:6px 8px; pointer-events:auto; }
  .sf-menu .sf-val { font-family:var(--mono); color:var(--accent); min-width:46px; text-align:right; }
  .sf-tabbar { display:flex; gap:6px; border-bottom:1px solid var(--panel-edge); padding-bottom:8px; flex-wrap:wrap; }
  .sf-tabbar button.sf-tab.active { border-color:var(--accent); color:#fff; box-shadow:0 0 10px rgba(57,208,255,.35); }
  .sf-menu .sf-grid2 { display:grid; grid-template-columns:auto 1fr; gap:6px 18px; align-items:center; font-size:13px; }
  .sf-menu .sf-grid2 .k { color:var(--ink-dim); font-family:var(--mono); letter-spacing:.05em; }
  .sf-menu .sf-grid2 .v { color:var(--ink); }
  .sf-menu .sf-foot { display:flex; gap:10px; justify-content:flex-end; margin-top:8px; }
  .sf-menu .sf-muted { color:var(--ink-mute); font-size:12px; }
  .sf-slot { display:flex; align-items:center; gap:12px; padding:10px 12px; border:1px solid var(--panel-edge);
    border-radius:6px; background:var(--panel); }
  .sf-slot.sel { border-color:var(--accent); box-shadow:0 0 10px rgba(57,208,255,.3); }
  .sf-slot .sf-slot-main { flex:1; min-width:0; }
  .sf-slot .sf-slot-head { display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:2px; }
  .sf-slot .sf-slot-name { font-size:14px; color:var(--ink); }
  .sf-slot .sf-slot-badge { font-family:var(--mono); font-size:9px; letter-spacing:.08em; text-transform:uppercase;
    color:var(--accent); border:1px solid rgba(57,208,255,.45); border-radius:4px; padding:1px 5px;
    background:rgba(57,208,255,.08); }
  .sf-slot .sf-slot-context { font-size:12px; color:var(--ink-dim); margin-top:2px; overflow-wrap:anywhere; }
  .sf-slot .sf-slot-detail { font-size:11px; color:var(--ink-mute); font-family:var(--mono); margin-top:2px;
    overflow-wrap:anywhere; }
  .sf-slot .sf-slot-sub { font-size:11px; color:var(--ink-mute); font-family:var(--mono); }
  .sf-slot.empty .sf-slot-name { color:var(--ink-mute); font-style:italic; }
  .sf-title-logo { font-family:var(--mono); letter-spacing:.5em; font-size:46px; color:var(--accent);
    text-shadow:0 0 40px rgba(57,208,255,.5); text-align:center; margin:0; }
  .sf-title-tag { text-align:center; color:var(--ink-dim); letter-spacing:.28em; font-size:12px; margin-bottom:18px; }
  `;
  document.head.appendChild(s);
}
function shell(rootEl, title, extraClass) {
  rootEl.innerHTML = '';
  rootEl.classList.add('panel', 'sf-menu');
  if (extraClass) rootEl.classList.add(extraClass);
  const h = document.createElement('h1'); h.textContent = title; rootEl.appendChild(h);
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
  if (currentSlot && id === currentSlot) badges.push('Current');
  if (latestSlot && id === latestSlot && id !== currentSlot) badges.push('Latest');
  if (meta && meta.version != null) badges.push('v' + meta.version);
  return badges;
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

let refs = null;

export const saveLoadScreen = {
  id: 'saveLoad',

  mount(rootEl, ctx) {
    injectStyle();
    shell(rootEl, 'Save / Load', 'sf-menu-wide');

    const list = el('div', 'sf-col');
    rootEl.appendChild(list);

    const ioRow = el('div', 'sf-foot');
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
    // include any extra slots present in the index but not in our default list
    Object.keys(slots).forEach((k) => { if (!ids.includes(k) && k !== 'autosave' && k !== 'auto') ids.push(k); });
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
        head.appendChild(el('span', 'sf-slot-badge', badge));
      }
      main.appendChild(head);
      main.appendChild(el('div', 'sf-slot-context', summary.context));
      main.appendChild(el('div', 'sf-slot-detail', summary.detail));
      row.appendChild(main);

      const bSave = el('button', 'sf-tab', 'Save'); bSave.style.minWidth = '64px';
      bSave.disabled = !saveAllowed;
      bSave.title = saveAllowed ? 'Save to ' + slotLabel(id) : 'Start or load a game before saving';
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
      const bLoad = el('button', 'sf-tab', 'Load'); bLoad.style.minWidth = '64px';
      bLoad.disabled = !occupied;
      // Loading discards the current session — confirm first (UX-2).
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

      row.appendChild(bSave);
      row.appendChild(bLoad);
      // Empty slots offer a direct "New Game" so the player isn't forced back to the main menu to
      // start — addressing the confusing "only a Back button" flow. Primary CTA styling so it stands
      // out as the constructive action (the Save/Load beside it are secondary .sf-tab chips).
      if (!occupied) {
        const bNew = el('button', 'sf-btn sf-btn--primary', 'New Game');
        bNew.addEventListener('click', () => { refs.selected = id; this._render(ctx); nav(ctx, 'pushScreen', 'newGame'); });
        row.appendChild(bNew);
      }
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
