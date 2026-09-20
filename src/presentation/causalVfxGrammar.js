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

// ---------------------------------------------------------------------------------------------
// IMPACT GRAMMAR — the contact layer.
//
// The eight causal families above answer "how did this happen?". The impact grammar below answers
// "what did the matter do?". They are separate questions: a kill by collision and a kill by a
// carried charge share a causal family but must not share a silhouette.
//
// The governing rule of this layer is that a bullet strike, a heavy slam, a rock fracture and a
// capital breakup are DIFFERENT EVENTS, not one explosion at four sizes. The difference is carried
// by which beats exist, in what order, made of which primitive — never by a size multiplier.
// ---------------------------------------------------------------------------------------------

/** Material identities a struck surface can carry. The id selects a failure STRUCTURE. */
export const IMPACT_MATERIALS = Object.freeze({
  hull: 'hull',
  armor: 'armor',
  rock: 'rock',
  ice: 'ice',
  ceramic: 'ceramic',
  composite: 'composite',
  shield: 'shield',
  unknown: 'unknown',
});

const IMPACT_MATERIAL_ALIASES = Object.freeze({
  ship: 'hull', metal: 'hull', steel: 'hull',
  plate: 'armor', plating: 'armor',
  asteroid: 'rock', stone: 'rock', ore: 'rock', terrain: 'rock', world: 'rock',
  comet: 'ice', volatile: 'ice',
  glass: 'ceramic', crystal: 'ceramic',
  panel: 'composite', laminate: 'composite',
  barrier: 'shield', field: 'shield',
});

/** Normalize any receipt-supplied surface word onto a known material id. Never throws. */
export function normalizeImpactMaterial(value) {
  if (typeof value !== 'string' || value.length === 0) return IMPACT_MATERIALS.unknown;
  const lower = value.toLowerCase();
  if (IMPACT_MATERIALS[lower]) return lower;
  return IMPACT_MATERIAL_ALIASES[lower] || IMPACT_MATERIALS.unknown;
}

/** The eight authored event classes. See `src/render/combat/impactEventRecord.js` for the ladder. */
export const IMPACT_EVENT_CLASSES = Object.freeze([
  'graze', 'pinprick', 'cut', 'slam', 'breach', 'fracture', 'detonation', 'breakup',
]);

/**
 * Per-material physical behaviour. `interiorHeat` is what the material exposes when it is opened —
 * a pressurized hull shows a hot inside, a rock shows more rock. `cleaves` means the surface fails
 * along planes rather than tearing. `plates` means it separates as sheets.
 */
export const IMPACT_MATERIAL_GRAMMAR = Object.freeze({
  hull: Object.freeze({
    id: 'hull', interiorHeat: 0.95, cleaves: false, plates: true, springback: 0.55,
    hot: 0xffe2b0, warm: 0xff8a3c, cold: 0x6c7480, dust: 0x2b2a28, body: 0x9aa4ae,
    spallScale: 1, dragScale: 1, audioCue: 'combat.impact.hull',
  }),
  armor: Object.freeze({
    id: 'armor', interiorHeat: 0.35, cleaves: false, plates: true, springback: 0.25,
    hot: 0xfff2d6, warm: 0xd8be8a, cold: 0x565f68, dust: 0x3a3733, body: 0x808a92,
    spallScale: 1.35, dragScale: 1.15, audioCue: 'combat.impact.armor',
  }),
  rock: Object.freeze({
    id: 'rock', interiorHeat: 0, cleaves: true, plates: true, springback: 0,
    hot: 0xffd9a0, warm: 0xc9ac86, cold: 0x7d7264, dust: 0xa2917a, body: 0x8d8272,
    spallScale: 1.1, dragScale: 1.5, audioCue: 'combat.impact.rock',
  }),
  ice: Object.freeze({
    id: 'ice', interiorHeat: 0, cleaves: true, plates: false, springback: 0,
    hot: 0xffffff, warm: 0xd8f0ff, cold: 0x8fb6cc, dust: 0xdfeef7, body: 0xbcdcea,
    spallScale: 1.5, dragScale: 1.9, audioCue: 'combat.impact.ice',
  }),
  ceramic: Object.freeze({
    id: 'ceramic', interiorHeat: 0.1, cleaves: true, plates: false, springback: 0,
    hot: 0xfff6e2, warm: 0xe6d9c2, cold: 0x9a9186, dust: 0xd6cbb8, body: 0xcfc6b6,
    spallScale: 1.7, dragScale: 2.1, audioCue: 'combat.impact.ceramic',
  }),
  composite: Object.freeze({
    id: 'composite', interiorHeat: 0.45, cleaves: false, plates: true, springback: 0.7,
    hot: 0xffd7a8, warm: 0xc08a54, cold: 0x4e4a46, dust: 0x554e46, body: 0x7b736a,
    spallScale: 0.8, dragScale: 1.25, audioCue: 'combat.impact.composite',
  }),
  shield: Object.freeze({
    id: 'shield', interiorHeat: 0, cleaves: false, plates: false, springback: 1,
    hot: 0xbdefff, warm: 0x5ec8ff, cold: 0x2a5f80, dust: 0x2a5f80, body: 0x8fd8ff,
    spallScale: 0, dragScale: 1, audioCue: 'combat.impact.shield',
  }),
  unknown: Object.freeze({
    id: 'unknown', interiorHeat: 0.4, cleaves: false, plates: false, springback: 0.4,
    hot: 0xffe6c0, warm: 0xd09a60, cold: 0x6a7078, dust: 0x4a4740, body: 0x909090,
    spallScale: 1, dragScale: 1, audioCue: 'combat.impact.generic',
  }),
});

function impactBeat(row) { return Object.freeze(row); }

/**
 * Layouts that are meaningless without a real outward side. Keeping this as a property of the
 * LAYOUT, not of a per-beat flag, is deliberate: a flag can be forgotten when a sheet is edited,
 * and forgetting it silently turns an unsigned collision axis into an aimed force (rule E2).
 */
const SIGNED_ONLY_LAYOUTS = Object.freeze({ 'reflected-cone': 1, 'internal-vent': 1 });

/**
 * What a signed-only layout becomes on an unsigned axis.
 *
 * `reflected-cone` becomes the mirrored lip: no outward side, so the contact spreads both ways.
 *
 * `internal-vent` becomes `core-release`. A centred event has no outward SIDE, but it does have a
 * CENTRE, and a charge going off is exactly that: the release comes from inside and leaves in every
 * direction. Dropping the beat instead would hollow out the only class that depends on it — a
 * detonation with its two internal stages removed is just a slam with a different name, and a
 * detonation almost never has a signed normal, because a charge is not something that struck a
 * surface. `core-release` is radial about the body axis, so it is still invariant under a flip.
 */
const UNSIGNED_LAYOUT_FALLBACK = Object.freeze({
  'reflected-cone': 'mirrored-lip',
  'internal-vent': 'core-release',
});

/**
 * The beat sheets. Each entry is ordered by `at` (seconds after contact).
 *
 * `layout` is the pose family the render side must honour:
 *   reflected-cone    one-sided, aimed away from the struck surface. SIGNED AXIS ONLY.
 *   internal-vent     narrow, out of the opened hole, hot. SIGNED AXIS ONLY.
 *   mirrored-lip      two opposed in-plane lips. Legal on an unsigned axis.
 *   tangent-skid      along the surface, both ways. Legal on an unsigned axis.
 *   cleavage-fan      straight planes radiating on brittle cleavage angles.
 *   worked-face       directed back off a face being cut, plus two cutting lobes.
 *   plate-separation  sheets parting along the body axis, exposing what is between them.
 *   settle            the cooling aftermath: slow, wide, dim, no new energy.
 *
 * `signedOnly: true` drops the beat entirely when the record carries an unsigned collision axis,
 * rather than inventing a direction for it (standard rule E2).
 */
export const IMPACT_EVENT_GRAMMAR = Object.freeze({
  // A glance. Nothing opens; the striker skids and leaves.
  graze: Object.freeze({
    id: 'graze', duration: 0.24, exposesInterior: false, audioCue: 'combat.impact.graze',
    beats: Object.freeze([
      impactBeat({ role: 'contact', at: 0, primitive: 'blade', count: 2, reduced: 1, layout: 'tangent-skid', spread: 0.18, speed: 0, life: 0.10, size: 0.55, tone: 'hot' }),
      impactBeat({ role: 'ejecta', at: 0.02, primitive: 'shard', count: 3, reduced: 1, layout: 'tangent-skid', spread: 0.30, speed: 30, life: 0.20, size: 0.10, tone: 'warm' }),
    ]),
  }),
  // Something small arrived fast. A pinpoint beat and a narrow spall fan; no bloom, no smoke ball.
  pinprick: Object.freeze({
    id: 'pinprick', duration: 0.30, exposesInterior: false, audioCue: 'combat.impact.pinprick',
    beats: Object.freeze([
      impactBeat({ role: 'contact', at: 0, primitive: 'blade', count: 1, reduced: 1, layout: 'reflected-cone', spread: 0, speed: 0, life: 0.07, size: 0.42, tone: 'hot', signedOnly: true }),
      impactBeat({ role: 'ejecta', at: 0.012, primitive: 'shard', count: 5, reduced: 2, layout: 'reflected-cone', spread: 0.30, speed: 38, life: 0.24, size: 0.09, tone: 'hot', signedOnly: true }),
      impactBeat({ role: 'aftermath', at: 0.09, primitive: 'arc', count: 1, reduced: 1, layout: 'settle', spread: 0, speed: 0, life: 0.17, size: 0.5, tone: 'cold' }),
    ]),
  }),
  // A face being worked. No ignition anywhere in this sheet — the heat is the cut, not a fire.
  cut: Object.freeze({
    id: 'cut', duration: 0.52, exposesInterior: false, audioCue: 'combat.impact.cut',
    beats: Object.freeze([
      impactBeat({ role: 'contact', at: 0, primitive: 'blade', count: 2, reduced: 1, layout: 'worked-face', spread: 0.62, speed: 0, life: 0.13, size: 0.34, tone: 'warm' }),
      impactBeat({ role: 'ejecta', at: 0.03, primitive: 'shard', count: 6, reduced: 2, layout: 'worked-face', spread: 0.55, speed: 22, life: 0.40, size: 0.10, tone: 'cold' }),
      impactBeat({ role: 'cleavage', at: 0.06, primitive: 'arc', count: 2, reduced: 1, layout: 'cleavage-fan', spread: 0.9, speed: 0, life: 0.22, size: 0.45, tone: 'dust' }),
      impactBeat({ role: 'ejecta', at: 0.16, primitive: 'shard', count: 4, reduced: 1, layout: 'worked-face', spread: 0.8, speed: 13, life: 0.34, size: 0.08, tone: 'dust' }),
    ]),
  }),
  // Two bodies met. It compresses before it throws anything: the lip spreads ALONG the surface and
  // stops hard, then the shear tears, then the heavy matter finally leaves.
  slam: Object.freeze({
    id: 'slam', duration: 0.78, exposesInterior: false, audioCue: 'combat.impact.slam',
    beats: Object.freeze([
      impactBeat({ role: 'compression', at: 0, primitive: 'arc', count: 2, reduced: 1, layout: 'mirrored-lip', spread: 0, speed: 0, life: 0.12, size: 1.05, tone: 'warm' }),
      impactBeat({ role: 'shear', at: 0.09, primitive: 'blade', count: 4, reduced: 2, layout: 'mirrored-lip', spread: 0.34, speed: 6, life: 0.20, size: 0.72, tone: 'hot' }),
      impactBeat({ role: 'ejecta', at: 0.18, primitive: 'shard', count: 8, reduced: 3, layout: 'mirrored-lip', spread: 0.75, speed: 16, life: 0.52, size: 0.15, tone: 'cold' }),
      impactBeat({ role: 'separation', at: 0.26, primitive: 'plate', count: 2, reduced: 1, layout: 'mirrored-lip', spread: 0.5, speed: 9, life: 0.46, size: 0.52, tone: 'metal' }),
      impactBeat({ role: 'aftermath', at: 0.42, primitive: 'arc', count: 1, reduced: 1, layout: 'settle', spread: 0, speed: 0, life: 0.30, size: 1.3, tone: 'cold' }),
    ]),
  }),
  // A hole is opened. The event's subject is the hole: hot interior vents out of it and a torn flap
  // stays attached to the rim.
  breach: Object.freeze({
    id: 'breach', duration: 0.94, exposesInterior: true, audioCue: 'combat.impact.breach',
    beats: Object.freeze([
      impactBeat({ role: 'contact', at: 0, primitive: 'blade', count: 2, reduced: 1, layout: 'reflected-cone', spread: 0.22, speed: 0, life: 0.09, size: 0.6, tone: 'hot', signedOnly: true }),
      impactBeat({ role: 'ejecta', at: 0.04, primitive: 'shard', count: 7, reduced: 3, layout: 'reflected-cone', spread: 0.52, speed: 30, life: 0.42, size: 0.12, tone: 'warm', signedOnly: true }),
      impactBeat({ role: 'internal', at: 0.05, primitive: 'blade', count: 3, reduced: 1, layout: 'internal-vent', spread: 0.16, speed: 4, life: 0.34, size: 0.85, tone: 'hot', signedOnly: true }),
      impactBeat({ role: 'separation', at: 0.14, primitive: 'plate', count: 1, reduced: 1, layout: 'reflected-cone', spread: 0.2, speed: 5, life: 0.5, size: 0.45, tone: 'metal' }),
      impactBeat({ role: 'aftermath', at: 0.34, primitive: 'arc', count: 2, reduced: 1, layout: 'settle', spread: 0.4, speed: 0, life: 0.42, size: 0.95, tone: 'warm' }),
    ]),
  }),
  // Brittle failure. The planes open in sequence, not at once — that sequence is the whole point.
  fracture: Object.freeze({
    id: 'fracture', duration: 0.86, exposesInterior: false, audioCue: 'combat.impact.fracture',
    beats: Object.freeze([
      impactBeat({ role: 'cleavage', at: 0, primitive: 'blade', count: 1, reduced: 1, layout: 'cleavage-fan', spread: 0, speed: 0, life: 0.16, size: 0.9, tone: 'warm' }),
      impactBeat({ role: 'cleavage', at: 0.05, primitive: 'blade', count: 1, reduced: 0, layout: 'cleavage-fan', spread: 0.7, speed: 0, life: 0.18, size: 1.05, tone: 'cold' }),
      impactBeat({ role: 'ejecta', at: 0.08, primitive: 'shard', count: 8, reduced: 3, layout: 'cleavage-fan', spread: 1.1, speed: 19, life: 0.55, size: 0.14, tone: 'cold' }),
      impactBeat({ role: 'cleavage', at: 0.11, primitive: 'blade', count: 2, reduced: 1, layout: 'cleavage-fan', spread: 1.3, speed: 0, life: 0.20, size: 0.8, tone: 'dust' }),
      impactBeat({ role: 'cleavage', at: 0.19, primitive: 'blade', count: 2, reduced: 0, layout: 'cleavage-fan', spread: 2.1, speed: 0, life: 0.22, size: 0.62, tone: 'dust' }),
      impactBeat({ role: 'separation', at: 0.22, primitive: 'plate', count: 2, reduced: 1, layout: 'cleavage-fan', spread: 1.5, speed: 11, life: 0.54, size: 0.6, tone: 'cold' }),
      impactBeat({ role: 'aftermath', at: 0.40, primitive: 'arc', count: 1, reduced: 1, layout: 'settle', spread: 0, speed: 0, life: 0.40, size: 1.5, tone: 'dust' }),
    ]),
  }),
  // A carried charge releases. Two internal stages, so the energy arrives in steps rather than as
  // one flat bloom.
  detonation: Object.freeze({
    id: 'detonation', duration: 1.18, exposesInterior: true, audioCue: 'combat.impact.detonation',
    beats: Object.freeze([
      impactBeat({ role: 'contact', at: 0, primitive: 'blade', count: 3, reduced: 1, layout: 'reflected-cone', spread: 0.45, speed: 0, life: 0.11, size: 0.75, tone: 'hot' }),
      impactBeat({ role: 'internal', at: 0.045, primitive: 'blade', count: 4, reduced: 2, layout: 'internal-vent', spread: 0.5, speed: 8, life: 0.28, size: 1.0, tone: 'hot' }),
      impactBeat({ role: 'ejecta', at: 0.09, primitive: 'shard', count: 10, reduced: 4, layout: 'reflected-cone', spread: 1.0, speed: 34, life: 0.6, size: 0.14, tone: 'warm' }),
      impactBeat({ role: 'internal', at: 0.13, primitive: 'blade', count: 3, reduced: 1, layout: 'internal-vent', spread: 0.9, speed: 5, life: 0.36, size: 1.25, tone: 'warm' }),
      impactBeat({ role: 'separation', at: 0.20, primitive: 'plate', count: 2, reduced: 1, layout: 'reflected-cone', spread: 0.8, speed: 14, life: 0.62, size: 0.62, tone: 'metal' }),
      impactBeat({ role: 'aftermath', at: 0.50, primitive: 'arc', count: 3, reduced: 1, layout: 'settle', spread: 1.2, speed: 0, life: 0.5, size: 1.4, tone: 'cold' }),
    ]),
  }),
  // The largest supported destruction. The FIRST thing that happens is the structure parting —
  // never a white ball. Plates open, the hot interior shows between them, more plates follow.
  breakup: Object.freeze({
    id: 'breakup', duration: 2.3, exposesInterior: true, audioCue: 'combat.impact.breakup',
    beats: Object.freeze([
      impactBeat({ role: 'separation', at: 0, primitive: 'plate', count: 3, reduced: 1, layout: 'plate-separation', spread: 0.35, speed: 10, life: 0.9, size: 0.78, tone: 'metal' }),
      impactBeat({ role: 'internal', at: 0.10, primitive: 'blade', count: 4, reduced: 2, layout: 'internal-vent', spread: 0.6, speed: 7, life: 0.44, size: 1.1, tone: 'hot' }),
      impactBeat({ role: 'ejecta', at: 0.22, primitive: 'shard', count: 12, reduced: 4, layout: 'plate-separation', spread: 1.4, speed: 26, life: 0.95, size: 0.17, tone: 'warm' }),
      impactBeat({ role: 'separation', at: 0.30, primitive: 'plate', count: 3, reduced: 1, layout: 'plate-separation', spread: 1.1, speed: 13, life: 1.0, size: 0.66, tone: 'metal' }),
      impactBeat({ role: 'internal', at: 0.55, primitive: 'blade', count: 3, reduced: 1, layout: 'internal-vent', spread: 1.5, speed: 5, life: 0.55, size: 1.35, tone: 'warm' }),
      impactBeat({ role: 'separation', at: 0.80, primitive: 'plate', count: 2, reduced: 1, layout: 'plate-separation', spread: 2.0, speed: 8, life: 1.1, size: 0.5, tone: 'cold' }),
      impactBeat({ role: 'aftermath', at: 1.10, primitive: 'arc', count: 3, reduced: 1, layout: 'settle', spread: 1.6, speed: 0, life: 0.8, size: 1.8, tone: 'cold' }),
    ]),
  }),
});

const IMPACT_TONE_KEYS = Object.freeze({
  hot: 'hot', warm: 'warm', cold: 'cold', dust: 'dust', metal: 'body',
});

const IMPACT_TONE_END = Object.freeze({
  hot: 'warm', warm: 'cold', cold: 'dust', dust: 'dust', metal: 'cold',
});

const IMPACT_FORCED_TONE_ROLE = Object.freeze({
  hot: 'foe', warm: 'goal', cold: 'calm', dust: 'paper', metal: 'calm',
});

/**
 * Resolve one impact record into a concrete, ordered beat list the render side can spawn.
 *
 * @param {object} rec an impact record (see `src/render/combat/impactEventRecord.js`). Read-only.
 * @param {object} [options] `{ reduced, forcedColors, hero }`
 * @returns {object} `{ eventClass, materialId, duration, exposesInterior, audioCue, beats: [...] }`
 *   where each beat is `{ role, at, primitive, count, layout, spread, speed, life, size,
 *   colour, endColour, drag, spall, signedOnly }`. `count` is already reduced-motion resolved and
 *   `signedOnly` beats are already dropped for an unsigned axis.
 */
export function resolveImpactPresentation(rec, options = {}) {
  const source = rec || {};
  const eventClass = IMPACT_EVENT_GRAMMAR[source.eventClass] ? source.eventClass : 'pinprick';
  const sheet = IMPACT_EVENT_GRAMMAR[eventClass];
  const materialId = normalizeImpactMaterial(source.materialId);
  const material = IMPACT_MATERIAL_GRAMMAR[materialId];
  const reduced = !!options.reduced;
  const forced = !!options.forcedColors;
  const hero = !!options.hero;
  const axisSigned = source.axisSigned === true;
  const severity = Math.max(0, Math.min(1, Number(source.severity) || 0));
  const beats = [];
  for (let i = 0; i < sheet.beats.length; i++) {
    const row = sheet.beats[i];
    // E2: on an unsigned collision axis nothing may be aimed. A beat marked signedOnly is dropped
    // outright; a beat that merely USES a one-sided layout falls back to the symmetric form, or is
    // dropped when it has none. Nothing is ever re-aimed at a fabricated direction.
    let layout = row.layout;
    if (!axisSigned) {
      if (row.signedOnly) continue;
      if (SIGNED_ONLY_LAYOUTS[layout]) {
        layout = UNSIGNED_LAYOUT_FALLBACK[layout];
        if (!layout) continue;
      }
    }
    let count = reduced ? row.reduced : row.count;
    if (count <= 0) continue;
    // A shield contact has no matter to throw; the field absorbs. Solids drop, light does not.
    if (material.spallScale <= 0 && (row.primitive === 'shard' || row.primitive === 'plate')) continue;
    if (row.primitive === 'plate' && !material.plates) continue;
    if (hero && !reduced && (row.primitive === 'shard' || row.primitive === 'plate')) count += 1;
    // Severity may thin a beat; it may never invent one. The sheet decides which beats exist.
    if (severity < 0.14 && row.role === 'aftermath' && !reduced) count = Math.max(1, count - 1);
    const startKey = IMPACT_TONE_KEYS[row.tone] || 'warm';
    const endKey = IMPACT_TONE_KEYS[IMPACT_TONE_END[row.tone] || 'cold'] || 'cold';
    let colour = material[startKey];
    let endColour = material[endKey];
    if (row.role === 'internal' && material.interiorHeat < 0.2) {
      // Interior heat is a material property: opening a rock does not reveal a furnace.
      colour = material.warm;
      endColour = material.dust;
    }
    if (forced) {
      const role = IMPACT_FORCED_TONE_ROLE[row.tone] || 'calm';
      colour = FORCED_COLOUR_ROLES[role].hex;
      endColour = FORCED_COLOUR_ROLES[role].endHex;
    }
    beats.push({
      role: row.role,
      at: row.at,
      primitive: row.primitive,
      count,
      layout,
      spread: row.spread,
      speed: row.speed * (reduced ? 0.6 : 1),
      life: row.life * (reduced ? 1.18 : 1),
      size: row.size,
      colour,
      endColour,
      drag: (row.primitive === 'shard' ? 1.4 : 3.5) * material.dragScale,
      spall: material.spallScale,
      signedOnly: !!row.signedOnly,
    });
  }
  // If E2 dropped every structural beat (a one-sided sheet asked for on an unsigned axis), the
  // contact still happened and still has to read. The replacement is an axis-SYMMETRIC lip, which
  // is invariant under a normal flip — not the dropped one-sided beat pointed somewhere.
  const structural = beats.some((row) => row.role !== 'aftermath' && row.role !== 'ejecta');
  if (!structural) {
    const lip = IMPACT_EVENT_GRAMMAR.slam.beats[0];
    beats.unshift({
      role: 'compression',
      at: 0,
      primitive: lip.primitive,
      count: reduced ? lip.reduced : lip.count,
      layout: 'mirrored-lip',
      spread: lip.spread,
      speed: 0,
      life: lip.life * (reduced ? 1.18 : 1),
      size: lip.size * 0.7,
      colour: forced ? FORCED_COLOUR_ROLES.goal.hex : material.warm,
      endColour: forced ? FORCED_COLOUR_ROLES.goal.endHex : material.cold,
      drag: 3.5 * material.dragScale,
      spall: material.spallScale,
      signedOnly: false,
    });
  }
  return {
    eventClass,
    materialId,
    duration: sheet.duration * (reduced ? 1.1 : 1),
    exposesInterior: sheet.exposesInterior,
    audioCue: sheet.audioCue,
    materialAudioCue: material.audioCue,
    axisSigned,
    severity,
    reduced,
    forcedColors: forced,
    hero,
    beats,
  };
}

/** Non-colour differences between two impact classes, for review and for the focused test. */
export function impactClassDistinctions(classA, classB) {
  const a = IMPACT_EVENT_GRAMMAR[classA];
  const b = IMPACT_EVENT_GRAMMAR[classB];
  if (!a || !b) return [];
  const diffs = [];
  const rolesA = a.beats.map((row) => row.role).join('>');
  const rolesB = b.beats.map((row) => row.role).join('>');
  if (rolesA !== rolesB) diffs.push(`order ${rolesA} vs ${rolesB}`);
  const layoutsA = [...new Set(a.beats.map((row) => row.layout))].sort().join('+');
  const layoutsB = [...new Set(b.beats.map((row) => row.layout))].sort().join('+');
  if (layoutsA !== layoutsB) diffs.push(`layout ${layoutsA} vs ${layoutsB}`);
  const mixA = [...new Set(a.beats.map((row) => row.primitive))].sort().join('+');
  const mixB = [...new Set(b.beats.map((row) => row.primitive))].sort().join('+');
  if (mixA !== mixB) diffs.push(`mix ${mixA} vs ${mixB}`);
  if (a.duration !== b.duration) diffs.push(`duration ${a.duration} vs ${b.duration}`);
  if (a.exposesInterior !== b.exposesInterior) {
    diffs.push(`interior ${a.exposesInterior} vs ${b.exposesInterior}`);
  }
  if (a.beats.length !== b.beats.length) diffs.push(`beats ${a.beats.length} vs ${b.beats.length}`);
  return diffs;
}
