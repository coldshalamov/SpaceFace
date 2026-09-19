// No randomness and no world access. Lexical comparisons deliberately avoid localeCompare.
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
export const unitValue = (value, fallback = 0) => clamp(finite(value, fallback), 0, 1);
export const point = (p) => ({ x: finite(p?.x), z: finite(p?.z) });
export const validPoint = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export function keyFor(id) {
  if (typeof id === 'string' && id.length > 0) return `s:${id}`;
  if (typeof id === 'number' && Number.isFinite(id)) return `n:${id}`;
  throw new TypeError('Enemy Mind IDs must be nonempty strings or finite numbers');
}
export function unit(x, z, fallback = { x: 1, z: 0 }) {
  const length = Math.hypot(x, z);
  return length > 1e-8 ? { x: x / length, z: z / length } : point(fallback);
}
export const dot = (a, b) => a.x * b.x + a.z * b.z;
export const add = (a, b, scale = 1) => ({ x: a.x + b.x * scale, z: a.z + b.z * scale });
export const mix = (a, b, fraction) => ({ x: a.x + (b.x - a.x) * fraction, z: a.z + (b.z - a.z) * fraction });
export function boundedGoal(goal, self, maxDistance) {
  if (!validPoint(goal)) return point(self);
  const length = distance(goal, self);
  return length <= maxDistance ? point(goal) : mix(self, goal, maxDistance / length);
}
export function cleanCopy(value) { return JSON.parse(JSON.stringify(value)); }
