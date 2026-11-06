// Bounded presentation projection. Powers remain in the worker; the renderer receives only
// changing tells. Comparing cached scalars avoids serializing a steady tell every tick.
const FIELDS = Object.freeze([
  'kind', 'phase', 'phaseStartedAt', 'phaseEndsAt',
  'targetId', 'targetX', 'targetZ', 'wardCandidateId', 'linkEnergy', 'linkMaxEnergy', 'linkHp', 'linkMaxHp',
  'linkRange', 'linkReadyAt', 'salvoCursor', 'salvoStartedAt', 'nextSalvoTick',
  'anchorActive', 'anchorRadius', 'anchorStrength', 'windupSourceX', 'windupSourceZ',
  'interrupted', 'interruptedAt',
]);
const AXES = Object.freeze(['x', 'z']);
const KINDS = new Set(['warden', 'jackal', 'anchor']);
const PHASES = new Set(['idle', 'windup', 'active', 'recovery']);
const cache = new WeakMap();
const scalar = (value) => typeof value === 'boolean' ? value
  : typeof value === 'string' ? value.slice(0, 96) : Number.isFinite(value) ? value : null;

export function swarmSpecialistPresentationFrame(view) {
  if (!view || !KINDS.has(view.kind) || !PHASES.has(view.phase)) return null;
  let record = cache.get(view);
  let changed = !record;
  if (!record) { record = { values: [], frame: null }; cache.set(view, record); }
  let i = 0;
  for (const key of FIELDS) {
    const value = scalar(view[key]);
    if (record.values[i] !== value) changed = true;
    record.values[i++] = value;
  }
  for (let point = 0; point < 3; point++) for (const axis of AXES) {
    const value = Number.isFinite(view.salvoPoints?.[point]?.[axis]) ? view.salvoPoints[point][axis] : null;
    if (record.values[i] !== value) changed = true;
    record.values[i++] = value;
  }
  if (!changed) return record.frame;
  const projected = {};
  for (let k = 0; k < FIELDS.length; k++) {
    if (record.values[k] !== null) projected[FIELDS[k]] = record.values[k];
  }
  if (view.kind === 'jackal' && record.values.slice(FIELDS.length).every(Number.isFinite)) {
    projected.salvoPoints = [0, 1, 2].map((p) => ({
      x: record.values[FIELDS.length + p * 2], z: record.values[FIELDS.length + p * 2 + 1],
    }));
  }
  record.frame = JSON.stringify(projected);
  return record.frame;
}

export function foldSwarmSpecialistPresentation(row, fields) {
  if (!Object.hasOwn(fields, 'swarmSpecialistFrame')) return;
  row.data ||= {};
  const frame = fields.swarmSpecialistFrame;
  if (frame === null) { delete row.data.swarmSpecialist; return; }
  if (typeof frame !== 'string' || frame.length > 2048) return;
  let view;
  try { view = JSON.parse(frame); } catch { return; }
  if (!view || !KINDS.has(view.kind) || !PHASES.has(view.phase)) return;
  // Replace the snapshot, including removal of stale targets and mine forecasts.
  row.data.swarmSpecialist = view;
}
