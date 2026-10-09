// wantedReason.js — the WANTED alert's incident trace (INF-077).
//
// Renders the heat owner's convicting-incident record as a compact reason suffix:
// kind, affected party, and the witness/jurisdiction basis the law actually
// established. Pure and DOM-free so the no-false-witness rule is unit-testable:
// suspicion without a receipt yields no reason, and a record carrying neither
// witnesses nor a jurisdiction renders the kind alone — never an invented witness.
import { heatClearSecondsForLevel, heatLevelFor } from '../systems/heat.js';
import { SECTORS } from '../data/sectors.js';

export const WANTED_KIND_LABELS = Object.freeze({
  payload_theft: 'CARGO THEFT',
  unlawful_kill: 'KILL',
  lawful_kill: 'LAW KILL',
  reckless_kill: 'RECKLESS KILL',
});

// Station ids the record carries are handles, not copy — the alert prints the place's name.
const STATION_NAME_BY_ID = new Map();
for (const sector of SECTORS) {
  for (const station of (sector && sector.stations) || []) {
    if (station && station.id && station.name) STATION_NAME_BY_ID.set(station.id, station.name);
  }
}

function jurisdictionName(id) {
  const known = STATION_NAME_BY_ID.get(id);
  if (known) return known;
  return String(id).replace(/^station_/, '').replace(/_/g, ' ');
}

export function wantedReasonText(packet, player) {
  // An explicit null incident on a heat packet is the answer: the explanation has
  // expired. Do not fall back to a player record the packet just superseded.
  let inc = null;
  if (packet && typeof packet === 'object' && Object.prototype.hasOwnProperty.call(packet, 'incident')) {
    inc = packet.incident;
  } else if (player && typeof player === 'object') {
    inc = player.heatLastIncident || null;
  }
  if (!inc || typeof inc !== 'object' || !inc.incidentReceiptId) return '';
  const parts = [WANTED_KIND_LABELS[inc.kind]
    || (typeof inc.kind === 'string' && inc.kind ? inc.kind.toUpperCase().slice(0, 32) : 'INCIDENT')];
  // The raw `affected` handle is never printed — a recorded label, or a station name when the
  // handle itself is a known station.
  const party = typeof inc.affectedLabel === 'string' && inc.affectedLabel.trim()
    ? inc.affectedLabel.trim()
    : STATION_NAME_BY_ID.get(inc.affected);
  if (party) parts.push(String(party).toUpperCase());
  if (Number(inc.witnessCount) > 0) {
    parts.push(inc.witnessCount + (inc.witnessCount === 1 ? ' WITNESS' : ' WITNESSES'));
  }
  if (typeof inc.jurisdiction === 'string' && inc.jurisdiction) {
    parts.push(jurisdictionName(inc.jurisdiction).toUpperCase());
  }
  return ' · ' + parts.join(' · ');
}

/** Seconds until this heat level drops off the wanted ledger, as the flight alert says it. */
export function wantedClearClause(value) {
  const clearS = heatClearSecondsForLevel(heatLevelFor(Number(value) || 0));
  if (!(clearS > 0)) return '';
  return ` · clears in ${Math.ceil(clearS)}s`;
}

export function wantedAlertText(value, reason, refresh) {
  const why = reason || '';
  const clear = wantedClearClause(value);
  if (refresh) {
    const v = Number(value) || 0;
    const tier = v >= 0.6 ? 'HIGH' : v >= 0.35 ? 'MODERATE' : 'LOW';
    return 'WANTED (' + tier + ') · HUNTERS INBOUND' + clear + why;
  }
  return 'WANTED · LAW ENFORCEMENT ACTIVE' + clear + why;
}
