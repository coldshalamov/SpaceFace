// Shared semantic grammar for the always-on radar and the paused navigation chart.
//
// This module owns meaning, projection, and crisp glyph geometry — never simulation. Every primary
// identity uses at least two channels (shape plus fill/outline/weight), so hue is reinforcement
// rather than the only way to tell "me", "goal", "threat", and "infrastructure" apart.

export const TACTICAL_MAP_PALETTE = Object.freeze({
  ground: '#071015',
  groundPlate: 'rgba(5, 12, 16, 0.92)',
  ink: '#f4f0e6',
  inkDim: '#b9c3c2',
  player: '#63f3ff',
  objective: '#ffc064',
  hostile: '#ff6673',
  station: '#63d8ff',
  gate: '#c7a9ff',
  neutral: '#a9b4c2',
  asteroid: '#66717c',
});

export const TACTICAL_SYMBOLS = Object.freeze({
  player: Object.freeze({
    id: 'player', label: 'YOU', shape: 'asymmetric-hull', colour: TACTICAL_MAP_PALETTE.player,
    channel: 'filled hull + white nose notch + centre brackets', priority: 100,
  }),
  objective: Object.freeze({
    id: 'objective', label: 'OBJECTIVE', shape: 'open-corner-bracket', colour: TACTICAL_MAP_PALETTE.objective,
    channel: 'four open corners + centre diamond + route corridor', priority: 95,
  }),
  hostile: Object.freeze({
    id: 'hostile', label: 'HOSTILE', shape: 'heading-chevron', colour: TACTICAL_MAP_PALETTE.hostile,
    channel: 'directional chevron + selected fill + threat weight', priority: 80,
  }),
  station: Object.freeze({
    id: 'station', label: 'STATION', shape: 'berth-hex', colour: TACTICAL_MAP_PALETTE.station,
    channel: 'flat-top hex + inset berth square', priority: 65,
  }),
  gate: Object.freeze({
    id: 'gate', label: 'GATE', shape: 'portal-double-ring', colour: TACTICAL_MAP_PALETTE.gate,
    channel: 'double ring + portal ticks', priority: 70,
  }),
  neutral: Object.freeze({
    id: 'neutral', label: 'CONTACT', shape: 'outline-hull', colour: TACTICAL_MAP_PALETTE.neutral,
    channel: 'outline heading hull', priority: 45,
  }),
  asteroid: Object.freeze({
    id: 'asteroid', label: 'ASTEROID', shape: 'micro-diamond', colour: TACTICAL_MAP_PALETTE.asteroid,
    channel: 'small dim diamond', priority: 15,
  }),
});

export const MAP_LEGEND_ORDER = Object.freeze(['player', 'objective', 'hostile', 'station', 'gate']);

const COMPACT_METRICS = Object.freeze({ size: 220, center: 110, radius: 105 });
const EXPANDED_METRICS = Object.freeze({ size: 340, center: 170, radius: 165 });
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

export function projectRadarPoint(playerPos, targetPos, range, metrics = COMPACT_METRICS) {
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
  return (text || 'OBJECTIVE').slice(0, Math.max(4, max | 0));
}

export function formatRadarDistance(worldUnits) {
  const d = Number(worldUnits);
  if (!Number.isFinite(d) || d < 0) return 'ROUTE PENDING';
  if (d >= 1000) {
    const digits = d >= 10000 ? 0 : 1;
    return `${(d / 1000).toFixed(digits)}K`;
  }
  return `${Math.round(d)}U`;
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
  g.lineWidth = corridorMode === 'full' ? 1.5 : 1.25;
  g.globalAlpha = corridorMode === 'full' ? 0.72 : 0.54;
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

  // White nose notch: self remains identifiable in monochrome and against cyan infrastructure.
  g.fillStyle = TACTICAL_MAP_PALETTE.ink;
  g.beginPath();
  g.moveTo(11, 0);
  g.lineTo(5.2, -2.2);
  g.lineTo(5.2, 2.2);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(99,243,255,0.78)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(-8.8, 0);
  g.lineTo(-13, 0);
  g.stroke();
  g.restore();

  // Non-rotating centre brackets make self-location instantaneous while the hull turns.
  g.save();
  g.strokeStyle = 'rgba(99,243,255,0.82)';
  g.lineWidth = 1.25;
  drawOpenCorners(g, x, y, 15, 4.5);
  if (label) {
    g.font = '700 12px "IBM Plex Mono", ui-monospace, monospace';
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
      g.font = '700 12px "IBM Plex Mono", ui-monospace, monospace';
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
  g.strokeStyle = TACTICAL_MAP_PALETTE.hostile;
  g.fillStyle = selected ? TACTICAL_MAP_PALETTE.hostile : TACTICAL_MAP_PALETTE.groundPlate;
  g.lineWidth = capital ? 2.2 : 1.7;
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
