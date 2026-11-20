import { resolveCollisionProxyManifest, proxyWorldPrimitives, resolveDockAnchor } from '../../data/collisionProxyManifests.js';
import { canvasFont } from '../canvasFonts.js';
import { drawTradeHubPlan, tradeHubPlan } from './harborPlan.js';
import {
  TACTICAL_MAP_PALETTE,
  classifyContactRole,
  drawRoleGlyph,
  formatMinimapDistance,
  sanitizeMapLabel,
  solveMinimapLabelPlacement,
} from './tacticalMapGrammar.js';

const TAU = Math.PI * 2;
const SWEEP_PERIOD_MS = 4600;
const SWEEP_TRAIL_RAD = (54 * Math.PI) / 180;
const ARRIVAL_PING_S = 0.65;
const HIT_FLASH_MS = 560;
const MAX_ROCK_OUTLINES = 52;
const MAX_RIM_HOSTILES = 6;
const HOVER_HIT_RADIUS_PX = 14;
const VELOCITY_MIN_SPEED = 8;

const COLOR_FRAME_INK = '#d6ecf2';
const COLOR_ICE = '#a9edf4';
const COLOR_COURSE = TACTICAL_MAP_PALETTE.objective;
const COLOR_GUN_RING = 'rgba(246, 206, 122, 0.36)';
const COLOR_LINE_RING = 'rgba(154, 236, 248, 0.42)';
const COLOR_REF_RING = 'rgba(170, 212, 228, 0.14)';
const COLOR_WALL_STROKE = 'rgba(196, 236, 248, 0.90)';
const COLOR_WALL_FILL = 'rgba(116, 178, 202, 0.28)';
const COLOR_ROCK_MONOLITH_STROKE = 'rgba(178, 222, 240, 0.68)';
const COLOR_ROCK_MONOLITH_FILL = 'rgba(98, 148, 174, 0.24)';
const COLOR_ROCK_AMMO_STROKE = 'rgba(172, 220, 238, 0.50)';
const COLOR_ROCK_STIPPLE = 'rgba(160, 210, 232, 0.34)';
const COLOR_ROCK_PATCH = 'rgba(104, 152, 178, 0.085)';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function distance2d(a, b) {
  return Math.hypot((a.x || 0) - (b.x || 0), (a.z || 0) - (b.z || 0));
}

function chamferSize(width) {
  return width > 320 ? 15 : 11;
}

function defineChamferPath(ctx, width, height, inset = 0.5, cut = chamferSize(width)) {
  const i = inset;
  const c = Math.max(4, cut - inset * 0.4);
  ctx.beginPath();
  ctx.moveTo(i + c, i);
  ctx.lineTo(width - i - c, i);
  ctx.lineTo(width - i, i + c);
  ctx.lineTo(width - i, height - i - c);
  ctx.lineTo(width - i - c, height - i);
  ctx.lineTo(i + c, height - i);
  ctx.lineTo(i, height - i - c);
  ctx.lineTo(i, i + c);
  ctx.closePath();
}

function chamferVertices(width, height, inset = 0.5, cut = chamferSize(width)) {
  const i = inset;
  const c = Math.max(4, cut - inset * 0.4);
  return [
    { x: i + c, y: i },
    { x: width - i - c, y: i },
    { x: width - i, y: i + c },
    { x: width - i, y: height - i - c },
    { x: width - i - c, y: height - i },
    { x: i + c, y: height - i },
    { x: i, y: height - i - c },
    { x: i, y: i + c },
  ];
}

/**
 * Intersect a ray from `(ox, oy)` along `(dx, dy)` with the inset chamfered octagon perimeter.
 * Returns `{ x, y, t, angle }` where `t` is the positive ray parameter (`t <= 1` means outside).
 */
export function intersectChamferRim(ox, oy, dx, dy, width, height, inset = 10, cut = chamferSize(width)) {
  const verts = chamferVertices(width, height, inset, cut);
  let bestT = Infinity;
  let bestX = ox;
  let bestY = oy;
  for (let idx = 0; idx < verts.length; idx += 1) {
    const a = verts[idx];
    const b = verts[(idx + 1) % verts.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-9) continue;
    const ax = a.x - ox;
    const ay = a.y - oy;
    const t = (ax * ey - ay * ex) / denom;
    const u = (ax * dy - ay * dx) / denom;
    if (t >= 0 && u >= -1e-6 && u <= 1 + 1e-6 && t < bestT) {
      bestT = t;
      bestX = ox + dx * t;
      bestY = oy + dy * t;
    }
  }
  return {
    x: bestX,
    y: bestY,
    t: bestT,
    angle: Math.atan2(dy, dx),
  };
}

function pointInsideChamfer(x, y, width, height, margin = 10, cut = chamferSize(width)) {
  if (x < margin || x > width - margin || y < margin || y > height - margin) return false;
  const c = Math.max(0, cut - margin * 0.25);
  if (c <= 0) return true;
  if (x + y < c + margin * 1.4) return false;
  if ((width - x) + y < c + margin * 1.4) return false;
  if (x + (height - y) < c + margin * 1.4) return false;
  if ((width - x) + (height - y) < c + margin * 1.4) return false;
  return true;
}

// Pre-rendered tiny diagonal hatch pattern canvases (zero per-frame allocations).
function createHatchPattern(ctx, doc, strokeColor, spacing = 7, lineWidth = 1.15) {
  if (!doc || typeof doc.createElement !== 'function') return null;
  const c = doc.createElement('canvas');
  c.width = spacing;
  c.height = spacing;
  const hg = c.getContext('2d');
  if (!hg) return null;
  hg.strokeStyle = strokeColor;
  hg.lineWidth = lineWidth;
  hg.beginPath();
  hg.moveTo(-1, spacing + 1);
  hg.lineTo(spacing + 1, -1);
  hg.moveTo(-1, 1);
  hg.lineTo(1, -1);
  hg.moveTo(spacing - 1, spacing + 1);
  hg.lineTo(spacing + 1, spacing - 1);
  hg.stroke();
  return typeof ctx.createPattern === 'function' ? ctx.createPattern(c, 'repeat') : null;
}

// Pre-rendered soft radial halo sprites (geometry/gradient blit, never shadowBlur).
function createHaloCache(doc, dpr) {
  const sprites = new Map();
  return function drawHalo(ctx, x, y, radius, rgb, alpha) {
    if (!(alpha > 0.02) || !(radius > 1)) return;
    const rInt = Math.round(radius);
    const key = `${rgb}|${rInt}`;
    let sprite = sprites.get(key);
    if (sprite === undefined) {
      sprite = null;
      if (doc && typeof doc.createElement === 'function') {
        const px = Math.max(8, Math.ceil(rInt * 2 * dpr));
        const c = doc.createElement('canvas');
        c.width = px;
        c.height = px;
        const sg = c.getContext('2d');
        if (sg && typeof sg.createRadialGradient === 'function') {
          const grad = sg.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
          if (grad && typeof grad.addColorStop === 'function') {
            grad.addColorStop(0, `rgba(${rgb}, 0.72)`);
            grad.addColorStop(0.32, `rgba(${rgb}, 0.28)`);
            grad.addColorStop(0.7, `rgba(${rgb}, 0.06)`);
            grad.addColorStop(1, `rgba(${rgb}, 0)`);
            sg.fillStyle = grad;
            sg.fillRect(0, 0, px, px);
            sprite = c;
          }
        }
      }
      sprites.set(key, sprite);
    }
    if (!sprite) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.drawImage(sprite, x - rInt, y - rInt, rInt * 2, rInt * 2);
    ctx.restore();
  };
}

const hexRgbMemo = new Map();
function hexToRgb(hex) {
  let hit = hexRgbMemo.get(hex);
  if (hit) return hit;
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
  hit = m
    ? `${parseInt(m[1].slice(0, 2), 16)},${parseInt(m[1].slice(2, 4), 16)},${parseInt(m[1].slice(4, 6), 16)}`
    : '169,237,244';
  hexRgbMemo.set(hex, hit);
  return hit;
}

function traceFootprint(ctx, primitives, project, scale, rotation) {
  ctx.strokeStyle = COLOR_WALL_STROKE;
  ctx.fillStyle = COLOR_WALL_FILL;
  for (const shape of primitives) {
    ctx.beginPath();
    if (shape.kind === 'capsule') {
      const a = project(shape.ax, shape.az);
      const b = project(shape.bx, shape.bz);
      const width = Math.max(2, shape.r * 2 * scale);
      ctx.lineCap = 'round';
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineWidth = width + 1.4;
      ctx.stroke();
      ctx.lineWidth = Math.max(1, width - 0.6);
      ctx.strokeStyle = '#183346';
      ctx.stroke();
      ctx.strokeStyle = COLOR_WALL_STROKE;
      continue;
    }
    if (shape.kind === 'circle') {
      const p = project(shape.x, shape.z);
      ctx.arc(p.x, p.y, Math.max(2, shape.r * scale), 0, TAU);
    } else {
      const p = project(shape.x, shape.z);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((shape.rot || 0) + rotation);
      ctx.rect(-shape.hx * scale, -shape.hz * scale, shape.hx * 2 * scale, shape.hz * 2 * scale);
      ctx.restore();
    }
    ctx.lineWidth = 1.25;
    ctx.fill();
    ctx.stroke();
  }
}

function drawArenaPlate(ctx, entity, at, scale, rotation) {
  const plate = entity.data?.foundryPlate;
  const hw = Math.max(5, (plate?.halfWidth || entity.radius || 22) * scale);
  const hd = Math.max(1.8, (plate?.halfDepth || 6) * scale);
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate((Number(entity.rot) || 0) + rotation);
  ctx.fillStyle = COLOR_WALL_FILL;
  ctx.strokeStyle = COLOR_WALL_STROKE;
  ctx.lineWidth = 1.65;
  ctx.fillRect(-hw, -hd, hw * 2, hd * 2);
  ctx.strokeRect(-hw, -hd, hw * 2, hd * 2);
  // Reflective face highlight
  ctx.strokeStyle = 'rgba(220, 248, 255, 0.65)';
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  ctx.moveTo(-hw + 1, -hd);
  ctx.lineTo(hw - 1, -hd);
  ctx.stroke();
  ctx.restore();
}

function drawDeterministicRockPolygon(ctx, cx, cy, r, id, sides = 6) {
  const seed = ((Number(id) || 17) * 2654435761) >>> 0;
  for (let i = 0; i < sides; i += 1) {
    const a = (TAU * i) / sides + ((seed & 63) / 63) * 0.6;
    const jitter = 0.76 + (((seed >>> ((i * 5) % 24)) & 15) / 15) * 0.34;
    const px = cx + Math.cos(a) * r * jitter;
    const py = cy + Math.sin(a) * r * jitter;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawPlayerShip(ctx, x, y, screenAngle, velX, velY, size = 1) {
  // Subtle player velocity leader when drifting/flying
  const vLen = Math.hypot(velX, velY);
  if (vLen > 4) {
    const tipX = x + velX;
    const tipY = y + velY;
    ctx.save();
    ctx.strokeStyle = 'rgba(169, 237, 244, 0.44)';
    ctx.lineWidth = 1.15;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(screenAngle);
  ctx.scale(size, size);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -8.0);
  ctx.lineTo(5.6, 5.4);
  ctx.lineTo(0, 2.4);
  ctx.lineTo(-5.6, 5.4);
  ctx.closePath();
  ctx.fillStyle = '#e8f7f9';
  ctx.strokeStyle = '#071620';
  ctx.lineWidth = 1.4 / size;
  ctx.fill();
  ctx.stroke();
  // Crisp cyan nose spine
  ctx.strokeStyle = COLOR_ICE;
  ctx.lineWidth = 1.25 / size;
  ctx.beginPath();
  ctx.moveTo(0, -6.4);
  ctx.lineTo(0, 1.2);
  ctx.stroke();
  ctx.restore();
}

function drawVelocityTail(ctx, x, y, dx, dy, color, alpha) {
  const len = Math.hypot(dx, dy);
  if (!(len > 3)) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.35;
  ctx.lineCap = 'round';
  ctx.globalAlpha = clamp(alpha * 0.68, 0.14, 0.82);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dx, y + dy);
  ctx.stroke();
  ctx.globalAlpha = clamp(alpha * 0.88, 0.2, 0.94);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + dx, y + dy, 1.25, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawObjectiveRimNotch(ctx, rimPoint, color = COLOR_COURSE) {
  ctx.save();
  ctx.translate(rimPoint.x, rimPoint.y);
  ctx.rotate(rimPoint.angle);
  // Bright outward-pointing bearing wedge riding the chamfered rim
  ctx.beginPath();
  ctx.moveTo(7.5, 0);
  ctx.lineTo(-4.5, -5.8);
  ctx.lineTo(-1.8, 0);
  ctx.lineTo(-4.5, 5.8);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(6, 16, 24, 0.94)';
  ctx.lineWidth = 1.2;
  ctx.fill();
  ctx.stroke();
  // Inner crisp notch tick
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-6, 0);
  ctx.lineTo(-11, 0);
  ctx.stroke();
  ctx.restore();
}

function drawOnChartObjective(ctx, x, y, pulse = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = COLOR_COURSE;
  ctx.lineWidth = 1.6;
  const r = 8.5;
  const a = 3.8;
  ctx.beginPath();
  ctx.moveTo(-r, -r + a); ctx.lineTo(-r, -r); ctx.lineTo(-r + a, -r);
  ctx.moveTo(r - a, -r); ctx.lineTo(r, -r); ctx.lineTo(r, -r + a);
  ctx.moveTo(-r, r - a); ctx.lineTo(-r, r); ctx.lineTo(-r + a, r);
  ctx.moveTo(r - a, r); ctx.lineTo(r, r); ctx.lineTo(r, r - a);
  ctx.stroke();
  ctx.fillStyle = COLOR_COURSE;
  ctx.beginPath();
  ctx.moveTo(0, -3.8); ctx.lineTo(3.8, 0); ctx.lineTo(0, 3.8); ctx.lineTo(-3.8, 0);
  ctx.closePath();
  ctx.fill();
  if (pulse > 0) {
    ctx.globalAlpha = 0.18 + pulse * 0.22;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 11 + pulse * 3, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function drawOffEdgeRimPin(ctx, rimPoint, kind, color, closeness, selected = false) {
  const s = 0.62 + 0.50 * closeness;
  const alpha = 0.50 + 0.48 * closeness;
  ctx.save();
  ctx.translate(rimPoint.x, rimPoint.y);
  ctx.globalAlpha = alpha;
  if (kind === 'station') {
    const r = 4.2 * s;
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = '#091824';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.35;
    ctx.fill();
    ctx.stroke();
  } else if (kind === 'gate') {
    const r = 4.4 * s;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.45, 0, TAU);
    ctx.stroke();
  } else {
    ctx.rotate(rimPoint.angle);
    ctx.beginPath();
    ctx.moveTo(5.6 * s, 0);
    ctx.lineTo(-3.4 * s, -4.1 * s);
    ctx.lineTo(-1.4 * s, 0);
    ctx.lineTo(-3.4 * s, 4.1 * s);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.strokeStyle = selected ? '#f4f8fa' : 'rgba(6, 15, 22, 0.9)';
    ctx.lineWidth = selected ? 1.3 : 0.95;
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawHitRimFlash(ctx, cx, cy, width, height, hitAngle, intensity, layer, cut, reduceFlash) {
  if (!(intensity > 0.02)) return;
  const isHull = layer === 'hull';
  const rgb = isHull ? '255, 76, 56' : '246, 190, 86';
  const alpha = intensity * (reduceFlash ? 0.48 : 0.92);
  const spread = 0.44; // ~25 deg half-arc along rim
  const steps = 12;

  ctx.save();
  defineChamferPath(ctx, width, height, 0.5, cut);
  ctx.clip();

  // Soft inward radial wash on the impacted side
  const edgeMid = intersectChamferRim(cx, cy, Math.cos(hitAngle), Math.sin(hitAngle), width, height, 1.5, cut);
  const washR = Math.min(width, height) * 0.34;
  if (typeof ctx.createRadialGradient === 'function') {
    const grad = ctx.createRadialGradient(edgeMid.x, edgeMid.y, 1, edgeMid.x, edgeMid.y, washR);
    if (grad && typeof grad.addColorStop === 'function') {
      grad.addColorStop(0, `rgba(${rgb}, ${(alpha * 0.42).toFixed(3)})`);
      grad.addColorStop(0.5, `rgba(${rgb}, ${(alpha * 0.14).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }
  }

  // Crisp hot stroke riding the chamfered rim perimeter
  ctx.beginPath();
  for (let i = 0; i <= steps; i += 1) {
    const a = hitAngle - spread + (spread * 2 * i) / steps;
    const pt = intersectChamferRim(cx, cy, Math.cos(a), Math.sin(a), width, height, 2.0, cut);
    if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
  }
  ctx.strokeStyle = `rgba(${rgb}, ${alpha.toFixed(3)})`;
  ctx.lineWidth = isHull ? 3.2 : 2.2;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

function drawFrameBezel(ctx, width, height, cut) {
  ctx.save();
  // Crisp outer chamfer border
  defineChamferPath(ctx, width, height, 0.5, cut);
  ctx.strokeStyle = 'rgba(182, 222, 236, 0.72)';
  ctx.lineWidth = 1.1;
  ctx.stroke();
  // Subtle inner machined hairline
  defineChamferPath(ctx, width, height, 3.0, Math.max(4, cut - 1.5));
  ctx.strokeStyle = 'rgba(130, 194, 216, 0.16)';
  ctx.lineWidth = 0.85;
  ctx.stroke();
  // Four bright corner accent bevels (matches visor blueprint corner language)
  const c = cut;
  const arm = 12;
  ctx.strokeStyle = 'rgba(169, 237, 244, 0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  // Top-left chamfer
  ctx.moveTo(0.8, c + arm); ctx.lineTo(0.8, c); ctx.lineTo(c, 0.8); ctx.lineTo(c + arm, 0.8);
  // Top-right chamfer
  ctx.moveTo(width - c - arm, 0.8); ctx.lineTo(width - c, 0.8); ctx.lineTo(width - 0.8, c); ctx.lineTo(width - 0.8, c + arm);
  // Bottom-left chamfer
  ctx.moveTo(0.8, height - c - arm); ctx.lineTo(0.8, height - c); ctx.lineTo(c, height - 0.8); ctx.lineTo(c + arm, height - 0.8);
  // Bottom-right chamfer
  ctx.moveTo(width - c - arm, height - 0.8); ctx.lineTo(width - c, height - 0.8); ctx.lineTo(width - 0.8, height - c); ctx.lineTo(width - 0.8, height - c - arm);
  ctx.stroke();
  ctx.restore();
}

function contactDisplayName(entity, role) {
  const data = entity && entity.data;
  const raw = (data && (data.name || data.callsign || data.enemyName || data.label))
    || entity?.name
    || (role === 'station' ? 'Station'
      : role === 'gate' ? 'Jump Gate'
        : role === 'wreck' ? 'Wreck'
          : role === 'loot' ? 'Salvage'
            : role === 'boss' ? 'Boss'
              : role === 'sniper' ? 'Sniper'
                : role === 'rammer' ? 'Rammer'
                  : role === 'support' ? 'Support'
                    : role === 'minelayer' ? 'Minelayer'
                      : role === 'heavy' ? 'Heavy'
                        : role === 'civilian' ? 'Traffic'
                          : 'Contact');
  const cleaned = String(raw).replace(/\s+\d+(?:\.\d+)?\s*(?:wu|u)\b/gi, '').trim();
  return cleaned.length > 20 ? `${cleaned.slice(0, 19)}…` : cleaned;
}

const ROOM_SCROLL_PAD = 48;

/**
 * Unified tactical flight minimap for both Adventure and Swarm.
 * Single DOM canvas + cached offscreen layers (resize-only well/sweep sprites, range-keyed rings,
 * and an oversized world-anchored scrolling room cache); contacts draw at 20 Hz with zero
 * layout reads and zero per-frame DOM writes.
 */
export function createFlightMinimap(doc, dpr, requestDraw) {
  const canvas = doc.createElement('canvas');
  canvas.className = 'sf-flight-chart';
  canvas.setAttribute('role', 'img');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const wellCanvas = doc.createElement('canvas');
  const wellCtx = wellCanvas.getContext('2d');
  const staticCanvas = doc.createElement('canvas');
  const staticCtx = staticCanvas.getContext('2d');
  const roomCanvas = doc.createElement('canvas');
  const roomCtx = roomCanvas.getContext('2d');
  const sweepCanvas = doc.createElement('canvas');
  const sweepCtx = sweepCanvas.getContext('2d');

  let width = 360;
  let height = 204;
  let sweepRadius = 220;
  let projection = null;
  let pickedCourses = [];
  const footprints = new WeakMap();
  const occupiedRects = [];
  const seenContacts = new Map();
  const hitFlashes = [];
  const hoverTargets = [];
  const drawHalo = createHaloCache(doc, dpr);

  let dangerHatch = null;
  let fieldHatch = null;
  let nebulaHatch = null;

  let staticKey = '';
  let roomBaseKey = '';
  let roomAnchorX = NaN;
  let roomAnchorZ = NaN;
  let roomScale = NaN;
  let staticRebuilds = 0;
  let roomRebuilds = 0;
  let drawCalls = 0;
  const drawCostSamples = [];
  const steadyCostSamples = [];
  const textWidthMemo = new Map();

  // Pointer hover state — rect cached ONLY in pointer/resize events, NEVER inside draw().
  let cachedRect = null;
  let hoverActive = false;
  let hoverX = -999;
  let hoverY = -999;

  const paintWellAndSweepSprites = () => {
    const cut = chamferSize(width);
    const cx = width * 0.5;
    const cy = height * 0.5;
    const maxR = Math.hypot(width * 0.55, height * 0.55);
    const scopeR = Math.min(width, height) * 0.43;

    // 1. Resize-only sensor well + crosshair + degree ticks + North mark (zero per-range gradients)
    if (wellCtx) {
      const g = wellCtx;
      g.clearRect(0, 0, width, height);
      g.save();
      defineChamferPath(g, width, height, 0.5, cut);
      g.clip();
      if (typeof g.createRadialGradient === 'function') {
        const well = g.createRadialGradient(cx, cy, 4, cx, cy, maxR);
        if (well && typeof well.addColorStop === 'function') {
          well.addColorStop(0, 'rgba(11, 29, 42, 0.94)');
          well.addColorStop(0.58, 'rgba(8, 21, 32, 0.96)');
          well.addColorStop(1, 'rgba(5, 13, 21, 0.98)');
          g.fillStyle = well;
        } else {
          g.fillStyle = 'rgba(8, 21, 32, 0.96)';
        }
      } else {
        g.fillStyle = 'rgba(8, 21, 32, 0.96)';
      }
      g.fillRect(0, 0, width, height);

      const innerGap = 15;
      g.strokeStyle = 'rgba(162, 208, 226, 0.08)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(cx, 6); g.lineTo(cx, cy - innerGap);
      g.moveTo(cx, cy + innerGap); g.lineTo(cx, height - 6);
      g.moveTo(6, cy); g.lineTo(cx - innerGap, cy);
      g.moveTo(cx + innerGap, cy); g.lineTo(width - 6, cy);
      g.stroke();

      g.strokeStyle = COLOR_REF_RING;
      g.lineWidth = 1;
      g.beginPath();
      g.arc(cx, cy, scopeR, 0, TAU);
      g.stroke();

      g.strokeStyle = 'rgba(176, 218, 232, 0.22)';
      g.lineWidth = 0.9;
      g.beginPath();
      for (let i = 0; i < 36; i += 1) {
        const a = (TAU * i) / 36;
        const major = i % 9 === 0;
        const r0 = scopeR - (major ? 4.5 : 2.2);
        const r1 = scopeR;
        g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      }
      g.stroke();

      g.strokeStyle = 'rgba(170, 212, 228, 0.09)';
      g.lineWidth = 0.85;
      g.beginPath();
      g.arc(cx, cy, scopeR * 0.5, 0, TAU);
      g.stroke();

      const northX = width * 0.5;
      g.fillStyle = 'rgba(214, 236, 242, 0.76)';
      g.font = canvasFont(650, 12, 'data');
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillText('N', northX, 5);
      g.strokeStyle = 'rgba(169, 237, 244, 0.65)';
      g.lineWidth = 1.1;
      g.beginPath();
      g.moveTo(northX - 3, 21);
      g.lineTo(northX, 17.5);
      g.lineTo(northX + 3, 21);
      g.stroke();
      g.restore();
    }

    // 2. Resize-only pre-baked conic sweep wedge sprite (rotated & blitted at 20 Hz; zero per-frame gradient allocs)
    if (sweepCtx) {
      const r = sweepRadius;
      const sg = sweepCtx;
      sg.clearRect(0, 0, r * 2, r * 2);
      sg.save();
      sg.translate(r, r);
      sg.beginPath();
      sg.moveTo(0, 0);
      sg.arc(0, 0, r, -SWEEP_TRAIL_RAD, 0);
      sg.closePath();
      let grad = null;
      if (typeof sg.createConicGradient === 'function') {
        grad = sg.createConicGradient(-SWEEP_TRAIL_RAD, 0, 0);
      }
      if (grad && typeof grad.addColorStop === 'function') {
        grad.addColorStop(0, 'rgba(130, 224, 242, 0)');
        grad.addColorStop(SWEEP_TRAIL_RAD / TAU, 'rgba(138, 228, 244, 0.11)');
        grad.addColorStop(1, 'rgba(130, 224, 242, 0)');
        sg.fillStyle = grad;
      } else {
        sg.fillStyle = 'rgba(138, 228, 244, 0.045)';
      }
      sg.fill();
      sg.strokeStyle = 'rgba(182, 242, 250, 0.30)';
      sg.lineWidth = 1;
      sg.beginPath();
      sg.moveTo(0, 0);
      sg.lineTo(r, 0);
      sg.stroke();
      sg.restore();
    }
  };

  const syncLayerSizes = () => {
    const pw = Math.max(1, Math.round(width * dpr));
    const ph = Math.max(1, Math.round(height * dpr));
    const rw = Math.max(1, Math.round((width + ROOM_SCROLL_PAD * 2) * dpr));
    const rh = Math.max(1, Math.round((height + ROOM_SCROLL_PAD * 2) * dpr));
    sweepRadius = Math.ceil(Math.hypot(width * 0.55, height * 0.55));
    const sw = Math.max(4, Math.round(sweepRadius * 2 * dpr));

    canvas.width = pw;
    canvas.height = ph;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (wellCtx) {
      wellCanvas.width = pw;
      wellCanvas.height = ph;
      wellCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    if (staticCtx) {
      staticCanvas.width = pw;
      staticCanvas.height = ph;
      staticCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    if (roomCtx) {
      roomCanvas.width = rw;
      roomCanvas.height = rh;
      roomCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    if (sweepCtx) {
      sweepCanvas.width = sw;
      sweepCanvas.height = sw;
      sweepCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    paintWellAndSweepSprites();
    staticKey = '';
    roomBaseKey = '';
    roomAnchorX = NaN;
    roomAnchorZ = NaN;
    roomScale = NaN;
  };

  const setSize = (w, h) => {
    width = Math.max(140, Math.round(w));
    height = Math.max(96, Math.round(h));
    syncLayerSizes();
  };
  setSize(width, height);

  const onPointerEnter = (ev) => {
    cachedRect = typeof canvas.getBoundingClientRect === 'function' ? canvas.getBoundingClientRect() : null;
    if (cachedRect && cachedRect.width > 0 && cachedRect.height > 0) {
      hoverActive = true;
      hoverX = ((ev.clientX - cachedRect.left) * width) / cachedRect.width;
      hoverY = ((ev.clientY - cachedRect.top) * height) / cachedRect.height;
    }
  };
  const onPointerMove = (ev) => {
    if (!cachedRect || !(cachedRect.width > 0) || !(cachedRect.height > 0)) {
      cachedRect = typeof canvas.getBoundingClientRect === 'function' ? canvas.getBoundingClientRect() : null;
    }
    if (cachedRect && cachedRect.width > 0 && cachedRect.height > 0) {
      hoverActive = true;
      hoverX = ((ev.clientX - cachedRect.left) * width) / cachedRect.width;
      hoverY = ((ev.clientY - cachedRect.top) * height) / cachedRect.height;
    }
  };
  const onPointerLeave = () => {
    hoverActive = false;
    hoverX = -999;
    hoverY = -999;
    cachedRect = null;
  };
  if (typeof canvas.addEventListener === 'function') {
    canvas.addEventListener('pointerenter', onPointerEnter);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
  }

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(([entry]) => {
    const { width: w, height: h } = entry.contentRect;
    cachedRect = null;
    if (w > 120 && h > 72 && (Math.round(w) !== width || Math.round(h) !== height)) {
      setSize(w, h);
      requestDraw();
    }
  }) : null;
  observer?.observe(canvas);

  function ensurePatterns(targetCtx) {
    if (!dangerHatch) dangerHatch = createHatchPattern(targetCtx, doc, 'rgba(255, 118, 76, 0.56)', 6, 1.2);
    if (!fieldHatch) fieldHatch = createHatchPattern(targetCtx, doc, 'rgba(138, 220, 242, 0.40)', 7, 1.05);
    if (!nebulaHatch) nebulaHatch = createHatchPattern(targetCtx, doc, 'rgba(164, 198, 224, 0.34)', 8, 1.05);
  }

  function paintStaticLayer({
    cx, cy, scale, range, gunRange, lineReach, blind, cut,
  }) {
    const g = staticCtx;
    if (!g) return;
    g.clearRect(0, 0, width, height);
    if (wellCtx) {
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(wellCanvas, 0, 0);
      g.restore();
    }
    g.save();
    defineChamferPath(g, width, height, 0.5, cut);
    g.clip();
    const maxR = Math.hypot(width * 0.55, height * 0.55);

    // Meaningful ring 1: Gun range (warm faint dashed ring)
    const gunR = gunRange > 0 ? gunRange * scale : 0;
    if (gunR >= 10 && gunR <= maxR) {
      g.save();
      g.strokeStyle = COLOR_GUN_RING;
      g.lineWidth = 1.05;
      g.setLineDash([4, 4]);
      g.beginPath();
      g.arc(cx, cy, gunR, 0, TAU);
      g.stroke();
      g.setLineDash([]);
      g.restore();
    }

    // Meaningful ring 2: Line reach (crisp faint cyan dotted ring + 4 cardinal micro-notches)
    const lineR = lineReach > 0 ? lineReach * scale : 0;
    if (lineR >= 8 && lineR <= maxR) {
      g.save();
      g.strokeStyle = COLOR_LINE_RING;
      g.lineWidth = 1.0;
      g.setLineDash([2, 3]);
      g.beginPath();
      g.arc(cx, cy, lineR, 0, TAU);
      g.stroke();
      g.setLineDash([]);
      // Distinct 45-deg Line notches so gun ring and Line ring read apart without colour
      g.strokeStyle = 'rgba(169, 237, 244, 0.42)';
      g.lineWidth = 1.1;
      g.beginPath();
      for (const a of [Math.PI * 0.25, Math.PI * 0.75, -Math.PI * 0.75, -Math.PI * 0.25]) {
        g.moveTo(cx + Math.cos(a) * (lineR - 2.5), cy + Math.sin(a) * (lineR - 2.5));
        g.lineTo(cx + Math.cos(a) * (lineR + 2.5), cy + Math.sin(a) * (lineR + 2.5));
      }
      g.stroke();
      g.restore();
    }

    // Current range printed ONCE, small (12px), in m/km — never 'u'.
    const rangeLabel = formatMinimapDistance(range);
    if (rangeLabel) {
      g.font = canvasFont(600, 12, 'data');
      g.textAlign = 'right';
      g.textBaseline = 'bottom';
      g.fillStyle = 'rgba(196, 228, 238, 0.88)';
      g.fillText(rangeLabel, width - 14, height - 8);
    }

    if (blind) {
      g.font = canvasFont(600, 12, 'read');
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillStyle = COLOR_COURSE;
      g.fillText('Sensors blocked', 16, 10);
    }

    g.restore();
  }

  function paintRoomLayer({
    project, scale, rotation, rocks, roomWalls, staticHazards, infrastructure, harbor, plan,
  }) {
    const g = roomCtx;
    if (!g) return;
    ensurePatterns(g);
    const rw = width + ROOM_SCROLL_PAD * 2;
    const rh = height + ROOM_SCROLL_PAD * 2;
    g.clearRect(0, 0, rw, rh);
    g.save();

    // 1. Static sector hazards (nebula, radiation, furnace intake) — hatched!
    if (Array.isArray(staticHazards)) {
      for (let i = 0; i < staticHazards.length; i += 1) {
        const hz = staticHazards[i];
        if (!hz || !hz.center || !(hz.radius > 0)) continue;
        const at = project(hz.center.x, hz.center.z);
        const rPx = Math.max(5, hz.radius * scale);
        if (at.x + rPx < -10 || at.x - rPx > rw + 10 || at.y + rPx < -10 || at.y - rPx > rh + 10) continue;
        const isThermal = hz.type === 'radiation' || hz.type === 'furnace';
        g.save();
        g.beginPath();
        g.arc(at.x, at.y, rPx, 0, TAU);
        g.fillStyle = (isThermal ? dangerHatch : nebulaHatch)
          || (isThermal ? 'rgba(255, 114, 72, 0.14)' : 'rgba(146, 178, 206, 0.10)');
        g.fill();
        g.strokeStyle = isThermal ? 'rgba(255, 124, 80, 0.54)' : 'rgba(154, 186, 214, 0.32)';
        g.lineWidth = 1.0;
        g.setLineDash([4, 4]);
        g.stroke();
        g.setLineDash([]);
        g.restore();
      }
    }

    // 2. Rock fields: soft stippled cluster patches + crisp rock outlines for cover & ammo
    if (Array.isArray(rocks) && rocks.length > 0) {
      // Soft stippled density patches across a coarse grid
      const cellPx = 24;
      const cols = Math.ceil(rw / cellPx);
      const rows = Math.ceil(rh / cellPx);
      const cellCounts = new Uint16Array(cols * rows);
      const visibleRocks = [];
      for (let i = 0; i < rocks.length; i += 1) {
        const rock = rocks[i];
        if (!rock || !rock.pos || rock.alive === false) continue;
        const at = project(rock.pos.x, rock.pos.z);
        if (at.x < -16 || at.x > rw + 16 || at.y < -16 || at.y > rh + 16) continue;
        const gx = clamp(Math.floor(at.x / cellPx), 0, cols - 1);
        const gy = clamp(Math.floor(at.y / cellPx), 0, rows - 1);
        cellCounts[gy * cols + gx] += 1;
        visibleRocks.push({
          rock,
          x: at.x,
          y: at.y,
          radius: Number(rock.radius) || 14,
          isMonolith: (Number(rock.radius) || 0) >= 24 || !!(rock.data && (rock.data.isMonolith || rock.data.hiveWall)),
          distCenterSq: (at.x - rw * 0.5) ** 2 + (at.y - rh * 0.5) ** 2,
        });
      }

      // Soft stippled rock-field patches where rocks cluster
      g.fillStyle = COLOR_ROCK_PATCH;
      g.beginPath();
      for (let gy = 0; gy < rows; gy += 1) {
        for (let gx = 0; gx < cols; gx += 1) {
          const count = cellCounts[gy * cols + gx];
          if (count < 1) continue;
          const cx0 = (gx + 0.5) * cellPx;
          const cy0 = (gy + 0.5) * cellPx;
          const patchR = cellPx * (count >= 2 ? 0.72 : 0.48);
          g.moveTo(cx0 + patchR, cy0);
          g.arc(cx0, cy0, patchR, 0, TAU);
        }
      }
      g.fill();

      g.fillStyle = COLOR_ROCK_STIPPLE;
      g.beginPath();
      for (let gy = 0; gy < rows; gy += 1) {
        for (let gx = 0; gx < cols; gx += 1) {
          const count = cellCounts[gy * cols + gx];
          if (count < 1) continue;
          const bx = gx * cellPx;
          const by = gy * cellPx;
          const dots = Math.min(8, count * 2 + 2);
          for (let d = 0; d < dots; d += 1) {
            const h = ((gx * 73856093) ^ (gy * 19349663) ^ (d * 83492791)) >>> 0;
            const px = bx + 2 + (h % (cellPx - 4));
            const py = by + 2 + ((h >>> 8) % (cellPx - 4));
            g.rect(px, py, 1.45, 1.45);
          }
        }
      }
      g.fill();

      // Nearest individual rocks: crisp polygonal outlines for cover monoliths & throwable boulders
      if (visibleRocks.length > MAX_ROCK_OUTLINES) {
        visibleRocks.sort((a, b) => Number(b.isMonolith) - Number(a.isMonolith) || a.distCenterSq - b.distCenterSq);
      }
      const limit = Math.min(visibleRocks.length, MAX_ROCK_OUTLINES);

      // Batch monolith cover rocks
      g.fillStyle = COLOR_ROCK_MONOLITH_FILL;
      g.strokeStyle = COLOR_ROCK_MONOLITH_STROKE;
      g.lineWidth = 1.1;
      g.beginPath();
      let hasMonolith = false;
      for (let i = 0; i < limit; i += 1) {
        const item = visibleRocks[i];
        if (!item.isMonolith) continue;
        hasMonolith = true;
        const rPx = clamp(item.radius * scale, 3.2, 13);
        drawDeterministicRockPolygon(g, item.x, item.y, rPx, item.rock.id, 6);
      }
      if (hasMonolith) {
        g.fill();
        g.stroke();
      }

      // Batch throwable ammo rocks
      g.strokeStyle = COLOR_ROCK_AMMO_STROKE;
      g.lineWidth = 0.95;
      g.beginPath();
      let hasAmmo = false;
      for (let i = 0; i < limit; i += 1) {
        const item = visibleRocks[i];
        if (item.isMonolith) continue;
        hasAmmo = true;
        const rPx = clamp(item.radius * scale, 1.8, 4.2);
        drawDeterministicRockPolygon(g, item.x, item.y, rPx, item.rock.id, 5);
      }
      if (hasAmmo) g.stroke();
    }

    // 3. Trade hub architectural plan + station collision footprints (crisp lines)
    if (plan) drawTradeHubPlan(g, plan, project(plan.center.x, plan.center.z), scale, rotation);
    if (Array.isArray(infrastructure)) {
      for (let i = 0; i < infrastructure.length; i += 1) {
        const mark = infrastructure[i];
        const entity = mark && mark.entity;
        if (!entity || !entity.pos || mark.offRange) continue;
        if (entity === harbor && plan) continue;
        const at = project(entity.pos.x, entity.pos.z);
        if (at.x < -50 || at.x > rw + 50 || at.y < -50 || at.y > rh + 50) continue;
        let saved = footprints.get(entity);
        if (!saved || saved.x !== entity.pos.x || saved.z !== entity.pos.z || saved.rot !== entity.rot) {
          const manifest = resolveCollisionProxyManifest(entity);
          saved = {
            x: entity.pos.x,
            z: entity.pos.z,
            rot: entity.rot,
            manifest,
            primitives: manifest ? proxyWorldPrimitives(entity, manifest) : [],
          };
          footprints.set(entity, saved);
        }
        if (saved.primitives.length) {
          const physicalSize = saved.primitives.reduce((max, p) => {
            const px = p.x ?? p.bx;
            const pz = p.z ?? p.bz;
            return Math.max(max, Math.hypot(px - entity.pos.x, pz - entity.pos.z) + (p.r ?? Math.hypot(p.hx, p.hz)));
          }, 0) * scale;
          if (physicalSize >= 6) traceFootprint(g, saved.primitives, project, scale, rotation);
        }
      }
    }

    // 4. Solid arena walls / reflective bank plates / gates (crisp architectural lines)
    if (Array.isArray(roomWalls)) {
      for (let i = 0; i < roomWalls.length; i += 1) {
        const wall = roomWalls[i];
        if (!wall || !wall.pos || wall.alive === false) continue;
        const kind = wall.data?.roomKind;
        if (kind === 'furnace' || kind === 'crusher') continue; // drawn as dynamic hatched hazard
        const at = project(wall.pos.x, wall.pos.z);
        if (at.x < -40 || at.x > rw + 40 || at.y < -40 || at.y > rh + 40) continue;
        if (wall.data?.foundryPlate || kind === 'plate' || kind === 'shutter') {
          drawArenaPlate(g, wall, at, scale, rotation);
        } else {
          const manifest = resolveCollisionProxyManifest(wall);
          const primitives = manifest ? proxyWorldPrimitives(wall, manifest) : null;
          if (primitives && primitives.length) {
            traceFootprint(g, primitives, project, scale, rotation);
          } else {
            const rPx = clamp((wall.radius || 18) * scale, 3, 18);
            g.fillStyle = COLOR_WALL_FILL;
            g.strokeStyle = COLOR_WALL_STROKE;
            g.lineWidth = 1.5;
            g.beginPath();
            g.arc(at.x, at.y, rPx, 0, TAU);
            g.fill();
            g.stroke();
          }
        }
      }
    }

    g.restore();
  }

  function recordHit({ angle = 0, atMs = 0, strength = 1, layer = 'hull' } = {}) {
    if (!Number.isFinite(angle)) return;
    const entry = hitFlashes.length < 4 ? {} : hitFlashes.shift();
    entry.angle = angle;
    entry.atMs = Number.isFinite(atMs) ? atMs : 0;
    entry.strength = clamp(Number(strength) || 1, 0.35, 1);
    entry.layer = layer || 'hull';
    hitFlashes.push(entry);
  }

  function resetSector() {
    seenContacts.clear();
    hitFlashes.length = 0;
    staticKey = '';
    roomBaseKey = '';
    roomAnchorX = NaN;
    roomAnchorZ = NaN;
    roomScale = NaN;
  }

  function paint({
    player,
    range,
    gunRange = 0,
    lineReach = 0,
    objective = null,
    infrastructure = [],
    neutral = [],
    hostile = [],
    offRangeHostiles = [],
    ghosts = [],
    courses = [],
    rocks = [],
    roomWalls = [],
    mines = [],
    activeFields = [],
    staticHazards = [],
    heatZone = null,
    targetId = null,
    leadAimPos = null,
    blind = false,
    reducedMotion = false,
    reduceFlash = false,
    nowMs = 0,
    sectorId = '',
    asteroidVersion = 0,
    isSwarm = false,
    expanded = false,
    stanceOf = null,
    colorOf = null,
  }) {
    const t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : 0;
    const cut = chamferSize(width);
    const nowS = nowMs * 0.001;
    ensurePatterns(ctx);

    // Docking approach zoom only in calm Adventure flight when approaching a targeted dock
    const objectiveStationId = objective?.cueOwner?.stationId;
    const targetStation = !isSwarm && objectiveStationId
      ? infrastructure.find((mark) => mark.entity?.data?.stationId === objectiveStationId && !mark.gate)?.entity
      : null;
    const targetManifest = targetStation && resolveCollisionProxyManifest(targetStation);
    const targetDock = targetManifest && resolveDockAnchor(targetStation, targetManifest, player);
    const owner = objective?.cueOwner;
    const fix = targetDock || (blind && (owner?.targetEntityId != null || owner?.stable || owner?.presentationEntityId != null)
      ? owner.pos : objective?.waypointPos);
    const target = Number.isFinite(fix?.x) && Number.isFinite(fix?.z) ? fix : null;

    let harbor = null;
    let harborDistSq = Infinity;
    if (!isSwarm) {
      for (let i = 0; i < infrastructure.length; i += 1) {
        const mark = infrastructure[i];
        if (!mark || mark.gate || mark.offRange || mark.entity?.data?.roomOwner) continue;
        if (mark.distanceSq < harborDistSq) {
          harbor = mark.entity;
          harborDistSq = mark.distanceSq;
        }
      }
    }

    const dockingDistance = targetDock ? distance2d(player.pos, targetDock) : Infinity;
    const approachRange = Math.min(range * 0.30, 820);
    const approach = !isSwarm && targetDock ? clamp((approachRange - dockingDistance) / 280, 0, 1) : 0;
    const harborNear = harbor && Math.sqrt(harborDistSq) < Math.min(range * 0.24, 580);
    const plan = harbor && (approach > 0 || harborNear) ? tradeHubPlan(harbor) : null;

    // North-up keeps bearing reading instantaneous in both Adventure and Swarm
    const rotation = 0;
    const scopeR = Math.min(width, height) * 0.43;
    const scale = scopeR / Math.max(100, range);
    const cx = width * 0.5;
    const cy = height * 0.5;
    const originX = player.pos.x;
    const originZ = player.pos.z;
    const project = (x, z) => ({
      x: cx - (x - originX) * scale,
      y: cy - (z - originZ) * scale,
    });
    projection = project;

    // 1. Static Layer (well + rings + N + range) — quantized to displayed resolution (100m at km scale, 25m below)
    const rangeStep = range >= 1000 ? 100 : 25;
    const rangeKey = Math.max(100, Math.round(range / rangeStep) * rangeStep);
    const nextStaticKey = `${width}|${height}|${dpr}|${rangeKey}|${Math.round(gunRange / 10)}|${Math.round(lineReach / 10)}|${blind ? 1 : 0}|${isSwarm ? 1 : 0}|${expanded ? 1 : 0}`;
    if (nextStaticKey !== staticKey) {
      paintStaticLayer({ cx, cy, scale, range: rangeKey, gunRange, lineReach, blind, cut });
      staticKey = nextStaticKey;
      staticRebuilds += 1;
    }

    // 2. Oversized world-anchored scrolling & softly-scalable Room Layer.
    // Rebuilt only on sector/geometry change, >10% zoom shift, or flying past the ±42px scroll pad.
    const wallSig = roomWalls.length ? `${roomWalls.length}:${Math.round(roomWalls[0]?.pos?.x || 0)}:${Math.round(roomWalls[0]?.pos?.z || 0)}` : '0';
    const nextRoomBaseKey = `${width}|${height}|${dpr}|${sectorId}|${asteroidVersion}|${wallSig}|${staticHazards.length}|${plan ? 1 : 0}`;
    const zoomRatio = Number.isFinite(roomScale) && roomScale > 0 ? scale / roomScale : Infinity;
    const driftPx = Number.isFinite(roomAnchorX) ? Math.abs((originX - roomAnchorX) * scale) : Infinity;
    const driftPy = Number.isFinite(roomAnchorZ) ? Math.abs((originZ - roomAnchorZ) * scale) : Infinity;
    const zoomDirty = !(zoomRatio > 0.90 && zoomRatio < 1.11);
    if (nextRoomBaseKey !== roomBaseKey || zoomDirty || driftPx > ROOM_SCROLL_PAD - 6 || driftPy > ROOM_SCROLL_PAD - 6) {
      roomAnchorX = originX;
      roomAnchorZ = originZ;
      roomScale = scale;
      const roomCx = cx + ROOM_SCROLL_PAD;
      const roomCy = cy + ROOM_SCROLL_PAD;
      const roomProject = (x, z) => ({
        x: roomCx - (x - roomAnchorX) * roomScale,
        y: roomCy - (z - roomAnchorZ) * roomScale,
      });
      paintRoomLayer({ project: roomProject, scale: roomScale, rotation, rocks, roomWalls, staticHazards, infrastructure, harbor, plan });
      roomBaseKey = nextRoomBaseKey;
      roomRebuilds += 1;
    }

    // Blit cached static layer, then clip to chamfer once for scrolling room + dynamic layers
    ctx.clearRect(0, 0, width, height);
    if (staticCtx) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(staticCanvas, 0, 0);
      ctx.restore();
    }

    ctx.save();
    defineChamferPath(ctx, width, height, 1.5, cut);
    ctx.clip();

    if (roomCtx && Number.isFinite(roomScale) && roomScale > 0) {
      const k = scale / roomScale;
      const drawW = (width + ROOM_SCROLL_PAD * 2) * k;
      const drawH = (height + ROOM_SCROLL_PAD * 2) * k;
      const blitX = cx + (originX - roomAnchorX) * scale - (cx + ROOM_SCROLL_PAD) * k;
      const blitY = cy + (originZ - roomAnchorZ) * scale - (cy + ROOM_SCROLL_PAD) * k;
      ctx.drawImage(roomCanvas, blitX, blitY, drawW, drawH);
    }

    // 3. Dynamic hazards (hatched): heat zones, furnaces/crushers, active force fields, mines
    if (heatZone && heatZone.active && heatZone.radius > 0 && heatZone.center) {
      const hzAt = project(heatZone.center.x, heatZone.center.z);
      const rPx = Math.max(6, heatZone.radius * scale);
      ctx.save();
      ctx.beginPath();
      ctx.arc(hzAt.x, hzAt.y, rPx, 0, TAU);
      ctx.fillStyle = dangerHatch || 'rgba(255, 84, 112, 0.14)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 98, 92, 0.56)';
      ctx.lineWidth = 1.1;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Furnaces & crushers from roomWalls
    for (let i = 0; i < roomWalls.length; i += 1) {
      const wall = roomWalls[i];
      if (!wall || !wall.pos || wall.alive === false) continue;
      const kind = wall.data?.roomKind;
      if (kind !== 'furnace' && kind !== 'crusher') continue;
      const at = project(wall.pos.x, wall.pos.z);
      const rPx = clamp((wall.radius || 28) * scale, 7, 26);
      if (at.x + rPx < -8 || at.x - rPx > width + 8 || at.y + rPx < -8 || at.y - rPx > height + 8) continue;
      ctx.save();
      ctx.beginPath();
      ctx.arc(at.x, at.y, rPx, 0, TAU);
      ctx.fillStyle = dangerHatch || 'rgba(255, 116, 62, 0.28)';
      ctx.fill();
      ctx.strokeStyle = '#ff7d47';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // Tiny thermal core diamond
      ctx.fillStyle = '#ffd18a';
      ctx.beginPath();
      ctx.moveTo(at.x, at.y - 3);
      ctx.lineTo(at.x + 3, at.y);
      ctx.lineTo(at.x, at.y + 3);
      ctx.lineTo(at.x - 3, at.y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Active fields (snare wells, currents, player/environmental fields)
    for (let i = 0; i < activeFields.length; i += 1) {
      const field = activeFields[i];
      if (!field || !field.center || !(field.radius > 0)) continue;
      const at = project(field.center.x, field.center.z);
      const rPx = clamp(field.radius * scale, 6, Math.max(width, height));
      if (at.x + rPx < -8 || at.x - rPx > width + 8 || at.y + rPx < -8 || at.y - rPx > height + 8) continue;
      const hostileField = field.kind === 'snare' || field.kind === 'thermal' || field.tag === 'hostile';
      ctx.save();
      ctx.beginPath();
      ctx.arc(at.x, at.y, rPx, 0, TAU);
      ctx.fillStyle = (hostileField ? dangerHatch : fieldHatch) || 'rgba(138, 216, 238, 0.16)';
      ctx.fill();
      ctx.strokeStyle = hostileField ? 'rgba(255, 126, 78, 0.52)' : 'rgba(148, 224, 244, 0.42)';
      ctx.lineWidth = 1.0;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Mines (hatched blast disc + spiked mine pip)
    for (let i = 0; i < mines.length; i += 1) {
      const mine = mines[i];
      if (!mine || !mine.pos || mine.alive === false) continue;
      const at = project(mine.pos.x, mine.pos.z);
      if (!pointInsideChamfer(at.x, at.y, width, height, 6, cut)) continue;
      const triggerR = clamp((mine.data?.triggerRadius || 55) * scale, 5, 22);
      ctx.save();
      ctx.beginPath();
      ctx.arc(at.x, at.y, triggerR, 0, TAU);
      ctx.fillStyle = dangerHatch || 'rgba(255, 108, 70, 0.20)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 118, 78, 0.52)';
      ctx.lineWidth = 0.85;
      ctx.setLineDash([2, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      // Crisp mine cross-star pip
      ctx.strokeStyle = '#ff7254';
      ctx.fillStyle = '#ffb86c';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(at.x - 3.2, at.y); ctx.lineTo(at.x + 3.2, at.y);
      ctx.moveTo(at.x, at.y - 3.2); ctx.lineTo(at.x, at.y + 3.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(at.x, at.y, 1.8, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // 4. Slow meaningful sensor sweep (pre-baked sprite rotated & blitted; omitted under reduced-motion)
    const sweepAngle = reducedMotion
      ? -Math.PI / 2
      : (((nowMs % SWEEP_PERIOD_MS) / SWEEP_PERIOD_MS) * TAU - Math.PI / 2);
    if (!reducedMotion && sweepCtx) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(sweepAngle);
      ctx.drawImage(sweepCanvas, -sweepRadius, -sweepRadius, sweepRadius * 2, sweepRadius * 2);
      ctx.restore();
    }

    const sweepFreshness = (x, y) => {
      if (reducedMotion) return 0;
      const theta = Math.atan2(y - cy, x - cx);
      const lag = (((sweepAngle - theta) % TAU) + TAU) % TAU;
      return Math.exp(-lag * 1.45);
    };

    const noteArrival = (id, x, y, color) => {
      if (id == null || reducedMotion) return;
      let rec = seenContacts.get(id);
      if (!rec) {
        rec = { firstSeenS: nowS, lastSeenS: nowS };
        seenContacts.set(id, rec);
      } else {
        rec.lastSeenS = nowS;
      }
      const age = nowS - rec.firstSeenS;
      if (age >= 0 && age < ARRIVAL_PING_S) {
        const t = age / ARRIVAL_PING_S;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.globalAlpha = (1 - t) * 0.68;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.arc(x, y, 5 + t * 12, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    };

    // Prune vanished contacts occasionally
    if (drawCalls % 20 === 0 && seenContacts.size > 0) {
      for (const [id, rec] of seenContacts) {
        if (nowS - rec.lastSeenS > 3) seenContacts.delete(id);
      }
    }

    hoverTargets.length = 0;
    const registerHoverable = (entity, role, x, y, color, distWorld) => {
      hoverTargets.push({ entity, role, x, y, color, distWorld });
    };

    // 5. Ghosts (nebula-veiled contacts)
    if (ghosts.length) {
      ctx.save();
      ctx.fillStyle = '#9aa8bc';
      ctx.globalAlpha = 0.34;
      ctx.beginPath();
      for (let i = 0; i < ghosts.length; i += 1) {
        const at = project(ghosts[i].entity.pos.x, ghosts[i].entity.pos.z);
        if (!pointInsideChamfer(at.x, at.y, width, height, 8, cut)) continue;
        ctx.moveTo(at.x + 2.8, at.y);
        ctx.arc(at.x, at.y, 2.8, 0, TAU);
      }
      ctx.fill();
      ctx.restore();
    }

    // 6. Stations & Gates (in-range glyphs + proximity-sized rim pins for off-edge)
    let namedPort = '';
    let market = false;
    const offEdgeInfra = [];
    for (let i = 0; i < infrastructure.length; i += 1) {
      const mark = infrastructure[i];
      const entity = mark && mark.entity;
      if (!entity || !entity.pos || entity.data?.roomOwner) continue;
      const role = mark.gate ? 'gate' : 'station';
      const color = mark.gate ? TACTICAL_MAP_PALETTE.gate : TACTICAL_MAP_PALETTE.station;
      const at = project(entity.pos.x, entity.pos.z);
      const distW = Math.sqrt(mark.distanceSq || 0);
      if (pointInsideChamfer(at.x, at.y, width, height, 11, cut)) {
        const fresh = sweepFreshness(at.x, at.y);
        if (fresh > 0.2) drawHalo(ctx, at.x, at.y, 12, hexToRgb(color), fresh * 0.24);
        drawRoleGlyph(ctx, role, 'infra', at.x, at.y, 0, {
          color,
          alpha: 0.80 + 0.20 * fresh,
          selected: entity.id === targetId,
        });
        registerHoverable(entity, role, at.x, at.y, color, distW);
        if (!namedPort) namedPort = entity.data?.name || entity.name || (mark.gate ? 'Gate' : 'Station');
        if (entity.data?.services?.includes('trade')) market = true;
      } else {
        offEdgeInfra.push({ entity, role, color, at, distW });
      }
    }

    // 7. Unresolved scanner pings (clickable courses)
    pickedCourses = [];
    for (let i = 0; i < courses.length; i += 1) {
      const course = courses[i];
      if (!course || !course.pos) continue;
      const at = project(course.pos.x, course.pos.z);
      if (!pointInsideChamfer(at.x, at.y, width, height, 11, cut)) continue;
      pickedCourses.push(course);
      const fresh = sweepFreshness(at.x, at.y);
      ctx.save();
      ctx.strokeStyle = COLOR_ICE;
      ctx.globalAlpha = 0.7 + 0.3 * fresh;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(at.x, at.y, 4.8, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(at.x, at.y, 1.8, 0, TAU);
      ctx.fillStyle = COLOR_ICE;
      ctx.fill();
      ctx.restore();
      if (pickedCourses.length >= 4) break;
    }

    // 8. Neutral, Friendly, Loot, Wreck contacts (shapes + velocity tails + sweep refresh)
    let firstWreck = null;
    const neutralCells = new Set();
    for (let i = 0; i < neutral.length; i += 1) {
      const mark = neutral[i];
      const entity = mark && mark.entity;
      if (!entity || !entity.pos || entity.type === 'mine') continue;
      const at = project(entity.pos.x, entity.pos.z);
      if (!pointInsideChamfer(at.x, at.y, width, height, 10, cut)) continue;
      const selected = entity.id === targetId || mark.selected;
      const cell = `${Math.floor(at.x / 11)}:${Math.floor(at.y / 11)}`;
      if (!selected && neutralCells.has(cell)) continue;
      neutralCells.add(cell);

      const role = classifyContactRole(entity);
      const stance = role === 'loot' ? 'loot'
        : role === 'wreck' ? 'wreck'
          : (stanceOf ? stanceOf(entity) : 'neutral');
      const color = role === 'loot' ? TACTICAL_MAP_PALETTE.objective
        : role === 'wreck' ? TACTICAL_MAP_PALETTE.wreck
          : (colorOf ? colorOf(entity) : (stance === 'friendly' ? TACTICAL_MAP_PALETTE.friendly : TACTICAL_MAP_PALETTE.neutral));
      const fresh = sweepFreshness(at.x, at.y);
      const alpha = (selected ? 1 : 0.74) + 0.24 * fresh;
      if (role === 'wreck' && !firstWreck) firstWreck = mark;

      // Velocity tail showing heading of travel
      const vel = entity.vel;
      if (vel && (role !== 'loot' && role !== 'wreck')) {
        const speed = Math.hypot(vel.x || 0, vel.z || 0);
        if (speed >= VELOCITY_MIN_SPEED) {
          const tailPx = clamp(speed * scale * 0.9, 6, 16);
          drawVelocityTail(ctx, at.x, at.y, -(vel.x / speed) * tailPx, -(vel.z / speed) * tailPx, color, alpha);
        }
      }

      if (fresh > 0.22 || selected) drawHalo(ctx, at.x, at.y, selected ? 12 : 9, hexToRgb(color), selected ? 0.28 : fresh * 0.24);
      noteArrival(entity.id, at.x, at.y, color);

      const worldHeading = Number.isFinite(entity.rot)
        ? entity.rot
        : (vel && Math.hypot(vel.x || 0, vel.z || 0) > 1e-3 ? Math.atan2(vel.z, vel.x) : 0);
      drawRoleGlyph(ctx, role, stance, at.x, at.y, worldHeading - Math.PI / 2 + rotation, {
        color,
        alpha,
        selected,
      });
      if (selected) {
        ctx.save();
        ctx.strokeStyle = COLOR_ICE;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.arc(at.x, at.y, 9.5, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
      registerHoverable(entity, role, at.x, at.y, color, Math.sqrt(mark.distanceSq || 0));
    }

    // 9. Hostiles (12-role silhouettes + velocity tails + sweep phosphor + off-edge rim pins)
    const visibleHostiles = [];
    const rimHostileCandidates = [];
    const hostileCells = new Set();
    const selectedHostile = targetId != null ? hostile.find((m) => m.entity?.id === targetId) : null;
    const orderedHostiles = selectedHostile
      ? [selectedHostile, ...hostile.filter((m) => m !== selectedHostile)]
      : hostile;

    for (let i = 0; i < orderedHostiles.length; i += 1) {
      const mark = orderedHostiles[i];
      const entity = mark && mark.entity;
      if (!entity || !entity.pos) continue;
      const at = project(entity.pos.x, entity.pos.z);
      const distW = Math.sqrt(mark.distanceSq || 0);
      const selected = entity.id === targetId;
      if (!pointInsideChamfer(at.x, at.y, width, height, 10, cut)) {
        rimHostileCandidates.push({ entity, at, distW, selected });
        continue;
      }
      const role = classifyContactRole(entity);
      const isBoss = role === 'boss';
      const cell = `${Math.floor(at.x / 10)}:${Math.floor(at.y / 10)}`;
      if (!selected && !isBoss && (hostileCells.size >= 24 || hostileCells.has(cell))) continue;
      hostileCells.add(cell);

      const color = colorOf ? colorOf(entity) : TACTICAL_MAP_PALETTE.hostile;
      const fresh = sweepFreshness(at.x, at.y);
      const alpha = (selected || isBoss ? 0.96 : 0.78) + 0.22 * fresh;

      // Velocity tail showing direction of travel
      const vel = entity.vel;
      if (vel) {
        const speed = Math.hypot(vel.x || 0, vel.z || 0);
        if (speed >= VELOCITY_MIN_SPEED) {
          const tailPx = clamp(speed * scale * 1.15, 7, 20);
          drawVelocityTail(ctx, at.x, at.y, -(vel.x / speed) * tailPx, -(vel.z / speed) * tailPx, color, alpha);
        }
      }

      if (fresh > 0.16 || selected || isBoss) {
        drawHalo(ctx, at.x, at.y, isBoss ? 16 : selected ? 13 : 10, hexToRgb(color), isBoss ? 0.34 : selected ? 0.30 : fresh * 0.28);
      }
      noteArrival(entity.id, at.x, at.y, color);

      const worldHeading = Number.isFinite(entity.rot)
        ? entity.rot
        : (vel && Math.hypot(vel.x || 0, vel.z || 0) > 1e-3 ? Math.atan2(vel.z, vel.x) : 0);
      drawRoleGlyph(ctx, role, 'hostile', at.x, at.y, worldHeading - Math.PI / 2 + rotation, {
        color,
        alpha,
        selected,
      });

      if (selected) {
        ctx.save();
        ctx.strokeStyle = '#f2f7f9';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.arc(at.x, at.y, isBoss ? 12.5 : 9.5, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
      visibleHostiles.push({ x: at.x - cx, y: at.y - cy });
      registerHoverable(entity, role, at.x, at.y, color, distW);
    }

    // Add off-range hostiles collected beyond the sensor radius
    for (let i = 0; i < offRangeHostiles.length; i += 1) {
      const entity = offRangeHostiles[i];
      if (!entity || !entity.pos) continue;
      const at = project(entity.pos.x, entity.pos.z);
      const distW = distance2d(player.pos, entity.pos);
      rimHostileCandidates.push({ entity, at, distW, selected: entity.id === targetId });
    }

    // Lead aim crosshair for selected target when ballistic intercept exists
    if (leadAimPos && targetId != null && !blind) {
      const lp = project(leadAimPos.x, leadAimPos.z);
      if (pointInsideChamfer(lp.x, lp.y, width, height, 8, cut)) {
        ctx.save();
        ctx.strokeStyle = COLOR_COURSE;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(lp.x - 3.5, lp.y); ctx.lineTo(lp.x + 3.5, lp.y);
        ctx.moveTo(lp.x, lp.y - 3.5); ctx.lineTo(lp.x, lp.y + 3.5);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 10. Player ship at center + velocity vector
    const pVel = player.vel || { x: 0, z: 0 };
    const pSpeed = Math.hypot(pVel.x || 0, pVel.z || 0);
    const pTailPx = pSpeed >= VELOCITY_MIN_SPEED ? clamp(pSpeed * scale * 0.85, 6, 16) : 0;
    const pVelX = pTailPx ? -(pVel.x / pSpeed) * pTailPx : 0;
    const pVelY = pTailPx ? -(pVel.z / pSpeed) * pTailPx : 0;
    drawPlayerShip(ctx, cx, cy, (Number(player.rot) || 0) - Math.PI / 2 + rotation, pVelX, pVelY, width > 335 ? 1.1 : 0.96);

    // 11. Rim pins (sized by how close they are) + Objective bearing notch
    // Off-edge infrastructure pins
    const usedInfraAngles = [];
    offEdgeInfra.sort((a, b) => a.distW - b.distW);
    for (let i = 0; i < offEdgeInfra.length && usedInfraAngles.length < 4; i += 1) {
      const item = offEdgeInfra[i];
      const dx = item.at.x - cx;
      const dy = item.at.y - cy;
      if (Math.hypot(dx, dy) < 1e-3) continue;
      const ang = Math.atan2(dy, dx);
      if (usedInfraAngles.some((a) => Math.abs(Math.atan2(Math.sin(ang - a), Math.cos(ang - a))) < 0.22)) continue;
      usedInfraAngles.push(ang);
      const rimPt = intersectChamferRim(cx, cy, dx, dy, width, height, 8, cut);
      const closeness = clamp(1 - Math.max(0, item.distW - range) / (range * 2.5), 0.35, 1.0);
      drawOffEdgeRimPin(ctx, rimPt, item.role, item.color, closeness, item.entity.id === targetId);
      registerHoverable(item.entity, item.role, rimPt.x, rimPt.y, item.color, item.distW);
    }

    // Off-edge hostile pins (sized by closeness)
    rimHostileCandidates.sort((a, b) => Number(b.selected) - Number(a.selected) || a.distW - b.distW);
    let edgeBearing = null;
    const usedHostileAngles = [];
    for (let i = 0; i < rimHostileCandidates.length && usedHostileAngles.length < MAX_RIM_HOSTILES; i += 1) {
      const item = rimHostileCandidates[i];
      const dx = item.at.x - cx;
      const dy = item.at.y - cy;
      if (Math.hypot(dx, dy) < 1e-3) continue;
      const ang = Math.atan2(dy, dx);
      if (!item.selected && usedHostileAngles.some((a) => Math.abs(Math.atan2(Math.sin(ang - a), Math.cos(ang - a))) < 0.18)) continue;
      usedHostileAngles.push(ang);
      const rimPt = intersectChamferRim(cx, cy, dx, dy, width, height, 7.5, cut);
      const closeness = clamp(1 - Math.max(0, item.distW - range) / (range * 2.5), 0.35, 1.0);
      const color = colorOf ? colorOf(item.entity) : TACTICAL_MAP_PALETTE.hostile;
      drawOffEdgeRimPin(ctx, rimPt, 'hostile', color, closeness, item.selected);
      if (!edgeBearing) edgeBearing = { x: dx, y: dy };
      registerHoverable(item.entity, classifyContactRole(item.entity), rimPt.x, rimPt.y, color, item.distW);
    }

    // Objective marker & bright rim bearing notch
    let objectiveAnchor = null;
    let objectiveText = '';
    if (target) {
      const projT = project(target.x, target.z);
      const dx = projT.x - cx;
      const dy = projT.y - cy;
      const distPx = Math.hypot(dx, dy);
      const distWorld = distance2d(player.pos, target);
      const onChart = pointInsideChamfer(projT.x, projT.y, width, height, 13, cut);
      const rimPt = distPx > 1e-3
        ? intersectChamferRim(cx, cy, dx, dy, width, height, 6.5, cut)
        : { x: cx, y: 10, angle: -Math.PI / 2 };

      // Subtle dashed amber course corridor from ship to objective/rim
      const lineEnd = onChart ? projT : rimPt;
      const lineLen = Math.hypot(lineEnd.x - cx, lineEnd.y - cy);
      if (lineLen > 24) {
        ctx.save();
        ctx.strokeStyle = COLOR_COURSE;
        ctx.globalAlpha = onChart ? 0.66 : 0.44;
        ctx.lineWidth = 1.35;
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.moveTo(cx + (dx / distPx) * 14, cy + (dy / distPx) * 14);
        ctx.lineTo(lineEnd.x - (dx / distPx) * 10, lineEnd.y - (dy / distPx) * 10);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // Bright amber bearing notch on the rim ALWAYS when objective is off-edge (and subtle rim pip when on-chart)
      if (!onChart) {
        drawHalo(ctx, rimPt.x, rimPt.y, 13, hexToRgb(COLOR_COURSE), 0.34);
        drawObjectiveRimNotch(ctx, rimPt, COLOR_COURSE);
        objectiveAnchor = rimPt;
      } else {
        const pulse = reducedMotion ? 0 : 0.5 + 0.5 * Math.sin(nowMs * 0.0042);
        drawHalo(ctx, projT.x, projT.y, 15, hexToRgb(COLOR_COURSE), 0.28);
        drawOnChartObjective(ctx, projT.x, projT.y, pulse);
        // Subtle bearing notch on the rim pointing to the on-chart objective too
        if (distPx > 18) {
          ctx.save();
          ctx.translate(rimPt.x, rimPt.y);
          ctx.rotate(rimPt.angle);
          ctx.fillStyle = COLOR_COURSE;
          ctx.globalAlpha = 0.72;
          ctx.beginPath();
          ctx.moveTo(4.5, 0); ctx.lineTo(-2.5, -3.5); ctx.lineTo(-2.5, 3.5); ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        objectiveAnchor = projT;
      }

      const cleanTitle = sanitizeMapLabel(objective?.label || 'Objective', 16);
      const distStr = formatMinimapDistance(distWorld);
      objectiveText = distStr ? `${cleanTitle} · ${distStr}` : cleanTitle;
    }

    // 12. Directional hull-hit rim flashes
    for (let i = hitFlashes.length - 1; i >= 0; i -= 1) {
      const hit = hitFlashes[i];
      const age = nowMs - hit.atMs;
      if (age < 0 || age > HIT_FLASH_MS) {
        hitFlashes.splice(i, 1);
        continue;
      }
      const intensity = Math.pow(1 - age / HIT_FLASH_MS, 1.55) * hit.strength;
      drawHitRimFlash(ctx, cx, cy, width, height, hit.angle, intensity, hit.layer, cut, reducedMotion || reduceFlash);
    }

    // 13. Words ONLY where needed: Objective + one Hovered/Selected contact (min 12px, collision-solved!)
    occupiedRects.length = 0;
    // Reserve: center player hull, top-center North mark, bottom-right range numeral, top-left blind banner
    occupiedRects.push(
      { x: cx - 15, y: cy - 15, w: 30, h: 30 },
      { x: width * 0.5 - 16, y: 2, w: 32, h: 24 },
      { x: width - 78, y: height - 26, w: 72, h: 22 },
    );
    if (blind) occupiedRects.push({ x: 10, y: 6, w: 124, h: 20 });

    const drawSmartLabel = (text, anchor, color, { tagged = false, markRadius = 10 } = {}) => {
      if (!text || !anchor) return false;
      const font = canvasFont(tagged ? 650 : 540, 12, 'read');
      const memoKey = `${tagged ? 1 : 0}|${text}`;
      let tw = textWidthMemo.get(memoKey);
      if (tw === undefined) {
        ctx.font = font;
        tw = ctx.measureText(text).width;
        if (textWidthMemo.size >= 64) textWidthMemo.clear();
        textWidthMemo.set(memoKey, tw);
      }
      const padX = tagged ? 7 : 4;
      const boxH = tagged ? 20 : 17;
      const boxW = tw + padX * 2;
      const placed = solveMinimapLabelPlacement(anchor, boxW, boxH, occupiedRects, {
        width,
        height,
        margin: 8,
        chamfer: cut,
        markRadius,
      });
      if (!placed) return false;

      ctx.save();
      if (tagged) {
        const { x, y, w, h } = placed;
        const c = 4;
        ctx.beginPath();
        ctx.moveTo(x + c, y); ctx.lineTo(x + w - c, y); ctx.lineTo(x + w, y + c);
        ctx.lineTo(x + w, y + h - c); ctx.lineTo(x + w - c, y + h);
        ctx.lineTo(x + c, y + h); ctx.lineTo(x, y + h - c); ctx.lineTo(x, y + c);
        ctx.closePath();
        ctx.fillStyle = 'rgba(9, 22, 32, 0.94)';
        ctx.fill();
        ctx.strokeStyle = COLOR_COURSE;
        ctx.lineWidth = 1.05;
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(7, 18, 28, 0.84)';
        ctx.fillRect(placed.x, placed.y, placed.w, placed.h);
      }
      ctx.font = canvasFont(tagged ? 650 : 540, 12, 'read');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(4, 12, 18, 0.92)';
      ctx.lineWidth = 2.4;
      ctx.strokeText(text, placed.x + padX, placed.y + placed.h * 0.5 + 0.5);
      ctx.fillStyle = color;
      ctx.fillText(text, placed.x + padX, placed.y + placed.h * 0.5 + 0.5);
      ctx.restore();
      return true;
    };

    // Label priority 1: Objective
    if (objectiveAnchor && objectiveText) {
      drawSmartLabel(objectiveText, objectiveAnchor, COLOR_COURSE, { tagged: true, markRadius: 11 });
    }

    // Label priority 2: ONE contact under cursor OR selected target
    let focusContact = null;
    if (hoverActive) {
      let bestD = HOVER_HIT_RADIUS_PX;
      for (let i = 0; i < hoverTargets.length; i += 1) {
        const cand = hoverTargets[i];
        const d = Math.hypot(cand.x - hoverX, cand.y - hoverY);
        if (d <= bestD) {
          bestD = d;
          focusContact = cand;
        }
      }
    }
    if (!focusContact && targetId != null) {
      for (let i = 0; i < hoverTargets.length; i += 1) {
        if (hoverTargets[i].entity?.id === targetId) {
          focusContact = hoverTargets[i];
          break;
        }
      }
    }
    if (focusContact) {
      const sameAsObjective = !hoverActive && objectiveAnchor
        && Math.hypot(focusContact.x - objectiveAnchor.x, focusContact.y - objectiveAnchor.y) < 18;
      // Hover focus corner ticks on hovered contact
      if (hoverActive) {
        ctx.save();
        ctx.strokeStyle = COLOR_ICE;
        ctx.lineWidth = 1.1;
        const r = 10;
        const a = 3.5;
        const fx = focusContact.x;
        const fy = focusContact.y;
        ctx.beginPath();
        ctx.moveTo(fx - r, fy - r + a); ctx.lineTo(fx - r, fy - r); ctx.lineTo(fx - r + a, fy - r);
        ctx.moveTo(fx + r - a, fy - r); ctx.lineTo(fx + r, fy - r); ctx.lineTo(fx + r, fy - r + a);
        ctx.moveTo(fx - r, fy + r - a); ctx.lineTo(fx - r, fy + r); ctx.lineTo(fx - r + a, fy + r);
        ctx.moveTo(fx + r - a, fy + r); ctx.lineTo(fx + r, fy + r); ctx.lineTo(fx + r, fy + r - a);
        ctx.stroke();
        ctx.restore();
      }
      if (!sameAsObjective) {
        const name = contactDisplayName(focusContact.entity, focusContact.role);
        const distStr = formatMinimapDistance(focusContact.distWorld);
        const focusLabel = distStr ? `${name} · ${distStr}` : name;
        drawSmartLabel(focusLabel, focusContact, COLOR_FRAME_INK, { tagged: false, markRadius: 11 });
      }
    }

    ctx.restore(); // end interior clip

    // Crisp outer chamfer bezel & visor corner accents
    drawFrameBezel(ctx, width, height, cut);

    drawCalls += 1;
    if (t0 > 0) {
      const elapsed = performance.now() - t0;
      drawCostSamples.push(elapsed);
      if (drawCostSamples.length > 120) drawCostSamples.shift();
      if (drawCalls > 2) {
        steadyCostSamples.push(elapsed);
        if (steadyCostSamples.length > 120) steadyCostSamples.shift();
      }
    }

    return {
      namedPort,
      market,
      wreck: firstWreck,
      visibleHostiles,
      edgeBearing,
      target,
    };
  }

  function findCourse(event) {
    if (!projection) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = ((event.clientX - rect.left) * width) / rect.width;
    const y = ((event.clientY - rect.top) * height) / rect.height;
    let best = null;
    let bestDistance = 14;
    for (const course of pickedCourses) {
      const at = projection(course.pos.x, course.pos.z);
      const d = Math.hypot(at.x - x, at.y - y);
      if (pointInsideChamfer(at.x, at.y, width, height, 6) && d <= bestDistance) {
        best = course;
        bestDistance = d;
      }
    }
    return best;
  }

  function getStats() {
    const summarize = (arr) => {
      const sorted = arr.slice().sort((a, b) => a - b);
      const avg = sorted.length ? sorted.reduce((s, v) => s + v, 0) / sorted.length : 0;
      const p50 = sorted.length ? sorted[Math.floor(sorted.length * 0.5)] : 0;
      const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;
      return {
        avgMs: Math.round(avg * 1000) / 1000,
        p50Ms: Math.round(p50 * 1000) / 1000,
        p95Ms: Math.round(p95 * 1000) / 1000,
      };
    };
    const all = summarize(drawCostSamples);
    const steady = summarize(steadyCostSamples);
    return {
      drawCalls,
      staticRebuilds,
      roomRebuilds,
      avgMs: all.avgMs,
      p50Ms: all.p50Ms,
      p95Ms: all.p95Ms,
      steadyAvgMs: steady.avgMs,
      steadyP50Ms: steady.p50Ms,
      steadyP95Ms: steady.p95Ms,
      width,
      height,
    };
  }

  return {
    canvas,
    paint,
    recordHit,
    resetSector,
    findCourse,
    getStats,
    dispose() {
      observer?.disconnect();
      if (typeof canvas.removeEventListener === 'function') {
        canvas.removeEventListener('pointerenter', onPointerEnter);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerleave', onPointerLeave);
      }
    },
  };
}
