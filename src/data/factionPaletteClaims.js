// Depth Program §2 palette fixture. A claim below the 12° hue-separation floor must have a
// measured, documented secondary distinction. This keeps intentional adjacencies explicit instead
// of silently weakening the faction-kit validator.

export const FACTION_PALETTE_CLAIMS = Object.freeze([
  Object.freeze({ id: 'scn.primary', factionId: 'faction_scn', role: 'primary', hex: '#3A78FF', pattern: 'clean-authority-coat' }),
  Object.freeze({ id: 'mts.primary', factionId: 'faction_mts', role: 'primary', hex: '#F2B233', pattern: 'clean-commercial-coat' }),
  Object.freeze({ id: 'dmc.primary', factionId: 'faction_dmc', role: 'primary', hex: '#C9772E', pattern: 'workwear-copper-coat' }),
  Object.freeze({ id: 'reach.primary', factionId: 'faction_reach', role: 'primary', hex: '#D8334A', pattern: 'scarred-red-coat' }),
  Object.freeze({ id: 'quiet.primary', factionId: 'faction_quiet', role: 'primary', hex: '#7A5FB0', pattern: 'shadow-violet-coat' }),
  Object.freeze({ id: 'vael.primary', factionId: 'faction_vael', role: 'primary', hex: '#2FCFA0', pattern: 'austere-teal-coat' }),
  Object.freeze({ id: 'free.primary', factionId: 'faction_free', role: 'primary', hex: '#4ECBE0', pattern: 'haunted-cyan-coat' }),
  Object.freeze({ id: 'choir.primary', factionId: 'faction_choir', role: 'primary', hex: '#E85FD0', pattern: 'zealot-magenta-coat' }),
  Object.freeze({ id: 'helix.primary', factionId: 'faction_helix', role: 'primary', hex: '#8B9CB8', pattern: 'paper-slate' }),

  Object.freeze({ id: 'understory.primary', factionId: 'faction_understory', role: 'primary', hex: '#8FA82E', pattern: 'organic-bloom-over-host' }),
  Object.freeze({ id: 'fulfillment.primary', factionId: 'faction_fulfillment', role: 'primary', hex: '#F0F0E8', pattern: 'clinical-white-coat' }),
  Object.freeze({ id: 'fulfillment.status', factionId: 'faction_fulfillment', role: 'status', hex: '#40B8E0', pattern: 'status-light' }),
  Object.freeze({ id: 'archive.primary', factionId: 'faction_archive', role: 'primary', hex: '#3A2A5A', pattern: 'scripted-scroll-hull' }),
  Object.freeze({ id: 'archive.accent', factionId: 'faction_archive', role: 'accent', hex: '#B88830', pattern: 'data-groove' }),
  Object.freeze({ id: 'pitborn.primary', factionId: 'faction_pitborn', role: 'primary', hex: '#C8501C', pattern: 'orange-patch-over-host' }),
  Object.freeze({ id: 'verge.primary', factionId: 'faction_verge_layers', role: 'primary', hex: '#B0A8B8', pattern: 'structural-nacre' }),
]);

export const FACTION_PALETTE_COLLISIONS = Object.freeze([
  Object.freeze({
    pair: Object.freeze(['quiet.primary', 'archive.primary']),
    distinguishBy: Object.freeze(['lightness', 'pattern']),
    reason: 'Archive indigo is abyss-dark and scripted; Quiet violet remains a mid-value shadow coat.',
  }),
  Object.freeze({
    pair: Object.freeze(['mts.primary', 'archive.accent']),
    distinguishBy: Object.freeze(['saturation', 'role']),
    reason: 'Archive gold is a data-groove accent, never its hull-wide faction coat.',
  }),
  Object.freeze({
    pair: Object.freeze(['scn.primary', 'helix.primary']),
    distinguishBy: Object.freeze(['saturation', 'low-saturation']),
    reason: 'Helix is deliberately desaturated administrative slate beside saturated Concord blue.',
  }),
  Object.freeze({
    pair: Object.freeze(['free.primary', 'fulfillment.status']),
    distinguishBy: Object.freeze(['role']),
    reason: 'Fulfillment cyan is a status light on clinical white, deliberately adjacent to Free cyan.',
  }),
  Object.freeze({
    pair: Object.freeze(['dmc.primary', 'pitborn.primary']),
    distinguishBy: Object.freeze(['saturation', 'pattern']),
    reason: 'Pitborn orange appears only as saturated patches over stolen paint, never a clean coat.',
  }),
  Object.freeze({
    pair: Object.freeze(['dmc.primary', 'archive.accent']),
    distinguishBy: Object.freeze(['role']),
    reason: 'Archive gold is a narrow scripted accent; DMC copper owns the complete work hull.',
  }),
  Object.freeze({
    pair: Object.freeze(['mts.primary', 'dmc.primary']),
    distinguishBy: Object.freeze(['saturation']),
    reason: 'Meridian gold stays bright and saturated; DMC copper is materially duller.',
  }),
]);

// Nine occupational silhouette and livery claims (PQ-161.00).
// Each occupational role maps to its distinct silhouette token, functional light code,
// and livery application pattern across faction liveries.
import {
  OCCUPATIONAL_ROLE_IDS,
  OCCUPATIONAL_SILHOUETTE_TOKENS,
  OCCUPATIONAL_SILHOUETTE_RULES,
  getOccupationalSilhouetteRule,
  getRoleFactionLivery,
  FORCE_CHANNEL_IDS,
  FORCE_BRIGHTNESS_ORDER,
  FORCE_PALETTE,
} from './palettes.js';

export const OCCUPATIONAL_PALETTE_CLAIMS = Object.freeze([
  Object.freeze({
    id: 'occupational.miner',
    role: 'miner',
    silhouetteToken: 'token_silhouette_miner',
    lightCodeHex: '#F2B233',
    pattern: 'workwear-chassis-hazard-stripes',
    distinction: 'Asymmetric extraction arms forward, amber work floods, dust hopper silhouette.',
  }),
  Object.freeze({
    id: 'occupational.customs',
    role: 'customs',
    silhouetteToken: 'token_silhouette_customs',
    lightCodeHex: '#3A78FF',
    pattern: 'clean-authority-collar',
    distinction: 'Judge\'s collar emitter frame around bow, dorsal sensor fin, arc-blue inspection bar.',
  }),
  Object.freeze({
    id: 'occupational.heavy',
    role: 'heavy',
    silhouetteToken: 'token_silhouette_heavy',
    lightCodeHex: '#FFB347',
    pattern: 'industrial-spine-modular-truss',
    distinction: 'Stepped rectangular truss spine, modular external cargo pods, amber load-strobe heartbeat.',
  }),
  Object.freeze({
    id: 'occupational.courier',
    role: 'courier',
    silhouetteToken: 'token_silhouette_courier',
    lightCodeHex: '#A0EEF8',
    pattern: 'sleek-speed-stripes',
    distinction: 'Acute delta dart, needle nose, flush enclosed envelope, cyan clean-burn strobe.',
  }),
  Object.freeze({
    id: 'occupational.salvor',
    role: 'salvor',
    silhouetteToken: 'token_silhouette_salvor',
    lightCodeHex: '#D87838',
    pattern: 'patchwork-soot-hooded-scorch',
    distinction: 'Starboard hydraulic plate-shears, three downward hooded umbrella lamps, aft scrap cradle.',
  }),
  Object.freeze({
    id: 'occupational.surveyor',
    role: 'surveyor',
    silhouetteToken: 'token_silhouette_surveyor',
    lightCodeHex: '#80EED0',
    pattern: 'sensor-spine-matte-paddles',
    distinction: 'Extended dorsal sensor spine, high moth-wing array paddles, 90° crab survey pin.',
  }),
  Object.freeze({
    id: 'occupational.tender',
    role: 'tender',
    silhouetteToken: 'token_silhouette_tender',
    lightCodeHex: '#FF4455',
    pattern: 'primer-safety-yellow-corners',
    distinction: 'Port vertical curved plate rack, starboard articulated welding crane, static red work corners.',
  }),
  Object.freeze({
    id: 'occupational.tug',
    role: 'tug',
    silhouetteToken: 'token_silhouette_tug',
    lightCodeHex: '#FFF4D4',
    pattern: 'apron-highvis-scuffed-cradle',
    distinction: 'Blunt bow push-cradle with vertical scuffed pads, low hip nudge-keels, warm white apron beacon.',
  }),
  Object.freeze({
    id: 'occupational.rescue',
    role: 'rescue',
    silhouetteToken: 'token_silhouette_rescue',
    lightCodeHex: '#FF3344',
    pattern: 'emergency-red-white-identity-bars',
    distinction: 'Flared casualty intake mouth, dorsal stretcher grapple, steady red-white flank identity bars.',
  }),
]);

export const FORCE_PALETTE_CLAIMS = Object.freeze(
  FORCE_CHANNEL_IDS.map((id) => Object.freeze({
    id: `force.${id}`,
    channel: id,
    hex: FORCE_PALETTE[id].hex,
    hueName: FORCE_PALETTE[id].hueName,
    verb: FORCE_PALETTE[id].verb,
    brightnessRank: FORCE_BRIGHTNESS_ORDER.indexOf(id),
    pattern: `force-${id}`,
  })),
);

export function getForcePaletteClaim(channel) {
  const key = typeof channel === 'string' ? channel.toLowerCase().trim() : '';
  return FORCE_PALETTE_CLAIMS.find((claim) => claim.channel === key) || null;
}

export {
  FORCE_CHANNEL_IDS,
  FORCE_BRIGHTNESS_ORDER,
  FORCE_PALETTE,
  OCCUPATIONAL_ROLE_IDS,
  OCCUPATIONAL_SILHOUETTE_TOKENS,
  OCCUPATIONAL_SILHOUETTE_RULES,
  getOccupationalSilhouetteRule,
  getRoleFactionLivery,
};

export function getOccupationalPaletteClaim(role) {
  const norm = typeof role === 'string' ? role.toLowerCase().trim() : '';
  const rule = getOccupationalSilhouetteRule(norm);
  const targetRole = rule ? rule.role : norm;
  return OCCUPATIONAL_PALETTE_CLAIMS.find((claim) => claim.role === targetRole) || null;
}

