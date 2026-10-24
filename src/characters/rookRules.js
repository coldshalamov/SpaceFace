// src/characters/rookRules.js — pure rules for Rook's bounty booth (row 542).
// No state, no bus, no DOM, no Math.random. The sim adapter in systems/rookBooth.js
// owns positions and time; these functions answer: is this body a sellable wreck,
// has it arrived at rest inside the ring, and what does the book owe for it.

import { ROOK_BOOTH } from '../data/rook.js';

function finiteXZ(v) {
  return Number.isFinite(v && v.x) && Number.isFinite(v && v.z);
}

/** A wreck Rook will actually buy: the salvage-law shape, minus every kind that belongs
 *  to someone else's story. Kill-wrecks, sort debris and spawned hulks are fair goods —
 *  and the ordinary kill hulk IS the fair good: aftermathWrecks markers are the player's
 *  own residue, retired through the sale's salvage:completed receipt, so that one
 *  persistence owner stays sellable while every other (uniqueWrecks, lastShift,
 *  asteroidSites, character props, world records) is another lane's durable body.
 *  Mission-pinned, claimed, encounter-owned, durable-record and authored-dressing hulls
 *  are never inventory — the booth does not fence marked freight. */
export function rookBoothEligible(entity) {
  if (!entity || entity.alive === false || entity.type !== 'wreck') return false;
  const d = entity.data || {};
  if (d.rookClaimed === true) return false;
  // Named records and authored bodies: another system owns the hull's identity.
  if (d.uniqueWreckId || d.authoredWreckId) return false;
  if (d.worldSiteStructural === true) return false;
  if (d.poiId || d.authored === true || d.authoredCharacter) return false;
  if (d.runtimeOwner) return false;
  if (d.persistenceOwner && d.persistenceOwner !== 'aftermathWrecks') return false;
  // Mission-pinned and claimed freight: the contract outranks the pad — ambient salvors
  // already refuse a staked body, and the book does not buy one either.
  if (d.missionId || d.missionPinned || d.missionTag) return false;
  if (d.contractClaimSiteOf || d.salvorClaimedBy) return false;
  if (d.recoveryEncounterId || d.survivorPod || d.storyPropKind || d.wreckMissionId) return false;
  if (d.interventionId || d.onboarding === true) return false;
  // Durable records and authored dressing rematerialize — a sale cannot take what the
  // world respawns (it would return next enter with the latch unwritten: a dupe, not a hull).
  if (d.worldRecordId || d.identityKey || d.durable === true) return false;
  if (d.worldOneOff === true || d.oneOffId || d.berthConsign) return false;
  // An arena shard's marker owns its lifetime — it regrows while the marker lives.
  if (d.arenaShardOf || d.reefMineId || d.reefMine === true) return false;
  // Body-row flags carry the same ownership law.
  const f = entity.flags || {};
  if (f.persistent === true || f.durable === true || f.missionPinned === true || f.invuln === true) return false;
  return true;
}

/** Arrival truth: inside the ring and at rest — swept by speed, never by a fast pass. */
export function rookDeliveryCheck(entity, pad = ROOK_BOOTH.pad, padRadius = ROOK_BOOTH.padRadius, restSpeed = ROOK_BOOTH.restSpeed) {
  const pos = entity && entity.pos;
  if (!finiteXZ(pos) || !finiteXZ(pad)) return { inZone: false, speed: Infinity, arrived: false };
  const vel = entity && entity.vel;
  const speed = finiteXZ(vel) ? Math.hypot(vel.x, vel.z) : Infinity;
  const inZone = Math.hypot(pos.x - pad.x, pos.z - pad.z) <= padRadius;
  return { inZone, speed, arrived: inZone && speed <= restSpeed };
}

/** The book's price: whole credits, floor so a debris lot still reads as a sale. */
export function rookPayoutCr(mass, rate = ROOK_BOOTH.ratePerMass) {
  const m = Number.isFinite(mass) && mass > 0 ? mass : 0;
  return Math.max(ROOK_BOOTH.minPayoutCr, Math.round(m * rate));
}
