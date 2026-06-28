// src/ui/screens/outfitting.js — STATION "Outfitting" tab panel.
// Shows the active ship's slot grid + installed modules + the player's module inventory.
// Fitting/unfitting emits ui:fitModule / ui:unfitModule; the ships system owns the mutation and
// re-derives stats (§0.6, §0.18, §4.4). Includes a live stat-delta preview computed with
// ships.getDerivedStats (a pure exported builder) — preview only, never mutates state.
// MODULE SHOP: lists purchasable modules/weapons filtered by the docked station's sector tier and
// the player's researched tech. Emits ui:buyModule {defId}; the ships system owns the credit
// charge + inventory push (§0.6). Comparison delta vs the currently fitted module of the same
// slot type is shown so the player can evaluate upgrades at a glance.
import { buildSlotList, getDerivedStats } from '../../systems/ships.js';
import { SHIPS } from '../../data/ships.js';
import { MODULES } from '../../data/modules.js';
import { WEAPONS } from '../../data/weapons.js';
import { SECTORS } from '../../data/sectors.js';
import { TECH_NODES } from '../../data/tech.js';
import { confirm } from '../confirm.js';
import { escapeHtml } from '../comms.js';

const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const TECH_BY_ID = new Map(TECH_NODES.map((t) => [t.id, t]));

// Drive-family label for the preview header. The hull's driveId resolves to one of five propulsion
// families (spec §6); surfacing it in outfitting lets the player feel the family switch on a new hull.
const DRIVE_FAMILY_LABEL = {
  reaction: 'Reaction', gravimetric: 'Gravimetric', pulse_plate: 'Pulse Plate',
  torch: 'Torch', field_sail: 'Field Sail',
};
function driveLabelFor(defId) {
  const def = SHIP_BY_ID.get(defId);
  const driveId = def && def.driveId;
  if (!driveId) return '';
  if (driveId.startsWith('drive_gravimetric')) return DRIVE_FAMILY_LABEL.gravimetric;
  if (driveId.startsWith('drive_pulse_plate')) return DRIVE_FAMILY_LABEL.pulse_plate;
  if (driveId.startsWith('drive_torch')) return DRIVE_FAMILY_LABEL.torch;
  if (driveId.startsWith('drive_field_sail')) return DRIVE_FAMILY_LABEL.field_sail;
  if (driveId.startsWith('drive_reaction')) return DRIVE_FAMILY_LABEL.reaction;
  return '';
}
const FITTABLE_BY_ID = new Map();
for (const m of MODULES) FITTABLE_BY_ID.set(m.id, m);
for (const w of WEAPONS) if (!FITTABLE_BY_ID.has(w.id)) FITTABLE_BY_ID.set(w.id, w);

// All purchasable items (modules + weapons), sorted by slot type then tier then price.
const ALL_BUYABLE = [...MODULES, ...WEAPONS].filter((d) => d.price > 0);
ALL_BUYABLE.sort((a, b) => {
  if (a.slotType < b.slotType) return -1;
  if (a.slotType > b.slotType) return 1;
  if (a.tier !== b.tier) return a.tier - b.tier;
  return a.price - b.price;
});

const SIZE_RANK = { S: 1, M: 2, L: 3 };
function fits(slot, def) {
  return !!slot && !!def && slot.type === def.slotType && SIZE_RANK[slot.size] >= SIZE_RANK[def.size];
}

function fmtCr(n) { return (Math.round(n) || 0).toLocaleString('en-US'); }
function techName(id) {
  const node = TECH_BY_ID.get(id);
  return (node && node.name) || String(id || 'required tech').replace(/^tech_/, '').replace(/_/g, ' ');
}

export function describeOutfittingPurchase(def, player = {}, slots = [], fittings = []) {
  if (!def) {
    return {
      state: 'missing',
      unlocked: false,
      afford: false,
      hasSlot: false,
      fitSlotIndex: -1,
      disabled: true,
      label: 'Unavailable',
      title: 'Select a module to inspect purchase options.',
    };
  }
  const researched = new Set(player.researchedNodes || []);
  const credits = Math.max(0, Number(player.credits) || 0);
  const price = Math.max(0, Number(def.price) || 0);
  const unlocked = !def.requiresTech || researched.has(def.requiresTech);
  const afford = credits >= price;
  const safeSlots = Array.isArray(slots) ? slots : [];
  const safeFittings = Array.isArray(fittings) ? fittings : [];
  const hasSlot = safeSlots.some((s) => s.type === def.slotType && SIZE_RANK[s.size] >= SIZE_RANK[def.size]);
  const fitSlotIndex = safeSlots.findIndex((s, i) => !safeFittings[i] && fits(s, def));

  if (!unlocked) {
    const req = techName(def.requiresTech);
    return {
      state: 'locked',
      unlocked,
      afford,
      hasSlot,
      fitSlotIndex,
      disabled: true,
      label: 'Research ' + req,
      title: def.name + ' requires ' + req + ' before purchase.',
    };
  }
  if (!afford) {
    const missing = Math.max(0, price - credits);
    return {
      state: 'funding',
      unlocked,
      afford,
      hasSlot,
      fitSlotIndex,
      disabled: true,
      label: 'Need ' + fmtCr(missing) + ' cr',
      title: def.name + ' costs ' + fmtCr(price) + ' cr. You need ' + fmtCr(missing) + ' more credits.',
    };
  }
  if (fitSlotIndex >= 0) {
    const slot = safeSlots[fitSlotIndex] || {};
    return {
      state: 'fit',
      unlocked,
      afford,
      hasSlot,
      fitSlotIndex,
      disabled: false,
      label: 'Buy & Fit',
      title: 'Buy ' + def.name + ' and fit it to the ' + (slot.type || def.slotType) + ' ' + (slot.size || def.size) + ' slot.',
    };
  }
  if (hasSlot) {
    return {
      state: 'inventory',
      unlocked,
      afford,
      hasSlot,
      fitSlotIndex,
      disabled: false,
      label: 'Buy to Inventory',
      title: def.name + ' fits this hull, but every compatible slot is full. Buy it into inventory or unfit a module first.',
    };
  }
  return {
    state: 'inventory',
    unlocked,
    afford,
    hasSlot,
    fitSlotIndex,
    disabled: false,
    label: 'Buy to Inventory',
    title: 'No compatible ' + def.slotType + ' ' + def.size + ' slot on this hull. Buy it into inventory for another ship.',
  };
}

/** Resolve the sector tier for the station the player is docked at. */
function stationTier(stationId) {
  for (const sec of SECTORS) {
    for (const st of sec.stations || []) {
      if (st.id === stationId) return sec.tier;
    }
  }
  return 0;
}

/** Readable stat summary for a module/weapon def (compact, for the shop row). */
function statSnippet(def) {
  const parts = [];
  // weapons
  if (def.dps != null) parts.push(Math.round(def.dps) + ' dps');
  if (def.range != null) parts.push(def.range + ' rng');
  if (def.dmg != null && def.rof != null) parts.push(def.dmg + 'x' + def.rof.toFixed(1));
  // modules with mods
  const m = def.mods;
  if (m) {
    if (m.shieldFlat) parts.push('+' + m.shieldFlat + ' shd');
    if (m.shieldRegenFlat) parts.push('+' + m.shieldRegenFlat + ' regen');
    if (m.topSpeed) parts.push(m.topSpeed + ' spd');
    if (m.accelMult != null) parts.push(m.accelMult.toFixed(1) + 'x accel');
    if (m.cargoFlat) parts.push('+' + m.cargoFlat + ' cargo');
    if (m.cargoCapPct) parts.push('+' + Math.round(m.cargoCapPct * 100) + '% cap');
    if (m.damageReductionPct) parts.push('-' + Math.round(m.damageReductionPct * 100) + '% dmg');
    if (m.boostTopSpeedPct) parts.push('+' + Math.round(m.boostTopSpeedPct * 100) + '% boost');
    if (m.magnetRange) parts.push(m.magnetRange + ' magnet');
    if (m.weaponRangePct) parts.push('+' + Math.round(m.weaponRangePct * 100) + '% wpn rng');
    if (m.weaponDmgPct) parts.push('+' + Math.round(m.weaponDmgPct * 100) + '% wpn dmg');
    if (m.radarRangePct) parts.push('+' + Math.round(m.radarRangePct * 100) + '% radar');
    if (m.hullRepairOOC) parts.push('+' + m.hullRepairOOC + ' hull/s');
    if (m.droneBay) parts.push('drone bay');
    if (m.jumpDriveTier) parts.push('jump T' + m.jumpDriveTier);
    if (m.revealCargo) parts.push('scan cargo');
    if (m.marketIntel) parts.push('market data');
  }
  // mining modules
  if (def.dps != null && def.slotType === 'mining') {
    parts.length = 0; // clear weapon-style entries
    parts.push(def.dps + ' ore/s');
    if (def.range) parts.push(def.range + ' rng');
    if (def.rareOreChance) parts.push(Math.round(def.rareOreChance * 100) + '% rare');
    if (def.directToCargo) parts.push('direct');
  }
  return parts.join(' · ');
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

  // ---- Module Shop section ----
  const shopWrap = document.createElement('div');
  shopWrap.className = 'st-outfit-shop';
  shopWrap.innerHTML =
    '<div class="st-sub-h">Module Shop</div>' +
    '<div class="st-shop-head">' +
      '<span class="st-shop-credits mono"></span>' +
    '</div>' +
    '<div class="st-shop-head-row st-row st-row-head">' +
      '<span class="c-name">Module</span>' +
      '<span class="c-num">Slot</span>' +
      '<span class="c-num">Stats</span>' +
      '<span class="c-num">Price</span>' +
      '<span class="c-act"></span>' +
    '</div>' +
    '<div class="st-shop-list"></div>';
  root.appendChild(shopWrap);
  const shopList = shopWrap.querySelector('.st-shop-list');
  const shopCredits = shopWrap.querySelector('.st-shop-credits');

  // selected slot index for fitting from inventory; null = none.
  let selectedSlot = null;
  // hovered preview fitting: {slotIndex, defId} or {slotIndex, remove:true} or null.
  let previewFit = null;

  function activeOwned() {
    const p = ctx.state.player;
    return (p.ownedShips || [])[p.activeShipIndex] || null;
  }

  // ---- delegated listeners ----
  slotGrid.addEventListener('click', async (ev) => {
    const cell = ev.target.closest('[data-slot]');
    if (!cell) return;
    const slotIndex = Number(cell.getAttribute('data-slot'));
    const unfitBtn = ev.target.closest('[data-act="unfit"]');
    if (unfitBtn) {
      const owned = activeOwned();
      const fittedId = owned && owned.fittings && owned.fittings[slotIndex];
      const def = fittedId ? FITTABLE_BY_ID.get(fittedId) : null;
      const name = def && def.name || 'this module';
      const ok = await confirm({
        title: 'Unfit ' + name + '?',
        body: 'The module will move to inventory and this ship will immediately lose its fitted stats.',
        confirmLabel: 'Unfit',
        danger: true,
      });
      if (!ok) return;
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

  // ---- shop delegated listener ----
  shopList.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-act="buy"]');
    if (!btn || btn.disabled) return;
    const defId = btn.closest('[data-shop]').getAttribute('data-shop');
    const fitSlotIndex = Number(btn.getAttribute('data-fit-slot'));
    const payload = { defId };
    if (Number.isInteger(fitSlotIndex) && fitSlotIndex >= 0) payload.fitSlotIndex = fitSlotIndex;
    ctx.bus.emit('ui:buyModule', payload);
    ctx.bus.emit('audio:cue', { id: 'ui_click' });
    // Refresh after a short delay so the credits:changed event has processed.
    setTimeout(() => refresh(), 50);
  });

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
      // Weapon hardpoints show their facing (Phase 2) — front/left/right/rear/turret — so the
      // strategic choice of where a gun sits on the hull is legible at a glance.
      const facingTag = (slot.type === 'weapon' && slot.facing && slot.facing !== 'front')
        ? ' <span class="st-slot-facing">' + escapeHtml(slot.facing) + '</span>' : '';
      cell.innerHTML =
        '<div class="st-slot-type mono">' + escapeHtml(slot.type) + ' ' + escapeHtml(slot.size) + facingTag + '</div>' +
        '<div class="st-slot-mod">' + (def ? escapeHtml(def.name) : (selectedSlot === i ? 'pick a module ▾' : '— empty —')) + '</div>' +
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
        '<span class="st-inv-name">' + escapeHtml(def.name) + '</span>' +
        '<span class="st-inv-meta mono">' + escapeHtml(def.slotType) + ' ' + escapeHtml(def.size) + '</span>';
      frag.appendChild(item);
    }
    invList.appendChild(frag);
  }

  function rebuildShop() {
    const p = ctx.state.player;
    const owned = activeOwned();
    const shipDef = owned ? SHIP_BY_ID.get(owned.defId) : null;
    const slots = shipDef ? buildSlotList(shipDef) : [];
    const fittings = owned && Array.isArray(owned.fittings) ? owned.fittings : [];
    const tier = stationTier(panel.stationId);

    shopCredits.textContent = 'CREDITS: ' + fmtCr(p.credits);

    shopList.textContent = '';
    const frag = document.createDocumentFragment();
    let lastSlotType = '';

    for (const def of ALL_BUYABLE) {
      // Station tier filter: station sells modules up to tier+1 (a T0 station sells T0 and T1).
      if (def.tier > tier + 1) continue;

      const alreadyOwned = (p.moduleInventory || []).some((m) => m.defId === def.id);

      // Slot-type group header
      if (def.slotType !== lastSlotType) {
        lastSlotType = def.slotType;
        const hdr = document.createElement('div');
        hdr.className = 'st-shop-group';
        hdr.textContent = def.slotType.toUpperCase();
        frag.appendChild(hdr);
      }

      // Check if the ship has a compatible slot for this module
      const purchase = describeOutfittingPurchase(def, p, slots, fittings);

      // Comparison delta: find the first fitted module of the same slot type and compare key stats.
      let deltaHtml = '';
      if (owned && def.mods) {
        const fittedSlotIdx = slots.findIndex((s, i) => s.type === def.slotType && owned.fittings[i]);
        const fittedDef = fittedSlotIdx >= 0 ? FITTABLE_BY_ID.get(owned.fittings[fittedSlotIdx]) : null;
        if (fittedDef && fittedDef.mods) {
          const deltas = [];
          const allKeys = new Set([...Object.keys(def.mods), ...Object.keys(fittedDef.mods)]);
          for (const key of allKeys) {
            const nv = def.mods[key]; const ov = fittedDef.mods[key];
            if (typeof nv !== 'number' || typeof ov !== 'number') continue;
            const d = nv - ov;
            if (Math.abs(d) < 0.001) continue;
            const sign = d > 0 ? '+' : '';
            const cls = d > 0 ? 'up' : 'down';
            deltas.push('<span class="st-delta ' + cls + '">' + sign + (Number.isInteger(d) ? d : d.toFixed(1)) + ' ' + key.replace(/([A-Z])/g, ' $1').toLowerCase() + '</span>');
          }
          if (deltas.length) deltaHtml = '<div class="st-shop-delta">' + deltas.join(' ') + '</div>';
        }
      }

      const row = document.createElement('div');
      row.className = 'st-shop-row' + (!purchase.unlocked ? ' locked' : '') + (!purchase.afford ? ' noafford' : '') + (!purchase.hasSlot ? ' nofit' : '');
      row.setAttribute('data-shop', def.id);
      const fitAttr = purchase.fitSlotIndex >= 0 ? ' data-fit-slot="' + purchase.fitSlotIndex + '"' : '';
      const actionAttrs = purchase.disabled ? ' disabled' : ' data-act="buy"' + fitAttr;
      const btnHtml = '<button' + actionAttrs + ' title="' + escapeHtml(purchase.title) + '" aria-label="' + escapeHtml(purchase.title) + '">' + escapeHtml(purchase.label) + '</button>';

      row.innerHTML =
        '<span class="c-name">' + escapeHtml(def.name) +
          (alreadyOwned ? ' <span class="st-tag st-tag-owned">owned</span>' : '') +
          (!purchase.hasSlot && purchase.unlocked ? ' <span class="st-tag">no slot</span>' : '') +
        '</span>' +
        '<span class="c-num st-shop-slot mono">' + escapeHtml(def.slotType[0].toUpperCase()) + ':' + escapeHtml(def.size) + '</span>' +
        '<span class="c-num st-shop-stats">' + escapeHtml(statSnippet(def)) + deltaHtml + '</span>' +
        '<span class="c-num st-shop-price mono">' + fmtCr(def.price) + '</span>' +
        '<span class="c-act">' + btnHtml + '</span>';
      frag.appendChild(row);
    }
    if (!frag.childElementCount) {
      shopList.innerHTML = '<div class="st-empty">No modules available at this station.</div>';
    } else {
      shopList.appendChild(frag);
    }
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
    const driveLabel = driveLabelFor(owned.defId);
    if (driveLabel) {
      const driveRow = document.createElement('div');
      driveRow.className = 'st-stat-row st-stat-row--drive';
      driveRow.innerHTML =
        '<span class="st-stat-l">Drive</span>' +
        '<span class="st-stat-v mono">' + escapeHtml(driveLabel) + '</span>';
      frag.appendChild(driveRow);
    }
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

  function refresh() { rebuildSlots(); rebuildInventory(); rebuildShop(); renderPreview(); }

  const panel = {
    el: root,
    stationId: null,
    onShow(c) { if (c && c.stationId) panel.stationId = c.stationId; selectedSlot = null; previewFit = null; refresh(); },
    refresh,
  };
  return panel;
}
