// Wave G14 — a locked target's bracket is a shape, not a sentence.
// Hostile, friendly, and cargo stay three geometries.

const CARGO_TYPES = new Set(['pickup', 'payload', 'cargo_pod']);

export function targetBracketShape(entity, hostile) {
  if (!entity) return null;
  const type = entity.type;
  const data = entity.data || {};
  const pod = data.freightCustodyPod;
  const cargoPod = pod === true || (pod != null && typeof pod === 'object');
  if (CARGO_TYPES.has(type) || data.kind === 'commodity' || data.kind === 'cargo'
      || (type !== 'ship' && cargoPod)) {
    return 'bracket-cargo';
  }
  if (hostile) return 'bracket-hostile';
  return 'bracket-friendly';
}
