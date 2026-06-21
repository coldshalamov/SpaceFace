// Radar / minimap (ARCHITECTURE §5, spec "Radar/minimap") — a 180px <canvas> in the HUD
// corner redrawn at ~20Hz. Player fixed at center; world entities projected via radarRange.
// Blips colored by team/faction; off-range contacts clamp to the edge as hollow chevrons;
// the current target gets a ring. Canvas is DPI-scaled so blips stay crisp on 4K/Retina.
//
// Click to expand: click the dial to toggle a 340px tactical view showing 2× range.
// Motion trails show recent ship movement paths. All blips use shadowBlur glow.
//
// Formulas (§ spec): bx = C - (e.x-p.x)/range*R ; by = C - (e.z-p.z)/range*R.
// NOTE: BOTH axes are negated vs. a naïve projection. The chase cam sits at +Y/-Z looking toward
// +Z with up = +Y, so world +Z reads as screen UP (canvas +y is down) and world +X reads as screen
// LEFT. Mirroring both keeps the radar oriented exactly as the player sees the world — otherwise
// contacts (and the heading marker) flip left/right or up/down relative to the viewport.

import { semanticColor, semanticShape } from './accessibility.js';

// ── dimensions ──────────────────────────────────────────────────────────────────────────────
// Canvas is always drawn at EXPAND_SIZE. The .sf-radar div transitions its width/height via CSS,
// and overflow:hidden + border-radius:50% clips it to a circle. As the div grows from 180→340px
// the canvas reveals from the center outward — a natural circular bloom with no JS timing needed.
const EXPAND_SIZE = 340;
const EXPAND_C    = EXPAND_SIZE / 2;   // 170
const EXPAND_R    = 165;

// ── colors ──────────────────────────────────────────────────────────────────────────────────
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

// ── blip helpers ────────────────────────────────────────────────────────────────────────────
function shipState(e, playerTeam) {
  if (e.team !== playerTeam && e.team !== 0) return 'hostile';
  if (e.factionId && FACTION_COLOR[e.factionId]) return 'friendly';
  return 'neutral';
}

function blipColor(e, playerTeam, mode) {
  if (e.type === 'asteroid') return COL.asteroid;
  if (e.type === 'pickup')   return COL.pickup;
  if (e.type === 'station') {
    if (e.data && e.data.isGate) return COL.gate;
    return e.factionId && FACTION_COLOR[e.factionId] ? FACTION_COLOR[e.factionId] : COL.station;
  }
  if (mode && mode !== 'none') return semanticColor(shipState(e, playerTeam), mode);
  if (e.factionId && FACTION_COLOR[e.factionId]) {
    if (e.team !== playerTeam && e.team !== 0) return COL.hostile;
    return FACTION_COLOR[e.factionId];
  }
  if (e.team !== playerTeam && e.team !== 0) return COL.hostile;
  return COL.neutral;
}

// Redundant blip shape so hostility is readable without color (colorblind mode). Caller sets fillStyle.
function drawShipShape(g, x, y, shape) {
  if (shape === 'triangle') {
    g.beginPath(); g.moveTo(x, y - 3); g.lineTo(x + 2.8, y + 2.5); g.lineTo(x - 2.8, y + 2.5); g.closePath(); g.fill();
  } else if (shape === 'diamond') {
    g.beginPath(); g.moveTo(x, y - 3); g.lineTo(x + 3, y); g.lineTo(x, y + 3); g.lineTo(x - 3, y); g.closePath(); g.fill();
  } else {
    g.fillRect(x - 2, y - 2, 4, 4);
  }
}

// ── glow helpers ────────────────────────────────────────────────────────────────────────────
function glow(g, color, blur)  { g.shadowColor = color; g.shadowBlur = blur; }
function noGlow(g)             { g.shadowBlur = 0; g.shadowColor = 'transparent'; }

// ── motion trails ───────────────────────────────────────────────────────────────────────────
// Per-ship position history: Map<entityId, [{x, z}]>, max TRAIL_MAX entries.
// Sampled when the ship has moved ≥ ~20 world units since the last recorded point.
const TRAIL_MAX = 7;
const trailMap  = new Map();

function updateTrail(e) {
  let hist = trailMap.get(e.id);
  if (!hist) { hist = []; trailMap.set(e.id, hist); }
  const last = hist[hist.length - 1];
  const dx = last ? e.pos.x - last.x : Infinity;
  const dz = last ? e.pos.z - last.z : Infinity;
  if (!last || dx * dx + dz * dz > 400) {   // ~20 world-unit threshold
    hist.push({ x: e.pos.x, z: e.pos.z });
    if (hist.length > TRAIL_MAX) hist.shift();
  }
}

function drawTrail(g, e, px, pz, range, C, R, col) {
  const hist = trailMap.get(e.id);
  if (!hist || hist.length < 2) return;
  g.save();
  g.lineWidth   = 1;
  g.shadowColor = col;
  g.shadowBlur  = 2;
  for (let i = 1; i < hist.length; i++) {
    g.globalAlpha = (i / hist.length) * 0.4;
    g.strokeStyle = col;
    const x0 = C - ((hist[i - 1].x - px) / range) * R;
    const y0 = C - ((hist[i - 1].z - pz) / range) * R;
    const x1 = C - ((hist[i].x     - px) / range) * R;
    const y1 = C - ((hist[i].z     - pz) / range) * R;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }
  g.restore();
}

// ── factory ─────────────────────────────────────────────────────────────────────────────────
export function createRadar(ctx) {
  const { state, bus } = ctx;

  const wrap = document.createElement('div');
  wrap.className = 'sf-radar-wrap';

  const dial = document.createElement('div');
  dial.className = 'sf-radar';
  dial.title = 'Click to expand tactical view';

  // canvas pair: main draw surface + pre-rendered static background.
  // Always at EXPAND_SIZE — CSS clips the dial div to the right circle via overflow:hidden.
  const dpr      = Math.min(window.devicePixelRatio || 1, 2);
  const canvas   = document.createElement('canvas');
  const bgCanvas = document.createElement('canvas');
  const px       = EXPAND_SIZE * dpr;
  canvas.width   = px; canvas.height   = px;
  canvas.style.width  = EXPAND_SIZE + 'px'; canvas.style.height = EXPAND_SIZE + 'px';
  bgCanvas.width = px; bgCanvas.height = px;
  const g  = canvas.getContext('2d');
  const bg = bgCanvas.getContext('2d');
  g.scale(dpr, dpr);
  bg.scale(dpr, dpr);
  drawBackground(bg, EXPAND_C, EXPAND_R);

  let expanded = false;
  dial.appendChild(canvas);

  // ── legend ────────────────────────────────────────────────────────────────────────────────
  const legend = document.createElement('div');
  legend.className = 'sf-radar-legend';
  legend.innerHTML = ''
    + '<span><i class="stn"></i>Station</span>'
    + '<span><i class="gate"></i>Gate</span>'
    + '<span><i class="rock"></i>Rock</span>'
    + '<span><i class="bad"></i>Hostile</span>'
    + '<span><i class="obj"></i>Goal</span>';
  wrap.append(dial, legend);

  // ── expanded toggle ───────────────────────────────────────────────────────────────────────
  // Toggling .sf-radar--expanded triggers the CSS width/height transition (300ms ease).
  // The canvas is always 340px; overflow:hidden + border-radius:50% clips it. As the div
  // grows from 180→340px the visible circle blooms outward from the player's position at center.
  // position:fixed lifts the wrap out of the rightdock flow so it doesn't push other elements.
  function setExpanded(v) {
    expanded = v;
    dial.classList.toggle('sf-radar--expanded', v);
    legend.style.display = v ? 'none' : '';
    wrap.style.cssText = v
      ? 'position:fixed;bottom:18px;right:18px;z-index:200;display:flex;flex-direction:column;align-items:center;gap:6px;'
      : '';
  }

  dial.addEventListener('click', () => setExpanded(!expanded));

  // Collapse on sector change — entity list and all trails are stale after a gate jump
  const onSectorEnter = () => { trailMap.clear(); if (expanded) setExpanded(false); };

  // ── contact list cache ────────────────────────────────────────────────────────────────────
  let contactList = [];
  let contactsDirty = true;
  let cachedEntityList = null, cachedLength = -1, cachedPlayerId = null;

  function markContactsDirty() { contactsDirty = true; }

  if (bus && bus.on) {
    bus.on('entity:spawned',   markContactsDirty);
    bus.on('entity:destroyed', markContactsDirty);
    bus.on('game:started',     markContactsDirty);
    bus.on('save:loaded',      markContactsDirty);
    bus.on('sector:enter',     markContactsDirty);
    bus.on('sector:enter',     onSectorEnter);
  }

  function isRadarContact(e, player) {
    if (!e || e === player) return false;
    return e.type !== 'projectile' && e.type !== 'fx';
  }

  function contactsFor(player) {
    const list = state.entityList;
    if (!contactsDirty && cachedEntityList === list && cachedLength === list.length && cachedPlayerId === state.playerId) {
      return contactList;
    }
    contactList = [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (isRadarContact(e, player)) contactList.push(e);
    }
    cachedEntityList = list; cachedLength = list.length; cachedPlayerId = state.playerId;
    contactsDirty = false;
    return contactList;
  }

  // ── draw ──────────────────────────────────────────────────────────────────────────────────
  function draw() {
    const p = state.entities.get(state.playerId);
    const baseRange = state.ui.radarRange || 4000;
    const range     = expanded ? baseRange * 2 : baseRange;
    const rangeSq   = range * range;
    const C = EXPAND_C, R = EXPAND_R, SIZE = EXPAND_SIZE;
    const now = Date.now();

    g.clearRect(0, 0, SIZE, SIZE);
    g.drawImage(bgCanvas, 0, 0, SIZE, SIZE);

    // ── outer border ring + N/S/E/W ticks ────────────────────────────────────────────────
    g.strokeStyle = 'rgba(57,208,255,0.28)';
    g.lineWidth   = 1;
    g.beginPath(); g.arc(C, C, R + 6, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 1.2; g.beginPath();
    g.moveTo(C,         C - R - 6); g.lineTo(C,         C - R - 2);
    g.moveTo(C,         C + R + 6); g.lineTo(C,         C + R + 2);
    g.moveTo(C + R + 6, C);         g.lineTo(C + R + 2, C);
    g.moveTo(C - R - 6, C);         g.lineTo(C - R - 2, C);
    g.stroke();
    g.fillStyle    = 'rgba(57,208,255,0.45)';
    g.font         = 'bold 7px monospace';
    g.textAlign    = 'center';
    g.textBaseline = 'bottom';
    g.fillText('N', C, C - R - 7);

    // ── scan sweep: 20° bright wedge + 30° trailing fade + leading edge line ─────────────
    const sweepAngle = ((now % 3000) / 3000) * Math.PI * 2;
    g.save();
    g.beginPath(); g.moveTo(C, C); g.arc(C, C, R, sweepAngle, sweepAngle + 0.35); g.closePath();
    g.fillStyle = 'rgba(57,208,255,0.14)'; g.fill();
    g.beginPath(); g.moveTo(C, C); g.arc(C, C, R, sweepAngle - 0.55, sweepAngle); g.closePath();
    g.fillStyle = 'rgba(57,208,255,0.04)'; g.fill();
    g.strokeStyle = 'rgba(57,208,255,0.32)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(C, C);
    g.lineTo(C + Math.cos(sweepAngle) * R, C + Math.sin(sweepAngle) * R);
    g.stroke();
    g.restore();

    // ── tactical mode overlay (expanded only) ─────────────────────────────────────────────
    if (expanded) {
      g.save();
      g.fillStyle    = 'rgba(57,208,255,0.55)';
      g.font         = 'bold 9px monospace';
      g.textAlign    = 'center';
      g.textBaseline = 'top';
      g.fillText('▸ TACTICAL  ·  ' + (range / 1000).toFixed(1) + 'K RANGE', C, C - R + 10);
      // distance labels on the 25 / 50 / 100% rings
      g.font         = '7px monospace';
      g.fillStyle    = 'rgba(57,208,255,0.32)';
      g.textAlign    = 'left';
      g.textBaseline = 'middle';
      for (const f of [0.25, 0.5, 1.0]) {
        g.fillText((range * f / 1000).toFixed(1) + 'k', C + R * f + 3, C - 5);
      }
      g.font         = '7px monospace';
      g.fillStyle    = 'rgba(57,208,255,0.28)';
      g.textAlign    = 'center';
      g.textBaseline = 'bottom';
      g.fillText('[click to close]', C, C + R - 6);
      g.restore();
    }

    if (!p) return;
    const px = p.pos.x, pz = p.pos.z;
    const targetId   = state.player.targetId;
    const playerTeam = p.team;
    const cbMode     = (state.settings.accessibility && state.settings.accessibility.colorblindMode) || 'none';

    // ── weapon/mining range ring ──────────────────────────────────────────────────────────
    const weaponRange = state.player.weaponRange;
    const rngRatio    = weaponRange ? Math.min(weaponRange / range, 1) : 0.6;
    const rngR        = R * rngRatio;
    g.save();
    g.strokeStyle = 'rgba(57,208,255,0.13)'; g.lineWidth = 1; g.setLineDash([3, 4]);
    g.beginPath(); g.arc(C, C, rngR, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]); g.restore();
    g.fillStyle    = 'rgba(57,208,255,0.2)'; g.font = '6px monospace';
    g.textAlign    = 'center'; g.textBaseline = 'bottom';
    g.fillText('RNG', C, C - rngR - 1);

    // ── contacts ─────────────────────────────────────────────────────────────────────────
    const list = contactsFor(p);

    // update trails for visible ships; prune trails for destroyed/removed entities
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive || e === p) continue;
      if (e.type === 'ship' || e.type === 'drone') updateTrail(e);
    }
    for (const id of trailMap.keys()) {
      if (!state.entities.has(id)) trailMap.delete(id);
    }

    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive || e === p) continue;
      const dx = e.pos.x - px, dz = e.pos.z - pz;
      const distSq = dx * dx + dz * dz;
      const col = blipColor(e, playerTeam, cbMode);
      let bx, by, off = false;

      if (distSq > rangeSq) {
        off = true;
        // -dz/-dx: world +Z = screen up, world +X = screen left (see header note)
        const a = Math.atan2(-dz, -dx);
        bx = C + Math.cos(a) * R; by = C + Math.sin(a) * R;
      } else {
        bx = C - (dx / range) * R; by = C - (dz / range) * R;   // both axes mirrored to match screen
      }

      // motion trail (in-range ships/drones only)
      if (!off && (e.type === 'ship' || e.type === 'drone')) {
        drawTrail(g, e, px, pz, range, C, R, col);
      }

      g.fillStyle = col; g.strokeStyle = col;

      if (off) {
        // hollow chevron clamped to radar edge
        const a = Math.atan2(-dz, -dx);
        g.save(); g.translate(bx, by); g.rotate(a);
        g.lineWidth = 1.5; g.beginPath();
        g.moveTo(-3, -3); g.lineTo(2, 0); g.lineTo(-3, 3); g.stroke();
        g.restore();

      } else if (e.type === 'pickup') {
        // spinning animated diamond with pulse glow
        const pulse = 0.5 + 0.5 * Math.sin(now * 0.005);
        g.save();
        g.globalAlpha = 0.6 + 0.4 * pulse;
        glow(g, col, 10 * pulse);
        g.translate(bx, by); g.rotate((now * 0.0008) % (Math.PI * 2));
        g.beginPath(); g.moveTo(0, -4); g.lineTo(3.5, 0); g.lineTo(0, 4); g.lineTo(-3.5, 0); g.closePath(); g.fill();
        noGlow(g); g.restore();

      } else if (e.type === 'asteroid') {
        glow(g, col, 3);
        g.beginPath(); g.moveTo(bx, by - 2.5); g.lineTo(bx + 2.5, by); g.lineTo(bx, by + 2.5); g.lineTo(bx - 2.5, by); g.closePath(); g.fill();
        noGlow(g);

      } else if (e.type === 'station') {
        if (e.data && e.data.isGate) {
          // gate: two counter-rotating glowing rings
          const spin = (now * 0.0005) % (Math.PI * 2);
          glow(g, col, 12);
          g.lineWidth = 1.3;
          g.save(); g.translate(bx, by);
          g.rotate(spin);        g.beginPath(); g.arc(0, 0, 3.5, 0, Math.PI * 2); g.stroke();
          g.rotate(-spin * 1.7); g.beginPath(); g.arc(0, 0, 6,   0, Math.PI * 2); g.stroke();
          g.restore(); noGlow(g);
        } else {
          // station: filled square with glow + inner dot
          glow(g, col, 14);
          g.fillRect(bx - 3.5, by - 3.5, 7, 7);
          noGlow(g);
          g.fillStyle = 'rgba(0,0,0,0.55)';
          g.beginPath(); g.arc(bx, by, 1.8, 0, Math.PI * 2); g.fill();
          g.fillStyle = col;
        }

      } else {
        // ship / drone — directional triangle with glow; hostiles pulse their glow
        const isHostile = e.team !== playerTeam && e.team !== 0;
        const glowBlur  = isHostile ? 7 + 3 * Math.sin(now * 0.004) : 5;
        glow(g, col, glowBlur);
        if (cbMode !== 'none') {
          drawShipShape(g, bx, by, semanticShape(shipState(e, playerTeam)));
        } else {
          const eRot = (e.vel && (e.vel.x !== 0 || e.vel.z !== 0))
            ? Math.atan2(e.vel.z, e.vel.x) : (e.rot || 0);
          g.save(); g.translate(bx, by); g.rotate(Math.PI + eRot);
          // slightly larger than original 3/-2.5 triangle
          g.beginPath(); g.moveTo(4.5, 0); g.lineTo(-3.5, -3); g.lineTo(-3.5, 3); g.closePath(); g.fill();
          g.restore();
        }
        noGlow(g);
      }

      // target ring
      if (e.id === targetId) {
        glow(g, '#fff', 8);
        g.strokeStyle = '#fff'; g.lineWidth = 1.3;
        g.beginPath(); g.arc(bx, by, 6.5, 0, Math.PI * 2); g.stroke();
        noGlow(g);
      }
    }

    // ── waypoint / objective marker ───────────────────────────────────────────────────────
    const wp  = state.nav && state.nav.waypoint;
    const pos = wp && wp.pos;
    if (pos) {
      const dx = pos.x - px, dz = pos.z - pz;
      const distSq = dx * dx + dz * dz;
      let bx, by;
      if (distSq > rangeSq) {
        const a = Math.atan2(-dz, -dx);
        bx = C + Math.cos(a) * R; by = C + Math.sin(a) * R;
      } else {
        bx = C - (dx / range) * R; by = C - (dz / range) * R;
      }
      g.save();
      glow(g, COL.objective, 12);
      g.strokeStyle = COL.objective; g.fillStyle = COL.objective; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(bx, by - 5.5); g.lineTo(bx + 5.5, by); g.lineTo(bx, by + 5.5); g.lineTo(bx - 5.5, by); g.closePath(); g.stroke();
      noGlow(g);
      g.globalAlpha = 0.2; g.beginPath(); g.arc(bx, by, 10, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    // ── player marker ─────────────────────────────────────────────────────────────────────
    // rot + π projects the nose onto canvas in the same direction the player faces on screen.
    g.save(); g.translate(C, C); g.rotate(Math.PI + p.rot);
    // forward FOV cone (~30-degree spread, faint)
    g.fillStyle = 'rgba(57,208,255,0.07)';
    g.beginPath(); g.moveTo(6, 0); g.lineTo(24, -5.5); g.lineTo(24, 5.5); g.closePath(); g.fill();
    // player triangle with strong glow
    glow(g, COL.player, 12);
    g.fillStyle = COL.player;
    g.beginPath(); g.moveTo(6, 0); g.lineTo(-5, -4); g.lineTo(-5, 4); g.closePath(); g.fill();
    noGlow(g);
    g.restore();
  }

  return { el: wrap, draw, invalidate: markContactsDirty };
}

// ── static background (pre-rendered once per size change) ────────────────────────────────────
function drawBackground(g, C, R) {
  g.clearRect(0, 0, C * 2, C * 2);
  // radial gradient backdrop — slightly lighter at center for depth
  const grad = g.createRadialGradient(C, C, 0, C, C, R + 4);
  grad.addColorStop(0,    'rgba(12,22,42,0.8)');
  grad.addColorStop(0.65, 'rgba(7,14,26,0.72)');
  grad.addColorStop(1,    'rgba(4,8,18,0.88)');
  g.fillStyle = grad;
  g.beginPath(); g.arc(C, C, R + 4, 0, Math.PI * 2); g.fill();

  // concentric rings at 25 / 50 / 100% — outer ring slightly brighter
  for (const f of [0.25, 0.5, 1.0]) {
    g.strokeStyle = f === 1.0 ? 'rgba(57,208,255,0.14)' : 'rgba(57,208,255,0.07)';
    g.lineWidth   = 1;
    g.beginPath(); g.arc(C, C, R * f, 0, Math.PI * 2); g.stroke();
  }
  // crosshair
  g.strokeStyle = 'rgba(57,208,255,0.06)';
  g.beginPath(); g.moveTo(C, C - R); g.lineTo(C, C + R); g.moveTo(C - R, C); g.lineTo(C + R, C); g.stroke();
}
