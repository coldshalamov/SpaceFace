// Morrowlight owns progression and remembered work, never the player's wallet or hold.
// Physical records are a sidecar to real persistent bodies, not a second inventory.
import { freshTenderPhysical, normalizeTenderPhysical } from './physical.js';

export const TENDER_CONFIG = Object.freeze({
  id: 'personal-salvage-tender:v1', owner: 'salvageTender', name: 'Morrowlight',
  discoverRange: 650, offerRange: 210, serviceRange: 100, serviceSpeed: 8,
  departureRange: 420, serviceHullFloor: 24, fuelPerCell: 25, repairPerScrap: 20,
  emergencyHullFraction: 0.35, serviceRate: 8, historyLimit: 12,
});

export const TENDER_STAGES = Object.freeze([
  Object.freeze({ stage: 0, name: 'A light left on', description: 'A battered service barge. Recover it before claiming its berth.', cost: null }),
  Object.freeze({ stage: 1, name: 'Lantern Berth', description: 'A dependable return beacon, a working cell pump, and one emergency weld.',
    cost: Object.freeze({ credits: 45, items: Object.freeze({ cmdty_salvage_electronics: 1 }) }) }),
  Object.freeze({ stage: 2, name: 'Working Bench', description: 'Turn recovered scrap into hull and armor repairs. The bench keeps its unfinished work.',
    cost: Object.freeze({ credits: 180, items: Object.freeze({ cmdty_scrap_metal: 4, cmdty_salvage_electronics: 2 }) }) }),
  Object.freeze({ stage: 3, name: 'Expedition Tender', description: 'A powered cargo rack carries a real supply pod with the barge; twin tools double repair speed.',
    cost: Object.freeze({ credits: 320, items: Object.freeze({ cmdty_scrap_metal: 6, cmdty_salvage_electronics: 3 }) }) }),
]);

const finite = (v, d = 0) => Number.isFinite(v) ? v : d;
const count = (v, max = 1e6) => Math.max(0, Math.min(max, Math.floor(finite(v))));
const text = (v, max = 220) => typeof v === 'string' ? v.slice(0, max) : '';

export function freshSalvageTender() {
  return {
    schema: 1, id: TENDER_CONFIG.id, name: TENDER_CONFIG.name,
    discovered: false, owned: false, rescueAccepted: false, stage: 0, revision: 0,
    physical: null, emergencyAvailable: false, service: null,
    arrivals: 0, departures: 0, away: false, everDeparted: false,
    history: [], lastStatus: 'A service light is still burning.',
    firstDiscoveredAt: null, claimedAt: null, nextOfferAt: 0,
  };
}

export function recordTenderHistory(row, at, kind, message) {
  row.history.push({ at: Math.max(0, finite(at)), kind: text(kind, 32), text: text(message) });
  row.history = row.history.slice(-TENDER_CONFIG.historyLimit);
  row.lastStatus = text(message);
}

export function normalizeTenderService(raw) {
  if (!raw || !['repair', 'refuel', 'emergency'].includes(raw.type)) return null;
  const requested = finite(raw.requested);
  const delivered = Math.max(0, Math.min(requested, finite(raw.delivered)));
  if (!(requested > 0 && requested <= 100000) || delivered >= requested) return null;
  if (!Number.isInteger(raw.shipIndex) || raw.shipIndex < 0 || raw.shipIndex > 10000) return null;
  return {
    id: text(raw.id, 100), type: raw.type, requested, delivered,
    remaining: requested - delivered, shipIndex: raw.shipIndex,
    shipDefId: text(raw.shipDefId, 100), startedAt: Math.max(0, finite(raw.startedAt)),
    vesselId: text(raw.vesselId, 160),
    rate: Math.max(1, Math.min(32, finite(raw.rate, TENDER_CONFIG.serviceRate))),
    hullShare: Math.max(0, Math.min(1, finite(raw.hullShare, 1))),
    armorShare: Math.max(0, Math.min(1, finite(raw.armorShare))),
    deliveredHull: Math.max(0, finite(raw.deliveredHull)),
    deliveredArmor: Math.max(0, finite(raw.deliveredArmor)),
    deliveredFuel: Math.max(0, finite(raw.deliveredFuel)),
    paidCommodity: text(raw.paidCommodity, 80), paidUnits: count(raw.paidUnits, 1000),
    beforeProtection: Math.max(0, finite(raw.beforeProtection)),
    paused: true, pauseReason: 'Reconnect at the same berth to resume.',
  };
}

export function normalizeSalvageTender(raw) {
  const row = freshSalvageTender();
  if (!raw || raw.schema !== 1 || raw.id !== row.id) return row;
  row.physical = raw.physical?.schema === 1 && raw.physical.tender?.id === 'pro:salvageTender:morrowlight'
    ? normalizeTenderPhysical(raw.physical) : null;
  row.discovered = raw.discovered === true && !!row.physical;
  row.stage = count(raw.stage, 3);
  // A malformed stage never mints an owned base; both parts of the claim must agree.
  row.owned = raw.owned === true && row.stage >= 1 && row.discovered;
  if (!row.owned) row.stage = 0;
  row.rescueAccepted = !row.owned && raw.rescueAccepted === true && row.discovered;
  row.revision = count(raw.revision);
  row.emergencyAvailable = row.owned && raw.emergencyAvailable === true;
  row.service = row.owned ? normalizeTenderService(raw.service) : null;
  row.arrivals = count(raw.arrivals); row.departures = count(raw.departures);
  row.away = raw.away === true; row.everDeparted = raw.everDeparted === true;
  row.firstDiscoveredAt = Number.isFinite(raw.firstDiscoveredAt) ? Math.max(0, raw.firstDiscoveredAt) : null;
  row.claimedAt = row.owned && Number.isFinite(raw.claimedAt) ? Math.max(0, raw.claimedAt) : null;
  row.nextOfferAt = Math.max(0, finite(raw.nextOfferAt));
  row.lastStatus = text(raw.lastStatus) || row.lastStatus;
  row.history = (Array.isArray(raw.history) ? raw.history : []).slice(-TENDER_CONFIG.historyLimit)
    .filter(r => r && Number.isFinite(r.at)).map(r => ({ at: Math.max(0, r.at), kind: text(r.kind, 32), text: text(r.text) }));
  return row;
}

export function discoverTenderState(row, { sectorId, anchor }, at) {
  if (row.discovered) return false;
  if (typeof sectorId !== 'string' || !anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.z)) return false;
  row.physical = freshTenderPhysical({ sectorId, anchor });
  row.discovered = true; row.firstDiscoveredAt = at; row.revision++;
  recordTenderHistory(row, at, 'discovered', 'Morrowlight. Cold machinery, a bent gantry, one stubborn lamp.');
  return true;
}
