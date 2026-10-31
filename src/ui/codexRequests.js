// UI-local requests for the on-demand Codex screen. Keep this tiny mailbox available to
// always-mounted callers without making them import the screen and its presentation closure.
export const CODEX_TABS = ['Story', 'Comms', 'Discoveries', 'World', 'Graffiti', 'Figures', 'Ship', 'Archive', 'Catalog', 'Ledger'];

let requestedTab = null;

export function requestCodexTab(tab) {
  if (CODEX_TABS.includes(tab)) requestedTab = tab;
}

export function takeRequestedCodexTab() {
  const tab = requestedTab;
  requestedTab = null;
  return tab;
}

let requestedDiscovery = null;

function normalizeDiscoveryTarget(target) {
  const sectorId = target && typeof target.sectorId === 'string' ? target.sectorId.trim() : '';
  const poiId = target && typeof target.poiId === 'string' ? target.poiId.trim() : '';
  return sectorId && poiId ? { sectorId, poiId } : null;
}

export function requestCodexDiscovery(target) {
  const normalized = normalizeDiscoveryTarget(target);
  if (!normalized) return false;
  requestedDiscovery = normalized;
  return true;
}

export function clearCodexDiscoveryRequest() {
  requestedDiscovery = null;
}

export function takeRequestedCodexDiscovery() {
  const target = requestedDiscovery;
  requestedDiscovery = null;
  return target;
}
