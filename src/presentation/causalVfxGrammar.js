// PQ-134.02 — causal VFX/audio grammar (CRU-051).
//
// Eight families. Colour follows INSTRUMENT_GRAMMAR meaning-roles, not unique-per-family hue.
// Identity is silhouette + motion + primitive mix, so colour-blind and forced-colors still read.
// Presentation only: no sim writes, no Math.random, no new meshes.

export const CAUSAL_VFX_FAMILY_LIST = Object.freeze([
  'direct',
  'bank',
  'chain',
  'collision',
  'terrain',
  'tether',
  'field',
  'reaction',
]);

export const CAUSAL_VFX_FAMILIES = Object.freeze(Object.fromEntries(
  CAUSAL_VFX_FAMILY_LIST.map((id) => [id, id]),
));

/** Legacy kill receipt is a hero overlay of the direct family. */
export const STRUCTURAL_FX_FAMILY_ALIASES = Object.freeze({
  kill: 'direct',
  ricochet: 'bank',
  bounce: 'bank',
  status: 'reaction',
  shock: 'reaction',
});

/**
 * INSTRUMENT_GRAMMAR colour roles. Colour follows MEANING, not a unique hue per family.
 * you = your capability / a gain; foe = damage / threat / a loss; goal = opportunity / redirect;
 * calm = steel / structure / rest; paper = body / ledger.
 */
export const INSTRUMENT_COLOUR_ROLES = Object.freeze({
  you: Object.freeze({ hex: 0x7af7d0, endHex: 0x2a8a70, token: '--sf-you' }),
  foe: Object.freeze({ hex: 0xff5470, endHex: 0x8a1428, token: '--sf-foe' }),
  goal: Object.freeze({ hex: 0xffb347, endHex: 0xb36a18, token: '--sf-goal' }),
  calm: Object.freeze({ hex: 0x84a0c8, endHex: 0x3a4a62, token: '--sf-calm' }),
  paper: Object.freeze({ hex: 0xd3e6ff, endHex: 0x6a7a90, token: '--sf-paper' }),
});

/** Forced-colors: CanvasText / Highlight / GrayText analogues. Shape still carries identity. */
export const FORCED_COLOUR_ROLES = Object.freeze({
  you: Object.freeze({ hex: 0xffffff, endHex: 0xbbbbbb }),
  foe: Object.freeze({ hex: 0xffff33, endHex: 0x111111 }),
  goal: Object.freeze({ hex: 0xffffff, endHex: 0x888888 }),
  calm: Object.freeze({ hex: 0x999999, endHex: 0x444444 }),
  paper: Object.freeze({ hex: 0xdddddd, endHex: 0x555555 }),
});

export const HERO_ADMISSION_FLOOR = 0.92;

/** Map a base admission into the hero band so kills still outrank flavor and keep relative order. */
export function scaleHeroAdmissionPriority(base) {
  const p = Math.max(0, Math.min(1, Number(base) || 0));
  return HERO_ADMISSION_FLOOR + (1 - HERO_ADMISSION_FLOOR) * p;
}

/**
 * AttackSpec causal kinds (same tokens as causalKindsFromSpec): DIRECT, BANK, CHAIN, SPLIT,
 * PIERCE, ORBIT, STATUS, VOLLEY. Map onto the eight presentation families.
 */
const KIND_TO_FAMILY = Object.freeze({
  DIRECT: 'direct',
  VOLLEY: 'direct',
  PIERCE: 'direct',
  BANK: 'bank',
  CHAIN: 'chain',
  SPLIT: 'chain',
  TETHER: 'tether',
  FIELD: 'field',
  ORBIT: 'field',
  STATUS: 'reaction',
  REACTION: 'reaction',
  COLLISION: 'collision',
  TERRAIN: 'terrain',
});

const KIND_PRIORITY = Object.freeze([
  'CHAIN', 'SPLIT', 'BANK', 'TETHER', 'FIELD', 'ORBIT', 'STATUS', 'REACTION',
  'TERRAIN', 'COLLISION', 'DIRECT', 'VOLLEY', 'PIERCE',
]);

function freezeFamily(row) {
  return Object.freeze(row);
}

/**
 * Per-family grammar. `blades`/`arcs`/`shards` are full-motion ordinary counts.
 * Silhouette + motion + mix are the non-colour identity.
 */
export const CAUSAL_VFX_GRAMMAR = Object.freeze({
  direct: freezeFamily({
    family: 'direct',
    colourRole: 'you',
    silhouette: 'radial-star',
    motion: 'fast-radial-short',
    sizeBand: 'medium',
    layout: 'radial',
    signaturePrimitive: 'blade',
    blades: 6,
    arcs: 2,
    shards: 4,
    bladesReduced: 2,
    arcsReduced: 1,
    shardsReduced: 1,
    audioCue: 'combat.causal.direct',
    phase: 'breakup',
  }),
  bank: freezeFamily({
    family: 'bank',
    colourRole: 'goal',
    silhouette: 'bounce-chevron',
    motion: 'two-axis-bounce',
    sizeBand: 'medium',
    layout: 'chevron',
    signaturePrimitive: 'blade',
    blades: 4,
    arcs: 2,
    shards: 2,
    bladesReduced: 1,
    arcsReduced: 1,
    shardsReduced: 1,
    audioCue: 'combat.causal.bank',
    phase: 'kinetic-tear',
  }),
  chain: freezeFamily({
    family: 'chain',
    colourRole: 'paper',
    silhouette: 'hop-arcs',
    motion: 'sequential-hop',
    sizeBand: 'narrow',
    layout: 'hop',
    signaturePrimitive: 'arc',
    blades: 0,
    arcs: 4,
    shards: 0,
    bladesReduced: 0,
    arcsReduced: 1,
    shardsReduced: 0,
    audioCue: 'combat.causal.chain',
    phase: 'causal-hop',
  }),
  collision: freezeFamily({
    family: 'collision',
    colourRole: 'foe',
    silhouette: 'opposed-shear',
    motion: 'opposed-tumble',
    sizeBand: 'wide',
    layout: 'opposed',
    signaturePrimitive: 'shard',
    blades: 0,
    arcs: 2,
    shards: 6,
    bladesReduced: 0,
    arcsReduced: 1,
    shardsReduced: 2,
    audioCue: 'combat.causal.collision',
    phase: 'collision-shear',
  }),
  terrain: freezeFamily({
    family: 'terrain',
    colourRole: 'calm',
    silhouette: 'planar-crush',
    motion: 'compressive-punch',
    sizeBand: 'wide',
    layout: 'planar',
    signaturePrimitive: 'shard',
    blades: 0,
    arcs: 0,
    shards: 8,
    bladesReduced: 0,
    arcsReduced: 0,
    shardsReduced: 2,
    audioCue: 'combat.causal.terrain',
    phase: 'terrain-crush',
  }),
  tether: freezeFamily({
    family: 'tether',
    colourRole: 'you',
    silhouette: 'axial-snap',
    motion: 'linear-snap',
    sizeBand: 'long',
    layout: 'axial',
    signaturePrimitive: 'blade',
    blades: 3,
    arcs: 1,
    shards: 0,
    bladesReduced: 1,
    arcsReduced: 1,
    shardsReduced: 0,
    audioCue: 'combat.causal.tether',
    phase: 'tether-snap',
  }),
  field: freezeFamily({
    family: 'field',
    colourRole: 'calm',
    silhouette: 'open-expand',
    motion: 'slow-expand-linger',
    sizeBand: 'broad',
    layout: 'expand',
    signaturePrimitive: 'arc',
    blades: 0,
    arcs: 3,
    shards: 1,
    bladesReduced: 0,
    arcsReduced: 1,
    shardsReduced: 0,
    audioCue: 'combat.causal.field',
    phase: 'field-expand',
  }),
  reaction: freezeFamily({
    family: 'reaction',
    colourRole: 'foe',
    silhouette: 'reverse-pop',
    motion: 'delayed-inward-out',
    sizeBand: 'medium',
    layout: 'reverse',
    signaturePrimitive: 'shard',
    blades: 2,
    arcs: 1,
    shards: 4,
    bladesReduced: 1,
    arcsReduced: 0,
    shardsReduced: 1,
    audioCue: 'combat.causal.reaction',
    phase: 'reaction-pop',
  }),
});

export function canonicalCausalFamily(value) {
  if (typeof value !== 'string' || !value) return null;
  const lower = value.toLowerCase();
  if (CAUSAL_VFX_GRAMMAR[lower]) return lower;
  const aliased = STRUCTURAL_FX_FAMILY_ALIASES[lower];
  if (aliased) return aliased;
  return KIND_TO_FAMILY[value.toUpperCase()] || null;
}

export function mapCausalKindToFamily(kind) {
  if (kind == null) return null;
  return KIND_TO_FAMILY[String(kind).toUpperCase()] || canonicalCausalFamily(String(kind));
}

/** Mirror of causalKindsFromSpec so presentation does not import systems. Same output tokens. */
export function causalKindsFromAttackSpec(spec) {
  const kinds = [];
  if (!spec || typeof spec !== 'object') return kinds;
  const root = spec.emitter && spec.emitter.rootCount > 1;
  const bank = spec.trajectory && spec.trajectory.bounces > 0;
  const chain = spec.propagation && spec.propagation.chain && spec.propagation.chain.count > 0;
  const split = spec.propagation && spec.propagation.split && spec.propagation.split.count > 0;
  const pierce = spec.propagation && spec.propagation.pierce > 0;
  const orbit = spec.propagation && spec.propagation.orbit && spec.propagation.orbit.count > 0;
  const payload = Array.isArray(spec.payload) ? spec.payload : [];
  let status = false;
  for (let i = 0; i < payload.length; i++) {
    if (payload[i] && payload[i].kind === 'status') status = true;
  }
  if (root) kinds.push('VOLLEY');
  if (bank) kinds.push('BANK');
  if (chain) kinds.push('CHAIN');
  if (split) kinds.push('SPLIT');
  if (pierce) kinds.push('PIERCE');
  if (orbit) kinds.push('ORBIT');
  if (status) kinds.push('STATUS');
  if (kinds.length === 0) kinds.push('DIRECT');
  return kinds;
}

function familyFromKindList(kinds) {
  if (!Array.isArray(kinds) || kinds.length === 0) return null;
  const upper = kinds.map((k) => String(k).toUpperCase());
  for (let i = 0; i < KIND_PRIORITY.length; i++) {
    if (upper.indexOf(KIND_PRIORITY[i]) >= 0) return mapCausalKindToFamily(KIND_PRIORITY[i]);
  }
  return mapCausalKindToFamily(upper[0]);
}

function readKindList(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const list = payload.causalTags || payload.causalKinds || payload.kinds || payload.tags;
  if (Array.isArray(list) && list.length) return list;
  if (typeof payload.causalKind === 'string') return [payload.causalKind];
  if (typeof payload.channel === 'string') return [payload.channel];
  if (payload.spec && typeof payload.spec === 'object') return causalKindsFromAttackSpec(payload.spec);
  return null;
}

function hasBankFlag(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.bank === true || payload.ricochet === true || payload.bounce === true) return true;
  if (payload.hasBounced === true) return true;
  const cause = payload.cause;
  return cause === 'bank' || cause === 'ricochet' || cause === 'deflect';
}

function hasChainFlag(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.chain === true || payload.hop === true) return true;
  const generation = Number(payload.generation);
  if (Number.isFinite(generation) && generation > 0) return true;
  const hops = Number(payload.hops || payload.chainHops);
  return Number.isFinite(hops) && hops > 0;
}

function isTerrainSurface(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.terrain === true || payload.terrain === 1) return true;
  const surface = payload.surface;
  return surface === 'terrain' || surface === 'world' || surface === 'asteroid';
}

function isFieldStatus(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.field === true) return true;
  const id = String(payload.statusId || payload.id || '');
  if (/gravity|field|mark|orbit|well/i.test(id)) return true;
  const channel = String(payload.channel || payload.causalKind || '');
  return channel.toUpperCase() === 'FIELD' || channel.toUpperCase() === 'ORBIT';
}

export function isHeroCausalEvent(eventName, payload) {
  const name = typeof eventName === 'string' ? eventName : '';
  if (name === 'entity:killed') return true;
  if (!payload || typeof payload !== 'object') return false;
  if (payload.hero === true || payload.boss === true) return true;
  const classId = String(payload.classId || payload.victimClass || payload.shipClass || '');
  return classId === 'capital' || /capital|boss|flagship/i.test(classId);
}

/**
 * Classify a live receipt into one of the eight families, or null.
 * This is the cueArbitration classifier body — extend here, do not fork.
 */
export function classifyCausalVfxFamily(eventName, payload) {
  const name = typeof eventName === 'string' ? eventName : '';
  const explicit = canonicalCausalFamily(
    payload && (payload.family || payload.cause || payload.causalFamily),
  );

  if (name === 'entity:killed') {
    return familyFromKindList(readKindList(payload)) || explicit || CAUSAL_VFX_FAMILIES.direct;
  }
  if (name === 'combat:collisionConsequence') {
    if (!payload || payload.control !== 'tumble') return null;
    return isTerrainSurface(payload) ? CAUSAL_VFX_FAMILIES.terrain : CAUSAL_VFX_FAMILIES.collision;
  }
  if (
    name === 'projectile:bank'
    || name === 'projectile:ricochet'
    || name === 'combat:bankShot'
  ) {
    return CAUSAL_VFX_FAMILIES.bank;
  }
  if (name === 'projectile:hit') {
    if (hasChainFlag(payload)) return CAUSAL_VFX_FAMILIES.chain;
    if (hasBankFlag(payload)) return CAUSAL_VFX_FAMILIES.bank;
    if (explicit && explicit !== 'direct') return explicit;
    return null;
  }
  if (
    name === 'tether:broken'
    || name === 'tether:broke'
    || name === 'tether:snapped'
    || name === 'tether:latched'
    || name === 'tether:attached'
  ) {
    return CAUSAL_VFX_FAMILIES.tether;
  }
  if (name === 'combat:statusApplied') {
    return isFieldStatus(payload) ? CAUSAL_VFX_FAMILIES.field : CAUSAL_VFX_FAMILIES.reaction;
  }
  if (name === 'presentation:vfxCue') {
    if (explicit) return explicit;
    return familyFromKindList(readKindList(payload));
  }
  if (payload && (
    payload.lane === 'vfx.arcade_structural'
    || payload.kind === 'vfx.arcade_structural'
  )) {
    if (explicit) return explicit;
    return familyFromKindList(readKindList(payload));
  }
  if (explicit) return explicit;
  return familyFromKindList(readKindList(payload));
}

export function resolveCausalVfxPresentation(family, options = {}) {
  const id = canonicalCausalFamily(family) || CAUSAL_VFX_FAMILIES.direct;
  const row = CAUSAL_VFX_GRAMMAR[id];
  const reduced = !!options.reduced;
  const forced = !!(options.forcedColors || options.forcedColors);
  const capital = !!options.capital;
  const hero = !!options.hero;
  const palette = forced ? FORCED_COLOUR_ROLES : INSTRUMENT_COLOUR_ROLES;
  const tone = palette[row.colourRole];
  let blades = reduced ? row.bladesReduced : row.blades;
  let arcs = reduced ? row.arcsReduced : row.arcs;
  let shards = reduced ? row.shardsReduced : row.shards;
  if (capital && id === 'direct' && !reduced) {
    blades = 12;
    arcs = 3;
    shards = 12;
  } else if (capital && id === 'direct' && reduced) {
    blades = 7;
    arcs = 2;
    shards = 7;
  }
  if (hero && !reduced) {
    if (blades > 0) blades += 1;
    if (shards > 0) shards += 1;
  }
  const intensity = hero ? 1.15 : (reduced ? 0.85 : 1);
  const lifeScale = reduced ? 0.62 : (row.layout === 'expand' ? 1.35 : (row.layout === 'reverse' ? 1.15 : 1));
  return Object.freeze({
    family: id,
    colourRole: row.colourRole,
    colour: tone.hex,
    endColour: tone.endHex,
    color: tone.hex,
    endColor: tone.endHex,
    silhouette: row.silhouette,
    motion: row.motion,
    sizeBand: row.sizeBand,
    layout: row.layout,
    signaturePrimitive: row.signaturePrimitive,
    blades,
    arcs,
    shards,
    audioCue: row.audioCue,
    phase: row.phase,
    reduced,
    forcedColors: forced,
    hero,
    intensity,
    lifeScale,
  });
}

export function nonColourDistinctions(familyA, familyB) {
  const a = CAUSAL_VFX_GRAMMAR[canonicalCausalFamily(familyA)];
  const b = CAUSAL_VFX_GRAMMAR[canonicalCausalFamily(familyB)];
  if (!a || !b) return [];
  const diffs = [];
  if (a.silhouette !== b.silhouette) diffs.push(`silhouette ${a.silhouette} vs ${b.silhouette}`);
  if (a.motion !== b.motion) diffs.push(`motion ${a.motion} vs ${b.motion}`);
  if (a.layout !== b.layout) diffs.push(`layout ${a.layout} vs ${b.layout}`);
  if (a.signaturePrimitive !== b.signaturePrimitive) {
    diffs.push(`signature ${a.signaturePrimitive} vs ${b.signaturePrimitive}`);
  }
  if (a.blades !== b.blades || a.arcs !== b.arcs || a.shards !== b.shards) {
    diffs.push(`mix ${a.blades}/${a.arcs}/${a.shards} vs ${b.blades}/${b.arcs}/${b.shards}`);
  }
  if (a.sizeBand !== b.sizeBand) diffs.push(`size ${a.sizeBand} vs ${b.sizeBand}`);
  return diffs;
}
