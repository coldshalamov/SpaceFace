// Claimable body definitions (V2 §6 / M3). Bodies the player can claim and build on — the
// "you own a place" fantasy, scoped per the user's "abstracted base-as-node with a light visual"
// lean (NOT a Mindustry tile grid). A body is a node with module slots; modules snap on and provide
// passive bonuses. This file defines the module catalog; the runtime lives in src/systems/claims.js.
//
// DESIGN (V2 §5, §6, §8):
//   - Claimable bodies are rare, special POIs (a "Claimable Moon" type), not every planet. Scarcity
//     makes ownership meaningful (V2 §11 — build-order puzzle).
//   - Modules are the "bots-as-conveyors" answer: instead of belt tiles, you build structures that
//     the automation alphabet routes through. A Depot is a MOVE beacon; a Refinery auto-refines; a
//     Teleporter collapses a lane (V2 §8 — the milestone unlock that rewrites map geometry).
//   - Costs scale so the build ORDER is a real decision (do you sink credits into a second depot or
//     a teleporter first?).

// Module types buildable on a claimed body. Each is a passive provider when staffed/powered.
// techReq gates map onto the REAL tech tree (src/data/tech.js) — a body module is buildable only
// after the player has researched the corresponding node. (Previously these referenced three tech_
// IDs that did not exist in the tree, making every module permanently unbuildable.)
//   - Depot / Defense Battery → tech_outpost_charter (the logistics capstone that already grants
//     outpostConstruction:true; gating base structures on the "you may build outposts" node).
//   - On-Site Refinery        → tech_deep_core_mining (the industry capstone for serious refining).
//   - Quantum Teleporter      → tech_graviton_drives (the drives capstone; "rewrites the map"
//     thematically matches the drive tier that makes collapsed lanes trivial).
export const BODY_MODULES = [
  {
    id: 'mod_depot', name: 'Cargo Depot', desc: 'A dropoff point for your drones. Drones assigned a depot template route here. Stores overflow ore.',
    cost: 4500, techReq: 'tech_outpost_charter',
    slots: 1,
    effect: 'depot', // a MOVE beacon named 'depot' resolves here when built
  },
  {
    id: 'mod_refinery', name: 'On-Site Refinery', desc: 'Auto-refines raw ore into materials at a fixed rate, no station visit needed. Lighter, dearer goods to ship.',
    cost: 12000, techReq: 'tech_deep_core_mining',
    slots: 1,
    effect: 'refine', // ticks: converts ore -> refined commodity at a rate
    refineRate: 0.5,  // ore-units/sec
  },
  {
    id: 'mod_teleporter', name: 'Quantum Teleporter', desc: 'Links this body to a chosen station. Collapses your worst lane to a single jump — classic automation that rewrites the map.',
    cost: 45000, techReq: 'tech_graviton_drives',
    slots: 1,
    effect: 'teleport', // enables instant travel between body and linked station
  },
  {
    id: 'mod_defense', name: 'Defense Battery', desc: 'Automated turret that protects the body from raids. Required on dangerous frontier claims.',
    cost: 8000, techReq: 'tech_outpost_charter',
    slots: 1,
    effect: 'defense',
    defenseRating: 40, // reduces the body's intervention/raid risk
  },
];

// Specializations (M5 / SPEC3-F6-26): the claim's OPERATING IDENTITY. Where a module is a fitting,
// a specialization is what the base is FOR — exactly one per body, chosen deliberately, switchable
// only when site storage is empty. Each one changes real simulation behavior (claims.js ticks it),
// has a distinct input, output, and risk, and reads out honestly on the Base screen ledger.
// Prerequisite: the matching module must already be fitted (its techReq gates the identity too).
export const BODY_SPECIALIZATIONS = [
  {
    id: 'spec_refinery', name: 'Industrial Refinery', short: 'REFINERY',
    desc: 'Runs the fitted refinery as a working site. Deliver raw ore here; crews process it into refined goods you haul out. Stocked sites draw raiders in low-security space.',
    requiresModule: 'mod_refinery',
    cost: 9000,
    upkeepPerMin: 20,       // credits, charged through the economy writer
    inputCapU: 240,         // raw ore the site can hold
    outputCapU: 120,        // refined goods awaiting pickup
    refineRatePerS: 0.5,    // ore-units processed per second (same truth as mod_refinery)
  },
  {
    id: 'spec_relay', name: 'Trade Relay', short: 'RELAY',
    desc: 'Runs the fitted depot as a freight relay. Deposit goods; scheduled convoys haul them to the linked station and sell at the local market price less the relay fee. Convoys risk piracy in low-security space.',
    requiresModule: 'mod_depot',
    cost: 7000,
    upkeepPerMin: 15,
    storeCapU: 300,         // freight the relay can hold
    dispatchEveryS: 240,    // convoy schedule
    transitS: 90,           // convoy travel time to the linked station
    convoyLoadU: 60,        // max units per convoy
    minLoadU: 20,           // don't send half-empty haulers
    saleFee: 0.2,           // the proven outpost autosell penalty (-20%)
  },
  {
    id: 'spec_bastion', name: 'Defense Bastion', short: 'BASTION',
    desc: 'Runs the fitted battery as a garrison. Warns of raids on your claims in this sector and contests them with stationed guns. Highest upkeep; produces nothing.',
    requiresModule: 'mod_defense',
    cost: 8000,
    upkeepPerMin: 25,
    defenseBonus: 60,       // added to this body's battery rating while the garrison is active
    coverageBonus: 40,      // lent to every other claim in the same sector
    coveredLossFrac: 0.35,  // a raid that lands under coverage takes half the usual 70%
  },
];

export const BODY_SPECIALIZATION_BY_ID = new Map(BODY_SPECIALIZATIONS.map((s) => [s.id, s]));

// A claimable body's total module slots (so you choose which 3-4 modules to fit). Small bodies = 2
// slots (a frontier mining claim), large = 4 (an industrial moon). Forces build-order decisions.
export const BODY_SLOTS_BY_SIZE = { S: 2, M: 3, L: 4 };

// The base cost to CLAIM a body (survey + flag). Cheap enough to be a mid-game milestone, dear
// enough that you don't claim everything you see.
export const CLAIM_COST = 15000;

export const BODY_MODULE_BY_ID = new Map(BODY_MODULES.map((m) => [m.id, m]));
