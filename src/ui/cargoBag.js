// The bag (CARGO-BAG-UI, ruling R22): the hold as a compact grid you open in flight.
//
// One key opens a small panel at the right edge — it never pauses a calm flight and never covers
// the ship or the aim point. Square slots four across; each filled slot shows the item's icon, its
// count in the corner and a thin bar when the stack is partial; bulky goods, sealed contract
// freight and illegal goods carry a small mark. Three tabs: Cargo, Gear, Salvage. The header reads
// slots used of total, the hold's value at the market in reach, and its mass.
//
// Hands: drag a stack off the panel and let go to drop it as a crate beside the ship (Shift-drag
// drops half); drop it on another slot to move it or merge it. Click or Enter picks a stack up
// (its card shows; Drop, Split and Sort sit under the grid); click another slot to put it there.
// Keyboard: arrows move, Enter picks/places, Delete drops, Escape closes. Controller: the pad
// moves focus across the same buttons (ui/input.js), A picks/places. Touch: tap to pick, then Drop.
//
// The panel only emits the owner's intents (cargo:jettison with a slot, cargo:splitStack,
// cargo:mergeStacks, cargo:moveStack, cargo:sortBag); the cargo system mutates the hold and the
// sealed-freight confirmation stays the one hud.js already answers. Nothing runs per frame: the
// grid re-renders on cargo:changed while open, writing only the slots that changed.

import { COMMODITIES } from '../data/commodities.js';
import { MODULES } from '../data/modules.js';
import { CARGO_SLOTS } from '../data/cargoSlots.js';
import { bagSections, reservedCargoQty, unitsPerSlotFor } from '../systems/cargo.js';
import { bestKnownSellFor, calculateHoldWorth, resolveCargoSellPrice } from './market/tradeLogic.js';
import { itemThumbHtml, injectItemThumbnailStyles } from './icons/itemThumbnails.js';
import { formatCount } from './numberFormat.js';
import { promptLabel } from './bindings.js';
import { planFuelCrack, FUEL_CELL_ID, FUEL_CELL_SIP } from '../systems/fuelCrack.js';

const STYLE_ID = 'sf-bag-css';
const COLS = CARGO_SLOTS.rowSize;
const DRAG_START_PX = 6;
// Swarm's one money word is Scrap; everywhere else credits read cr.
let moneyState = null;
function money() { const r = moneyState && moneyState.run; return r && r.kind === 'survival' && r.phase && r.phase !== 'inactive' ? 'Scrap' : 'cr'; }
const CMDTY = new Map(COMMODITIES.map((c) => [c.id, c]));
let MODULE_BY_ID = null;
function moduleDef(id) {
  if (!MODULE_BY_ID) MODULE_BY_ID = new Map((Array.isArray(MODULES) ? MODULES : Object.values(MODULES || {})).map((m) => [m && m.id, m]));
  return MODULE_BY_ID.get(id) || null;
}

export const BAG_TABS = Object.freeze([
  { id: 'cargo', label: 'Cargo' },
  { id: 'gear', label: 'Gear' },
  { id: 'salvage', label: 'Salvage' },
]);

function titleCase(s) { return String(s || '').replace(/(^|[\s_-])([a-z])/g, (_, a, b) => `${a === '_' || a === '-' ? ' ' : a}${b.toUpperCase()}`); }

/** Plain name for a bag item. */
export function bagItemName(item) {
  if (!item) return '';
  if (item.kind === 'module') {
    const def = moduleDef(item.defId);
    return (def && (def.name || def.displayName)) || titleCase(String(item.defId || 'Gear').replace(/^(mod|wpn|module)_/, ''));
  }
  const def = CMDTY.get(item.commodityId);
  return (def && def.name) || titleCase(String(item.commodityId || 'Cargo').replace(/^cmdty_/, ''));
}

/**
 * The bag's read model for one tab — pure. Slots carry what a slot draws (count, fill, marks).
 * @returns {{ tab, slots: Array<object|null>, slotCount: number, used: number, overCapacity: boolean, droppable: boolean }}
 */
export function bagModel(state, tab = 'cargo') {
  const sections = bagSections(state);
  if (tab === 'gear') {
    const gear = sections.gear.slots || [];
    const count = Math.max(COLS * 2, Math.ceil(gear.length / COLS) * COLS);
    const slots = [];
    for (let i = 0; i < count; i++) {
      const g = gear[i];
      slots.push(g ? { index: i, kind: 'module', defId: g.defId, instanceId: g.instanceId, qty: 1, cap: 1, name: bagItemName(g) } : null);
    }
    return { tab, slots, slotCount: count, used: gear.length, overCapacity: false, droppable: false };
  }
  const sec = tab === 'salvage' ? sections.salvage : sections.cargo;
  if (!sec) return { tab, slots: Array(COLS * 2).fill(null), slotCount: 0, used: 0, overCapacity: false, droppable: false, empty: true };
  const list = Array.isArray(sec.slots) ? sec.slots : [];
  const count = Math.max(sec.slotCount || 0, list.length);
  const slots = [];
  for (let i = 0; i < count; i++) {
    const s = list[i];
    if (!s || !(s.qty > 0)) { slots.push(null); continue; }
    const def = CMDTY.get(s.commodityId);
    const cap = Math.max(1, unitsPerSlotFor(state, s.commodityId) || CARGO_SLOTS.stackOrdinary);
    slots.push({
      index: i,
      kind: 'commodity',
      commodityId: s.commodityId,
      qty: s.qty,
      cap,
      name: bagItemName(s),
      bulky: cap === CARGO_SLOTS.stackBulky,
      sealed: tab === 'cargo' && reservedCargoQty(state, s.commodityId) > 0,
      illegal: !!(def && def.legality && def.legality !== 'legal'),
      over: i >= (sec.slotCount || 0),
    });
  }
  return {
    tab, slots, slotCount: sec.slotCount || 0,
    used: Math.min(list.length, sec.slotCount || 0),
    overCapacity: list.length > (sec.slotCount || 0),
    droppable: tab === 'cargo',
  };
}

const CSS = `
.sf-bag { position:absolute; z-index:40; top:calc(92px + var(--sf-safe-inset-top, 0px)); right:calc(20px + var(--sf-safe-inset-right, 0px));
  width:262px; min-height:220px;
  /* Ends above the minimap at every size (the minimap grows with the viewport). */
  max-height:calc(100% - 92px - 262px - max(0px, (100vh - 720px) * .1) - var(--sf-safe-inset-top, 0px)); display:none; flex-direction:column; gap:8px; padding:10px 12px 12px;
  color:#eef4f4; font:500 13px/1.25 var(--visor-font, var(--dp-face-read, sans-serif));
  background:linear-gradient(160deg, rgb(13 27 36 / .95), rgb(8 18 25 / .92)); border:1px solid rgb(188 222 234 / .32);
  border-top:2px solid #e8d3a4; box-shadow:0 14px 34px rgb(0 0 0 / .45); pointer-events:auto; user-select:none; }
.sf-bag, .sf-bag button { text-transform:none; letter-spacing:.01em; }
.sf-bag__gridwrap { flex:1 1 auto; min-height:118px; }
.sf-bag.is-open { display:flex; }
.sf-bag__head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.sf-bag__title { font-weight:700; font-size:13px; letter-spacing:.1em; text-transform:uppercase; color:#fff1cf; }
.sf-bag__close { min-height:28px; padding:2px 9px; border:1px solid rgb(188 222 234 / .4); background:rgb(16 34 46 / .7);
  color:#dfeaee; font:600 12px/1 inherit; cursor:pointer; }
.sf-bag__close kbd { margin-left:6px; font:700 12px/1 inherit; color:#15202b; background:#faf0d0; padding:1px 4px; border-radius:2px; }
.sf-bag__tabs { display:flex; gap:4px; }
.sf-bag__tab { flex:1 1 0; min-height:30px; border:1px solid rgb(188 222 234 / .26); background:rgb(12 26 36 / .6);
  color:#b9cbd2; font:600 13px/1 inherit; cursor:pointer; }
.sf-bag__tab[aria-selected="true"] { color:#15202b; background:#e8d3a4; border-color:#e8d3a4; }
.sf-bag__meta { font-size:12px; color:#b9cbd2; display:flex; flex-wrap:wrap; gap:2px 10px; }
.sf-bag__meta b { color:#fff1cf; font-weight:700; }
.sf-bag__meta .is-over { color:#ff8a70; }
.sf-bag__gridwrap { overflow-y:auto; overflow-x:hidden; min-height:0; flex:1 1 auto; padding:2px; scrollbar-width:thin; }
.sf-bag__grid { display:grid; grid-template-columns:repeat(${COLS}, 1fr); gap:6px; }
.sf-bag__slot { position:relative; aspect-ratio:1; min-width:44px; max-height:56px; padding:0; display:grid; place-items:center;
  border:1px solid rgb(188 222 234 / .22); background:rgb(6 14 20 / .66); color:inherit; cursor:pointer;
  transition:transform .12s ease, box-shadow .12s ease, border-color .12s ease; }
.sf-bag__slot.is-empty { background:repeating-linear-gradient(135deg, rgb(188 222 234 / .05) 0 4px, transparent 4px 8px), rgb(6 14 20 / .5); cursor:default; }
.sf-bag__slot.is-over { border-color:rgb(255 138 112 / .7); }
.sf-bag__slot:focus-visible { outline:2px solid #ecf07e; outline-offset:1px; }
.sf-bag__slot:not(.is-empty):hover { border-color:rgb(232 211 164 / .8); }
.sf-bag__slot.is-picked { transform:scale(1.06); border-color:#ecf07e; box-shadow:0 6px 14px rgb(0 0 0 / .5), 0 0 0 1px #ecf07e; z-index:1; }
.sf-bag__slot.is-target { border-color:#ecf07e; background:rgb(236 240 126 / .12); }
.sf-bag__slot .sf-thumb { pointer-events:none; }
.sf-bag__count { position:absolute; right:3px; bottom:2px; font:700 12px/1 inherit; color:#fff; text-shadow:0 1px 2px #000, 0 0 3px #000; font-variant-numeric:tabular-nums; }
.sf-bag__count.is-tick { animation:sf-bag-tick .3s ease-out 1; }
@keyframes sf-bag-tick { 0% { transform:scale(1.35); color:#ecf07e; } 100% { transform:scale(1); } }
.sf-bag__fill { position:absolute; left:3px; right:3px; bottom:0; height:2px; background:rgb(188 222 234 / .18); }
.sf-bag__fill i { display:block; height:100%; background:#e8d3a4; transform-origin:left center; }
.sf-bag__mark { position:absolute; top:2px; left:3px; font:700 12px/1 inherit; padding:0 2px; border-radius:2px; }
.sf-bag__mark--bulky { color:#cfe3ea; background:rgb(16 34 46 / .85); }
.sf-bag__mark--sealed { color:#15202b; background:#e8d3a4; }
.sf-bag__mark--illegal { color:#15202b; background:#ff8a70; left:auto; right:3px; }
.sf-bag__card { position:absolute; right:calc(100% + 8px); top:118px; width:228px; box-shadow:0 10px 24px rgb(0 0 0 / .45); background:rgb(8 18 25 / .94) !important; min-height:0; padding:7px 9px; border:1px solid rgb(188 222 234 / .2); background:rgb(6 14 20 / .6); font-size:12px; color:#c9d8de; }
.sf-bag__card[hidden] { display:none; }
.sf-bag__card b { display:block; color:#fff1cf; font-size:13px; margin-bottom:2px; }
.sf-bag__actions { display:flex; gap:6px; }
.sf-bag__actions[hidden] { display:none; }
.sf-bag__act { flex:1 1 0; min-height:32px; border:1px solid rgb(188 222 234 / .4); background:rgb(16 34 46 / .75);
  color:#e9f1f3; font:600 13px/1 inherit; cursor:pointer; }
.sf-bag__act:disabled { opacity:.4; cursor:default; }
.sf-bag__act[hidden] { display:none; }
.sf-bag__act--drop { border-color:rgb(255 138 112 / .6); color:#ffd2c6; }
.sf-bag__act:not(:disabled):is(:hover, :focus-visible) { border-color:#ecf07e; color:#fff; }
.sf-bag__hint { font-size:12px; color:#8ea5ae; }
.sf-bag__hint[hidden] { display:none; }
.sf-bag-ghost { position:fixed; left:0; top:0; z-index:60; pointer-events:none; display:flex; align-items:center; gap:8px;
  padding:4px 10px 4px 4px; background:rgb(8 18 25 / .92); border:1px solid #ecf07e; color:#fff1cf;
  font:600 13px/1 var(--visor-font, sans-serif); box-shadow:0 10px 24px rgb(0 0 0 / .55); will-change:transform; }
.sf-bag-ghost[hidden] { display:none; }
.sf-bag-ghost__word { white-space:nowrap; }
.sf-bag-ghost.is-out { border-color:#ff8a70; }
.sf-bag-ghost.is-dropping { transition:transform .18s ease-in, opacity .18s ease-in; opacity:0; }
html[data-sf-mobile-flight="1"] .sf-bag__card { position:static; width:auto; }
html[data-sf-mobile-flight="1"] .sf-bag { top:calc(60px + var(--sf-safe-inset-top, 0px)); right:10px; width:min(300px, 86vw); max-height:calc(100% - 190px); }
@media (prefers-reduced-motion: reduce) { .sf-bag__slot, .sf-bag-ghost.is-dropping { transition:none; } .sf-bag__count.is-tick { animation:none; } }
`;

function injectStyle(doc) {
  if (!doc || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

function el(doc, tag, cls, text) {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/**
 * Mount the bag into the flight HUD.
 * @param {{ root: HTMLElement, state: object, bus: object, ctx?: object }} opts
 */
export function createCargoBag({ root, state, bus, ctx = null }) {
  moneyState = state;
  const doc = root.ownerDocument || document;
  injectStyle(doc);
  try { injectItemThumbnailStyles(doc); } catch { /* thumbnails fall back to text */ }

  const panel = el(doc, 'div', 'sf-bag');
  panel.id = 'sf-bag';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Bag');
  const head = el(doc, 'div', 'sf-bag__head');
  const title = el(doc, 'span', 'sf-bag__title', 'Bag');
  const closeBtn = el(doc, 'button', 'sf-bag__close', 'Close');
  closeBtn.type = 'button';
  const closeKey = el(doc, 'kbd', null, 'Esc');
  closeBtn.appendChild(closeKey);
  head.append(title, closeBtn);
  const tabs = el(doc, 'div', 'sf-bag__tabs');
  tabs.setAttribute('role', 'tablist');
  const tabBtns = new Map();
  for (const t of BAG_TABS) {
    const b = el(doc, 'button', 'sf-bag__tab', t.label);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.dataset.tab = t.id;
    b.addEventListener('click', () => setTab(t.id));
    tabs.appendChild(b);
    tabBtns.set(t.id, b);
  }
  const meta = el(doc, 'div', 'sf-bag__meta');
  const gridWrap = el(doc, 'div', 'sf-bag__gridwrap');
  const grid = el(doc, 'div', 'sf-bag__grid');
  grid.setAttribute('role', 'grid');
  gridWrap.appendChild(grid);
  const card = el(doc, 'div', 'sf-bag__card');
  card.setAttribute('aria-live', 'polite');
  const actions = el(doc, 'div', 'sf-bag__actions');
  const mkAct = (label, cls, fn) => { const b = el(doc, 'button', `sf-bag__act ${cls || ''}`.trim(), label); b.type = 'button'; b.addEventListener('click', fn); actions.appendChild(b); return b; };
  const dropBtn = mkAct('Drop', 'sf-bag__act--drop', () => dropPicked(false));
  const splitBtn = mkAct('Split', '', () => splitPicked());
  const sortBtn = mkAct('Sort', '', () => { bus.emit('cargo:sortBag', {}); clearPick(); });
  // A fuel cell is used from the bag: crack one into the tank.
  const crackBtn = mkAct('Crack cell', 'sf-bag__act--crack', () => {
    const plan = planFuelCrack(state);
    if (!plan || plan.mode === 'refuse') return;
    bus.emit('audio:cue', { id: 'ui_click' });
    bus.emit('fuel:crackCell', {});
    clearPick();
  });
  crackBtn.hidden = true;
  const hint = el(doc, 'div', 'sf-bag__hint', 'Drag a stack out of the bag to drop it in space.');
  panel.append(head, tabs, meta, gridWrap, card, actions, hint);
  root.appendChild(panel);

  const ghost = el(doc, 'div', 'sf-bag-ghost');
  ghost.hidden = true;
  const ghostThumb = el(doc, 'span');
  const ghostWord = el(doc, 'span', 'sf-bag-ghost__word');
  ghost.append(ghostThumb, ghostWord);
  (doc.body || root).appendChild(ghost);

  let open = false;
  let tab = 'cargo';
  let model = null;
  let picked = -1;
  const slotEls = [];
  const slotSig = [];

  function slotEl(i) {
    let b = slotEls[i];
    if (b) return b;
    b = el(doc, 'button', 'sf-bag__slot is-empty');
    b.type = 'button';
    b.dataset.slot = String(i);
    b.setAttribute('role', 'gridcell');
    // Blur after a pointer click (detail > 0) so Space/Enter in flight never re-fires a slot;
    // keyboard and pad activation (detail 0) keep focus so they keep their place.
    b.addEventListener('click', (ev) => { onSlotActivate(i); if (ev && ev.detail > 0) { try { b.blur(); } catch { /* fine */ } } });
    b.addEventListener('pointerdown', (ev) => onPointerDown(ev, i));
    b.addEventListener('focus', () => showCard(i));
    b.addEventListener('mouseenter', () => showCard(i));
    b.addEventListener('keydown', (ev) => onSlotKey(ev, i));
    slotEls[i] = b;
    return b;
  }

  function render() {
    if (!open) return;
    model = bagModel(state, tab);
    for (const [id, b] of tabBtns) b.setAttribute('aria-selected', String(id === tab));
    // Header: slots used of total, value at the market in reach, mass.
    if (tab === 'cargo') {
      const worth = (() => { try { return calculateHoldWorth(state, ctx || { state }); } catch { return null; } })();
      const mass = Number(state.player && state.player.cargo && state.player.cargo.usedMass) || 0;
      meta.innerHTML = '';
      const used = el(doc, 'span'); used.append(el(doc, 'span', null, 'Slots '), el(doc, 'b', model.overCapacity ? 'is-over' : '', `${model.slots.filter(Boolean).length} / ${model.slotCount}`));
      const val = el(doc, 'span'); val.append(el(doc, 'span', null, 'Worth '), el(doc, 'b', '', worth ? `≈ ${formatCount(worth.totalWorth, state)} ${money()}` : '—'));
      const m = el(doc, 'span'); m.append(el(doc, 'span', null, 'Mass '), el(doc, 'b', '', `${mass >= 10 ? Math.round(mass) : mass.toFixed(1)} t`));
      meta.append(used, val, m);
      if (model.overCapacity) meta.appendChild(el(doc, 'span', 'is-over', 'Over capacity: drop a stack'));
    } else if (tab === 'gear') {
      meta.textContent = model.used ? `${model.used} unfitted part${model.used === 1 ? '' : 's'} · fit them at a station` : 'No unfitted parts aboard';
    } else {
      meta.textContent = model.empty ? 'No salvage bay on this hull' : `Salvage bay · ${model.slots.filter(Boolean).length} / ${model.slotCount} slots · cash in at any station`;
    }
    const n = model.slots.length;
    for (let i = 0; i < n; i++) {
      const b = slotEl(i);
      if (b.parentNode !== grid) grid.appendChild(b);
      paintSlot(b, i, model.slots[i]);
    }
    for (let i = n; i < slotEls.length; i++) if (slotEls[i] && slotEls[i].parentNode) { slotEls[i].remove(); slotSig[i] = ''; }
    if (picked >= n || (picked >= 0 && !model.slots[picked])) picked = -1;
    syncPicked();
  }

  function paintSlot(b, i, s) {
    const sig = s ? `${s.kind}|${s.commodityId || s.defId}|${s.qty}|${s.cap}|${s.sealed}|${s.illegal}|${s.over}` : 'empty';
    if (slotSig[i] === sig) return;
    const prevQty = slotSig[i] && slotSig[i] !== 'empty' ? Number(slotSig[i].split('|')[2]) : null;
    slotSig[i] = sig;
    b.textContent = '';
    b.classList.toggle('is-empty', !s);
    b.classList.toggle('is-over', !!(s && s.over));
    if (!s) {
      b.dataset.id = '';
      b.setAttribute('aria-label', `Empty slot ${i + 1}`);
      b.tabIndex = -1;
      return;
    }
    b.tabIndex = 0;
    b.dataset.id = s.commodityId || s.defId || '';
    const def = s.kind === 'commodity' ? CMDTY.get(s.commodityId) : null;
    const thumbInput = s.kind === 'module'
      ? { id: s.defId, kind: 'module' }
      : { id: s.commodityId, kind: 'commodity', category: def && def.category, legality: def && def.legality };
    try { b.insertAdjacentHTML('beforeend', itemThumbHtml(thumbInput, { size: 'md', showCrest: false, showPips: false })); }
    catch { b.appendChild(el(doc, 'span', null, s.name.slice(0, 3))); }
    if (s.cap > 1) {
      const count = el(doc, 'span', 'sf-bag__count', String(s.qty));
      if (prevQty != null && prevQty !== s.qty) count.classList.add('is-tick');
      b.appendChild(count);
      if (s.qty < s.cap) {
        const fill = el(doc, 'span', 'sf-bag__fill');
        const bar = el(doc, 'i');
        bar.style.transform = `scaleX(${Math.max(0.04, s.qty / s.cap).toFixed(3)})`;
        fill.appendChild(bar);
        b.appendChild(fill);
      }
    }
    if (s.sealed) b.appendChild(el(doc, 'span', 'sf-bag__mark sf-bag__mark--sealed', 'Sealed'));
    else if (s.bulky) b.appendChild(el(doc, 'span', 'sf-bag__mark sf-bag__mark--bulky', 'Bulky'));
    if (s.illegal) b.appendChild(el(doc, 'span', 'sf-bag__mark sf-bag__mark--illegal', '!'));
    const marks = [s.sealed && 'sealed for a contract', s.bulky && 'bulky', s.illegal && 'illegal here', s.over && 'over capacity'].filter(Boolean).join(', ');
    b.setAttribute('aria-label', `${s.name}${s.cap > 1 ? `, ${s.qty} of ${s.cap}` : ''}${marks ? `, ${marks}` : ''}`);
  }

  function showCard(i) {
    const s = model && model.slots[i];
    if (!s) { if (picked < 0) { card.hidden = true; hint.hidden = false; } return; }
    card.hidden = false;
    hint.hidden = true;
    card.textContent = '';
    card.appendChild(el(doc, 'b', null, s.kind === 'module' ? s.name : `${s.name} · ${s.qty}`));
    if (s.kind === 'module') {
      card.appendChild(el(doc, 'div', null, 'Unfitted part. Fit it at a station Shipworks.'));
      return;
    }
    let each = 0;
    try { const q = resolveCargoSellPrice(state, ctx || { state }, s.commodityId); each = q && !q.unsellable ? q.unitSell : 0; } catch { each = 0; }
    card.appendChild(el(doc, 'div', null, each > 0
      ? `${formatCount(each, state)} ${money()} each · ${formatCount(each * s.qty, state)} ${money()} for this stack`
      : 'No buyer in reach for this'));
    const lots = state.player && state.player.tradeLots && state.player.tradeLots[s.commodityId];
    let origin = 'Mined or found';
    if (Array.isArray(lots) && lots.length) {
      let c = 0; let q = 0;
      for (const lot of lots) { c += (lot.qty || 0) * (lot.unit || 0); q += lot.qty || 0; }
      if (q > 0) origin = `Bought for about ${formatCount(Math.round(c / q), state)} ${money()} each`;
    }
    card.appendChild(el(doc, 'div', null, origin));
    let best = null;
    try { best = bestKnownSellFor(state, s.commodityId); } catch { best = null; }
    const where = best && best.stationName && !/_/.test(best.stationName) ? best.stationName : 'a station you visited';
    if (best && best.sell > 0) card.appendChild(el(doc, 'div', null, `Best price you know: ${where} · ${formatCount(best.sell, state)} ${money()}`));
    if (s.sealed) card.appendChild(el(doc, 'div', null, 'Sealed for a contract: dropping it fails the job.'));
    else if (s.illegal) card.appendChild(el(doc, 'div', null, 'Illegal in lawful space.'));
  }

  function syncPicked() {
    for (let i = 0; i < slotEls.length; i++) {
      const b = slotEls[i];
      if (!b) continue;
      b.classList.toggle('is-picked', i === picked);
      // Lit as a target: a stack of the same goods it can merge into (any other slot is a plain move).
      const held = picked >= 0 && model ? model.slots[picked] : null;
      const there = model ? model.slots[i] : null;
      b.classList.toggle('is-target', !!(held && there && i !== picked && there.commodityId === held.commodityId && there.qty < there.cap));
    }
    const s = picked >= 0 && model ? model.slots[picked] : null;
    const droppable = !!(s && model.droppable);
    dropBtn.disabled = !droppable;
    splitBtn.disabled = !(droppable && s.qty > 1 && model.slots.filter(Boolean).length < model.slotCount);
    sortBtn.disabled = !(model && model.droppable && model.slots.some(Boolean));
    // Gear and salvage stay aboard until a station: their tabs carry no drop/split/sort row.
    actions.hidden = !(model && model.droppable);
    const isCell = !!(s && s.commodityId === FUEL_CELL_ID);
    crackBtn.hidden = !isCell;
    if (isCell) {
      const plan = planFuelCrack(state);
      crackBtn.disabled = !plan || plan.mode === 'refuse';
      crackBtn.title = crackBtn.disabled ? ((plan && plan.reason) || 'Cannot crack a fuel cell') : `Crack one cell into the tank (${FUEL_CELL_SIP})`;
    }
    if (s) showCard(picked);
    hint.hidden = !card.hidden && !!s;
    hint.textContent = s
      ? (droppable ? 'Pick another slot to move it there, or Drop to set it outside.' : 'Parts and salvage stay aboard until a station.')
      : (model && model.droppable ? 'Drag a stack out of the bag to drop it in space. Shift-drag drops half.' : 'Open Cargo to move or drop stacks.');
  }

  function clearPick() { picked = -1; syncPicked(); }

  function placePicked(to) {
    const from = picked;
    const a = model.slots[from];
    const b = model.slots[to];
    picked = -1;
    if (!a || from === to || !model.droppable) { syncPicked(); return; }
    if (b && b.commodityId === a.commodityId) bus.emit('cargo:mergeStacks', { from, to });
    else bus.emit('cargo:moveStack', { from, to: b ? to : Math.min(to, model.slots.filter(Boolean).length - 1) });
    syncPicked();
  }

  function onSlotActivate(i) {
    if (suppressClick) { suppressClick = false; return; }
    const s = model && model.slots[i];
    if (picked >= 0) { if (i === picked) clearPick(); else placePicked(i); return; }
    if (!s) return;
    picked = i;
    syncPicked();
  }

  function dropStack(i, half) {
    const s = model && model.slots[i];
    if (!s || !model.droppable) return false;
    const qty = half ? Math.max(1, Math.floor(s.qty / 2)) : s.qty;
    // The one jettison path (hud.js): the owner refuses a dump into sealed freight and hands back
    // its numbers; hud.js asks once ("Drop sealed freight? The contract will fail.").
    bus.emit('cargo:jettison', { commodityId: s.commodityId, qty, slotIndex: i });
    return true;
  }

  function dropPicked(half) {
    if (picked < 0) return;
    const i = picked;
    picked = -1;
    dropStack(i, half);
    syncPicked();
  }

  function splitPicked() {
    if (picked < 0) return;
    bus.emit('cargo:splitStack', { slotIndex: picked });
    clearPick();
  }

  // --- keyboard -------------------------------------------------------------------------------
  function onSlotKey(ev, i) {
    const n = model ? model.slots.length : 0;
    let to = -1;
    if (ev.key === 'ArrowRight') to = Math.min(n - 1, i + 1);
    else if (ev.key === 'ArrowLeft') to = Math.max(0, i - 1);
    else if (ev.key === 'ArrowDown') to = Math.min(n - 1, i + COLS);
    else if (ev.key === 'ArrowUp') to = Math.max(0, i - COLS);
    else if (ev.key === 'Delete' || ev.key === 'Backspace') {
      ev.preventDefault(); ev.stopPropagation();
      if (picked >= 0) dropPicked(false); else dropStack(i, ev.shiftKey);
      return;
    } else return;
    ev.preventDefault();
    ev.stopPropagation();
    const target = slotEls[to];
    if (target) { if (target.tabIndex < 0) target.tabIndex = -1; target.focus({ preventScroll: false }); showCard(to); }
  }

  // --- drag out to drop -------------------------------------------------------------------------
  let drag = null;
  let suppressClick = false;
  function onPointerDown(ev, i) {
    if (ev.button !== 0 || !model || !model.slots[i] || !model.droppable) return;
    drag = { i, x0: ev.clientX, y0: ev.clientY, half: !!ev.shiftKey, live: false, pointerId: ev.pointerId };
    doc.addEventListener('pointermove', onPointerMove, true);
    doc.addEventListener('pointerup', onPointerUp, true);
    doc.addEventListener('pointercancel', onPointerCancel, true);
  }
  function insidePanel(x, y) {
    const r = panelRect || (panelRect = panel.getBoundingClientRect());
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }
  let panelRect = null;
  function slotAtPoint(x, y) {
    const hit = doc.elementFromPoint ? doc.elementFromPoint(x, y) : null;
    const slot = hit && hit.closest ? hit.closest('.sf-bag__slot') : null;
    return slot && panel.contains(slot) ? Number(slot.dataset.slot) : -1;
  }
  function onPointerMove(ev) {
    if (!drag) return;
    const dx = ev.clientX - drag.x0;
    const dy = ev.clientY - drag.y0;
    if (!drag.live) {
      if (Math.hypot(dx, dy) < DRAG_START_PX) return;
      drag.live = true;
      panelRect = panel.getBoundingClientRect(); // once per gesture: the panel does not move mid-drag
      picked = drag.i;
      syncPicked();
      const s = model.slots[drag.i];
      ghostThumb.innerHTML = itemThumbHtml({ id: s.commodityId, kind: 'commodity' }, { size: 'sm', showCrest: false, showPips: false });
      ghost.hidden = false;
      ghost.classList.remove('is-dropping');
    }
    const out = !insidePanel(ev.clientX, ev.clientY);
    const s = model.slots[drag.i];
    const qty = drag.half ? Math.max(1, Math.floor(s.qty / 2)) : s.qty;
    const word = out ? `Drop in space · ${qty} ${s.name}` : `${s.name} · ${s.qty}`;
    if (ghostWord.textContent !== word) ghostWord.textContent = word;
    ghost.classList.toggle('is-out', out);
    ghost.style.transform = `translate3d(${Math.round(ev.clientX + 14)}px,${Math.round(ev.clientY + 10)}px,0)`;
    ev.preventDefault();
  }
  function endDrag() {
    doc.removeEventListener('pointermove', onPointerMove, true);
    doc.removeEventListener('pointerup', onPointerUp, true);
    doc.removeEventListener('pointercancel', onPointerCancel, true);
  }
  function onPointerUp(ev) {
    const d = drag;
    drag = null;
    endDrag();
    if (!d || !d.live) return;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    const out = !insidePanel(ev.clientX, ev.clientY);
    if (out) {
      picked = -1;
      dropStack(d.i, d.half);
      // The crate leaves with a short slide away from the panel.
      ghost.classList.add('is-dropping');
      ghost.style.transform = `translate3d(${Math.round(ev.clientX - 40)}px,${Math.round(ev.clientY + 26)}px,0)`;
      setTimeout(() => { ghost.hidden = true; ghost.classList.remove('is-dropping'); }, 200);
    } else {
      ghost.hidden = true;
      const to = slotAtPoint(ev.clientX, ev.clientY);
      if (to >= 0 && to !== d.i) { picked = d.i; placePicked(to); return; }
      picked = -1;
    }
    syncPicked();
  }
  function onPointerCancel() { drag = null; endDrag(); ghost.hidden = true; clearPick(); }

  // --- open / close ---------------------------------------------------------------------------
  let opener = null;
  function setTab(id) {
    if (!BAG_TABS.some((t) => t.id === id)) return;
    tab = id;
    picked = -1;
    for (let i = 0; i < slotSig.length; i++) slotSig[i] = '';
    render();
  }
  function setOpen(next) {
    if (next === open) return;
    open = next;
    if (state.ui) state.ui.cargoPanelOpen = open;
    panel.classList.toggle('is-open', open);
    panelRect = null;
    if (open) {
      opener = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : null;
      closeKey.textContent = 'Esc';
      title.textContent = `Bag · ${promptLabel('cargo').replace(/^\[\s*|\s*\]$/g, '')}`;
      render();
      // No focus is taken on open: flight keys (Space, Enter) stay with the ship. Tab, arrows
      // after a click, or the pad's d-pad move into the grid.
      // Opening shows the grid; a stack's card appears when the pilot points at or picks one.
      card.hidden = true; hint.hidden = false;
    } else {
      picked = -1;
      ghost.hidden = true;
      if (opener && opener.isConnected) { try { opener.focus({ preventScroll: true }); } catch { /* fine */ } }
      opener = null;
    }
    bus.emit('audio:cue', { id: open ? 'ui_open' : 'ui_back' });
  }
  closeBtn.addEventListener('click', () => setOpen(false));
  panel.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); setOpen(false); }
  });

  const offs = [];
  const listen = (name, fn) => { const off = bus && bus.on ? bus.on(name, fn) : null; if (typeof off === 'function') offs.push(off); };
  listen('cargo:changed', () => render());
  listen('cargo:massSettled', () => render());
  if (typeof window !== 'undefined') window.addEventListener('resize', () => { panelRect = null; });

  return {
    el: panel,
    isOpen: () => open,
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    setTab,
    refresh: render,
    /** Bench/test hook: pick a slot as if clicked. */
    pick: (i) => { picked = i; syncPicked(); },
    destroy() { for (const off of offs) off(); endDrag(); panel.remove(); ghost.remove(); },
  };
}
