// src/characters/rookRules.js — pure rules for Rook's bounty booth (row 542).
// No state, no bus, no DOM, no Math.random. The sim adapter in systems/rookBooth.js
// owns positions and time; these functions answer: is this body a sellable wreck,
// has it arrived at rest inside the ring, and what does the book owe for it.

import { ROOK_BOOTH } from '../data/rook.js';

function finiteXZ(v) {
  return Number.isFinite(v && v.x) && Number.isFinite(v && v.z);
}

/** A wreck Rook will actually buy: the salvage-law shape, minus every kind that belongs
 *  to someone else's story. Kill-wrecks, sort debris and spawned hulks are fair goods;
 *  authored POI bodies, unique-wreck records, world-site structures, and anything a
 *  persistence or runtime owner claims are not inventory — the booth does not fence
 *  marked freight. */
export function rookBoothEligible(entity) {
  if (!entity || entity.alive === false || entity.type !== 'wreck') return false;
  const d = entity.data || {};
  if (d.rookClaimed === true) return false;
  if (d.persistenceOwner || d.runtimeOwner || d.uniqueWreckId) return false;
  if (d.worldSiteStructural === true) return false;
  if (d.poiId || d.authored === true) return false;
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
