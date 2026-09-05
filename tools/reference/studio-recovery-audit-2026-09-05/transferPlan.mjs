/** Immutable atomic trade reference. NOT another SpaceFace economy/cargo writer.
 * The production adapter must apply validated deltas through existing canonical owners within
 * one commit boundary, then publish effects. Reference storage is one volume unit per item.
 * Quotes are trusted local inputs here; there is no network authorization/signature layer.
 */
export class TradeError extends Error {
  constructor(code) { super(code); this.name = 'TradeError'; this.code = code; }
}
const deny = (code) => { throw new TradeError(code); };
function id(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/.test(value)
      || ['__proto__', 'prototype', 'constructor'].includes(value)) deny('invalid_identifier');
  return value;
}
function integer(value, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) deny('invalid_integer');
  return value;
}
function safe(value) {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) deny('integer_overflow');
  return Number(value);
}
function own(object, key) { return object && Object.hasOwn(object, key); }
function holdVolume(hold) {
  if (!hold || typeof hold.items !== 'object' || hold.items === null || Array.isArray(hold.items)) deny('invalid_hold');
  integer(hold.capacity);
  let used = 0n;
  for (const [good, quantity] of Object.entries(hold.items)) { id(good); used += BigInt(integer(quantity)); }
  if (used > BigInt(hold.capacity)) deny('overfull_initial_hold');
  return used;
}
/** @param {object} state
 * @param {{id:string,buyer:string,seller:string,good:string,quantity:number,unitPrice:number,
 * expectedVersion:number,expiresAtTick:number}} q
 * @param {number} tick @param {{receiptLimit?:number}} options */
export function planTrade(state, q, tick, options = {}) {
  for (const field of ['id', 'buyer', 'seller', 'good']) id(q[field]);
  integer(q.quantity, 1); integer(q.unitPrice); integer(q.expectedVersion); integer(q.expiresAtTick); integer(tick);
  const receiptLimit = integer(options.receiptLimit ?? 1024, 1);
  if (q.buyer === q.seller) deny('same_party');
  const fingerprint = JSON.stringify([q.buyer, q.seller, q.good, q.quantity,
    q.unitPrice, q.expectedVersion, q.expiresAtTick]);
  if (!state || !state.receipts || Array.isArray(state.receipts)) deny('invalid_receipts');
  // Exact retry wins over stale version / expiry. The receipt is part of durable state.
  if (own(state.receipts, q.id)) {
    const prior = state.receipts[q.id];
    if (prior.fingerprint !== fingerprint) deny('receipt_id_collision');
    return {state, receipt: prior.receipt, duplicate: true};
  }
  integer(state.version);
  if (q.expectedVersion !== state.version) deny('stale_quote');
  if (tick > q.expiresAtTick) deny('expired_quote');
  if (Object.keys(state.receipts).length >= receiptLimit) deny('receipt_capacity_requires_checkpoint');
  for (const party of [q.buyer, q.seller]) {
    if (!own(state.wallets, party) || !own(state.holds, party)) deny('unknown_party');
    integer(state.wallets[party]); holdVolume(state.holds[party]);
  }
  const buyer = state.holds[q.buyer], seller = state.holds[q.seller];
  const available = own(seller.items, q.good) ? integer(seller.items[q.good]) : 0;
  const alreadyHeld = own(buyer.items, q.good) ? integer(buyer.items[q.good]) : 0;
  if (available < q.quantity) deny('insufficient_stock');
  if (holdVolume(buyer) + BigInt(q.quantity) > BigInt(buyer.capacity)) deny('insufficient_capacity');
  const cost = safe(BigInt(q.quantity) * BigInt(q.unitPrice));
  if (state.wallets[q.buyer] < cost) deny('insufficient_funds');
  const nextSellerMoney = safe(BigInt(state.wallets[q.seller]) + BigInt(cost));
  const nextBuyerQuantity = safe(BigInt(alreadyHeld) + BigInt(q.quantity));
  const nextVersion = safe(BigInt(state.version) + 1n);
  // No mutation has happened before every validation succeeds.
  const next = structuredClone(state);
  next.wallets[q.buyer] -= cost;
  next.wallets[q.seller] = nextSellerMoney;
  next.holds[q.buyer].items[q.good] = nextBuyerQuantity;
  next.holds[q.seller].items[q.good] = available - q.quantity;
  if (next.holds[q.seller].items[q.good] === 0) delete next.holds[q.seller].items[q.good];
  next.version = nextVersion;
  const receipt = {id: q.id, version: nextVersion, tick, buyer: q.buyer, seller: q.seller,
    good: q.good, quantity: q.quantity, unitPrice: q.unitPrice, cost};
  next.receipts[q.id] = {fingerprint, receipt};
  return {state: next, receipt, duplicate: false};
}
