// wantedReason.js — the WANTED alert's incident trace (INF-077).
//
// Renders the heat owner's convicting-incident record as a compact reason suffix:
// kind, affected party, and the witness/jurisdiction basis the law actually
// established. Pure and DOM-free so the no-false-witness rule is unit-testable:
// suspicion without a receipt yields no reason, and a record carrying neither
// witnesses nor a jurisdiction renders the kind alone — never an invented witness.
import { heatClearSecondsForLevel, heatLevelFor } from '../systems/heat.js';

export const WANTED_KIND_LABELS = Object.freeze({
  payload_theft: 'CARGO THEFT',
  unlawful_kill: 'KILL',
  lawful_kill: 'LAW KILL',
  reckless_kill: 'RECKLESS KILL',
});

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
  if (typeof inc.affected === 'string' && inc.affected) parts.push(inc.affected);
  if (Number(inc.witnessCount) > 0) {
    parts.push(inc.witnessCount + (inc.witnessCount === 1 ? ' WITNESS' : ' WITNESSES'));
  }
  if (typeof inc.jurisdiction === 'string' && inc.jurisdiction) parts.push(inc.jurisdiction);
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
