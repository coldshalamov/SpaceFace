// Packet 09 presentation mount: hosts createCapitalBossOverlay inside the existing render host.
//
// The adapter (src/presentation/capitalBossPresentation.js) is renderer-only: it draws the exact
// world-space warning geometry the score evaluates onto a transparent 2D canvas, through the
// gameplay camera's projection (ctx.helpers.worldToScreen) — never a second camera. This mount
// owns only host concerns: the DOM canvas, device-pixel-ratio scaling, the flight-mode gate, the
// reduced-motion setting, and restore-on-load / destroy-on-teardown. No renderer clock enters
// gameplay: clockForFight reads each fight's OWN encounter clock, which the sim freeze holds still.
import { createCapitalBossOverlay, capitalBossReadouts } from '../presentation/capitalBossPresentation.js';
import { svg } from './orrery/svg.js';
import { scale } from './orrery/instruments.js';
import { resolveObjectiveHudLayout } from './hud.js';

const reducedMotionOf = (state) => !!(state && state.settings && state.settings.video
  && state.settings.video.motionReduce);

// Row 463 boss-read slice: pooled readout groups (the score allows at most three live fights),
// authored strings through textContent, an ORRERY scale for the Adventure health instrument, and
// one shared live region deduplicated by fight / act / cast identity. No boxed card, no new token
// root or stylesheet, no receipts — combat must not suppress an attack's own instruction.
const READOUT_TEXT = 'font:600 12px var(--dp-face-label, sans-serif);letter-spacing:.14em;';
const makeLine = (host, color, weight = 600) => {
  const el = document.createElement('div');
  el.style.cssText = `${READOUT_TEXT}font-weight:${weight};color:${color};line-height:1.35;`;
  host.appendChild(el);
  return el;
};
const setLine = (el, value) => { if (el.textContent !== value) el.textContent = value; };

function makeReadoutGroup(host, index) {
  const el = document.createElement('div');
  el.className = 'sf-cboss-readout';
  el.style.cssText = `position:absolute;left:-10000px;top:0;display:none;max-width:340px;pointer-events:none;`;
  const name = makeLine(el, 'var(--dp-ink, #e8e2d4)');
  const act = makeLine(el, 'var(--dp-ink-dim, #b7b4a6)');
  const moveTitle = makeLine(el, 'var(--dp-hand, #f2b950)');
  const counter = makeLine(el, 'var(--dp-ink-dim, #b7b4a6)', 400);
  counter.style.cssText += 'white-space:normal;overflow-wrap:break-word;max-width:340px;';
  // The health instrument is an ORRERY scale — borderless ruler of light, never a boxed bar.
  const scaleHost = svg('svg', {
    width: 132, height: 16, viewBox: '0 0 132 16', 'aria-hidden': 'true',
  });
  scaleHost.style.display = 'block';
  const scaleInst = scale({ x: 4, y: 8, w: 124, ticks: 4, major: 4, tone: 'phos' });
  scaleHost.appendChild(scaleInst.el);
  el.appendChild(scaleHost);
  // progressbar semantics ride a dedicated node so the vector art stays aria-hidden.
  const gauge = document.createElement('div');
  gauge.setAttribute('role', 'progressbar');
  gauge.setAttribute('aria-valuemin', '0');
  gauge.setAttribute('aria-valuemax', '100');
  gauge.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);';
  el.appendChild(gauge);
  host.appendChild(el);
  return {
    index, el, name, act, moveTitle, counter, scaleInst, scaleHost, gauge,
    shown: false, fightId: null, castId: null, actId: null, frac: -1, pct: -1, gaugeName: null,
    stacked: false, dense: false, _bossPos: null,
    // The group's own seat, rewritten in place by each placement (never a fresh rect per
    // frame), and the last px values written to its box.
    rect: { x: 0, y: 0, width: 0, height: 0 }, boxX: NaN, boxY: NaN, boxW: NaN,
  };
}

function rectsIntersect(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
function hitsAny(rect, reserved) {
  for (let i = 0; i < reserved.length; i += 1) if (rectsIntersect(rect, reserved[i])) return true;
  return false;
}
const clampTo = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
// The stagger ladder, as multiples of the column and row steps: anchor first, then above /
// below, then the same ladder one and two columns either way.
const LADDER_DX = Object.freeze([0, -1, 1, -2, 2]);
const LADDER_DY = Object.freeze([0, -1, 1, -2, 2, -3, 3, -4, 4]);
const OFFSCREEN_ANCHOR = Object.freeze({ x: -1e6, y: -1e6 });
const INSTANT = Object.freeze({ instant: true });

export function mountCapitalBossOverlay({ root, bus, state, helpers }) {
  if (typeof document === 'undefined' || !root || !bus) return null;
  const canvas = document.createElement('canvas');
  canvas.className = 'sf-capital-boss-overlay';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.position = 'absolute';
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  root.appendChild(canvas);

  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  // Reading clientWidth inside the draw loop is a forced layout every frame; the box only moves
  // with a real resize, so a ResizeObserver (window resize as fallback) re-arms one re-measure
  // instead. Where neither API exists the flag stays set and every draw measures, as before.
  // The observer's entry already carries the host's laid-out size, so taking it from there
  // (rounded like clientWidth) keeps the first flight frame from forcing the layout of everything
  // that just mounted — reading root.clientWidth there cost 47-73 ms on software GL.
  let sizeDirty = true;
  let observedSize = null;
  const markSizeDirty = () => { sizeDirty = true; };
  const onObservedResize = (entries) => {
    const entry = entries && entries[entries.length - 1];
    const rect = entry && entry.contentRect;
    if (rect) observedSize = { width: Math.round(rect.width), height: Math.round(rect.height) };
    sizeDirty = true;
  };
  let sizeObserver = null;
  let windowResizeBound = false;
  if (typeof ResizeObserver === 'function') {
    sizeObserver = new ResizeObserver(onObservedResize);
    sizeObserver.observe(root);
  } else if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', markSizeDirty);
    windowResizeBound = true;
  }
  const observingSize = !!(sizeObserver || windowResizeBound);
  function syncSize() {
    sizeDirty = !observingSize;
    const measured = observedSize || { width: root.clientWidth, height: root.clientHeight };
    observedSize = null;
    const width = measured.width || window.innerWidth || 0;
    const height = measured.height || window.innerHeight || 0;
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  }
  syncSize();

  // The repo's worldToScreen reports window CSS pixels for authoritative global XZ; the adapter
  // draws in canvas-local CSS pixels. The overlay canvas covers the window at (0,0), so the
  // coordinates are the same space — only the unused onScreen flag is dropped.
  const _projWorld = { x: 0, y: 0, z: 0 };
  const _projScreen = { x: 0, y: 0, onScreen: false };
  const _projOut = { x: -1e6, y: -1e6 };
  const project = (p) => {
    _projWorld.x = p.x; _projWorld.z = p.z;
    const out = helpers && typeof helpers.worldToScreen === 'function'
      ? helpers.worldToScreen(_projWorld, _projScreen)
      : null;
    if (out && Number.isFinite(out.x) && Number.isFinite(out.y)) {
      _projOut.x = out.x; _projOut.y = out.y;
    } else {
      _projOut.x = -1e6; _projOut.y = -1e6;
    }
    return _projOut;
  };
  const clockForFight = (fightId) => {
    const fights = state && state.capitalBossEncounters && state.capitalBossEncounters.fights;
    const record = fights && fights[String(fightId)];
    return record && Number.isFinite(record.clock) ? record.clock : 0;
  };

  let reducedMotion = reducedMotionOf(state);
  let overlay = createCapitalBossOverlay({
    canvas,
    bus,
    worldToScreen: project,
    clockForFight,
    reducedMotion,
  });
  // uiRoot imports this module asynchronously — the first telegraph may already be behind us,
  // so re-arm from the fights that exist right now, not only from save:loaded.
  overlay.restore((state && state.capitalBossEncounters && state.capitalBossEncounters.fights) || {});

  // ── pooled readouts (row 463) ─────────────────────────────────────────────────────────────
  const readoutLayer = document.createElement('div');
  readoutLayer.className = 'sf-cboss-readouts';
  readoutLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
  root.appendChild(readoutLayer);
  const liveRegion = document.createElement('div');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);';
  readoutLayer.appendChild(liveRegion);
  const groups = [0, 1, 2].map((i) => makeReadoutGroup(readoutLayer, i));
  // The stack column is the third DOM home for readouts that no free cell can take: it
  // parks inside the largest reservation-free rectangle and scrolls. A live readout is
  // condensed and scrolled — never display:none'd, never painted over the HUD.
  // pointer-events:auto is deliberate: the parent layer is click-transparent, but a
  // scrollable fallback has to receive the wheel to be honest about "scrollable".
  const stackHost = document.createElement('div');
  stackHost.className = 'sf-cboss-readout-stack';
  stackHost.setAttribute('role', 'region');
  stackHost.setAttribute('aria-label', 'Boss warnings');
  stackHost.setAttribute('tabindex', '0');
  stackHost.style.cssText = 'position:absolute;display:none;pointer-events:auto;';
  stackHost.style.overflowX = 'hidden';
  stackHost.style.overflowY = 'auto';
  stackHost.style.maxWidth = '100%';
  readoutLayer.appendChild(stackHost);
  const announced = new Set();
  // One live-region write per frame. Several identities can open in the same frame — a
  // restored save re-opens boss, act and cast together; two fights can cast at once — and
  // each textContent write replaces the one before it, so writing them one by one left only
  // the last message for a screen reader. They are joined instead, the cast instruction
  // (the time-critical one) first.
  let pendingCasts = '';
  let pendingOther = '';
  const announce = (key, text, urgent = false) => {
    if (!text || announced.has(key)) return;
    announced.add(key);
    if (urgent) pendingCasts = pendingCasts ? `${pendingCasts} ${text}` : text;
    else pendingOther = pendingOther ? `${pendingOther} ${text}` : text;
  };
  const flushAnnouncements = () => {
    if (!pendingCasts && !pendingOther) return;
    liveRegion.textContent = pendingCasts && pendingOther
      ? `${pendingCasts} ${pendingOther}` : (pendingCasts || pendingOther);
    pendingCasts = '';
    pendingOther = '';
  };
  // Per-layout data is built once per viewport size, never per frame: the HUD's reserved
  // rectangles and the two readout footprints.
  let cachedLayout = null;
  const baseReserved = [];
  const full = { w: 180, h: 96, dense: false };
  const dense = { w: 120, h: 140, dense: true };
  const layoutFor = (width, height) => {
    if (!cachedLayout || cachedLayout.viewport.width !== width || cachedLayout.viewport.height !== height) {
      cachedLayout = resolveObjectiveHudLayout(width, height);
      baseReserved.length = 0;
      for (const r of [cachedLayout.objective, cachedLayout.vitals, cachedLayout.action,
        cachedLayout.rightDock, cachedLayout.commandDeck]) if (r) baseReserved.push(r);
      full.w = Math.min(340, Math.max(180, cachedLayout.safe.width / 4));
      dense.w = Math.max(120, Math.min(180, Math.round(full.w * 0.72)));
    }
    return cachedLayout;
  };
  // Frame scratch, reused: the readout projection, the live/pending lists, the seated
  // rectangles, and the reservation list a placement searches against.
  const readoutPool = [];
  const live = [];
  const pending = [];
  const retry = [];
  const occupied = [];
  const reservedScratch = [];
  // Box writes are cached per group so an unmoved readout writes no style and builds no
  // px string; any path that writes left/top/width directly forgets the cache.
  const forgetBox = (group) => { group.boxX = NaN; group.boxY = NaN; group.boxW = NaN; };
  const writeBox = (group, rect) => {
    const x = Math.round(rect.x);
    const y = Math.round(rect.y);
    const w = Math.round(rect.width);
    if (group.boxX !== x) { group.boxX = x; group.el.style.left = `${x}px`; }
    if (group.boxY !== y) { group.boxY = y; group.el.style.top = `${y}px`; }
    if (group.boxW !== w) { group.boxW = w; group.el.style.width = `${w}px`; }
  };
  // Readouts dodge the HUD's reserved rectangles AND each other: every group placed this
  // frame reserves its rect, so two simultaneous fights can never share the same pixels.
  // A readout NEVER accepts a colliding cell — the search runs the anchor, the stagger
  // ladder above and below, wider lateral columns either way, then a reservation-aware
  // sweep of the cells that sit just clear of each blocked rectangle.
  //
  // Crowding condenses, never hides. When the full footprint finds no cell the readout
  // retries at the dense footprint — narrower, tighter lines, a smaller gauge — and the
  // counter paragraph and hull instrument STAY MOUNTED, because the instruction is the
  // thing a warning exists to show. A frame that cannot seat a readout at either
  // footprint stacks the leftover readouts inside the scroll column parked in the
  // largest reservation-free rect. The persistent HUD still outranks a transient boss
  // readout — no path paints over it — but suppressing a live instruction is off the
  // table.
  // A real DOM appendChild moves the node; minimal DOM stubs append without detaching,
  // which would leave the group listed under two parents at once. Detach first so the
  // pool-to-stack move is a move in every environment.
  const detachEl = (el) => {
    if (typeof el.remove === 'function') { el.remove(); return; }
    const p = el.parentNode;
    if (p && p.children) {
      const i = p.children.indexOf(el);
      if (i >= 0) p.children.splice(i, 1);
    }
    el.parentNode = null;
  };
  const applyDensity = (group, dense) => {
    if (group.dense === dense) return;
    group.dense = dense;
    for (const line of [group.name, group.act, group.moveTitle, group.counter]) {
      line.style.lineHeight = dense ? '1.2' : '1.35';
    }
    group.scaleHost.style.width = dense ? '96px' : '';
    group.scaleHost.style.height = dense ? '10px' : '';
  };
  const unstack = (group) => {
    if (group.stacked) {
      group.stacked = false;
      detachEl(group.el);
      readoutLayer.appendChild(group.el);
      group.el.style.position = 'absolute';
      group.el.style.maxWidth = '340px';
      group.el.style.marginBottom = '';
      forgetBox(group);
    }
  };
  // The bounded cell search: anchor first, then the stagger ladder ±(h+8) over five
  // lateral columns, then the reservation-edge sweep, nearest legal cell to the anchor.
  // The common path (a ladder cell is free) allocates nothing: candidates are probed in one
  // scratch rect and the winner is copied into the caller's `out`.
  const probe = { x: 0, y: 0, width: 0, height: 0 };
  const searchRect = (layout, reserved, anchor, w, height, out) => {
    const xLo = layout.safe.left + 8;
    const xHi = layout.safe.right - w - 8;
    if (xHi < xLo) return null; // the footprint cannot clear the safe frame at all
    const yHi = Math.max(8, layout.viewport.height - height - 8);
    let x = Number.isFinite(anchor.x) ? anchor.x + 44 : layout.safe.left + 40;
    let y = Number.isFinite(anchor.y) ? anchor.y - height - 24 : layout.viewport.height * 0.18;
    x = clampTo(x, xLo, xHi);
    y = clampTo(y, 8, yHi);
    probe.width = w;
    probe.height = height;
    // The anchor first, then the stagger ladder above and below it, then the same ladder
    // shifted one and two columns either way. An upward-only walk dead-ends at the top
    // edge, and a fixed stride can still step over a narrow clear band.
    const step = height + 8;
    const colStep = w + 32;
    for (let i = 0; i < LADDER_DX.length; i += 1) {
      for (let j = 0; j < LADDER_DY.length; j += 1) {
        probe.x = clampTo(x + LADDER_DX[i] * colStep, xLo, xHi);
        probe.y = clampTo(y + LADDER_DY[j] * step, 8, yHi);
        if (hitsAny(probe, reserved)) continue;
        out.x = probe.x; out.y = probe.y; out.width = w; out.height = height;
        return out;
      }
    }
    // Reservation-aware sweep (crowded frames only): any open cell's boundary is a blocked
    // rect's edge or the frame's own, so candidate columns and rows snap just clear of each
    // reservation. The legal cell nearest the anchor wins — the readout still points at its boss.
    const cols = new Set([x, xLo, xHi]);
    const rows = new Set([y, 8, yHi]);
    for (const hit of reserved) {
      cols.add(clampTo(hit.x - w - 8, xLo, xHi));
      cols.add(clampTo(hit.x + hit.width + 8, xLo, xHi));
      rows.add(clampTo(hit.y - height - 8, 8, yHi));
      rows.add(clampTo(hit.y + hit.height + 8, 8, yHi));
    }
    const ax = Number.isFinite(anchor.x) ? anchor.x : x;
    const ay = Number.isFinite(anchor.y) ? anchor.y : y;
    let bestX = 0;
    let bestY = 0;
    let bestD = Infinity;
    for (const cx of cols) {
      for (const cy of rows) {
        probe.x = cx;
        probe.y = cy;
        if (hitsAny(probe, reserved)) continue;
        const d = (cx - ax) * (cx - ax) + (cy - ay) * (cy - ay);
        if (d < bestD) { bestD = d; bestX = cx; bestY = cy; }
      }
    }
    if (bestD === Infinity) return null;
    out.x = bestX; out.y = bestY; out.width = w; out.height = height;
    return out;
  };
  const placeGroup = (group, bossPos, layout, fp, seated) => {
    const anchor = bossPos ? project(bossPos) : OFFSCREEN_ANCHOR;
    reservedScratch.length = 0;
    for (let i = 0; i < baseReserved.length; i += 1) reservedScratch.push(baseReserved[i]);
    for (let i = 0; i < seated.length; i += 1) reservedScratch.push(seated[i]);
    const rect = searchRect(layout, reservedScratch, anchor, fp.w, fp.h, group.rect);
    if (!rect) return false;
    unstack(group);
    writeBox(group, rect);
    applyDensity(group, fp.dense);
    group.el._rect = rect;
    seated.push(rect);
    return true;
  };
  // Largest reservation-free rectangle, found the way an honest layout must find it:
  // every maximal empty rect has each side on a reservation edge or the frame edge, so
  // candidate corners snapped to those edges plus bounded growth cover the field.
  const largestFreeRect = (layout, reserved, minW, minH) => {
    const xMin = layout.safe.left + 8;
    const xMax = layout.safe.right - 8;
    const yMin = 8;
    const yMax = layout.viewport.height - 8;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
    const xs = new Set([xMin]);
    const ys = new Set([yMin]);
    for (const r of reserved) {
      xs.add(clamp(r.x + r.width + 8, xMin, xMax - minW));
      xs.add(clamp(r.x - minW - 8, xMin, xMax - minW));
      ys.add(clamp(r.y + r.height + 8, yMin, yMax - minH));
      ys.add(clamp(r.y - minH - 8, yMin, yMax - minH));
    }
    xs.add(clamp(xMax - minW, xMin, xMax - minW));
    ys.add(clamp(yMax - minH, yMin, yMax - minH));
    const free = (x, y, w, h) =>
      !reserved.some((r) => rectsIntersect({ x, y, width: w, height: h }, r));
    // Grow a corner into a maximal rect, width-first and height-first — a grown
    // candidate is still verified before it can win, so a corner sitting inside a
    // reservation can never mint an overlapping rect.
    const grow = (cx, cy, widthFirst) => {
      const widthCap = (hh) => reserved.reduce((cap, r) => (
        r.y < cy + hh && r.y + r.height > cy && r.x >= cx ? Math.min(cap, r.x - cx) : cap
      ), xMax - cx);
      const heightCap = (ww) => reserved.reduce((cap, r) => (
        r.x < cx + ww && r.x + r.width > cx && r.y >= cy ? Math.min(cap, r.y - cy) : cap
      ), yMax - cy);
      if (widthFirst) {
        const w = widthCap(minH);
        return { x: cx, y: cy, width: w, height: heightCap(w) };
      }
      const h = heightCap(minW);
      return { x: cx, y: cy, width: widthCap(h), height: h };
    };
    let best = null;
    for (const cx of xs) {
      for (const cy of ys) {
        if (!free(cx, cy, minW, minH)) continue;
        for (const rect of [grow(cx, cy, true), grow(cx, cy, false)]) {
          if (rect.width < minW || rect.height < minH) continue;
          if (!free(rect.x, rect.y, rect.width, rect.height)) continue;
          if (!best || rect.width * rect.height > best.width * best.height) best = rect;
        }
      }
    }
    return best;
  };
  const setGroup = (group, readout, showHealth, entities) => {
    if (group.el.style.display !== 'block') group.el.style.display = 'block';
    group.shown = true;
    if (group.fightId !== readout.fightId) {
      group.fightId = readout.fightId;
      group.actId = null;
      group.castId = null;
      announce(`boss|${readout.fightId}`, `${readout.name} is on you.`);
    }
    setLine(group.name, readout.name);
    setLine(group.act, readout.actTitle);
    if (group.actId !== readout.actId) {
      group.actId = readout.actId;
      if (readout.actId) announce(`act|${readout.fightId}|${readout.actId}`, `${readout.name}: ${readout.actTitle}`);
    }
    const castId = readout.move ? readout.move.castId : null;
    if (group.castId !== castId) {
      group.castId = castId;
      if (readout.move) {
        announce(`cast|${readout.fightId}|${castId}`, `${readout.move.title}. ${readout.move.counter}`, true);
      }
    }
    setLine(group.moveTitle, readout.move ? readout.move.title : '');
    setLine(group.counter, readout.move ? readout.move.counter : '');
    if (showHealth) {
      if (group.scaleHost.style.display !== 'block') group.scaleHost.style.display = 'block';
      if (group.gauge.style.display === 'none') group.gauge.style.display = 'block';
      // W-COLOSSI (row 547): the bar is the parts. A colossus with live plates reads its
      // attached-parts fraction — the instrument drains as the player tears the body apart —
      // and only a plate-less fight (the Last Argument's data-only parts) still shows hull.
      const partsLive = readout.partsLive === true && readout.partsTotal > 0;
      const frac = partsLive && readout.partsTotal > 0
        ? Math.max(0, Math.min(1, readout.partsAttached / readout.partsTotal))
        : readout.hullFraction;
      if (group.frac !== frac) {
        group.frac = frac;
        group.scaleInst.set(frac, INSTANT);
      }
      const pct = Math.round(frac * 100);
      if (group.pct !== pct) {
        group.pct = pct;
        group.gauge.setAttribute('aria-valuenow', String(pct));
      }
      // The accessible name rides the boss identity AND the instrument's meaning — a reused
      // group re-labels when either changes.
      const gaugeName = `${readout.name}|${partsLive ? 'parts' : 'hull'}`;
      if (group.gaugeName !== gaugeName) {
        group.gaugeName = gaugeName;
        group.gauge.setAttribute('aria-label', partsLive
          ? `${readout.name} parts remaining`
          : `${readout.name} hull`);
      }
    } else {
      // Swarm owns its champion bar; the adapter adds no second one — and the semantic
      // gauge leaves the accessibility tree with the SVG, or a survival readout keeps
      // answering a stale progressbar for a bar nobody can see.
      if (group.scaleHost.style.display !== 'none') group.scaleHost.style.display = 'none';
      if (group.gauge.style.display !== 'none') group.gauge.style.display = 'none';
      if (group.pct !== -1) { group.pct = -1; group.gauge.removeAttribute('aria-valuenow'); }
      if (group.gaugeName != null) { group.gaugeName = null; group.gauge.removeAttribute('aria-label'); }
    }
    const boss = entities && typeof entities.get === 'function' ? entities.get(readout.bossId) : null;
    group._bossPos = boss && boss.pos ? boss.pos : null;
  };
  const hideGroup = (group) => {
    if (!group.shown) return;
    unstack(group);
    group.el.style.display = 'none';
    group.el.style.left = '-10000px';
    forgetBox(group);
    group.el._rect = null;
    group.shown = false;
    group.fightId = null;
    group.actId = null;
    group.castId = null;
    group.gaugeName = null;
  };
  // Seat every group of `source` at footprint `fp`; the ones that found no cell land in
  // `left` (cleared first). Plain loops over reused lists: no per-frame filter arrays.
  const seatAll = (source, fp, left, layout) => {
    left.length = 0;
    for (let i = 0; i < source.length; i += 1) {
      const group = source[i];
      if (!placeGroup(group, group._bossPos, layout, fp, occupied)) left.push(group);
    }
  };
  const anyShown = () => {
    for (let i = 0; i < groups.length; i += 1) if (groups[i].shown) return true;
    return false;
  };
  const copyInto = (to, from) => { to.length = 0; for (let i = 0; i < from.length; i += 1) to.push(from[i]); };
  // GOLD-COLOSSI: the overlay's plate anchors ride the same readout pass — the feed is a
  // flat scratch list plus the one live PLATE/HOLD record, never a per-frame allocation.
  const plateFeed = [];
  const syncReadouts = (st) => {
    const readouts = capitalBossReadouts(st && st.mode === 'flight' ? st : null, readoutPool);
    plateFeed.length = 0;
    plateFeed.hold = null;
    for (const rd of readouts) {
      if (!rd) continue;
      if (rd.plates) for (const p of rd.plates) plateFeed.push(p);
      if (rd.plateHold) plateFeed.hold = rd.plateHold;
    }
    if (overlay && typeof overlay.plateAnchors === 'function') overlay.plateAnchors(plateFeed);
    // The ordinary frame: no fight on the player, nothing on screen. Nothing to place,
    // nothing to write — return before any layout work.
    if (readouts.length === 0 && !anyShown() && !stackHost._rect) {
      flushAnnouncements();
      return;
    }
    const showHealth = !(st && st.run && st.run.kind === 'survival');
    const layout = layoutFor(canvas.width / dpr || 1280, canvas.height / dpr || 720);
    live.length = 0;
    for (const group of groups) {
      const readout = readouts[group.index];
      if (readout) { setGroup(group, readout, showHealth, st && st.entities); live.push(group); }
      else hideGroup(group);
    }
    flushAnnouncements();
    // Placement maximizes SEATED readouts — never pixels-per-readout at the price of a
    // hidden instruction. Full boxes first; any readout that found no cell retries at
    // the dense footprint; if the greedy mix still stranded someone, the whole frame
    // re-seats dense (uniform narrow boxes fit where mixed ones could not) and keeps the
    // denser seating only when it strictly seats more live readouts.
    occupied.length = 0;
    seatAll(live, full, pending, layout);
    if (pending.length) {
      seatAll(pending, dense, retry, layout);
      copyInto(pending, retry);
    }
    if (pending.length && pending.length < live.length) {
      // Crowded frames only. Group seats are pooled and rewritten in place, so the
      // snapshot copies their values rather than holding references.
      const mixSeated = live.length - pending.length;
      const mixSnap = live.map((group) => ({
        group, left: group.el.style.left, top: group.el.style.top,
        width: group.el.style.width, dense: group.dense,
        ownRect: group.el._rect === group.rect,
        rect: group.el._rect ? { ...group.el._rect } : null,
        seatRef: group.el._rect,
      }));
      const mixOccupied = occupied.slice();
      occupied.length = 0;
      seatAll(live, dense, retry, layout);
      if (live.length - retry.length > mixSeated) {
        copyInto(pending, retry);
      } else {
        for (const s of mixSnap) {
          s.group.el.style.left = s.left;
          s.group.el.style.top = s.top;
          s.group.el.style.width = s.width;
          forgetBox(s.group);
          if (s.ownRect) {
            Object.assign(s.group.rect, s.rect);
            s.group.el._rect = s.group.rect;
          } else {
            s.group.el._rect = s.seatRef;
          }
          applyDensity(s.group, s.dense);
        }
        copyInto(occupied, mixOccupied);
      }
    }
    // Still standing? The stack column takes every leftover live readout inside the
    // largest reservation-free rect and lets it scroll — the instruction stays mounted,
    // stays text, stays readable; only its seat is shared. The floor is 96x16: the
    // smallest window that still renders a readable line — at any size where a free
    // rect exists at all, a live readout stacks rather than hides.
    let column = null;
    if (pending.length) {
      const reserved = baseReserved.concat(occupied);
      column = largestFreeRect(layout, reserved, 96, 16);
      if (column) {
        stackHost.style.left = `${Math.round(column.x)}px`;
        stackHost.style.top = `${Math.round(column.y)}px`;
        stackHost.style.width = `${Math.round(column.width)}px`;
        stackHost.style.maxHeight = `${Math.round(column.height)}px`;
        stackHost._rect = column;
        for (const group of pending) {
          if (!group.stacked) {
            group.stacked = true;
            detachEl(group.el);
            stackHost.appendChild(group.el);
            group.el.style.position = 'relative';
            group.el.style.left = '';
            group.el.style.top = '';
            group.el.style.width = 'auto';
            group.el.style.maxWidth = '100%';
            group.el.style.marginBottom = '6px';
            forgetBox(group);
          }
          applyDensity(group, true);
          group.el._rect = column;
        }
        occupied.push(column);
      } else {
        // No reservation-free rect at any size: the readout sits the frame out rather
        // than paint the HUD — unreachable at real layouts, kept as the last guard.
        for (const group of pending) {
          group.el.style.display = 'none';
          group.el._rect = null;
        }
      }
    }
    const stackDisplay = column ? 'block' : 'none';
    if (stackHost.style.display !== stackDisplay) stackHost.style.display = stackDisplay;
    if (!column) stackHost._rect = null;
  };

  // After a save restore the score's records exist again (same tick, or rebound with new runtime
  // ids); the overlay re-arms its telegraphs from the restored fights instead of waiting for the
  // next cast event. The announcement ledger is a per-session dedupe, not a durable one: a load
  // or a new game opens a fresh presentation session, so history AND each group's remembered
  // identities reset — a warning replayed from the restored score is spoken again.
  const resetAnnouncements = () => {
    announced.clear();
    pendingCasts = '';
    pendingOther = '';
    for (const group of groups) {
      group.fightId = null;
      group.actId = null;
      group.castId = null;
    }
  };
  const onSaveLoaded = () => {
    const fights = (state && state.capitalBossEncounters && state.capitalBossEncounters.fights) || {};
    overlay.restore(fights);
    resetAnnouncements();
  };
  const onNewGame = () => {
    overlay.restore({});
    resetAnnouncements();
  };
  const offRestore = bus.on('save:loaded', onSaveLoaded);
  const offNewGame = bus.on('game:new', onNewGame);

  let clearedWhileAway = false;
  return {
    draw(currentState) {
      const st = currentState || state;
      // Accessibility: a flipped reduced-motion setting rebuilds the adapter's motion treatment.
      const wanted = reducedMotionOf(st);
      if (wanted !== reducedMotion) {
        overlay.destroy();
        reducedMotion = wanted;
        overlay = createCapitalBossOverlay({
          canvas,
          bus,
          worldToScreen: project,
          clockForFight,
          reducedMotion,
        });
        const fights = (st && st.capitalBossEncounters && st.capitalBossEncounters.fights) || {};
        overlay.restore(fights);
      }
      if (st && st.mode === 'flight') {
        if (sizeDirty) syncSize();
        // Projection uses CSS pixels; canvas resize and the menu clear reset this transform.
        canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
        overlay.draw();
        clearedWhileAway = false;
      } else if (!clearedWhileAway) {
        // Menus/dock: stop presenting the flight warning; leave the canvas clean.
        const ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        clearedWhileAway = true;
      }
      syncReadouts(st);
    },
    destroy() {
      if (sizeObserver) sizeObserver.disconnect();
      if (windowResizeBound) window.removeEventListener('resize', markSizeDirty);
      if (typeof offRestore === 'function') offRestore();
      else if (bus.off) bus.off('save:loaded', onSaveLoaded);
      if (typeof offNewGame === 'function') offNewGame();
      else if (bus.off) bus.off('game:new', onNewGame);
      overlay.destroy();
      for (const group of groups) group.scaleInst.dispose();
      groups.length = 0;
      readoutLayer.remove();
      canvas.remove();
    },
  };
}

export default mountCapitalBossOverlay;
