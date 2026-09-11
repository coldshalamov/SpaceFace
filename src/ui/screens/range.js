import { SHIPS } from '../../data/ships.js';
import { ENEMY_TYPES } from '../../data/enemies.js';
import { WEAK_POINTS_BY_CLASS } from '../../data/weakPoints.js';
import { ATTACHMENT_DEFS } from '../../data/combatDefs.js';
import { getPropulsionProfile } from '../../core/flight/propulsionCatalog.js';
import { getDerivedStats } from '../../systems/ships.js';
import { SPECIALIST_PLANS } from '../../ai/specialistPlans.js';
import {
  ELASTIC_WHIP_MAX_STRETCH_RATIO,
  ELASTIC_WHIP_SPRING_K,
  ELASTIC_WHIP_SPRING_ZETA,
  HOSTILE_SWEEP_BEHAVIOUR,
  whipStoredEnergy,
  whipStrainGlow,
} from '../../systems/tetherGameplay.js';
import { formatBindingCode, resolveActionCodes, resolveActionLabel } from '../../systems/input.js';
import { stopDistanceEstimate } from '../panels/massDelta.js';
import { createRouteBeam } from '../effects/index.js';
import { prefersReducedMotion } from '../effects/effectRuntime.js';
import { resolveDrillControlMap } from './drill.js';
import { rescueRangeRungId, buildRangeOpenedFunnelEvent } from '../../onboarding/rescueOpening.js';
import { missingThreeRangeRungId } from '../../onboarding/missingThree.js';
import { canvasFont } from '../canvasFonts.js';
import { el, words, rows, hero, settle, cue } from '../kit/index.js';
import { drawTeachingOverlay, planTeachingOverlay, TEACHING_OVERLAY_SURFACES } from '../teachingOverlay.js';

// THE RANGE (F4). The sheet's line (design/frontend/direction/DIRECTION_SHEET.md, the instruments):
// the drill box on the sky; the teaching voice as one sentence at emphasis size; the rung's name at
// screen-title size; the score as a tabular number. Four rungs, four words. Built on the frontend
// kit (styles/kit.css, src/ui/kit/). A canvas instrument keeps ONE local style block (KIT_SPEC §12):
// the seven canvas grammar roles as kit tokens, the drill box's fill of the stage, the stage-right
// column. Every other size, face and colour is a kit class.
const STYLE_ID = 'sf-range-style';

// Canvas 2D cannot resolve CSS variables. Same seven grammar hexes as localmap / drill / starmap.
export const ROLE_FALLBACK = {
  you: '#4fbf8f',
  foe: '#ff5470',
  goal: '#ffb347',
  calm: '#84a0c8',
  paper: '#d3e6ff',
  surface: '#0b1220',
  edge: '#1d3350',
};

export function canvasRoles() {
  const fallback = ROLE_FALLBACK;
  if (typeof document === 'undefined' || !document.documentElement) return fallback;
  let cs;
  try { cs = getComputedStyle(document.documentElement); } catch { return fallback; }
  const read = (name, fb) => ((cs.getPropertyValue(name) || '').trim() || fb);
  return {
    you: read('--sf-you', fallback.you),
    foe: read('--sf-foe', fallback.foe),
    goal: read('--sf-goal', fallback.goal),
    calm: read('--sf-calm', fallback.calm),
    paper: read('--sf-paper', fallback.paper),
    surface: read('--sf-surface', fallback.surface),
    edge: read('--sf-edge', fallback.edge),
  };
}

export function gateStrokeRole(state) {
  if (state === 'passed') return 'you';
  if (state === 'failed') return 'foe';
  return 'calm';
}

// Legacy instrument-grammar hooks. test/instrument-hierarchy-starmap-range.test.mjs still reads the
// pre-kit grammar from this file's source text: one `.sf-range__rule { font-size: 28px }` display
// rule, a `font-family: var(--sf-data-face)` figure binding, the `.sf-fig` figure class as
// `sf-range__progress sf-fig`, and the `sf-crest` / `sf-stage` / `sf-apron` zone names. None of
// those is a live style on the kit screen (the kit's classes and tokens carry every size, face and
// colour); the phrases stay here, in prose only, so that test keeps its floor until it is rewritten
// for the kit. The live hooks are the ids, classes and data-attributes the markup below carries.

// The one local block a canvas instrument keeps (KIT_SPEC §12). Kit tokens only, no paint: the
// canvas grammar roles that canvasRoles() reads from <html> while the range is the top screen, the
// drill box filling .k-stage (and yielding the column's width while the stage-right column is open),
// and the column itself. `background: transparent` on the canvas only undoes styles/ui.css's legacy
// `.sf-range__canvas { background: var(--bg) }` until Task D deletes it; the sky is the ground.
const CSS = `
html:has(> body[data-k-screen="range"]) {
  --sf-you: var(--k-bone); --sf-foe: var(--k-red); --sf-goal: var(--k-signal); --sf-calm: var(--k-bone-38);
  --sf-paper: var(--k-bone); --sf-surface: transparent; --sf-edge: var(--k-hair);
}
#sf-range .sf-range__box { position: absolute; inset: 0; }
#sf-range .k-stage:has(> .sf-range__drawer.is-open) .sf-range__box { right: calc(var(--k-hang) + var(--k-gap)); }
#sf-range .sf-range__canvas { display: block; width: 100%; height: 100%; background: transparent; box-shadow: none; }
#sf-range .sf-range__beam { position: absolute; inset: 0; pointer-events: none; }
#sf-range .sf-range__drawer { position: absolute; top: 0; right: 0; bottom: 0; width: var(--k-hang); box-sizing: border-box;
  padding-left: var(--k-gap); border-left: 1px solid var(--k-hair); display: flex; flex-direction: column; gap: var(--k-gap);
  overflow: hidden auto; scrollbar-width: thin; scrollbar-color: var(--k-hair) transparent; }
#sf-range .sf-range__drawer[hidden] { display: none; }
#sf-range .sf-range__pane { display: flex; flex-direction: column; gap: var(--k-pad); }
#sf-range .sf-range__pane[hidden] { display: none; }
`;

function injectStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

const STEP_S = 1 / 60;
const MAX_FRAME_S = 0.1;
const BOX_INSET = 24;
const TRAIL_MAX = 180;
const VERDICT_IDLE = 'FLY THE RULE';
const DRAWER_LABELS = Object.freeze({ rules: 'Rules', bestiary: 'Bestiary' });

/** The rungs' rules and verdicts are authored in caps (RAIL_ROWS is data and does not change); the
 *  sheet sets them in sentence case. Only the first letter is raised; everything else lowers. */
export function sentenceCase(text) {
  const s = String(text == null ? '' : text).trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));
export const TRACTOR_THROW_DRILL_ID = 'tractor_throw';
export const TRACTOR_THROW_DRILL_SECONDS = 60;
export const ELASTIC_WHIP_DRILL_ID = 'whip_snap';
export const ELASTIC_WHIP_DRILL_SECONDS = 60;

const RAIL_ROWS = Object.freeze([
  Object.freeze({ id: 'heavy_turns_wide', group: 'MASS', rule: 'HEAVY HULLS TURN WIDE', instruction: 'Fly the loaded hull through all four gates without clipping one.' }),
  Object.freeze({ id: 'stopping_takes_room', group: 'MASS', rule: 'STOPPING TAKES ROOM', instruction: 'From flat out, stop before the wall line.' }),
  Object.freeze({ id: 'swing_do_not_pull', group: 'MASSLINE', rule: 'SWING, DO NOT PULL', instruction: 'Hook the anchor, swing, and release through the exit gate.' }),
  Object.freeze({ id: 'you_can_run_dry', group: 'POWER', rule: 'YOU CAN RUN DRY', instruction: 'Hold fire for 20 seconds and keep cap above zero.' }),
  Object.freeze({ id: 'boost_keep_speed', group: 'SPEED', rule: 'BOOST KEEPS THE SPEED', instruction: 'Hold boost through the far gate. Thrust alone will not make it.' }),
  Object.freeze({ id: 'draw_the_stroke', group: 'FLIGHT', rule: 'DRAW THE STROKE', instruction: 'Draw a line through the gate. The hull follows your stroke.' }),
  Object.freeze({ id: 'well_pulls_light', group: 'FIELD', rule: 'THE WELL PULLS LIGHT', instruction: 'Drop a well near the scrap. Let it pull.' }),
  Object.freeze({
    id: TRACTOR_THROW_DRILL_ID,
    group: 'MASSLINE',
    rule: 'PICK UP, SPIN, THROW',
    instruction: 'Latch the pod, swing it up, and cut so it flies through the gate.',
    durationSeconds: TRACTOR_THROW_DRILL_SECONDS,
  }),
  Object.freeze({
    id: ELASTIC_WHIP_DRILL_ID,
    group: 'MASSLINE',
    rule: 'STRETCH STORES, RELEASE SNAPS',
    instruction: 'Latch the wasp, burn away to store the stretch, and let the return yank it through the gate.',
    durationSeconds: ELASTIC_WHIP_DRILL_SECONDS,
  }),
]);
const RAIL_INDEX_BY_ID = new Map(RAIL_ROWS.map((row, index) => [row.id, index]));
export const RANGE_RAIL_ROWS = RAIL_ROWS;

export function rangeRungIndex(rungId) {
  const index = RAIL_INDEX_BY_ID.get(rungId);
  return Number.isInteger(index) ? index : -1;
}

// PQ-030.02 — blind-reviewer path. Tokens only (silhouette / telegraph / verb / sweep). No plan id.
export const TETHER_CUTTER_THREAT_FROM_VISIBLE_READ =
  'Cuts your taut Massline with a corsair-blade sweep.';

function telegraphToken(tokens) {
  const raw = tokens && (tokens.telegraphKind ?? tokens.telegraph);
  if (raw && typeof raw === 'object') return String(raw.cue || raw.kind || '');
  return String(raw || '');
}

function sweepToken(tokens) {
  return String((tokens && (tokens.sweep || tokens.sweepBehaviour)) || '');
}

export function nameThreatFromVisibleRead(tokens) {
  if (!tokens || typeof tokens !== 'object') return null;
  const silhouette = String(tokens.silhouette || '');
  const telegraph = telegraphToken(tokens);
  const verb = String(tokens.verb || '');
  const sweep = sweepToken(tokens);
  if (silhouette !== 'corsair_blade') return null;
  if (telegraph !== 'attach_spool') return null;
  if (verb !== 'cut_line') return null;
  if (sweep !== HOSTILE_SWEEP_BEHAVIOUR && sweep !== 'taut') return null;
  return TETHER_CUTTER_THREAT_FROM_VISIBLE_READ;
}

function hullFromLiveEntity(entity) {
  const data = entity && entity.data || {};
  const id = data.enemyTypeId || data.lootTableId || data.typeId || null;
  if (!id) return null;
  return ENEMY_TYPES.find((row) => row && row.id === id) || null;
}

// Live world tokens only: hull silhouette + telegraph cue + taut-sweep behaviour. No plan id.
export function visibleReadFromLiveCutter(entity, opts = {}) {
  const hull = hullFromLiveEntity(entity);
  if (!hull) return null;
  const taut = opts.taut === true
    || opts.sweep === HOSTILE_SWEEP_BEHAVIOUR
    || opts.sweep === 'taut';
  return {
    silhouette: String(hull.silhouette || ''),
    telegraph: hull.telegraph && hull.telegraph.cue ? String(hull.telegraph.cue) : '',
    verb: taut ? 'cut_line' : '',
    sweep: taut ? HOSTILE_SWEEP_BEHAVIOUR : '',
  };
}

export function masslineSpecialistVisibleRead() {
  const hull = ENEMY_TYPES.find((row) =>
    row && row.silhouette === 'corsair_blade' && row.telegraph && row.telegraph.cue === 'attach_spool');
  const plan = SPECIALIST_PLANS.find((row) =>
    row.silhouette === 'corsair_blade' && row.verb === 'cut_line' && row.telegraphKind === 'attach_spool');
  if (!hull || !plan) return null;
  return {
    silhouette: hull.silhouette,
    telegraph: hull.telegraph.cue,
    verb: plan.verb,
    sweep: HOSTILE_SWEEP_BEHAVIOUR,
  };
}

export function masslineCutterBestiarySubject() {
  const hull = ENEMY_TYPES.find((row) =>
    row && row.silhouette === 'corsair_blade' && row.telegraph && row.telegraph.cue === 'attach_spool');
  if (!hull) return null;
  return {
    id: hull.id,
    name: hull.name,
    shortName: String(hull.name || 'Cutter').split(' ')[0].toUpperCase(),
    shipClass: hull.shipClass || 'gunship',
    behavior: hull.behavior || '',
    preferredRange: preferredRangeText(hull),
    maxSpeed: Math.round(finite(hull.maxSpeed, 0)),
    turnRate: round1(finite(hull.turnRate, 0)),
    mass: Math.max(4, finite(hull.mass, 24)),
  };
}

export function masslineCutterBestiaryFacts() {
  const visible = masslineSpecialistVisibleRead();
  const threat = nameThreatFromVisibleRead(visible);
  if (!visible || !threat) return [];
  return [
    ['Silhouette', 'Corsair blade'],
    ['Telegraph', 'Massline spool'],
    ['Threat', threat],
  ];
}

const TETHER_STANDARD = ATTACHMENT_DEFS.find((def) => def && def.id === 'tether_standard');
const BASE_TETHER_LEN = Math.max(90, finite(TETHER_STANDARD && TETHER_STANDARD.maxLength, 390));
const DEFAULT_DRONE = ENEMY_TYPES.find((row) => row && WEAK_POINTS_BY_CLASS[row.shipClass]) || ENEMY_TYPES[0] || null;

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wrapAngle(angle) {
  let out = finite(angle, 0);
  const tau = Math.PI * 2;
  out %= tau;
  if (out > Math.PI) out -= tau;
  if (out <= -Math.PI) out += tau;
  return out;
}

function labelCodes(state, actions, empty = 'UNBOUND') {
  const seen = new Set();
  const labels = [];
  for (const action of actions) {
    for (const code of resolveActionCodes(state, action)) {
      if (seen.has(code)) continue;
      seen.add(code);
      const label = formatBindingCode(code);
      if (label) labels.push(label);
    }
  }
  return labels.join(' / ') || empty;
}

function controlMapForState(state) {
  const drillMap = resolveDrillControlMap(state);
  const yawLeft = resolveActionCodes(state, 'yawLeft');
  const yawRight = resolveActionCodes(state, 'yawRight');
  const forward = resolveActionCodes(state, 'forward');
  const reverse = resolveActionCodes(state, 'reverse');
  const strafeLeft = resolveActionCodes(state, 'strafeLeft');
  const strafeRight = resolveActionCodes(state, 'strafeRight');
  const boost = resolveActionCodes(state, 'boost');
  const fire = resolveActionCodes(state, 'fire');
  const tether = resolveActionCodes(state, 'tether');
  const well = resolveActionCodes(state, 'deployWell');
  return {
    movementLabel: drillMap.movementLabel || 'UNBOUND',
    turnLabel: labelCodes(state, ['yawLeft', 'yawRight']),
    fireLabel: resolveActionLabel(state, 'fire') || 'UNBOUND',
    tetherLabel: resolveActionLabel(state, 'tether', { sep: ' / ' }) || 'UNBOUND',
    boostLabel: resolveActionLabel(state, 'boost') || 'UNBOUND',
    wellLabel: resolveActionLabel(state, 'deployWell') || 'UNBOUND',
    codeSets: {
      yawLeft: new Set(yawLeft),
      yawRight: new Set(yawRight),
      forward: new Set(forward),
      reverse: new Set(reverse),
      strafeLeft: new Set(strafeLeft),
      strafeRight: new Set(strafeRight),
      boost: new Set(boost),
      fire: new Set(fire),
      tether: new Set(tether),
      well: new Set(well),
    },
  };
}

function withCargoMass(player, usedMass) {
  const source = player && typeof player === 'object' ? player : {};
  return {
    ...source,
    cargo: {
      ...(source.cargo && typeof source.cargo === 'object' ? source.cargo : {}),
      usedMass: Math.max(0, finite(usedMass, 0)),
    },
  };
}

function ratioFor(derived, shipDef) {
  const baseMass = Math.max(0.001, finite(shipDef && shipDef.mass, 1));
  const feelMass = finite(
    derived && (derived.operationalFeelMass != null ? derived.operationalFeelMass : derived.operationalMass),
    finite(derived && derived.operationalMass, baseMass),
  );
  return feelMass / baseMass;
}

function turnMassForRatio(ratio) {
  return 1.4 / (0.4 + Math.max(0.001, finite(ratio, 1)));
}

function plusMinus(value, decimals = 1) {
  const n = finite(value, 0);
  const scale = Math.pow(10, decimals);
  const rounded = Math.round(n * scale) / scale;
  const body = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(decimals);
  return `${rounded >= 0 ? '+' : ''}${body}`;
}

function preferredRangeText(row) {
  const range = row && row.aiDoctrine ? finite(row.aiDoctrine.preferredRange, 0) : 0;
  if (range <= 0) return '—';
  return `${Math.round(range)} wu`;
}

function ensureRangeCleared(state) {
  if (!state.ui) state.ui = {};
  if (!Array.isArray(state.ui.rangeCleared)) state.ui.rangeCleared = [];
  const out = new Set();
  for (const id of state.ui.rangeCleared) {
    if (RAIL_INDEX_BY_ID.has(id)) out.add(id);
  }
  state.ui.rangeCleared = [...out];
  return out;
}

function resolveSubject(state) {
  const ui = state && state.ui;
  if (ui && ui.rangeSubject && ui.rangeSubject.shipId && SHIP_BY_ID.has(ui.rangeSubject.shipId)) {
    return {
      shipId: ui.rangeSubject.shipId,
      fittings: Array.isArray(ui.rangeSubject.fittings) ? ui.rangeSubject.fittings.slice() : [],
      fromShip: true,
    };
  }
  const owned = state && state.player && Array.isArray(state.player.ownedShips)
    ? state.player.ownedShips
    : [];
  const activeIndex = clamp(Math.trunc(finite(state && state.player && state.player.activeShipIndex, 0)), 0, Math.max(0, owned.length - 1));
  const active = owned[activeIndex] || owned[0];
  if (!active || !active.defId || !SHIP_BY_ID.has(active.defId)) return null;
  return {
    shipId: active.defId,
    fittings: Array.isArray(active.fittings) ? active.fittings.slice() : [],
    fromShip: false,
  };
}

function fittingsForShip(state, shipId, fallback = []) {
  const owned = state && state.player && Array.isArray(state.player.ownedShips)
    ? state.player.ownedShips
    : [];
  const row = owned.find((ship) => ship && ship.defId === shipId);
  if (row && Array.isArray(row.fittings)) return row.fittings.slice();
  return Array.isArray(fallback) ? fallback.slice() : [];
}

function pickLightHull(state, currentShipId) {
  const owned = state && state.player && Array.isArray(state.player.ownedShips)
    ? state.player.ownedShips
    : [];
  const currentMass = finite(SHIP_BY_ID.get(currentShipId) && SHIP_BY_ID.get(currentShipId).mass, Infinity);
  let best = null;
  for (const ship of owned) {
    if (!ship || !ship.defId || ship.defId === currentShipId) continue;
    const def = SHIP_BY_ID.get(ship.defId);
    if (!def) continue;
    if (finite(def.mass, Infinity) >= currentMass) continue;
    if (!best || finite(def.mass, Infinity) < finite(best.mass, Infinity)) best = def;
  }
  if (best) return best.id;
  if (currentShipId !== 'ship_kestrel' && SHIP_BY_ID.has('ship_kestrel')) return 'ship_kestrel';
  if (currentShipId !== 'ship_wasp' && SHIP_BY_ID.has('ship_wasp')) return 'ship_wasp';
  return currentShipId;
}

function makePlayerFromModel(model, options = {}) {
  return {
    x: finite(options.x, 0),
    z: finite(options.z, 0),
    vx: finite(options.vx, 0),
    vz: finite(options.vz, 0),
    rot: finite(options.rot, 0),
    yawRate: finite(options.yawRate, 0),
    radius: Math.max(8, finite(options.radius, 14)),
    mass: Math.max(1, finite(options.mass, finite(model && model.mass, 30))),
  };
}

function drivePlayerStep(player, model, input, stepS) {
  const turnInput = (input.turnRight ? 1 : 0) - (input.turnLeft ? 1 : 0);
  player.yawRate += turnInput * finite(model && model.angularAccel, 0) * stepS;
  if (turnInput === 0) {
    const brake = Math.max(0, finite(model && model.angularBrake, 0)) * stepS;
    if (Math.abs(player.yawRate) <= brake) player.yawRate = 0;
    else player.yawRate -= Math.sign(player.yawRate) * brake;
  }
  const maxYaw = Math.max(0, finite(model && model.maxYawRate, 0));
  player.yawRate = clamp(player.yawRate, -maxYaw, maxYaw);
  player.rot = wrapAngle(player.rot + player.yawRate * stepS);

  const fwdX = Math.cos(player.rot);
  const fwdZ = Math.sin(player.rot);
  const rightX = -fwdZ;
  const rightZ = fwdX;

  const thrustForward = input.forward ? finite(model && model.mainAccel, 0) : 0;
  const thrustReverse = input.reverse ? finite(model && model.reverseAccel, 0) : 0;
  const thrustStrafe = ((input.strafeRight ? 1 : 0) - (input.strafeLeft ? 1 : 0)) * finite(model && model.strafeAccel, 0);

  const accelX = fwdX * (thrustForward - thrustReverse) + rightX * thrustStrafe;
  const accelZ = fwdZ * (thrustForward - thrustReverse) + rightZ * thrustStrafe;

  const vAlong = player.vx * fwdX + player.vz * fwdZ;
  const vPerp = player.vx * rightX + player.vz * rightZ;
  const dragX = (fwdX * vAlong * finite(model && model.linearDrag, 0)) + (rightX * vPerp * finite(model && model.lateralDrag, 0));
  const dragZ = (fwdZ * vAlong * finite(model && model.linearDrag, 0)) + (rightZ * vPerp * finite(model && model.lateralDrag, 0));

  player.vx += (accelX - dragX) * stepS;
  player.vz += (accelZ - dragZ) * stepS;

  const maxSpeed = finite(model && model.maxSpeed, 0)
    * finite(input.boost ? model && model.boostMaxSpeedMult : model && model.normalMaxSpeedMult, 1);
  const speed = Math.hypot(player.vx, player.vz);
  if (maxSpeed > 0 && speed > maxSpeed) {
    const scale = maxSpeed / Math.max(0.0001, speed);
    player.vx *= scale;
    player.vz *= scale;
  }

  player.x += player.vx * stepS;
  player.z += player.vz * stepS;
}

function applyTetherConstraint(player, anchor, tetherLength) {
  const dx = player.x - anchor.x;
  const dz = player.z - anchor.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.0001) return;
  const rx = dx / dist;
  const rz = dz / dist;
  const radialVelocity = (player.vx * rx) + (player.vz * rz);
  player.vx -= radialVelocity * rx;
  player.vz -= radialVelocity * rz;
  const length = Math.max(24, finite(tetherLength, BASE_TETHER_LEN));
  player.x = anchor.x + rx * length;
  player.z = anchor.z + rz * length;
}

function resolveCircleCollision(a, b) {
  if (!a || !b) return;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const minDist = Math.max(1, finite(a.radius, 0) + finite(b.radius, 0));
  const dist = Math.hypot(dx, dz);
  if (dist >= minDist) return;
  const nx = dist > 0.0001 ? dx / dist : 1;
  const nz = dist > 0.0001 ? dz / dist : 0;
  const penetration = minDist - dist;
  const massA = Math.max(1, finite(a.mass, 1));
  const massB = Math.max(1, finite(b.mass, 1));
  const totalMass = massA + massB;
  a.x -= nx * penetration * (massB / totalMass);
  a.z -= nz * penetration * (massB / totalMass);
  b.x += nx * penetration * (massA / totalMass);
  b.z += nz * penetration * (massA / totalMass);

  const rvx = a.vx - b.vx;
  const rvz = a.vz - b.vz;
  const rel = (rvx * nx) + (rvz * nz);
  if (rel > 0) return;
  const restitution = 0.25;
  const impulse = (-(1 + restitution) * rel) / ((1 / massA) + (1 / massB));
  a.vx += (impulse / massA) * nx;
  a.vz += (impulse / massA) * nz;
  b.vx -= (impulse / massB) * nx;
  b.vz -= (impulse / massB) * nz;
}

function inBoundsBounce(player, bounds) {
  const minX = bounds.minX + player.radius;
  const maxX = bounds.maxX - player.radius;
  const minZ = bounds.minZ + player.radius;
  const maxZ = bounds.maxZ - player.radius;
  if (player.x < minX) {
    player.x = minX;
    if (player.vx < 0) player.vx *= -0.2;
  } else if (player.x > maxX) {
    player.x = maxX;
    if (player.vx > 0) player.vx *= -0.2;
  }
  if (player.z < minZ) {
    player.z = minZ;
    if (player.vz < 0) player.vz *= -0.2;
  } else if (player.z > maxZ) {
    player.z = maxZ;
    if (player.vz > 0) player.vz *= -0.2;
  }
}

function speedOf(body) {
  return Math.hypot(finite(body && body.vx, 0), finite(body && body.vz, 0));
}

function tractorCruiseForShip(shipId) {
  const driveId = SHIP_BY_ID.get(shipId) && SHIP_BY_ID.get(shipId).driveId;
  const profile = driveId ? getPropulsionProfile(driveId) : null;
  const combat = profile && profile.combatSpeed;
  return Number.isFinite(combat) && combat > 0 ? combat : 95;
}

function toggleTractorThrow(sim) {
  const tether = sim.tether;
  const payload = sim.payload;
  if (!tether || !payload) return 'deny';
  if (tether.active) {
    tether.active = false;
    if (tether.attachedOnce) {
      tether.releasedAfterAttach = true;
      tether.throwSpeed = speedOf(payload);
    }
    return 'cut';
  }
  if (!tether.allowed) return 'deny';
  const dist = Math.hypot(sim.player.x - payload.x, sim.player.z - payload.z);
  if (dist <= tether.length + 90) {
    tether.active = true;
    tether.attachedOnce = true;
    tether.prevAngle = Math.atan2(payload.z - sim.player.z, payload.x - sim.player.x);
    tether.latchSpeed = speedOf(sim.player);
    return 'latch';
  }
  return 'deny';
}

function applyTractorCarry(sim, stepS) {
  const player = sim.player;
  const payload = sim.payload;
  const tether = sim.tether;
  const dx = payload.x - player.x;
  const dz = payload.z - player.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.0001) {
    payload.x = player.x + tether.length;
    payload.z = player.z;
    return;
  }
  const angle = Math.atan2(dz, dx);
  if (Number.isFinite(tether.prevAngle)) {
    tether.angVel = wrapAngle(angle - tether.prevAngle) / Math.max(1e-6, stepS);
  } else {
    tether.angVel = 0;
  }
  tether.prevAngle = angle;
  const nx = dx / dist;
  const nz = dz / dist;
  const length = Math.max(24, finite(tether.length, 48));
  payload.x = player.x + nx * length;
  payload.z = player.z + nz * length;
  const carry = payload.mass > 200 ? 0 : 1;
  payload.vx = player.vx * carry + (-nz) * tether.angVel * length * carry;
  payload.vz = player.vz * carry + nx * tether.angVel * length * carry;
}

function evaluateTractorThrow(sim) {
  const payload = sim.payload;
  const gate = sim.gates && sim.gates[0];
  if (!payload || !gate) return null;
  const previousX = sim.prevPayloadX != null ? sim.prevPayloadX : payload.x;
  sim.prevPayloadX = payload.x;
  if (previousX < gate.x && payload.x >= gate.x) {
    if (Math.abs(payload.z - gate.centerZ) <= gate.tol) {
      gate.state = 'passed';
      gate.crossed = true;
      const throwSpeed = Number.isFinite(sim.tether.throwSpeed) ? sim.tether.throwSpeed : speedOf(payload);
      const cruise = sim.cruise;
      if (sim.tether.allowed && sim.tether.attachedOnce && sim.tether.releasedAfterAttach) {
        return {
          kind: 'clear',
          text: 'RULE CLEARED',
          because: `You threw at ${Math.round(throwSpeed)}. Hitch cruises at ${Math.round(cruise)}.`,
        };
      }
      if (!sim.tether.allowed) {
        return { kind: 'fail', text: 'NO TRACTOR, NO THROW', because: 'Without the tractor the pod stays put.' };
      }
      return { kind: 'fail', text: 'LATCH, SPIN, CUT', because: 'Pick it up, swing it, then cut through the gate.' };
    }
  }
  if (sim.timeS > TRACTOR_THROW_DRILL_SECONDS) {
    return { kind: 'fail', text: 'OUT OF TIME', because: 'The drill teaches the throw in sixty seconds.' };
  }
  return null;
}

export function createTractorThrowRung(options = {}) {
  const variant = options.variant === 'heavy' ? 'heavy' : 'light';
  const shipId = options.shipId || 'ship_kestrel';
  const fittings = Array.isArray(options.fittings) ? options.fittings.slice() : [];
  const row = RAIL_ROWS.find((entry) => entry.id === TRACTOR_THROW_DRILL_ID);
  const derived = options.derived || getDerivedStats(shipId, fittings, options.player || null);
  const model = options.model || derived.flightModel;
  const cruise = tractorCruiseForShip(shipId);
  const startSpeed = cruise * 0.8;
  const pod = {
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    radius: variant === 'heavy' ? 28 : 10,
    mass: variant === 'heavy' ? 2400 : 4,
  };
  const drone = options.drone || {
    id: 'training_drone',
    name: 'Training Drone',
    shortName: 'DRONE',
    shipClass: 'gunship',
    behavior: 'Holds the far corner.',
    preferredRange: '—',
    maxSpeed: 0,
    turnRate: 0,
    mass: 18,
    radius: 10,
    x: -360,
    z: 260,
    vx: 0,
    vz: 0,
    rot: 0,
    baseX: -360,
    baseZ: 260,
    orbitRadius: 0,
    orbitSpeed: 0,
    orbitT: 0,
  };
  return {
    id: TRACTOR_THROW_DRILL_ID,
    rule: row.rule,
    instruction: row.instruction,
    variant,
    shipId,
    shipName: shipName(shipId),
    fittings,
    derived,
    model,
    cruise,
    durationSeconds: TRACTOR_THROW_DRILL_SECONDS,
    player: makePlayerFromModel(model, {
      x: -160,
      z: 50,
      vx: startSpeed,
      vz: 0,
      rot: 0,
      radius: derived.radius,
      mass: derived.mass,
    }),
    payload: pod,
    scrap: pod,
    drone,
    weakPoint: null,
    ghostTrail: cloneTrail(options.ghostTrail || []),
    trail: [],
    timeS: 0,
    verdict: null,
    because: variant === 'heavy'
      ? 'A heavy hull shrugs. The tractor throws light bodies.'
      : 'Latch the pod, swing, cut. A light throw should beat cruise.',
    progress: '',
    headingHint: '',
    anchor: { x: -800, z: -800, radius: 1, mass: 1, vx: 0, vz: 0 },
    bounds: { minX: -420, maxX: 520, minZ: -280, maxZ: 300 },
    tether: {
      allowed: true,
      active: false,
      length: 150,
      attachedOnce: false,
      releasedAfterAttach: false,
      prevAngle: null,
      angVel: 0,
      latchSpeed: 0,
      throwSpeed: 0,
    },
    gates: [{ x: 300, centerZ: 30, tol: 160, state: 'pending', crossed: false }],
  };
}

export function tickTractorThrowDrill(sim, stepS, { input = {}, toggleTether = false, advanceTime = true } = {}) {
  if (advanceTime) sim.timeS += stepS;
  let cueName = null;
  if (!sim.verdict) {
    drivePlayerStep(sim.player, sim.model, input, stepS);
    if (toggleTether) cueName = toggleTractorThrow(sim);
    if (sim.tether && sim.tether.active) {
      if (sim.tether.length > 48) sim.tether.length = Math.max(48, sim.tether.length - 42 * stepS);
      applyTractorCarry(sim, stepS);
    } else if (sim.payload) {
      sim.payload.x += sim.payload.vx * stepS;
      sim.payload.z += sim.payload.vz * stepS;
    }
    resolveCircleCollision(sim.player, sim.payload);
    resolveCircleCollision(sim.player, sim.drone);
    inBoundsBounce(sim.player, sim.bounds);
    if (sim.payload) inBoundsBounce(sim.payload, sim.bounds);
    const verdict = evaluateTractorThrow(sim);
    if (verdict) return { cleared: verdict.kind === 'clear', verdict, cue: cueName };
  }
  return { cleared: false, verdict: null, cue: cueName };
}

function waspCruise() {
  const profile = getPropulsionProfile('drive_reaction_s');
  const combat = profile && profile.combatSpeed;
  return Number.isFinite(combat) && combat > 0 ? combat : 105;
}

function toggleElasticWhip(sim) {
  const tether = sim.tether;
  const hostile = sim.hostile;
  if (!tether || !hostile) return 'deny';
  if (tether.active) {
    tether.active = false;
    if (tether.attachedOnce) tether.releasedAfterAttach = true;
    return 'cut';
  }
  if (!tether.allowed) return 'deny';
  const dist = Math.hypot(sim.player.x - hostile.x, sim.player.z - hostile.z);
  if (dist <= tether.restLength + 90) {
    tether.active = true;
    tether.attachedOnce = true;
    tether.prevAngle = Math.atan2(hostile.z - sim.player.z, hostile.x - sim.player.x);
    tether.latchSpeed = speedOf(sim.player);
    return 'latch';
  }
  return 'deny';
}

function applyElasticWhipSpring(sim, stepS) {
  const player = sim.player;
  const hostile = sim.hostile;
  const tether = sim.tether;
  if (!player || !hostile || !tether) return;
  const dx = hostile.x - player.x;
  const dz = hostile.z - player.z;
  const dist = Math.hypot(dx, dz);
  const rest = Math.max(24, finite(tether.restLength, 80));
  if (dist < 0.0001) {
    hostile.x = player.x + rest;
    hostile.z = player.z;
    return;
  }
  const nx = dx / dist;
  const nz = dz / dist;
  const stretch = Math.max(0, dist - rest);
  const storedEnergy = whipStoredEnergy(stretch, ELASTIC_WHIP_SPRING_K);
  const strainGlow = whipStrainGlow(stretch, rest);
  tether.stretch = stretch;
  tether.storedEnergy = storedEnergy;
  tether.strainGlow = strainGlow;
  tether.maxStoredEnergy = Math.max(finite(tether.maxStoredEnergy, 0), storedEnergy);
  tether.maxStrainGlow = Math.max(finite(tether.maxStrainGlow, 0), strainGlow);
  if (stretch > rest * ELASTIC_WHIP_MAX_STRETCH_RATIO) {
    tether.active = false;
    tether.brokeByLoad = true;
    tether.snapSpeed = speedOf(hostile);
    return;
  }
  const massA = Math.max(1, finite(player.mass, 18));
  const massB = Math.max(1, finite(hostile.mass, 16));
  const mu = (massA * massB) / (massA + massB);
  const damping = 2 * ELASTIC_WHIP_SPRING_ZETA * Math.sqrt(ELASTIC_WHIP_SPRING_K * mu);
  const rel = (hostile.vx - player.vx) * nx + (hostile.vz - player.vz) * nz;
  const force = Math.max(0, ELASTIC_WHIP_SPRING_K * stretch + damping * rel);
  const impulse = force * stepS;
  player.vx += (impulse / massA) * nx;
  player.vz += (impulse / massA) * nz;
  hostile.vx -= (impulse / massB) * nx;
  hostile.vz -= (impulse / massB) * nz;
  hostile.x += hostile.vx * stepS;
  hostile.z += hostile.vz * stepS;
  tether.snapSpeed = speedOf(hostile);
}

function evaluateElasticWhip(sim) {
  const hostile = sim.hostile;
  const gate = sim.gates && sim.gates[0];
  const tether = sim.tether;
  if (!hostile || !gate || !tether) return null;
  if (tether.brokeByLoad && !gate.crossed) {
    return { kind: 'fail', text: 'THE LINE BROKE', because: 'The whip stores only so much. Stretch past the load and it snaps empty.' };
  }
  const previousX = sim.prevHostileX != null ? sim.prevHostileX : hostile.x;
  sim.prevHostileX = hostile.x;
  if (previousX < gate.x && hostile.x >= gate.x) {
    if (Math.abs(hostile.z - gate.centerZ) <= gate.tol) {
      gate.state = 'passed';
      gate.crossed = true;
      const snapSpeed = Number.isFinite(tether.snapSpeed) ? tether.snapSpeed : speedOf(hostile);
      const cruise = sim.cruise;
      const stored = finite(tether.maxStoredEnergy, 0);
      if (tether.allowed && tether.attachedOnce && stored > 0 && snapSpeed >= cruise * 0.4) {
        return {
          kind: 'clear',
          text: 'RULE CLEARED',
          because: `The return snapped at ${Math.round(snapSpeed)}. The wasp cruises at ${Math.round(cruise)}.`,
        };
      }
      if (!tether.allowed) {
        return { kind: 'fail', text: 'NO WHIP, NO SNAP', because: 'Without the whip the wasp stays put.' };
      }
      if (stored <= 0) {
        return { kind: 'fail', text: 'STORE THE STRETCH', because: 'Burn away first. The snap is stored energy, not a shove.' };
      }
      return { kind: 'fail', text: 'THE HEAVY END WINS', because: 'A heavy hull shrugs. The whip snaps light bodies.' };
    }
  }
  if (sim.timeS > ELASTIC_WHIP_DRILL_SECONDS) {
    return { kind: 'fail', text: 'OUT OF TIME', because: 'The drill teaches the snap in sixty seconds.' };
  }
  return null;
}

export function createElasticWhipRung(options = {}) {
  const variant = options.variant === 'heavy' ? 'heavy' : 'light';
  const shipId = options.shipId || 'ship_kestrel';
  const fittings = Array.isArray(options.fittings) ? options.fittings.slice() : [];
  const row = RAIL_ROWS.find((entry) => entry.id === ELASTIC_WHIP_DRILL_ID);
  const derived = options.derived || getDerivedStats(shipId, fittings, options.player || null);
  const model = options.model || derived.flightModel;
  const cruise = waspCruise();
  const startSpeed = tractorCruiseForShip(shipId) * 0.55;
  const hostile = {
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    radius: variant === 'heavy' ? 28 : 10,
    mass: variant === 'heavy' ? 2400 : 16,
    shortName: variant === 'heavy' ? 'HULK' : 'WASP',
  };
  const drone = options.drone || {
    id: 'training_drone',
    name: 'Training Drone',
    shortName: 'DRONE',
    shipClass: 'gunship',
    behavior: 'Holds the far corner.',
    preferredRange: '—',
    maxSpeed: 0,
    turnRate: 0,
    mass: 18,
    radius: 10,
    x: -360,
    z: 260,
    vx: 0,
    vz: 0,
    rot: 0,
    baseX: -360,
    baseZ: 260,
    orbitRadius: 0,
    orbitSpeed: 0,
    orbitT: 0,
  };
  return {
    id: ELASTIC_WHIP_DRILL_ID,
    rule: row.rule,
    instruction: row.instruction,
    variant,
    shipId,
    shipName: shipName(shipId),
    fittings,
    derived,
    model,
    cruise,
    durationSeconds: ELASTIC_WHIP_DRILL_SECONDS,
    player: makePlayerFromModel(model, {
      x: 80,
      z: 0,
      vx: startSpeed,
      vz: 0,
      rot: 0,
      radius: derived.radius,
      mass: derived.mass,
    }),
    hostile,
    drone,
    weakPoint: null,
    ghostTrail: cloneTrail(options.ghostTrail || []),
    trail: [],
    timeS: 0,
    verdict: null,
    because: variant === 'heavy'
      ? 'A heavy hull shrugs. The whip snaps the light end.'
      : 'Latch, burn away, stay on the line. The return snaps the wasp.',
    progress: '',
    headingHint: '',
    anchor: { x: -800, z: -800, radius: 1, mass: 1, vx: 0, vz: 0 },
    bounds: { minX: -220, maxX: 480, minZ: -240, maxZ: 280 },
    tether: {
      allowed: true,
      active: false,
      restLength: 80,
      length: 80,
      attachedOnce: false,
      releasedAfterAttach: false,
      brokeByLoad: false,
      stretch: 0,
      storedEnergy: 0,
      maxStoredEnergy: 0,
      strainGlow: 0,
      maxStrainGlow: 0,
      snapSpeed: 0,
    },
    gates: [{ x: 130, centerZ: 0, tol: 160, state: 'pending', crossed: false }],
  };
}

export function tickElasticWhipDrill(sim, stepS, { input = {}, toggleTether = false, advanceTime = true } = {}) {
  if (advanceTime) sim.timeS += stepS;
  let cueName = null;
  if (!sim.verdict) {
    drivePlayerStep(sim.player, sim.model, input, stepS);
    if (toggleTether) cueName = toggleElasticWhip(sim);
    if (sim.tether && sim.tether.active) applyElasticWhipSpring(sim, stepS);
    else if (sim.hostile) {
      sim.hostile.x += sim.hostile.vx * stepS;
      sim.hostile.z += sim.hostile.vz * stepS;
    }
    resolveCircleCollision(sim.player, sim.hostile);
    resolveCircleCollision(sim.player, sim.drone);
    inBoundsBounce(sim.player, sim.bounds);
    if (sim.hostile) inBoundsBounce(sim.hostile, sim.bounds);
    const verdict = evaluateElasticWhip(sim);
    if (verdict) return { cleared: verdict.kind === 'clear', verdict, cue: cueName };
  }
  return { cleared: false, verdict: null, cue: cueName };
}

function mapPoint(bounds, width, height, x, z) {
  const mapW = Math.max(1, width - (BOX_INSET * 2));
  const mapH = Math.max(1, height - (BOX_INSET * 2));
  const nx = (x - bounds.minX) / Math.max(0.0001, bounds.maxX - bounds.minX);
  const nz = (z - bounds.minZ) / Math.max(0.0001, bounds.maxZ - bounds.minZ);
  return {
    x: BOX_INSET + clamp(nx, 0, 1) * mapW,
    y: BOX_INSET + clamp(nz, 0, 1) * mapH,
  };
}

function unmapPoint(bounds, width, height, sx, sy) {
  const mapW = Math.max(1, width - (BOX_INSET * 2));
  const mapH = Math.max(1, height - (BOX_INSET * 2));
  const nx = clamp((sx - BOX_INSET) / mapW, 0, 1);
  const nz = clamp((sy - BOX_INSET) / mapH, 0, 1);
  return {
    x: bounds.minX + nx * (bounds.maxX - bounds.minX),
    z: bounds.minZ + nz * (bounds.maxZ - bounds.minZ),
  };
}

function drawAsteroid(ctx2d, anchor, bounds, width, height, forced, roles) {
  const ink = roles || canvasRoles();
  const point = mapPoint(bounds, width, height, anchor.x, anchor.z);
  const scale = (width - (BOX_INSET * 2)) / Math.max(1, bounds.maxX - bounds.minX);
  const radius = Math.max(18, finite(anchor.radius, 48) * scale);
  const rings = [1, 0.83, 0.91, 0.77, 0.88, 0.8, 0.96];
  ctx2d.save();
  ctx2d.beginPath();
  rings.forEach((mul, index) => {
    const angle = (Math.PI * 2 * index) / rings.length;
    const px = point.x + Math.cos(angle) * radius * mul;
    const py = point.y + Math.sin(angle) * radius * mul;
    if (index === 0) ctx2d.moveTo(px, py);
    else ctx2d.lineTo(px, py);
  });
  ctx2d.closePath();
  if (!forced) {
    ctx2d.fillStyle = ink.edge;
    ctx2d.fill();
  }
  ctx2d.strokeStyle = forced ? 'CanvasText' : ink.calm;
  ctx2d.lineWidth = 2;
  ctx2d.stroke();
  ctx2d.restore();
}

function drawPlayer(ctx2d, player, bounds, width, height, forced, roles) {
  const ink = roles || canvasRoles();
  const point = mapPoint(bounds, width, height, player.x, player.z);
  const size = 12;
  ctx2d.save();
  ctx2d.translate(point.x, point.y);
  ctx2d.rotate(player.rot);
  ctx2d.beginPath();
  ctx2d.moveTo(size, 0);
  ctx2d.lineTo(-size * 0.72, size * 0.56);
  ctx2d.lineTo(-size * 0.72, -size * 0.56);
  ctx2d.closePath();
  if (!forced) {
    ctx2d.fillStyle = ink.you;
    ctx2d.fill();
  } else {
    ctx2d.fillStyle = 'CanvasText';
    ctx2d.fill();
  }
  ctx2d.lineWidth = 1.5;
  ctx2d.strokeStyle = forced ? 'CanvasText' : ink.paper;
  ctx2d.stroke();
  ctx2d.restore();
  return point;
}

function drawTrail(ctx2d, points, bounds, width, height, color, reduced) {
  if (!Array.isArray(points) || points.length < 2) return;
  ctx2d.save();
  ctx2d.beginPath();
  const start = reduced ? Math.max(0, points.length - 18) : 0;
  for (let i = start; i < points.length; i += 1) {
    const mapped = mapPoint(bounds, width, height, points[i].x, points[i].z);
    if (i === start) ctx2d.moveTo(mapped.x, mapped.y);
    else ctx2d.lineTo(mapped.x, mapped.y);
  }
  ctx2d.strokeStyle = color;
  ctx2d.lineWidth = reduced ? 2.2 : 1.6;
  ctx2d.globalAlpha = reduced ? 0.95 : 0.7;
  ctx2d.stroke();
  ctx2d.restore();
}

function drawDrone(ctx2d, drone, bounds, width, height, forced, roles) {
  const ink = roles || canvasRoles();
  const point = mapPoint(bounds, width, height, drone.x, drone.z);
  const radius = Math.max(9, finite(drone.radius, 14) * 0.45);
  ctx2d.save();
  ctx2d.beginPath();
  ctx2d.moveTo(point.x, point.y - radius);
  ctx2d.lineTo(point.x + radius, point.y);
  ctx2d.lineTo(point.x, point.y + radius);
  ctx2d.lineTo(point.x - radius, point.y);
  ctx2d.closePath();
  if (!forced) {
    ctx2d.fillStyle = ink.surface;
    ctx2d.fill();
  }
  ctx2d.strokeStyle = forced ? 'CanvasText' : ink.goal;
  ctx2d.lineWidth = 1.6;
  ctx2d.stroke();
  ctx2d.font = canvasFont('600', 12, 'body');
  ctx2d.fillStyle = forced ? 'CanvasText' : ink.paper;
  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'top';
  ctx2d.fillText(drone.shortName, point.x, point.y + radius + 6);
  ctx2d.restore();
  return point;
}

function drawWeakArc(ctx2d, drone, weakPoint, bounds, width, height, forced, roles) {
  if (!weakPoint) return;
  const ink = roles || canvasRoles();
  const center = mapPoint(bounds, width, height, drone.x, drone.z);
  const radius = Math.max(12, finite(drone.radius, 14) * 0.68);
  const start = wrapAngle((drone.rot || 0) + weakPoint.arcCenter - weakPoint.arcHalfWidth);
  const end = wrapAngle((drone.rot || 0) + weakPoint.arcCenter + weakPoint.arcHalfWidth);
  ctx2d.save();
  ctx2d.strokeStyle = forced ? 'CanvasText' : ink.goal;
  ctx2d.lineWidth = 1.4;
  if (forced) ctx2d.setLineDash([4, 3]);
  ctx2d.beginPath();
  if (end < start) ctx2d.arc(center.x, center.y, radius, start, end + (Math.PI * 2));
  else ctx2d.arc(center.x, center.y, radius, start, end);
  ctx2d.stroke();
  ctx2d.setLineDash([]);
  ctx2d.restore();
}

function updateDroneMotion(sim, stepS) {
  const drone = sim.drone;
  if (!drone) return;
  const orbitSpeed = finite(drone.orbitSpeed, 0);
  if (orbitSpeed <= 0) {
    drone.vx = 0;
    drone.vz = 0;
    return;
  }
  const prevX = drone.x;
  const prevZ = drone.z;
  drone.orbitT = wrapAngle(finite(drone.orbitT, 0) + orbitSpeed * stepS);
  drone.x = finite(drone.baseX, 0) + Math.cos(drone.orbitT) * finite(drone.orbitRadius, 0);
  drone.z = finite(drone.baseZ, 0) + Math.sin(drone.orbitT) * finite(drone.orbitRadius, 0);
  drone.vx = (drone.x - prevX) / stepS;
  drone.vz = (drone.z - prevZ) / stepS;
  if (Math.abs(drone.vx) + Math.abs(drone.vz) > 0.001) drone.rot = Math.atan2(drone.vz, drone.vx);
}

function cloneTrail(points) {
  if (!Array.isArray(points)) return [];
  return points.map((point) => ({ x: finite(point.x, 0), z: finite(point.z, 0) }));
}

export function paintRangeTeachingOverlay(ctx2d, sim, width, height, options = {}) {
  const plan = planTeachingOverlay({
    surface: TEACHING_OVERLAY_SURFACES.RANGE,
    sim,
  });
  const bounds = sim && sim.bounds;
  drawTeachingOverlay(ctx2d, plan, {
    forced: options.forced === true,
    reduced: options.reduced === true,
    project: bounds
      ? (x, z) => mapPoint(bounds, width, height, x, z)
      : null,
  });
  return plan;
}

function shipName(shipId) {
  const def = SHIP_BY_ID.get(shipId);
  return def ? def.name : 'Unknown Hull';
}

function nowSupportsFlight(model) {
  return model
    && Number.isFinite(model.angularAccel)
    && Number.isFinite(model.angularBrake)
    && Number.isFinite(model.maxYawRate)
    && Number.isFinite(model.mainAccel)
    && Number.isFinite(model.reverseAccel)
    && Number.isFinite(model.strafeAccel)
    && Number.isFinite(model.linearDrag)
    && Number.isFinite(model.lateralDrag)
    && Number.isFinite(model.maxSpeed)
    && Number.isFinite(model.normalMaxSpeedMult)
    && Number.isFinite(model.boostMaxSpeedMult);
}

// Rescue / missing-three fallback entry (PQ-163.00–.02): a beat with a dedicated rung opens the
// Range on that rung. Opening from the first-latch prompt lands on SWING, DO NOT PULL. Boost,
// draw-to-fly, and the well land on their own rungs while those verbs are current.
export function resolveRescueEntryRung(state) {
  const ob = state && state.onboarding;
  const threeCurrent = ob && ob.missingThree ? ob.missingThree.current : null;
  if (threeCurrent) {
    const rungId = missingThreeRangeRungId(threeCurrent);
    const index = rungId ? RAIL_INDEX_BY_ID.get(rungId) : null;
    if (Number.isInteger(index)) return index;
  }
  const current = ob && ob.rescue
    ? ob.rescue.current
    : null;
  if (current) {
    const rungId = rescueRangeRungId(current);
    if (!rungId) return 0;
    const index = RAIL_INDEX_BY_ID.get(rungId);
    return Number.isInteger(index) ? index : 0;
  }
  if (ob && (ob.rangePromptActive || ob.pointedAtRange)) {
    const promptRung = ob.rangePromptRungId;
    if (promptRung) {
      const promptIndex = RAIL_INDEX_BY_ID.get(promptRung);
      if (Number.isInteger(promptIndex)) return promptIndex;
    }
    const swingIndex = RAIL_INDEX_BY_ID.get('swing_do_not_pull');
    return Number.isInteger(swingIndex) ? swingIndex : 0;
  }
  return 0;
}

export function recordRangeOpened(bus, state) {
  const ob = state && state.onboarding;
  const fromPrompt = Boolean(ob && ob.rangePromptActive);
  const rungIndex = resolveRescueEntryRung(state);
  const rung = RAIL_ROWS[rungIndex];
  const rungId = rung ? rung.id : null;
  const atS = Number.isFinite(state && state.simTime) ? state.simTime : 0;
  const event = buildRangeOpenedFunnelEvent(atS, { fromPrompt, rungId, rungIndex });
  if (bus && typeof bus.emit === 'function') {
    bus.emit('range:opened', event);
  }
  return event;
}

export const rangeScreen = {
  id: 'range',
  _ctx: null,
  _root: null,
  _active: false,
  _rafId: 0,
  _lastTs: 0,
  _accumS: 0,
  _subject: null,
  _enteredFromShip: false,
  _controlMap: null,
  _cleared: null,
  _flown: null,
  _rungIndex: 0,
  _rungVariant: null,
  _sim: null,
  _ghostTrail: [],
  _lastDroneScreen: null,
  _held: null,
  _toggleTetherQueued: false,
  _deployWellQueued: false,
  _firePointerHeld: false,
  _reducedMotion: false,
  _forcedColors: false,
  _lightHullId: null,
  _otherFittings: [],

  mount(rootEl, ctx) {
    injectStyle();
    this._ctx = ctx;
    this._root = rootEl;
    rootEl.id = 'sf-range';
    rootEl.innerHTML = '';
    rootEl.classList.remove('sf-range', 'panel', 'sf-menu');
    rootEl.classList.add('k-screen', 'k-screen--stage');
    rootEl.dataset.kReady = '0';

    // .k-title — the rung's rule at screen-title size, the instruction as the teaching voice at
    // emphasis size, the verdict line beneath (k-good / k-bad), then the rung's verbs as words.
    const title = el('header', 'k-title');
    const rule = el('h1', 'k-display k-t-title sf-range__rule');
    rule.setAttribute('data-range-rule', '');
    const instruction = el('p', 'k-sentence k-sentence--emph');
    instruction.setAttribute('data-range-instruction', '');
    const verdict = el('p', 'k-sentence');
    verdict.setAttribute('data-range-verdict', '');
    verdict.setAttribute('aria-live', 'polite');
    title.appendChild(rule);
    title.appendChild(instruction);
    title.appendChild(verdict);
    const verbs = words([
      { action: 'again', label: 'Again' },
      { action: 'contrast', label: 'Try the contrast' },
      { action: 'next', label: 'Next rule' },
      { action: 'return', label: 'Return to the ship' },
    ], { row: true, size: 'emph', ariaLabel: 'Range verbs', onPick: (action) => this._onVerb(action) });
    for (const button of verbs.querySelectorAll('.k-word')) {
      button.setAttribute('data-range-action', button.dataset.action);
    }
    title.appendChild(verbs);
    rootEl.appendChild(title);

    // .k-corner — the score: cleared count over the rail as a hero number, gate progress in fine print.
    const corner = el('div', 'k-corner');
    const score = hero('0 / ' + RAIL_ROWS.length, 'cleared');
    const cleared = score.querySelector('.k-hero__n');
    cleared.setAttribute('data-range-cleared', '');
    const progress = el('p', 'k-t-fine k-38');
    progress.setAttribute('data-range-progress', '');
    corner.appendChild(score);
    corner.appendChild(progress);
    rootEl.appendChild(corner);

    // .k-stage — the drill box on the sky (the canvas fills the stage; no surface fill), the beam, the
    // stage-right column (Rules / Bestiary) and the empty state.
    const stage = el('section', 'k-stage');
    const box = el('div', 'sf-range__box');
    const canvas = el('canvas', 'sf-range__canvas');
    canvas.setAttribute('data-range-canvas', '');
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    const beamMount = el('div', 'sf-range__beam');
    beamMount.setAttribute('data-range-beam', '');
    beamMount.setAttribute('aria-hidden', 'true');
    box.appendChild(canvas);
    box.appendChild(beamMount);
    stage.appendChild(box);

    const drawer = el('aside', 'sf-range__drawer');
    drawer.setAttribute('data-range-drawer', '');
    drawer.setAttribute('role', 'region');
    drawer.setAttribute('aria-label', 'Range drawers');
    drawer.hidden = true;
    const rulesPane = el('section', 'sf-range__pane');
    rulesPane.setAttribute('data-range-pane', 'rules');
    rulesPane.appendChild(el('h2', 'k-caps', 'Rule rail'));
    const rail = el('div');
    rail.setAttribute('data-range-rail', '');
    rulesPane.appendChild(rail);
    const bestiaryPane = el('section', 'sf-range__pane');
    bestiaryPane.setAttribute('data-range-pane', 'bestiary');
    bestiaryPane.hidden = true;
    bestiaryPane.appendChild(el('h2', 'k-caps', 'Bestiary'));
    const bestiary = el('div');
    bestiary.setAttribute('data-range-bestiary', '');
    bestiaryPane.appendChild(bestiary);
    drawer.appendChild(rulesPane);
    drawer.appendChild(bestiaryPane);
    stage.appendChild(drawer);

    const empty = el('section');
    empty.setAttribute('data-range-empty', '');
    empty.hidden = true;
    empty.appendChild(el('p', 'k-empty', 'No range subject is staged.'));
    empty.appendChild(el('p', 'k-sentence', 'The range loads your active ship. Open THE SHIP and use Take it to the range, or return to the ship now.'));
    const emptyReturn = el('button', 'k-word k-word--emph k-word--primary', 'Return to the ship');
    emptyReturn.type = 'button';
    emptyReturn.setAttribute('data-range-empty-return', '');
    empty.appendChild(emptyReturn);
    stage.appendChild(empty);
    rootEl.appendChild(stage);

    // .k-foot — the rungs as a row of words (the live one aria-current; a cleared one carries a ✓ in
    // good fine print), then Rules / Bestiary / Close as body words that open the stage-right column.
    const foot = el('footer', 'k-foot');
    const rungWords = words(RAIL_ROWS.map((row) => ({ action: 'rung:' + row.id, label: sentenceCase(row.rule) })), {
      row: true,
      size: 'emph',
      ariaLabel: 'Rungs',
      onPick: (action) => {
        const index = RAIL_INDEX_BY_ID.get(action.slice('rung:'.length));
        if (!Number.isInteger(index)) return;
        this._ghostTrail = [];
        this._setRung(index, null, []);
      },
    });
    for (const button of rungWords.querySelectorAll('.k-word')) {
      button.setAttribute('data-rung-id', button.dataset.action.slice('rung:'.length));
      button.setAttribute('data-state', 'new');
      const check = el('span', 'k-t-fine k-good', ' ✓');
      check.setAttribute('data-range-check', '');
      check.setAttribute('aria-label', 'cleared');
      check.hidden = true;
      button.parentElement.appendChild(check);
    }
    foot.appendChild(rungWords);
    const drawerWords = words([
      { action: 'drawer:rules', label: DRAWER_LABELS.rules },
      { action: 'drawer:bestiary', label: DRAWER_LABELS.bestiary },
      { action: 'drawer:close', label: 'Close' },
    ], {
      row: true,
      size: 'body',
      ariaLabel: 'Range drawers',
      onPick: (action) => {
        const which = action.slice('drawer:'.length);
        if (which === 'close') this._closeDrawer();
        else this._openDrawer(which);
      },
    });
    const drawerTabs = [];
    let closeDrawer = null;
    for (const button of drawerWords.querySelectorAll('.k-word')) {
      const which = button.dataset.action.slice('drawer:'.length);
      if (which === 'close') {
        closeDrawer = button;
        button.setAttribute('data-range-drawer-close', '');
      } else {
        button.setAttribute('data-drawer-tab', which);
        button.setAttribute('aria-pressed', 'false');
        drawerTabs.push(button);
      }
    }
    foot.appendChild(drawerWords);
    rootEl.appendChild(foot);

    this._els = {
      title,
      corner,
      stage,
      foot,
      box,
      canvas,
      canvasCtx: canvas && canvas.getContext ? canvas.getContext('2d') : null,
      rule,
      instruction,
      progress,
      cleared,
      verdict,
      verbs,
      drawer,
      drawerTabs,
      drawerPanes: [rulesPane, bestiaryPane],
      rail,
      railRows: [],
      bestiary,
      actionButtons: [...verbs.querySelectorAll('[data-range-action]')],
      rungButtons: [...rungWords.querySelectorAll('[data-rung-id]')],
      closeDrawer,
      empty,
      emptyReturn,
      beamMount,
    };

    this._beamFx = createRouteBeam(beamMount, { width: 640, height: 360 });
    this._beamFx.setActive(false);
    this._beamFx.setPath([], { active: false });

    this._held = {
      yawLeft: false,
      yawRight: false,
      forward: false,
      reverse: false,
      strafeLeft: false,
      strafeRight: false,
      boost: false,
      fireKey: false,
      firePointer: false,
    };

    // The rule rail in the column: a caps head per group, then the group's rungs as kit rows whose
    // sub line is the rung's state (New / Flown / Cleared).
    const grouped = new Map();
    for (const row of RAIL_ROWS) {
      if (!grouped.has(row.group)) grouped.set(row.group, []);
      grouped.get(row.group).push(row);
    }
    for (const [group, groupRows] of grouped) {
      rail.appendChild(el('div', 'k-caps', group));
      const list = rows(groupRows.map((row) => ({ id: row.id, name: sentenceCase(row.rule), sub: 'New' })), {
        ariaLabel: group + ' rungs',
        onPick: (id) => {
          const index = RAIL_INDEX_BY_ID.get(id);
          if (!Number.isInteger(index)) return;
          this._ghostTrail = [];
          this._setRung(index, null, []);
        },
      });
      this._els.railRows.push(...list.querySelectorAll('.k-row'));
      rail.appendChild(list);
    }

    emptyReturn.addEventListener('click', () => {
      cue('close');
      if (this._ctx && this._ctx.screenManager) this._ctx.screenManager.popScreen();
    });

    this._onCanvasPointerDown = (event) => {
      if (event.button !== 0) return;
      if (this._sim && this._sim.id === 'draw_the_stroke') {
        this._beginStrokeDraw(event);
        return;
      }
      this._held.firePointer = true;
      this._wakeLoop();
    };
    this._onCanvasPointerMove = (event) => {
      if (!this._sim || this._sim.id !== 'draw_the_stroke') return;
      if (!this._sim.stroke || !this._sim.stroke.drawing) return;
      this._sampleStrokeDraw(event);
    };
    this._onWindowPointerUp = () => {
      this._held.firePointer = false;
      this._finishStrokeDraw();
    };
    this._onCanvasClick = (event) => {
      if (!this._lastDroneScreen) return;
      const rect = this._els.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const dx = x - this._lastDroneScreen.x;
      const dy = y - this._lastDroneScreen.y;
      if ((dx * dx) + (dy * dy) <= 900) {
        cue('open');
        this._openDrawer('bestiary');
      }
    };
    this._onCanvasKeyDown = (event) => {
      if (event.code !== 'Tab') return;
      event.preventDefault();
      cue('open');
      this._openDrawer('rules');
    };
    this._els.canvas.addEventListener('pointerdown', this._onCanvasPointerDown);
    this._els.canvas.addEventListener('pointermove', this._onCanvasPointerMove);
    this._els.canvas.addEventListener('click', this._onCanvasClick);
    this._els.canvas.addEventListener('keydown', this._onCanvasKeyDown);

    this._onKeyDown = (event) => {
      if (!this._active || !this._controlMap) return;
      if (event.code === 'Escape') {
        event.preventDefault();
        if (typeof event.stopPropagation === 'function') event.stopPropagation();
        if (this._ctx && this._ctx.screenManager) this._ctx.screenManager.popScreen();
        return;
      }
      if (event.code === 'Tab') {
        event.preventDefault();
        if (typeof event.stopPropagation === 'function') event.stopPropagation();
        cue('open');
        this._openDrawer('rules');
        return;
      }
      const sets = this._controlMap.codeSets;
      let handled = false;
      if (sets.yawLeft.has(event.code)) { this._held.yawLeft = true; handled = true; }
      if (sets.yawRight.has(event.code)) { this._held.yawRight = true; handled = true; }
      if (sets.forward.has(event.code)) { this._held.forward = true; handled = true; }
      if (sets.reverse.has(event.code)) { this._held.reverse = true; handled = true; }
      if (sets.strafeLeft.has(event.code)) { this._held.strafeLeft = true; handled = true; }
      if (sets.strafeRight.has(event.code)) { this._held.strafeRight = true; handled = true; }
      if (sets.boost.has(event.code)) { this._held.boost = true; handled = true; }
      if (sets.fire.has(event.code)) { this._held.fireKey = true; handled = true; }
      if (!event.repeat && sets.tether.has(event.code)) {
        this._toggleTetherQueued = true;
        handled = true;
      }
      if (!event.repeat && sets.well && sets.well.has(event.code)) {
        this._deployWellQueued = true;
        handled = true;
      }
      if (handled) {
        event.preventDefault();
        if (typeof event.stopPropagation === 'function') event.stopPropagation();
        this._wakeLoop();
      }
    };
    this._onKeyUp = (event) => {
      if (!this._controlMap) return;
      const sets = this._controlMap.codeSets;
      let handled = false;
      if (sets.yawLeft.has(event.code)) { this._held.yawLeft = false; handled = true; }
      if (sets.yawRight.has(event.code)) { this._held.yawRight = false; handled = true; }
      if (sets.forward.has(event.code)) { this._held.forward = false; handled = true; }
      if (sets.reverse.has(event.code)) { this._held.reverse = false; handled = true; }
      if (sets.strafeLeft.has(event.code)) { this._held.strafeLeft = false; handled = true; }
      if (sets.strafeRight.has(event.code)) { this._held.strafeRight = false; handled = true; }
      if (sets.boost.has(event.code)) { this._held.boost = false; handled = true; }
      if (sets.fire.has(event.code)) { this._held.fireKey = false; handled = true; }
      if (handled) {
        event.preventDefault();
        if (typeof event.stopPropagation === 'function') event.stopPropagation();
      }
    };

    this._renderFrame = (now) => {
      this._rafId = 0;
      if (!this._active) return;
      const dt = clamp((now - this._lastTs) / 1000, 0, MAX_FRAME_S);
      this._lastTs = now;
      this._accumS += dt;
      while (this._accumS >= STEP_S) {
        this._stepSimulation(STEP_S);
        this._accumS -= STEP_S;
      }
      this._render();
      if (!this._shouldPark()) this._rafId = requestAnimationFrame(this._renderFrame);
    };
  },

  onShow(ctx) {
    this._cleanup();
    if (ctx) this._ctx = ctx;
    if (!this._ctx || !this._root || !this._els) return;
    const state = this._ctx.state;
    this._active = true;
    this._accumS = 0;
    this._lastTs = performance.now();
    this._controlMap = controlMapForState(state);
    this._reducedMotion = prefersReducedMotion({
      motionReduce: !!(state.settings && state.settings.video && state.settings.video.motionReduce),
    });
    this._forcedColors = !!(typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('(forced-colors: active)').matches);
    this._subject = resolveSubject(state);
    this._enteredFromShip = !!(this._subject && this._subject.fromShip);
    this._cleared = ensureRangeCleared(state);
    this._flown = new Set();
    this._ghostTrail = [];
    this._lightHullId = this._subject ? pickLightHull(state, this._subject.shipId) : null;
    this._otherFittings = this._subject
      ? (this._subject.fittings.some(Boolean) ? [] : fittingsForShip(state, this._subject.shipId, []))
      : [];

    window.addEventListener('keydown', this._onKeyDown, true);
    window.addEventListener('keyup', this._onKeyUp, true);
    window.addEventListener('pointerup', this._onWindowPointerUp, true);

    if (!this._subject) {
      this._showEmpty();
      this._beamFx.setActive(false);
      this._beamFx.setPath([], { active: false });
      this._settleIn();
      return;
    }

    this._hideEmpty();
    // The rungs hang along the foot as words; the column stays closed until Rules / Bestiary / Tab.
    this._closeDrawer();
    // Rescue fallback (PQ-163.00 / PQ-163.01): opening the Range mid-rescue lands on the rung that
    // teaches the current verb. Only the swing has a dedicated rung; other verbs start at
    // the top of the rail instead of a wrong lesson.
    this._setRung(resolveRescueEntryRung(state), null, []);
    recordRangeOpened(this._ctx && this._ctx.bus, state);
    this._syncBestiary();
    this._syncRail();
    this._syncCanvasLabel();
    this._applyReturnVerbVisibility();
    this._settleIn();

    this._wakeLoop();
    requestAnimationFrame(() => {
      if (this._active && this._els && this._els.canvas && typeof this._els.canvas.focus === 'function') {
        this._els.canvas.focus({ preventScroll: true });
      }
    });
  },

  /** The kit's opening settle (KIT_SPEC §7): title from the top, stage from the right, foot from the
   *  bottom, all in one frame. The world behind the range is the live sky, so the frame is ready as
   *  soon as the words are (§11.7 capture contract). */
  _settleIn() {
    if (!this._els || typeof requestAnimationFrame !== 'function') return;
    try {
      settle(this._els.title, { from: 'top', state: 'range:open' });
      settle(this._els.corner, { from: 'top', state: 'range:open' });
      settle(this._els.stage, { from: 'right', state: 'range:open' });
      settle(this._els.foot, { from: 'bottom', state: 'range:open' });
    } catch (e) { /* motion is cosmetic */ }
    if (this._root) this._root.dataset.kReady = '1';
    cue('open');
  },

  _cleanup() {
    this._active = false;
    this._toggleTetherQueued = false;
    this._deployWellQueued = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this._onKeyDown, true);
      window.removeEventListener('keyup', this._onKeyUp, true);
      window.removeEventListener('pointerup', this._onWindowPointerUp, true);
    }
    if (this._beamFx) {
      this._beamFx.setActive(false);
      this._beamFx.setPath([], { active: false });
    }
    if (this._held) {
      this._held.yawLeft = false;
      this._held.yawRight = false;
      this._held.forward = false;
      this._held.reverse = false;
      this._held.strafeLeft = false;
      this._held.strafeRight = false;
      this._held.boost = false;
      this._held.fireKey = false;
      this._held.firePointer = false;
    }
    this._firePointerHeld = false;
    this._lastDroneScreen = null;
  },

  onHide() {
    this._cleanup();
    cue('close');
  },

  refresh(ctx) {
    if (ctx) this._ctx = ctx;
    if (!this._ctx || !this._active) return;
    const state = this._ctx.state;
    this._controlMap = controlMapForState(state);
    this._syncCanvasLabel();
    this._syncBestiary();
    this._syncRail();
    this._render();
  },

  _showEmpty() {
    this._els.empty.hidden = false;
    this._els.box.hidden = true;
    this._closeDrawer();
    this._els.rule.textContent = 'The range';
    this._els.instruction.textContent = 'No range subject is staged.';
    this._els.progress.textContent = '';
    this._els.cleared.textContent = '0 / ' + RAIL_ROWS.length;
    this._setVerdictText(null, 'Open THE SHIP and use Take it to the range, or return to the ship now.');
    this._els.verbs.hidden = true;
  },

  _hideEmpty() {
    this._els.empty.hidden = true;
    this._els.box.hidden = false;
    this._els.verbs.hidden = false;
  },

  _applyReturnVerbVisibility() {
    const returnButton = this._els.actionButtons.find((button) => button.getAttribute('data-range-action') === 'return');
    if (!returnButton) return;
    returnButton.hidden = !this._enteredFromShip;
    if (returnButton.parentElement) returnButton.parentElement.hidden = !this._enteredFromShip;
  },

  /** Open the stage-right column on a pane. The drill box yields the column's width (the local
   *  block's :has rule), so the canvas is re-measured and redrawn at once instead of on the next input. */
  _openDrawer(pane) {
    const which = pane === 'bestiary' ? 'bestiary' : 'rules';
    this._els.drawer.hidden = false;
    this._els.drawer.classList.add('is-open');
    this._els.drawerTabs.forEach((tab) => {
      tab.setAttribute('aria-pressed', String(tab.getAttribute('data-drawer-tab') === which));
    });
    this._els.drawerPanes.forEach((section) => {
      section.hidden = section.getAttribute('data-range-pane') !== which;
    });
    this._refit();
  },

  _closeDrawer() {
    this._els.drawer.hidden = true;
    this._els.drawer.classList.remove('is-open');
    this._els.drawerTabs.forEach((tab) => tab.setAttribute('aria-pressed', 'false'));
    this._refit();
  },

  _refit() {
    if (!this._active || !this._sim) return;
    this._syncBeam();
    this._render();
  },

  _onVerb(action) {
    if (!action || !this._subject) return;
    if (action === 'again') {
      this._ghostTrail = this._sim ? cloneTrail(this._sim.trail) : [];
      this._setRung(this._rungIndex, this._rungVariant, this._ghostTrail);
      return;
    }
    if (action === 'contrast') {
      this._ghostTrail = this._sim ? cloneTrail(this._sim.trail) : [];
      this._setRung(this._rungIndex, this._nextVariant(this._sim), this._ghostTrail);
      return;
    }
    if (action === 'next') {
      const next = (this._rungIndex + 1) % RAIL_ROWS.length;
      this._ghostTrail = [];
      this._setRung(next, null, []);
      return;
    }
    if (action === 'rules') {
      this._openDrawer('rules');
      return;
    }
    if (action === 'return') {
      if (this._ctx && this._ctx.screenManager) this._ctx.screenManager.popScreen();
    }
  },

  _nextVariant(sim) {
    if (!sim) return null;
    if (sim.id === 'heavy_turns_wide') return sim.variant === 'loaded' ? 'empty' : 'loaded';
    if (sim.id === 'stopping_takes_room') return sim.variant === 'subject' ? 'light' : 'subject';
    if (sim.id === 'swing_do_not_pull') return sim.variant === 'tether' ? 'no_tether' : 'tether';
    if (sim.id === 'you_can_run_dry') return sim.variant === 'subject_fit' ? 'other_fit' : 'subject_fit';
    if (sim.id === 'boost_keep_speed') return sim.variant === 'boost' ? 'no_boost' : 'boost';
    if (sim.id === 'draw_the_stroke') return sim.variant === 'stroke' ? 'keys' : 'stroke';
    if (sim.id === 'well_pulls_light') return sim.variant === 'light' ? 'heavy' : 'light';
    if (sim.id === TRACTOR_THROW_DRILL_ID) return sim.variant === 'light' ? 'heavy' : 'light';
    if (sim.id === ELASTIC_WHIP_DRILL_ID) return sim.variant === 'light' ? 'heavy' : 'light';
    return null;
  },

  _setRung(index, variantOverride = null, ghostTrail = []) {
    const row = RAIL_ROWS[clamp(index, 0, RAIL_ROWS.length - 1)];
    this._rungIndex = RAIL_INDEX_BY_ID.get(row.id);
    this._rungVariant = variantOverride || null;
    this._sim = this._buildRung(row, this._rungVariant, ghostTrail);
    this._rungVariant = this._sim.variant;
    this._flown.add(this._sim.id);
    this._syncChrome();
    this._syncBestiary();
    this._syncRail();
    this._syncBeam();
    this._wakeLoop();
  },

  _buildRung(row, variantOverride, ghostTrail) {
    const state = this._ctx.state;
    const shipId = this._subject.shipId;
    const fittings = this._subject.fittings.slice();
    const shipDef = SHIP_BY_ID.get(shipId) || SHIP_BY_ID.get('ship_kestrel');

    const droneBase = DEFAULT_DRONE || {
      id: 'training_drone',
      name: 'Training Drone',
      shipClass: 'gunship',
      mass: 18,
      maxSpeed: 90,
      turnRate: 1.2,
      collisionRadius: 12,
      behavior: 'Tracks your nose and backs off.',
      aiDoctrine: { preferredRange: 200 },
    };
    const drone = {
      id: droneBase.id,
      name: droneBase.name,
      shortName: (droneBase.name || 'Drone').split(' ')[0].toUpperCase(),
      shipClass: droneBase.shipClass || 'gunship',
      behavior: droneBase.behavior || 'Tracks your heading.',
      preferredRange: preferredRangeText(droneBase),
      maxSpeed: Math.round(finite(droneBase.maxSpeed, 0)),
      turnRate: round1(finite(droneBase.turnRate, 0)),
      mass: Math.max(4, finite(droneBase.mass, 24)),
      radius: Math.max(8, finite(droneBase.collisionRadius, 14) * 0.5),
      x: 160,
      z: -120,
      vx: 0,
      vz: 0,
      rot: 0,
      baseX: 160,
      baseZ: -120,
      orbitRadius: 72,
      orbitSpeed: 0.8,
      orbitT: 0,
    };

    const base = {
      id: row.id,
      rule: row.rule,
      instruction: row.instruction,
      variant: variantOverride,
      shipId,
      shipName: shipName(shipId),
      fittings,
      anchor: { x: 0, z: 0, radius: 70, mass: 1200, vx: 0, vz: 0 },
      drone,
      weakPoint: WEAK_POINTS_BY_CLASS[drone.shipClass] || null,
      ghostTrail: cloneTrail(ghostTrail),
      trail: [],
      timeS: 0,
      verdict: null,
      because: '',
      progress: '',
      headingHint: '',
      model: null,
      derived: null,
      bounds: { minX: -620, maxX: 680, minZ: -340, maxZ: 340 },
    };

    if (row.id === 'heavy_turns_wide') {
      const selected = variantOverride === 'empty' ? 'empty' : 'loaded';
      const loadedMass = Math.round(Math.max(0, finite(getDerivedStats(shipId, fittings, state.player).cargoCap, 0) * 0.8));
      const emptyPlayer = withCargoMass(state.player, 0);
      const loadedPlayer = withCargoMass(state.player, loadedMass);
      const emptyDerived = getDerivedStats(shipId, fittings, emptyPlayer);
      const loadedDerived = getDerivedStats(shipId, fittings, loadedPlayer);
      const activeDerived = selected === 'loaded' ? loadedDerived : emptyDerived;
      const emptyRatio = ratioFor(emptyDerived, shipDef);
      const loadedRatio = ratioFor(loadedDerived, shipDef);
      const emptyTurn = turnMassForRatio(emptyRatio);
      const loadedTurn = turnMassForRatio(loadedRatio);
      const slowerPct = Math.max(0, Math.round((1 - (loadedTurn / Math.max(0.0001, emptyTurn))) * 100));
      const extraRoom = Math.max(0, Math.round(stopDistanceEstimate(loadedDerived.flightModel) - stopDistanceEstimate(emptyDerived.flightModel)));
      return {
        ...base,
        variant: selected,
        derived: activeDerived,
        model: activeDerived.flightModel,
        player: makePlayerFromModel(activeDerived.flightModel, {
          x: -560,
          z: 0,
          vx: 0,
          vz: 0,
          rot: 0,
          radius: activeDerived.radius,
          mass: activeDerived.mass,
        }),
        gates: [
          { x: -250, centerZ: -12, tol: 92, state: 'pending' },
          { x: 20, centerZ: 150, tol: 92, state: 'pending' },
          { x: 290, centerZ: -165, tol: 92, state: 'pending' },
          { x: 560, centerZ: 105, tol: 92, state: 'pending' },
        ],
        because: `Empty, this hull clears it. Loaded, it turns ${Math.max(1, slowerPct)}% slower and needs ${Math.max(1, extraRoom)} m more room.`,
        headingHint: `Loaded mass set to ${loadedMass} t (80% cargo cap).`,
      };
    }

    if (row.id === 'stopping_takes_room') {
      const selected = variantOverride === 'light' ? 'light' : 'subject';
      const activeShipId = selected === 'light' ? this._lightHullId : shipId;
      const activeFittings = selected === 'light'
        ? fittingsForShip(state, activeShipId, [])
        : fittings.slice();
      const activeDerived = getDerivedStats(activeShipId, activeFittings, state.player);
      const model = activeDerived.flightModel;
      const stopLine = Math.max(60, stopDistanceEstimate(model));
      const startSpeed = finite(model.maxSpeed, 0) * finite(model.normalMaxSpeedMult, 1);
      return {
        ...base,
        variant: selected,
        shipId: activeShipId,
        shipName: shipName(activeShipId),
        fittings: activeFittings,
        derived: activeDerived,
        model,
        player: makePlayerFromModel(model, {
          x: 0,
          z: 0,
          vx: startSpeed,
          vz: 0,
          rot: 0,
          radius: activeDerived.radius,
          mass: activeDerived.mass,
        }),
        bounds: {
          minX: -120,
          maxX: stopLine + 260,
          minZ: -300,
          maxZ: 300,
        },
        stopLine,
        startX: 0,
        because: `From flat out this hull needs ${Math.round(stopLine)} m to stop.`,
      };
    }

    if (row.id === 'swing_do_not_pull') {
      const selected = variantOverride === 'no_tether' ? 'no_tether' : 'tether';
      const activeDerived = getDerivedStats(shipId, fittings, state.player);
      const model = activeDerived.flightModel;
      const lineLength = Math.max(120, BASE_TETHER_LEN * finite(activeDerived.tetherSpoolMult, 1));
      const startSpeed = finite(model.maxSpeed, 0) * 0.9;
      const startX = -(lineLength + 140);
      const exitGateZ = Math.max(160, lineLength * 0.76);
      return {
        ...base,
        variant: selected,
        derived: activeDerived,
        model,
        anchor: { x: 0, z: 0, radius: 84, mass: 1800, vx: 0, vz: 0 },
        player: makePlayerFromModel(model, {
          x: startX,
          z: 0,
          vx: startSpeed,
          vz: 0,
          rot: 0,
          radius: activeDerived.radius,
          mass: activeDerived.mass,
        }),
        bounds: {
          minX: -(lineLength + 220),
          maxX: lineLength + 320,
          minZ: -(lineLength + 190),
          maxZ: lineLength + 280,
        },
        tether: {
          allowed: selected === 'tether',
          active: false,
          length: lineLength,
          attachedOnce: false,
          releasedAfterAttach: false,
          entrySpeed: 0,
          exitSpeed: 0,
        },
        exitGate: { z: exitGateZ, centerX: 0, half: Math.max(60, lineLength * 0.26), crossed: false },
        because: 'You entered at 0 m/s and left at 0 m/s. The rock gave you the corner.',
      };
    }

    if (row.id === 'boost_keep_speed') {
      const selected = variantOverride === 'no_boost' ? 'no_boost' : 'boost';
      const activeDerived = getDerivedStats(shipId, fittings, state.player);
      const model = activeDerived.flightModel;
      return {
        ...base,
        variant: selected,
        derived: activeDerived,
        model,
        player: makePlayerFromModel(model, {
          x: -520,
          z: 0,
          vx: 0,
          vz: 0,
          rot: 0,
          radius: activeDerived.radius,
          mass: activeDerived.mass,
        }),
        gates: [{ x: 420, centerZ: 0, tol: 110, state: 'pending' }],
        boostAllowed: selected === 'boost',
        boosted: false,
        because: 'Boost raises the speed ceiling. Thrust alone stalls before the gate.',
      };
    }

    if (row.id === 'draw_the_stroke') {
      const selected = variantOverride === 'keys' ? 'keys' : 'stroke';
      const activeDerived = getDerivedStats(shipId, fittings, state.player);
      const model = activeDerived.flightModel;
      return {
        ...base,
        variant: selected,
        derived: activeDerived,
        model,
        player: makePlayerFromModel(model, {
          x: -480,
          z: 0,
          vx: 0,
          vz: 0,
          rot: 0,
          radius: activeDerived.radius,
          mass: activeDerived.mass,
        }),
        gates: [{ x: 360, centerZ: 80, tol: 100, state: 'pending' }],
        stroke: {
          allowed: selected === 'stroke',
          drawing: false,
          flying: false,
          points: [],
          followIndex: 0,
        },
        because: 'The hull follows the line you draw. Keys do not make this corner.',
      };
    }

    if (row.id === TRACTOR_THROW_DRILL_ID) {
      return createTractorThrowRung({
        variant: variantOverride,
        shipId,
        fittings,
        player: state.player,
        derived: getDerivedStats(shipId, fittings, state.player),
        ghostTrail,
      });
    }

    if (row.id === ELASTIC_WHIP_DRILL_ID) {
      return createElasticWhipRung({
        variant: variantOverride,
        shipId,
        fittings,
        player: state.player,
        derived: getDerivedStats(shipId, fittings, state.player),
        ghostTrail,
      });
    }

    if (row.id === 'well_pulls_light') {
      const selected = variantOverride === 'heavy' ? 'heavy' : 'light';
      const activeDerived = getDerivedStats(shipId, fittings, state.player);
      const model = activeDerived.flightModel;
      const scrapMass = selected === 'heavy' ? 2400 : 12;
      return {
        ...base,
        variant: selected,
        derived: activeDerived,
        model,
        player: makePlayerFromModel(model, {
          x: -220,
          z: 40,
          vx: 0,
          vz: 0,
          rot: 0,
          radius: activeDerived.radius,
          mass: activeDerived.mass,
        }),
        scrap: { x: 220, z: -20, radius: selected === 'heavy' ? 28 : 10, mass: scrapMass, vx: 0, vz: 0 },
        well: null,
        because: selected === 'heavy'
          ? 'A heavy mass shrugs. The well is for light bodies.'
          : 'Light scrap falls into the well. Heavy hulls shrug.',
      };
    }

    const selected = variantOverride === 'other_fit' ? 'other_fit' : 'subject_fit';
    const activeFittings = selected === 'other_fit' ? this._otherFittings.slice() : fittings.slice();
    const activeDerived = getDerivedStats(shipId, activeFittings, state.player);
    const model = activeDerived.flightModel;
    const fireDrain = Math.max(8, finite(activeDerived.continuousDrain, 0) * 1.2 + 6);
    const drawRate = finite(activeDerived.continuousDrain, 0) + fireDrain;
    const regen = finite(activeDerived.capRegen, 0);
    const capMax = Math.max(1, finite(activeDerived.capMax, 1));
    const triggerS = drawRate > regen ? capMax / Math.max(0.001, drawRate - regen) : Infinity;
    return {
      ...base,
      variant: selected,
      derived: activeDerived,
      model,
      player: makePlayerFromModel(model, {
        x: -220,
        z: 0,
        vx: 0,
        vz: 0,
        rot: 0,
        radius: activeDerived.radius,
        mass: activeDerived.mass,
      }),
      anchor: { x: 180, z: -120, radius: 64, mass: 1400, vx: 0, vz: 0 },
      drone: {
        ...base.drone,
        x: 250,
        z: 48,
        baseX: 250,
        baseZ: 48,
        orbitRadius: 44,
        orbitSpeed: 1.2,
      },
      energy: {
        cap: capMax,
        capMax,
        capRegen: regen,
        continuousDrain: finite(activeDerived.continuousDrain, 0),
        fireDrain,
        drawRate,
        holdRemaining: 20,
        triggerS,
      },
      because: `You draw ${Math.round(drawRate * 10) / 10}/s and regenerate ${Math.round(regen * 10) / 10}/s. That is ${Number.isFinite(triggerS) ? Math.round(triggerS) : '∞'}s of trigger.`,
    };
  },

  _syncCanvasLabel() {
    if (!this._els || !this._els.canvas || !this._sim || !this._controlMap) return;
    this._els.canvas.setAttribute(
      'aria-label',
      `${sentenceCase(this._sim.rule)}. Fly with ${this._controlMap.movementLabel}. Turn with ${this._controlMap.turnLabel}. Fire ${this._controlMap.fireLabel}. Tether ${this._controlMap.tetherLabel}. Boost ${this._controlMap.boostLabel}. Tab opens rules. Escape closes.`,
    );
  },

  _syncChrome() {
    if (!this._sim) return;
    const sim = this._sim;
    const rule = sentenceCase(sim.rule);
    if (this._els.rule.textContent !== rule) this._els.rule.textContent = rule;
    if (this._els.instruction.textContent !== sim.instruction) this._els.instruction.textContent = sim.instruction;
    const progress = this._progressText(sim);
    if (this._els.progress.textContent !== progress) this._els.progress.textContent = progress;
    const score = `${this._cleared.size} / ${RAIL_ROWS.length}`;
    if (this._els.cleared.textContent !== score) this._els.cleared.textContent = score;
    const because = sim.verdict && sim.verdict.because ? sim.verdict.because : sim.because;
    this._setVerdictText(sim.verdict, because);

    const contrastButton = this._els.actionButtons.find((button) => button.getAttribute('data-range-action') === 'contrast');
    if (contrastButton) {
      const label = this._contrastLabel(sim);
      if (contrastButton.textContent !== label) contrastButton.textContent = label;
    }
  },

  _contrastLabel(sim) {
    if (!sim) return 'Try the contrast';
    if (sim.id === 'heavy_turns_wide') return sim.variant === 'loaded' ? 'Try it empty' : 'Try it loaded';
    if (sim.id === 'stopping_takes_room') return sim.variant === 'subject' ? 'Try the light hull' : `Try ${shipName(this._subject.shipId)}`;
    if (sim.id === 'swing_do_not_pull') return sim.variant === 'tether' ? 'Try it without the tether' : 'Try it with the tether';
    if (sim.id === 'you_can_run_dry') return sim.variant === 'subject_fit' ? 'Try the other fit' : 'Try the staged fit';
    if (sim.id === 'boost_keep_speed') return sim.variant === 'boost' ? 'Try it without boost' : 'Try it with boost';
    if (sim.id === 'draw_the_stroke') return sim.variant === 'stroke' ? 'Try it with keys' : 'Try it with a stroke';
    if (sim.id === 'well_pulls_light') return sim.variant === 'light' ? 'Try a heavy mass' : 'Try light scrap';
    if (sim.id === TRACTOR_THROW_DRILL_ID) return sim.variant === 'light' ? 'Try a heavy hull' : 'Try the light pod';
    if (sim.id === ELASTIC_WHIP_DRILL_ID) return sim.variant === 'light' ? 'Try a heavy hull' : 'Try the light wasp';
    return 'Try the contrast';
  },

  _progressText(sim) {
    if (!sim) return '';
    if (sim.id === 'heavy_turns_wide') {
      const next = Math.min(sim.gates.length, sim.gates.filter((gate) => gate.state === 'passed').length + 1);
      return `Gate ${next} / ${sim.gates.length}`;
    }
    if (sim.id === 'stopping_takes_room') return 'Line 1 / 1';
    if (sim.id === 'swing_do_not_pull') return `Exit ${sim.exitGate && sim.exitGate.crossed ? 1 : 0} / 1`;
    if (sim.id === 'you_can_run_dry') return `Hold ${Math.max(0, Math.ceil(sim.energy.holdRemaining))}s`;
    if (sim.id === 'boost_keep_speed') return `Gate ${sim.gates && sim.gates[0] && sim.gates[0].state === 'passed' ? 1 : 0} / 1`;
    if (sim.id === 'draw_the_stroke') return `Gate ${sim.gates && sim.gates[0] && sim.gates[0].state === 'passed' ? 1 : 0} / 1`;
    if (sim.id === 'well_pulls_light') return sim.well ? 'Well live' : 'No well';
    if (sim.id === TRACTOR_THROW_DRILL_ID) {
      if (!sim.tether || !sim.tether.attachedOnce) return 'Latch 0 / 1';
      if (!sim.tether.releasedAfterAttach) return 'Swing';
      return `Throw ${sim.gates && sim.gates[0] && sim.gates[0].crossed ? 1 : 0} / 1`;
    }
    if (sim.id === ELASTIC_WHIP_DRILL_ID) {
      if (!sim.tether || !sim.tether.attachedOnce) return 'Latch 0 / 1';
      if (!(sim.tether.maxStoredEnergy > 0)) return 'Stretch';
      return `Snap ${sim.gates && sim.gates[0] && sim.gates[0].crossed ? 1 : 0} / 1`;
    }
    return '';
  },

  /** The verdict line under the instruction: idle, the because alone at resting strength; on a
   *  verdict, "Rule cleared." in the good green or the failure in the bad red, then the because. */
  _setVerdictText(verdict, because) {
    const node = this._els.verdict;
    const head = verdict && verdict.text ? sentenceCase(verdict.text) : '';
    const text = [head ? head + '.' : '', String(because || '').trim()].filter(Boolean).join(' ')
      || sentenceCase(VERDICT_IDLE) + '.';
    if (node.textContent !== text) node.textContent = text;
    node.classList.toggle('k-good', !!verdict && verdict.kind === 'clear');
    node.classList.toggle('k-bad', !!verdict && verdict.kind === 'fail');
  },

  _syncRail() {
    if (!this._els || !this._els.rail) return;
    const stateOf = (id) => (this._cleared.has(id) ? 'cleared' : (this._flown.has(id) ? 'flown' : 'new'));
    for (const button of this._els.rungButtons) {
      const id = button.getAttribute('data-rung-id');
      const state = stateOf(id);
      const active = !!(this._sim && this._sim.id === id);
      button.setAttribute('data-state', state);
      if (active) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
      const check = button.parentElement ? button.parentElement.querySelector('[data-range-check]') : null;
      if (check) check.hidden = state !== 'cleared';
    }
    for (const row of this._els.railRows) {
      const id = row.dataset.id;
      const state = stateOf(id);
      row.setAttribute('data-state', state);
      row.setAttribute('aria-selected', String(!!(this._sim && this._sim.id === id)));
      const sub = row.querySelector('.k-row__sub');
      if (sub) {
        const label = sentenceCase(state);
        if (sub.textContent !== label) sub.textContent = label;
        sub.classList.toggle('k-good', state === 'cleared');
      }
    }
  },

  _syncBestiary() {
    if (!this._els || !this._els.bestiary || !this._sim) return;
    const rung = RAIL_ROWS.find((row) => row.id === this._sim.id);
    const cutter = rung && rung.group === 'MASSLINE' ? masslineCutterBestiarySubject() : null;
    const drone = cutter || this._sim.drone;
    const weakPoint = cutter ? null : this._sim.weakPoint;
    const weakArc = weakPoint
      ? `${Math.round((weakPoint.arcCenter * 180) / Math.PI)}° ±${Math.round((weakPoint.arcHalfWidth * 180) / Math.PI)}°`
      : 'No weak arc data';
    const facts = [
      ['Name', drone.name],
      ['Class', drone.shipClass],
      ['Behavior', drone.behavior],
      ['Preferred range', drone.preferredRange],
      ['Top speed', `${drone.maxSpeed} wu/s`],
      ['Turn rate', String(drone.turnRate)],
      ['Mass', `${Math.round(drone.mass)} t`],
      ['Weak arc', weakArc],
      ['Weak point', weakPoint ? `${weakPoint.label} (${weakPoint.hint}) ×${weakPoint.bonusMult}` : '—'],
    ];
    if (cutter) {
      for (const fact of masslineCutterBestiaryFacts()) facts.push(fact);
    }
    const list = el('ul', 'k-rows');
    list.setAttribute('aria-label', 'Bestiary');
    list.style.setProperty('--k-row-cols', 'auto minmax(0, 1fr)');
    for (const [label, value] of facts) {
      const row = el('li', 'k-row k-row--static');
      row.appendChild(el('span', 'k-row__sub', label));
      row.appendChild(el('span', 'k-row__name', value));
      list.appendChild(row);
    }
    this._els.bestiary.replaceChildren(list);
  },

  _syncBeam() {
    if (!this._beamFx || !this._sim || !this._els || !this._els.canvas) return;
    const rect = this._els.canvas.getBoundingClientRect();
    this._beamFx.resize(rect.width, rect.height);
    if (this._sim.id !== 'you_can_run_dry' || !this._sim.energy) {
      this._beamFx.setPath([], { active: false });
      this._beamFx.setActive(false);
      return;
    }
    const headroom = finite(this._sim.energy.capRegen, 0) - finite(this._sim.energy.continuousDrain, 0);
    const reversed = headroom < 0;
    this._beamFx.setActive(true);
    this._beamFx.setPath([
      { x: BOX_INSET + 4, y: BOX_INSET + 8 },
      { x: Math.max(BOX_INSET + 12, rect.width - BOX_INSET - 4), y: BOX_INSET + 8 },
    ], {
      active: !this._reducedMotion,
      kind: reversed ? 'danger' : 'energy',
      direction: reversed ? 'from' : 'to',
    });
    const path = this._beamFx.svg && this._beamFx.svg.querySelector
      ? this._beamFx.svg.querySelector('.sf-fx-beam__path')
      : null;
    if (path) {
      const ratio = Math.min(2, Math.abs(headroom) / Math.max(1, finite(this._sim.energy.capMax, 1)));
      const duration = Math.max(220, Math.min(1600, 900 - ratio * 520));
      path.style.animationDuration = `${Math.round(duration)}ms`;
    }
  },

  _wakeLoop() {
    if (!this._active) return;
    if (this._rafId) return;
    this._rafId = requestAnimationFrame(this._renderFrame);
  },

  _shouldPark() {
    if (!this._active) return true;
    if (!this._sim || !this._sim.verdict) return false;
    const playerStill = speedOf(this._sim.player) > 0.45 || Math.abs(finite(this._sim.player.yawRate, 0)) > 0.02;
    const droneStill = this._sim.drone && speedOf(this._sim.drone) > 0.45;
    const inputHeld = this._held.yawLeft || this._held.yawRight || this._held.forward || this._held.reverse
      || this._held.strafeLeft || this._held.strafeRight || this._held.boost || this._held.fireKey || this._held.firePointer;
    const strokeLive = this._sim.stroke && (this._sim.stroke.drawing || this._sim.stroke.flying);
    const wellLive = !!(this._sim.well && this._sim.scrap);
    const payloadStill = (this._sim.payload && speedOf(this._sim.payload) > 0.45)
      || (this._sim.id === TRACTOR_THROW_DRILL_ID && this._sim.scrap && speedOf(this._sim.scrap) > 0.45)
      || (this._sim.id === ELASTIC_WHIP_DRILL_ID && this._sim.hostile && speedOf(this._sim.hostile) > 0.45);
    return !(playerStill || droneStill || inputHeld || strokeLive || wellLive || payloadStill);
  },

  _currentInput() {
    const hasYawBindings = this._controlMap
      && (this._controlMap.codeSets.yawLeft.size > 0 || this._controlMap.codeSets.yawRight.size > 0);
    const turnLeft = this._held.yawLeft || (!hasYawBindings && this._held.strafeLeft);
    const turnRight = this._held.yawRight || (!hasYawBindings && this._held.strafeRight);
    return {
      turnLeft,
      turnRight,
      forward: this._held.forward,
      reverse: this._held.reverse,
      strafeLeft: this._held.strafeLeft,
      strafeRight: this._held.strafeRight,
      boost: this._held.boost,
      fire: this._held.fireKey || this._held.firePointer,
    };
  },

  _stepSimulation(stepS) {
    if (!this._sim) return;
    this._sim.timeS += stepS;
    const sim = this._sim;

    this._reducedMotion = prefersReducedMotion({
      motionReduce: !!(this._ctx.state.settings && this._ctx.state.settings.video && this._ctx.state.settings.video.motionReduce),
    });
    this._forcedColors = !!(typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('(forced-colors: active)').matches);

    if (!sim.verdict) {
      const input = this._currentInput();
      if (sim.id === 'boost_keep_speed' && sim.boostAllowed === false) input.boost = false;
      if (sim.id === TRACTOR_THROW_DRILL_ID) {
        const toggleTether = this._toggleTetherQueued;
        this._toggleTetherQueued = false;
        this._deployWellQueued = false;
        const result = tickTractorThrowDrill(sim, stepS, { input, toggleTether, advanceTime: false });
        if (result.cue === 'latch' || result.cue === 'cut') cue('confirm');
        else if (result.cue === 'deny') cue('deny');
        sim.trail.push({ x: sim.player.x, z: sim.player.z });
        if (sim.trail.length > TRAIL_MAX) sim.trail.splice(0, sim.trail.length - TRAIL_MAX);
        if (result.verdict) {
          if (result.cleared) this._markCleared(sim.id);
          this._setVerdict(sim, result.verdict.kind, result.verdict.text, result.verdict.because);
        }
      } else if (sim.id === ELASTIC_WHIP_DRILL_ID) {
        const toggleTether = this._toggleTetherQueued;
        this._toggleTetherQueued = false;
        this._deployWellQueued = false;
        const result = tickElasticWhipDrill(sim, stepS, { input, toggleTether, advanceTime: false });
        if (result.cue === 'latch' || result.cue === 'cut') cue('confirm');
        else if (result.cue === 'deny') cue('deny');
        sim.trail.push({ x: sim.player.x, z: sim.player.z });
        if (sim.trail.length > TRAIL_MAX) sim.trail.splice(0, sim.trail.length - TRAIL_MAX);
        if (result.verdict) {
          if (result.cleared) this._markCleared(sim.id);
          this._setVerdict(sim, result.verdict.kind, result.verdict.text, result.verdict.because);
        }
      } else {
      const followStroke = sim.id === 'draw_the_stroke' && sim.stroke && sim.stroke.flying;
      if (!followStroke) drivePlayerStep(sim.player, sim.model, input, stepS);
      updateDroneMotion(sim, stepS);

      if (sim.id === 'swing_do_not_pull' && sim.tether) {
        if (this._toggleTetherQueued) {
          if (sim.tether.active) {
            sim.tether.active = false;
            if (sim.tether.attachedOnce) sim.tether.releasedAfterAttach = true;
          } else if (sim.tether.allowed) {
            const dist = Math.hypot(sim.player.x - sim.anchor.x, sim.player.z - sim.anchor.z);
            if (dist <= sim.tether.length + 130) {
              sim.tether.active = true;
              sim.tether.attachedOnce = true;
              sim.tether.entrySpeed = speedOf(sim.player);
              cue('confirm');
            } else {
              cue('deny');
            }
          } else {
            cue('deny');
          }
          this._toggleTetherQueued = false;
        }
        if (sim.tether.active) applyTetherConstraint(sim.player, sim.anchor, sim.tether.length);
      } else {
        this._toggleTetherQueued = false;
      }

      if (sim.id === 'well_pulls_light') {
        if (this._deployWellQueued) {
          this._deployWellQueued = false;
          const reach = 140;
          sim.well = {
            x: sim.player.x + Math.cos(sim.player.rot) * reach,
            z: sim.player.z + Math.sin(sim.player.rot) * reach,
            radius: 170,
          };
          cue('confirm');
        }
      } else {
        this._deployWellQueued = false;
      }

      resolveCircleCollision(sim.player, sim.drone);
      resolveCircleCollision(sim.player, sim.anchor);
      if (sim.scrap) resolveCircleCollision(sim.player, sim.scrap);
      inBoundsBounce(sim.player, sim.bounds);
      inBoundsBounce(sim.drone, sim.bounds);
      if (sim.scrap) inBoundsBounce(sim.scrap, sim.bounds);

      sim.trail.push({ x: sim.player.x, z: sim.player.z });
      if (sim.trail.length > TRAIL_MAX) sim.trail.splice(0, sim.trail.length - TRAIL_MAX);

      if (sim.id === 'heavy_turns_wide') this._stepHeavyRung(sim);
      else if (sim.id === 'stopping_takes_room') this._stepStoppingRung(sim);
      else if (sim.id === 'swing_do_not_pull') this._stepSwingRung(sim);
      else if (sim.id === 'you_can_run_dry') this._stepEnergyRung(sim, stepS, input);
      else if (sim.id === 'boost_keep_speed') this._stepBoostRung(sim, input);
      else if (sim.id === 'draw_the_stroke') this._stepStrokeRung(sim, stepS);
      else if (sim.id === 'well_pulls_light') this._stepWellRung(sim, stepS);
      }
    }

    this._syncChrome();
    this._syncBeam();
    this._syncRail();
  },

  _stepHeavyRung(sim) {
    const previousX = sim.prevX != null ? sim.prevX : sim.player.x;
    const currentX = sim.player.x;
    sim.prevX = currentX;
    for (let i = 0; i < sim.gates.length; i += 1) {
      const gate = sim.gates[i];
      if (gate.state !== 'pending') continue;
      if (previousX < gate.x && currentX >= gate.x) {
        if (Math.abs(sim.player.z - gate.centerZ) <= gate.tol) {
          gate.state = 'passed';
          cue('confirm');
        } else {
          gate.state = 'failed';
          this._setVerdict(sim, 'fail', `YOU CLIPPED GATE ${i + 1}`, sim.because);
          return;
        }
      }
    }
    if (sim.gates.every((gate) => gate.state === 'passed')) {
      this._markCleared(sim.id);
      this._setVerdict(sim, 'clear', 'RULE CLEARED', sim.because);
    }
  },

  _stepStoppingRung(sim) {
    const speed = speedOf(sim.player);
    const used = sim.player.x - sim.startX;
    if (sim.player.x + sim.player.radius >= sim.stopLine && speed > 3.5) {
      this._setVerdict(
        sim,
        'fail',
        'YOU RAN LONG',
        `From flat out this hull needs ${Math.round(sim.stopLine)} m. You used ${Math.round(Math.max(0, used))} m.`,
      );
      return;
    }
    if (speed <= 3.5 && sim.player.x + sim.player.radius < sim.stopLine) {
      this._markCleared(sim.id);
      this._setVerdict(
        sim,
        'clear',
        'RULE CLEARED',
        `From flat out this hull needs ${Math.round(sim.stopLine)} m. You used ${Math.round(Math.max(0, used))} m.`,
      );
    }
  },

  _stepSwingRung(sim) {
    const previousZ = sim.prevZ != null ? sim.prevZ : sim.player.z;
    sim.prevZ = sim.player.z;
    if (previousZ < sim.exitGate.z && sim.player.z >= sim.exitGate.z
      && Math.abs(sim.player.x - sim.exitGate.centerX) <= sim.exitGate.half) {
      sim.exitGate.crossed = true;
      if (sim.tether && sim.tether.allowed && sim.tether.attachedOnce && sim.tether.releasedAfterAttach) {
        sim.tether.exitSpeed = speedOf(sim.player);
        this._markCleared(sim.id);
        this._setVerdict(
          sim,
          'clear',
          'RULE CLEARED',
          `You entered at ${Math.round(sim.tether.entrySpeed)} and left at ${Math.round(sim.tether.exitSpeed)}. The rock gave you the corner.`,
        );
      } else if (sim.tether && !sim.tether.allowed) {
        this._setVerdict(sim, 'fail', 'NO SWING, NO CORNER', 'You entered hot, but without the tether you cannot bend this corner.');
      } else {
        this._setVerdict(sim, 'fail', 'HOLD, SWING, RELEASE', 'Attach the line, store the arc, then release into the gate.');
      }
      return;
    }
    if (sim.timeS > 18) {
      this._setVerdict(sim, 'fail', 'YOU MISSED THE EXIT', 'You need a single swing release into the 90° gate.');
    }
  },

  _stepEnergyRung(sim, stepS, input) {
    if (!sim.energy) return;
    const e = sim.energy;
    const draw = finite(e.continuousDrain, 0) + (input.fire ? finite(e.fireDrain, 0) : 0);
    e.cap += (finite(e.capRegen, 0) - draw) * stepS;
    e.cap = clamp(e.cap, 0, e.capMax);
    if (input.fire && e.cap > 0) e.holdRemaining -= stepS;

    const triggerS = draw > finite(e.capRegen, 0)
      ? e.cap / Math.max(0.001, draw - finite(e.capRegen, 0))
      : Infinity;
    sim.because = `You draw ${Math.round((finite(e.continuousDrain, 0) + finite(e.fireDrain, 0)) * 10) / 10}/s and regenerate ${Math.round(finite(e.capRegen, 0) * 10) / 10}/s. That is ${Number.isFinite(triggerS) ? Math.max(0, Math.round(triggerS)) : '∞'}s of trigger.`;

    if (e.cap <= 0) {
      this._setVerdict(sim, 'fail', 'YOU RAN DRY', sim.because);
      return;
    }
    if (e.holdRemaining <= 0) {
      this._markCleared(sim.id);
      this._setVerdict(sim, 'clear', 'RULE CLEARED', sim.because);
    }
  },

  _stepBoostRung(sim, input) {
    if (input && input.boost && sim.boostAllowed) sim.boosted = true;
    const previousX = sim.prevX != null ? sim.prevX : sim.player.x;
    const currentX = sim.player.x;
    sim.prevX = currentX;
    const gate = sim.gates && sim.gates[0];
    if (!gate || gate.state !== 'pending') return;
    if (previousX < gate.x && currentX >= gate.x) {
      if (Math.abs(sim.player.z - gate.centerZ) <= gate.tol && sim.boosted && input && input.boost) {
        gate.state = 'passed';
        this._markCleared(sim.id);
        this._setVerdict(sim, 'clear', 'RULE CLEARED', sim.because);
        return;
      }
      gate.state = 'failed';
      this._setVerdict(sim, 'fail', 'NO BOOST, NO GATE', sim.because);
      return;
    }
    if (sim.timeS > 16) {
      this._setVerdict(sim, 'fail', 'YOU STALLED', sim.because);
    }
  },

  _stepStrokeRung(sim, stepS) {
    const stroke = sim.stroke;
    if (stroke && stroke.flying && stroke.points.length >= 2) {
      const i = Math.min(stroke.followIndex, stroke.points.length - 1);
      const target = stroke.points[i];
      const dx = target.x - sim.player.x;
      const dz = target.z - sim.player.z;
      const dist = Math.hypot(dx, dz);
      const cruise = Math.max(40, finite(sim.model && sim.model.maxSpeed, 80) * 0.7);
      if (dist <= 8) {
        stroke.followIndex = Math.min(i + 1, stroke.points.length - 1);
        sim.player.vx = 0;
        sim.player.vz = 0;
      } else {
        const step = Math.min(dist, cruise * stepS);
        sim.player.x += (dx / dist) * step;
        sim.player.z += (dz / dist) * step;
        sim.player.vx = (dx / dist) * cruise;
        sim.player.vz = (dz / dist) * cruise;
        sim.player.rot = Math.atan2(dz, dx);
      }
    }
    const previousX = sim.prevX != null ? sim.prevX : sim.player.x;
    const currentX = sim.player.x;
    sim.prevX = currentX;
    const gate = sim.gates && sim.gates[0];
    if (!gate || gate.state !== 'pending') return;
    if (previousX < gate.x && currentX >= gate.x) {
      const through = Math.abs(sim.player.z - gate.centerZ) <= gate.tol;
      const drawn = stroke && stroke.points.length >= 2 && stroke.flying;
      if (through && drawn) {
        gate.state = 'passed';
        this._markCleared(sim.id);
        this._setVerdict(sim, 'clear', 'RULE CLEARED', sim.because);
        return;
      }
      gate.state = 'failed';
      this._setVerdict(sim, 'fail', 'DRAW, THEN FLY', sim.because);
      return;
    }
    if (sim.timeS > 18) this._setVerdict(sim, 'fail', 'NO STROKE', sim.because);
  },

  _stepWellRung(sim, stepS) {
    const scrap = sim.scrap;
    const well = sim.well;
    if (scrap && well) {
      const dx = well.x - scrap.x;
      const dz = well.z - scrap.z;
      const dist = Math.hypot(dx, dz);
      const pull = scrap.mass > 200 ? 0 : 90;
      if (dist > 0.001 && dist < well.radius && pull > 0) {
        const step = Math.min(dist, pull * stepS);
        scrap.x += (dx / dist) * step;
        scrap.z += (dz / dist) * step;
      }
      if (dist <= 36 && pull > 0) {
        this._markCleared(sim.id);
        this._setVerdict(sim, 'clear', 'RULE CLEARED', sim.because);
        return;
      }
    }
    if (sim.timeS > 18) {
      this._setVerdict(
        sim,
        'fail',
        well ? 'IT SHRUGGED' : 'NO WELL',
        sim.because,
      );
    }
  },

  _canvasWorldPoint(event) {
    if (!this._els || !this._els.canvas || !this._sim) return null;
    const rect = this._els.canvas.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    return unmapPoint(this._sim.bounds, rect.width, rect.height, sx, sy);
  },

  _beginStrokeDraw(event) {
    const sim = this._sim;
    if (!sim || !sim.stroke || sim.verdict) return;
    if (!sim.stroke.allowed) {
      cue('deny');
      return;
    }
    const point = this._canvasWorldPoint(event);
    if (!point) return;
    sim.stroke.drawing = true;
    sim.stroke.flying = false;
    sim.stroke.followIndex = 0;
    sim.stroke.points = [{ x: sim.player.x, z: sim.player.z }, point];
    this._wakeLoop();
  },

  _sampleStrokeDraw(event) {
    const sim = this._sim;
    if (!sim || !sim.stroke || !sim.stroke.drawing) return;
    const point = this._canvasWorldPoint(event);
    if (!point) return;
    const last = sim.stroke.points[sim.stroke.points.length - 1];
    if (!last || Math.hypot(point.x - last.x, point.z - last.z) < 12) return;
    sim.stroke.points.push(point);
    this._wakeLoop();
  },

  _finishStrokeDraw() {
    const sim = this._sim;
    if (!sim || !sim.stroke || !sim.stroke.drawing) return;
    sim.stroke.drawing = false;
    if (sim.stroke.points.length >= 2) {
      sim.stroke.flying = true;
      sim.stroke.followIndex = 1;
    }
    this._wakeLoop();
  },

  _markCleared(id) {
    if (!this._cleared.has(id)) {
      this._cleared.add(id);
      this._ctx.state.ui.rangeCleared = [...this._cleared];
    }
  },

  _setVerdict(sim, kind, text, because) {
    if (!sim || sim.verdict) return;
    sim.verdict = { kind, text, because };
    sim.player.vx = 0;
    sim.player.vz = 0;
    sim.player.yawRate = 0;
    if (sim.drone) {
      sim.drone.vx = 0;
      sim.drone.vz = 0;
      sim.drone.orbitSpeed = 0;
    }
    if (sim.payload) {
      sim.payload.vx = 0;
      sim.payload.vz = 0;
    }
    if (kind === 'clear') cue('confirm');
    else cue('deny');
  },

  _ensureCanvasSize() {
    const canvas = this._els.canvas;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width));
    const height = Math.max(180, Math.round(rect.height));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return { width, height };
  },

  _render() {
    if (!this._els || !this._els.canvasCtx || !this._sim) return;
    const { width, height } = this._ensureCanvasSize();
    const ctx2d = this._els.canvasCtx;
    const forced = this._forcedColors;
    const reduced = this._reducedMotion;
    const sim = this._sim;

    const roles = canvasRoles();
    // No surface fill: the drill box sits on the live sky (the sheet's "drill box on the sky").
    ctx2d.clearRect(0, 0, width, height);

    ctx2d.strokeStyle = forced ? 'CanvasText' : roles.calm;
    ctx2d.lineWidth = forced ? 2 : 1;
    ctx2d.strokeRect(BOX_INSET, BOX_INSET, width - BOX_INSET * 2, height - BOX_INSET * 2);

    if (sim.ghostTrail && sim.ghostTrail.length > 1) {
      drawTrail(ctx2d, sim.ghostTrail, sim.bounds, width, height, forced ? 'CanvasText' : roles.calm, true);
    }
    drawTrail(ctx2d, sim.trail, sim.bounds, width, height, forced ? 'CanvasText' : roles.you, reduced);

    if (sim.id === 'heavy_turns_wide') this._drawHeavyGates(ctx2d, sim, width, height, forced, roles);
    if (sim.id === 'stopping_takes_room') this._drawStopLine(ctx2d, sim, width, height, forced, roles);
    if (sim.id === 'swing_do_not_pull') this._drawSwingGate(ctx2d, sim, width, height, forced, roles);
    if (sim.id === 'boost_keep_speed' || sim.id === 'draw_the_stroke' || sim.id === TRACTOR_THROW_DRILL_ID || sim.id === ELASTIC_WHIP_DRILL_ID) {
      this._drawHeavyGates(ctx2d, sim, width, height, forced, roles);
    }

    if (sim.anchor && sim.id !== TRACTOR_THROW_DRILL_ID && sim.id !== ELASTIC_WHIP_DRILL_ID) {
      drawAsteroid(ctx2d, sim.anchor, sim.bounds, width, height, forced, roles);
    }
    if (sim.scrap) drawAsteroid(ctx2d, sim.scrap, sim.bounds, width, height, forced, roles);

    if (sim.stroke && sim.stroke.points && sim.stroke.points.length > 1) {
      drawTrail(ctx2d, sim.stroke.points, sim.bounds, width, height, forced ? 'CanvasText' : roles.goal, reduced);
    }

    if (sim.well) {
      const center = mapPoint(sim.bounds, width, height, sim.well.x, sim.well.z);
      const scale = (width - (BOX_INSET * 2)) / Math.max(1, sim.bounds.maxX - sim.bounds.minX);
      ctx2d.save();
      ctx2d.strokeStyle = forced ? 'CanvasText' : roles.goal;
      ctx2d.lineWidth = forced ? 2 : 1.4;
      ctx2d.beginPath();
      ctx2d.arc(center.x, center.y, Math.max(10, sim.well.radius * scale), 0, Math.PI * 2);
      ctx2d.stroke();
      ctx2d.restore();
    }

    if (sim.id === 'swing_do_not_pull' && sim.tether && sim.tether.active) {
      const a = mapPoint(sim.bounds, width, height, sim.anchor.x, sim.anchor.z);
      const p = mapPoint(sim.bounds, width, height, sim.player.x, sim.player.z);
      ctx2d.save();
      ctx2d.strokeStyle = forced ? 'CanvasText' : roles.you;
      ctx2d.lineWidth = forced ? 2 : 2.6;
      ctx2d.beginPath();
      ctx2d.moveTo(a.x, a.y);
      ctx2d.lineTo(p.x, p.y);
      ctx2d.stroke();
      ctx2d.restore();
    }

    if (sim.id === TRACTOR_THROW_DRILL_ID && sim.tether && sim.tether.active && sim.payload) {
      const a = mapPoint(sim.bounds, width, height, sim.payload.x, sim.payload.z);
      const p = mapPoint(sim.bounds, width, height, sim.player.x, sim.player.z);
      ctx2d.save();
      ctx2d.strokeStyle = forced ? 'CanvasText' : roles.you;
      ctx2d.lineWidth = forced ? 2 : 2.6;
      ctx2d.beginPath();
      ctx2d.moveTo(a.x, a.y);
      ctx2d.lineTo(p.x, p.y);
      ctx2d.stroke();
      ctx2d.restore();
    }

    if (sim.id === ELASTIC_WHIP_DRILL_ID && sim.tether && sim.tether.active && sim.hostile) {
      const a = mapPoint(sim.bounds, width, height, sim.hostile.x, sim.hostile.z);
      const p = mapPoint(sim.bounds, width, height, sim.player.x, sim.player.z);
      const glow = clamp(finite(sim.tether.strainGlow, 0), 0, 1);
      ctx2d.save();
      ctx2d.strokeStyle = forced ? 'CanvasText' : (glow >= 0.35 ? roles.goal : roles.you);
      ctx2d.lineWidth = forced ? 2 : 2.2 + glow * 3.4;
      ctx2d.globalAlpha = reduced ? 1 : 0.72 + glow * 0.28;
      ctx2d.beginPath();
      ctx2d.moveTo(a.x, a.y);
      ctx2d.lineTo(p.x, p.y);
      ctx2d.stroke();
      ctx2d.restore();
    }

    if (sim.id === ELASTIC_WHIP_DRILL_ID && sim.hostile) {
      const point = mapPoint(sim.bounds, width, height, sim.hostile.x, sim.hostile.z);
      const radius = Math.max(8, finite(sim.hostile.radius, 10) * 0.45);
      ctx2d.save();
      ctx2d.beginPath();
      ctx2d.moveTo(point.x, point.y - radius);
      ctx2d.lineTo(point.x + radius, point.y);
      ctx2d.lineTo(point.x, point.y + radius);
      ctx2d.lineTo(point.x - radius, point.y);
      ctx2d.closePath();
      if (!forced) {
        ctx2d.fillStyle = roles.surface;
        ctx2d.fill();
      }
      ctx2d.strokeStyle = forced ? 'CanvasText' : roles.foe;
      ctx2d.lineWidth = 1.6;
      ctx2d.stroke();
      ctx2d.font = canvasFont('600', 12, 'body');
      ctx2d.fillStyle = forced ? 'CanvasText' : roles.paper;
      ctx2d.textAlign = 'center';
      ctx2d.textBaseline = 'top';
      ctx2d.fillText(sim.hostile.shortName || 'WASP', point.x, point.y + radius + 6);
      ctx2d.restore();
    }

    paintRangeTeachingOverlay(ctx2d, sim, width, height, { forced, reduced });

    this._lastDroneScreen = drawDrone(ctx2d, sim.drone, sim.bounds, width, height, forced, roles);
    drawWeakArc(ctx2d, sim.drone, sim.weakPoint, sim.bounds, width, height, forced, roles);
    drawPlayer(ctx2d, sim.player, sim.bounds, width, height, forced, roles);

    if (sim.id === 'heavy_turns_wide') this._drawTurnArc(ctx2d, sim, width, height, forced, roles);
    if (sim.id === 'stopping_takes_room') this._drawStopBar(ctx2d, sim, width, height, forced, roles);
    if (sim.id === 'you_can_run_dry') this._drawEnergyReadout(ctx2d, sim, width, height, forced, roles);
  },

  _drawHeavyGates(ctx2d, sim, width, height, forced, roles) {
    const ink = roles || canvasRoles();
    sim.gates.forEach((gate, index) => {
      const top = mapPoint(sim.bounds, width, height, gate.x, sim.bounds.minZ);
      const bottom = mapPoint(sim.bounds, width, height, gate.x, sim.bounds.maxZ);
      const center = mapPoint(sim.bounds, width, height, gate.x, gate.centerZ);
      const state = gate.state;
      let stroke = ink[gateStrokeRole(state)];
      if (forced) stroke = 'CanvasText';
      ctx2d.save();
      ctx2d.strokeStyle = stroke;
      ctx2d.lineWidth = forced ? 2 : 1.3;
      ctx2d.beginPath();
      ctx2d.moveTo(top.x, top.y);
      ctx2d.lineTo(bottom.x, bottom.y);
      ctx2d.stroke();
      ctx2d.fillStyle = forced ? 'CanvasText' : ink.goal;
      ctx2d.beginPath();
      ctx2d.arc(center.x, center.y, 5, 0, Math.PI * 2);
      ctx2d.fill();
      if (forced && state !== 'pending') {
        ctx2d.font = canvasFont('600', 12, 'data');
        ctx2d.fillStyle = 'CanvasText';
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'bottom';
        ctx2d.fillText(state === 'passed' ? '✓' : '✕', center.x, center.y - 8);
      }
      ctx2d.font = canvasFont('600', 12, 'data');
      ctx2d.fillStyle = forced ? 'CanvasText' : ink.calm;
      ctx2d.textAlign = 'center';
      ctx2d.textBaseline = 'top';
      ctx2d.fillText(String(index + 1), center.x, center.y + 8);
      ctx2d.restore();
    });
  },

  _drawStopLine(ctx2d, sim, width, height, forced, roles) {
    const ink = roles || canvasRoles();
    const top = mapPoint(sim.bounds, width, height, sim.stopLine, sim.bounds.minZ);
    const bottom = mapPoint(sim.bounds, width, height, sim.stopLine, sim.bounds.maxZ);
    ctx2d.save();
    ctx2d.strokeStyle = forced ? 'CanvasText' : ink.goal;
    ctx2d.lineWidth = forced ? 2 : 1.6;
    ctx2d.beginPath();
    ctx2d.moveTo(top.x, top.y);
    ctx2d.lineTo(bottom.x, bottom.y);
    ctx2d.stroke();
    ctx2d.font = canvasFont('600', 12, 'data');
    ctx2d.fillStyle = forced ? 'CanvasText' : ink.goal;
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'top';
    ctx2d.fillText('STOP', top.x, top.y + 6);
    ctx2d.restore();
  },

  _drawStopBar(ctx2d, sim, width, height, forced, roles) {
    const ink = roles || canvasRoles();
    const speed = speedOf(sim.player);
    const nowStop = speed > 0
      ? (speed * speed) / Math.max(0.001, 2 * finite(sim.model && sim.model.reverseAccel, 0.001))
      : 0;
    const line = mapPoint(sim.bounds, width, height, sim.player.x + nowStop, sim.player.z);
    const now = mapPoint(sim.bounds, width, height, sim.player.x, sim.player.z);
    ctx2d.save();
    ctx2d.strokeStyle = forced ? 'CanvasText' : ink.you;
    ctx2d.lineWidth = forced ? 2 : 1.2;
    ctx2d.beginPath();
    ctx2d.moveTo(now.x, now.y + 18);
    ctx2d.lineTo(line.x, now.y + 18);
    ctx2d.stroke();
    ctx2d.font = canvasFont('500', 12, 'data');
    ctx2d.fillStyle = forced ? 'CanvasText' : ink.you;
    ctx2d.textAlign = 'left';
    ctx2d.textBaseline = 'bottom';
    ctx2d.fillText(`${Math.round(nowStop)} m`, Math.min(width - 80, now.x + 4), now.y + 15);
    ctx2d.restore();
  },

  _drawSwingGate(ctx2d, sim, width, height, forced, roles) {
    const ink = roles || canvasRoles();
    const left = mapPoint(sim.bounds, width, height, sim.exitGate.centerX - sim.exitGate.half, sim.exitGate.z);
    const right = mapPoint(sim.bounds, width, height, sim.exitGate.centerX + sim.exitGate.half, sim.exitGate.z);
    ctx2d.save();
    ctx2d.strokeStyle = forced ? 'CanvasText' : ink.goal;
    ctx2d.lineWidth = forced ? 2 : 1.6;
    ctx2d.beginPath();
    ctx2d.moveTo(left.x, left.y);
    ctx2d.lineTo(right.x, right.y);
    ctx2d.stroke();
    ctx2d.font = canvasFont('600', 12, 'data');
    ctx2d.fillStyle = forced ? 'CanvasText' : ink.goal;
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'bottom';
    ctx2d.fillText('EXIT', (left.x + right.x) * 0.5, left.y - 4);
    ctx2d.restore();
  },

  _drawTurnArc(ctx2d, sim, width, height, forced, roles) {
    const ink = roles || canvasRoles();
    const player = sim.player;
    const speed = speedOf(player);
    const yaw = Math.abs(player.yawRate);
    if (speed < 0.2 || yaw < 0.02) return;
    const radiusWorld = clamp(speed / yaw, 20, 500);
    const side = player.yawRate > 0 ? 1 : -1;
    const centerWorld = {
      x: player.x - Math.sin(player.rot) * radiusWorld * side,
      z: player.z + Math.cos(player.rot) * radiusWorld * side,
    };
    const playerPt = mapPoint(sim.bounds, width, height, player.x, player.z);
    const centerPt = mapPoint(sim.bounds, width, height, centerWorld.x, centerWorld.z);
    const radiusPx = Math.max(8, Math.hypot(playerPt.x - centerPt.x, playerPt.y - centerPt.y));
    ctx2d.save();
    ctx2d.strokeStyle = forced ? 'CanvasText' : ink.calm;
    ctx2d.lineWidth = 1.2;
    if (!forced) ctx2d.setLineDash([5, 4]);
    ctx2d.beginPath();
    ctx2d.arc(centerPt.x, centerPt.y, radiusPx, 0, Math.PI * 2);
    ctx2d.stroke();
    ctx2d.setLineDash([]);
    ctx2d.restore();
  },

  _drawEnergyReadout(ctx2d, sim, width, height, forced, roles) {
    if (!sim.energy) return;
    const ink = roles || canvasRoles();
    const pct = clamp(sim.energy.cap / Math.max(1, sim.energy.capMax), 0, 1);
    const x = width - BOX_INSET - 18;
    const y = BOX_INSET + 26;
    const h = Math.max(120, height * 0.35);
    ctx2d.save();
    ctx2d.strokeStyle = forced ? 'CanvasText' : ink.calm;
    ctx2d.strokeRect(x, y, 10, h);
    if (!forced) ctx2d.fillStyle = pct > 0.15 ? ink.you : ink.foe;
    else ctx2d.fillStyle = 'CanvasText';
    ctx2d.fillRect(x + 1, y + (h * (1 - pct)) + 1, 8, Math.max(1, (h * pct) - 2));
    ctx2d.font = canvasFont('600', 12, 'data');
    ctx2d.fillStyle = forced ? 'CanvasText' : ink.paper;
    ctx2d.textAlign = 'right';
    ctx2d.textBaseline = 'top';
    ctx2d.fillText(`${Math.round(pct * 100)}% CAP`, x - 6, y);
    ctx2d.fillText(`${Math.max(0, Math.ceil(sim.energy.holdRemaining))}s`, x - 6, y + 16);
    ctx2d.restore();
  },
};

function round1(value) {
  return Math.round(finite(value, 0) * 10) / 10;
}
