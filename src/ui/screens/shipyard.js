// src/ui/screens/shipyard.js — STATION "Shipyard" tab panel.
// Lists buyable hulls with stats; Buy emits ui:buyShip {defId}. Lets the player sell a
// (non-active) owned ship via the ships system (sellShip). Read-only over sim state; the ships
// system owns ownership + emits the credit charge (§0.6, §4.4).
//
// Catalog source: the ships system (ctx.registry.get('ships')) exposes nothing public for the
// catalog, so we read the static SHIPS data and use the system only for unlock checks / sell.
import { SHIPS } from '../../data/ships.js';
import { confirm } from '../confirm.js';
import { createListControls, buildSortHeader, sortHeaderAria } from '../listControls.js';
import { createShipPreviewMount } from '../shipPreviewMount.js';
import { escapeHtml } from '../comms.js';

const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));

// Drive-family short labels for the comparison header. Hulls carry a driveId that resolves to one
// of the five propulsion families (spec §6): reaction, gravimetric, pulse plate, torch, or sail.
// Surfacing it turns the drive family from a hidden stat into a buying decision.
const DRIVE_FAMILY_LABEL = {
  reaction: 'Reaction',
  gravimetric: 'Gravimetric',
  pulse_plate: 'Pulse Plate',
  torch: 'Torch',
  field_sail: 'Field Sail',
};
function driveLabelFor(def) {
  const driveId = def && def.driveId;
  if (!driveId) return '';
  // The family is encoded in the drive id prefix; resolve via the catalog when available, else infer.
  if (driveId.startsWith('drive_gravimetric')) return DRIVE_FAMILY_LABEL.gravimetric;
  if (driveId.startsWith('drive_pulse_plate')) return DRIVE_FAMILY_LABEL.pulse_plate;
  if (driveId.startsWith('drive_torch')) return DRIVE_FAMILY_LABEL.torch;
  if (driveId.startsWith('drive_field_sail')) return DRIVE_FAMILY_LABEL.field_sail;
  if (driveId.startsWith('drive_reaction')) return DRIVE_FAMILY_LABEL.reaction;
  return '';
}

function fmtCr(n) { return (Math.round(n) || 0).toLocaleString('en-US'); }

function slotSummary(def) {
  const order = ['weapon', 'shield', 'engine', 'cargo', 'mining', 'utility'];
  const parts = [];
  // Slot entries may be bare sizes ('S') OR {size, facing} objects (Phase 2 weapon hardpoints).
  // Normalize to the size letter so the summary never renders "[object Object]".
  const sizeOf = (e) => (typeof e === 'string') ? e : ((e && e.size) || '?');
  for (const t of order) {
    const arr = (def.slots && def.slots[t]) || [];
    if (arr.length) parts.push(t[0].toUpperCase() + ':' + arr.map(sizeOf).join(''));
  }
  return parts.join('  ');
}

// Role descriptions for the comparison tooltip
const ROLE_DESC = {
  starter: 'Balanced beginner hull — a bit of everything.',
  mining: 'Built to extract ores with extra mining slots.',
  fighter: 'Fast and agile; trades cargo for firepower.',
  freighter: 'Maximum cargo capacity; slow but tough.',
  multirole: 'Jack-of-all-trades with flexible loadout.',
  interceptor: 'Lightning-fast pursuit craft with heavy weapons.',
  mining_barge: 'Industrial-grade extraction platform — slow, massive hold.',
  corvette: 'Armored warship with broadside batteries.',
  heavy_hauler: 'Enormous hold for bulk cargo runs.',
  explorer: 'Long-range scout with utility and sensor slots.',
  gunship: 'A wall of guns — overwhelming forward firepower.',
  battlecruiser: 'Capital-class combatant, broadside duel monster.',
  flagship: 'The ultimate command ship — unmatched in every way.',
};

function slotCount(def, type) {
  return (def.slots && def.slots[type]) ? def.slots[type].length : 0;
}

// ---- Comparison tooltip CSS (injected once) ----
const CMP_STYLE_ID = 'sf-sy-cmp-style';
function injectCmpStyle() {
  if (document.getElementById(CMP_STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = CMP_STYLE_ID;
  s.textContent = `
  .st-sy-cmp { position: absolute; right: 0; top: 0; width: 296px; z-index: 20;
    background: linear-gradient(180deg, rgba(11,18,32,.97), rgba(8,14,26,.97));
    border: 1px solid var(--panel-edge-2); border-radius: 8px; padding: 14px 16px;
    box-shadow: 0 8px 32px rgba(0,0,0,.6); pointer-events: none; animation: sf-fadein .15s ease both; }
  .st-sy-cmp-h { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
  .st-sy-cmp-name { font-size: .92rem; color: #fff; font-weight: 600; }
  .st-sy-cmp-role { font-size: .62rem; letter-spacing: .1em; text-transform: uppercase; color: var(--accent); }
  .st-sy-cmp-desc { font-size: .74rem; color: var(--ink-dim); margin-bottom: 10px; line-height: 1.35; }
  .st-sy-cmp-grid { display: grid; grid-template-columns: 1.1fr 1fr .3fr 1fr; gap: 3px 8px; font-size: .8rem;
    font-family: var(--mono); }
  .st-sy-cmp-lbl { color: var(--ink-mute); font-size: .7rem; letter-spacing: .06em; text-transform: uppercase; }
  .st-sy-cmp-cur { text-align: right; color: var(--ink-dim); }
  .st-sy-cmp-arr { text-align: center; color: var(--ink-mute); font-size: .7rem; }
  .st-sy-cmp-new { text-align: right; }
  .st-sy-cmp-better { color: var(--good); }
  .st-sy-cmp-worse { color: var(--danger); }
  .st-sy-cmp-same { color: var(--ink-dim); }
  .st-sy-cmp-delta { font-size: .68rem; margin-left: 4px; }
  .st-sy-cmp-sep { grid-column: 1 / -1; height: 1px; background: var(--panel-edge); margin: 4px 0; }
  .st-sy-cmp-slots { font-size: .72rem; color: var(--ink-dim); margin-top: 8px; line-height: 1.5; }
  .st-sy-cmp-slots b { color: var(--ink); font-weight: 600; }
  .st-sy-buy { position: relative; }
  /* UX-1: rotating 3D ship preview pane. A framed canvas + hint that sits above the hull table. */
  .st-sy-preview { position: relative; height: 168px; margin-bottom: 12px; border: 1px solid var(--panel-edge);
    border-radius: var(--r-md); overflow: hidden; background: radial-gradient(ellipse at 50% 70%, #0a1426, #05070d 80%);
    display: flex; align-items: center; justify-content: center; }
  .st-sy-preview__canvas { width: 100%; height: 100%; display: block; }
  .st-sy-preview__hint { color: var(--ink-mute); font-size: var(--t-sm); font-style: italic; pointer-events: none; }
  `;
  document.head.appendChild(s);
}

export function createShipyardPanel(ctx) {
  const root = document.createElement('div');
  root.className = 'st-panel st-shipyard';

  // ---- owned-ships strip (with Sell / Make Active) ----
  const ownedWrap = document.createElement('div');
  ownedWrap.className = 'st-sy-owned';
  ownedWrap.innerHTML = '<div class="st-sub-h">Your Hangar</div><div class="st-sy-owned-list"></div>';
  root.appendChild(ownedWrap);
  const ownedList = ownedWrap.querySelector('.st-sy-owned-list');

  // ---- buyable hulls ----
  const buyWrap = document.createElement('div');
  buyWrap.className = 'st-sy-buy';
  buyWrap.innerHTML = '<div class="st-sub-h">Hulls For Sale</div>';

  // UX-1: rotating 3D ship preview pane. Shows the hovered hull so the player buys with their eyes,
  // not from a stat table. Built via the same visualFactory the game uses, in an isolated renderer so
  // it never touches the live scene. Lazy-created on first hover (deferred until needed) and disposed
  // when the panel is torn down. Falls back gracefully if WebGL/factory init fails.
  const previewWrap = document.createElement('div');
  previewWrap.className = 'st-sy-preview';
  previewWrap.innerHTML = '<div class="st-sy-preview__hint">Hover a hull to preview</div>';
  const previewCanvas = document.createElement('canvas');
  previewCanvas.className = 'st-sy-preview__canvas';
  previewCanvas.width = 360; previewCanvas.height = 200;
  previewWrap.appendChild(previewCanvas);
  buyWrap.appendChild(previewWrap);
  let previewMount = null;     // lazy
  let previewShown = null;     // current defId on display
  function ensurePreview() {
    if (previewMount) return previewMount;
    try {
      const envMap = ctx.state && ctx.state.render && ctx.state.render.envMap;
      previewMount = createShipPreviewMount(previewCanvas, { envMap });
    } catch (e) { console.warn('[shipyard] preview mount failed', e); previewMount = null; }
    return previewMount;
  }
  function showPreview(defId) {
    if (defId === previewShown) return;
    previewShown = defId;
    const m = ensurePreview();
    if (!m) return;
    previewWrap.querySelector('.st-sy-preview__hint').style.display = 'none';
    m.show(defId);
  }
  // UX-3: sortable header + search. Sort keys map to the hull columns.
  const _sort = { key: 'tier', dir: 'asc' };
  function applySort(key) {
    if (_sort.key === key) _sort.dir = _sort.dir === 'asc' ? 'desc' : 'asc';
    else { _sort.key = key; _sort.dir = 'asc'; }
    rebuildBuyable();
  }
  const head = document.createElement('div');
  head.className = 'st-row st-row-head';
  const hHull = buildSortHeader({ key: 'name', label: 'Hull', activeKey: _sort.key, dir: _sort.dir, onSort: applySort });
  hHull.className += ' c-name';
  head.appendChild(hHull);
  [['tier', 'Tier'], ['hull', 'Hull'], ['shield', 'Shield'], ['cargo', 'Cargo'], ['price', 'Price']].forEach(([k, label]) => {
    const h = buildSortHeader({ key: k, label, activeKey: _sort.key, dir: _sort.dir, onSort: applySort });
    h.className += ' c-num';
    head.appendChild(h);
  });
  const actH = document.createElement('span'); actH.className = 'c-act'; head.appendChild(actH);
  buyWrap.appendChild(head);
  // UX-3: search + affordability filter chips.
  const _filter = { q: '', affordable: false };
  const ctrls = createListControls({
    search: true, placeholder: 'Search hulls…',
    onSearch: (q) => { _filter.q = q; rebuildBuyable(); },
    chips: [{ key: 'affordable', label: 'Affordable', active: false }],
    onChip: (key, active) => { _filter.affordable = active; rebuildBuyable(); },
  });
  buyWrap.appendChild(ctrls.el);
  const list = document.createElement('div');
  list.className = 'st-list';
  buyWrap.appendChild(list);

  // ---- comparison tooltip ----
  injectCmpStyle();
  const cmpPanel = document.createElement('div');
  cmpPanel.className = 'st-sy-cmp';
  cmpPanel.style.display = 'none';
  buyWrap.appendChild(cmpPanel);

  root.appendChild(buyWrap);

  // delegated listeners
  ownedList.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const idx = Number(btn.closest('[data-idx]').getAttribute('data-idx'));
    const ships = ctx.registry && ctx.registry.get && ctx.registry.get('ships');
    if (btn.getAttribute('data-act') === 'sell') {
      // Selling a hull refunds 50% irreversibly — confirm first (UX-2). Surface the refund amount.
      const owned = (ctx.state.player.ownedShips || [])[idx];
      const def = owned ? SHIP_BY_ID.get(owned.defId) : null;
      const refund = def && def.price != null ? Math.floor(((def.buyback != null ? def.buyback : def.price)) * 0.5) : 0;
      const name = (owned && owned.customName) || (def && def.name) || 'this ship';
      const ok = await confirm({
        title: 'Sell ' + name + '?',
        body: 'Refund: ' + fmtCr(refund) + ' (50% of hull value). Equipped modules stay in your inventory. This cannot be undone.',
        confirmLabel: 'Sell', danger: true,
      });
      if (!ok) return;
      if (ships && typeof ships.sellShip === 'function') ships.sellShip(idx);
      else ctx.bus.emit('ui:sellShip', { index: idx });
      ctx.bus.emit('audio:cue', { id: 'ui_click' });
      refresh();
    } else if (btn.getAttribute('data-act') === 'active') {
      if (ships && typeof ships.setActiveShip === 'function') ships.setActiveShip(idx);
      else ctx.bus.emit('ui:setActiveShip', { index: idx });
      ctx.bus.emit('audio:cue', { id: 'ui_click' });
      refresh();
    }
  });

  list.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-act="buy"]');
    if (!btn) return;
    const defId = btn.closest('[data-ship]').getAttribute('data-ship');
    ctx.bus.emit('ui:buyShip', { defId });
    ctx.bus.emit('audio:cue', { id: 'ui_click' });
  });

  // ---- comparison tooltip hover logic ----
  list.addEventListener('mouseover', (ev) => {
    const row = ev.target.closest('[data-ship]');
    if (!row) { cmpPanel.style.display = 'none'; return; }
    const defId = row.getAttribute('data-ship');
    const hovDef = SHIP_BY_ID.get(defId);
    if (!hovDef) { cmpPanel.style.display = 'none'; return; }
    showComparison(hovDef, row);
    // UX-1: spin up the 3D preview for the hovered hull.
    showPreview(defId);
  });
  list.addEventListener('mouseleave', () => { cmpPanel.style.display = 'none'; });

  function showComparison(newDef, rowEl) {
    const p = ctx.state.player;
    const activeShip = (p.ownedShips || [])[p.activeShipIndex || 0];
    const curDef = activeShip ? SHIP_BY_ID.get(activeShip.defId) : null;
    if (!curDef) { cmpPanel.style.display = 'none'; return; }

    // Position near the hovered row
    const buyRect = buyWrap.getBoundingClientRect();
    const rowRect = rowEl.getBoundingClientRect();
    const topOffset = rowRect.top - buyRect.top;
    cmpPanel.style.top = Math.max(0, topOffset - 20) + 'px';
    cmpPanel.style.display = '';

    // Build stat comparison rows
    const STATS = [
      { label: 'Hull',      key: 'hull',      higher: true },
      { label: 'Shield',    key: 'shield',     higher: true },
      { label: 'Handling',  key: 'handling',   higher: true },
      { label: 'Cargo',     key: 'cargo',      higher: true },
      { label: 'Mass',      key: 'mass',       higher: false },
      { label: 'Energy',    key: 'energyCap',  higher: true },
    ];

    let gridHtml = '';
    for (const s of STATS) {
      const cv = curDef[s.key] || 0;
      const nv = newDef[s.key] || 0;
      const delta = nv - cv;
      let cls = 'st-sy-cmp-same';
      let arrow = '=';
      let deltaStr = '';
      if (delta > 0) {
        cls = s.higher ? 'st-sy-cmp-better' : 'st-sy-cmp-worse';
        arrow = '▶'; deltaStr = '+' + (s.key === 'handling' ? delta.toFixed(1) : delta);
      } else if (delta < 0) {
        cls = s.higher ? 'st-sy-cmp-worse' : 'st-sy-cmp-better';
        arrow = '◀'; deltaStr = (s.key === 'handling' ? delta.toFixed(1) : String(delta));
      }
      gridHtml +=
        '<div class="st-sy-cmp-lbl">' + s.label + '</div>' +
        '<div class="st-sy-cmp-cur">' + (s.key === 'handling' ? cv.toFixed(1) : cv) + '</div>' +
        '<div class="st-sy-cmp-arr">' + arrow + '</div>' +
        '<div class="st-sy-cmp-new ' + cls + '">' + (s.key === 'handling' ? nv.toFixed(1) : nv) +
          (deltaStr ? '<span class="st-sy-cmp-delta">' + deltaStr + '</span>' : '') + '</div>';
    }

    // Slot comparison
    const SLOT_TYPES = ['weapon', 'shield', 'engine', 'cargo', 'mining', 'utility'];
    let slotsHtml = '';
    for (const st of SLOT_TYPES) {
      const cc = slotCount(curDef, st);
      const nc = slotCount(newDef, st);
      const d = nc - cc;
      let cls = '';
      if (d > 0) cls = 'st-sy-cmp-better';
      else if (d < 0) cls = 'st-sy-cmp-worse';
      slotsHtml += '<span style="margin-right:10px;">' + st[0].toUpperCase() + st.slice(1) +
        ': <b' + (cls ? ' class="' + cls + '"' : '') + '>' + nc + '</b>' +
        (d !== 0 ? ' <span class="st-sy-cmp-delta ' + cls + '">(' + (d > 0 ? '+' : '') + d + ')</span>' : '') +
        '</span>';
    }

    const roleDesc = ROLE_DESC[newDef.role] || '';
    const driveLabel = driveLabelFor(newDef);
    cmpPanel.innerHTML =
      '<div class="st-sy-cmp-h">' +
        '<div class="st-sy-cmp-name">' + escapeHtml(newDef.name) + ' vs ' + escapeHtml(curDef.name) + '</div>' +
        '<div class="st-sy-cmp-role">T' + newDef.tier + ' ' + escapeHtml(newDef.role || '') +
          (driveLabel ? ' · ' + escapeHtml(driveLabel) + ' Drive' : '') + '</div>' +
      '</div>' +
      (roleDesc ? '<div class="st-sy-cmp-desc">' + escapeHtml(roleDesc) + '</div>' : '') +
      '<div class="st-sy-cmp-grid">' +
        '<div class="st-sy-cmp-lbl"></div><div class="st-sy-cmp-lbl" style="text-align:right">YOURS</div>' +
        '<div></div><div class="st-sy-cmp-lbl" style="text-align:right">NEW</div>' +
        gridHtml +
      '</div>' +
      '<div class="st-sy-cmp-slots">' + slotsHtml + '</div>';
  }

  function isUnlocked(def) {
    const ships = ctx.registry && ctx.registry.get && ctx.registry.get('ships');
    if (ships && typeof ships.isUnlocked === 'function') return ships.isUnlocked(def);
    if (!def.requiresTech) return true;
    return (ctx.state.player.researchedNodes || []).includes(def.requiresTech);
  }

  function rebuildOwned() {
    const p = ctx.state.player;
    const frag = document.createDocumentFragment();
    (p.ownedShips || []).forEach((owned, i) => {
      const def = SHIP_BY_ID.get(owned.defId) || { name: owned.defId };
      const card = document.createElement('div');
      card.className = 'st-sy-card' + (i === p.activeShipIndex ? ' active' : '');
      card.setAttribute('data-idx', String(i));
      const refund = def.price != null ? Math.floor(((def.buyback != null ? def.buyback : def.price)) * 0.5) : 0;
      card.innerHTML =
        '<div class="st-sy-name">' + escapeHtml(owned.customName || def.name) + (i === p.activeShipIndex ? ' <span class="st-tag st-tag-active">ACTIVE</span>' : '') + '</div>' +
        '<div class="st-sy-meta mono">T' + (def.tier != null ? def.tier : '?') + ' · ' + escapeHtml(def.role || '') + '</div>' +
        '<div class="st-sy-btns">' +
          (i === p.activeShipIndex ? '' : '<button data-act="active">Make Active</button>') +
          (i === p.activeShipIndex ? '' : '<button data-act="sell">Sell (' + fmtCr(refund) + ')</button>') +
        '</div>';
      frag.appendChild(card);
    });
    ownedList.textContent = '';
    ownedList.appendChild(frag);
  }

  function rebuildBuyable() {
    const p = ctx.state.player;
    const ownedDefIds = new Set((p.ownedShips || []).map((o) => o.defId));
    // UX-3: refresh sort-header arrows for the current sort key/dir.
    head.querySelectorAll('.sf-sort').forEach((el) => {
      const isActive = el.getAttribute('data-sk') === _sort.key;
      el.classList.toggle('active', isActive);
      el.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      el.setAttribute('aria-label', sortHeaderAria(el.getAttribute('data-label') || '', isActive, _sort.dir));
      const arrow = el.querySelector('.sf-sort__arrow');
      if (arrow) arrow.textContent = isActive ? (_sort.dir === 'asc' ? '▲' : '▼') : '↕';
    });
    // Apply search + affordability filter, then sort.
    const q = (_filter.q || '').trim().toLowerCase();
    let rows = SHIPS.filter((def) => {
      if (q) {
        const hay = (def.name + ' ' + (def.role || '') + ' ' + (def.id || '')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (_filter.affordable && p.credits < (def.price || 0)) return false;
      return true;
    });
    const dir = _sort.dir === 'desc' ? -1 : 1;
    const byName = (a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    rows.sort((a, b) => {
      let v = 0;
      switch (_sort.key) {
        case 'name': v = byName(a, b); break;
        case 'tier': v = (a.tier || 0) - (b.tier || 0); break;
        case 'hull': v = (a.hull || 0) - (b.hull || 0); break;
        case 'shield': v = (a.shield || 0) - (b.shield || 0); break;
        case 'cargo': v = (a.cargo || 0) - (b.cargo || 0); break;
        case 'price': v = (a.price || 0) - (b.price || 0); break;
        default: v = (a.tier || 0) - (b.tier || 0) || byName(a, b);
      }
      return dir * v || byName(a, b);
    });
    const frag = document.createDocumentFragment();
    for (const def of rows) {
      const row = document.createElement('div');
      row.className = 'st-row';
      row.setAttribute('data-ship', def.id);
      const unlocked = isUnlocked(def);
      const owned = ownedDefIds.has(def.id);
      const afford = p.credits >= (def.price || 0);
      let btn;
      if (!unlocked) btn = '<button disabled title="Requires ' + escapeHtml(def.requiresTech) + '">Locked</button>';
      else btn = '<button data-act="buy"' + (afford ? '' : ' disabled') + '>Buy</button>';
      row.innerHTML =
        '<span class="c-name">' + escapeHtml(def.name) + (owned ? ' <span class="st-tag st-tag-owned">owned</span>' : '') +
          '<br><span class="st-slotline mono">' + escapeHtml(slotSummary(def)) + '</span></span>' +
        '<span class="c-num mono">T' + def.tier + '</span>' +
        '<span class="c-num mono">' + def.hull + '</span>' +
        '<span class="c-num mono">' + def.shield + '</span>' +
        '<span class="c-num mono">' + def.cargo + 'u</span>' +
        '<span class="c-num mono">' + (def.price ? fmtCr(def.price) : 'Free') + '</span>' +
        '<span class="c-act">' + btn + '</span>';
      if (!unlocked) row.classList.add('locked');
      frag.appendChild(row);
    }
    list.textContent = '';
    if (!frag.childElementCount) {
      const empty = document.createElement('div');
      empty.className = 'st-empty';
      empty.textContent = q ? 'No hulls match "' + q + '".' : 'No hulls available.';
      list.appendChild(empty);
    } else {
      list.appendChild(frag);
    }
  }

  function refresh() { rebuildOwned(); rebuildBuyable(); cmpPanel.style.display = 'none'; }

  return {
    el: root,
    stationId: null,
    onShow(c) {
      if (c && c.stationId) this.stationId = c.stationId;
      if (previewMount && typeof previewMount.setActive === 'function') previewMount.setActive(true);
      refresh();
    },
    onHide() {
      if (previewMount && typeof previewMount.setActive === 'function') previewMount.setActive(false);
      cmpPanel.style.display = 'none';
    },
    refresh,
    // UX-1: tear down the preview renderer when the panel is destroyed (frees its WebGL context).
    dispose() { if (previewMount) { try { previewMount.dispose(); } catch (e) {} previewMount = null; } },
  };
}
