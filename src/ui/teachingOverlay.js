// PQ-161.03 — trajectory and force ribbons. Teaching ink only: the Range and the
// draw-to-fly stroke preview. Ordinary flight stays clean.
import { getForcePaletteHex } from '../data/palettes.js';

export const TEACHING_OVERLAY_SURFACES = Object.freeze({
  RANGE: 'range',
  DRAW_TO_FLY_PREVIEW: 'draw_to_fly_preview',
});

export const DEFAULT_FLIGHT_ROUTE = Object.freeze({
  profile: 'production',
  assistMode: 'assisted',
  surface: 'flight',
});

export const TRAJECTORY_RIBBON_HEX = '#EDE7DC';
export const TRAJECTORY_LOOKAHEAD_S = 1.25;
export const TRAJECTORY_REST_GHOST_WU = 140;
const HEADING_FLOOR_SPEED = 8;
const FORCE_SPOKE_COUNT = 6;

export function teachingOverlayAllowed(context = {}) {
  const surface = context.surface;
  if (surface === TEACHING_OVERLAY_SURFACES.RANGE) return true;
  if (surface === TEACHING_OVERLAY_SURFACES.DRAW_TO_FLY_PREVIEW) {
    return strokePreviewReady(context.stroke || context.autoTargetPath);
  }
  return false;
}

export function isDefaultFlightRoute(context = {}) {
  const profile = context.profile || context.runtimeProfile;
  const assist = context.assistMode || context.flightMode;
  const surface = context.surface;
  return profile === DEFAULT_FLIGHT_ROUTE.profile
    && assist === DEFAULT_FLIGHT_ROUTE.assistMode
    && (surface === DEFAULT_FLIGHT_ROUTE.surface || surface == null);
}

export function planTeachingOverlay(context = {}) {
  if (!teachingOverlayAllowed(context)) {
    return emptyPlan(context.surface || DEFAULT_FLIGHT_ROUTE.surface);
  }
  if (context.surface === TEACHING_OVERLAY_SURFACES.DRAW_TO_FLY_PREVIEW) {
    return planDrawToFlyPreview(context);
  }
  return planRangeOverlay(context.sim || {});
}

export function drawTeachingOverlay(ctx2d, plan, options = {}) {
  if (!ctx2d || !plan || plan.allowed !== true) return 0;
  const ribbons = Array.isArray(plan.ribbons) ? plan.ribbons : [];
  const forced = options.forced === true;
  const reduced = options.reduced === true;
  const project = typeof options.project === 'function' ? options.project : null;
  let drawn = 0;
  for (let i = 0; i < ribbons.length; i += 1) {
    if (strokeRibbon(ctx2d, ribbons[i], { forced, reduced, project })) drawn += 1;
  }
  return drawn;
}

function emptyPlan(surface) {
  return Object.freeze({
    allowed: false,
    surface: surface || DEFAULT_FLIGHT_ROUTE.surface,
    ribbons: Object.freeze([]),
  });
}

function strokePreviewReady(path) {
  if (!path || path.drawing !== true) return false;
  return worldPoints(path.points).length >= 2;
}

function planDrawToFlyPreview(context) {
  const path = context.stroke || context.autoTargetPath;
  const points = worldPoints(path && path.points);
  if (points.length < 2) return emptyPlan(TEACHING_OVERLAY_SURFACES.DRAW_TO_FLY_PREVIEW);
  return freezePlan(TEACHING_OVERLAY_SURFACES.DRAW_TO_FLY_PREVIEW, [
    trajectoryRibbon(points),
  ]);
}

function planRangeOverlay(sim) {
  const ribbons = [];
  const strokePoints = worldPoints(sim.stroke && sim.stroke.points);
  if (strokePoints.length >= 2) ribbons.push(trajectoryRibbon(strokePoints));
  else {
    const ghost = headingGhost(sim.player);
    if (ghost.length >= 2) ribbons.push(trajectoryRibbon(ghost));
  }
  const rope = ropeRibbon(sim);
  if (rope) ribbons.push(rope);
  if (sim.well) ribbons.push(...wellRibbons(sim.well, sim.scrap));
  const punch = impulseRibbon(sim);
  if (punch) ribbons.push(punch);
  return freezePlan(TEACHING_OVERLAY_SURFACES.RANGE, ribbons);
}

function freezePlan(surface, ribbons) {
  return Object.freeze({
    allowed: true,
    surface,
    ribbons: Object.freeze(ribbons.filter(Boolean).map((row) => Object.freeze(row))),
  });
}

function trajectoryRibbon(points) {
  return {
    kind: 'trajectory',
    channel: 'trajectory',
    hex: TRAJECTORY_RIBBON_HEX,
    space: 'world',
    points,
  };
}

function forceRibbon(channel, points) {
  return {
    kind: 'force',
    channel,
    hex: getForcePaletteHex(channel),
    space: 'world',
    points,
  };
}

function headingGhost(player) {
  if (!player) return [];
  const origin = { x: finite(player.x, 0), z: finite(player.z, 0) };
  const speed = Math.hypot(finite(player.vx, 0), finite(player.vz, 0));
  let dx;
  let dz;
  if (speed >= HEADING_FLOOR_SPEED) {
    dx = player.vx * TRAJECTORY_LOOKAHEAD_S;
    dz = player.vz * TRAJECTORY_LOOKAHEAD_S;
  } else {
    const rot = finite(player.rot, 0);
    dx = Math.cos(rot) * TRAJECTORY_REST_GHOST_WU;
    dz = Math.sin(rot) * TRAJECTORY_REST_GHOST_WU;
  }
  return [origin, { x: origin.x + dx, z: origin.z + dz }];
}

function ropeRibbon(sim) {
  const tether = sim.tether;
  if (!tether || tether.active !== true) return null;
  const hitch = ropeHitch(sim);
  const player = sim.player;
  if (!hitch || !player) return null;
  return forceRibbon('rope', [
    { x: finite(hitch.x, 0), z: finite(hitch.z, 0) },
    { x: finite(player.x, 0), z: finite(player.z, 0) },
  ]);
}

function ropeHitch(sim) {
  if (sim.payload) return sim.payload;
  if (sim.hostile) return sim.hostile;
  if (sim.anchor) return sim.anchor;
  return null;
}

function wellRibbons(well, scrap) {
  const center = { x: finite(well.x, 0), z: finite(well.z, 0) };
  const radius = Math.max(24, finite(well.radius, 80));
  const ribbons = [];
  for (let i = 0; i < FORCE_SPOKE_COUNT; i += 1) {
    const angle = (Math.PI * 2 * i) / FORCE_SPOKE_COUNT;
    const outer = {
      x: center.x + Math.cos(angle) * radius,
      z: center.z + Math.sin(angle) * radius,
    };
    const inner = {
      x: center.x + Math.cos(angle) * radius * 0.32,
      z: center.z + Math.sin(angle) * radius * 0.32,
    };
    ribbons.push(forceRibbon('wells', [outer, inner]));
  }
  if (scrap) {
    ribbons.push(forceRibbon('wells', [
      { x: finite(scrap.x, 0), z: finite(scrap.z, 0) },
      center,
    ]));
  }
  return ribbons;
}

function impulseRibbon(sim) {
  if (!sim.boosted || !sim.player) return null;
  const player = sim.player;
  const speed = Math.hypot(finite(player.vx, 0), finite(player.vz, 0));
  const rot = finite(player.rot, 0);
  const dx = speed >= HEADING_FLOOR_SPEED ? player.vx : Math.cos(rot);
  const dz = speed >= HEADING_FLOOR_SPEED ? player.vz : Math.sin(rot);
  const len = Math.hypot(dx, dz) || 1;
  const reach = 110;
  return forceRibbon('impulses', [
    { x: finite(player.x, 0), z: finite(player.z, 0) },
    { x: player.x + (dx / len) * reach, z: player.z + (dz / len) * reach },
  ]);
}

function worldPoints(points) {
  if (!Array.isArray(points)) return [];
  const out = [];
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (!point) continue;
    const x = finite(point.x, NaN);
    const z = Number.isFinite(point.z) ? point.z : point.y;
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    out.push({ x, z });
  }
  return out;
}

function strokeRibbon(ctx2d, ribbon, options) {
  const mapped = projectRibbon(ribbon, options.project);
  if (mapped.length < 2) return false;
  const hex = options.forced ? 'CanvasText' : ribbon.hex;
  const trajectory = ribbon.kind === 'trajectory';
  ctx2d.save();
  ctx2d.strokeStyle = hex;
  ctx2d.lineWidth = trajectory
    ? (options.reduced ? 3.2 : 4.6)
    : (options.reduced ? 2.2 : 3.1);
  ctx2d.globalAlpha = trajectory ? 0.42 : 0.78;
  ctx2d.lineCap = 'round';
  ctx2d.lineJoin = 'round';
  if (trajectory && !options.reduced && typeof ctx2d.setLineDash === 'function') {
    ctx2d.setLineDash([11, 8]);
  }
  ctx2d.beginPath();
  ctx2d.moveTo(mapped[0].x, mapped[0].y);
  for (let i = 1; i < mapped.length; i += 1) ctx2d.lineTo(mapped[i].x, mapped[i].y);
  ctx2d.stroke();
  if (typeof ctx2d.setLineDash === 'function') ctx2d.setLineDash([]);
  if (!trajectory) drawChevron(ctx2d, mapped[mapped.length - 2], mapped[mapped.length - 1]);
  ctx2d.restore();
  return true;
}

function projectRibbon(ribbon, project) {
  const points = Array.isArray(ribbon.points) ? ribbon.points : [];
  const screen = ribbon.space === 'screen';
  const out = [];
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (screen) {
      out.push({ x: finite(point.x, 0), y: finite(point.y != null ? point.y : point.z, 0) });
      continue;
    }
    if (project) {
      const mapped = project(point.x, point.z);
      if (mapped && Number.isFinite(mapped.x) && Number.isFinite(mapped.y)) out.push(mapped);
      continue;
    }
    out.push({ x: finite(point.x, 0), y: finite(point.z, 0) });
  }
  return out;
}

function drawChevron(ctx2d, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 8) return;
  const ux = dx / len;
  const uy = dy / len;
  const size = 8;
  ctx2d.beginPath();
  ctx2d.moveTo(to.x - ux * size - uy * size * 0.62, to.y - uy * size + ux * size * 0.62);
  ctx2d.lineTo(to.x, to.y);
  ctx2d.lineTo(to.x - ux * size + uy * size * 0.62, to.y - uy * size - ux * size * 0.62);
  ctx2d.stroke();
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}
