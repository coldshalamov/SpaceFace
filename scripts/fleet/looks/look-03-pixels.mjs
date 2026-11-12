// LOOK-03: connected bright regions in saved screenshots, with projected body candidates.
// Display RGB luma is not scene-linear radiance. Bounds identify candidates, not a raycast hit.
import { PNG } from 'pngjs';

export function brightRegions(bytes, minimumPixels = 500) {
  const { width, height, data } = PNG.sync.read(bytes);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const regions = [];
  const luma = (i) => data[i * 4] * 0.2126 + data[i * 4 + 1] * 0.7152 + data[i * 4 + 2] * 0.0722;
  for (let start = 0; start < visited.length; start++) {
    if (visited[start] || luma(start) <= 240) continue;
    let head = 0, tail = 1, sum = 0;
    let left = width, right = 0, top = height, bottom = 0;
    queue[0] = start;
    visited[start] = 1;
    while (head < tail) {
      const i = queue[head++], x = i % width, y = Math.floor(i / width);
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
      sum += luma(i);
      for (const next of [x > 0 ? i - 1 : -1, x + 1 < width ? i + 1 : -1,
        y > 0 ? i - width : -1, y + 1 < height ? i + width : -1]) {
        if (next < 0 || visited[next]) continue;
        visited[next] = 1;
        if (luma(next) > 240) queue[tail++] = next;
      }
    }
    const sample = queue[Math.floor(tail / 2)];
    if (tail >= minimumPixels) regions.push({ pixels: tail, meanLuma: sum / tail,
      sample: { x: sample % width, y: Math.floor(sample / width) },
      bounds: { left, right, top, bottom } });
  }
  return regions.sort((a, b) => b.pixels - a.pixels);
}

export function bodiesUnderRegion(region, entities) {
  const a = region.bounds;
  return entities.filter((e) => e.bounds && e.bounds.left <= a.right && e.bounds.right >= a.left
    && e.bounds.top <= a.bottom && e.bounds.bottom >= a.top)
    .map(({ id, type, defId, bounds, leaves }) => ({ id, type, defId, bounds, leaves }));
}
