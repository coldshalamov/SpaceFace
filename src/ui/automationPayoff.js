// Player-facing payoff for automation:offlineSummary / lastOfflineReceipt and asset loss.
// Presentation only: reads the stored receipt, never recomputes income or upkeep.

export function offlineReceiptFingerprint(receipt) {
  if (!receipt || typeof receipt !== 'object') return null;
  return [
    receipt.windowStartMs || 0,
    receipt.nowMs || 0,
    receipt.credited || 0,
    receipt.upkeepCharged || 0,
    receipt.upkeepUnpaid || 0,
    receipt.lost || 0,
    receipt.distressed ? 1 : 0,
  ].join(':');
}

export function isOfflineReceiptShowable(receipt) {
  if (!receipt || typeof receipt !== 'object') return false;
  if (receipt.skipped) return false;
  if (receipt.skipReason) return false;
  const credited = Math.round(Number(receipt.credited) || 0);
  const upkeepCharged = Math.round(Number(receipt.upkeepCharged) || 0);
  const upkeepUnpaid = Math.round(Number(receipt.upkeepUnpaid) || 0);
  const lost = Math.round(Number(receipt.lost) || 0);
  if (credited === 0 && upkeepCharged === 0 && upkeepUnpaid === 0 && lost === 0 && !receipt.distressed) {
    return false;
  }
  return true;
}

/** How long the pilot was away, in the receipt's own words (words-offline-receipt):
 * a sub-minute absence says so instead of printing "(0.0h)". */
export function awayDurationLabel(elapsedSec) {
  const s = Math.max(0, Math.round(Number(elapsedSec) || 0));
  if (s < 60) return 'under a minute';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
  const hours = s / 3600;
  return hours >= 10 ? `${Math.round(hours)}h` : `${hours.toFixed(1)}h`;
}

export function formatOfflineReceiptLine(receipt) {
  if (!receipt) return '';
  const elapsedSec = Number(receipt.elapsedSec) || 0;
  const credited = Math.round(Number(receipt.credited) || 0);
  const upkeep = Math.round(Number(receipt.upkeepCharged) || 0);
  const net = credited - upkeep;
  const unpaid = Math.max(0, Math.round(Number(receipt.upkeepUnpaid) || 0));
  const lost = Math.max(0, Math.round(Number(receipt.lost) || 0));
  // Only the facts that moved get a clause (words-offline-receipt): a hull that earned
  // while its upkeep lapsed no longer reads "+0 cr wallet change · +0 cr earned ·
  // 0 cr upkeep". The wallet-change clause keeps its place only when earn and upkeep
  // actually fought each other — when one side is zero the surviving clause already
  // tells the whole story, and the net would be the same number said twice. Money
  // reads grouped like every other credit receipt.
  const bits = [];
  if (credited > 0 && upkeep > 0 && net !== 0) {
    bits.push(`${net > 0 ? '+' : '−'}${Math.abs(net).toLocaleString('en-US')} cr wallet change`);
  }
  if (credited > 0) bits.push(`+${credited.toLocaleString('en-US')} cr earned`);
  if (upkeep > 0) bits.push(`${upkeep.toLocaleString('en-US')} cr upkeep`);
  if (unpaid > 0) bits.push(`${unpaid.toLocaleString('en-US')} cr unpaid (not yet charged)`);
  if (lost > 0) bits.push(lost === 1 ? '1 asset lost' : `${lost.toLocaleString('en-US')} assets lost`);
  if (receipt.distressed) bits.push('assets distressed');
  return `While you were away (${awayDurationLabel(elapsedSec)}): ${bits.length ? bits.join(' · ') : 'nothing moved'}`;
}

export function consumeOfflineReceiptOnce(state, receipt) {
  if (!isOfflineReceiptShowable(receipt)) return null;
  const key = offlineReceiptFingerprint(receipt);
  if (!state || typeof state !== 'object') return formatOfflineReceiptLine(receipt);
  if (!state.ui || typeof state.ui !== 'object') state.ui = {};
  if (state.ui.offlineReceiptShownKey === key) return null;
  state.ui.offlineReceiptShownKey = key;
  return formatOfflineReceiptLine(receipt);
}

export function formatAssetLossLine(kind, event) {
  const label = kind === 'drone' || kind === 'trader' || kind === 'outpost' ? kind : 'asset';
  if (event === 'repossessed') return `Asset repossessed (unpaid upkeep): ${label}`;
  return `${label[0].toUpperCase()}${label.slice(1)} distressed — unpaid upkeep`;
}

function lastOfflineReceipt(state) {
  return state && state.automation && state.automation.meta
    ? state.automation.meta.lastOfflineReceipt
    : null;
}

function showOfflineReceipt(bus, state, receipt) {
  const line = consumeOfflineReceiptOnce(state, receipt);
  if (!line) return false;
  const warning = Number(receipt.upkeepCharged) > Number(receipt.credited) || Number(receipt.upkeepUnpaid) > 0;
  bus.emit('toast', { text: line, kind: warning ? 'warn' : 'credits', ttl: 8 });
  return true;
}

export function bindAutomationPayoffUi(bus, getState) {
  if (!bus || typeof bus.on !== 'function') return;
  const stateOf = () => (typeof getState === 'function' ? getState() : getState);
  bus.on('save:loaded', () => {
    const state = stateOf();
    showOfflineReceipt(bus, state, lastOfflineReceipt(state));
  });
  bus.on('automation:offlineSummary', (receipt) => {
    showOfflineReceipt(bus, stateOf(), receipt);
  });
  bus.on('automation:assetDistressed', (payload) => {
    bus.emit('toast', {
      text: formatAssetLossLine(payload && payload.kind, 'distressed'),
      kind: 'warn',
      ttl: 4,
    });
  });
  bus.on('automation:assetRepossessed', (payload) => {
    bus.emit('toast', {
      text: formatAssetLossLine(payload && payload.kind, 'repossessed'),
      kind: 'error',
      ttl: 4,
    });
  });
}
