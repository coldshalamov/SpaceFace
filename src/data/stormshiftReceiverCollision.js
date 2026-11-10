// Source-derived fixed compound for stormshift_receiver.py. Never convex-close the receiving void.
// Blender +Y port maps to runtime -Z; authored origin is preserved, no centering.
export const STORMSHIFT_RECEIVER_SOURCE_LENGTH = 27.81999969482422;
export const STORMSHIFT_RECEIVER_SOURCE_SCALE = 1.72 / STORMSHIFT_RECEIVER_SOURCE_LENGTH;
export const STORMSHIFT_RECEIVER_SOLIDS = Object.freeze([
  ["workshop", [-7.31, 0, 0], [9.38, 12.0, 3.2], 0],
  ["drive_port", [-12.26, 3.4, -0.2], [3.32, 2.5, 2.4], 0],
  ["drive_starboard", [-12.26, -3.4, -0.2], [3.32, 2.5, 2.4], 0],
  ["port_spine", [4.7, 5.0, -0.4], [15.4, 1.1, 1.7], 0],
  ["starboard_spine", [4.7, -5.0, -0.4], [15.4, 1.1, 1.7], 0],
  ["saddle_root", [-6.4, -7.0, -0.2], [2.4, 3, 1.4], 0],
  ["saddle_inner", [-2.3, -7.8, -0.35], [10.6, 0.85, 0.7], 0],
  ["saddle_outer", [-2.3, -10.5, -0.35], [10.6, 0.85, 0.7], 0],
  ["saddle_aft", [-7.3, -9.15, -0.35], [0.7, 3.4, 0.7], 0],
  ["saddle_front", [2.7, -9.15, -0.35], [0.7, 3.4, 0.7], 0],
  ["arm_root", [-4.2, 6.7, 0.2], [3, 2.5, 1.5], 0],
  ["arm_upper", [-0.6, 8.2, 0.7], [6.8, 1.0, 1.0], 0.2],
  ["arm_fore", [5.0, 7.7, 0.8], [5.4, 0.85, 0.9], -0.43],
  ["service_head", [7.5, 6.6, 0.8], [1.8, 1.6, 1.5], 0],
  ["port_bumper", [13.625, 4.8, 0.1], [0.55, 1.7, 2.7], 0],
  ["starboard_bumper", [13.625, -4.8, 0.1], [0.55, 1.7, 2.7], 0],
  ["port_segment_0", [-0.6, 4.8, 0.15], [3.5, 1.8, 2.8], 0],
  ["port_segment_1", [3.5, 4.8, 0.15], [3.5, 1.8, 2.8], 0],
  ["port_segment_2", [7.6, 4.8, 0.15], [3.5, 1.8, 2.8], 0],
  ["port_segment_3", [11.7, 4.8, 0.15], [3.5, 1.8, 2.8], 0],
  ["starboard_segment_0", [-0.6, -4.8, 0.15], [3.5, 1.8, 2.8], 0],
  ["starboard_segment_1", [3.5, -4.8, 0.15], [3.5, 1.8, 2.8], 0],
  ["starboard_segment_2", [7.6, -4.8, 0.15], [3.5, 1.8, 2.8], 0],
  ["starboard_segment_3", [11.7, -4.8, 0.15], [3.5, 1.8, 2.8], 0],
  ["coupling", [-2.4, 0, 0.15], [0.56, 1.7, 1.7], 0],
  ["elbow_bearing", [2.7, 8.8, 1.025], [1.32, 1.32, 1.65], 0],
  ["wrist_bearing", [7.1, 6.7, 1.025], [1.32, 1.32, 1.65], 0],
].map(([id, center, size, angle]) => Object.freeze({ id, center: Object.freeze(center), size: Object.freeze(size), angle })));
const K = STORMSHIFT_RECEIVER_SOURCE_SCALE;
export const STORMSHIFT_RECEIVER_COLLISION = Object.freeze({
  schemaVersion: 1, id: 'stormshift-receiver:fixed-service:v1', referenceRadius: 'radius',
  flags: Object.freeze({ collides: true, renderable: false, targetable: false, radarVisible: false }),
  sourceSurfaceTolerance: .05,
  articulationPolicy: 'fixed rails, service arm and saddle; recessed status shutter only',
  primitives: Object.freeze(STORMSHIFT_RECEIVER_SOLIDS.map(({ id, center, size, angle }) => Object.freeze({
    kind: 'obb', id, x: center[0] * K, z: -center[1] * K,
    hx: size[0] * K / 2, hz: size[1] * K / 2, angleDeg: -angle * 180 / Math.PI,
  }))),
});
