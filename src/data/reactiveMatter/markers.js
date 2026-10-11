// Top-down XZ marker silhouettes. These are legibility specs for the shipping
// camera, not Three.js objects. A marker's minimum world radius is the smallest
// body-scale icon that still reads as its family at gameplay altitude.

export const MARKER_MIN_LEGIBLE_RADIUS = 2.5;

export const REACTIVE_MARKERS = Object.freeze({
  ferro: Object.freeze({
    id: 'ferro',
    family: 'ferromagnetic',
    tint: 0x8fb4d8,
    minWorldRadius: 2.6,
    signature: 'ring+bar',
    layers: Object.freeze([
      Object.freeze({ shape: 'ring', r: 1, yaw: 0 }),
      Object.freeze({ shape: 'bar', r: 0.72, yaw: 0 }),
    ]),
  }),
  volatile: Object.freeze({
    id: 'volatile',
    family: 'volatile',
    tint: 0xd98236,
    minWorldRadius: 2.5,
    signature: 'hex+lamp',
    layers: Object.freeze([
      Object.freeze({ shape: 'hex', r: 1, yaw: 0 }),
      Object.freeze({ shape: 'lamp', r: 0.28, yaw: 0 }),
    ]),
  }),
  volatileFerro: Object.freeze({
    id: 'volatile-ferro',
    family: 'volatile',
    tint: 0xd98236,
    secondaryTint: 0x8fb4d8,
    minWorldRadius: 2.6,
    signature: 'hex+bar',
    layers: Object.freeze([
      Object.freeze({ shape: 'hex', r: 1, yaw: 0 }),
      Object.freeze({ shape: 'bar', r: 0.62, yaw: 0.5 }),
      Object.freeze({ shape: 'lamp', r: 0.22, yaw: 0 }),
    ]),
  }),
  brittle: Object.freeze({
    id: 'brittle',
    family: 'brittle',
    tint: 0x9ee7f2,
    minWorldRadius: 2.8,
    signature: 'capsule+bands',
    layers: Object.freeze([
      Object.freeze({ shape: 'capsule', r: 1, yaw: 0 }),
      Object.freeze({ shape: 'band', r: 0.18, yaw: 0.6 }),
      Object.freeze({ shape: 'band', r: 0.18, yaw: -0.6 }),
    ]),
  }),
  elastic: Object.freeze({
    id: 'elastic',
    family: 'elastic',
    tint: 0x7dcea0,
    minWorldRadius: 2.5,
    signature: 'ribs',
    layers: Object.freeze([
      Object.freeze({ shape: 'rib', r: 0.95, yaw: 0 }),
      Object.freeze({ shape: 'rib', r: 0.7, yaw: 0.45 }),
      Object.freeze({ shape: 'rib', r: 0.48, yaw: -0.45 }),
    ]),
  }),
  debris: Object.freeze({
    id: 'debris',
    family: null,
    tint: 0xc4b8a5,
    minWorldRadius: 2.5,
    signature: 'wedge',
    layers: Object.freeze([
      Object.freeze({ shape: 'wedge', r: 1, yaw: 0 }),
    ]),
  }),
  machine: Object.freeze({
    id: 'machine',
    family: null,
    tint: 0xf2d48a,
    minWorldRadius: 4,
    signature: 'chevron+ring',
    layers: Object.freeze([
      Object.freeze({ shape: 'chevron', r: 1, yaw: 0 }),
      Object.freeze({ shape: 'ring', r: 0.55, yaw: 0 }),
    ]),
  }),
  ship: Object.freeze({
    id: 'ship',
    family: null,
    tint: 0xd7dde6,
    minWorldRadius: 3.2,
    signature: 'hull',
    layers: Object.freeze([
      Object.freeze({ shape: 'hull', r: 1, yaw: 0 }),
    ]),
  }),
});

export const REACTIVE_SILHOUETTES = Object.freeze({
  ferro: Object.freeze([[-1, 0], [-0.2, 0.15], [1, 0], [-0.2, -0.15]]),
  volatile: Object.freeze([[1, 0], [0.5, 0.86], [-0.5, 0.86], [-1, 0], [-0.5, -0.86], [0.5, -0.86]]),
  'volatile-ferro': Object.freeze([[1, 0], [0.5, 0.86], [-0.5, 0.86], [-1, 0], [-0.5, -0.86], [0.5, -0.86]]),
  brittle: Object.freeze([[-0.35, -1], [0.35, -1], [0.35, 1], [-0.35, 1]]),
  elastic: Object.freeze([[-1, 0.4], [1, 0.4], [1, 0.15], [-1, 0.15], [-1, -0.15], [1, -0.15], [1, -0.4], [-1, -0.4]]),
  debris: Object.freeze([[0, 1], [1, -0.6], [-1, -0.6]]),
  machine: Object.freeze([[0, 1], [1, -0.4], [0.2, -0.4], [0.2, -1], [-0.2, -1], [-0.2, -0.4], [-1, -0.4]]),
  ship: Object.freeze([[0, 1], [0.7, -0.8], [-0.7, -0.8]]),
});

export function markerById(id) {
  const marker = REACTIVE_MARKERS[id] || Object.values(REACTIVE_MARKERS).find((row) => row.id === id);
  if (!marker) throw new Error(`unknown reactive marker: ${id}`);
  return marker;
}

/**
 * @param {'ferro-couple'|'volatile-blast'|'brittle-fracture'|'elastic-release'|'tow-retarget'|'tow-break'} kind
 */
export function cueStyle(kind) {
  switch (kind) {
    case 'ferro-couple':
      return REACTIVE_MARKERS.ferro;
    case 'volatile-blast':
      return REACTIVE_MARKERS.volatile;
    case 'brittle-fracture':
      return REACTIVE_MARKERS.brittle;
    case 'elastic-release':
      return REACTIVE_MARKERS.elastic;
    case 'tow-retarget':
      return REACTIVE_MARKERS.brittle;
    case 'tow-break':
      return REACTIVE_MARKERS.machine;
    default: {
      /** @type {never} */
      const neverKind = kind;
      throw new Error(`unknown reactive cue: ${String(neverKind)}`);
    }
  }
}
