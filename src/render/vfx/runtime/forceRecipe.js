/**
 * Force-language descriptor compiler. FieldForcePresentation owns the true lifecycle,
 * placement and force record; this module rewrites only the picture it supplies to the
 * shared folded-surface batch, turning long spiral cloth and radial spokes into layered,
 * segmented working bands with a quiet measured perimeter.
 *
 * Pure and allocation-free: `values` is the retained 36-float producer descriptor, `out`
 * is a batch-owned scratch buffer. Nothing here reads simulation state or consumes RNG.
 */
export const FORCE_DESCRIPTOR_FLOATS = 36;
const TAU = Math.PI * 2;
const ROLE_BODY = 0;
const ROLE_BOUNDARY = 1;
const ROLE_CREST = 2;
const KIND_SEED = 1;
const KIND_WELL = 2;
const KIND_REPULSOR = 3;
const KIND_CONE = 4;
const KIND_SHEET = 5;

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

function copyDescriptor(values, out) {
  const length = values && Number.isFinite(values.length) ? values.length : 0;
  for (let i = 0; i < FORCE_DESCRIPTOR_FLOATS; i++) {
    out[i] = i < length ? finite(values[i]) : 0;
  }
}

function quietBoundary(out, radius) {
  // The perimeter is a measured edge, not a luminous wire. Keep it present and thin.
  out[9] = Math.max(radius * 0.0018, out[9] * 0.45);
  out[15] *= 0.03;
  out[21] = Math.min(out[21], 0.42);
}

function rewriteWellBody(out, radius, ordinal) {
  const pair = Math.floor(ordinal / 2);
  const slot = ordinal % 2;
  const phase = finite(out[17]);
  const bodyRadius = Math.min(radius, 48);
  const a0 = pair * (TAU / 5) + slot * 0.22 + phase * 0.18;
  const outer = Math.max(bodyRadius * 0.30, bodyRadius * (0.68 - pair * 0.070 - slot * 0.020));
  out[4] = 0;
  out[5] = a0;
  out[6] = a0 + 0.90 + phase * 0.10;
  out[7] = outer;
  out[8] = Math.max(bodyRadius * 0.14, outer - bodyRadius * 0.085);
  out[9] = Math.max(finite(out[9]) * 0.90, bodyRadius * 0.030);
  out[10] = Math.max(finite(out[10]), bodyRadius * 0.018);
  out[11] = 0;
  out[18] = 1;
  out[21] = 0.78;
}

function rewriteRepulsorBody(out, radius, ordinal) {
  const front = Math.floor(ordinal / 4);
  const sector = ordinal % 4;
  const bodyRadius = Math.min(radius, 48);
  const a0 = sector * (TAU / 4) + 0.22 + front * 0.09;
  out[4] = 0;
  out[5] = a0;
  out[6] = a0 + 1.02;
  out[7] = bodyRadius * (0.55 + front * 0.15);
  out[8] = out[7];
  out[9] = Math.max(finite(out[9]) * 1.00, bodyRadius * 0.038);
  out[10] = Math.max(finite(out[10]), bodyRadius * 0.026);
  out[11] = 0;
  out[18] = 1;
  out[21] = 0.74;
}

function rewriteConeBody(out, radius, halfAngle, ordinal) {
  const span = Math.max(0.05, halfAngle) * 0.80;
  const ring = ordinal % 4;
  const bodyRadius = Math.min(radius, 48);
  out[4] = 0;
  out[5] = -span;
  out[6] = span;
  out[7] = bodyRadius * (0.90 - ring * 0.10);
  out[8] = bodyRadius * (0.28 + ring * 0.14);
  out[9] = Math.max(finite(out[9]) * 0.95, bodyRadius * 0.045);
  out[10] = Math.max(finite(out[10]), bodyRadius * 0.024);
  out[11] = 0;
  out[18] = 0;
  out[21] = 0.80;
}

function rewriteSheetBody(out, radius, ordinal) {
  const bodyRadius = Math.min(radius, 12);
  // The sheet is a local intake pair, not a screen-wide cloth rack. Rails and
  // cross-stream scoops both shrink to the intake footprint and pull toward the axis.
  if (ordinal <= 1) {
    out[7] = bodyRadius * 0.20;
    out[8] = bodyRadius * 0.84;
    out[9] = Math.max(finite(out[9]) * 1.00, bodyRadius * 0.060);
    out[10] = Math.max(finite(out[10]), bodyRadius * 0.030);
  } else {
    out[7] = 0;
    out[8] = Math.min(bodyRadius, Math.max(2, finite(out[8]) * 0.35));
    out[9] = Math.max(finite(out[9]), bodyRadius * 0.100);
    out[10] = Math.max(finite(out[10]), bodyRadius * 0.070);
  }
  out[32] *= 0.35;
  out[33] *= 0.35;
  out[21] = 0.82;
}

function rewriteRepulsorRib(out, radius) {
  const bodyRadius = Math.min(radius, 48);
  const center = Math.max(bodyRadius * 0.10, Math.min(bodyRadius * 0.17, Math.max(finite(out[7]), bodyRadius * 0.10)));
  out[7] = center;
  out[8] = Math.max(bodyRadius * 0.05, center * 0.35);
  out[9] = Math.max(finite(out[9]), bodyRadius * 0.060);
  out[10] = Math.max(finite(out[10]), bodyRadius * 0.040);
  out[15] *= 0.62;
}

/** Rewrite one producer descriptor in place (through `out`). Returns `out`. */
export function rewriteFieldDescriptor(values, bodyOrdinal, out) {
  copyDescriptor(values, out);
  const code = Math.round(finite(out[28]));
  if (code < KIND_WELL || code > KIND_SHEET || code === KIND_SEED) return out;
  const role = Math.round(finite(out[29]));
  const radius = Math.max(1, finite(out[23]));
  const halfAngle = finite(out[22], 0.56);
  if (role === ROLE_BOUNDARY) {
    quietBoundary(out, radius);
    return out;
  }
  if (role === ROLE_CREST && code === KIND_REPULSOR) {
    rewriteRepulsorRib(out, radius);
    return out;
  }
  if (role !== ROLE_BODY) return out;
  if (code === KIND_WELL) rewriteWellBody(out, radius, bodyOrdinal);
  else if (code === KIND_REPULSOR) rewriteRepulsorBody(out, radius, bodyOrdinal);
  else if (code === KIND_CONE) rewriteConeBody(out, radius, halfAngle, bodyOrdinal);
  else if (code === KIND_SHEET) rewriteSheetBody(out, radius, bodyOrdinal);
  return out;
}

/** A body-role descriptor advances the per-deployment body sequence. */
export function advancesFieldBodyOrdinal(values) {
  const code = Math.round(finite(values?.[28]));
  if (code < KIND_WELL || code > KIND_SHEET || code === KIND_SEED) return false;
  return Math.round(finite(values?.[29])) === ROLE_BODY;
}
