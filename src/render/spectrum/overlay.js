// Project public scanner geometry through the gameplay camera. No private emitter positions.
import { buildSpectrumFrame } from './frame.js';
const NS = 'http://www.w3.org/2000/svg';
export function mountSpectrumOverlay({ root, state, helpers, screens }) {
  if (!root || typeof document === 'undefined') return null;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-label', 'Scanner bearings and earned uncertainty area');
  svg.setAttribute('role', 'img');
  Object.assign(svg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.5'); path.setAttribute('stroke-dasharray', '5 4');
  svg.append(path); root.append(svg);
  let last = -Infinity;
  let passSerial = 0, lastPaintPass = -2;
  const isLive = (st) => !!(st && st.mode === 'flight' && st.spectrumPublic
    && !st.spectrumPublic.resolved && !screens?.isOpen?.());
  const project = point => helpers?.worldToScreen?.({ x: point.x, y: 0, z: point.z });
  const segment = points => {
    const pixels = points.map(project);
    if (pixels.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return '';
    return pixels.map((p, index) => `${index ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  };
  return { wantsFrame(st = state) {
    // Live while the scanner has geometry to paint; while the svg is still displayed one more
    // frame owes it the hide pass (scan resolved, mode left flight, or a screen opened over it).
    return isLive(st) || svg.style.display !== 'none';
  }, frame(st = state) {
    const view = st.spectrumPublic;
    svg.style.display = isLive(st) ? '' : 'none';
    if (svg.style.display === 'none') return;
    passSerial += 1;
    const now = st.simTime || 0;
    if (now >= last && now - last < 0.1) return;
    // The 0.1 s sim-time gate collapses to every presented frame once frames run slower than
    // the interval; never rebuild the path on two consecutive frames in that regime.
    if (passSerial - lastPaintPass < 2) return;
    last = now;
    lastPaintPass = passSerial;
    const frame = buildSpectrumFrame(view, view.props || []);
    const lines = frame.rays.map(ray => segment([{ x: ray.x1, z: ray.z1 }, { x: ray.x2, z: ray.z2 }]));
    const rings = frame.silhouettes || [];
    for (let i = 0; i < frame.props.length; i++) {
      const prop = frame.props[i];
      let ring = null;
      for (let r = 0; r < rings.length; r++) if (rings[r].id === prop.kind) ring = rings[r];
      if (!ring) continue;
      const placed = [];
      for (let p = 0; p < ring.points.length; p++) {
        placed.push({ x: ring.points[p].x + prop.x, z: ring.points[p].z + prop.z });
      }
      lines.push(segment(placed));
    }
    if (frame.ellipse) lines.push(`${segment(frame.ellipse)} Z`);
    path.setAttribute('d', lines.join(' '));
  }, dispose() { svg.remove(); } };
}
