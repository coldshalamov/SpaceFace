// Pause Inventory — Plan 54's fee-free in-flight cargo and module-management surface.
//
// The screen is presentation only. Cargo jettison delegates to the registered Cargo owner and
// fitting emits the ordinary Ships intents with an explicit paused-source tag. No wallet, cargo,
// fitting, or derived-stat state is written here.
import { COMMODITIES } from '../../data/commodities.js';
import { MODULES } from '../../data/modules.js';
import { PERSISTENT_CARGO } from '../../data/narrative.js';
import { SHIPS } from '../../data/ships.js';
import { WEAPONS } from '../../data/weapons.js';
import { isUnsellableCargo } from '../../systems/cargo.js';
import { buildSlotList, fits } from '../../systems/ships.js';
import { escapeHtml } from '../comms.js';
import { confirm } from '../confirm.js';

const STYLE_ID = 'sf-pause-inventory-style';
const SHIP_BY_ID = new Map(SHIPS.map((row) => [row.id, row]));
const FITTABLE_BY_ID = new Map([...MODULES, ...WEAPONS].map((row) => [row.id, row]));
const CARGO_BY_ID = new Map([...COMMODITIES, ...PERSISTENT_CARGO].map((row) => [row.id, row]));
let mounted = null;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .sf-pause-inventory{width:min(1120px,95vw);height:min(800px,92vh);margin:auto;padding:22px;display:grid;grid-template-rows:auto 1fr;gap:14px;background:linear-gradient(145deg,#111922,#070b10 72%);border:1px solid rgba(96,220,238,.35);box-shadow:0 28px 90px rgba(0,0,0,.58);color:var(--ink,#dce9f2)}
    .sf-pause-inventory__head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;border-bottom:1px solid rgba(96,220,238,.2);padding-bottom:13px}
    .sf-pause-inventory__head h1{margin:0;font-size:clamp(1.25rem,2.6vw,2.05rem);letter-spacing:.09em;text-transform:uppercase}
    .sf-pause-inventory__head p{margin:5px 0 0;color:#91a9b8;line-height:1.4;max-width:760px}
    .sf-pause-inventory__grid{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:14px;min-height:0}
    .sf-pause-inventory__pane{min-height:0;display:grid;grid-template-rows:auto 1fr;border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.018)}
    .sf-pause-inventory__pane h2{margin:0;padding:11px 13px;font-size:.72rem;letter-spacing:.18em;text-transform:uppercase;color:#72dceb;border-bottom:1px solid rgba(255,255,255,.08)}
    .sf-pause-inventory__scroll{overflow:auto;padding:10px;display:grid;align-content:start;gap:8px}
    .sf-pause-inventory__row{display:grid;gap:6px;padding:10px 11px;border-left:2px solid #4ea6b5;background:rgba(78,166,181,.055)}
    .sf-pause-inventory__row.is-locked{border-left-color:#ae8a51;background:rgba(174,138,81,.055)}
    .sf-pause-inventory__title{display:flex;justify-content:space-between;align-items:center;gap:10px}
    .sf-pause-inventory__title b{min-width:0;overflow:hidden;text-overflow:ellipsis}
    .sf-pause-inventory__meta{font-size:.72rem;color:#8da1b0;line-height:1.35}
    .sf-pause-inventory__actions{display:flex;flex-wrap:wrap;gap:5px}
    .sf-pause-inventory__actions .sf-btn{font-size:.68rem;padding:5px 8px}
    .sf-pause-inventory__slot{border-left-color:#7a78df}
    .sf-pause-inventory__empty{padding:18px;color:#8093a2;text-align:center;border:1px dashed rgba(255,255,255,.1)}
    @media(max-width:760px){.sf-pause-inventory{padding:14px}.sf-pause-inventory__grid{grid-template-columns:1fr}.sf-pause-inventory__pane{min-height:280px}}
  `;
  document.head.appendChild(style);
}

function managerFor(ctx) {
  return ctx.screenManager || ctx.registry?.get?.('ui')?.screenManager || null;
}

function activeOwnedShip(state) {
  const player = state?.player;
  const index = Math.max(0, Math.floor(Number(player?.activeShipIndex) || 0));
  const owned = Array.isArray(player?.ownedShips) ? player.ownedShips[index] : null;
  return { index, owned: owned || null, def: owned ? SHIP_BY_ID.get(owned.defId) || null : null };
}

function nameOf(id) {
  return FITTABLE_BY_ID.get(id)?.name || CARGO_BY_ID.get(id)?.name || String(id || 'unknown').replace(/^(cmdty|mod|wpn)_/, '').replace(/_/g, ' ');
}

export function pauseInventoryModel(state) {
  const player = state?.player || {};
  const ship = activeOwnedShip(state);
  const slots = ship.def ? buildSlotList(ship.def) : [];
  const fittings = Array.isArray(ship.owned?.fittings) ? ship.owned.fittings : [];
  const inventory = Array.isArray(player.moduleInventory) ? player.moduleInventory : [];
  const cargo = player.cargo || {};
  const cargoRows = Object.entries(cargo.items || {})
    .map(([id, rawQty]) => ({ id, qty: Math.max(0, Math.floor(Number(rawQty) || 0)) }))
    .filter((row) => row.qty > 0)
    .map((row) => ({ ...row, name: nameOf(row.id), locked: isUnsellableCargo(state, row.id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const slotRows = slots.map((slot, index) => {
    const defId = fittings[index] || null;
    return { ...slot, index, defId, name: defId ? nameOf(defId) : 'Open slot' };
  });
  const inventoryRows = inventory.map((item) => {
    const def = item && FITTABLE_BY_ID.get(item.defId);
    return {
      instanceId: item?.instanceId,
      defId: item?.defId || null,
      name: def ? def.name : nameOf(item?.defId),
      def: def || null,
      targets: def ? slotRows.filter((slot) => fits(slot, def)).map((slot) => slot.index) : [],
    };
  });
  return {
    shipIndex: ship.index,
    shipName: ship.def?.name || 'Active ship',
    cargoUsed: Math.max(0, Number(cargo.usedVolume) || 0),
    cargoCap: Math.max(0, Number(cargo.capVolume) || 0),
    cargoRows,
    slotRows,
    inventoryRows,
  };
}

export function executePauseCargoJettison(ctx, commodityId, qty) {
  if (!ctx?.state || ctx.state.mode !== 'paused' || isUnsellableCargo(ctx.state, commodityId)) return 0;
  const owner = ctx.registry?.get?.('cargo') || ctx.cargo || null;
  if (!owner || typeof owner.jettison !== 'function') return 0;
  return owner.jettison(commodityId, Math.max(1, Math.floor(Number(qty) || 1)), { purpose: 'pause_inventory' });
}

function cargoHtml(model) {
  if (!model.cargoRows.length) return '<div class="sf-pause-inventory__empty">Hold empty. Mine, salvage, or buy cargo to fill it.</div>';
  return model.cargoRows.map((row) => `<article class="sf-pause-inventory__row${row.locked ? ' is-locked' : ''}">` +
    `<div class="sf-pause-inventory__title"><b>${escapeHtml(row.name)}</b><span>${row.qty}u</span></div>` +
    `<div class="sf-pause-inventory__meta">${row.locked ? 'Protected personal or contract cargo. It stays aboard.' : 'Physical cargo. Jettisoned units remain recoverable in space.'}</div>` +
    `<div class="sf-pause-inventory__actions">` +
      `<button class="sf-btn" type="button" data-jet="${escapeHtml(row.id)}" data-qty="1" ${row.locked ? 'disabled' : ''}>Jettison 1</button>` +
      `<button class="sf-btn" type="button" data-jet-all="${escapeHtml(row.id)}" data-qty="${row.qty}" ${row.locked ? 'disabled' : ''}>Jettison all</button>` +
    `</div></article>`).join('');
}

function modulesHtml(model) {
  const slots = model.slotRows.map((slot) => `<article class="sf-pause-inventory__row sf-pause-inventory__slot">` +
    `<div class="sf-pause-inventory__title"><b>${escapeHtml(slot.type.toUpperCase())} ${escapeHtml(slot.size)} · ${escapeHtml(slot.name)}</b><span>#${slot.index + 1}</span></div>` +
    `<div class="sf-pause-inventory__meta">${slot.defId ? 'Fitted now. Unfit returns this exact system to inventory.' : 'Open hardpoint.'}</div>` +
    (slot.defId ? `<div class="sf-pause-inventory__actions"><button class="sf-btn" type="button" data-unfit="${slot.index}">Unfit</button></div>` : '') +
    `</article>`).join('');
  const inventory = model.inventoryRows.length ? model.inventoryRows.map((row) => `<article class="sf-pause-inventory__row">` +
    `<div class="sf-pause-inventory__title"><b>${escapeHtml(row.name)}</b><span>Inventory</span></div>` +
    `<div class="sf-pause-inventory__meta">${row.def ? `${escapeHtml(row.def.slotType)} ${escapeHtml(row.def.size)} · ${Number(row.def.mass) || 0}t` : 'Unknown fitting record'}</div>` +
    `<div class="sf-pause-inventory__actions">${row.targets.length ? row.targets.map((slotIndex) => {
      const slot = model.slotRows[slotIndex];
      return `<button class="sf-btn" type="button" data-fit="${escapeHtml(String(row.instanceId))}" data-slot="${slotIndex}">Fit ${escapeHtml(slot.type)} #${slotIndex + 1}</button>`;
    }).join('') : '<span class="sf-pause-inventory__meta">No compatible slot on this hull.</span>'}</div>` +
    `</article>`).join('') : '<div class="sf-pause-inventory__empty">Module inventory empty. Unfit a system or acquire one at a station.</div>';
  return slots + inventory;
}

function render(ctx) {
  if (!mounted || mounted.ctx !== ctx) return;
  const model = pauseInventoryModel(ctx.state);
  mounted.headline.textContent = `${model.shipName} · hold ${model.cargoUsed}/${model.cargoCap}u · ${model.inventoryRows.length} stored systems`;
  mounted.cargo.innerHTML = cargoHtml(model);
  mounted.modules.innerHTML = modulesHtml(model);
}

export const pauseInventoryScreen = {
  id: 'pauseInventory',
  data: { title: 'Cargo & Modules', ariaLabel: 'Pause-time cargo and module management' },

  mount(root, ctx) {
    injectStyle();
    root.innerHTML = `<div class="sf-pause-inventory">` +
      `<header class="sf-pause-inventory__head"><div><h1>Cargo & Modules</h1><p data-headline></p>` +
      `<p>Time is stopped. Rearrange owned systems without a station service fee, or free hold space by jettisoning ordinary cargo.</p></div>` +
      `<button class="sf-btn" type="button" data-close>Back</button></header>` +
      `<div class="sf-pause-inventory__grid">` +
        `<section class="sf-pause-inventory__pane"><h2>Cargo hold</h2><div class="sf-pause-inventory__scroll" data-cargo></div></section>` +
        `<section class="sf-pause-inventory__pane"><h2>Fitted + stored systems</h2><div class="sf-pause-inventory__scroll" data-modules></div></section>` +
      `</div></div>`;
    for (const off of mounted?.unsubs || []) { try { off(); } catch (_) {} }
    const unsubs = [];
    const listen = (event) => {
      const off = ctx.bus?.on?.(event, () => render(ctx));
      if (typeof off === 'function') unsubs.push(off);
    };
    for (const event of ['cargo:changed', 'module:equipped', 'module:unequipped', 'ship:statsChanged']) listen(event);
    mounted = {
      ctx,
      root,
      headline: root.querySelector('[data-headline]'),
      cargo: root.querySelector('[data-cargo]'),
      modules: root.querySelector('[data-modules]'),
      unsubs,
    };
    root.addEventListener('click', async (event) => {
      if (event.target.closest('[data-close]')) {
        managerFor(ctx)?.popScreen?.();
        return;
      }
      const unfit = event.target.closest('[data-unfit]');
      if (unfit) {
        ctx.bus?.emit?.('ui:unfitModule', { slotIndex: Number(unfit.getAttribute('data-unfit')), source: 'pause_inventory' });
        return;
      }
      const fit = event.target.closest('[data-fit]');
      if (fit) {
        ctx.bus?.emit?.('ui:fitModule', {
          instanceId: fit.getAttribute('data-fit'),
          slotIndex: Number(fit.getAttribute('data-slot')),
          source: 'pause_inventory',
        });
        return;
      }
      const all = event.target.closest('[data-jet-all]');
      const one = event.target.closest('[data-jet]');
      const button = all || one;
      if (!button) return;
      const commodityId = button.getAttribute(all ? 'data-jet-all' : 'data-jet');
      const qty = Math.max(1, Number(button.getAttribute('data-qty')) || 1);
      if (all) {
        const ok = await confirm({
          title: `Jettison all ${nameOf(commodityId)}?`,
          body: `${qty}u leaves the hold as recoverable physical cargo. This cannot be undone from the menu.`,
          confirmLabel: 'Jettison all',
          danger: true,
        });
        if (!ok) return;
      }
      const dumped = executePauseCargoJettison(ctx, commodityId, qty);
      if (dumped > 0) ctx.bus?.emit?.('toast', { text: `Jettisoned ${dumped}u ${nameOf(commodityId)}`, kind: 'warn', ttl: 2 });
      render(ctx);
    });
    render(ctx);
  },

  onShow(ctx) { render(ctx); },
  refresh(ctx) { render(ctx); },
  onHide() {},
};
