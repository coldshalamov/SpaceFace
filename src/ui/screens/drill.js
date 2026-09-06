// Drill lens screen (V2 §7 / cut-list #27). The remote deep-core extraction view. Renders the vein cross-
// section to a canvas, handles WASD / Arrow key movement and directional drilling input locally,
// and shows yield, drill warnings, and elegant item acquisition toasts.
import {
  DRILL_CONST,
  drillTierReqForOre,
  avatarDrawPos,
  avatarMoveProgress,
} from '../../systems/drill.js';
import { COMMODITIES } from '../../data/commodities.js';
import { prefersReducedMotion } from '../effects/effectRuntime.js';
import { formatBindingCode, resolveActionCodes } from '../../systems/input.js';

const { COLS, ROWS, TILE, SCAN_RADIUS, SCAN_COOLDOWN_S, SCAN_ACTIVE_S } = DRILL_CONST;
const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));

function bindingCodes(state, action) {
  return resolveActionCodes(state, action);
}

function codeLabel(code) {
  return formatBindingCode(code) || 'UNBOUND';
}

export function resolveDrillControlMap(state) {
  const unique = (...lists) => [...new Set(lists.flat().filter(Boolean))];
  const left = unique(bindingCodes(state, 'yawLeft'), bindingCodes(state, 'strafeLeft'));
  const right = unique(bindingCodes(state, 'yawRight'), bindingCodes(state, 'strafeRight'));
  const up = bindingCodes(state, 'forward');
  const down = bindingCodes(state, 'reverse');
  const scan = bindingCodes(state, 'scanPulse');
  return {
    left, right, up, down, scan,
    movementLabel: unique(up, left, down, right).map(codeLabel).join(' / ') || 'UNBOUND',
    scanLabel: scan.map(codeLabel).join(' / ') || 'UNBOUND',
  };
}

const DRILL_INPUT_STEP_S = 1 / 60;
// Catch up through ordinary 10–20 FPS dips, but never more than 100 ms in one render frame.
// A render frame may cross at most one cell, so a hitch cannot turn a held key into a burst.
const DRILL_INPUT_MAX_FRAME_S = 0.1;
const DIRECTION_VECTORS = Object.freeze({
  left: Object.freeze({ dc: -1, dr: 0 }),
  right: Object.freeze({ dc: 1, dr: 0 }),
  up: Object.freeze({ dc: 0, dr: -1 }),
  down: Object.freeze({ dc: 0, dr: 1 }),
});

export const DRILL_GAS_SHAKE_DURATION_S = 0.42;
export const DRILL_GAS_SHAKE_MAX_PX = 8;

// Deterministic trauma curve for the covered 2D playfield. The 3D chase-camera shake emitted by
// drill.js is still useful after the screen closes, but cannot be seen while this overlay is open.
export function drillGasShakeOffset(remainingS, elapsedS, reducedMotion = false) {
  const trauma = Math.max(0, Math.min(1, (Number(remainingS) || 0) / DRILL_GAS_SHAKE_DURATION_S));
  const amplitude = DRILL_GAS_SHAKE_MAX_PX * trauma * trauma * (reducedMotion ? 0.25 : 1);
  const phase = Math.max(0, Number(elapsedS) || 0);
  return {
    x: Math.sin(phase * 71 + 0.8) * amplitude,
    y: Math.cos(phase * 89 + 0.35) * amplitude * 0.72,
  };
}

const PRESS_IMPULSE = Object.freeze({ impulse: true });

/**
 * Convert physical held keys into bounded, fixed-step drill commands.
 *
 * Browser key auto-repeat is NOT the movement clock — the drill clock is (design law §11.7). This
 * controller deliberately owns no cadence of its own: keydown is one tap, delivered as a single
 * impulse step that seats exactly one cell or lands one bore bite, and every beat after that is
 * paced by drill.js (MOVE_HOLD_DELAY_S on the seat, MOVE_CRUISE_INTERVAL_S on the cruise). What it
 * does own is bounded fixed-step catch-up — at most one cell boundary per rendered frame, so a
 * delayed frame can never race the rover several cells into a hidden hazard — and the one fact the
 * sim cannot know: whether an intent still waiting on the beat clock is the tap the player already
 * paid for (which must survive keyup) or a cruise step (which release must cancel).
 */
export function createDrillInputController({ drillSys, getState }) {
  const held = { left: false, right: false, up: false, down: false };
  let activeDirection = null;
  let intent = null;
  let accumulator = 0;
  let blockedUntilRelease = false;
  // True while this press still owes the player the one cell it promised. Cleared the moment that
  // cell lands — so it can never be confused with a cruise intent, which release must cancel.
  let seatOwed = false;

  function clearCommand() {
    held.left = held.right = held.up = held.down = false;
    intent = null;
  }

  function armIntent(direction) {
    const vector = DIRECTION_VECTORS[direction];
    const d = getState();
    if (!vector || !d?.active || !d.avatar || blockedUntilRelease) return false;
    clearCommand();
    intent = {
      direction,
      col: d.avatar.col + vector.dc,
      row: d.avatar.row + vector.dr,
    };
    held[direction] = true;
    return true;
  }

  function settleIntent() {
    const d = getState();
    if (!intent || !d?.avatar) return null;
    const reached = d.avatar.col === intent.col && d.avatar.row === intent.row;
    const targetTile = d.field?.[intent.col]?.[intent.row];
    const rejectedSolid = targetTile?.type !== 'empty'
      && !d.avatar.isDrilling
      && !d.avatar.drillTarget;
    if (reached) {
      clearCommand();
      return 'reached';
    }
    if (!targetTile || rejectedSolid || d.avatar.drillBlocked || !d.active) {
      clearCommand();
      blockedUntilRelease = true;
      return 'blocked';
    }
    return null;
  }

  function step(dt, allowArm = true, impulse = false) {
    if (!intent && activeDirection && allowArm && !blockedUntilRelease) armIntent(activeDirection);
    const before = getState()?.avatar;
    const beforeCol = before?.col;
    const beforeRow = before?.row;
    drillSys.tickInput(held, dt, impulse ? PRESS_IMPULSE : undefined);
    settleIntent();
    const after = getState()?.avatar;
    return !!after && (after.col !== beforeCol || after.row !== beforeRow);
  }

  /** True when the cell at `at` is a hollow the rover could actually be seated into. */
  function isEmptyFace(at) {
    const d = getState();
    const column = at && d && d.field ? d.field[at.col] : null;
    const tile = column ? column[at.row] : null;
    return !!tile && tile.type === 'empty' && !tile.structure;
  }

  // A seat the player already paid for outlives the key. A tap can land while the previous beat
  // is still running down, and swallowing it is exactly what reads as an unresponsive rig — so the
  // tap's own uncommitted intent stays latched through keyup and lands on its own beat. Only that
  // one owed seat qualifies: releasing always stops a bore, and always stops a cruise.
  function seatPending() {
    return !!intent && seatOwed && isEmptyFace(intent);
  }

  return {
    held,
    press(direction) {
      const d = getState();
      if (!DIRECTION_VECTORS[direction] || !d?.active || !d.avatar) return false;
      activeDirection = direction;
      blockedUntilRelease = false;
      accumulator = 0;
      seatOwed = true;
      armIntent(direction);
      // The press IS the tap: one impulse step seats exactly one cell, or lands one bore bite on
      // the rock ahead. Nothing further happens until the hold outlasts MOVE_HOLD_DELAY_S, so a
      // keydown can never disappear between animation frames and can never chain by itself.
      if (step(DRILL_INPUT_STEP_S, false, true)) seatOwed = false;
      // The seat is only owed while an empty face is still waiting on the beat clock. A bore, a
      // refusal, or a cell that already landed settles the debt here.
      if (!intent || !isEmptyFace(intent)) seatOwed = false;
      return true;
    },
    release(direction) {
      if (direction !== activeDirection) return false;
      activeDirection = null;
      blockedUntilRelease = false;
      accumulator = 0;
      // Release stops the chain at the current cell. A seat still waiting on the beat clock is not
      // a chain — it is the tap itself — so it stays latched and completes.
      if (!seatPending()) clearCommand();
      // Retire drilling state immediately instead of waiting for the next animation frame.
      drillSys.tickInput(held, 0);
      return true;
    },
    tick(frameDt) {
      const bounded = Math.max(0, Math.min(DRILL_INPUT_MAX_FRAME_S, Number(frameDt) || 0));
      accumulator += bounded;
      let crossedCell = false;
      while (accumulator >= DRILL_INPUT_STEP_S) {
        // The chain is paced entirely by the drill clock: the seat stamped MOVE_HOLD_DELAY_S, so
        // re-arming here every step still cannot produce a second cell before the delay is up, and
        // every cell after that lands on the cruise beat. One cell boundary per rendered frame.
        if (step(DRILL_INPUT_STEP_S, !crossedCell)) {
          crossedCell = true;
          seatOwed = false; // the promised cell landed; anything after it is a cruise
        }
        accumulator -= DRILL_INPUT_STEP_S;
      }
      return !!intent || (!!activeDirection && !blockedUntilRelease);
    },
    cancel() {
      accumulator = 0;
      activeDirection = null;
      blockedUntilRelease = false;
      seatOwed = false;
      clearCommand();
      drillSys.tickInput(held, 0);
    },
    hasActiveIntent() { return !!intent || (!!activeDirection && !blockedUntilRelease); },
    /** True while an uncommitted intent is the tap's own promised cell (survives keyup). */
    hasOwedSeat() { return seatPending(); },
    target() { return intent ? { ...intent } : null; },
  };
}

// Presentation palette — one instrument-grammar resolver (same path as localmap.js).
// Hex fallbacks match styles/ui.css :root defaults. --accent has no role and is not used.
export const ROLE_FALLBACK = {
  you: '#4fbf8f',
  foe: '#ff5470',
  goal: '#ffb347',
  calm: '#84a0c8',
  paper: '#d3e6ff',
  surface: '#0b1220',
  edge: '#1d3350',
};

export function canvasRoles() {
  const fallback = ROLE_FALLBACK;
  if (typeof document === 'undefined' || !document.documentElement) return fallback;
  let cs;
  try { cs = getComputedStyle(document.documentElement); } catch { return fallback; }
  const read = (name, fb) => ((cs.getPropertyValue(name) || '').trim() || fb);
  return {
    you: read('--sf-you', fallback.you),
    foe: read('--sf-foe', fallback.foe),
    goal: read('--sf-goal', fallback.goal),
    calm: read('--sf-calm', fallback.calm),
    paper: read('--sf-paper', fallback.paper),
    surface: read('--sf-surface', fallback.surface),
    edge: read('--sf-edge', fallback.edge),
  };
}

export function paint(hex, a) {
  if (a == null || a >= 1) return hex;
  const n = String(hex || '').replace('#', '');
  if (n.length < 6) return hex;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  if (![r, g, b].every(Number.isFinite)) return hex;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

const MATERIAL_MARK = {
  you: '▣',
  matrix: '·',
  basalt: '/',
  gas: '✕',
  ice: '◆',
  exotic: '⬡',
  metal: '▭',
};

export function materialKind(key) {
  const id = String(key || '');
  if (id === 'rover' || id === 'drill') return 'you';
  if (id === 'dirt') return 'matrix';
  if (id === 'rock') return 'basalt';
  if (id === 'gas' || id === 'gasRevealed') return 'gas';
  if (id === 'cmdty_ice_water' || id.includes('_ice_')) return 'ice';
  if (id.includes('_gem_') || id.includes('_exotic_') || id === 'cmdty_ore_einsteinium') return 'exotic';
  if (id.startsWith('cmdty_')) return 'metal';
  return 'matrix';
}

export function colorForMaterial(key, roles) {
  const r = roles || canvasRoles();
  switch (materialKind(key)) {
    case 'you': return r.you;
    case 'gas': return r.foe;
    case 'ice': return r.paper;
    case 'exotic': return r.goal;
    case 'metal': return r.calm;
    case 'basalt': return r.edge;
    default: return r.surface;
  }
}

function svgDoc(inner, size = 40) {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size
    + '" width="' + size + '" height="' + size + '">' + inner + '</svg>';
}

function matrixSvg(r) {
  return svgDoc(
    '<rect width="40" height="40" fill="' + r.surface + '"/>'
    + '<circle cx="7" cy="9" r="1.1" fill="' + r.edge + '"/>'
    + '<circle cx="18" cy="6" r="1.1" fill="' + r.edge + '"/>'
    + '<circle cx="29" cy="11" r="1.1" fill="' + r.edge + '"/>'
    + '<circle cx="9" cy="22" r="1.1" fill="' + r.edge + '"/>'
    + '<circle cx="22" cy="19" r="1.1" fill="' + r.edge + '"/>'
    + '<circle cx="33" cy="24" r="1.1" fill="' + r.edge + '"/>'
    + '<circle cx="14" cy="32" r="1.1" fill="' + r.edge + '"/>'
    + '<circle cx="26" cy="34" r="1.1" fill="' + r.edge + '"/>'
  );
}

function basaltSvg(r) {
  return svgDoc(
    '<rect width="40" height="40" fill="' + r.edge + '"/>'
    + '<path d="M4 8 L18 22 L8 36" fill="none" stroke="' + r.surface + '" stroke-width="2"/>'
    + '<path d="M22 4 L36 20 L28 38" fill="none" stroke="' + r.surface + '" stroke-width="2"/>'
    + '<path d="M2 28 L16 14" fill="none" stroke="' + r.surface + '" stroke-width="1.5"/>'
  );
}

function metalSvg(r) {
  return svgDoc(
    '<rect width="40" height="40" fill="' + r.surface + '"/>'
    + '<rect x="6" y="9" width="18" height="10" rx="1.5" fill="' + r.calm + '" stroke="' + r.edge + '" stroke-width="1.5"/>'
    + '<rect x="14" y="20" width="18" height="10" rx="1.5" fill="' + r.calm + '" stroke="' + r.edge + '" stroke-width="1.5"/>'
  );
}

function iceSvg(r) {
  return svgDoc(
    '<rect width="40" height="40" fill="' + r.surface + '"/>'
    + '<polygon points="20,4 36,20 20,36 4,20" fill="' + r.paper + '" stroke="' + r.edge + '" stroke-width="1.5"/>'
    + '<polygon points="20,10 30,20 20,30 10,20" fill="' + r.surface + '"/>'
  );
}

function exoticSvg(r) {
  return svgDoc(
    '<rect width="40" height="40" fill="' + r.surface + '"/>'
    + '<polygon points="20,5 33,12.5 33,27.5 20,35 7,27.5 7,12.5" fill="' + r.goal + '" stroke="' + r.edge + '" stroke-width="1.5"/>'
  );
}

function gasRevealedSvg(r) {
  return svgDoc(
    '<rect width="40" height="40" fill="' + r.surface + '"/>'
    + '<polygon points="20,6 34,32 6,32" fill="none" stroke="' + r.foe + '" stroke-width="2.5"/>'
    + '<path d="M14 16 L26 28 M26 16 L14 28" stroke="' + r.foe + '" stroke-width="2.5" fill="none"/>'
  );
}

function roverSvg(r) {
  return svgDoc(
    '<rect x="6" y="40" width="52" height="14" rx="6" fill="' + r.surface + '" stroke="' + r.edge + '" stroke-width="2"/>'
    + '<rect x="10" y="18" width="44" height="24" rx="4" fill="' + r.you + '" stroke="' + r.edge + '" stroke-width="2"/>'
    + '<polygon points="22,18 32,6 48,18" fill="' + r.surface + '" stroke="' + r.edge + '" stroke-width="2"/>'
    + '<rect x="16" y="24" width="14" height="8" fill="' + r.paper + '"/>'
    + '<circle cx="18" cy="47" r="5" fill="' + r.edge + '"/>'
    + '<circle cx="32" cy="47" r="5" fill="' + r.edge + '"/>'
    + '<circle cx="46" cy="47" r="5" fill="' + r.edge + '"/>',
    64
  );
}

export function buildSvgTemplates(roles) {
  const r = roles || canvasRoles();
  const metal = metalSvg(r);
  const dirt = matrixSvg(r);
  return {
    rover: roverSvg(r),
    dirt,
    rock: basaltSvg(r),
    gas: dirt,
    gasRevealed: gasRevealedSvg(r),
    cmdty_silicate: metal,
    cmdty_ice_water: iceSvg(r),
    cmdty_ore_iron: metal,
    cmdty_ore_copper: metal,
    cmdty_ore_titanium: metal,
    cmdty_ore_bronzium: metal,
    cmdty_ore_silverium: metal,
    cmdty_ore_goldium: metal,
    cmdty_ore_platinium: metal,
    cmdty_ore_platinoid: metal,
    cmdty_ore_einsteinium: exoticSvg(r),
    cmdty_gem_emerald: exoticSvg(r),
    cmdty_gem_ruby: exoticSvg(r),
    cmdty_gem_diamond: exoticSvg(r),
    cmdty_exotic_amazonite: exoticSvg(r),
  };
}

/** Spawn a burst of state-driven particles (sparks / debris / steam). Pure helper for tests. */
export function spawnParticleBurst(into, opts) {
  const {
    x, y, count = 6, color = canvasRoles().you, life = 0.35, size = 2,
    speed = 40, gravity = 0, kind = 'spark', vx0 = 0, vy0 = 0, cone = Math.PI * 2, angle = 0,
  } = opts || {};
  const out = into || [];
  for (let i = 0; i < count; i++) {
    const a = angle + (Math.random() - 0.5) * cone;
    const sp = speed * (0.35 + Math.random() * 0.75);
    const maxLife = life * (0.55 + Math.random() * 0.55);
    out.push({
      x: x + (Math.random() - 0.5) * 4,
      y: y + (Math.random() - 0.5) * 4,
      vx: vx0 + Math.cos(a) * sp,
      vy: vy0 + Math.sin(a) * sp,
      color,
      size: size * (0.6 + Math.random() * 0.9),
      life: maxLife,
      maxLife,
      gravity,
      kind,
      isSteam: kind === 'steam',
      isDust: kind === 'dust',
      isRing: kind === 'ring',
      isFloater: kind === 'floater',
      text: opts?.text || null,
    });
  }
  return out;
}

/** Advance particle simulation one frame. Returns the same array, compacted in place. */
export function stepParticles(particles, dt) {
  let w = 0; // write index
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.gravity) p.vy += p.gravity * dt;
    if (p.kind === 'ring') p.size += 80 * dt;
    if (p.isFloater) p.vy -= 12 * dt;
    p.life -= dt;
    if (p.life > 0) {
      if (w !== i) particles[w] = p;
      w++;
    }
  }
  particles.length = w; // drop dead particles without allocating a new array
  return particles;
}

const STYLE_ID = 'sf-drill-style';

/**
 * Build the static depth-band + vignette overlay once per session into an offscreen canvas.
 * Previously this was redrawn every frame: 180 fillRect calls plus a radial gradient
 * allocation. It's identical every frame, so we rasterize it once and blit.
 */
export function buildOverlay(width, height) {
  if (typeof document === 'undefined') return null;
  const oc = document.createElement('canvas');
  oc.width = width;
  oc.height = height;
  const octx = oc.getContext('2d');
  if (!octx) return null;
  const r = canvasRoles();
  octx.fillStyle = paint(r.edge, 0.12);
  for (let y = 0; y < height; y += 8) {
    octx.fillRect(0, y, width, 1);
  }
  const grad = octx.createRadialGradient(width / 2, height / 2, height / 2, width / 2, height / 2, width);
  grad.addColorStop(0, paint(r.you, 0.01));
  grad.addColorStop(1, paint(r.surface, 0.35));
  octx.fillStyle = grad;
  octx.fillRect(0, 0, width, height);
  return oc;
}

/** Pre-rasterize the headlight cone so render() does not allocate a radial gradient each frame. */
export function buildHeadlightSprite(width = 210, height = 150) {
  if (typeof document === 'undefined') return null;
  const oc = document.createElement('canvas');
  oc.width = width;
  oc.height = height;
  const octx = oc.getContext('2d');
  if (!octx) return null;
  const r = canvasRoles();
  octx.save();
  octx.beginPath();
  octx.moveTo(0, height / 2);
  octx.lineTo(width, 0);
  octx.lineTo(width, height);
  octx.closePath();
  octx.clip();
  const grad = octx.createRadialGradient(0, height / 2, 8, width * 0.72, height / 2, width * 0.62);
  grad.addColorStop(0, paint(r.goal, 0.28));
  grad.addColorStop(0.4, paint(r.goal, 0.11));
  grad.addColorStop(1, paint(r.goal, 0));
  octx.fillStyle = grad;
  octx.fillRect(0, 0, width, height);
  octx.restore();
  return oc;
}

function titleCaseWords(value) {
  return String(value || '').replace(/^cmdty_/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function commodityName(id) {
  const commodity = COMMODITY_BY_ID.get(id);
  return (commodity && commodity.name) || titleCaseWords(id || 'ore');
}

function legendIconImg(iconKey, size = 22) {
  const img = document.createElement('img');
  img.width = size;
  img.height = size;
  img.className = 'drill-legend-icon';
  img.alt = '';
  const tpl = SVG_TEMPLATES[iconKey];
  if (tpl) img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(tpl);
  return img;
}

function makeLegendItem(label, iconKey, opts = {}) {
  const item = document.createElement('span');
  const matKey = iconKey || (opts.icons && opts.icons[0]) || '';
  const kind = materialKind(matKey);
  item.className = 'drill-legend-item'
    + (opts.warn ? ' warn' : '')
    + (opts.locked ? ' locked' : '');
  item.dataset.mat = kind;

  const mark = document.createElement('span');
  mark.className = 'drill-legend-mark';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = MATERIAL_MARK[kind] || '';
  item.appendChild(mark);

  if (opts.icons) {
    opts.icons.forEach((key, i) => {
      item.appendChild(legendIconImg(key));
      if (i < opts.icons.length - 1) {
        const arrow = document.createElement('span');
        arrow.className = 'drill-legend-arrow';
        arrow.textContent = '→';
        item.appendChild(arrow);
      }
    });
  } else if (iconKey) {
    item.appendChild(legendIconImg(iconKey));
  }

  const text = document.createElement('span');
  text.className = 'drill-legend-label';
  text.textContent = label;
  item.appendChild(text);

  if (opts.badge) {
    const badge = document.createElement('span');
    badge.className = 'drill-legend-badge' + (opts.warn ? ' bad' : '');
    badge.textContent = opts.badge;
    item.appendChild(badge);
  }

  return item;
}

function collectFieldLegendData(field) {
  const ores = new Set();
  let hasGas = false;
  if (!field) return { ores: [], hasGas: false };
  for (let c = 0; c < field.length; c++) {
    for (let r = 0; r < field[c].length; r++) {
      const tile = field[c][r];
      if (!tile) continue;
      if (!tile.surveyed) continue;
      if (tile.type === 'vein' && tile.ore) ores.add(tile.ore);
      if (tile.type === 'gas') hasGas = true;
    }
  }
  return {
    ores: [...ores].sort((a, b) => {
      const pa = COMMODITY_BY_ID.get(a)?.basePrice || 0;
      const pb = COMMODITY_BY_ID.get(b)?.basePrice || 0;
      return pa - pb;
    }),
    hasGas,
  };
}

function renderDrillLegend(gridEl, field, drillTier = 1) {
  if (!gridEl) return;
  gridEl.replaceChildren();

  gridEl.appendChild(makeLegendItem('Regolith', 'dirt'));
  gridEl.appendChild(makeLegendItem('Basalt', 'rock'));
  gridEl.appendChild(makeLegendItem('Unsurveyed', 'rock', { badge: 'PULSE' }));

  const { ores, hasGas } = collectFieldLegendData(field);

  if (hasGas) {
    gridEl.appendChild(makeLegendItem('Compressed gas pocket', 'gasRevealed', {
      warn: true,
      badge: 'AVOID',
    }));
  }

  for (const oreId of ores) {
    const req = drillTierReqForOre(oreId);
    const locked = drillTier < req;
    gridEl.appendChild(makeLegendItem(commodityName(oreId), oreId, {
      locked,
      badge: locked ? `MK${req}` : null,
    }));
  }

  if (ores.length === 0) {
    const note = document.createElement('span');
    note.className = 'drill-legend-note';
    note.textContent = 'Pulse the survey to resolve nearby deposits.';
    gridEl.appendChild(note);
  }
}

let SVG_TEMPLATES = {};
const IMAGES = {};

function hydrateImages(roles) {
  SVG_TEMPLATES = buildSvgTemplates(roles || canvasRoles());
  if (typeof Image === 'undefined') return;
  for (const key of Object.keys(SVG_TEMPLATES)) {
    const img = IMAGES[key] || new Image();
    img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(SVG_TEMPLATES[key]);
    IMAGES[key] = img;
  }
}
hydrateImages(ROLE_FALLBACK);

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  hydrateImages(canvasRoles());
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
.drill-screen {
  display: grid;
  grid-template-columns: minmax(190px, 260px) minmax(420px, 1fr) minmax(190px, 260px);
  gap: 10px;
  width: min(98vw, 1480px);
  height: min(88vh, 900px);
  margin: 0 auto;
  padding: 0;
  box-sizing: border-box;
  pointer-events: auto;
  align-items: stretch;
  font-family: var(--sf-body-face);
  color: var(--sf-calm);
  background: var(--sf-surface);
}
.drill-title {
  margin: 0;
  font: 700 17px/1.2 var(--sf-display-face);
  letter-spacing: 0;
  color: var(--sf-paper);
  text-transform: uppercase;
}
.drill-kicker {
  font-family: var(--sf-subhead-face);
  font-size: 12px;
  font-weight: 600;
  letter-spacing:.06em;
  color: var(--sf-calm);
  text-transform: uppercase;
}
.drill-housing {
  min-width: 0;
  background: var(--sf-surface);
  border: 1px solid var(--sf-edge);
  border-radius: 3px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: var(--sf-calm);
  overflow: auto;
  box-sizing: border-box;
}
.drill-housing .drill-deck {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
  border-bottom: 1px solid var(--sf-edge);
  padding-bottom: 14px;
}
.drill-housing .drill-deck:last-child { border-bottom: none; }
.drill-housing .sec-title {
  position: relative;
  padding-left: 9px;
  font-family: var(--sf-subhead-face);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--sf-calm);
  letter-spacing:.06em;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}
.drill-housing .sec-title::before {
  content: '';
  position: absolute;
  inset: 1px auto 1px 0;
  width: 2px;
  background: var(--sf-calm);
}
.drill-housing .readout-row {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: baseline;
  font-size: 12px;
  line-height: 1.35;
}
.drill-housing .readout-row .lbl { color: var(--sf-calm); overflow-wrap: anywhere; }
.drill-housing .readout-row .val {
  color: var(--sf-paper);
  text-align: right;
  font-family: var(--sf-data-face);
  font-variant-numeric: tabular-nums;
}
.drill-housing .readout-row .val.good { color: var(--sf-you); }
.drill-housing .readout-row .val.warn { color: var(--sf-goal); }
.drill-housing .readout-row .val.bad { color: var(--sf-foe); }
.drill-control-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 8px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--sf-calm);
}
.drill-control-list li { display:grid; grid-template-columns:minmax(0,1fr); gap:4px; }
.drill-screen kbd {
  width:100%;
  min-width:0;
  box-sizing: border-box;
  padding: 2px 5px;
  border: 1px solid var(--sf-edge);
  border-radius: 2px;
  background: color-mix(in srgb, var(--sf-you) 8%, transparent);
  color: var(--sf-you);
  font: 700 12px/1.4 var(--sf-data-face);
  letter-spacing: 0;
  text-align: center;
}
.drill-scan-button {
  width: 100%;
  min-height: 42px;
  margin-top: 2px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.drill-scan-button [data-scan-state] { color: var(--sf-calm); }
.drill-stage {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  justify-content: center;
}
.drill-canvas-wrap {
  position: relative;
  width: 100%;
  max-width: 900px;
  border: 1px solid var(--sf-edge);
  border-radius: 3px;
  background: var(--sf-surface);
  overflow: hidden;
}
.drill-canvas {
  display: block;
  width: 100%;
  height: auto;
  image-rendering: auto;
  outline: none;
}
.drill-canvas:focus-visible {
  box-shadow: inset 0 0 0 3px var(--sf-you);
}
.sonar-canvas {
  width: 100%;
  max-width: 246px;
  height: auto;
  margin: 2px auto 0;
  display: block;
  background: var(--sf-surface);
  border: 1px solid var(--sf-edge);
  border-radius: 2px;
}
.drill-hud {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(6, minmax(0,1fr));
  gap: 1px;
  max-width: 960px;
  border: 1px solid var(--sf-edge);
  background: var(--sf-surface);
  font-size: 12px;
  color: var(--sf-calm);
  letter-spacing: 0;
  text-transform: uppercase;
}
.drill-hud > span { min-width: 0; padding: 7px 8px; text-align: center; overflow-wrap: anywhere; }
.drill-hud > span + span { border-left: 1px solid var(--sf-edge); }
.drill-hud .v { color:var(--sf-paper); font-family: var(--sf-data-face); font-variant-numeric: tabular-nums; }
.drill-hud .warn { color:var(--sf-goal); }
.drill-hud .bad { color:var(--sf-foe); }
.drill-status-banner {
  display:flex; align-items:center; gap:9px;
  width:100%; max-width:900px; box-sizing:border-box;
  padding:8px 12px; margin-top:2px;
  border:1px solid var(--sf-foe); border-radius:3px;
  background: color-mix(in srgb, var(--sf-foe) 12%, transparent);
  color:var(--sf-foe); font-size:12px; letter-spacing:0; line-height:1.35;
}
.drill-status-banner[hidden] { display:none; }
.drill-status-banner.warn {
  border-color:var(--sf-goal);
  background: color-mix(in srgb, var(--sf-goal) 12%, transparent);
  color:var(--sf-goal);
}
.drill-status-banner.warn .drill-status-banner-icon { background:var(--sf-goal); color:var(--sf-surface); }
.drill-status-banner-icon {
  flex:0 0 auto; width:16px; height:16px; display:flex; align-items:center; justify-content:center;
  font-weight:700; font-size:12px; border-radius:50%;
  background:var(--sf-foe); color:var(--sf-surface);
}
.drill-status-banner-text { min-width:0; overflow-wrap:anywhere; }
.drill-legend {
  display:flex;
  flex-direction:column;
  gap:7px;
  width:100%;
  max-width:900px;
  color:var(--sf-calm);
}
.drill-legend-title {
  font-family: var(--sf-subhead-face);
  font-size:12px;
  font-weight: 600;
  color:var(--sf-calm);
  letter-spacing:.06em;
  text-transform:uppercase;
  text-align:center;
}
.drill-legend-grid {
  display:flex;
  flex-wrap:wrap;
  gap:7px;
  justify-content:center;
  align-items:center;
  min-width:0;
  padding:8px;
  border:1px solid var(--sf-edge);
  border-radius:2px;
  background:var(--sf-surface);
}
.drill-legend-item {
  min-width:0;
  display:inline-flex;
  align-items:center;
  gap:6px;
  font-size:12px;
  color:var(--sf-calm);
  padding:3px 6px;
  border-radius:2px;
  border: 1px solid var(--sf-edge);
}
.drill-legend-item.warn { color:var(--sf-goal); }
.drill-legend-item.locked { color:var(--sf-goal); }
.drill-legend-mark { display:none; font-family: var(--sf-data-face); }
.drill-legend-icon {
  width:22px;
  height:22px;
  border-radius:2px;
  border:1px solid var(--sf-edge);
  image-rendering:auto;
  flex-shrink:0;
  background:var(--sf-surface);
}
.drill-legend-arrow { font-size:12px; color:var(--sf-calm); opacity:0.7; }
.drill-legend-label { letter-spacing:0; white-space:nowrap; }
.drill-legend-badge {
  font-size:12px; font-weight:bold; letter-spacing:0; padding:1px 4px; border-radius:3px;
  background: color-mix(in srgb, var(--sf-you) 12%, transparent);
  color:var(--sf-you); border:1px solid var(--sf-edge);
  font-family: var(--sf-data-face);
}
.drill-legend-badge.bad {
  background: color-mix(in srgb, var(--sf-foe) 14%, transparent);
  color:var(--sf-foe); border-color:var(--sf-foe);
}
.drill-legend-note {
  font-size:12px; color:var(--sf-calm); letter-spacing:0; text-align:center;
}
.drill-foot { display:flex; gap:10px; justify-content:center; margin-top:4px; }
.drill-foot button.sf-btn { width:auto; min-height:40px; padding:9px 22px; }
.drill-screen button:focus-visible {
  outline:2px solid var(--sf-you);
  outline-offset:3px;
}
.drill-sr-status {
  position:absolute;
  width:1px;
  height:1px;
  padding:0;
  margin:-1px;
  overflow:hidden;
  clip:rect(0,0,0,0);
  white-space:nowrap;
  border:0;
}
.drill-activity-feed { display:flex; flex-direction:column; gap:5px; min-height:72px; max-height:156px; overflow:hidden; }
.drill-activity-empty { color:var(--sf-calm); font-size:12px; line-height:1.4; }
.drill-activity-item { display:grid; grid-template-columns:18px minmax(0,1fr) auto; gap:7px; align-items:start; padding:6px 7px; border-left:1px solid var(--sf-edge); background: color-mix(in srgb, var(--sf-you) 6%, transparent); color:var(--sf-calm); font-size:12px; line-height:1.35; overflow-wrap:anywhere; }
.drill-activity-item.warn { border-left-color:var(--sf-goal); color:var(--sf-goal); background: color-mix(in srgb, var(--sf-goal) 8%, transparent); }
.drill-activity-item.bad { border-left-color:var(--sf-foe); color:var(--sf-foe); background: color-mix(in srgb, var(--sf-foe) 8%, transparent); }
.drill-activity-item .icon { font-weight:700; color:currentColor; }
.drill-activity-item .value { color:var(--sf-paper); font-size:12px; font-family: var(--sf-data-face); font-variant-numeric: tabular-nums; }
.drill-activity-item .count { color:var(--sf-calm); font-size:12px; font-family: var(--sf-data-face); font-variant-numeric: tabular-nums; }
.drill-summary-drawer {
  position: absolute;
  left: 0; top: 0; width: 100%; height: 100%;
  background: color-mix(in srgb, var(--sf-surface) 85%, transparent);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
  pointer-events: auto;
}
.drill-summary-drawer.active { opacity: 1; }
.drill-summary-slab {
  background: var(--sf-surface);
  border: 1px solid var(--sf-edge);
  border-radius: 3px;
  padding: 24px;
  width: min(480px, calc(100vw - 32px));
  box-sizing: border-box;
  display: flex; flex-direction: column; gap: 16px;
}
.drill-summary-slab .title {
  font-family: var(--sf-subhead-face);
  font-size: 13px;
  font-weight: 600;
  letter-spacing:.06em;
  color: var(--sf-calm);
  text-align: center;
  border-bottom: 1px solid var(--sf-edge);
  padding-bottom: 10px;
  text-transform: uppercase;
}
.drill-summary-slab .item-list {
  display: flex; flex-direction: column; gap: 8px;
  max-height: 240px; overflow-y: auto;
}
.drill-summary-slab .item-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 0; border-bottom: 1px dashed var(--sf-edge);
}
.drill-summary-slab .item-row .left {
  display: flex; align-items: center; gap: 10px;
}
.drill-summary-slab .item-row .icon {
  width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;
}
.drill-summary-slab .item-row .icon img {
  width: 100%; height: 100%; object-fit: contain;
}
.drill-summary-slab .item-row .name {
  min-width:0; overflow-wrap:anywhere; font-family: var(--sf-body-face); font-size: 12px; color: var(--sf-calm);
}
.drill-summary-slab .item-row .value {
  font-family: var(--sf-data-face); font-size: 12px; color: var(--sf-paper); font-variant-numeric: tabular-nums;
}
.drill-summary-slab .total-row {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 8px; padding-top: 10px; border-top: 1px solid var(--sf-edge);
  font-family: var(--sf-data-face); font-size: 12px; font-weight: bold; color: var(--sf-paper);
  font-variant-numeric: tabular-nums;
}
.drill-summary-slab .total-row .val { color: var(--sf-you); }
.drill-summary-slab button.sf-btn {
  margin-top: 8px; align-self: center; width: 140px;
}
@media (max-width: 900px) {
  .drill-screen {
    grid-template-columns: minmax(0,1fr) minmax(0,1fr);
    width: min(96vw, 940px);
    height: calc(100vh - 20px);
    padding: 10px 0;
    overflow-y: auto;
  }
  .drill-stage { grid-column: 1 / -1; grid-row: 1; }
  .drill-housing { min-height: 320px; }
  .drill-housing.left-housing { grid-column: 1; grid-row: 2; }
  .drill-housing.right-housing { grid-column: 2; grid-row: 2; }
}
@media (max-width: 620px) {
  .drill-screen { grid-template-columns: minmax(0,1fr); width: calc(100vw - 16px); }
  .drill-stage,
  .drill-housing.left-housing,
  .drill-housing.right-housing { grid-column: 1; }
  .drill-housing.left-housing { grid-row: 2; }
  .drill-housing.right-housing { grid-row: 3; }
  .drill-hud { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .drill-hud > span:nth-child(3) { border-left:0; border-top:1px solid var(--sf-edge); }
  .drill-hud > span:nth-child(4) { border-top:1px solid var(--sf-edge); }
  .drill-title { font-size:14px; letter-spacing:0; }
}
@media (max-height: 760px) and (min-width: 901px) {
  .drill-screen { height: 94vh; gap:10px; }
  .drill-housing { padding:11px; gap:11px; }
  .drill-housing .drill-deck { gap:6px; padding-bottom:10px; }
  .drill-legend-grid { padding:5px; gap:4px; }
  .drill-legend-icon { width:18px; height:18px; }
}
@media (forced-colors: active) {
  .drill-screen, .drill-housing, .drill-canvas-wrap, .drill-hud, .drill-legend-grid, .drill-summary-slab {
    border: 1px solid CanvasText;
    background: Canvas;
    color: CanvasText;
  }
  .drill-legend-mark { display:inline; }
  .drill-legend-item[data-mat="metal"] .drill-legend-icon { outline: 2px solid CanvasText; }
  .drill-legend-item[data-mat="ice"] .drill-legend-icon { outline: 2px dashed CanvasText; }
  .drill-legend-item[data-mat="exotic"] .drill-legend-icon { outline: 3px dotted CanvasText; }
  .drill-legend-item[data-mat="gas"] .drill-legend-icon { outline: 2px double CanvasText; }
  .drill-legend-item[data-mat="basalt"] .drill-legend-icon { outline: 2px solid CanvasText; }
  .drill-legend-item[data-mat="matrix"] .drill-legend-icon { outline: 1px solid CanvasText; }
}
`;
  document.head.appendChild(s);
}

export const drillScreen = {
  id: 'drill',

  mount(rootEl, ctx) {
    injectStyle();
    rootEl.innerHTML = '';
    this._ctx = ctx;
    const state = ctx.state;
    const controlMap = resolveDrillControlMap(state);
    const wrap = document.createElement('div');
    wrap.className = 'drill-screen';
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-labelledby', 'drill-screen-title');

    // ==========================================
    // 1. LEFT TELEMETRY PANEL
    // ==========================================
    const leftPanel = document.createElement('aside');
    leftPanel.className = 'drill-housing left-housing';
    leftPanel.setAttribute('aria-label', 'Bore link and survey controls');
    
    // Header
    const leftHeader = document.createElement('div');
    leftHeader.className = 'drill-deck';
    leftHeader.innerHTML = `
      <div class="sec-title">Bore link</div>
      <div class="readout-row"><span class="lbl">Status</span><span class="val good">Nominal</span></div>
      <div class="readout-row"><span class="lbl">Cable load</span><span class="val" data-tension>18 N</span></div>
      <div class="readout-row"><span class="lbl">Power reserve</span><span class="val good" data-power>100%</span></div>
    `;
    leftPanel.appendChild(leftHeader);
    
    // Sonar section
    const sonarSec = document.createElement('div');
    sonarSec.className = 'drill-deck';
    sonarSec.innerHTML = `
      <div class="sec-title">Seismic survey</div>
    `;
    const sonarCanvas = document.createElement('canvas');
    sonarCanvas.className = 'sonar-canvas';
    sonarCanvas.width = 240;
    sonarCanvas.height = 130;
    sonarCanvas.setAttribute('role', 'img');
    sonarCanvas.setAttribute('aria-label', 'Local seismic plot. Use Pulse survey to mark nearby ore and gas contacts.');
    sonarSec.appendChild(sonarCanvas);
    leftPanel.appendChild(sonarSec);
    const sonarCtx = sonarCanvas.getContext('2d');
    
    // Controls list
    const controlSec = document.createElement('div');
    controlSec.className = 'drill-deck';
    controlSec.innerHTML = `
      <div class="sec-title">Rig controls</div>
      <ul class="drill-control-list">
        <li><kbd>${controlMap.movementLabel}</kbd><span>Hold to move or bore continuously</span></li>
        <li><kbd>${controlMap.scanLabel}</kbd><span>Pulse the local seismic survey</span></li>
        <li><kbd>ESC</kbd><span>Retract the rig</span></li>
      </ul>
      <button type="button" class="sf-btn drill-scan-button" data-drill-scan>
        <span>Pulse survey</span><span data-scan-state>Ready</span>
      </button>
    `;
    const scanBtn = controlSec.querySelector('[data-drill-scan]');
    leftPanel.appendChild(controlSec);
    wrap.appendChild(leftPanel);

    // ==========================================
    // 2. CENTER PANEL (PRIMARY CANVAS)
    // ==========================================
    const centerPanel = document.createElement('div');
    centerPanel.className = 'drill-stage';
    
    const kicker = document.createElement('div');
    kicker.className = 'drill-kicker';
    kicker.textContent = 'REMOTE EXTRACTION / LIVE FEED';
    centerPanel.appendChild(kicker);

    const title = document.createElement('h1');
    title.className = 'drill-title';
    title.id = 'drill-screen-title';
    title.textContent = 'Deep-core extraction';
    centerPanel.appendChild(title);

    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'drill-canvas-wrap';
    const canvas = document.createElement('canvas');
    canvas.className = 'drill-canvas';
    canvas.width = COLS * TILE;
    canvas.height = 18 * TILE;
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `Asteroid cross-section. Hold ${controlMap.movementLabel} to move or drill continuously. Release to stop. Press ${controlMap.scanLabel} to survey nearby strata.`);
    canvasWrap.appendChild(canvas);
    centerPanel.appendChild(canvasWrap);
    
    // HUD row
    const hud = document.createElement('div');
    hud.className = 'drill-hud';
    hud.setAttribute('aria-label', 'Extraction telemetry');
    hud.innerHTML =
      '<span>YIELD: <span class="v" data-yield>0</span></span>' +
      '<span>GAS HITS: <span class="warn" data-gas>0</span></span>' +
      '<span>CARGO: <span class="v" data-cargo>0%</span></span>' +
      '<span>ROCK LEFT: <span class="v" data-rock-budget>—</span></span>' +
      '<span>TEMP: <span class="v" data-temp>0%</span></span>' +
      '<span>ENERGY: <span class="v" data-energy>100%</span></span>';
    centerPanel.appendChild(hud);

    // Persistent status banner (cargo full / rock depleted). Stays visible — not a vanishing toast —
    // so "I'm drilling and nothing happens" always has a reason on-screen.
    const statusBanner = document.createElement('div');
    statusBanner.className = 'drill-status-banner';
    statusBanner.setAttribute('role', 'alert');
    statusBanner.setAttribute('aria-live', 'polite');
    statusBanner.hidden = true;
    statusBanner.innerHTML =
      '<span class="drill-status-banner-icon">!</span>' +
      '<span class="drill-status-banner-text" data-status-banner-text></span>';
    const statusBannerText = statusBanner.querySelector('[data-status-banner-text]');
    centerPanel.appendChild(statusBanner);
    let statusBannerKind = null; // 'cargo' | 'depleted' | null

    // Legend — uses the same SVG tile icons as the field, scoped to this deposit.
    const legend = document.createElement('div');
    legend.className = 'drill-legend';
    const legendTitle = document.createElement('div');
    legendTitle.className = 'drill-legend-title';
    legendTitle.textContent = 'Surveyed strata';
    legend.appendChild(legendTitle);
    const legendGrid = document.createElement('div');
    legendGrid.className = 'drill-legend-grid';
    legendGrid.setAttribute('data-drill-legend-grid', '');
    legend.appendChild(legendGrid);
    centerPanel.appendChild(legend);
    
    // Exit button
    const foot = document.createElement('div');
    foot.className = 'drill-foot';
    const exitBtn = document.createElement('button');
    exitBtn.className = 'sf-btn';
    exitBtn.textContent = 'Retract rig  Esc';
    foot.appendChild(exitBtn);
    const retryBtn = document.createElement('button');
    retryBtn.className = 'sf-btn';
    retryBtn.textContent = 'Restart bore';
    foot.appendChild(retryBtn);
    const abortBtn = document.createElement('button');
    abortBtn.className = 'sf-btn';
    abortBtn.textContent = 'Abort & return';
    foot.appendChild(abortBtn);
    centerPanel.appendChild(foot);
    
    wrap.appendChild(centerPanel);

    // ==========================================
    // 3. RIGHT PANEL (ANALYSIS & MANIFEST)
    // ==========================================
    const rightPanel = document.createElement('aside');
    rightPanel.className = 'drill-housing right-housing';
    rightPanel.setAttribute('aria-label', 'Target analysis and extraction manifest');
    
    const scanSec = document.createElement('div');
    scanSec.className = 'drill-deck';
    scanSec.innerHTML = `
      <div class="sec-title">Target analysis</div>
      <div id="drill-scan-target" style="font-size:12px; line-height:1.4; color:var(--sf-calm);">
        Resolving adjacent strata…
      </div>
    `;
    rightPanel.appendChild(scanSec);

    const activitySec = document.createElement('div');
    activitySec.className = 'drill-deck';
    activitySec.innerHTML = `
      <div class="sec-title">Rig activity</div>
      <div class="drill-activity-feed" data-drill-activity-feed>
        <div class="drill-activity-empty">Bore events will appear here.</div>
      </div>
    `;
    const activityFeed = activitySec.querySelector('[data-drill-activity-feed]');
    rightPanel.appendChild(activitySec);
    
    const manifestSec = document.createElement('div');
    manifestSec.className = 'drill-deck';
    manifestSec.innerHTML = `
      <div class="sec-title">Extraction manifest</div>
      <div id="drill-cargo-manifest-list" style="display:flex; flex-direction:column; gap:8px; max-height:220px; overflow-y:auto; padding-right:4px;">
        <div style="font-size:12px; color:var(--sf-calm);">No minerals extracted.</div>
      </div>
    `;
    rightPanel.appendChild(manifestSec);
    
    const engineSec = document.createElement('div');
    engineSec.className = 'drill-deck';
    engineSec.innerHTML = `
      <div class="sec-title">Drill assembly</div>
      <div class="readout-row"><span class="lbl">DRILL HEAD</span><span class="val" data-drill-tier>BASIC MK1</span></div>
      <div class="readout-row"><span class="lbl">DRILL RATE</span><span class="val" data-drill-dps>8 HP/s</span></div>
    `;
    rightPanel.appendChild(engineSec);
    
    wrap.appendChild(rightPanel);

    const srStatus = document.createElement('div');
    srStatus.className = 'drill-sr-status';
    srStatus.setAttribute('role', 'status');
    srStatus.setAttribute('aria-live', 'polite');
    srStatus.setAttribute('aria-atomic', 'true');
    wrap.appendChild(srStatus);
    rootEl.appendChild(wrap);

    const drillSys = ctx.drill || (ctx.registry && ctx.registry.get('drill'));
    drillScreen._drillTier = drillSys ? drillSys.getDrillTier() : 1;
    drillScreen._drillDps = drillSys ? drillSys.getDrillDPS() : 8;

    function announce(text) {
      srStatus.textContent = '';
      requestAnimationFrame(() => { srStatus.textContent = text; });
    }

    // Sidebar receipt feed. Consecutive duplicates collapse instead of stacking over the board.
    let lastActivity = null;
    function pushActivity(text, kind = 'info', commodityId = null, qty = 0) {
      if (lastActivity && lastActivity.text === text && lastActivity.kind === kind) {
        lastActivity.count++;
        lastActivity.countEl.textContent = `×${lastActivity.count}`;
        return;
      }
      const t = document.createElement('div');
      t.className = `drill-activity-item ${kind}`;
      
      const iconWrap = document.createElement('span');
      iconWrap.className = 'icon';
      iconWrap.textContent = kind === 'bad' ? '!' : (kind === 'warn' ? 'i' : '+');
      t.appendChild(iconWrap);
      
      const details = document.createElement('div');
      details.className = 'details';
      
      const mainText = document.createElement('span');
      mainText.textContent = text;
      details.appendChild(mainText);
      
      if (qty > 0 && commodityId) {
        const valueText = document.createElement('span');
        valueText.className = 'value';
        const basePrice = COMMODITY_BY_ID.get(commodityId)?.basePrice || 0;
        valueText.textContent = `Value: +${qty * basePrice} Cr`;
        details.appendChild(valueText);
      }
      t.appendChild(details);

      const countEl = document.createElement('span');
      countEl.className = 'count';
      t.appendChild(countEl);
      activityFeed.querySelector('.drill-activity-empty')?.remove();
      activityFeed.prepend(t);
      while (activityFeed.children.length > 5) activityFeed.lastElementChild.remove();
      lastActivity = { text, kind, count: 1, countEl };
    }

    // ---- input (local; sim is paused so we own keys) ----
    const inputController = createDrillInputController({
      drillSys,
      getState: () => state.drill,
    });
    const held = inputController.held;

    const pulseSurvey = () => {
      if (!drillSys || !state.drill) return;
      if (drillSys.pulseScan()) return;
      const remain = Math.max(0, state.drill.scan?.cooldown || 0);
      announce(`Seismic survey recharging. ${Math.ceil(remain)} seconds remaining.`);
    };
    
    let hoveredTile = null;
    const onMouseMove = (ev) => {
      const rect = canvas.getBoundingClientRect();
      const mx = (ev.clientX - rect.left) * (canvas.width / rect.width);
      const my = (ev.clientY - rect.top) * (canvas.height / rect.height);
      const col = Math.floor(mx / TILE);
      const row = Math.floor((my + viewY) / TILE);
      if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
        const changed = !hoveredTile || hoveredTile.col !== col || hoveredTile.row !== row;
        hoveredTile = { col, row, mouseX: mx, mouseY: my };
        if (changed) canvasDirty = true;
      } else {
        if (hoveredTile) canvasDirty = true;
        hoveredTile = null;
      }
    };
    const onMouseLeave = () => {
      if (hoveredTile) canvasDirty = true;
      hoveredTile = null;
    };
    const onKeyDown = (ev) => {
      const c = ev.code;
      let direction = null;
      if (controlMap.left.includes(c)) direction = 'left';
      else if (controlMap.right.includes(c)) direction = 'right';
      else if (controlMap.up.includes(c)) direction = 'up';
      else if (controlMap.down.includes(c)) direction = 'down';
      if (direction) {
        if (!ev.repeat && inputController.press(direction)) {
          canvasDirty = true;
          updateHud();
          render(0);
        }
        ev.preventDefault();
      }
      else if (controlMap.scan.includes(c)) { if (!ev.repeat) pulseSurvey(); ev.preventDefault(); }
      else if (c === 'Escape') { exit(); }
    };
    const onKeyUp = (ev) => {
      const c = ev.code;
      let direction = null;
      if (controlMap.left.includes(c)) direction = 'left';
      else if (controlMap.right.includes(c)) direction = 'right';
      else if (controlMap.up.includes(c)) direction = 'up';
      else if (controlMap.down.includes(c)) direction = 'down';
      if (direction) {
        if (inputController.release(direction)) canvasDirty = true;
        ev.preventDefault();
      }
    };
    const onWindowBlur = () => inputController.cancel();
    exitBtn.addEventListener('click', exit);
    scanBtn.addEventListener('click', pulseSurvey);

    const retryBore = () => {
      if (!drillSys?.retry()) return;
      inputController.cancel();
      damagedTiles.clear();
      buildStrataCache(state.drill);
      viewY = undefined;
      particles = [];
      canvasDirty = true;
      sonarDirty = true;
      for (const key of Object.keys(hudCache)) delete hudCache[key];
      renderDrillLegend(legendGrid, state.drill?.field, drillSys.getDrillTier());
      updateHud();
      updateManifest();
      announce('Bore restarted. Extracted cargo remains secured in the ship hold.');
    };
    retryBtn.addEventListener('click', retryBore);
    abortBtn.addEventListener('click', () => exit('aborted'));

    function exit(reason = 'retracted') {
      const d = state.drill;
      const total = d ? Object.values(d.yieldLog).reduce((a, b) => a + b, 0) : 0;
      if (d && drillSys) drillSys.end({ reason });
      
      // Phase 1: show overlay fade to black
      triggerDockFade(true);
      
      const camCtrl = state.render && state.render.cameraCtrl;
      if (camCtrl && typeof camCtrl.pushZoom === 'function') {
        camCtrl.pushZoom(0.18, 0.7); // back out zoom
      }
      
      setTimeout(() => {
        // Phase 2: pop screen
        if (ctx.screenManager) ctx.screenManager.popScreen();
        
        // Show summary modal if anything was mined
        if (d && total > 0) {
          showDrillSummaryModal(d.yieldLog);
        }
        
        // Phase 3: fade back in
        setTimeout(() => {
          triggerDockFade(false);
        }, 50);
      }, 400);
    }

    // ---- render + tick loop (rAF; we own time since sim is paused) ----
    const ctx2d = canvas.getContext('2d');
    let last = performance.now();
    let rafId = 0;
    let drillTheta = 0;
    let viewY = undefined;
    let particles = [];
    let hudElapsed = 0;
    let sonarElapsed = 0;
    let sonarDirty = true;
    let canvasDirty = true;
    let cameraSettling = true;
    let sparkVisualPhase = 0;
    // Cached HUD element handles + last-written values (avoids per-frame querySelector + DOM writes).
    const hudEls = {};
    const hudCache = {};
    // Cached --sf-data-face family — resolved once per session. Was 10× getComputedStyle/frame below,
    // each forcing a synchronous layout recalculation (the main source of visible chop).
    let monoFamily = 'monospace';
    // Pre-rendered static depth overlay — drawn once, blitted per frame.
    let overlayCanvas = null;
    let headlightSprite = null;
    // The field is mostly immutable. Rasterize it once and repaint only tiles whose reveal/empty
    // state changed; the hot path then uploads one viewport slice instead of ~500 SVG tiles.
    let strataCanvas = null;
    let strataCtx = null;
    let strataAvatarCol = null;
    let strataAvatarRow = null;
    const damagedTiles = new Set();

    const gasHitFlash = { t: 0 };
    const gasHitShake = { t: 0, elapsed: 0 };
    const yieldFlash = { t: 0, text: '' };
    const breakFlash = { t: 0, x: 0, y: 0 };
    // Amber edge-vignette pulse when a vein breaks into full holds (immediate per-tile feedback).
    const cargoFullFlash = { t: 0 };
    let motionReduce = prefersReducedMotion({
      motionReduce: !!(state.settings && state.settings.video && state.settings.video.motionReduce),
    });
    let roles = canvasRoles();

    const unsubs = [];

    function sparkColorFor(type, ore) {
      if (type === 'dirt') return roles.edge;
      if (type === 'rock') return roles.paper;
      if (type === 'gas') return colorForMaterial('gas', roles);
      if (type === 'vein' && ore) return colorForMaterial(ore, roles);
      return roles.paper;
    }

    function faceAngle(dir) {
      if (dir === 'left') return Math.PI;
      if (dir === 'up') return -Math.PI / 2;
      if (dir === 'down') return Math.PI / 2;
      return 0; // right
    }

    function paintStrataTile(d, col, row) {
      if (!strataCtx || !d?.field?.[col]?.[row]) return;
      const t = d.field[col][row];
      const x = col * TILE;
      const y = row * TILE;
      strataCtx.clearRect(x, y, TILE, TILE);

      if (t.type === 'empty') {
        strataCtx.strokeStyle = paint(roles.edge, 0.18);
        strataCtx.lineWidth = 1;
        strataCtx.strokeRect(x, y, TILE, TILE);
        return;
      }

      const surveyed = drillSys.isTileSurveyed(col, row);
      let img = null;
      // Gas pockets are always legible as hazards — never disguised as dirt. A pocket you only
      // learn about by dying into it is an unfair death, so the hazard sprite shows through the
      // survey fog exactly as it does once adjacent/revealed.
      if (t.type === 'gas') img = IMAGES.gasRevealed;
      else if (!surveyed) img = (t.type === 'rock' || t.type === 'vein') ? IMAGES.rock : IMAGES.dirt;
      else if (t.type === 'dirt') img = IMAGES.dirt;
      else if (t.type === 'rock') img = IMAGES.rock;
      else if (t.type === 'vein' && t.ore) img = IMAGES[t.ore];

      if (img?.complete && img.naturalWidth > 0) {
        strataCtx.drawImage(img, x, y, TILE, TILE);
      } else if (surveyed && t.type === 'vein' && t.ore) {
        strataCtx.fillStyle = paint(roles.foe, 0.25);
        strataCtx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
        strataCtx.strokeStyle = roles.foe;
        strataCtx.lineWidth = 1.5;
        strataCtx.strokeRect(x + 4, y + 4, TILE - 8, TILE - 8);
        strataCtx.fillStyle = roles.goal;
        strataCtx.font = 'bold 12px ' + monoFamily;
        strataCtx.textAlign = 'center';
        strataCtx.fillText('?', x + TILE / 2, y + TILE / 2 + 3);
      } else {
        // Images decode asynchronously on first boot. Preserve material readability for that short
        // window; buildStrataCache runs again as soon as every SVG is decoded.
        strataCtx.fillStyle = (t.type === 'rock' || t.type === 'vein') ? roles.edge : roles.surface;
        strataCtx.fillRect(x, y, TILE, TILE);
      }

      if (surveyed && t.type === 'vein' && t.ore) {
        const req = t.tierReq || drillTierReqForOre(t.ore);
        const tier = drillScreen._drillTier || 1;
        if (tier < req) {
          strataCtx.save();
          strataCtx.fillStyle = paint(roles.surface, 0.55);
          strataCtx.fillRect(x, y, TILE, TILE);
          strataCtx.strokeStyle = paint(roles.foe, 0.85);
          strataCtx.lineWidth = 1.5;
          strataCtx.strokeRect(x + 3, y + 3, TILE - 6, TILE - 6);
          strataCtx.fillStyle = roles.foe;
          strataCtx.font = 'bold 12px ' + monoFamily;
          strataCtx.textAlign = 'center';
          strataCtx.fillText(`MK${req}`, x + TILE / 2, y + TILE / 2 + 3);
          strataCtx.restore();
        }
      }
    }

    function buildStrataCache(d) {
      if (!d?.field || typeof document === 'undefined') return null;
      if (!strataCanvas) strataCanvas = document.createElement('canvas');
      strataCanvas.width = COLS * TILE;
      strataCanvas.height = ROWS * TILE;
      strataCtx = strataCanvas.getContext('2d', { alpha: true });
      if (!strataCtx) return null;
      strataCtx.clearRect(0, 0, strataCanvas.width, strataCanvas.height);
      for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) paintStrataTile(d, c, r);
      }
      strataAvatarCol = d.avatar?.col ?? null;
      strataAvatarRow = d.avatar?.row ?? null;
      return strataCanvas;
    }

    function paintStrataNeighborhood(d, col, row, radius = SCAN_RADIUS) {
      if (!strataCtx || !Number.isFinite(col) || !Number.isFinite(row)) return;
      const minCol = Math.max(0, col - radius);
      const maxCol = Math.min(COLS - 1, col + radius);
      const minRow = Math.max(0, row - radius);
      const maxRow = Math.min(ROWS - 1, row + radius);
      for (let c = minCol; c <= maxCol; c++) {
        for (let r = minRow; r <= maxRow; r++) paintStrataTile(d, c, r);
      }
    }

    function syncStrataCache(d) {
      if (!strataCanvas || !strataCtx) buildStrataCache(d);
      const col = d.avatar?.col;
      const row = d.avatar?.row;
      if (col === strataAvatarCol && row === strataAvatarRow) return;
      paintStrataNeighborhood(d, strataAvatarCol, strataAvatarRow, 3);
      paintStrataNeighborhood(d, col, row, 3);
      strataAvatarCol = col;
      strataAvatarRow = row;
    }

    function drawDamageCracks(targetCtx, tile, x, y) {
      if (!tile || tile.maxHp <= 0 || tile.hp >= tile.maxHp) return;
      const frac = 1 - (tile.hp / tile.maxHp);
      targetCtx.strokeStyle = 'rgba(0,0,0,' + (0.35 + frac * 0.4) + ')';
      targetCtx.lineWidth = 1.5;
      targetCtx.beginPath();
      targetCtx.moveTo(x + 2, y + 4); targetCtx.lineTo(x + TILE - 4, y + TILE - 2);
      if (frac > 0.5) {
        targetCtx.moveTo(x + TILE - 3, y + 2); targetCtx.lineTo(x + 3, y + TILE - 3);
      }
      targetCtx.stroke();
    }

    // Register event subscriptions
    unsubs.push(ctx.bus.on('drill:yield', (p) => {
      const name = commodityName(p.commodityId);
      yieldFlash.t = 1.1;
      yieldFlash.text = '+' + p.qty + ' ' + name.toUpperCase();
      const px = (p.pos?.col ?? 0) * TILE + TILE / 2;
      const py = (p.pos?.row ?? 0) * TILE + TILE / 2;
      const color = colorForMaterial(p.commodityId, roles);
      spawnParticleBurst(particles, {
        x: px, y: py, count: 10, color, life: 0.55, size: 2.4, speed: 55,
        kind: 'spark', gravity: 40, cone: Math.PI * 2,
      });
      spawnParticleBurst(particles, {
        x: px, y: py - 6, count: 3, color: roles.you, life: 0.9, size: 1.5,
        speed: 8, kind: 'floater', text: '+' + p.qty, vy0: -18,
      });
      pushActivity(`+${p.qty} ${name} extracted`, 'info', p.commodityId, p.qty);
      canvasDirty = true;
      announce(`${p.qty} units of ${name} extracted.`);
      updateManifest();
    }));

    unsubs.push(ctx.bus.on('drill:gasHit', (p) => {
      gasHitFlash.t = motionReduce ? 0.25 : 0.75;
      gasHitShake.t = DRILL_GAS_SHAKE_DURATION_S;
      gasHitShake.elapsed = 0;
      const px = (p.pos?.col ?? 0) * TILE + TILE / 2;
      const py = (p.pos?.row ?? 0) * TILE + TILE / 2;
      spawnParticleBurst(particles, {
        x: px, y: py, count: motionReduce ? 4 : 14, color: roles.foe,
        life: 0.55, size: 3, speed: 70, kind: 'spark', cone: Math.PI * 2,
      });
      if (!motionReduce) {
        spawnParticleBurst(particles, {
          x: px, y: py, count: 2, color: paint(roles.foe, 0.55),
          life: 0.4, size: 6, speed: 0, kind: 'ring',
        });
      }
      pushActivity('Gas pocket — hull damaged', 'bad');
      canvasDirty = true;
      announce(`Gas pocket breached. Hull damage ${p.dmg}.`);
    }));

    function showStatusBanner(kind, text) {
      statusBannerKind = kind;
      statusBanner.classList.toggle('warn', kind === 'depleted');
      if (statusBannerText) statusBannerText.textContent = text;
      statusBanner.hidden = false;
    }

    unsubs.push(ctx.bus.on('drill:warn', (p) => {
      pushActivity(p.text, p.reason === 'cargoFull' ? 'bad' : 'warn');
      if (p.reason === 'tier' && p.pos) {
        const px = (p.pos.col ?? 0) * TILE + TILE / 2;
        const py = (p.pos.row ?? 0) * TILE + TILE / 2;
        spawnParticleBurst(particles, {
          x: px, y: py - 6, count: 2, color: roles.goal, life: 1.0, size: 1.5,
          speed: 6, kind: 'floater', text: `MK${p.tierReq || 2} LOCKED`, vy0: -16,
        });
      }
      if (p.reason === 'depleted' && p.pos) {
        const px = (p.pos.col ?? 0) * TILE + TILE / 2;
        const py = (p.pos.row ?? 0) * TILE + TILE / 2;
        spawnParticleBurst(particles, {
          x: px, y: py - 6, count: 2, color: roles.goal, life: 1.1, size: 1.5,
          speed: 6, kind: 'floater', text: 'ROCK EMPTY', vy0: -16,
        });
      }
      canvasDirty = true;
      announce(p.text);
      updateHud();
    }));

    unsubs.push(ctx.bus.on('drill:rockDepleted', (p) => {
      showStatusBanner('depleted',
        p?.text || 'This rock is played out — veins break but pay no ore until it recovers.');
      pushActivity(p?.text || 'Rock deep-core yield exhausted', 'warn');
      canvasDirty = true;
      announce(p?.text || 'Rock deep-core yield exhausted.');
      updateHud();
    }));

    unsubs.push(ctx.bus.on('drill:cargoFull', (p) => {
      // A vein broke but the holds could not take the ore. Immediate per-tile feedback + sticky banner.
      const px = (p.pos?.col ?? 0) * TILE + TILE / 2;
      const py = (p.pos?.row ?? 0) * TILE + TILE / 2;
      const name = commodityName(p.commodityId);
      spawnParticleBurst(particles, {
        x: px, y: py - 6, count: 3, color: roles.foe, life: 1.0, size: 1.5,
        speed: 8, kind: 'floater', text: 'CARGO FULL', vy0: -18,
      });
      cargoFullFlash.t = motionReduce ? 0.4 : 1.0;
      showStatusBanner('cargo',
        'CARGO HOLDS FULL — mining now wastes ore. Retract the rig to offload.');
      pushActivity(`${name} vein mined — cargo full, ore wasted`, 'bad');
      canvasDirty = true;
      announce(`Cargo holds full. ${name} ore could not be stored.`);
      updateHud();
    }));

    unsubs.push(ctx.bus.on('drill:scanPulse', (p) => {
      sonarDirty = true;
      const d = state.drill;
      if (d?.avatar) paintStrataNeighborhood(d, d.avatar.col, d.avatar.row, SCAN_RADIUS);
      renderDrillLegend(legendGrid, state.drill?.field, drillSys.getDrillTier());
      const result = p.contacts === 1 ? '1 contact' : `${p.contacts} contacts`;
      pushActivity(`Survey resolved — ${result}`, 'info');
      canvasDirty = true;
      announce(`Seismic survey resolved ${result} within ${p.radius} tiles.`);
      sonarCanvas.setAttribute('aria-label', `Local seismic plot. Last survey resolved ${result}.`);
    }));

    unsubs.push(ctx.bus.on('drill:break', (p) => {
      if (!state.drill) return;
      damagedTiles.delete(`${p.col}:${p.row}`);
      paintStrataTile(state.drill, p.col, p.row);
      const cx = p.col * TILE + TILE / 2;
      const cy = p.row * TILE + TILE / 2;
      const color = sparkColorFor(p.type, p.ore);
      breakFlash.t = 0.22;
      breakFlash.x = cx;
      breakFlash.y = cy;
      spawnParticleBurst(particles, {
        x: cx, y: cy, count: motionReduce ? 5 : 12, color,
        life: 0.45, size: 2.8, speed: 60, kind: 'spark', gravity: 55, cone: Math.PI * 2,
      });
      spawnParticleBurst(particles, {
        x: cx, y: cy, count: 4, color: paint(roles.edge, 0.4),
        life: 0.5, size: 3.5, speed: 18, kind: 'dust',
      });
      canvasDirty = true;
    }));

    unsubs.push(ctx.bus.on('drill:spark', (p) => {
      if (!state.drill) return;
      damagedTiles.add(`${p.col}:${p.row}`);
      sparkVisualPhase = (sparkVisualPhase + 1) % 2;
      if (sparkVisualPhase === 0) return;
      const d = state.drill;
      const dir = d.avatar.faceDir || 'down';
      const ang = faceAngle(dir);
      // Interface edge of the tile being drilled
      let cx = p.col * TILE + TILE / 2;
      let cy = p.row * TILE + TILE / 2;
      if (dir === 'right') cx = p.col * TILE;
      else if (dir === 'left') cx = p.col * TILE + TILE;
      else if (dir === 'down') cy = p.row * TILE;
      else if (dir === 'up') cy = p.row * TILE + TILE;

      const color = sparkColorFor(p.type, p.ore);
      const density = motionReduce ? 2 : 5;
      spawnParticleBurst(particles, {
        x: cx, y: cy, count: density, color,
        life: 0.28, size: 1.8, speed: 45, kind: 'spark',
        angle: ang + Math.PI, cone: 1.1, gravity: 20,
      });
      if (!motionReduce && Math.random() < 0.45) {
        spawnParticleBurst(particles, {
          x: cx, y: cy, count: 1, color: paint(roles.edge, 0.35),
          life: 0.4, size: 2.5, speed: 12, kind: 'dust', angle: ang + Math.PI, cone: 0.8,
        });
      }
      canvasDirty = true;
    }));

    function drawSonar(d) {
      if (!sonarCtx) return;
      const w = sonarCanvas.width;
      const h = sonarCanvas.height;
      sonarCtx.clearRect(0, 0, w, h);
      
      const cx = w / 2;
      const cy = h / 2;
      
      // Draw grid rings
      sonarCtx.strokeStyle = paint(roles.you, 0.08);
      sonarCtx.lineWidth = 1;
      for (let r = 25; r <= 65; r += 20) {
        sonarCtx.beginPath();
        sonarCtx.arc(cx, cy, r, 0, Math.PI * 2);
        sonarCtx.stroke();
      }
      // Grid crosshairs
      sonarCtx.beginPath();
      sonarCtx.moveTo(cx - 70, cy); sonarCtx.lineTo(cx + 70, cy);
      sonarCtx.moveTo(cx, cy - 60); sonarCtx.lineTo(cx, cy + 60);
      sonarCtx.stroke();
      
      // The sweep is the feature acknowledgment. It never animates at rest.
      const active = !!(d && d.scan && d.scan.active > 0);
      const progress = active ? (motionReduce ? 1 : 1 - Math.min(1, d.scan.active / SCAN_ACTIVE_S)) : 1;
      const sweepAngle = progress * Math.PI * 2;

      if (active) {
        sonarCtx.fillStyle = paint(roles.you, 0.04);
        sonarCtx.beginPath();
        sonarCtx.moveTo(cx, cy);
        sonarCtx.arc(cx, cy, 65, sweepAngle - 0.45, sweepAngle);
        sonarCtx.closePath();
        sonarCtx.fill();

        sonarCtx.strokeStyle = paint(roles.you, 0.4);
        sonarCtx.beginPath();
        sonarCtx.moveTo(cx, cy);
        sonarCtx.lineTo(cx + Math.cos(sweepAngle) * 65, cy + Math.sin(sweepAngle) * 65);
        sonarCtx.stroke();
      }

      // Draw surveyed contacts. Ore uses a diamond; gas uses a cross, so color is never the only cue.
      if (d && d.field) {
        const ar = d.avatar.row;
        const ac = d.avatar.col;

        for (let dc = -SCAN_RADIUS; dc <= SCAN_RADIUS; dc++) {
          for (let dr = -SCAN_RADIUS; dr <= SCAN_RADIUS; dr++) {
            if ((dc * dc) + (dr * dr) > SCAN_RADIUS * SCAN_RADIUS) continue;
            const tc = ac + dc;
            const tr = ar + dr;
            if (tc >= 0 && tc < COLS && tr >= 0 && tr < ROWS) {
              const tile = d.field[tc][tr];
              if (!tile || !tile.surveyed || (tile.type !== 'vein' && tile.type !== 'gas')) continue;
              const px = cx + dc * 12;
              const py = cy + dr * 12;
              const color = tile.type === 'gas' ? roles.foe : (colorForMaterial(tile.ore, roles));
              sonarCtx.globalAlpha = active ? 0.95 : 0.68;
              sonarCtx.strokeStyle = color;
              sonarCtx.fillStyle = color;
              sonarCtx.lineWidth = 1.5;
              if (tile.type === 'gas') {
                sonarCtx.beginPath();
                sonarCtx.moveTo(px - 3, py - 3); sonarCtx.lineTo(px + 3, py + 3);
                sonarCtx.moveTo(px + 3, py - 3); sonarCtx.lineTo(px - 3, py + 3);
                sonarCtx.stroke();
              } else {
                sonarCtx.beginPath();
                sonarCtx.moveTo(px, py - 3.5);
                sonarCtx.lineTo(px + 3.5, py);
                sonarCtx.lineTo(px, py + 3.5);
                sonarCtx.lineTo(px - 3.5, py);
                sonarCtx.closePath();
                sonarCtx.fill();
              }
              sonarCtx.globalAlpha = 1;
            }
          }
        }
      }

      sonarCtx.fillStyle = roles.paper;
      sonarCtx.fillRect(cx - 2, cy - 2, 4, 4);
    }

    function frame(now) {
      rafId = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      const d = state.drill;
      if (!d) return;

      // Advance a bounded single-cell command. Render hitches never become oversized drill work.
      inputController.tick(dt);

      // spin drill bit if drilling (faster under heat for readable load)
      if (d.avatar.isDrilling) {
        const heatBoost = 1 + (d.drillTemp || 0) / 120;
        drillTheta += 42 * heatBoost * dt;
      }

      // Exhaust steam only while moving or drilling (state-driven — no idle fog)
      const moving = inputController.hasActiveIntent() || avatarMoveProgress(d.avatar) < 1;
      if (!motionReduce && Math.random() < (d.avatar.isDrilling ? 0.55 : 0.32) && moving) {
        const draw = avatarDrawPos(d.avatar, TILE);
        const dir = d.avatar.faceDir || 'down';
        let ex = draw.x + TILE / 2;
        let ey = draw.y + TILE / 2;
        let angle = faceAngle(dir) + Math.PI;
        if (dir === 'right') ex = draw.x;
        else if (dir === 'left') ex = draw.x + TILE;
        else if (dir === 'down') ey = draw.y;
        else if (dir === 'up') ey = draw.y + TILE;
        spawnParticleBurst(particles, {
          x: ex, y: ey, count: 1,
          color: 'rgba(215, 230, 255, 0.4)',
          life: 0.45, size: 2.2, speed: 22, kind: 'steam', angle, cone: 0.7,
        });
      }

      // Drill contact dust denser while chewing a tile
      if (d.avatar.isDrilling && d.avatar.drillTarget && !motionReduce && Math.random() < 0.55) {
        const tx = d.avatar.drillTarget.col * TILE + TILE / 2;
        const ty = d.avatar.drillTarget.row * TILE + TILE / 2;
        spawnParticleBurst(particles, {
          x: tx + (Math.random() - 0.5) * TILE * 0.6,
          y: ty + (Math.random() - 0.5) * TILE * 0.6,
          count: 2, color: paint(roles.edge, 0.4),
          life: 0.55, size: 2.4, speed: 16, kind: 'dust',
        });
      }

      particles = stepParticles(particles, dt);
      if (particles.length > 180) {
        particles.copyWithin(0, particles.length - 180);
        particles.length = 180;
      }

      // flash timers
      if (gasHitFlash.t > 0) gasHitFlash.t -= dt;
      if (gasHitShake.t > 0) {
        gasHitShake.t = Math.max(0, gasHitShake.t - dt);
        gasHitShake.elapsed += dt;
      }
      if (yieldFlash.t > 0) yieldFlash.t -= dt;
      if (breakFlash.t > 0) breakFlash.t -= dt;
      if (cargoFullFlash.t > 0) cargoFullFlash.t -= dt;

      sonarElapsed += dt;
      const scanActive = !!(d.scan && d.scan.active > 0);
      if (sonarDirty || ((moving || scanActive) && sonarElapsed >= 0.05)) {
        drawSonar(d);
        sonarElapsed = 0;
        sonarDirty = scanActive;
      }
      const animated = inputController.hasActiveIntent()
        || avatarMoveProgress(d.avatar) < 1
        || particles.length > 0
        || gasHitFlash.t > 0
        || gasHitShake.t > 0
        || yieldFlash.t > 0
        || breakFlash.t > 0
        || cargoFullFlash.t > 0
        || scanActive;
      if (canvasDirty || cameraSettling || animated) {
        cameraSettling = render(dt);
        canvasDirty = false;
      }
      hudElapsed += dt;
      if (hudElapsed >= 0.1) {
        updateHud();
        hudElapsed = 0;
      }
    }

    function render(dt) {
      const d = state.drill;
      if (!d) return false;
      roles = canvasRoles();
      ctx2d.setTransform(1, 0, 0, 1, 0, 0);
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);
      ctx2d.fillStyle = roles.surface;
      ctx2d.fillRect(0, 0, canvas.width, canvas.height);
      const shake = drillGasShakeOffset(gasHitShake.t, gasHitShake.elapsed, motionReduce);
      ctx2d.save();
      ctx2d.translate(shake.x, shake.y);

      // Time-interpolated draw position across the full move window (sim owns from/to + elapsed).
      const drawPos = avatarDrawPos(d.avatar, TILE);
      drillScreen._rx = drawPos.x;
      drillScreen._ry = drawPos.y;

      // Camera view height — follow interpolated rover so camera is continuous at 2× step rate
      const viewHeight = 18 * TILE;
      const targetViewY = drillScreen._ry - viewHeight / 2 + TILE / 2;
      const camRate = motionReduce ? 1 : 10;
      
      // Initialize viewY if first frame (snap only on session start)
      if (viewY === undefined || isNaN(viewY)) {
        viewY = Math.max(0, Math.min(ROWS * TILE - viewHeight, targetViewY));
      } else {
        viewY = viewY + (targetViewY - viewY) * Math.min(1, camRate * dt);
        viewY = Math.max(0, Math.min(ROWS * TILE - viewHeight, viewY));
      }
      const stillSettling = Math.abs(targetViewY - viewY) > 0.25;

      const startRow = Math.max(0, Math.floor(viewY / TILE) - 1);
      const endRow = Math.min(ROWS, Math.ceil((viewY + viewHeight) / TILE) + 1);

      // Draw background (outer space sky)
      ctx2d.fillStyle = roles.surface;
      ctx2d.fillRect(0, 0, canvas.width, canvas.height);

      // Draw cavern tunnels background below surface
      const tunnelTopY = Math.max(0, 0 - viewY);
      ctx2d.fillStyle = roles.edge;
      ctx2d.fillRect(0, tunnelTopY, canvas.width, Math.max(0, ROWS * TILE - viewY));

      // The unchanged field is one cached bitmap. Only break/reveal neighborhoods repaint it.
      syncStrataCache(d);
      if (strataCanvas) {
        ctx2d.drawImage(strataCanvas, 0, viewY, canvas.width, viewHeight, 0, 0, canvas.width, viewHeight);
      }

      // Cracks are the only tile surface that changes continuously while the drill is in contact.
      // Track those few cells explicitly instead of scanning every visible tile each frame.
      for (const key of damagedTiles) {
        const split = key.indexOf(':');
        const col = Number(key.slice(0, split));
        const row = Number(key.slice(split + 1));
        if (row < startRow || row >= endRow) continue;
        drawDamageCracks(ctx2d, d.field?.[col]?.[row], col * TILE, row * TILE - viewY);
      }

      // Seismic pulse: one state-driven ring, clipped naturally by the canvas.
      if (d.scan && d.scan.active > 0) {
        const progress = motionReduce ? 1 : 1 - Math.min(1, d.scan.active / SCAN_ACTIVE_S);
        const radius = progress * SCAN_RADIUS * TILE;
        const alpha = motionReduce ? 0.28 : Math.max(0.08, 0.48 * (1 - progress));
        ctx2d.save();
        ctx2d.strokeStyle = `rgba(79,143,221,${alpha})`;
        ctx2d.lineWidth = 2;
        ctx2d.beginPath();
        ctx2d.arc(drillScreen._rx + TILE / 2, drillScreen._ry + TILE / 2 - viewY, radius, 0, Math.PI * 2);
        ctx2d.stroke();
        ctx2d.restore();
      }

      // Draw particles (sparks, steam, dust, rings, floaters)
      particles.forEach((p) => {
        const alpha = Math.max(0, p.life / (p.maxLife || 0.001));
        ctx2d.globalAlpha = alpha;
        const py = p.y - viewY;
        if (p.isRing) {
          ctx2d.strokeStyle = p.color;
          ctx2d.lineWidth = 2;
          ctx2d.beginPath();
          ctx2d.arc(p.x, py, p.size, 0, Math.PI * 2);
          ctx2d.stroke();
        } else if (p.isFloater && p.text) {
          ctx2d.fillStyle = p.color;
          ctx2d.font = 'bold 12px ' + monoFamily;
          ctx2d.textAlign = 'center';
          ctx2d.fillText(p.text, p.x, py);
        } else if (p.isSteam) {
          ctx2d.fillStyle = p.color;
          const size = p.size * (1 + (1 - alpha) * 1.8);
          ctx2d.beginPath();
          ctx2d.arc(p.x, py, size, 0, Math.PI * 2);
          ctx2d.fill();
        } else if (p.isDust) {
          ctx2d.fillStyle = p.color;
          const size = p.size * (1 + (1 - alpha) * 2.5);
          ctx2d.beginPath();
          ctx2d.arc(p.x, py, size, 0, Math.PI * 2);
          ctx2d.fill();
        } else {
          ctx2d.fillStyle = p.color;
          ctx2d.shadowColor = p.color;
          ctx2d.shadowBlur = 4;
          ctx2d.fillRect(p.x, py, p.size, p.size);
          ctx2d.shadowBlur = 0;
        }
      });
      ctx2d.globalAlpha = 1.0;

      // Tile-break flash pulse
      if (breakFlash.t > 0) {
        const a = breakFlash.t / 0.22;
        ctx2d.fillStyle = `rgba(79,143,221,${0.18 * a})`;
        ctx2d.beginPath();
        ctx2d.arc(breakFlash.x, breakFlash.y - viewY, TILE * (0.6 + (1 - a) * 0.8), 0, Math.PI * 2);
        ctx2d.fill();
      }

      // Cargo-full edge vignette — an amber screen-border pulse the instant a vein is wasted into
      // full holds, so the player feels each wasted break even while focused on the tile.
      if (cargoFullFlash.t > 0) {
        const a = Math.min(1, cargoFullFlash.t);
        const vg = ctx2d.createLinearGradient(0, 0, 0, canvas.height);
        vg.addColorStop(0, `rgba(255,179,92,${0.34 * a})`);
        vg.addColorStop(0.18, paint(roles.goal, 0));
        vg.addColorStop(0.82, paint(roles.goal, 0));
        vg.addColorStop(1, `rgba(255,179,92,${0.34 * a})`);
        ctx2d.fillStyle = vg;
        ctx2d.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Draw avatar (rover & rotating drill)
      const rx = drillScreen._rx;
      const ry = drillScreen._ry - viewY;

      // --- Draw Massline Power Cable ---
      if (d.cableTrail && d.cableTrail.length > 0) {
        ctx2d.save();
        // Thick dark outer casing
        ctx2d.strokeStyle = paint(roles.surface, 0.85);
        ctx2d.lineWidth = 5;
        ctx2d.lineCap = 'round';
        ctx2d.lineJoin = 'round';
        ctx2d.beginPath();
        const startCol = Math.floor(COLS / 2);
        ctx2d.moveTo(startCol * TILE + TILE / 2, 0 - viewY);
        for (let i = 0; i < d.cableTrail.length; i++) {
          const pt = d.cableTrail[i];
          ctx2d.lineTo(pt.col * TILE + TILE / 2, pt.row * TILE + TILE / 2 - viewY);
        }
        ctx2d.lineTo(rx + TILE / 2, ry + TILE / 2);
        ctx2d.stroke();

        // Glowing inner core
        ctx2d.strokeStyle = roles.you;
        ctx2d.shadowColor = roles.you;
        ctx2d.shadowBlur = 6;
        ctx2d.lineWidth = 2.2;
        ctx2d.stroke();

        // Power trace only moves while the rig is moving or drilling.
        ctx2d.strokeStyle = roles.paper;
        ctx2d.shadowBlur = 0;
        ctx2d.lineWidth = 1.2;
        ctx2d.setLineDash([5, 12]);
        const cableActive = d.avatar.isDrilling || held.left || held.right || held.up || held.down;
        ctx2d.lineDashOffset = (!motionReduce && cableActive) ? -performance.now() * 0.04 : 0;
        ctx2d.stroke();
        ctx2d.restore();
      }
      
      // --- Draw Headlight Spotlight Beam ---
      const dir = d.avatar.faceDir || 'down';
      const cx = rx + TILE / 2;
      const cy = ry + TILE / 2;
      let theta = 0;
      if (dir === 'left') theta = Math.PI;
      else if (dir === 'down') theta = Math.PI / 2;
      else if (dir === 'up') theta = -Math.PI / 2;
      else if (dir === 'right') theta = 0;

      if (headlightSprite) {
        ctx2d.save();
        ctx2d.translate(cx, cy);
        ctx2d.rotate(theta);
        ctx2d.drawImage(headlightSprite, 0, -headlightSprite.height / 2);
        ctx2d.restore();
      }
      
      ctx2d.save();
      
      // Rover shake when drilling — damped fully under motionReduce
      let sx = 0, sy = 0;
      if (d.avatar.isDrilling && !motionReduce) {
        const amp = 1.2 + (d.drillTemp || 0) / 80;
        sx = (Math.random() - 0.5) * amp;
        sy = (Math.random() - 0.5) * amp;
      }
      ctx2d.translate(rx + TILE / 2 + sx, ry + TILE / 2 + sy);

      // Rotate/Flip context based on faceDir
      const roverDir = d.avatar.faceDir || 'down';
      if (roverDir === 'left') {
        ctx2d.scale(-1, 1);
      } else if (roverDir === 'down') {
        ctx2d.rotate(Math.PI / 2);
      } else if (roverDir === 'up') {
        ctx2d.rotate(-Math.PI / 2);
      }

      // Draw rover body (1.4x tile size for chunkiness)
      const roverSize = TILE * 1.4;
      ctx2d.drawImage(IMAGES.rover, -roverSize / 2, -roverSize / 2, roverSize, roverSize);

      // Draw 3D auger drill bit procedurally (spin driven by session theta for smoothness)
      drawAugerDrillBit(ctx2d, roverSize / 2, 4, TILE * 1.25, 0, drillTheta);

      ctx2d.restore();

      // Gas-hit danger flash overlay (token danger hue; shorter under motionReduce)
      if (gasHitFlash.t > 0) {
        const intensity = motionReduce ? gasHitFlash.t * 0.25 : gasHitFlash.t * 0.45;
        ctx2d.fillStyle = `rgba(255,84,112,${intensity})`;
        ctx2d.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Yield popup text above avatar
      if (yieldFlash.t > 0) {
        ctx2d.save();
        ctx2d.globalAlpha = Math.min(1, yieldFlash.t * 1.4);
        ctx2d.fillStyle = roles.you;
        ctx2d.font = 'bold 13px ' + monoFamily;
        ctx2d.textAlign = 'center';
        ctx2d.shadowColor = roles.surface;
        ctx2d.shadowBlur = 4;
        const floatY = motionReduce ? 10 : (1 - Math.min(1, yieldFlash.t)) * 28;
        ctx2d.fillText(yieldFlash.text, rx + TILE / 2, ry - 10 - floatY);
        ctx2d.restore();
      }

      // --- 3. Telemetry Thermal Temperature Gauge ---
      if (d.drillTemp !== undefined) {
        ctx2d.save();
        const gx = 12;
        const gy = 12;
        const gw = 8;
        const gh = 100;
        
        // Slot background
        ctx2d.fillStyle = paint(roles.surface, 0.75);
        ctx2d.strokeStyle = paint(roles.you, 0.25);
        ctx2d.lineWidth = 1;
        ctx2d.fillRect(gx, gy, gw, gh);
        ctx2d.strokeRect(gx, gy, gw, gh);
        
        // Temperature fill bar
        const fillHeight = (d.drillTemp / 100) * gh;
        const fy = gy + gh - fillHeight;
        
        let fillCol = roles.you;
        if (d.overheated) {
          fillCol = (!motionReduce && Math.floor(performance.now() / 200) % 2 === 0) ? roles.foe : roles.goal;
        } else if (d.drillTemp > 75) {
          fillCol = roles.foe;
        } else if (d.drillTemp > 45) {
          fillCol = roles.goal;
        }
        
        ctx2d.fillStyle = fillCol;
        ctx2d.fillRect(gx + 1, fy + 1, gw - 2, fillHeight - 2);
        
        // Label
        ctx2d.fillStyle = paint(roles.paper, 0.6);
        ctx2d.font = 'bold 12px ' + monoFamily;
        ctx2d.textAlign = 'left';
        ctx2d.fillText('TEMP', gx, gy + gh + 12);
        
        if (d.overheated) {
          ctx2d.fillStyle = roles.foe;
          ctx2d.fillText('OVERHEAT', gx + 14, gy + 12);
        }
        ctx2d.restore();
      }

      // Mirrored capacitor gauge: energy is as run-ending as heat and needs equal spatial weight.
      if (d.drillEnergy !== undefined) {
        ctx2d.save();
        const gx = canvas.width - 20;
        const gy = 12;
        const gw = 8;
        const gh = 100;
        const energy = Math.max(0, Math.min(100, Number(d.drillEnergy) || 0));
        const fillHeight = (energy / 100) * gh;
        const fy = gy + gh - fillHeight;

        ctx2d.fillStyle = paint(roles.surface, 0.75);
        ctx2d.strokeStyle = paint(roles.you, 0.25);
        ctx2d.lineWidth = 1;
        ctx2d.fillRect(gx, gy, gw, gh);
        ctx2d.strokeRect(gx, gy, gw, gh);
        ctx2d.fillStyle = d.energyDepleted ? roles.foe : (energy < 25 ? roles.goal : roles.you);
        ctx2d.fillRect(gx + 1, fy + 1, gw - 2, Math.max(0, fillHeight - 2));

        ctx2d.fillStyle = paint(roles.paper, 0.6);
        ctx2d.font = 'bold 12px ' + monoFamily;
        ctx2d.textAlign = 'right';
        ctx2d.fillText('ENERGY', gx + gw, gy + gh + 12);
        if (d.energyDepleted) {
          ctx2d.fillStyle = roles.foe;
          ctx2d.fillText('EMPTY', gx - 6, gy + 12);
        }
        ctx2d.restore();
      }

      // --- 3.5 Depth telemetry markings ---
      ctx2d.save();
      ctx2d.fillStyle = paint(roles.you, 0.38);
      ctx2d.font = 'bold 12px ' + monoFamily;
      ctx2d.textAlign = 'right';
      
      const stepY = TILE * 2;
      const startTick = Math.max(0, Math.floor(viewY / stepY) - 1);
      const endTick = Math.min(ROWS, Math.ceil((viewY + canvas.height) / stepY) + 1);
      
      for (let i = startTick; i <= endTick; i++) {
        const ty = i * stepY - viewY;
        ctx2d.fillRect(canvas.width - 5, ty, 5, 1);
        ctx2d.fillText(`${i * 10}M`, canvas.width - 9, ty + 3);
      }
      ctx2d.restore();

      // --- 3.7 Target locking reticles & hover tooltips ---
      
      // 3.7.1 Active Blocked Drill Target Reticle
      if (d.avatar.drillTarget && d.avatar.drillBlocked) {
        const tc = d.avatar.drillTarget.col;
        const tr = d.avatar.drillTarget.row;
        const tx = tc * TILE;
        const ty = tr * TILE - viewY;
        
        ctx2d.save();
        // Locked reticle — foe token plus corner ticks and MK label; colour is not the only cue.
        ctx2d.strokeStyle = roles.foe;
        ctx2d.lineWidth = 2;
        ctx2d.strokeRect(tx + 2, ty + 2, TILE - 4, TILE - 4);
        
        // Corner ticks
        ctx2d.beginPath();
        ctx2d.moveTo(tx, ty + 10); ctx2d.lineTo(tx, ty); ctx2d.lineTo(tx + 10, ty);
        ctx2d.moveTo(tx + TILE, ty + 10); ctx2d.lineTo(tx + TILE, ty); ctx2d.lineTo(tx + TILE - 10, ty);
        ctx2d.moveTo(tx, ty + TILE - 10); ctx2d.lineTo(tx, ty + TILE); ctx2d.lineTo(tx + 10, ty + TILE);
        ctx2d.moveTo(tx + TILE, ty + TILE - 10); ctx2d.lineTo(tx + TILE, ty + TILE); ctx2d.lineTo(tx + TILE - 10, ty + TILE);
        ctx2d.stroke();
        
        // Warning text block
        ctx2d.fillStyle = paint(roles.surface, 0.9);
        ctx2d.fillRect(tx - 30, ty - 18, TILE + 60, 14);
        ctx2d.strokeStyle = roles.foe;
        ctx2d.lineWidth = 1;
        ctx2d.strokeRect(tx - 30, ty - 18, TILE + 60, 14);
        
        ctx2d.fillStyle = roles.foe;
        ctx2d.font = 'bold 12px ' + monoFamily;
        ctx2d.textAlign = 'center';
        
        const names = { 2: 'MK2 DRILL REQ', 3: 'MK3 DRILL REQ', 4: 'MK4 DRILL REQ' };
        const req = d.field[tc][tr]?.tierReq || 1;
        ctx2d.fillText(names[req] || 'UPGRADE DRILL', tx + TILE / 2, ty - 8);
        ctx2d.restore();
      }

      // 3.7.2 Hover Tooltip overlay
      if (hoveredTile) {
        const col = hoveredTile.col;
        const row = hoveredTile.row;
        const t = d.field[col][row];
        
        if (t && t.type !== 'empty') {
          const hx = col * TILE;
          const hy = row * TILE - viewY;
          
          ctx2d.save();
          // 1. Draw target indicator frame
          ctx2d.strokeStyle = paint(roles.you, 0.7);
          ctx2d.lineWidth = 1.5;
          ctx2d.strokeRect(hx + 1, hy + 1, TILE - 2, TILE - 2);
          
          // Outer corners
          ctx2d.beginPath();
          ctx2d.moveTo(hx - 3, hy + 6); ctx2d.lineTo(hx - 3, hy - 3); ctx2d.lineTo(hx + 6, hy - 3);
          ctx2d.moveTo(hx + TILE + 3, hy + 6); ctx2d.lineTo(hx + TILE + 3, hy - 3); ctx2d.lineTo(hx + TILE - 6, hy - 3);
          ctx2d.moveTo(hx - 3, hy + TILE - 6); ctx2d.lineTo(hx - 3, hy + TILE + 3); ctx2d.lineTo(hx + 6, hy + TILE + 3);
          ctx2d.moveTo(hx + TILE + 3, hy + TILE - 6); ctx2d.lineTo(hx + TILE + 3, hy + TILE + 3); ctx2d.lineTo(hx + TILE - 6, hy + TILE + 3);
          ctx2d.stroke();
          
          // 2. Draw HUD tooltip next to cursor
          let mx = hoveredTile.mouseX + 16;
          let my = hoveredTile.mouseY + 12;
          
          // Keep tooltip on screen
          const tw = 168;
          const th = 72;
          if (mx + tw > canvas.width) mx = hoveredTile.mouseX - tw - 12;
          if (my + th > canvas.height) my = hoveredTile.mouseY - th - 12;
          
          ctx2d.fillStyle = 'rgba(6, 10, 18, 0.95)';
          ctx2d.fillRect(mx, my, tw, th);
          ctx2d.strokeStyle = paint(roles.you, 0.35);
          ctx2d.lineWidth = 1;
          ctx2d.strokeRect(mx, my, tw, th);
          
          // Faint left accent line
          ctx2d.fillStyle = paint(roles.you, 0.8);
          ctx2d.fillRect(mx, my, 3, th);
          
          // Text fields
          ctx2d.fillStyle = roles.paper;
          ctx2d.font = 'bold 12px ' + monoFamily;
          ctx2d.textAlign = 'left';
          
          let name = 'UNKNOWN STRATA';
          let subtitle = '';
          let reqText = 'Drill Head: Basic MK1';
          let valueText = '';
          let isBlocked = false;
          const surveyed = drillSys.isTileSurveyed(col, row);

          if (!surveyed) {
            name = 'UNSURVEYED STRATA';
            subtitle = 'Composition unresolved';
            reqText = 'SPACE: Pulse survey';
          } else if (t.type === 'dirt') {
            name = 'SOFT REGOLITH';
            subtitle = 'HP: ' + Math.ceil(t.hp) + '/' + t.maxHp;
          } else if (t.type === 'rock') {
            name = 'SOLID BASALT';
            subtitle = 'HP: ' + Math.ceil(t.hp) + '/' + t.maxHp;
          } else if (t.type === 'gas') {
            name = 'GAS VENT POCKET';
            subtitle = 'HP: 1/1';
          } else if (t.type === 'vein' && t.ore) {
            name = commodityName(t.ore).toUpperCase();
            const basePrice = COMMODITY_BY_ID.get(t.ore)?.basePrice || 0;
            subtitle = `Density: High (${Math.ceil(t.hp)} HP)`;
            valueText = `Market Price: ${basePrice} Cr`;
            
            const tier = drillScreen._drillTier || 1;
            const req = t.tierReq || 1;
            const names = { 1: 'Basic MK1', 2: 'Carbon MK2', 3: 'Diamond MK3', 4: 'Ind. Heavy MK4' };
            reqText = `Min Engine: ${names[req] || 'MK' + req}`;
            if (tier < req) {
              isBlocked = true;
            }
          }
          
          ctx2d.fillText(name, mx + 8, my + 14);
          
          ctx2d.fillStyle = 'rgba(215, 230, 255, 0.6)';
          ctx2d.font = '12px ' + monoFamily;
          ctx2d.fillText(subtitle, mx + 8, my + 30);
          if (valueText) {
            ctx2d.fillText(valueText, mx + 8, my + 44);
          }
          
          if (isBlocked) {
            ctx2d.fillStyle = roles.foe;
            ctx2d.font = 'bold 12px ' + monoFamily;
            ctx2d.fillText('LOCKED — UPGRADE DRILL', mx + 8, my + 60);
          } else {
            ctx2d.fillStyle = paint(roles.you, 0.8);
            ctx2d.fillText(reqText, mx + 8, my + 60);
          }
          
          ctx2d.restore();
        }
      }

      // --- 4. Static depth bands + vignette (cached overlay; see buildOverlay) ---
      if (overlayCanvas) {
        ctx2d.drawImage(overlayCanvas, 0, 0);
      }
      ctx2d.restore();
      return stillSettling;
    }

    function setText(el, key, text) {
      // Only touch the DOM when the value actually changed — skips querySelector + reflow per frame.
      if (!el || hudCache[key] === text) return;
      hudCache[key] = text;
      el.textContent = text;
    }

    function setClassName(el, key, cn) {
      if (!el || hudCache[key] === cn) return;
      hudCache[key] = cn;
      el.className = cn;
    }

    function setHtml(el, key, html) {
      if (!el || hudCache[key] === html) return;
      hudCache[key] = html;
      el.innerHTML = html;
    }

    function updateManifest() {
      const d = state.drill;
      if (!d || !hudEls.manifest) return;
      const entries = [];
      for (const commodityId in d.yieldLog) {
        const qty = d.yieldLog[commodityId];
        if (qty > 0) entries.push([commodityId, qty]);
      }
      if (entries.length === 0) {
        const empty = document.createElement('div');
        empty.style.fontSize = '12px';
        empty.style.color = 'var(--sf-calm)';
        empty.textContent = 'No minerals extracted.';
        hudEls.manifest.replaceChildren(empty);
        return;
      }
      const fragment = document.createDocumentFragment();
      for (const [commodityId, qty] of entries) {
        const name = commodityName(commodityId);
        const basePrice = COMMODITY_BY_ID.get(commodityId)?.basePrice || 0;
        const row = document.createElement('div');
        row.className = 'readout-row';
        row.style.borderBottom = '1px solid paint(roles.paper, 0.05)';
        row.style.padding = '3px 0';
        const label = document.createElement('span');
        label.className = 'lbl';
        label.textContent = `${name} × ${qty}`;
        const value = document.createElement('span');
        value.className = 'val';
        value.textContent = `${qty * basePrice} Cr`;
        row.append(label, value);
        fragment.appendChild(row);
      }
      hudEls.manifest.replaceChildren(fragment);
    }

    function updateHud() {
      const d = state.drill;
      if (!d) return;
      let total = 0;
      for (const commodityId in d.yieldLog) total += d.yieldLog[commodityId] || 0;
      setText(hudEls.yield, 'yield', total);
      setText(hudEls.gas, 'gas', d.gasHits);
      const cargo = state.player.cargo;
      const cap = cargo && cargo.capVolume > 0 ? cargo.capVolume : 0;
      const used = cargo ? Number(cargo.usedVolume) || 0 : 0;
      const freeU = cap > 0 ? Math.max(0, Math.floor(cap - used)) : 0;
      const cargoUsed = cap > 0 ? Math.round((used / cap) * 100) : 0;
      const cargoFull = cargoUsed >= 100 || (cap > 0 && freeU <= 0);
      setText(hudEls.cargo, 'cargo',
        cargoFull ? '100% FULL' : `${cargoUsed}% · ${freeU}u free`);
      setClassName(hudEls.cargo, 'cargoCn', cargoFull ? 'bad' : 'v');
      if (cargoFull) {
        showStatusBanner('cargo',
          'CARGO HOLDS FULL — mining now wastes ore. Retract the rig to offload.');
      } else if (statusBannerKind === 'cargo') {
        statusBanner.hidden = true;
        statusBannerKind = null;
      }
      // Rock deep-core budget (finite when the asteroid tracks depletion).
      if (hudEls.rockBudget) {
        const budget = d.rockBudget;
        const max = d.rockBudgetMax;
        if (Number.isFinite(budget) && Number(max) > 0) {
          setText(hudEls.rockBudget, 'rockBudget', budget <= 0 ? '0 (EMPTY)' : String(Math.floor(budget)));
          setClassName(hudEls.rockBudget, 'rockBudgetCn', budget <= 0 ? 'bad' : 'v');
          if (budget <= 0 && statusBannerKind !== 'cargo') {
            showStatusBanner('depleted',
              'This rock is played out — veins break but pay no ore until it recovers.');
          }
        } else {
          setText(hudEls.rockBudget, 'rockBudget', '—');
          setClassName(hudEls.rockBudget, 'rockBudgetCn', 'v');
        }
      }
      if (hudEls.temp && d.drillTemp !== undefined) {
        setText(hudEls.temp, 'temp', Math.round(d.drillTemp) + '%');
        setClassName(hudEls.temp, 'tempCn', d.overheated ? 'warn' : 'v');
      }
      if (hudEls.energy) {
        setText(hudEls.energy, 'energy', Math.round(d.drillEnergy ?? 100) + '%');
        setClassName(hudEls.energy, 'energyCn', d.energyDepleted || d.drillEnergy < 25 ? 'warn' : 'v');
      }

      // --- Update bore-link readouts ---
      if (hudEls.tension) {
        // State-driven tension only — no idle wobble (taste: nothing animates at rest)
        const baseTension = d.avatar.isDrilling ? 45 : (held.left || held.right || held.down || held.up ? 28 : 18);
        const variation = (d.avatar.isDrilling && !motionReduce)
          ? Math.sin(performance.now() * 0.012) * 5
          : 0;
        setText(hudEls.tension, 'tension', `${Math.round(baseTension + variation)} N`);
        setClassName(hudEls.tension, 'tensionCn', d.avatar.isDrilling ? 'val warn' : 'val');
      }
      if (hudEls.power) {
        const powerPct = Math.max(0, d.drillEnergy ?? 100);
        setText(hudEls.power, 'power', `${Math.round(powerPct)}%`);
        setClassName(hudEls.power, 'powerCn', powerPct < 25 ? 'val warn' : 'val good');
      }

      if (hudEls.scanState) {
        const remaining = Math.max(0, d.scan?.cooldown || 0);
        const stateText = remaining > 0 ? `${Math.ceil(remaining)} s` : 'Ready';
        setText(hudEls.scanState, 'scanState', stateText);
        const disabled = remaining > 0;
        const scanAria = disabled
          ? `Pulse survey recharging, ${Math.ceil(remaining)} seconds remaining`
          : `Pulse seismic survey, ${controlMap.scanLabel}`;
        if (hudCache.scanAria !== scanAria) {
          hudCache.scanAria = scanAria;
          scanBtn.setAttribute('aria-label', scanAria);
        }
        if (hudCache.scanDisabled !== disabled) {
          hudCache.scanDisabled = disabled;
          scanBtn.disabled = disabled;
        }
      }

      // --- Update target and drill readouts ---
      // 1. Drill Head & DPS engine specs (refresh live — outfitting can change mid-session)
      if (drillSys) {
        drillScreen._drillTier = drillSys.getDrillTier();
        drillScreen._drillDps = drillSys.getDrillDPS();
      }
      if (hudEls.tier) {
        const names = { 1: 'BASIC MK1', 2: 'CARBON MK2', 3: 'DIAMOND MK3', 4: 'IND. HEAVY MK4' };
        const tier = drillScreen._drillTier || 1;
        setText(hudEls.tier, 'tier', names[tier] || `TIER MK${tier}`);
      }
      if (hudEls.dps) {
        const dps = drillScreen._drillDps || 8;
        setText(hudEls.dps, 'dps', `${dps} HP/s`);
      }

      // 2. Target scanner — only re-render HTML when the targeted tile/type changes.
      if (hudEls.scan) {
        let nc = d.avatar.col;
        let nr = d.avatar.row;
        const dir = d.avatar.faceDir || 'down';
        if (dir === 'left') nc--;
        else if (dir === 'right') nc++;
        else if (dir === 'down') nr++;
        else if (dir === 'up') nr--;

        let html = null;
        if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS) {
          const t = d.field[nc][nr];
          const telemetry = drillSys.getTargetTelemetry(nc, nr);
          const hardness = telemetry ? telemetry.hardness.toFixed(2) : '0.00';
          const progress = telemetry ? Math.round(telemetry.progress * 100) : 0;
          const remaining = telemetry && Number.isFinite(telemetry.remainingS)
            ? `${telemetry.remainingS.toFixed(1)} s`
            : '—';
          const workLine = `<br>Hardness ${hardness} · ${progress}% cut · ${remaining}`;
          if (!drillSys.isTileSurveyed(nc, nr)) {
            html = '<strong>UNSURVEYED STRATA</strong><br>Pulse survey to resolve';
          } else if (t.type === 'empty') {
            html = '<span style="color:var(--sf-calm);">Target</span><br>Open bore';
          } else if (t.type === 'dirt') {
            html = '<strong>SOFT REGOLITH</strong><br>Integrity ' + Math.ceil(t.hp) + '/' + t.maxHp + workLine
              + '<br><span style="color:var(--sf-calm);">Bore only — no cargo yield</span>';
          } else if (t.type === 'rock') {
            html = '<strong>SOLID BASALT</strong><br>Integrity ' + Math.ceil(t.hp) + '/' + t.maxHp + workLine
              + `<br>Risk ${t.risk || 'low'} · <span style="color:var(--sf-calm);">No ore — clears path only</span>`;
          } else if (t.type === 'gas') {
            html = '<strong style="color:var(--sf-foe);">HAZARD — COMPRESSED GAS</strong><br>Risk critical · damages hull, yields no cargo · route around';
          } else if (t.type === 'vein' && t.ore) {
            const name = commodityName(t.ore);
            const basePrice = COMMODITY_BY_ID.get(t.ore)?.basePrice || 0;
            const req = t.tierReq || drillTierReqForOre(t.ore);
            const tier = drillScreen._drillTier || 1;
            const blocked = tier < req;
            const rockEmpty = Number.isFinite(d.rockBudget) && d.rockBudget <= 0 && Number(d.rockBudgetMax) > 0;
            const tierLine = blocked
              ? `<strong style="color:var(--sf-foe);">LOCKED — needs Drill MK${req}</strong>`
              : `Drill MK${req}`;
            const payLine = rockEmpty
              ? '<br><strong style="color:var(--sf-goal);">ROCK PLAYED OUT — this vein pays 0 until recovery</strong>'
              : '';
            html = `<strong>${name.toUpperCase()} VEIN</strong><br>Estimate ${basePrice} Cr/u · yield ${t.yieldU || 0}u${workLine}<br>Risk ${t.risk || 'low'} · ${tierLine}${payLine}`;
          }
        } else {
          html = '<span style="color:var(--sf-calm);">Target</span><br>Asteroid boundary';
        }
        setHtml(hudEls.scan, 'scan', html);
      }
    }

    const startSession = () => {
      const asteroidId = (state.ui && state.ui.pendingDrillAsteroidId) || null;
      if (state.ui) state.ui.pendingDrillAsteroidId = null;
      if (!asteroidId || !drillSys) return;

      // Reset session UI *before* begin() so drill:rockDepleted / drill:warn land on a clean feed
      // and are not wiped by later activityFeed/banner resets.
      inputController.cancel();
      drillTheta = 0;
      viewY = undefined;
      particles = [];
      hudElapsed = 0;
      sonarElapsed = 0;
      sonarDirty = true;
      motionReduce = prefersReducedMotion({
        motionReduce: !!(state.settings && state.settings.video && state.settings.video.motionReduce),
      });
      wrap.classList.toggle('reduce-motion', motionReduce);
      for (const k of Object.keys(hudCache)) delete hudCache[k];

      hudEls.yield = hud.querySelector('[data-yield]');
      hudEls.gas = hud.querySelector('[data-gas]');
      hudEls.cargo = hud.querySelector('[data-cargo]');
      hudEls.rockBudget = hud.querySelector('[data-rock-budget]');
      hudEls.temp = hud.querySelector('[data-temp]');
      hudEls.energy = hud.querySelector('[data-energy]');
      hudEls.tension = leftPanel.querySelector('[data-tension]');
      hudEls.power = leftPanel.querySelector('[data-power]');
      hudEls.tier = rightPanel.querySelector('[data-drill-tier]');
      hudEls.dps = rightPanel.querySelector('[data-drill-dps]');
      hudEls.scan = document.getElementById('drill-scan-target');
      hudEls.manifest = document.getElementById('drill-cargo-manifest-list');
      hudEls.scanState = scanBtn.querySelector('[data-scan-state]');
      statusBannerKind = null;
      statusBanner.hidden = true;
      if (statusBannerText) statusBannerText.textContent = '';
      gasHitFlash.t = 0;
      gasHitShake.t = 0;
      gasHitShake.elapsed = 0;
      yieldFlash.t = 0;
      cargoFullFlash.t = 0;
      activityFeed.innerHTML = '<div class="drill-activity-empty">Bore events will appear here.</div>';
      lastActivity = null;

      const monoVar = (typeof window !== 'undefined' && window.getComputedStyle)
        ? window.getComputedStyle(document.body).getPropertyValue('--sf-data-face')
        : '';
      monoFamily = (monoVar && monoVar.trim()) || 'monospace';

      drillSys.begin(asteroidId);
      renderDrillLegend(legendGrid, state.drill?.field, drillSys.getDrillTier());

      overlayCanvas = buildOverlay(canvas.width, canvas.height);
      headlightSprite = buildHeadlightSprite();
      strataCanvas = null;
      strataCtx = null;
      strataAvatarCol = null;
      strataAvatarRow = null;
      damagedTiles.clear();
      buildStrataCache(state.drill);
      const imageDecodes = Object.values(IMAGES)
        .filter((img) => img && typeof img.decode === 'function' && (!img.complete || img.naturalWidth <= 0))
        .map((img) => img.decode());
      if (imageDecodes.length) {
        Promise.allSettled(imageDecodes).then(() => {
          if (!wrap.isConnected || !state.drill) return;
          buildStrataCache(state.drill);
          canvasDirty = true;
        });
      }

      inputController.cancel();
      canvasDirty = true;
      cameraSettling = true;
      updateHud();
      updateManifest();
      drawSonar(state.drill);
      
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onWindowBlur);
      canvas.addEventListener('mousemove', onMouseMove);
      canvas.addEventListener('mouseleave', onMouseLeave);
      
      last = performance.now();
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(frame);
      requestAnimationFrame(() => canvas.focus({ preventScroll: true }));
      this._active = true;
    };

    const stopSession = () => {
      if (!this._active) return;
      this._active = false;
      cancelAnimationFrame(rafId);
      inputController.cancel();
      strataCanvas = null;
      strataCtx = null;
      strataAvatarCol = null;
      strataAvatarRow = null;
      damagedTiles.clear();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      
      if (state.drill && drillSys) drillSys.end();
    };

    this._startSession = startSession;
    this._cleanup = stopSession;
    this._refresh = () => {
      updateHud();
      updateManifest();
      if (state.drill) {
        renderDrillLegend(legendGrid, state.drill.field, drillSys.getDrillTier());
        sonarDirty = true;
      }
    };
  },

  onShow() {
    // If the session was torn down out from under us — death dropped the gameOver screen on top,
    // which onHide()→stopSession()→drillSys.end() nulls state.drill — there is nothing to resume.
    // A pendingDrillAsteroidId is the only legitimate reason to (re)start; without it, re-exposure
    // would leave a frozen dead frame (no rAF, no input). Pop back to flight, where respawn already
    // relocated the ship to the recovery dock. ESC did this by hand before the fix.
    if (this._active) return;                 // already running a live session — nothing to do
    const st = this._ctx && this._ctx.state;
    const pending = st && st.ui && st.ui.pendingDrillAsteroidId;
    if (!pending && this._ctx && this._ctx.screenManager) {
      this._ctx.screenManager.popScreen();
      return;
    }
    if (this._startSession) this._startSession();
  },
  onHide() { if (this._cleanup) this._cleanup(); },
  refresh() { if (this._refresh) this._refresh(); },
};

function triggerDockFade(show) {
  const fade = document.getElementById('sf-dock-overlay');
  if (!fade) return;
  if (show) {
    fade.hidden = false;
    fade.setAttribute('aria-hidden', 'false');
    fade.style.pointerEvents = 'auto';
    requestAnimationFrame(() => fade.classList.add('active'));
  } else {
    fade.classList.remove('active');
    setTimeout(() => {
      if (!fade.classList.contains('active')) {
        fade.style.pointerEvents = 'none';
        fade.setAttribute('aria-hidden', 'true');
        fade.hidden = true;
      }
    }, 420);
  }
}

function showDrillSummaryModal(yieldLog) {
  const root = document.getElementById('ui-root');
  if (!root) return;

  const items = Object.entries(yieldLog).filter(([_, qty]) => qty > 0);
  if (items.length === 0) return;

  const modal = document.createElement('div');
  modal.className = 'drill-summary-drawer';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'drill-summary-title');
  
  const box = document.createElement('div');
  box.className = 'drill-summary-slab';
  
  const title = document.createElement('h2');
  title.className = 'title';
  title.id = 'drill-summary-title';
  title.textContent = 'Extraction report';
  box.appendChild(title);
  
  const list = document.createElement('div');
  list.className = 'item-list';
  
  let totalCredits = 0;
  items.forEach(([commodityId, qty]) => {
    const name = commodityName(commodityId);
    const basePrice = COMMODITY_BY_ID.get(commodityId)?.basePrice || 0;
    const value = qty * basePrice;
    totalCredits += value;
    
    const row = document.createElement('div');
    row.className = 'item-row';
    
    const left = document.createElement('div');
    left.className = 'left';
    
    const icon = document.createElement('div');
    icon.className = 'icon';
    if (SVG_TEMPLATES[commodityId]) {
      const img = document.createElement('img');
      img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(SVG_TEMPLATES[commodityId]);
      icon.appendChild(img);
    } else {
      icon.textContent = '+';
    }
    left.appendChild(icon);
    
    const nameText = document.createElement('span');
    nameText.className = 'name';
    nameText.textContent = `${name} (x${qty})`;
    left.appendChild(nameText);
    
    row.appendChild(left);
    
    const right = document.createElement('div');
    right.className = 'value';
    right.textContent = `+${value} Cr`;
    row.appendChild(right);
    
    list.appendChild(row);
  });
  box.appendChild(list);
  
  const totalRow = document.createElement('div');
  totalRow.className = 'total-row';
  totalRow.innerHTML = `<span>TOTAL ESTIMATED REVENUE:</span><span class="val">+${totalCredits} Cr</span>`;
  box.appendChild(totalRow);
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'sf-btn';
  closeBtn.textContent = 'Acknowledge';
  const previousFocus = document.activeElement;
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    modal.classList.remove('active');
    modal.removeEventListener('keydown', onModalKeyDown);
    setTimeout(() => {
      modal.remove();
      if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
    }, 250);
  };
  const onModalKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      closeBtn.focus();
    }
  };
  closeBtn.onclick = close;
  box.appendChild(closeBtn);
  
  modal.appendChild(box);
  modal.style.pointerEvents = 'auto';
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      close();
    }
  });
  modal.addEventListener('keydown', onModalKeyDown);

  root.appendChild(modal);
  setTimeout(() => modal.classList.add('active'), 20);
  requestAnimationFrame(() => closeBtn.focus());
}

function drawAugerDrillBit(ctx2d, x, y, size, angle, time) {
  const r = canvasRoles();
  ctx2d.save();
  ctx2d.translate(x, y);
  ctx2d.rotate(angle);

  const w = size;
  const h = size * 0.7;

  ctx2d.fillStyle = r.edge;
  ctx2d.fillRect(-w / 2, -h * 0.35, w * 0.18, h * 0.7);
  ctx2d.strokeStyle = r.calm;
  ctx2d.lineWidth = 1.2;
  ctx2d.strokeRect(-w / 2, -h * 0.35, w * 0.18, h * 0.7);

  const shaftG = ctx2d.createLinearGradient(0, -h * 0.2, 0, h * 0.2);
  shaftG.addColorStop(0, r.calm);
  shaftG.addColorStop(0.5, r.paper);
  shaftG.addColorStop(1, r.edge);
  ctx2d.fillStyle = shaftG;
  ctx2d.fillRect(-w / 2 + w * 0.18, -h * 0.2, w * 0.14, h * 0.4);

  const coneG = ctx2d.createLinearGradient(0, -h / 2, 0, h / 2);
  coneG.addColorStop(0, r.calm);
  coneG.addColorStop(0.35, r.paper);
  coneG.addColorStop(1, r.edge);
  ctx2d.fillStyle = coneG;
  ctx2d.beginPath();
  const bx = -w / 2 + w * 0.32;
  ctx2d.moveTo(bx, -h / 2);
  ctx2d.lineTo(w / 2, 0);
  ctx2d.lineTo(bx, h / 2);
  ctx2d.closePath();
  ctx2d.fill();
  ctx2d.strokeStyle = r.calm;
  ctx2d.lineWidth = 1;
  ctx2d.stroke();

  const scrollSpeed = 35.0;
  const grooveSpacing = w * 0.22;
  const offset = (time * scrollSpeed) % grooveSpacing;
  ctx2d.save();
  ctx2d.beginPath();
  ctx2d.moveTo(bx, -h / 2);
  ctx2d.lineTo(w / 2, 0);
  ctx2d.lineTo(bx, h / 2);
  ctx2d.closePath();
  ctx2d.clip();
  ctx2d.strokeStyle = paint(r.surface, 0.85);
  ctx2d.lineWidth = 2.6;
  const numThreads = 6;
  for (let i = -1; i < numThreads; i++) {
    const gx = bx + i * grooveSpacing + offset;
    if (gx > w / 2) continue;
    const tFrac = (w / 2 - gx) / (w / 2 - bx);
    const gh = h * 0.5 * tFrac;
    ctx2d.beginPath();
    ctx2d.moveTo(gx, -gh);
    ctx2d.quadraticCurveTo(gx + grooveSpacing * 0.4, 0, gx, gh);
    ctx2d.stroke();
    ctx2d.strokeStyle = paint(r.you, 0.45);
    ctx2d.lineWidth = 1.0;
    ctx2d.beginPath();
    ctx2d.moveTo(gx + 1.5, -gh);
    ctx2d.quadraticCurveTo(gx + 1.5 + grooveSpacing * 0.4, 0, gx + 1.5, gh);
    ctx2d.stroke();
    ctx2d.strokeStyle = paint(r.surface, 0.85);
    ctx2d.lineWidth = 2.6;
  }
  ctx2d.restore();

  ctx2d.fillStyle = r.you;
  ctx2d.shadowColor = r.you;
  ctx2d.shadowBlur = 4;
  ctx2d.beginPath();
  ctx2d.arc(w / 2, 0, 2.5, 0, Math.PI * 2);
  ctx2d.fill();
  ctx2d.restore();
}
