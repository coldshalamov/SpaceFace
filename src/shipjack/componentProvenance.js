// Read-only component evidence and shop quotations. Inventory and settlement belong to ships.
import { MODULES } from '../data/modules.js';
import { WEAPONS } from '../data/weapons.js';
import { fenceForStation, fenceSituation } from '../data/fences.js';
import { deniableBoardEpoch, isFenceBurned } from '../data/deniableAftermath.js';
import { SECTORS } from '../data/sectors.js';
import { hash32 } from '../core/rng.js';
import { isBlackFlagAdventure } from './model.js';
import { componentCondition } from './market.js';

const DEFINITIONS = new Map([...MODULES, ...WEAPONS].map(def => [def.id, def]));
const STATIONS = new Map(SECTORS.flatMap(sector => (sector.stations || []).map(station => [station.id, station])));
const sourceId = item => item?.provenance?.sourceVesselId || item?.provenance?.vesselId || null;
const records = state => state?.player?.shipjack?.vesselsById || state?.shipjack?.vesselsById || {};
const bad = reason => ({ ok: false, reason });

/** The first removal is durable evidence. Moving a part through another hull never rewrites it. */
export function componentAfterRemoval(state, item) {
  if (!item || !isBlackFlagAdventure(state) || !sourceId(item)) return item;
  const provenance = item.provenance;
  if (provenance.titleAtExtraction) return item;
  return { ...item, provenance: { ...provenance,
    sourceVesselId: sourceId(item),
    titleAtExtraction: records(state)[sourceId(item)]?.title || provenance.titleAtCapture || 'disputed' } };
}

/** Title is independent of WANTED. A returned shell does not adjudicate parts kept by its thief. */
export function inspectComponentProvenance(state, item) {
  const vesselId = sourceId(item);
  if (!isBlackFlagAdventure(state) || !vesselId) return { tracked: false, unresolved: false, findings: [] };
  const vessel = records(state)[vesselId];
  const provenance = item.provenance;
  const titleAtExtraction = provenance.titleAtExtraction || provenance.titleAtCapture || null;
  const title = vessel?.title || titleAtExtraction || 'disputed';
  const clean = titleAtExtraction === 'clean'
    || (title === 'clean' && vessel?.recognizedOwner === 'player');
  const unresolved = !clean;
  const reason = unresolved
    ? 'Component registry unresolved — obtain lawful salvage title or sell to a named fence; returning the shell does not release retained parts'
    : null;
  return { tracked: true, unresolved, sourceVesselId: vesselId, titleAtExtraction, title,
    reason, findings: unresolved ? [`${DEFINITIONS.get(item.defId)?.name || 'Fitted component'}: equipment title traces to ${vessel?.name || 'an unresolved source frame'}`] : [] };
}

export function inspectFittedComponents(state, fittedInstances, { grade = 2 } = {}) {
  const findings = [], instanceIds = [];
  if (grade >= 2) for (const item of Object.values(fittedInstances || {})) {
    const result = inspectComponentProvenance(state, item);
    if (result.unresolved) { findings.push(...result.findings); instanceIds.push(item.instanceId); }
  }
  return { accepted: findings.length === 0, findings, instanceIds };
}

/** Exact-instance quote; every operative factor is fingerprinted again at settlement. */
export function quoteModuleSale(state, { instanceId } = {}) {
  if (!isBlackFlagAdventure(state)) return bad('Component resale is available in Adventure only');
  const stationId = state?.ui?.docked === true ? state.ui.dockedStationId : null;
  const station = STATIONS.get(stationId);
  const fence = fenceForStation(stationId);
  if (!station || (!(station.services || []).some(service => service === 'shipyard' || service === 'repair') && !fence)) {
    return bad('Dock at a shipworks counter or named fence first');
  }
  const matches = (state.player?.moduleInventory || []).filter(item => item?.instanceId === instanceId);
  if (matches.length !== 1) return bad('That exact spare component is no longer available');
  const item = matches[0], definition = DEFINITIONS.get(item.defId);
  if (!definition || definition.intrinsicHull || !Number.isFinite(definition.price) || definition.price <= 0) return bad('This component has no resale market');
  const inspection = inspectComponentProvenance(state, item);
  if (inspection.unresolved && !fence) return bad(inspection.reason);
  if (fence) {
    const row = state.encounterDirector?.stats?.fences?.byId?.[fence.id];
    const epoch = deniableBoardEpoch(state);
    if (isFenceBurned(state, stationId, epoch) || (row && fenceSituation(row, epoch) === 'burned')) return bad(`${fence.name} refuses trade while your contact is burned`);
  }
  const condition = componentCondition(item.condition);
  const factor = inspection.unresolved ? 0.25 : 0.5;
  const basis = Math.min(definition.price, ...Object.values(definition.shopOffers || {})
    .map(offer => offer?.price).filter(price => Number.isFinite(price) && price >= 0));
  const amount = Math.floor(basis * condition * factor);
  if (amount <= 0) return bad('This damaged component has no recoverable resale value');
  const now = Number(state.simTime) || 0;
  const operative = [instanceId, item.defId, stationId, amount, condition, factor,
    item.provenance || null, inspection.title, inspection.titleAtExtraction, inspection.unresolved, fence?.id || null];
  const factorsFingerprint = hash32(JSON.stringify(operative)).toString(16);
  const expiresAt = now + 30;
  return { ok: true, quote: Object.freeze({ version: 1, instanceId, defId: item.defId, stationId,
    amount, condition, factor, fenceId: fence?.id || null, expiresAt, factorsFingerprint,
    fingerprint: hash32(factorsFingerprint, expiresAt).toString(16) }) };
}

export function validateModuleSaleQuote(state, request) {
  const quote = request?.quote;
  if (!quote || quote.version !== 1 || !Number.isFinite(quote.expiresAt)
    || quote.expiresAt < (Number(state.simTime) || 0) || quote.expiresAt > (Number(state.simTime) || 0) + 30
    || quote.instanceId !== request.instanceId) return bad('Component quote expired — request a fresh appraisal');
  const live = quoteModuleSale(state, request);
  if (!live.ok) return live;
  if (quote.fingerprint !== hash32(quote.factorsFingerprint, quote.expiresAt).toString(16)) return bad('Component quote was altered — request a fresh appraisal');
  for (const key of ['factorsFingerprint', 'amount', 'defId', 'stationId', 'condition', 'factor', 'fenceId']) {
    if (quote[key] !== live.quote[key]) return bad('Component appraisal changed — review the revised quote');
  }
  return { ok: true, quote };
}
