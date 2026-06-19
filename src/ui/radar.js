// Radar / minimap (ARCHITECTURE §5, spec "Radar/minimap") — a 180px <canvas> in the HUD
// corner redrawn at ~20Hz. Player fixed at center; world entities projected via radarRange.
// Blips colored by team/faction; off-range contacts clamp to the edge as hollow chevrons;
// the current target gets a ring. Canvas is DPI-scaled so blips stay crisp on 4K/Retina.
//
// Formulas (§ spec): px = 90 + (e.x-p.x)/range*90 ; py = 90 - (e.z-p.z)/range*90.
// NOTE: the vertical is negated vs. a naïve projection. The chase cam sits at +Y/-Z looking toward
// +Z, so world +Z reads as screen UP — the minimap must mirror that (canvas +y is down), otherwise
// everything is upside-down relative to what the player sees.

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

    if (!p) return;
    const px = p.pos.x, pz = p.pos.z;
    const targetId = state.player.targetId;
    const playerTeam = p.team;
    const cbMode = (state.settings.accessibility && state.settings.accessibility.colorblindMode) || 'none';

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
        const a = Math.atan2(-dz, dx);   // -dz: match the screen (world +Z is up on screen)
        bx = C + Math.cos(a) * R; by = C + Math.sin(a) * R;
      } else {
        bx = C + (dx / range) * R; by = C - (dz / range) * R;   // vertical mirrored to screen
      }
      g.fillStyle = col; g.strokeStyle = col;
      if (off) {
        // hollow chevron at edge
        const a = Math.atan2(-dz, dx);   // same -dz convention as the blip projection above
        g.save(); g.translate(bx, by); g.rotate(a);
        g.lineWidth = 1.5; g.beginPath();
        g.moveTo(-3, -3); g.lineTo(2, 0); g.lineTo(-3, 3); g.stroke();
        g.restore();
      } else if (e.type === 'pickup') {
        g.beginPath(); g.moveTo(bx, by - 2); g.lineTo(bx + 2, by); g.lineTo(bx, by + 2); g.lineTo(bx - 2, by); g.closePath(); g.fill();
      } else if (e.type === 'asteroid') {
        g.beginPath(); g.arc(bx, by, 1.4, 0, Math.PI * 2); g.fill();
      } else if (e.type === 'station') {
        if (e.data && e.data.isGate) {
          g.lineWidth = 1.6;
          g.beginPath(); g.arc(bx, by, 3.8, 0, Math.PI * 2); g.stroke();
        } else {
          g.fillRect(bx - 2.5, by - 2.5, 5, 5);
        }
      } else {
        // ship/drone — colorblind mode adds a redundant shape (hostile triangle / friendly diamond).
        if (cbMode !== 'none') drawShipShape(g, bx, by, semanticShape(shipState(e, playerTeam)));
        else g.fillRect(bx - 1.6, by - 1.6, 3.2, 3.2);
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
        const a = Math.atan2(-dz, dx);
        bx = C + Math.cos(a) * R; by = C + Math.sin(a) * R;
      } else {
        bx = C + (dx / range) * R; by = C - (dz / range) * R;
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

    // player marker — triangle pointing along heading. Negate rot: the minimap is vertically
    // mirrored to match the screen (see blip projection above), so a yaw that points the nose up on
    // screen must also point the marker up on the radar.
    g.save(); g.translate(C, C); g.rotate(-p.rot);
    g.fillStyle = COL.player;
    g.beginPath(); g.moveTo(5, 0); g.lineTo(-4, -3.5); g.lineTo(-4, 3.5); g.closePath(); g.fill();
    g.restore();
  }

  return { el: wrap, draw };
}
