// PQ-048.17 — Pure readers for Lira Vonn's one freight-loss case.
//
// stationContacts owns the durable projection. This module only accepts an exact, independently
// owned freight loss + aftermath identity and exposes a map-only handoff when that wreck still
// exists. Entity ids never cross the save boundary.

export const VONN_FREIGHT_CASE_VERSION = 1;
export const VONN_FREIGHT_CONTACT_ID = 'contact_lira_vonn';
export const VONN_FREIGHT_STATION_ID = 'station_drift';
export const VONN_FREIGHT_SECTOR_ID = 'sector_pallas_drift';
export const VONN_FREIGHT_ZONE_ID = 'zone_pallas_ambush';
export const VONN_FREIGHT_SHAPE_ID = 'curtain_convoy';

export const VONN_FREIGHT_MAP_LABEL = 'Sker-Run freight wreck';

const ID_MAX = 160;
const OWNER_MAX = 96;
const QTY_MAX = 999999;
const POS_MAX = 10000000;

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function stableText(value, max = ID_MAX) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > max) return null;
  return text;
}

function exact(value, expected) {
  return stableText(value) === expected ? expected : null;
}

function quantity(value) {
  if (!Number.isFinite(value)) return null;
  const out = Math.floor(value);
  return out >= 0 && out <= QTY_MAX ? out : null;
}

function point(value) {
  const source = object(value);
  if (!source || !Number.isFinite(source.x) || !Number.isFinite(source.z)) return null;
  const x = Math.round(source.x * 1000) / 1000;
  const z = Math.round(source.z * 1000) / 1000;
  return Math.abs(x) <= POS_MAX && Math.abs(z) <= POS_MAX ? { x, z } : null;
}

export function normalizeVonnFreightCustody(raw, identity = {}) {
  if (raw == null) return null;
  const source = object(raw);
  if (!source || source.terminal !== true) return undefined;
  const receiptId = stableText(source.receiptId);
  const custodyId = stableText(source.custodyId);
  const manifestId = stableText(source.manifestId);
  const freighterKey = stableText(source.freighterKey);
  const encounterId = stableText(source.encounterId);
  const outcome = stableText(source.outcome, OWNER_MAX);
  const fields = [
    'initialQty', 'playerCollectedQty', 'raiderSecuredQty', 'stationRecoveredQty',
    'deliveredQty', 'lostQty', 'accountedQty',
  ];
  const quantities = Object.fromEntries(fields.map((field) => [field, quantity(source[field])]));
  if (!receiptId || !custodyId || !manifestId || !freighterKey || !encounterId || !outcome
    || Object.values(quantities).some((value) => value == null)
    || (identity.custodyId && custodyId !== identity.custodyId)
    || (identity.manifestId && manifestId !== identity.manifestId)
    || (identity.freighterKey && freighterKey !== identity.freighterKey)
    || (identity.encounterId && encounterId !== identity.encounterId)) return undefined;
  const terminalDispositionQty = quantities.playerCollectedQty + quantities.raiderSecuredQty
    + quantities.stationRecoveredQty + quantities.deliveredQty + quantities.lostQty;
  if (quantities.accountedQty !== quantities.initialQty
    || terminalDispositionQty !== quantities.initialQty) return undefined;
  return {
    receiptId,
    custodyId,
    encounterId,
    manifestId,
    freighterKey,
    outcome,
    terminal: true,
    ...quantities,
  };
}

/**
 * Normalize the one saved Vonn case. A malformed nested record is omitted rather than repaired:
 * the player can still earn a fresh real case, but corrupted data cannot produce a fictional lead.
 */
export function normalizeVonnFreightLoss(raw) {
  const source = object(raw);
  if (!source || source.schemaVersion !== VONN_FREIGHT_CASE_VERSION) return null;
  const lossIntentId = stableText(source.lossIntentId);
  const encounterId = stableText(source.encounterId);
  const custodyId = stableText(source.custodyId);
  const manifestId = stableText(source.manifestId);
  const freighterKey = stableText(source.freighterKey);
  const carrierIdentityKey = stableText(source.carrierIdentityKey);
  const markerId = stableText(source.markerId);
  const commodityId = stableText(source.commodityId);
  const markerPos = point(source.markerPos);
  const lossQty = quantity(source.lossQty);
  if (!lossIntentId || !encounterId || !custodyId || !manifestId || !freighterKey
    || !carrierIdentityKey || !markerId || !markerId.startsWith('aft_') || !commodityId
    || !markerPos || lossQty == null
    || !exact(source.stationId, VONN_FREIGHT_STATION_ID)
    || !exact(source.sectorId, VONN_FREIGHT_SECTOR_ID)
    || !exact(source.zoneId, VONN_FREIGHT_ZONE_ID)) return null;
  const wreckStatus = source.wreckStatus === 'completed' ? 'completed'
    : (source.wreckStatus === 'open' ? 'open' : null);
  if (!wreckStatus) return null;
  const custody = normalizeVonnFreightCustody(source.custody, {
    custodyId, manifestId, freighterKey, encounterId,
  });
  if (custody === undefined) return null;
  return {
    schemaVersion: VONN_FREIGHT_CASE_VERSION,
    lossIntentId,
    encounterId,
    custodyId,
    manifestId,
    freighterKey,
    carrierIdentityKey,
    markerId,
    stationId: VONN_FREIGHT_STATION_ID,
    sectorId: VONN_FREIGHT_SECTOR_ID,
    zoneId: VONN_FREIGHT_ZONE_ID,
    commodityId,
    lossQty,
    markerPos,
    wreckStatus,
    followupHeard: source.followupHeard === true,
    custody,
  };
}

export function vonnFreightLossFor(state) {
  const bag = state && state.player && state.player.stationContacts;
  const record = bag && object(bag[VONN_FREIGHT_CONTACT_ID]);
  return normalizeVonnFreightLoss(record && record.vonnFreightLoss);
}

function markerMatches(caseFile, marker) {
  const source = object(marker);
  const freight = source && object(source.freightIdentity);
  return !!(source && freight
    && source.markerId === caseFile.markerId
    && source.sectorId === caseFile.sectorId
    && source.zoneId === caseFile.zoneId
    && source.encounterId === caseFile.encounterId
    && freight.manifestId === caseFile.manifestId
    && freight.freighterKey === caseFile.freighterKey
    && freight.role === 'hauler'
    && point(source.pos));
}

/** Exact independently-owned aftermath record, or null. Never match by recycled entity id. */
export function vonnFreightLossMarker(state, rawCase = vonnFreightLossFor(state)) {
  const caseFile = normalizeVonnFreightLoss(rawCase);
  const own = state && state.aftermathWrecks;
  const markers = own && own.bySector && own.bySector[caseFile && caseFile.sectorId];
  if (!caseFile || !Array.isArray(markers)) return null;
  const matches = markers.filter((marker) => markerMatches(caseFile, marker));
  return matches.length === 1 ? matches[0] : null;
}

/** Map-only presentation handoff. It deliberately does not create a course, mission, or reward. */
export function vonnFreightLossMapOffer(state) {
  const caseFile = vonnFreightLossFor(state);
  if (!caseFile || !caseFile.followupHeard || caseFile.wreckStatus !== 'open') return null;
  const marker = vonnFreightLossMarker(state, caseFile);
  const pos = marker && point(marker.pos);
  if (!pos) return null;
  return {
    sectorId: caseFile.sectorId,
    pos,
    label: VONN_FREIGHT_MAP_LABEL,
    markerId: caseFile.markerId,
  };
}

export function vonnFreightLossDisposition(caseFile) {
  const normalized = normalizeVonnFreightLoss(caseFile);
  const receipt = normalized && normalized.custody;
  if (!receipt) return 'The custody receipt has not settled yet.';
  const parts = [];
  if (receipt.playerCollectedQty) parts.push(`${receipt.playerCollectedQty}u in your hold`);
  if (receipt.raiderSecuredQty) parts.push(`${receipt.raiderSecuredQty}u taken by raiders`);
  if (receipt.stationRecoveredQty) parts.push(`${receipt.stationRecoveredQty}u recovered by the station`);
  if (receipt.deliveredQty) parts.push(`${receipt.deliveredQty}u delivered`);
  if (receipt.lostQty) parts.push(`${receipt.lostQty}u lost in the drift`);
  return parts.length ? `Custody closed: ${parts.join(', ')}.` : 'Custody closed with no surviving cargo claim.';
}
