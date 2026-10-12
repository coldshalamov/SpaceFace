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
  const project = point => helpers?.worldToScreen?.({ x: point.x, y: 0, z: point.z });
  const segment = points => {
    const pixels = points.map(project);
    if (pixels.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return '';
    return pixels.map((p, index) => `${index ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  };
  return { frame(st = state) {
    const view = st.spectrumPublic;
    svg.style.display = st.mode === 'flight' && view && !view.resolved && !screens?.isOpen?.() ? '' : 'none';
    if (svg.style.display === 'none') return;
    const now = st.simTime || 0;
    if (now >= last && now - last < 0.1) return; last = now;
    const frame = buildSpectrumFrame(view);
    const lines = frame.rays.map(ray => segment([{ x: ray.x1, z: ray.z1 }, { x: ray.x2, z: ray.z2 }]));
    if (frame.ellipse) lines.push(`${segment(frame.ellipse)} Z`);
    path.setAttribute('d', lines.join(' '));
  }, dispose() { svg.remove(); } };
}
