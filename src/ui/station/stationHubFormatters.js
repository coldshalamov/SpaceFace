// src/ui/station/stationHubFormatters.js — escaped display formatting for save-derived station
// surfaces. Every function here turns persisted ids/lot records into escaped text or HTML, so
// hostile save data can never reach innerHTML unescaped (save-import HTML-safety contract).
// Live consumers import this module directly.
import { escapeHtml } from '../comms.js';
import { COMMODITIES } from '../../data/commodities.js';
import { canonicalCargoItemId, normalizeCargoItemKey } from './stationHubModel.js';

const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));

export function prettyId(id) {
  return String(id || '')
    .replace(/^(station|sector|cmdty|faction)_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Human contract-type name ("cargo_delivery" → "Cargo Delivery"); unknown → "Contract". */
export function prettyType(t) {
  if (!t) return 'Contract';
  return String(t).split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** Escaped cargo label used by the Hold panel's HTML renderer. */
export function cargoItemLabelHtml(value) {
  const key = normalizeCargoItemKey(value);
  const commodity = key && COMMODITY_BY_ID.get(key);
  return escapeHtml(commodity && commodity.name ? commodity.name : (key ? prettyId(key) : 'Unknown cargo'));
}

/** Escaped data value; unknown/legacy cargo deliberately has no sell action. */
export function cargoItemRefAttr(value) {
  const canonical = canonicalCargoItemId(value);
  return canonical ? escapeHtml(canonical) : '';
}

/** Render one player cargo provenance row. Every save-derived value is escaped before it enters
 * the Hold panel's innerHTML, including attribute text and fallback identifiers. */
export function richLotReadoutHtml(lot = {}) {
  const commodity = COMMODITY_BY_ID.get(lot.commodityId) || { name: prettyId(lot.commodityId) };
  const commodityName = String(commodity.name || prettyId(lot.commodityId));
  const qty = Math.max(0, Math.floor(Number(lot.qty) || 0));
  const opportunityId = String(lot.richOpportunityId || '');
  const lotLabel = String(lot.lotId || lot.richOpportunityId || 'LOT');
  const resolution = lot.resolution ? ` · ${String(lot.resolution).toUpperCase()}` : '';
  // Seam-bonus size rides the lot record; naming it here closes the "why did this pay more" gap.
  const bonusU = Math.max(0, Math.floor(Number(lot.richBonusU) || 0));
  const bonusLabel = bonusU > 0 ? ` · +${bonusU}u SEAM BONUS` : '';
  return `<div class="st-row st-row--rich-lot"><span class="c-name">${escapeHtml(`RICH ORE · ${commodityName}${bonusLabel}`)}</span><span class="c-num">${qty}</span><span class="c-num" title="${escapeHtml(opportunityId)}">${escapeHtml(lotLabel)}</span><span class="c-num">${escapeHtml(resolution)}</span><span></span></div>`;
}
