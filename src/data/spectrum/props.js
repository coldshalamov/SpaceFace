// Procedural Spectrum prop footprints. These are flat XZ silhouettes the renderer
// extrudes a few world-units thick. They are not textures, glow cards, or stand-in GLBs.
// Coordinates are local world-units, y = 0, centered on the prop origin.

export const SPECTRUM_PROP_KINDS = Object.freeze([
  Object.freeze({
    id: 'buoy',
    role: 'Nav buoy',
    footprint: Object.freeze([[0, -18], [4, -6], [4, 10], [10, 14], [0, 22], [-10, 14], [-4, 10], [-4, -6]]),
  }),
  Object.freeze({
    id: 'relay',
    role: 'Survey relay',
    footprint: Object.freeze([[-3, -16], [3, -16], [3, 2], [14, 6], [14, 12], [-14, 12], [-14, 6], [-3, 2]]),
  }),
  Object.freeze({
    id: 'decoy',
    role: 'Towable decoy',
    footprint: Object.freeze([[0, 18], [12, -8], [5, -8], [5, -16], [-5, -16], [-5, -8], [-12, -8]]),
  }),
  Object.freeze({
    id: 'slab',
    role: 'Movable occulter',
    footprint: Object.freeze([[-22, -8], [22, -8], [22, 8], [8, 14], [-8, 14], [-22, 8]]),
  }),
  Object.freeze({
    id: 'black-box',
    role: 'Flight recorder',
    footprint: Object.freeze([[-12, -8], [8, -8], [14, -2], [14, 8], [-12, 8], [-14, 4], [-14, -4]]),
  }),
  Object.freeze({
    id: 'lifeboat',
    role: 'Lifeboat hull',
    footprint: Object.freeze([[0, 20], [8, 10], [8, -12], [4, -18], [-4, -18], [-8, -12], [-8, 10]]),
  }),
  Object.freeze({
    id: 'lantern',
    role: 'False lantern',
    footprint: Object.freeze([[0, 16], [8, 8], [6, -4], [12, -14], [4, -10], [0, -16], [-4, -10], [-12, -14], [-6, -4], [-8, 8]]),
  }),
  Object.freeze({
    id: 'jammer',
    role: 'Jam mast',
    footprint: Object.freeze([[-4, -18], [4, -18], [4, -4], [16, -4], [16, 4], [4, 4], [4, 16], [-4, 16], [-4, 4], [-16, 4], [-16, -4], [-4, -4]]),
  }),
  Object.freeze({
    id: 'courier',
    role: 'Courier hull',
    footprint: Object.freeze([[16, 0], [-8, 10], [-14, 6], [-10, 0], [-14, -6], [-8, -10]]),
  }),
  Object.freeze({
    id: 'wreck',
    role: 'Skimming wreck',
    footprint: Object.freeze([[-16, -6], [-6, -6], [-6, 4], [2, 4], [2, 12], [10, 12], [14, 4], [14, -10], [4, -14], [-10, -14], [-16, -10]]),
  }),
  Object.freeze({
    id: 'reflector',
    role: 'Charted mirror wall',
    footprint: Object.freeze([[-20, -3], [20, -3], [20, 3], [6, 7], [-6, 7], [-20, 3]]),
  }),
  Object.freeze({
    id: 'arm',
    role: 'Vent sweep arm',
    footprint: Object.freeze([[-4, -28], [4, -28], [6, -8], [6, 24], [-6, 24], [-6, -8]]),
  }),
]);

export function spectrumPropKind(id) {
  return SPECTRUM_PROP_KINDS.find((kind) => kind.id === id) || null;
}
