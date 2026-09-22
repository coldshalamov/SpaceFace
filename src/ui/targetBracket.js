// Wave G14 — a locked target's bracket is a shape, not a sentence.
// Hostile, friendly, and cargo stay three geometries.

const CARGO_TYPES = new Set(['pickup', 'payload', 'cargo_pod']);

export function targetBracketShape(entity, hostile) {
  if (!entity) return null;
  const type = entity.type;
  const data = entity.data || {};
  if (CARGO_TYPES.has(type) || data.freightCustodyPod === true || data.kind === 'commodity') {
    return 'bracket-cargo';
  }
  if (hostile) return 'bracket-hostile';
  return 'bracket-friendly';
}
