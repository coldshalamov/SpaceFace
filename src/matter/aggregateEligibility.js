// Who may join an aggregate, and why not — shared by Gyre Snare and the Pull collector.
//
// One predicate, one vocabulary (`MATTER_REFUSAL` in ./aggregateMass.js). The two owners differ only
// in the rules they pass (what type may be eaten, how fat a body may be); the refusal reasons are the
// same, so a pilot learns one language: protected cargo, too big, anchored, loot, held elsewhere.
//
// Reads the live entity at the destructive boundary and mutates nothing.

import { isAnchoredPhysicalBody } from '../core/physicalResponse.js';
import { isDynamicPhysicsBodyEntity } from '../core/physicsAuthority.js';
import { MATTER_REFUSAL } from './aggregateMass.js';

/** Pickups and payloads are loot: the tools tug them, the pilot collects them, nothing eats them. */
export const COLLECTIBLE_TYPES = Object.freeze(new Set(['pickup', 'payload', 'cargo_pod']));

/** Data marks that say "another tool already owns this body". One shared list, so no tool can steal. */
export const CLAIM_MARKS = Object.freeze(['gyreCore', 'gyreLaunched', 'collectorCore']);

export function matterMass(e) {
  const m = Number(e && e.physicsBody && e.physicsBody.mass);
  if (Number.isFinite(m) && m > 0) return m;
  const top = Number(e && e.mass);
  return Number.isFinite(top) && top > 0 ? top : 1;
}

export function matterRadius(e) {
  // Prefer the collider radius: the absorb trigger rests just outside contact, so keying on the
  // visual would grind a fat-collider/thin-skin body against the surface without ever crossing it.
  const r = Number(e && ((e.physicsBody && e.physicsBody.radius) || e.radius));
  return Number.isFinite(r) && r > 0 ? r : 4;
}

export function matterIsDynamic(e) {
  // Record-less bodies count as dynamic (SG-02 materializes the record in a tick) — the shared
  // substance convention. The local collides guard stays on top of it.
  return !!(e && e.collides !== false && isDynamicPhysicsBodyEntity(e));
}

/**
 * Read current custody/content. A former claim alone does not protect empty scrap; live cargo, a
 * quest hook, or a durable world body does.
 */
export function hasProtectedContent(e) {
  if (e.flags && (e.flags.persistent || e.flags.missionPinned)) return true;
  const data = e.data || {};
  if (data.persistent || data.persistenceOwner || data.missionPinned
    || data.missionTargetSlot != null || data.worldRecordId != null
    || data.worldRecordSlotId != null || data.wreckMissionId != null
    || data.isCommunicator === true) return true;
  if (data.salvagePool && Object.values(data.salvagePool).some((qty) => Number(qty) > 0)) return true;
  if (Array.isArray(data.loot) && data.loot.some((lot) => lot && Number(lot.qty ?? lot.amount ?? 1) > 0)) return true;
  if (Array.isArray(data.cargoManifest?.lines)
    && data.cargoManifest.lines.some((line) => line && Number(line.qty) > 0)) return true;
  const freight = data.freightCustodyPod;
  return !!(freight && Number(freight.qty) > 0 && (!freight.status || freight.status === 'live'));
}

/** Is the body already owned by a held core, a thrown ball, or a collector's knot? */
export function isClaimed(e) {
  const data = e && e.data;
  if (!data) return false;
  for (let i = 0; i < CLAIM_MARKS.length; i++) if (data[CLAIM_MARKS[i]]) return true;
  return false;
}

/**
 * The refusal code for this body under `rules` = `{ types: Set<string>, maxRadius: number }`, or
 * `null` when it may join. Order matters and is the order a pilot would ask the questions:
 * is it there, is it bolted down, is it loot, is it matter, is it free, is it cargo, does it fit.
 */
export function matterRefusal(e, rules) {
  if (!e || e.alive === false) return MATTER_REFUSAL.UNAVAILABLE;
  if (isAnchoredPhysicalBody(e)) return MATTER_REFUSAL.ANCHORED;
  if (COLLECTIBLE_TYPES.has(e.type)) return MATTER_REFUSAL.COLLECTIBLE;
  if (!rules.types.has(e.type)) return MATTER_REFUSAL.NOT_MATTER;
  if (!matterIsDynamic(e) || e.physicsBody === false || (e.physicsBody && e.physicsBody.material === 'sensor')) {
    return MATTER_REFUSAL.UNAVAILABLE;
  }
  if (isClaimed(e)) return MATTER_REFUSAL.CLAIMED;
  if (hasProtectedContent(e)) return MATTER_REFUSAL.PROTECTED;
  // Fit is a size question, never a tonnage one: a body fatter than the aggregate's radius cap
  // cannot go in whole, and partial-body disappearance is not a thing.
  if (matterRadius(e) > rules.maxRadius) return MATTER_REFUSAL.TOO_HEAVY;
  return null;
}
