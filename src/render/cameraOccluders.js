// Placeholder for the camera-occluder lane: renderer.js wiring (33184a813) landed on master
// without this module, breaking every consumer of the renderer. This minimal implementation
// satisfies the interface (state, update, diagnostics) and ducks nothing — no bodies are moved
// out of the chase-camera sightline. Replace with the real occluder pass when it lands; no
// other module reads its outputs.
//
// State shape the renderer reads directly (see renderer.js _updateCameraOccluders,
// _syncWorldPresentationTableMeshes, _syncAuthoredInstanceSubmission):
//   sinks       — sightline-duck bookkeeping (unused while the pass is a no-op)
//   sinkByOwner — ownerId -> sink record, consumed as options.occluderSinks by
//                 syncAuthoredInstancePools to break the clean-frame early-out
//   entries     — row id -> { applied } duck amounts; an absent entry means no duck
//   sinksDirty  — set when duck state changed and instance pools must re-upload

export function createCameraOccluderState() {
  return {
    sinks: new Map(),
    sinkByOwner: new Map(),
    entries: new Map(),
    sinksDirty: false,
  };
}

export function updateCameraOccluders(state, records, camPos, focusPos, frameDt, options) {
  return false;
}

export function cameraOccluderDiagnostics(state) {
  return { active: 0 };
}
