import { resolveCollisionProxyManifest, proxyWorldPrimitives, resolveDockAnchor, resolveCorridorAxisWorld } from '../../data/collisionProxyManifests.js';
import { canvasFont } from '../canvasFonts.js';
import { drawTradeHubPlan, tradeHubPlan } from './harborPlan.js';

const CHART_INK = '#d3e8ec';
const COURSE = '#f4d679';
const SELF = '#a5f4f2';
const MAP_INK = 'rgba(158,195,215,.43)';

function traceFootprint(ctx, primitives, project, scale, rotation) {
  ctx.strokeStyle = MAP_INK;
  ctx.fillStyle = 'rgba(111,161,188,.31)';
  for (const shape of primitives) {
    ctx.beginPath();
    if (shape.kind === 'capsule') {
      const a = project(shape.ax, shape.az);
      const b = project(shape.bx, shape.bz);
      const width = shape.r * 2 * scale;
      ctx.lineCap = 'round';
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineWidth = width + 1.2;
      ctx.stroke();
      ctx.lineWidth = width;
      ctx.strokeStyle = '#263f51';
      ctx.stroke();
      ctx.strokeStyle = MAP_INK;
      continue;
    }
    if (shape.kind === 'circle') {
      const p = project(shape.x, shape.z);
      ctx.arc(p.x, p.y, shape.r * scale, 0, Math.PI * 2);
    } else {
      const p = project(shape.x, shape.z);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(shape.rot + rotation);
      ctx.rect(-shape.hx * scale, -shape.hz * scale, shape.hx * 2 * scale, shape.hz * 2 * scale);
      ctx.restore();
    }
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
  }
}

function icon(ctx, kind, x, y, color, heading = 0, size = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  ctx.scale(size, size);
  ctx.lineWidth = (kind === 'berth' ? 1.85 : 1.55) / size;
  ctx.strokeStyle = color;
  ctx.fillStyle = '#102333';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (kind === 'ship') {
    ctx.moveTo(0, -8); ctx.lineTo(5.8, 6); ctx.lineTo(0, 3); ctx.lineTo(-5.8, 6); ctx.closePath();
  } else if (kind === 'market') {
    ctx.moveTo(0, -5); ctx.lineTo(5, -2.5); ctx.lineTo(5, 3); ctx.lineTo(0, 5.5);
    ctx.lineTo(-5, 3); ctx.lineTo(-5, -2.5); ctx.closePath();
    ctx.moveTo(-5, -2.5); ctx.lineTo(0, .3); ctx.lineTo(5, -2.5); ctx.moveTo(0, .3); ctx.lineTo(0, 5.5);
    ctx.moveTo(-5, .3); ctx.lineTo(0, 2.9); ctx.lineTo(5, .3);
  } else if (kind === 'station') {
    ctx.moveTo(-6, -4); ctx.lineTo(0, -7); ctx.lineTo(6, -4); ctx.lineTo(6, 4);
    ctx.lineTo(0, 7); ctx.lineTo(-6, 4); ctx.closePath();
    ctx.moveTo(0, -3); ctx.lineTo(0, 3); ctx.moveTo(-3, 0); ctx.lineTo(3, 0);
  } else if (kind === 'berth') {
    ctx.moveTo(-7, 3.5); ctx.lineTo(-7, -4.5); ctx.lineTo(7, -4.5); ctx.lineTo(7, 3.5);
  } else if (kind === 'wreck') {
    ctx.moveTo(-10, 1); ctx.lineTo(-8, -2); ctx.lineTo(-4, -2); ctx.lineTo(-2, -4);
    ctx.lineTo(2, -4); ctx.lineTo(4, -2); ctx.lineTo(9, -2); ctx.lineTo(11, 1);
    ctx.lineTo(8, 3); ctx.lineTo(5, 3); ctx.lineTo(4, 2); ctx.lineTo(-1, 4); ctx.lineTo(-7, 4); ctx.closePath();
    ctx.moveTo(0, -4); ctx.lineTo(0, -6); ctx.moveTo(-6, 1); ctx.lineTo(-3, 1);
  } else if (kind === 'gate' || kind === 'signal') {
    ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.moveTo(2.4, 0); ctx.arc(0, 0, 2.4, 0, Math.PI * 2);
  } else {
    ctx.moveTo(0, -4); ctx.lineTo(4, 0); ctx.lineTo(0, 4); ctx.lineTo(-4, 0); ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function definePath(ctx, width, height) {
  const cut = width > 335 ? 17 : 10;
  ctx.beginPath();
  ctx.moveTo(cut, .5); ctx.lineTo(width - cut, .5); ctx.lineTo(width - .5, cut);
  ctx.lineTo(width - .5, height - cut); ctx.lineTo(width - cut, height - .5);
  ctx.lineTo(cut, height - .5); ctx.lineTo(.5, height - cut); ctx.lineTo(.5, cut); ctx.closePath();
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** A local, orthographic view of the harbor. Contacts come from the radar census. */
export function createFlightMinimap(doc, dpr, requestDraw) {
  const canvas = doc.createElement('canvas');
  canvas.className = 'sf-flight-chart';
  canvas.setAttribute('role', 'img');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  let width = 410;
  let height = 184;
  let projection = null;
  let pickedCourses = [];
  const footprints = new WeakMap();
  const labelRects = [];
  const setSize = (w, h) => {
    width = Math.round(w);
    height = Math.round(h);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  setSize(width, height);
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(([entry]) => {
    const { width: w, height: h } = entry.contentRect;
    if (w > 100 && h > 60 && (Math.round(w) !== width || Math.round(h) !== height)) {
      setSize(w, h);
      requestDraw();
    }
  }) : null;
  observer?.observe(canvas);

  const inside = (p, margin = 13) => p.x >= margin && p.x <= width - margin && p.y >= margin && p.y <= height - margin;
  function edge(p, origin, margin = 14) {
    if (inside(p, margin)) return p;
    const dx = p.x - origin.x, dy = p.y - origin.y;
    const xLimit = dx > 0 ? width - margin : margin;
    const yLimit = dy > 0 ? height - margin : margin;
    const factor = Math.max(0, Math.min(1,
      dx === 0 ? Infinity : (xLimit - origin.x) / dx,
      dy === 0 ? Infinity : (yLimit - origin.y) / dy));
    return { x: origin.x + dx * factor, y: origin.y + dy * factor };
  }

  function label(name, at, color, tagged = false, markRadius = 0) {
    const large = width > 335;
    const labelHeight = large ? (tagged ? 26 : 22) : 19;
    ctx.font = canvasFont(tagged ? 590 : 495, large ? 18 : 12, 'read');
    const w = ctx.measureText(name).width;
    const gap = Math.max(tagged ? 15 : 10, markRadius + 5);
    const pad = tagged ? (large ? 8 : 6) : 2;
    for (const [dx, dy] of [[gap, 1], [-w - gap, 1], [-w / 2, -labelHeight - 1], [-w / 2, labelHeight + 1]]) {
      const x = at.x + dx, y = at.y + dy;
      const box = { x: x - pad, y: y - labelHeight / 2, w: w + 2 * pad, h: labelHeight };
      if (box.x < 5 || box.x + box.w > width - 6 || box.y < 5 || box.y + box.h > height - 6) continue;
      if (labelRects.some(b => box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y)) continue;
      labelRects.push(box);
      if (tagged) {
        const left = box.x, right = left + box.w, top = box.y, bottom = top + box.h;
        ctx.beginPath();
        ctx.moveTo(left + 4, top); ctx.lineTo(right - 4, top); ctx.lineTo(right, top + 4);
        ctx.lineTo(right, bottom - 4); ctx.lineTo(right - 4, bottom);
        ctx.lineTo(left + 4, bottom); ctx.lineTo(left, bottom - 4); ctx.lineTo(left, top + 4);
        ctx.closePath();
        ctx.fillStyle = 'rgba(21,36,45,.94)'; ctx.fill();
        ctx.strokeStyle = COURSE; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(6,19,28,.78)';
      ctx.lineWidth = 2.6;
      ctx.strokeText(name, x, y);
      ctx.fillStyle = color;
      ctx.fillText(name, x, y);
      return true;
    }
    return false;
  }

  function paint({ player, range, objective, infrastructure, neutral, hostile, ghosts,
    courses, targetId, blind = false, drawHostile, drawNeutral }) {
    const objectiveStationId = objective?.cueOwner?.stationId;
    const targetStation = objectiveStationId && infrastructure.find(mark => mark.entity?.data?.stationId === objectiveStationId && !mark.gate)?.entity;
    const targetManifest = targetStation && resolveCollisionProxyManifest(targetStation);
    const targetDock = targetManifest && resolveDockAnchor(targetStation, targetManifest, player);
    const owner = objective?.cueOwner;
    const fix = targetDock || (blind && (owner?.targetEntityId != null || owner?.stable || owner?.presentationEntityId != null)
      ? owner.pos : objective?.waypointPos);
    const target = Number.isFinite(fix?.x) && Number.isFinite(fix?.z) ? fix : null;
    let harbor = null;
    let harborDist = Infinity;
    for (const mark of infrastructure) {
      if (mark.gate || mark.offRange || mark.distanceSq >= harborDist) continue;
      harbor = mark.entity;
      harborDist = mark.distanceSq;
    }
    // A local approach earns a closer chart scale. Ordinary sensor coverage stays stable
    // when the pilot flies past a station or changes a distant objective.
    const dockingDistance = targetDock ? distance(player.pos, targetDock) : Infinity;
    const approachRange = Math.min(range * .35, 1150);
    const approach = Math.max(0, Math.min(1, (approachRange - dockingDistance) / 320));
    const courseUp = approach > 0;
    if (courseUp) harbor = targetStation;
    const harborNear = harbor && Math.sqrt(harborDist) < Math.min(range * .21, 680);
    const closeGoal = target && !targetStation && distance(player.pos, target) < Math.min(range * .25, 620);
    const local = courseUp || harborNear || closeGoal;
    const focus = courseUp ? targetDock : closeGoal ? target : harborNear ? harbor.pos : null;
    const focusDist = focus ? distance(player.pos, focus) : 0;
    let plan = null;
    if (harbor && (courseUp || harborNear)) plan = tradeHubPlan(harbor);
    const displayRange = local ? Math.min(range, Math.max(220, Math.ceil((focusDist + 70) / 80) * 80)) : range;
    const extent = plan && courseUp ? Math.max(dockingDistance + plan.radius * .65, plan.radius * .95) : 0;
    const closeScale = extent ? Math.min(height * .88 / extent, width * .62 / (2 * plan.radius))
      : height * (courseUp ? .52 : local ? .65 : .42) / displayRange;
    const ordinaryScale = height * .42 / range;
    let scale = courseUp ? ordinaryScale + (closeScale - ordinaryScale) * approach : closeScale;
    const weight = local && !courseUp ? .27 : 0;
    const originX = player.pos.x + ((focus?.x ?? player.pos.x) - player.pos.x) * weight;
    const originZ = player.pos.z + ((focus?.z ?? player.pos.z) - player.pos.z) * weight;
    const corridor = courseUp && resolveCorridorAxisWorld(targetStation, targetManifest);
    const approachAngle = corridor ? -2.36 - corridor.bearingRad : 0;
    const rotation = Math.atan2(Math.sin(approachAngle), Math.cos(approachAngle)) * approach;
    const cos = Math.cos(rotation), sin = Math.sin(rotation);
    const offsetX = (x, z) => -((x - originX) * cos - (z - originZ) * sin);
    const offsetY = (x, z) => -((x - originX) * sin + (z - originZ) * cos);
    let cx = width * (.50 + approach * .05), cy = height * (.50 + approach * .28);
    if (courseUp) {
      // Keep both the port and the berth in view when the pilot approaches the mouth from
      // the side. The chart can translate without swinging its compass to fit the new leg.
      const p = plan?.center || targetStation.pos;
      const bx = offsetX(targetDock.x, targetDock.z), by = offsetY(targetDock.x, targetDock.z);
      const px = offsetX(p.x, p.z), py = offsetY(p.x, p.z);
      const minX = Math.min(0, bx, px), maxX = Math.max(0, bx, px);
      const minY = Math.min(0, by, py), maxY = Math.max(0, by, py);
      const pad = width > 335 ? 25 : 17;
      scale = Math.min(scale, (width - 2 * pad) / (maxX - minX), (height - 2 * pad) / (maxY - minY));
      cx = Math.max(pad - minX * scale, Math.min(width - pad - maxX * scale, cx));
      cy = Math.max(pad - minY * scale, Math.min(height - pad - maxY * scale, cy));
    }
    const project = (x, z) => ({ x: cx + offsetX(x, z) * scale, y: cy + offsetY(x, z) * scale });
    projection = project;

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    definePath(ctx, width, height);
    ctx.clip();
    const bed = ctx.createLinearGradient(0, 0, 0, height);
    bed.addColorStop(0, 'rgba(12,32,46,.87)');
    bed.addColorStop(1, 'rgba(7,24,35,.88)');
    ctx.fillStyle = bed;
    ctx.fillRect(0, 0, width, height);
    if (plan) drawTradeHubPlan(ctx, plan, project(plan.center.x, plan.center.z), scale, rotation);

    const self = project(player.pos.x, player.pos.z);
    labelRects.length = 0;
    const compassWidth = width > 335 ? 105 : 76;
    labelRects.push({ x: self.x - 14, y: self.y - 14, w: 28, h: 28 }, { x: width - compassWidth, y: 0, w: compassWidth, h: 65 });
    labelRects.push({ x: 0, y: height - 34, w: 76, h: 34 });
    if (blind) labelRects.push({ x: 8, y: 6, w: 144, h: 24 });
    let namedPort = '';
    let market = false;
    let shownBerth = false;
    const orderedInfrastructure = harbor
      ? [...infrastructure.filter(mark => mark.entity === harbor), ...infrastructure.filter(mark => mark.entity !== harbor)] : infrastructure;

    for (const mark of orderedInfrastructure) {
      const entity = mark.entity;
      if (!entity || mark.offRange) continue;
      const at = project(entity.pos.x, entity.pos.z);
      if (!inside(at, -40)) continue;
      let berth = null, dock = null, mouth = 0;
      if (entity === harbor && (courseUp || harborNear)) {
        let saved = footprints.get(entity);
        if (!saved || saved.x !== entity.pos.x || saved.z !== entity.pos.z || saved.rot !== entity.rot) {
          const manifest = resolveCollisionProxyManifest(entity);
          saved = { x: entity.pos.x, z: entity.pos.z, rot: entity.rot, manifest,
            primitives: manifest ? proxyWorldPrimitives(entity, manifest) : [] };
          footprints.set(entity, saved);
        }
        const physicalSize = saved.primitives.reduce((size, primitive) => {
          const x = primitive.x ?? primitive.bx;
          const z = primitive.z ?? primitive.bz;
          return Math.max(size, Math.hypot(x - entity.pos.x, z - entity.pos.z) + (primitive.r ?? Math.hypot(primitive.hx, primitive.hz)));
        }, 0) * scale;
        const axis = saved.manifest && resolveCorridorAxisWorld(entity, saved.manifest);
        mouth = (axis ? Math.atan2(-axis.z, -axis.x) : Number(entity.rot) || 0) + rotation;
        if (!plan && physicalSize >= 5) traceFootprint(ctx, saved.primitives, project, scale, rotation);
        dock = saved.manifest && resolveDockAnchor(entity, saved.manifest, player);
        if (dock) berth = project(dock.x, dock.z);
      }
      const trades = entity.data?.services?.includes('trade');
      const stationOnChart = inside(at);
      const separated = !berth || Math.hypot(berth.x - at.x, berth.y - at.y) >= 17;
      if (stationOnChart && (separated || entity !== targetStation)) {
        labelRects.push({ x: at.x - 8, y: at.y - 8, w: 16, h: 16 });
      }
      if (berth && inside(berth)) {
        const tracked = entity === targetStation;
        if (tracked || !stationOnChart || separated) {
          icon(ctx, 'berth', berth.x, berth.y, tracked ? COURSE : CHART_INK, mouth - Math.PI / 2, width > 335 ? 1.40 : 1);
          label(dock.kind === 'mooring' ? 'Mooring' : 'Berth', berth, tracked ? COURSE : CHART_INK, tracked, 20);
          labelRects.push({ x: berth.x - 8, y: berth.y - 8, w: 16, h: 16 });
          shownBerth ||= tracked;
        }
      }
      if (!stationOnChart) continue;
      const name = entity.data?.name || entity.name || (mark.gate ? 'Gate' : 'Station');
      const berthOverlapsStation = shownBerth && entity === targetStation && !separated;
      const marketSize = trades && entity === harbor && local && width > 335 ? 1.65 : 1;
      if (!berthOverlapsStation) icon(ctx, mark.gate ? 'gate' : trades ? 'market' : 'station', at.x, at.y, CHART_INK, 0, marketSize);
      if (entity === harbor || mark.selected || mark.gate && !namedPort) {
        namedPort ||= name;
        if (local && trades && entity === harbor) {
          const marketTextAt = berthOverlapsStation ? { x: at.x, y: at.y - 16 } : at;
          market = label('Market', marketTextAt, CHART_INK, false, 5.5 * marketSize);
        } else {
          const short = name.length > (width > 335 ? 27 : 19) ? name.slice(0, width > 335 ? 26 : 18) + '…' : name;
          label(short, at, CHART_INK);
          market ||= trades;
        }
      }
    }

    if (target) {
      const projected = project(target.x, target.z);
      const at = edge(projected, self);
      const dx = at.x - self.x, dy = at.y - self.y;
      const len = Math.hypot(dx, dy);
      if (len > 12) {
        if (len > 26) {
          ctx.strokeStyle = COURSE; ctx.lineWidth = 1.65; ctx.lineCap = 'round';
          ctx.setLineDash([5, 4]); ctx.beginPath();
          ctx.moveTo(self.x + dx / len * 15, self.y + dy / len * 15);
          ctx.lineTo(at.x - dx / len * 8, at.y - dy / len * 8);
          ctx.stroke(); ctx.setLineDash([]);
        }
        if (at !== projected) icon(ctx, 'ship', at.x, at.y, COURSE, Math.atan2(dx, -dy));
        else if (!shownBerth) icon(ctx, 'objective', at.x, at.y, COURSE);
        if (!shownBerth && objective?.label) {
          const words = objective.label;
          label(words.length > 22 ? words.slice(0, 21) + '…' : words, at, COURSE);
        }
      }
    }

    let wreck = null;
    for (const mark of neutral) {
      if (mark.type !== 'wreck') continue;
      const p = mark.entity.pos;
      const at = project(p.x, p.z);
      if (!inside(at)) continue;
      if (!wreck || mark.selected || (!wreck.mark.selected && mark.distanceSq < wreck.mark.distanceSq)) wreck = { mark, at };
    }
    if (wreck) {
      const { mark, at } = wreck;
      const markerScale = width > 335 ? 1.54 : 1.1;
      icon(ctx, 'wreck', at.x, at.y, CHART_INK, 0, markerScale);
      const name = mark.entity.data?.name || mark.entity.name || 'Wreck';
      label(name.length > 22 ? 'Wreck' : name, at, CHART_INK, false, markerScale * 11);
    }
    function selection(at) {
      ctx.strokeStyle = SELF;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(at.x, at.y, 9, 0, Math.PI * 2); ctx.stroke();
    }
    let salient = 0;
    const trafficCells = new Set();
    for (const mark of neutral) {
      if (!mark.selected && (!mark.named || salient >= 3)) continue;
      const p = mark.entity.pos;
      const at = project(p.x, p.z);
      if (!inside(at)) continue;
      const cell = `${Math.floor(at.x / 14)}:${Math.floor(at.y / 14)}`;
      if (!mark.selected && trafficCells.has(cell)) continue;
      trafficCells.add(cell);
      if (mark !== wreck?.mark) drawNeutral(ctx, mark, at.x, at.y, rotation);
      if (mark.selected) selection(at);
      salient += 1;
    }
    pickedCourses = [];
    for (const course of courses) {
      const at = project(course.pos.x, course.pos.z);
      if (!inside(at) || distance(player.pos, course.pos) > range) continue;
      pickedCourses.push(course);
      icon(ctx, 'signal', at.x, at.y, '#9ae1e8');
      if (pickedCourses.length === 1) label('Signal', at, CHART_INK);
      if (pickedCourses.length === 3) break;
    }
    for (const ghost of ghosts.slice(0, 5)) {
      const at = project(ghost.entity.pos.x, ghost.entity.pos.z);
      if (inside(at)) icon(ctx, 'objective', at.x, at.y, MAP_INK);
    }
    const hostileCells = new Set();
    const visibleHostiles = [];
    let edgeHostile = null;
    let edgeDist = Infinity;
    const selectedHostile = targetId != null && hostile.find(mark => mark.entity.id === targetId);
    const orderedHostiles = selectedHostile ? [selectedHostile, ...hostile.filter(mark => mark !== selectedHostile)] : hostile;
    for (const mark of orderedHostiles) {
      const at = project(mark.entity.pos.x, mark.entity.pos.z);
      if (!inside(at)) {
        if (mark.distanceSq < edgeDist) { edgeHostile = mark.entity; edgeDist = mark.distanceSq; }
        continue;
      }
      const cell = `${Math.round(at.x / 14)},${Math.round(at.y / 14)}`;
      if (hostileCells.size >= 9 || hostileCells.has(cell)) continue;
      hostileCells.add(cell);
      drawHostile(ctx, mark, at.x, at.y, rotation);
      visibleHostiles.push({ x: at.x - self.x, y: at.y - self.y });
    }
    let edgeBearing = null;
    if (edgeHostile?.pos) {
      const projected = project(edgeHostile.pos.x, edgeHostile.pos.z);
      const at = edge(projected, self);
      icon(ctx, 'ship', at.x, at.y, '#ff806e', Math.atan2(at.x - self.x, self.y - at.y));
      edgeBearing = { x: projected.x - self.x, y: projected.y - self.y };
    }
    icon(ctx, 'ship', self.x, self.y, SELF, (Number(player.rot) || 0) - Math.PI / 2 + rotation, width > 335 ? 1.56 : 1.08);

    const rangeText = range < 1000 ? `${Math.round(range)} m` : `${(range / 1000).toFixed(1)} km`;
    ctx.textBaseline = 'top'; ctx.textAlign = 'right';
    ctx.font = canvasFont(630, width > 335 ? 16 : 12, 'read'); ctx.fillStyle = CHART_INK;
    ctx.textAlign = 'center';
    ctx.fillText('N', width - 25, 7);
    icon(ctx, 'ship', width - 25, 29, CHART_INK, rotation);
    ctx.textAlign = 'right';
    ctx.font = canvasFont(560, width > 335 ? 15 : 12, 'read');
    ctx.fillText(local ? `Scan ${rangeText}` : rangeText, width - 11, width > 335 ? 50 : 43);
    if (blind) {
      ctx.textAlign = 'left';
      ctx.fillStyle = COURSE;
      ctx.fillText('Sensors blocked', 15, 12);
    }
    const scaleUnit = 10 ** Math.floor(Math.log10(52 / scale));
    const scaleUnits = [5, 2, 1].map(n => n * scaleUnit).find(n => n * scale <= 56) || scaleUnit;
    ctx.beginPath(); ctx.strokeStyle = MAP_INK; ctx.lineWidth = 1;
    ctx.moveTo(16, height - 16); ctx.lineTo(16, height - 12);
    ctx.lineTo(16 + scaleUnits * scale, height - 12); ctx.lineTo(16 + scaleUnits * scale, height - 16);
    ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillStyle = 'rgba(193,223,231,.8)';
    ctx.font = canvasFont(530, 12, 'read'); ctx.fillText(`${scaleUnits} u`, 16, height - 17);
    ctx.restore();
    definePath(ctx, width, height);
    ctx.strokeStyle = 'rgba(179,213,228,.74)'; ctx.lineWidth = 1; ctx.stroke();
    return { namedPort, market, wreck: wreck?.mark || null, visibleHostiles, edgeBearing, target };
  }

  function findCourse(event) {
    if (!projection) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = (event.clientX - rect.left) * width / rect.width;
    const y = (event.clientY - rect.top) * height / rect.height;
    let best = null, bestDistance = 12;
    for (const course of pickedCourses) {
      const at = projection(course.pos.x, course.pos.z);
      const d = Math.hypot(at.x - x, at.y - y);
      if (inside(at) && d <= bestDistance) { best = course; bestDistance = d; }
    }
    return best;
  }
  return { canvas, paint, findCourse, dispose() { observer?.disconnect(); } };
}
