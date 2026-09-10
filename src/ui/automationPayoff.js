// Player-facing payoff for automation:offlineSummary / lastOfflineReceipt and asset loss.
// Presentation only: reads the stored receipt, never recomputes income or upkeep.

export function offlineReceiptFingerprint(receipt) {
  if (!receipt || typeof receipt !== 'object') return null;
  return [
    receipt.windowStartMs || 0,
    receipt.nowMs || 0,
    receipt.credited || 0,
    receipt.upkeepCharged || 0,
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

export function formatOfflineReceiptLine(receipt) {
  if (!receipt) return '';
  const elapsedSec = Number(receipt.elapsedSec) || 0;
  const hours = elapsedSec / 3600;
  const hrs = hours >= 10 ? String(Math.round(hours)) : hours.toFixed(1);
  const credited = Math.round(Number(receipt.credited) || 0);
  const upkeep = Math.round(Number(receipt.upkeepCharged) || 0);
  const bits = [`+${credited} cr earned`, `${upkeep} cr upkeep`];
  const lost = Math.round(Number(receipt.lost) || 0);
  if (lost > 0) bits.push(`${lost} lost`);
  if (receipt.distressed) bits.push('assets distressed');
  return `While you were away (${hrs}h): ${bits.join(' · ')}`;
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
  bus.emit('toast', { text: line, kind: 'credits', ttl: 8 });
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
