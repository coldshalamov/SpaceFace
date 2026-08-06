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

/** Build shared confirm() options for a paid module purchase. Zero-cost actions skip the dialog. */
export function describeOutfittingSpendConfirm(def, credits, opts = {}) {
  if (!def) return null;
  const price = Math.max(0, Number(def.price) || 0);
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
