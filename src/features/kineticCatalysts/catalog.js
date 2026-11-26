// KINETIC CATALYSTS. These are fitting records, never new input verbs or loot skills.
// The local integrator adds CATALYST_MODULES to the existing module catalogue once.

function frozen(value) {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) frozen(item);
    Object.freeze(value);
  }
  return value;
}

export const CATALYST_IDS = Object.freeze(['orbital_magazine', 'aftershock_core', 'load_bridge']);
export const CATALYST_EXCLUSIVE_GROUP = 'kinetic_catalyst';

export const KINETIC_LIMITS = frozen({
  maxBodies: 96, maxEffects: 32, maxEventHistory: 64, maxStep: 0.05,
  minMass: 0.05, maxMass: 100000, maxCoordinate: 1e8, maxVelocity: 1e5,
  maxImpulse: 600, maxDeltaV: 60, workPerCap: 1800,
  orbit: {
    capacity: 3, maxBodyMass: 48, maxTotalMass: 90, maxBodyRadius: 24,
    captureDistance: 220, maxDistance: 310, radius: 36, ringSpacing: 14,
    captureCost: 3, drainPerBody: 1.6, rigDrainMultiplier: 0.5,
    spring: 30, radialDamping: 8, tangentialDamping: 2.5,
    speed: 36, maxForce: 18000, maxLifetime: 24, releaseRetention: 0.88,
  },
  echo: {
    cost: 12, delay: 1.15, cooldown: 10, radius: 125, radiusScale: 0.74,
    impulse: 168, maxDeltaV: 18, maxTargets: 16, maxTotalImpulse: 1500,
    pullCost: 2, pullDelay: 0.35, pinRadiusScale: 0.75,
    payloadCost: 3, payloadFraction: 0.15, ventDelay: 0.25,
  },
  bridge: {
    linkCost: 6, drain: 0.6, bracedDrain: 1.4, transferCost: 0.8,
    fraction: 0.3, bracedFraction: 0.45, maxTransferImpulse: 140,
    maxTransferDeltaV: 14, maxDistance: 320, maxLifetime: 18,
    spring: 1.2, damping: 1.6, maxForce: 180, maxTransfersPerTick: 4,
  },
});

function moduleRecord(id, name, mass, description) {
  return {
    id: `unique_kinetic_${id}`, name, slotType: 'utility', size: 'S', tier: 2,
    mass, price: 0, energyDraw: 0, mods: {}, unique: true, purchasable: false,
    salvageOnly: true, exclusiveGroup: CATALYST_EXCLUSIVE_GROUP,
    catalystId: id, description,
  };
}

export const KINETIC_CATALYSTS = frozen([
  {
    id: 'orbital_magazine', moduleId: 'unique_kinetic_orbital_magazine', name: 'Orbital Magazine',
    summary: 'Carry three loose bodies in a lossy physical orbit, then throw their real momentum.',
    drawback: 'Each body drains capacitor and pushes back on your hull. Empty capacitor releases the load.',
    tell: 'Three numbered open orbital brackets; live tangential arrows show the release directions.',
    powers: {
      pull: 'Capture up to three nearby debris bodies caught by your Pull footprint; mass and radius limits apply.',
      shove: 'Open the magazine. Bodies leave along their actual tangential velocity; inbound motion is dissipated.',
      pin: 'A load hitched to a real Pin leaves the magazine, becoming an anchor load instead of orbiting ammunition.',
      bomb: 'Throwing ordnance releases one orbiting body as a moving screen alongside the throw.',
      rig: 'The running Rig closes intake and brakes the magazine; it costs less capacitor but bleeds launch energy.',
    },
    module: moduleRecord('orbital_magazine', 'Orbital Magazine', 4,
      'Pull stores physical debris; Shove releases momentum. Loaded bodies drain capacitor and recoil into the hull.'),
  },
  {
    id: 'aftershock_core', moduleId: 'unique_kinetic_aftershock_core', name: 'Aftershock Core',
    summary: 'Leave one delayed, weaker repulsion echo where Shove was cast.',
    drawback: 'Twelve capacitor is paid up front. The fixed footprint can catch your own return path.',
    tell: 'A broken ring counts down with three shrinking teeth; a grounded ring is visibly smaller.',
    powers: {
      pull: 'Pull buys one longer gathering window, at the cost of capacitor and a slightly weaker echo.',
      shove: 'Arm exactly one delayed echo at the original world-space cast point; a second cast cannot move it.',
      pin: 'A Pin inside the marked area grounds its outer ring, reducing reach and impulse before the echo.',
      bomb: 'Bleed a fraction of the stored pulse into newly thrown ordnance, reducing the later echo.',
      rig: 'Starting the Rig vents the stored pulse into a much weaker early release; capacitor is not refunded.',
    },
    module: moduleRecord('aftershock_core', 'Aftershock Core', 5,
      'Shove leaves a delayed weaker echo at its cast point. The echo can move its owner; paid charge never refunds.'),
  },
  {
    id: 'load_bridge', moduleId: 'unique_kinetic_load_bridge', name: 'Load Bridge',
    summary: 'Link a genuinely pinned body to one other load and share finite incoming momentum.',
    drawback: 'The bridge drains capacitor, pulls both endpoints under tension, and fails when the Pin is lost.',
    tell: 'A two-strand line with an anchor tooth and directional transfer chevrons; slack is visible.',
    powers: {
      pull: 'After hitching a body to Pin, Pull selects a second eligible body and establishes one bridge.',
      shove: 'A real shove impulse entering either endpoint can send a capped, mass-aware share to its partner.',
      pin: 'Only an existing Pin hitch or combat PINNED state supplies the anchor. A seed alone is not a pinned body.',
      bomb: 'Newly thrown dynamic ordnance can replace the loose endpoint; the previous load is released.',
      rig: 'Rig tensions the link and raises the sharing ceiling while more than doubling its running drain.',
    },
    module: moduleRecord('load_bridge', 'Load Bridge', 6,
      'Pin one body, Pull another: a tensioned bridge shares capped incoming impulse. Rig braces it at extra capacitor cost.'),
  },
]);

export const CATALYST_MODULES = Object.freeze(KINETIC_CATALYSTS.map(record => record.module));
export const CATALYST_CATALOG = KINETIC_CATALYSTS;

/** Unknown values stay unknown; an absent/invalid fitting never selects a default relic. */
export function resolveCatalyst(id) {
  return KINETIC_CATALYSTS.find(record => record.id === id || record.moduleId === id) || null;
}
