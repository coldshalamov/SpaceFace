// Physics owns registration; presentation only reads the current native pose.
// Weak keys preserve the lifetime of both the state and its current reader.
const poseReaders = new WeakMap();

export function registerOrchardPoseReader(state, reader) {
  poseReaders.set(state, reader);
}

export function isCurrentOrchardPoseReader(state, reader) {
  return poseReaders.get(state) === reader;
}

export function readOrchardNativePose(state, entity) {
  return poseReaders.get(state)?.readOrchardFramePose(entity) ?? null;
}
