// Plan 54 loot-history side log.
// Pure UI/readout owner: listens to finalized cargo pickup receipts and keeps a bounded
// session-local list. It does not own cargo, credits, world pickups, or save data.
import { COMMODITIES } from '../data/commodities.js';

export const LOOT_HISTORY_LIMIT = 12;

const STYLE_ID = 'sf-loot-history-style';
const COMMODITY_BY_ID = new Map(COMMODITIES.map((commodity) => [commodity.id, commodity]));

function finiteQty(value) {
  const n = Math.floor(Number(value) || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function displayNameFor(payload = {}) {
  if (payload.kind === 'module') return String(payload.commodityId || 'Module');
  const def = COMMODITY_BY_ID.get(payload.commodityId);
  return def && def.name ? def.name : String(payload.commodityId || 'Cargo');
}

export function lootHistoryEnabled(state) {
  return !!(state && state.settings && state.settings.showLootHistory === true);
}

export function normalizeLootHistoryEntry(payload = {}, state = null) {
  const qty = finiteQty(payload.acceptedAmount ?? payload.amount);
  if (qty <= 0) return null;
  const kind = payload.kind === 'module' ? 'module' : 'cargo';
  const name = displayNameFor(payload);
  const simTime = Number.isFinite(Number(payload.simTime)) ? Number(payload.simTime)
    : Number.isFinite(Number(state && state.simTime)) ? Number(state.simTime) : 0;
  return {
    id: `${kind}:${payload.commodityId || 'unknown'}:${simTime.toFixed(3)}:${qty}`,
    kind,
    qty,
    name,
    label: kind === 'module' ? `Module acquired · ${name}` : `+${qty} ${name}`,
    detail: kind === 'module' ? `${qty} module${qty === 1 ? '' : 's'} in inventory` : 'Cargo hold',
    simTime,
  };
}

export function appendLootHistoryEntry(entries, entry, limit = LOOT_HISTORY_LIMIT) {
  if (!entry) return entries;
  const next = Array.isArray(entries) ? entries.slice(0) : [];
  next.unshift(entry);
  if (next.length > limit) next.length = limit;
  return next;
}

function injectStyle(documentRef) {
  if (!documentRef || documentRef.getElementById(STYLE_ID)) return;
  const style = documentRef.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
  .sf-loot-history {
    position:absolute; right:12px; top:74px; width:220px; max-width:calc(100vw - 24px);
    pointer-events:auto; z-index:12; display:none; flex-direction:column; gap:4px;
    padding:8px 9px; border:1px solid rgba(148,178,205,.24); border-radius:4px;
    background:rgba(8,13,21,.58); box-shadow:0 10px 24px rgba(0,0,0,.28);
    color:var(--hud-paper,#e7edf5); font-family:var(--hud-data,monospace);
  }
  .sf-loot-history.is-visible { display:flex; }
  .sf-loot-history__head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .sf-loot-history__title {
    font-family:var(--hud-display,monospace); font-size:8px; letter-spacing:.17em;
    color:var(--hud-muted,#94b2cd); text-transform:uppercase;
  }
  .sf-loot-history__close {
    background:transparent; border:0; color:var(--hud-muted,#94b2cd); cursor:pointer;
    font:600 11px var(--hud-data,monospace); padding:0 2px;
  }
  .sf-loot-history__close:hover { color:var(--hud-paper,#e7edf5); }
  .sf-loot-history__list { display:flex; flex-direction:column; gap:3px; }
  .sf-loot-history__row { display:flex; justify-content:space-between; gap:8px; font-size:10px; line-height:1.25; }
  .sf-loot-history__label { color:var(--hud-paper,#e7edf5); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .sf-loot-history__detail { flex:0 0 auto; color:var(--hud-muted,#94b2cd); font-size:9px; }
  .sf-loot-history__empty { color:var(--hud-muted,#94b2cd); font-size:10px; font-style:italic; }
  body.motion-reduce .sf-loot-history { transition:none !important; }
  `;
  documentRef.head.appendChild(style);
}

export function createLootHistory(ctx, options = {}) {
  const state = ctx && ctx.state;
  const bus = ctx && ctx.bus;
  const documentRef = options.documentRef || (typeof document !== 'undefined' ? document : null);
  if (!documentRef || !bus || !bus.on) return { entries: () => [], render() {}, destroy() {} };
  injectStyle(documentRef);

  const host = documentRef.getElementById('hud') || documentRef.getElementById('ui-root') || documentRef.body;
  const root = documentRef.createElement('aside');
  root.className = 'sf-loot-history';
  root.setAttribute('role', 'log');
  root.setAttribute('aria-label', 'Loot history');
  root.setAttribute('aria-live', 'polite');
  root.innerHTML =
    '<div class="sf-loot-history__head">' +
      '<span class="sf-loot-history__title">Loot history</span>' +
      '<button class="sf-loot-history__close" type="button" aria-label="Hide loot history">×</button>' +
    '</div>' +
    '<div class="sf-loot-history__list"></div>';
  host.appendChild(root);

  const list = root.querySelector('.sf-loot-history__list');
  const close = root.querySelector('.sf-loot-history__close');
  let entries = [];
  let lastSignature = '';

  function render() {
    const visible = lootHistoryEnabled(state);
    root.classList.toggle('is-visible', visible);
    root.setAttribute('aria-hidden', String(!visible));
    if (!visible) return;
    const signature = entries.map((entry) => entry.id).join('|');
    if (signature === lastSignature) return;
    lastSignature = signature;
    list.innerHTML = '';
    if (!entries.length) {
      const empty = documentRef.createElement('div');
      empty.className = 'sf-loot-history__empty';
      empty.textContent = 'No pickups logged this sortie.';
      list.appendChild(empty);
      return;
    }
    const frag = documentRef.createDocumentFragment();
    for (const entry of entries) {
      const row = documentRef.createElement('div');
      row.className = `sf-loot-history__row sf-loot-history__row--${entry.kind}`;
      const label = documentRef.createElement('span');
      label.className = 'sf-loot-history__label';
      label.textContent = entry.label;
      const detail = documentRef.createElement('span');
      detail.className = 'sf-loot-history__detail';
      detail.textContent = entry.detail;
      row.append(label, detail);
      frag.appendChild(row);
    }
    list.appendChild(frag);
  }

  const unsubs = [
    bus.on('loot:collected', (payload) => {
      const entry = normalizeLootHistoryEntry(payload, state);
      entries = appendLootHistoryEntry(entries, entry);
      render();
    }),
    bus.on('settings:changed', (payload = {}) => {
      if (payload.key === 'showLootHistory') render();
    }),
  ];
  close.addEventListener('click', () => {
    if (state && state.settings) state.settings.showLootHistory = false;
    bus.emit('settings:changed', { section: null, key: 'showLootHistory', value: false });
    render();
  });

  render();

  return {
    entries: () => entries.slice(),
    render,
    destroy() {
      for (const unsub of unsubs) {
        try { if (typeof unsub === 'function') unsub(); } catch (_) {}
      }
      root.remove();
    },
  };
}

export default {
  LOOT_HISTORY_LIMIT,
  appendLootHistoryEntry,
  createLootHistory,
  lootHistoryEnabled,
  normalizeLootHistoryEntry,
};
