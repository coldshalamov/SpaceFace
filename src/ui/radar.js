// Radar / minimap (ARCHITECTURE §5, spec "Radar/minimap") — a 180px <canvas> in the HUD
// corner redrawn at ~20Hz. Player fixed at center; world entities projected via radarRange.
// Blips colored by team/faction; off-range contacts clamp to the edge as hollow chevrons;
// the current target gets a ring. Canvas is DPI-scaled so blips stay crisp on 4K/Retina.
//
// Formulas (§ spec): bx = C - (e.x-p.x)/range*R ; by = C - (e.z-p.z)/range*R.
// NOTE: BOTH axes are negated vs. a naïve projection. The chase cam sits at +Y/-Z looking toward
// +Z with up = +Y, so world +Z reads as screen UP (canvas +y is down) and world +X reads as screen
// LEFT. Mirroring both keeps the radar oriented exactly as the player sees the world — otherwise
// contacts (and the heading marker) flip left/right or up/down relative to the viewport.

import { semanticColor, semanticShape } from './accessibility.js';

const SIZE = 180;       // CSS px
const C = SIZE / 2;     // center
const R = 88;           // usable radius (px)

// Faction blip colors (spec "FACTION BLIP COLORS"), keyed by faction id; fallback by team.
const FACTION_COLOR = {
  faction_scn: '#4DA8FF', faction_mts: '#46E08A', faction_dmc: '#C9772E',
  faction_reach: '#FF4D5E', faction_quiet: '#B06CFF', faction_vael: '#2FCFA0',
  faction_free: '#4ECBE0', faction_choir: '#E85FD0',
};
const COL = {
  player: '#39d0ff', hostile: '#ff5470', neutral: '#9aa8bc',
  asteroid: '#6e7b8c', pickup: '#ffe36b', station: '#7af7d0', gate: '#b99cff',
  objective: '#ffe36b', ring: '#1d3350',
};

// Classify a ship/drone blip into a semantic state (drives the colorblind palette + redundant shape).
function shipState(e, playerTeam) {
  if (e.team !== playerTeam && e.team !== 0) return 'hostile';
  if (e.factionId && FACTION_COLOR[e.factionId]) return 'friendly';
  return 'neutral';
}

function blipColor(e, playerTeam, mode) {
  if (e.type === 'asteroid') return COL.asteroid;
  if (e.type === 'pickup') return COL.pickup;
  if (e.type === 'station') {
    if (e.data && e.data.isGate) return COL.gate;
    return e.factionId && FACTION_COLOR[e.factionId] ? FACTION_COLOR[e.factionId] : COL.station;
  }
  // ships / drones — when a colorblind mode is active, use the colorblind-safe semantic palette.
  if (mode && mode !== 'none') return semanticColor(shipState(e, playerTeam), mode);
  if (e.factionId && FACTION_COLOR[e.factionId]) {
    // color hostiles red regardless of faction tint when clearly enemy team
    if (e.team !== playerTeam && e.team !== 0) return COL.hostile;
    return FACTION_COLOR[e.factionId];
  }
  if (e.team !== playerTeam && e.team !== 0) return COL.hostile;
  return COL.neutral;
}

// Redundant blip shape so hostility is readable without color (colorblind mode). Caller sets fillStyle.
function drawShipShape(g, x, y, shape) {
  if (shape === 'triangle') { g.beginPath(); g.moveTo(x, y - 2.4); g.lineTo(x + 2.2, y + 2); g.lineTo(x - 2.2, y + 2); g.closePath(); g.fill(); }
  else if (shape === 'diamond') { g.beginPath(); g.moveTo(x, y - 2.4); g.lineTo(x + 2.4, y); g.lineTo(x, y + 2.4); g.lineTo(x - 2.4, y); g.closePath(); g.fill(); }
  else g.fillRect(x - 1.6, y - 1.6, 3.2, 3.2);
}

export function createRadar(ctx) {
  const { state } = ctx;
  const wrap = document.createElement('div');
  wrap.className = 'sf-radar-wrap';
  const dial = document.createElement('div');
  dial.className = 'sf-radar';
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = SIZE * dpr;
  canvas.height = SIZE * dpr;
  canvas.style.width = SIZE + 'px';
  canvas.style.height = SIZE + 'px';
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  dial.appendChild(canvas);
  const legend = document.createElement('div');
  legend.className = 'sf-radar-legend';
  legend.innerHTML = ''
    + '<span><i class="stn"></i>Station</span>'
    + '<span><i class="gate"></i>Gate</span>'
    + '<span><i class="rock"></i>Rock</span>'
    + '<span><i class="bad"></i>Hostile</span>'
    + '<span><i class="obj"></i>Goal</span>';
  wrap.append(dial, legend);

  function draw() {
    const p = state.entities.get(state.playerId);
    const range = state.ui.radarRange || 4000;
    g.clearRect(0, 0, SIZE, SIZE);

    // backdrop disc
    g.fillStyle = 'rgba(6,12,22,0.62)';
    g.beginPath(); g.arc(C, C, R + 4, 0, Math.PI * 2); g.fill();

    // concentric rings at 25/50/100%
    g.strokeStyle = COL.ring; g.lineWidth = 1;
    for (const f of [0.25, 0.5, 1.0]) { g.beginPath(); g.arc(C, C, R * f, 0, Math.PI * 2); g.stroke(); }
    // crosshair
    g.strokeStyle = 'rgba(57,208,255,0.12)';
    g.beginPath(); g.moveTo(C, C - R); g.lineTo(C, C + R); g.moveTo(C - R, C); g.lineTo(C + R, C); g.stroke();

    // decorative outer border ring with cardinal tick marks
    g.strokeStyle = 'rgba(57,208,255,0.25)';
    g.lineWidth = 1;
    g.beginPath(); g.arc(C, C, R + 6, 0, Math.PI * 2); g.stroke();
    // tick marks at N/S/E/W (4px lines pointing inward)
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(C, C - R - 6); g.lineTo(C, C - R - 2);           // N
    g.moveTo(C, C + R + 6); g.lineTo(C, C + R + 2);           // S
    g.moveTo(C + R + 6, C); g.lineTo(C + R + 2, C);           // E
    g.moveTo(C - R - 6, C); g.lineTo(C - R - 2, C);           // W
    g.stroke();
    // "N" label at top
    g.fillStyle = 'rgba(57,208,255,0.35)';
    g.font = '7px monospace';
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    g.fillText('N', C, C - R - 7);

    // scan sweep effect — rotating 5-degree wedge
    const sweepAngle = ((Date.now() % 3000) / 3000) * Math.PI * 2;
    g.save();
    g.beginPath();
    g.moveTo(C, C);
    g.arc(C, C, R, sweepAngle, sweepAngle + 0.087);  // ~5 degrees in radians
    g.closePath();
    g.fillStyle = 'rgba(57,208,255,0.08)';
    g.fill();
    g.restore();

    if (!p) return;
    const px = p.pos.x, pz = p.pos.z;
    const targetId = state.player.targetId;
    const playerTeam = p.team;
    const cbMode = (state.settings.accessibility && state.settings.accessibility.colorblindMode) || 'none';

    // weapon/mining range ring
    const weaponRange = state.player.weaponRange;
    const rngRatio = weaponRange ? Math.min(weaponRange / range, 1) : 0.6;
    const rngR = R * rngRatio;
    g.save();
    g.strokeStyle = 'rgba(57,208,255,0.15)';
    g.lineWidth = 1;
    g.setLineDash([3, 4]);
    g.beginPath(); g.arc(C, C, rngR, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    g.restore();
    // "RNG" label at top of range ring
    g.fillStyle = 'rgba(57,208,255,0.22)';
    g.font = '6px monospace';
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    g.fillText('RNG', C, C - rngR - 1);

    const list = state.entityList;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive || e === p) continue;
      if (e.type === 'projectile' || e.type === 'fx') continue;
      const dx = e.pos.x - px, dz = e.pos.z - pz;
      const dist = Math.hypot(dx, dz);
      const col = blipColor(e, playerTeam, cbMode);
      let bx, by, off = false;
      if (dist > range) {
        off = true;
        // -dz: world +Z is up on screen. -dx: the chase cam looks toward +Z with up=+Y, so world +X
        // projects to screen LEFT — the minimap must mirror X to match what the player sees.
        const a = Math.atan2(-dz, -dx);
        bx = C + Math.cos(a) * R; by = C + Math.sin(a) * R;
      } else {
        bx = C - (dx / range) * R; by = C - (dz / range) * R;   // both axes mirrored to match the screen
      }
      g.fillStyle = col; g.strokeStyle = col;
      if (off) {
        // hollow chevron at edge — same -dz/-dx convention as the blip projection above
        const a = Math.atan2(-dz, -dx);
        g.save(); g.translate(bx, by); g.rotate(a);
        g.lineWidth = 1.5; g.beginPath();
        g.moveTo(-3, -3); g.lineTo(2, 0); g.lineTo(-3, 3); g.stroke();
        g.restore();
      } else if (e.type === 'pickup') {
        g.save();
        g.globalAlpha = 0.55 + 0.45 * Math.sin(Date.now() * 0.005);
        g.beginPath(); g.moveTo(bx, by - 3); g.lineTo(bx + 3, by); g.lineTo(bx, by + 3); g.lineTo(bx - 3, by); g.closePath(); g.fill();
        g.restore();
      } else if (e.type === 'asteroid') {
        g.beginPath(); g.moveTo(bx, by - 1.5); g.lineTo(bx + 1.5, by); g.lineTo(bx, by + 1.5); g.lineTo(bx - 1.5, by); g.closePath(); g.fill();
      } else if (e.type === 'station') {
        if (e.data && e.data.isGate) {
          // double ring (two concentric circles with gap)
          g.lineWidth = 1.2;
          g.beginPath(); g.arc(bx, by, 2.5, 0, Math.PI * 2); g.stroke();
          g.beginPath(); g.arc(bx, by, 4.5, 0, Math.PI * 2); g.stroke();
        } else {
          // square with inner dot
          g.fillRect(bx - 2.5, by - 2.5, 5, 5);
          g.fillStyle = 'rgba(0,0,0,0.5)';
          g.beginPath(); g.arc(bx, by, 1.5, 0, Math.PI * 2); g.fill();
          g.fillStyle = col;  // restore for target ring etc.
        }
      } else {
        // ship/drone — colorblind mode uses semantic shapes; normal mode draws directional triangles
        if (cbMode !== 'none') {
          drawShipShape(g, bx, by, semanticShape(shipState(e, playerTeam)));
        } else {
          // directional triangle pointing along entity's movement/rotation
          const eRot = (e.vel && (e.vel.x !== 0 || e.vel.z !== 0))
            ? Math.atan2(e.vel.z, e.vel.x) : (e.rot || 0);
          g.save(); g.translate(bx, by); g.rotate(Math.PI + eRot);
          g.beginPath(); g.moveTo(3, 0); g.lineTo(-2.5, -2.2); g.lineTo(-2.5, 2.2); g.closePath(); g.fill();
          g.restore();
        }
      }
      if (e.id === targetId) {
        g.strokeStyle = '#fff'; g.lineWidth = 1.2;
        g.beginPath(); g.arc(bx, by, 5, 0, Math.PI * 2); g.stroke();
      }
    }

    // Active navigation/objective marker. This is deliberately bright and shape-distinct so a
    // first-time player can connect "yellow arrow/readout" with the radar.
    const wp = state.nav && state.nav.waypoint;
    const pos = wp && wp.pos;
    if (pos) {
      const dx = pos.x - px, dz = pos.z - pz;
      const dist = Math.hypot(dx, dz);
      let bx, by;
      if (dist > range) {
        const a = Math.atan2(-dz, -dx);   // same -dz/-dx convention as blips
        bx = C + Math.cos(a) * R; by = C + Math.sin(a) * R;
      } else {
        bx = C - (dx / range) * R; by = C - (dz / range) * R;   // both axes mirrored to match the screen
      }
      g.save();
      g.strokeStyle = COL.objective;
      g.fillStyle = COL.objective;
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(bx, by - 5); g.lineTo(bx + 5, by); g.lineTo(bx, by + 5); g.lineTo(bx - 5, by); g.closePath();
      g.stroke();
      g.globalAlpha = 0.22;
      g.beginPath(); g.arc(bx, by, 9, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    // player marker — triangle pointing along heading. The nose faces world (cos rot, sin rot); the
    // minimap mirrors BOTH axes to match the screen (see blip projection above), so the nose projects
    // to canvas angle rot + π. Rotating the marker by rot + π (and drawing its tip on the +x side)
    // points the triangle along that same canvas direction.
    g.save(); g.translate(C, C); g.rotate(Math.PI + p.rot);
    // forward field-of-view cone (~30 degree spread, 15px reach, very faint)
    g.fillStyle = 'rgba(57,208,255,0.08)';
    g.beginPath();
    g.moveTo(5, 0);
    g.lineTo(20, -4);   // ~15px forward, ~30deg half-spread
    g.lineTo(20, 4);
    g.closePath();
    g.fill();
    // player triangle
    g.fillStyle = COL.player;
    g.beginPath(); g.moveTo(5, 0); g.lineTo(-4, -3.5); g.lineTo(-4, 3.5); g.closePath(); g.fill();
    g.restore();
  }

  return { el: wrap, draw };
}
