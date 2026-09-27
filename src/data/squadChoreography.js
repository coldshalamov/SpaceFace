// Shared formation-shape and recipe tables for virtual squad frames (§21A.10–.13).
// Data only: no world access, no motion writes. Spacing is a hull-clearance multiplier,
// not a universal world-unit constant.

export const SQUAD_RECIPE_INTERCEPTOR_SCISSORS = 'interceptor_scissors';
export const SQUAD_RECIPE_STANDOFF_GUNLINE = 'standoff_gunline';
export const SQUAD_RECIPE_PINCER_SWEEP = 'pincer_sweep';

export const SQUAD_SOCKET = Object.freeze({
  LEAD: 'lead',
  LEFT: 'left',
  RIGHT: 'right',
  REAR: 'rear',
});

export const SQUAD_TOKEN = Object.freeze({
  CLOSE_ATTACK: 'close_attack',
  RANGED_FIRE: 'ranged_fire',
  RESERVE: 'reserve',
});

export const SQUAD_PHASE = Object.freeze({
  INGRESS: 'ingress',
  TELEGRAPH: 'telegraph',
  COMMIT: 'commit',
  STRIKE: 'strike',
  EXTEND: 'extend',
  REFORM: 'reform',
  RECOVER: 'recover',
});

const SOCKETS_4 = Object.freeze([
  SQUAD_SOCKET.LEAD,
  SQUAD_SOCKET.LEFT,
  SQUAD_SOCKET.RIGHT,
  SQUAD_SOCKET.REAR,
]);

export const FORMATION_SHAPE_WEDGE_4 = Object.freeze({
  id: 'formation_attack_wedge_4',
  family: 'wedge',
  sockets: SOCKETS_4,
  slots: Object.freeze({
    lead: Object.freeze({ right: 0, forward: 0, facing: 'frame' }),
    left: Object.freeze({ right: -0.72, forward: -1, facing: 'frame' }),
    right: Object.freeze({ right: 0.72, forward: -1, facing: 'frame' }),
    rear: Object.freeze({ right: 0, forward: -1.85, facing: 'threat' }),
  }),
  spacingRule: 'dynamic_hull_clearance',
  morphTargets: Object.freeze(['formation_attack_fan_4']),
});

export const FORMATION_SHAPE_FAN_4 = Object.freeze({
  id: 'formation_attack_fan_4',
  family: 'fan',
  sockets: SOCKETS_4,
  slots: Object.freeze({
    lead: Object.freeze({ right: 0, forward: 0.12, facing: 'threat' }),
    left: Object.freeze({ right: -1.38, forward: -0.52, facing: 'threat' }),
    right: Object.freeze({ right: 1.38, forward: -0.52, facing: 'threat' }),
    rear: Object.freeze({ right: 0, forward: -1.62, facing: 'threat' }),
  }),
  spacingRule: 'dynamic_hull_clearance',
  morphTargets: Object.freeze(['formation_attack_wedge_4']),
});

// Firing line: sockets abreast across the approach rail so every gun bears on the threat.
// This is the shape that makes a squad read as "a formation at a distance pointing at the
// enemy" — the standoff gunline's strike pose.
export const FORMATION_SHAPE_LINE_4 = Object.freeze({
  id: 'formation_standoff_line_4',
  family: 'line',
  sockets: SOCKETS_4,
  slots: Object.freeze({
    lead: Object.freeze({ right: 0, forward: 0.3, facing: 'threat' }),
    left: Object.freeze({ right: -1.75, forward: -0.15, facing: 'threat' }),
    right: Object.freeze({ right: 1.75, forward: -0.15, facing: 'threat' }),
    rear: Object.freeze({ right: 0, forward: -1.15, facing: 'threat' }),
  }),
  spacingRule: 'dynamic_hull_clearance',
  morphTargets: Object.freeze(['formation_attack_wedge_4', 'formation_attack_fan_4']),
});

// Wide pair-split: the two wings read as separate pincers converging on the target axis.
export const FORMATION_SHAPE_SPLIT_4 = Object.freeze({
  id: 'formation_pincer_split_4',
  family: 'split',
  sockets: SOCKETS_4,
  slots: Object.freeze({
    lead: Object.freeze({ right: 0, forward: -0.5, facing: 'frame' }),
    left: Object.freeze({ right: -2.4, forward: -0.5, facing: 'frame' }),
    right: Object.freeze({ right: 2.4, forward: -0.5, facing: 'frame' }),
    rear: Object.freeze({ right: 0, forward: -1.9, facing: 'threat' }),
  }),
  spacingRule: 'dynamic_hull_clearance',
  morphTargets: Object.freeze(['formation_attack_wedge_4']),
});

export const FORMATION_SHAPES = Object.freeze({
  [FORMATION_SHAPE_WEDGE_4.id]: FORMATION_SHAPE_WEDGE_4,
  [FORMATION_SHAPE_FAN_4.id]: FORMATION_SHAPE_FAN_4,
  [FORMATION_SHAPE_LINE_4.id]: FORMATION_SHAPE_LINE_4,
  [FORMATION_SHAPE_SPLIT_4.id]: FORMATION_SHAPE_SPLIT_4,
  wedge_4: FORMATION_SHAPE_WEDGE_4,
  fan_4: FORMATION_SHAPE_FAN_4,
  line_4: FORMATION_SHAPE_LINE_4,
  split_4: FORMATION_SHAPE_SPLIT_4,
});

export const INTERCEPTOR_SCISSORS_RECIPE = Object.freeze({
  id: SQUAD_RECIPE_INTERCEPTOR_SCISSORS,
  family: 'interceptor_scissors',
  memberCount: 4,
  shapes: Object.freeze({
    ingress: FORMATION_SHAPE_WEDGE_4.id,
    telegraph: FORMATION_SHAPE_FAN_4.id,
    reform: FORMATION_SHAPE_WEDGE_4.id,
  }),
  tokens: Object.freeze({
    close_attack: 2,
    ranged_fire: 1,
    reserve: 1,
  }),
  sockets: Object.freeze({
    lead: Object.freeze({ role: 'leader', tokens: Object.freeze([SQUAD_TOKEN.RESERVE]) }),
    left: Object.freeze({ role: 'striker', tokens: Object.freeze([SQUAD_TOKEN.CLOSE_ATTACK]) }),
    right: Object.freeze({ role: 'striker', tokens: Object.freeze([SQUAD_TOKEN.CLOSE_ATTACK]) }),
    rear: Object.freeze({ role: 'support', tokens: Object.freeze([SQUAD_TOKEN.RANGED_FIRE]) }),
  }),
  // Capability band is a fraction of the kind intercept cap (§21A.13 step 1).
  ingressSpeedFraction: 0.85,
  telegraphSpeedFraction: 0.82,
  strikeSpeedFraction: 1.0,
  extendSpeedFraction: 0.94,
  reformSpeedFraction: 0.72,
  telegraphRange: 520,
  commitRange: 260,
  strikeRange: 170,
  extendAway: 250,
  leaderStandoff: 168,
  supportStandoff: 248,
  laneHalfWidth: 0.42,
  laneHysteresis: 0.55,
  morphTelegraphS: 0.6,
  morphCommitS: 0.8,
  morphReformS: 1.2,
  strikeWindowS: 0.9,
  extendHoldS: 1.35,
  successorGraceS: 0.6,
  deformRadiusMult: 2.35,
  coastMinS: 1.05,
  coastMaxS: 2.6,
});

// Standoff gunline: the squad morphs into a firing line, parks at strikeHoldRange, and
// volleys on every live token until the window ends or the target escapes the band — then
// extends, reforms, and cycles again. The WoW-pull shape: form up at distance, face the
// enemy, shoot. `strikeMode:'hold'` is the whole difference from a passing run.
export const STANDOFF_GUNLINE_RECIPE = Object.freeze({
  id: SQUAD_RECIPE_STANDOFF_GUNLINE,
  family: 'standoff_gunline',
  memberCount: 4,
  shapes: Object.freeze({
    ingress: FORMATION_SHAPE_WEDGE_4.id,
    telegraph: FORMATION_SHAPE_FAN_4.id,
    strike: FORMATION_SHAPE_LINE_4.id,
    reform: FORMATION_SHAPE_WEDGE_4.id,
  }),
  tokens: Object.freeze({
    close_attack: 0,
    ranged_fire: 3,
    reserve: 1,
  }),
  sockets: Object.freeze({
    lead: Object.freeze({ role: 'leader', tokens: Object.freeze([SQUAD_TOKEN.RANGED_FIRE]) }),
    left: Object.freeze({ role: 'gunner', tokens: Object.freeze([SQUAD_TOKEN.RANGED_FIRE]) }),
    right: Object.freeze({ role: 'gunner', tokens: Object.freeze([SQUAD_TOKEN.RANGED_FIRE]) }),
    rear: Object.freeze({ role: 'support', tokens: Object.freeze([SQUAD_TOKEN.RESERVE]) }),
  }),
  ingressSpeedFraction: 0.68,
  telegraphSpeedFraction: 0.7,
  strikeSpeedFraction: 0.42,
  extendSpeedFraction: 0.8,
  reformSpeedFraction: 0.62,
  telegraphRange: 720,
  commitRange: 520,
  strikeRange: 470,
  strikeMode: 'hold',
  strikeHoldRange: 420,
  strikeHoldS: 4.4,
  strikeHoldBreakRange: 900,
  // Tokens allowed to shoot during the hold. Reserve stays dry so someone always keeps
  // discipline for the next cycle.
  volleyTokens: Object.freeze([SQUAD_TOKEN.CLOSE_ATTACK, SQUAD_TOKEN.RANGED_FIRE]),
  extendAway: 300,
  leaderStandoff: 150,
  supportStandoff: 210,
  laneHalfWidth: 0.42,
  laneHysteresis: 0.55,
  morphTelegraphS: 0.9,
  morphCommitS: 1.1,
  morphReformS: 1.3,
  strikeWindowS: 0.9,
  extendHoldS: 1.5,
  successorGraceS: 0.6,
  deformRadiusMult: 2.5,
  coastMinS: 1.05,
  coastMaxS: 2.6,
});

// Pincer sweep: a faster, wider scissors — every ship carries a close_attack token and the
// telegraph splits into two converging wings so the pass reads as a deliberate envelopment.
export const PINCER_SWEEP_RECIPE = Object.freeze({
  id: SQUAD_RECIPE_PINCER_SWEEP,
  family: 'pincer_sweep',
  memberCount: 4,
  shapes: Object.freeze({
    ingress: FORMATION_SHAPE_WEDGE_4.id,
    telegraph: FORMATION_SHAPE_SPLIT_4.id,
    reform: FORMATION_SHAPE_WEDGE_4.id,
  }),
  tokens: Object.freeze({
    close_attack: 3,
    ranged_fire: 1,
    reserve: 0,
  }),
  sockets: Object.freeze({
    lead: Object.freeze({ role: 'leader', tokens: Object.freeze([SQUAD_TOKEN.CLOSE_ATTACK]) }),
    left: Object.freeze({ role: 'striker', tokens: Object.freeze([SQUAD_TOKEN.CLOSE_ATTACK]) }),
    right: Object.freeze({ role: 'striker', tokens: Object.freeze([SQUAD_TOKEN.CLOSE_ATTACK]) }),
    rear: Object.freeze({ role: 'support', tokens: Object.freeze([SQUAD_TOKEN.RANGED_FIRE]) }),
  }),
  ingressSpeedFraction: 0.85,
  telegraphSpeedFraction: 0.8,
  strikeSpeedFraction: 1.0,
  extendSpeedFraction: 0.94,
  reformSpeedFraction: 0.72,
  telegraphRange: 560,
  commitRange: 290,
  strikeRange: 190,
  extendAway: 280,
  leaderStandoff: 160,
  supportStandoff: 250,
  laneHalfWidth: 0.62,
  laneHysteresis: 0.55,
  morphTelegraphS: 0.7,
  morphCommitS: 0.8,
  morphReformS: 1.2,
  strikeWindowS: 1.0,
  extendHoldS: 1.35,
  successorGraceS: 0.6,
  deformRadiusMult: 2.5,
  coastMinS: 1.05,
  coastMaxS: 2.6,
});

export const SQUAD_RECIPES = Object.freeze({
  [SQUAD_RECIPE_INTERCEPTOR_SCISSORS]: INTERCEPTOR_SCISSORS_RECIPE,
  [SQUAD_RECIPE_STANDOFF_GUNLINE]: STANDOFF_GUNLINE_RECIPE,
  [SQUAD_RECIPE_PINCER_SWEEP]: PINCER_SWEEP_RECIPE,
});

export const COHORT_RECIPE_RIVER = 'fodder_river';
export const COHORT_RECIPE_CRESCENT = 'fodder_crescent';

export const COHORT_PHASE = Object.freeze({
  STREAM: 'stream',
  PRESS: 'press',
  REFORM: 'reform',
});

export const COHORT_SHAPE_RIVER = Object.freeze({
  id: 'cohort_river',
  family: 'river',
  spacingRule: 'dynamic_hull_clearance',
});

export const COHORT_SHAPE_CRESCENT = Object.freeze({
  id: 'cohort_crescent',
  family: 'crescent',
  spacingRule: 'dynamic_hull_clearance',
});

export const COHORT_SHAPES = Object.freeze({
  [COHORT_SHAPE_RIVER.id]: COHORT_SHAPE_RIVER,
  [COHORT_SHAPE_CRESCENT.id]: COHORT_SHAPE_CRESCENT,
  river: COHORT_SHAPE_RIVER,
  crescent: COHORT_SHAPE_CRESCENT,
});

const FODDER_COAST = Object.freeze({
  coastMinS: 0.82,
  coastMaxS: 1.35,
  deformRadiusMult: 1.85,
  reformPolicy: 'rejoin_slots',
  queryRadius: 64,
  separationRadius: 48,
});

export const FODDER_RIVER_RECIPE = Object.freeze({
  id: COHORT_RECIPE_RIVER,
  family: 'fodder_cohort',
  shape: 'river',
  memberCount: 12,
  cruiseSpeed: 50,
  speedBand: Object.freeze({ min: 38, max: 58 }),
  densityTarget: 44,
  laneSpacing: 46,
  alongSpacing: 46,
  corridorWidth: 150,
  standoff: 0,
  pressureGain: 0.18,
  arcSpan: 0,
  arcRadius: 0,
  ...FODDER_COAST,
});

export const FODDER_CRESCENT_RECIPE = Object.freeze({
  id: COHORT_RECIPE_CRESCENT,
  family: 'fodder_cohort',
  shape: 'crescent',
  memberCount: 12,
  cruiseSpeed: 22,
  speedBand: Object.freeze({ min: 12, max: 36 }),
  densityTarget: 40,
  laneSpacing: 40,
  alongSpacing: 40,
  corridorWidth: 220,
  standoff: 240,
  pressureGain: 0.08,
  arcSpan: 2.15,
  arcRadius: 168,
  ...FODDER_COAST,
});

export const COHORT_RECIPES = Object.freeze({
  [COHORT_RECIPE_RIVER]: FODDER_RIVER_RECIPE,
  [COHORT_RECIPE_CRESCENT]: FODDER_CRESCENT_RECIPE,
});

export function getSquadRecipe(id) {
  return SQUAD_RECIPES[id] || null;
}

export function getCohortRecipe(id) {
  return COHORT_RECIPES[id] || null;
}

export function getFormationShape(id) {
  return FORMATION_SHAPES[id] || null;
}

export function getCohortShape(id) {
  return COHORT_SHAPES[id] || null;
}

export function hullClearanceSpacing(radii, scale = 1) {
  let maxR = 8;
  const list = radii || [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (Number.isFinite(r) && r > maxR) maxR = r;
  }
  const hullToHull = maxR * 2;
  const gap = Math.max(18, maxR * 1.05);
  const base = hullToHull + gap;
  const spacingScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return base * spacingScale;
}

export function hullClearanceBar(radii) {
  let maxR = 8;
  const list = radii || [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (Number.isFinite(r) && r > maxR) maxR = r;
  }
  return maxR * 2 + 4;
}
