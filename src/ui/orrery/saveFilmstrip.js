// ORRERY save filmstrip (design/frontend/ORRERY.md §6 Meta: "Save/Load: a filmstrip of save thumbnails
// on a curved rail"; §4 #9 Ladder, #2 the Hand).
//
// The saves ride one shallow arc of light: the near side of an orbit, so the lives on file read as
// stations round the hull that stands above them. Each save is a frame on its own station: its hull's
// produced render above the rail, its name and figures below. A station with nothing filed is an open
// ring on the rail. The amber Hand (a lit stretch of the rail, a bead and a short needle up to the
// frame) swings along the arc to the chosen save with the shared spring, like a needle round a dial.
//
// The strip is the screen's instrument to play: drag along it (or roll the wheel over it) and the Hand
// runs under the pointer, the save under it comes up on the berth as the Hand passes its station, and
// on release the Hand settles on the nearest one. A soft light follows the pointer along the strip, and
// a beam of light runs from the chosen frame up to the berth its hull stands on, an ice pulse travelling
// up it when the choice changes.
//
// Like the arc rail, it does NOT build the list. It takes the list the screen already builds (kit
// `rows()`: real `li.k-row[role=option]` with data-id, aria-selected and roving focus -- the contract
// the checks and probes read) and only POSITIONS those rows and draws the instrument behind them. The
// rail is drawn once per layout; the Hand is one <g> turned about the arc's centre (a transform, no
// repaint of the rail); nothing runs per frame at rest. Reduced motion puts the Hand on its station.
import { svg } from './svg.js';
import { createSpring } from './motion.js';
import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-savefilm-style';
const BONE = '232 226 212';

const CSS = `
.orr-film__rail { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; pointer-events:none; z-index:0; }
.orr-film__rail .orr-film__band { fill:none; stroke-width:18; opacity:.07; }
.orr-film__rail .orr-film__core { fill:none; stroke-width:2; }
.orr-film__rail .orr-film__bloom { fill:none; stroke-width:9; opacity:.18; }
.orr-film__rail .orr-film__minor { fill:none; stroke:rgb(${BONE} / .34); stroke-width:1.2; }
.orr-film__rail .orr-film__major { fill:none; stroke:rgb(${BONE} / .72); stroke-width:1.8; stroke-linecap:round; }
.orr-film__rail .orr-film__dot { fill:rgb(${BONE} / .86); }
.orr-film__rail .orr-film__empty { fill:rgb(5 7 10 / .92); stroke:rgb(${BONE} / .62); stroke-width:1.8; }
.orr-film__rail .orr-film__hand-seg { fill:none; stroke:var(--dp-hand, #f2b950); stroke-width:3.2; stroke-linecap:round; }
.orr-film__rail .orr-film__hand-bloom { fill:none; stroke:var(--dp-hand, #f2b950); stroke-width:12; stroke-linecap:round; opacity:.24; }
.orr-film__rail .orr-film__hand-needle { fill:none; stroke:var(--dp-hand-hot, #ffd98c); stroke-width:2; stroke-linecap:round; }
/* the beam from the chosen frame to the berth: bone light at rest, an ice pulse up it on a new choice */
.orr-film__rail .orr-film__beam { fill:none; stroke:rgb(${BONE} / .46); stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round; }
.orr-film__rail .orr-film__beam-bloom { fill:none; stroke:rgb(${BONE} / .1); stroke-width:7; stroke-linecap:round; stroke-linejoin:round; }
.orr-film__rail .orr-film__beam-end { fill:rgb(${BONE} / .9); }
.orr-film__rail .orr-film__pulse { fill:none; stroke:var(--dp-ice, #8fcbff); stroke-width:2.6; stroke-linecap:round; stroke-dasharray:.14 1.2; stroke-dashoffset:.14;
  opacity:0; filter:drop-shadow(0 0 4px rgb(143 203 255 / .8)); }
.orr-film__rail .orr-film__pulse.is-running { animation:orr-film-pulse 900ms cubic-bezier(.3, .1, .3, 1) both; }
@keyframes orr-film-pulse { 0% { stroke-dashoffset:.14; opacity:1; } 88% { opacity:1; } 100% { stroke-dashoffset:-1; opacity:0; } }
.orr-film__rail.is-arriving .orr-film__beamg { animation:orr-film-beam-in 700ms var(--dp-ease-out, ease-out) 420ms both; }
@keyframes orr-film-beam-in { from { opacity:0; } to { opacity:1; } }
/* the light under the pointer: a soft pool that rides the strip while the pointer is on it */
.orr-film__spot { position:absolute; left:0; top:0; width:360px; height:100%; margin-left:-180px; pointer-events:none; z-index:0; opacity:0;
  background:radial-gradient(closest-side, rgb(255 244 222 / .09), rgb(255 244 222 / .035) 55%, transparent); transform:translateX(var(--spot-x, 0px));
  transition:opacity .25s linear; }
.orr-film.is-lit > .orr-film__spot { opacity:1; }
.orr-film.is-scrubbing { cursor:grabbing; }
.orr-film.is-scrubbing .k-row { cursor:grabbing !important; }
html.sf-reduce-motion .orr-film__spot { display:none; }
html.sf-reduce-motion .orr-film__rail .orr-film__pulse { display:none; }
html.sf-reduce-motion .orr-film__rail.is-arriving .orr-film__beamg { animation:none; }
.orr-film__rail .orr-film__hand-bead { fill:var(--dp-hand-hot, #ffd98c); }
.orr-film__rail .orr-film__hand-glow { fill:rgb(255 217 140 / .2); }
/* the rows ride their stations; the screen's sheet dresses them */
.orr-film__list { position:absolute !important; inset:0 !important; margin:0 !important; padding:0 !important; display:block !important; background:none !important; z-index:1; }
.orr-film__list > .k-row { position:absolute !important; margin:0 !important; box-sizing:border-box; }
.orr-film__list.is-arriving > .k-row { animation:orr-film-rise 520ms var(--dp-ease-out, ease-out) both; animation-delay:var(--orr-delay, 0ms); }
@keyframes orr-film-rise { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
.orr-film__rail.is-arriving .orr-film__draw { stroke-dasharray:1 1; stroke-dashoffset:1; animation:orr-film-draw 640ms var(--dp-ease-out, ease-out) forwards; }
@keyframes orr-film-draw { to { stroke-dashoffset:0; } }
html.sf-reduce-motion .orr-film__list.is-arriving > .k-row { animation:none; }
html.sf-reduce-motion .orr-film__rail.is-arriving .orr-film__draw { animation:none; stroke-dashoffset:0; }
@media (forced-colors: active) { .orr-film__rail { display:none; } }
`;

function injectStyle(doc) {
  if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

const INERT = Object.freeze({ attach() {}, choose() {}, layout() {}, relayBeam() {}, dispose() {} });
const f = (n) => Math.round(n * 100) / 100;
let gradSeq = 0;

/**
 * @param {object} o
 * @param {HTMLElement} o.host   the box the strip fills (position:relative; its height is the sheet's)
 * @param {string} [o.frameSel] the element inside each row whose foot the rail passes under
 * @param {(row: HTMLElement) => boolean} [o.isEmpty] a station with nothing filed (an open ring)
 * @param {(id: string) => void} [o.onScrub] the Hand passed a new station while the strip was scrubbed
 * @param {() => ({x:number, y:number}|null)} [o.beamTarget] where the chosen save's hull stands, in page px
 * @returns {{ attach(list: HTMLElement, o?: {chosen?: string, arrive?: boolean}): void, choose(id: string, o?: {instant?: boolean}): void, layout(): void, dispose(): void }}
 */
export function createSaveFilmstrip({ host, frameSel = '.sf-slot-frame', isEmpty = (row) => row.classList.contains('empty'), onScrub = null, beamTarget = null } = {}) {
  const doc = (host && host.ownerDocument) || globalThis.document;
  if (!host || !doc || typeof doc.createElementNS !== 'function' || typeof host.getBoundingClientRect !== 'function') return INERT;
  injectOrrery(doc);
  injectStyle(doc);

  const gradId = `orr-film-grad-${++gradSeq}`;
  const layer = svg('svg', { class: 'orr-svg orr-film__rail', 'aria-hidden': 'true', focusable: 'false' });
  const defs = svg('defs');
  const grad = svg('linearGradient', { id: gradId, gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: 100, y2: 0 });
  for (const [offset, a] of [[0, 0], [0.08, 0.34], [0.92, 0.34], [1, 0]]) {
    grad.appendChild(svg('stop', { offset, 'stop-color': `rgb(${BONE})`, 'stop-opacity': a }));
  }
  defs.appendChild(grad);
  const railG = svg('g');
  const beamG = svg('g', { class: 'orr-film__beamg' });
  const pulseG = svg('g');
  const handG = svg('g', { class: 'orr-film__hand' });
  layer.append(defs, railG, beamG, pulseG, handG);
  host.insertBefore(layer, host.firstChild);
  host.classList.add('orr-film');
  const spot = doc.createElement('div');
  spot.className = 'orr-film__spot';
  spot.setAttribute('aria-hidden', 'true');
  host.insertBefore(spot, layer.nextSibling);

  let list = null;
  let rows = [];
  let chosenId = null;
  let geo = null;
  let geoKey = '';
  let placed = false;

  const spring = createSpring({ value: 0, preset: 'swing', onUpdate: (deg) => placeHand(deg) });

  function placeHand(deg) {
    if (!geo) return;
    handG.setAttribute('transform', `rotate(${f(deg)} ${f(geo.cx)} ${f(geo.cy)})`);
  }

  /** The bearing (degrees, about the arc's centre) that puts the Hand under station x. */
  function bearingFor(x) {
    if (!geo) return 0;
    const s = Math.max(-1, Math.min(1, (x - geo.cx) / geo.R));
    return (-Math.asin(s) * 180) / Math.PI;
  }

  function stationIndex(id) {
    return rows.findIndex((row) => row.dataset && row.dataset.id === id);
  }

  function drawRail() {
    railG.textContent = '';
    handG.textContent = '';
    if (!geo) return;
    const { W, cx, cy, R, stations, spacing } = geo;
    const at = (theta, r = R) => [cx + r * Math.sin(theta), cy + r * Math.cos(theta)];
    const x0 = Math.max(2, stations[0].x - spacing * 0.62);
    const x1 = Math.min(W - 2, stations[stations.length - 1].x + spacing * 0.62);
    const th0 = Math.asin(Math.max(-1, Math.min(1, (x0 - cx) / R)));
    const th1 = Math.asin(Math.max(-1, Math.min(1, (x1 - cx) / R)));
    const [ax, ay] = at(th0);
    const [bx, by] = at(th1);
    grad.setAttribute('x1', f(x0));
    grad.setAttribute('x2', f(x1));
    const d = `M ${f(ax)} ${f(ay)} A ${f(R)} ${f(R)} 0 0 0 ${f(bx)} ${f(by)}`;
    railG.appendChild(svg('path', { d, class: 'orr-film__band orr-film__draw', stroke: `url(#${gradId})`, pathLength: 1 }));
    railG.appendChild(svg('path', { d, class: 'orr-film__bloom orr-film__draw', stroke: `url(#${gradId})`, pathLength: 1 }));
    railG.appendChild(svg('path', { d, class: 'orr-film__core orr-film__draw', stroke: `url(#${gradId})`, pathLength: 1 }));
    // minor ticks every ~12 px along the rail, on the frames' side (toward the centre)
    const step = 12 / R;
    const minor = [];
    const radial = (th, r0, r1) => { const [p, q] = at(th, r0); const [u, v] = at(th, r1); return `M ${f(p)} ${f(q)} L ${f(u)} ${f(v)}`; };
    for (let th = th0 + step; th < th1 - step * 0.5; th += step) minor.push(radial(th, R - 3.5, R));
    railG.appendChild(svg('path', { d: minor.join(' '), class: 'orr-film__minor' }));
    // a major tick across the rail at every station; a filed station is a bead, an open one a ring
    const major = [];
    for (const st of stations) major.push(radial(st.theta, R - 8, R + 5));
    railG.appendChild(svg('path', { d: major.join(' '), class: 'orr-film__major' }));
    for (const st of stations) {
      if (st.empty) railG.appendChild(svg('circle', { cx: f(st.x), cy: f(st.y), r: 5.5, class: 'orr-film__empty' }));
      else railG.appendChild(svg('circle', { cx: f(st.x), cy: f(st.y), r: 3, class: 'orr-film__dot' }));
    }
    // the Hand, drawn at the foot of the arc (bearing 0) and turned about the centre to its station
    const half = Math.asin(Math.min(1, (spacing * 0.3) / R));
    const [sx, sy] = at(-half);
    const [ex, ey] = at(half);
    const seg = `M ${f(sx)} ${f(sy)} A ${f(R)} ${f(R)} 0 0 0 ${f(ex)} ${f(ey)}`;
    const [bx0, by0] = at(0);
    handG.appendChild(svg('path', { d: seg, class: 'orr-film__hand-bloom' }));
    handG.appendChild(svg('path', { d: seg, class: 'orr-film__hand-seg' }));
    handG.appendChild(svg('path', { d: radial(0, R - 15, R - 4), class: 'orr-film__hand-needle' }));
    handG.appendChild(svg('circle', { cx: f(bx0), cy: f(by0), r: 11, class: 'orr-film__hand-glow' }));
    handG.appendChild(svg('path', { d: `M ${f(bx0)} ${f(by0 - 6)} L ${f(bx0 + 6)} ${f(by0)} L ${f(bx0)} ${f(by0 + 6)} L ${f(bx0 - 6)} ${f(by0)} Z`, class: 'orr-film__hand-bead' }));
  }

  /** The beam from the chosen frame's head up to the berth its hull stands on. */
  let beamKey = '';
  function drawBeam({ pulse = false } = {}) {
    beamG.textContent = '';
    if (!geo || typeof beamTarget !== 'function') return;
    const idx = stationIndex(chosenId);
    if (idx < 0) return;
    const to = beamTarget();
    if (!to) return;
    const hb = host.getBoundingClientRect();
    const row = rows[idx];
    const frame = row && row.querySelector ? row.querySelector(frameSel) : null;
    const sx = geo.stations[idx].x;
    const sy = (parseFloat(row.style.top) || 0) + (frame ? frame.offsetTop : 0) - 4;
    const tx = to.x - hb.left;
    const ty = to.y - hb.top;
    if (!(sy - ty > 24)) return;
    // a leader, not a swoop: up off the frame, along just over the strip's frames (so it never runs
    // through the words above them), a 45-degree elbow, and up onto the berth's near rim
    const lo = Math.min(sx, tx);
    const hi = Math.max(sx, tx);
    let runY = sy;
    rows.forEach((r, i) => {
      const left = parseFloat(r.style.left) || 0;
      if (left > hi || left + geo.frameW < lo) return;
      const fr = r.querySelector ? r.querySelector(frameSel) : null;
      runY = Math.min(runY, (parseFloat(r.style.top) || 0) + (fr ? fr.offsetTop : 0) - 4);
    });
    runY -= 8;
    const dir = tx >= sx ? 1 : -1;
    const elbow = Math.max(0, Math.min(Math.abs(tx - sx) * 0.5, runY - ty, 44));
    const d = Math.abs(tx - sx) < 2
      ? `M ${f(sx)} ${f(sy)} L ${f(tx)} ${f(ty)}`
      : `M ${f(sx)} ${f(sy)} L ${f(sx)} ${f(runY)} L ${f(tx - dir * elbow)} ${f(runY)} L ${f(tx)} ${f(runY - elbow)} L ${f(tx)} ${f(ty)}`;
    beamG.appendChild(svg('path', { d, class: 'orr-film__beam-bloom' }));
    beamG.appendChild(svg('path', { d, class: 'orr-film__beam' }));
    beamG.appendChild(svg('circle', { cx: f(tx), cy: f(ty), r: 3.2, class: 'orr-film__beam-end' }));
    beamG.appendChild(svg('circle', { cx: f(sx), cy: f(sy), r: 2.2, class: 'orr-film__beam-end' }));
    const key = `${chosenId}|${Math.round(sx)}|${Math.round(tx)}|${Math.round(ty)}`;
    if (pulse || (beamKey && key.split('|')[0] !== beamKey.split('|')[0])) {
      pulseG.textContent = '';
      pulseG.appendChild(svg('path', { d, class: 'orr-film__pulse is-running', pathLength: 1 }));
    }
    beamKey = key;
  }

  function layout() {
    if (!list || !rows.length) { geo = null; drawRail(); return; }
    const hb = host.getBoundingClientRect();
    const W = hb.width;
    const H = hb.height;
    if (!(W > 0) || !(H > 0)) return;
    layer.setAttribute('viewBox', `0 0 ${f(W)} ${f(H)}`);
    const n = rows.length;
    const margin = Math.max(8, W * 0.02);
    const spacing = (W - margin * 2) / n;
    const gap = Math.max(12, Math.min(30, spacing * 0.1));
    const frameW = Math.max(60, spacing - gap);
    // pass 1: widths, so each row's height is its own; the frame's foot and the words' height measured
    // with the frame's drop taken out (pass 2 sets the drop from the rail's slope under each frame)
    const gapAbove = 8;
    const gapBelow = 12;
    const frames = rows.map((row) => (row.querySelector ? row.querySelector(frameSel) : null));
    rows.forEach((row, i) => { row.style.width = `${f(frameW)}px`; if (frames[i]) frames[i].style.marginBottom = '0px'; });
    let footMax = 0;
    let wordsMax = 0;
    rows.forEach((row, i) => {
      const frame = frames[i];
      row.__orrFoot = frame ? frame.offsetTop + frame.offsetHeight : 0;
      footMax = Math.max(footMax, row.__orrFoot);
      wordsMax = Math.max(wordsMax, row.offsetHeight - row.__orrFoot);
    });
    // the arc: level at the outer frames' outer edges, the middle sagging as far as the strip allows
    const cxArc = W / 2;
    const xs = rows.map((_, i) => margin + spacing * (i + 0.5));
    const halfOuter = Math.max(1, Math.abs(xs[n - 1] + frameW / 2 - cxArc));
    const yEnd = footMax + gapAbove;
    const room = Math.max(0, H - yEnd - gapBelow - wordsMax - 2);
    const sag = n > 1 ? Math.min(room, Math.max(10, W * 0.036)) : 0;
    const R = sag > 0.5 ? (halfOuter * halfOuter + sag * sag) / (2 * sag) : 1e6;
    const cy = yEnd + sag - R;
    const yAt = (x) => cy + Math.sqrt(Math.max(0, R * R - (x - cxArc) * (x - cxArc)));
    const stations = xs.map((x, i) => {
      const dx = x - cxArc;
      return { x, y: yAt(x), theta: Math.asin(Math.max(-1, Math.min(1, dx / R))), empty: !!isEmpty(rows[i]) };
    });
    // pass 2: each frame stands clear of the rail along its whole foot (the rail's highest point under
    // it), and its words hang clear of the rail along their whole top (the rail's lowest point there)
    rows.forEach((row, i) => {
      const xL = xs[i] - frameW / 2;
      const xR = xs[i] + frameW / 2;
      const yMin = Math.min(yAt(xL), yAt(xR));
      const yMax = (xL <= cxArc && cxArc <= xR) ? yAt(cxArc) : yAt(Math.abs(xL - cxArc) < Math.abs(xR - cxArc) ? xL : xR);
      const foot = yMin - gapAbove;
      row.style.left = `${f(xL)}px`;
      row.style.top = `${f(foot - row.__orrFoot)}px`;
      if (frames[i]) frames[i].style.marginBottom = `${f(yMax + gapBelow - foot)}px`;
    });
    geo = { W, H, cx: cxArc, cy, R, stations, spacing, frameW };
    drawRail();
    drawBeam();
    const idx = stationIndex(chosenId);
    const target = bearingFor(stations[Math.max(0, idx)].x);
    // a new geometry (first layout, a resize, a different count) puts the Hand on its station at once;
    // a re-attach of the same strip (the screen rebuilds its list on refresh) lets a swing finish
    const key = `${Math.round(W)}|${Math.round(H)}|${n}`;
    if (key !== geoKey || !placed) {
      geoKey = key;
      spring.set(target, { instant: true });
      placeHand(target);
      placed = true;
    } else {
      placeHand(spring.value);
      spring.set(target);
    }
  }

  let ro = null;
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => layout());
    ro.observe(host);
  }

  /** The station nearest page x (host px). */
  function nearestIndex(x) {
    if (!geo) return -1;
    let best = -1;
    let bestD = Infinity;
    geo.stations.forEach((st, i) => { const dd = Math.abs(st.x - x); if (dd < bestD) { bestD = dd; best = i; } });
    return best;
  }
  function pass(i) {
    if (i < 0 || !rows[i]) return;
    const id = rows[i].dataset && rows[i].dataset.id;
    if (!id || id === chosenId) return;
    chosenId = id;
    drawBeam({ pulse: true });
    if (typeof onScrub === 'function') onScrub(id);
  }
  // drag: past a few px the press becomes a scrub (a plain click still picks its frame)
  let press = null;
  const hostX = (event) => event.clientX - host.getBoundingClientRect().left;
  const onDown = (event) => {
    if (!geo || event.button !== 0) return;
    press = { x0: event.clientX, id: event.pointerId, scrubbing: false };
  };
  const onMove = (event) => {
    const x = hostX(event);
    spot.style.setProperty('--spot-x', `${f(x)}px`);
    if (!press || press.id !== event.pointerId || !geo) return;
    if (!press.scrubbing) {
      if (Math.abs(event.clientX - press.x0) < 6) return;
      press.scrubbing = true;
      host.classList.add('is-scrubbing');
      try { host.setPointerCapture(event.pointerId); } catch (_) { /* capture is a nicety */ }
    }
    const first = geo.stations[0].x;
    const last = geo.stations[geo.stations.length - 1].x;
    spring.set(bearingFor(Math.max(first, Math.min(last, x))));
    pass(nearestIndex(x));
  };
  const onUp = (event) => {
    if (!press || press.id !== event.pointerId) return;
    const was = press.scrubbing;
    press = null;
    host.classList.remove('is-scrubbing');
    try { host.releasePointerCapture(event.pointerId); } catch (_) { /* not captured */ }
    if (!was || !geo) return;
    const i = stationIndex(chosenId);
    if (i >= 0) spring.set(bearingFor(geo.stations[i].x));
  };
  const onEnter = () => host.classList.add('is-lit');
  const onLeave = () => host.classList.remove('is-lit');
  let wheelAcc = 0;
  const onWheel = (event) => {
    if (!geo) return;
    wheelAcc += Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    event.preventDefault();
    if (Math.abs(wheelAcc) < 60) return;
    const step = wheelAcc > 0 ? 1 : -1;
    wheelAcc = 0;
    const i = stationIndex(chosenId);
    const next = Math.max(0, Math.min(rows.length - 1, (i < 0 ? 0 : i) + step));
    if (next === i) return;
    spring.set(bearingFor(geo.stations[next].x));
    pass(next);
  };
  host.addEventListener('pointerdown', onDown);
  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerup', onUp);
  host.addEventListener('pointercancel', onUp);
  host.addEventListener('pointerenter', onEnter);
  host.addEventListener('pointerleave', onLeave);
  host.addEventListener('wheel', onWheel, { passive: false });

  return {
    /** Take the screen's freshly built list; `arrive` plays the rail's draw and the frames' rise. */
    attach(next, { chosen = null, arrive = false } = {}) {
      list = next || null;
      rows = list ? [...list.children].filter((node) => node.classList && node.classList.contains('k-row')) : [];
      if (chosen != null) chosenId = String(chosen);
      if (list) {
        list.classList.add('orr-film__list');
        rows.forEach((row, i) => row.style.setProperty('--orr-delay', `${80 + i * 46}ms`));
        list.classList.toggle('is-arriving', !!arrive);
        layer.classList.toggle('is-arriving', !!arrive);
      }
      layout();
    },
    /** Swing the Hand to the save `id`. */
    choose(id, { instant = false } = {}) {
      chosenId = id == null ? null : String(id);
      if (!geo) return;
      const idx = stationIndex(chosenId);
      if (idx < 0) return;
      const target = bearingFor(geo.stations[idx].x);
      if (!placed) { spring.set(target, { instant: true }); placed = true; drawBeam(); return; }
      // mid-scrub the pointer owns the Hand; the frames still follow the choice
      if (!(press && press.scrubbing)) spring.set(target, { instant });
      drawBeam();
    },
    /** Re-seat the beam (the berth moved or changed state). */
    relayBeam() { drawBeam(); },
    layout,
    dispose() {
      spring.stop();
      if (ro) ro.disconnect();
      host.removeEventListener('pointerdown', onDown);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerup', onUp);
      host.removeEventListener('pointercancel', onUp);
      host.removeEventListener('pointerenter', onEnter);
      host.removeEventListener('pointerleave', onLeave);
      host.removeEventListener('wheel', onWheel);
      host.classList.remove('orr-film', 'is-lit', 'is-scrubbing');
      spot.remove();
      layer.remove();
    },
  };
}
