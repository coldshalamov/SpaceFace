// PQ-015 / SF-17 — Shared interaction descriptor catalog (PURE DATA + PURE HELPERS).
//
// ONE place that names, per interaction VERB, which entity TYPES are eligible, plus the reason-code
// vocabulary and the stable-key rules for component identity. This is the single membership truth
// the live gates consult so a rock-shaped object cannot advertise one identity while behaving as
// another — WITHOUT rewriting the working systems behind each gate.
//
// DESIGN CONTRACT (PQ-015 ruling 3, sharpened): the live gates source ONLY *type-membership* from
// this catalog. Each gate keeps its own downstream layering (range, ownership, obstruction,
// mined-out, site-anchored, mass-seed phase) and its own byte-identical reason strings exactly where
// they sit today. Folding a downstream gate into this membership set would change which candidates a
// gate gathers and silently break a rating path — do not do it.
//
// Pure: this module imports only sibling `src/data/*` vocabularies and never reads game state.

import { interactionProfileForEntity, interactionDisplayName, isUnstableReactorWreck } from './entityInteractionProfiles.js';

// ---------------------------------------------------------------------------------------------
// Interaction verbs. Each maps to exactly one live eligibility owner today (see VERB_OWNERS).
// ---------------------------------------------------------------------------------------------
export const INTERACTION_VERBS = Object.freeze({
  TARGET: 'target',     // weapon hard-lock cycle (src/ui/uiRoot.js cycleTarget)
  TETHER: 'tether',     // massline latch (src/systems/tetherGameplay.js isAttachable)
  MINE: 'mine',         // mining/salvage beam acquire (src/systems/mining.js _isValidMineableTarget)
  SALVAGE: 'salvage',   // wreck salvage action (src/data/salvageActions.js actionForWreck)
  DAMAGE: 'damage',     // weapon damage router membership (src/combat/damage.js)
  DOCK: 'dock',         // station docking (src/data/dockDeny.js dockDenyReason)
  CONTACT: 'contact',   // contacts strip / radar roster (src/ui/hud.js)
});

export const VERB_OWNERS = Object.freeze({
  target: 'src/ui/uiRoot.js cycleTarget',
  tether: 'src/systems/tetherGameplay.js isAttachable',
  mine: 'src/systems/mining.js _isValidMineableTarget',
  salvage: 'src/data/salvageActions.js actionForWreck + src/systems/salvageActions.js',
  damage: 'src/combat/damage.js routeDamage allowlist',
  dock: 'src/data/dockDeny.js dockDenyReason',
  contact: 'src/ui/hud.js contacts strip',
});

// ---------------------------------------------------------------------------------------------
// TYPE MEMBERSHIP — the single truth each live gate consults IN PLACE OF its literal type array.
// Each set is transcribed byte-for-byte from the gate it replaces (verified at base f85d54c8):
//   target   uiRoot.js:965          e.type !== 'ship' && e.type !== 'drone'
//   tether   — NOT an allowlist any more; see VERB_TYPE_DENYLIST below
//   mine     mining.js:160,187      type === 'asteroid' || type === 'wreck'
//   damage   damage.js:43           ['ship','station','drone','mine','massSeed']
//   salvage  scanner isWreckLike + salvageActions actionForWreck (wreck family)
//   dock     dockDeny/physics       station only
//   contact  hud.js:3050-3052       (ship|drone) OR wreck-like
// NOTE: 'contact' and 'salvage' wreck membership is resolved via isWreckLikeType + the wreck-like
// data predicate in the descriptor module (data.poiType/kind/salvage), not type alone.
// ---------------------------------------------------------------------------------------------
export const VERB_TYPE_MEMBERSHIP = Object.freeze({
  target: Object.freeze(new Set(['ship', 'drone'])),
  mine: Object.freeze(new Set(['asteroid', 'wreck'])),
  damage: Object.freeze(new Set(['ship', 'station', 'drone', 'mine', 'massSeed'])),
  salvage: Object.freeze(new Set(['wreck'])),
  dock: Object.freeze(new Set(['station'])),
  contact: Object.freeze(new Set(['ship', 'drone', 'wreck'])),
});

// ---------------------------------------------------------------------------------------------
// DENYLIST VERBS. A verb listed here is open to every entity type EXCEPT the named ones; it has no
// entry in VERB_TYPE_MEMBERSHIP, because an allowlist cannot express "everything the world grows".
//
// `tether` is the only such verb. Commit 4d00867e ("feat(controls): restore direct flight intent")
// inverted the Massline gate on purpose: `src/systems/tetherGameplay.js:1191-1204` now denies only
// TRANSIENT_NON_TETHERABLE_TYPES = {projectile, fx} (plus the massSeed frame-lock phase check and
// the data/flag `masslineTetherable` opt-in/opt-out, which are downstream conditions, not
// membership) under the header "Massline is a physical command, not a catalog verb. New
// world-object types do not need a separate eligibility-list edit before a player can deliberately
// attach to them."
//
// This column was left behind as the pre-4d00867e transcription and went stale: it omitted 'mine',
// so interactionEligibility answered WRONG_TYPE for a body the live latch attaches happily — a mine
// is damageable AND tetherable ("shoot it, or pick it up and throw it"), and the HUD showed no
// tether affordance for it. Adding 'mine' to the old set would have closed today's red and left the
// same trap armed for the next world noun, so the column is expressed the way the gate is instead.
// VERB_OWNERS.tether already names that gate as the owner of this verb; the catalog follows it.
// ---------------------------------------------------------------------------------------------
export const VERB_TYPE_DENYLIST = Object.freeze({
  tether: Object.freeze(new Set(['projectile', 'fx'])),
});

/**
 * True iff `type` is eligible for `verb` by bare type (no state, no data).
 * Denylist verbs accept anything not named; allowlist verbs accept only what is named. A verb in
 * neither table accepts nothing, which is the same answer an unknown verb got before.
 */
export function verbAcceptsType(verb, type) {
  const denied = VERB_TYPE_DENYLIST[verb];
  if (denied) return !denied.has(type);
  const set = VERB_TYPE_MEMBERSHIP[verb];
  return !!(set && set.has(type));
}

// ---------------------------------------------------------------------------------------------
// REASON CODES. Existing byte-pinned strings (produced by the untouched downstream gates) are
// listed for reference; the descriptor's OWN denial codes (kebab-case) are used only by NEW
// consumers (component selection, HUD denial surfacing) where no test/HUD pins a string yet.
// ---------------------------------------------------------------------------------------------
// Byte-pinned strings owned by existing gates (do NOT re-emit differently through an adapter):
export const PINNED_REASONS = Object.freeze({
  tether: Object.freeze(['target-lost', 'no-target', 'protected', 'out-of-range', 'blocked', 'cooldown', 'invalid-target', 'unknown_attachment_def', 'create_failed']),
  damage: Object.freeze(['target_missing', 'target_not_damageable', 'target_docked', 'target_invulnerable', 'friendly_fire', 'empty_packet']),
  dock: Object.freeze(['abandoned', 'under_construction', 'quarantine', 'hostile_rep', 'military_only', 'private']),
  site: Object.freeze(['unknown-machine', 'out-of-bounds', 'no-asteroid', 'no-session', 'not-hollow', 'occupied', 'rover-here', 'unique', 'rover-not-adjacent', 'needs-gas-contact', 'materials']),
});

// Descriptor-standard denial codes (kebab-case) for verbs that emit NO string today (mining,
// salvage, contact, target) and for component-level denials.
export const DENIAL = Object.freeze({
  OK: null,
  WRONG_TYPE: 'wrong-type',                     // type not in the verb's membership set
  NOT_ALIVE: 'not-alive',                        // entity dead / missing
  MINED_OUT: 'mined-out',                        // asteroid awaiting respawn (data.respawnAt)
  BEAM_LOCKED: 'beam-locked',                     // asteroid is a site anchor (data.siteAnchored)
  OUT_OF_RANGE: 'out-of-range',                   // beyond the verb's reach
  PHASE_INELIGIBLE: 'phase-ineligible',           // massSeed not yet frame-locked
  NOT_HOSTILE: 'not-hostile',                     // target verb requires a hostile contact
  PROTECTED: 'protected',                         // own/station structure
  COMPONENT_NOT_SERVICEABLE: 'component-not-serviceable', // component × verb mismatch
  NO_COMPONENT: 'no-component',                   // no such component on this entity
});

// ---------------------------------------------------------------------------------------------
// COMPONENT KINDS — the catalogued component families and which verb services each.
//   subsystem   combat subsystems (src/combat/runtime.js) — serviced by DAMAGE (weapon hit share)
//   weakpoint   wreck salvage weak-point/action (scanner + salvageActions) — serviced by SALVAGE
//   machine     asteroid-site machine (asteroidSites) — serviced by MINE/site (reflect only)
// ---------------------------------------------------------------------------------------------
export const COMPONENT_KINDS = Object.freeze({
  SUBSYSTEM: 'subsystem',
  WEAKPOINT: 'weakpoint',
  MACHINE: 'machine',
});

export const COMPONENT_KIND_VERB = Object.freeze({
  subsystem: 'damage',
  weakpoint: 'salvage',
  machine: 'mine',
});

// ---------------------------------------------------------------------------------------------
// STABLE ENTITY KEY — component identity keys as (stableEntityKey, componentId). NEVER bare
// entity.id (recycled + rematerialized). Follows the durable patterns catalogued in the survey:
// worldRecordId → salvage point id → site id → quantized asteroid formation key → transient id.
// ---------------------------------------------------------------------------------------------
export function stableEntityKey(entity) {
  if (!entity) return null;
  const d = entity.data || {};
  if (d.worldRecordId != null) return `wr:${d.worldRecordId}`;
  if (d.salvagePointId != null) return `sal:${d.salvagePointId}`;
  if (d.siteId != null) return `site:${d.siteId}`;
  if (entity.type === 'asteroid') {
    // Formation body key (asteroidFormations.js:87-91 tenth-grid quantize) so a rematerialized rock
    // with the same pose/typeId rebinds to the same component identity.
    const qx = Math.round(num(entity.pos && entity.pos.x) * 10) / 10;
    const qz = Math.round(num(entity.pos && entity.pos.z) * 10) / 10;
    const qr = Math.round(num(entity.radius) * 10) / 10;
    return `ast:${qx}|${qz}|${d.typeId || 'ast_common_rock'}|${qr}`;
  }
  return `id:${entity.id}`; // transient fallback (ships/drones/etc. — descriptors rebind on spawn)
}

// ---------------------------------------------------------------------------------------------
// Capability flags for a type, sourced from the presentation vocabulary (entityInteractionProfiles).
// Exposed so consumers read ONE capability truth. NOTE the known profile/gate asymmetries recorded
// in the PQ-015 contract table (e.g. profile.destructible for asteroid/payload ≠ damage membership;
// no massSeed/mine profile). Presentation capability != weapon-router damageability — kept distinct.
// ---------------------------------------------------------------------------------------------
export function capabilityFlagsForEntity(entity) {
  const p = interactionProfileForEntity(entity);
  return Object.freeze({
    kind: p.kind,
    mineable: !!p.mineable,
    drillable: !!p.drillable,
    salvageable: !!p.salvageable,
    beamExtractable: !!p.beamExtractable,
    tetherable: !!p.tetherable,
    destructible: !!p.destructible,
    hazardous: !!p.hazardous,
    beamVerb: p.beamVerb || null,
  });
}

export { interactionDisplayName, isUnstableReactorWreck };

function num(v) { return Number.isFinite(v) ? v : 0; }

export default {
  INTERACTION_VERBS,
  VERB_OWNERS,
  VERB_TYPE_MEMBERSHIP,
  VERB_TYPE_DENYLIST,
  verbAcceptsType,
  PINNED_REASONS,
  DENIAL,
  COMPONENT_KINDS,
  COMPONENT_KIND_VERB,
  stableEntityKey,
  capabilityFlagsForEntity,
};
