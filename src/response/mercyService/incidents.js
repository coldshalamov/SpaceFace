// Twelve board emergencies, four families, three authored cases each.
// Four of them fail forward into a distinct second incident that can still be flown.
// Child incidents are emergent: they are not on the contract board.

import { MODEL_IDS } from './models.js';

const BASE = Object.freeze({
  factionId: 'faction_free',
  clampMass: 40,
  spinLimit: 0.55,
  keEnvelope: 70,
  minArrest: 18,
  approachR: 22,
  assessR: 28,
  approachV: 18,
  approachHold: 0.2,
  assessHold: 0.4,
  stableHold: 0.28,
  secureHold: 0.22,
  extractHold: 0.3,
  extractSpeed: 8,
  abandonR: 170,
  abandonHold: 2.4,
  maxStep: 4.5,
});

function b(localId, model, role, x, z, extra = {}) {
  const vel = extra.vel || { x: 0, z: 0 };
  return {
    localId,
    model,
    role,
    pos: { x, z },
    vel: { x: vel.x, z: vel.z },
    angVel: extra.angVel || 0,
    mass: extra.mass ?? 10,
    radius: extra.radius ?? 3,
    toolR: extra.toolR ?? extra.radius ?? 3,
    hull: extra.hull ?? 60,
    kinematic: !!extra.kinematic,
    survivors: extra.survivors ?? 0,
    cargoCr: extra.cargoCr ?? 0,
    evidence: extra.evidence ?? 0,
    volatile: !!extra.volatile,
    ventPerS: extra.ventPerS ?? 0,
    driven: !!extra.driven,
    driveVel: extra.driveVel ? { x: extra.driveVel.x, z: extra.driveVel.z } : null,
    angVelDrive: extra.angVelDrive ?? null,
    rot: extra.rot ?? 0,
    field: extra.field ?? 0,
    horizon: extra.horizon ?? 0,
    strength: extra.strength ?? 0,
    recoveryRadius: extra.recoveryRadius ?? 0,
    damagePerS: extra.damagePerS ?? 0,
    pursue: extra.pursue ?? null,
    speed: extra.speed ?? 0,
    captureR: extra.captureR ?? 0,
    jitterAmp: extra.jitterAmp ?? 0,
    modelLock: extra.modelLock ?? null,
    startHullFrac: extra.startHullFrac ?? 1,
  };
}

function beacon(x, z) {
  return b('beacon', 'SF_MERCY_BEACON', 'beacon', x, z, {
    kinematic: true, radius: 1.3, toolR: 1.3, hull: 28, mass: 8,
  });
}
function berth(x, z) {
  return b('berth', 'SF_MERCY_BERTH', 'berth', x, z, {
    kinematic: true, radius: 6, toolR: 6, hull: 400, mass: 1e6, recoveryRadius: 20,
  });
}
function barge(x, z) {
  return b('barge', 'SF_MERCY_BARGE', 'barge', x, z, {
    kinematic: true, radius: 8, toolR: 8, hull: 400, mass: 1e6, recoveryRadius: 20,
  });
}

let boardSerial = 0;

function define(partial) {
  const board = partial.board !== false;
  const boardOrigin = partial.boardOrigin || (board
    ? { x: (boardSerial % 4) * 900, z: Math.floor(boardSerial / 4) * 900 }
    : { x: 0, z: 0 });
  if (board) boardSerial += 1;
  const def = {
    ...BASE,
    ...partial,
    board,
    boardOrigin,
    orders: partial.orders,
    bodies: partial.bodies,
    failure: partial.failure,
    rights: partial.rights,
    priority: partial.priority,
  };
  return def;
}

function ord(subject, dest, tools = [], extra = {}) {
  return { subject, dest, tools, pin: extra.pin || null, clear: extra.clear || null };
}

const RAW = [
  define({
    id: 'ms_drift_crusher',
    family: 'disabled_drift',
    title: 'Hauler drifting into a crusher jaw',
    defaultOrder: 'tether-berth',
    priority: 'Stop the hull before the jaw, then choose berth or barge.',
    rights: ['tow_disabled_hull', 'berth_recovery'],
    failure: {
      kind: 'contact', hazard: 'crusher', subject: 'hull', spawn: null,
      pathway: 'The jaw chews the hull into a dead wreck. No second contract. No payout.',
    },
    orders: {
      'tether-berth': ord('hull', 'berth'),
      'tether-barge': ord('hull', 'barge'),
    },
    bodies: [
      beacon(8, 28),
      b('hull', 'SF_MERCY_TANK', 'hull', 0, 34, {
        mass: 22, radius: 4, toolR: 4, vel: { x: 0, z: 3.2 }, survivors: 2, cargoCr: 400, hull: 80,
      }),
      b('crusher', 'SF_MERCY_SHEAR', 'hazard', 0, 86, {
        kinematic: true, radius: 5, toolR: 5, hull: 500, damagePerS: 90,
      }),
      berth(-34, 16),
      barge(-34, 52),
    ],
  }),
  define({
    id: 'ms_drift_well',
    family: 'disabled_drift',
    title: 'Tumbling hull sliding into a gravity shear',
    defaultOrder: 'stabilizer-berth',
    priority: 'Kill the tumble before the line will hold, then tow clear of the mouth.',
    rights: ['tow_disabled_hull', 'stabilize_tumble'],
    failure: {
      kind: 'horizon', hazard: 'well', subject: 'hull', spawn: null,
      pathway: 'The mouth takes the hull. The wreck stays in the well. No payout.',
    },
    orders: {
      'stabilizer-berth': ord('hull', 'berth', ['stabilizer']),
      'stabilizer-barge': ord('hull', 'barge', ['stabilizer']),
    },
    bodies: [
      beacon(10, 24),
      b('hull', 'SF_MERCY_TANK', 'hull', 0, 30, {
        mass: 18, radius: 4, toolR: 4, vel: { x: 0, z: 3.1 }, angVel: 3.5,
        survivors: 3, hull: 70,
      }),
      b('well', 'SF_MERCY_WELL', 'well', 0, 98, {
        kinematic: true, radius: 6, toolR: 6, hull: 800, field: 36, horizon: 16, strength: 18,
      }),
      berth(-36, 14),
      barge(-36, 50),
    ],
  }),
  define({
    id: 'ms_drift_lane',
    family: 'disabled_drift',
    title: 'Dead tug blocking a hauler lane',
    defaultOrder: 'clamp-berth',
    clampMass: 40,
    priority: 'The tug is too heavy for a bare line. Clamp it clear before the hauler arrives.',
    rights: ['tow_disabled_hull', 'clamp_heavy'],
    failure: {
      kind: 'contact', hazard: 'hauler', subject: 'tug', spawn: 'ms_drift_lane_container',
      pathway: 'The hauler strikes the tug and throws a container into a second recovery.',
    },
    orders: {
      'clamp-berth': ord('tug', 'berth', ['clamp']),
      'clamp-barge': ord('tug', 'barge', ['clamp']),
    },
    bodies: [
      beacon(12, 30),
      b('tug', 'SF_MERCY_TANK', 'tug', 0, 36, {
        mass: 68, radius: 5, toolR: 5, survivors: 1, cargoCr: 250, hull: 120,
      }),
      b('hauler', 'SF_MERCY_SHEAR', 'traffic', 0, 112, {
        kinematic: true, radius: 4.5, toolR: 4.5, hull: 200, vel: { x: 0, z: -4.8 }, damagePerS: 140,
      }),
      berth(34, 36),
      barge(34, 68),
    ],
  }),
  define({
    id: 'ms_tank_vent',
    family: 'tanker_train',
    title: 'Ruptured tank car with a crew capsule',
    defaultOrder: 'cargo-tank',
    priority: 'Seal the tank or pull the capsule. The vent does not wait for both.',
    rights: ['contain_volatile', 'rescue_crew', 'cargo_custody'],
    failure: {
      kind: 'spread', hazard: 'tank', subject: 'tank', spawn: 'ms_tank_spread',
      pathway: 'An unsealed vent cooks the next car into its own rescue.',
    },
    orders: {
      'cargo-tank': ord('tank', 'berth', ['containment']),
      'lives-capsule': ord('capsule', 'barge'),
    },
    bodies: [
      beacon(0, 22),
      b('tank', 'SF_MERCY_TANK', 'tank', 0, 36, {
        mass: 48, radius: 4.2, toolR: 4.2, volatile: true, ventPerS: 0.075,
        cargoCr: 5000, hull: 90, vel: { x: 0, z: 0.6 },
      }),
      b('capsule', 'SF_MERCY_CAPSULE', 'capsule', 16, 36, {
        mass: 4.5, radius: 2.3, toolR: 2.3, survivors: 4, hull: 40,
      }),
      berth(-36, 36),
      barge(16, 4),
    ],
  }),
  define({
    id: 'ms_ore_cut',
    family: 'tanker_train',
    title: 'Cut ore pod and a crewed engine',
    defaultOrder: 'ore-first',
    priority: 'One extraction closes the contract. Ore custody and the crew are different payouts.',
    rights: ['cargo_custody', 'rescue_crew', 'secure_evidence'],
    failure: {
      kind: 'capture', hazard: 'rival', subject: 'ore', spawn: null,
      pathway: 'The rival takes the beaconed ore. Evidence is lost and the contract pays nothing if you saved neither.',
    },
    orders: {
      'ore-first': ord('ore', 'berth'),
      'engine-first': ord('engine', 'barge'),
    },
    bodies: [
      beacon(0, 26),
      b('ore', 'SF_MERCY_CAPSULE', 'ore', 6, 40, {
        mass: 11, radius: 2.5, toolR: 2.5, cargoCr: 6400, evidence: 1, hull: 36, jitterAmp: 0.35,
      }),
      b('engine', 'SF_MERCY_TANK', 'engine', -12, 40, {
        mass: 28, radius: 4.2, toolR: 4.2, survivors: 2, hull: 80, vel: { x: 0, z: 1.2 },
      }),
      b('rival', 'SF_MERCY_SHEAR', 'rival', 70, 40, {
        kinematic: true, radius: 3.2, toolR: 3.2, hull: 80, pursue: 'ore', speed: 4.3, captureR: 7, jitterAmp: 0.4,
      }),
      berth(34, 18),
      barge(-40, 16),
    ],
  }),
  define({
    id: 'ms_coupling_jam',
    family: 'tanker_train',
    title: 'Container walking into a shear',
    defaultOrder: 'tether-berth',
    priority: 'The container is already sliding. Berth and barge are both legal custody.',
    rights: ['cargo_custody', 'tow_disabled_hull'],
    failure: {
      kind: 'contact', hazard: 'shear', subject: 'container', spawn: null,
      pathway: 'The shear opens the container. Cargo custody is gone.',
    },
    orders: {
      'tether-berth': ord('container', 'berth'),
      'tether-barge': ord('container', 'barge'),
    },
    bodies: [
      beacon(0, 24),
      b('container', 'SF_MERCY_TRUSS', 'container', 0, 36, {
        mass: 15, radius: 2.8, toolR: 2.8, cargoCr: 2200, hull: 44, vel: { x: 2.15, z: 0 },
        modelLock: 'damaged', startHullFrac: 0.42,
      }),
      b('shear', 'SF_MERCY_SHEAR', 'hazard', 40, 36, {
        kinematic: true, radius: 4, toolR: 4, hull: 400, damagePerS: 80,
      }),
      berth(-8, 8),
      barge(0, 66),
    ],
  }),
  define({
    id: 'ms_gantry_swing',
    family: 'yard_accident',
    title: 'Live gantry sweeping a berthed skiff',
    defaultOrder: 'tow-skiff',
    priority: 'Tow the skiff out, or pin the arm and take the barge.',
    rights: ['rescue_crew', 'pin_machinery'],
    failure: {
      kind: 'contact', hazard: 'gantry', subject: 'skiff', spawn: 'ms_gantry_crew',
      pathway: 'The arm breaks the skiff and throws a crew capsule into a second recovery.',
    },
    orders: {
      'tow-skiff': ord('skiff', 'berth'),
      'pin-gantry': ord('skiff', 'barge', ['clamp'], { pin: 'gantry' }),
    },
    bodies: [
      beacon(8, 36),
      b('gantry', 'SF_MERCY_GANTRY', 'gantry', 0, 48, {
        kinematic: true, driven: true, radius: 3, toolR: 4, hull: 160, mass: 400,
        rot: 2.35, angVelDrive: -0.17, angVel: -0.17, damagePerS: 70,
      }),
      b('skiff', 'SF_MERCY_CAPSULE', 'skiff', 18, 48, {
        mass: 12, radius: 3.2, toolR: 3.2, survivors: 3, hull: 64,
      }),
      berth(18, 12),
      barge(46, 48),
    ],
  }),
  define({
    id: 'ms_truss_fall',
    family: 'yard_accident',
    title: 'Collapsed truss with a loose segment',
    defaultOrder: 'tether-berth',
    priority: 'The occupied segment is the rescue. The loose segment is the hazard.',
    rights: ['rescue_crew', 'tow_disabled_hull'],
    failure: {
      kind: 'contact', hazard: 'loose', subject: 'segment', spawn: null,
      pathway: 'The loose segment crushes the occupied bay. Crew are lost.',
    },
    orders: {
      'tether-berth': ord('segment', 'berth'),
      'tether-barge': ord('segment', 'barge'),
    },
    bodies: [
      beacon(0, 24),
      b('segment', 'SF_MERCY_TRUSS', 'segment', 0, 36, {
        mass: 16, radius: 3, toolR: 3, survivors: 2, hull: 28, modelLock: 'damaged', startHullFrac: 0.4,
      }),
      b('loose', 'SF_MERCY_TRUSS', 'hazard', 34, 36, {
        mass: 9, radius: 2.2, toolR: 2.2, hull: 24, vel: { x: -1.85, z: 0 },
        modelLock: 'damaged', startHullFrac: 0.35, damagePerS: 40, jitterAmp: 0.3,
      }),
      berth(-32, 14),
      barge(-32, 54),
    ],
  }),
  define({
    id: 'ms_berth_door',
    family: 'yard_accident',
    title: 'Closing berth door and a waiting capsule',
    defaultOrder: 'dash-berth',
    priority: 'Slip the capsule through the gap, or pin the slab, or take the barge.',
    rights: ['rescue_crew', 'pin_machinery'],
    failure: {
      kind: 'contact', hazard: 'debris', subject: 'capsule', spawn: null,
      pathway: 'Lane debris destroys the capsule if it is not moved. The closed door is not itself the payout.',
    },
    orders: {
      'dash-berth': ord('capsule', 'berth'),
      'pin-door': ord('capsule', 'berth', ['clamp'], { pin: 'door' }),
    },
    bodies: [
      beacon(6, 40),
      b('capsule', 'SF_MERCY_CAPSULE', 'capsule', 0, 46, {
        mass: 4.2, radius: 2.3, toolR: 2.3, survivors: 5, hull: 36,
      }),
      b('door', 'SF_MERCY_SHEAR', 'door', 26, 30, {
        kinematic: true, driven: true, radius: 4.2, toolR: 4.2, hull: 200, mass: 52,
        driveVel: { x: -1.05, z: 0 }, vel: { x: -1.05, z: 0 },
      }),
      b('debris', 'SF_MERCY_TRUSS', 'hazard', 52, 46, {
        kinematic: true, radius: 3, toolR: 3, hull: 40, vel: { x: -2.55, z: 0 }, damagePerS: 70,
        modelLock: 'damaged', startHullFrac: 0.4,
      }),
      berth(0, 10),
      barge(-36, 46),
    ],
  }),
  define({
    id: 'ms_pod_traffic',
    family: 'lifeboat_threat',
    title: 'Capsule in a hauler lane',
    defaultOrder: 'tether-berth',
    priority: 'Pull the capsule off the lane. Berth and barge are both off the approach line.',
    rights: ['rescue_crew', 'lane_priority'],
    failure: {
      kind: 'contact', hazard: 'hauler', subject: 'capsule', spawn: null,
      pathway: 'The hauler runs the capsule down. Survivors are lost.',
    },
    orders: {
      'tether-berth': ord('capsule', 'berth'),
      'tether-barge': ord('capsule', 'barge'),
    },
    bodies: [
      beacon(0, 28),
      b('capsule', 'SF_MERCY_CAPSULE', 'capsule', 0, 40, {
        mass: 4, radius: 2.3, toolR: 2.3, survivors: 3, hull: 32, vel: { x: 0, z: 0.3 },
      }),
      b('hauler', 'SF_MERCY_SHEAR', 'traffic', 68, 40, {
        kinematic: true, radius: 4.6, toolR: 4.6, hull: 180, vel: { x: -4.5, z: 0 }, damagePerS: 160,
      }),
      berth(-34, 16),
      barge(-34, 56),
    ],
  }),
  define({
    id: 'ms_pod_rival',
    family: 'lifeboat_threat',
    title: 'Rival closing on a beaconed capsule',
    defaultOrder: 'tether-berth',
    priority: 'Take custody before the rival. A second capsule is the failure route, not a bonus.',
    rights: ['rescue_crew', 'beacon_custody'],
    failure: {
      kind: 'capture', hazard: 'rival', subject: 'capsule', spawn: 'ms_pod_rival_second',
      pathway: 'The rival takes the first capsule. A second capsule remains recoverable.',
    },
    orders: {
      'tether-berth': ord('capsule', 'berth'),
      'tether-barge': ord('capsule', 'barge'),
    },
    bodies: [
      beacon(0, 28),
      b('capsule', 'SF_MERCY_CAPSULE', 'capsule', 0, 40, {
        mass: 4, radius: 2.3, toolR: 2.3, survivors: 4, hull: 34,
      }),
      b('rival', 'SF_MERCY_SHEAR', 'rival', 66, 40, {
        kinematic: true, radius: 3, toolR: 3, hull: 70, pursue: 'capsule', speed: 4.35,
        captureR: 6.5, jitterAmp: 0.35,
      }),
      berth(-32, 20),
      barge(-32, 56),
    ],
  }),
  define({
    id: 'ms_pod_debris',
    family: 'lifeboat_threat',
    title: 'Capsule with debris across the barge mouth',
    defaultOrder: 'tether-berth',
    priority: 'The berth is clear. The barge is not, until the debris is moved.',
    rights: ['rescue_crew', 'clear_debris'],
    failure: {
      kind: 'contact', hazard: 'threat', subject: 'capsule', spawn: null,
      pathway: 'The trailing debris destroys the capsule.',
    },
    orders: {
      'tether-berth': ord('capsule', 'berth'),
      'clear-barge': ord('capsule', 'barge', ['clamp'], { clear: 'blocker' }),
    },
    bodies: [
      beacon(14, 28),
      b('capsule', 'SF_MERCY_CAPSULE', 'capsule', 0, 40, {
        mass: 4.4, radius: 2.3, toolR: 2.3, survivors: 2, hull: 30,
      }),
      b('blocker', 'SF_MERCY_TRUSS', 'debris', -16, 40, {
        mass: 20, radius: 3.1, toolR: 3.1, hull: 40, modelLock: 'damaged', startHullFrac: 0.45,
      }),
      b('threat', 'SF_MERCY_SHEAR', 'hazard', 96, 40, {
        kinematic: true, radius: 3, toolR: 3, hull: 40, vel: { x: -2.35, z: 0 }, damagePerS: 80,
      }),
      berth(0, 8),
      barge(-36, 40),
    ],
  }),

  // --- emergent second stage (not on the board) ---
  define({
    id: 'ms_drift_lane_container',
    family: 'disabled_drift',
    title: 'Container thrown off the lane strike',
    board: false,
    defaultOrder: 'tether-berth',
    priority: 'The strike is over. The container can still be berthed.',
    rights: ['cargo_custody'],
    failure: {
      kind: 'contact', hazard: 'shear', subject: 'container', spawn: 'ms_gantry_crew',
      pathway: 'A third-stage spawn is refused by the chain budget.',
    },
    orders: {
      'tether-berth': ord('container', 'berth'),
    },
    bodies: [
      beacon(6, 6),
      b('container', 'SF_MERCY_TRUSS', 'container', 0, 0, {
        mass: 16, radius: 2.7, toolR: 2.7, cargoCr: 900, hull: 40, modelLock: 'damaged', startHullFrac: 0.46,
      }),
      b('shear', 'SF_MERCY_SHEAR', 'hazard', 88, 0, {
        kinematic: true, radius: 4, toolR: 4, hull: 200, damagePerS: 200,
      }),
      berth(26, -14),
    ],
  }),
  define({
    id: 'ms_tank_spread',
    family: 'tanker_train',
    title: 'Second car lit by the vent',
    board: false,
    defaultOrder: 'cargo-tank',
    priority: 'Seal the second car and berth it. The vent is slower than the first.',
    rights: ['contain_volatile', 'cargo_custody'],
    failure: {
      kind: 'spread', hazard: 'tank', subject: 'tank', spawn: null,
      pathway: 'If this car is also ignored it is lost. It does not spawn a third incident.',
    },
    orders: {
      'cargo-tank': ord('tank', 'berth', ['containment']),
    },
    bodies: [
      beacon(0, -12),
      b('tank', 'SF_MERCY_TANK', 'tank', 0, 0, {
        mass: 36, radius: 4, toolR: 4, volatile: true, ventPerS: 0.03, cargoCr: 2400, hull: 70,
      }),
      berth(30, 0),
    ],
  }),
  define({
    id: 'ms_gantry_crew',
    family: 'yard_accident',
    title: 'Crew capsule blown off the skiff',
    board: false,
    defaultOrder: 'tether-berth',
    priority: 'The arm already did its damage. The capsule is the recovery.',
    rights: ['rescue_crew'],
    failure: {
      kind: 'contact', hazard: 'shear', subject: 'capsule', spawn: null,
      pathway: 'Ignored, the capsule meets the shear. No further chain.',
    },
    orders: {
      'tether-berth': ord('capsule', 'berth'),
    },
    bodies: [
      beacon(4, 4),
      b('capsule', 'SF_MERCY_CAPSULE', 'capsule', 0, 0, {
        mass: 4, radius: 2.3, toolR: 2.3, survivors: 3, hull: 28, vel: { x: 1.2, z: -0.4 },
      }),
      b('shear', 'SF_MERCY_SHEAR', 'hazard', 70, -20, {
        kinematic: true, radius: 4, toolR: 4, hull: 100, damagePerS: 120,
      }),
      berth(0, -24),
    ],
  }),
  define({
    id: 'ms_pod_rival_second',
    family: 'lifeboat_threat',
    title: 'Second capsule after the rival grab',
    board: false,
    defaultOrder: 'tether-berth',
    priority: 'The rival is loaded. This capsule is still a rescue.',
    rights: ['rescue_crew'],
    failure: {
      kind: 'contact', hazard: 'shear', subject: 'capsule', spawn: null,
      pathway: 'Ignored, the second capsule is lost. No third stage.',
    },
    orders: {
      'tether-berth': ord('capsule', 'berth'),
    },
    bodies: [
      beacon(-4, 4),
      b('capsule', 'SF_MERCY_CAPSULE', 'capsule', -12, 16, {
        mass: 4, radius: 2.3, toolR: 2.3, survivors: 2, hull: 30,
      }),
      b('shear', 'SF_MERCY_SHEAR', 'hazard', 60, 60, {
        kinematic: true, radius: 3, toolR: 3, hull: 40, damagePerS: 80,
      }),
      berth(-28, -4),
    ],
  }),
];

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) freezeDeep(value[key]);
  return Object.freeze(value);
}

export const INCIDENTS = freezeDeep(RAW);

const BY_ID = new Map(INCIDENTS.map((d) => [d.id, d]));

export function incidentById(id) {
  return BY_ID.get(id) || null;
}

export function boardIncidents() {
  return INCIDENTS.filter((d) => d.board);
}

export function validateCatalog() {
  const errors = [];
  const ids = new Set();
  const familyBoard = {};
  let spawns = 0;
  for (const def of INCIDENTS) {
    if (ids.has(def.id)) errors.push(`duplicate ${def.id}`);
    ids.add(def.id);
    if (!def.orders || Object.keys(def.orders).length < 1) errors.push(`${def.id} has no orders`);
    if (def.board) {
      familyBoard[def.family] = (familyBoard[def.family] || 0) + 1;
      if (Object.keys(def.orders).length < 2) errors.push(`${def.id} needs two orders`);
      if (!def.priority || !def.failure || !def.failure.pathway) errors.push(`${def.id} missing pathway`);
      if (!def.rights || def.rights.length < 1) errors.push(`${def.id} missing rights`);
    }
    if (def.failure && def.failure.spawn) {
      spawns += 1;
      if (!BY_ID.has(def.failure.spawn)) errors.push(`${def.id} spawn missing ${def.failure.spawn}`);
    }
    const locals = new Set((def.bodies || []).map((body) => body.localId));
    if (!locals.has('beacon')) errors.push(`${def.id} missing beacon`);
    for (const body of def.bodies) {
      if (!MODEL_IDS.includes(body.model)) errors.push(`${def.id} bad model ${body.model}`);
    }
    for (const [name, order] of Object.entries(def.orders)) {
      if (!locals.has(order.subject)) errors.push(`${def.id} ${name} subject`);
      if (!locals.has(order.dest)) errors.push(`${def.id} ${name} dest`);
      if (order.pin && !locals.has(order.pin)) errors.push(`${def.id} ${name} pin`);
      if (order.clear && !locals.has(order.clear)) errors.push(`${def.id} ${name} clear`);
    }
    const fail = def.failure;
    if (fail && fail.subject && !locals.has(fail.subject)) errors.push(`${def.id} fail subject`);
    if (fail && fail.hazard && !locals.has(fail.hazard)) errors.push(`${def.id} fail hazard`);
  }
  const families = Object.keys(familyBoard);
  if (families.length !== 4) errors.push(`families ${families.length}`);
  for (const fam of families) {
    if (familyBoard[fam] !== 3) errors.push(`${fam} count ${familyBoard[fam]}`);
  }
  if (boardIncidents().length !== 12) errors.push('board count');
  if (spawns < 4) errors.push(`spawns ${spawns}`);
  if (MODEL_IDS.length < 6) errors.push('models');
  return errors;
}
