// WebGPU present is a later backend swap. It stays off until cooked packages,
// the material ABI, persistent lanes, and the snapshot fence are all live.

export const PRESENT_BACKEND = Object.freeze({
  WEBGL: 'webgl',
  WEBGPU: 'webgpu',
});

export function webgpuPresentPreconditions(options = {}) {
  return Object.freeze({
    activeSet: options.activeSet === true,
    cookedPackages: options.cookedPackages === true,
    materialAbi: options.materialAbi === true,
    persistentLanes: options.persistentLanes === true,
    snapshotFence: options.snapshotFence === true,
  });
}

export function isWebGpuPresentLegal(options = {}) {
  const gates = webgpuPresentPreconditions(options);
  return gates.activeSet
    && gates.cookedPackages
    && gates.materialAbi
    && gates.persistentLanes
    && gates.snapshotFence
    && options.forceWebGpu === true;
}

export function selectPresentBackend(options = {}) {
  return isWebGpuPresentLegal(options) ? PRESENT_BACKEND.WEBGPU : PRESENT_BACKEND.WEBGL;
}
