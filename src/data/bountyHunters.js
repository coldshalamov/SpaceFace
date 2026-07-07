// BP-13/B16 Bounty Hunter Neutrality.
//
// Contract hunters are not automatically hostile to the player. The scanner-visible context becomes
// the force-hostile bounty_hunter context only when the player is the contract target.

export const BOUNTY_HUNTER_NEUTRAL_CONTEXT = 'bounty_contract';
export const BOUNTY_HUNTER_PLAYER_CONTEXT = 'bounty_hunter';

export function makeBountyHunterSpec({
  contractId = 'bounty-contract',
  contractTargetId = null,
  trick = null,
  pos = { x: 0, z: 0 },
  factionId = 'faction_quiet',
} = {}) {
  return {
    type: 'ship',
    team: 3,
    factionId,
    pos: { x: pos.x || 0, z: pos.z || 0 },
    hull: 110,
    hullMax: 110,
    radius: 12,
    data: {
      contractId,
      contractTargetId,
      bountyHunt: {
        role: 'hunter',
        contractId,
        targetId: contractTargetId,
        pursuing: false,
        trickId: trick,
      },
      hunterTrick: trick,
      ai: {
        archetype: 'hunter',
        spawnContext: BOUNTY_HUNTER_NEUTRAL_CONTEXT,
        passive: false,
        forcePlayerTarget: false,
        hostileTeams: [],
      },
    },
  };
}

export function makeBountyQuarrySpec({
  contractId = 'bounty-contract',
  pos = { x: 0, z: 0 },
  factionId = 'faction_free',
} = {}) {
  return {
    type: 'ship',
    team: 2,
    factionId,
    pos: { x: pos.x || 0, z: pos.z || 0 },
    hull: 90,
    hullMax: 90,
    radius: 11,
    data: {
      contractId,
      bountyHunt: {
        role: 'quarry',
        contractId,
      },
      ai: {
        archetype: 'fleeing_trader',
        spawnContext: 'bounty_quarry',
        passive: true,
      },
    },
  };
}
