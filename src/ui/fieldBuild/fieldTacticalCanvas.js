// src/ui/fieldBuild/fieldTacticalCanvas.js — 2D Tactical Overlay Canvas Renderer for Field Architect.
// Projects live in-sector asteroids, 4 overlay map modes (Standard, Power/Thermal, Supply Flow,
// Defense/Threat), animated Mindustry links, orbiting megastructure pylons, autonomous belt drones,
// marquee selection boxes, and a floating subterranean cutaway schematic inside asteroid claims.
import { ASTEROID_SCAN_GLYPH_BY_TYPE } from '../../data/mining.js';
import { SITE_BALANCE } from '../../data/sites.js';
import { BELT_ORBITAL_STRUCTURES } from '../../data/beltEmpireData.js';
import { readFrameOrigin } from '../../render/frameCoordinates.js';

export const TACTICAL_MAP_MODES = Object.freeze([
  Object.freeze({ id: 'standard', short: 'TAC', label: 'Tactical' }),
  Object.freeze({ id: 'power_thermal', short: 'PWR', label: 'Power & Thermal' }),
  Object.freeze({ id: 'supply_flow', short: 'SUP', label: 'Supply Mesh' }),
  Object.freeze({ id: 'defense_threat', short: 'DEF', label: 'Defense & Weather' }),
]);

const ASTEROID_COLOR_BY_TYPE = Object.freeze({
  ast_common_rock: '#c8b89a',
  ast_metallic: '#e08b4f',
  ast_icy: '#7cd4fc',
  ast_crystalline: '#c79dff',
  ast_gas_cloud: '#6ceab8',
  ast_rare_exotic: '#f2b949',
});

const MACHINE_CUTAWAY_COLORS = Object.freeze({
  sm_massline_core: '#f2b949',
  sm_extractor: '#5ac8fa',
  sm_refinery: '#ff964f',
  sm_fabricator: '#c79dff',
  sm_deep_synthesizer: '#d58cff',
  sm_cargo_port: '#4ce0a7',
  sm_gas_tap: '#6ceab8',
  sm_relay: '#a3d8ff',
  sm_cryo_condenser: '#7cd4fc',
  sm_seismic_brace: '#c8b89a',
  sm_capacitor_bank: '#ffe066',
  sm_mass_driver: '#ff6b9d',
  sm_harmonic_resonator: '#6ceab8',
});

export function projectFramePoint(cam, fx, fy, fz, width, height) {
  if (!cam || !cam.matrixWorldInverse || !cam.projectionMatrix) return null;
  const mv = cam.matrixWorldInverse.elements;
  const pm = cam.projectionMatrix.elements;
  if (!mv || !pm) return null;
  const vx = mv[0] * fx + mv[4] * fy + mv[8] * fz + mv[12];
  const vy = mv[1] * fx + mv[5] * fy + mv[9] * fz + mv[13];
  const vz = mv[2] * fx + mv[6] * fy + mv[10] * fz + mv[14];
  const vw = mv[3] * fx + mv[7] * fy + mv[11] * fz + mv[15];
  const cx = pm[0] * vx + pm[4] * vy + pm[8] * vz + pm[12] * vw;
  const cy = pm[1] * vx + pm[5] * vy + pm[9] * vz + pm[13] * vw;
  const cw = pm[3] * vx + pm[7] * vy + pm[11] * vz + pm[15] * vw;
  if (!(cw > 1e-4)) return null;
  const ndcX = cx / cw;
  const ndcY = cy / cw;
  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (-ndcY * 0.5 + 0.5) * height,
    ndcX,
    ndcY,
  };
}

function drawCutawayInset(g, siteNode, w, h) {
  const cut = siteNode?.cutawaySchematic;
  if (!cut) return;
  const cols = cut.cols || 28;
  const rows = cut.rows || 45;
  const cellPx = cols > 18 || rows > 24 ? 5 : 8;
  const pad = 10;
  const gridW = cols * cellPx;
  const gridH = rows * cellPx;
  const boxW = Math.max(152, gridW + pad * 2);
  const boxH = gridH + pad * 2 + 22;
  const bx = 16;
  const by = Math.max(74, h - boxH - 258);

  g.save();
  g.fillStyle = 'rgba(13, 18, 22, 0.9)';
  g.strokeStyle = 'rgba(90, 200, 250, 0.45)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.roundRect(bx, by, boxW, boxH, 8);
  g.fill();
  g.stroke();

  g.font = '700 12px sans-serif';
  g.fillStyle = '#8ce0ff';
  g.textAlign = 'left';
  g.fillText(`${siteNode.specialization?.tag || 'SITE'} Interior Cutaway`, bx + pad, by + 16);

  const gx = bx + pad;
  const gy = by + 24;
  // Rock background
  g.fillStyle = '#252b31';
  g.fillRect(gx, gy, gridW, gridH);

  // Highlighted veins, gas pockets, excavated chambers, conduits & installed machines
  for (const hc of Array.isArray(cut.highlights) ? cut.highlights : []) {
    const cx = gx + hc.c * cellPx;
    const cy = gy + hc.r * cellPx;
    if (hc.kind === 'vein') {
      g.fillStyle = '#786238';
      g.fillRect(cx, cy, cellPx - 0.4, cellPx - 0.4);
    } else if (hc.kind === 'gas') {
      g.fillStyle = '#24584c';
      g.fillRect(cx, cy, cellPx - 0.4, cellPx - 0.4);
    } else if (hc.kind === 'empty') {
      g.fillStyle = '#111519';
      g.fillRect(cx, cy, cellPx - 0.4, cellPx - 0.4);
    }
    if (hc.power) {
      g.fillStyle = 'rgba(242, 185, 73, 0.45)';
      g.fillRect(cx + 1, cy + 1, cellPx - 2, Math.max(1, cellPx * 0.28));
    }
    if (hc.lane) {
      g.fillStyle = 'rgba(90, 200, 250, 0.45)';
      g.fillRect(cx + 1, cy + cellPx * 0.55, cellPx - 2, Math.max(1, cellPx * 0.28));
    }
    if (hc.machineId) {
      g.fillStyle = MACHINE_CUTAWAY_COLORS[hc.machineId] || '#ffffff';
      g.fillRect(cx + 0.8, cy + 0.8, Math.max(2, cellPx - 1.6), Math.max(2, cellPx - 1.6));
    }
  }
  // Anomalies
  for (const a of Array.isArray(cut.anomalies) ? cut.anomalies : []) {
    g.fillStyle = a.status === 'breached' ? '#666d73' : (a.status === 'tapped' ? '#4ce0a7' : '#f2b949');
    g.beginPath();
    g.arc(gx + (a.col + 0.5) * cellPx, gy + (a.row + 0.5) * cellPx, Math.max(2, cellPx * 0.36), 0, Math.PI * 2);
    g.fill();
  }

  g.restore();
}

export function computeSectorRadarViewport({ w, h, state, network, size = 152 } = {}) {
  const x = 16;
  const y = Math.max(96, (h || 720) - size - 92);
  let maxAbs = 2200;
  const player = state?.entities?.get?.(state?.playerId);
  const centerX = Number(player?.pos?.x) || 0;
  const centerZ = Number(player?.pos?.z) || 0;
  if (state?.entities?.values) {
    for (const e of state.entities.values()) {
      if (!e || e.alive === false || !e.pos) continue;
      if (e.type !== 'asteroid' && e.type !== 'station') continue;
      const dist = Math.hypot((e.pos.x || 0) - centerX, (e.pos.z || 0) - centerZ);
      if (dist > maxAbs && dist < 14000) maxAbs = dist;
    }
  }
  for (const s of network?.sites || []) {
    if (!s?.pos) continue;
    const dist = Math.hypot((s.pos.x || 0) - centerX, (s.pos.z || 0) - centerZ);
    if (dist > maxAbs && dist < 14000) maxAbs = dist;
  }
  const span = Math.max(2400, maxAbs * 1.12);
  const scale = (size * 0.45) / span;
  return { x, y, size, centerX, centerZ, span, scale };
}

export function radarScreenToWorld(radarRect, clientX, clientY) {
  if (!radarRect) return null;
  const { x, y, size, centerX, centerZ, scale } = radarRect;
  if (clientX < x || clientX > x + size || clientY < y || clientY > y + size) return null;
  const rx = clientX - (x + size * 0.5);
  const ry = clientY - (y + size * 0.5);
  return {
    wx: centerX + rx / scale,
    wz: centerZ + ry / scale,
  };
}

export function drawSectorRadarMinimap(g, {
  w,
  h,
  state,
  network,
  mapMode = 'standard',
  selectedSet = new Set(),
  hoveredAsteroidId = null,
}) {
  const radar = computeSectorRadarViewport({ w, h, state, network });
  const { x, y, size, centerX, centerZ, scale } = radar;
  const cx = x + size * 0.5;
  const cy = y + size * 0.5;

  g.save();
  g.fillStyle = 'rgba(11, 16, 20, 0.9)';
  g.strokeStyle = 'rgba(90, 200, 250, 0.42)';
  g.lineWidth = 1.25;
  g.beginPath();
  g.roundRect(x, y, size, size, 8);
  g.fill();
  g.stroke();

  g.beginPath();
  g.rect(x + 2, y + 2, size - 4, size - 4);
  g.clip();

  // Concentric range rings & axis hairline
  g.strokeStyle = 'rgba(140, 224, 255, 0.12)';
  g.lineWidth = 1;
  for (const rFrac of [0.22, 0.44]) {
    g.beginPath();
    g.arc(cx, cy, size * rFrac, 0, Math.PI * 2);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(cx, y + 4);
  g.lineTo(cx, y + size - 4);
  g.moveTo(x + 4, cy);
  g.lineTo(x + size - 4, cy);
  g.stroke();

  const siteByAstId = new Map();
  const sitePosById = new Map();
  for (const s of network?.sites || []) {
    if (s.asteroidId != null) siteByAstId.set(s.asteroidId, s);
    if (s.siteId && s.pos) sitePosById.set(s.siteId, s.pos);
  }

  // Inter-asteroid links on radar
  g.lineWidth = 1.1;
  for (const l of network?.links || []) {
    const p1 = sitePosById.get(l.fromSiteId);
    const p2 = sitePosById.get(l.toSiteId);
    if (!p1 || !p2) continue;
    g.strokeStyle = l.kind === 'power' ? 'rgba(242, 185, 73, 0.55)' : 'rgba(90, 200, 250, 0.55)';
    g.beginPath();
    g.moveTo(cx + (p1.x - centerX) * scale, cy + (p1.z - centerZ) * scale);
    g.lineTo(cx + (p2.x - centerX) * scale, cy + (p2.z - centerZ) * scale);
    g.stroke();
  }

  // Entities on radar
  if (state?.entities?.values) {
    for (const e of state.entities.values()) {
      if (!e || e.alive === false || !e.pos) continue;
      const rx = cx + (e.pos.x - centerX) * scale;
      const ry = cy + (e.pos.z - centerZ) * scale;
      if (e.type === 'station') {
        g.fillStyle = '#4ce0a7';
        g.fillRect(rx - 3, ry - 3, 6, 6);
      } else if (e.type === 'asteroid') {
        const site = siteByAstId.get(e.id);
        const isSel = selectedSet.has(e.id);
        const isHov = hoveredAsteroidId === e.id;
        if (site) {
          const netMw = (site.totalPowerGenMw || 0) - (site.totalPowerDrawMw || 0);
          g.fillStyle = mapMode === 'power_thermal' && netMw < 0 ? '#ff6b6b' : '#5ac8fa';
          g.beginPath();
          g.arc(rx, ry, isSel ? 3.2 : 2.3, 0, Math.PI * 2);
          g.fill();
        } else {
          g.fillStyle = isSel ? '#f2b949' : (isHov ? '#ffffff' : 'rgba(200, 184, 154, 0.42)');
          g.fillRect(rx - 1, ry - 1, 2, 2);
        }
        if (isSel) {
          g.strokeStyle = '#ffffff';
          g.lineWidth = 1;
          g.strokeRect(rx - 4, ry - 4, 8, 8);
        }
      }
    }
  }

  // Player / Ship anchor
  g.fillStyle = '#f2b949';
  g.beginPath();
  g.arc(cx, cy, 3.2, 0, Math.PI * 2);
  g.fill();

  // Camera pan offset reticle on radar
  const camState = state?.render?.cameraCtrl?.getFieldBuildState?.();
  if (camState) {
    const panX = cx + (Number(camState.panX) || 0) * scale;
    const panY = cy + (Number(camState.panZ) || 0) * scale;
    g.strokeStyle = 'rgba(255, 255, 255, 0.72)';
    g.lineWidth = 1.1;
    g.strokeRect(panX - 11, panY - 8, 22, 16);
  }

  g.font = '700 11px sans-serif';
  g.fillStyle = '#8ce0ff';
  g.textAlign = 'left';
  g.fillText('SECTOR RADAR', x + 8, y + 14);
  g.restore();
  return radar;
}

function drawHoveredAsteroidReticle(g, row, w, h) {
  if (!row) return;
  const bw = 204;
  const bh = row.site ? 56 : 42;
  const bx = Math.min(w - bw - 420, Math.max(16, row.x + row.radiusPx + 14));
  const by = Math.min(h - bh - 104, Math.max(96, row.y - bh * 0.5));
  g.save();
  g.fillStyle = 'rgba(13, 18, 22, 0.92)';
  g.strokeStyle = row.site ? 'rgba(90, 200, 250, 0.55)' : 'rgba(242, 185, 73, 0.5)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.roundRect(bx, by, bw, bh, 7);
  g.fill();
  g.stroke();

  g.textAlign = 'left';
  g.font = '700 12px sans-serif';
  g.fillStyle = row.site ? '#8ce0ff' : '#f2b949';
  const head = row.site
    ? `${row.site.specialization?.label || 'Claim'} (${row.site.directive?.short || 'STD'})`
    : `Unclaimed Rock · ${row.glyph}`;
  g.fillText(head, bx + 9, by + 17);

  g.font = '500 12px monospace';
  g.fillStyle = '#d8d3c8';
  if (row.site) {
    const netMw = Math.round((row.site.totalPowerGenMw || 0) - (row.site.totalPowerDrawMw || 0));
    g.fillText(`${netMw >= 0 ? '+' : ''}${netMw} MW · ${row.site.storedU} units · ${row.site.drones?.length || 0} drn`, bx + 9, by + 33);
    g.fillStyle = '#92b4c7';
    g.fillText('Click inspect · [2] Link · [8] Works', bx + 9, by + 48);
  } else {
    g.fillText('Click inspect · [1] Auto-rig', bx + 9, by + 33);
  }
  g.restore();
}

export function renderFieldTacticalCanvas({
  g,
  w,
  h,
  dpr,
  animTime,
  state,
  cam,
  fo,
  network,
  activeTool,
  mapMode = 'standard',
  selectedAsteroidId = null,
  selectedAsteroidIds = [],
  hoveredAsteroidId = null,
  linkSourceSiteId = null,
  marqueeBox = null,
  mouseX = 0,
  mouseY = 0,
}) {
  const projectedAsteroids = [];
  const projectedBySiteId = new Map();
  if (!g) return { projectedAsteroids, projectedBySiteId };

  g.save();
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const selectedSet = new Set(Array.isArray(selectedAsteroidIds) ? selectedAsteroidIds : []);
  if (selectedAsteroidId != null) selectedSet.add(selectedAsteroidId);

  const siteByAstId = new Map();
  for (const s of network.sites || []) {
    if (s.asteroidId != null) siteByAstId.set(s.asteroidId, s);
  }

  // 1. Project alive in-sector asteroids
  const entByAstId = new Map();
  if (state?.entities?.values) {
    for (const e of state.entities.values()) {
      if (!e || e.alive === false || e.type !== 'asteroid' || !e.pos) continue;
      entByAstId.set(e.id, e);
      const p = projectFramePoint(cam, e.pos.x - fo.x, 0, e.pos.z - fo.z, w, h);
      if (!p || p.x < -80 || p.x > w + 80 || p.y < -80 || p.y > h + 80) continue;
      const site = siteByAstId.get(e.id) || null;
      const row = {
        asteroidId: e.id,
        x: p.x,
        y: p.y,
        worldPos: e.pos,
        radiusPx: Math.max(14, Math.min(34, (e.radius || 8) * 1.45)),
        typeId: e.data?.typeId || 'ast_common_rock',
        glyph: ASTEROID_SCAN_GLYPH_BY_TYPE[e.data?.typeId] || 'Si',
        site,
      };
      projectedAsteroids.push(row);
      if (site?.siteId) projectedBySiteId.set(site.siteId, row);
    }
  }

  // 2. Project stations
  const stationScreenById = new Map();
  if (state?.entities?.values) {
    for (const e of state.entities.values()) {
      if (!e || e.alive === false || e.type !== 'station' || !e.pos) continue;
      const stId = e.data?.stationId || e.data?.id;
      if (!stId) continue;
      const p = projectFramePoint(cam, e.pos.x - fo.x, 0, e.pos.z - fo.z, w, h);
      if (p) stationScreenById.set(stId, p);
    }
  }

  // 3. Draw link-range ring around source or selected claimed asteroid when linking or inspecting
  const rangeFocusSiteId = linkSourceSiteId || (selectedAsteroidId != null ? siteByAstId.get(selectedAsteroidId)?.siteId : null);
  if (rangeFocusSiteId && (activeTool === 'link_material' || activeTool === 'link_power' || mapMode === 'supply_flow')) {
    const srcProj = projectedBySiteId.get(rangeFocusSiteId);
    const srcSite = srcProj?.site;
    if (srcProj && srcSite?.pos) {
      const hasRelay = (srcSite.defenses || []).some((d) => d?.kind === 'mass_relay');
      const rangeWu = SITE_BALANCE.linkRangeWu * (hasRelay ? (BELT_ORBITAL_STRUCTURES.mass_relay?.linkRangeMult || 1.75) : 1);
      const edge = projectFramePoint(cam, (srcSite.pos.x - fo.x) + rangeWu, 0, srcSite.pos.z - fo.z, w, h);
      if (edge) {
        const pxRadius = Math.max(40, Math.hypot(edge.x - srcProj.x, edge.y - srcProj.y));
        g.save();
        g.setLineDash([8, 8]);
        g.strokeStyle = activeTool === 'link_power' ? 'rgba(242, 185, 73, 0.28)' : 'rgba(90, 200, 250, 0.28)';
        g.lineWidth = 1.25;
        g.beginPath();
        g.arc(srcProj.x, srcProj.y, pxRadius, 0, Math.PI * 2);
        g.stroke();
        g.restore();
      }
    }
  }

  // 4. Station courier trade vectors & live in-flight pods
  g.save();
  g.lineWidth = 1.4;
  const nowS = Number(state?.simTime) || 0;
  for (const siteNode of network.sites || []) {
    const from = projectedBySiteId.get(siteNode.siteId);
    const destId = siteNode.courier?.destinationId || siteNode.courier?.stations?.[0]?.id;
    const to = destId ? stationScreenById.get(destId) : null;
    if (!from || !to) continue;
    g.setLineDash([6, 6]);
    g.strokeStyle = mapMode === 'supply_flow' ? 'rgba(76, 224, 167, 0.52)' : 'rgba(76, 224, 167, 0.28)';
    g.beginPath();
    g.moveTo(from.x, from.y);
    g.lineTo(to.x, to.y);
    g.stroke();

    // Animated courier pods currently in transit
    const inFlight = siteNode.fleet?.inFlight || [];
    if (inFlight.length) {
      g.setLineDash([]);
      for (const pod of inFlight) {
        const podTo = (pod.stationId && stationScreenById.get(pod.stationId)) || to;
        const launchT = Number(pod.launchT) || 0;
        const arriveT = Math.max(launchT + 1, Number(pod.arriveT) || launchT + 10);
        const prog = Math.max(0.05, Math.min(0.95, (nowS - launchT) / (arriveT - launchT)));
        const px = from.x + (podTo.x - from.x) * prog;
        const py = from.y + (podTo.y - from.y) * prog;
        const ang = Math.atan2(podTo.y - from.y, podTo.x - from.x);
        g.save();
        g.translate(px, py);
        g.rotate(ang);
        g.fillStyle = pod.lost ? '#ff6b6b' : '#4ce0a7';
        g.beginPath();
        g.moveTo(6, 0);
        g.lineTo(-4, -3.5);
        g.lineTo(-2, 0);
        g.lineTo(-4, 3.5);
        g.closePath();
        g.fill();
        g.restore();
      }
    }
  }
  g.restore();

  // 5. Inter-asteroid Mindustry conduits
  for (const link of network.links || []) {
    const from = projectedBySiteId.get(link.fromSiteId);
    const to = projectedBySiteId.get(link.toSiteId);
    if (!from || !to) continue;
    const isPower = link.kind === 'power';
    const emphasis = (mapMode === 'power_thermal' && isPower) || (mapMode === 'supply_flow' && !isPower);
    g.strokeStyle = isPower
      ? (emphasis ? 'rgba(242, 185, 73, 0.92)' : 'rgba(242, 185, 73, 0.56)')
      : (emphasis ? 'rgba(90, 200, 250, 0.95)' : 'rgba(90, 200, 250, 0.65)');
    g.lineWidth = emphasis ? 3.2 : (isPower ? 1.8 : 2.2);
    g.beginPath();
    g.moveTo(from.x, from.y);
    g.lineTo(to.x, to.y);
    g.stroke();

    // Animated pulses along conduit
    const pulseCount = emphasis ? 2 : 1;
    for (let k = 0; k < pulseCount; k++) {
      const phase = (animTime * (isPower ? 1.2 : 0.78) + k * 0.5) % 1;
      const px = from.x + (to.x - from.x) * phase;
      const py = from.y + (to.y - from.y) * phase;
      g.fillStyle = isPower ? '#f2b949' : '#8ce0ff';
      g.beginPath();
      g.arc(px, py, emphasis ? 4.4 : 3.4, 0, Math.PI * 2);
      g.fill();
    }

    const mx = (from.x + to.x) * 0.5;
    const my = (from.y + to.y) * 0.5;
    g.font = '600 12px monospace';
    g.textAlign = 'center';
    g.fillStyle = isPower ? '#f2b949' : '#9ee3ff';
    const label = isPower ? `${link.ratePerMin || 0} MW` : `${link.ratePerMin || 0} units per minute`;
    g.fillText(label, mx, my - 7);
  }

  // 6. Ghost preview line when in link tool
  if ((activeTool === 'link_material' || activeTool === 'link_power') && linkSourceSiteId) {
    const src = projectedBySiteId.get(linkSourceSiteId);
    if (src) {
      const hoverRow = hoveredAsteroidId != null ? projectedAsteroids.find((a) => a.asteroidId === hoveredAsteroidId) : null;
      const tx = hoverRow ? hoverRow.x : mouseX;
      const ty = hoverRow ? hoverRow.y : mouseY;
      g.save();
      g.setLineDash([5, 5]);
      g.strokeStyle = activeTool === 'link_power' ? '#f2b949' : '#5ac8fa';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(src.x, src.y);
      g.lineTo(tx, ty);
      g.stroke();
      g.restore();
    }
  }

  // 7. Autonomous Belt Drones & Orbital Megastructure Satellites
  for (const a of projectedAsteroids) {
    if (!a.site) continue;
    const siteNode = a.site;
    const orbitBaseR = a.radiusPx + 14;

    // Orbiting Megastructure nodes
    const defs = siteNode.defenses || [];
    for (let i = 0; i < defs.length; i++) {
      const def = defs[i];
      const spec = BELT_ORBITAL_STRUCTURES[def.kind];
      const ang = (Math.PI * 2 * i) / Math.max(1, defs.length) + animTime * 0.14;
      const dx = a.x + Math.cos(ang) * orbitBaseR;
      const dy = a.y + Math.sin(ang) * orbitBaseR;
      const col = spec?.role === 'power'
        ? '#f2b949'
        : (spec?.role === 'defense'
          ? '#ff8570'
          : (spec?.role === 'fleet' ? '#c79dff' : '#6ceab8'));
      g.fillStyle = col;
      g.beginPath();
      g.arc(dx, dy, 3.2, 0, Math.PI * 2);
      g.fill();
    }

    // Autonomous Fleet Drones
    const drones = siteNode.drones || [];
    for (let i = 0; i < drones.length; i++) {
      const dr = drones[i];
      if (dr.kind === 'harvester') {
        const tgtAst = dr.targetAsteroidId != null ? projectedAsteroids.find((x) => x.asteroidId === dr.targetAsteroidId) : null;
        if (tgtAst) {
          const tripT = 0.5 + 0.5 * Math.sin(animTime * 1.4 + i);
          const hx = a.x + (tgtAst.x - a.x) * tripT;
          const hy = a.y + (tgtAst.y - a.y) * tripT;
          g.save();
          g.setLineDash([2, 4]);
          g.strokeStyle = 'rgba(242, 185, 73, 0.35)';
          g.beginPath();
          g.moveTo(a.x, a.y);
          g.lineTo(tgtAst.x, tgtAst.y);
          g.stroke();
          g.restore();
          g.fillStyle = '#f2b949';
          g.fillRect(hx - 3, hy - 3, 6, 6);
          continue;
        }
      }
      const dAng = animTime * (dr.kind === 'patrol' ? 1.35 : 0.85) + i * 2.1;
      const drR = orbitBaseR + 8;
      const hx = a.x + Math.cos(dAng) * drR;
      const hy = a.y + Math.sin(dAng) * drR;
      g.fillStyle = dr.kind === 'patrol' ? '#6ceab8' : '#7cd4fc';
      g.beginPath();
      g.arc(hx, hy, 3.5, 0, Math.PI * 2);
      g.fill();
    }
  }

  // 8. Asteroid Tactical Nodes, Map-Mode Overlays & Labels
  let activeCutawayNode = null;
  for (const a of projectedAsteroids) {
    const isSelected = selectedSet.has(a.asteroidId);
    const isHovered = a.asteroidId === hoveredAsteroidId;
    const baseColor = ASTEROID_COLOR_BY_TYPE[a.typeId] || '#c8b89a';

    if (a.site) {
      if (a.asteroidId === selectedAsteroidId || (isHovered && !activeCutawayNode)) {
        activeCutawayNode = a.site;
      }

      const defs = a.site.defenses || [];
      if (defs.length || mapMode === 'defense_threat') {
        const hasShield = defs.some((d) => d.kind === 'shield_dome');
        const hasWeapon = defs.some((d) => d.kind === 'turret' || d.kind === 'flak_battery');
        const hasSensor = defs.some((d) => d.kind === 'sensor');
        g.strokeStyle = hasShield ? 'rgba(90, 200, 250, 0.65)' : 'rgba(108, 234, 184, 0.36)';
        g.lineWidth = hasShield ? 2 : 1.25;
        g.beginPath();
        g.arc(a.x, a.y, a.radiusPx + 14, 0, Math.PI * 2);
        g.stroke();
        if (mapMode === 'defense_threat' && (hasWeapon || hasSensor)) {
          g.save();
          if (hasWeapon) {
            g.setLineDash([4, 6]);
            g.strokeStyle = 'rgba(255, 133, 112, 0.38)';
            g.beginPath();
            g.arc(a.x, a.y, a.radiusPx + 36, 0, Math.PI * 2);
            g.stroke();
          }
          if (hasSensor) {
            const sweep = animTime * 1.1;
            g.setLineDash([]);
            g.fillStyle = 'rgba(90, 200, 250, 0.08)';
            g.beginPath();
            g.moveTo(a.x, a.y);
            g.arc(a.x, a.y, a.radiusPx + 48, sweep, sweep + 0.7);
            g.closePath();
            g.fill();
          }
          g.restore();
        }
      }

      const r = a.radiusPx + (isSelected ? 5 : 2);
      const netMw = (a.site.totalPowerGenMw || 0) - (a.site.totalPowerDrawMw || 0);
      let hexStroke = isSelected ? '#ffffff' : '#5ac8fa';
      if (mapMode === 'power_thermal') {
        hexStroke = netMw < 0 ? '#ff6b6b' : (a.site.thermal?.worstBand === 'fault' ? '#ff964f' : '#4ce0a7');
      } else if (mapMode === 'defense_threat') {
        const rating = a.site.synergies?.summary?.orbitalDefenseRating || 0;
        hexStroke = rating > 0 ? '#6ceab8' : '#f2b949';
      }

      g.strokeStyle = hexStroke;
      g.lineWidth = isSelected ? 2.6 : 1.9;
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI / 3) * i - Math.PI / 6;
        const hx = a.x + Math.cos(ang) * r;
        const hy = a.y + Math.sin(ang) * r;
        if (i === 0) g.moveTo(hx, hy);
        else g.lineTo(hx, hy);
      }
      g.closePath();
      g.stroke();

      // Mode-aware pill text above hex
      g.font = '700 12px sans-serif';
      g.textAlign = 'center';
      let label = `${a.site.specialization?.tag || 'SITE'} · ${a.site.storedU} units`;
      if (mapMode === 'power_thermal') {
        label = `${netMw >= 0 ? '+' : ''}${Math.round(netMw)} MW · ${a.site.thermal?.worstBand?.toUpperCase() || 'OK'}`;
      } else if (mapMode === 'defense_threat') {
        label = `DEF ${(a.site.synergies?.summary?.orbitalDefenseRating || 0)} · DRN ${(a.site.drones?.length || 0)}`;
      } else if (mapMode === 'supply_flow') {
        label = `${a.site.directive?.short || 'STD'} · ${(a.site.links?.length || 0)} links`;
      }
      g.fillStyle = isSelected ? '#ffffff' : '#e8f7ff';
      g.fillText(label, a.x, a.y - r - 6);
    } else if (isSelected || isHovered || a.radiusPx >= 18) {
      const r = a.radiusPx + (isSelected ? 4 : 0);
      g.strokeStyle = isSelected ? '#f2b949' : (isHovered ? '#ffffff' : baseColor);
      g.globalAlpha = isSelected || isHovered ? 0.94 : 0.45;
      g.lineWidth = isSelected ? 2.2 : 1.25;
      g.beginPath();
      g.arc(a.x, a.y, r, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
      if (isSelected || isHovered) {
        g.font = '600 12px monospace';
        g.textAlign = 'center';
        g.fillStyle = baseColor;
        g.fillText(a.glyph, a.x, a.y - r - 6);
      }
    }
  }

  // 9. Floating Mini-Cutaway Schematic for selected/hovered claimed asteroid
  if (activeCutawayNode) {
    drawCutawayInset(g, activeCutawayNode, w, h);
  }

  // 10. Hovered Asteroid Tactical Callout
  if (hoveredAsteroidId != null && !marqueeBox?.active) {
    const hRow = projectedAsteroids.find((r) => r.asteroidId === hoveredAsteroidId) || null;
    drawHoveredAsteroidReticle(g, hRow, w, h);
  }

  // 11. Sector Radar Minimap (bottom-left)
  const radarRect = drawSectorRadarMinimap(g, {
    w, h, state, network, mapMode, selectedSet, hoveredAsteroidId,
  });

  // 12. Marquee Box-Selection rectangle
  if (marqueeBox && marqueeBox.active) {
    const rx = Math.min(marqueeBox.startX, marqueeBox.curX);
    const ry = Math.min(marqueeBox.startY, marqueeBox.curY);
    const rw = Math.abs(marqueeBox.curX - marqueeBox.startX);
    const rh = Math.abs(marqueeBox.curY - marqueeBox.startY);
    if (rw > 4 || rh > 4) {
      g.fillStyle = 'rgba(90, 200, 250, 0.14)';
      g.strokeStyle = '#5ac8fa';
      g.lineWidth = 1.5;
      g.fillRect(rx, ry, rw, rh);
      g.strokeRect(rx, ry, rw, rh);
    }
  }

  g.restore();
  return { projectedAsteroids, projectedBySiteId, radarRect };
}
