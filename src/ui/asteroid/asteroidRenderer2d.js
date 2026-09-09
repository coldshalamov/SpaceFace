// Asteroid site renderer — Canvas2D only, no state mutation, no event bus.
// The cutaway's visual identity lives here: procedural strata painted in GLOBAL coordinates so
// banding and grain flow continuously across tiles (a coherent rock, not a tile rubber-stamp),
// beveled cavity rims so hollow cells read as *carved space*, machines whose contact arms make
// the §1 adjacency mechanic literally visible, and auto-tiled cable/lane conduits (§2 masks).
//
// Determinism note: all pattern variation derives from hash32(col,row) — cosmetic AND stable, so
// the same rock always looks the same. Math.random is never used here.
import { hash32 } from '../../core/rng.js';
import { connectivityMask } from '../../systems/siteLogistics.js';
import { SITE_MACHINE_BY_ID } from '../../data/sites.js';
import { drillTierReqForOre } from '../../systems/drill.js';

export const TILE = 40;

// Material identity — one glance, one material (brief §11 "visual identity per material").
// VALUES ARE THE DESIGN LAW §3.5 BOARD PALETTE (PQ-130.04). Keys and shapes are frozen — the
// inspector and the 3D renderer both read through them, so the legend can never disagree with the
// board. Sentence case per law §3.3; the blue-gray console family is gone.
export const MATERIALS = {
  matrix: { name: 'Silicate matrix', base: '#7a6955', dark: '#5b4e3f', band: '#8b7a64', fleck: '#695a48' },
  basalt: { name: 'Dense basalt', base: '#453f3a', dark: '#2f2b28', facet: '#514a44', crack: '#3a3531' },
  gas: { name: 'Compressed gas', base: '#4a4a36', murk: '#2b2d1f', glow: '#d3e26a', warn: '#ffb648' },
  cavity: { deep: '#1f1a15', wall: '#2a231b', rim: '#4a3f31', rimLit: '#7a6752' },
  // Law §2.3 deleted fog of war: there is no anonymous appearance left to paint. The key survives
  // for the dead 2D painter's call sites; its values are now plain silicate so even that path
  // cannot render an "unknown" cell.
  unknown: { base: '#7a6955', hatch: '#695a48' },
};

// Ore identity, law §3.5. `glow` is NULL on every row on purpose: a resting emissive on a mineral
// is the neon-icon read design law §2.7 bans, and the six rows that carried one were exactly the
// deep/exotic cells most likely to blow out under bloom. Colour now comes from albedo + the raking
// key + the material's roughness, like every other object in the flight world. `glint` is the
// highlight the cluster material leans toward, never a pure white.
export const ORE_TINTS = {
  cmdty_silicate: { vein: '#8b7a64', glint: '#b9a88c', glow: null },
  cmdty_ore_iron: { vein: '#9a6f4a', glint: '#f0a24e', glow: null },
  cmdty_ore_copper: { vein: '#4f9c86', glint: '#9fd8c4', glow: null },
  cmdty_ore_bronzium: { vein: '#63666c', glint: '#9aa1a9', glow: null },
  cmdty_ore_silverium: { vein: '#78838e', glint: '#bcc6d0', glow: null },
  cmdty_ore_goldium: { vein: '#c9992f', glint: '#f0cf78', glow: null },
  cmdty_ore_platinium: { vein: '#6d8a9c', glint: '#b6ccd9', glow: null },
  cmdty_ore_einsteinium: { vein: '#8f6ae0', glint: '#c9b0ff', glow: null },
  cmdty_gem_emerald: { vein: '#3e9c74', glint: '#a8e0c6', glow: null },
  cmdty_gem_ruby: { vein: '#b8434f', glint: '#f0a8b0', glow: null },
  cmdty_gem_diamond: { vein: '#b9d6d8', glint: '#e6f5f6', glow: null },
  cmdty_exotic_amazonite: { vein: '#2fb8a6', glint: '#b8f0e6', glow: null },
};

export const STATUS_COLORS = {
  running: '#62e08a',
  building: '#62e08a',
  throttled: '#ffb35c',
  starved: '#ffb35c',
  limited: '#ffb35c',
  backlogged: '#ffb35c',
  'fleet-full': '#84a0c8',
  staged: '#62e08a',
  // PQ-130.10b: the three fault hues align to --aw-coral (#ff6242, law §3.2 'danger, damage,
  // cost-you-can't-pay'). #ff5c5c was the old console red and it read pink beside the mint lamps.
  'no-power': '#ff6242',
  'no-pods': '#ffb35c',
  'no-network': '#ff6242',
  'no-geology': '#ff6242',
  stalled: '#ffb35c',
  idle: '#5a7aa0',
};

const rnd01 = (c, r, salt) => (hash32(c, r, salt) % 1000) / 1000;

// ---------------------------------------------------------------- tile painters

function paintMatrix(g, x, y, c, r, muted) {
  const m = MATERIALS.matrix;
  // Muted keeps the warm silicate hue (fog hides identity, not substance).
  g.fillStyle = muted ? '#38322a' : m.base;
  g.fillRect(x, y, TILE, TILE);
  // Strata bands flow in GLOBAL space: same phase math on every tile → continuous ribbons.
  g.strokeStyle = muted ? MATERIALS.unknown.hatch : m.band;
  g.lineWidth = 3;
  g.globalAlpha = muted ? 0.35 : 0.5;
  for (let i = -1; i < 3; i++) {
    const phase = ((x * 0.35 + i * 26) % (TILE * 2));
    g.beginPath();
    g.moveTo(x, y + phase - 12 + Math.sin((x + y) * 0.02) * 4);
    g.quadraticCurveTo(x + TILE * 0.5, y + phase - 4, x + TILE, y + phase - 10);
    g.stroke();
  }
  g.globalAlpha = 1;
  // Grain flecks, stable per tile.
  const flecks = 4 + (hash32(c, r, 'fk') % 4);
  g.fillStyle = muted ? MATERIALS.unknown.hatch : m.fleck;
  for (let i = 0; i < flecks; i++) {
    const fx = x + 3 + rnd01(c, r, 'fx' + i) * (TILE - 6);
    const fy = y + 3 + rnd01(c, r, 'fy' + i) * (TILE - 6);
    g.globalAlpha = 0.35 + rnd01(c, r, 'fa' + i) * 0.4;
    g.fillRect(fx, fy, 2, 2);
  }
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(x, y + TILE - 3, TILE, 3);
}

function paintBasalt(g, x, y, c, r, muted) {
  const m = MATERIALS.basalt;
  g.fillStyle = muted ? MATERIALS.unknown.base : m.base;
  g.fillRect(x, y, TILE, TILE);
  // Angular facets: 3 stable shards with distinct values → fractured stone, not noise.
  // Muted (unsurveyed) keeps the facets at low contrast so the mass still reads as rock.
  const cx = x + TILE / 2;
  const cy = y + TILE / 2;
  const a0 = rnd01(c, r, 'ba') * Math.PI * 2;
  if (muted) g.globalAlpha = 0.4;
  for (let i = 0; i < 3; i++) {
    const a = a0 + i * 2.1;
    g.fillStyle = i === 0 ? m.facet : (i === 1 ? m.dark : 'rgba(255,255,255,0.03)');
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * TILE, cy + Math.sin(a) * TILE);
    g.lineTo(cx + Math.cos(a + 1.5) * TILE, cy + Math.sin(a + 1.5) * TILE);
    g.closePath();
    g.save();
    g.beginPath();
    g.rect(x, y, TILE, TILE);
    g.clip();
    g.fill();
    g.restore();
  }
  g.strokeStyle = m.crack;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(x + rnd01(c, r, 'c1') * TILE, y);
  g.lineTo(cx + (rnd01(c, r, 'c2') - 0.5) * 10, cy);
  g.lineTo(x + rnd01(c, r, 'c3') * TILE, y + TILE);
  g.stroke();
  g.globalAlpha = 1;
}

function paintGas(g, x, y, c, r) {
  // Hazards are ALWAYS legible (never disguised — inherited law from the drill lens).
  const m = MATERIALS.gas;
  g.fillStyle = m.base;
  g.fillRect(x, y, TILE, TILE);
  const cx = x + TILE / 2;
  const cy = y + TILE / 2;
  for (let i = 0; i < 3; i++) {
    const bx = cx + (rnd01(c, r, 'gx' + i) - 0.5) * 18;
    const by = cy + (rnd01(c, r, 'gy' + i) - 0.5) * 18;
    const rad = 6 + rnd01(c, r, 'gr' + i) * 8;
    g.fillStyle = m.murk;
    g.globalAlpha = 0.55;
    g.beginPath();
    g.arc(bx, by, rad, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  g.strokeStyle = m.glow;
  g.globalAlpha = 0.5;
  g.lineWidth = 1;
  g.beginPath();
  g.arc(cx, cy, 11, 0.4, 2.2);
  g.stroke();
  g.globalAlpha = 1;
  // Warning diamond — shape + color, never color alone.
  g.fillStyle = m.warn;
  g.beginPath();
  g.moveTo(cx, cy - 6);
  g.lineTo(cx + 5, cy);
  g.lineTo(cx, cy + 6);
  g.lineTo(cx - 5, cy);
  g.closePath();
  g.fill();
  g.fillStyle = '#151515';
  g.fillRect(cx - 1, cy - 3, 2, 4);
  g.fillRect(cx - 1, cy + 2, 2, 1);
}

function paintVein(g, x, y, c, r, ore, tierLocked) {
  paintMatrix(g, x, y, c, r, false);
  const tint = ORE_TINTS[ore] || ORE_TINTS.cmdty_silicate;
  // A vein ribbon of 3 nodules along a stable diagonal — recognizable at a glance, not confetti.
  const a = rnd01(c, r, 'va') * Math.PI;
  const cx = x + TILE / 2;
  const cy = y + TILE / 2;
  if (tint.glow) {
    g.save();
    g.shadowColor = tint.glow;
    g.shadowBlur = 7;
  }
  for (let i = -1; i <= 1; i++) {
    const nx = cx + Math.cos(a) * i * 10 + (rnd01(c, r, 'nx' + i) - 0.5) * 5;
    const ny = cy + Math.sin(a) * i * 10 + (rnd01(c, r, 'ny' + i) - 0.5) * 5;
    const rad = 4.5 + rnd01(c, r, 'nr' + i) * 3.5;
    g.fillStyle = tint.vein;
    g.beginPath();
    g.ellipse(nx, ny, rad, rad * 0.72, a, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = tint.glint;
    g.globalAlpha = 0.9;
    g.fillRect(nx - rad * 0.3, ny - rad * 0.35, 2, 2);
    g.globalAlpha = 1;
  }
  if (tint.glow) g.restore();
  if (tierLocked) {
    g.fillStyle = 'rgba(7,10,16,0.5)';
    g.fillRect(x, y, TILE, TILE);
    g.strokeStyle = 'rgba(255,92,92,0.9)';
    g.lineWidth = 1.5;
    g.strokeRect(x + 3.5, y + 3.5, TILE - 7, TILE - 7);
    g.fillStyle = '#ff8a4a';
    g.font = `bold 9px ${g._monoFamily || 'monospace'}`;
    g.textAlign = 'center';
    g.fillText(`MK${tierLocked}`, x + TILE / 2, y + TILE / 2 + 3);
  }
}

function paintUnknown(g, x, y, c, r, tile) {
  // Unsurveyed mass is still visibly ROCK: paint the muted material silhouette (veins hide as
  // matrix — the stealth rule), then lay the diagonal survey hatch over it as the "unresolved"
  // signal. A flat void here made the whole cross-section read as empty space.
  if (tile && tile.type === 'rock') paintBasalt(g, x, y, c, r, true);
  else paintMatrix(g, x, y, c, r, true);
  g.strokeStyle = MATERIALS.unknown.hatch;
  g.lineWidth = 1;
  g.globalAlpha = 0.5;
  for (let d = -TILE; d < TILE * 2; d += 8) {
    const phase = (x + y) % 8;
    g.beginPath();
    g.moveTo(x + d + phase, y);
    g.lineTo(x + d + phase - TILE, y + TILE);
    g.stroke();
  }
  g.globalAlpha = 1;
}

function paintCavity(g, x, y, c, r, rows, solidAt) {
  const m = MATERIALS.cavity;
  // Depth-shaded void: deeper cells are darker (carved space, not deleted tiles).
  const depth = Math.min(1, r / rows);
  g.fillStyle = m.deep;
  g.fillRect(x, y, TILE, TILE);
  g.fillStyle = `rgba(13,19,32,${0.7 - depth * 0.4})`;
  g.fillRect(x, y, TILE, TILE);
  // Sparse stable dust motes.
  if (hash32(c, r, 'dm') % 3 === 0) {
    g.fillStyle = 'rgba(120,140,170,0.14)';
    g.fillRect(x + 6 + rnd01(c, r, 'dx') * (TILE - 12), y + 6 + rnd01(c, r, 'dy') * (TILE - 12), 2, 2);
  }
  // Carved rims: a rock face strip along every solid side. Light source up-left → top faces lit.
  const rim = 5;
  if (solidAt(c, r - 1)) {
    g.fillStyle = m.wall;
    g.fillRect(x, y, TILE, rim);
    g.fillStyle = m.rim;
    g.fillRect(x, y + rim - 1, TILE, 1);
  }
  if (solidAt(c, r + 1)) {
    g.fillStyle = m.wall;
    g.fillRect(x, y + TILE - rim, TILE, rim);
    g.fillStyle = m.rimLit;
    g.globalAlpha = 0.9;
    g.fillRect(x, y + TILE - rim, TILE, 1);
    g.globalAlpha = 1;
  }
  if (solidAt(c - 1, r)) {
    g.fillStyle = m.wall;
    g.fillRect(x, y, rim, TILE);
    g.fillStyle = m.rimLit;
    g.globalAlpha = 0.7;
    g.fillRect(x + rim - 1, y, 1, TILE);
    g.globalAlpha = 1;
  }
  if (solidAt(c + 1, r)) {
    g.fillStyle = m.wall;
    g.fillRect(x + TILE - rim, y, rim, TILE);
    g.fillStyle = m.rim;
    g.fillRect(x + TILE - rim, y, 1, TILE);
  }
}

// ---------------------------------------------------------------- machines

function statusColor(status) {
  return STATUS_COLORS[(status && status.state) || 'idle'] || STATUS_COLORS.idle;
}

/** Draw one machine housing at tile-space (x,y). Distinct silhouette per verb. */
export function paintMachine(g, defId, x, y, opts = {}) {
  const status = opts.status || null;
  const led = statusColor(status);
  const cx = x + TILE / 2;
  const cy = y + TILE / 2;
  const mono = opts.monoFamily || 'monospace';
  g.save();

  // Contact arms FIRST (under the housing): the §1 ring made visible — one clamp per worked face.
  if (opts.geo && (defId === 'sm_extractor' || defId === 'sm_gas_tap')) {
    for (const cell of opts.geo.cells || []) {
      if (cell.kind === 'empty') continue;
      if (defId === 'sm_gas_tap' && cell.kind !== 'gas') continue;
      const dx = Math.sign(cell.col * TILE + TILE / 2 - cx);
      const dy = Math.sign(cell.row * TILE + TILE / 2 - cy);
      const tint = cell.kind === 'gas' ? MATERIALS.gas.glow
        : cell.kind === 'ore' ? ((ORE_TINTS[cell.ore] || {}).vein || '#9aa4b8')
          : cell.kind === 'matrix' ? '#8a7a62' : '#7a8698';
      g.strokeStyle = tint;
      g.lineWidth = 3;
      g.globalAlpha = 0.85;
      g.beginPath();
      g.moveTo(cx + dx * 8, cy + dy * 8);
      g.lineTo(cx + dx * (TILE / 2 + 3), cy + dy * (TILE / 2 + 3));
      g.stroke();
      g.fillStyle = tint;
      g.fillRect(cx + dx * (TILE / 2 + 1) - 2, cy + dy * (TILE / 2 + 1) - 2, 4, 4);
      g.globalAlpha = 1;
    }
  }

  const frame = '#1b2434';
  const body = '#26324a';
  const edge = '#41527a';

  const box = (bx, by, bw, bh) => {
    g.fillStyle = body;
    g.fillRect(bx, by, bw, bh);
    g.strokeStyle = edge;
    g.lineWidth = 1;
    g.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.fillRect(bx, by, bw, 2);
  };

  if (defId === 'sm_massline_core') {
    // Hex socket + humming core — the anchor.
    g.fillStyle = frame;
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + i * Math.PI / 3;
      const px = cx + Math.cos(a) * 16;
      const py = cy + Math.sin(a) * 16;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
    g.strokeStyle = edge;
    g.lineWidth = 1.5;
    g.stroke();
    const pulse = opts.reducedMotion ? 0.8 : 0.65 + 0.35 * Math.sin((opts.timeS || 0) * 2.2);
    g.fillStyle = '#4f8fdd';
    g.globalAlpha = pulse;
    g.beginPath();
    g.arc(cx, cy, 6, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(79,143,221,0.5)';
    g.beginPath();
    g.arc(cx, cy, 10, 0, Math.PI * 2);
    g.stroke();
  } else if (defId === 'sm_extractor') {
    box(x + 8, y + 8, TILE - 16, TILE - 16);
    // Piston head oscillates while running.
    const t = opts.reducedMotion || !status || (status.state !== 'running' && status.state !== 'throttled')
      ? 0 : Math.abs(Math.sin((opts.timeS || 0) * 3.1)) * 3;
    g.fillStyle = '#5a6c8f';
    g.fillRect(cx - 3, y + 4 - t, 6, 8);
    g.fillStyle = frame;
    g.fillRect(x + 12, cy - 3, TILE - 24, 6);
  } else if (defId === 'sm_gas_tap') {
    // Rounded pressure tank + turbine disc.
    g.fillStyle = body;
    g.beginPath();
    g.arc(cx, cy + 3, 11, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = edge;
    g.stroke();
    const spin = opts.reducedMotion ? 0.8 : (opts.timeS || 0) * ((status && status.genMW) ? 4 : 0.6);
    g.strokeStyle = MATERIALS.gas.glow;
    g.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const a = spin + i * (Math.PI * 2 / 3);
      g.beginPath();
      g.moveTo(cx, cy - 8);
      g.lineTo(cx + Math.cos(a) * 6, cy - 8 + Math.sin(a) * 6);
      g.stroke();
    }
  } else if (defId === 'sm_refinery') {
    box(x + 6, y + 10, TILE - 12, TILE - 16);
    // Furnace slit glows warm when running, dead grey when starved.
    const hot = status && (status.state === 'running' || status.state === 'throttled' || status.state === 'limited');
    g.fillStyle = hot ? '#ff9d4d' : '#3a4459';
    if (hot && !opts.reducedMotion) g.globalAlpha = 0.7 + 0.3 * Math.sin((opts.timeS || 0) * 5);
    g.fillRect(x + 11, cy + 2, TILE - 22, 4);
    g.globalAlpha = 1;
    g.fillStyle = frame;
    g.fillRect(cx - 4, y + 4, 8, 8); // hopper
  } else if (defId === 'sm_fabricator') {
    box(x + 6, y + 8, TILE - 12, TILE - 14);
    // Gantry + tool head sweeps with job progress; LED strip shows progress.
    const p = status && Number.isFinite(status.progress) ? Math.max(0, Math.min(1, status.progress)) : 0;
    g.fillStyle = frame;
    g.fillRect(x + 9, y + 12, TILE - 18, 3);
    g.fillStyle = '#5a6c8f';
    g.fillRect(x + 10 + p * (TILE - 24), y + 10, 4, 7);
    g.fillStyle = 'rgba(79,143,221,0.85)';
    g.fillRect(x + 9, y + TILE - 10, (TILE - 18) * p, 2);
  } else if (defId === 'sm_cargo_port') {
    box(x + 5, y + 12, TILE - 10, TILE - 18);
    // Launch cradle doors + a waiting pod silhouette when one is ready.
    g.fillStyle = frame;
    g.beginPath();
    g.moveTo(x + 8, y + 12);
    g.lineTo(cx, y + 4);
    g.lineTo(x + TILE - 8, y + 12);
    g.closePath();
    g.fill();
    if (opts.podsReady > 0) {
      g.fillStyle = '#8fb7d8';
      g.beginPath();
      g.ellipse(cx, y + 15, 5, 7, 0, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    box(x + 8, y + 8, TILE - 16, TILE - 16);
  }

  // Status LED — corner dot, doubled by an under-glow so state reads at map scale.
  g.fillStyle = led;
  g.fillRect(x + TILE - 8, y + 4, 4, 4);
  if (status && (status.state === 'no-power' || status.state === 'starved' || status.state === 'backlogged' || status.state === 'no-network' || status.state === 'no-geology' || status.state === 'no-pods')) {
    g.strokeStyle = led;
    g.globalAlpha = opts.reducedMotion ? 0.5 : 0.35 + 0.3 * Math.sin((opts.timeS || 0) * 3);
    g.lineWidth = 2;
    g.strokeRect(x + 2.5, y + 2.5, TILE - 5, TILE - 5);
    g.globalAlpha = 1;
    g.fillStyle = led;
    g.font = `bold 9px ${mono}`;
    g.textAlign = 'center';
    const glyph = status.state === 'no-power' ? '⚡' : (status.state === 'backlogged' ? '▣' : '!');
    g.fillText(glyph, x + 8, y + 12);
  }
  g.restore();
}

// ---------------------------------------------------------------- overlays

/** Auto-tiled conduit pass for one overlay kind across the visible rows. */
export function paintOverlayNetworks(g, kind, cells, machineCells, viewY, startRow, endRow, opts = {}) {
  const isLane = kind === 'lane';
  const has = (c, r) => {
    if (c < 0 || c >= opts.cols || r < 0 || r >= opts.rows) return false;
    const idx = r * opts.cols + c;
    return cells.has(idx) || machineCells.has(idx);
  };
  for (const idx of cells) {
    const c = idx % opts.cols;
    const r = Math.floor(idx / opts.cols);
    if (r < startRow || r > endRow) continue;
    const x = c * TILE;
    const y = r * TILE - viewY;
    // When cable + lane share a cell, both shift off the centerline so they read as two
    // parallel systems (brief §2): lane +6px down, cable −6px up.
    const shared = opts.sharedCells && opts.sharedCells.has(idx);
    const offset = shared ? (isLane ? 6 : -6) : 0;
    const cx = x + TILE / 2;
    const cy = y + TILE / 2 + offset;
    const mask = connectivityMask(has, c, r);
    const arms = [[1, 0, -1], [2, 1, 0], [4, 0, 1], [8, -1, 0]];

    if (isLane) {
      // Roller track: dark bed + pale rails + flow chevrons (animated only while flowing).
      g.strokeStyle = '#141b28';
      g.lineWidth = 10;
      g.lineCap = 'round';
      for (const [bit, dx, dy] of arms) {
        if (!(mask & bit)) continue;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + dx * (TILE / 2), cy + dy * (TILE / 2));
        g.stroke();
      }
      if (!mask) { g.beginPath(); g.arc(cx, cy, 5, 0, Math.PI * 2); g.stroke(); }
      g.strokeStyle = '#3d4a5e';
      g.lineWidth = 1;
      for (const [bit, dx, dy] of arms) {
        if (!(mask & bit)) continue;
        for (const side of [-4, 4]) {
          g.beginPath();
          g.moveTo(cx + (dy !== 0 ? side : 0), cy + (dx !== 0 ? side : 0));
          g.lineTo(cx + dx * (TILE / 2) + (dy !== 0 ? side : 0), cy + dy * (TILE / 2) + (dx !== 0 ? side : 0));
          g.stroke();
        }
      }
      const flowing = opts.flowing;
      const phase = opts.reducedMotion || !flowing ? 0 : ((opts.timeS || 0) * 26) % 12;
      g.fillStyle = flowing ? 'rgba(98,224,138,0.7)' : 'rgba(90,106,140,0.45)';
      for (const [bit, dx, dy] of arms) {
        if (!(mask & bit)) continue;
        for (let d = 4 + phase % 12; d < TILE / 2; d += 12) {
          const px = cx + dx * d;
          const py = cy + dy * d;
          g.beginPath();
          g.moveTo(px - dx * 3 + dy * 3, py - dy * 3 + dx * 3);
          g.lineTo(px, py);
          g.lineTo(px - dx * 3 - dy * 3, py - dy * 3 - dx * 3);
          g.closePath();
          g.fill();
        }
      }
    } else {
      // Power conduit: insulated casing + energized core; brown-out networks run dim.
      const ratio = opts.ratio == null ? 1 : opts.ratio;
      g.lineCap = 'round';
      g.strokeStyle = '#10141d';
      g.lineWidth = 6;
      for (const [bit, dx, dy] of arms) {
        if (!(mask & bit)) continue;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + dx * (TILE / 2), cy + dy * (TILE / 2));
        g.stroke();
      }
      if (!mask) { g.beginPath(); g.arc(cx, cy, 4, 0, Math.PI * 2); g.stroke(); }
      const alpha = ratio >= 1 ? 0.9 : (0.35 + ratio * 0.4);
      g.strokeStyle = `rgba(79,143,221,${alpha})`;
      g.lineWidth = 2;
      for (const [bit, dx, dy] of arms) {
        if (!(mask & bit)) continue;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + dx * (TILE / 2), cy + dy * (TILE / 2));
        g.stroke();
      }
      const bits = (mask & 1 ? 1 : 0) + (mask & 2 ? 1 : 0) + (mask & 4 ? 1 : 0) + (mask & 8 ? 1 : 0);
      if (bits >= 3 || bits === 0) {
        g.fillStyle = '#223048';
        g.beginPath();
        g.arc(cx, cy, 4, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = `rgba(79,143,221,${alpha})`;
        g.lineWidth = 1;
        g.stroke();
      }
    }
  }
}

// ---------------------------------------------------------------- rover

/** Compact procedural rover consistent with the new cutaway language. */
export function paintRover(g, x, y, faceDir, opts = {}) {
  const cx = x + TILE / 2;
  const cy = y + TILE / 2;
  g.save();
  g.translate(cx + (opts.shakeX || 0), cy + (opts.shakeY || 0));
  if (faceDir === 'left') g.scale(-1, 1);
  else if (faceDir === 'down') g.rotate(Math.PI / 2);
  else if (faceDir === 'up') g.rotate(-Math.PI / 2);

  // Treads
  g.fillStyle = '#0c111c';
  g.strokeStyle = '#2b3952';
  g.lineWidth = 1.5;
  roundRect(g, -15, 4, 30, 9, 4);
  g.fill();
  g.stroke();
  g.fillStyle = '#1b2434';
  for (let i = -1; i <= 1; i++) {
    g.beginPath();
    g.arc(i * 9, 8.5, 3.4, 0, Math.PI * 2);
    g.fill();
  }
  // Hull
  g.fillStyle = '#26324a';
  g.beginPath();
  g.moveTo(-13, 5);
  g.lineTo(-9, -7);
  g.lineTo(9, -7);
  g.lineTo(14, 5);
  g.closePath();
  g.fill();
  g.strokeStyle = '#41527a';
  g.stroke();
  // Canopy
  g.fillStyle = '#4f8fdd';
  g.globalAlpha = 0.85;
  g.beginPath();
  g.moveTo(-3, -7);
  g.lineTo(2, -12);
  g.lineTo(8, -7);
  g.closePath();
  g.fill();
  g.globalAlpha = 1;
  // Headlamp
  g.fillStyle = '#ffe5a4';
  g.fillRect(12, -3, 3, 4);

  // Auger — spins via drillTheta; grooves scroll to sell the bite.
  const theta = opts.drillTheta || 0;
  const len = 16;
  g.fillStyle = '#5a6c8f';
  g.beginPath();
  g.moveTo(14, -5);
  g.lineTo(14 + len, 0);
  g.lineTo(14, 5);
  g.closePath();
  g.fill();
  g.save();
  g.beginPath();
  g.moveTo(14, -5);
  g.lineTo(14 + len, 0);
  g.lineTo(14, 5);
  g.closePath();
  g.clip();
  g.strokeStyle = '#101724';
  g.lineWidth = 2;
  const off = (theta * 3) % 6;
  for (let i = 0; i < 4; i++) {
    const gx = 14 + i * 6 + off - 6;
    const t = Math.max(0, 1 - (gx - 14) / len);
    g.beginPath();
    g.moveTo(gx, -5 * t);
    g.quadraticCurveTo(gx + 2.5, 0, gx, 5 * t);
    g.stroke();
  }
  g.restore();
  g.fillStyle = '#4f8fdd';
  g.beginPath();
  g.arc(14 + len, 0, 1.8, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// ---------------------------------------------------------------- strata cache

/**
 * Full-field offscreen strata bitmap with per-tile repaint. Same architecture the shipped drill
 * screen proved out (build once, patch neighborhoods) but painted procedurally.
 */
export function createStrataCache({ cols, rows, isSurveyed, drillTier, monoFamily }) {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (canvas) {
    canvas.width = cols * TILE;
    canvas.height = rows * TILE;
  }
  const g = canvas ? canvas.getContext('2d', { alpha: false }) : null;
  if (g) g._monoFamily = monoFamily || 'monospace';

  function solidAtFactory(field) {
    return (c, r) => {
      if (c < 0 || c >= cols || r < 0 || r >= rows) return false;
      const t = field[c] && field[c][r];
      return !!t && t.type !== 'empty';
    };
  }

  function paintTile(field, c, r) {
    if (!g || !field[c] || !field[c][r]) return;
    const t = field[c][r];
    const x = c * TILE;
    const y = r * TILE;
    const solidAt = solidAtFactory(field);
    if (t.type === 'empty') { paintCavity(g, x, y, c, r, rows, solidAt); return; }
    const surveyed = isSurveyed(c, r);
    if (t.type === 'gas') { paintGas(g, x, y, c, r); return; }
    if (!surveyed) { paintUnknown(g, x, y, c, r, t); return; }
    if (t.type === 'dirt') { paintMatrix(g, x, y, c, r, false); return; }
    if (t.type === 'rock') { paintBasalt(g, x, y, c, r, false); return; }
    if (t.type === 'vein' && t.ore) {
      const req = t.tierReq || drillTierReqForOre(t.ore);
      paintVein(g, x, y, c, r, t.ore, drillTier() < req ? req : 0);
      return;
    }
    paintBasalt(g, x, y, c, r, false);
  }

  function buildAll(field) {
    if (!g) return;
    g.fillStyle = MATERIALS.cavity.deep;
    g.fillRect(0, 0, canvas.width, canvas.height);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) paintTile(field, c, r);
    }
  }

  function repaintNeighborhood(field, c, r, radius = 1) {
    for (let dc = -radius; dc <= radius; dc++) {
      for (let dr = -radius; dr <= radius; dr++) {
        const cc = c + dc;
        const rr = r + dr;
        if (cc >= 0 && cc < cols && rr >= 0 && rr < rows) paintTile(field, cc, rr);
      }
    }
  }

  return { canvas, buildAll, paintTile, repaintNeighborhood };
}

export function machineName(defId) {
  const def = SITE_MACHINE_BY_ID.get(defId);
  return def ? def.name : defId;
}
