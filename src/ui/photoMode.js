/**
 * PQ-159.03 — photo mode contract. Pause already enters k-photo; this module
 * owns free-camera / exposure / capture flags so tests can drive shipped functions.
 */
export const PHOTO_MODE_SEED = 15903;
export const PHOTO_ACTION_LABEL = 'Photo';

export function photoModePresentation() {
  return Object.freeze({
    reachableFromPause: true,
    hideHud: true,
    filters: 'none',
    freeCamera: true,
    exposure: 1,
  });
}

export function captureStoreStill(canvas) {
  if (!canvas || typeof canvas.toDataURL !== 'function') {
    return { ok: false, reason: 'gpu-capture-unavailable', format: 'png' };
  }
  try {
    const dataUrl = canvas.toDataURL('image/png');
    return { ok: true, dataUrl, format: 'png' };
  } catch {
    return { ok: false, reason: 'gpu-capture-unavailable', format: 'png' };
  }
}
