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
  };
}

function rectsIntersect(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

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
  const announce = (key, text) => {
    if (!text || announced.has(key)) return;
    announced.add(key);
    liveRegion.textContent = text;
  };
  let cachedLayout = null;
  const layoutFor = (width, height) => {
    if (!cachedLayout || cachedLayout.viewport.width !== width || cachedLayout.viewport.height !== height) {
      cachedLayout = resolveObjectiveHudLayout(width, height);
    }
    return cachedLayout;
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
    }
    group.el.style.position = 'absolute';
    group.el.style.maxWidth = '340px';
    group.el.style.marginBottom = '';
  };
  // The bounded cell search: anchor first, then the stagger ladder ±(h+8) over five
  // lateral columns, then the reservation-edge sweep, nearest legal cell to the anchor.
  const searchRect = (layout, reserved, anchor, w, height) => {
    const xLo = layout.safe.left + 8;
    const xHi = layout.safe.right - w - 8;
    if (xHi < xLo) return null; // the footprint cannot clear the safe frame at all
    const yHi = Math.max(8, layout.viewport.height - height - 8);
    let x = Number.isFinite(anchor.x) ? anchor.x + 44 : layout.safe.left + 40;
    let y = Number.isFinite(anchor.y) ? anchor.y - height - 24 : layout.viewport.height * 0.18;
    x = Math.max(xLo, Math.min(x, xHi));
    y = Math.max(8, Math.min(y, yHi));
    const clampX = (v) => Math.max(xLo, Math.min(v, xHi));
    const clampY = (v) => Math.max(8, Math.min(v, yHi));
    const tryAt = (cx, cy) => {
      const next = { x: clampX(cx), y: clampY(cy), width: w, height };
      return reserved.some((hit) => rectsIntersect(next, hit)) ? null : next;
    };
    // The anchor first, then the stagger ladder above and below it, then the same ladder
    // shifted one and two columns either way. An upward-only walk dead-ends at the top
    // edge, and a fixed stride can still step over a narrow clear band.
    const step = height + 8;
    const colStep = w + 32;
    for (const dx of [0, -colStep, colStep, -2 * colStep, 2 * colStep]) {
      for (const dy of [0, -step, step, -2 * step, 2 * step, -3 * step, 3 * step, -4 * step, 4 * step]) {
        const next = tryAt(x + dx, y + dy);
        if (next) return next;
      }
    }
    // Reservation-aware sweep: any open cell's boundary is a blocked rect's edge or the
    // frame's own, so candidate columns and rows snap just clear of each reservation.
    // The legal cell nearest the anchor wins — the readout still points at its boss.
    const cols = new Set([x, xLo, xHi]);
    const rows = new Set([y, 8, yHi]);
    for (const hit of reserved) {
      cols.add(clampX(hit.x - w - 8));
      cols.add(clampX(hit.x + hit.width + 8));
      rows.add(clampY(hit.y - height - 8));
      rows.add(clampY(hit.y + hit.height + 8));
    }
    const ax = Number.isFinite(anchor.x) ? anchor.x : x;
    const ay = Number.isFinite(anchor.y) ? anchor.y : y;
    let best = null;
    let bestD = Infinity;
    for (const cx of cols) {
      for (const cy of rows) {
        const next = tryAt(cx, cy);
        if (!next) continue;
        const d = (next.x - ax) * (next.x - ax) + (next.y - ay) * (next.y - ay);
        if (d < bestD) { bestD = d; best = next; }
      }
    }
    return best;
  };
  const placeGroup = (group, bossPos, layout, fp, occupied) => {
    const anchor = bossPos ? project(bossPos) : { x: -1e6, y: -1e6 };
    const reserved = [layout.objective, layout.vitals, layout.action, layout.rightDock, layout.commandDeck]
      .concat(occupied || []).filter(Boolean);
    const rect = searchRect(layout, reserved, anchor, fp.w, fp.h);
    if (!rect) return false;
    unstack(group);
    group.el.style.left = `${Math.round(rect.x)}px`;
    group.el.style.top = `${Math.round(rect.y)}px`;
    group.el.style.width = `${Math.round(rect.width)}px`;
    applyDensity(group, fp.dense);
    group.el._rect = rect;
    if (occupied) occupied.push(rect);
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
    group.el.style.display = 'block';
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
        announce(`cast|${readout.fightId}|${castId}`, `${readout.move.title}. ${readout.move.counter}`);
      }
    }
    setLine(group.moveTitle, readout.move ? readout.move.title : '');
    setLine(group.counter, readout.move ? readout.move.counter : '');
    if (showHealth) {
      group.scaleHost.style.display = 'block';
      if (group.gauge.style.display === 'none') group.gauge.style.display = 'block';
      const frac = readout.hullFraction;
      if (group.frac !== frac) {
        group.frac = frac;
        group.scaleInst.set(frac, { instant: true });
      }
      const pct = Math.round(frac * 100);
      if (group.pct !== pct) {
        group.pct = pct;
        group.gauge.setAttribute('aria-valuenow', String(pct));
      }
      // The accessible name rides the boss identity, not the percentage — a reused group
      // re-labels even when the new boss's hull reads the same number.
      if (group.gaugeName !== readout.name) {
        group.gaugeName = readout.name;
        group.gauge.setAttribute('aria-label', `${readout.name} hull`);
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
    group.el._rect = null;
    group.shown = false;
    group.fightId = null;
    group.actId = null;
    group.castId = null;
    group.gaugeName = null;
  };
  const syncReadouts = (st) => {
    const readouts = st && st.mode === 'flight' ? capitalBossReadouts(st) : [];
    const showHealth = !(st && st.run && st.run.kind === 'survival');
    const layout = layoutFor(canvas.width / dpr || 1280, canvas.height / dpr || 720);
    const live = [];
    for (const group of groups) {
      const readout = readouts[group.index];
      if (readout) { setGroup(group, readout, showHealth, st && st.entities); live.push(group); }
      else hideGroup(group);
    }
    // Placement maximizes SEATED readouts — never pixels-per-readout at the price of a
    // hidden instruction. Full boxes first; any readout that found no cell retries at
    // the dense footprint; if the greedy mix still stranded someone, the whole frame
    // re-seats dense (uniform narrow boxes fit where mixed ones could not) and keeps the
    // denser seating only when it strictly seats more live readouts.
    const full = { w: Math.min(340, Math.max(180, layout.safe.width / 4)), h: 96, dense: false };
    const dense = {
      w: Math.max(120, Math.min(180, Math.round(full.w * 0.72))), h: 140, dense: true,
    };
    const occupied = [];
    let pending = live.filter((group) => !placeGroup(group, group._bossPos, layout, full, occupied));
    if (pending.length) {
      pending = pending.filter((group) => !placeGroup(group, group._bossPos, layout, dense, occupied));
    }
    if (pending.length && pending.length < live.length) {
      const mixSeated = live.length - pending.length;
      const mixSnap = live.map((group) => ({
        group, left: group.el.style.left, top: group.el.style.top,
        width: group.el.style.width, rect: group.el._rect, dense: group.dense,
      }));
      const mixOccupied = occupied.slice();
      occupied.length = 0;
      const densePending = live.filter((group) => !placeGroup(group, group._bossPos, layout, dense, occupied));
      if (live.length - densePending.length > mixSeated) {
        pending = densePending;
      } else {
        for (const s of mixSnap) {
          s.group.el.style.left = s.left;
          s.group.el.style.top = s.top;
          s.group.el.style.width = s.width;
          s.group.el._rect = s.rect;
          applyDensity(s.group, s.dense);
        }
        occupied.length = 0;
        occupied.push(...mixOccupied);
      }
    }
    // Still standing? The stack column takes every leftover live readout inside the
    // largest reservation-free rect and lets it scroll — the instruction stays mounted,
    // stays text, stays readable; only its seat is shared. The floor is 96x16: the
    // smallest window that still renders a readable line — at any size where a free
    // rect exists at all, a live readout stacks rather than hides.
    let column = null;
    if (pending.length) {
      const reserved = [layout.objective, layout.vitals, layout.action, layout.rightDock, layout.commandDeck]
        .concat(occupied).filter(Boolean);
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
          }
          group.el.style.position = 'relative';
          group.el.style.left = '';
          group.el.style.top = '';
          group.el.style.width = 'auto';
          group.el.style.maxWidth = '100%';
          group.el.style.marginBottom = '6px';
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
    stackHost.style.display = column ? 'block' : 'none';
    if (!column) stackHost._rect = null;
  };

  // After a save restore the score's records exist again (same tick, or rebound with new runtime
  // ids); the overlay re-arms its telegraphs from the restored fights instead of waiting for the
  // next cast event. The announcement ledger is a per-session dedupe, not a durable one: a load
  // or a new game opens a fresh presentation session, so history AND each group's remembered
  // identities reset — a warning replayed from the restored score is spoken again.
  const resetAnnouncements = () => {
    announced.clear();
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
