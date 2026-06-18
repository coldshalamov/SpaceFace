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
export const BODY_MODULES = [
  {
    id: 'mod_depot', name: 'Cargo Depot', desc: 'A dropoff point for your drones. Drones assigned a depot template route here. Stores overflow ore.',
    cost: 4500, techReq: 'tech_outpost_construction',
    slots: 1,
    effect: 'depot', // a MOVE beacon named 'depot' resolves here when built
  },
  {
    id: 'mod_refinery', name: 'On-Site Refinery', desc: 'Auto-refines raw ore into materials at a fixed rate, no station visit needed. Lighter, dearer goods to ship.',
    cost: 12000, techReq: 'tech_refining_2',
    slots: 1,
    effect: 'refine', // ticks: converts ore -> refined commodity at a rate
    refineRate: 0.5,  // ore-units/sec
  },
  {
    id: 'mod_teleporter', name: 'Quantum Teleporter', desc: 'Links this body to a chosen station. Collapses your worst lane to a single jump — classic automation that rewrites the map.',
    cost: 45000, techReq: 'tech_quantum_link',
    slots: 1,
    effect: 'teleport', // enables instant travel between body and linked station
  },
  {
    id: 'mod_defense', name: 'Defense Battery', desc: 'Automated turret that protects the body from raids. Required on dangerous frontier claims.',
    cost: 8000, techReq: 'tech_outpost_construction',
    slots: 1,
    effect: 'defense',
    defenseRating: 40, // reduces the body's intervention/raid risk
  },
];

// A claimable body's total module slots (so you choose which 3-4 modules to fit). Small bodies = 2
// slots (a frontier mining claim), large = 4 (an industrial moon). Forces build-order decisions.
export const BODY_SLOTS_BY_SIZE = { S: 2, M: 3, L: 4 };

// The base cost to CLAIM a body (survey + flag). Cheap enough to be a mid-game milestone, dear
// enough that you don't claim everything you see.
export const CLAIM_COST = 15000;

export const BODY_MODULE_BY_ID = new Map(BODY_MODULES.map((m) => [m.id, m]));
