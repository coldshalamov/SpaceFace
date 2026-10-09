// FB-130 — a player label and a bounded still on the envelope, beside `data`.
// The checksum covers `data` only. This module never opens a new capture path.

export const SLOT_LABEL_MAX = 48;
export const SLOT_THUMB_MAX_BYTES = 24 * 1024;

function dataUrlBytes(dataUrl) {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return Infinity;
  return Math.ceil((dataUrl.length - comma - 1) * 3 / 4);
}

/**
 * Keep a still only when it is an image data URL within 24 KB.
 * An oversized still can be redrawn from the same canvas at 160×90; that is
 * the existing canvas, not a new renderer. No canvas and too big means omit.
 */
export function boundSlotThumbnail(dataUrl, source) {
  if (typeof dataUrl !== 'string' || dataUrl.indexOf('data:image/') !== 0) return undefined;
  if (dataUrlBytes(dataUrl) <= SLOT_THUMB_MAX_BYTES) return dataUrl;
  if (!source || typeof source.toDataURL !== 'function' || typeof document === 'undefined') return undefined;
  try {
    const thumb = document.createElement('canvas');
    thumb.width = 160;
    thumb.height = 90;
    const ctx = thumb.getContext && thumb.getContext('2d');
    if (!ctx || typeof ctx.drawImage !== 'function') return undefined;
    ctx.drawImage(source, 0, 0, 160, 90);
    const jpeg = thumb.toDataURL('image/jpeg', 0.7);
    if (typeof jpeg === 'string' && jpeg.indexOf('data:image/') === 0 && dataUrlBytes(jpeg) <= SLOT_THUMB_MAX_BYTES) {
      return jpeg;
    }
  } catch { /* omit rather than store a still the slot cannot carry */ }
  return undefined;
}

/** Write label and thumbnail onto the envelope object. Never touches `data` or `checksum`. */
export function stampSlotCard(envelope, options = {}, previous = {}) {
  if (!envelope || typeof envelope !== 'object') return envelope;
  const prior = previous && typeof previous === 'object' ? previous : {};
  if (options.label !== undefined) {
    const label = String(options.label).trim().slice(0, SLOT_LABEL_MAX);
    if (label) envelope.label = label;
    else delete envelope.label;
  } else if (typeof prior.label === 'string' && prior.label.trim()) {
    envelope.label = prior.label.trim().slice(0, SLOT_LABEL_MAX);
  }
  if (options.thumbnail !== undefined) {
    const bounded = boundSlotThumbnail(options.thumbnail, options.thumbnailSource);
    if (bounded) envelope.thumbnail = bounded;
    else delete envelope.thumbnail;
  } else if (typeof prior.thumbnail === 'string') {
    const bounded = boundSlotThumbnail(prior.thumbnail);
    if (bounded) envelope.thumbnail = bounded;
  }
  return envelope;
}
