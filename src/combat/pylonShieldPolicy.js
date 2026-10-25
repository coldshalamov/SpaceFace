// Linked Shield Pylons — who the panel stops (packet 06 permission matrix), as pure data + rules.
//
// The panel is RELATION-SELECTIVE, not a one-way wall: the player and permitted allies cross it in
// either direction; hostile hulls and hostile attacks stop at the first real intersection from either
// side. This module is the single statement of that table. It does not read game state: callers hand
// it a resolved `relation` (see `resolveRelation`) and the kind of contact.
//
// Hostility is NEVER inferred from team-number inequality here. The relation oracle (the engine's
// own `isHostileForAI`, src/ai/engagementAuthority.js) is injected by the query layer so this file
// stays a leaf.
//
// What the panel does NOT claim to resist (declared, not silent):
//   * persistent force fields (a hostile gravity well or repulsor field bends bodies and rounds
//     around the wall without being stopped by it) — `field` passes everything;
//   * drifting ordnance and placed devices (drift bombs, mines) — they are placed bodies, not
//     projectiles; a blast they cause is still occluded by the panel along the blast path;
//   * pickups (cargo canisters/ore): collectible items, not debris threats — recovery behind the
//     wall stays possible.

/** How a contact reaches the wall. */
export const PYLON_CONTACT = Object.freeze({
  SHIP: 'ship',             // a hull (ship/drone) pushing into the footprint
  PROJECTILE: 'projectile', // a swept round/missile
  BEAM: 'beam',             // a hitscan ray
  BLAST: 'blast',           // the path from an explosion centre to a body
  CHAIN: 'chain',           // an arc/chain hop between two bodies
  DEBRIS: 'debris',         // a loose neutral body (rock, wreck, payload)
  FIELD: 'field',           // a persistent force field acting through the wall
});

/** Relation of the subject (the body, or the attack's source) to the panel's owner. */
export const PYLON_RELATION = Object.freeze({
  OWNER: 'owner',       // the deploying pilot / their own lineage
  ALLY: 'ally',         // permitted ally: same side, not hostile (wingmen)
  NEUTRAL: 'neutral',   // not hostile to the owner, not on the owner's side (civilian traffic)
  HOSTILE: 'hostile',   // the engine says it is hostile to the owner
  ATTUNED: 'attuned',   // a payload under the owner's actual control (Gyre mass, tether target)
  UNKNOWN: 'unknown',   // no resolvable source (an unowned hazard): fails closed
});

const R = PYLON_RELATION;
const C = PYLON_CONTACT;

/** true = the panel BLOCKS this relation for this kind of contact. */
export const PYLON_PERMISSION = Object.freeze({
  [C.SHIP]:       Object.freeze({ [R.OWNER]: false, [R.ALLY]: false, [R.NEUTRAL]: false, [R.HOSTILE]: true,  [R.ATTUNED]: false, [R.UNKNOWN]: true }),
  [C.PROJECTILE]: Object.freeze({ [R.OWNER]: false, [R.ALLY]: false, [R.NEUTRAL]: false, [R.HOSTILE]: true,  [R.ATTUNED]: false, [R.UNKNOWN]: true }),
  [C.BEAM]:       Object.freeze({ [R.OWNER]: false, [R.ALLY]: false, [R.NEUTRAL]: false, [R.HOSTILE]: true,  [R.ATTUNED]: false, [R.UNKNOWN]: true }),
  [C.BLAST]:      Object.freeze({ [R.OWNER]: false, [R.ALLY]: false, [R.NEUTRAL]: false, [R.HOSTILE]: true,  [R.ATTUNED]: false, [R.UNKNOWN]: true }),
  [C.CHAIN]:      Object.freeze({ [R.OWNER]: false, [R.ALLY]: false, [R.NEUTRAL]: false, [R.HOSTILE]: true,  [R.ATTUNED]: false, [R.UNKNOWN]: true }),
  // Loose neutral debris is blocked from either side; ONLY an owner-attuned payload passes.
  [C.DEBRIS]:     Object.freeze({ [R.OWNER]: true,  [R.ALLY]: true,  [R.NEUTRAL]: true,  [R.HOSTILE]: true,  [R.ATTUNED]: false, [R.UNKNOWN]: true }),
  [C.FIELD]:      Object.freeze({ [R.OWNER]: false, [R.ALLY]: false, [R.NEUTRAL]: false, [R.HOSTILE]: false, [R.ATTUNED]: false, [R.UNKNOWN]: false }),
});

/** Does an active panel block this contact kind from a subject with this relation? */
export function blocksContact(kind, relation) {
  const row = PYLON_PERMISSION[kind];
  if (!row) return true; // unknown contact kinds fail closed
  const verdict = row[relation];
  return verdict === undefined ? true : verdict;
}

/** Entity types that are hulls (the ship row of the matrix). */
const CRAFT_TYPES = new Set(['ship', 'drone']);
/** Entity types that are loose, movable, neutral bodies (the debris row). */
const DEBRIS_TYPES = new Set(['asteroid', 'wreck', 'payload']);
/** Entity types the panel never interferes with (declared exceptions above). */
const EXEMPT_TYPES = new Set(['pickup', 'projectile', 'bomb', 'mine', 'fieldEmitter', 'massSeed', 'fx', 'planet', 'station']);

/** 'craft' (the ship row), 'debris' (the debris row) or 'exempt' (the panel ignores it). */
export function classifyBody(entity) {
  if (!entity) return 'exempt';
  const type = entity.type;
  if (CRAFT_TYPES.has(type)) return 'craft';
  if (EXEMPT_TYPES.has(type)) return 'exempt';
  if (DEBRIS_TYPES.has(type)) return 'debris';
  return 'exempt';
}

/**
 * Resolve the subject's relation to the panel owner.
 *   ctx.owner       the owner entity (or null when it is gone)
 *   ctx.isHostile   (owner, subject) => boolean — the engine's hostility oracle
 *   ctx.isAttuned   (subject) => boolean — owner-controlled payload fact (optional)
 * A subject with no identity is UNKNOWN (fails closed). The owner's own lineage is OWNER.
 */
export function resolveRelation(subject, ctx) {
  if (!subject) return R.UNKNOWN;
  const owner = ctx && ctx.owner;
  if (!owner) return R.UNKNOWN;
  if (subject.id === owner.id) return R.OWNER;
  if (ctx.isAttuned && ctx.isAttuned(subject)) return R.ATTUNED;
  if (ctx.isHostile && ctx.isHostile(owner, subject)) return R.HOSTILE;
  if (subject.team != null && owner.team != null && subject.team === owner.team) return R.ALLY;
  return R.NEUTRAL;
}

/**
 * Shield points a contact costs the pair. Callers hand physical facts; the table here turns them
 * into the ONE resource the pair debits (SP). Never below `minContactEnergy`.
 *   projectile/beam/chain: info.damage (summed damage of the packet / the tick's beam damage)
 *   blast:                 info.damage, else info.baseImpulse scaled by def.blastEnergyFromImpulse
 *   ship/debris:           0.5 * mass * dv^2 / def.shipEnergyDiv (dv = inbound speed removed)
 */
export function contactEnergy(kind, info, def) {
  const minE = def && Number.isFinite(def.minContactEnergy) ? def.minContactEnergy : 1;
  let e = 0;
  switch (kind) {
    case C.SHIP:
    case C.DEBRIS: {
      const m = Math.max(0, Number(info && info.mass) || 0);
      const dv = Math.max(0, Number(info && info.dv) || 0);
      const div = def && def.shipEnergyDiv > 0 ? def.shipEnergyDiv : 250;
      e = 0.5 * m * dv * dv / div;
      break;
    }
    case C.BLAST: {
      const damage = Number(info && info.damage);
      if (Number.isFinite(damage) && damage > 0) e = damage;
      else e = Math.max(0, Number(info && info.baseImpulse) || 0) * (def && def.blastEnergyFromImpulse > 0 ? def.blastEnergyFromImpulse : 0.02);
      break;
    }
    default:
      e = Math.max(0, Number(info && info.damage) || 0);
  }
  return e < minE ? minE : e;
}
