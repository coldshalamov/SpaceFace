// src/ui/screens/shipyard.js — STATION "Shipyard" tab panel.
// Lists buyable hulls with stats; Buy emits ui:buyShip {defId}. Lets the player sell a
// (non-active) owned ship via the ships system (sellShip). Read-only over sim state; the ships
// system owns ownership + emits the credit charge (§0.6, §4.4).
//
// Catalog source: the ships system (ctx.registry.get('ships')) exposes nothing public for the
// catalog, so we read the static SHIPS data and use the system only for unlock checks / sell.
import { SHIPS } from '../../data/ships.js';

const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));

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
  const head = document.createElement('div');
  head.className = 'st-row st-row-head';
  head.innerHTML =
    '<span class="c-name">Hull</span><span class="c-num">Tier</span>' +
    '<span class="c-num">Hull</span><span class="c-num">Shield</span>' +
    '<span class="c-num">Cargo</span><span class="c-num">Price</span><span class="c-act"></span>';
  buyWrap.appendChild(head);
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
  ownedList.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const idx = Number(btn.closest('[data-idx]').getAttribute('data-idx'));
    const ships = ctx.registry && ctx.registry.get && ctx.registry.get('ships');
    if (btn.getAttribute('data-act') === 'sell') {
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
    cmpPanel.innerHTML =
      '<div class="st-sy-cmp-h">' +
        '<div class="st-sy-cmp-name">' + newDef.name + ' vs ' + curDef.name + '</div>' +
        '<div class="st-sy-cmp-role">T' + newDef.tier + ' ' + (newDef.role || '') + '</div>' +
      '</div>' +
      (roleDesc ? '<div class="st-sy-cmp-desc">' + roleDesc + '</div>' : '') +
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
        '<div class="st-sy-name">' + (owned.customName || def.name) + (i === p.activeShipIndex ? ' <span class="st-tag st-tag-active">ACTIVE</span>' : '') + '</div>' +
        '<div class="st-sy-meta mono">T' + (def.tier != null ? def.tier : '?') + ' · ' + (def.role || '') + '</div>' +
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
    const frag = document.createDocumentFragment();
    for (const def of SHIPS) {
      const row = document.createElement('div');
      row.className = 'st-row';
      row.setAttribute('data-ship', def.id);
      const unlocked = isUnlocked(def);
      const owned = ownedDefIds.has(def.id);
      const afford = p.credits >= (def.price || 0);
      let btn;
      if (!unlocked) btn = '<button disabled title="Requires ' + def.requiresTech + '">Locked</button>';
      else btn = '<button data-act="buy"' + (afford ? '' : ' disabled') + '>Buy</button>';
      row.innerHTML =
        '<span class="c-name">' + def.name + (owned ? ' <span class="st-tag st-tag-owned">owned</span>' : '') +
          '<br><span class="st-slotline mono">' + slotSummary(def) + '</span></span>' +
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
    list.appendChild(frag);
  }

  function refresh() { rebuildOwned(); rebuildBuyable(); cmpPanel.style.display = 'none'; }

  return {
    el: root,
    stationId: null,
    onShow(c) { if (c && c.stationId) this.stationId = c.stationId; refresh(); },
    refresh,
  };
}
