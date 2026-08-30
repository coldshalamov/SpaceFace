import { SHIPS } from '../../data/ships.js';
import { ENEMY_TYPES } from '../../data/enemies.js';
import { WEAK_POINTS_BY_CLASS } from '../../data/weakPoints.js';
import { ATTACHMENT_DEFS } from '../../data/combatDefs.js';
import { getDerivedStats } from '../../systems/ships.js';
import { DEFAULTS as INPUT_DEFAULTS } from '../../systems/input.js';
import { stopDistanceEstimate } from '../panels/massDelta.js';
import { createMorphLabel, createRouteBeam } from '../effects/index.js';
import { prefersReducedMotion } from '../effects/effectRuntime.js';
import { resolveDrillControlMap } from './drill.js';
import { canvasFont } from '../canvasFonts.js';

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

const CSS = `
#sf-range .sf-fig,
#sf-range .sf-range__progress,
#sf-range .sf-range__cleared,
#sf-range .sf-range__rail-state {
  font-family: var(--sf-data-face); font-weight: 500; font-variant-numeric: tabular-nums;
  font-size: 13px; letter-spacing: 0;
}
#sf-range .sf-range__progress {
  font-size: 20px; color: var(--sf-paper);
}
#sf-range .sf-range__cleared { font-size: 13px; color: var(--sf-calm); }
#sf-range .sf-range__rule {
  font-family: var(--sf-display-face); font-weight: 700; font-size: 28px; line-height: 1.1;
  color: var(--sf-paper); letter-spacing: 0; text-transform: none; margin: 0;
}
#sf-range .sf-range__instruction {
  font-family: var(--sf-body-face); font-weight: 500; font-size: 14px; line-height: 1.35;
  color: var(--sf-calm); margin: 0;
}
#sf-range .sf-range__empty-title {
  font-family: var(--sf-subhead-face); font-weight: 600; font-size: 22px; line-height: 1.2;
  color: var(--sf-paper);
}
#screens:has(> .screen[data-screen="range"].sf-screen--visible),
#screens:has(> .screen[data-screen="range"].sf-screen--entering) {
  background-color: var(--sf-surface);
}
#sf-range, #sf-range .sf-range__canvas { background: var(--sf-surface); }
#sf-range .sf-range__empty {
  background: color-mix(in srgb, var(--sf-surface) 95%, transparent);
}
#sf-range .sf-drawer { box-shadow: none; }
#sf-range .sf-range__crest { gap: var(--sp-5); }
#sf-range .sf-range__crest-main { gap: var(--sp-2); }
#sf-range .sf-range__crest-side { gap: var(--sp-2); }
#sf-range .sf-range__stage { padding: 0 var(--sp-5); }
#sf-range .sf-drawer__deck { padding: var(--sp-4); gap: var(--sp-3); }
#sf-range .sf-range__drawer-head { gap: var(--sp-2); padding: var(--sp-3); }
#sf-range .sf-range__drawer-tab,
#sf-range .sf-range__drawer-close,
#sf-range .sf-range__drawer-title,
#sf-range .sf-range__rail-group-head,
#sf-range .sf-range__b-row .k,
#sf-range .sf-range__who {
  font-family: var(--sf-subhead-face); font-weight: 600; font-size: 12px;
  letter-spacing: var(--sf-track-micro); text-transform: uppercase;
}
#sf-range .sf-range__drawer-tab.is-on { border-color: var(--sf-you); color: var(--sf-you); }
#sf-range .sf-range__rail-row {
  border-left: var(--sf-rail-w) solid var(--sf-calm); border-radius: 2px;
  padding: var(--sp-2); gap: var(--sp-2);
}
#sf-range .sf-range__rail-row[data-state="flown"] { border-left-color: var(--sf-goal); }
#sf-range .sf-range__rail-row[data-state="cleared"] { border-left-color: var(--sf-you); }
#sf-range .sf-range__verdict-mount,
#sf-range .sf-range__verdict-plain {
  font-family: var(--sf-subhead-face); font-weight: 600; font-size: 22px; line-height: 1.2; color: var(--sf-paper);
}
#sf-range .sf-range__because {
  font-family: var(--sf-body-face); font-weight: 500; font-size: 14px; line-height: 1.35; color: var(--sf-calm);
}
#sf-range .sf-range__verbs { gap: var(--sp-2); }
#sf-range .sf-range__verbs .sf-btn {
  font-family: var(--sf-body-face); font-size: 13px; letter-spacing: 0; padding: var(--sp-2) var(--sp-3);
}
#sf-range .sf-range__b-row { gap: var(--sp-2); }
#sf-range .sf-range__b-row .v { font-family: var(--sf-body-face); font-size: 13px; color: var(--sf-paper); }
#sf-range .sf-range__apron { gap: var(--sp-2); padding-bottom: var(--sp-4); }
@media (max-width: 1280px) {
  #sf-range .sf-range__progress { font-size: 15px; }
}
@media (prefers-reduced-motion: reduce) {
  #sf-range, #sf-range * { animation: none; transition: none; }
}
@media (forced-colors: active) {
  #sf-range, #sf-range .sf-range__canvas, #sf-range .sf-drawer, #sf-range .sf-range__rail-row, #sf-range .sf-range__empty {
    background: Canvas; color: CanvasText; border-color: CanvasText;
  }
}
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

const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));
const RAIL_ROWS = Object.freeze([
  Object.freeze({ id: 'heavy_turns_wide', group: 'MASS', rule: 'HEAVY HULLS TURN WIDE', instruction: 'Fly the loaded hull through all four gates without clipping one.' }),
  Object.freeze({ id: 'stopping_takes_room', group: 'MASS', rule: 'STOPPING TAKES ROOM', instruction: 'From flat out, stop before the wall line.' }),
  Object.freeze({ id: 'swing_do_not_pull', group: 'MASSLINE', rule: 'SWING, DO NOT PULL', instruction: 'Hook the anchor, swing, and release through the exit gate.' }),
  Object.freeze({ id: 'you_can_run_dry', group: 'POWER', rule: 'YOU CAN RUN DRY', instruction: 'Hold fire for 20 seconds and keep cap above zero.' }),
]);
const RAIL_INDEX_BY_ID = new Map(RAIL_ROWS.map((row, index) => [row.id, index]));

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

function codeLabel(code) {
  if (!code) return 'UNBOUND';
  if (code.startsWith('Key')) return code.slice(3).toUpperCase();
  if (code.startsWith('Digit')) return code.slice(5);
  return ({
    Space: 'SPACE',
    ArrowLeft: 'LEFT',
    ArrowRight: 'RIGHT',
    ArrowUp: 'UP',
    ArrowDown: 'DOWN',
    ShiftLeft: 'LSHIFT',
    ShiftRight: 'RSHIFT',
    Mouse0: 'LMB',
    Mouse1: 'RMB',
  })[code] || code.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
}

function labelCodes(codes, fallback = 'UNBOUND') {
  const list = [...new Set((Array.isArray(codes) ? codes : []).filter(Boolean))];
  if (!list.length) return fallback;
  return list.map(codeLabel).join(' / ');
}

function bindingCodes(state, action) {
  const configured = state && state.settings && state.settings.controls && state.settings.controls.bindings;
  if (configured && Object.prototype.hasOwnProperty.call(configured, action)) {
    const value = configured[action];
    if (Array.isArray(value)) return value.slice();
    return value ? [value] : [];
  }
  const schemeId = state && state.settings && state.settings.gameplay
    ? state.settings.gameplay.controlScheme
    : 'pilot';
  const scheme = INPUT_DEFAULTS.SCHEMES[schemeId] || INPUT_DEFAULTS.SCHEMES.pilot;
  const value = scheme[action] || INPUT_DEFAULTS.BINDINGS[action] || [];
  return Array.isArray(value) ? value.slice() : [value];
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

function controlMapForState(state) {
  const drillMap = resolveDrillControlMap(state);
  const yawLeft = bindingCodes(state, 'yawLeft');
  const yawRight = bindingCodes(state, 'yawRight');
  const forward = bindingCodes(state, 'forward');
  const reverse = bindingCodes(state, 'reverse');
  const strafeLeft = bindingCodes(state, 'strafeLeft');
  const strafeRight = bindingCodes(state, 'strafeRight');
  const boost = bindingCodes(state, 'boost');
  const fire = bindingCodes(state, 'fire');
  const tether = bindingCodes(state, 'tether');
  return {
    movementLabel: drillMap.movementLabel || 'UNBOUND',
    turnLabel: labelCodes([...yawLeft, ...yawRight], 'UNBOUND'),
    fireLabel: labelCodes(fire, 'LMB'),
    tetherLabel: labelCodes(tether, 'SPACE / F'),
    boostLabel: labelCodes(boost, 'SHIFT'),
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
    },
  };
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
    rootEl.classList.add('sf-range');
    rootEl.innerHTML = `
      <div class="sf-range__shell sf-instrument">
        <header class="sf-crest sf-range__crest">
          <div class="sf-range__crest-main">
            <h1 class="sf-crest__title sf-range__rule" data-range-rule></h1>
            <p class="sf-range__instruction" data-range-instruction></p>
          </div>
          <div class="sf-range__crest-side">
            <div class="sf-range__progress sf-fig" data-range-progress></div>
            <div class="sf-range__cleared sf-fig" data-range-cleared></div>
          </div>
        </header>
        <section class="sf-stage sf-range__stage">
          <div class="sf-range__box">
            <canvas class="sf-range__canvas" data-range-canvas tabindex="0" role="application"></canvas>
            <div class="sf-range__beam" data-range-beam aria-hidden="true"></div>
          </div>
          <aside class="sf-drawer sf-range__drawer" data-range-drawer role="dialog" aria-modal="false" aria-label="Range drawers">
            <div class="sf-range__drawer-head">
              <button type="button" class="sf-range__drawer-tab is-on" data-drawer-tab="rules" aria-pressed="true">RULES</button>
              <button type="button" class="sf-range__drawer-tab" data-drawer-tab="bestiary" aria-pressed="false">BESTIARY</button>
              <button type="button" class="sf-range__drawer-close" data-range-drawer-close aria-label="Close drawer">CLOSE</button>
            </div>
            <div class="sf-drawer__deck sf-range__drawer-body">
              <section class="sf-range__drawer-pane is-on" data-range-pane="rules">
                <div class="sf-range__drawer-title">RULE RAIL</div>
                <ol class="sf-rail sf-range__rail" data-range-rail></ol>
              </section>
              <section class="sf-range__drawer-pane" data-range-pane="bestiary">
                <div class="sf-range__drawer-title">BESTIARY</div>
                <div class="sf-range__bestiary" data-range-bestiary></div>
              </section>
            </div>
          </aside>
        </section>
        <footer class="sf-apron sf-range__apron">
          <div class="sf-range__verdict-row">
            <div class="sf-range__verdict-mount" data-range-verdict></div>
            <span class="sf-range__verdict-plain" data-range-verdict-plain aria-hidden="true"></span>
            <button type="button" class="sf-range__who" data-range-who>WHO IS THIS</button>
          </div>
          <p class="sf-range__because" data-range-because></p>
          <div class="sf-range__verbs">
            <button type="button" class="sf-btn" data-range-action="again">AGAIN</button>
            <button type="button" class="sf-btn" data-range-action="contrast">TRY THE CONTRAST</button>
            <button type="button" class="sf-btn" data-range-action="next">NEXT RULE</button>
            <button type="button" class="sf-btn" data-range-action="rules">ALL RULES</button>
            <button type="button" class="sf-btn" data-range-action="return">RETURN TO THE SHIP</button>
          </div>
        </footer>
        <section class="sf-range__empty" data-range-empty hidden>
          <h2 class="sf-range__empty-title">NO RANGE SUBJECT</h2>
          <p class="sf-range__empty-copy">THE RANGE loads your active ship. Open THE SHIP and use TAKE IT TO THE RANGE, or return to the ship now.</p>
          <button type="button" class="sf-btn" data-range-empty-return>RETURN TO THE SHIP</button>
        </section>
      </div>
    `;

    const shell = rootEl.querySelector('.sf-range__shell');
    const canvas = rootEl.querySelector('[data-range-canvas]');
    const drawer = rootEl.querySelector('[data-range-drawer]');
    const beamMount = rootEl.querySelector('[data-range-beam]');
    const verdictMount = rootEl.querySelector('[data-range-verdict]');

    this._els = {
      shell,
      canvas,
      canvasCtx: canvas && canvas.getContext ? canvas.getContext('2d') : null,
      rule: rootEl.querySelector('[data-range-rule]'),
      instruction: rootEl.querySelector('[data-range-instruction]'),
      progress: rootEl.querySelector('[data-range-progress]'),
      cleared: rootEl.querySelector('[data-range-cleared]'),
      verdictMount,
      verdictPlain: rootEl.querySelector('[data-range-verdict-plain]'),
      because: rootEl.querySelector('[data-range-because]'),
      drawer,
      drawerTabs: [...rootEl.querySelectorAll('[data-drawer-tab]')],
      drawerPanes: [...rootEl.querySelectorAll('[data-range-pane]')],
      rail: rootEl.querySelector('[data-range-rail]'),
      bestiary: rootEl.querySelector('[data-range-bestiary]'),
      actionButtons: [...rootEl.querySelectorAll('[data-range-action]')],
      who: rootEl.querySelector('[data-range-who]'),
      closeDrawer: rootEl.querySelector('[data-range-drawer-close]'),
      empty: rootEl.querySelector('[data-range-empty]'),
      emptyReturn: rootEl.querySelector('[data-range-empty-return]'),
      beamMount,
    };

    this._verdictFx = createMorphLabel(verdictMount, { numeric: false });
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

    const grouped = new Map();
    for (const row of RAIL_ROWS) {
      if (!grouped.has(row.group)) grouped.set(row.group, []);
      grouped.get(row.group).push(row);
    }
    for (const [group, rows] of grouped) {
      const groupNode = document.createElement('li');
      groupNode.className = 'sf-range__rail-group';
      const head = document.createElement('div');
      head.className = 'sf-range__rail-group-head';
      head.textContent = group;
      groupNode.appendChild(head);
      const list = document.createElement('ol');
      list.className = 'sf-range__rail-list';
      for (const row of rows) {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sf-range__rail-row';
        button.setAttribute('data-rung-id', row.id);
        button.innerHTML = `<span class="sf-range__rail-rule">${row.rule}</span><span class="sf-range__rail-state">NEW</span>`;
        item.appendChild(button);
        list.appendChild(item);
      }
      groupNode.appendChild(list);
      this._els.rail.appendChild(groupNode);
    }

    this._els.rail.addEventListener('click', (event) => {
      const row = event.target.closest('[data-rung-id]');
      if (!row) return;
      const id = row.getAttribute('data-rung-id');
      const index = RAIL_INDEX_BY_ID.get(id);
      if (!Number.isInteger(index)) return;
      this._emitAudio('ui_click');
      this._ghostTrail = [];
      this._setRung(index, null, []);
      this._openDrawer('rules');
    });

    this._els.drawerTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        this._emitAudio('ui_tab');
        this._openDrawer(tab.getAttribute('data-drawer-tab') || 'rules');
      });
    });
    this._els.closeDrawer.addEventListener('click', () => {
      this._emitAudio('ui_back');
      this._closeDrawer();
    });
    this._els.who.addEventListener('click', () => {
      this._emitAudio('ui_open');
      this._openDrawer('bestiary');
    });
    this._els.emptyReturn.addEventListener('click', () => {
      this._emitAudio('ui_back');
      if (this._ctx && this._ctx.screenManager) this._ctx.screenManager.popScreen();
    });

    this._els.actionButtons.forEach((button) => {
      button.addEventListener('click', () => this._onVerb(button.getAttribute('data-range-action')));
    });

    this._onCanvasPointerDown = (event) => {
      if (event.button !== 0) return;
      this._held.firePointer = true;
      this._wakeLoop();
    };
    this._onWindowPointerUp = () => {
      this._held.firePointer = false;
    };
    this._onCanvasClick = (event) => {
      if (!this._lastDroneScreen) return;
      const rect = this._els.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const dx = x - this._lastDroneScreen.x;
      const dy = y - this._lastDroneScreen.y;
      if ((dx * dx) + (dy * dy) <= 900) {
        this._emitAudio('ui_open');
        this._openDrawer('bestiary');
      }
    };
    this._onCanvasKeyDown = (event) => {
      if (event.code !== 'Tab') return;
      event.preventDefault();
      this._emitAudio('ui_open');
      this._openDrawer('rules');
    };
    this._els.canvas.addEventListener('pointerdown', this._onCanvasPointerDown);
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
        this._emitAudio('ui_open');
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
      return;
    }

    this._hideEmpty();
    this._openDrawer('rules');
    this._setRung(0, null, []);
    this._syncBestiary();
    this._syncRail();
    this._syncCanvasLabel();
    this._applyReturnVerbVisibility();

    this._wakeLoop();
    requestAnimationFrame(() => {
      if (this._active && this._els && this._els.canvas && typeof this._els.canvas.focus === 'function') {
        this._els.canvas.focus({ preventScroll: true });
      }
    });
  },

  _cleanup() {
    this._active = false;
    this._toggleTetherQueued = false;
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

  _emitAudio(id) {
    if (!this._ctx || !this._ctx.bus || !id) return;
    this._ctx.bus.emit('audio:cue', { id });
  },

  _showEmpty() {
    this._els.empty.hidden = false;
    this._els.shell.classList.add('is-empty');
    this._els.rule.textContent = 'THE RANGE';
    this._els.instruction.textContent = 'No range subject is staged.';
    this._els.progress.textContent = '';
    this._els.cleared.textContent = '';
    this._setVerdictText('RETURN TO THE SHIP');
    this._els.because.textContent = 'Open THE SHIP and use TAKE IT TO THE RANGE, or return to the ship now.';
  },

  _hideEmpty() {
    this._els.empty.hidden = true;
    this._els.shell.classList.remove('is-empty');
  },

  _applyReturnVerbVisibility() {
    const returnButton = this._els.actionButtons.find((button) => button.getAttribute('data-range-action') === 'return');
    if (!returnButton) return;
    returnButton.hidden = !this._enteredFromShip;
  },

  _openDrawer(pane) {
    const which = pane === 'bestiary' ? 'bestiary' : 'rules';
    this._els.drawer.classList.add('is-open');
    this._els.drawerTabs.forEach((tab) => {
      const on = tab.getAttribute('data-drawer-tab') === which;
      tab.classList.toggle('is-on', on);
      tab.setAttribute('aria-pressed', String(on));
    });
    this._els.drawerPanes.forEach((section) => {
      const on = section.getAttribute('data-range-pane') === which;
      section.classList.toggle('is-on', on);
    });
  },

  _closeDrawer() {
    this._els.drawer.classList.remove('is-open');
  },

  _onVerb(action) {
    if (!action || !this._subject) return;
    if (action === 'again') {
      this._emitAudio('ui_click');
      this._ghostTrail = this._sim ? cloneTrail(this._sim.trail) : [];
      this._setRung(this._rungIndex, this._rungVariant, this._ghostTrail);
      return;
    }
    if (action === 'contrast') {
      this._emitAudio('ui_click');
      this._ghostTrail = this._sim ? cloneTrail(this._sim.trail) : [];
      this._setRung(this._rungIndex, this._nextVariant(this._sim), this._ghostTrail);
      return;
    }
    if (action === 'next') {
      this._emitAudio('ui_confirm');
      const next = (this._rungIndex + 1) % RAIL_ROWS.length;
      this._ghostTrail = [];
      this._setRung(next, null, []);
      return;
    }
    if (action === 'rules') {
      this._emitAudio('ui_open');
      this._openDrawer('rules');
      return;
    }
    if (action === 'return') {
      this._emitAudio('ui_back');
      if (this._ctx && this._ctx.screenManager) this._ctx.screenManager.popScreen();
    }
  },

  _nextVariant(sim) {
    if (!sim) return null;
    if (sim.id === 'heavy_turns_wide') return sim.variant === 'loaded' ? 'empty' : 'loaded';
    if (sim.id === 'stopping_takes_room') return sim.variant === 'subject' ? 'light' : 'subject';
    if (sim.id === 'swing_do_not_pull') return sim.variant === 'tether' ? 'no_tether' : 'tether';
    if (sim.id === 'you_can_run_dry') return sim.variant === 'subject_fit' ? 'other_fit' : 'subject_fit';
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
      `${this._sim.rule}. Fly with ${this._controlMap.movementLabel}. Turn with ${this._controlMap.turnLabel}. Fire ${this._controlMap.fireLabel}. Tether ${this._controlMap.tetherLabel}. Boost ${this._controlMap.boostLabel}. Tab opens rules. Escape closes.`,
    );
  },

  _syncChrome() {
    if (!this._sim) return;
    const sim = this._sim;
    this._els.rule.textContent = sim.rule;
    this._els.instruction.textContent = sim.instruction;
    this._els.progress.textContent = this._progressText(sim);
    this._els.cleared.textContent = `CLEARED ${this._cleared.size}`;
    this._els.because.textContent = sim.verdict && sim.verdict.because ? sim.verdict.because : sim.because;
    this._setVerdictText(sim.verdict ? sim.verdict.text : VERDICT_IDLE);

    const contrastButton = this._els.actionButtons.find((button) => button.getAttribute('data-range-action') === 'contrast');
    if (contrastButton) contrastButton.textContent = this._contrastLabel(sim);
  },

  _contrastLabel(sim) {
    if (!sim) return 'TRY THE CONTRAST';
    if (sim.id === 'heavy_turns_wide') return sim.variant === 'loaded' ? 'TRY IT EMPTY' : 'TRY IT LOADED';
    if (sim.id === 'stopping_takes_room') return sim.variant === 'subject' ? 'TRY THE LIGHT HULL' : `TRY ${shipName(this._subject.shipId).toUpperCase()}`;
    if (sim.id === 'swing_do_not_pull') return sim.variant === 'tether' ? 'TRY IT WITHOUT THE TETHER' : 'TRY IT WITH THE TETHER';
    if (sim.id === 'you_can_run_dry') return sim.variant === 'subject_fit' ? 'TRY THE OTHER FIT' : 'TRY THE STAGED FIT';
    return 'TRY THE CONTRAST';
  },

  _progressText(sim) {
    if (!sim) return '';
    if (sim.id === 'heavy_turns_wide') {
      const next = Math.min(sim.gates.length, sim.gates.filter((gate) => gate.state === 'passed').length + 1);
      return `GATE ${next} / ${sim.gates.length}`;
    }
    if (sim.id === 'stopping_takes_room') return `LINE 1 / 1`;
    if (sim.id === 'swing_do_not_pull') return `EXIT ${sim.exitGate && sim.exitGate.crossed ? 1 : 0} / 1`;
    if (sim.id === 'you_can_run_dry') return `HOLD ${Math.max(0, Math.ceil(sim.energy.holdRemaining))}s`;
    return '';
  },

  _setVerdictText(text) {
    const value = String(text || '').trim() || VERDICT_IDLE;
    if (this._reducedMotion) {
      this._els.verdictPlain.textContent = value;
      this._els.verdictPlain.setAttribute('aria-hidden', 'false');
      this._verdictFx.root.style.display = 'none';
    } else {
      this._els.verdictPlain.textContent = '';
      this._els.verdictPlain.setAttribute('aria-hidden', 'true');
      this._verdictFx.root.style.display = '';
      this._verdictFx.set(value);
    }
  },

  _syncRail() {
    if (!this._els || !this._els.rail) return;
    const rows = [...this._els.rail.querySelectorAll('[data-rung-id]')];
    rows.forEach((node) => {
      const id = node.getAttribute('data-rung-id');
      const state = this._cleared.has(id) ? 'CLEARED' : (this._flown.has(id) ? 'FLOWN' : 'NEW');
      const active = this._sim && this._sim.id === id;
      node.setAttribute('data-state', state.toLowerCase());
      node.classList.toggle('is-active', !!active);
      const stateNode = node.querySelector('.sf-range__rail-state');
      if (stateNode) stateNode.textContent = state;
    });
  },

  _syncBestiary() {
    if (!this._els || !this._els.bestiary || !this._sim) return;
    const drone = this._sim.drone;
    const weakPoint = this._sim.weakPoint;
    const weakArc = weakPoint
      ? `${Math.round((weakPoint.arcCenter * 180) / Math.PI)}° ±${Math.round((weakPoint.arcHalfWidth * 180) / Math.PI)}°`
      : 'No weak arc data';
    this._els.bestiary.innerHTML = `
      <div class="sf-range__b-row"><span class="k">NAME</span><span class="v">${drone.name}</span></div>
      <div class="sf-range__b-row"><span class="k">CLASS</span><span class="v">${drone.shipClass}</span></div>
      <div class="sf-range__b-row"><span class="k">BEHAVIOR</span><span class="v">${drone.behavior}</span></div>
      <div class="sf-range__b-row"><span class="k">PREFERRED RANGE</span><span class="v sf-fig">${drone.preferredRange}</span></div>
      <div class="sf-range__b-row"><span class="k">TOP SPEED</span><span class="v sf-fig">${drone.maxSpeed} wu/s</span></div>
      <div class="sf-range__b-row"><span class="k">TURN RATE</span><span class="v sf-fig">${drone.turnRate}</span></div>
      <div class="sf-range__b-row"><span class="k">MASS</span><span class="v sf-fig">${Math.round(drone.mass)} t</span></div>
      <div class="sf-range__b-row"><span class="k">WEAK ARC</span><span class="v sf-fig">${weakArc}</span></div>
      <div class="sf-range__b-row"><span class="k">WEAK POINT</span><span class="v">${weakPoint ? `${weakPoint.label} (${weakPoint.hint}) ×${weakPoint.bonusMult}` : '—'}</span></div>
    `;
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
    return !(playerStill || droneStill || inputHeld);
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
      drivePlayerStep(sim.player, sim.model, input, stepS);
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
              this._emitAudio('ui_confirm');
            } else {
              this._emitAudio('ui_deny');
            }
          } else {
            this._emitAudio('ui_deny');
          }
          this._toggleTetherQueued = false;
        }
        if (sim.tether.active) applyTetherConstraint(sim.player, sim.anchor, sim.tether.length);
      } else {
        this._toggleTetherQueued = false;
      }

      resolveCircleCollision(sim.player, sim.drone);
      resolveCircleCollision(sim.player, sim.anchor);
      inBoundsBounce(sim.player, sim.bounds);
      inBoundsBounce(sim.drone, sim.bounds);

      sim.trail.push({ x: sim.player.x, z: sim.player.z });
      if (sim.trail.length > TRAIL_MAX) sim.trail.splice(0, sim.trail.length - TRAIL_MAX);

      if (sim.id === 'heavy_turns_wide') this._stepHeavyRung(sim);
      else if (sim.id === 'stopping_takes_room') this._stepStoppingRung(sim);
      else if (sim.id === 'swing_do_not_pull') this._stepSwingRung(sim);
      else if (sim.id === 'you_can_run_dry') this._stepEnergyRung(sim, stepS, input);
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
          this._emitAudio('ui_confirm');
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
    if (kind === 'clear') this._emitAudio('ui_confirm');
    else this._emitAudio('ui_deny');
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
    ctx2d.clearRect(0, 0, width, height);
    ctx2d.fillStyle = roles.surface;
    ctx2d.fillRect(0, 0, width, height);

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

    if (sim.anchor) drawAsteroid(ctx2d, sim.anchor, sim.bounds, width, height, forced, roles);

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
