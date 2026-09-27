// BP-13/B16 Bounty Hunter Neutrality.
//
// Contract hunters are not automatically hostile to the player. The scanner-visible context becomes
// the force-hostile bounty_hunter context only when the player is the contract target.
//
// INFERENCE quarry-survival: the quarry is no longer a passive target id. This module also carries
// the quarry's deterministic identity (name, manifest) and the chase tuning the system reads.
// Pure data + hash32; zero shared-rng draws so staged chases agree across loads.

import { hash32 } from '../core/rng.js';

export const BOUNTY_HUNTER_NEUTRAL_CONTEXT = 'bounty_contract';
export const BOUNTY_HUNTER_PLAYER_CONTEXT = 'bounty_hunter';

/** Chase tuning. Distances in wu, hull as a fraction, credits flat. */
export const QUARRY_TUNING = Object.freeze({
  distressRange: 900,        // hunter inside this → one distress squawk per contract
  dumpRange: 520,            // hunter inside this → the quarry dumps its manifest as pods
  surrenderHullFrac: 0.28,   // hull below this → engines cut, payoff posted
  refugeRange: 420,          // quarry inside this of a station → contract goes cold
  refugeScan: 6000,          // stations scanned this far out as refuge candidates
  jinkRange: 260,            // hunter inside this → the quarry weaves instead of running straight
  gratitudeCr: 350,          // quarry pays the player for killing its hunter
  surrenderBountyCr: 650,    // posted payoff once the quarry surrenders
  hunterCutCr: 200,          // hunter's guild pays the player for killing the quarry
  gratitudeRep: 6,           // quarry-faction rep for the save
  cutRep: 4,                 // hunter-faction rep for the help
  executionRep: -8,          // hunter-faction rep when it executes a surrendered mark
  stageCooldownMinS: 150,    // staged-chase spacing floor (free flight only, never scenarios)
  stageCooldownSpanS: 120,   // + hash01 * span
  firstStageDelayS: 75,      // first staged chase this far into a flight session
  stageRange: 1650,          // chase staged this far from the player (a crossing shot, not a drop-in)
  stageTrailGap: 380,        // hunter starts this far behind the quarry
  stageShipCap: 80,          // never stage into a busier sky than this
  dumpPodTtlS: 90,           // dumped pods persist this long for the scoop-or-leave choice
  contractTimeoutS: 300,     // staged flag clears after this even if the pair wanders off
});

/** Road-names for staged quarries — the distress call needs a person, not a contract id. */
export const QUARRY_NAMES = Object.freeze([
  'Vess Arando',
  'Pell Quire',
  'Ines Kald',
  'Roon Ablemar',
  'Hett Marrow',
  'Jule Vanno',
  'Sef Quarry',
  'Ida Vreck',
  'Nessa Drift-Born',
  'Marl Tosi',
  'Sel Roan',
  'Odile Kane',
]);

/** Small honest manifests — what the quarry dumps when pressed. Amounts are pod units. */
export const QUARRY_MANIFESTS = Object.freeze([
  Object.freeze([
    Object.freeze({ commodityId: 'cmdty_food', amount: 3 }),
    Object.freeze({ commodityId: 'cmdty_textiles', amount: 2 }),
  ]),
  Object.freeze([
    Object.freeze({ commodityId: 'cmdty_consumer_goods', amount: 3 }),
    Object.freeze({ commodityId: 'cmdty_food', amount: 1 }),
  ]),
  Object.freeze([
    Object.freeze({ commodityId: 'cmdty_medical', amount: 2 }),
    Object.freeze({ commodityId: 'cmdty_consumer_goods', amount: 2 }),
  ]),
  Object.freeze([
    Object.freeze({ commodityId: 'cmdty_ore_iron', amount: 4 }),
    Object.freeze({ commodityId: 'cmdty_food', amount: 1 }),
  ]),
]);

export function quarryNameForContract(contractId, seed) {
  const idx = hash32(seed || 1, String(contractId || ''), 'quarry-name') % QUARRY_NAMES.length;
  return QUARRY_NAMES[idx] || QUARRY_NAMES[0];
}

export function quarryManifestForContract(contractId, seed) {
  const idx = hash32(seed || 1, String(contractId || ''), 'quarry-manifest') % QUARRY_MANIFESTS.length;
  return QUARRY_MANIFESTS[idx] || QUARRY_MANIFESTS[0];
}

/** Deterministic 0..1 for staging geometry. Never touches the shared stream. */
export function quarryHash01(seed, ...parts) {
  return (hash32(seed || 1, ...parts) >>> 0) / 4294967296;
}

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

export function makePlayerWarrantHunterSpec({
  contractId = 'wanted-warrant',
  playerId = null,
  pos = { x: 0, z: 0 },
  factionId = 'faction_scn',
} = {}) {
  const spec = makeBountyHunterSpec({
    contractId,
    contractTargetId: playerId,
    pos,
    factionId,
  });
  spec.data.wantedWarrant = true;
  spec.data.wantedTier = 'bounty';
  return spec;
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
