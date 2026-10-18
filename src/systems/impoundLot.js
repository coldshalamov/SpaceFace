// One pre-owned hull on a station lot. The loss ledger and a surrender custody
// transfer are the only posters. Ships buys the listing; law reads the papers.
// This module does not write credits, heat, standing, cargo, or the player's deed record.

import { hash32 } from '../core/rng.js';
import {
  LIVING_HULL_SCAR_FACINGS,
  livingHullRenown,
  livingHullScars,
  livingHullWithScar,
  normalizeLivingHull,
} from '../core/livingHull.js';
import { LAWFUL_STATION_FACTIONS } from '../data/factions/index.js';
import { deedLine } from '../data/deedPhrases.js';
import { SECTORS } from '../data/sectors.js';
import { SHIPS } from '../data/ships.js';
import { DEED_KINDS, hullPaperDeed } from './deedRecord.js';

const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));
const OVERBORE_ACCEL_KEYS = Object.freeze(['mainAccel', 'maxAccel', 'rcsForwardAccel', 'fieldAccel']);
const OVERBORE_MIN = 1.05;
const OVERBORE_MAX = 1.25;
const IMPOUND_ACCEL_MULT = 1.12;
const RAW_ID = /\b(?:ship|sector|station|faction|loss)_[a-z0-9_]+\b/i;

function sectorById(sectorId) {
  return SECTORS.find((sector) => sector.id === sectorId) || null;
}

function stationById(stationId) {
  if (!stationId) return null;
  for (const sector of SECTORS) {
    const station = (sector.stations || []).find((row) => row.id === stationId);
    if (station) return station;
  }
  return null;
}

function shipyardIn(sectorId) {
  const sector = sectorById(sectorId);
  if (!sector) return null;
  return (sector.stations || []).find((station) => Array.isArray(station.services)
    && station.services.includes('shipyard')) || null;
}

function plainWords(value) {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/\s+/g, ' ').trim();
  if (!clean || clean.length > 40 || clean.includes('_')) return null;
  if (/[a-z][A-Z]/.test(clean)) return null;
  return clean;
}

function scarSentence(scars) {
  if (!scars || scars.length === 0) return '';
  const oldest = scars[0];
  const blow = oldest.cause === 'slam' ? 'impact' : 'weapon';
  const mark = `${oldest.band} ${blow} mark on the ${oldest.facing}`;
  if (scars.length === 1) return `It carries a ${mark}.`;
  return `It carries ${scars.length} marks, the oldest a ${mark}.`;
}

function recoverySentence(sectorId) {
  const sector = sectorById(sectorId);
  const name = sector && sector.name;
  if (!name) return null;
  return `Papers say the hull was recovered near ${name}.`;
}

/** Forward acceleration for one owned hull whose thrusters were bored out.
 *  The catalog profile stays frozen; the copy is what flight reads. */
export function derivedWithOverbore(derived, accelMult) {
  const mult = Number(accelMult);
  if (!derived || typeof derived !== 'object' || !Number.isFinite(mult) || !(mult > 1)) return derived;
  const scale = Math.min(OVERBORE_MAX, Math.max(OVERBORE_MIN, mult));
  const next = { ...derived };
  if (derived.propulsion && typeof derived.propulsion === 'object') {
    const propulsion = { ...derived.propulsion };
    for (const key of OVERBORE_ACCEL_KEYS) {
      if (typeof propulsion[key] === 'number') propulsion[key] *= scale;
    }
    next.propulsion = propulsion;
  }
  if (derived.flightModel && typeof derived.flightModel === 'object') {
    const flightModel = { ...derived.flightModel };
    if (typeof flightModel.mainAccel === 'number') flightModel.mainAccel *= scale;
    next.flightModel = flightModel;
  }
  if (typeof derived.thrust === 'number') next.thrust = derived.thrust * scale;
  return next;
}

export function impoundHistoryLine(listing) {
  if (!listing || !listing.stationName || !listing.shipName) return '';
  const price = Math.max(0, Math.round(Number(listing.price) || 0)).toLocaleString('en-US');
  const who = listing.callsign ? `, ${listing.callsign},` : '';
  const scar = listing.scarSentence ? `${listing.scarSentence} ` : '';
  const deed = listing.deedLine ? `${listing.deedLine} ` : '';
  return `${listing.stationName} has a used ${listing.shipName}${who} for ${price} credits. ${scar}${deed}The thrusters were bored out, so it pulls harder than a stock hull.`;
}

/** Papers law may file. Unknown kinds and lines that name a raw id are refused.
 *  Does not write heat, credits, or the player's record. */
export function acceptHullPapers(deed, line) {
  if (!deed || typeof deed !== 'object' || !DEED_KINDS[deed.kind]) return null;
  if (typeof line !== 'string') return null;
  const text = line.trim();
  if (!text || RAW_ID.test(text)) return null;
  const spec = DEED_KINDS[deed.kind];
  return Object.freeze({
    id: String(deed.id || ''),
    kind: deed.kind,
    line: text,
    label: typeof deed.label === 'string' && deed.label.trim() ? deed.label.trim() : spec.label,
    sectorId: deed.sectorId || null,
    factionId: deed.factionId || null,
  });
}

function papersForHull(hull, entry, entity, sectorId, simTime, tick) {
  const renown = livingHullRenown(hull);
  const kill = renown.find((act) => act && act.act === 'kill') || null;
  const lossKey = entry && entry.lossId ? String(entry.lossId) : String(entity && entity.id);
  const id = `papers:${hash32(lossKey, 'hull-papers').toString(36)}`;
  if (kill && kill.factionId && kill.sectorId) {
    const kind = LAWFUL_STATION_FACTIONS.has(kill.factionId) ? 'kill_lawful' : 'kill_outlaw';
    const deed = hullPaperDeed({
      id,
      kind,
      t: simTime,
      tick,
      sectorId: kill.sectorId,
      factionId: kill.factionId,
      subject: null,
    });
    const line = deed ? deedLine(deed, { voice: 'neutral' }) : null;
    if (!deed || !line) return null;
    return { deed, line };
  }
  const factionId = (entity && entity.factionId) || (entry && entry.factionId) || null;
  const kind = factionId && LAWFUL_STATION_FACTIONS.has(factionId) ? 'kill_lawful' : 'kill_outlaw';
  const line = recoverySentence(sectorId);
  if (!line) return null;
  const deed = hullPaperDeed({
    id,
    kind,
    t: simTime,
    tick,
    sectorId,
    factionId,
    subject: null,
    label: 'Recovered hull',
  });
  return deed ? { deed, line } : null;
}

/**
 * Post the single open lot listing, or return null when a listing is already
 * up, the hull is not a priced catalog ship, or the sector has no shipyard.
 * `recovery` marks a surrender; a kill with no scar of its own gets one death mark.
 */
export function postImpoundListing(state, bus, { entity, entry, recovery } = {}) {
  if (!state || !state.lossLedger || !entity || entity.id === state.playerId) return null;
  if (recovery && entity.alive === false) return null;
  if (state.lossLedger.impound && typeof state.lossLedger.impound === 'object') return null;
  const data = entity.data || {};
  if (data.factionPresence && data.factionPresence.factionId === 'faction_understory') return null;
  const def = SHIP_BY_ID.get(data.defId);
  const catalogPrice = def && Number(def.price);
  if (!def || !def.name || !Number.isFinite(catalogPrice) || catalogPrice <= 0) return null;
  const sectorId = (entry && entry.sectorId) || data.sectorId
    || (state.world && state.world.currentSectorId) || null;
  const custody = recovery && stationById(recovery.stationId);
  const custodyYard = custody && Array.isArray(custody.services) && custody.services.includes('shipyard')
    ? custody : null;
  const station = custodyYard || shipyardIn(sectorId);
  if (!station || !station.name || !sectorId) return null;
  const lossId = entry && entry.lossId ? String(entry.lossId) : null;
  if (!lossId) return null;

  const simTime = Number(state.simTime) || 0;
  const tick = state.tick | 0;
  let hull = normalizeLivingHull(data.livingHull, simTime);
  const source = recovery ? 'surrender' : 'loss';
  if (source === 'loss' && livingHullScars(hull).length === 0) {
    const facing = LIVING_HULL_SCAR_FACINGS[hash32(lossId, 'impound-scar') % LIVING_HULL_SCAR_FACINGS.length];
    hull = livingHullWithScar(hull, {
      id: `impound-mark:${hash32(lossId, 'impound-mark').toString(36)}`,
      cause: 'weapon',
      surface: 'weapon',
      band: 'heavy',
      facing,
      atT: simTime,
      tick,
      patchedAtT: null,
    }, simTime);
  }
  const papers = papersForHull(hull, entry, entity, sectorId, simTime, tick);
  if (!papers) return null;
  const callsign = plainWords(data.callsign)
    || plainWords(entry && entry.victimCallsign)
    || plainWords(data.name)
    || plainWords(entry && entry.victimName);
  const named = callsign && callsign !== def.name ? callsign : null;
  const scars = livingHullScars(hull);
  const listing = {
    listingId: `impound:${hash32(lossId, 'impound-lot').toString(36)}`,
    lossId,
    defId: def.id,
    shipName: def.name,
    callsign: named,
    stationId: station.id,
    stationName: station.name,
    sectorId,
    price: Math.max(1, Math.round(catalogPrice * 0.4)),
    livingHull: hull,
    deed: papers.deed,
    deedLine: papers.line,
    scarSentence: scarSentence(scars),
    quirk: Object.freeze({ kind: 'overbored', accelMult: IMPOUND_ACCEL_MULT }),
    source,
  };
  listing.historyLine = impoundHistoryLine(listing);
  if (!listing.historyLine || RAW_ID.test(listing.historyLine)) return null;
  state.lossLedger.impound = listing;
  if (bus && bus.emit) {
    bus.emit('news:publish', {
      text: listing.historyLine,
      kind: 'impound_lot',
      eventId: listing.listingId,
      source: 'lossLedger',
      sourceRef: listing.listingId,
      stationId: station.id,
      sectorId,
    });
  }
  return listing;
}
