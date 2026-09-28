// Shared formation-shape and recipe tables for virtual squad frames (§21A.10–.13).
// Data only: no world access, no motion writes. Spacing is a hull-clearance multiplier,
// not a universal world-unit constant.

export const SQUAD_RECIPE_INTERCEPTOR_SCISSORS = 'interceptor_scissors';
export const SQUAD_RECIPE_STANDOFF_GUNLINE = 'standoff_gunline';
export const SQUAD_RECIPE_PINCER_SWEEP = 'pincer_sweep';
export const SQUAD_RECIPE_HARASSMENT_RING = 'harassment_ring';
export const SQUAD_RECIPE_PICKET_WALL = 'picket_wall';
export const SQUAD_RECIPE_WOLFPACK_QUARTER = 'wolfpack_quarter';
export const SQUAD_RECIPE_FEINT_PASS = 'feint_pass';
export const SQUAD_RECIPE_BURNING_PASS = 'burning_pass';
export const SQUAD_RECIPE_SIEGE_ORBIT = 'siege_orbit';
export const SQUAD_RECIPE_SHEPHERD_NET = 'shepherd_net';
export const SQUAD_RECIPE_HUNTER_PAIR = 'hunter_pair';
export const SQUAD_RECIPE_CONVOY_COLUMN = 'convoy_column';

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

// Crescent: an arc cupped around the threat axis — the harassment ring's firing pose.
// `orbit` on a slot signs the drift direction when a recipe carries strikeOrbitRate.
export const FORMATION_SHAPE_CRESCENT_4 = Object.freeze({
  id: 'formation_crescent_4',
  family: 'crescent',
  sockets: SOCKETS_4,
  slots: Object.freeze({
    lead: Object.freeze({ right: 0, forward: -0.3, facing: 'threat', orbit: 0 }),
    left: Object.freeze({ right: -2.3, forward: -1.0, facing: 'threat', orbit: -1 }),
    right: Object.freeze({ right: 2.3, forward: -1.0, facing: 'threat', orbit: 1 }),
    rear: Object.freeze({ right: 0, forward: -1.7, facing: 'threat', orbit: 0 }),
  }),
  spacingRule: 'dynamic_hull_clearance',
  morphTargets: Object.freeze(['formation_attack_wedge_4', 'formation_attack_fan_4']),
});

// Picket wall: a wide flat wall that holds a gate line at long range.
export const FORMATION_SHAPE_PICKET_4 = Object.freeze({
  id: 'formation_picket_wall_4',
  family: 'picket',
  sockets: SOCKETS_4,
  slots: Object.freeze({
    lead: Object.freeze({ right: 0, forward: 0.25, facing: 'threat', orbit: 0 }),
    left: Object.freeze({ right: -2.7, forward: 0, facing: 'threat', orbit: -1 }),
    right: Object.freeze({ right: 2.7, forward: 0, facing: 'threat', orbit: 1 }),
    rear: Object.freeze({ right: 0, forward: -0.9, facing: 'threat', orbit: 0 }),
  }),
  spacingRule: 'dynamic_hull_clearance',
  morphTargets: Object.freeze(['formation_standoff_line_4']),
});

// Quarter: diagonal pairs — the wolfpack's staggered-run posture.
export const FORMATION_SHAPE_QUARTER_4 = Object.freeze({
  id: 'formation_quarter_4',
  family: 'quarter',
  sockets: SOCKETS_4,
  slots: Object.freeze({
    lead: Object.freeze({ right: -1.1, forward: -0.2, facing: 'frame', orbit: 0 }),
    left: Object.freeze({ right: -1.8, forward: -1.5, facing: 'threat', orbit: -1 }),
    right: Object.freeze({ right: 1.8, forward: -1.5, facing: 'threat', orbit: 1 }),
    rear: Object.freeze({ right: 1.1, forward: -0.2, facing: 'frame', orbit: 0 }),
  }),
  spacingRule: 'dynamic_hull_clearance',
  morphTargets: Object.freeze(['formation_attack_wedge_4', 'formation_pincer_split_4']),
});

// Net: a trailing basket that closes behind the target — shepherd geometry.
export const FORMATION_SHAPE_NET_4 = Object.freeze({
  id: 'formation_net_4',
  family: 'net',
  sockets: SOCKETS_4,
  slots: Object.freeze({
    lead: Object.freeze({ right: 0, forward: -1.9, facing: 'threat', orbit: 0 }),
    left: Object.freeze({ right: -2.6, forward: -0.7, facing: 'threat', orbit: -1 }),
    right: Object.freeze({ right: 2.6, forward: -0.7, facing: 'threat', orbit: 1 }),
    rear: Object.freeze({ right: 0, forward: 0.3, facing: 'threat', orbit: 0 }),
  }),
  spacingRule: 'dynamic_hull_clearance',
  morphTargets: Object.freeze(['formation_attack_fan_4']),
});

// Column: single-file transit posture — convoys, escorted logistics, narrow lanes.
export const FORMATION_SHAPE_COLUMN_4 = Object.freeze({
  id: 'formation_column_4',
  family: 'column',
  sockets: SOCKETS_4,
  slots: Object.freeze({
    lead: Object.freeze({ right: 0, forward: 0.1, facing: 'frame', orbit: 0 }),
    left: Object.freeze({ right: 0, forward: -1.1, facing: 'frame', orbit: 0 }),
    right: Object.freeze({ right: 0, forward: -2.2, facing: 'frame', orbit: 0 }),
    rear: Object.freeze({ right: 0, forward: -3.3, facing: 'threat', orbit: 0 }),
  }),
  spacingRule: 'dynamic_hull_clearance',
  morphTargets: Object.freeze(['formation_picket_wall_4', 'formation_attack_fan_4']),
});

// Spur: wide horns ahead of a deep pivot — the feint's "horns forward" posture.
export const FORMATION_SHAPE_SPUR_4 = Object.freeze({
  id: 'formation_spur_4',
  family: 'spur',
  sockets: SOCKETS_4,
  slots: Object.freeze({
    lead: Object.freeze({ right: 0, forward: -0.5, facing: 'frame', orbit: 0 }),
    left: Object.freeze({ right: -3.0, forward: -0.3, facing: 'threat', orbit: -1 }),
    right: Object.freeze({ right: 3.0, forward: -0.3, facing: 'threat', orbit: 1 }),
    rear: Object.freeze({ right: 0, forward: -1.4, facing: 'threat', orbit: 0 }),
  }),
  spacingRule: 'dynamic_hull_clearance',
  morphTargets: Object.freeze(['formation_pincer_split_4']),
});

export const FORMATION_SHAPES = Object.freeze({
  [FORMATION_SHAPE_WEDGE_4.id]: FORMATION_SHAPE_WEDGE_4,
  [FORMATION_SHAPE_FAN_4.id]: FORMATION_SHAPE_FAN_4,
  [FORMATION_SHAPE_LINE_4.id]: FORMATION_SHAPE_LINE_4,
  [FORMATION_SHAPE_SPLIT_4.id]: FORMATION_SHAPE_SPLIT_4,
  [FORMATION_SHAPE_CRESCENT_4.id]: FORMATION_SHAPE_CRESCENT_4,
  [FORMATION_SHAPE_PICKET_4.id]: FORMATION_SHAPE_PICKET_4,
  [FORMATION_SHAPE_QUARTER_4.id]: FORMATION_SHAPE_QUARTER_4,
  [FORMATION_SHAPE_NET_4.id]: FORMATION_SHAPE_NET_4,
  [FORMATION_SHAPE_COLUMN_4.id]: FORMATION_SHAPE_COLUMN_4,
  [FORMATION_SHAPE_SPUR_4.id]: FORMATION_SHAPE_SPUR_4,
  wedge_4: FORMATION_SHAPE_WEDGE_4,
  fan_4: FORMATION_SHAPE_FAN_4,
  line_4: FORMATION_SHAPE_LINE_4,
  split_4: FORMATION_SHAPE_SPLIT_4,
  crescent_4: FORMATION_SHAPE_CRESCENT_4,
  picket_4: FORMATION_SHAPE_PICKET_4,
  quarter_4: FORMATION_SHAPE_QUARTER_4,
  net_4: FORMATION_SHAPE_NET_4,
  column_4: FORMATION_SHAPE_COLUMN_4,
  spur_4: FORMATION_SHAPE_SPUR_4,
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

// Harassment ring: morph into the crescent around the target and hold it there while the
// ring slowly carousels — strikeOrbitRate drifts each socket's slot along its signed orbit
// direction so the formation visibly circles the target instead of hovering static.
export const HARASSMENT_RING_RECIPE = Object.freeze({
  id: SQUAD_RECIPE_HARASSMENT_RING,
  family: 'harassment_ring',
  memberCount: 4,
  shapes: Object.freeze({
    ingress: FORMATION_SHAPE_WEDGE_4.id,
    telegraph: FORMATION_SHAPE_FAN_4.id,
    strike: FORMATION_SHAPE_CRESCENT_4.id,
    reform: FORMATION_SHAPE_WEDGE_4.id,
  }),
  tokens: Object.freeze({
    close_attack: 1,
    ranged_fire: 2,
    reserve: 1,
  }),
  sockets: Object.freeze({
    lead: Object.freeze({ role: 'leader', tokens: Object.freeze([SQUAD_TOKEN.RANGED_FIRE]) }),
    left: Object.freeze({ role: 'striker', tokens: Object.freeze([SQUAD_TOKEN.CLOSE_ATTACK]) }),
    right: Object.freeze({ role: 'striker', tokens: Object.freeze([SQUAD_TOKEN.RANGED_FIRE]) }),
    rear: Object.freeze({ role: 'support', tokens: Object.freeze([SQUAD_TOKEN.RESERVE]) }),
  }),
  ingressSpeedFraction: 0.8,
  telegraphSpeedFraction: 0.74,
  strikeSpeedFraction: 0.55,
  extendSpeedFraction: 0.85,
  reformSpeedFraction: 0.66,
  telegraphRange: 600,
  commitRange: 380,
  strikeRange: 340,
  strikeMode: 'hold',
  strikeHoldRange: 330,
  strikeHoldS: 4.0,
  strikeHoldBreakRange: 760,
  strikeOrbitRate: 0.1,
  volleyTokens: Object.freeze([SQUAD_TOKEN.CLOSE_ATTACK, SQUAD_TOKEN.RANGED_FIRE]),
  extendAway: 280,
  leaderStandoff: 160,
  supportStandoff: 230,
  laneHalfWidth: 0.5,
  laneHysteresis: 0.55,
  morphTelegraphS: 0.8,
  morphCommitS: 1.0,
  morphReformS: 1.2,
  strikeWindowS: 0.9,
  extendHoldS: 1.4,
  successorGraceS: 0.6,
  deformRadiusMult: 2.4,
  coastMinS: 1.05,
  coastMaxS: 2.6,
});

// Picket wall: a gate line. The squad fans into the wide wall at very long range and volleys
// — the shape that reads as a blockade or checkpoint defense.
export const PICKET_WALL_RECIPE = Object.freeze({
  id: SQUAD_RECIPE_PICKET_WALL,
  family: 'picket_wall',
  memberCount: 4,
  shapes: Object.freeze({
    ingress: FORMATION_SHAPE_LINE_4.id,
    telegraph: FORMATION_SHAPE_LINE_4.id,
    strike: FORMATION_SHAPE_PICKET_4.id,
    reform: FORMATION_SHAPE_LINE_4.id,
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
  ingressSpeedFraction: 0.6,
  telegraphSpeedFraction: 0.6,
  strikeSpeedFraction: 0.34,
  extendSpeedFraction: 0.7,
  reformSpeedFraction: 0.55,
  telegraphRange: 780,
  commitRange: 560,
  strikeRange: 520,
  strikeMode: 'hold',
  strikeHoldRange: 500,
  strikeHoldS: 5.2,
  strikeHoldBreakRange: 980,
  volleyTokens: Object.freeze([SQUAD_TOKEN.CLOSE_ATTACK, SQUAD_TOKEN.RANGED_FIRE]),
  extendAway: 260,
  leaderStandoff: 160,
  supportStandoff: 220,
  laneHalfWidth: 0.4,
  laneHysteresis: 0.55,
  morphTelegraphS: 1.1,
  morphCommitS: 1.2,
  morphReformS: 1.4,
  strikeWindowS: 0.9,
  extendHoldS: 1.6,
  successorGraceS: 0.6,
  deformRadiusMult: 2.6,
  coastMinS: 1.05,
  coastMaxS: 2.6,
});

// Wolfpack quarter: staggered quartering runs — pairs cross the target on alternating
// diagonals, reform fast, and run again. The relentless pack-hunter feel.
export const WOLFPACK_QUARTER_RECIPE = Object.freeze({
  id: SQUAD_RECIPE_WOLFPACK_QUARTER,
  family: 'wolfpack_quarter',
  memberCount: 4,
  shapes: Object.freeze({
    ingress: FORMATION_SHAPE_QUARTER_4.id,
    telegraph: FORMATION_SHAPE_SPLIT_4.id,
    reform: FORMATION_SHAPE_QUARTER_4.id,
  }),
  tokens: Object.freeze({
    close_attack: 2,
    ranged_fire: 1,
    reserve: 1,
  }),
  sockets: Object.freeze({
    lead: Object.freeze({ role: 'leader', tokens: Object.freeze([SQUAD_TOKEN.CLOSE_ATTACK]) }),
    left: Object.freeze({ role: 'striker', tokens: Object.freeze([SQUAD_TOKEN.CLOSE_ATTACK]) }),
    right: Object.freeze({ role: 'striker', tokens: Object.freeze([SQUAD_TOKEN.RANGED_FIRE]) }),
    rear: Object.freeze({ role: 'support', tokens: Object.freeze([SQUAD_TOKEN.RESERVE]) }),
  }),
  ingressSpeedFraction: 0.82,
  telegraphSpeedFraction: 0.78,
  strikeSpeedFraction: 1.0,
  extendSpeedFraction: 0.9,
  reformSpeedFraction: 0.7,
  telegraphRange: 540,
  commitRange: 270,
  strikeRange: 200,
  extendAway: 260,
  leaderStandoff: 160,
  supportStandoff: 240,
  laneHalfWidth: 0.58,
  laneHysteresis: 0.55,
  morphTelegraphS: 0.7,
  morphCommitS: 0.8,
  morphReformS: 0.85,
  strikeWindowS: 0.8,
  extendHoldS: 1.1,
  successorGraceS: 0.6,
  deformRadiusMult: 2.4,
  coastMinS: 1.05,
  coastMaxS: 2.6,
});

// Feint pass: horns forward, a short hard hold inside knife range, then a long extend —
// the bait swoop that invites pursuit before the re-commit.
export const FEINT_PASS_RECIPE = Object.freeze({
  id: SQUAD_RECIPE_FEINT_PASS,
  family: 'feint_pass',
  memberCount: 4,
  shapes: Object.freeze({
    ingress: FORMATION_SHAPE_SPUR_4.id,
    telegraph: FORMATION_SHAPE_SPUR_4.id,
    strike: FORMATION_SHAPE_SPUR_4.id,
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
  ingressSpeedFraction: 0.78,
  telegraphSpeedFraction: 0.72,
  strikeSpeedFraction: 0.9,
  extendSpeedFraction: 1.0,
  reformSpeedFraction: 0.7,
  telegraphRange: 500,
  commitRange: 240,
  strikeRange: 190,
  strikeMode: 'hold',
  strikeHoldRange: 185,
  strikeHoldS: 1.3,
  strikeHoldBreakRange: 420,
  volleyTokens: Object.freeze([SQUAD_TOKEN.CLOSE_ATTACK, SQUAD_TOKEN.RANGED_FIRE]),
  extendAway: 340,
  leaderStandoff: 150,
  supportStandoff: 230,
  laneHalfWidth: 0.5,
  laneHysteresis: 0.55,
  morphTelegraphS: 0.7,
  morphCommitS: 0.7,
  morphReformS: 1.0,
  strikeWindowS: 0.9,
  extendHoldS: 2.2,
  successorGraceS: 0.6,
  deformRadiusMult: 2.3,
  coastMinS: 1.05,
  coastMaxS: 2.6,
});

// Burning pass: no hold, no weave — maximum-speed drag run through the firing line and a
// long reform. The shape a charge reads as when the squad is all throttle.
export const BURNING_PASS_RECIPE = Object.freeze({
  id: SQUAD_RECIPE_BURNING_PASS,
  family: 'burning_pass',
  memberCount: 4,
  shapes: Object.freeze({
    ingress: FORMATION_SHAPE_WEDGE_4.id,
    telegraph: FORMATION_SHAPE_WEDGE_4.id,
    reform: FORMATION_SHAPE_WEDGE_4.id,
  }),
  tokens: Object.freeze({
    close_attack: 3,
    ranged_fire: 0,
    reserve: 1,
  }),
  sockets: Object.freeze({
    lead: Object.freeze({ role: 'leader', tokens: Object.freeze([SQUAD_TOKEN.CLOSE_ATTACK]) }),
    left: Object.freeze({ role: 'striker', tokens: Object.freeze([SQUAD_TOKEN.CLOSE_ATTACK]) }),
    right: Object.freeze({ role: 'striker', tokens: Object.freeze([SQUAD_TOKEN.CLOSE_ATTACK]) }),
    rear: Object.freeze({ role: 'support', tokens: Object.freeze([SQUAD_TOKEN.RESERVE]) }),
  }),
  ingressSpeedFraction: 1.0,
  telegraphSpeedFraction: 0.95,
  strikeSpeedFraction: 1.0,
  extendSpeedFraction: 1.0,
  reformSpeedFraction: 0.75,
  telegraphRange: 560,
  commitRange: 300,
  strikeRange: 170,
  extendAway: 420,
  leaderStandoff: 150,
  supportStandoff: 230,
  laneHalfWidth: 0.38,
  laneHysteresis: 0.55,
  morphTelegraphS: 0.5,
  morphCommitS: 0.6,
  morphReformS: 1.6,
  strikeWindowS: 0.85,
  extendHoldS: 1.7,
  successorGraceS: 0.6,
  deformRadiusMult: 2.3,
  coastMinS: 1.05,
  coastMaxS: 2.6,
});

// Siege orbit: the long-range gun carousel — a wide crescent parked far out, drifting
// slowly around the target while the ranged guns cycle.
export const SIEGE_ORBIT_RECIPE = Object.freeze({
  id: SQUAD_RECIPE_SIEGE_ORBIT,
  family: 'siege_orbit',
  memberCount: 4,
  shapes: Object.freeze({
    ingress: FORMATION_SHAPE_WEDGE_4.id,
    telegraph: FORMATION_SHAPE_CRESCENT_4.id,
    strike: FORMATION_SHAPE_CRESCENT_4.id,
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
  ingressSpeedFraction: 0.6,
  telegraphSpeedFraction: 0.58,
  strikeSpeedFraction: 0.42,
  extendSpeedFraction: 0.7,
  reformSpeedFraction: 0.55,
  telegraphRange: 760,
  commitRange: 540,
  strikeRange: 490,
  strikeMode: 'hold',
  strikeHoldRange: 480,
  strikeHoldS: 5.6,
  strikeHoldBreakRange: 960,
  strikeOrbitRate: 0.06,
  volleyTokens: Object.freeze([SQUAD_TOKEN.RANGED_FIRE]),
  extendAway: 300,
  leaderStandoff: 160,
  supportStandoff: 220,
  laneHalfWidth: 0.4,
  laneHysteresis: 0.55,
  morphTelegraphS: 1.1,
  morphCommitS: 1.2,
  morphReformS: 1.4,
  strikeWindowS: 0.9,
  extendHoldS: 1.6,
  successorGraceS: 0.6,
  deformRadiusMult: 2.6,
  coastMinS: 1.05,
  coastMaxS: 2.6,
});

// Shepherd net: the squad drops a basket behind and around the target — it does not kill,
// it herds: the trailing net closes escape lanes while ranged sockets keep firing lanes.
export const SHEPHERD_NET_RECIPE = Object.freeze({
  id: SQUAD_RECIPE_SHEPHERD_NET,
  family: 'shepherd_net',
  memberCount: 4,
  shapes: Object.freeze({
    ingress: FORMATION_SHAPE_FAN_4.id,
    telegraph: FORMATION_SHAPE_NET_4.id,
    strike: FORMATION_SHAPE_NET_4.id,
    reform: FORMATION_SHAPE_FAN_4.id,
  }),
  tokens: Object.freeze({
    close_attack: 1,
    ranged_fire: 2,
    reserve: 1,
  }),
  sockets: Object.freeze({
    lead: Object.freeze({ role: 'leader', tokens: Object.freeze([SQUAD_TOKEN.RANGED_FIRE]) }),
    left: Object.freeze({ role: 'striker', tokens: Object.freeze([SQUAD_TOKEN.CLOSE_ATTACK]) }),
    right: Object.freeze({ role: 'striker', tokens: Object.freeze([SQUAD_TOKEN.RANGED_FIRE]) }),
    rear: Object.freeze({ role: 'support', tokens: Object.freeze([SQUAD_TOKEN.RESERVE]) }),
  }),
  ingressSpeedFraction: 0.72,
  telegraphSpeedFraction: 0.68,
  strikeSpeedFraction: 0.5,
  extendSpeedFraction: 0.78,
  reformSpeedFraction: 0.62,
  telegraphRange: 640,
  commitRange: 460,
  strikeRange: 430,
  strikeMode: 'hold',
  strikeHoldRange: 420,
  strikeHoldS: 4.6,
  strikeHoldBreakRange: 900,
  volleyTokens: Object.freeze([SQUAD_TOKEN.CLOSE_ATTACK, SQUAD_TOKEN.RANGED_FIRE]),
  extendAway: 300,
  leaderStandoff: 150,
  supportStandoff: 220,
  laneHalfWidth: 0.44,
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

// Hunter pair: the two-ship wing — no fancy morph, just alternating scissor runs.
// Two sockets are enough; sparse member lists leave the rest unfilled.
export const HUNTER_PAIR_RECIPE = Object.freeze({
  id: SQUAD_RECIPE_HUNTER_PAIR,
  family: 'hunter_pair',
  memberCount: 2,
  shapes: Object.freeze({
    ingress: FORMATION_SHAPE_FAN_4.id,
    telegraph: FORMATION_SHAPE_SPLIT_4.id,
    reform: FORMATION_SHAPE_FAN_4.id,
  }),
  tokens: Object.freeze({
    close_attack: 2,
    ranged_fire: 0,
    reserve: 0,
  }),
  sockets: Object.freeze({
    lead: Object.freeze({ role: 'leader', tokens: Object.freeze([SQUAD_TOKEN.CLOSE_ATTACK]) }),
    left: Object.freeze({ role: 'striker', tokens: Object.freeze([SQUAD_TOKEN.CLOSE_ATTACK]) }),
    right: Object.freeze({ role: 'striker', tokens: Object.freeze([SQUAD_TOKEN.CLOSE_ATTACK]) }),
    rear: Object.freeze({ role: 'support', tokens: Object.freeze([SQUAD_TOKEN.CLOSE_ATTACK]) }),
  }),
  ingressSpeedFraction: 0.88,
  telegraphSpeedFraction: 0.84,
  strikeSpeedFraction: 1.0,
  extendSpeedFraction: 0.92,
  reformSpeedFraction: 0.74,
  telegraphRange: 480,
  commitRange: 240,
  strikeRange: 160,
  extendAway: 240,
  leaderStandoff: 150,
  supportStandoff: 210,
  laneHalfWidth: 0.55,
  laneHysteresis: 0.55,
  morphTelegraphS: 0.55,
  morphCommitS: 0.7,
  morphReformS: 1.0,
  strikeWindowS: 0.9,
  extendHoldS: 1.2,
  successorGraceS: 0.6,
  deformRadiusMult: 2.3,
  coastMinS: 1.05,
  coastMaxS: 2.6,
});

// Convoy column: single-file escort posture that snaps into a picket wall when pressed —
// the "line up and protect the soft middle" read for escorted traffic.
export const CONVOY_COLUMN_RECIPE = Object.freeze({
  id: SQUAD_RECIPE_CONVOY_COLUMN,
  family: 'convoy_column',
  memberCount: 4,
  shapes: Object.freeze({
    ingress: FORMATION_SHAPE_COLUMN_4.id,
    telegraph: FORMATION_SHAPE_COLUMN_4.id,
    strike: FORMATION_SHAPE_PICKET_4.id,
    reform: FORMATION_SHAPE_COLUMN_4.id,
  }),
  tokens: Object.freeze({
    close_attack: 1,
    ranged_fire: 2,
    reserve: 1,
  }),
  sockets: Object.freeze({
    lead: Object.freeze({ role: 'leader', tokens: Object.freeze([SQUAD_TOKEN.RANGED_FIRE]) }),
    left: Object.freeze({ role: 'striker', tokens: Object.freeze([SQUAD_TOKEN.RANGED_FIRE]) }),
    right: Object.freeze({ role: 'striker', tokens: Object.freeze([SQUAD_TOKEN.CLOSE_ATTACK]) }),
    rear: Object.freeze({ role: 'support', tokens: Object.freeze([SQUAD_TOKEN.RESERVE]) }),
  }),
  ingressSpeedFraction: 0.55,
  telegraphSpeedFraction: 0.5,
  strikeSpeedFraction: 0.4,
  extendSpeedFraction: 0.62,
  reformSpeedFraction: 0.5,
  telegraphRange: 700,
  commitRange: 480,
  strikeRange: 400,
  strikeMode: 'hold',
  strikeHoldRange: 380,
  strikeHoldS: 4.8,
  strikeHoldBreakRange: 860,
  volleyTokens: Object.freeze([SQUAD_TOKEN.CLOSE_ATTACK, SQUAD_TOKEN.RANGED_FIRE]),
  extendAway: 240,
  leaderStandoff: 150,
  supportStandoff: 200,
  laneHalfWidth: 0.36,
  laneHysteresis: 0.55,
  morphTelegraphS: 1.2,
  morphCommitS: 1.3,
  morphReformS: 1.5,
  strikeWindowS: 0.9,
  extendHoldS: 1.7,
  successorGraceS: 0.6,
  deformRadiusMult: 2.5,
  coastMinS: 1.05,
  coastMaxS: 2.6,
});

export const SQUAD_RECIPES = Object.freeze({
  [SQUAD_RECIPE_INTERCEPTOR_SCISSORS]: INTERCEPTOR_SCISSORS_RECIPE,
  [SQUAD_RECIPE_STANDOFF_GUNLINE]: STANDOFF_GUNLINE_RECIPE,
  [SQUAD_RECIPE_PINCER_SWEEP]: PINCER_SWEEP_RECIPE,
  [SQUAD_RECIPE_HARASSMENT_RING]: HARASSMENT_RING_RECIPE,
  [SQUAD_RECIPE_PICKET_WALL]: PICKET_WALL_RECIPE,
  [SQUAD_RECIPE_WOLFPACK_QUARTER]: WOLFPACK_QUARTER_RECIPE,
  [SQUAD_RECIPE_FEINT_PASS]: FEINT_PASS_RECIPE,
  [SQUAD_RECIPE_BURNING_PASS]: BURNING_PASS_RECIPE,
  [SQUAD_RECIPE_SIEGE_ORBIT]: SIEGE_ORBIT_RECIPE,
  [SQUAD_RECIPE_SHEPHERD_NET]: SHEPHERD_NET_RECIPE,
  [SQUAD_RECIPE_HUNTER_PAIR]: HUNTER_PAIR_RECIPE,
  [SQUAD_RECIPE_CONVOY_COLUMN]: CONVOY_COLUMN_RECIPE,
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
