// Linked Shield Pylons (Controlled Chaos packet 06) — data contract.
//
// A fitted projector lets the pilot deploy ONE physical endpoint, then a second; the pair raises a
// relation-selective shield panel between them. The player and permitted allies cross it freely in
// both directions; hostile hulls, hostile rounds, beams, blasts and chain hops stop at it. Every
// number a reviewer needs lives here; src/systems/shieldPylons.js owns lifecycle and the single
// energy debit, src/combat/pylonShieldGeometry.js owns the one geometric fact every attack path reads.
//
// All numbers marked PROTOTYPE are starting hypotheses, not measured balance.

/** The fitted utility module that gives the pilot the projector. */
export const PYLON_MODULE_ID = 'mod_pylon_projector_s';

export const SHIELD_PYLON_DEF = Object.freeze({
  id: 'shield_pylon_pair',
  version: 1,

  // Endpoint body. The radius is deliberately LARGER than the panel half-thickness: the panel's
  // round end-caps then sit inside the endpoint, so a shot or blast aimed at an exposed endpoint
  // meets the endpoint first. Endpoints are the counterplay target; the caps never shield them.
  endpointRadius: 7,
  endpointHull: 90,            // PROTOTYPE: a few focused volleys kill an endpoint
  endpointMass: 24,
  // Placement lands at the aim point, bounded so the pilot can reach it (and so a pair is a thing
  // you build in front of you, not a map-wide wall).
  placeRange: 170,             // WU from the ship to the farthest placement
  // Keep an endpoint from landing on top of a body.
  placeClearance: 4,           // WU of free space beyond (endpointRadius + other radius)

  // Panel footprint (XZ plane). Half-thickness is smaller than endpointRadius by design.
  halfThickness: 2.2,
  minSpan: 36,                 // shorter than this is a post, not a wall
  maxSpan: 190,                // longer than this is refused at placement
  // A pair stretched past this (an endpoint displaced) snaps: overload, not a longer wall.
  snapSpanScale: 1.18,

  // Lifecycle (seconds of simTime).
  linkS: 0.9,                  // arming beat between the second endpoint landing and the panel solid
  occupiedWaitS: 5,            // longest the arming beat will wait on a hostile body in the span
  lifetimeS: 42,               // active lifetime of a linked pair
  warnS: 6,                    // expiry warning window
  unpairedLifetimeS: 60,       // an endpoint with no partner waits this long
  collapseS: 0.6,              // visible collapse beat before the endpoints are removed
  overloadS: 6,                // offline time after an overload
  recoverS: 1.2,               // recovering beat before the panel blocks again
  recoverEnergyFrac: 0.4,      // energy restored when recovery completes
  strainedFrac: 0.35,          // energy fraction at/under which the pair reads STRAINED

  // Energy (shield points, SP — comparable to a damage point). Span trades against capacity:
  // a long wall is a thin wall.
  capacity: 620,               // PROTOTYPE at the shortest span
  capacitySpanFloor: 0.55,     // capacity fraction at maxSpan
  regenPerS: 14,               // SP/s while not being hit
  regenDelayS: 1.6,            // quiet time before regeneration resumes
  // Ship contact (swept interception). Energy = 0.5 m dv^2 / shipEnergyDiv; dv is the inbound
  // normal speed the panel removes.
  shipEnergyDiv: 250,
  maxStopDvPerTick: 24,        // WU/s of inbound speed one tick may cancel; beyond it the ship
                               // keeps its excess and the pair takes the remainder as strain
  pushOutSpeed: 30,            // WU/s of depenetration push for a body overlapping the panel
  interceptBandPad: 2,         // extra reach (WU) before a closing hostile is clamped
  // Blast / chain / beam / projectile energy factors.
  blastEnergyFromImpulse: 0.02,
  minContactEnergy: 2,

  // Capacity per player. One pair is the starter fit; the module raises it.
  defaultPairs: 2,
  // Deployment spend, through the economy owner's chargeCredits intent (beacon parity).
  endpointCostCredits: 90,     // per endpoint; an unpaired recall refunds it
  deployCooldownS: 1.2,        // between endpoint placements (input debounce, not a rate limit)
});

/** Pair lifecycle states. unpaired -> linking -> active <-> strained -> overloaded -> recovering -> retired. */
export const PYLON_STATES = Object.freeze({
  UNPAIRED: 'unpaired',
  LINKING: 'linking',
  ACTIVE: 'active',
  STRAINED: 'strained',
  OVERLOADED: 'overloaded',
  RECOVERING: 'recovering',
  RETIRED: 'retired',
});

/** Why a pair was retired (the one failure cause a player reads). */
export const PYLON_RETIRE_REASONS = Object.freeze({
  endpointDestroyed: 'endpoint_destroyed',
  expired: 'expired',
  recalled: 'recalled',
  replaced: 'replaced',
  cleared: 'cleared',
  snapped: 'snapped',
  occupied: 'occupied',
  ownerLost: 'owner_lost',
});

/** Why a placement was refused. Rejected placement spends nothing. */
export const PYLON_DENIALS = Object.freeze({
  notFitted: 'not_fitted',
  cooldown: 'cooldown',
  capacity: 'capacity_reached',
  funds: 'insufficient_credits',
  clearance: 'occupied_site',
  tooClose: 'span_too_short',
  tooFar: 'span_too_long',
  range: 'out_of_range',
  occupiedSpan: 'occupied_span',
  mode: 'not_in_flight',
});

/** Next-operation labels the HUD names (the packet forbids an unlabeled overloaded action). */
export const PYLON_NEXT_OP = Object.freeze({
  first: 'PLACE FIRST ENDPOINT',
  second: 'LINK SECOND ENDPOINT',
  full: 'CAPACITY REACHED',
  unfitted: 'FIT A PYLON PROJECTOR',
});

/** Human text for each denial reason. */
export const PYLON_DENIAL_TEXT = Object.freeze({
  [PYLON_DENIALS.notFitted]: 'Fit a Pylon Projector to deploy pylons',
  [PYLON_DENIALS.cooldown]: 'Pylon projector recharging',
  [PYLON_DENIALS.capacity]: 'Pylon capacity reached - recall or wait for a pair to expire',
  [PYLON_DENIALS.funds]: 'Not enough credits for a pylon',
  [PYLON_DENIALS.clearance]: 'Site occupied - place the pylon in clear space',
  [PYLON_DENIALS.tooClose]: 'Endpoints too close to form a wall',
  [PYLON_DENIALS.tooFar]: 'Endpoints too far apart for one wall',
  [PYLON_DENIALS.range]: 'Out of placement range',
  [PYLON_DENIALS.occupiedSpan]: 'A hostile body is in the span - wall refused',
  [PYLON_DENIALS.mode]: 'Pylons deploy in flight',
});
