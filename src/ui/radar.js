// Radar / minimap (ARCHITECTURE §5, spec "Radar/minimap") — a 180px <canvas> in the HUD
// corner redrawn at ~20Hz. Player fixed at center; world entities projected via radarRange.
// Blips colored by team/faction; off-range contacts clamp to the edge as hollow chevrons;
// the current target gets a ring. Canvas is DPI-scaled so blips stay crisp on 4K/Retina.
//
// Formulas (§ spec): px = 90 + (e.x-p.x)/range*90 ; py = 90 + (e.z-p.z)/range*90.

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
  asteroid: '#6e7b8c', pickup: '#ffe36b', station: '#7af7d0', ring: '#1d3350',
};

function blipColor(e, playerTeam) {
  if (e.type === 'asteroid') return COL.asteroid;
  if (e.type === 'pickup') return COL.pickup;
  if (e.type === 'station') return e.factionId && FACTION_COLOR[e.factionId] ? FACTION_COLOR[e.factionId] : COL.station;
  // ships / drones
  if (e.factionId && FACTION_COLOR[e.factionId]) {
    // color hostiles red regardless of faction tint when clearly enemy team
    if (e.team !== playerTeam && e.team !== 0) return COL.hostile;
    return FACTION_COLOR[e.factionId];
  }
  if (e.team !== playerTeam && e.team !== 0) return COL.hostile;
  return COL.neutral;
}

export function createRadar(ctx) {
  const { state } = ctx;
  const wrap = document.createElement('div');
  wrap.className = 'sf-radar';
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = SIZE * dpr;
  canvas.height = SIZE * dpr;
  canvas.style.width = SIZE + 'px';
  canvas.style.height = SIZE + 'px';
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  wrap.appendChild(canvas);

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

    const list = state.entityList;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive || e === p) continue;
      if (e.type === 'projectile' || e.type === 'fx') continue;
      const dx = e.pos.x - px, dz = e.pos.z - pz;
      const dist = Math.hypot(dx, dz);
      const col = blipColor(e, playerTeam);
      let bx, by, off = false;
      if (dist > range) {
        off = true;
        const a = Math.atan2(dz, dx);
        bx = C + Math.cos(a) * R; by = C + Math.sin(a) * R;
      } else {
        bx = C + (dx / range) * R; by = C + (dz / range) * R;
      }
      g.fillStyle = col; g.strokeStyle = col;
      if (off) {
        // hollow chevron at edge
        const a = Math.atan2(dz, dx);
        g.save(); g.translate(bx, by); g.rotate(a);
        g.lineWidth = 1.5; g.beginPath();
        g.moveTo(-3, -3); g.lineTo(2, 0); g.lineTo(-3, 3); g.stroke();
        g.restore();
      } else if (e.type === 'pickup') {
        g.beginPath(); g.moveTo(bx, by - 2); g.lineTo(bx + 2, by); g.lineTo(bx, by + 2); g.lineTo(bx - 2, by); g.closePath(); g.fill();
      } else if (e.type === 'asteroid') {
        g.beginPath(); g.arc(bx, by, 1.4, 0, Math.PI * 2); g.fill();
      } else if (e.type === 'station') {
        g.fillRect(bx - 2.5, by - 2.5, 5, 5);
      } else {
        g.fillRect(bx - 1.6, by - 1.6, 3.2, 3.2);
      }
      if (e.id === targetId) {
        g.strokeStyle = '#fff'; g.lineWidth = 1.2;
        g.beginPath(); g.arc(bx, by, 5, 0, Math.PI * 2); g.stroke();
      }
    }

    // player marker — triangle pointing along heading
    g.save(); g.translate(C, C); g.rotate(p.rot);
    g.fillStyle = COL.player;
    g.beginPath(); g.moveTo(5, 0); g.lineTo(-4, -3.5); g.lineTo(-4, 3.5); g.closePath(); g.fill();
    g.restore();
  }

  return { el: wrap, draw };
}
