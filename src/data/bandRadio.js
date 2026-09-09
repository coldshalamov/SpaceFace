// A1 The Band — browser-safe runtime catalogue over the canonical V2 flavor pack.
//
// Copy stays authored in data/flavor/040-band.js. This module adds tuner/signal policy and pure
// deterministic selectors; it does not publish unique-wreck rumors or consume the shared sim RNG.

import { hash32 } from '../core/rng.js';
import { FLAVOR_PACKS } from './flavor/index.generated.js';

export const BAND_PACK = FLAVOR_PACKS.band;
if (!BAND_PACK || BAND_PACK.kind !== 'radio_scripts') {
  throw new Error('A1 Band requires the canonical V2 radio_scripts flavor pack.');
}

export const BAND_CHANNELS = BAND_PACK.entries;
export const BAND_CHANNEL_BY_ID = Object.freeze(Object.fromEntries(
  BAND_CHANNELS.map((channel) => [channel.id, channel]),
));
export const TUNABLE_BAND_CHANNELS = Object.freeze(BAND_CHANNELS.filter(
  (channel) => channel.tunable !== false && !channel.contextual,
));
export const TUNABLE_BAND_CHANNEL_IDS = Object.freeze(TUNABLE_BAND_CHANNELS.map((channel) => channel.id));

// Signal policy is intentionally data, not conditionals in the system. A weak carrier is always
// available away from home; home factions/sectors make it legible. Future sector content may add
// presenceFactionIds without changing this contract.
export const BAND_SIGNAL_RULES = Object.freeze({
  concord_bulletin: freezeRule({
    base: 0.14, homeSectors: ['sector_helios_prime'], homeFactions: ['faction_scn'],
    securityBias: 0.24,
  }),
  the_margin: freezeRule({
    base: 0.36, homeFactions: ['faction_free', 'faction_quiet'], tierBias: 0.025,
  }),
  the_static: freezeRule({
    base: 0.24, homeSectors: ['sector_io_reach', 'sector_sker_haven'],
    homeFactions: ['faction_reach', 'faction_quiet'], dangerBias: 0.28, tierBias: 0.025,
  }),
  ballad_line: freezeRule({
    base: 0.32, homeFactions: ['faction_dmc', 'faction_free', 'faction_reach'], tierBias: 0.04,
  }),
  choir_vespers: freezeRule({
    base: 0.18, homeFactions: ['faction_choir'], tierBias: 0.015,
  }),
  fulfillment_routing: freezeRule({
    base: 0.16, homeFactions: ['faction_fulfillment'], tierBias: 0.02,
  }),
  numbers_station: freezeRule({
    base: 0.12, homeSectors: ['sector_pallas_drift', 'sector_veil_nebula'],
    homeFactions: ['faction_quiet'], dangerBias: 0.16, tierBias: 0.055,
  }),
});

export const BAND_EVENT_KEYS = Object.freeze([...new Set(BAND_CHANNELS.flatMap(
  (channel) => channel.lines.map((line) => line.eventKey).filter(Boolean),
))].sort());

export const BAND_BEARING_TEMPLATE = BAND_CHANNEL_BY_ID.numbers_station.lines.find(
  (line) => line.role === 'unique_wreck_bearing',
) || null;

export function bandSignalStrength(channelOrId, context = {}) {
  const channel = typeof channelOrId === 'string' ? BAND_CHANNEL_BY_ID[channelOrId] : channelOrId;
  if (!channel) return 0;
  if (channel.contextual) {
    const bleed = resolveLandmarkBleed(context.proximitySources || {});
    return bleed ? bleed.strength : 0;
  }
  const rule = BAND_SIGNAL_RULES[channel.id];
  if (!rule) return 0;
  const factionIds = new Set([
    context.factionId,
    ...(Array.isArray(context.stationFactionIds) ? context.stationFactionIds : []),
    ...(Array.isArray(context.presenceFactionIds) ? context.presenceFactionIds : []),
  ].filter(Boolean));
  const security = clamp01(finite(context.security, 0.35));
  const tier = Math.max(0, finite(context.tier, 0));
  let strength = rule.base;
  if (rule.homeSectors.includes(context.sectorId)) strength += 0.34;
  if (rule.homeFactions.some((id) => factionIds.has(id))) strength += 0.34;
  strength += rule.securityBias * security;
  strength += rule.dangerBias * (1 - security);
  strength += rule.tierBias * Math.min(4, tier);
  return rounded(clamp01(strength));
}

export function reachRepBand(rep) {
  const value = finite(rep, 0);
  if (value <= -250) return 'hostile';
  if (value >= 250) return 'allied';
  return 'neutral';
}

/** Copy eligible for ordinary deterministic rotation. The bearing template is deliberately
 * excluded until a root-owned unique-wreck adapter resolves a real canonical source. */
export function eligibleBandLines(channelOrId, context = {}) {
  const channel = typeof channelOrId === 'string' ? BAND_CHANNEL_BY_ID[channelOrId] : channelOrId;
  if (!channel) return [];
  const eventKeys = context.eventKeys || {};
  const repBand = reachRepBand(context.reachRep);
  return channel.lines.filter((line) => {
    if (line.role === 'unique_wreck_bearing' && !context.includeCanonicalBearing) return false;
    if (line.eventKey && !eventKeys[line.eventKey]) return false;
    if (line.repBand && line.repBand !== repBand) return false;
    if (context.sourceId && line.sourceId && line.sourceId !== context.sourceId) return false;
    return true;
  });
}

export function selectBandLine(channelOrId, context, programSeed, sequence, sectorId = '') {
  const channel = typeof channelOrId === 'string' ? BAND_CHANNEL_BY_ID[channelOrId] : channelOrId;
  const eligible = eligibleBandLines(channel, context);
  if (!channel || eligible.length === 0) return null;
  let index = hash32(programSeed || 1, 'band-line', channel.id, sequence | 0, sectorId || '') % eligible.length;
  if (eligible.length > 1 && context && context.lastLineId === eligible[index].id) {
    index = (index + 1) % eligible.length;
  }
  return eligible[index];
}

/** Landmark carriers are supplied through the additive band:sourceProximity seam. The Hush wins
 * whenever its RF hole is in range; Quiessence otherwise overrides the tuned carrier nearby, and
 * the Resonance Obelisk pulses its ident carrier once its anomaly is in falloff. */
export function resolveLandmarkBleed(proximitySources = {}) {
  const channel = BAND_CHANNEL_BY_ID.landmark_bleed;
  if (!channel) return null;
  const strengthBySource = {
    planet_hush: clamp01(finite(proximitySources.planet_hush, 0)),
    landmark_quiessence: clamp01(finite(proximitySources.landmark_quiessence, 0)),
    resonance_obelisk: clamp01(finite(proximitySources.resonance_obelisk, 0)),
  };
  // Fixed deterministic precedence: the Hush's silence outranks any ident carrier; the two idents
  // live in different sectors, so their order never actually competes.
  let sourceId = null;
  if (strengthBySource.planet_hush >= 0.6) sourceId = 'planet_hush';
  else if (strengthBySource.landmark_quiessence >= 0.55) sourceId = 'landmark_quiessence';
  else if (strengthBySource.resonance_obelisk >= 0.55) sourceId = 'resonance_obelisk';
  if (!sourceId) return null;
  const behavior = channel.sourceBehaviors.find((entry) => entry.sourceId === sourceId) || null;
  const silence = !!(behavior && behavior.kind === 'silence');
  return Object.freeze({
    sourceId,
    strength: strengthBySource[sourceId],
    silence,
    ident: behavior && behavior.ident || null,
    bed: channel.bed,
    lines: Object.freeze(channel.lines.filter((line) => line.sourceId === sourceId)),
  });
}

function freezeRule(rule) {
  return Object.freeze({
    base: finite(rule.base, 0),
    homeSectors: Object.freeze([...(rule.homeSectors || [])]),
    homeFactions: Object.freeze([...(rule.homeFactions || [])]),
    securityBias: finite(rule.securityBias, 0),
    dangerBias: finite(rule.dangerBias, 0),
    tierBias: finite(rule.tierBias, 0),
  });
}

function finite(value, fallback) { return Number.isFinite(value) ? value : fallback; }
function clamp01(value) { return value < 0 ? 0 : value > 1 ? 1 : value; }
function rounded(value) { return Math.round(value * 1000) / 1000; }
