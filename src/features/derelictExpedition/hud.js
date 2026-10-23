// BLACKBOX RUNS presentation host. No timer, gameplay state or global binding is
// owned here. The host calls update at 4–10 Hz while ordinary flight is visible.
import { arcD, ticksD, SVGNS } from '../../ui/orrery/svg.js';
import { injectOrrery } from '../../ui/orrery/tokens.js';

const MAX_MARKERS = 3;
const MAX_ROUTE_POINTS = 12;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
const CSS = `
.sf-blackbox-hud { position:absolute; inset:0; z-index:10; pointer-events:none; overflow:hidden; color:var(--dp-ink,#e8e2d4); }
.sf-blackbox-hud[hidden] { display:none; }
.sf-blackbox-hud__instrument { position:absolute; top:14px; left:16px; width:min(330px,calc(100% - 32px));
  padding:10px 12px; box-sizing:border-box; background:linear-gradient(90deg,var(--dp-glass,rgb(8 11 16 / .62)),transparent);
  font-family:var(--dp-face-label,"Archivo","Instrument Sans",sans-serif); font-size:12px; line-height:1.35; }
.sf-blackbox-hud__heading { display:flex; gap:12px; align-items:flex-start; }
.sf-blackbox-hud__words { flex:1; min-width:0; }
.sf-blackbox-hud__eyebrow { margin:0 0 5px; font-size:12px; letter-spacing:.07em; font-weight:600; color:var(--dp-ink-dim,#b7b4a6); }
.sf-blackbox-hud__objective { margin:0; font-size:16px; font-weight:650; letter-spacing:.015em; line-height:1.15; }
.sf-blackbox-hud__gauge { flex:none; width:58px; height:64px; overflow:visible; }
.sf-blackbox-hud__gauge text { font-size:12px; font-weight:500; letter-spacing:0; text-anchor:middle; }
.sf-blackbox-hud__gauge .sf-blackbox-hud__number { font-size:19px; font-weight:300; fill:var(--dp-phos,#dfeeff); }
.sf-blackbox-hud__status { margin:5px 0 0; color:var(--dp-ink-dim,#b7b4a6); font-size:12px; }
.sf-blackbox-hud__hint { margin:6px 0 0; color:var(--dp-ink,#e8e2d4); font-size:13px; line-height:1.35; }
.sf-blackbox-hud__route-toggle { display:block; min-width:96px; min-height:44px; margin:1px 0 -8px; padding:4px 0;
  pointer-events:auto; color:var(--dp-ink-dim,#b7b4a6); background:none; border:0; font:inherit; cursor:pointer; text-align:left; }
.sf-blackbox-hud__route-toggle[aria-pressed="true"] { color:var(--dp-ink,#e8e2d4); }
.sf-blackbox-hud__route-toggle:focus-visible { outline:2px solid var(--dp-hand,#f2b950); outline-offset:3px; }
.sf-blackbox-hud__overlay { position:absolute; inset:0; width:100%; height:100%; overflow:hidden; }
.sf-blackbox-hud__overlay text { font-size:12px; font-weight:600; letter-spacing:.025em; fill:var(--dp-ink,#e8e2d4);
  paint-order:stroke; stroke:var(--dp-void,#05070a); stroke-width:3px; stroke-linejoin:round; }
.sf-blackbox-hud__marker path { fill:none; stroke:var(--dp-ink,#e8e2d4); stroke-width:1.5; vector-effect:non-scaling-stroke; }
.sf-blackbox-hud__marker[data-primary="true"] path { stroke:var(--dp-hand,#f2b950); stroke-width:2; }
.sf-blackbox-hud__route { fill:none; stroke:var(--dp-line-hi,rgb(232 226 212 / .62)); stroke-width:1.5; stroke-dasharray:7 9; vector-effect:non-scaling-stroke; }
.sf-blackbox-hud[data-high-contrast="true"] .sf-blackbox-hud__instrument { background:var(--dp-glass-deep,rgb(6 8 12 / .82)); }
.sf-blackbox-hud[data-high-contrast="true"] .sf-blackbox-hud__status,
.sf-blackbox-hud[data-high-contrast="true"] .sf-blackbox-hud__eyebrow { color:var(--dp-ink,#e8e2d4); }
@media (max-width:760px), (max-height:620px) {
  .sf-blackbox-hud__instrument { left:8px; top:8px; width:min(306px,calc(100% - 16px)); padding:6px 8px; }
  .sf-blackbox-hud__objective { font-size:14px; font-variation-settings:"wdth" 88; }
  .sf-blackbox-hud__hint { font-size:12px; }
  .sf-blackbox-hud__heading { gap:8px; }
  .sf-blackbox-hud__gauge { width:52px; }
}
`;

const GLYPHS = Object.freeze({
  diamond: 'M 0 -7 L 7 0 L 0 7 L -7 0 Z',
  double_diamond: 'M 0 -8 L 8 0 L 0 8 L -8 0 Z M 0 -4 L 4 0 L 0 4 L -4 0 Z',
  split_bar: 'M -8 -8 L -8 8 M 8 -8 L 8 8 M -8 0 L -3 0 M 3 0 L 8 0',
  three_chevrons: 'M -10 -6 L -4 0 L -10 6 M -3 -6 L 3 0 L -3 6 M 4 -6 L 10 0 L 4 6',
  broken_link: 'M -2 -7 L -8 -7 L -8 5 L -2 5 M 2 -5 L 8 -5 L 8 7 L 2 7 M -2 0 L 2 0',
  open_bracket: 'M -4 -8 L -9 -8 L -9 8 L -4 8 M 4 -8 L 9 -8 L 9 8 L 4 8',
  double_bracket: 'M -4 -8 L -9 -8 L -9 8 L -4 8 M 4 -8 L 9 -8 L 9 8 L 4 8 M -13 -4 L -13 4 M 13 -4 L 13 4',
});
const LABELS = Object.freeze({ entry: 'ENTRY', receiver: 'RECEIVER', shutter: '01 SHUTTER', vent: '02 PRESSURE HOLD',
  relay: '03 OPTIONAL VAULT', blackbox: 'FLIGHT RECORDER', core: 'OPTIONAL CORE', outer_route: 'OUTER TOW LANE' });

function svgNode(doc, tag, attributes = {}) {
  const node = doc.createElementNS(SVGNS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}
function text(node, value) {
  const next = String(value ?? '');
  if (node.textContent !== next) node.textContent = next;
}

/** Pure placement helper; projection is window CSS pixels, box is the HUD host. */
export function placeExpeditionHudMarker(projected, box, slot = 0) {
  if (!projected || !Number.isFinite(projected.x) || !Number.isFinite(projected.y)
    || projected.behind === true || !box || !(box.width > 80 && box.height > 80)) return null;
  const width = box.width, height = box.height;
  const px = projected.x - (box.left || 0), py = projected.y - (box.top || 0);
  const dx = px - width / 2, dy = py - height / 2;
  const onScreen = projected.onScreen !== false && px >= 22 && px <= width - 22 && py >= 22 && py <= height - 22;
  let x = px, y = py;
  if (!onScreen) {
    const vx = Math.abs(dx) + Math.abs(dy) > 1e-7 ? dx : 0;
    const vy = Math.abs(dx) + Math.abs(dy) > 1e-7 ? dy : -1;
    const span = Math.min(Math.abs(vx) > 1e-7 ? (width / 2 - 24) / Math.abs(vx) : Infinity,
      Math.abs(vy) > 1e-7 ? (height / 2 - 35) / Math.abs(vy) : Infinity);
    x = width / 2 + vx * span;
    y = clamp(height / 2 + vy * span + slot * 28, 35, height - 35);
  }
  // The compact instrument owns this top-left patch; an offscreen marker yields
  // below it. Its arrow still points along the original projection direction.
  if (!onScreen && x < Math.min(358, width - 24) && y < 210) y = Math.min(height - 35, 210 + slot * 28);
  const labelToLeft = x > width * 0.62;
  return { x, y, onScreen, labelToLeft, angle: Math.atan2(dy, dx) * 180 / Math.PI,
    labelX: labelToLeft ? -17 : 17, labelY: -17 };
}

/**
 * Mount once, call update({visible: state.mode === 'flight'}) at 4–10 Hz,
 * dispose with the UI host. Optional viewport is useful when the host already
 * owns a cached layout rectangle. No gameplay controls are duplicated here.
 */
export function createDerelictExpeditionHud({ root, system, helpers, document: suppliedDocument } = {}) {
  const doc = suppliedDocument || root?.ownerDocument || globalThis.document;
  if (!root?.appendChild || !doc?.createElement || !doc?.createElementNS) throw new TypeError('BLACKBOX RUNS HUD requires a DOM root');
  if (!system || (typeof system.presentation !== 'function' && typeof system.getStatus !== 'function')) {
    throw new TypeError('BLACKBOX RUNS HUD requires its production system or helper API');
  }
  injectOrrery(doc);
  const host = doc.createElement('div');
  host.className = 'sf-blackbox-hud'; host.hidden = true;
  const style = doc.createElement('style'); style.textContent = CSS; host.appendChild(style);
  const overlay = svgNode(doc, 'svg', { class: 'orr-svg sf-blackbox-hud__overlay', 'aria-hidden': 'true' });
  const routePath = svgNode(doc, 'path', { class: 'sf-blackbox-hud__route' }); overlay.appendChild(routePath);
  host.appendChild(overlay);
  const instrument = doc.createElement('section'); instrument.className = 'sf-blackbox-hud__instrument';
  instrument.setAttribute('aria-label', 'Blackbox expedition');
  const heading = doc.createElement('div'); heading.className = 'sf-blackbox-hud__heading';
  const words = doc.createElement('div'); words.className = 'sf-blackbox-hud__words';
  const eyebrow = doc.createElement('p'); eyebrow.className = 'orr-label sf-blackbox-hud__eyebrow'; text(eyebrow, 'BLACKBOX RUNS');
  const objective = doc.createElement('h2'); objective.className = 'sf-blackbox-hud__objective';
  objective.setAttribute('aria-live', 'polite'); objective.setAttribute('aria-atomic', 'true');
  words.appendChild(eyebrow); words.appendChild(objective); heading.appendChild(words);
  const gauge = svgNode(doc, 'svg', { class: 'orr-svg sf-blackbox-hud__gauge', viewBox: '0 0 64 70', role: 'meter',
    'aria-label': 'Reactor pressure', 'aria-valuemin': '0', 'aria-valuemax': '100' });
  gauge.appendChild(svgNode(doc, 'path', { d: arcD(32, 29, 23, -130, 130), class: 'orr-band' }));
  gauge.appendChild(svgNode(doc, 'path', { d: ticksD(32, 29, 28, 10, { len: 3, major: 5, majorLen: 5, from: -130, to: 130 }), class: 'orr-tick' }));
  const fill = svgNode(doc, 'path', { d: '', class: 'orr-lit' }); gauge.appendChild(fill);
  const pressureValue = svgNode(doc, 'text', { x: 32, y: 34, class: 'sf-blackbox-hud__number' }); gauge.appendChild(pressureValue);
  const pressureLabel = svgNode(doc, 'text', { x: 32, y: 65 }); gauge.appendChild(pressureLabel);
  heading.appendChild(gauge); instrument.appendChild(heading);
  const status = doc.createElement('p'); status.className = 'sf-blackbox-hud__status'; instrument.appendChild(status);
  const hint = doc.createElement('p'); hint.className = 'sf-blackbox-hud__hint'; instrument.appendChild(hint);
  const toggle = doc.createElement('button'); toggle.type = 'button'; toggle.className = 'sf-blackbox-hud__route-toggle';
  toggle.setAttribute('aria-pressed', 'false'); toggle.setAttribute('aria-label', 'Show the outer tow route'); text(toggle, '+ Show outer route');
  instrument.appendChild(toggle); host.appendChild(instrument);
  const markerPool = Array.from({ length: MAX_MARKERS }, () => {
    const group = svgNode(doc, 'g', { class: 'sf-blackbox-hud__marker', display: 'none' });
    const glyph = svgNode(doc, 'path'); const leader = svgNode(doc, 'path'); const label = svgNode(doc, 'text');
    group.appendChild(glyph); group.appendChild(leader); group.appendChild(label); overlay.appendChild(group);
    return { group, glyph, leader, label };
  });

  let mounted = false, disposed = false, showRoute = false, sizeDirty = true;
  let rect = { left: 0, top: 0, width: 0, height: 0 };
  let lastProjection = null;
  const view = doc.defaultView || globalThis.window;
  const Resize = view?.ResizeObserver || globalThis.ResizeObserver;
  const invalidateSize = () => { sizeDirty = true; };
  const observer = typeof Resize === 'function' ? new Resize(invalidateSize) : null;
  const inputGuard = event => event.stopPropagation?.();
  const keyGuard = event => { if (event.key === ' ' || event.key === 'Enter') event.stopPropagation?.(); };
  const onToggle = () => {
    showRoute = !showRoute;
    toggle.setAttribute('aria-pressed', String(showRoute));
    toggle.setAttribute('aria-label', showRoute ? 'Hide the outer tow route' : 'Show the outer tow route');
    text(toggle, showRoute ? '− Hide outer route' : '+ Show outer route');
    if (lastProjection) paintMarkers(lastProjection);
  };
  toggle.addEventListener('click', onToggle); toggle.addEventListener('pointerdown', inputGuard); toggle.addEventListener('keydown', keyGuard);
  const scratchWorld = { x: 0, y: 0, z: 0 }, scratchScreen = { x: NaN, y: NaN, onScreen: false };
  function project(position) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z) || typeof helpers?.worldToScreen !== 'function') return null;
    scratchWorld.x = position.x; scratchWorld.z = position.z;
    scratchScreen.x = NaN; scratchScreen.y = NaN; scratchScreen.onScreen = false;
    // This is the actual two-argument projection contract used by the ordinary
    // HUD and capitalBossOverlayMount. The helper may be rebound on renderer load.
    const result = helpers.worldToScreen(scratchWorld, scratchScreen) || scratchScreen;
    return Number.isFinite(result.x) && Number.isFinite(result.y)
      ? { x: result.x, y: result.y, onScreen: result.onScreen, behind: result.behind } : null;
  }
  function paintMarkers(projection) {
    const projectedRoute = showRoute ? (projection.route || []).slice(0, MAX_ROUTE_POINTS).map(project) : [];
    let routeD = '';
    for (let index = 1; index < projectedRoute.length; index++) {
      const a = projectedRoute[index - 1], b = projectedRoute[index];
      if (!a || !b || a.onScreen === false || b.onScreen === false || a.behind || b.behind) continue;
      routeD += `M ${a.x - rect.left} ${a.y - rect.top} L ${b.x - rect.left} ${b.y - rect.top} `;
    }
    routePath.setAttribute('d', routeD);
    const candidates = (projection.markers || []).slice(0, 10)
      .filter(marker => marker.emphasis === 'primary' || showRoute || (Number.isFinite(marker.distance) && marker.distance < 180))
      .sort((a, b) => (a.emphasis === 'primary' ? -1 : 0) - (b.emphasis === 'primary' ? -1 : 0)
        || (Number.isFinite(a.distance) ? a.distance : Infinity) - (Number.isFinite(b.distance) ? b.distance : Infinity));
    if (showRoute && projection.route?.length > 1) {
      // A separate labelled waypoint lets the exterior route remain discoverable
      // when all of its beam segments are outside the camera.
      let best = null;
      for (let index = 1; index < projectedRoute.length; index++) {
        const p = projectedRoute[index]; if (!p || p.behind) continue;
        const d = Math.hypot(p.x - rect.left - rect.width / 2, p.y - rect.top - rect.height / 2);
        if (!best || d < best.d) best = { p, d, index };
      }
      if (best) candidates.splice(Math.min(1, candidates.length), 0, { id: 'outer_route', label: 'OUTER TOW LANE', shape: 'three_chevrons',
        position: projection.route[best.index], emphasis: 'secondary' });
    }
    const occupied = [];
    let count = 0;
    for (const marker of candidates) {
      if (count >= MAX_MARKERS) break;
      const screen = project(marker.position), placed = placeExpeditionHudMarker(screen, rect, count);
      if (!placed) continue;
      if (occupied.some(p => Math.abs(p.x - placed.x) < 160 && Math.abs(p.y - placed.y) < 32)) continue;
      occupied.push(placed);
      const node = markerPool[count++];
      node.group.setAttribute('display', ''); node.group.setAttribute('transform', `translate(${placed.x} ${placed.y})`);
      node.group.setAttribute('data-primary', String(marker.emphasis === 'primary'));
      node.glyph.setAttribute('d', placed.onScreen ? GLYPHS[marker.shape] || GLYPHS.diamond : 'M -6 -7 L 4 0 L -6 7');
      node.glyph.setAttribute('transform', placed.onScreen ? '' : `rotate(${placed.angle})`);
      const sign = placed.labelToLeft ? -1 : 1;
      node.leader.setAttribute('d', `M ${sign * 10} -4 L ${sign * 17} -14 L ${sign * 80} -14`);
      node.label.setAttribute('x', String(placed.labelX)); node.label.setAttribute('y', String(placed.labelY));
      node.label.setAttribute('text-anchor', placed.labelToLeft ? 'end' : 'start');
      const measured = Number.isFinite(marker.distance) ? ` / ${Math.round(marker.distance)} wu` : '';
      text(node.label, `${LABELS[marker.id] || String(marker.label || '').slice(0, 28)}${measured}`);
    }
    for (; count < MAX_MARKERS; count++) markerPool[count].group.setAttribute('display', 'none');
  }
  function mount() {
    if (disposed) return false;
    if (!mounted) {
      root.appendChild(host); mounted = true; sizeDirty = true;
      observer?.observe(root);
      if (!observer) view?.addEventListener?.('resize', invalidateSize);
    }
    return true;
  }
  function update({ visible = true, viewport = null } = {}) {
    if (disposed || !mount()) return null;
    if (!visible) { host.hidden = true; return null; }
    const projection = typeof system.presentation === 'function' ? system.presentation() : system.getStatus()?.presentation;
    if (!projection) { host.hidden = true; lastProjection = null; return null; }
    if (viewport) rect = { left: viewport.left || 0, top: viewport.top || 0, width: viewport.width, height: viewport.height };
    else if (sizeDirty) {
      const measured = root.getBoundingClientRect?.() || {};
      rect = { left: measured.left || 0, top: measured.top || 0,
        width: measured.width || root.clientWidth || view?.innerWidth || 0,
        height: measured.height || root.clientHeight || view?.innerHeight || 0 };
    }
    sizeDirty = !observer && !view?.addEventListener;
    overlay.setAttribute('viewBox', `0 0 ${Math.max(1, rect.width)} ${Math.max(1, rect.height)}`);
    host.hidden = false; lastProjection = projection;
    host.setAttribute('data-high-contrast', String(projection.accessibility?.highContrast === true));
    host.setAttribute('data-reduced-motion', String(projection.accessibility?.reducedMotion === true));
    host.setAttribute('data-reduced-flash', String(projection.accessibility?.reducedFlash === true));
    text(objective, projection.objective?.title || 'BLACKBOX RUNS'); text(status, projection.status); text(hint, projection.hint);
    const value = clamp(projection.pressure?.value, 0, 100);
    text(pressureValue, Math.round(value)); text(pressureLabel, projection.pressure?.label || 'QUIET');
    gauge.setAttribute('aria-valuenow', String(Math.round(value))); gauge.setAttribute('aria-valuetext', `${Math.round(value)} percent, ${projection.pressure?.label || 'quiet'}`);
    fill.setAttribute('d', value > 0 ? arcD(32, 29, 23, -130, -130 + value * 2.6) : '');
    fill.setAttribute('class', value >= 65 ? 'orr-lit orr-threat' : 'orr-lit');
    // No CSS/keyframe pulse or flash is used: the real mechanism supplies motion,
    // while persistent text, arc fill and marker shape remain steady for everyone.
    paintMarkers(projection);
    return projection;
  }
  function dispose() {
    if (disposed) return;
    disposed = true; observer?.disconnect();
    if (!observer) view?.removeEventListener?.('resize', invalidateSize);
    toggle.removeEventListener('click', onToggle); toggle.removeEventListener('pointerdown', inputGuard); toggle.removeEventListener('keydown', keyGuard);
    host.remove(); mounted = false; lastProjection = null;
  }
  mount();
  return { element: host, mount, update, dispose, setRouteVisible(value) {
    if (!disposed && showRoute !== !!value) onToggle();
  } };
}

export default createDerelictExpeditionHud;
