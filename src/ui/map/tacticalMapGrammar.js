import { canvasFont } from '../canvasFonts.js';
import { ENEMY_TYPES } from '../../data/enemies.js';
import { PACK_ARCHETYPES } from '../../data/packArchetypes.js';
import { SHIPS } from '../../data/ships.js';

const ENEMY_DEF_BY_ID = new Map(ENEMY_TYPES.map((row) => [row.id, row]));
const SHIP_ROLE_BY_ID = new Map(SHIPS.map((row) => [row.id, String(row.role || '').toLowerCase()]));

export const CONTACT_ROLE_GLYPHS = Object.freeze({
  light_fighter: Object.freeze({ id: 'light_fighter', label: 'Fighter', directional: true, size: 1.0 }),
  heavy: Object.freeze({ id: 'heavy', label: 'Heavy', directional: true, size: 1.08 }),
  support: Object.freeze({ id: 'support', label: 'Support', directional: true, size: 1.05 }),
  sniper: Object.freeze({ id: 'sniper', label: 'Sniper', directional: true, size: 1.05 }),
  rammer: Object.freeze({ id: 'rammer', label: 'Rammer', directional: true, size: 1.04 }),
  minelayer: Object.freeze({ id: 'minelayer', label: 'Minelayer', directional: true, size: 1.05 }),
  boss: Object.freeze({ id: 'boss', label: 'Boss', directional: true, size: 1.25 }),
  civilian: Object.freeze({ id: 'civilian', label: 'Civilian', directional: true, size: 1.0 }),
  station: Object.freeze({ id: 'station', label: 'Station', directional: false, size: 1.0 }),
  gate: Object.freeze({ id: 'gate', label: 'Gate', directional: false, size: 1.0 }),
  loot: Object.freeze({ id: 'loot', label: 'Salvage', directional: false, size: 0.95 }),
  wreck: Object.freeze({ id: 'wreck', label: 'Wreck', directional: false, size: 1.0 }),
});

const CIVILIAN_ROLES = new Set([
  'hauler', 'freighter', 'heavy_hauler', 'ore_carrier', 'miner', 'mining', 'mining_barge',
  'tug', 'tender', 'trader', 'civilian', 'courier', 'rescue', 'surveyor', 'patrol', 'escort', 'explorer',
]);
const BOSS_ROLES = new Set(['boss', 'flagship', 'battlecruiser', 'dreadnought', 'capital', 'miniboss_capital']);
const SUPPORT_ROLES = new Set(['support', 'anchor', 'control', 'guardian', 'shield', 'shield_carrier', 'escort_screen']);
const SNIPER_ROLES = new Set(['sniper', 'reach', 'ranged', 'stalker', 'ranged_disengager', 'ranged_stalker']);
const RAMMER_ROLES = new Set(['rammer', 'kamikaze', 'detonator', 'detonator_run']);
const MINELAYER_ROLES = new Set(['minelayer', 'mine_layer', 'disruptor', 'mine_layer_wake']);
const HEAVY_ROLES = new Set(['heavy', 'brawler', 'gunship', 'corvette', 'brawler_commit', 'pack_pursuit', 'shield_breaker']);

/**
 * Resolve one of the 12 semantic contact glyph roles purely from authored enemy, pack, and ship
 * tables plus entity role metadata — never a hardcoded per-enemy-id switch.
 */
export function classifyContactRole(entity) {
  if (!entity || typeof entity !== 'object') return 'civilian';
  const type = entity.type;
  const data = entity.data || {};
  if (type === 'station') return data.isGate ? 'gate' : 'station';
  if (type === 'wreck') return 'wreck';
  if (type === 'pickup' || type === 'beacon' || type === 'payload' || type === 'cargo_pod') return 'loot';
  if (type !== 'ship' && type !== 'drone') return 'civilian';

  const enemyId = data.enemyTypeId || data.lootTableId || data.archetypeId || null;
  const enemyDef = enemyId ? ENEMY_DEF_BY_ID.get(enemyId) : null;
  const packDef = enemyId ? PACK_ARCHETYPES[enemyId] || null : null;
  const doctrine = String(
    data.combatDoctrineId
    || data.ai?.combatDoctrineId
    || packDef?.doctrineId
    || enemyDef?.combatDoctrineId
    || '',
  ).toLowerCase();
  const aiArch = String(
    data.ai?.archetype
    || data.aiArchetype
    || enemyDef?.aiArchetype
    || '',
  ).toLowerCase();
  const explicitRole = String(
    data.role
    || data.trafficRole
    || data.presentationRole
    || data.ai?.encounterRole
    || '',
  ).toLowerCase();
  const shipRole = SHIP_ROLE_BY_ID.get(data.defId || enemyDef?.shipId) || '';
  const shipClass = String(data.shipClass || enemyDef?.shipClass || '').toLowerCase();
  const mass = Number(entity.mass ?? data.mass ?? enemyDef?.mass) || 0;

  if (
    data.isBoss === true
    || data.encounterBoss != null
    || data.missionBoss != null
    || doctrine === 'capital_broadside'
    || BOSS_ROLES.has(aiArch)
    || BOSS_ROLES.has(shipClass)
    || BOSS_ROLES.has(explicitRole)
    || BOSS_ROLES.has(shipRole)
    || ((enemyDef?.weakPoint || enemyDef?.prowSurface) && mass >= 280)
  ) return 'boss';

  if (
    data.detonator
    || enemyDef?.detonator
    || packDef?.attack === 'ram_fuse'
    || RAMMER_ROLES.has(aiArch)
    || RAMMER_ROLES.has(doctrine)
    || RAMMER_ROLES.has(explicitRole)
  ) return 'rammer';

  if (
    MINELAYER_ROLES.has(doctrine)
    || MINELAYER_ROLES.has(explicitRole)
  ) return 'minelayer';

  if (
    SNIPER_ROLES.has(aiArch)
    || SNIPER_ROLES.has(doctrine)
    || SNIPER_ROLES.has(explicitRole)
  ) return 'sniper';

  if (
    data.fieldAnchor
    || enemyDef?.fieldAnchor
    || doctrine === 'escort_screen'
    || doctrine === 'field_anchor_controller'
    || doctrine === 'tether_control_raider'
    || packDef?.attack === 'gun_hold'
    || SUPPORT_ROLES.has(aiArch)
    || SUPPORT_ROLES.has(shipClass)
    || SUPPORT_ROLES.has(explicitRole)
  ) return 'support';

  if (
    aiArch === 'fleeing_trader'
    || aiArch === 'miner'
    || aiArch === 'trader'
    || CIVILIAN_ROLES.has(explicitRole)
    || (!enemyDef && CIVILIAN_ROLES.has(shipRole))
  ) return 'civilian';

  if (
    HEAVY_ROLES.has(doctrine)
    || HEAVY_ROLES.has(aiArch)
    || HEAVY_ROLES.has(explicitRole)
    || (shipClass === 'gunship' && (mass >= 55 || aiArch === 'brawler'))
    || (!enemyDef && HEAVY_ROLES.has(shipRole))
  ) return 'heavy';

  return 'light_fighter';
}

export function formatMinimapDistance(worldUnits) {
  const d = Number(worldUnits);
  if (!Number.isFinite(d) || d < 0) return '';
  if (d >= 1000) {
    const digits = d >= 10000 ? 0 : 1;
    return `${(d / 1000).toFixed(digits)} km`;
  }
  return `${Math.round(d)} m`;
}

/**
 * Draw one of the 12 semantic contact glyphs. Hostile, friendly, and neutral differ by BOTH colour
 * and shape/fill treatment so the scope reads clearly without colour:
 *   - hostile: solid filled silhouette + crisp dark edge
 *   - friendly: hollow outline + bright inner pip + small friendly base bar
 *   - neutral: thin quiet outline over dark core
 */
export function drawRoleGlyph(g, role, stance, x, y, screenAngle = 0, {
  color = TACTICAL_MAP_PALETTE.neutral,
  scale = 1,
  alpha = 1,
  selected = false,
  hovered = false,
  ground = '#091824',
} = {}) {
  if (!g) return;
  const meta = CONTACT_ROLE_GLYPHS[role] || CONTACT_ROLE_GLYPHS.light_fighter;
  const s = scale * meta.size;
  const isHostile = stance === 'hostile';
  const isFriendly = stance === 'friendly';

  g.save();
  g.translate(x, y);
  if (meta.directional && Number.isFinite(screenAngle)) g.rotate(screenAngle);
  g.scale(s, s);
  g.globalAlpha = Math.max(0, Math.min(1, alpha));
  g.lineJoin = 'round';
  g.lineCap = 'round';

  const darkEdge = 'rgba(4, 11, 18, 0.92)';
  const strokeW = (selected || hovered ? 1.55 : isFriendly ? 1.45 : isHostile ? 1.0 : 1.25) / s;

  const paintClosed = () => {
    if (isHostile) {
      g.fillStyle = color;
      g.strokeStyle = selected || hovered ? '#f4f8fa' : darkEdge;
      g.lineWidth = strokeW;
      g.fill();
      g.stroke();
    } else if (isFriendly) {
      g.fillStyle = ground;
      g.strokeStyle = color;
      g.lineWidth = strokeW;
      g.fill();
      g.stroke();
      // Distinct non-colour friendly channel: bright inner pip
      g.fillStyle = color;
      g.beginPath();
      g.arc(0, 0.2, 1.55, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillStyle = ground;
      g.strokeStyle = color;
      g.lineWidth = strokeW;
      g.fill();
      g.stroke();
    }
  };

  if (role === 'station') {
    g.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const px = Math.cos(a) * 6.0;
      const py = Math.sin(a) * 6.0;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.fillStyle = ground;
    g.strokeStyle = color;
    g.lineWidth = (selected || hovered ? 1.8 : 1.4) / s;
    g.fill();
    g.stroke();
    g.strokeStyle = color;
    g.lineWidth = 1.1 / s;
    g.strokeRect(-2.1, -2.1, 4.2, 4.2);
    g.fillStyle = color;
    g.fillRect(-0.8, -0.8, 1.6, 1.6);
  } else if (role === 'gate') {
    g.strokeStyle = color;
    g.lineWidth = (selected || hovered ? 1.9 : 1.55) / s;
    g.beginPath();
    g.arc(0, 0, 6.2, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 1.15 / s;
    g.beginPath();
    g.arc(0, 0, 2.9, 0, Math.PI * 2);
    g.moveTo(-6.2, 0); g.lineTo(-4.0, 0);
    g.moveTo(4.0, 0); g.lineTo(6.2, 0);
    g.moveTo(0, -6.2); g.lineTo(0, -4.0);
    g.moveTo(0, 4.0); g.lineTo(0, 6.2);
    g.stroke();
  } else if (role === 'loot') {
    g.beginPath();
    g.moveTo(0, -4.8);
    g.lineTo(1.5, -1.5);
    g.lineTo(4.8, 0);
    g.lineTo(1.5, 1.5);
    g.lineTo(0, 4.8);
    g.lineTo(-1.5, 1.5);
    g.lineTo(-4.8, 0);
    g.lineTo(-1.5, -1.5);
    g.closePath();
    g.fillStyle = color;
    g.strokeStyle = darkEdge;
    g.lineWidth = 0.85 / s;
    g.fill();
    g.stroke();
  } else if (role === 'wreck') {
    g.fillStyle = ground;
    g.strokeStyle = color;
    g.lineWidth = 1.3 / s;
    // Two broken angled hull shards separated by a fracture gap
    g.beginPath();
    g.moveTo(-5.5, 2.0); g.lineTo(-3.2, -3.4); g.lineTo(0.8, -2.2); g.lineTo(-1.2, 3.2); g.closePath();
    g.moveTo(1.4, -3.2); g.lineTo(5.6, -0.8); g.lineTo(4.0, 3.6); g.lineTo(0.2, 2.4); g.closePath();
    g.fill();
    g.stroke();
  } else if (role === 'boss') {
    g.beginPath();
    g.moveTo(0, -8.2);
    g.lineTo(4.4, -3.8);
    g.lineTo(7.8, 0.6);
    g.lineTo(4.6, 5.8);
    g.lineTo(0, 3.8);
    g.lineTo(-4.6, 5.8);
    g.lineTo(-7.8, 0.6);
    g.lineTo(-4.4, -3.8);
    g.closePath();
    paintClosed();
    // Inner reactor crown diamond + flanking command ticks
    g.fillStyle = isHostile ? '#fff3dd' : color;
    g.beginPath();
    g.moveTo(0, -2.6); g.lineTo(2.4, 0); g.lineTo(0, 2.6); g.lineTo(-2.4, 0); g.closePath();
    g.fill();
    g.strokeStyle = color;
    g.lineWidth = 1.15 / s;
    g.beginPath();
    g.moveTo(-9.4, -2.5); g.lineTo(-9.4, 2.5);
    g.moveTo(9.4, -2.5); g.lineTo(9.4, 2.5);
    g.stroke();
  } else if (role === 'heavy') {
    g.beginPath();
    g.moveTo(0, -5.8);
    g.lineTo(5.2, -1.8);
    g.lineTo(4.6, 4.8);
    g.lineTo(-4.6, 4.8);
    g.lineTo(-5.2, -1.8);
    g.closePath();
    paintClosed();
    // Armored bulkhead rib
    g.strokeStyle = isHostile ? darkEdge : color;
    g.lineWidth = 1.1 / s;
    g.beginPath();
    g.moveTo(-3.2, 1.0); g.lineTo(3.2, 1.0);
    g.stroke();
  } else if (role === 'support') {
    // Hexagonal carrier core + distinct curved forward shield-arc
    g.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const px = Math.cos(a) * 3.8;
      const py = Math.sin(a) * 3.8 + 0.8;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    paintClosed();
    // Forward shield crescent
    g.strokeStyle = isHostile ? '#ffb49a' : color;
    g.lineWidth = 1.65 / s;
    g.beginPath();
    g.arc(0, 0.2, 6.0, -Math.PI * 0.84, -Math.PI * 0.16);
    g.stroke();
  } else if (role === 'sniper') {
    // Elongated needle-lance with precision cross-bar stabilizer
    g.beginPath();
    g.moveTo(0, -7.8);
    g.lineTo(2.0, 0.8);
    g.lineTo(5.0, 2.0);
    g.lineTo(1.8, 3.2);
    g.lineTo(0, 5.4);
    g.lineTo(-1.8, 3.2);
    g.lineTo(-5.0, 2.0);
    g.lineTo(-2.0, 0.8);
    g.closePath();
    paintClosed();
  } else if (role === 'rammer') {
    // Twin-barbed warhead spear + hot fuse core
    g.beginPath();
    g.moveTo(0, -7.0);
    g.lineTo(4.8, -0.4);
    g.lineTo(2.4, 4.6);
    g.lineTo(0, 2.5);
    g.lineTo(-2.4, 4.6);
    g.lineTo(-4.8, -0.4);
    g.closePath();
    paintClosed();
    g.fillStyle = '#ffe59c';
    g.beginPath();
    g.arc(0, -1.2, 1.35, 0, Math.PI * 2);
    g.fill();
  } else if (role === 'minelayer') {
    // Notched trapezoid mine-rack hull with aft prongs
    g.beginPath();
    g.moveTo(-2.8, -4.6);
    g.lineTo(2.8, -4.6);
    g.lineTo(5.0, 2.0);
    g.lineTo(3.2, 2.0);
    g.lineTo(3.2, 4.8);
    g.lineTo(1.2, 4.8);
    g.lineTo(1.2, 2.2);
    g.lineTo(-1.2, 2.2);
    g.lineTo(-1.2, 4.8);
    g.lineTo(-3.2, 4.8);
    g.lineTo(-3.2, 2.0);
    g.lineTo(-5.0, 2.0);
    g.closePath();
    paintClosed();
    // Trailing mine pip
    g.fillStyle = isHostile ? '#ffb35c' : color;
    g.beginPath();
    g.arc(0, 4.4, 1.25, 0, Math.PI * 2);
    g.fill();
  } else if (role === 'civilian') {
    // Rounded freighter/utility capsule (blocky silhouette, distinct from combat craft)
    const w = 3.2;
    const h = 4.6;
    const r = 1.6;
    g.beginPath();
    g.moveTo(-w + r, -h);
    g.lineTo(w - r, -h);
    g.quadraticCurveTo(w, -h, w, -h + r);
    g.lineTo(w, h - r);
    g.quadraticCurveTo(w, h, w - r, h);
    g.lineTo(-w + r, h);
    g.quadraticCurveTo(-w, h, -w, h - r);
    g.lineTo(-w, -h + r);
    g.quadraticCurveTo(-w, -h, -w + r, -h);
    g.closePath();
    paintClosed();
    if (!isFriendly) {
      g.strokeStyle = isHostile ? darkEdge : color;
      g.lineWidth = 0.9 / s;
      g.beginPath();
      g.moveTo(-w + 0.8, -1.0); g.lineTo(w - 0.8, -1.0);
      g.moveTo(-w + 0.8, 1.8); g.lineTo(w - 0.8, 1.8);
      g.stroke();
    }
  } else {
    // light_fighter: sharp swept delta dart
    g.beginPath();
    g.moveTo(0, -5.6);
    g.lineTo(4.2, 4.0);
    g.lineTo(0, 1.5);
    g.lineTo(-4.2, 4.0);
    g.closePath();
    paintClosed();
  }

  g.restore();
}

/**
 * Deterministic collision-free label placement inside a chamfered minimap frame.
 * Returns `{ x, y, w, h }` and registers the placed rect in `occupiedRects`, or returns `null`
 * (dropping lower-priority labels rather than overlapping another label or the frame).
 */
export function solveMinimapLabelPlacement(anchor, labelW, labelH, occupiedRects, {
  width,
  height,
  margin = 8,
  chamfer = 14,
  markRadius = 8,
} = {}) {
  const w = Math.ceil(labelW);
  const h = Math.ceil(labelH);
  const gap = Math.max(8, markRadius + 5);
  const ax = Number(anchor && anchor.x);
  const ay = Number(anchor && anchor.y);
  if (!Number.isFinite(ax) || !Number.isFinite(ay) || !(width > 0) || !(height > 0)) return null;

  const preferLeft = ax > width * 0.52;
  const preferAbove = ay > height * 0.52;
  const clampNum = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  const insideChamfer = (x, y) => {
    if (x < margin || y < margin || x + w > width - margin || y + h > height - margin) return false;
    const cut = Math.max(0, chamfer - 2);
    if (cut <= 0) return true;
    const tl = x + y < cut + margin;
    const tr = (width - (x + w)) + y < cut + margin;
    const bl = x + (height - (y + h)) < cut + margin;
    const br = (width - (x + w)) + (height - (y + h)) < cut + margin;
    return !(tl || tr || bl || br);
  };

  const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const markerBox = { x: ax - markRadius, y: ay - markRadius, w: markRadius * 2, h: markRadius * 2 };

  // Direction pointing from anchor inward toward the minimap center (pulls rim-pinned labels cleanly inside).
  const inDx = width * 0.5 - ax;
  const inDy = height * 0.5 - ay;
  const inLen = Math.hypot(inDx, inDy);
  const inUx = inLen > 1e-3 ? inDx / inLen : 0;
  const inUy = inLen > 1e-3 ? inDy / inLen : 1;

  const candidates = [
    [ax + (preferLeft ? -w - gap : gap), ay - h / 2],
    [ax - w / 2, ay + (preferAbove ? -h - gap : gap)],
    [ax + (preferLeft ? gap : -w - gap), ay - h / 2],
    [ax - w / 2, ay + (preferAbove ? gap : -h - gap)],
    [ax + (preferLeft ? -w - gap * 0.65 : gap * 0.65), ay + (preferAbove ? -h - gap * 0.45 : gap * 0.45)],
    [ax + (preferLeft ? -w - gap * 0.65 : gap * 0.65), ay + (preferAbove ? gap * 0.45 : -h - gap * 0.45)],
  ];

  // Rim/corner fallback candidates: pull inward along the normal and clamp strictly inside bounds,
  // stepping vertically or horizontally if the top-center N mark or bottom-right range blocks the first slot.
  const minX = margin;
  const maxX = Math.max(margin, width - margin - w);
  const minY = margin;
  const maxY = Math.max(margin, height - margin - h);
  const pulledX = clampNum(ax + inUx * (gap + w * 0.35) - w * 0.5, minX, maxX);
  const pulledY = clampNum(ay + inUy * (gap + h * 0.55) - h * 0.5, minY, maxY);
  const edgeX = clampNum(preferLeft ? ax - w - 6 : ax + 6, minX, maxX);
  const edgeYBelow = clampNum(ay + gap + 4, minY, maxY);
  const edgeYAbove = clampNum(ay - h - gap - 4, minY, maxY);
  candidates.push(
    [pulledX, pulledY],
    [edgeX, preferAbove ? edgeYAbove : edgeYBelow],
    [clampNum(ax - w * 0.5, minX + chamfer, Math.max(minX + chamfer, maxX - chamfer)), preferAbove ? edgeYAbove : edgeYBelow],
    [clampNum(pulledX, minX, maxX), clampNum(pulledY + (preferAbove ? -(h + 8) : (h + 8)), minY, maxY)],
    [clampNum(edgeX, minX, maxX), clampNum((preferAbove ? edgeYAbove : edgeYBelow) + (preferAbove ? -(h + 8) : (h + 8)), minY, maxY)],
  );

  for (const [cx0, cy0] of candidates) {
    const rx = Math.round(cx0);
    const ry = Math.round(cy0);
    const box = { x: rx, y: ry, w, h };
    if (!insideChamfer(rx, ry)) continue;
    if (overlaps(box, markerBox)) continue;
    let collides = false;
    for (let i = 0; i < occupiedRects.length; i += 1) {
      if (overlaps(box, occupiedRects[i])) { collides = true; break; }
    }
    if (!collides) {
      occupiedRects.push(box);
      return box;
    }
  }
  return null;
}

// Shared semantic grammar for the always-on radar and the paused navigation chart.
//
// This module owns meaning, projection, and crisp glyph geometry — never simulation. Every primary
// identity uses at least two channels (shape plus fill/outline/weight), so hue is reinforcement
// rather than the only way to tell "me", "goal", "threat", and "infrastructure" apart.

export const TACTICAL_MAP_PALETTE = Object.freeze({
  /* Owner ruling 2026-10-03 (supersedes the 2026-09-18 one-accent register): the all-bone scope
     read as one wash — nothing was identifiable at a glance. Each contact class carries its own
     hue again, drawn from the accessibility semantic register so default and colorblind palettes
     agree. Shape still carries role; hue is the fast second channel, never the only one. The
     warm etched-plate ground, bone self-ink, amber lamp and red hostile lamp stay. */
  ground: '#0b0d10',
  groundPlate: 'rgba(11, 13, 16, 0.96)',
  ink: '#e8e2d4',
  inkDim: '#a9a696',
  /* Self is information, not a command: bone, told apart by its filled hull and brackets. The
     scope's only amber is the objective (and pickups, which the pilot flies to collect). */
  player: '#e8e2d4',
  objective: '#f2b950',
  hostile: '#ff5038',
  /* Dockable infrastructure: cyan hex = station (where you dock and trade). */
  station: '#6ec3d8',
  /* Jump infrastructure: quiet violet double ring, distinct from cyan and from the red lamp. */
  gate: '#a89ae0',
  /* Faction ships: the semantic friendly green (matches accessibility PALETTES.none). */
  friendly: '#4fbf8f',
  /* Unaligned small traffic: blue-grey, the semantic neutral — deliberately the quietest live mark. */
  neutral: '#9aa8bc',
  /* Unaligned traffic by trade (shape still carries the class; these hues are the fast tell apart):
     industrial hulls read sage, lawful hulls steel-blue. Both stay desaturated so the red lamp
     (threat) and the amber lamp (objective/Hand) keep their channels; stance still wins — a
     hostile freighter is red, an allied patrol is green. */
  worker: '#a8b09a',
  lawful: '#7fa8c4',
  /* Dead hulks: muted rust, salvage reading distinct from amber pickups and the red lamp. */
  wreck: '#c08a58',
  asteroid: '#4a5162',
});

export const TACTICAL_SYMBOLS = Object.freeze({
  player: Object.freeze({
    id: 'player', label: 'YOU', shape: 'asymmetric-hull', colour: TACTICAL_MAP_PALETTE.player,
    meaning: 'Your ship — the lit hull everything else is measured from.',
    channel: 'filled hull + white nose notch + centre brackets', priority: 100,
  }),
  objective: Object.freeze({
    id: 'objective', label: 'OBJECTIVE', shape: 'open-corner-bracket', colour: TACTICAL_MAP_PALETTE.objective,
    meaning: 'Your current goal — the amber bracket the game wants you at.',
    channel: 'four open corners + centre diamond + route corridor', priority: 95,
  }),
  hostile: Object.freeze({
    id: 'hostile', label: 'HOSTILE', shape: 'heading-chevron', colour: TACTICAL_MAP_PALETTE.hostile,
    meaning: 'Will attack you on sight — fight or keep your distance.',
    channel: 'filled directional chevron + selection ring + threat weight', priority: 80,
  }),
  station: Object.freeze({
    id: 'station', label: 'STATION', shape: 'berth-hex', colour: TACTICAL_MAP_PALETTE.station,
    meaning: 'Dock here to trade, refit, refuel and take contracts.',
    channel: 'flat-top hex + inset berth square', priority: 65,
  }),
  gate: Object.freeze({
    id: 'gate', label: 'GATE', shape: 'portal-double-ring', colour: TACTICAL_MAP_PALETTE.gate,
    meaning: 'Fly in to jump to the neighbouring sector it names.',
    channel: 'double ring + portal ticks', priority: 70,
  }),
  neutral: Object.freeze({
    id: 'neutral', label: 'CONTACT', shape: 'outline-hull', colour: TACTICAL_MAP_PALETTE.neutral,
    meaning: 'A nearby ship that is neither friend nor foe.',
    channel: 'outline heading hull', priority: 45,
  }),
  asteroid: Object.freeze({
    id: 'asteroid', label: 'ASTEROID', shape: 'micro-diamond', colour: TACTICAL_MAP_PALETTE.asteroid,
    meaning: 'Mineable rock — drill it for ore.',
    channel: 'small dim diamond', priority: 15,
  }),
});

export const MAP_LEGEND_ORDER = Object.freeze(['player', 'objective', 'hostile', 'station', 'gate']);

/**
 * Chart-only marks, for the map's key. The flight symbols above are shared with the radar; these
 * exist only on the chart, so they carry their own key glyph and a plain-language meaning each.
 * `meaning` is written as words a new pilot can act on, never as shape description.
 */
export const CHART_KEY_MARKS = Object.freeze([
  Object.freeze({
    id: 'mission-point', label: 'MISSION POINT', colour: TACTICAL_MAP_PALETTE.objective,
    meaning: 'A place or target your contract needs — visit it to advance the mission.',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none"/></svg>',
  }),
  Object.freeze({
    id: 'survey-site', label: 'SURVEY SITE', colour: TACTICAL_MAP_PALETTE.objective,
    meaning: 'Scan or sample here for a survey contract.',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="6"/><path d="M8 12h8M12 8v8"/></svg>',
  }),
  Object.freeze({
    id: 'holding', label: 'HOLDING', colour: '#c9b06a',
    meaning: 'A claimed patch of the belt — mineable, and its owner may defend it.',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 3l7 4v6.5L12 21l-7-7.5V7z"/></svg>',
  }),
  Object.freeze({
    id: 'zone', label: 'ZONE', colour: '#7fa8c4',
    meaning: 'A named region — an asteroid field, a patrol corridor, a hazard. Hover it for what it is.',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke-dasharray="3 3"/></svg>',
  }),
  Object.freeze({
    id: 'wreck', label: 'WRECK', colour: TACTICAL_MAP_PALETTE.wreck,
    meaning: 'A dead hull — salvage for cargo and parts.',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 15l7-8 9 3-4 8-7 1z"/><path d="M9 11l3 3"/></svg>',
  }),
]);

const COMPACT_METRICS = Object.freeze({ size: 208, center: 104, radius: 100 });
const EXPANDED_METRICS = Object.freeze({ size: 290, center: 145, radius: 141 });
const OBJECTIVE_EDGE_INSET = 15;

export function symbolDescriptor(kind) {
  return TACTICAL_SYMBOLS[kind] || TACTICAL_SYMBOLS.neutral;
}

export function tacticalRadarMetrics(expanded = false) {
  return expanded ? EXPANDED_METRICS : COMPACT_METRICS;
}

function finiteCoordinate(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function projectRadarPoint(playerPos, targetPos, range, metrics = COMPACT_METRICS, out = null) {
  if (!playerPos || !targetPos || !metrics) return null;
  const px = finiteCoordinate(playerPos.x);
  const pz = finiteCoordinate(playerPos.z);
  const tx = finiteCoordinate(targetPos.x);
  const tz = finiteCoordinate(targetPos.z);
  const safeRange = finiteCoordinate(range);
  if (px == null || pz == null || tx == null || tz == null || safeRange == null || safeRange <= 0) return null;

  const dx = tx - px;
  const dz = tz - pz;
  const distance = Math.hypot(dx, dz);
  const offRange = distance > safeRange;
  const angle = Math.atan2(-dz, -dx);
  const scale = metrics.radius / safeRange;
  const x = offRange
    ? metrics.center + Math.cos(angle) * metrics.radius
    : metrics.center - dx * scale;
  const y = offRange
    ? metrics.center + Math.sin(angle) * metrics.radius
    : metrics.center - dz * scale;
  // Optional out-param: radar.draw projects every contact each tick. Returning a fresh
  // Object.freeze({}) per call dominated radar alloc (cpu-profile-flight). One-shot callers
  // (tests, planObjectiveCue) still get a frozen object when out is omitted.
  if (out) {
    out.x = x;
    out.y = y;
    out.dx = dx;
    out.dz = dz;
    out.distance = distance;
    out.offRange = offRange;
    out.angle = angle;
    out.scale = scale;
    out.resolved = true;
    return out;
  }
  return Object.freeze({ x, y, dx, dz, distance, offRange, angle, scale, resolved: true });
}

export function objectiveCorridorMode({
  markerDistancePx = 0,
  hostileCount = 0,
  contactCount = 0,
  expanded = false,
} = {}) {
  if (markerDistancePx < 34) return 'none';
  if (expanded) return 'full';
  if (hostileCount >= 8 || contactCount >= 28) return 'terminal';
  if (hostileCount >= 4 || contactCount >= 16) return 'reduced';
  return 'full';
}

export function planObjectiveCue({
  playerPos,
  waypointPos,
  range,
  hostileCount = 0,
  contactCount = 0,
  expanded = false,
  label = 'OBJECTIVE',
} = {}) {
  const metrics = tacticalRadarMetrics(expanded);
  const projected = projectRadarPoint(playerPos, waypointPos, range, metrics);
  if (!projected) return null;

  // Projection itself reaches the range ring. The objective bracket is much larger than a contact
  // pip, so pin its centre inward rather than clipping its corners against the canvas edge.
  const edgeRadius = Math.max(1, metrics.radius - OBJECTIVE_EDGE_INSET);
  const x = projected.offRange
    ? metrics.center + Math.cos(projected.angle) * edgeRadius
    : projected.x;
  const y = projected.offRange
    ? metrics.center + Math.sin(projected.angle) * edgeRadius
    : projected.y;
  const vx = x - metrics.center;
  const vy = y - metrics.center;
  const markerDistancePx = Math.hypot(vx, vy);
  const ux = markerDistancePx > 1e-6 ? vx / markerDistancePx : 0;
  const uy = markerDistancePx > 1e-6 ? vy / markerDistancePx : -1;
  const markerClearance = projected.offRange ? 14 : 18;
  const startClearance = 20;
  const start = Object.freeze({
    x: metrics.center + ux * startClearance,
    y: metrics.center + uy * startClearance,
  });
  const end = Object.freeze({
    x: x - ux * markerClearance,
    y: y - uy * markerClearance,
  });
  return Object.freeze({
    ...projected,
    x,
    y,
    metrics,
    label: sanitizeMapLabel(label),
    markerDistancePx,
    corridorMode: objectiveCorridorMode({
      markerDistancePx,
      hostileCount,
      contactCount,
      expanded,
    }),
    start,
    end,
  });
}

/**
 * Cross-sector and not-yet-materialized objectives still need a stable identity. Put the bracket
 * at the north reference, explicitly mark it unresolved, and omit the corridor rather than drawing
 * a fake bearing or silently falling back to the legacy yellow diamond.
 */
export function planUnresolvedObjectiveCue({
  expanded = false,
  label = 'OBJECTIVE',
} = {}) {
  const metrics = tacticalRadarMetrics(expanded);
  return Object.freeze({
    x: metrics.center,
    y: metrics.center - metrics.radius + 18,
    dx: 0,
    dz: 0,
    distance: null,
    offRange: true,
    angle: -Math.PI / 2,
    scale: 0,
    resolved: false,
    metrics,
    label: sanitizeMapLabel(label),
    markerDistancePx: metrics.radius - 18,
    corridorMode: 'none',
    start: Object.freeze({ x: metrics.center, y: metrics.center - 20 }),
    end: Object.freeze({ x: metrics.center, y: metrics.center - metrics.radius + 32 }),
  });
}

export function sanitizeMapLabel(value, max = 22) {
  const text = String(value || 'OBJECTIVE').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!text) return 'OBJECTIVE';
  const limit = Math.max(4, max | 0);
  if (text.length <= limit) return text;
  // Never slice mid-word (e.g. "TALA ROOK · RECEIVIN"): if a compound separator (' · ' or ' — ')
  // precedes the overflow, keep the primary name; otherwise break at the last word boundary.
  const sepIdx = text.indexOf(' · ');
  if (sepIdx >= 4 && sepIdx <= limit) {
    const rest = text.slice(0, limit);
    const lastSpace = rest.lastIndexOf(' ');
    if (lastSpace > sepIdx + 2) return rest.slice(0, lastSpace).replace(/[\s·—-]+$/, '');
    return text.slice(0, sepIdx);
  }
  const clipped = text.slice(0, limit);
  const wordBreak = clipped.lastIndexOf(' ');
  return (wordBreak >= 4 ? clipped.slice(0, wordBreak) : clipped).replace(/[\s·—-]+$/, '');
}

export function formatRadarDistance(worldUnits) {
  const d = Number(worldUnits);
  if (!Number.isFinite(d) || d < 0) return 'ROUTE PENDING';
  if (d >= 1000) {
    const digits = d >= 10000 ? 0 : 1;
    return `${(d / 1000).toFixed(digits)} km`;
  }
  return `${Math.round(d)} m`;
}

export function relativeLuminance(hex) {
  const rgb = parseHex(hex);
  const linear = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

export function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

function parseHex(hex) {
  const raw = String(hex || '').trim().replace(/^#/, '');
  const normalized = raw.length === 3
    ? raw.split('').map((c) => c + c).join('')
    : raw.padEnd(6, '0').slice(0, 6);
  const value = Number.parseInt(normalized, 16);
  if (!Number.isFinite(value)) return [0, 0, 0];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function drawObjectiveCorridor(g, cue) {
  if (!g || !cue || cue.corridorMode === 'none') return;
  const { start, end, corridorMode } = cue;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 2) return;
  const ux = dx / length;
  const uy = dy / length;

  g.save();
  g.strokeStyle = TACTICAL_MAP_PALETTE.objective;
  g.lineWidth = corridorMode === 'full' ? 1.75 : 1.4;
  g.globalAlpha = corridorMode === 'full' ? 0.85 : 0.62;
  g.setLineDash([3, 6]);
  g.lineDashOffset = 0;

  if (corridorMode === 'full') {
    g.beginPath();
    g.moveTo(start.x, start.y);
    g.lineTo(end.x, end.y);
    g.stroke();
  } else {
    const head = corridorMode === 'terminal' ? 0 : Math.min(28, length * 0.28);
    if (head > 0) {
      g.beginPath();
      g.moveTo(start.x, start.y);
      g.lineTo(start.x + ux * head, start.y + uy * head);
      g.stroke();
    }
    const tail = Math.min(corridorMode === 'terminal' ? 24 : 34, length);
    g.beginPath();
    g.moveTo(end.x - ux * tail, end.y - uy * tail);
    g.lineTo(end.x, end.y);
    g.stroke();
  }
  g.setLineDash([]);
  g.restore();
}

export function drawPlayerHull(g, x, y, rotation = 0, { label = true } = {}) {
  if (!g) return;
  g.save();
  g.translate(x, y);
  g.rotate(Math.PI + (Number(rotation) || 0));
  g.fillStyle = TACTICAL_MAP_PALETTE.player;
  g.strokeStyle = TACTICAL_MAP_PALETTE.ink;
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(11, 0);
  g.lineTo(1.5, -7.5);
  g.lineTo(-8, -4.5);
  g.lineTo(-4.4, 0);
  g.lineTo(-8, 4.5);
  g.lineTo(1.5, 7.5);
  g.closePath();
  g.fill();
  g.stroke();

  // The nose notch is cut to the ground: self keeps a second channel (shape) in monochrome, and a
  // bone notch on a bone hull (the deckplate player) would not read at all.
  g.fillStyle = TACTICAL_MAP_PALETTE.ground;
  g.beginPath();
  g.moveTo(11, 0);
  g.lineTo(5.2, -2.2);
  g.lineTo(5.2, 2.2);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(232,226,212,0.72)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(-8.8, 0);
  g.lineTo(-13, 0);
  g.stroke();
  g.restore();

  // Non-rotating centre brackets make self-location instantaneous while the hull turns.
  g.save();
  g.strokeStyle = 'rgba(232,226,212,0.78)';
  g.lineWidth = 1.25;
  drawOpenCorners(g, x, y, 22, 5.5);
  if (label) {
    g.font = canvasFont(700, 12, 'data');
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.fillStyle = TACTICAL_MAP_PALETTE.ink;
    g.fillText('YOU', x, y + 18);
  }
  g.restore();
}

export function drawObjectiveBracket(g, x, y, {
  offRange = false,
  unresolved = false,
  angle = 0,
  pulse = 0,
} = {}) {
  if (!g) return;
  g.save();
  g.translate(x, y);
  if (offRange && !unresolved) g.rotate(angle);
  g.fillStyle = TACTICAL_MAP_PALETTE.groundPlate;
  g.beginPath();
  g.arc(0, 0, offRange ? 12 : 14, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = TACTICAL_MAP_PALETTE.objective;
  g.lineWidth = 2.1;
  if (offRange && !unresolved) {
    g.beginPath();
    g.moveTo(-6.5, -6);
    g.lineTo(7, 0);
    g.lineTo(-6.5, 6);
    g.stroke();
    g.beginPath();
    g.moveTo(-10.5, -8.5); g.lineTo(-4, -8.5);
    g.moveTo(-10.5, 8.5); g.lineTo(-4, 8.5);
    g.stroke();
  } else {
    drawOpenCorners(g, 0, 0, 12, 5.5);
    g.fillStyle = unresolved ? TACTICAL_MAP_PALETTE.groundPlate : TACTICAL_MAP_PALETTE.objective;
    g.beginPath();
    g.moveTo(0, -4.5);
    g.lineTo(4.5, 0);
    g.lineTo(0, 4.5);
    g.lineTo(-4.5, 0);
    g.closePath();
    g.fill();
    g.stroke();
    if (!unresolved) {
      g.fillStyle = TACTICAL_MAP_PALETTE.ink;
      g.fillRect(-1, -1, 2, 2);
    } else {
      g.font = canvasFont(700, 12, 'data');
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = TACTICAL_MAP_PALETTE.objective;
      g.fillText('?', 0, 0.5);
    }
  }
  if (pulse > 0) {
    g.globalAlpha = 0.25 + pulse * 0.25;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, 0, 16 + pulse * 3, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
}

export function drawHostileGlyph(g, x, y, heading = null, {
  selected = false,
  capital = false,
} = {}) {
  if (!g) return;
  const scale = capital ? 1.35 : 1;
  g.save();
  g.translate(x, y);
  if (Number.isFinite(heading)) g.rotate(Math.PI + heading);
  // Threats are always filled: a dark outline chevron disappears against a busy dial, and "can I
  // see the danger" is the radar's primary job. Selection is carried by the target ring, so the
  // glyph itself only needs a thin dark edge to stay crisp over bright scene bleed at the rim.
  g.fillStyle = TACTICAL_MAP_PALETTE.hostile;
  g.strokeStyle = selected ? TACTICAL_MAP_PALETTE.ink : 'rgba(5,12,16,0.85)';
  g.lineWidth = selected ? 1.4 : 1;
  g.beginPath();
  g.moveTo(0, -5.2 * scale);
  g.lineTo(4.2 * scale, 4 * scale);
  g.lineTo(0, 1.6 * scale);
  g.lineTo(-4.2 * scale, 4 * scale);
  g.closePath();
  g.fill();
  g.stroke();
  if (capital) {
    g.globalAlpha = 0.7;
    g.strokeStyle = TACTICAL_MAP_PALETTE.hostile;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, -8.4);
    g.lineTo(5.8, 5.5);
    g.lineTo(-5.8, 5.5);
    g.closePath();
    g.stroke();
  }
  g.restore();
}

export function drawStationGlyph(g, x, y, { offRange = false, angle = 0 } = {}) {
  if (!g) return;
  g.save();
  g.translate(x, y);
  if (offRange) g.rotate(angle);
  g.strokeStyle = TACTICAL_MAP_PALETTE.ink;
  g.fillStyle = TACTICAL_MAP_PALETTE.station;
  g.lineWidth = 1.2;
  const r = offRange ? 4.5 : 6.5;
  g.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const a = Math.PI / 3 * i - Math.PI / 6;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = TACTICAL_MAP_PALETTE.ground;
  g.fillRect(-1.8, -1.8, 3.6, 3.6);
  if (offRange) {
    // The mark centre sits on the range ring. Its bearing tick points inward so it cannot clip off
    // the canvas while the hex still reads as persistent infrastructure rather than a chevron.
    g.strokeStyle = TACTICAL_MAP_PALETTE.station;
    g.beginPath();
    g.moveTo(-r - 5, 0);
    g.lineTo(-r - 1, 0);
    g.stroke();
  }
  g.restore();
}

export function drawGateGlyph(g, x, y, { offRange = false, angle = 0 } = {}) {
  if (!g) return;
  g.save();
  g.translate(x, y);
  if (offRange) g.rotate(angle);
  g.strokeStyle = TACTICAL_MAP_PALETTE.gate;
  g.lineWidth = 1.8;
  const outer = offRange ? 4.5 : 7;
  g.beginPath();
  g.arc(0, 0, outer, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 1.2;
  g.beginPath();
  g.arc(0, 0, outer * 0.48, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.moveTo(-2, -outer); g.lineTo(-2, -outer + 2.5);
  g.moveTo(2, -outer); g.lineTo(2, -outer + 2.5);
  g.moveTo(-2, outer - 2.5); g.lineTo(-2, outer);
  g.moveTo(2, outer - 2.5); g.lineTo(2, outer);
  if (offRange) {
    g.moveTo(-outer - 5, 0);
    g.lineTo(-outer - 1, 0);
  }
  g.stroke();
  g.restore();
}

function drawOpenCorners(g, x, y, radius, arm) {
  const r = Math.max(2, Number(radius) || 2);
  const a = Math.max(1, Number(arm) || 1);
  g.beginPath();
  g.moveTo(x - r, y - r + a); g.lineTo(x - r, y - r); g.lineTo(x - r + a, y - r);
  g.moveTo(x + r - a, y - r); g.lineTo(x + r, y - r); g.lineTo(x + r, y - r + a);
  g.moveTo(x - r, y + r - a); g.lineTo(x - r, y + r); g.lineTo(x - r + a, y + r);
  g.moveTo(x + r - a, y + r); g.lineTo(x + r, y + r); g.lineTo(x + r, y + r - a);
  g.stroke();
}
