// PQ-015 / SF-17 — Shared interaction descriptors (PURE QUERY MODULE — NOT a registered system).
//
// The rich, state-aware side of the descriptor contract. Exports pure query functions derived from
// entity fields + owner subtrees EACH CALL (no serialized state, no writes to sim state, no
// registry/UPDATE_ORDER slot). New consumers (component selection in uiRoot, HUD identity/eligibility,
// tests) read ONE truth here; the low-level live gates consume only the type-membership sets from
// `../data/interactionDescriptorCatalog.js` (kept a pure-data import so the gates never cycle
// through this module).
//
// IFF stays the single shared truth: hostility is ALWAYS scanner.isHostileToPlayer — never re-derived
// from factionId here. Mass Seed tether phase stays owned by massSeed.js — read through its published
// `data.massSeedState` via its own pure export.
//
// Determinism: every function is a pure read. `interactionEligibility` and `describeEntity` never
// mutate state. Component selection helpers return the NEXT selection value; the caller (uiRoot) owns
// the transient `state.ui.componentSelection` write.

import { isHostileToPlayer } from './scanner.js';
import { isMassSeedTetherEligible } from './massSeed.js';
import { COMBAT_PROFILES, SUBSYSTEM_DEFS, DEFAULT_COMBAT_PROFILE_BY_TYPE } from '../data/combatDefs.js';
import { actionForWreck } from '../data/salvageActions.js';
import { dockDenyReason } from '../data/dockDeny.js';
import { worldSiteManifestById } from '../data/worldSiteManifests.js';
import { worldSiteOperationReadiness } from './worldSiteKernel.js';
import { presentationAllowsPlayerFacingAction } from '../core/presentationAdmission.js';
import {
  VERB_TYPE_MEMBERSHIP, verbAcceptsType, DENIAL,
  COMPONENT_KINDS, COMPONENT_KIND_VERB, stableEntityKey, capabilityFlagsForEntity,
  interactionDisplayName,
} from '../data/interactionDescriptorCatalog.js';

const COMBAT_PROFILE_BY_ID = new Map(COMBAT_PROFILES.map((p) => [p.id, p]));
const SUBSYSTEM_DEF_BY_ID = new Map(SUBSYSTEM_DEFS.map((s) => [s.id, s]));

// ---- wreck-like predicate (mirrors scanner isWreckLike so 'contact'/'salvage' agree with the HUD)
export function isWreckLikeEntity(entity) {
  if (!entity) return false;
  const data = entity.data || {};
  return entity.type === 'wreck'
    || data.poiType === 'wreck' || data.kind === 'wreck' || data.kind === 'derelict' || data.salvage === true;
}

// ---------------------------------------------------------------------------------------------
// Component enumeration. Components are catalogued from EXISTING truth and keyed as
// (stableEntityKey, componentId). Combat subsystems are serviced by DAMAGE; a wreck's salvage
// weak-point/action is serviced by SALVAGE. Site machines are reflect-only (owned by asteroidSites).
// ---------------------------------------------------------------------------------------------
function profileForEntity(entity) {
  if (!entity) return null;
  const id = (entity.data && entity.data.combatProfileId) || DEFAULT_COMBAT_PROFILE_BY_TYPE[entity.type];
  return id ? COMBAT_PROFILE_BY_ID.get(id) || null : null;
}

function subsystemLabel(def, id) {
  const tag = def && Array.isArray(def.tags) && def.tags[0];
  const base = tag || String(id || '').replace(/^subsystem_/, '');
  return String(base).replace(/_/g, ' ').toUpperCase();
}

/**
 * List the components a player can sub-select on this entity, in a STABLE deterministic order.
 * @returns {Array<{componentId, kind, verb, label, key, live?}>}
 */
export function listComponents(state, entity) {
  if (!entity) return [];
  const out = [];
  const key = stableEntityKey(entity);

  const authoredSiteComponent = siteComponentForEntity(state, entity, key);
  if (authoredSiteComponent) return [authoredSiteComponent];

  // Combat subsystems (ship / drone / station) — the DAMAGE-serviced components.
  const profile = profileForEntity(entity);
  const subsystemIds = (profile && Array.isArray(profile.subsystemIds)) ? profile.subsystemIds : [];
  const runtime = liveCombatRuntime(state, entity);
  for (const sid of subsystemIds) {
    const def = SUBSYSTEM_DEF_BY_ID.get(sid);
    const liveSub = runtime && runtime.subsystems ? runtime.subsystems[sid] : null;
    out.push({
      componentId: sid,
      kind: COMPONENT_KINDS.SUBSYSTEM,
      verb: COMPONENT_KIND_VERB.subsystem, // 'damage'
      label: subsystemLabel(def, sid),
      key: `${key}::${sid}`,
      destroyed: !!(liveSub && liveSub.destroyed),
      live: !!liveSub,
    });
  }

  // Wreck salvage weak-point / action — the SALVAGE-serviced component.
  if (isWreckLikeEntity(entity)) {
    const action = actionForWreck(entity);
    if (action) {
      out.push({
        componentId: action.id,
        kind: COMPONENT_KINDS.WEAKPOINT,
        verb: COMPONENT_KIND_VERB.weakpoint, // 'salvage'
        label: action.label || action.verb || 'Salvage Point',
        key: `${key}::${action.id}`,
        unstable: !!action.unstable,
        live: true,
      });
    }
  }

  return out;
}

/** One component descriptor by id, or null. */
export function describeComponent(state, entity, componentId) {
  if (componentId == null) return null;
  return listComponents(state, entity).find((c) => c.componentId === componentId) || null;
}

// ---------------------------------------------------------------------------------------------
// describeEntity — the presentation + capability identity, one truth for HUD and targeting.
// ---------------------------------------------------------------------------------------------
export function describeEntity(state, entity) {
  if (!entity) return null;
  const caps = capabilityFlagsForEntity(entity);
  const playerTeam = playerTeamOf(state);
  return {
    id: entity.id,
    stableKey: stableEntityKey(entity),
    type: entity.type,
    kind: caps.kind,
    label: interactionDisplayName(entity),
    alive: entity.alive !== false,
    hostile: playerTeam != null ? isHostileToPlayer(entity, playerTeam, state) : false,
    wreckLike: isWreckLikeEntity(entity),
    capabilities: caps,
    components: listComponents(state, entity),
    presentationAllowed: presentationAllowsPlayerFacingAction(entity, state),
    presentationOwnerWorldRecordId: entity.data && entity.data.presentationOwnerWorldRecordId || null,
    data: entity.data || {},
    hull: entity.hull,
    hullMax: entity.hullMax,
    armorHp: entity.armorHp,
    armorMax: entity.armorMax,
  };
}

// ---------------------------------------------------------------------------------------------
// interactionEligibility — the derived {ok, reason, detail?} truth, per verb. Consumed by NEW
// surfaces (HUD denial, component selection). It composes MEMBERSHIP (from the catalog) with the
// SAME downstream conditions the live gates apply, but it does NOT replace the live gates' own
// byte-pinned reason strings — those stay produced by the untouched downstream code.
// ---------------------------------------------------------------------------------------------
export function interactionEligibility(state, entity, verb, opts = {}) {
  if (!entity || entity.alive === false) return deny(DENIAL.NOT_ALIVE);

  // Membership first (bare-type check) — 'salvage'/'contact' fold in the wreck-like predicate so a
  // data-tagged derelict agrees with the HUD.
  const wreckLike = isWreckLikeEntity(entity);
  const memberByType = verbAcceptsType(verb, entity.type);
  const member = memberByType
    || ((verb === 'salvage' || verb === 'contact') && wreckLike);
  if (!member) return deny(DENIAL.WRONG_TYPE);

  switch (verb) {
    case 'target': {
      const playerTeam = opts.playerTeam != null ? opts.playerTeam : playerTeamOf(state);
      if (!isHostileToPlayer(entity, playerTeam, state)) return deny(DENIAL.NOT_HOSTILE);
      return ok();
    }
    case 'tether': {
      if (entity.type === 'massSeed' && !isMassSeedTetherEligible(entity)) return deny(DENIAL.PHASE_INELIGIBLE, phaseOf(entity));
      return ok();
    }
    case 'mine': {
      if (entity.type === 'asteroid' && entity.data && entity.data.respawnAt != null) return deny(DENIAL.MINED_OUT);
      // Extraction-time truth (mining.js applyMining): a site-anchored rock is beam-locked. Acquire
      // still accepts it (parity with the live gate), so this is reported as detail, not a hard deny
      // unless the caller asks for the extraction phase.
      if (entity.type === 'asteroid' && entity.data && entity.data.siteAnchored) {
        return opts.phase === 'extract' ? deny(DENIAL.BEAM_LOCKED) : ok(DENIAL.BEAM_LOCKED);
      }
      return ok();
    }
    case 'salvage':
      return ok();
    case 'damage':
      // Membership already matched the router allowlist; docked/invuln/friendly-fire stay the
      // router's own downstream gates (byte-pinned) — not re-derived here.
      return ok();
    case 'dock': {
      const denyReason = dockDenyReason(dockStationView(entity), opts.factionMeta);
      return denyReason ? deny(denyReason.reason, denyReason.text) : ok();
    }
    case 'contact':
      return ok();
    default:
      return deny(DENIAL.WRONG_TYPE);
  }
}

// ---------------------------------------------------------------------------------------------
// Component selection (transient, per current target). Pure helpers; uiRoot owns the state write.
// ---------------------------------------------------------------------------------------------

/** The subset of components a player may cycle for the given entity (all catalogued components). */
export function listSelectableComponents(state, entity) {
  return listComponents(state, entity);
}

/**
 * Next component selection when cycling by `dir` (+1/-1) over an entity's selectable components.
 * A first press with no current selection lands on index 0 (dir>0) or the last (dir<0). Returns
 * null when there are no selectable components (selection cleared).
 * @returns {{componentId, key, kind, verb}|null}
 */
export function nextComponentSelection(components, currentComponentId, dir = 1) {
  const list = Array.isArray(components) ? components : [];
  if (!list.length) return null;
  const step = dir < 0 ? -1 : 1;
  const idx = list.findIndex((c) => c.componentId === currentComponentId);
  let nextIdx;
  if (idx < 0) nextIdx = step > 0 ? 0 : list.length - 1;
  else nextIdx = (idx + step + list.length) % list.length;
  const c = list[nextIdx];
  return { componentId: c.componentId, key: c.key, kind: c.kind, verb: c.verb };
}

/**
 * Resolve the currently-selected component to the identifier a VERB can service, or a denial.
 * - 'damage': returns { ok, subsystemId } when the selection is a combat subsystem on THIS entity
 *   that is not destroyed; { ok:false, reason } otherwise (component not serviceable by this verb).
 * - 'salvage': returns { ok, componentId } for a wreck weak-point selection on THIS entity.
 * A null/absent selection is `{ ok:true }` with no component (verb resolves geometrically as today).
 */
export function resolveComponentForVerb(state, entity, verb, selection) {
  if (!selection || selection.componentId == null) return { ok: true };
  if (!entity) return { ok: false, reason: DENIAL.NO_COMPONENT };
  // A selection only applies to the entity it was made on (stable-key match).
  if (selection.stableKey != null && selection.stableKey !== stableEntityKey(entity)) {
    return { ok: false, reason: DENIAL.NO_COMPONENT };
  }
  const comp = describeComponent(state, entity, selection.componentId);
  if (!comp) return { ok: false, reason: DENIAL.NO_COMPONENT };
  if (comp.verb !== verb) return { ok: false, reason: DENIAL.COMPONENT_NOT_SERVICEABLE, detail: comp.verb };
  if (verb === 'damage') {
    if (comp.destroyed) return { ok: false, reason: DENIAL.COMPONENT_NOT_SERVICEABLE, detail: 'destroyed' };
    return { ok: true, subsystemId: comp.componentId, componentId: comp.componentId };
  }
  const resolved = { ok: true, componentId: comp.componentId };
  if (comp.operationId) resolved.operationId = comp.operationId;
  return resolved;
}

// ---- helpers ----------------------------------------------------------------------------------
function ok(detail) { return detail != null ? { ok: true, reason: null, detail } : { ok: true, reason: null }; }
function deny(reason, detail) { return detail != null ? { ok: false, reason, detail } : { ok: false, reason }; }

function phaseOf(entity) {
  const s = entity && entity.data && entity.data.massSeedState;
  return s && s.phase != null ? s.phase : null;
}

function siteComponentForEntity(state, entity, stableKey) {
  const data = entity && entity.data || {};
  const siteId = data.worldSiteId;
  const componentId = data.worldSiteComponentId;
  if (!siteId || !componentId) return null;
  const record = state && state.sites && state.sites.worldById && state.sites.worldById[siteId];
  if (!record || record.worldObjectId !== siteId && record.manifestId !== siteId) return null;
  const manifest = worldSiteManifestById(record.manifestId || siteId);
  if (!manifest) return null;
  const def = manifest.components.find((component) => component.id === componentId);
  const live = record.components && record.components[componentId];
  if (!def || !live) return null;
  const readiness = worldSiteOperationReadiness(manifest, record, componentId);
  const operation = readiness.operation;
  const inactiveReason = operation ? null : readiness.reason;
  return {
    componentId,
    kind: def.kind || COMPONENT_KINDS.MACHINE,
    verb: operation && operation.verb || null,
    operationId: operation && operation.id || null,
    label: def.label || componentId,
    key: `${stableKey}::${componentId}`,
    status: live.status,
    siteId,
    payloadId: operation && operation.payloadId || null,
    receiverId: operation && operation.receiverId || null,
    active: !!operation,
    inactiveReason,
    presentationOwnerWorldRecordId: data.presentationOwnerWorldRecordId || `${manifest.worldObjectId}/root`,
    live: true,
  };
}

function playerTeamOf(state) {
  if (!state || !state.entities || !state.entities.get) return null;
  const player = state.entities.get(state.playerId);
  return player ? player.team : null;
}

function liveCombatRuntime(state, entity) {
  const combat = state && state.combat;
  if (!combat || !combat.entities || entity == null || entity.id == null) return null;
  return combat.entities[String(entity.id)] || null;
}

// A station entity carries its dock-deny inputs on entity.data (world.js station stamp). Present a
// dockDeny-shaped view without mutating the entity.
function dockStationView(entity) {
  const d = entity && entity.data ? entity.data : {};
  return {
    factionId: d.factionId || (entity && entity.factionId) || null,
    dockDeny: d.dockDeny,
    abandoned: d.abandoned,
    underConstruction: d.underConstruction,
    commissioned: d.commissioned,
    quarantine: d.quarantine,
    quarantined: d.quarantined,
    hostile: d.hostile,
    private: d.private,
    public: d.public,
    militaryOnly: d.militaryOnly,
    minRep: d.minRep,
    playerRep: d.playerRep,
  };
}

export default {
  describeEntity,
  describeComponent,
  listComponents,
  listSelectableComponents,
  nextComponentSelection,
  resolveComponentForVerb,
  interactionEligibility,
  isWreckLikeEntity,
};
