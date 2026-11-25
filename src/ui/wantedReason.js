// wantedReason.js — the WANTED alert's incident trace (INF-077).
//
// Renders the heat owner's convicting-incident record as a compact reason suffix:
// kind, affected party, and the witness/jurisdiction basis the law actually
// established. Pure and DOM-free so the no-false-witness rule is unit-testable:
// suspicion without a receipt yields no reason, and a record carrying neither
// witnesses nor a jurisdiction renders the kind alone — never an invented witness.
import {
  heatClearSecondsForLevel,
  heatLevelFor,
  WANTED_TIER,
  wantedTierFor,
} from '../systems/heat.js';
import { SECTORS } from '../data/sectors.js';

export const WANTED_KIND_LABELS = Object.freeze({
  payload_theft: 'CARGO THEFT',
  vessel_theft: 'SHIP THEFT',
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

function resolveWantedPlayerEntity(context) {
  if (!context || typeof context !== 'object') return null;
  if (context.playerEntity && typeof context.playerEntity === 'object') return context.playerEntity;
  if (context.entities && typeof context.entities.get === 'function' && context.playerId != null) {
    return context.entities.get(context.playerId) || null;
  }
  return null;
}

function remainingWantedClearSeconds(level, zone) {
  if (!(level > 0)) return 0;
  const stepClearS = (zone && Number(zone.clearAfterS) > 0)
    ? Number(zone.clearAfterS)
    : heatClearSecondsForLevel(level);
  const outsideS = Math.max(0, Number(zone && zone.outsideS) || 0);
  let remaining = Math.max(0, stepClearS - outsideS);
  for (let l = level - 1; l >= 1; l -= 1) {
    remaining += heatClearSecondsForLevel(l);
  }
  return remaining;
}

/**
 * Honest wanted clear / hold clause for HUD, Departure Check, Fine card, and Save/Load.
 * Never freezes on a static tier duration: reports live remaining seconds only when heat is
 * actively decaying outside the active search zone in live flight, and otherwise names the
 * actual hold cause (impound yard, docked pause, off-sector hold, or inside search zone).
 */
export function wantedClearClause(value, context = null) {
  const heatValue = Number(value) || 0;
  const level = heatLevelFor(heatValue);
  if (!(level > 0)) return '';
  if (wantedTierFor(heatValue) === WANTED_TIER.IMPOUND) return ' · settle at yard';

  if (!context || typeof context !== 'object') return '';
  if (context.saved === true || context.snapshot === true) return ' · paused in save';

  const player = context.player && typeof context.player === 'object' ? context.player : null;
  const entity = resolveWantedPlayerEntity(context);
  const docked = Boolean(
    context.docked === true
    || (context.ui && context.ui.docked === true)
    || (player && player.flags && player.flags.docked === true)
    || (entity && entity.flags && entity.flags.docked === true)
  );
  if (docked) return ' · paused while docked';

  const mode = typeof context.mode === 'string' ? context.mode : null;
  if (mode !== 'flight') return ' · paused';

  const rawZone = (context.zone && typeof context.zone === 'object')
    ? context.zone
    : (player && player.heatZone && typeof player.heatZone === 'object' ? player.heatZone : null);
  const currentSectorId = (typeof context.currentSectorId === 'string' && context.currentSectorId)
    || (context.world && typeof context.world.currentSectorId === 'string' && context.world.currentSectorId)
    || null;
  if (rawZone && rawZone.sectorId && currentSectorId && rawZone.sectorId !== currentSectorId) {
    return ' · held off-sector';
  }
  if (!rawZone || rawZone.active !== true) return '';

  const pos = (context.playerPos && typeof context.playerPos === 'object')
    ? context.playerPos
    : (entity && entity.pos && typeof entity.pos === 'object' ? entity.pos : null);
  const radius = Number(rawZone.radius) || 0;
  const hasCurrentPosition = !!(pos && rawZone.center && radius > 0
    && Number.isFinite(Number(pos.x)) && Number.isFinite(Number(pos.z))
    && Number.isFinite(Number(rawZone.center.x)) && Number.isFinite(Number(rawZone.center.z)));
  if (!hasCurrentPosition) return ' · leave search zone';
  const dx = Number(pos.x) - Number(rawZone.center.x);
  const dz = Number(pos.z) - Number(rawZone.center.z);
  const outside = dx * dx + dz * dz > radius * radius;
  if (!outside) return ' · leave search zone';

  // A countdown is live evidence, not a saved fact: current flight, current zone, current
  // outside-position geometry, and the zone owner's own outside-decay clock.
  const remainingS = remainingWantedClearSeconds(level, rawZone);
  if (!(remainingS > 0)) return ' · clears in 1s';
  return ` · clears in ${Math.max(1, Math.ceil(remainingS))}s`;
}

/** The flight alert's short why: the convicting incident's kind alone (' · CARGO THEFT'), or ''.
 *  The full trace (party, witnesses, jurisdiction) belongs to the screens that have room for it. */
export function wantedKindText(packet, player) {
  let inc = null;
  if (packet && typeof packet === 'object' && Object.prototype.hasOwnProperty.call(packet, 'incident')) {
    inc = packet.incident;
  } else if (player && typeof player === 'object') {
    inc = player.heatLastIncident || null;
  }
  if (!inc || typeof inc !== 'object' || !inc.incidentReceiptId) return '';
  const kind = WANTED_KIND_LABELS[inc.kind];
  return kind ? ' · ' + kind : '';
}

/** The flight HUD's WANTED line: a voice, so eight words at most (R18) — what, why, how long/hold. */
export function wantedAlertText(value, reason, refresh, context = null) {
  const why = reason || '';
  const clear = wantedClearClause(value, context);
  if (refresh) return 'WANTED · HUNTERS INBOUND' + why + clear;
  return 'WANTED' + why + clear;
}
