// src/ui/screens/outfitting.js — STATION "Outfitting" tab panel.
// Shows the active ship's slot grid + installed modules + the player's module inventory.
// Fitting/unfitting emits ui:fitModule / ui:unfitModule; the ships system owns the mutation and
// re-derives stats (§0.6, §0.18, §4.4). Includes a live stat-delta preview computed with
// ships.getDerivedStats (a pure exported builder) — preview only, never mutates state.
import { buildSlotList, getDerivedStats } from '../../systems/ships.js';
import { SHIPS } from '../../data/ships.js';
import { MODULES } from '../../data/modules.js';
import { WEAPONS } from '../../data/weapons.js';

const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const FITTABLE_BY_ID = new Map();
for (const m of MODULES) FITTABLE_BY_ID.set(m.id, m);
for (const w of WEAPONS) if (!FITTABLE_BY_ID.has(w.id)) FITTABLE_BY_ID.set(w.id, w);

const SIZE_RANK = { S: 1, M: 2, L: 3 };
function fits(slot, def) {
  return !!slot && !!def && slot.type === def.slotType && SIZE_RANK[slot.size] >= SIZE_RANK[def.size];
}

// Stat fields shown in the preview (label, key, higherIsBetter, suffix).
const PREVIEW_STATS = [
  { k: 'hullMax', l: 'Hull', up: true },
  { k: 'shieldMax', l: 'Shield', up: true },
  { k: 'shieldRegenRate', l: 'Shield Regen', up: true, dp: 1 },
  { k: 'capMax', l: 'Energy', up: true },
  { k: 'capRegen', l: 'Energy Regen', up: true, dp: 1 },
  { k: 'cargoCap', l: 'Cargo', up: true, suffix: 'u' },
  { k: 'maxSpeed', l: 'Top Speed', up: true, dp: 0 },
  { k: 'thrust', l: 'Thrust', up: true, dp: 0 },
  { k: 'turnRate', l: 'Turn Rate', up: true, dp: 2 },
  { k: 'mass', l: 'Mass', up: false, dp: 0, suffix: 't' },
];

export function createOutfittingPanel(ctx) {
  const root = document.createElement('div');
  root.className = 'st-panel st-outfit';

  const top = document.createElement('div');
  top.className = 'st-outfit-top';
  top.innerHTML =
    '<div class="st-outfit-grid"><div class="st-sub-h">Slots</div><div class="st-slot-grid"></div></div>' +
    '<div class="st-outfit-preview"><div class="st-sub-h">Stats</div><div class="st-stat-table"></div></div>';
  root.appendChild(top);
  const slotGrid = top.querySelector('.st-slot-grid');
  const statTable = top.querySelector('.st-stat-table');

  const invWrap = document.createElement('div');
  invWrap.className = 'st-outfit-inv';
  invWrap.innerHTML = '<div class="st-sub-h">Module Inventory</div><div class="st-inv-list"></div>';
  root.appendChild(invWrap);
  const invList = invWrap.querySelector('.st-inv-list');

  // selected slot index for fitting from inventory; null = none.
  let selectedSlot = null;
  // hovered preview fitting: {slotIndex, defId} or {slotIndex, remove:true} or null.
  let previewFit = null;

  function activeOwned() {
    const p = ctx.state.player;
    return (p.ownedShips || [])[p.activeShipIndex] || null;
  }

  // ---- delegated listeners ----
  slotGrid.addEventListener('click', (ev) => {
    const cell = ev.target.closest('[data-slot]');
    if (!cell) return;
    const slotIndex = Number(cell.getAttribute('data-slot'));
    const unfitBtn = ev.target.closest('[data-act="unfit"]');
    if (unfitBtn) {
      ctx.bus.emit('ui:unfitModule', { slotIndex });
      ctx.bus.emit('audio:cue', { id: 'ui_click' });
      selectedSlot = null; previewFit = null;
      refresh();
      return;
    }
    // select an empty slot to fit into from inventory
    selectedSlot = (selectedSlot === slotIndex) ? null : slotIndex;
    previewFit = null;
    refresh();
  });
  slotGrid.addEventListener('mouseover', (ev) => {
    const cell = ev.target.closest('[data-slot]');
    if (!cell) return;
    const has = cell.getAttribute('data-filled') === '1';
    if (has) { previewFit = { slotIndex: Number(cell.getAttribute('data-slot')), remove: true }; renderPreview(); }
  });
  slotGrid.addEventListener('mouseout', () => { if (previewFit && previewFit.remove) { previewFit = null; renderPreview(); } });

  invList.addEventListener('click', (ev) => {
    const item = ev.target.closest('[data-inst]');
    if (!item) return;
    const instanceId = item.getAttribute('data-inst');
    const defId = item.getAttribute('data-def');
    const def = FITTABLE_BY_ID.get(defId);
    // target slot: the selected slot if compatible, else the first compatible empty slot.
    const owned = activeOwned();
    if (!owned) return;
    const shipDef = SHIP_BY_ID.get(owned.defId);
    const slots = buildSlotList(shipDef);
    let target = (selectedSlot != null && fits(slots[selectedSlot], def)) ? selectedSlot : -1;
    if (target < 0) target = slots.findIndex((s, i) => !owned.fittings[i] && fits(s, def));
    if (target < 0) {
      ctx.bus.emit('toast', { text: 'No compatible empty slot for ' + def.name, kind: 'warn', ttl: 3 });
      ctx.bus.emit('audio:cue', { id: 'ui_deny' });
      return;
    }
    ctx.bus.emit('ui:fitModule', { slotIndex: target, instanceId });
    ctx.bus.emit('audio:cue', { id: 'ui_click' });
    selectedSlot = null; previewFit = null;
    refresh();
  });
  invList.addEventListener('mouseover', (ev) => {
    const item = ev.target.closest('[data-inst]');
    if (!item) { return; }
    const owned = activeOwned();
    if (!owned) return;
    const def = FITTABLE_BY_ID.get(item.getAttribute('data-def'));
    const shipDef = SHIP_BY_ID.get(owned.defId);
    const slots = buildSlotList(shipDef);
    let target = (selectedSlot != null && fits(slots[selectedSlot], def)) ? selectedSlot : slots.findIndex((s, i) => !owned.fittings[i] && fits(s, def));
    if (target >= 0) { previewFit = { slotIndex: target, defId: def.id }; renderPreview(); }
  });
  invList.addEventListener('mouseout', () => { if (previewFit && !previewFit.remove) { previewFit = null; renderPreview(); } });

  // ---- builders ----
  function rebuildSlots() {
    const owned = activeOwned();
    slotGrid.textContent = '';
    if (!owned) { slotGrid.innerHTML = '<div class="st-empty">No active ship.</div>'; return; }
    const shipDef = SHIP_BY_ID.get(owned.defId);
    const slots = buildSlotList(shipDef);
    const frag = document.createDocumentFragment();
    slots.forEach((slot, i) => {
      const fittedId = owned.fittings[i];
      const def = fittedId ? FITTABLE_BY_ID.get(fittedId) : null;
      const cell = document.createElement('div');
      cell.className = 'st-slot st-slot-' + slot.type + (fittedId ? ' filled' : ' empty') + (selectedSlot === i ? ' sel' : '');
      cell.setAttribute('data-slot', String(i));
      cell.setAttribute('data-filled', fittedId ? '1' : '0');
      cell.innerHTML =
        '<div class="st-slot-type mono">' + slot.type + ' ' + slot.size + '</div>' +
        '<div class="st-slot-mod">' + (def ? def.name : (selectedSlot === i ? 'pick a module ▾' : '— empty —')) + '</div>' +
        (fittedId ? '<button class="st-slot-unfit" data-act="unfit">unfit</button>' : '');
      frag.appendChild(cell);
    });
    slotGrid.appendChild(frag);
  }

  function rebuildInventory() {
    const p = ctx.state.player;
    const inv = p.moduleInventory || [];
    invList.textContent = '';
    if (!inv.length) { invList.innerHTML = '<div class="st-empty">Inventory empty. Unfit or buy modules to stock it.</div>'; return; }
    const owned = activeOwned();
    const shipDef = owned ? SHIP_BY_ID.get(owned.defId) : null;
    const slots = shipDef ? buildSlotList(shipDef) : [];
    const frag = document.createDocumentFragment();
    for (const m of inv) {
      const def = FITTABLE_BY_ID.get(m.defId);
      if (!def) continue;
      const compatible = owned && slots.some((s, i) => !owned.fittings[i] && fits(s, def));
      const item = document.createElement('div');
      item.className = 'st-inv-item' + (compatible ? '' : ' incompat');
      item.setAttribute('data-inst', m.instanceId);
      item.setAttribute('data-def', m.defId);
      item.innerHTML =
        '<span class="st-inv-name">' + def.name + '</span>' +
        '<span class="st-inv-meta mono">' + def.slotType + ' ' + def.size + '</span>';
      frag.appendChild(item);
    }
    invList.appendChild(frag);
  }

  // Compute the hypothetical fittings array for the preview.
  function fittingsWithPreview(owned) {
    const f = (owned.fittings || []).slice();
    if (previewFit) {
      if (previewFit.remove) f[previewFit.slotIndex] = null;
      else f[previewFit.slotIndex] = previewFit.defId;
    }
    return f;
  }

  function renderPreview() {
    const owned = activeOwned();
    statTable.textContent = '';
    if (!owned) { statTable.innerHTML = '<div class="st-empty">—</div>'; return; }
    const cur = getDerivedStats(owned.defId, owned.fittings || [], ctx.state.player);
    const next = previewFit ? getDerivedStats(owned.defId, fittingsWithPreview(owned), ctx.state.player) : cur;
    const frag = document.createDocumentFragment();
    for (const s of PREVIEW_STATS) {
      const a = cur[s.k] || 0;
      const b = next[s.k] || 0;
      const dp = s.dp != null ? s.dp : 0;
      const delta = b - a;
      const row = document.createElement('div');
      row.className = 'st-stat-row';
      let deltaHtml = '';
      if (Math.abs(delta) > 1e-6) {
        const better = s.up ? delta > 0 : delta < 0;
        const sign = delta > 0 ? '+' : '';
        deltaHtml = '<span class="st-delta ' + (better ? 'up' : 'down') + '">' + sign + delta.toFixed(dp) + '</span>';
      }
      row.innerHTML =
        '<span class="st-stat-l">' + s.l + '</span>' +
        '<span class="st-stat-v mono">' + b.toFixed(dp) + (s.suffix || '') + '</span>' +
        deltaHtml;
      frag.appendChild(row);
    }
    statTable.appendChild(frag);
  }

  function refresh() { rebuildSlots(); rebuildInventory(); renderPreview(); }

  return {
    el: root,
    stationId: null,
    onShow(c) { if (c && c.stationId) this.stationId = c.stationId; selectedSlot = null; previewFit = null; refresh(); },
    refresh,
  };
}
