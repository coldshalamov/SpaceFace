// Stable recurring-Survivor identity derived from the causal pod's durable moral-memory id.
// This is pure authored data: the existing moralMemory record owns persistence, and H7 owns the
// physical return. No parallel cast ledger is required.
import { hash32 } from '../core/rng.js';

export const SURVIVOR_RETURN_GIFT_CREDITS = 900;

const PROFILES = Object.freeze([
  Object.freeze({ name: 'Mara Venn', shipDefId: 'ship_mule' }),
  Object.freeze({ name: 'Oren Sato', shipDefId: 'ship_mule' }),
  Object.freeze({ name: 'Tamsin Rook', shipDefId: 'ship_mule' }),
  Object.freeze({ name: 'Dev Ibarra', shipDefId: 'ship_mule' }),
  Object.freeze({ name: 'Niko Pell', shipDefId: 'ship_mule' }),
  Object.freeze({ name: 'Ilya Quist', shipDefId: 'ship_mule' }),
  Object.freeze({ name: 'Sera Wren', shipDefId: 'ship_mule' }),
  Object.freeze({ name: 'Arun Vale', shipDefId: 'ship_mule' }),
]);

export function isRescuedSurvivorDebt(debt) {
  return !!(debt
    && debt.status === 'pending'
    && debt.cause === 'rescued_survivors'
    && typeof debt.id === 'string'
    && debt.id.length > 0);
}

export function survivorCastForMemoryId(memoryId) {
  const id = String(memoryId || '').trim();
  if (!id) return null;
  const identityHash = hash32(id, 'plan52-recurring-survivor');
  const profile = PROFILES[identityHash % PROFILES.length];
  return Object.freeze({
    id: `survivor_cast_${identityHash.toString(36)}`,
    memoryId: id,
    name: profile.name,
    shipDefId: profile.shipDefId,
    giftCredits: SURVIVOR_RETURN_GIFT_CREDITS,
    primaryLine: `${profile.name}: Tessera, hold position. I was in the pod you brought home.`,
    askedLine: `${profile.name}: Your tow line cut through the hull noise. Hard to forget that sound.`,
    giftLine: `${profile.name}: My berth fund made it out with me. Take it — clean transfer, nothing owed.`,
    refusedLine: `${profile.name}: Understood. I only wanted you to know the tow mattered.`,
  });
}
