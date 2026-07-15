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
