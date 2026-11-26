// src/data/cargoSlots.js — CARGO-BUILD-1 slot-bag law (ruling R22;
// design/overhaul/06_PROGRESSION_AND_ECONOMY.md §5.5).
//
// The hold is a bag of slots. Ordinary goods stack 20 to a slot, bulky goods
// (volPerU above 1.2) stack 10, and things that never stack (persistent story
// items, a live specimen, a named pod or vault) take a slot each. Hull cargo
// capacity derives a slot count, rounded to whole rows of four, min 8 max 96.
// Volume and mass remain computed readouts; slots are the only admission cap.
//
// Pure math only — no state, no imports — so the save migrations, the ships
// derivation and the cargo writer all read the same law without cycles.

export const CARGO_SLOTS = Object.freeze({
  /** Cargo cap in volume units that maps to one bag slot. */
  volumePerSlot: 20,
  /** Slots lay out in rows of four; the count rounds to a whole row. */
  rowSize: 4,
  minSlots: 8,
  maxSlots: 96,
  /** Units of an ordinary commodity one slot holds. */
  stackOrdinary: 20,
  /** Units of a bulky commodity one slot holds. */
  stackBulky: 10,
  /** volPerU above this is "Bulky" and stacks to stackBulky. */
  bulkyVolume: 1.2,
});

/** Derived slot count for a hull cargo capacity (whole rows of four, 8..96). */
export function slotCountForCargoCap(capVolume) {
  const cap = Number(capVolume);
  const rows = Number.isFinite(cap) && cap > 0
    ? Math.round(cap / CARGO_SLOTS.volumePerSlot / CARGO_SLOTS.rowSize)
    : 0;
  return Math.max(CARGO_SLOTS.minSlots, Math.min(CARGO_SLOTS.maxSlots, rows * CARGO_SLOTS.rowSize));
}

/** Units of this commodity one slot holds. The authored `stack` column wins;
 *  absent (runtime registry defs, persistent items) fall back to the volume law:
 *  never-stack defs carry stack:1; volPerU > 1.2 is bulky at 10; else 20. */
export function unitsPerSlotForDef(def) {
  const stack = def && def.stack;
  if (stack === 1 || stack === CARGO_SLOTS.stackBulky || stack === CARGO_SLOTS.stackOrdinary) return stack;
  if (def && def.persistent === true) return 1;
  const vol = Number(def && (def.vol ?? def.volPerU));
  if (Number.isFinite(vol) && vol > CARGO_SLOTS.bulkyVolume) return CARGO_SLOTS.stackBulky;
  return CARGO_SLOTS.stackOrdinary;
}

/**
 * Pack a legacy {commodityId: qty} map into a slot list, commodity by commodity
 * in sorted-id order. Stacks fill to their stack size; whatever remains lands
 * in further slots. Callers decide the bag bound — this never deletes units,
 * so an over-cap load returns more slots than slotCount and reads over capacity.
 */
export function packItemsIntoSlots(items, unitsPerSlotFor) {
  const slots = [];
  const lookup = typeof unitsPerSlotFor === 'function' ? unitsPerSlotFor : () => CARGO_SLOTS.stackOrdinary;
  for (const id of Object.keys(items || {}).sort()) {
    let left = Math.max(0, Math.floor(Number(items[id]) || 0));
    const ups = Math.max(1, Math.floor(Number(lookup(id)) || CARGO_SLOTS.stackOrdinary));
    while (left > 0) {
      const take = Math.min(left, ups);
      slots.push({ commodityId: id, qty: take });
      left -= take;
    }
  }
  return slots;
}

/** Unclaimed slots in the bag (never negative; an over-cap hold reports none). */
export function freeSlotCount(slots, slotCount) {
  const count = Math.max(0, Math.floor(Number(slotCount) || 0));
  const used = Math.min(Array.isArray(slots) ? slots.length : 0, count);
  return count - used;
}

/**
 * How many more units of `commodityId` fit: existing partial stacks inside the
 * bag fill first, then every empty slot takes a full stack. An over-capacity
 * hold (slots.length > slotCount) admits nothing until it drains.
 */
export function slotUnitsFit(slots, slotCount, commodityId, unitsPerSlot) {
  if (!Array.isArray(slots) || !(slotCount > 0)) return 0;
  if (slots.length > slotCount) return 0;
  const ups = Math.max(1, Math.floor(Number(unitsPerSlot) || CARGO_SLOTS.stackOrdinary));
  const inBag = Math.min(slots.length, slotCount);
  let fit = 0;
  for (let i = 0; i < inBag; i++) {
    const s = slots[i];
    if (s && s.commodityId === commodityId && s.qty < ups) fit += ups - s.qty;
  }
  return fit + (slotCount - inBag) * ups;
}

/**
 * Fill `qty` units into a live slot list: partial in-bag stacks first, then new
 * stacks. Mutates `slots`; returns the amount actually written. When `overflow`
 * is true (persistent grants can never be refused) new stacks may push past
 * slotCount — they land as the over-cap tail the drain law already reads.
 */
export function fillSlots(slots, slotCount, commodityId, qty, unitsPerSlot, { overflow = false } = {}) {
  let left = Math.max(0, Math.floor(Number(qty) || 0));
  if (!Array.isArray(slots) || left <= 0) return 0;
  const ups = Math.max(1, Math.floor(Number(unitsPerSlot) || CARGO_SLOTS.stackOrdinary));
  const inBag = Math.min(slots.length, Math.max(0, slotCount));
  for (let i = 0; i < inBag && left > 0; i++) {
    const s = slots[i];
    if (!s || s.commodityId !== commodityId || s.qty >= ups) continue;
    const take = Math.min(left, ups - s.qty);
    s.qty += take;
    left -= take;
  }
  while (left > 0) {
    if (!overflow && slots.length >= slotCount) break;
    const take = Math.min(left, ups);
    slots.push({ commodityId, qty: take });
    left -= take;
  }
  return Math.max(0, Math.floor(Number(qty) || 0)) - left;
}
