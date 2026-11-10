// Draw list for one Spectrum public view. Rays are short ticks from the ship
// along the heard bearing — they stop well short of naming a range. The fix
// ellipse exists only after observations reveal it. This module does not write
// sim state and does not import Three.js; the adapter turns the polylines into
// meshes.

import { RAY_TICK_WU } from '../../data/spectrum/constants.js';
import { dirFromBearing } from '../../systems/spectrum/geometry.js';
import { silhouetteRings } from './silhouettes.js';

function ring(center, radius, steps) {
  const points = [];
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    points.push({
      x: center.x + Math.cos(angle) * radius,
      z: center.z + Math.sin(angle) * radius,
    });
  }
  return points;
}

export function buildSpectrumFrame(view, props = []) {
  const rays = [];
  const log = view && Array.isArray(view.log) ? view.log : [];
  const recent = log.slice(-4);
  for (let i = 0; i < recent.length; i++) {
    const row = recent[i];
    if (!row || row.bearingDeg == null || !row.observer) continue;
    const dir = dirFromBearing(row.bearingDeg);
    rays.push({
      kind: row.via === 'echo' ? 'echo' : 'bearing',
      x1: row.observer.x,
      z1: row.observer.z,
      x2: row.observer.x + dir.x * RAY_TICK_WU,
      z2: row.observer.z + dir.z * RAY_TICK_WU,
    });
  }
  let ellipse = null;
  if (view && view.revealed && view.fix) {
    const area = Math.max(600, Number(view.area) || 600);
    const radius = Math.sqrt(area / Math.PI);
    ellipse = ring(view.fix, radius, 16);
  }
  const propMarks = [];
  for (let i = 0; i < props.length; i++) {
    const prop = props[i];
    if (!prop) continue;
    propMarks.push({ id: prop.id, kind: prop.kind, x: prop.x, z: prop.z });
  }
  const cues = [];
  if (view && view.reason && view.reason !== 'ok') {
    cues.push({ kind: 'miss', text: String(view.reason).replace(/_/g, ' ') });
  } else if (view && view.revealed) {
    cues.push({ kind: 'fix', text: view.identity });
  } else if (view && view.bearingDeg != null) {
    cues.push({ kind: 'bearing', text: `bearing ${Math.round(view.bearingDeg)}` });
  }
  return {
    rays,
    ellipse,
    props: propMarks,
    cues: cues.slice(0, 2),
    silhouettes: silhouetteRings(),
  };
}

export function spectrumFrameVertexCount(frame) {
  if (!frame) return 0;
  let count = 0;
  count += (frame.rays ? frame.rays.length : 0) * 2;
  count += frame.ellipse ? frame.ellipse.length : 0;
  const rings = frame.silhouettes || [];
  for (let i = 0; i < rings.length; i++) count += rings[i].points.length;
  return count;
}
