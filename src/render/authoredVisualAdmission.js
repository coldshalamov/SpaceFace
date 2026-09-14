// Detached authored-visual admission: material policies -> exact pipeline compile -> GPU
// residency, with owner-liveness asserts between stages so a released owner aborts the
// admission instead of uploading into a torn-down boundary. This module is the leaf both
// partsLibrary (ships/places) and visualFactory (generic packaged bodies) can import —
// visualFactory cannot import partsLibrary without a module cycle.
import { configureRealtimeCanopyMaterials } from './canopyMaterialPolicy.js';
import { configureTransparentSinglePassSurfaces } from './transparentSinglePassPolicy.js';

export function authoredRuntimeState() {
  return globalThis && globalThis.window && globalThis.window.SF
    ? globalThis.window.SF.state || null
    : null;
}

export function tier1CausalCounters() {
  const live = authoredRuntimeState();
  const perf = live && live.perfRuntime;
  const tier1 = perf && perf.tier1;
  return tier1 && typeof tier1.isEnabled === 'function' && tier1.isEnabled() ? tier1 : null;
}

export function assertAuthoredVisualPreparationActive(options, phase) {
  const isActive = options && options.isResidencyOwnerActive;
  if (typeof isActive === 'function' && isActive() !== true) {
    // Same benign class as previewDisposed: the entity died or its boundary was torn
    // down (save/load sector rematerialization) while compile/upload was in flight —
    // aborting the admission is the designed response, not a composition defect.
    const error = new Error(`Authored visual preparation owner became inactive ${phase}`);
    error.admissionOwnerReleased = true;
    throw error;
  }
}

export async function prepareAuthoredVisualPipelines(root, options = {}) {
  const preparePipelines = options && options.prepareAuthoredPipelines;
  const prepareResidency = options && options.prepareAuthoredGpuResidency;
  if (typeof preparePipelines !== 'function' && typeof prepareResidency !== 'function') {
    return { skipped: true, reason: 'GPU preparation unavailable' };
  }
  // Admission must compile the exact material state used by the first visible draw. These same
  // idempotent policies also run at the presentation boundary, but applying them only after this
  // detached-root compile changes the program key and leaves the first draw to link synchronously.
  assertAuthoredVisualPreparationActive(options, 'before-material-policy');
  configureRealtimeCanopyMaterials(root);
  configureTransparentSinglePassSurfaces(root);
  const tier1 = tier1CausalCounters();
  if (tier1) {
    tier1.countPipelinePreparation('material-policies', 1);
    if (typeof preparePipelines === 'function') tier1.countPipelinePreparation('compile-pipelines', 1);
    if (typeof prepareResidency === 'function') tier1.countPipelinePreparation('gpu-residency', 1);
  }
  const pipelines = typeof preparePipelines === 'function'
    ? await preparePipelines(root)
    : { skipped: true, reason: 'pipeline compiler unavailable' };
  assertAuthoredVisualPreparationActive(options, 'after-pipeline-compile');
  if (options.yieldBetweenGpuStages === true && typeof options.yieldToNextPresent === 'function') {
    await options.yieldToNextPresent();
    assertAuthoredVisualPreparationActive(options, 'after-present-yield');
  }
  const gpuResidency = typeof prepareResidency === 'function'
    ? await prepareResidency(root, {
        isResidencyOwnerActive: options.isResidencyOwnerActive,
      })
    : { skipped: true, reason: 'GPU residency uploader unavailable' };
  assertAuthoredVisualPreparationActive(options, 'after-gpu-residency');
  return {
    skipped: pipelines?.skipped === true && gpuResidency?.skipped === true,
    pipelines,
    gpuResidency,
  };
}
