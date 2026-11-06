// Fixed, non-colliding guide geometry in the authored cradle's local XZ frame.
// The legal mouth bounds come from the same fit used by the native receiver.
import { cradleFit } from './course.js';

export function receiverMouthSegments(radius) {
  const { minX, maxX, mouthZ } = cradleFit(radius);
  const lead = radius * 0.55, gap = radius * 0.12, flare = radius * 0.18;
  const points = [];
  const segment = (x1, z1, x2, z2) => points.push(x1, 0, z1, x2, 0, z2);
  for (const [edge, sign] of [[minX, -1], [maxX, 1]]) {
    const outer = edge + sign * flare;
    const near = mouthZ - gap, far = mouthZ - lead;
    const mid = far + (near - far) * 0.52;
    segment(outer, far, outer + (edge - outer) * 0.38, far + (near - far) * 0.38);
    segment(outer + (edge - outer) * 0.6, mid, edge, near);
    // Unequal outside-facing wings make the two ends directional without color.
    segment(edge, near, edge + sign * radius * 0.13, near - radius * 0.12);
    if (sign < 0) segment(edge, near, edge + sign * radius * 0.08, near - radius * 0.22);
  }
  return points;
}
