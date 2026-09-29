// Placeholder for the camera-occluder lane: renderer.js wiring (33184a813) landed on master
// without this module, breaking every consumer of the renderer. This minimal implementation
// satisfies the interface (state, update, diagnostics) and ducks nothing — no bodies are moved
// out of the chase-camera sightline. Replace with the real occluder pass when it lands; no
// other module reads its outputs.

export function createCameraOccluderState() {
  return { sinks: new Map(), sinksDirty: false };
}

export function updateCameraOccluders(state, records, camPos, focusPos, frameDt, options) {
  return false;
}

export function cameraOccluderDiagnostics(state) {
  return { active: 0 };
}
