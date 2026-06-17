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

  function refresh() { rebuildOwned(); rebuildBuyable(); }

  return {
    el: root,
    stationId: null,
    onShow(c) { if (c && c.stationId) this.stationId = c.stationId; refresh(); },
    refresh,
  };
}
