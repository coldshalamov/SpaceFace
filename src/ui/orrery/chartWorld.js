// src/ui/orrery/chartWorld.js — the Chart's GROUND (design/frontend/ORRERY.md §6 Chart; owner direction
// 2026-10-04: "a wide full-screen map that tells the player what's happening, with more contrast,
// colour coding and glow").
//
// The sector graph is only ten or so marks; what makes a strategic map read as a WORLD is the ground
// under them: who holds the space, where two holders meet, where it is dangerous, where the shooting
// is. This module paints that ground across the WHOLE canvas (the marks and their labels stay inside
// the clear field; the ground runs under the chrome's veils to every edge), from real state only:
//
//   - DOMINION    each holder's space is a soft wash of its own hue behind its sectors, so the chart is
//                 colour-coded at a glance, and each holder's name stands across it in wide capitals;
//   - SEAMS       where two holders' sectors are neighbours, a two-tone border stands between them
//                 (each side in its own hue). A tense front marches (dashed); a war front is red, and
//                 pulses;
//   - HAZE        a sector whose danger is high gets a red ember behind it. Red keeps its one meaning;
//   - LANES       each lane runs from one holder's hue to the other's, with body and a halo;
//   - AURA        a token carries a soft halo in its holder's hue.
//
// Palette note (owner ruling 2026-10-04, recorded in ORRERY.md §3.3): the chart's rest light stays
// bone, but the GROUND is allowed colour. Two lines hold: amber stays the Hand (the course) and red
// stays threat. A holder whose own hue sits on either (Meridian's gold, Reach's crimson, the rust of
// Drift and Pitborn) is re-tinted here — see DOMINION — so territory is never mistaken for the Hand or
// for a threat.
//
// Cost: the washes, haze and names are cached on an offscreen canvas keyed on the camera and the
// holders (a still chart repaints them from one drawImage); seams, lanes and auras are cheap strokes.
// No filter and no shadowBlur outside the cache. Every function takes CSS pixels (the chart's context
// is already scaled by devicePixelRatio) and restores the context it borrowed.

import { chartFont, setTracking } from './chartInstruments.js';
import { TACTICAL_MAP_PALETTE } from '../map/tacticalMapGrammar.js';

const BONE = [236, 230, 216];
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const DANGER = [255, 80, 56];

/**
 * The hue each holder wears on the chart's ground. Chosen against a near-black field for separation
 * from one another AND from the two reserved colours: no entry sits in the Hand's amber band
 * (about 36-50 deg) or in threat red (about 350-12 deg).
 */
export const DOMINION = Object.freeze({
  faction_scn: '#4F86FF',          // Concord — blue
  faction_mts: '#D4CC5C',          // Meridian — yellow-lime (its gold sat on the Hand's amber)
  faction_dmc: '#C98B52',          // Drift — copper
  faction_reach: '#C9468A',        // Reach — rose (its crimson sat on threat red)
  faction_quiet: '#8C6FD6',        // Quiet — violet
  faction_vael: '#2FCFA0',         // Vael — mint
  faction_free: '#4ECBE0',         // Frontier — cyan
  faction_choir: '#D86CE8',        // Choir — orchid
  faction_helix: '#8FA2C4',        // Helix — steel
  faction_understory: '#9CBA3C',   // Understory — olive-lime
  faction_fulfillment: '#E6E2D2',  // Fulfillment — warm white
  faction_archive: '#6E62C8',      // Archive — indigo (its own ink is too dark for a ground)
  faction_pitborn: '#B9733F',      // Pitborn — rust, softened off the red
  faction_verge_layers: '#B7AEC4', // Verge-Layers — pale lilac
});

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const NEUTRAL_TINT = [154, 168, 188];

/** A holder's ground hue as [r, g, b]. `fallbackHex` is the faction's own colour, used for an unknown id. */
export function dominionRgb(factionId, fallbackHex = null) {
  return hexToRgb(DOMINION[factionId]) || hexToRgb(fallbackHex) || NEUTRAL_TINT;
}

function mixRgb(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

const rgbStr = (c) => `${c[0]},${c[1]},${c[2]}`;
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** The ground's per-holder colours: `tint` for washes and seams, `lane` (tint over bone) for lanes, `ink` for names. */
function holderColours(factionId, fallbackHex) {
  const tint = dominionRgb(factionId, fallbackHex);
  return { tint, lane: mixRgb(tint, BONE, 0.34), ink: mixRgb(tint, [255, 255, 255], 0.3) };
}

// ─── One key for the chart and the radar ──────────────────────────────────────────────────────────────
// A contact class wears the same hue on the chart as on the radar (TACTICAL_MAP_PALETTE is the one
// key): a station is cyan, a gate violet, a hostile red, a wreck rust, an ally green, traffic blue-grey,
// the objective amber. Shape still carries the class; hue is the fast second channel.

const triplet = (hex) => { const c = hexToRgb(hex); return c ? `${c[0]},${c[1]},${c[2]}` : '154,168,188'; };

export const CLASS_RGB = Object.freeze({
  station: triplet(TACTICAL_MAP_PALETTE.station),
  gate: triplet(TACTICAL_MAP_PALETTE.gate),
  hostile: triplet(TACTICAL_MAP_PALETTE.hostile),
  friendly: triplet(TACTICAL_MAP_PALETTE.friendly),
  neutral: triplet(TACTICAL_MAP_PALETTE.neutral),
  wreck: triplet(TACTICAL_MAP_PALETTE.wreck),
  objective: triplet(TACTICAL_MAP_PALETTE.objective),
  ore: '196,150,104',
});

const glowSprites = new Map();
function glowSprite(rgb, radius) {
  const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
  const key = `${rgb}|${radius}|${dpr}`;
  let sprite = glowSprites.get(key);
  if (sprite !== undefined) return sprite;
  sprite = null;
  try {
    if (typeof document !== 'undefined') {
      const px = Math.max(4, Math.ceil(radius * 2 * dpr));
      const c = document.createElement('canvas');
      c.width = px; c.height = px;
      const sg = c.getContext('2d');
      if (sg && typeof sg.createRadialGradient === 'function') {
        const grad = sg.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
        if (grad && typeof grad.addColorStop === 'function') {
          grad.addColorStop(0, `rgba(${rgb},0.9)`);
          grad.addColorStop(0.22, `rgba(${rgb},0.46)`);
          grad.addColorStop(0.55, `rgba(${rgb},0.13)`);
          grad.addColorStop(1, `rgba(${rgb},0)`);
          sg.fillStyle = grad;
          sg.fillRect(0, 0, px, px);
          sprite = c;
        }
      }
    }
  } catch (_) { sprite = null; }
  glowSprites.set(key, sprite);
  return sprite;
}

/** A soft halo under a mark, additive, from a pre-rendered sprite (no shadow, no filter). */
export function drawGlow(g, x, y, radius, rgb, alpha = 0.5) {
  if (!(alpha > 0.02) || !g || typeof g.drawImage !== 'function') return;
  const sprite = glowSprite(rgb, radius);
  if (!sprite) return;
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = Math.min(1, alpha);
  g.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
  g.restore();
}

// ─── The cache ────────────────────────────────────────────────────────────────────────────────────

let cacheCanvas = null;
let cacheKey = '';
let lastFullKey = '';
let lastBuildMs = -1e9;
let redrawTimer = null;

function offscreen(pxW, pxH) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  try {
    if (!cacheCanvas) cacheCanvas = document.createElement('canvas');
    if (cacheCanvas.width !== pxW) cacheCanvas.width = pxW;
    if (cacheCanvas.height !== pxH) cacheCanvas.height = pxH;
    return cacheCanvas;
  } catch (_) { return null; }
}

/** Free the offscreen ground (called when the chart hides). */
export function releaseChartWorld() {
  cacheCanvas = null;
  cacheKey = '';
  lastFullKey = '';
  if (redrawTimer) { clearTimeout(redrawTimer); redrawTimer = null; }
}

// ─── Geometry ─────────────────────────────────────────────────────────────────────────────────────

/** Each charted node's wash radius: reaches about a lane and a bit, so neighbours' washes meet. */
function washRadius(node, charted) {
  let nearest = Infinity;
  for (const other of charted) {
    if (other === node) continue;
    nearest = Math.min(nearest, Math.hypot(other.x - node.x, other.y - node.y));
  }
  if (!Number.isFinite(nearest)) return 240;
  return Math.max(120, Math.min(360, nearest * 1.1 + 36));
}

/** A holder's pull on a point: its strongest sector's reach (the same measure the territory field uses). */
function holderPull(group, x, y) {
  let best = 0;
  for (const n of group) {
    const R = n.wash || 240;
    const d = Math.hypot(x - n.x, y - n.y);
    if (d >= R) continue;
    const f = 1 - smooth(R * 0.3, R, d);
    if (f > best) best = f;
  }
  return best;
}

/**
 * The seat for a holder's name: the spot inside the clear field where the holder's own colour is
 * strongest and no one else's is, clear of every token and the name that will hang beside it, off
 * every lane, and off the names already placed.
 */
function placeName(owner, groups, textW, charted, tokenR, field, segments, taken, size, obstacles = []) {
  // two passes: first only seats that are strictly clear of every label's footprint, then (if a holder
  // has none) seats that rest a little inside a label's halo
  return placeNamePass(owner, groups, textW, charted, tokenR, field, segments, taken, size, 6, obstacles)
    || placeNamePass(owner, groups, textW, charted, tokenR, field, segments, taken, size, -60, obstacles);
}

function placeNamePass(owner, groups, textW, charted, tokenR, field, segments, taken, size, minClear, obstacles) {
  const mine = groups.get(owner);
  const rivals = [...groups.entries()].filter(([o]) => o !== owner).map(([, list]) => list);
  const left0 = field.x + 24;
  const right0 = field.x + field.width - 24;
  const top0 = field.y + 26;
  const bottom0 = field.y + field.height - 26;
  let best = null;
  for (let ty = top0; ty <= bottom0; ty += 30) {
    for (let tx = left0 + textW / 2; tx <= right0 - textW / 2; tx += 36) {
      const left = tx - textW / 2;
      const right = tx + textW / 2;
      const own = holderPull(mine, tx, ty);
      if (own < 0.18) continue;
      let rival = 0;
      for (const list of rivals) rival = Math.max(rival, holderPull(list, tx, ty));
      // clear of every token and the label hung beside it (about 160 px right, 120 left)
      let clear = Infinity;
      for (const n of charted) {
        const gapX = Math.max(left - (n.x + tokenR + 160), (n.x - tokenR - 120) - right, 0);
        const gapY = Math.max(Math.abs(ty - n.y) - (tokenR + 26), 0);
        clear = Math.min(clear, Math.hypot(gapX, gapY) - (gapX === 0 && gapY === 0 ? 40 : 0));
      }
      if (clear < minClear) continue;
      // off every label the chart has actually placed (the solver has run by now)
      if (obstacles.some((o) => left - 10 < o.x + o.width && right + 10 > o.x && ty - size * 0.8 < o.y + o.height && ty + size * 0.8 > o.y)) continue;
      // off every lane: a lane through a name reads as a strike-through
      let onLane = false;
      for (const sg of segments) {
        // a lane's midpoint carries a border post or a leg label: keep a wider berth there
        const mx = (sg.x1 + sg.x2) / 2;
        const my = (sg.y1 + sg.y2) / 2;
        if (mx > left - 80 && mx < right + 80 && Math.abs(my - ty) < 26) { onLane = true; break; }
        for (let q = 0; q <= 20; q += 1) {
          const px = sg.x1 + (sg.x2 - sg.x1) * (q / 20);
          const py = sg.y1 + (sg.y2 - sg.y1) * (q / 20);
          if (px > left - 14 && px < right + 14 && Math.abs(py - ty) < 22) { onLane = true; break; }
        }
        if (onLane) break;
      }
      if (onLane) continue;
      // off the names already placed
      if (taken.some((t) => Math.abs(t.x - tx) < (t.w + textW) / 2 + 24 && Math.abs(t.y - ty) < size * 2.4)) continue;
      const score = own - rival * 0.9 + Math.min(clear, 120) * 0.0016;
      if (!best || score > best.score) best = { x: tx, y: ty, score };
    }
  }
  return best;
}

// ─── The territory field ──────────────────────────────────────────────────────────────────────────

const TERRITORY_CELL = 6;
const TERRITORY_CELL_DRAFT = 12;
let fieldCanvas = null;


/**
 * Paint the holders' space at a low resolution and let the canvas scale it up (the soft edge IS the
 * glow). Each cell takes its nearest holder's hue, fading with distance from that holder's sector;
 * a cell near the line between two holders takes the border: bright, in both hues. Returns false
 * where the canvas cannot do pixel work (a headless stub), so the caller falls back to radial washes.
 */
function paintTerritory(c, w, h, charted, colours, frontOf = null, cellPx = TERRITORY_CELL) {
  if (typeof document === 'undefined' || typeof c.createImageData !== 'function') return false;
  const holders = charted.filter((n) => n.ownerId);
  if (!holders.length) return true;
  const lw = Math.max(2, Math.ceil(w / cellPx));
  const lh = Math.max(2, Math.ceil(h / cellPx));
  try {
    if (!fieldCanvas) fieldCanvas = document.createElement('canvas');
    if (fieldCanvas.width !== lw) fieldCanvas.width = lw;
    if (fieldCanvas.height !== lh) fieldCanvas.height = lh;
    const fc = fieldCanvas.getContext('2d');
    if (!fc || typeof fc.createImageData !== 'function') return false;
    const img = fc.createImageData(lw, lh);
    const data = img.data;
    const count = holders.length;
    const hx = new Float32Array(count);
    const hy = new Float32Array(count);
    const hr = new Float32Array(count);
    const hr2 = new Float32Array(count);
    const ho = new Array(count);
    const ht = new Array(count);
    for (let i = 0; i < count; i += 1) {
      hx[i] = holders[i].x; hy[i] = holders[i].y; hr[i] = holders[i].wash || 240; hr2[i] = hr[i] * hr[i];
      ho[i] = holders[i].ownerId;
      ht[i] = colours.get(holders[i].ownerId).tint;
    }
    // each OWNER's pull on a cell is its strongest sector's reach (a max, so two sectors of one holder
    // run together with no seam and no step); the cell belongs to the strongest pull
    const owners = [...new Set(ho)];
    const oi = ho.map((o) => owners.indexOf(o));
    const ownerTint = owners.map((o) => colours.get(o).tint);
    const ownerId = (q) => owners[q];
    const pull = new Float32Array(owners.length);
    for (let j = 0; j < lh; j += 1) {
      const py = (j + 0.5) * cellPx;
      for (let i = 0; i < lw; i += 1) {
        const px = (i + 0.5) * cellPx;
        pull.fill(0);
        let any = false;
        for (let k = 0; k < count; k += 1) {
          const dx = px - hx[k];
          const dy = py - hy[k];
          const d2 = dx * dx + dy * dy;
          if (d2 >= hr2[k]) continue;
          const R = hr[k];
          const f = 1 - smooth(R * 0.3, R, Math.sqrt(d2));
          if (f > pull[oi[k]]) { pull[oi[k]] = f; any = true; }
        }
        if (!any) continue;
        let c1 = 0; let o1 = -1; let c2 = 0; let o2 = -1;
        for (let q = 0; q < pull.length; q += 1) {
          const v = pull[q];
          if (v > c1) { c2 = c1; o2 = o1; c1 = v; o1 = q; } else if (v > c2) { c2 = v; o2 = q; }
        }
        if (c1 <= 0.004) continue;
        let aFill = 0.28 * c1;
        let r = ownerTint[o1][0]; let gg = ownerTint[o1][1]; let b = ownerTint[o1][2];
        if (o2 >= 0 && c2 > 0.02) {
          // the border stands where the two pulls are equal
          const gap = (c1 - c2) / 0.05;
          let aB = Math.min(0.55, Math.exp(-gap * gap) * 0.7 * smooth(0.16, 0.62, c2 * 1.25));
          if (aB > 0.002) {
            const bt = ownerTint[o2];
            // a front is drawn in its own colour: red along a war, pale along a tension
            const front = frontOf ? frontOf(ownerId(o1), ownerId(o2)) : null;
            let br = Math.min(255, (r + bt[0]) / 2 + 60);
            let bg = Math.min(255, (gg + bt[1]) / 2 + 60);
            let bb = Math.min(255, (b + bt[2]) / 2 + 60);
            if (front === 'war') { br = DANGER[0]; bg = DANGER[1]; bb = DANGER[2]; aB = Math.min(0.72, aB * 1.3 * smooth(0.32, 0.8, c1)); }
            else if (front === 'tense') { br = 250; bg = 244; bb = 230; aB = Math.min(0.7, aB * 1.2); }
            const out = 1 - (1 - aFill) * (1 - aB);
            r = (r * aFill * (1 - aB) + br * aB) / out;
            gg = (gg * aFill * (1 - aB) + bg * aB) / out;
            b = (b * aFill * (1 - aB) + bb * aB) / out;
            aFill = out;
          }
        }
        const o = (j * lw + i) * 4;
        data[o] = r; data[o + 1] = gg; data[o + 2] = b; data[o + 3] = Math.min(255, aFill * 255);
      }
    }
    fc.putImageData(img, 0, 0);
    c.save();
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'low';
    c.drawImage(fieldCanvas, 0, 0, lw * cellPx, lh * cellPx);
    c.restore();
    return true;
  } catch (_) {
    return false;
  }
}

// ─── The ground ───────────────────────────────────────────────────────────────────────────────────

/**
 * Plan the chart's ground: resolve each holder's colours now (the lane and token passes need them),
 * and hand back `paint(g)`, which lays the ground across the WHOLE canvas. Call `paint` last, with
 * `globalCompositeOperation = 'destination-over'`, so it lands behind everything already drawn (the
 * chart's own field-edge fade would otherwise erase it, leaving a crisp step).
 *
 * `nodes`: [{ id, x, y, charted, ownerId, color, danger, wars, tense, current }] in canvas pixels.
 * `edges`: [{ from, to, charted }].
 * `layers`: the chart's lens flags (faction, events, security).
 */
export function planChartGround(w, h, {
  nodes = [], edges = [], layers = {}, tokenR = 40, field = null, dpr = 1, reduced = false, animT = 0, nameOf = null,
  fronts = null,
} = {}) {
  // A front is two holders in conflict: 'war' or 'tense' (the factions system's own record, read here).
  const frontOf = (ownerA, ownerB) => {
    if (!fronts || !ownerA || !ownerB) return null;
    return fronts.get(ownerA < ownerB ? `${ownerA}:${ownerB}` : `${ownerB}:${ownerA}`) || null;
  };
  const charted = nodes.filter((n) => n.charted);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const bounds = { x: 0, y: 0, width: w, height: h };
  const clearField = field || bounds;
  for (const n of charted) n.wash = washRadius(n, charted);
  const colours = new Map();
  for (const n of charted) {
    if (!colours.has(n.ownerId)) colours.set(n.ownerId, holderColours(n.ownerId, n.color));
  }
  const laneSegments = [];
  for (const e of edges) {
    if (!e.charted) continue;
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (a && b) laneSegments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  const factionOn = layers.faction !== false;
  const eventsOn = layers.events !== false;
  const securityOn = layers.security !== false;

  // ── the static ground: washes, haze, names — one cached canvas ──
  // while the camera is moving the territory is built at half resolution, and one full-quality rebuild
  // follows once it settles (the chart is asked to repaint)
  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const baseKey = [
    Math.round(w), Math.round(h), dpr, factionOn ? 1 : 0, securityOn ? 1 : 0, Math.round(tokenR),
    charted.map((n) => `${n.id}:${Math.round(n.x)},${Math.round(n.y)}:${n.ownerId || ''}:${Math.round((n.danger || 0) * 20)}`).join('|'),
    clearField ? `${Math.round(clearField.x)},${Math.round(clearField.y)},${Math.round(clearField.width)},${Math.round(clearField.height)}` : '',
    eventsOn && fronts ? [...fronts.entries()].map(([k, v]) => `${k}=${v}`).join(',') : '',
  ].join('#');
  const pxW = Math.max(2, Math.round(w * dpr));
  const pxH = Math.max(2, Math.round(h * dpr));
  const off = offscreen(pxW, pxH);
  let obstacles = [];
  let cellPx = TERRITORY_CELL;
  const paintStatic = (c) => {
    // territory: every pixel belongs to its nearest holder, glowing in that holder's hue and fading
    // with distance; where two holders meet, a bright border stands exactly on the line between them
    if (factionOn) {
      if (!paintTerritory(c, w, h, charted, colours, eventsOn ? frontOf : null, cellPx)) {
        for (const n of charted) {
          if (!n.ownerId) continue;
          const col = colours.get(n.ownerId);
          const a0 = n.current ? 0.34 : 0.27;
          const R = n.wash;
          const grad = c.createRadialGradient ? c.createRadialGradient(n.x, n.y, R * 0.08, n.x, n.y, R) : null;
          if (!grad) continue;
          grad.addColorStop(0, rgba(col.tint, a0));
          grad.addColorStop(0.5, rgba(col.tint, a0 * 0.52));
          grad.addColorStop(1, rgba(col.tint, 0));
          c.fillStyle = grad;
          c.beginPath(); c.arc(n.x, n.y, R, 0, Math.PI * 2); c.fill();
        }
      }
    }
    // haze: danger is an ember behind the sector (red keeps its one meaning)
    if (securityOn) {
      for (const n of charted) {
        const danger = Number(n.danger) || 0;
        if (danger < 0.5) continue;
        const a0 = Math.min(0.3, 0.1 + (danger - 0.5) * 0.5);
        const R = n.wash * 0.8;
        const grad = c.createRadialGradient ? c.createRadialGradient(n.x, n.y, R * 0.1, n.x, n.y, R) : null;
        if (!grad) continue;
        grad.addColorStop(0, rgba(DANGER, a0));
        grad.addColorStop(0.55, rgba(DANGER, a0 * 0.4));
        grad.addColorStop(1, rgba(DANGER, 0));
        c.fillStyle = grad;
        c.beginPath(); c.arc(n.x, n.y, R, 0, Math.PI * 2); c.fill();
      }
    }
    // names: each holder's name stands across its space in wide capitals, glowing in its own hue
    if (factionOn && typeof nameOf === 'function') {
      const groups = new Map();
      for (const n of charted) {
        if (!n.ownerId) continue;
        const list = groups.get(n.ownerId) || [];
        list.push(n);
        groups.set(n.ownerId, list);
      }
      const size = Math.max(15, Math.min(24, w * 0.0125));
      c.save();
      c.font = chartFont(800, size, { stretch: 'expanded' });
      setTracking(c, 0.62, size);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const taken = [];
      // the larger holders choose first
      const order = [...groups.keys()].sort((x, y) => groups.get(y).length - groups.get(x).length);
      for (const ownerId of order) {
        const label = String(nameOf(ownerId) || '').toUpperCase();
        if (!label) continue;
        const textW = c.measureText(label).width;
        const seat = placeName(ownerId, groups, textW, charted, tokenR, clearField, laneSegments, taken, size, obstacles);
        if (!seat) continue;
        taken.push({ x: seat.x, y: seat.y, w: textW });
        const col = colours.get(ownerId);
        // the glow is geometry (two wide faint strokes under the fill), not a blur
        c.lineJoin = 'round';
        c.strokeStyle = rgba(col.tint, 0.1); c.lineWidth = 12;
        c.strokeText(label, seat.x, seat.y);
        c.strokeStyle = rgba(col.tint, 0.16); c.lineWidth = 6;
        c.strokeText(label, seat.x, seat.y);
        c.fillStyle = rgba(col.ink, 0.66);
        c.fillText(label, seat.x, seat.y);
      }
      setTracking(c, 0, size);
      c.restore();
    }
  };
  const paint = (g, opts = {}) => {
  obstacles = Array.isArray(opts.obstacles) ? opts.obstacles : [];
  const labelKey = obstacles.map((o) => `${Math.round(o.x)},${Math.round(o.y)},${Math.round(o.width)},${Math.round(o.height)}`).join(';');
  const fullKey = `${baseKey}#${labelKey}`;
  // a key that changed within the last 180 ms is a camera in motion
  const moving = fullKey !== lastFullKey && nowMs - lastBuildMs < 180;
  if (fullKey !== lastFullKey) { lastFullKey = fullKey; lastBuildMs = nowMs; }
  cellPx = moving ? TERRITORY_CELL_DRAFT : TERRITORY_CELL;
  const key = `${fullKey}#${moving ? 'draft' : 'full'}`;
  if (moving && typeof opts.requestRedraw === 'function' && !redrawTimer) {
    redrawTimer = setTimeout(() => { redrawTimer = null; try { opts.requestRedraw(); } catch (_) { /* gone */ } }, 220);
  }
  g.save();
  if (off && typeof off.getContext === 'function') {
    const oc = off.getContext('2d');
    if (oc) {
      if (cacheKey !== key) {
        oc.setTransform(1, 0, 0, 1, 0, 0);
        oc.clearRect(0, 0, off.width, off.height);
        oc.setTransform(dpr, 0, 0, dpr, 0, 0);
        paintStatic(oc);
        cacheKey = key;
      }
      g.drawImage(off, 0, 0, w, h);
    } else paintStatic(g);
  } else paintStatic(g);
  g.restore();

  // ── the seams: where two holders' sectors are neighbours ──
  const seams = [];
  for (const e of edges) {
    if (!e.charted) continue;
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b || !a.charted || !b.charted || !a.ownerId || !b.ownerId || a.ownerId === b.ownerId) continue;
    const front = frontOf(a.ownerId, b.ownerId);
    seams.push({ a, b, war: eventsOn && front === 'war', tense: eventsOn && front === 'tense' });
  }
  for (const s of seams) drawSeam(g, s, colours, { reduced, animT });

  // ── the war pulses: an expanding red ring from a sector at war ──
  if (eventsOn && !reduced) {
    for (const n of charted) {
      if (!((n.wars || 0) > 0)) continue;
      const phase = ((animT * 0.42) + hash01(n.id)) % 1;
      const r = tokenR * (1.1 + phase * 1.5);
      g.save();
      g.strokeStyle = rgba(DANGER, 0.5 * (1 - phase));
      g.lineWidth = 2.2 - phase * 1.2;
      g.beginPath(); g.arc(n.x, n.y, r, 0, Math.PI * 2); g.stroke();
      g.restore();
    }
  }
  };
  return { colours, paint, frontOf };
}

function hash01(text) {
  let h = 2166136261;
  const s = String(text || '');
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * A border post where a lane crosses from one holder's space into another's: a short bar across the
 * lane, each half in its own holder's hue, on a lit bead. At war it is red and throws a ring; where
 * the front is tense it is a dashed ring. (The territory field draws the border itself; this marks
 * where the LANE crosses it, so the border is something you can point at.)
 */
function drawSeam(g, seam, colours, { reduced, animT }) {
  const { a, b, war, tense } = seam;
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(L > 40)) return;
  const dx = (b.x - a.x) / L;
  const dy = (b.y - a.y) / L;
  const px = -dy;
  const py = dx;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const half = 17;
  const ca = mixRgb((colours.get(a.ownerId) || {}).tint || NEUTRAL_TINT, [255, 255, 255], 0.25);
  const cb = mixRgb((colours.get(b.ownerId) || {}).tint || NEUTRAL_TINT, [255, 255, 255], 0.25);
  const pulse = war && !reduced ? 0.8 + 0.2 * Math.sin(animT * 3.1 + hash01(a.id + b.id) * 6.28) : 1;
  g.save();
  g.lineCap = 'round';
  // the glow under the post
  const glow = g.createRadialGradient ? g.createRadialGradient(mx, my, 2, mx, my, 34) : null;
  if (glow) {
    const hot = war ? DANGER : mixRgb(ca, cb, 0.5);
    glow.addColorStop(0, rgba(hot, (war ? 0.5 : 0.34) * pulse));
    glow.addColorStop(1, rgba(hot, 0));
    g.fillStyle = glow;
    g.beginPath(); g.arc(mx, my, 34, 0, Math.PI * 2); g.fill();
  }
  // the bar: each half in its holder's hue (red at war)
  g.lineWidth = 3;
  g.strokeStyle = rgba(war ? DANGER : ca, 0.95);
  g.beginPath(); g.moveTo(mx - dx * 2.2 - px * half, my - dy * 2.2 - py * half); g.lineTo(mx - dx * 2.2 + px * half, my - dy * 2.2 + py * half); g.stroke();
  g.strokeStyle = rgba(war ? DANGER : cb, 0.95);
  g.beginPath(); g.moveTo(mx + dx * 2.2 - px * half, my + dy * 2.2 - py * half); g.lineTo(mx + dx * 2.2 + px * half, my + dy * 2.2 + py * half); g.stroke();
  // the bead on the lane
  g.fillStyle = war ? rgba([255, 236, 228], 1) : 'rgba(255,250,238,0.96)';
  g.beginPath(); g.arc(mx, my, 3.2, 0, Math.PI * 2); g.fill();
  if (tense) {
    g.setLineDash([4, 4]);
    g.lineDashOffset = reduced ? 0 : -animT * 10;
    g.strokeStyle = 'rgba(248,244,234,0.7)';
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(mx, my, 12, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
  }
  if (war && !reduced) {
    const phase = (animT * 0.55 + hash01(a.id + b.id)) % 1;
    g.strokeStyle = rgba(DANGER, 0.7 * (1 - phase));
    g.lineWidth = 2;
    g.beginPath(); g.arc(mx, my, 8 + phase * 26, 0, Math.PI * 2); g.stroke();
  }
  g.restore();
}

// ─── The system's ground ──────────────────────────────────────────────────────────────────────────

/**
 * The ground under a sector's own orrery (the SYSTEM scale, the chart's default): the holder's hue
 * washes the whole canvas around the gate ring, the ring wears a lit rim in that hue, and a faint
 * tinted half-ring and cross read the dial. Paint with `destination-over` (behind everything).
 */
export function drawSystemGround(g, w, h, { x, y, r, ownerId = null, fallbackHex = null, dashed = true } = {}) {
  if (!g || !(r > 0)) return;
  const tint = dominionRgb(ownerId, fallbackHex);
  const reach = Math.max(w, h) * 0.62;
  g.save();
  const wash = g.createRadialGradient ? g.createRadialGradient(x, y, r * 0.35, x, y, Math.max(reach, r * 1.9)) : null;
  if (wash) {
    wash.addColorStop(0, rgba(tint, 0.2));
    wash.addColorStop(0.45, rgba(tint, 0.11));
    wash.addColorStop(1, rgba(tint, 0));
    g.fillStyle = wash;
    g.fillRect(0, 0, w, h);
  }
  // the rim: a lit band in the holder's hue, with a wide halo and a crisp core
  g.lineCap = 'round';
  g.strokeStyle = rgba(tint, 0.07); g.lineWidth = 44;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = rgba(tint, 0.2); g.lineWidth = 12;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = rgba(mixRgb(tint, [255, 255, 255], 0.35), 0.7); g.lineWidth = 1.6;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  // the three-quarter ring and the cross
  g.strokeStyle = rgba(tint, 0.2); g.lineWidth = 1.2;
  if (dashed) {
    g.setLineDash([2, 6]);
    g.beginPath(); g.arc(x, y, r * 0.75, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
  }
  g.strokeStyle = rgba(tint, 0.1);
  g.beginPath(); g.moveTo(x - r, y); g.lineTo(x + r, y); g.moveTo(x, y - r); g.lineTo(x, y + r); g.stroke();
  g.restore();
}

// ─── Lanes and auras (called by the chart's own passes, inside its clip) ──────────────────────────

/**
 * A lane between two sectors: a band with body under a crisp edge, running from one holder's hue to
 * the other's (bone-led, so it still reads as the chart's own structure), with a halo of the same.
 */
export function drawDominionLane(g, a, b, colours, { war = false } = {}) {
  const ca = (colours && colours.get(a.ownerId)) ? colours.get(a.ownerId).lane : mixRgb(NEUTRAL_TINT, BONE, 0.5);
  const cb = (colours && colours.get(b.ownerId)) ? colours.get(b.ownerId).lane : mixRgb(NEUTRAL_TINT, BONE, 0.5);
  const grad = (alpha) => {
    const gr = g.createLinearGradient ? g.createLinearGradient(a.x, a.y, b.x, b.y) : null;
    if (!gr) return rgba(mixRgb(ca, cb, 0.5), alpha);
    gr.addColorStop(0, rgba(ca, alpha));
    gr.addColorStop(0.5, rgba(war ? mixRgb(DANGER, mixRgb(ca, cb, 0.5), 0.35) : mixRgb(ca, cb, 0.5), alpha));
    gr.addColorStop(1, rgba(cb, alpha));
    return gr;
  };
  g.save();
  g.lineCap = 'round';
  g.strokeStyle = grad(0.075); g.lineWidth = 26;
  g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  g.strokeStyle = grad(0.3); g.lineWidth = 9;
  g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  g.strokeStyle = grad(0.78); g.lineWidth = 1.9;
  g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  g.restore();
}

/** A token's halo in its holder's hue: a soft glow standing outside the ring, never a coloured ring. */
export function drawTokenAura(g, x, y, r, colours, ownerId, { a = 1, danger = 0 } = {}) {
  const col = colours && colours.get(ownerId);
  if (!col || !g.createRadialGradient) return;
  const R = r * 1.95;
  const grad = g.createRadialGradient(x, y, r * 0.86, x, y, R);
  grad.addColorStop(0, rgba(col.tint, 0.42 * a));
  grad.addColorStop(0.4, rgba(col.tint, 0.16 * a));
  grad.addColorStop(1, rgba(col.tint, 0));
  g.save();
  g.fillStyle = grad;
  g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.fill();
  // the ring's own edge takes a breath of the hue: a lit rim, not a coloured ring
  g.strokeStyle = rgba(col.ink, 0.5 * a);
  g.lineWidth = 1.3;
  g.beginPath(); g.arc(x, y, r + 5.5, 0, Math.PI * 2); g.stroke();
  g.restore();
}
