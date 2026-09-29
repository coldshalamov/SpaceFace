/** Remaining credits at or below this after a paid buy is treated as operationally risky. */
const OPS_RISK_BALANCE_CR = 500;

function fmtCr(n) {
  return (Math.round(n) || 0).toLocaleString('en-US');
}

/**
 * Danger confirm when the spend is at least half of available credits, or would leave a thin
 * station-services / insurance reserve. Free actions are never danger.
 */
export function isOutfittingSpendDanger(price, credits) {
  const cost = Math.max(0, Number(price) || 0);
  const avail = Math.max(0, Number(credits) || 0);
  if (cost <= 0) return false;
  if (avail > 0 && cost >= avail * 0.5) return true;
  const remaining = avail - cost;
  return remaining >= 0 && remaining <= OPS_RISK_BALANCE_CR;
}

/** The confirmation named this module, hull, slot, and price. A later read must still match. */
export function statedModulePurchaseStillMatches(stated, live) {
  if (!stated || !live) return false;
  if (stated.defId !== live.defId) return false;
  if (stated.shipIndex !== live.shipIndex) return false;
  const statedSlot = stated.fitSlotIndex == null ? null : stated.fitSlotIndex;
  const liveSlot = live.fitSlotIndex == null ? null : live.fitSlotIndex;
  if (statedSlot !== liveSlot) return false;
  if (stated.hullDefId != null && live.hullDefId != null && stated.hullDefId !== live.hullDefId) return false;
  const statedPrice = Math.round(Number(stated.price));
  const livePrice = Math.round(Number(live.price));
  return Number.isFinite(statedPrice) && Number.isFinite(livePrice) && statedPrice === livePrice;
}

/**
 * The dialog named this hull. A screen that has closed, or a different hull now on
 * the bench, cannot commit that confirmation.
 */
export function statedHullStillViewed(stated, live) {
  if (!stated || !live) return false;
  if (live.connected === false) return false;
  if (stated.shipIndex !== live.shipIndex) return false;
  if (stated.hullDefId != null && live.hullDefId != null && stated.hullDefId !== live.hullDefId) return false;
  return true;
}

/** Move the Hand onto a connected control whose box meets the list. The page body, a hidden node, and the hold gauge are not targets. */
export function focusNamedStationControl(node, list) {
  if (!node || typeof node.focus !== 'function') return false;
  if (node.isConnected === false) return false;
  if (node.hidden === true) return false;
  if (typeof document !== 'undefined' && node === document.body) return false;
  if (typeof node.getAttribute === 'function' && node.getAttribute('aria-hidden') === 'true') return false;
  const cls = node.classList;
  if (cls && typeof cls.contains === 'function' && (cls.contains('orr-mkt-holdarc') || cls.contains('sx-hold-gauge'))) return false;
  if (list && node !== list) {
    const inside = typeof list.contains === 'function' && list.contains(node);
    if (!inside && typeof node.getBoundingClientRect === 'function' && typeof list.getBoundingClientRect === 'function') {
      const box = node.getBoundingClientRect();
      const host = list.getBoundingClientRect();
      const laidOut = (Number(box.width) || 0) + (Number(box.height) || 0) > 0
        && (Number(host.width) || 0) + (Number(host.height) || 0) > 0;
      const meets = box.bottom > host.top && box.top < host.bottom && box.right > host.left && box.left < host.right;
      if (laidOut && !meets) return false;
    }
  }
  if (typeof node.scrollIntoView === 'function') {
    try { node.scrollIntoView({ block: 'nearest' }); } catch (_) { /* focus still lands */ }
  }
  try { node.focus(); } catch (_) { return false; }
  return true;
}

/** Build shared confirm() options for a paid module purchase. Zero-cost actions skip the dialog. */
export function describeOutfittingSpendConfirm(def, credits, opts = {}) {
  if (!def) return null;
  // opts.price lets a station listing quote its own shelf price instead of the catalog price.
  const price = Math.max(0, Number(opts.price != null ? opts.price : def.price) || 0);
  if (price <= 0) return null;
  const avail = Math.max(0, Number(credits) || 0);
  const remaining = Math.max(0, avail - price);
  const fitSlotIndex = opts.fitSlotIndex;
  const willFit = Number.isInteger(fitSlotIndex) && fitSlotIndex >= 0;
  const danger = isOutfittingSpendDanger(price, avail);
  const fitLine = willFit
    ? ' Will fit into an open hardpoint on confirmation.'
    : ' Goes to module inventory.';
  const riskLine = danger
    ? (avail > 0 && price >= avail * 0.5
      ? ' This spends at least half your credits.'
      : ' Remaining balance after purchase is operationally thin (' + fmtCr(remaining) + ' CR).')
    : '';
  return {
    title: 'Buy ' + def.name + '?',
    body: 'Cost: ' + fmtCr(price) + ' CR.' + fitLine + riskLine,
    confirmLabel: willFit ? 'Buy & Fit' : 'Buy',
    cancelLabel: 'Cancel',
    danger,
  };
}
