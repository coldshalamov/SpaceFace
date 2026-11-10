// Persistent reading of automation.meta.lostAssetsLog. The loss toast expires; this list does not.
// It does not keep a second ledger — every line is one row the sim already stored.
import { SECTORS } from '../data/sectors.js';
import { automationScreen } from './screens/automationPanel.js';

const SECTOR_NAME = new Map(SECTORS.map((sector) => [sector.id, sector.name]));

function sectorName(id) {
  if (typeof id !== 'string' || !id) return '';
  return SECTOR_NAME.get(id) || id.replace(/^sector_/, '').replace(/_/g, ' ');
}

/** One line per lost asset that names a sector. Rows without a sector stay off the list. */
export function lostAssetLines(state) {
  const log = state && state.automation && state.automation.meta && state.automation.meta.lostAssetsLog;
  if (!Array.isArray(log)) return [];
  const lines = [];
  for (const row of log) {
    if (!row || row.kind == null || row.value == null) continue;
    const sector = sectorName(row.sectorId || row.sector);
    if (!sector) continue;
    const kind = String(row.kind);
    const value = Math.round(Number(row.value) || 0);
    lines.push({ kind, sector, value, text: `${kind} · ${sector} · ${value} cr` });
  }
  return lines;
}

export function lostAssetsSummaryText(state) {
  const lines = lostAssetLines(state);
  return lines.length ? lines.map((line) => line.text).join('\n') : '';
}

/** Paint the log into an existing automation body. No document, no node: the text is still returned. */
export function paintLostAssets(body, state) {
  const text = lostAssetsSummaryText(state);
  if (!body || typeof body.querySelector !== 'function') return text;
  let node = body.querySelector('[data-lost-assets]');
  if (!text) {
    if (node && typeof node.remove === 'function') node.remove();
    return '';
  }
  if (!node && typeof document !== 'undefined' && typeof document.createElement === 'function') {
    node = document.createElement('div');
    node.dataset.lostAssets = '';
    node.setAttribute('aria-label', 'Lost assets');
    body.appendChild(node);
  }
  if (node) node.textContent = text;
  return text;
}

let installed = false;

/** The operations board already refreshes while it is open. The lost list rides that refresh. */
export function installAutomationLossSummary() {
  if (installed || !automationScreen || typeof automationScreen.refresh !== 'function') return;
  installed = true;
  const refresh = automationScreen.refresh;
  automationScreen.refresh = function refreshWithLosses(ctx, opts) {
    const out = refresh.call(this, ctx, opts);
    const state = (ctx && ctx.state) || (this._ctx && this._ctx.state);
    const body = this._els && this._els.body;
    if (body && state) paintLostAssets(body, state);
    return out;
  };
}
