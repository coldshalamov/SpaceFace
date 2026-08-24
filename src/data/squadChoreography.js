// Shared formation-shape and recipe tables for virtual squad frames (§21A.10–.13).
// Data only: no world access, no motion writes. Spacing is a hull-clearance multiplier,
// not a universal world-unit constant.

export const SQUAD_RECIPE_INTERCEPTOR_SCISSORS = 'interceptor_scissors';

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

export const FORMATION_SHAPES = Object.freeze({
  [FORMATION_SHAPE_WEDGE_4.id]: FORMATION_SHAPE_WEDGE_4,
  [FORMATION_SHAPE_FAN_4.id]: FORMATION_SHAPE_FAN_4,
  wedge_4: FORMATION_SHAPE_WEDGE_4,
  fan_4: FORMATION_SHAPE_FAN_4,
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

export const SQUAD_RECIPES = Object.freeze({
  [SQUAD_RECIPE_INTERCEPTOR_SCISSORS]: INTERCEPTOR_SCISSORS_RECIPE,
});

export function getSquadRecipe(id) {
  return SQUAD_RECIPES[id] || null;
}

export function getFormationShape(id) {
  return FORMATION_SHAPES[id] || null;
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
